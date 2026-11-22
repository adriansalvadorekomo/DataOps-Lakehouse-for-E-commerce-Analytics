"""Window-aware analytics behind the control tower (business-model KPIs K1–K12).

Read-only, computed live from PostgreSQL on every call, so a new order or a
CSV import shows up on the next request. Every window is anchored on the
latest order date (see services/period.py). Margin figures use the
business-model assumption unit_cost = 0.65 × unit_price and are always
labelled "estimated" (the source has no cost of goods).
"""
from __future__ import annotations

import math

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.services.period import Window

#: Business-model assumption (§4, K10): estimated unit cost share of list price.
UNIT_COST_SHARE = 0.65
#: Business-model K8: a product is stock-critical when its latest stock is below this.
STOCK_CRITICAL_BELOW = 20

_DISCOUNT_BAND = """
  CASE WHEN oi.discount_pct < 10 THEN '0–10'
       WHEN oi.discount_pct < 30 THEN '10–30'
       WHEN oi.discount_pct < 50 THEN '30–50'
       ELSE '50–70' END
"""


_CACHE: dict = {}
_CACHE_MAX = 128


def data_version(session: Session) -> tuple:
    """Cheap fingerprint of the books: changes on any insert (count, max id) or
    status change (max updated_at). Indexed, so ~1 ms on 1M orders."""
    return tuple(session.execute(text(
        "SELECT COUNT(*), MAX(order_id), MAX(updated_at) FROM public.orders")).one())


def cached(fn):
    """Memoise a heavy read on (args, data_version). Results stay live: the next
    request after any write recomputes."""
    def wrapper(session: Session, *args, **kwargs):
        key = (fn.__name__, args, tuple(sorted(kwargs.items())), data_version(session))
        if key not in _CACHE:
            if len(_CACHE) >= _CACHE_MAX:
                _CACHE.pop(next(iter(_CACHE)))
            _CACHE[key] = fn(session, *args, **kwargs)
        return _CACHE[key]
    wrapper.__name__ = fn.__name__
    wrapper.__doc__ = fn.__doc__
    wrapper.uncached = fn
    return wrapper


def _rows(session: Session, sql: str, params: dict | None = None) -> list[dict]:
    return [dict(r._mapping) for r in session.execute(text(sql), params or {})]


def _f(value) -> float:
    return float(value) if value is not None else 0.0


def _window_clause(window: Window | None, alias: str = "o") -> tuple[str, dict]:
    if window is None:
        return "TRUE", {}
    return f"{alias}.order_date BETWEEN :start AND :end", {"start": window.start, "end": window.end}


# ── K1/K2/K5 — revenue over time ────────────────────────────────────────────
@cached
def revenue_monthly(session: Session, months: int = 24) -> list[dict]:
    rows = _rows(session, """
        WITH m AS (
          SELECT date_trunc('month', o.order_date)::date AS month,
                 COUNT(DISTINCT o.order_id) AS orders,
                 SUM(oi.final_price) AS revenue
          FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.order_id
          GROUP BY 1
        )
        SELECT * FROM m ORDER BY month DESC LIMIT :months
    """, {"months": months})
    rows.reverse()
    return [{"month": r["month"].isoformat()[:7], "orders": r["orders"],
             "revenue": _f(r["revenue"]),
             "aov": _f(r["revenue"]) / r["orders"] if r["orders"] else 0.0} for r in rows]


def category_comparison(session: Session, window: Window) -> list[dict]:
    """Revenue per category in the current vs the previous window (K5)."""
    rows = _rows(session, """
        SELECT oi.category,
               SUM(CASE WHEN o.order_date BETWEEN :start AND :end THEN oi.final_price ELSE 0 END) AS current,
               SUM(CASE WHEN o.order_date BETWEEN :prev_start AND :prev_end THEN oi.final_price ELSE 0 END) AS previous
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.order_id
        WHERE o.order_date BETWEEN :prev_start AND :end
        GROUP BY oi.category ORDER BY current DESC
    """, window.params)
    total = sum(_f(r["current"]) for r in rows) or 1.0
    out = []
    for r in rows:
        cur, prev = _f(r["current"]), _f(r["previous"])
        out.append({"category": r["category"], "current": cur, "previous": prev,
                    "share": cur / total,
                    "change": (cur - prev) / prev if prev else None})
    return out


