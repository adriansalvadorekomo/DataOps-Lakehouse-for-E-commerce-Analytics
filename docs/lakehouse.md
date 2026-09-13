# Lakehouse Reference

Layer contracts, KPI matrix, and data lifecycle details for the Databricks medallion lakehouse.

For the system-level view (why these layers exist, how data flows), see [docs/architecture.md](architecture.md).
For the engineering pipeline (how each stage works), see [docs/data-engineering.md](data-engineering.md).

> **Workspace:** `https://dbc-cba3c27a-ade0.cloud.databricks.com`
> **Companion docs:** [business-model.md](business-model.md) (domain contract) · [decisions.md](decisions.md) (ADRs) · [databricks-free-edition.md](databricks-free-edition.md) (limits)

---

## Bronze contract

**Table:** `workspace.bronze.raw_purchases`
**Format:** Delta Lake, append-only
**Grain:** 1 row per source CSV row (same as `staging.purchases`)

| Column group | Columns | Notes |
|---|---|---|
| Source columns (19) | `user_id`, `product_id`, `category`, `subcategory`, `brand`, `price`, `discount`, `final_price`, `rating`, `review_count`, `stock`, `seller_id`, `seller_rating`, `purchase_date`, `shipping_time_days`, `location`, `device`, `payment_method`, `delivery_status` | Verbatim from source — no types coerced, no enums normalized |
| Audit columns (2) | `_ingest_ts`, `_source` | Added on ingest; never in the source |

**Invariants:**
- `_ingest_ts` is UTC, set at ingest time
- `_source` is `"postgres"` (production JDBC path) or `"csv"` (Free Edition direct load)
- Rows are never deleted or updated — corrections arrive as new downstream snapshots
- Watermark on `purchase_date` — re-running with the same watermark ingests zero rows

**R9 schema check:** `lakehouse/src/bronze/ingest.py::bronze_schema_ok()` verifies all 19 source columns are present.

---

## Silver contract

**Tables:** 6 entity twins under `workspace.silver.*`
**Format:** Delta Lake
**Grain:** matches OLTP tables (see [docs/business-model.md](business-model.md) §2)

### Normalization applied at Silver (one place, never elsewhere)

| Rule | Detail |
|---|---|
| Enum normalization | Source Title-Case → contract UPPERCASE: `"In Transit"` → `"IN TRANSIT"`, `"Delivered"` → `"DELIVERED"`, etc. |
| Whitespace | All TEXT fields stripped of leading/trailing whitespace |
| `home_city` | `mode(location)` per `user_id`; ties broken by most recent `purchase_date` |
| `current_price` | Price at `max(purchase_date)` per `product_id` |
| `current_rating` (sellers) | Rating at `max(purchase_date)` per `seller_id` |
| `product_rating`, `review_count` | Values at `max(purchase_date)` per `product_id` |
| `inventory` dedup | `DISTINCT (product_id, purchase_date, stock)` — last-wins on same-day duplicates |

### Contract enums (Python single source of truth)

Defined in `lakehouse/src/silver/transform.py` and used by both the Python DQ rules and the Databricks SQL transforms — they cannot drift:

```python
DELIVERY_STATUSES = ("IN TRANSIT", "DELIVERED", "DELAYED", "RETURNED")
PAYMENT_METHODS   = ("UPI", "Credit Card", "Debit Card", "Cash on Delivery")
DEVICES           = ("Mobile App", "Web", "Tablet")
CATEGORIES        = ("Electronics", "Home", "Sports", "Beauty", "Clothing")
```

### Money invariant

```python
FINAL_PRICE_TOLERANCE = 5.00  # ₹; source CSV round-trips from higher precision; max ≈₹3.99
# Invariant: abs(final_price - round(unit_price * qty * (1 - discount/100), 2)) <= TOLERANCE
```

### Estimated margin

```python
EST_UNIT_COST_FACTOR = 0.65  # no COGS in source; always label margin figures "estimated"
# estimated_margin = final_price - 0.65 * unit_price * quantity
```

---

## Gold contract

**Tables:** 7 KPI models under `workspace.gold.*`
**Format:** Delta Lake (base tables) + Databricks SQL (serving models)
**Built from:** Silver only — Gold never reads Bronze or any OLTP/raw source (enforced by CI `sql-parse` job)

### Table descriptions

**`fact_sales`** — one row per order line; central revenue fact table

Key columns: `order_id`, `order_date`, `customer_id`, `seller_id`, `product_id`, `category`, `subcategory`, `brand`, `quantity`, `unit_price`, `discount_pct`, `final_price`, `delivery_status`, `estimated_line_margin`, `discount_band`

`discount_band`: `"0-10"` | `"10-30"` | `"30-50"` | `"50-70"` — categorized from `discount_pct`
`estimated_line_margin`: `final_price - 0.65 × unit_price × quantity` — always labeled estimated

---

**`sales_daily`** — revenue and order counts aggregated per day + status split

Key columns: `date`, `revenue`, `orders`, `delivered_count`, `delayed_count`, `returned_count`, `in_transit_count`

---

**`customer_360`** — one row per customer; lifetime value + Pareto tier

