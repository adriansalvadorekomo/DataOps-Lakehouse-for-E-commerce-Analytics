# Architecture Decisions

Short, reasoned records of the important choices in this project. Format: decision → why → what was rejected → consequences.

---

## ADR-1 — Databricks instead of Airflow + dbt + Postgres analytics

**Decision:** Databricks (Delta Lake + Workflows + SQL) is the analytical platform.

**Why:** When Phase 6 arrived, there were two realistic paths: build out the dbt + Airflow stack that the empty scaffolding implied, or replace it with a single platform. The dbt project had zero models. The Airflow DAGs didn't exist. There was no working code to displace — only a direction to choose.

The Databricks path removes three integration seams in one move: Delta is the storage format, Workflows is the orchestrator, and Databricks SQL is the serving layer. The alternative — dbt for transformations, Airflow for orchestration, and Postgres for analytics — is three tools with three CI paths, three test frameworks, and three sets of credentials to manage. At 1M rows on a portfolio project, that complexity buys nothing.

**What was rejected:**
- Airflow + dbt on Postgres: dual-engine, dual-test-framework, analytics load on the OLTP database
- Hybrid (dbt for SQL, Spark for large transforms): duplicates business logic across layers

**Consequences:** The team learns one paradigm (medallion + Delta). KPI logic lives in tested Python helpers that are verifiable without a cluster. Migration risk was zero because there was nothing in production to migrate.

---

## ADR-2 — PostgreSQL stays the system of record

**Decision:** PostgreSQL is the OLTP system. Databricks is read-only downstream of it.

**Why:** The business requires atomic order writes with constraint enforcement. The `delivery_status` lifecycle (IN TRANSIT → DELIVERED/DELAYED/RETURNED, terminal states immutable) must be enforced at the database layer, not in application logic. The `final_price` CHECK constraint prevents silent data corruption. PostgreSQL's FK graph ensures referential integrity across six tables on every write.

Delta Lake is an excellent analytical store. It is not an OLTP engine — it has no row-level transaction semantics, no CHECK constraints, no FK enforcement. Writing orders to Delta and trying to enforce these rules in application code would mean trusting the application for data correctness instead of the database.

**What was rejected:** Writing transactions to Delta directly, bypassing PostgreSQL.

**Consequences:** There is an explicit JDBC-snapshot seam between OLTP and Bronze (run off-peak). The application never touches the lakehouse for CRUD. This keeps the database constraints intact and makes both systems simpler by giving each one clear responsibility.

---

## ADR-3 — Medallion (Bronze / Silver / Gold)

**Decision:** Three layers: Bronze (raw, immutable), Silver (clean entities), Gold (KPI models).

**Why:** The source data has a property that makes Bronze valuable: prices, ratings, and stock levels are per-event snapshots. A product's price at the time of sale is different from its price today. Seller rating at the time of sale matters for the top-sellers KPI. If the pipeline writes Bronze as a clean, denormalized table, that history is gone forever.

Bronze preserves replayable history. When a transformation rule changes (say, the `final_price` tolerance changes from ±₹0.01 to ±₹5.00), you can re-run Silver from Bronze without re-ingesting the 133 MB source. That is what made the DQ rule calibration practical.

Silver has a single, important job: define every entity exactly once. `home_city = mode(location)` is defined in Silver and nowhere else. If it were in Gold and in the API and in a dashboard query, three places would compute it and they would eventually diverge.

Gold contains only named KPIs with real consumers. Nothing speculative.

**What was rejected:**
- Two layers (raw → marts): loses the Silver isolation, business rules scattered
- dbt staging/intermediate/marts: same concept, different naming convention — no benefit at this scale
- Four layers (adding a "standardized" layer between Bronze and Silver): unnecessary for this data volume and complexity

**Consequences:** Each table has one reason to exist. The DQ gate has a natural home (Silver → Gold boundary). The three-layer architecture is the same conceptual model as the existing `raw → staging → public` PostgreSQL pipeline — the lakehouse is its analytical twin.

---

## ADR-4 — PySpark + Databricks SQL instead of dbt

**Decision:** New transforms are PySpark (notebooks) + Databricks SQL (Gold serving). The empty dbt scaffold is removed.

**Why:** The dbt project contained zero models, zero sources, and zero tests. Keeping it as a placeholder meant maintaining a second empty project with its own CI job, its own test runner, and its own dependency footprint — for no current value.

PySpark covers the batch transformations. Databricks SQL covers the serving models. Both use the same cluster and the same Unity Catalog — no additional infrastructure. The KPI logic is mirrored in tested Python helpers (`lakehouse/src/`) so it is verifiable without a cluster on every PR.

**What was rejected:** Keep dbt for Silver/Gold SQL and add Spark only where needed — two engines serving one pipeline, two test frameworks, two CI paths.

