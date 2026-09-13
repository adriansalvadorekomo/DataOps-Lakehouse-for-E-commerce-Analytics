<h1 align="center">DataOps Lakehouse for E-commerce Analytics</h1>

<p align="center">
  A multi-seller e-commerce marketplace (India, INR) with a PostgreSQL transactional core,
  a Databricks medallion lakehouse, and a FastAPI + React analytics layer.
  Built to demonstrate production DataOps practices end-to-end.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?style=flat&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/Databricks-FF3621?style=flat&logo=databricks&logoColor=white" />
  <img src="https://img.shields.io/badge/Delta_Lake-00ADD8?style=flat&logo=delta&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB" />
  <img src="https://img.shields.io/badge/Terraform-7B42BC?style=flat&logo=terraform&logoColor=white" />
  <img src="https://github.com/adriansalvadorekomo/smart-erp-dataopts/actions/workflows/ci.yml/badge.svg" />
</p>

<p align="center">
  <sub>👋 <a href="https://github.com/adriansalvadorekomo"><b>Adrian Salvador Ekomo</b></a> — Computer Engineering student · seeking a <b>Junior Data Engineer</b> role</sub>
</p>

---

## What this project is

Smart-ERP is a data engineering portfolio project built as a complete, working system — not a collection of notebooks.

The business scenario: a multi-seller marketplace in India processes 1,000,000 orders across 603,815 customers, 9,000 sellers, and 89,999 products. The platform generates ₹9.94B in revenue over 24 months, with metrics worth tracking: an 11.6% return rate, a 50% delayed-delivery rate among completed orders, and 3,561 stock-critical products at any given time.

The engineering question: how do you build a reliable analytics platform on top of that transaction history?

The answer this project demonstrates: a PostgreSQL OLTP core feeds a Databricks medallion lakehouse (Bronze → Silver → DQ gate → Gold) through a PR-gated CI/CD pipeline. A FastAPI backend exposes the data. A React dashboard consumes it. Every layer is tested, versioned, and deployed through automation.

**Status:** Phases 1–10 complete. The full lakehouse has been validated at 1M rows (DQ gate passed, revenue reconciled to ₹9,938,876,985). The CD pipeline is green end-to-end.

---

## The system at a glance

```
                    ┌──────────────────────────────────────────┐
                    │           Databricks Lakehouse            │
                    │                                          │
PostgreSQL ─────────►  Bronze ──► Silver ──► DQ gate ──► Gold ├──► BI dashboards
(OLTP core)  JDBC   │  (raw)    (clean)  (R1–R9)   (KPIs)   │──► ML / forecasts
                    │                                          │──► AI assistant
FastAPI ◄────────── ┘                                          │
React dashboard ────────────────────────────────────────────── ┘
```

PostgreSQL owns transactions. Databricks owns analytics. The application never queries the lakehouse for CRUD; the lakehouse never writes back to PostgreSQL.

---

## Diagrams

| Diagram | What it shows |
|---|---|
| [System overview](docs/diagrams/system-overview.html) | One source, two serve paths, one AI loop: PG serves the React + FastAPI app live, Gold serves BI; RAG documents and Genie NL→SQL answer through the Assistant |
| [Order lifecycle](docs/diagrams/order-lifecycle.html) | Full order lifecycle across 4 actors: React → FastAPI → PostgreSQL (atomic commit) → Databricks Gold |
| [System design](docs/diagrams/system-design.html) | Current 3-container deployment vs future scaling proposal (load balancer + replicas + pgBouncer) |
| [Medallion lakehouse](docs/diagrams/medallion.html) | Bronze → Silver → DQ gate (R1–R9) → Gold tier contracts and promotions |
| [Data flow](docs/diagrams/data-flow.html) | Role-scoped pipeline: App → Data Platform → Databricks → Consumers |
| [Database schema](docs/diagrams/db-schema.html) | Core OLTP tables with column-level FK relationships and constraint details |

---

## Quick start

```bash
# Clone
git clone https://github.com/adriansalvadorekomo/smart-erp-dataopts.git
cd smart-erp-dataopts

# Install dependencies (Python 3.12 + Node 22)
uv sync
npm ci --prefix frontend

# Start everything
mise run dev        # Postgres → backend :8000 → frontend :5173

# Stop everything
mise run stop-all
```

The backend answers at `http://localhost:8000/health`. The dashboard is at `http://localhost:5173`.

No database needed before running — `mise run dev` bootstraps a local Postgres instance automatically.

---

## Dataset

The source is a 133 MB Amazon-style e-commerce CSV (1,000,000 rows, git-ignored). Load it with:

```bash
# Place the CSV at: data/amazon-e-commerce/amazon_ecommerce_1M.csv
mise run seed       # ingest + acceptance checks (validates revenue to ±₹1,000)
```

