"""Stakeholder trust-status contract tests."""
from __future__ import annotations


def _workflow(run_state: str = "SUCCESS") -> list[dict]:
    return [
        {
            "run_id": 42,
            "start_time": 1_700_000_000_000,
            "end_time": 1_700_000_120_000,
            "run_duration": 120_000,
            "state": {"life_cycle_state": "TERMINATED", "result_state": run_state},
        }
    ]


def test_trust_status_reports_real_workflow_success(client, monkeypatch):
    import backend.app.services.trust as trust

    def fake_api(path: str):
        if "/jobs/list?" in path:
            return {"jobs": [{"job_id": 7, "settings": {"name": trust.JOB_NAME}}]}
        return {"runs": _workflow()}

    monkeypatch.setattr(trust, "_databricks_api", fake_api)
    monkeypatch.delenv("GENIE_SPACE_ID", raising=False)
    response = client.get("/trust/status")
    assert response.status_code == 200
    body = response.json()
    assert body["workflow"]["status"] == "succeeded"
    assert body["workflow"]["last_run"]["run_id"] == 42
    assert body["workflow"]["last_run"]["duration_seconds"] == 120
    assert body["published_data"]["status"] == "validated_snapshot"
    assert body["genie"]["status"] == "setup_required"
    assert "DATABRICKS_TOKEN" not in str(body)


def test_trust_status_interprets_failed_run(client, monkeypatch):
    import backend.app.services.trust as trust

    def fake_api(path: str):
        if "/jobs/list?" in path:
            return [{"job_id": 7, "settings": {"name": trust.JOB_NAME}}]
        return _workflow("FAILED")

    monkeypatch.setattr(trust, "_databricks_api", fake_api)
    body = client.get("/trust/status").json()
    assert body["overall"]["status"] == "attention"
    assert body["workflow"]["status"] == "failed"
    assert "Published reporting" in body["workflow"]["business_impact"]


def test_trust_status_degrades_when_databricks_unavailable(client, monkeypatch):
    import backend.app.services.trust as trust

    def unavailable(path: str):
        raise trust.TrustIntegrationError("permission_denied")

    monkeypatch.setattr(trust, "_databricks_api", unavailable)
    body = client.get("/trust/status").json()
    assert body["workflow"]["status"] == "unavailable"
    assert body["overall"]["status"] in {"limited", "attention"}
    assert body["live_books"]["checks_total"] == 11
