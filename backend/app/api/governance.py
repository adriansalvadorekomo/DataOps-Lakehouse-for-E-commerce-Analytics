"""Data governance: the contracts and their Great Expectations runs.

GET  /governance/contract     — every expectation, with rule, severity and why
GET  /governance/runs         — recent runs (summary)
GET  /governance/runs/latest  — latest finished run with per-expectation results
POST /governance/runs         — validate the books now (202, runs in background)
"""
from __future__ import annotations

import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.db import get_db
from backend.app.governance import contracts, runs
from backend.app.models.entities import GovernanceRun

router = APIRouter(prefix="/governance", tags=["governance"])


def _execute(run_id: int) -> None:
    from backend.app.core.db import get_session_factory

    with get_session_factory()() as session:
        runs.execute(session, run_id, runs.connection_url())


@router.get("/contract")
def get_contract():
    today = datetime.date.today()
    return {
        "engine": "great_expectations",
        "import_contract": contracts.import_contract(today),
        "books_contract": contracts.books_contract(today),
    }


@router.get("/runs")
def list_runs(limit: int = Query(default=10, ge=1, le=50), session: Session = Depends(get_db)):
    rows = session.execute(
        select(GovernanceRun).order_by(GovernanceRun.run_id.desc()).limit(limit)
    ).scalars()
    return [runs.run_dict(r, with_results=False) for r in rows]


@router.get("/runs/latest")
def get_latest(session: Session = Depends(get_db)):
    run = runs.latest(session)
    if run is None:
        raise HTTPException(status_code=404, detail="no governance run yet: POST /governance/runs")
    return runs.run_dict(run)


@router.post("/runs", status_code=202)
def start_run(background: BackgroundTasks, session: Session = Depends(get_db)):
    running = session.execute(
        select(GovernanceRun).where(GovernanceRun.status == "running").limit(1)
    ).scalar()
    if running is not None:
        return runs.run_dict(running, with_results=False)
    run = runs.start(session, "api")
    background.add_task(_execute, run.run_id)
    return runs.run_dict(run, with_results=False)
