"""Grounded assistant (deterministic, no LLM), written for business users.

Answers use business language (no table, field or endpoint names); each source
carries a plain ``label`` for the UI and its endpoint for the audit trail.
Contract: every answer is COMPUTED from governed endpoints
(services/stats.py, services/orders.py, services/forecast.py) at request time.
The response always carries its sources. Unknown questions get the capability
list — never a fabricated answer. An LLM layer may later replace intent
matching; the `{answer, intent, sources}` contract stays stable.
"""
from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.entities import OrderItem
from backend.app.services import forecast as fc
from backend.app.services import stats
from backend.app.services.orders import NotFound, get_order


def _inr(n: float, digits: int = 2) -> str:
    return f"₹{n:,.{digits}f}"


def _pct(ratio: float, digits: int = 1) -> str:
    return f"{ratio * 100:.{digits}f}%"


#: What each source means to a business user (the endpoint stays for the audit trail).
SOURCE_LABELS = {
    "GET /stats/overview": "All orders to date",
    "GET /stats/city-performance": "Performance by city",
    "GET /stats/top-sellers": "Seller revenue ranking",
    "GET /stats/seller-performance": "Seller scorecard",
    "GET /stats/stock-critical": "Latest stock levels",
    "GET /stats/discount-bands": "Sales by discount level",
    "GET /stats/revenue-by-category": "Revenue by category",
    "GET /stats/forecast": "30-day revenue forecast",
    "GET /stats/dq-checks": "Data quality checks",
    "GET /stats/pareto": "Revenue by customer",
}


def _src(endpoint: str, params: dict | None = None) -> dict:
    return {"endpoint": endpoint, "params": params or {},
            "label": SOURCE_LABELS.get(endpoint, "Marketplace records")}


_STATUS = {"IN TRANSIT": "in transit", "DELIVERED": "delivered",
           "DELAYED": "delivered, but late", "RETURNED": "returned"}


def ask(session: Session, question: str) -> dict:
    """Answer a business question with cited, freshly-computed numbers, as a short report."""
    from backend.app.services.reports import enrich

    return enrich(session, _route(session, question))


def _route(session: Session, question: str) -> dict:
    q = question.strip().lower()
    if not q:
        return _help()

    m = re.search(r"order\s*#?(\d+)", q)
    if m and any(w in q for w in ("status", "where", "order", "track")):
        return _order_status(session, int(m.group(1)))
    m = re.search(r"\btop\s*(\d+)", q)
    if m and "seller" in q:
        return _top_sellers(session, min(int(m.group(1)), 50))
    if "seller" in q and ("attention" in q or "worst" in q or "flag" in q):
        return _sellers_attention(session)
    future = any(w in q for w in ("will ", "expect", "next month", "next 30", "next week", "coming"))
    if ("forecast" in q or "predict" in q or "projection" in q or "outlook" in q
            or (future and ("revenue" in q or "sales" in q or "sell" in q))):
        return _forecast(session)
    if (("stock" in q or "reorder" in q or "restock" in q or "inventory" in q)
            and ("critical" in q or "reorder" in q or "restock" in q or "low" in q
                 or "alert" in q or "need" in q or "products" in q or "inventory" in q)):
        return _stock(session)
    if "discount" in q:
        return _discounts(session)
    if "aov" in q or "average order" in q or "basket" in q:
        return _aov(session)
    if "return" in q and ("rate" in q or "how many" in q or "%" in q or "percent" in q):
        return _return_rate(session)
    if "delay" in q or re.search(r"\blate\b|on time|on-time", q):
        return _delayed(session, q)
    if "category" in q or "categories" in q or "mix" in q:
        return _categories(session)
    if "citi" in q or "cities" in q or "region" in q:
        return _cities(session, q)
    if "revenue" in q or "sales" in q or "turnover" in q:
        return _revenue(session)
    if "quality" in q or "dq" in q or "pipeline" in q or "health" in q or "gate" in q:
        return _dq(session)
    if ("pareto" in q or "concentrat" in q or "top 20" in q or "best customers" in q
            or "top customers" in q or "depend" in q):
        return _pareto(session)
    if "help" in q or "what can you" in q or "capabilit" in q:
        return _help()
    return _fallback()


