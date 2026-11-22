"""Ask: plain-language answers over the marketplace's records, with human feedback.

POST /ai/ask       {question} → {answer, intent, sources[label], interaction_id}
POST /ai/ask-docs  {question} → same, answered only from attached documents
POST /ai/interactions/{id}/feedback {rating: 1 | -1 | 0, comment?} → rate an answer (0 clears)
GET  /ai/feedback/summary          → totals by rating, mode and intent
GET  /ai/interactions?rated=true   → the question/answer/rating dataset (for reward modelling)
POST /ai/ask-genie {question}      → Databricks Genie over Gold (analyst tool; not in the product UI)

Deterministic data answers come from services/assistant.py; unknown questions
get the capability list, never invented facts. Every answer is logged in
``ai_interactions`` so 👍/👎 ratings accumulate into a preference dataset.
"""
from __future__ import annotations

import datetime
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.db import get_db
from backend.app.models.entities import AiInteraction
from backend.app.services.assistant import ask

router = APIRouter(prefix="/ai", tags=["ai"])


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)


class Source(BaseModel):
    endpoint: str
    label: str
    params: dict = {}
    document: str | None = None
    chunk_index: int | None = None
    score: float | None = None


def _label(s: dict) -> str:
    if s.get("label"):
        return s["label"]
    if s.get("document"):
        idx = s.get("chunk_index")
        return f"{s['document']} · passage {idx + 1}" if isinstance(idx, int) else s["document"]
    return "Marketplace records"


def _to_sources(result: dict) -> list[Source]:
    return [Source(endpoint=s.get("endpoint", ""), label=_label(s), params=s.get("params", {}),
                   document=s.get("document"), chunk_index=s.get("chunk_index"),
                   score=s.get("score")) for s in result["sources"]]


class Metric(BaseModel):
    label: str
    value: float | int | str
    kind: str
    note: str | None = None


class TableColumn(BaseModel):
    key: str
    label: str
    kind: str


class Table(BaseModel):
    title: str | None = None
    columns: list[TableColumn]
    rows: list[dict]


class AskResponse(BaseModel):
    """``answer`` is plain text (copy, log); the rest is the structured presentation."""
    answer: str
    intent: str
    sources: list[Source]
    interaction_id: int | None = None
    headline: str | None = None
    metrics: list[Metric] = []
    table: Table | None = None
    takeaway: str | None = None
    suggestions: list[str] = []
    report: str | None = None
    as_of: str | None = None
    chart: dict | None = None
    next_step: dict | None = None
    follow_ups: list[str] = []


def _response(result: dict, sources: list[Source], iid: int) -> AskResponse:
    return AskResponse(
        answer=result["answer"], intent=result["intent"], sources=sources, interaction_id=iid,
        headline=result.get("headline"), metrics=result.get("metrics", []), table=result.get("table"),
        takeaway=result.get("takeaway"), suggestions=result.get("suggestions", []),
        report=result.get("report"), as_of=result.get("as_of"), chart=result.get("chart"),
        next_step=result.get("next_step"), follow_ups=result.get("follow_ups", []))


def _record(session: Session, mode: str, question: str, result: dict,
            sources: list[Source], started: float) -> int:
    row = AiInteraction(
        mode=mode, question=question, answer=result["answer"], intent=result.get("intent"),
        sources=[s.model_dump() for s in sources],
        latency_ms=int((time.perf_counter() - started) * 1000),
    )
    session.add(row)
    session.commit()
    return row.interaction_id


@router.post("/ask", response_model=AskResponse)
def ask_question(payload: AskRequest, session: Session = Depends(get_db)):
    started = time.perf_counter()
    result = ask(session, payload.question)
    sources = _to_sources(result)
    iid = _record(session, "data", payload.question, result, sources, started)
    return _response(result, sources, iid)


@router.post("/ask-docs", response_model=AskResponse)
def ask_documents(payload: AskRequest, session: Session = Depends(get_db)):
    from backend.app.services.rag import FMError, ask_docs

    started = time.perf_counter()
    try:
        result = ask_docs(session, payload.question)
    except FMError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    sources = _to_sources(result)
    iid = _record(session, "docs", payload.question, result, sources, started)
    return _response(result, sources, iid)


class Feedback(BaseModel):
    rating: Literal[-1, 0, 1]
    comment: str | None = Field(default=None, max_length=500)


@router.post("/interactions/{interaction_id}/feedback")
def rate_answer(interaction_id: int, payload: Feedback, session: Session = Depends(get_db)):
    row = session.get(AiInteraction, interaction_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"answer {interaction_id} not found")
    row.rating = payload.rating or None
    # A comment only accompanies 👎 ("what was wrong?"); 👍 or clearing drops it.
    comment = (payload.comment or "").strip()
    row.comment = (comment or None) if payload.rating == -1 else None
    row.rated_at = datetime.datetime.now(datetime.UTC) if payload.rating else None
    session.commit()
    return {"interaction_id": interaction_id, "rating": row.rating, "comment": row.comment}


@router.get("/feedback/summary")
def feedback_summary(session: Session = Depends(get_db)):
    total, up, down = session.execute(select(
        func.count(),
        func.count().filter(AiInteraction.rating == 1),
        func.count().filter(AiInteraction.rating == -1),
    )).one()
    by_intent = session.execute(
        select(AiInteraction.intent, func.count(),
               func.count().filter(AiInteraction.rating == 1),
               func.count().filter(AiInteraction.rating == -1))
        .group_by(AiInteraction.intent).order_by(func.count().desc())
    ).all()
    return {"answers": total, "rated": up + down, "helpful": up, "not_helpful": down,
            "by_intent": [{"intent": i or "unknown", "answers": n, "helpful": u, "not_helpful": d}
                          for i, n, u, d in by_intent]}


@router.get("/interactions")
def list_interactions(rated: bool | None = None, limit: int = Query(default=100, ge=1, le=1000),
                      session: Session = Depends(get_db)):
    """The preference dataset: question, answer, rating and comment, newest first."""
    q = select(AiInteraction).order_by(AiInteraction.interaction_id.desc()).limit(limit)
    if rated is True:
        q = q.where(AiInteraction.rating.is_not(None))
    elif rated is False:
        q = q.where(AiInteraction.rating.is_(None))
    return [{"interaction_id": r.interaction_id, "mode": r.mode, "question": r.question,
             "answer": r.answer, "intent": r.intent, "sources": r.sources, "rating": r.rating,
             "comment": r.comment, "latency_ms": r.latency_ms,
             "created_at": r.created_at.isoformat() if r.created_at else None}
            for r in session.execute(q).scalars()]


class GenieResponse(BaseModel):
    answer: str
    intent: str
    sources: list[Source]
    sql: str = ""
    rows: list = []


@router.post("/ask-genie", response_model=GenieResponse)
def ask_genie(payload: AskRequest):
    from backend.app.services.genie import GenieError
    from backend.app.services.genie import ask_genie as _ask_genie

    try:
        result = _ask_genie(payload.question)
    except GenieError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return GenieResponse(
        answer=result["answer"],
        intent=result["intent"],
        sources=_to_sources(result),
        sql=result.get("sql", ""),
        rows=result.get("rows", [])[:50],
    )
