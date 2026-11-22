"""Entity profiles (seller, product, customer) and the ⌘K search.

Each profile answers "who is this and how are they doing?": identity,
lifetime KPIs, the latest window vs peers, a monthly series, and recent
orders. Everything is computed live from PostgreSQL.
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.services.analytics import STOCK_CRITICAL_BELOW, _f, _rows
from backend.app.services.period import latest_order_date

_RECENT_ORDERS = """
    SELECT o.order_id, o.order_date, o.customer_id, o.ship_to_city, o.delivery_status,
           oi.product_id, oi.seller_id, oi.final_price, oi.discount_pct
    FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.order_id
    WHERE {where} ORDER BY o.order_date DESC, o.order_id DESC LIMIT 12
"""

_MONTHLY = """
    SELECT date_trunc('month', o.order_date)::date AS month,
           COUNT(DISTINCT o.order_id) AS orders, SUM(oi.final_price) AS revenue
    FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.order_id
    WHERE {where} GROUP BY 1 ORDER BY 1 DESC LIMIT 12
"""

_KPIS = """
    SELECT COUNT(DISTINCT o.order_id) AS orders, COALESCE(SUM(oi.final_price), 0) AS revenue,
           SUM(CASE WHEN o.delivery_status = 'DELAYED' THEN 1 ELSE 0 END) AS delayed,
           SUM(CASE WHEN o.delivery_status IN ('DELIVERED','DELAYED') THEN 1 ELSE 0 END) AS completed,
           SUM(CASE WHEN o.delivery_status = 'RETURNED' THEN 1 ELSE 0 END) AS returned,
           MIN(o.order_date) AS first_order, MAX(o.order_date) AS last_order
    FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.order_id
    WHERE {where}