# ── presentation helpers ────────────────────────────────────────────────────
# Answers are structured for an analytics product: a headline that states the
# finding, a few key figures, a sorted table when there is a breakdown, and a
# takeaway. Values are typed ("inr", "pct", "count", "rating", "share", "date",
# "id", "text") so the UI formats them (₹ lakh/crore) consistently; ``answer``
# keeps a plain-text version for copying and for the feedback log.

def _cr(n: float) -> str:
    """International units for prose: ₹9.94B · ₹419.0M · ₹959K · ₹9,939."""
    a = abs(n)
    if a >= 1e9:
        return f"₹{n / 1e9:,.2f}B"
    if a >= 1e6:
        return f"₹{n / 1e6:,.1f}M"
    if a >= 1e5:
        return f"₹{n / 1e3:,.0f}K"
    return f"₹{n:,.0f}"


def M(label: str, value, kind: str, note: str | None = None) -> dict:  # noqa: N802
    return {"label": label, "value": value, "kind": kind, **({"note": note} if note else {})}


def C(key: str, label: str, kind: str) -> dict:  # noqa: N802
    return {"key": key, "label": label, "kind": kind}


def _answer(text: str, intent: str, sources: list[dict], *, headline: str | None = None,
            metrics: list[dict] | None = None, table: dict | None = None,
            takeaway: str | None = None, suggestions: list[str] | None = None) -> dict:
    out = {"answer": text, "intent": intent, "sources": sources, "headline": headline or text}
    if metrics:
        out["metrics"] = metrics
    if table and table.get("rows"):
        out["table"] = table
    if takeaway:
        out["takeaway"] = takeaway
    if suggestions:
        out["suggestions"] = suggestions
    return out


SUGGESTIONS = [
    "What is our revenue?", "What is the average order value?", "What is the return rate?",
    "How many orders arrive late?", "Revenue by category", "Revenue by city",
    "Top 5 sellers", "Which sellers need attention?", "Which products need reordering?",
    "Which discounts sell best?", "What will revenue be next month?",
    "How concentrated are our customers?", "Can I trust the data?",
]


def _help() -> dict:
    return _answer(
        "I answer from the marketplace's own records, so every number is real. Pick a question "
        "below or ask in your own words.",
        "help", [], headline="Here is what I can answer from the marketplace's records",
        suggestions=SUGGESTIONS)


def _fallback() -> dict:
    return _answer(
        "I don't have the numbers to answer that, and I won't guess. Try one of these questions.",
        "unknown", [], headline="I don't have the numbers to answer that, and I won't guess.",
        takeaway="Every answer here comes from the marketplace's own records. These questions can be answered:",
        suggestions=SUGGESTIONS)


# ── intents ─────────────────────────────────────────────────────────────────
def _revenue(session: Session) -> dict:
    o = stats.overview(session)
    return _answer(
        f"Total revenue is {_cr(o['revenue'])} ({_inr(o['revenue'])}) from {o['total_orders']:,} orders; "
        f"the average order is worth {_inr(o['aov'])}.",
        "revenue", [_src("GET /stats/overview")],
        headline=f"Revenue to date is {_cr(o['revenue'])}",
        metrics=[M("Revenue", o["revenue"], "inr"), M("Orders", o["total_orders"], "count"),
                 M("Average order", o["aov"], "inr")],
        takeaway="Revenue is what customers paid after discounts, before returns.")


