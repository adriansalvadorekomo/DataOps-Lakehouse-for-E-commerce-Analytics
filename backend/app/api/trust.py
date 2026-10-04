"""Stakeholder-facing trust status over live books and Databricks metadata."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.core.db import get_db
from backend.app.services import trust

router = APIRouter(prefix="/trust", tags=["trust"])


@router.get("/status")
def get_trust_status(session: Session = Depends(get_db)):
    return trust.status(session)
