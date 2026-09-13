# Operations

This document covers running, monitoring, and troubleshooting the system. For architecture, see [docs/architecture.md](architecture.md). For the data pipeline internals, see [docs/data-engineering.md](data-engineering.md).

---

## Task runner reference

All operations go through `mise`. Every task inherits `.env` automatically — set your credentials there once and every task picks them up.

```bash
mise run help    # list all tasks
```

### Local stack

| Task | What it does |
|---|---|
| `mise run dev` | Start the full stack: Postgres → backend :8000 → frontend :5173 (in order, each waits for the prior) |
| `mise run stop-all` | Stop frontend, backend, and Postgres |
| `mise run dev-db` | Start Postgres only (run before `dev-backend` if starting pieces separately) |
| `mise run dev-backend` | Start the FastAPI backend on :8000 |
| `mise run dev-frontend` | Start the Vite dashboard on :5173 |

`mise run dev` is the recommended way to start everything. It refuses to start if `:8000` or `:5173` are already occupied (run `stop-all` first).

Logs land in `logs/dev-backend.log` and `logs/dev-frontend.log`.

### Data operations

| Task | What it does |
|---|---|
| `mise run seed` | Ingest the 1M CSV into Postgres + run acceptance checks |
| `mise run forecast` | Retrain RF + Prophet, update `revenue_forecasts` table |
| `mise run dataops` | Full DataOps loop: db → seed → forecast → tests → lakehouse → report |
| `mise run test-backend` | Backend pytest suite (36 tests) |

### Databricks

| Task | What it does |
|---|---|
| `mise run dbx-status` | Workspace snapshot: auth, medallion job name, landing volume listing (read-only) |
| `mise run dbx-upload` | Upload the 1M CSV to the landing volume (~7 min, idempotent) |
| `mise run dbx-validate` | Gold contract check on the warehouse: counts + revenue (read-only) |

### Terraform

| Task | What it does |
|---|---|
| `mise run tf-validate` | `terraform init -backend=false && terraform validate` (no credentials) |
| `mise run tf-plan` | Plan against the workspace (needs `DATABRICKS_*`) |
| `mise run tf-apply` | Apply to the workspace (needs `DATABRICKS_*`; review the plan first) |

### CD

| Task | What it does |
|---|---|
| `mise run cd-dispatch` | Manually trigger the CD workflow on `main` |
| `mise run databricks-release` | Deploy job JSON + run medallion + validate Gold (needs `DATABRICKS_*`) |

---

## Environment setup

### Local `.env`

Create `.env` in the repo root (git-ignored). `mise` loads it automatically for all tasks.

```bash
# PostgreSQL — overrides mise.toml defaults
PGHOST=/tmp/opencode
PGPORT=5434
PGUSER=magrey
PGPASSWORD=
PGDATABASE=smart

# Databricks — needed for dbx-* and tf-* tasks
DATABRICKS_HOST=https://dbc-cba3c27a-ade0.cloud.databricks.com
DATABRICKS_TOKEN=<your-personal-access-token>

# Databricks job / validation
WAREHOUSE_ID=7a0f4f9c083ec2c4
LAKEHOUSE_CATALOG=workspace
```

The `PG*` variables have defaults in `mise.toml` — you only need to set them in `.env` if your machine uses different values. The Databricks variables have no defaults and must be set to use any `dbx-*` or `tf-*` task.

### Required for Databricks tasks

A personal access token with scopes: `jobs`, `files`, `sql`. Generate it in the workspace UI under Settings → Developer → Access tokens.

---

## Running the full DataOps loop

`mise run dataops` runs the complete data loop in one command:

```
→ [1/6] database     Postgres up, migrated, role + DB ensured
→ [2/6] seed         1M rows present → skipped; else ingest + acceptance checks
→ [3/6] forecast     RF + Prophet retrained, revenue_forecasts updated
→ [4/6] tests        36 backend tests + 4 CD contract tests
→ [5/6] lakehouse    27 unit tests (no cluster) + local Bronze→Silver→DQ→Gold
→ [6/6] report       orders count, total revenue, forecast row count
✓ dataops loop green
```

Each stage fails fast (`set -e`). A failure in any stage aborts the loop and prints the stage name. The seed step is idempotent — it skips ingestion if `raw.purchases` already has exactly 1,000,000 rows.

---

## CI/CD pipeline

### CI (`ci.yml`) — runs on every PR and push to `main`

10 jobs, all required to pass:

| Job | What it checks | Fails on |
|---|---|---|
| `lockfile` | `uv lock --check` — lockfile matches `pyproject.toml` | Dependency drift |
| `lint` | Python byte-compile + import graph | Syntax errors |
| `lakehouse-test` | 27 unit tests + `local_run.py` + Workflows JSON validation | Broken transforms/rules/job order |
| `sql-parse` | Gold SQL reads only `silver.*` / `gold.*`, never OLTP/raw; `estimated_` margin label present | Medallion boundary violation |
| `terraform-validate` | `terraform init -backend=false && terraform validate` | Invalid workspace assets |
| `database-sanity` | Apply all 7 migrations against throwaway Postgres; assert core tables + invariant constraints | Broken migration |
| `backend-test` | Alembic migrate + 36 pytest tests against throwaway Postgres | API contract violation |
| `frontend-build` | `npm ci + tsc -b + vite build` | TypeScript errors, build failure |
| `seed-acceptance-note` | `docs/business-model.md` has `final_price`; `README.md` has `lakehouse` | Doc contract drift |
| `delivery-checks` | CD contract tests (Gold math, job-JSON translation, compose/workflow sanity) | Broken delivery path |

CI never touches credentials, never deploys to Databricks, and never pushes images. Its only job is to keep `main` always valid.

### CD (`cd.yml`) — runs on `v*` tags and manual dispatch

3 jobs, sequential:

**Job 1: Build + push images**

Builds the backend and frontend Docker images and pushes them to GHCR. Tags: `:vX.Y.Z` (on `v*` tags) and `:latest`. Manual dispatches build but do not push.

**Job 2: Compose smoke**

Brings up the full stack from source using `infra/docker-compose.yml`. Waits for:
- Backend `/health` → `{"status":"ok","db":"up"}`
- Frontend nginx → HTTP 200
- Proxied API `/api/health` → `{"db":"up"}`

The backend entrypoint runs Alembic migrations before starting uvicorn — a broken migration fails here, not in production.

Tears down with `docker compose down -v` whether it passes or fails.

**Job 3: Databricks — deploy + run + validate**

Runs in the `databricks-prod` GitHub Environment (required reviewers recommended). Concurrency group `databricks-workspace` serializes runs (Free Edition supports one concurrent job).

Steps:
1. `python3 scripts/cd/deploy_job.py` — sends `jobs/reset` with the latest `smart_erp_job.json` definition, then syncs the workspace Repos checkout to the release branch
2. `python3 scripts/cd/databricks_release.py` — triggers `smart-erp-medallion`, polls for completion (breaks on TERMINATED, INTERNAL_ERROR, SKIPPED), validates Gold counts + revenue

The CD pipeline produces a fully deployed, validated system: images on GHCR, migrations applied, Databricks lakehouse green.

### GitHub Environment setup (one-time)

In the repo Settings → Environments → `databricks-prod`:

| Type | Name | Value |
|---|---|---|
| Secret | `DATABRICKS_HOST` | Workspace URL |
| Secret | `DATABRICKS_TOKEN` | PAT (scopes: `jobs`, `files`, `sql`) |
| Variable | `WAREHOUSE_ID` | SQL warehouse ID |

---

## Monitoring

### Is the backend healthy?

```bash
curl localhost:8000/health
# {"status":"ok","db":"up"}    ← healthy
# {"status":"degraded","db":"down"}  ← DB unreachable
```

### Is the lakehouse current?

```bash
mise run dbx-validate
# bronze=1000000 orders=1000000 fact=1000000 revenue=₹9,938,876,984.90 → PASS
```

### What is the current workspace state?

```bash
mise run dbx-status
# Shows: auth context, medallion job name, landing volume contents
```

### Are the API endpoints responding?

```bash
curl localhost:8000/stats/overview | python3 -m json.tool
# {"total_orders": 1000000, "revenue": 9938876984.9, ...}
```

### Check DQ status via the assistant

```bash
curl -s -X POST localhost:8000/ai/ask \
  -H 'Content-Type: application/json' \
  -d '{"question": "data quality"}' | python3 -m json.tool
# {"answer": "DQ gate green — all R1–R7 checks pass over live data.", ...}
```

---

## Troubleshooting

### Backend returns 500 on all endpoints

**Likely cause:** Postgres is not running or the backend has wrong PG credentials.

```bash
# Check what the backend is connecting to
curl localhost:8000/health
# If {"status":"degraded","db":"down"}: Postgres is unreachable

# Start Postgres
mise run dev-db

# Verify it's running
pg_isready -h /tmp/opencode -p 5434
# /tmp/opencode:5434 - accepting connections
```

If `pg_isready` fails after `mise run dev-db`, check `~/.local/share/smart-erp-pgdata/` exists and `~/.local/share/smart-erp-pgvenv/bin/python` is executable.

### Port already in use when starting backend

```bash
mise run stop-all    # kills existing processes
mise run dev         # start fresh
```

If `stop-all` says it stopped everything but the port is still occupied:

```bash
# Find the process holding :8000
lsof -i :8000
# or
fuser 8000/tcp
# Kill it
kill -9 <pid>
```