Key columns: `customer_id`, `home_city`, `first_purchase_date`, `order_count`, `total_revenue`, `return_count`, `return_rate`, `pareto_tier` (1–5 quintile)

---

**`inventory_kpis`** — latest stock + stock-critical flag per product

Key columns: `product_id`, `category`, `latest_stock`, `latest_date`, `is_stock_critical` (stock < 20)

Baseline: 3,561 stock-critical products (4.0% of catalog).

---

**`dim_customer`**, **`dim_product`**, **`dim_date`** — star schema dimensions

`dim_date` backbone: 2024-03-31 → 2026-03-31

---

## DQ gate — R1–R9 reference

The gate runs between Silver and Gold. A single violation blocks Gold.

| Rule | Checks | Source |
|---|---|---|
| R1 | No NULL in any PK or FK column | `check_no_null_keys()` |
| R2 | Business keys unique (customers, sellers, products) | `check_unique()` |
| R3 | All FK values have a parent row (no orphans) | `check_fk()` |
| R4 | `final_price` invariant within ±₹5.00 on every order line | `check_final_price()` |
| R5 | `delivery_status`, `payment_method`, `device`, `category` within contract enums | `check_enums()` |
| R6 | `quantity ≥ 1`, `discount_pct ∈ [0,70]`, `stock ∈ [0,500]`, `unit_price > 0` | `check_ranges()` |
| R7 | All `order_date` values within 2024-03-31 → 2026-03-31 | `check_date_window()` |
| R8 | Full-load revenue = ₹9,938,876,985 ± ₹1,000 (full refresh only) | `check_revenue()` |
| R9 | Bronze schema has all expected columns | `check_schema()` |

Rules are pure functions in `lakehouse/src/quality/rules.py`. They run identically in local unit tests and on Databricks — same code, no Spark dependency.

**Validated result at 1M rows:** 0 violations across all 11 rule checks.

---

## KPI → Gold table matrix

| KPI | Definition | Gold table | Baseline (1M rows) |
|---|---|---|---|
| K1 Revenue | Σ final_price | `fact_sales` | ₹9,938,876,985 |
| K2 AOV | K1 / order count | `fact_sales` | ₹9,938.88 |
| K3 Return rate | RETURNED orders / all orders | `fact_sales` | 11.60% |
| K4 Delayed rate | DELAYED / (DELIVERED + DELAYED) | `fact_sales` | ≈50% |
| K5 Revenue slices | K1 by city / category / month | `fact_sales` + dims | — |
| K6 Discount bands | K1 by `discount_band` | `fact_sales` | Top band: 10–30% |
| K7 Top sellers | K1 + avg `seller_rating_at_sale` per seller | `fact_sales` | — |
| K8 Stock-critical | Products with latest stock < 20 | `inventory_kpis` | 3,561 |
| K9 Customer Pareto | Cumulative revenue by customer quintile | `customer_360` | Top 20% → 62.9% |
| K10 Est. margin | Σ `estimated_line_margin` | `fact_sales` | Estimated ⚠️ |
| K11 Churn risk | No order in trailing 90d | `customer_360` features | Phase 8 |
| K12 Return propensity | P(return) per customer/category | `customer_360` + `fact_sales` | Phase 8 |

K10 is always labeled estimated — there is no COGS in the source data.
K11 and K12 are ML targets; the feature columns exist in Gold but the models are Phase 8.

---

## Data lifecycle summary

```
Bronze rows        → immutable history; never modified
Silver              → rebuilt deterministically from Bronze + watermark
Gold                → rebuilt from Silver after a green DQ gate
Re-running any step → identical output for the same watermark (idempotent)
```

If Bronze is correct and the DQ gate passes, Gold is correct. The chain is traceable: every Gold row can be traced back to a specific Bronze row, which traces back to a specific source CSV row.

---

## Infrastructure (Terraform)

`infra/terraform/main.tf` owns the workspace assets:
- `workspace.bronze` schema + `landing` volume (CSV) + `documents` volume (RAG)
- `workspace.silver` schema
- `workspace.gold` schema
- `smart-erp-medallion` job (skeleton; task definitions managed by `deploy_job.py`)

Terraform is the one-time provisioning path. Day-to-day job definition updates ship via `scripts/cd/deploy_job.py` (`jobs/reset`).

---

## ML lifecycle

Phase 8 targets (features exist in Gold; models pending):

```
gold.customer_360 + gold.fact_sales
  → feature engineering
  → training (scikit-learn / XGBoost)
  → MLflow experiment (Databricks-native, autolog)
  → model version + metrics
  → batch predictions → gold.*_predictions
```

**Targets (in value order):**
1. Return propensity (K12) — 11.6% base rate, high lift potential per category + seller
2. Churn risk (K11) — no order in trailing 90 days vs. individual cadence

Max two models to start. No model zoo.

---

## Local verification

```bash
# Unit tests for all layer logic (no cluster, no credentials)
python -m unittest discover -s lakehouse/tests

# End-to-end local mirror on 100-row sample
python lakehouse/local_run.py

# Gold contract check against live workspace
mise run dbx-validate
```
