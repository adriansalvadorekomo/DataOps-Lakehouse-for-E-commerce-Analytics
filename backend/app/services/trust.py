"""Read-only trust status composed from PostgreSQL and Databricks metadata."""
from __future__ import annotations

import datetime
import json
import os
import urllib.error
import urllib.parse
import urllib.request

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.models.entities import Order, RevenueForecast
from backend.app.services import stats

JOB_NAME = "smart-erp-medallion"
VALIDATED_AT = "2026-09-11"
VALIDATED_ROWS = 1_000_000
VALIDATED_REVENUE = 9_938_876_984.90


class TrustIntegrationError(Exception):
    pass


def _databricks_api(path: str) -> dict | list:
    host = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
    token = os.environ.get("DATABRICKS_TOKEN", "")
    if not host or not token:
        raise TrustIntegrationError("not_configured")
    request = urllib.request.Request(
        f"{host}{path}",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        if error.code in (401, 403):
            raise TrustIntegrationError("permission_denied") from error
        raise TrustIntegrationError("unavailable") from error
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise TrustIntegrationError("unavailable") from error


def _millis_iso(value: object) -> str | None:
    if not isinstance(value, (int, float)) or value <= 0:
        return None
    return datetime.datetime.fromtimestamp(value / 1000, datetime.UTC).isoformat()


def _workflow_status() -> dict:
    try:
        jobs_payload = _databricks_api("/api/2.1/jobs/list?limit=100")
        jobs = jobs_payload.get("jobs", []) if isinstance(jobs_payload, dict) else jobs_payload
        job = next(
            (
                item
                for item in jobs
                if isinstance(item, dict)
                and (item.get("settings") or {}).get("name") == JOB_NAME
            ),
            None,
        )
        if not job:
            return {
                "status": "not_found",
                "label": "Workflow not found",
                "summary": "The published-data workflow could not be located in the workspace.",
                "business_impact": "Published marketplace numbers may not refresh until the workflow is restored.",
                "last_run": None,
            }
        job_id = int(job["job_id"])
        query = urllib.parse.urlencode({"job_id": job_id, "limit": 1})
        runs_payload = _databricks_api(f"/api/2.1/jobs/runs/list?{query}")
        runs = runs_payload.get("runs", []) if isinstance(runs_payload, dict) else runs_payload
        if not runs:
            return {
                "status": "not_run",
                "label": "Waiting for first run",
                "summary": "The workflow exists but has no recorded execution.",
                "business_impact": "The dated validation snapshot remains the latest proof of published data.",
                "last_run": None,
            }
        run = runs[0]
        state = run.get("state") or {}
        lifecycle = str(state.get("life_cycle_state") or "").upper()
        result = str(state.get("result_state") or "").upper()
        if lifecycle in {"PENDING", "RUNNING", "QUEUED", "BLOCKED", "TERMINATING"}:
            status = "running"
            label = "Update in progress"
            summary = "Marketplace data is currently being processed on Databricks."
            impact = "Published numbers remain on the last completed version until this run finishes."
        elif result == "SUCCESS":
            status = "succeeded"
            label = "Latest workflow completed"
            summary = "The most recent Databricks workflow finished successfully."
            impact = "This confirms processing completed; the dated validation records the last verified Gold contract."
        else:
            status = "failed"
            label = "Latest workflow needs attention"
            summary = "The most recent Databricks workflow did not complete successfully."
            impact = "Published reporting may remain on the last successful data version."
        duration_ms = run.get("run_duration")
        if not isinstance(duration_ms, (int, float)):
            start = run.get("start_time")
            end = run.get("end_time")
            duration_ms = end - start if isinstance(start, (int, float)) and isinstance(end, (int, float)) else None
        return {
            "status": status,
            "label": label,
            "summary": summary,
            "business_impact": impact,
            "last_run": {
                "run_id": run.get("run_id"),
                "started_at": _millis_iso(run.get("start_time")),
                "ended_at": _millis_iso(run.get("end_time")),
                "duration_seconds": round(duration_ms / 1000) if isinstance(duration_ms, (int, float)) else None,
                "result": result or lifecycle or "UNKNOWN",
            },
        }
    except TrustIntegrationError as error:
        reason = str(error)
        if reason == "not_configured":
            label = "Workspace connection not configured"
            summary = "The backend has no Databricks connection for workflow status."
        elif reason == "permission_denied":
            label = "Workflow status permission unavailable"
            summary = "Databricks is connected, but this credential cannot read workflow runs."
        else:
            label = "Workflow status unavailable"
            summary = "Databricks workflow status could not be reached right now."
        return {
            "status": "unavailable",
            "label": label,
            "summary": summary,
            "business_impact": "Live marketplace books remain available; use the dated validation for published-data trust.",
            "last_run": None,
        }


def _forecast_status(session: Session, source_as_of: datetime.date | None) -> dict:
    row = session.execute(
        select(
            func.max(RevenueForecast.asof_date),
            func.max(RevenueForecast.created_at),
        )
    ).one()
    as_of, generated_at = row
    if as_of is None:
        return {
            "status": "unavailable",
            "label": "Outlook not published",
            "as_of": None,
            "generated_at": None,
            "summary": "No batch revenue outlook is currently stored.",
        }
    aligned = source_as_of is not None and as_of >= source_as_of
    return {
        "status": "current" if aligned else "stale",
        "label": "Outlook aligned to source data" if aligned else "Outlook trails source data",
        "as_of": as_of.isoformat(),
        "generated_at": generated_at.isoformat() if generated_at else None,
        "summary": (
            "The stored outlook uses the latest order date."
            if aligned
            else "Newer orders exist than the data used for the stored outlook."
        ),
    }


def _genie_status() -> dict:
    if not os.environ.get("GENIE_SPACE_ID"):
        return {
            "status": "setup_required",
            "label": "Databricks questions need setup",
            "summary": "Create the Smart-ERP Genie Space over published marketplace data, then set GENIE_SPACE_ID on the backend.",
            "setup_guide": "docs/bi.md",
        }
    if not os.environ.get("DATABRICKS_HOST") or not os.environ.get("DATABRICKS_TOKEN"):
        return {
            "status": "unavailable",
            "label": "Databricks questions unavailable",
            "summary": "The Genie Space is selected, but the backend workspace connection is incomplete.",
            "setup_guide": "docs/bi.md",
        }
    return {
        "status": "ready",
        "label": "Databricks questions configured",
        "summary": "Questions can be sent to the configured Genie Space over published marketplace data.",
        "setup_guide": "docs/bi.md",
    }


def status(session: Session) -> dict:
    checked_at = datetime.datetime.now(datetime.UTC)
    checks = stats.dq_checks(session)
    failed = [check for check in checks if check["violations"] > 0]
    source_as_of = session.execute(select(func.max(Order.order_date))).scalar()
    workflow = _workflow_status()
    live_status = "passing" if checks and not failed else "failing" if failed else "unavailable"
    live_books = {
        "status": live_status,
        "label": (
            "All live-book checks pass"
            if live_status == "passing"
            else f"{len(failed)} live-book check{'s' if len(failed) != 1 else ''} need attention"
            if live_status == "failing"
            else "Live-book checks unavailable"
        ),
        "checked_at": checked_at.isoformat(),
        "source_as_of": source_as_of.isoformat() if source_as_of else None,
        "checks_passed": len(checks) - len(failed),
        "checks_total": len(checks),
        "violations": sum(check["violations"] for check in failed),
        "summary": (
            "Committed marketplace records satisfy the critical integrity rules."
            if live_status == "passing"
            else "At least one integrity rule found records that could affect reporting."
            if live_status == "failing"
            else "No integrity result was returned."
        ),
    }
    if live_status == "failing" or workflow["status"] in {"failed", "not_found"}:
        overall = {
            "status": "attention",
            "label": "Some reported numbers need attention",
            "summary": "A data check or the latest processing run found an issue that may affect reporting.",
        }
    elif live_status == "passing" and workflow["status"] == "succeeded":
        overall = {
            "status": "trusted",
            "label": "The available evidence supports these numbers",
            "summary": "Live records pass integrity checks and the latest Databricks workflow completed successfully.",
        }
    else:
        overall = {
            "status": "limited",
            "label": "Live numbers are available with limited platform evidence",
            "summary": "Live records are checked, but current Databricks workflow evidence is incomplete.",
        }
    return {
        "checked_at": checked_at.isoformat(),
        "overall": overall,
        "live_books": live_books,
        "workflow": workflow,
        "published_data": {
            "status": "validated_snapshot",
            "label": "Published data last contract-validated",
            "validated_at": VALIDATED_AT,
            "rows": VALIDATED_ROWS,
            "revenue": VALIDATED_REVENUE,
            "summary": "The dated validation matched source row counts and revenue within the documented tolerance.",
        },
        "forecast": _forecast_status(session, source_as_of),
        "genie": _genie_status(),
    }
