# Decisions

Each record says what was decided, why, what it costs, and **when to revisit it**. The last field matters most: these are the choices of a 1M-row, one-person project, and each has a clear point where it stops being right.

| # | Decision | Revisit when |
|---|---|---|
| 1 | Databricks is the analytical platform (no dbt + Airflow + Postgres analytics) | A second analytical engine is required by a consumer |
| 2 | PostgreSQL is the system of record; the lakehouse only reads | Writes need to land in the lakehouse in real time |
| 3 | Medallion: Bronze → Silver → Gold | A layer has no consumer |
| 4 | PySpark + Databricks SQL, not dbt | The SQL layer grows past ~20 models |
| 5 | Databricks Workflows, not Airflow | Pipelines span systems outside Databricks |
| 6 | Databricks SQL dashboards, not Metabase | Business users need BI without workspace access |
| 7 | Workspace-native MLflow | Models leave Databricks |
| 8 | Local-first, with documented production equivalents | A cloud-only feature becomes essential |
| 9 | The product is a control tower served live from PostgreSQL | Brief latency or OLTP load becomes a problem |
| 10 | Data contracts with Great Expectations; idempotent CSV import | Data arrives as a stream, or contracts move to the catalog |
| 11 | Ask answers in business language, logs every answer and its rating; no Genie in the product | Enough ratings exist to train a reward model |

---

## ADR-1 — Databricks instead of Airflow + dbt + Postgres analytics

**Context.** The scaffold implied dbt (zero models), Airflow (no DAGs) and analytics on PostgreSQL. Nothing worked yet, so the choice was free.
**Decision.** Databricks: Delta for storage, Workflows for orchestration, Databricks SQL for serving.
**Why.** One platform instead of three tools with three CI paths, three test frameworks and three sets of credentials. At 1M rows that complexity buys nothing.
**Consequences.** One paradigm to learn. KPI logic lives in pure-Python helpers that are tested without a cluster.
**Revisit when** a consumer needs an engine Databricks does not provide.

## ADR-2 — PostgreSQL stays the system of record

**Context.** Orders need atomic writes, CHECK constraints (the money invariant) and an enforced lifecycle; Delta has none of these.
**Decision.** Every write goes to PostgreSQL. The lakehouse reads; it never writes back.
**Consequences.** One seam between the two (designed as a JDBC snapshot; on Free Edition the same CSV lands in a Unity Catalog volume, because the workspace cannot reach a private database). Constraints stay in the database, not in application code.
**Revisit when** writes must be analysed in near real time — then change-data capture (e.g. Debezium / Lakeflow Connect) replaces the snapshot.

## ADR-3 — Medallion (Bronze / Silver / Gold)

**Context.** Prices, ratings and stock are per-event snapshots; flattening them early loses history for good.
**Decision.** Bronze keeps raw history (append-only, audit columns); Silver defines every entity once; Gold holds only KPIs with a named consumer. The DQ gate sits between Silver and Gold.
**Why.** Re-running Silver from Bronze is what made calibrating the ±₹5.00 tolerance cheap. One definition per rule (e.g. `home_city`) prevents three diverging versions.
**Revisit when** a layer has no consumer, or a fourth layer is needed for a new source.

## ADR-4 — PySpark + Databricks SQL instead of dbt

**Decision.** Transforms in PySpark notebooks, serving models in `lakehouse/sql/gold/` (four files). The empty dbt project was removed.
**Consequences.** CI (`sql-parse`) enforces that Gold reads only `silver.*` / `gold.*` — the lineage guarantee `ref()` would have given.
**Revisit when** the SQL layer grows past ~20 models, where dbt's testing and docs pay for themselves.

## ADR-5 — Databricks Workflows instead of Airflow

**Decision.** `lakehouse/workflows/smart_erp_job.json` defines the five-task job; CD deploys it statelessly (`jobs/reset`).
**Why.** Airflow would be a second control plane whose only job is to call the first.
**Revisit when** the pipeline must orchestrate systems outside Databricks.

## ADR-6 — Databricks SQL dashboards instead of Metabase

**Decision.** Gold is served where it lives; dashboard exports are versioned in `bi/`.
**Consequences.** BI needs workspace access. The business-facing product (ADR-9) covers users without it.
**Revisit when** many business users need self-service BI outside the workspace.

## ADR-7 — Workspace-native MLflow

