# Architecture

Smart-ERP is two systems with a clear boundary between them: an OLTP platform that processes transactions, and an analytical platform that answers business questions about those transactions. This document explains what each system does, why they are separated, and how they fit together.

---

## The problem this architecture solves

Running analytics directly on a transactional database is a common trap. As query complexity grows — revenue by city, seller performance trends, return-rate forecasts — the OLTP database slows down, the analytics queries start locking rows, and the application team and analytics team are both fighting for the same resource.

The alternative is to build a clean separation: the transactional system does what it does well (atomic writes, constraint enforcement, lifecycle management), and the analytical system does what *it* does well (aggregations, transformations, historical analysis, machine learning).

This project demonstrates that separation at working scale: 1M orders, ₹9.94B revenue, a fully validated lakehouse, and a CI/CD pipeline that keeps both sides green.

---

## System boundaries

```
┌─────────────────────────────────────────────────────────────────────────┐
│  APPLICATION LAYER                                                        │
│                                                                           │
│  React dashboard ──► FastAPI backend ──► PostgreSQL (OLTP)               │
│                                                │                          │
│  What happens here: orders are created, status │ transitions, stock       │
│  decrements. All constraints enforced by the DB│CHECK + FK guards.        │
└──────────────────────────────────┬────────────┘                          │
                                   │ JDBC snapshot (off-peak)               │
                                   │ one-way: data flows out, never in      │
                                   ▼                                        │
┌─────────────────────────────────────────────────────────────────────────┐
│  ANALYTICAL PLATFORM (Databricks)                                         │
│                                                                           │
│  Bronze ──► Silver ──► DQ gate ──► Gold ──► BI / ML / AI                │
│                                                                           │
│  What happens here: raw data is preserved, cleaned, validated, and       │
│  shaped into KPI-ready models. Nobody writes OLTP transactions here.     │
└─────────────────────────────────────────────────────────────────────────┘
```

The boundary is enforced in both directions:
- The application (FastAPI) reads only PostgreSQL for all CRUD operations. It never queries the lakehouse.
- The lakehouse reads PostgreSQL as a source but never writes back to it. It is a consumer, not a participant.

This keeps PostgreSQL's constraints intact (the `delivery_status` lifecycle, the `final_price` invariant, the FK graph) while giving the analytical layer the freedom to transform data without endangering the transaction store.

---

## Components

### PostgreSQL — the transaction system

**What it owns:** every write that matters to the business. An order is created. A delivery status transitions. Stock decrements when an order item is placed.

**Six core tables:**

| Table | Grain | Rows |
|---|---|---|
| `customers` | 1 per buyer | 603,815 |
| `sellers` | 1 per independent seller | 9,000 |
| `products` | 1 per catalog item | 89,999 |
| `inventory` | 1 per product per date (snapshots) | varies |
| `orders` | 1 per order | 1,000,000 |
| `order_items` | 1 per order line | 1,000,000 |

The database enforces the business rules that must not be violated: `final_price = unit_price × quantity × (1 − discount/100)` (CHECK constraint, ±₹0.01), the `delivery_status` lifecycle (IN TRANSIT → DELIVERED/DELAYED/RETURNED, terminal states immutable), and referential integrity across all six tables.

Two additional tables were added incrementally:
- `revenue_forecasts` — stores RF + Prophet model outputs (30-day projections, refreshed by `mise run forecast`)
- `documents` — metadata for user-uploaded documents (used by the RAG assistant)

Migrations live in `database/migrations/001–007.sql` and are applied idempotently by `database/apply.sh`.

### FastAPI backend — the application API

**What it owns:** the HTTP surface the frontend and external consumers talk to.

Four routers:

| Router | Prefix | Purpose |
|---|---|---|
| Orders | `/orders` | Create orders, list/filter, transition status |
| Stats | `/stats` | Read-only aggregates: overview, trends, sellers, stock |
| Assistant | `/ai` | Grounded Q&A over governed data (no LLM, deterministic) |
| Documents | `/documents` | Upload, list, retrieve business documents for RAG |

