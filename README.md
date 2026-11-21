<h1 align="center">DataOps Lakehouse for E-commerce Analytics</h1>

<p align="center">
  PostgreSQL system of record → Databricks Bronze / Silver / Gold, with a fail-fast data-quality gate before Gold,<br>
  Terraform-managed workspace assets and PR-gated CI/CD. 1M orders of a multi-seller marketplace (India, INR ₹).
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Databricks-FF3621?style=flat&logo=databricks&logoColor=white" alt="Databricks" />
  <img src="https://img.shields.io/badge/Delta_Lake-00ADD8?style=flat&logo=delta&logoColor=white" alt="Delta Lake" />
  <img src="https://img.shields.io/badge/Spark_SQL-E25A1C?style=flat&logo=apachespark&logoColor=white" alt="Spark SQL" />
  <img src="https://img.shields.io/badge/PostgreSQL_16-4169E1?style=flat&logo=postgresql&logoColor=white" alt="PostgreSQL 16" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Terraform-7B42BC?style=flat&logo=terraform&logoColor=white" alt="Terraform" />
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?style=flat&logo=python&logoColor=white" alt="Python 3.12" />
  <a href="https://github.com/adriansalvadorekomo/DataOps-Lakehouse-for-E-commerce-Analytics/actions/workflows/ci.yml"><img src="https://github.com/adriansalvadorekomo/DataOps-Lakehouse-for-E-commerce-Analytics/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

<p align="center">
  <a href="docs/diagrams/c4/c4-container-dark.svg">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/diagrams/c4/c4-container-dark.png">
      <img src="docs/diagrams/c4/c4-container-light.png" width="100%" alt="C4 Level 2 container diagram. Operational plane on Docker Compose: React web console, FastAPI backend, revenue forecast job, PostgreSQL 16 system of record. Analytical plane on Databricks Free Edition: landing volume, Bronze, Silver, DQ gate R1–R9 and Gold Delta tables orchestrated by Databricks Workflows, feeding AI/BI dashboards, Genie and an MLflow notebook; the API calls the Foundation Model API and Genie. Delivery plane: GitHub repo, Actions CI (10 jobs), CD (3 jobs), Terraform, mise + uv. One CSV seeds PostgreSQL and lands in Bronze.">
    </picture>
  </a>
  <br><sub>C4 Level 2: containers. Click for the full-resolution SVG · <a href="docs/diagrams/c4/c4-context-light.png">Level 1: system context</a> · <a href="docs/architecture.md#c4-diagrams">how to read it</a></sub>
</p>

---

## In 30 seconds

**Problem.** E-commerce reports that query the operational database directly give no guarantee that the numbers are right, and they compete with the application for the same database.

**Design.** Two planes, one boundary:

```
                    ┌─► PostgreSQL 16 ◄── FastAPI ◄── React console          (operational: every write)
 1M-row CSV source ─┤
                    └─► UC volume ─► Bronze ─► Silver ─► DQ gate R1–R9 ─► Gold ─► AI/BI · Genie · MLflow
                                     └──── Databricks Workflows job: one serverless run, fail-fast ────┘
```

- **PostgreSQL owns every write.** CHECK and FK constraints enforce the money invariant and the delivery lifecycle.
- **Databricks owns analytics and never writes back.** Bronze is append-only, and Silver rebuilds from Bronze.
- **Gold builds only on a green gate.** If any of the 9 rules fails, the job stops and the last good Gold stays.
- **Every change goes through a PR.** 10 CI jobs run without secrets; a `v*` tag deploys the job, runs it and validates Gold.

## Results

Measured on the full dataset (1,000,000 synthetic orders, 24 months):

| What | Result |
|---|---|
| DQ gate R1–R9 on Silver | **0 violations** |
| Gold revenue vs. source | **₹9,938,876,985**, reconciled within ±₹1,000 |
| Row counts | 603,815 customers · 9,000 sellers · 89,999 products · 1,000,000 orders |
| Tests | 32 API (pytest) · 4 CD contract · 27 lakehouse (stdlib `unittest`, no cluster) |
| CI | 10 jobs on every pull request; CD: build images → compose smoke → deploy + run + validate Gold |
| Forecast | 30-day revenue, Random Forest: 3.4% MAPE on a rolling one-day-ahead test (Prophet as second opinion) |

