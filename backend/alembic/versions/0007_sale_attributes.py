"""Category, subcategory and brand as sold, on order_items (replays 011_sale_attributes.sql)."""
from __future__ import annotations

import importlib
from pathlib import Path

from alembic import op

revision = "0007_sale_attributes"
down_revision = "0006_ai_feedback"
branch_labels = None
depends_on = None

MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "database" / "migrations"


def upgrade() -> None:
    v1 = importlib.import_module("backend.alembic.versions.0001_initial")
    conn = op.get_bind()
    sql = (MIGRATIONS_DIR / "011_sale_attributes.sql").read_text(encoding="utf-8")
    for stmt in v1._split_statements(sql):
        conn.exec_driver_sql(stmt.replace("%", "%%"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.exec_driver_sql("ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_category_enum;")
    for col in ("category", "subcategory", "brand"):
        conn.exec_driver_sql(f"ALTER TABLE public.order_items DROP COLUMN IF EXISTS {col};")
