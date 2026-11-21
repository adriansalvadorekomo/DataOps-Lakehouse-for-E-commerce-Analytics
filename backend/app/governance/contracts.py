"""Data contracts as code — Great Expectations suites (docs/product.md § Data governance).

Two contracts, one rule vocabulary (business-model R1–R7, plus R8 hygiene):

* ``IMPORT_CONTRACT`` gates every uploaded CSV row before it can reach the
  books (services/imports.py). Its row-level failures become the rejection
  report a user sees.
* ``BOOKS_CONTRACT`` describes the live PostgreSQL books, one suite per
  table plus query checks for cross-table rules. A governance run validates
  it and stores the outcome (governance/engine.py).

Each expectation carries ``meta.rule`` (the business-model rule it enforces),
``meta.severity`` (``critical`` blocks trust; ``warning`` is reported) and a
plain-language ``meta.why`` shown in the UI.

Expectations are plain dicts here, so this module imports without Great
Expectations; engine.py turns them into ``gx.expectations.*`` objects.
"""
from __future__ import annotations

import datetime

from backend.app.models.entities import CATEGORIES, DELIVERY_STATUSES, DEVICES, PAYMENT_METHODS

MIN_DATE = datetime.date(2024, 3, 31)


def E(kind: str, rule: str, why: str, severity: str = "critical", **kwargs) -> dict:  # noqa: N802
    return {"type": kind, "kwargs": kwargs, "meta": {"rule": rule, "severity": severity, "why": why}}


# ── the import contract (pandas, one row per CSV line) ──────────────────────
# Derived columns (``*_num``, ``status_norm``, ``final_price_deviation``,
# ``days_from_min``, ``days_to_today``) are computed in engine.frame_for_import().
def import_contract(today: datetime.date) -> list[dict]:
    required = ("user_id", "product_id", "category", "subcategory", "brand", "seller_id",
                "purchase_date", "location", "device", "payment_method", "delivery_status",
                "price", "discount", "final_price", "rating", "review_count", "stock",
                "seller_rating", "shipping_time_days")
    numeric = ("price", "discount", "final_price", "rating", "review_count", "stock",
               "seller_rating", "shipping_time_days")
    out = [E("ExpectColumnValuesToNotBeNull", "R1 required", f"{c} must be filled in", column=c)
           for c in required]
    out += [E("ExpectColumnValuesToNotBeNull", "R1 type", f"{c} must be a number", column=f"{c}_num")
            for c in numeric]
    out += [
        E("ExpectColumnValuesToNotBeNull", "R1 type", "purchase_date must be a YYYY-MM-DD date",
          column="purchase_date_parsed"),
        E("ExpectColumnValuesToMatchRegex", "R1 type", "Counts must be whole numbers",
          column="review_count", regex=r"^\s*\d+(\.0+)?\s*$"),
        E("ExpectColumnValuesToMatchRegex", "R1 type", "Stock must be a whole number",
          column="stock", regex=r"^\s*\d+(\.0+)?\s*$"),
        E("ExpectColumnValuesToMatchRegex", "R1 type", "Shipping time must be whole days",
          column="shipping_time_days", regex=r"^\s*\d+(\.0+)?\s*$"),
        E("ExpectColumnValuesToBeInSet", "R5 enum", "Delivery status must be a lifecycle state",
          column="status_norm", value_set=list(DELIVERY_STATUSES)),
        E("ExpectColumnValuesToBeInSet", "R5 enum", "Category must be one of the five categories",
          column="category", value_set=list(CATEGORIES)),
        E("ExpectColumnValuesToBeInSet", "R5 enum", "Payment method must be a supported method",
          column="payment_method", value_set=list(PAYMENT_METHODS)),
        E("ExpectColumnValuesToBeInSet", "R5 enum", "Device must be Mobile App, Web or Tablet",
          column="device", value_set=list(DEVICES)),
        E("ExpectColumnValuesToBeBetween", "R6 range", "Price must be positive",
          column="price_num", min_value=0.01),
        E("ExpectColumnValuesToBeBetween", "R6 range", "Discount is seller-funded and capped at 70%",
          column="discount_num", min_value=0, max_value=70),
        E("ExpectColumnValuesToBeBetween", "R6 range", "final_price cannot be negative",
          column="final_price_num", min_value=0),
        E("ExpectColumnValuesToBeBetween", "R6 range", "Product rating is 0–5",
          column="rating_num", min_value=0, max_value=5),
        E("ExpectColumnValuesToBeBetween", "R6 range", "Seller rating is 0–5",
          column="seller_rating_num", min_value=0, max_value=5),
        E("ExpectColumnValuesToBeBetween", "R6 range", "Review count cannot be negative",
          column="review_count_num", min_value=0),
        E("ExpectColumnValuesToBeBetween", "R6 range", "Stock is 0–500 units",
          column="stock_num", min_value=0, max_value=500),
        E("ExpectColumnValuesToBeBetween", "R6 range", "Shipping promise is 1–6 days",
          column="shipping_time_days_num", min_value=1, max_value=6),
        E("ExpectColumnValuesToBeBetween", "R4 final_price",
          "final_price must equal price × (1 − discount/100) within ±₹5.00",
          column="final_price_deviation", max_value=5.0),
        E("ExpectColumnValuesToBeBetween", "R7 date",
          f"Orders start on {MIN_DATE.isoformat()} and cannot be in the future",
          column="days_from_min", min_value=0),
        E("ExpectColumnValuesToBeBetween", "R7 date", "Orders cannot be dated in the future",
          column="days_to_today", min_value=0),
    ]
    return out