**Consequences:** SQL review happens in `lakehouse/sql/gold/` (four files). The CI `sql-parse` job enforces that Gold SQL reads only from `silver.*` or `gold.*`, never from OLTP or raw tables. This replaces what dbt's ref() macro would have provided — explicit source tracing.

---

## ADR-5 — Databricks Workflows instead of Airflow

**Decision:** `lakehouse/workflows/smart_erp_job.json` defines the pipeline. Workflows runs it.

**Why:** Airflow is a control plane: it needs a scheduler, a metadata database, an executor, and its own operational overhead. It would be running alongside a platform that already has a native scheduler (Databricks Workflows), adding a second infrastructure layer whose only job is to call the first one.

Workflows gives task dependencies, retries, task-level observability, and run history with zero extra infrastructure. For a five-task serial pipeline, that is all that's needed.

**What was rejected:** Self-hosted Airflow (Docker Compose) orchestrating Databricks jobs — a whole second control plane for orchestrating a platform that already orchestrates itself.

**Consequences:** The pipeline is defined in one versioned JSON file. Local parity is provided by `lakehouse/local_run.py` (same task order, same logic, sample data). The job definition ships statelessly via `scripts/cd/deploy_job.py` (`jobs/reset`) — no Terraform state involved in routine deploys.

---

## ADR-6 — Databricks SQL instead of Metabase

**Decision:** Gold is served through Databricks SQL dashboards. Metabase is not deployed.

**Why:** Querying Gold where it lives avoids another database load path and another service to operate. The Free Edition includes SQL warehouses and Lakeview dashboards. Metabase would require a Docker container, its own database for metadata, and a second authentication system — all to do what the workspace already does.

**What was rejected:** Metabase (Docker Compose) against Postgres or Gold.

**Consequences:** BI depends on the workspace (no local BI). The `bi/` directory holds dashboard exports and query files as version-controlled artifacts. If a second BI tool proves its value for a specific use case, the exports make migration straightforward.

---

## ADR-7 — MLflow (Databricks-native)

**Decision:** Experiment tracking and model registry via workspace-native MLflow.

**Why:** The alternative is a self-hosted MLflow server — another container to run, another database for the tracking backend, another set of credentials. The workspace already provides MLflow with autologging on the training cluster and Gold-to-model lineage in one UI.

**Consequences:** Local training logs to file-store. Runs are reproducible via pinned features from `customer_360` and `fact_sales`. Phase 8 targets: return propensity (K12, 11.6% base rate) and churn risk (K11).

---

## ADR-8 — Local-first development with documented production equivalents

**Decision:** Every cloud capability has a local equivalent in the repo. Production alternatives are documented, never faked.

**Why:** Requiring a live Databricks workspace for every test would make the project inaccessible to contributors without credentials and would make CI expensive. The alternative — pretending local and cloud are identical — leads to CI passing on mocked behavior that fails in production.

The approach taken: the lakehouse logic is pure Python (`lakehouse/src/`) testable with stdlib unittest, `local_run.py` runs the full Bronze → Silver → DQ → Gold path on sample data, and CI runs both without any credentials. The Databricks workspace is always real (Free Edition) — there is no local Delta mock.

**What was rejected:** Requiring live workspace credentials for any validation.

**Consequences:** Two clearly-labeled modes: portfolio/Free-Edition (what's in the repo) and production enterprise (documented). The production alternative for each Free Edition constraint is documented in [docs/databricks-free-edition.md](databricks-free-edition.md). CI stays green without credentials while the workspace remains the only place real data lands.

---

## Known limitations and technical debt

**Single `final_price` tolerance value:** ±₹5.00 is calibrated against the current source dataset. A different source with higher-precision calculations might need a tighter tolerance. The value is defined in one place (`lakehouse/src/silver/transform.py`) and documented explicitly.

**Full-refresh lakehouse:** Silver and Gold are fully rebuilt from Bronze on each run. At 1M rows on serverless compute, this takes 15–25 minutes and is acceptable. At 10M+ rows, incremental `MERGE` (SCD2 for dimensions, append-only for facts) would be necessary. The Bronze watermark pattern already supports incremental Bronze ingestion — Silver and Gold would need `MERGE` logic added.

**No COGS:** `unit_cost = 0.65 × unit_price` is a constant placeholder. Every column derived from it is prefixed `estimated_`. If real cost data arrives, it lands in `products.unit_cost` and the constant is replaced. The prefix ensures the assumption is always visible.

**Terraform state is local-only:** the state file is not in a remote backend. This means Terraform can only be applied from the machine where the state lives. For a portfolio project with one workspace operator, this is acceptable. For a team, the state would move to S3/GCS + state locking.

**Free Edition workspace limits:** single small serverless cluster, no autoscaling, no enterprise DLT (Lakeflow). See [docs/databricks-free-edition.md](databricks-free-edition.md) for the full list and production alternatives.