The stats service computes KPIs directly from PostgreSQL — it does not query the lakehouse. This is intentional: the API needs fresh numbers without a lakehouse dependency, and the 1M-row dataset is fast enough on indexed OLTP columns.

The assistant (`/ai/ask`) answers questions by dispatching to the stats, orders, and forecast services. It never fabricates answers. Unknown questions return the capability list.

### React frontend — the dashboard

**What it owns:** visualising the platform data for operators and analysts.

Pages: Overview (KPI summary), Orders (list + detail + create), Sales (trends by category/city), Sellers (performance), Pipeline (lakehouse status), Assistant (Q&A), Documents (upload/browse).

In development, Vite proxies `/api` requests to the backend at `:8000`. In production (Docker), nginx proxies the same route inside the container — the frontend never hard-codes the backend URL.

### Databricks Lakehouse — the analytical platform

**What it owns:** everything that requires transforming and aggregating the full transaction history: revenue trends, DQ validation, KPI marts, ML features, BI dashboards.

Three layers with distinct responsibilities:

| Layer | Purpose | Tables |
|---|---|---|
| Bronze | Immutable raw history. 1:1 with the source snapshot + audit columns (`_ingest_ts`, `_source`). Never modified. | `raw_purchases` |
| Silver | Cleaned, validated, standardized entities. Enums normalized, grouping logic defined, DQ gate enforced. | 6 entity twins (customers, sellers, products, inventory, orders, order_items) |
| Gold | Business-ready KPI models. What BI dashboards, the ML pipeline, and the AI assistant read. | `fact_sales`, `sales_daily`, `customer_360`, `inventory_kpis`, `dim_customer`, `dim_product`, `dim_date` |

The DQ gate sits between Silver and Gold: rules R1–R9 must all pass before Gold builds. If they don't, the job fails and the last known good Gold remains intact.

### Databricks Workflows — orchestration

**What it owns:** running the medallion pipeline in the right order, with retries and task-level observability.

The job definition lives in `lakehouse/workflows/smart_erp_job.json`. Five tasks:

```
bronze_ingest → silver_build → dq_gate → gold_build → sql_refresh
```

Each task is a Databricks notebook (01–04) or a SQL file (`sql_refresh`). The job runs on serverless compute. It is deployed by `scripts/cd/deploy_job.py` (stateless `jobs/reset` from the versioned JSON).

### Terraform — workspace provisioning

**What it owns:** the one-time setup of Databricks workspace assets: the three schemas (`bronze`, `silver`, `gold`), two volumes (`landing` for the CSV, `documents` for RAG files), and the initial job resource.

Terraform is the provisioning path, not the deployment path. The evolving job definition ships via `scripts/cd/deploy_job.py`, not `terraform apply`. This keeps Terraform's state small and avoids CI needing credentials to plan.

### GitHub Actions — CI/CD

**What it owns:** keeping `main` always deployable and delivering releases end-to-end.

Two workflows:
- `ci.yml` — runs on every PR and push to `main`. 10 jobs. No credentials, no deployment.
- `cd.yml` — runs on `v*` tags and manual dispatch. 3 jobs: build images → compose smoke → Databricks deploy + medallion run + Gold validation.

The full CI/CD description is in [docs/operations.md](operations.md).

---

## Data flow

Here is what happens to a single piece of data from the moment it enters the system to the moment it appears in a dashboard.

**Step 1 — Transaction (PostgreSQL)**

A new order is created via `POST /orders`. FastAPI validates the payload (product exists, seller exists, stock check), writes to `orders` + `order_items` in a single transaction, and returns the created order. PostgreSQL's CHECK constraints verify the `final_price` invariant before the transaction commits.

**Step 2 — Snapshot (Bronze)**

