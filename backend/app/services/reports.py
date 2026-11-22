"""Turn an assistant answer into a short report, the way an assistant would brief a stakeholder.

For each kind of question this adds:
  report     — the report's title ("Revenue report")
  as_of      — the date the numbers run to
  chart      — the visual that best answers it (trend, ranking, split, curve, forecast, status)
  next_step  — where in the product to act on it
  follow_ups — the natural next questions

Chart spec (rendered by the web app):
  {"type": "trend" | "columns" | "ranking" | "split" | "curve" | "forecast" | "status",
   "title": str, "kind": value kind of the main measure, "data": [...], ...}
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.services import analytics, stats
from backend.app.services import forecast as fc
from backend.app.services.period import latest_order_date

_PALETTE_NOTE = "first item is highlighted by the UI"


def _monthly(session: Session) -> list[dict]:
    # Full months only: a month with under half the typical orders is partial (the
    # history starts with a single day, and the newest month may still be filling).
    rows = analytics.revenue_monthly(session, months=25)
    if not rows:
        return rows
    typical = sorted(r["orders"] for r in rows)[len(rows) // 2]
    return [r for r in rows if r["orders"] >= typical * 0.5] or rows


def _returns_by_category(session: Session) -> list[dict]:
    rows = session.execute(text("""
        SELECT oi.category AS label,
               AVG(CASE WHEN o.delivery_status = 'RETURNED' THEN 1.0 ELSE 0 END) AS value
        FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.order_id
        GROUP BY 1 ORDER BY 2 DESC
    """)).mappings()
    return [{"label": r["label"], "value": float(r["value"])} for r in rows]


def _report(intent: str, r: dict, session: Session) -> dict:
    t = r.get("table") or {}
    rows = t.get("rows", [])
    if intent == "revenue":
        m = _monthly(session)
        return {"report": "Revenue report",
                "chart": {"type": "trend", "title": "Revenue by month", "kind": "inr",
                          "data": [{"x": x["month"], "y": x["revenue"]} for x in m]},
                "next_step": {"label": "Open the revenue view", "link": "/revenue"},
                "follow_ups": ["Revenue by category", "Revenue by city", "What will revenue be next month?"]}
    if intent == "aov":
        m = _monthly(session)
        return {"report": "Basket report",
                "chart": {"type": "trend", "title": "Average order value by month", "kind": "inr",
                          "data": [{"x": x["month"], "y": x["aov"]} for x in m]},
                "next_step": {"label": "See what discounts cost", "link": "/revenue#margin"},
                "follow_ups": ["Which discounts sell best?", "Revenue by category", "What is our revenue?"]}
    if intent == "return_rate":
        return {"report": "Returns report",
                "chart": {"type": "ranking", "title": "Share of orders returned, by category", "kind": "pct",
                          "data": _returns_by_category(session)},
                "next_step": {"label": "See the brands returned most", "link": "/inventory#returns"},
                "follow_ups": ["Which sellers need attention?", "Revenue by category", "How many orders arrive late?"]}
    if intent == "delayed_rate":
        return {"report": "Delivery report",
                "chart": {"type": "ranking", "title": "Deliveries that arrived late, by city", "kind": "pct",
                          "data": [{"label": x["city"], "value": x["delayed_rate"]} for x in rows]},
                "next_step": {"label": "Open fulfillment", "link": "/fulfillment"},
                "follow_ups": ["Which sellers need attention?", "Revenue by city", "What is the return rate?"]}
    if intent in ("delayed_by_city", "city_detail"):
        return {"report": "City report", "next_step": {"label": "Open fulfillment", "link": "/fulfillment"},
                "follow_ups": ["Revenue by city", "How many orders arrive late?"]}
    if intent == "top_sellers":
        return {"report": "Seller report",
                "chart": {"type": "ranking", "title": "Revenue by seller", "kind": "inr",
                          "data": [{"label": x["seller_id"], "value": x["revenue"]} for x in rows]},
                "next_step": {"label": "Open the seller scorecard", "link": "/sellers"},
                "follow_ups": ["Which sellers need attention?", "How concentrated are our customers?"]}
    if intent == "sellers_attention" and rows:
        return {"report": "Seller watchlist",
                "chart": {"type": "ranking", "title": "Share of their deliveries that arrived late", "kind": "pct",
                          "data": [{"label": x["seller_id"], "value": x["delayed_rate"]} for x in rows]},
                "next_step": {"label": "Review these sellers", "link": "/sellers?flag=late_deliveries"},
                "follow_ups": ["Top 5 sellers", "How many orders arrive late?", "What is the return rate?"]}
    if intent == "stock_critical" and rows:
        return {"report": "Stock report",
                "chart": {"type": "ranking", "title": "Units left, lowest first", "kind": "count", "ascending": True,
                          "data": [{"label": x["product_id"], "value": x["latest_stock"], "hint": x["what"]}
                                   for x in rows]},
                "next_step": {"label": "Open the reorder list", "link": "/inventory#reorder"},
                "follow_ups": ["Revenue by category", "What will revenue be next month?"]}
    if intent == "discounts":
        margin = analytics.margin(session)
        bands = {b["band"]: b for b in margin["by_discount_band"]}
        return {"report": "Discount report",
                "chart": {"type": "columns", "title": "Revenue and estimated profit, by discount", "kind": "inr",
                          "series": [{"key": "revenue", "label": "Revenue"},
                                     {"key": "profit", "label": "Estimated profit"}],
                          "data": [{"x": x["band"], "revenue": x["revenue"],
                                    "profit": bands.get(x["band"].rstrip("%"), {}).get("est_margin", 0)}
                                   for x in rows]},
                "next_step": {"label": "See what discounts cost", "link": "/revenue#margin"},
                "follow_ups": ["What is the average order value?", "Revenue by category"]}
    if intent == "categories":
        return {"report": "Category report",
                "chart": {"type": "split", "title": "Share of revenue", "kind": "inr",
                          "data": [{"label": x["category"], "value": x["revenue"]} for x in rows]},
                "next_step": {"label": "Open the revenue view", "link": "/revenue"},
                "follow_ups": ["Revenue by city", "What is the return rate?", "Which discounts sell best?"]}
    if intent == "cities":
        return {"report": "City report",
                "chart": {"type": "ranking", "title": "Revenue by city", "kind": "inr",
                          "data": [{"label": x["city"], "value": x["revenue"]} for x in rows]},
                "next_step": {"label": "Open the revenue view", "link": "/revenue"},
                "follow_ups": ["How many orders arrive late?", "Revenue by category"]}
    if intent == "forecast":
        d = fc.read_forecast(session, trailing=60)
        if not d["forecasts"]["rf"]:
            return {"report": "Forecast", "follow_ups": ["What is our revenue?"]}
        data = [{"x": a["date"], "actual": a["revenue"]} for a in d["actuals"]]
        if data:
            data[-1]["expected"] = data[-1]["actual"]
        data += [{"x": f["date"], "expected": f["yhat"]} for f in d["forecasts"]["rf"]]
        return {"report": "Revenue outlook",
                "chart": {"type": "forecast", "title": "Daily revenue: the last 60 days and the next 30",
                          "kind": "inr", "today": d["asof"], "data": data},
                "next_step": {"label": "Open the forecast", "link": "/forecast"},
                "follow_ups": ["What is our revenue?", "Revenue by category"]}
    if intent == "pareto":
        curve = analytics.pareto_curve(session)
        return {"report": "Customer report",
                "chart": {"type": "curve", "title": "Share of revenue from the best customers", "kind": "pct",
                          "data": [{"x": 0, "y": 0}] + [{"x": p["customers_pct"], "y": p["revenue_share"]}
                                                        for p in curve["points"]]},
                "next_step": {"label": "See who is drifting away", "link": "/customers#at-risk"},
                "follow_ups": ["What is our revenue?", "Top 5 sellers"]}
    if intent == "dq":
        checks = stats.dq_checks(session)
        bad = sum(1 for c in checks if c["violations"])
        return {"report": "Data check report",
                "chart": {"type": "split", "title": "Data checks", "kind": "count",
                          "data": [{"label": "Passed", "value": len(checks) - bad, "tone": "good"},
                                   *([{"label": "Need fixing", "value": bad, "tone": "signal"}] if bad else [])]},
                "next_step": {"label": "Open data checks", "link": "/data#governance"},
                "follow_ups": ["What is our revenue?", "How many orders arrive late?"]}
    if intent == "order_status":
        status = next((m["value"] for m in r.get("metrics", []) if m["label"] == "Status"), None)
        oid = r["sources"][0]["label"].split()[-1] if r.get("sources") else None
        if status:
            return {"report": "Order status",
                    "chart": {"type": "status", "title": "Where the order is", "current": status},
                    "next_step": {"label": "Open the order", "link": f"/orders/{oid}"} if oid else None}
    return {}


def enrich(session: Session, result: dict) -> dict:
    """Add the report layer to an answer (never fails the answer itself)."""
    try:
        extra = _report(result.get("intent", ""), result, session)
    except Exception:  # noqa: BLE001 — a missing chart must not lose the answer
        session.rollback()
        extra = {}
    as_of = latest_order_date(session)
    out = {**result, **{k: v for k, v in extra.items() if v}}
    if as_of and result.get("intent") not in ("help", "unknown"):
        out["as_of"] = as_of.isoformat()
    return out
