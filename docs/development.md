# Development

This document explains how to set up the development environment, run the tests, understand the repository structure, and contribute changes.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Python | 3.12 | Backend, lakehouse logic, seed scripts |
| Node.js | 22+ | Frontend build |
| uv | 0.5.x | Python package management |
| mise | 2026.1.0+ | Task runner |
| Git | any | Version control |

Optional (needed for Databricks tasks):
- Databricks CLI (for `dbx-*` tasks that call it directly)
- Terraform (for `tf-*` tasks; `mise run tf-validate` can install it via hashicorp's GitHub Action in CI)

You do not need Docker for local development. Docker is used only by the CD smoke test.

---

## First-time setup

```bash
# Clone the repo
git clone https://github.com/adriansalvadorekomo/smart-erp-dataopts.git
cd smart-erp-dataopts

# Install Python dependencies
uv sync

# Install frontend dependencies
npm ci --prefix frontend

# Start the full stack
mise run dev
```

`mise run dev` will:
1. Install an embedded Postgres (using `pgserver`) into `~/.local/share/smart-erp-pgvenv/` if not present
2. Initialize a Postgres cluster at `~/.local/share/smart-erp-pgdata/` on first run
3. Start Postgres on socket `/tmp/opencode:5434`
4. Create the `magrey` role and `smart` database if they don't exist
5. Apply all 7 migrations idempotently
6. Start the FastAPI backend at `http://localhost:8000`
7. Start the Vite frontend at `http://localhost:5173`

Each step waits for the previous one before proceeding.

Verify everything is working:

```bash
curl localhost:8000/health
# {"status":"ok","db":"up"}
```

Open `http://localhost:5173` in a browser.

---

## Loading the dataset

The dashboard shows empty charts until the dataset is loaded.

1. Download or locate the source CSV (`amazon_ecommerce_1M.csv`, 133 MB)
2. Place it at `data/amazon-e-commerce/amazon_ecommerce_1M.csv`
3. Run:

```bash
mise run seed
```

This ingests all 1,000,000 rows and runs the acceptance checks. Expect 3–5 minutes. After it completes, the dashboard shows real data.

The seed is idempotent — re-running it re-ingests from scratch (full refresh, ~3.5 minutes). `mise run dataops` skips re-ingestion if the row count is already 1,000,000.

---

## Repository structure

```
smart-erp/
│
├── database/                    PostgreSQL migrations
│   ├── migrations/001–007.sql   Applied in order by apply.sh
│   ├── apply.sh                 Idempotent migration runner
│   └── README.md                Migration descriptions + invariants
│
├── scripts/
│   ├── seed/                    CSV ingestion + acceptance checks
│   │   ├── ingest.py            CSV → raw → staging → 6 normalized tables
│   │   └── acceptance.py        Post-ingest validation (counts, money, orphans)
│   ├── cd/                      CD scripts (no daemon, no secrets in code)
│   │   ├── deploy_job.py        Reset Databricks job + sync Repos branch
│   │   ├── databricks_release.py  Trigger medallion job, poll for result
│   │   ├── dbx_validate.py      Gold contract check via SQL warehouse
│   │   └── test_cd.py           CD contract tests (no credentials)
│   └── dev/                     Local dev helpers
│       ├── db_up.sh             Self-healing embedded Postgres bootstrap
│       ├── up_all.sh            Start full stack in order
│       └── dataops.sh           Full DataOps loop
│
├── backend/
│   └── app/
│       ├── api/                 HTTP routers (orders, stats, assistant, documents)
│       ├── services/            Business logic (orders, stats, forecast, assistant, RAG, Genie)
│       ├── models/              SQLAlchemy ORM models
│       ├── schemas/             Pydantic request/response schemas
│       ├── core/                Config (env-driven), DB session factory
│       └── jobs/                Background jobs (refresh_forecast.py)
│   ├── tests/                   pytest test suite (36 tests)
│   └── alembic/                 Alembic migrations (3 versions: initial, forecasts, documents)
│
├── frontend/src/
│   ├── pages/                   Dashboard pages (Overview, Orders, Sales, Sellers, ...)
│   ├── components/              Reusable UI components (AppShell, PageHeader, ...)
│   ├── lib/                     API client (api.ts), utilities, constants
│   └── index.css                Global styles (Geist + Instrument Serif)
│
├── lakehouse/
│   ├── src/
│   │   ├── bronze/              Bronze layer logic (ingest.py, schema, watermark)
│   │   ├── silver/              Silver layer logic (transform.py, enums, money invariant)
│   │   ├── gold/                Gold layer logic (models.py, KPI builders)
│   │   ├── quality/             DQ rules R1–R9 (rules.py, runner.py)
│   │   └── common/              Shared config (catalog, schema paths)
│   ├── notebooks/               01–04 Databricks notebooks + 05 ML training
│   ├── sql/gold/                Gold mart SQL (4 files run by sql_refresh task)
│   ├── workflows/               smart_erp_job.json (job definition)
│   ├── tests/                   27 unit tests (stdlib unittest, no cluster)
│   └── local_run.py             Local end-to-end mirror (no cluster, no credentials)
│
├── infra/
│   ├── terraform/               Workspace provisioning (schemas, volumes, job)
│   └── docker-compose.yml       Full stack for CD smoke test
│
├── ml/                          Revenue forecast scripts, churn feasibility analysis
├── bi/                          Databricks SQL dashboard exports + query files
├── notebooks/                   EDA + modeling Jupyter notebooks
├── docs/                        All documentation
├── mise.toml                    Task runner (18 tasks, PG defaults, .env auto-load)
├── pyproject.toml               Python project + dependencies (managed by uv)
└── .github/workflows/           CI (ci.yml) + CD (cd.yml) + release (release.yml)
```

---

## Running tests

### Backend tests

```bash
mise run test-backend
# runs: uv run pytest backend/tests scripts/cd/test_cd.py -q
```

The backend tests use a real Postgres instance (the local dev database). They apply Alembic migrations to a throwaway database (`smart_test`) and run 36 tests covering:
- Orders API: create, list, filter, status transition lifecycle
- Stats API: overview, revenue trend, category breakdown, seller performance
- Forecast service: model training and reading
- Assistant: intent matching, cited answers
- Documents API: upload, list, delete
- RAG: document chunking, search
- CD contracts: Gold math, job translation, compose/workflow sanity

Requires `mise run dev-db` to be running (or `PG*` env vars pointing at a live instance).

### Lakehouse unit tests

```bash
python -m unittest discover -s lakehouse/tests
```

27 tests covering all 9 DQ rules, all Silver transforms, and the Gold model builders. Pure Python — no Spark, no cluster, no credentials.

### Local end-to-end mirror

```bash
python lakehouse/local_run.py
# LOCAL RUN PASSED — bronze → silver → DQ → gold path verified
```

Runs the full Bronze → Silver → DQ gate → Gold pipeline on sample data (100 rows). Same logic as the Databricks notebooks — same rule implementations, same transform functions.

---

## Environment variables

All configuration is env-driven. There are no secrets in code.

| Variable | Default (mise.toml) | Description |
|---|---|---|
| `PGHOST` | `/tmp/opencode` | Postgres socket dir or hostname |
| `PGPORT` | `5434` | Postgres port |
| `PGUSER` | `magrey` | Postgres user |
| `PGPASSWORD` | (empty) | Postgres password |
| `PGDATABASE` | `smart` | Postgres database |
| `DATABRICKS_HOST` | (none) | Workspace URL (needs `.env`) |
| `DATABRICKS_TOKEN` | (none) | PAT (needs `.env`) |
| `WAREHOUSE_ID` | (none) | SQL warehouse ID (needs `.env`) |
| `LAKEHOUSE_CATALOG` | (none) | Catalog name, e.g. `workspace` |

Override any variable in `.env` (auto-loaded by mise) or by exporting in your shell before running a task. Explicit env vars always win over the `mise.toml` defaults.

For tests, the backend reads `PG*` from the environment. In CI, these are set in the GitHub Actions job env. Locally, they come from `mise.toml` defaults.

---

## Adding a migration

Database migrations live in `database/migrations/`. They are applied in filename order by `database/apply.sh`.

1. Create `database/migrations/008_<description>.sql`
2. Write idempotent SQL (use `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, etc.)
3. Test it:

```bash
# Apply against the local database
PGHOST=/tmp/opencode PGPORT=5434 PGUSER=magrey PGDATABASE=smart ./database/apply.sh
```

4. Update `database/README.md` with the migration description
5. If the migration adds an Alembic-tracked table, also add an Alembic version in `backend/alembic/versions/`

The CI `database-sanity` job applies all migrations against a fresh Postgres container on every PR — it will catch a broken migration immediately.

---

## Contributing

### Branching model

Smart-ERP uses Trunk-Based Development. See [docs/branching-strategy.md](branching-strategy.md) for the full contract.

Short version:
- Branch off `main`: `feat/phase-slug`, `fix/slug`, `chore/slug`
- Keep branches short-lived (hours to a day or two)
- Open a PR — CI runs automatically
- Squash-merge after CI passes and one reviewer approves

```bash
git checkout main && git pull
git switch -c feat/11-<your-feature>
# ... make changes ...
git add -A && git commit -m "feat(11): your change"
git push -u origin feat/11-<your-feature>
# open PR on GitHub
```

### Before opening a PR

```bash
uv lock                     # keep lockfile in sync
mise run test-backend       # run all tests
python -m unittest discover -s lakehouse/tests   # lakehouse unit tests
python lakehouse/local_run.py                    # end-to-end mirror
```

If you changed the frontend:
```bash
cd frontend && npx tsc -b && npm run build
```

### What CI checks

Every PR runs 10 CI jobs (see [docs/operations.md](operations.md) for the full list). The most important things CI will catch that are easy to miss locally:

- Lockfile drift (`uv lock --check`) — run `uv lock` if you added a dependency
- Gold SQL boundary violations — Gold must only read from `silver.*` or `gold.*`, never from `public.*` or `raw.*`
- `estimated_` margin prefix — CI fails if `fact_sales.sql` doesn't label the margin column correctly
- Frontend TypeScript errors — `tsc -b` runs in CI even if `vite dev` ignores type errors

---

## Adding a new API endpoint

1. Add the business logic to the appropriate service in `backend/app/services/`
2. Add the HTTP handler to the appropriate router in `backend/app/api/`
3. Add tests in `backend/tests/` — follow the pattern in `test_stats.py` or `test_orders_api.py`
4. If the endpoint exposes new data, add a corresponding answer path in `backend/app/services/assistant.py`

The assistant is deterministic — it matches intent keywords and dispatches to services. Adding a new service without wiring it into the assistant means the `/ai/ask` endpoint can't answer questions about it.

### Service pattern

Services are plain Python functions over a SQLAlchemy session:

```python
def my_aggregation(session: Session) -> dict:
    result = session.execute(select(func.count()).select_from(Order)).scalar()
    return {"count": result}
```

No business rules in routers. No direct SQL in routers. Routers translate HTTP requests/responses; services own the logic.

---

## Common development commands

```bash
# Start everything from scratch
mise run dev

# Stop everything
mise run stop-all

# Run all tests
mise run test-backend

# Run just lakehouse tests
python -m unittest discover -s lakehouse/tests -v

# Check what a specific test covers
uv run pytest backend/tests/test_stats.py -v

# Check the API manually
curl localhost:8000/stats/overview | python3 -m json.tool
curl -X POST localhost:8000/ai/ask \
  -H 'Content-Type: application/json' \
  -d '{"question": "total revenue"}' | python3 -m json.tool

# Run the full DataOps loop
mise run dataops

# Refresh revenue forecasts
mise run forecast
```

---

## Where to go next

- System architecture: [docs/architecture.md](architecture.md)
- Running and monitoring: [docs/operations.md](operations.md)
- Branching and CI: [docs/branching-strategy.md](branching-strategy.md)
- Data pipeline internals: [docs/data-engineering.md](data-engineering.md)