# ── K10 — estimated margin ──────────────────────────────────────────────────
def margin(session: Session, window: Window | None = None) -> dict:
    where, params = _window_clause(window)
    params["cost"] = UNIT_COST_SHARE
    est = "SUM(oi.final_price - :cost * oi.unit_price * oi.quantity)"
    by_band = _rows(session, f"""
        SELECT {_DISCOUNT_BAND} AS band, COUNT(*) AS lines,
               SUM(oi.final_price) AS revenue, {est} AS est_margin
        FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.order_id
        WHERE {where} GROUP BY 1 ORDER BY 1
    """, params)
    by_category = _rows(session, f"""
        SELECT oi.category, SUM(oi.final_price) AS revenue, {est} AS est_margin
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.order_id
        WHERE {where} GROUP BY 1 ORDER BY revenue DESC
    """, params)

    def shape(rows: list[dict], key: str) -> list[dict]:
        return [{key: r[key], "revenue": _f(r["revenue"]), "est_margin": _f(r["est_margin"]),
                 "est_margin_pct": _f(r["est_margin"]) / _f(r["revenue"]) if _f(r["revenue"]) else 0.0,
                 **({"lines": r["lines"]} if "lines" in r else {})} for r in rows]

    revenue = sum(_f(r["revenue"]) for r in by_band)
    est_total = sum(_f(r["est_margin"]) for r in by_band)
    return {
        "assumption": f"unit_cost = {UNIT_COST_SHARE} × unit_price (no cost of goods in the source)",
        "revenue": revenue,
        "est_margin": est_total,
        "est_margin_pct": est_total / revenue if revenue else 0.0,
        "break_even_discount_pct": round((1 - UNIT_COST_SHARE) * 100, 1),
        "by_discount_band": shape(by_band, "band"),
        "by_category": shape(by_category, "category"),
    }


# ── K9 — customer concentration ─────────────────────────────────────────────
@cached
def pareto_curve(session: Session) -> dict:
    rows = _rows(session, """
        WITH per_cust AS (
          SELECT o.customer_id, SUM(oi.final_price) AS rev
          FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.order_id
          GROUP BY o.customer_id
        ), ranked AS (
          SELECT rev, NTILE(10) OVER (ORDER BY rev DESC) AS decile FROM per_cust
        )
        SELECT decile, SUM(rev) AS revenue, COUNT(*) AS customers
        FROM ranked GROUP BY decile ORDER BY decile
    """)
    total = sum(_f(r["revenue"]) for r in rows) or 1.0
    cum, points = 0.0, []
    for r in rows:
        cum += _f(r["revenue"])
        points.append({"customers_pct": r["decile"] * 10, "revenue_share": cum / total,
                       "decile_share": _f(r["revenue"]) / total, "customers": r["customers"]})
    top20 = points[1]["revenue_share"] if len(points) >= 2 else (points[0]["revenue_share"] if points else 0.0)
    return {"points": points, "top20_share": top20,
            "customers": sum(r["customers"] for r in rows)}


# ── K11 — churn risk (each customer against their own cadence) ──────────────
_SEGMENT = """
  CASE WHEN orders = 1 THEN 'one_time'
       WHEN days_since > 2 * GREATEST(avg_gap, 7) THEN 'at_risk'
       WHEN days_since > GREATEST(avg_gap, 7) THEN 'cooling'
       ELSE 'active' END
"""


