"""Assistant contract tests — answers are computed, cited, never invented."""
from __future__ import annotations

from backend.tests.conftest import today


def _seed_order(client, order_date: str | None = None):
    r = client.post(
        "/orders",
        json={
            "customer_id": "U_TEST",
            "order_date": order_date or today(),
            "ship_to_city": "Delhi",
            "payment_method": "UPI",
            "device": "Web",
            "shipping_time_days": 2,
            "items": [
                {
                    "product_id": "P_TEST",
                    "seller_id": "S_TEST",
                    "quantity": 1,
                    "unit_price": 1000.00,
                    "discount_pct": 10.0,
                }
            ],
        },
    )
    assert r.status_code == 201
    return r.json()["order_id"]


def _ask(client, question: str) -> dict:
    r = client.post("/ai/ask", json={"question": question})
    assert r.status_code == 200
    body = r.json()
    assert {"answer", "intent", "sources", "interaction_id", "headline"} <= set(body)
    return body


def test_revenue_aov_return_rates(client):
    _seed_order(client)
    body = _ask(client, "What is total revenue?")
    assert body["intent"] == "revenue"
    assert "₹900.00" in body["answer"]
    assert body["sources"]

    body = _ask(client, "average order value?")
    assert body["intent"] == "aov" and "₹900.00" in body["answer"]

    body = _ask(client, "return rate?")
    assert body["intent"] == "return_rate" and "0.0%" in body["answer"]


def test_top_sellers_and_stock(client):
    _seed_order(client)
    body = _ask(client, "top 3 sellers?")
    assert body["intent"] == "top_sellers" and "S_TEST" in body["answer"]

    body = _ask(client, "which products need reordering?")
    assert body["intent"] == "stock_critical" and "0 products" in body["answer"]
    assert body["headline"] and body["metrics"][0]["kind"] == "count"


def test_order_status_and_unknown(client):
    order_id = _seed_order(client)
    body = _ask(client, f"status of order {order_id}?")
    assert body["intent"] == "order_status" and "in transit" in body["answer"]

    body = _ask(client, f"status of order 999999999?")
    assert "does not exist" in body["answer"]

    body = _ask(client, "tell me a joke about the moon")
    assert body["intent"] == "unknown"
    assert "won't guess" in body["answer"]


def test_forecast_and_dq(client):
    _seed_order(client, order_date="2024-04-01")  # in-window: keeps the R7 gate green
    body = _ask(client, "forecast revenue next month")
    assert body["intent"] in ("forecast",)
    assert "forecast" in body["answer"].lower()

    body = _ask(client, "is data quality green?")
    assert body["intent"] == "dq" and "pass" in body["answer"].lower()


def test_validation(client):
    assert client.post("/ai/ask", json={"question": ""}).status_code == 422
    assert client.post("/ai/ask", json={}).status_code == 422


def test_answers_speak_business_and_label_sources(client):
    body = _ask(client, "what is the return rate?")
    assert all(s["label"] and "/" not in s["label"] for s in body["sources"])
    for jargon in ("final_price", "DELIVERED + DELAYED", "AOV", "R1–R7", "endpoint"):
        assert jargon not in body["answer"]


def test_feedback_is_recorded_for_later_learning(client):
    body = _ask(client, "what is revenue?")
    iid = body["interaction_id"]
    r = client.post(f"/ai/interactions/{iid}/feedback", json={"rating": -1, "comment": "Wanted last month only"})
    assert r.status_code == 200 and r.json()["rating"] == -1
    assert r.json()["comment"] == "Wanted last month only"
    up = client.post(f"/ai/interactions/{iid}/feedback", json={"rating": 1, "comment": "ignored"}).json()
    assert up["rating"] == 1 and up["comment"] is None
    summary = client.get("/ai/feedback/summary").json()
    assert summary["helpful"] >= 1 and summary["answers"] >= 1
    rows = client.get("/ai/interactions", params={"rated": True}).json()
    assert rows[0]["question"] == "what is revenue?" and rows[0]["rating"] == 1
    cleared = client.post(f"/ai/interactions/{iid}/feedback", json={"rating": 0}).json()
    assert cleared["rating"] is None
    assert client.post("/ai/interactions/999999/feedback", json={"rating": 1}).status_code == 404
    assert client.post(f"/ai/interactions/{iid}/feedback", json={"rating": 5}).status_code == 422


def test_every_product_suggestion_gets_an_answer(client):
    # The suggestions shown on the Ask page must never fall through to "I won't guess".
    expected = {
        "What is our revenue?": "revenue",
        "Which sellers need attention?": "sellers_attention",
        "Which products need reordering?": "stock_critical",
        "How many orders arrive late?": "delayed_rate",
        "What will revenue be next month?": "forecast",
        "How concentrated are our customers?": "pareto",
    }
    for q, intent in expected.items():
        assert _ask(client, q)["intent"] == intent, q


def test_breakdowns_come_as_sorted_typed_tables(client):
    _seed_order(client)
    body = _ask(client, "revenue by category")
    assert body["headline"] and body["table"]["columns"][1]["kind"] == "inr"
    revenues = [r["revenue"] for r in body["table"]["rows"]]
    assert revenues == sorted(revenues, reverse=True)
    unknown = _ask(client, "what is the meaning of life?")
    assert unknown["intent"] == "unknown" and len(unknown["suggestions"]) >= 5


def test_answers_come_as_reports_with_a_chart_and_next_steps(client):
    _seed_order(client)
    body = _ask(client, "revenue by category")
    assert body["report"] == "Category report" and body["as_of"]
    assert body["chart"]["type"] == "split" and body["chart"]["data"]
    assert body["next_step"]["link"] == "/revenue" and body["follow_ups"]