At the next ingestion run, `scripts/seed/ingest.py` (local) or the `bronze_ingest` Databricks notebook reads `staging.purchases` via JDBC. The watermark (`max(purchase_date)`) ensures only new rows are appended. Each row gets `_ingest_ts` and `_source` audit columns. Bronze is append-only — no row is ever deleted or updated.

**Step 3 — Cleanse (Silver)**

The `silver_build` task reads Bronze and applies the transformations defined in `lakehouse/src/silver/transform.py`: enum normalization (`In Transit` → `IN TRANSIT`), whitespace trimming, type coercion, grouping logic (mode city per customer, latest-snapshot price/rating per product). Six entity tables emerge, mirroring the OLTP schema but owned by the analytical platform.

**Step 4 — Validate (DQ gate)**

The `dq_gate` task runs rules R1–R9 from `lakehouse/src/quality/rules.py` against the Silver tables. A single violation causes the task to fail, which prevents `gold_build` from running. Rules cover nulls, uniqueness, FK integrity, the money invariant, enum values, date window, and the full-load revenue checksum (₹9,938,876,985 ± ₹1,000).

**Step 5 — Serve (Gold)**

`gold_build` builds the KPI models from Silver: `fact_sales` (one row per order line, with category, seller, and date dimensions resolved), `sales_daily` (aggregated daily revenue + status split), `customer_360` (lifetime value, order count, Pareto tier), `inventory_kpis` (stock-critical flag per product). `sql_refresh` materializes the serving views via Databricks SQL.

**Step 6 — Consume**

BI dashboards (`bi/`) query Gold directly via the SQL warehouse. The ML pipeline reads `customer_360` and `fact_sales` as feature tables. The `/ai/ask` endpoint reads PostgreSQL in real-time (the stats it needs are fresh, not batched).

---

## Infrastructure topology

```
Local development                    Production

mise run dev                         v* tag → GitHub Actions CD
    │                                    │
    ├── Postgres (embedded pgserver)      ├── GHCR images (backend + frontend)
    ├── FastAPI :8000                     ├── Docker Compose (smoke gate)
    └── Vite :5173                        └── Databricks workspace
                                              ├── smart-erp-medallion job
                                              ├── Workflows (serverless)
                                              ├── SQL warehouse (validation)
                                              └── Unity Catalog (workspace.*)
```

Local development uses an embedded PostgreSQL (installed by `scripts/dev/db_up.sh`) — no Docker required. The Databricks workspace is always real (Free Edition); there is no local mock.

The Docker Compose stack (`infra/docker-compose.yml`) is used only by the CD smoke test and is not the recommended local development path.

---

## Key architectural constraints

These are not implementation details — they are rules the architecture depends on.

**PostgreSQL is the only system that accepts OLTP writes.** The application never writes to Delta Lake. The lakehouse never writes to PostgreSQL. Violating this would compromise the CHECK constraints and the FK graph.

**Bronze rows are immutable.** Corrections are new snapshots downstream, not updates to Bronze. This is what makes the pipeline replayable: re-running `silver_build` from Bronze always produces the same output.

**Gold builds only on green DQ.** There is no path to build Gold that bypasses R1–R9. This is enforced by Databricks Workflows task dependencies — `gold_build` depends on `dq_gate`.

**No COGS in the source.** Margin figures are always estimated: `unit_cost = 0.65 × unit_price`. Every column that uses this assumption is prefixed `estimated_`. If real cost data ever arrives, it replaces this constant; the prefix ensures the assumption is visible.

**Secrets never in code or git.** PostgreSQL credentials are env vars (`PG*`). Databricks credentials are env vars (`DATABRICKS_*`) locally and GitHub Environment secrets in CI/CD. The `.env` file is git-ignored.

---

## Where to go next

- How the medallion pipeline works in detail: [docs/data-engineering.md](data-engineering.md)
- How to run and operate the system: [docs/operations.md](operations.md)
- Why these architectural choices were made: [docs/decisions.md](decisions.md)
- The domain model and KPI definitions: [docs/business-model.md](business-model.md)
