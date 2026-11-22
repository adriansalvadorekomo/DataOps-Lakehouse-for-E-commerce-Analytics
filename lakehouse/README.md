# Lakehouse — the analytical plane (Databricks)

Bronze → Silver → DQ gate (R1–R9, fail-fast) → Gold, run as one Databricks Workflows job. PostgreSQL stays the system of record; this package never writes back to it. Contracts, layers and Gold marts: [`docs/architecture.md`](../docs/architecture.md#analytical-plane). Free Edition limits and setup: [`docs/operations.md`](../docs/operations.md#6-databricks).

```
lakehouse/
├── src/common/config.py      catalog / schema names, all from env
├── src/bronze/ingest.py      raw landing contract (+ _ingest_ts, _source)
├── src/silver/transform.py   six entities; every business rule defined once
├── src/quality/              rules.py (R1–R9) + runner.py (the gate)
├── src/gold/models.py        KPI arithmetic as tested pure functions (SQL mirrors them)
├── notebooks/01–05           the job tasks (+ 05 return-propensity exploration)
├── sql/gold/                 fact_sales, sales_daily, customer_360, inventory_kpis
├── workflows/smart_erp_job.json   bronze_ingest → silver_build → dq_gate → gold_build → sql_refresh
├── tests/                    stdlib unittest, no cluster
└── local_run.py              the same path on a sample, locally
```

```bash
python -m unittest discover -s lakehouse/tests   # logic, no cluster
python lakehouse/local_run.py                     # Bronze → Silver → DQ → Gold on a sample
```

Rules: business logic lives in exactly one layer; margin is always *estimated* (`unit_cost = 0.65 × unit_price`); secrets come from env / secret scopes only. On Community Edition (no Unity Catalog) set `LAKEHOUSE_USE_UC=false` for two-level names.