def _aov(session: Session) -> dict:
    o = stats.overview(session)
    return _answer(
        f"The average order is worth {_inr(o['aov'])} ({_cr(o['revenue'])} across "
        f"{o['total_orders']:,} orders), after an average discount of {o['avg_discount_pct']:.1f}%.",
        "aov", [_src("GET /stats/overview")],
        headline=f"The average order is worth {_inr(o['aov'])}",
        metrics=[M("Average order", o["aov"], "inr"), M("Average discount", o["avg_discount_pct"] / 100, "pct"),
                 M("Orders", o["total_orders"], "count"), M("Revenue", o["revenue"], "inr")],
        takeaway="A larger basket or a smaller average discount raises it.")


def _return_rate(session: Session) -> dict:
    o = stats.overview(session)
    n = o["by_status"].get("RETURNED", 0)
    return _answer(
        f"{_pct(o['return_rate'])} of orders are returned ({n:,} of {o['total_orders']:,}). "
        "Each return refunds the full price the customer paid.",
        "return_rate", [_src("GET /stats/overview")],
        headline=f"{_pct(o['return_rate'])} of orders are returned",
        metrics=[M("Return rate", o["return_rate"], "pct"), M("Returned orders", n, "count"),
                 M("All orders", o["total_orders"], "count")],
        takeaway="Each return refunds the full price, so returns cut revenue one for one.")


def _delayed(session: Session, q: str) -> dict:
    cities = stats.city_performance(session)
    city = next((c for c in cities if c["city"].lower() in q), None)
    if city:
        return _answer(
            f"In {city['city']}, {_pct(city['delayed_rate'], 0)} of delivered orders arrived late "
            f"({city['orders']:,} orders, {_cr(city['revenue'])} in revenue).",
            "delayed_by_city", [_src("GET /stats/city-performance")],
            headline=f"{_pct(city['delayed_rate'])} of deliveries to {city['city']} arrive late",
            metrics=[M("Late deliveries", city["delayed_rate"], "pct"), M("Orders", city["orders"], "count"),
                     M("Revenue", city["revenue"], "inr")])
    o = stats.overview(session)
    ranked = sorted(cities, key=lambda c: c["delayed_rate"], reverse=True)
    worst = ranked[0] if ranked else None
    return _answer(
        f"{_pct(o['delayed_rate'])} of the orders that reached customers arrived late."
        + (f" The most affected city is {worst['city']}, at {_pct(worst['delayed_rate'], 0)}." if worst else ""),
        "delayed_rate", [_src("GET /stats/overview"), _src("GET /stats/city-performance")],
        headline=f"{_pct(o['delayed_rate'])} of delivered orders arrive late",
        metrics=[M("Late deliveries", o["delayed_rate"], "pct", "of orders that reached the customer"),
                 M("Still in transit", o["in_transit"], "count")]
        + ([M("Most affected city", worst["city"], "text", _pct(worst["delayed_rate"]))] if worst else []),
        table={"title": "Late deliveries by city", "columns": [
            C("city", "City", "text"), C("delayed_rate", "Arrived late", "share"),
            C("orders", "Orders", "count")],
            "rows": [{"city": c["city"], "delayed_rate": c["delayed_rate"], "orders": c["orders"]} for c in ranked]},
        takeaway="Orders still in transit are not counted until they arrive.")


def _top_sellers(session: Session, n: int) -> dict:
    rows = stats.top_sellers(session, limit=n)
    if not rows:
        return _answer("No seller revenue recorded yet.", "top_sellers",
                       [_src("GET /stats/top-sellers", {"limit": n})])
    total = stats.overview(session)["revenue"] or 1
    share = sum(r["revenue"] for r in rows) / total
    return _answer(
        f"The {len(rows)} sellers bringing in the most revenue: "
        + "; ".join(f"{r['seller_id']} {_cr(r['revenue'])}" for r in rows) + ".",
        "top_sellers", [_src("GET /stats/top-sellers", {"limit": n})],
        headline=f"The top {len(rows)} sellers bring in {_pct(share)} of revenue",
        table={"columns": [C("rank", "#", "count"), C("seller_id", "Seller", "id"),
                           C("revenue", "Revenue", "inr"), C("share", "Share of revenue", "share"),
                           C("avg_rating", "Rating", "rating")],
               "rows": [{"rank": i + 1, "seller_id": r["seller_id"], "revenue": r["revenue"],
                         "share": r["revenue"] / total, "avg_rating": r["avg_rating"]}
                        for i, r in enumerate(rows)]},
        takeaway="Sales are spread across many sellers: no single seller dominates.")


