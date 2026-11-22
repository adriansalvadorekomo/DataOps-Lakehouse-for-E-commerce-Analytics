"""Bulk CSV import (docs/product.md, "When new data arrives").

POST /imports accepts a CSV with the source's columns (≤50 MB) and answers
202 with a batch; validation and the append run in the background, and
GET /imports/{id} reports accepted / duplicate / rejected rows and why.
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.db import get_db
from backend.app.models.entities import ImportBatch
from backend.app.services import imports

router = APIRouter(prefix="/imports", tags=["imports"])


def _process(batch_id: int, data: bytes) -> None:
    from backend.app.core.db import get_session_factory

    session = get_session_factory()()
    try:
        batch = imports.process(session, batch_id, data)
    finally:
        session.close()
    if batch.status == "completed" and batch.rows_accepted:
        from backend.app.governance.runs import run_now

        run_now("import")  # new rows are in the books: re-validate the books contract


@router.get("/template", response_class=PlainTextResponse)
def get_template():
    """The expected CSV header with two example rows."""
    return PlainTextResponse(imports.template_csv(), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="smart-erp-import-template.csv"'})


@router.get("/rules")
def get_rules():
    return {"columns": imports.COLUMNS, "required": imports.REQUIRED, "rules": imports.RULES,
            "max_bytes": imports.MAX_BYTES}


@router.post("", status_code=202)
def upload(file: UploadFile, background: BackgroundTasks, session: Session = Depends(get_db)):
    name = (file.filename or "upload.csv").rsplit("/", 1)[-1]
    if not name.lower().endswith(".csv"):
        raise HTTPException(status_code=415, detail="upload a .csv file")
    data = file.file.read(imports.MAX_BYTES + 1)
    if len(data) > imports.MAX_BYTES:
        raise HTTPException(status_code=413, detail="file exceeds 50 MB")
    if not data.strip():
        raise HTTPException(status_code=422, detail="the file is empty")
    batch = imports.create_batch(session, name)
    background.add_task(_process, batch.batch_id, data)
    return imports.batch_dict(batch)


@router.get("")
def list_batches(limit: int = Query(default=20, ge=1, le=100), session: Session = Depends(get_db)):
    rows = session.execute(
        select(ImportBatch).order_by(ImportBatch.batch_id.desc()).limit(limit)
    ).scalars()
    return [imports.batch_dict(b) for b in rows]


@router.get("/{batch_id}")
def get_batch(batch_id: int, session: Session = Depends(get_db)):
    batch = session.get(ImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail=f"import {batch_id} not found")
    return {**imports.batch_dict(batch), "rejections": imports.rejections(session, batch_id)}
