"""Control tower contract tests: windows, analytics, the brief, entities, search."""
from __future__ import annotations

import datetime

from backend.app.services.period import make_window


def _order(client, *, customer="U_TEST", date=None, discount=10.0, price=1000.0, status=None):
    r = client.post("/orders", json={
        "customer_id": customer,
        "order_date": (date or datetime.date.today()).isoformat(),
        "ship_to_city": "Delhi", "payment_method": "UPI", "device": "Web", "shipping_time_days": 2,
        "items": [{"product_id": "P_TEST", "seller_id": "S_TEST", "quantity": 1,
                   "unit_price": price, "discount_pct": discount}],
    })
    assert r.status_code == 201, r.text
    order = r.json()
    if status:
        assert client.patch(f"/orders/{order['order_id']}/status",
                            json={"delivery_status": status}).status_code == 200
    return order


def test_window_is_anchored_and_contiguous():
    w = make_window(datetime.date(2026, 3, 31), 30)
    assert (w.start, w.end) == (datetime.date(2026, 3, 2), datetime.date(2026, 3, 31))
    assert w.prev_end == w.start - datetime.timedelta(days=1)
    assert (w.prev_end - w.prev_start).days == 29


def test_brief_shape_and_ordering(client):
    today = datetime.date.today()
    for d in range(0, 40, 3):
        _order(client, date=today - datetime.timedelta(days=d))
    r = client.get("/insights/brief", params={"days": 30})
    assert r.status_code == 200
    body = r.json()
    assert body["window"]["as_of"] == today.isoformat()
    assert set(body["counts"]) == {"act", "watch", "info"}
    ranks = {"act": 0, "watch": 1, "info": 2}
    sev = [ranks[s["severity"]] for s in body["signals"]]
    assert sev == sorted(sev), "signals must be ordered by severity"
    for s in body["signals"]:
        assert {"id", "domain", "severity", "title", "evidence", "next_step", "link", "kpi"} <= set(s)
    # A fresh test DB has no governance run and no forecast: both are surfaced.
    ids = {s["id"] for s in body["signals"]}
    assert "governance-none" in ids and "forecast-missing" in ids


def test_brief_role_filter_and_cache_invalidation(client):
    _order(client)
    first = client.get("/insights/brief", params={"days": 30, "role": "data"}).json()
    assert all(s["domain"] == "data" for s in first["signals"])
    # A deep discount sells below the estimated cost: the pricing signal appears
    # on the next request (the cache is keyed on the data version).
    for _ in range(3):
        _order(client, discount=65.0)
    after = client.get("/insights/brief", params={"days": 30, "role": "commercial"}).json()
    assert "deep-discounts" in {s["id"] for s in after["signals"]}


def test_margin_is_estimated_and_negative_beyond_break_even(client):
    _order(client, discount=60.0)
    m = client.get("/stats/margin", params={"days": 30}).json()
    assert m["break_even_discount_pct"] == 35.0
    band = {b["band"]: b for b in m["by_discount_band"]}["50–70"]
    assert band["est_margin"] < 0
    assert "0.65" in m["assumption"]


def test_fulfillment_funnel_and_ageing(client):
    _order(client, status="DELAYED")
    _order(client, status="DELIVERED")
    _order(client, date=datetime.date.today() - datetime.timedelta(days=5))  # past a 2-day promise
    f = client.get("/stats/fulfillment-funnel", params={"days": 30}).json()
    assert f["orders"] == 3 and abs(f["delayed_rate"] - 0.5) < 1e-9
    a = client.get("/stats/in-transit-ageing").json()
    assert a["in_transit"] == 1 and a["recent_past_promise"] == 1


def test_churn_segments_use_each_customers_cadence(client, session):
    from sqlalchemy import text

    session.execute(text("INSERT INTO public.customers (customer_id, home_city, first_purchase_date)"
                         " VALUES ('U_QUIET', 'Delhi', '2024-04-01') ON CONFLICT DO NOTHING"))
    session.commit()
    today = datetime.date.today()
    for d in (200, 190, 180):  # every ~10 days, then silent for 180 days
        _order(client, customer="U_QUIET", date=today - datetime.timedelta(days=d))
    _order(client)  # moves as_of to today
    c = client.get("/stats/churn-risk").json()
    seg = {s["segment"]: s["customers"] for s in c["segments"]}
    assert seg.get("at_risk") == 1
    assert c["top_at_risk"][0]["customer_id"] == "U_QUIET"


def test_entity_profiles_and_search(client):
    order = _order(client)
    seller = client.get("/sellers/S_TEST").json()
    assert seller["lifetime"]["orders"] >= 1 and seller["recent_orders"]
    product = client.get("/products/P_TEST").json()
    assert product["latest_stock"] is not None and product["category"] == "Electronics"
    customer = client.get("/customers/U_TEST").json()
    assert customer["lifetime"]["orders"] >= 1
    assert client.get("/sellers/NOPE").status_code == 404
    kinds = {h["kind"] for h in client.get("/search", params={"q": "s_te"}).json()}
    assert "seller" in kinds
    hit = client.get("/search", params={"q": str(order["order_id"])}).json()
    assert hit[0]["kind"] == "order"


def test_freshness_reports_as_of_and_forecast(client):
    _order(client)
    f = client.get("/meta/freshness").json()
    assert f["as_of"] == datetime.date.today().isoformat()
    assert f["forecast"] == "missing" and f["orders"] >= 1