def _sellers_attention(session: Session) -> dict:
    rows = stats.seller_performance(session, limit=200)
    bad = [r for r in rows
           if r["avg_rating"] < 3.5 or r["delayed_rate"] > 0.6 or r["return_rate"] > 0.2]
    rule = "rated below 3.5, more than 60% of deliveries late, or more than 20% of orders returned"
    if not bad:
        return _answer(f"No seller needs attention right now (none is {rule}).",
                       "sellers_attention", [_src("GET /stats/seller-performance")],
                       headline="No seller needs attention right now",
                       takeaway=f"A seller needs attention when {rule}.")
    top = sorted(bad, key=lambda r: r["revenue"], reverse=True)[:10]
    return _answer(
        f"{len(bad)} sellers need attention. The largest: "
        + "; ".join(f"{r['seller_id']} ({_pct(r['delayed_rate'], 0)} late, {_pct(r['return_rate'], 0)} returned)"
                    for r in top[:5]) + ".",
        "sellers_attention", [_src("GET /stats/seller-performance")],
        headline=f"{len(bad)} of the top 200 sellers need attention",
        metrics=[M("Sellers to review", len(bad), "count"),
                 M("Their revenue", sum(r["revenue"] for r in bad), "inr")],
        table={"title": "Largest first", "columns": [
            C("seller_id", "Seller", "id"), C("revenue", "Revenue", "inr"), C("avg_rating", "Rating", "rating"),
            C("delayed_rate", "Late", "pct"), C("return_rate", "Returned", "pct")],
            "rows": [{k: r[k] for k in ("seller_id", "revenue", "avg_rating", "delayed_rate", "return_rate")}
                     for r in top]},
        takeaway=f"Flagged when {rule}. Start with the largest: they affect the most customers.")


def _stock(session: Session) -> dict:
    o = stats.overview(session)
    rows = stats.stock_critical_list(session, limit=8)
    return _answer(
        f"{o['stock_critical']:,} products are running low (fewer than 20 units in stock)."
        + (" The lowest: " + "; ".join(f"{r['product_id']} ({r['latest_stock']} left)" for r in rows[:5])
           if rows else ""),
        "stock_critical",
        [_src("GET /stats/overview"), _src("GET /stats/stock-critical", {"limit": 8})],
        headline=f"{o['stock_critical']:,} products are running low",
        metrics=[M("Products below 20 units", o["stock_critical"], "count")],
        table={"title": "Lowest stock first", "columns": [
            C("product_id", "Product", "id"), C("what", "Brand · category", "text"),
            C("latest_stock", "Units left", "count"), C("current_price", "Price", "inr")],
            "rows": [{"product_id": r["product_id"], "what": f"{r['brand']} · {r['category']}",
                      "latest_stock": r["latest_stock"], "current_price": r["current_price"]} for r in rows]},
        takeaway="The Inventory page ranks them by how many days of stock are left at the current pace.")


_BAND_ORDER = {"0–10": 0, "10–30": 1, "30–50": 2, "50–70": 3}


def _discounts(session: Session) -> dict:
    bands = sorted(stats.discount_bands(session), key=lambda b: _BAND_ORDER.get(b["band"], 9))
    if not bands:
        return _answer("No discount data recorded yet.", "discounts", [_src("GET /stats/discount-bands")])
    best = max(bands, key=lambda b: b["revenue"])
    total = sum(b["revenue"] for b in bands) or 1
    return _answer(
        f"Discounts of {best['band']}% bring in the most revenue ({_cr(best['revenue'])} from "
        f"{best['lines']:,} sales).",
        "discounts", [_src("GET /stats/discount-bands")],
        headline=f"Discounts of {best['band']}% bring in the most revenue",
        table={"columns": [C("band", "Discount", "text"), C("revenue", "Revenue", "inr"),
                           C("share", "Share of revenue", "share"), C("lines", "Sales", "count")],
               "rows": [{"band": f"{b['band']}%", "revenue": b["revenue"], "share": b["revenue"] / total,
                         "lines": b["lines"]} for b in bands]},
        takeaway="Under the 65% cost assumption, any discount above 35% sells below cost (estimated).")


