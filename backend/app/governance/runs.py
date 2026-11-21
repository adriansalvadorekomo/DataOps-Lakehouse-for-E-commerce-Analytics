"""Record and read governance runs (the books contract, validated with Great Expectations)."""
from __future__ import annotations

import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.entities import GovernanceRun


def run_dict(run: GovernanceRun, with_results: bool = True) -> dict:
    out = {
        "run_id": run.run_id, "trigger": run.trigger, "status": run.status,
        "evaluated": run.evaluated, "successful": run.successful,
        "critical_failures": run.critical_failures, "warnings": run.warnings,
        "error": run.error,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
    }
    if with_results:
        out["results"] = run.results or []
    return out


def start(session: Session, trigger: str) -> GovernanceRun:
    run = GovernanceRun(trigger=trigger, status="running")
    session.add(run)
    session.commit()
    session.refresh(run)
    return run


def execute(session: Session, run_id: int, connection_url: str) -> GovernanceRun:
    """Validate the books and store the outcome on the run row."""
    from backend.app.governance.engine import run_books

    run = session.get(GovernanceRun, run_id)
    try:
        out = run_books(connection_url)
        run.status, run.results = out["status"], out["results"]
        run.evaluated, run.successful = out["evaluated"], out["successful"]
        run.critical_failures, run.warnings = out["critical_failures"], out["warnings"]
    except Exception as e:  # noqa: BLE001 — a broken run is recorded, never lost
        session.rollback()
        run = session.get(GovernanceRun, run_id)
        run.status, run.error = "error", f"{type(e).__name__}: {str(e)[:300]}"
    run.finished_at = datetime.datetime.now(datetime.UTC)
    session.commit()
    session.refresh(run)
    return run


def latest(session: Session, finished_only: bool = True) -> GovernanceRun | None:
    q = select(GovernanceRun).order_by(GovernanceRun.run_id.desc()).limit(1)
    if finished_only:
        q = q.where(GovernanceRun.status != "running")
    return session.execute(q).scalar()


def connection_url() -> str:
    from backend.app.core.db import get_engine

    return get_engine().url.render_as_string(hide_password=False)


def run_now(trigger: str) -> dict:
    """Start + execute in a fresh session (background tasks, CLI)."""
    from backend.app.core.db import get_session_factory

    with get_session_factory()() as session:
        run = start(session, trigger)
        return run_dict(execute(session, run.run_id, connection_url()), with_results=False)