### Databricks job fails with INTERNAL_ERROR

Check the failed step logs:

```bash
gh run view <run-id> --log-failed 2>&1 | grep -iE "error|fail|message" | head -20
```

Common causes and fixes:

| Symptom | Cause | Fix |
|---|---|---|
| `HTTP 400: INVALID_PARAMETER_VALUE environment_key` | SQL task has `environment_key` (only notebooks can have it) | Already fixed in `deploy_job.py` — re-deploy |
| `sql_refresh` fails on stale SQL | Repos checkout on wrong branch | `deploy_job.py` now syncs the branch after reset |
| Timeout during polling | `wait_run()` only recognizing `TERMINATED` | Already fixed — now breaks on `INTERNAL_ERROR` too |
| DQ gate fails | Silver data has violations | Check `dq_gate` notebook output in Workspace UI |

### DQ gate fails in the lakehouse job

The DQ gate prints a violation report before failing. Find it in the Databricks Workflows run:

1. Go to workspace → Jobs → `smart-erp-medallion` → most recent run
2. Click `dq_gate` task → View output
3. Look for lines like `R4 order_items row 5: final_price invariant violated`

R4 violations usually mean the source data was re-generated with different rounding. R7 violations mean rows outside the 2024-03-31 → 2026-03-31 window. R8 violations mean the revenue total doesn't reconcile — check if Bronze was reset correctly before the full-load.

### Frontend shows blank data / network errors

```bash
# Check that the backend is running and proxying correctly
curl localhost:5173/api/health
# {"status":"ok","db":"up"}

# If that fails, check nginx proxy config
cat frontend/nginx.conf
```

In development (Vite), the proxy is configured in `frontend/vite.config.ts`. In production (Docker), it's `frontend/nginx.conf`. Both proxy `/api` to the backend.

### Terraform apply fails

```bash
mise run tf-plan     # review what would change before applying
```

If the plan shows recreation of resources that already exist (schemas, volumes), it may be a provider drift issue. The `databricks_job` resource uses `lifecycle { ignore_changes = [task] }` — task definition drift is managed by `deploy_job.py`, not Terraform. Re-applying a schema that already exists is safe (it's a no-op for `databricks_schema` resources).

---

## Deployment: first-time workspace setup

If you are deploying to a fresh Databricks workspace:

```bash
# 1. Set credentials
export DATABRICKS_HOST=<workspace-url>
export DATABRICKS_TOKEN=<pat>
export LAKEHOUSE_CATALOG=workspace

# 2. Provision workspace assets (schemas, volumes, job)
mise run tf-apply

# 3. Upload the source CSV to the landing volume
mise run dbx-upload     # ~7 minutes

# 4. Deploy the job definition from the versioned JSON
python3 scripts/cd/deploy_job.py --branch main

# 5. Run the full medallion pipeline
python3 scripts/cd/databricks_release.py

# 6. Validate Gold
mise run dbx-validate
```

Terraform applies only the workspace assets (schemas, volumes, job skeleton). The job's notebook task definitions are managed by `deploy_job.py` thereafter.

---

## Databricks Free Edition constraints

The workspace is a Databricks Free Edition (not Community Edition). Key operational constraints:

- **Single small serverless cluster.** No autoscaling. One concurrent job run (`max_concurrent_runs: 1` in the job definition, plus the `databricks-workspace` concurrency group in CD).
- **No `terraform apply` in CD.** Terraform state is local-only. Applying from CI would try to recreate existing resources. Provision manually once; deploy the job definition via `deploy_job.py`.
- **Genie availability varies.** The `/ai/ask-genie` endpoint uses Databricks Genie if available. The `/ai/ask` endpoint (deterministic, no LLM) always works.

See [docs/databricks-free-edition.md](databricks-free-edition.md) for the full list of limits and their production equivalents.

---

## Backup and recovery

**PostgreSQL data:** the local Postgres data lives in `~/.local/share/smart-erp-pgdata/`. It survives reboots. If you need to start fresh, delete that directory and re-run `mise run seed`.

**Lakehouse data:** Bronze is the source of truth for the analytical platform. If Silver or Gold are corrupted, re-run the pipeline from Bronze — `silver_build` and `gold_build` are both full rebuilds from their upstream layer.

**Job definition:** `lakehouse/workflows/smart_erp_job.json` is versioned in git. If the live job definition drifts, re-deploy: `python3 scripts/cd/deploy_job.py --branch main`.

---

## Where to go next

- CI/CD design and branching: [docs/branching-strategy.md](branching-strategy.md)
- Databricks workspace limits: [docs/databricks-free-edition.md](databricks-free-edition.md)
- Setting up a development environment: [docs/development.md](development.md)
