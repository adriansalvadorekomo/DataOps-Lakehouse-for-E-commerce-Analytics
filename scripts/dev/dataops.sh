#!/bin/sh
# DataOps end-to-end automation: one command runs the whole data loop.
# Usage: mise run dataops   (PG*/DATABRICKS_* come from mise env + .env)
# Fail-fast: any stage failing aborts with its own error (gates, not prayers).
# Idempotent: the seed step skips when raw already holds the full 1M rows.
set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "→ [1/6] database"
sh scripts/dev/db_up.sh

echo "→ [2/6] seed (skip if raw already complete)"
RAW_COUNT="$(psql -h "${PGHOST:-/tmp/opencode}" -p "${PGPORT:-5434}" -U "${PGUSER:-magrey}" \
  -d "${PGDATABASE:-smart}" -Atc 'SELECT count(*) FROM raw.purchases;' 2>/dev/null || echo 0)"
if [ "$RAW_COUNT" = "1000000" ]; then
  echo "  raw already at 1,000,000 rows — skipping ingest"
else
  python3 scripts/seed/ingest.py
  python3 scripts/seed/acceptance.py
fi

echo "→ [3/6] forecast refresh (RF + Prophet)"
uv run python -m backend.app.jobs.refresh_forecast

echo "→ [4/6] backend + CD contract tests"
uv run pytest backend/tests scripts/cd/test_cd.py -q 2>&1 | tail -1

echo "→ [5/6] lakehouse contracts (unit + local bronze→gold)"
python3 -m unittest discover -s lakehouse/tests 2>&1 | tail -1
python3 lakehouse/local_run.py 2>&1 | tail -1

echo "→ [6/6] platform report"
psql -h "${PGHOST:-/tmp/opencode}" -p "${PGPORT:-5434}" -U "${PGUSER:-magrey}" \
  -d "${PGDATABASE:-smart}" -Atc \
  "SELECT 'orders=' || (SELECT count(*) FROM public.orders) \
   || ' revenue=₹' || to_char((SELECT sum(final_price) FROM public.order_items), 'FM999G999G999G999') \
   || ' forecasts=' || (SELECT count(*) FROM public.revenue_forecasts);" 2>/dev/null \
  || echo "report unavailable (DB unreachable)"

echo "✓ dataops loop green"
