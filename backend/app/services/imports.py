"""Bulk CSV import: a marketplace export → validated, idempotent append.

The file has the same 20 columns as the source dataset (business-model §6).
Every row is checked by the Great Expectations import contract
(governance/contracts.py, business-model rules R1–R7); a broken row is
rejected and kept with the rule it broke (it is never silently dropped).
Accepted rows are written in ONE transaction: customers, sellers and
products are upserted, an inventory snapshot is stored, and each row
becomes one order with one order line, exactly like the seed.

Idempotency: each row has a fingerprint (``source_hash``), the md5 of its
canonical form. The seed computes the same fingerprint in SQL
(scripts/seed/ingest.py), so re-uploading rows that are already in the
books — from the original CSV or a previous import — adds nothing.
"""
from __future__ import annotations

import csv
import datetime
import hashlib
import io
from collections import Counter
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

import pandas as pd
from sqlalchemy import func, insert, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from backend.app.governance import engine as governance
from backend.app.models.entities import (
    CATEGORIES,
    DELIVERY_STATUSES,
    DEVICES,
    FINAL_PRICE_TOLERANCE,
    PAYMENT_METHODS,
    AuditLog,
    Customer,
    ImportBatch,
    ImportRejection,
    Inventory,
    Order,
    OrderItem,
    Product,
    Seller,
)

COLUMNS = (
    "user_id", "product_id", "category", "subcategory", "brand", "price", "discount",
    "final_price", "rating", "review_count", "stock", "seller_id", "seller_rating",
    "purchase_date", "shipping_time_days", "location", "device", "payment_method",
    "is_returned", "delivery_status",
)
REQUIRED = tuple(c for c in COLUMNS if c != "is_returned")
#: Earliest valid order date (business-model R7).
MIN_DATE = datetime.date(2024, 3, 31)
MAX_BYTES = 50 * 1024 * 1024
MAX_STORED_REJECTIONS = 500

RULES = {
    "R0 columns": "The file is missing required columns",
    "R1 required": "A required field is empty",
    "R1 type": "A field has the wrong type",
    "R4 final_price": "final_price ≠ price × (1 − discount/100) within ±₹5.00",
    "R5 enum": "A value is outside the allowed list",
    "R6 range": "A number is outside its allowed range",
    "R7 date": "The date is before 2024-03-31 or in the future",
}

TEMPLATE_ROWS = [
    ["U900001", "P900001", "Electronics", "Mobile", "Samsung", "24999.00", "10.00", "22499.10",
     "4.3", "120", "42", "S9001", "4.6", "2026-04-02", "3", "Delhi", "Mobile App", "UPI",
     "0", "In Transit"],
    ["U900002", "P900002", "Home", "Kitchen", "Prestige", "1899.00", "25.00", "1424.25",
     "4.1", "58", "15", "S9002", "4.2", "2026-04-02", "5", "Mumbai", "Web", "Cash on Delivery",
     "0", "Delivered"],
]


def template_csv() -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(COLUMNS)
    w.writerows(TEMPLATE_ROWS)
    return buf.getvalue()