def _categories(session: Session) -> dict:
    rows = stats.revenue_by_category(session)
    if not rows:
        return _answer("No sales yet.", "categories", [_src("GET /stats/revenue-by-category")])
    total = sum(r["revenue"] for r in rows) or 1
    top = rows[0]
    return _answer(
        "Revenue by category, largest first: "
        + "; ".join(f"{r['category']} {_cr(r['revenue'])} ({_pct(r['revenue'] / total, 0)})" for r in rows) + ".",
        "categories", [_src("GET /stats/revenue-by-category")],
        headline=f"{top['category']} brings in {_pct(top['revenue'] / total, 0)} of revenue",
        table={"columns": [C("category", "Category", "text"), C("revenue", "Revenue", "inr"),
                           C("share", "Share", "share"), C("lines", "Orders", "count")],
               "rows": [{"category": r["category"], "revenue": r["revenue"], "share": r["revenue"] / total,
                         "lines": r["lines"]} for r in rows]},
        takeaway=(f"{top['category']} leads on price, not volume: categories sell similar numbers of orders."
                  if len(rows) > 1 and max(r["lines"] for r in rows) < 1.5 * min(r["lines"] for r in rows)
                  else None))


def _cities(session: Session, q: str) -> dict:
    cities = stats.city_performance(session)
    if not cities:
        return _answer("No sales yet.", "cities", [_src("GET /stats/city-performance")])
    city = next((c for c in cities if c["city"].lower() in q), None)
    if city:
        return _answer(
            f"{city['city']}: {_cr(city['revenue'])} in revenue from {city['orders']:,} orders; "
            f"{_pct(city['delayed_rate'], 0)} arrived late and {_pct(city['return_rate'], 0)} were returned.",
            "city_detail", [_src("GET /stats/city-performance")],
            headline=f"{city['city']}: {_cr(city['revenue'])} in revenue",
            metrics=[M("Revenue", city["revenue"], "inr"), M("Orders", city["orders"], "count"),
                     M("Arrived late", city["delayed_rate"], "pct"), M("Returned", city["return_rate"], "pct")])
    total = sum(c["revenue"] for c in cities) or 1
    top = cities[0]
    return _answer(
        "Revenue by city: " + "; ".join(f"{c['city']} {_cr(c['revenue'])} ({_pct(c['revenue'] / total, 0)})"
                                         for c in cities) + ".",
        "cities", [_src("GET /stats/city-performance")],
        headline=f"{top['city']} leads with {_cr(top['revenue'])} in revenue",
        table={"columns": [C("city", "City", "text"), C("revenue", "Revenue", "inr"), C("share", "Share", "share"),
                           C("orders", "Orders", "count"), C("delayed_rate", "Late", "pct"),
                           C("return_rate", "Returned", "pct")],
               "rows": [{"city": c["city"], "revenue": c["revenue"], "share": c["revenue"] / total,
                         "orders": c["orders"], "delayed_rate": c["delayed_rate"],
                         "return_rate": c["return_rate"]} for c in cities]})