**Known limits** (written down in [8 ADRs](docs/decisions.md)): the medallion is a full refresh today, so beyond ~10M rows it needs `MERGE`. Bronze is designed as a JDBC snapshot from PostgreSQL, but on Free Edition it loads the same CSV from a Unity Catalog volume. Margin uses an *estimated* cost (`0.65 × unit_price`) because the source has no COGS.

## Quick start

Needs Python 3.12 + [uv](https://docs.astral.sh/uv/), Node 22 and [mise](https://mise.jdx.dev/). No Docker or system PostgreSQL: `mise run dev` boots an embedded one.

```bash
git clone https://github.com/adriansalvadorekomo/DataOps-Lakehouse-for-E-commerce-Analytics.git
cd DataOps-Lakehouse-for-E-commerce-Analytics
uv sync && npm ci --prefix frontend

mise run dev      # Postgres → API :8000 → console :5173
mise run seed     # optional: load the 1M-row CSV (git-ignored) + 8 acceptance checks
mise run help     # every task: tests, forecast, dbx-*, tf-*
```

The lakehouse logic runs without a cluster: `python -m unittest discover -s lakehouse/tests` and `python lakehouse/local_run.py`. Databricks tasks need `DATABRICKS_HOST` + `DATABRICKS_TOKEN` in `.env` (see [operations](docs/operations.md)).

## Repository map

| Path | What lives there |
|---|---|
| [`lakehouse/`](lakehouse/) | Bronze / Silver / Gold modules, DQ rules R1–R9, notebooks 01–05, Gold SQL, the Workflows job JSON, cluster-free tests |
| [`database/`](database/) | PostgreSQL DDL: 7 migrations, invariants, `apply.sh` |
| [`scripts/`](scripts/) | `seed/` (CSV → PostgreSQL + acceptance), `cd/` (deploy job, validate Gold), `dev/` |
| [`backend/`](backend/) | FastAPI: `/orders`, `/stats`, `/ai`, `/documents`; Alembic; pytest |
| [`frontend/`](frontend/) | React 19 + Vite console, served by nginx in Docker |
| [`infra/`](infra/) | Terraform (schemas, volumes, job) and the 3-container Docker Compose stack |
| [`bi/`](bi/), [`ml/`](ml/), [`notebooks/`](notebooks/) | AI/BI dashboard exports, forecasting scripts, EDA notebooks |
| [`.github/workflows/`](.github/workflows/) | `ci.yml` (10 jobs), `cd.yml` (3 jobs), `release.yml` |

## Documentation

| Read this | To understand |
|---|---|
| [Architecture](docs/architecture.md) | The C4 diagrams, the two planes, data flow, constraints |
| [Data engineering](docs/data-engineering.md) · [Lakehouse](docs/lakehouse.md) | Bronze, Silver, the DQ gate and Gold, table by table |
| [Business model](docs/business-model.md) | The domain contract: schemas, KPIs, money flow (single source of truth) |
| [Decisions](docs/decisions.md) | Why Databricks and not dbt + Airflow, why medallion, and what is limited |
| [Operations](docs/operations.md) · [Development](docs/development.md) | Every `mise` task, CI/CD, troubleshooting, local setup, testing |
| [Roadmap](docs/roadmap.md) | The 14 phases and what is still in progress |
| [Diagrams](docs/diagrams/) | Order lifecycle, medallion, data flow, DB schema, system design |

---

<p align="center">
  <sub><a href="https://github.com/adriansalvadorekomo"><b>Adrián Salvador Ekomo</b></a> · data engineering + DevOps · <a href="https://www.linkedin.com/in/adriansalvadorekomo">LinkedIn</a> · <a href="https://adriansalvadorekomodev.vercel.app/blog/fail-fast-dq-gate-lakehouse">Write-up: put the quality gate between Silver and Gold</a></sub>
</p>
