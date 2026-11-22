"""Assistant interactions + feedback (replays 010_ai_feedback.sql)."""
from __future__ import annotations

import importlib
from pathlib import Path

from alembic import op

revision = "0006_ai_feedback"
down_revision = "0005_governance"
branch_labels = None
depends_on = None

MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "database" / "migrations"


def upgrade() -> None:
    v1 = importlib.import_module("backend.alembic.versions.0001_initial")
    conn = op.get_bind()
    sql = (MIGRATIONS_DIR / "010_ai_feedback.sql").read_text(encoding="utf-8")
    for stmt in v1._split_statements(sql):
        conn.exec_driver_sql(stmt.replace("%", "%%"))


def downgrade() -> None:
    op.get_bind().exec_driver_sql("DROP TABLE IF EXISTS public.ai_interactions CASCADE;")
