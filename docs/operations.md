# Operations

How to run, test, change, deploy and fix the system. Every operation is a `mise run <task>` (`mise run help` lists them); `.env` in the repo root is loaded by every task.

---

## 1. Setup

| Tool | Version | Why |
|---|---|---|
| Python + [uv](https://docs.astral.sh/uv/) | 3.12 | API, seed, lakehouse logic (`uv sync --frozen` installs exactly what CI uses) |
| Node.js + npm | 22 | Web product |
| [mise](https://mise.jdx.dev/) | latest | Task runner |

No Docker and no system PostgreSQL are needed: `mise run dev` boots an embedded PostgreSQL (data in `~/.local/share/smart-erp-pgdata`, survives reboots).

```bash
uv sync && npm ci --prefix frontend
mise run dev          # PostgreSQL → API :8000 (/docs) → web :5173
mise run seed         # load the 1M-row CSV (git-ignored) + acceptance checks, ≈ 4 min
mise run governance   # validate the books contract (Great Expectations)
mise run forecast     # train + publish the 30-day outlook
```

**`.env`** (git-ignored) — only what differs from the `mise.toml` defaults:

```bash
PGHOST=/tmp/opencode  PGPORT=5434  PGUSER=magrey  PGDATABASE=smart   # local defaults
DATABRICKS_HOST=<workspace-url>            # dbx-*, tf-*, trust status, Genie, FM API
DATABRICKS_TOKEN=<personal-access-token>   # scopes: jobs, files, sql
WAREHOUSE_ID=<sql-warehouse-id>
LAKEHOUSE_CATALOG=workspace
GENIE_SPACE_ID=<optional>                  # enables /ai/ask-genie
SMART_ERP_WARMUP=1                         # pre-compute the brief at API start (0 in tests)
```

## 2. Tasks

| Task | Does |
|---|---|
| `dev` · `stop-all` | Start / stop PostgreSQL, API and web together (`dev-db`, `dev-backend`, `dev-frontend` individually) |
| `seed` | Full refresh from the CSV: raw → staging → six tables, fingerprints, acceptance checks |
| `governance` | Great Expectations run of the books contract; exits 1 on a critical failure |
| `forecast` | Retrain Random Forest + Prophet, replace `revenue_forecasts` |
| `dataops` | The whole loop: database → seed (if needed) → forecast → tests → lakehouse → report |
| `test-backend` | API tests + CD contract tests against a throwaway database |
| `dbx-status` · `dbx-upload` · `dbx-validate` | Workspace snapshot · upload the CSV to the landing volume · check Gold counts and revenue |
| `tf-validate` · `tf-plan` · `tf-apply` | Terraform for schemas, volumes and the job |
| `cd-dispatch` · `databricks-release` | Trigger CD · deploy + run + validate the job from this machine |

## 3. Tests

| Suite | Command | Needs |
|---|---|---|
| API (insights, imports, governance, orders, stats, AI, documents) | `uv run pytest backend/tests -q` | PostgreSQL (creates `smart_test`) |
| CD contracts | `uv run pytest scripts/cd/test_cd.py -q` | nothing |
| Lakehouse (Bronze/Silver/DQ/Gold logic) | `python -m unittest discover -s lakehouse/tests` · `python lakehouse/local_run.py` | nothing (no cluster) |
| Web | `cd frontend && npm run lint && npm test && npm run build` | nothing |

## 4. Bringing in data

| Path | Use it for | Behaviour |
|---|---|---|
| `mise run seed` | First load / reset | Full refresh, deterministic ids, acceptance checks must pass |
| CSV import (Data & governance page, `POST /imports`) | New marketplace exports | Great Expectations gate per row; idempotent append; rejection report; books contract re-runs after |
| Book an order (Fulfillment page, `POST /orders`) | Single orders | Stock check, money invariant, audit log |

After new data, retrain the forecast (`mise run forecast`); the brief flags it as stale until then. Details: [product.md §4](product.md#4-when-new-data-arrives).

## 5. Branching, CI and CD

**Trunk-based development.** Short-lived branches (`feat/…`, `fix/…`, `docs/…`) merge into a protected `main` through a pull request; `main` is always deployable. Releases are tags `v*`.

**CI (`ci.yml`) — every pull request, no secrets:**

| Job | Guards against |
|---|---|
| `lockfile` | `uv.lock` out of sync |
| `delivery-checks` | Broken CD contracts (Gold math, job translation, compose sanity) |
| `lint` | Python that does not compile |
| `lakehouse-test` | Broken Bronze/Silver/DQ/Gold logic |
| `sql-parse` | Gold SQL reading anything but `silver.*` / `gold.*` |
| `terraform-validate` | Invalid infrastructure |
| `database-sanity` | Broken migrations (all applied to a fresh PostgreSQL) |
| `backend-test` | API regressions, incl. imports and a Great Expectations run on a test database |
| `frontend-build` | Type errors, lint, failing tests, broken build |
| `seed-acceptance-note` | Contract docs drifting |

**CD (`cd.yml`) — on a `v*` tag:** build images → GHCR → smoke the Docker Compose stack → deploy the Databricks job (`scripts/cd/deploy_job.py`, stateless `jobs/reset`) → run the medallion → validate Gold counts and revenue. Secrets live in the `databricks-prod` GitHub environment (`DATABRICKS_HOST`, `DATABRICKS_TOKEN`, variable `WAREHOUSE_ID`).

## 6. Databricks

**First-time workspace setup**

```bash
mise run tf-apply                              # schemas bronze/silver/gold, volumes, job skeleton
mise run dbx-upload                            # CSV → landing volume (≈ 7 min)
python3 scripts/cd/deploy_job.py --branch main # job tasks from lakehouse/workflows/smart_erp_job.json
python3 scripts/cd/databricks_release.py       # run the medallion
mise run dbx-validate                          # Gold counts + revenue
```

Terraform owns the assets; `deploy_job.py` owns the task definitions (the job resource ignores task drift).

### Dashboards and Genie

- **AI/BI dashboards** (Revenue; Fulfillment) are versioned in `bi/dashboards/*.lvdash.json`. Import them into the workspace; they re-query Gold on open, and Gold rebuilds with the job.
- **Genie space** (one-time, ~5 min in the UI): Genie → New space `Smart-ERP Gold` → add `workspace.gold.fact_sales`, `sales_daily`, `customer_360`, `inventory_kpis` → add 2–3 sample questions → copy the space id from the URL into `GENIE_SPACE_ID`. Check: `POST /ai/ask-genie {"question": "total revenue?"}` returns Genie's SQL and rows (verified: ₹9,938,876,984.90 over `gold.sales_daily`).

### Databricks Free Edition

| Limit | How the project lives with it | Production equivalent |
|---|---|---|
| Built-in `workspace` catalog only | `bronze` / `silver` / `gold` schemas under it (`LAKEHOUSE_CATALOG`) | Dedicated catalog per environment |
| Cannot reach a private PostgreSQL | Bronze loads the same CSV from a UC volume (`COPY INTO`, idempotent) | JDBC snapshot or CDC (Lakeflow Connect / Debezium) |
| One small serverless cluster | One serial job; full rebuild of Silver/Gold (fine at 1M rows) | Autoscaling job clusters; incremental `MERGE` |
| No enterprise Lakeflow expectations | Spark DQ gate R1–R9 + Great Expectations on the OLTP side | Lakeflow Declarative Pipelines with expectations |
| Genie availability varies | `/ai/ask-genie` answers 409 with setup steps until `GENIE_SPACE_ID` is set | Genie / Vector Search |
| Env-var secrets locally | `.env`, GitHub environment secrets | Secret scopes + service principals |

## 7. Troubleshooting

| Symptom | Check | Fix |
|---|---|---|
| API returns 500 everywhere / `{"db":"down"}` | `curl localhost:8000/health`; `pg_isready -h /tmp/opencode -p 5434` | `mise run dev-db` |
| Port already in use | `lsof -i :8000` | `mise run stop-all`, then `mise run dev` |
| Web shows "API not reachable" | `curl localhost:5173/api/health` | Start the API; the `/api` proxy lives in `vite.config.ts` (dev) and `nginx.conf` (Docker) |
| Brief slow on first load | API log | Expected once (~8 s at 1M rows); cached afterwards and pre-warmed at start |
| Import rejected rows | Import report | Fix the rows at the source and re-upload the same file — known rows are skipped |
| Governance run `failed` | Data & governance → Data contract | A critical expectation failed: numbers touching those records may be wrong; fix at the source |
| Lakehouse `dq_gate` fails | Workflows run → `dq_gate` output (`R4 … row …`) | R4: source rounding changed; R7: dates outside the window; R8: revenue does not reconcile (check Bronze was reset) |
| Job `INTERNAL_ERROR` | `gh run view <id> --log-failed` | Re-deploy with `deploy_job.py` (handles SQL-task environments and branch sync) |

## 8. Backup and recovery

- **PostgreSQL**: `~/.local/share/smart-erp-pgdata/`. To start fresh, delete it and run `mise run dev-db && mise run seed`.
- **Lakehouse**: Bronze is the analytical source of truth; Silver and Gold are full rebuilds from it.
- **Job definition**: versioned in `lakehouse/workflows/smart_erp_job.json`; redeploy with `deploy_job.py` if the live job drifts.