@cached
def churn_risk(session: Session, as_of, limit: int = 20) -> dict:
    """K11: each repeat customer measured against their own cadence.
    One materialized pass over the books feeds both the segments and the list."""
    rows = _rows(session, f"""
        WITH c AS MATERIALIZED (
          SELECT o.customer_id, COUNT(*) AS orders, MIN(o.order_date) AS first_order,
                 MAX(o.order_date) AS last_order, SUM(oi.final_price) AS revenue
          FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.order_id
          GROUP BY o.customer_id
        ), s AS MATERIALIZED (
          SELECT *, (CAST(:as_of AS date) - last_order) AS days_since,
                 CASE WHEN orders > 1 THEN (last_order - first_order)::numeric / (orders - 1) END AS avg_gap
          FROM c
        ), seg AS MATERIALIZED (
          SELECT *, {_SEGMENT} AS segment FROM s
        ), agg AS (
          SELECT segment, COUNT(*) AS customers, SUM(revenue) AS revenue FROM seg GROUP BY segment
        ), top AS (
          SELECT * FROM seg WHERE segment = 'at_risk' ORDER BY revenue DESC LIMIT :limit
        )
        SELECT 'agg' AS kind, segment, customers, revenue, NULL AS customer_id, NULL::bigint AS orders,
               NULL::date AS last_order, NULL::int AS days_since, NULL::numeric AS avg_gap FROM agg
        UNION ALL
        SELECT 'top', segment, NULL, revenue, customer_id, orders, last_order, days_since, avg_gap FROM top
    """, {"as_of": as_of, "limit": limit})
    segments = [r for r in rows if r["kind"] == "agg"]
    top = sorted((r for r in rows if r["kind"] == "top"), key=lambda r: _f(r["revenue"]), reverse=True)
    total_rev = sum(_f(r["revenue"]) for r in segments) or 1.0
    order = ["active", "cooling", "at_risk", "one_time"]
    segments.sort(key=lambda r: order.index(r["segment"]))
    return {
        "as_of": as_of.isoformat(),
        "rule": "Repeat customers: at risk when days since last order > 2 × their own average gap "
                "(gap floored at 7 days); cooling when > 1 ×",
        "segments": [{"segment": r["segment"], "customers": r["customers"], "revenue": _f(r["revenue"]),
                      "revenue_share": _f(r["revenue"]) / total_rev} for r in segments],
        "top_at_risk": [{"customer_id": r["customer_id"], "orders": r["orders"],
                         "last_order": r["last_order"].isoformat(), "days_since": r["days_since"],
                         "avg_gap_days": round(_f(r["avg_gap"]), 1), "revenue": _f(r["revenue"])}
                        for r in top],
    }


# ── K12 baseline — return hotspots ──────────────────────────────────────────
def return_hotspots(session: Session, window: Window | None = None, limit: int = 12) -> dict:
    where, params = _window_clause(window)
    base = _rows(session, f"""
        SELECT COUNT(*) AS orders,
               SUM(CASE WHEN o.delivery_status = 'RETURNED' THEN 1 ELSE 0 END) AS returns
        FROM public.orders o WHERE {where}
    """, params)[0]
    orders = base["orders"] or 0
    baseline = (base["returns"] or 0) / orders if orders else 0.0
    # Minimum volume scales with the data: 0.1% of orders in scope, at least 20.
    min_orders = max(20, math.ceil(orders * 0.001))
    params.update({"min_orders": min_orders})
    rows = _rows(session, f"""
        SELECT oi.category, oi.brand, COUNT(DISTINCT o.order_id) AS orders,
               SUM(CASE WHEN o.delivery_status = 'RETURNED' THEN 1 ELSE 0 END) AS returns,
               SUM(CASE WHEN o.delivery_status = 'RETURNED' THEN oi.final_price ELSE 0 END) AS refunded
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.order_id
        WHERE {where}
        GROUP BY oi.category, oi.brand HAVING COUNT(DISTINCT o.order_id) >= :min_orders
    """, params)
    out = []
    for r in rows:
        n, k = r["orders"], r["returns"] or 0
        rate = k / n if n else 0.0
        se = math.sqrt(baseline * (1 - baseline) / n) if n and 0 < baseline < 1 else 0.0
        z = (rate - baseline) / se if se else 0.0
        out.append({"category": r["category"], "brand": r["brand"], "orders": n, "returns": k,
                    "return_rate": rate, "lift": rate / baseline if baseline else 0.0,
                    "z": round(z, 2), "refunded": _f(r["refunded"])})
    out.sort(key=lambda x: x["z"], reverse=True)
    return {"baseline_return_rate": baseline, "min_orders": min_orders,
            "orders_in_scope": orders, "pairs": out[:limit]}


