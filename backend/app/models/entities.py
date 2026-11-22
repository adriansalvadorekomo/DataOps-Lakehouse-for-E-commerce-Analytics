"""OLTP models — mirror of database/migrations/002 (+005 audit_log, 008 imports).

Source of truth for values: docs/business-model.md §2–§3.
Any schema change here MUST ship with an Alembic revision AND the equivalent
SQL in database/migrations/ (both runners produce the same schema).
"""
from __future__ import annotations

import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.core.db import Base

# Contract enums (business-model §2–§3). Single home for Python-side values.
DELIVERY_STATUSES = ("IN TRANSIT", "DELIVERED", "DELAYED", "RETURNED")
TERMINAL_STATUSES = ("DELIVERED", "DELAYED", "RETURNED")
PAYMENT_METHODS = ("UPI", "Credit Card", "Debit Card", "Cash on Delivery")
DEVICES = ("Mobile App", "Web", "Tablet")
CATEGORIES = ("Electronics", "Home", "Sports", "Beauty", "Clothing")

#: Money invariant tolerance — business-model §6.
FINAL_PRICE_TOLERANCE = 5.00


class Customer(Base):
    __tablename__ = "customers"

    customer_id: Mapped[str] = mapped_column(Text, primary_key=True)
    home_city: Mapped[str] = mapped_column(Text, nullable=False)
    first_purchase_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class Seller(Base):
    __tablename__ = "sellers"

    seller_id: Mapped[str] = mapped_column(Text, primary_key=True)
    current_rating: Mapped[float] = mapped_column(Numeric(2, 1), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint("current_rating >= 0.0 AND current_rating <= 5.0", name="sellers_rating_range"),
    )


class Product(Base):
    __tablename__ = "products"

    product_id: Mapped[str] = mapped_column(Text, primary_key=True)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    subcategory: Mapped[str] = mapped_column(Text, nullable=False)
    brand: Mapped[str] = mapped_column(Text, nullable=False)
    current_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    product_rating: Mapped[float] = mapped_column(Numeric(2, 1), nullable=False)
    review_count: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "category IN ('Electronics', 'Home', 'Sports', 'Beauty', 'Clothing')",
            name="products_category_enum",
        ),
        CheckConstraint("current_price > 0", name="products_price_positive"),
        CheckConstraint(
            "product_rating >= 0.0 AND product_rating <= 5.0", name="products_rating_range"
        ),
        CheckConstraint("review_count >= 0", name="products_review_count_nonneg"),
        Index("idx_products_category", "category"),
        Index("idx_products_brand", "brand"),
    )


class Inventory(Base):
    __tablename__ = "inventory"

    inventory_id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    product_id: Mapped[str] = mapped_column(
        Text, ForeignKey("products.product_id"), nullable=False
    )
    snapshot_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    stock: Mapped[int] = mapped_column(nullable=False)

    __table_args__ = (
        CheckConstraint("stock >= 0 AND stock <= 500", name="inventory_stock_range"),
        UniqueConstraint("product_id", "snapshot_date", name="uq_inventory_product_date"),
        Index("idx_inventory_product_date", "product_id", "snapshot_date"),
    )


class Order(Base):
    __tablename__ = "orders"

    order_id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    customer_id: Mapped[str] = mapped_column(
        Text, ForeignKey("customers.customer_id"), nullable=False
    )
    order_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    ship_to_city: Mapped[str] = mapped_column(Text, nullable=False)
    payment_method: Mapped[str] = mapped_column(Text, nullable=False)
    device: Mapped[str] = mapped_column(Text, nullable=False)
    delivery_status: Mapped[str] = mapped_column(Text, nullable=False)
    shipping_time_days: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    #: md5 of the canonical source row (seed + CSV imports); see services/imports.py.
    source_hash: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "payment_method IN ('UPI', 'Credit Card', 'Debit Card', 'Cash on Delivery')",
            name="orders_payment_enum",
        ),
        CheckConstraint(
            "device IN ('Mobile App', 'Web', 'Tablet')", name="orders_device_enum"
        ),
        CheckConstraint(
            "delivery_status IN ('IN TRANSIT', 'DELIVERED', 'DELAYED', 'RETURNED')",
            name="orders_delivery_status_enum",
        ),
        CheckConstraint(
            "shipping_time_days BETWEEN 1 AND 6", name="orders_shipping_days_range"
        ),
        Index("idx_orders_customer", "customer_id"),
        Index("idx_orders_date", "order_date"),
        Index("idx_orders_status", "delivery_status"),
        Index("idx_orders_city", "ship_to_city"),
        Index("idx_orders_date_status", "order_date", "delivery_status"),
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    order_item_id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    order_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("orders.order_id"), nullable=False
    )
    product_id: Mapped[str] = mapped_column(
        Text, ForeignKey("products.product_id"), nullable=False
    )
    seller_id: Mapped[str] = mapped_column(
        Text, ForeignKey("sellers.seller_id"), nullable=False
    )
    quantity: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default=text("1"))
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    discount_pct: Mapped[float] = mapped_column(
        Numeric(4, 2), nullable=False, server_default=text("0")
    )
    final_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    seller_rating_at_sale: Mapped[float] = mapped_column(Numeric(2, 1), nullable=False)
    #: As sold (011_sale_attributes.sql): in the source these vary per sale, not per product.
    category: Mapped[str | None] = mapped_column(Text, nullable=True)
    subcategory: Mapped[str | None] = mapped_column(Text, nullable=True)
    brand: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint("quantity >= 1", name="order_items_quantity_min"),
        CheckConstraint("unit_price > 0", name="order_items_unit_price_positive"),
        CheckConstraint(
            "discount_pct >= 0 AND discount_pct <= 70", name="order_items_discount_range"
        ),
        CheckConstraint("final_price >= 0", name="order_items_final_price_nonneg"),
        CheckConstraint(
            "seller_rating_at_sale >= 0.0 AND seller_rating_at_sale <= 5.0",
            name="order_items_seller_rating_range",
        ),
        # Money invariant — business-model §6 (±₹5.00).
        CheckConstraint(
            "abs(final_price - round(unit_price * quantity * (1 - discount_pct / 100), 2)) <= 5.00",
            name="chk_order_items_final_price",
        ),
        Index("idx_order_items_order", "order_id"),
        Index("idx_order_items_product", "product_id"),
        Index("idx_order_items_seller", "seller_id"),
    )


