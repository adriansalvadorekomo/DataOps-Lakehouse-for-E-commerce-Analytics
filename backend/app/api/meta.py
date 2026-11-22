"""Freshness: how current are the numbers on screen? (cheap; polled by the UI)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.db import get_db
from backend.app.models.entities import Order, RevenueForecast
from backend.app.services.imports import latest_batch

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/freshness")
def get_freshness(session: Session = Depends(get_db)):
    as_of, orders = session.execute(select(func.max(Order.order_date), func.count(Order.order_id))).one()
    fc_asof = session.execute(select(func.max(RevenueForecast.asof_date))).scalar()
    forecast = ("missing" if fc_asof is None
                else "current" if as_of is not None and fc_asof >= as_of else "stale")
    return {
        "as_of": as_of.isoformat() if as_of else None,
        "orders": orders,
        "forecast_as_of": fc_asof.isoformat() if fc_asof else None,
        "forecast": forecast,
        "forecast_lag_days": (as_of - fc_asof).days if as_of and fc_asof and fc_asof < as_of else 0,
        "last_import": latest_batch(session),
    }