def _forecast(session: Session) -> dict:
    data = fc.read_forecast(session, trailing=30)
    rf, ph = data["forecasts"]["rf"], data["forecasts"]["prophet"]
    if not rf:
        return _answer("No forecast has been published yet, so I can't say what to expect.",
                       "forecast", [_src("GET /stats/forecast")],
                       headline="No forecast has been published yet",
                       takeaway="Once the forecast is refreshed, I can say what revenue to expect.")
    rf_total, ph_total = sum(r["yhat"] for r in rf), sum(r["yhat"] for r in ph)
    actual = sum(a["revenue"] for a in data["actuals"][-len(rf):]) if data["actuals"] else 0
    return _answer(
        f"The forecast for the next {len(rf)} days is {_cr(rf_total)} in revenue, based on sales up to "
        f"{data['asof']}. A second model expects {_cr(ph_total)}.",
        "forecast", [_src("GET /stats/forecast")],
        headline=f"Expect about {_cr(rf_total)} in revenue over the next {len(rf)} days",
        metrics=[M(f"Next {len(rf)} days", rf_total, "inr", "main model"),
                 M("Second opinion", ph_total, "inr", "independent model"),
                 *([M(f"Last {len(rf)} days, actual", actual, "inr")] if actual else []),
                 M("Based on sales up to", str(data["asof"]), "date")],
        takeaway="The main model has been within about 3.4% of actual daily revenue in testing.")


def _order_status(session: Session, order_id: int) -> dict:
    try:
        order = get_order(session, order_id)
    except NotFound:
        return _answer(f"Order {order_id} does not exist.", "order_status", [],
                       headline=f"Order {order_id} does not exist")
    items = session.execute(
        select(OrderItem).where(OrderItem.order_id == order_id)).scalars().all()
    total = sum(float(i.final_price) for i in items)
    status = _STATUS.get(order.delivery_status, order.delivery_status)
    return _answer(
        f"Order {order_id} is {status}. It was placed by {order.customer_id} on {order.order_date} "
        f"for {_inr(total)}.",
        "order_status", [{"endpoint": f"GET /orders/{order_id}", "params": {}, "label": f"Order {order_id}"}],
        headline=f"Order {order_id} is {status}",
        metrics=[M("Status", status.capitalize(), "text"), M("Customer", order.customer_id, "id"),
                 M("Ordered on", str(order.order_date), "date"), M("Amount", total, "inr")])


def _dq(session: Session) -> dict:
    checks = stats.dq_checks(session)
    bad = [c for c in checks if c["violations"]]
    if not bad:
        return _answer(f"Yes. All {len(checks)} data checks pass on the live records: no missing keys, "
                       "duplicates, broken links, wrong prices or impossible values.",
                       "dq", [_src("GET /stats/dq-checks")],
                       headline="Yes — every data check passes",
                       metrics=[M("Checks passed", f"{len(checks)} of {len(checks)}", "text")],
                       takeaway="Checked live: no missing keys, duplicates, broken links, wrong prices or "
                                "impossible values. The full contract is on the Data & governance page.")
    return _answer(
        "Some records need fixing before you rely on the numbers: "
        + "; ".join(f"{c['rule']} ({c['violations']:,} records)" for c in bad),
        "dq", [_src("GET /stats/dq-checks")],
        headline=f"{len(bad)} data check{'s' if len(bad) > 1 else ''} found records to fix",
        metrics=[M("Checks passed", f"{len(checks) - len(bad)} of {len(checks)}", "text")],
        table={"columns": [C("rule", "Check", "text"), C("violations", "Records affected", "count")],
               "rows": [{"rule": c["rule"], "violations": c["violations"]} for c in bad]},
        takeaway="Numbers that touch these records may be wrong until they are fixed at the source.")


def _pareto(session: Session) -> dict:
    share = stats.pareto_share(session)["top20_share"]
    return _answer(
        f"The best 20% of customers bring in {_pct(share)} of revenue.",
        "pareto", [_src("GET /stats/pareto")],
        headline=f"The best 20% of customers bring in {_pct(share)} of revenue",
        metrics=[M("Top 20% of customers", share, "pct", "share of revenue"),
                 M("Everyone else", 1 - share, "pct", "share of revenue")],
        takeaway="Revenue depends heavily on a minority of customers, so keeping them is worth more "
                 "than winning an average new one. The Customers page lists who is drifting away.")