class AuditLog(Base):
    """Append-only audit trail (Phase 4 contract: atomic transitions + audit).

    One row per state-changing operation, written in the SAME transaction as
    the change — a rollback erases both, so the log never claims uncommitted work.
    """

    __tablename__ = "audit_log"

    audit_id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    actor: Mapped[str] = mapped_column(String(64), nullable=False, server_default=text("'api'"))
    table_name: Mapped[str] = mapped_column(Text, nullable=False)
    row_pk: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "action IN ('insert', 'update', 'delete')", name="audit_log_action_enum"
        ),
        Index("idx_audit_table_row", "table_name", "row_pk"),
        Index("idx_audit_at", "at"),
    )


class RevenueForecast(Base):
    """Batch daily-revenue forecasts (Phase 8). RF ships, Prophet second opinion."""

    __tablename__ = "revenue_forecasts"

    forecast_id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    asof_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    target_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    model: Mapped[str] = mapped_column(Text, nullable=False)
    horizon_d: Mapped[int] = mapped_column(nullable=False)
    yhat: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint("model IN ('rf', 'prophet')", name="forecasts_model_enum"),
        CheckConstraint("horizon_d >= 1", name="forecasts_horizon_min"),
        CheckConstraint("yhat >= 0", name="forecasts_yhat_nonneg"),
        UniqueConstraint("model", "target_date", name="uq_forecast_model_target"),
        Index("idx_forecasts_target", "target_date"),
    )


class Document(Base):
    """User-attached business document (bytes in UC Volume, registry here)."""

    __tablename__ = "documents"

    document_id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int] = mapped_column(nullable=False)
    volume_path: Mapped[str | None] = mapped_column(Text, unique=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'uploaded'"))
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class DocumentChunk(Base):
    """Text chunk + local embedding for grounded retrieval."""

    __tablename__ = "document_chunks"

    chunk_id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    document_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("documents.document_id", ondelete="CASCADE"), nullable=False
    )
    chunk_index: Mapped[int] = mapped_column(nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    __table_args__ = (
        CheckConstraint("chunk_index >= 0", name="chunks_index_nonneg"),
        UniqueConstraint("document_id", "chunk_index", name="uq_chunk_doc_idx"),
        Index("idx_chunks_document", "document_id"),
    )


class ImportBatch(Base):
    """One uploaded CSV (008_imports.sql): what came in, what was kept, and why not."""

    __tablename__ = "import_batches"

    batch_id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'processing'"))
    rows_total: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))
    rows_accepted: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))
    rows_duplicate: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))
    rows_rejected: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))
    rejections_by_rule: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    first_order_date: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    last_order_date: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    revenue_added: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False, server_default=text("0"))
    #: Great Expectations import-contract summary (governance/contracts.py).
    governance: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    finished_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('processing', 'completed', 'failed')", name="import_batches_status_enum"
        ),
    )


class ImportRejection(Base):
    __tablename__ = "import_rejections"

    rejection_id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    batch_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("import_batches.batch_id", ondelete="CASCADE"), nullable=False
    )
    line_no: Mapped[int] = mapped_column(nullable=False)
    rule: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    raw: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class GovernanceRun(Base):
    """One validation of the books contract with Great Expectations (009_governance.sql)."""

    __tablename__ = "governance_runs"

    run_id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    trigger: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'running'"))
    evaluated: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))
    successful: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))
    critical_failures: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))
    warnings: Mapped[int] = mapped_column(nullable=False, server_default=text("0"))
    results: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    finished_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('running', 'passed', 'warning', 'failed', 'error')",
            name="governance_runs_status_enum",
        ),
        CheckConstraint(
            "trigger IN ('api', 'cli', 'import', 'ci')", name="governance_runs_trigger_enum"
        ),
    )


class AiInteraction(Base):
    """One assistant answer and its human rating (010_ai_feedback.sql)."""

    __tablename__ = "ai_interactions"

    interaction_id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    mode: Mapped[str] = mapped_column(Text, nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    intent: Mapped[str | None] = mapped_column(Text, nullable=True)
    sources: Mapped[list] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    latency_ms: Mapped[int | None] = mapped_column(nullable=True)
    rating: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    rated_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint("mode IN ('data', 'docs')", name="ai_interactions_mode_enum"),
        CheckConstraint("rating IS NULL OR rating IN (-1, 1)", name="ai_interactions_rating_enum"),
    )
