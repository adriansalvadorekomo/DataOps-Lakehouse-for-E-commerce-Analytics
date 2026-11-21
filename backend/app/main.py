"""Smart-ERP backend — the Marketplace Control Tower API over PostgreSQL.

Orders (create/read/lifecycle), KPI stats, the Today brief (/insights),
entity profiles + search, CSV imports, freshness, trust, AI assistants.
Contract: docs/business-model.md (KPIs, rules) and docs/product.md (signals).
"""
from __future__ import annotations

import os
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from backend.app.api.assistant import router as assistant_router
from backend.app.api.documents import router as documents_router
from backend.app.api.entities import router as entities_router
from backend.app.api.governance import router as governance_router
from backend.app.api.imports import router as imports_router
from backend.app.api.insights import router as insights_router
from backend.app.api.meta import router as meta_router
from backend.app.api.orders import router as orders_router
from backend.app.api.stats import router as stats_router
from backend.app.api.trust import router as trust_router
from backend.app.core.db import get_session_factory



def _warm_cache() -> None:
    """Compute the heavy reads once at startup so the first visitor gets the
    brief in ~150 ms instead of several seconds (cache: services/analytics.py)."""
    try:
        from backend.app.services import analytics, insights

        with get_session_factory()() as session:
            insights.brief(session, days=30)
            analytics.pareto_curve(session)
            analytics.revenue_monthly(session)
    except Exception:  # noqa: BLE001 — warm-up is best-effort (e.g. empty DB)
        pass


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if os.environ.get("SMART_ERP_WARMUP", "1") != "0":
        threading.Thread(target=_warm_cache, daemon=True).start()
    yield


app = FastAPI(title="Smart-ERP Control Tower", version="0.2.0", lifespan=lifespan)

# Separate-deploys path (Vite dev uses the /api proxy instead, same-origin).
_frontend_origins = [
    o.strip()
    for o in os.environ.get("FRONTEND_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_frontend_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(orders_router)
app.include_router(stats_router)
app.include_router(assistant_router)
app.include_router(documents_router)
app.include_router(trust_router)
app.include_router(insights_router)
app.include_router(entities_router)
app.include_router(imports_router)
app.include_router(meta_router)
app.include_router(governance_router)


@app.get("/health")
def health():
    """Liveness + DB reachability (no auth — safe for orchestrators)."""
    try:
        with get_session_factory()() as session:
            session.execute(text("SELECT 1"))
        db = "up"
    except Exception:
        db = "down"
    return {"status": "ok" if db == "up" else "degraded", "db": db}
