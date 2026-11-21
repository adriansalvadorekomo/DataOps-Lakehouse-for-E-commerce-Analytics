<h1 align="center">DataOps Lakehouse for E-commerce Analytics</h1>

<p align="center">
  <b>A marketplace control tower</b>: a ranked morning brief of what changed, why, and what to do —<br>
  computed live from PostgreSQL, guarded by Great Expectations data contracts, backed by a Databricks medallion lakehouse.<br>
  1M orders of a multi-seller marketplace (India, INR ₹).
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Databricks-FF3621?style=flat&logo=databricks&logoColor=white" alt="Databricks" />
  <img src="https://img.shields.io/badge/Spark_SQL-E25A1C?style=flat&logo=apachespark&logoColor=white" alt="Spark SQL" />
  <img src="https://img.shields.io/badge/Great_Expectations-1.x-2BB673?style=flat" alt="Great Expectations" />
  <img src="https://img.shields.io/badge/PostgreSQL_16-4169E1?style=flat&logo=postgresql&logoColor=white" alt="PostgreSQL 16" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React_19-20232A?style=flat&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Terraform-7B42BC?style=flat&logo=terraform&logoColor=white" alt="Terraform" />
  <a href="https://github.com/adriansalvadorekomo/DataOps-Lakehouse-for-E-commerce-Analytics/actions/workflows/ci.yml"><img src="https://github.com/adriansalvadorekomo/DataOps-Lakehouse-for-E-commerce-Analytics/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

<p align="center">
  <img src="docs/screenshots/today-dark.png" width="100%" alt="The Today brief: '2 things need you today' in dot-matrix numerals; ranked signal cards (recent shipments past their promise, repeat customers gone quiet, then watch items such as return hotspots and never-closed shipments), each with evidence, a next step and a link; a pace panel and a 'Can I trust these numbers?' panel.">
</p>

---

## What it is for

A marketplace team does not need more dashboards; it needs to know **what to do today** and **whether the number telling it so can be trusted**.

| You are… | You ask… | The product answers with… |
|---|---|---|
| Marketplace operator | What needs me today? | A ranked brief: each signal with its evidence, a next step and a link |
| Commercial lead | Are we on pace? What do discounts cost? | Revenue vs the previous window, category momentum, estimated margin by discount band |
| Seller manager | Who hurts delivery or returns? | Seller flags against peers, only when statistically significant |
| Fulfillment / inventory | What is stuck? What runs out first? | Shipments past their promise; a reorder list ranked by days of cover |
| CRM / data science | Who is drifting away? | Customers quiet for more than twice their own usual gap, by lifetime value |
| Data owner | Can I report on this? | Great Expectations contracts on every import and on the books |

**When new data arrives**, drop a marketplace export (CSV) on the *Data & governance* page: every row is checked by the import contract, valid rows are appended idempotently, rejected rows come back with the rule they broke, the books contract re-runs, and every window, KPI and signal moves forward on the next load. If the newest days look incomplete, the brief says *partial data* instead of reporting a collapse. → [docs/product.md](docs/product.md)

<p align="center">
  <img src="docs/screenshots/data-governance-dark.png" width="49%" alt="Data & governance: CSV import with the Great Expectations import contract, import history, and the books contract with every expectation, rule and severity.">
  <img src="docs/screenshots/revenue-light.png" width="49%" alt="Revenue (light theme): KPI tiles with deltas, daily revenue against the previous window, monthly revenue, category momentum and estimated margin by discount band.">
</p>

## How it works

<p align="center">
  <a href="docs/diagrams/c4/c4-container-dark.svg">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/diagrams/c4/c4-container-dark.png">
      <img src="docs/diagrams/c4/c4-container-light.png" width="100%" alt="C4 Level 2 container diagram. Operational plane: Control Tower web app, FastAPI, forecast job, Great Expectations data contracts and PostgreSQL 16, with marketplace exports entering through POST /imports. Analytical plane on Databricks: landing volume, Bronze, Silver, DQ gate R1–R9 and Gold, run by Databricks Workflows, feeding AI/BI dashboards, Genie and MLflow. Delivery plane: GitHub, CI (10 jobs), CD, Terraform, mise + uv.">
    </picture>
  </a>
  <br><sub>C4 Level 2 — click for the full-resolution SVG · <a href="docs/diagrams/c4/c4-context-light.png">Level 1: system context</a> · <a href="docs/architecture.md">architecture</a></sub>
</p>

- **PostgreSQL owns every write** and serves the live brief (cached on a data version, so any write invalidates it).
- **Great Expectations** gates every imported row (46 expectations) and validates the books in place (29), using the same rule IDs as the lakehouse gate.
- **Databricks owns analytics** and never writes back: Bronze (append-only) → Silver → **fail-fast DQ gate R1–R9** → Gold, one Workflows job.
- **Every change goes through a PR**: 10 CI jobs without secrets; a `v*` tag deploys the job, runs it and validates Gold.