The acceptance check verifies row counts, zero orphans, the money invariant, and the revenue baseline before any lakehouse ingestion runs.

---

## Task runner

All operations are available as `mise` tasks:

```
mise run help           # list all tasks

# Local stack
mise run dev            # start full stack (db → backend → frontend)
mise run stop-all       # stop everything
mise run dev-db         # postgres only
mise run dev-backend    # API only (needs dev-db first)
mise run dev-frontend   # dashboard only

# Data
mise run seed           # ingest 1M CSV + acceptance checks
mise run forecast       # retrain RF + Prophet, update revenue_forecasts
mise run dataops        # full loop: db → seed → forecast → tests → lakehouse → report

# Tests
mise run test-backend   # backend pytest suite

# Databricks
mise run dbx-status     # workspace snapshot (read-only)
mise run dbx-upload     # upload 1M CSV to landing volume
mise run dbx-validate   # Gold contract check (counts + revenue)

# Terraform
mise run tf-validate    # init + validate (no credentials needed)
mise run tf-plan        # plan against workspace
mise run tf-apply       # apply to workspace
```

---

## Project Roadmap

The project is built as an engineering journey — from understanding the business problem to deploying a production-grade analytical platform. Each phase delivers a concrete, validated layer of the system.

| Phase | Objective | Key Deliverables | Status |
|---|---|---|---|
| **1 — Business understanding** | Define the domain: marketplace, INR, sellers, fulfillment lifecycle | Business model doc, KPI definitions (K1–K12), money flow, data contracts | ✅ Completed |
| **2 — Domain modeling & schema** | Translate the business model into a validated relational schema | 6 core tables, 7 migrations, CHECK constraints, FK graph, invariants enforced at DB layer | ✅ Completed |
| **3 — Data ingestion** | Load 1M source rows into normalized OLTP tables with acceptance gates | `scripts/seed/ingest.py`, `acceptance.py`, 8 acceptance checks, revenue reconciled to ±₹1,000 | ✅ Completed |
| **4 — Application layer** | Expose the OLTP core via a typed, tested HTTP API | FastAPI backend (orders, stats, forecast, assistant, documents), Alembic migrations, 36 pytest tests | ✅ Completed |
| **5 — Frontend dashboard** | Visualise platform data for operators and analysts | React + Vite dashboard: Overview, Orders, Sales, Sellers, Operations, Pipeline, Assistant, Documents | ✅ Completed |
| **6 — Data platform** | Land raw data into a durable, replayable analytical store | Databricks Free Edition workspace, Unity Catalog, Bronze Delta table (`raw_purchases`), watermark ingestion | ✅ Completed |
| **7 — Data transformation** | Produce clean, validated analytical entities from raw data | Silver (6 entity tables, enum normalization, grouping logic), DQ gate R1–R9 (0 violations at 1M rows) | ✅ Completed |
| **8 — Analytical models** | Build KPI-ready Gold tables consumed by BI, ML, and AI | Gold: `fact_sales`, `sales_daily`, `customer_360`, `inventory_kpis` + dims; revenue ₹9.94B reconciled | ✅ Completed |
| **9 — BI & AI consumption** | Expose analytical value to business consumers | Databricks SQL dashboards (revenue, fulfillment), deterministic AI assistant (`/ai/ask`), RAG documents layer | 🟡 In Progress |
| **10 — CI/CD & deployment** | Make every change safe, testable, and automatically deliverable | GitHub Actions CI (10 jobs) + CD (3 jobs), GHCR images, compose smoke, Databricks job deploy + Gold validation | ✅ Completed |
| **11 — Infrastructure as code** | Provision and version all workspace assets declaratively | Terraform: schemas, volumes, job definition; `deploy_job.py` for stateless job updates | ✅ Completed |
| **12 — ML & forecasting** | Add forward-looking signals on top of the analytical layer | RF + Prophet 30-day revenue forecast (MAPE ~3.4–4.0%), `revenue_forecasts` table, `/stats/forecast` endpoint | 🟡 In Progress |
| **13 — Observability & operations** | Make the running system transparent and recoverable | Health endpoint, `mise run dataops` loop, structured troubleshooting docs | 🟡 In Progress |
| **14 — Future scaling** | Design the path from single-server to production-grade availability | System design proposal: load balancer + stateless backend replicas + pgBouncer + PG read replica | 🔵 Draft / Future |

**Phase 9 detail:** AI assistant and document upload/chunking are implemented. The RAG endpoint (`/ai/ask-docs`) is wired but `rag/` contains no production embedding pipeline yet. Genie integration (`/ai/ask-genie`) depends on workspace availability.