# ── K8 — stock cover ────────────────────────────────────────────────────────
def stock_cover(session: Session, as_of, limit: int = 50, velocity_days: int = 30) -> dict:
    """Latest stock per product vs the units sold in the last ``velocity_days``
    days of data → days of cover. Ranks what will run out first."""
    params = {"as_of": as_of, "vdays": velocity_days, "limit": limit, "crit": STOCK_CRITICAL_BELOW}
    rows = _rows(session, """
        WITH latest AS (
          SELECT DISTINCT ON (product_id) product_id, stock, snapshot_date
          FROM public.inventory ORDER BY product_id, snapshot_date DESC
        ), sold AS (
          SELECT oi.product_id, SUM(oi.quantity) AS units, SUM(oi.final_price) AS revenue
          FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.order_id
          WHERE o.order_date > :as_of - :vdays AND o.order_date <= :as_of
            AND o.delivery_status <> 'RETURNED'
          GROUP BY oi.product_id
        )
        SELECT p.product_id, p.category, p.brand, p.subcategory, p.current_price,
               l.stock, l.snapshot_date, COALESCE(s.units, 0) AS units, COALESCE(s.revenue, 0) AS revenue
        FROM latest l
        JOIN public.products p ON p.product_id = l.product_id
        LEFT JOIN sold s ON s.product_id = l.product_id
        WHERE l.stock < :crit
        ORDER BY (l.stock = 0),
                 CASE WHEN COALESCE(s.units, 0) > 0 THEN l.stock::numeric / (s.units::numeric / :vdays) END
                 ASC NULLS LAST, s.revenue DESC NULLS LAST, l.stock ASC
        LIMIT :limit
    """, params)
    summary = _rows(session, """
        WITH latest AS (
          SELECT DISTINCT ON (product_id) product_id, stock
          FROM public.inventory ORDER BY product_id, snapshot_date DESC
        )
        SELECT COUNT(*) AS products,
               SUM(CASE WHEN stock < :crit THEN 1 ELSE 0 END) AS critical,
               SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) AS out_of_stock
        FROM latest
    """, params)[0]
    items = []
    for r in rows:
        velocity = r["units"] / velocity_days
        items.append({
            "product_id": r["product_id"], "category": r["category"], "subcategory": r["subcategory"],
            "brand": r["brand"], "current_price": _f(r["current_price"]), "stock": r["stock"],
            "snapshot_date": r["snapshot_date"].isoformat(), "units_sold": r["units"],
            "revenue": _f(r["revenue"]), "daily_velocity": velocity,
            "days_of_cover": round(r["stock"] / velocity, 1) if velocity else None,
        })
    return {"as_of": as_of.isoformat(), "velocity_days": velocity_days,
            "threshold": STOCK_CRITICAL_BELOW, "products": summary["products"] or 0,
            "critical": summary["critical"] or 0, "out_of_stock": summary["out_of_stock"] or 0,
            "items": items}