"""


def _kpis(session: Session, where: str, params: dict) -> dict:
    r = _rows(session, _KPIS.format(where=where), params)[0]
    orders = r["orders"] or 0
    return {
        "orders": orders, "revenue": _f(r["revenue"]),
        "aov": _f(r["revenue"]) / orders if orders else 0.0,
        "delayed_rate": (r["delayed"] or 0) / r["completed"] if r["completed"] else 0.0,
        "return_rate": (r["returned"] or 0) / orders if orders else 0.0,
        "first_order": r["first_order"].isoformat() if r["first_order"] else None,
        "last_order": r["last_order"].isoformat() if r["last_order"] else None,
    }


def _series(session: Session, where: str, params: dict) -> list[dict]:
    rows = _rows(session, _MONTHLY.format(where=where), params)
    rows.reverse()
    return [{"month": r["month"].isoformat()[:7], "orders": r["orders"], "revenue": _f(r["revenue"])}
            for r in rows]


def _recent(session: Session, where: str, params: dict) -> list[dict]:
    return [{**r, "order_date": r["order_date"].isoformat(), "final_price": _f(r["final_price"]),
             "discount_pct": _f(r["discount_pct"])}
            for r in _rows(session, _RECENT_ORDERS.format(where=where), params)]


def seller_profile(session: Session, seller_id: str) -> dict | None:
    seller = _rows(session, "SELECT seller_id, current_rating FROM public.sellers WHERE seller_id = :id",
                   {"id": seller_id})
    if not seller:
        return None
    p = {"id": seller_id}
    where = "oi.seller_id = :id"
    top = _rows(session, """
        SELECT oi.product_id, MODE() WITHIN GROUP (ORDER BY oi.category) AS category,
               MODE() WITHIN GROUP (ORDER BY oi.brand) AS brand, COUNT(*) AS lines, SUM(oi.final_price) AS revenue
        FROM public.order_items oi
        WHERE oi.seller_id = :id GROUP BY 1 ORDER BY revenue DESC LIMIT 5
    """, p)
    cats = _rows(session, """
        SELECT oi.category, SUM(oi.final_price) AS revenue
        FROM public.order_items oi
        WHERE oi.seller_id = :id GROUP BY 1 ORDER BY revenue DESC
    """, p)
    return {
        "seller_id": seller_id, "current_rating": _f(seller[0]["current_rating"]),
        "lifetime": _kpis(session, where, p), "monthly": _series(session, where, p),
        "top_products": [{**t, "revenue": _f(t["revenue"])} for t in top],
        "categories": [{"category": c["category"], "revenue": _f(c["revenue"])} for c in cats],
        "recent_orders": _recent(session, where, p),
    }


def product_profile(session: Session, product_id: str) -> dict | None:
    prod = _rows(session, """
        SELECT product_id, category, subcategory, brand, current_price, product_rating, review_count
        FROM public.products WHERE product_id = :id
    """, {"id": product_id})
    if not prod:
        return None
    p = {"id": product_id}
    where = "oi.product_id = :id"
    stock = _rows(session, """
        SELECT snapshot_date, stock FROM public.inventory WHERE product_id = :id
        ORDER BY snapshot_date DESC LIMIT 24
    """, p)
    stock.reverse()
    as_of = latest_order_date(session)
    sold30 = _rows(session, """
        SELECT COALESCE(SUM(oi.quantity), 0) AS units FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.order_id
        WHERE oi.product_id = :id AND o.order_date > :as_of - 30 AND o.order_date <= :as_of
          AND o.delivery_status <> 'RETURNED'
    """, {**p, "as_of": as_of})[0]["units"] if as_of else 0
    latest = stock[-1]["stock"] if stock else None
    velocity = (sold30 or 0) / 30
    sellers = _rows(session, """
        SELECT oi.seller_id, COUNT(*) AS lines, SUM(oi.final_price) AS revenue
        FROM public.order_items oi WHERE oi.product_id = :id GROUP BY 1 ORDER BY revenue DESC LIMIT 5
    """, p)
    base = prod[0]
    return {
        **{k: (_f(v) if k in ("current_price", "product_rating") else v) for k, v in base.items()},
        "latest_stock": latest, "stock_critical": latest is not None and latest < STOCK_CRITICAL_BELOW,
        "units_sold_30d": sold30, "days_of_cover": round(latest / velocity, 1) if velocity and latest is not None else None,
        "stock_history": [{"date": s["snapshot_date"].isoformat(), "stock": s["stock"]} for s in stock],
        "lifetime": _kpis(session, where, p), "monthly": _series(session, where, p),
        "sellers": [{**s, "revenue": _f(s["revenue"])} for s in sellers],
        "recent_orders": _recent(session, where, p),
    }


def customer_profile(session: Session, customer_id: str) -> dict | None:
    cust = _rows(session, """
        SELECT customer_id, home_city, first_purchase_date FROM public.customers WHERE customer_id = :id
    """, {"id": customer_id})
    if not cust:
        return None
    p = {"id": customer_id}
    where = "o.customer_id = :id"
    life = _kpis(session, where, p)
    as_of = latest_order_date(session)
    gap = None
    segment = "one_time"
    days_since = None
    if life["last_order"] and as_of:
        import datetime

        last = datetime.date.fromisoformat(life["last_order"])
        first = datetime.date.fromisoformat(life["first_order"])
        days_since = (as_of - last).days
        if life["orders"] > 1:
            gap = (last - first).days / (life["orders"] - 1)
            floor = max(gap, 7)
            segment = "at_risk" if days_since > 2 * floor else "cooling" if days_since > floor else "active"
    cats = _rows(session, """
        SELECT oi.category, SUM(oi.final_price) AS revenue FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.order_id
        WHERE o.customer_id = :id GROUP BY 1 ORDER BY revenue DESC
    """, p)
    c = cust[0]
    return {
        "customer_id": c["customer_id"], "home_city": c["home_city"],
        "first_purchase_date": c["first_purchase_date"].isoformat(),
        "lifetime": life, "segment": segment, "days_since_last_order": days_since,
        "avg_gap_days": round(gap, 1) if gap is not None else None,
        "categories": [{"category": x["category"], "revenue": _f(x["revenue"])} for x in cats],
        "recent_orders": _recent(session, where, p),
    }


def search(session: Session, q: str, limit: int = 6) -> list[dict]:
    """Prefix search over business ids (U…, S…, P…) and order numbers."""
    q = q.strip()
    if not q:
        return []
    like = q.upper() + "%"
    out: list[dict] = []
    for kind, sql in (
        ("seller", "SELECT seller_id AS id, 'rated ' || current_rating || ' / 5' AS hint FROM public.sellers "
                   "WHERE seller_id LIKE :like ORDER BY length(seller_id), seller_id LIMIT :limit"),
        ("product", "SELECT product_id AS id, brand || ' · ' || category AS hint FROM public.products "
                    "WHERE product_id LIKE :like ORDER BY length(product_id), product_id LIMIT :limit"),
        ("customer", "SELECT customer_id AS id, home_city AS hint FROM public.customers "
                     "WHERE customer_id LIKE :like ORDER BY length(customer_id), customer_id LIMIT :limit"),
    ):
        out.extend({"kind": kind, **r} for r in session.execute(
            text(sql), {"like": like, "limit": limit}).mappings())
    digits = q.lstrip("#")
    if digits.isdigit():
        row = session.execute(text(
            "SELECT order_id AS id, delivery_status AS hint FROM public.orders WHERE order_id = :id"),
            {"id": int(digits)}).mappings().first()
        if row:
            out.insert(0, {"kind": "order", "id": str(row["id"]), "hint": row["hint"]})
    return out
