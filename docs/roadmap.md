# Roadmap

The project was built as a sequence of phases, from understanding the business problem to a deployed analytical platform. Each phase delivers one concrete, validated layer of the system. This table used to live in the README; it moved here so the README can stay short.

| Phase | Objective | Key deliverables | Status |
|---|---|---|---|
| **1 — Business understanding** | Define the domain: marketplace, INR, sellers, fulfillment lifecycle | [Business model doc](business-model.md), KPI definitions (K1–K12), money flow, data contracts | ✅ Done |
| **2 — Domain modeling & schema** | Turn the business model into a validated relational schema | 6 core tables, 7 migrations, CHECK constraints, FK graph, invariants enforced in the database | ✅ Done |
| **3 — Data ingestion** | Load 1M source rows into normalized OLTP tables, behind acceptance gates | `scripts/seed/ingest.py`, `acceptance.py`, 8 acceptance checks, revenue reconciled to ±₹1,000 | ✅ Done |
| **4 — Application layer** | Expose the OLTP core through a typed, tested HTTP API | FastAPI backend (orders, stats, forecast, assistant, documents), Alembic migrations, 32 API tests (+4 CD contract tests in the same `mise run test-backend` run) | ✅ Done |
| **5 — Frontend dashboard** | Show platform data to operators and analysts | React + Vite console: Overview, Orders, Sales, Sellers, Operations, Pipeline, Assistant, Documents | ✅ Done |
| **6 — Data platform** | Land raw data in a durable, replayable analytical store | Databricks Free Edition workspace, Unity Catalog, Bronze Delta table (`raw_purchases`), idempotent `COPY INTO` from the landing volume | ✅ Done |
| **7 — Data transformation** | Produce clean, validated analytical entities from raw data | Silver (6 entity tables, enum normalization, grouping logic), DQ gate R1–R9 (0 violations at 1M rows) | ✅ Done |
| **8 — Analytical models** | Build KPI-ready Gold tables for BI, ML and AI | Gold: `fact_sales`, `sales_daily`, `customer_360`, `inventory_kpis` + dims; revenue ₹9.94B reconciled | ✅ Done |
| **9 — BI & AI consumption** | Put the analytical layer in front of business users | Databricks AI/BI dashboards (revenue, fulfillment), deterministic assistant (`/ai/ask`), document Q&A (`/ai/ask-docs`), Genie (`/ai/ask-genie`) | 🟡 In progress |
| **10 — CI/CD & deployment** | Make every change safe, tested and deliverable | GitHub Actions CI (10 jobs) + CD (3 jobs), GHCR images, compose smoke, Databricks job deploy + Gold validation | ✅ Done |
| **11 — Infrastructure as code** | Provision and version workspace assets declaratively | Terraform: schemas, volumes, job definition; `deploy_job.py` for stateless job updates | ✅ Done |
| **12 — ML & forecasting** | Add forward-looking signals on top of the analytical layer | RF + Prophet 30-day revenue forecast (MAPE 3.4–4.0%), `revenue_forecasts` table, `/stats/forecast` endpoint | 🟡 In progress |
| **13 — Observability & operations** | Make the running system visible and recoverable | Health endpoint, `mise run dataops` loop, troubleshooting docs | 🟡 In progress |
| **14 — Future scaling** | Design the path from one server to high availability | System design proposal: load balancer + stateless backend replicas + pgBouncer + PostgreSQL read replica | 🔵 Draft |

## What "in progress" means

**Phase 9.** The assistant and the document upload/chunking/embedding path are implemented. `/ai/ask-docs` retrieves chunks locally (all-MiniLM-L6-v2, cosine) and asks the Databricks Foundation Model API to answer only from them. `rag/` holds no separate production embedding pipeline yet. `/ai/ask-genie` needs a Genie space configured in the workspace (`GENIE_SPACE_ID`). Without it, the endpoint answers 409 with setup instructions.

**Phase 12.** Revenue forecasting (RF ships, Prophet is a second opinion) is deployed and served at `/stats/forecast`. Return propensity (`lakehouse/notebooks/05_train_return_propensity.py`, tracked in MLflow) and churn risk exist as notebooks and are not yet served.

**Phase 13.** The system runs through `mise run` tasks and documented troubleshooting. Structured metrics (Prometheus/Grafana), alerting and SLOs are not implemented yet.

**Bronze ingestion path.** The designed production path is a JDBC snapshot from PostgreSQL ([ADR-2](decisions.md)). Free Edition cannot reach a private database, so the running job loads the same CSV from a Unity Catalog volume with `COPY INTO`. See [databricks-free-edition.md](databricks-free-edition.md).