# ── K3/K4 — fulfillment ─────────────────────────────────────────────────────
def fulfillment_funnel(session: Session, window: Window | None = None) -> dict:
    where, params = _window_clause(window)
    rows = _rows(session, f"""
        SELECT delivery_status AS status, COUNT(*) AS orders,
               AVG(shipping_time_days) AS avg_ship_days
        FROM public.orders o WHERE {where} GROUP BY 1
    """, params)
    by = {r["status"]: r for r in rows}
    n = lambda s: by.get(s, {}).get("orders", 0) or 0  # noqa: E731
    total = sum(r["orders"] for r in rows)
    completed = n("DELIVERED") + n("DELAYED")
    return {
        "orders": total,
        "statuses": [{"status": s, "orders": n(s), "share": n(s) / total if total else 0.0,
                      "avg_ship_days": _f(by.get(s, {}).get("avg_ship_days"))}
                     for s in ("IN TRANSIT", "DELIVERED", "DELAYED", "RETURNED")],
        "delayed_rate": n("DELAYED") / completed if completed else 0.0,
        "return_rate": n("RETURNED") / total if total else 0.0,
        "on_time_rate": n("DELIVERED") / completed if completed else 0.0,
    }


def in_transit_ageing(session: Session, as_of) -> dict:
    rows = _rows(session, """
        SELECT CASE WHEN :as_of - order_date <= 2 THEN '0–2 days'
                    WHEN :as_of - order_date <= 6 THEN '3–6 days'
                    WHEN :as_of - order_date <= 14 THEN '7–14 days'
                    WHEN :as_of - order_date <= 30 THEN '15–30 days'
                    ELSE '30+ days' END AS bucket,
               COUNT(*) AS orders,
               SUM(CASE WHEN :as_of - order_date > shipping_time_days THEN 1 ELSE 0 END) AS past_promise
        FROM public.orders WHERE delivery_status = 'IN TRANSIT'
        GROUP BY 1
    """, {"as_of": as_of})
    order = ["0–2 days", "3–6 days", "7–14 days", "15–30 days", "30+ days"]
    rows.sort(key=lambda r: order.index(r["bucket"]))
    stale = sum(r["orders"] for r in rows if r["bucket"] == "30+ days")
    recent_late = sum(r["past_promise"] or 0 for r in rows if r["bucket"] != "30+ days")
    return {"as_of": as_of.isoformat(),
            "in_transit": sum(r["orders"] for r in rows),
            "past_promise": sum(r["past_promise"] or 0 for r in rows),
            "recent_past_promise": recent_late,
            "stale_over_30d": stale,
            "buckets": [{"bucket": r["bucket"], "orders": r["orders"],
                         "past_promise": r["past_promise"] or 0} for r in rows]}