**Phase 12 detail:** Revenue forecasting (RF + Prophet) is deployed and serving at `/stats/forecast`. Return propensity (`05_train_return_propensity.py`) and churn risk scoring exist as notebooks but are not yet integrated into the serving layer.

**Phase 13 detail:** The system is operable via `mise run` tasks and documented troubleshooting. Structured metrics (Prometheus/Grafana), alerting, and SLO definitions are not yet implemented.

---

## Documentation

| Document | What it covers |
|---|---|
| [docs/architecture.md](docs/architecture.md) | System overview, components, data flow, infrastructure |
| [docs/data-engineering.md](docs/data-engineering.md) | Medallion pipeline: Bronze, Silver, DQ gate, Gold |
| [docs/operations.md](docs/operations.md) | Running, monitoring, troubleshooting, CI/CD |
| [docs/development.md](docs/development.md) | Local setup, testing, contributing |
| [docs/decisions.md](docs/decisions.md) | Why Databricks, why no dbt/Airflow, why medallion |
| [docs/business-model.md](docs/business-model.md) | Domain contract: schemas, KPIs, money flow (single source of truth) |
| [docs/lakehouse.md](docs/lakehouse.md) | Lakehouse internals: Bronze/Silver/Gold contracts, KPI matrix |
| [docs/branching-strategy.md](docs/branching-strategy.md) | Trunk-Based Development, CI gates |
| [docs/databricks-free-edition.md](docs/databricks-free-edition.md) | Free Edition limits, dev/prod equivalence |
| [database/README.md](database/README.md) | Migrations, invariants, apply procedure |

---

## Repository layout

```
smart-erp/
├── database/          PostgreSQL: 7 migrations, apply.sh
├── scripts/
│   ├── seed/          CSV → raw → normalized tables + acceptance checks
│   ├── cd/            CD scripts: deploy_job.py, databricks_release.py
│   └── dev/           Local dev helpers: db_up.sh, up_all.sh, dataops.sh
├── backend/app/       FastAPI: orders, stats, assistant, documents APIs
├── frontend/src/      React + Vite: dashboard, orders, analytics pages
├── lakehouse/
│   ├── src/           Bronze, Silver, Gold, Quality Python modules
│   ├── notebooks/     01–05 Databricks notebooks
│   ├── sql/gold/      Gold mart SQL (fact_sales, sales_daily, customer_360, inventory_kpis)
│   ├── workflows/     smart_erp_job.json (Databricks Workflow definition)
│   └── tests/         Cluster-free unit tests (stdlib unittest)
├── infra/
│   ├── terraform/     Workspace assets: schemas, volumes, job
│   └── docker-compose.yml  Full stack (postgres + backend + frontend)
├── bi/                Databricks SQL dashboard exports + query files
├── ml/                Revenue forecasting scripts + feasibility analysis
├── notebooks/         EDA + modeling Jupyter notebooks
├── docs/
│   └── diagrams/      HTML diagrams (system-overview, order-lifecycle, system-design, medallion, data-flow, db-schema)
└── mise.toml          Task runner (18 tasks)
```

---

## Tech stack

| Layer | Technology |
|---|---|
| OLTP | PostgreSQL 16, 6 core tables, 7 migrations |
| Data platform | Databricks Free Edition, Delta Lake, Unity Catalog, PySpark, Databricks SQL, Workflows |
| Data architecture | Medallion: Bronze → Silver → DQ gate (R1–R9) → Gold |
| Backend | Python 3.12, FastAPI, SQLAlchemy, Pydantic, Alembic |
| Frontend | React (Vite), TanStack Query, shadcn/ui |
| ML | scikit-learn, XGBoost, Prophet, MLflow |
| Infrastructure | Terraform, Docker Compose |
| Package management | uv |
| CI/CD | GitHub Actions (ci.yml: 10 jobs, cd.yml: 3 jobs) |
| Task runner | mise (18 tasks) |

---

## CI/CD

Every pull request runs 10 CI jobs: lockfile sync, Python lint, lakehouse unit tests (no cluster), Gold SQL guards, Terraform validate, database migrations, backend pytest, frontend typecheck + build, CD contract tests, and doc consistency checks.

On a `v*` tag, CD builds Docker images → smokes the compose stack → deploys the Databricks job → runs the full medallion → validates Gold counts and revenue.

See [docs/operations.md](docs/operations.md) for the full pipeline description.

---

<p align="center">
  <sub>Built with DataOps · <a href="https://github.com/adriansalvadorekomo"><b>Adrian Salvador Ekomo</b></a> · <a href="https://linkedin.com/in/adrian-salvador-ekomo-mesi-obono-5990b8182">LinkedIn</a></sub>
</p>