def _money(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def fingerprint(row: dict) -> str:
    """Canonical md5 of a validated row. MUST match the seed's SQL:
    md5(concat_ws('|', user_id, product_id, seller_id, purchase_date, price,
    discount, final_price, location, payment_method, device,
    shipping_time_days, delivery_status))."""
    parts = [
        row["user_id"], row["product_id"], row["seller_id"], row["purchase_date"].isoformat(),
        _money(row["price"]), _money(row["discount"]), _money(row["final_price"]),
        row["location"], row["payment_method"], row["device"],
        str(row["shipping_time_days"]), row["delivery_status"],
    ]
    return hashlib.md5("|".join(parts).encode("utf-8")).hexdigest()  # noqa: S324 — fingerprint, not security


class Rejected(Exception):
    def __init__(self, rule: str, message: str):
        super().__init__(message)
        self.rule, self.message = rule, message


def _dec(raw: dict, key: str) -> Decimal:
    try:
        return Decimal(raw[key].strip())
    except (InvalidOperation, AttributeError) as e:
        raise Rejected("R1 type", f"{key} is not a number: {raw[key]!r}") from e


def _int(raw: dict, key: str) -> int:
    d = _dec(raw, key)
    if d != d.to_integral_value():
        raise Rejected("R1 type", f"{key} must be a whole number: {raw[key]!r}")
    return int(d)


def validate(raw: dict, today: datetime.date) -> dict:
    """One raw CSV row → a typed, normalized row, or raise Rejected(rule, message)."""
    for key in REQUIRED:
        if raw.get(key) is None or not str(raw[key]).strip():
            raise Rejected("R1 required", f"{key} is empty")
    try:
        date = datetime.date.fromisoformat(raw["purchase_date"].strip()[:10])
    except ValueError as e:
        raise Rejected("R1 type", f"purchase_date is not YYYY-MM-DD: {raw['purchase_date']!r}") from e
    price = _dec(raw, "price").quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    discount = _dec(raw, "discount").quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    final_price = _dec(raw, "final_price").quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    rating = _dec(raw, "rating").quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    seller_rating = _dec(raw, "seller_rating").quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    review_count, stock = _int(raw, "review_count"), _int(raw, "stock")
    shipping = _int(raw, "shipping_time_days")

    status = raw["delivery_status"].strip().upper()
    category = raw["category"].strip()
    payment, device = raw["payment_method"].strip(), raw["device"].strip()
    for value, allowed, name in ((status, DELIVERY_STATUSES, "delivery_status"),
                                 (category, CATEGORIES, "category"),
                                 (payment, PAYMENT_METHODS, "payment_method"),
                                 (device, DEVICES, "device")):
        if value not in allowed:
            raise Rejected("R5 enum", f"{name} {value!r} is not one of {', '.join(allowed)}")

    for ok, msg in ((price > 0, "price must be > 0"),
                    (Decimal(0) <= discount <= Decimal(70), "discount must be 0–70"),
                    (final_price >= 0, "final_price must be ≥ 0"),
                    (Decimal(0) <= rating <= Decimal(5), "rating must be 0–5"),
                    (Decimal(0) <= seller_rating <= Decimal(5), "seller_rating must be 0–5"),
                    (review_count >= 0, "review_count must be ≥ 0"),
                    (0 <= stock <= 500, "stock must be 0–500"),
                    (1 <= shipping <= 6, "shipping_time_days must be 1–6")):
        if not ok:
            raise Rejected("R6 range", msg)

    expected = (price * (1 - discount / 100)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if abs(final_price - expected) > Decimal(str(FINAL_PRICE_TOLERANCE)):
        raise Rejected("R4 final_price", f"final_price {final_price} ≠ expected {expected} (±₹5.00)")
    if date < MIN_DATE or date > today:
        raise Rejected("R7 date", f"purchase_date {date} is outside {MIN_DATE} … {today}")

    return {
        "user_id": raw["user_id"].strip(), "product_id": raw["product_id"].strip(),
        "seller_id": raw["seller_id"].strip(), "category": category,
        "subcategory": raw["subcategory"].strip(), "brand": raw["brand"].strip(),
        "price": price, "discount": discount, "final_price": final_price, "rating": rating,
        "review_count": review_count, "stock": stock, "seller_rating": seller_rating,
        "purchase_date": date, "shipping_time_days": shipping, "location": raw["location"].strip(),
        "device": device, "payment_method": payment, "delivery_status": status,
    }


def create_batch(session: Session, filename: str) -> ImportBatch:
    batch = ImportBatch(filename=filename[:200] or "upload.csv", status="processing")
    session.add(batch)
    session.commit()
    session.refresh(batch)
    return batch


def _latest_per(rows: list[dict], key) -> list[dict]:
    """Keep the most recent row per key (an upsert may not touch a row twice)."""
    best: dict = {}
    for r in rows:
        k = key(r)
        if k not in best or r["purchase_date"] >= best[k]["purchase_date"]:
            best[k] = r
    return list(best.values())


def process(session: Session, batch_id: int, data: bytes,
            today: datetime.date | None = None) -> ImportBatch:
    """Validate and append one CSV. Records the outcome on the batch row."""
    today = today or datetime.date.today()
    batch = session.get(ImportBatch, batch_id)
    try:
        try:
            frame = pd.read_csv(io.BytesIO(data), dtype=str, keep_default_na=False,
                                encoding="utf-8-sig", skipinitialspace=True)
        except (ValueError, UnicodeDecodeError, pd.errors.ParserError) as e:
            raise Rejected("R0 columns", f"not a readable CSV: {str(e)[:200]}") from e
        frame.columns = [str(c).strip() for c in frame.columns]
        missing = [c for c in REQUIRED if c not in frame.columns]
        if missing:
            raise Rejected("R0 columns", f"missing columns: {', '.join(missing)}")
        frame.insert(0, "line_no", range(2, len(frame) + 2))

        # Gate: the Great Expectations import contract (governance/contracts.py).
        gate = governance.validate_import(frame, today)
        failures = gate["row_failures"]

        accepted: list[dict] = []
        rejections: list[tuple[int, str, str, dict]] = []
        by_rule: Counter = Counter()
        seen: set[str] = set()
        duplicates = 0
        total = len(frame)
        for raw in frame.to_dict(orient="records"):
            line_no = int(raw.pop("line_no"))
            failure = failures.get(line_no)
            try:
                if failure:
                    rule, why, column, value = failure
                    raise Rejected(rule, f"{why} ({column} = {value!r})" if column else why)
                row = validate(raw, today)  # typed conversion; re-checks as a safety net
            except Rejected as r:
                by_rule[r.rule] += 1
                if len(rejections) < MAX_STORED_REJECTIONS:
                    rejections.append((line_no, r.rule, r.message,
                                       {k: raw.get(k) for k in COLUMNS if k in raw}))
                continue
            row["source_hash"] = fingerprint(row)
            if row["source_hash"] in seen:
                duplicates += 1
                continue
            seen.add(row["source_hash"])
            accepted.append(row)

        # Rows already in the books (seed or a previous import) are duplicates.
        if accepted:
            existing: set[str] = set()
            hashes = [r["source_hash"] for r in accepted]
            for i in range(0, len(hashes), 5000):
                existing.update(session.execute(
                    select(Order.source_hash).where(Order.source_hash.in_(hashes[i:i + 5000]))
                ).scalars())
            duplicates += sum(1 for r in accepted if r["source_hash"] in existing)
            accepted = [r for r in accepted if r["source_hash"] not in existing]

        if accepted:
            _write(session, accepted)
        for line_no, rule, message, raw in rejections:
            session.add(ImportRejection(batch_id=batch_id, line_no=line_no, rule=rule,
                                        message=message, raw=raw))
        batch.rows_total = total
        batch.rows_accepted = len(accepted)
        batch.rows_duplicate = duplicates
        batch.rows_rejected = sum(by_rule.values())
        batch.rejections_by_rule = dict(by_rule.most_common())
        batch.first_order_date = min((r["purchase_date"] for r in accepted), default=None)
        batch.last_order_date = max((r["purchase_date"] for r in accepted), default=None)
        batch.revenue_added = float(sum((r["final_price"] for r in accepted), Decimal(0)))
        batch.governance = {k: v for k, v in gate["summary"].items()}
        batch.status = "completed"
        session.add(AuditLog(table_name="import_batches", row_pk=str(batch_id), action="insert",
                             actor="import",
                             details={"accepted": len(accepted), "duplicates": duplicates,
                                      "rejected": batch.rows_rejected}))
    except Rejected as r:
        session.rollback()
        batch = session.get(ImportBatch, batch_id)
        batch.status, batch.error = "failed", r.message
        batch.rejections_by_rule = {r.rule: 1}
    except Exception as e:  # noqa: BLE001 — record any failure on the batch, never 500 silently
        session.rollback()
        batch = session.get(ImportBatch, batch_id)
        batch.status, batch.error = "failed", f"{type(e).__name__}: {str(e)[:300]}"
    batch.finished_at = datetime.datetime.now(datetime.UTC)
    session.commit()
    session.refresh(batch)
    return batch


def _write(session: Session, rows: list[dict]) -> None:
    """Append accepted rows in the caller's transaction (FK-safe order)."""
    first_date: dict[str, datetime.date] = {}
    city: dict[str, str] = {}
    for r in sorted(rows, key=lambda r: r["purchase_date"]):
        first_date.setdefault(r["user_id"], r["purchase_date"])
        city.setdefault(r["user_id"], r["location"])  # home city = city of first order
    stmt = pg_insert(Customer)
    session.execute(stmt.on_conflict_do_update(
        index_elements=[Customer.customer_id],
        set_={"first_purchase_date": func.least(Customer.first_purchase_date,
                                                stmt.excluded.first_purchase_date)}),
        [{"customer_id": k, "home_city": city[k], "first_purchase_date": v}
         for k, v in first_date.items()])

    sellers = _latest_per(rows, lambda r: r["seller_id"])
    stmt = pg_insert(Seller)
    session.execute(stmt.on_conflict_do_update(
        index_elements=[Seller.seller_id], set_={"current_rating": stmt.excluded.current_rating}),
        [{"seller_id": r["seller_id"], "current_rating": r["seller_rating"]} for r in sellers])

    products = _latest_per(rows, lambda r: r["product_id"])
    stmt = pg_insert(Product)
    session.execute(stmt.on_conflict_do_update(
        index_elements=[Product.product_id],
        set_={"current_price": stmt.excluded.current_price,
              "product_rating": stmt.excluded.product_rating,
              "review_count": stmt.excluded.review_count}),
        [{"product_id": r["product_id"], "category": r["category"], "subcategory": r["subcategory"],
          "brand": r["brand"], "current_price": r["price"], "product_rating": r["rating"],
          "review_count": r["review_count"]} for r in products])

    snaps = _latest_per(rows, lambda r: (r["product_id"], r["purchase_date"]))
    stmt = pg_insert(Inventory)
    session.execute(stmt.on_conflict_do_update(
        constraint="uq_inventory_product_date", set_={"stock": stmt.excluded.stock}),
        [{"product_id": r["product_id"], "snapshot_date": r["purchase_date"], "stock": r["stock"]}
         for r in snaps])

    order_rows = session.execute(
        insert(Order).returning(Order.order_id, sort_by_parameter_order=True),
        [{"customer_id": r["user_id"], "order_date": r["purchase_date"], "ship_to_city": r["location"],
          "payment_method": r["payment_method"], "device": r["device"],
          "delivery_status": r["delivery_status"], "shipping_time_days": r["shipping_time_days"],
          "source_hash": r["source_hash"]} for r in rows],
    ).scalars().all()
    session.execute(insert(OrderItem), [
        {"order_id": oid, "product_id": r["product_id"], "seller_id": r["seller_id"], "quantity": 1,
         "unit_price": r["price"], "discount_pct": r["discount"], "final_price": r["final_price"],
         "seller_rating_at_sale": r["seller_rating"]}
        for oid, r in zip(order_rows, rows, strict=True)
    ])


def batch_dict(batch: ImportBatch) -> dict:
    return {
        "batch_id": batch.batch_id, "filename": batch.filename, "status": batch.status,
        "rows_total": batch.rows_total, "rows_accepted": batch.rows_accepted,
        "rows_duplicate": batch.rows_duplicate, "rows_rejected": batch.rows_rejected,
        "rejections_by_rule": batch.rejections_by_rule or {},
        "first_order_date": batch.first_order_date.isoformat() if batch.first_order_date else None,
        "last_order_date": batch.last_order_date.isoformat() if batch.last_order_date else None,
        "revenue_added": float(batch.revenue_added or 0), "error": batch.error,
        "governance": batch.governance,
        "created_at": batch.created_at.isoformat() if batch.created_at else None,
        "finished_at": batch.finished_at.isoformat() if batch.finished_at else None,
    }


def latest_batch(session: Session) -> dict | None:
    batch = session.execute(
        select(ImportBatch).order_by(ImportBatch.batch_id.desc()).limit(1)
    ).scalar()
    return batch_dict(batch) if batch else None


def rejections(session: Session, batch_id: int, limit: int = 100) -> list[dict]:
    rows = session.execute(
        select(ImportRejection).where(ImportRejection.batch_id == batch_id)
        .order_by(ImportRejection.line_no).limit(limit)
    ).scalars()
    return [{"line_no": r.line_no, "rule": r.rule, "rule_label": RULES.get(r.rule, r.rule),
             "message": r.message, "raw": r.raw} for r in rows]