#: Rule precedence when one row breaks several expectations (first wins).
RULE_ORDER = ("R1 required", "R1 type", "R5 enum", "R6 range", "R4 final_price", "R7 date")


# ── the books contract (PostgreSQL, validated in place) ─────────────────────
def books_contract(today: datetime.date) -> dict[str, dict]:
    """asset name → {"table" | "query", "expectations": [...]}"""
    ids = lambda col: [  # noqa: E731
        E("ExpectColumnValuesToNotBeNull", "R1 null keys", f"Every row needs a {col}", column=col),
        E("ExpectColumnValuesToBeUnique", "R2 unique", f"{col} identifies exactly one row", column=col),
    ]
    return {
        "customers": {"table": "customers", "expectations": ids("customer_id") + [
            E("ExpectColumnValuesToNotBeNull", "R1 null keys", "Every customer has a home city",
              column="home_city"),
        ]},
        "sellers": {"table": "sellers", "expectations": ids("seller_id") + [
            E("ExpectColumnValuesToBeBetween", "R6 range", "Seller rating is 0–5",
              column="current_rating", min_value=0, max_value=5),
        ]},
        "products": {"table": "products", "expectations": ids("product_id") + [
            E("ExpectColumnValuesToBeInSet", "R5 enum", "Category is one of the five categories",
              column="category", value_set=list(CATEGORIES)),
            E("ExpectColumnValuesToBeBetween", "R6 range", "Price is positive",
              column="current_price", min_value=0.01),
            E("ExpectColumnValuesToBeBetween", "R6 range", "Product rating is 0–5",
              column="product_rating", min_value=0, max_value=5),
        ]},
        "inventory": {"table": "inventory", "expectations": [
            E("ExpectCompoundColumnsToBeUnique", "R2 unique", "One stock snapshot per product per day",
              column_list=["product_id", "snapshot_date"]),
            E("ExpectColumnValuesToBeBetween", "R6 range", "Stock is 0–500 units",
              column="stock", min_value=0, max_value=500),
        ]},
        "orders": {"table": "orders", "expectations": ids("order_id") + [
            E("ExpectColumnValuesToNotBeNull", "R1 null keys", "Every order belongs to a customer",
              column="customer_id"),
            E("ExpectColumnValuesToBeInSet", "R5 enum",
              "Delivery status is IN TRANSIT, DELIVERED, DELAYED or RETURNED",
              column="delivery_status", value_set=list(DELIVERY_STATUSES)),
            E("ExpectColumnValuesToBeInSet", "R5 enum", "Payment method is supported",
              column="payment_method", value_set=list(PAYMENT_METHODS)),
            E("ExpectColumnValuesToBeInSet", "R5 enum", "Device is Mobile App, Web or Tablet",
              column="device", value_set=list(DEVICES)),
            E("ExpectColumnValuesToBeBetween", "R6 range", "Shipping promise is 1–6 days",
              column="shipping_time_days", min_value=1, max_value=6),
            E("ExpectColumnValuesToBeBetween", "R7 date", "Order dates fall inside the business window",
              column="order_date", min_value=MIN_DATE.isoformat(), max_value=today.isoformat()),
        ]},
        "order_items": {"table": "order_items", "expectations": [
            E("ExpectColumnValuesToNotBeNull", "R1 null keys", "Every line has a product",
              column="product_id"),
            E("ExpectColumnValuesToNotBeNull", "R1 null keys", "Every line has a seller",
              column="seller_id"),
            E("ExpectColumnValuesToBeBetween", "R6 range", "Quantity is at least 1",
              column="quantity", min_value=1),
            E("ExpectColumnValuesToBeBetween", "R6 range", "Discount is 0–70%",
              column="discount_pct", min_value=0, max_value=70),
            E("ExpectColumnValuesToBeBetween", "R6 range", "Unit price is positive",
              column="unit_price", min_value=0.01),
        ]},
        "money_invariant": {
            "query": "SELECT order_item_id, ABS(final_price - ROUND(unit_price * quantity "
                     "* (1 - discount_pct / 100), 2)) AS deviation FROM public.order_items",
            "expectations": [E("ExpectColumnValuesToBeBetween", "R4 final_price",
                               "final_price = unit_price × qty × (1 − discount/100) within ±₹5.00",
                               column="deviation", max_value=5.0)],
        },
        "orphans": {
            "query": "SELECT 'order_items→orders' AS link FROM public.order_items oi "
                     "WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.order_id = oi.order_id) "
                     "UNION ALL SELECT 'order_items→products' FROM public.order_items oi "
                     "WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.product_id = oi.product_id) "
                     "UNION ALL SELECT 'order_items→sellers' FROM public.order_items oi "
                     "WHERE NOT EXISTS (SELECT 1 FROM public.sellers s WHERE s.seller_id = oi.seller_id) "
                     "UNION ALL SELECT 'orders→customers' FROM public.orders o "
                     "WHERE NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.customer_id = o.customer_id)",
            "expectations": [E("ExpectTableRowCountToEqual", "R3 foreign keys",
                               "Every order line points to an existing order, product and seller",
                               value=0)],
        },
        "stale_in_transit": {
            "query": "SELECT order_id FROM public.orders WHERE delivery_status = 'IN TRANSIT' "
                     "AND (SELECT MAX(order_date) FROM public.orders) - order_date > 30",
            "expectations": [E("ExpectTableRowCountToEqual", "R8 lifecycle hygiene",
                               "No order stays 'in transit' for more than 30 days (promise is 1–6)",
                               severity="warning", value=0)],
        },
    }