## Results

Measured on the full dataset (1,000,000 synthetic orders, 24 months):

| | |
|---|---|
| Lakehouse DQ gate (R1–R9) | **0 violations**; Gold revenue **₹9,938,876,985**, reconciled within ±₹1,000 |
| Books contract (Great Expectations) | **28/29** expectations met; the 1 warning is real — ≈ 281,000 orders never closed "in transit" (H1) |
| Import, end to end on the 1M books | 505-row export: 300 added, 200 recognised as known, 5 rejected with their rule — validated in 0.8 s |
| The brief | ~8 s cold, ~150 ms warm at 1M orders |
| Forecast | Random Forest, 3.4% MAPE (rolling one-day-ahead, 90 days); Prophet 4.0% as second opinion |
| Tests | 53 API · 4 CD · 27 lakehouse (no cluster) · 5 web; 10 CI jobs on every PR |

**What the data says** (analyst notes in [business-model.md §7](docs/business-model.md#7-what-the-data-says-analyst-notes)): revenue is flat at ₹379–428M a month (an earlier "30× growth" claim compared a one-day month with a full one); 39% of order lines carry 30–50% discounts and, under the 65% cost assumption, sell below cost past 35% off; repeat customers (45%) bring 67% of revenue; and no recorded attribute predicts returns — so the project ships a hotspot test, not a model with nothing to learn.

## Quick start

Needs Python 3.12 + [uv](https://docs.astral.sh/uv/), Node 22 and [mise](https://mise.jdx.dev/). No Docker or system PostgreSQL: `mise run dev` boots an embedded one.

```bash
git clone https://github.com/adriansalvadorekomo/DataOps-Lakehouse-for-E-commerce-Analytics.git
cd DataOps-Lakehouse-for-E-commerce-Analytics
uv sync && npm ci --prefix frontend

mise run dev          # PostgreSQL → API :8000 (/docs) → Control Tower :5173
mise run seed         # load the 1M-row CSV (git-ignored) + acceptance checks
mise run governance   # Great Expectations run of the books contract
mise run forecast     # publish the 30-day outlook
```

The lakehouse logic runs without a cluster: `python -m unittest discover -s lakehouse/tests` and `python lakehouse/local_run.py`. Databricks tasks need `DATABRICKS_HOST` + `DATABRICKS_TOKEN` in `.env` ([operations](docs/operations.md)).

## Documentation

| Read | For |
|---|---|
| [Business model](docs/business-model.md) | The contract: data, lifecycle, money flow, KPIs K1–K12, rules — and what the data actually says |
| [Product](docs/product.md) | Who uses the Control Tower, the signals and their rules, what happens when data arrives, governance |
| [Architecture](docs/architecture.md) | C4 diagrams, the two planes, data governance, the medallion |
| [Decisions](docs/decisions.md) | Ten ADRs, each with when to revisit it |
| [Roadmap](docs/roadmap.md) | Done / now / next / later, each with a measure |
| [Operations](docs/operations.md) | Setup, tasks, tests, CI/CD, Databricks, troubleshooting |

## Repository map

| Path | What lives there |
|---|---|
| [`frontend/`](frontend/) | The Control Tower: React 19, Vite, Tailwind v4, Radix, GSAP |
| [`backend/`](backend/) | FastAPI: brief (`services/insights.py`), KPIs, entities, imports, governance (`governance/`), orders, AI |
| [`database/`](database/) | PostgreSQL DDL: 9 migrations, invariants |
| [`lakehouse/`](lakehouse/) | Bronze / Silver / Gold, DQ rules R1–R9, notebooks, Gold SQL, the Workflows job, cluster-free tests |
| [`scripts/`](scripts/) | Seed + acceptance, CD scripts, dev helpers |
| [`infra/`](infra/) | Terraform (schemas, volumes, job), Docker Compose |
| [`bi/`](bi/), [`ml/`](ml/), [`notebooks/`](notebooks/) | AI/BI dashboard exports, forecasting, EDA |

---

<p align="center">
  <a href="https://adriansalvadorekomodev.vercel.app"><img src="frontend/public/brand/mark.svg" width="28" alt="Brand mark: a cloud lit on a dot-matrix display"></a><br>
  <sub><a href="https://github.com/adriansalvadorekomo"><b>Adrián Salvador Ekomo</b></a> · data engineering + DevOps · <a href="https://www.linkedin.com/in/adriansalvadorekomo">LinkedIn</a> · <a href="https://adriansalvadorekomodev.vercel.app/blog/fail-fast-dq-gate-lakehouse">Write-up: put the quality gate between Silver and Gold</a></sub>
</p>
