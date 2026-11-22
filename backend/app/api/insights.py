"""The Today brief — ranked signals with evidence and a next step (docs/product.md)."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.app.core.db import get_db
from backend.app.services import insights

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/brief")
def get_brief(
    days: int = Query(default=30, ge=7, le=365),
    role: Literal["commercial", "fulfillment", "inventory", "customers", "data"] | None = None,
    session: Session = Depends(get_db),
):
    return insights.brief(session, days=days, role=role)