# ── K7 — sellers in a window ────────────────────────────────────────────────
def seller_scorecard(session: Session, window: Window | None = None, limit: int = 200,
                     min_orders: int | None = None) -> dict:
    """Per seller: revenue, orders, rating, late-delivery and return rates.
    Peer percentiles (p50/p90) are computed over sellers with enough volume."""
    where, params = _window_clause(window)
    rows = _rows(session, f"""
        SELECT oi.seller_id, COUNT(DISTINCT o.order_id) AS orders, SUM(oi.final_price) AS revenue,
               AVG(oi.seller_rating_at_sale) AS avg_rating,
               SUM(CASE WHEN o.delivery_status = 'DELAYED' THEN 1 ELSE 0 END) AS delayed,
               SUM(CASE WHEN o.delivery_status IN ('DELIVERED','DELAYED') THEN 1 ELSE 0 END) AS completed,
               SUM(CASE WHEN o.delivery_status = 'RETURNED' THEN 1 ELSE 0 END) AS returned
        FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.order_id
        WHERE {where} GROUP BY oi.seller_id
    """, params)
    sellers = [{
        "seller_id": r["seller_id"], "orders": r["orders"], "revenue": _f(r["revenue"]),
        "avg_rating": _f(r["avg_rating"]),
        "delayed_rate": (r["delayed"] or 0) / r["completed"] if r["completed"] else 0.0,
        "return_rate": (r["returned"] or 0) / r["orders"] if r["orders"] else 0.0,
        "completed": r["completed"] or 0,
    } for r in rows]
    counts = sorted(s["orders"] for s in sellers)
    floor = min_orders if min_orders is not None else max(10, _pct(counts, 0.5))
    eligible = [s for s in sellers if s["orders"] >= floor]
    peers = {
        "min_orders": floor,
        "eligible_sellers": len(eligible),
        "delayed_p50": _pct(sorted(s["delayed_rate"] for s in eligible), 0.5),
        "delayed_p90": _pct(sorted(s["delayed_rate"] for s in eligible), 0.9),
        "return_p50": _pct(sorted(s["return_rate"] for s in eligible), 0.5),
        "return_p90": _pct(sorted(s["return_rate"] for s in eligible), 0.9),
    }
    # Pooled peer rates: the baseline for a significance test, so a seller with
    # 6 orders and 100% late is not flagged on noise alone.
    pooled_delayed = (sum(s["delayed_rate"] * s["completed"] for s in eligible)
                      / max(sum(s["completed"] for s in eligible), 1))
    pooled_return = (sum(s["return_rate"] * s["orders"] for s in eligible)
                     / max(sum(s["orders"] for s in eligible), 1))
    peers.update({"delayed_pooled": pooled_delayed, "return_pooled": pooled_return, "z_min": 2.0})

    def z(rate: float, base: float, n: int) -> float:
        se = math.sqrt(base * (1 - base) / n) if n and 0 < base < 1 else 0.0
        return (rate - base) / se if se else 0.0

    total = sum(s["revenue"] for s in sellers) or 1.0
    for s in sellers:
        s["revenue_share"] = s["revenue"] / total
        s["eligible"] = s["orders"] >= floor
        s["delayed_z"] = round(z(s["delayed_rate"], pooled_delayed, s["completed"]), 2)
        s["return_z"] = round(z(s["return_rate"], pooled_return, s["orders"]), 2)
        s["flags"] = [f for f, cond in (
            ("late_deliveries", s["eligible"] and s["delayed_rate"] > peers["delayed_p90"]
             and s["delayed_z"] >= 2.0),
            ("returns", s["eligible"] and s["return_rate"] > peers["return_p90"]
             and s["return_z"] >= 2.0),
        ) if cond]
    sellers.sort(key=lambda s: s["revenue"], reverse=True)
    return {"sellers_total": len(sellers), "peers": peers, "sellers": sellers[:limit]}


def _pct(sorted_values: list, q: float):
    if not sorted_values:
        return 0
    idx = min(len(sorted_values) - 1, max(0, math.ceil(q * len(sorted_values)) - 1))
    return sorted_values[idx]


def city_scorecard(session: Session, window: Window | None = None) -> list[dict]:
    where, params = _window_clause(window)
    rows = _rows(session, f"""
        SELECT o.ship_to_city AS city, COUNT(DISTINCT o.order_id) AS orders, SUM(oi.final_price) AS revenue,
               SUM(CASE WHEN o.delivery_status = 'DELAYED' THEN 1 ELSE 0 END) AS delayed,
               SUM(CASE WHEN o.delivery_status IN ('DELIVERED','DELAYED') THEN 1 ELSE 0 END) AS completed,
               SUM(CASE WHEN o.delivery_status = 'RETURNED' THEN 1 ELSE 0 END) AS returned
        FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.order_id
        WHERE {where} GROUP BY 1 ORDER BY revenue DESC
    """, params)
    return [{"city": r["city"], "orders": r["orders"], "revenue": _f(r["revenue"]),
             "delayed_rate": (r["delayed"] or 0) / r["completed"] if r["completed"] else 0.0,
             "return_rate": (r["returned"] or 0) / r["orders"] if r["orders"] else 0.0}
            for r in rows]


def daily_revenue(session: Session, window: Window) -> list[dict]:
    rows = _rows(session, """
        SELECT o.order_date AS date, COUNT(DISTINCT o.order_id) AS orders, SUM(oi.final_price) AS revenue
        FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.order_id
        WHERE o.order_date BETWEEN :prev_start AND :end GROUP BY 1 ORDER BY 1
    """, window.params)
    return [{"date": r["date"].isoformat(), "orders": r["orders"], "revenue": _f(r["revenue"]),
             "period": "current" if r["date"] >= window.start else "previous"} for r in rows]