**Decision.** Experiment tracking in the workspace; local runs log to a file store.
**Consequences.** Return propensity was explored and **not** shipped as a model: no observed feature correlates with returns ([business-model.md §7](business-model.md#7-what-the-data-says-analyst-notes)). The revenue forecast (RF, 3.4% MAPE) is served from PostgreSQL.
**Revisit when** models must be served outside Databricks.

## ADR-8 — Local-first, with documented production equivalents

**Decision.** Everything runs locally without credentials (embedded PostgreSQL, cluster-free lakehouse tests, `local_run.py`). The Databricks workspace is always real; nothing is mocked to look like it.
**Consequences.** CI is green without secrets; Free Edition limits are listed with their production alternatives in [operations.md](operations.md#databricks-free-edition).
**Revisit when** a cloud-only capability becomes essential to the product.

## ADR-9 — The product is a control tower served live from PostgreSQL

**Context.** The previous console was a set of KPI pages without a job: nobody could say who it was for or what to do with it.
**Decision.** The web product answers role questions with a ranked brief of signals, each with evidence and a next step ([product.md](product.md)). It reads the live PostgreSQL books, not the lakehouse. Thresholds are data-derived (peer percentiles, baselines, significance tests), and windows are anchored on the latest order date. Heavy reads are cached on a data version (order count, max id, max `updated_at`), so any write invalidates them.
**Why.** Operators act on today's books; a nightly lakehouse refresh would be a day late. At 1M orders the brief computes in ~8 s cold and ~150 ms warm.
**Consequences.** Analytical load on the OLTP database, contained by the cache and indexes. Gold remains the source for BI and Genie.
**Revisit when** the brief needs more than a few seconds cold, or OLTP load matters: move the heavy aggregates to Gold (or a read replica) and keep the brief logic unchanged.

## ADR-10 — Data contracts with Great Expectations; idempotent CSV import

**Context.** "What happens when new data arrives?" had no answer: the seed was a full refresh, and quality rules lived only in the lakehouse gate and as ad-hoc SQL.
**Decision.**
- Contracts are code (`backend/app/governance/contracts.py`), expressed as Great Expectations suites with the business-model rule, a severity and a plain-language reason on every expectation.
- The **import contract** gates each uploaded CSV row; failures become the rejection report.
- The **books contract** validates the live PostgreSQL tables in place, on demand, after every import and in CI; results are stored in `governance_runs`.
- Imports are idempotent through a row fingerprint (`orders.source_hash`) shared with the seed.
**Why GE.** Declarative, reviewable expectations with row-level results, running against both pandas and SQL — the same vocabulary for the file and the database. Rules stay aligned with the lakehouse gate (R1–R9).
**Consequences.** A heavier dependency (imported lazily; usage analytics disabled). Two enforcement points to keep aligned, by rule ID.
**Revisit when** data arrives as a stream (validate at ingestion instead), or the contracts move into the catalog (e.g. Unity Catalog expectations / DLT).

## ADR-11 — Ask speaks business, and learns from its users

**Context.** Ask offered three engines, one of them Databricks Genie (it writes SQL over Gold) and showed raw endpoint names as sources. Business users are not SQL experts; they want answers they can act on.
**Decision.** Two sources only — *business data* and *our documents* — chosen in the prompt box, with attachments inside it. Answers and their sources use business language. Every answer is logged in `ai_interactions`; users rate it 👍/👎 (with an optional "what would have been more useful?"). Genie stays an analyst tool in the workspace, not in the product.
**Why.** Plain answers are what the users need; ratings turn daily use into a preference dataset for later reward modelling / RLHF instead of guessing what "better" means.
**Consequences.** One more table and three endpoints; the deterministic engine's phrasing is now tested against the suggestions the UI shows.
**Revisit when** enough rated answers exist to train a reward model, or a language model replaces intent matching.

---

## Known limits

- **Full-refresh lakehouse.** Silver and Gold rebuild from Bronze on every run (15–25 min at 1M rows). Beyond ~10M rows, incremental `MERGE` is needed.
- **Estimated margin.** 65% cost assumption until real costs exist; every derived figure is labelled *estimated*.
- **Local Terraform state.** Fine for one operator; a team needs a remote backend with locking.
- **Free Edition.** One small serverless cluster, no autoscaling, no enterprise Lakeflow; listed with production alternatives in [operations.md](operations.md#databricks-free-edition).
- **Never-closed statuses.** ≈ 281,000 orders are still "in transit" after 30+ days in the source; reported as H1, excluded from the late-delivery rate.
