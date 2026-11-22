# Roadmap

Where the project stands and where it goes next. Each item states the **objective** it serves and how success is **measured** — a roadmap item without a measure is a wish.

## Done

| Capability | Objective | Evidence |
|---|---|---|
| Business model and KPI catalogue | One contract for every number | [business-model.md](business-model.md): K1–K12, rules R1–R9 + H1, analyst findings |
| PostgreSQL system of record | Correct writes, enforced lifecycle and money invariant | 11 migrations; CHECK and FK constraints; audit log |
| Seed with acceptance gate | Reproducible 1M-row load | 8 acceptance checks; revenue reconciled to ±₹1,000 |
| Databricks medallion with fail-fast gate | Gold only from data that passes R1–R9 | 0 violations at 1M rows; Gold revenue ₹9,938,876,985 |
| CI/CD and infrastructure as code | Every change tested; releases deploy and validate themselves | 10 CI jobs per PR; CD deploys the job, runs it and validates Gold; Terraform for schemas, volumes, job |
| Revenue forecast | Know what to expect next | Random Forest 3.4% MAPE (rolling one-day-ahead, 90 days) |
| **Marketplace Control Tower** | Each role knows what to do today | Ranked brief of live signals across revenue, pricing, sellers, fulfillment, inventory, returns, customers and data trust; 9 role pages; entity profiles; ⌘K |
| **New data path** | Bring in data without a full reload | CSV import: validated, idempotent, rejection report; measured on 1M books |
| **Ask with feedback** | Plain-language answers people can rate | Chat with in-prompt attachments; every answer logged; 👍/👎 + comment stored as a preference dataset |
| **Data contracts (Great Expectations)** | Report only numbers that pass the contract | Import contract (46 expectations) + books contract (29), stored runs, auto-run after imports |

## Now

| Item | Objective | Done when |
|---|---|---|
| Re-run the lakehouse with categories as sold | Gold category figures match the books (Electronics 66%) | Next workspace run of `smart-erp-medallion` validates `fact_sales` by category against the seed |
| Schedule the forecast refresh | The outlook never trails the books | Retrain runs after each import or nightly; brief shows no "forecast stale" signal in steady state |
| Close never-finished shipments (H1) | Late-delivery rate built on complete data | H1 warning cleared, or a documented rule closes statuses older than 30 days |
| Learn from ratings | Answers that get better with use | Enough rated answers to train a reward model; first use: rank intent matches and phrasings by 👍 rate |

## Next

| Item | Objective | Measure |
|---|---|---|
| Incremental lakehouse (`MERGE`) | Scale past ~10M rows | Silver/Gold runtime grows with new rows, not total rows |
| Change-data capture into Bronze | Lakehouse reflects imports within minutes | Bronze lag < 15 min (replaces the CSV/volume seam) |
| Alerting on the brief | "Act now" reaches people without opening the app | New *act* signals posted to e-mail/Slack with a link |
| Real cost of goods | Replace the 65% margin assumption | `products.unit_cost` populated; K10 no longer labelled *estimated* |
| Observability | See the system, not just the data | Request latency, brief compute time and contract results as metrics with SLOs |

## Later

| Item | Objective | Note |
|---|---|---|
| Authentication and roles | Each role sees its own brief by default | The role filter already exists; tie it to identity |
| Horizontal scaling | Availability beyond one server | Load balancer, stateless API replicas, pgBouncer, a read replica for the brief |
| Return-propensity model | Predict returns | Only with richer data: no feature in the current source predicts returns (business-model §7, finding 6) |

## History

The project was built in phases: business model → schema → ingestion → API → console → data platform → transformation → Gold → BI/AI → CI/CD → IaC → forecasting → the Control Tower and data contracts. Git history and the merged pull requests hold the detail.
