"""Bulk CSV imports: batches, rejections, orders.source_hash (replays 008_imports.sql)."""
from __future__ import annotations

import importlib
from pathlib import Path

from alembic import op

revision = "0004_imports"
down_revision = "0003_documents"
branch_labels = None
depends_on = None

MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "database" / "migrations"


def upgrade() -> None:
    v1 = importlib.import_module("backend.alembic.versions.0001_initial")
    conn = op.get_bind()
    sql = (MIGRATIONS_DIR / "008_imports.sql").read_text(encoding="utf-8")
    for stmt in v1._split_statements(sql):
        conn.exec_driver_sql(stmt.replace("%", "%%"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.exec_driver_sql("DROP TABLE IF EXISTS public.import_rejections CASCADE;")
    conn.exec_driver_sql("DROP TABLE IF EXISTS public.import_batches CASCADE;")
    conn.exec_driver_sql("DROP INDEX IF EXISTS public.idx_orders_source_hash;")
    conn.exec_driver_sql("ALTER TABLE public.orders DROP COLUMN IF EXISTS source_hash;")
