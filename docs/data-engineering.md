# Data Engineering

This document explains the data pipeline: what enters the system, how it moves through the medallion layers, what transformations occur at each stage, and what the Gold layer provides to consumers. The architectural rationale is in [docs/decisions.md](decisions.md); the schemas are in [docs/business-model.md](business-model.md).

---

## The data source

**File:** `data/amazon-e-commerce/amazon_ecommerce_1M.csv`
**Size:** 133 MB, 1,000,000 rows + header, RFC-4180 CSV, UTF-8
**Git-ignored:** never committed. Place it at the path above before seeding.

The dataset represents 24 months of transaction history (2024-03-31 → 2026-03-31) for a multi-seller marketplace. Each row is one order with one item — the source has no order identifiers, so each CSV row becomes one `orders` row and one `order_items` row.

Key source characteristics that drive engineering decisions:
- **Prices are per-event snapshots.** 89,981 of 89,999 products show price variation across their orders. `products.current_price` is the latest; historical prices live in `order_items.unit_price`.
- **Ratings are per-event snapshots.** Seller and product ratings vary per transaction. Both current state and sale-time history are preserved.
- **Locations are per-order.** 39% of customers placed orders from multiple cities. Location is an order attribute, not a customer attribute.
- **No COGS.** There is no cost data. Margin figures always use `unit_cost = 0.65 × unit_price` (estimated). Every such column is prefixed `estimated_`.
- **`final_price` has float precision noise.** The invariant `final_price = unit_price × quantity × (1 − discount/100)` holds within ±₹5.00 (measured maximum deviation ≈₹3.99 from the source's higher-precision calculation). The DQ gate uses this tolerance, not ₹0.01.

---

## Stage 1 — PostgreSQL ingestion (local / bootstrap)

Before the lakehouse sees any data, the CSV is loaded into PostgreSQL by `scripts/seed/ingest.py`. This step establishes the normalized OLTP schema that the application runs on and that the lakehouse reads from.

**Pipeline:**

```
CSV ─COPY──► raw.purchases     (all TEXT, 1:1 columns, no transforms)
    ──type──► staging.purchases (typed, trimmed, deduplicated keys)
    ────────► customers · sellers · products · inventory · orders · order_items
```

**Why three stages?**

`raw.purchases` is the replayable audit trail. If the ingest logic has a bug, you can re-run normalization from `raw` without re-reading the 133 MB CSV. `staging.purchases` applies types and trimming in one place before any table-specific logic. The normalized tables enforce the business constraints (CHECKs, FKs) and are what the application reads.

**Idempotency:** the ingest script is a full refresh. It truncates `raw` and `staging`, then rebuilds all six normalized tables. Running it twice produces the same result.

**Acceptance checks** run automatically after ingest (`scripts/seed/acceptance.py`). The pipeline fails if any check fails:

| Check | Expected value |
|---|---|
| Raw row count | exactly 1,000,000 |
| Orders | exactly 1,000,000 |
| Customers / sellers / products | 603,815 / 9,000 / 89,999 |
| Orphan `order_items` (no parent order) | 0 |
| Orphan `order_items` (no product or seller) | 0 |
| NULL in any PK or FK | 0 |
| `final_price` invariant violations | 0 (tolerance ±₹5.00) |
| Revenue Σ `final_price` | ₹9,938,876,985 ± ₹1,000 |

Run with:
```bash
mise run seed
```

---

## Stage 2 — Bronze (raw landing)

Bronze is the lakehouse's audit trail. It stores a byte-faithful snapshot of the source data with two audit columns added.

**Table:** `workspace.bronze.raw_purchases`
**Format:** Delta Lake, append-only
**Source:** `staging.purchases` read via JDBC snapshot

Every Bronze row carries:
- All source columns verbatim (19 columns: `user_id`, `product_id`, `category`, ..., `delivery_status`)
- `_ingest_ts` — UTC timestamp when this row was ingested
- `_source` — `"postgres"` (production JDBC path) or `"csv"` (Free Edition direct load)

**Watermark:** `max(purchase_date)` in the existing Bronze table. On first load (empty Bronze), all rows are ingested. On subsequent runs, only rows with `purchase_date > watermark` are appended. Re-running with the same watermark ingests zero rows.

**What Bronze does NOT do:** no type coercion, no enum normalization, no business logic. The raw `"In Transit"` string lands exactly as it came from the source. That is the point — corrections are always downstream, and Bronze is always replayable.

**Notebook:** `lakehouse/notebooks/01_bronze_backfill.py`

**Local verification** (no cluster):
```python
from lakehouse.src.bronze.ingest import bronze_schema_ok, watermark_filter
```

---

## Stage 3 — Silver (clean entities)

Silver turns the flat Bronze snapshot into the six analytical entities that mirror the OLTP schema. This is where every business rule about data shaping is defined — exactly once.

**Tables:**

| Table | Grain | Key transformation |
|---|---|---|
| `silver.customers` | 1 per buyer | `home_city = mode(location)` per customer; ties → most recent order |
| `silver.sellers` | 1 per seller | `current_rating = rating at max(purchase_date)` |
| `silver.products` | 1 per product | `current_price / rating / review_count` at `max(purchase_date)` |
| `silver.inventory` | 1 per product per date | Distinct `(product_id, purchase_date, stock)`, last-wins on same-day dupes |
| `silver.orders` | 1 per order | `delivery_status` normalized to uppercase; deterministic surrogate key |
| `silver.order_items` | 1 per order line | 1:1 with orders; `seller_rating_at_sale` preserved |

**Normalization applied at Silver:**
- All Title-Case source enums are uppercased: `"In Transit"` → `"IN TRANSIT"`, `"Delivered"` → `"DELIVERED"`, etc.
- Whitespace trimmed from all TEXT fields
- Types enforced (dates as `DATE`, prices as `DECIMAL`)

**Why grouping logic belongs in Silver, not elsewhere:**

`home_city = mode(location)` could be computed in Gold, or in the API, or in a dashboard query. Putting it in three places means three opportunities to compute it differently. Silver defines it once; everyone else reads the Silver value.

The same principle applies to latest-snapshot logic for prices and ratings. Silver is the single home for "how do we derive a current value from a history of snapshots."

**The money invariant:**
```python
abs(final_price - round(unit_price * quantity * (1 - discount_pct / 100), 2)) <= 5.00
```
Silver validates this but does not reject rows that fail — it flags them for the DQ gate. The DQ gate is what blocks Gold.

**Notebook:** `lakehouse/notebooks/02_silver_build.py`
**Source module:** `lakehouse/src/silver/transform.py`

---

## Stage 4 — DQ gate (R1–R9)

The DQ gate is a checkpoint between Silver and Gold. If any rule fails, Gold does not build. The last known good Gold remains intact.

**Nine rules:**

| Rule | What it checks |
|---|---|
| R1 | No NULL in any PK or FK column |
| R2 | Business keys unique (customers, sellers, products) |
| R3 | Every FK value has a parent (no orphan order_items) |
| R4 | `final_price` invariant within ±₹5.00 on every order line |
| R5 | `delivery_status`, `payment_method`, `device`, `category` all within contract enums |
| R6 | `quantity ≥ 1`, `discount_pct ∈ [0, 70]`, `stock ∈ [0, 500]`, `unit_price > 0` |
| R7 | All `order_date` values parseable and within 2024-03-31 → 2026-03-31 |
| R8 | Full-load revenue Σ `final_price` = ₹9,938,876,985 ± ₹1,000 (only for full refreshes) |
| R9 | Bronze schema conformance — expected columns present |

**What happens on failure:** the `dq_gate` Databricks task exits non-zero. Workflows stops. `gold_build` and `sql_refresh` are never triggered. The run appears as `INTERNAL_ERROR` in the Workflows UI.

**What the DQ gate is not:** it is not a data correction layer. It never coerces or defaults. A violation means something is genuinely wrong with the data (or the pipeline). Fix the data or the pipeline, then re-run.

**Local verification** (no cluster):
```python
from lakehouse.src.quality.rules import check_final_price, check_enums, check_revenue
# All nine rules are pure functions over plain Python dicts — no Spark needed
```
```bash
# Run the full local mirror (Bronze → Silver → DQ → Gold on sample data)
python lakehouse/local_run.py
```

**Notebook:** `lakehouse/notebooks/03_dq_gate.py`
**Source module:** `lakehouse/src/quality/rules.py`, `lakehouse/src/quality/runner.py`

**Validated result:** at 1M rows, all nine rules pass. Zero violations.

---

## Stage 5 — Gold (KPI models)

Gold contains only named KPI models. Nothing speculative, nothing that isn't consumed by a real downstream (BI dashboard, ML pipeline, AI assistant).

**Seven Gold tables:**

**`fact_sales`** — one row per order line, enriched with dimensions. The spine of revenue analytics.

Key columns: `order_id`, `order_date`, `customer_id`, `seller_id`, `product_id`, `category`, `quantity`, `unit_price`, `discount_pct`, `final_price`, `delivery_status`, `estimated_line_margin`, `discount_band`.

`discount_band` categorizes discount_pct into four bands (0–10, 10–30, 30–50, 50–70%) — the grouping that drives the K6 effectiveness analysis.

`estimated_line_margin = final_price - 0.65 × unit_price × quantity`. The `estimated_` prefix is enforced by a CI check (the pipeline fails if this column is renamed without the prefix).

**`sales_daily`** — revenue, order counts, and status split aggregated per day. Feeds the revenue trend chart.

**`customer_360`** — one row per customer with lifetime value, order count, return rate, and Pareto tier (which quintile of the revenue distribution they belong to). Feeds the K9 Pareto KPI and ML churn features.

**`inventory_kpis`** — latest stock per product, `is_stock_critical` flag (latest stock < 20). 3,561 stock-critical products at the validated baseline.

**`dim_customer`, `dim_product`, `dim_date`** — dimension tables for the star schema backbone. `dim_date` spans 2024-03-31 → 2026-03-31.

**SQL files:** `lakehouse/sql/gold/` — four `.sql` files, one per serving model. These run via the `sql_refresh` Databricks SQL task against the SQL warehouse.

**What Gold does NOT contain:** raw order data, staging data, OLTP tables, or any business rule not already in Silver. Gold consumes Silver; it does not redefine entities.

**Notebook:** `lakehouse/notebooks/04_gold_build.py`
**Source module:** `lakehouse/src/gold/models.py`

---

## KPI reference

All KPIs derive from the Gold tables above. Baseline values are from the validated 1M-row dataset.

| KPI | Formula | Source | Baseline |
|---|---|---|---|
| K1 Revenue | Σ final_price | fact_sales | ₹9,938,876,985 |
| K2 AOV | revenue / orders | fact_sales | ₹9,938.88 |
| K3 Return rate | RETURNED / all orders | fact_sales | 11.60% |
| K4 Delayed rate | DELAYED / (DELIVERED + DELAYED) | fact_sales | ≈50% |
| K5 Revenue slices | K1 grouped by city/category/month | fact_sales + dims | — |
| K6 Discount bands | K1 by discount_band | fact_sales | top band: 10–30% |
| K7 Top sellers | revenue × avg rating per seller | fact_sales | — |
| K8 Stock-critical | products with latest stock < 20 | inventory_kpis | 3,561 |
| K9 Pareto | cumulative revenue share by customer | customer_360 | top 20% → 62.9% |
| K10 Est. margin | Σ estimated_line_margin | fact_sales | estimated ⚠️ |
| K11 Churn risk | no order in trailing 90 days | customer_360 | Phase 8 target |
| K12 Return propensity | P(return) per customer/category | customer_360 + fact_sales | Phase 8 target |

K10 is always labeled estimated because there is no real COGS in the source data.
K11 and K12 are ML targets — the features exist in Gold, the models are Phase 8.

---

## The pipeline job

The five tasks run in sequence. Databricks Workflows enforces the dependency graph.

```
bronze_ingest
     │
silver_build
     │
 dq_gate          ← fails here if R1–R9 violated; Gold untouched
     │
gold_build
     │
sql_refresh       ← materializes Gold serving views via SQL warehouse
```

**Job definition:** `lakehouse/workflows/smart_erp_job.json`
**Deploy:** `python3 scripts/cd/deploy_job.py` (sends `jobs/reset` to the Databricks API)
**Run:** `python3 scripts/cd/databricks_release.py` (triggers the job, polls for completion)
**Validate:** `python3 scripts/cd/dbx_validate.py` or `mise run dbx-validate`

**Typical runtime:** 15–25 minutes for the full 1M-row pipeline on serverless compute.

---

## Local development without a cluster

The entire data path logic can be verified locally — no Databricks credentials, no cluster.

```bash
# Unit tests — pure functions (rules, transforms, models)
python -m unittest discover -s lakehouse/tests

# End-to-end local mirror — Bronze → Silver → DQ gate → Gold on sample data
python lakehouse/local_run.py
```

The unit tests cover all nine DQ rules, all Silver transforms, and the Gold model builders. They run in the CI pipeline on every PR (no credentials required).

---

## Revenue forecasting

The `/stats/forecast` endpoint serves 30-day revenue projections built by two models:

- **Random Forest** (`scikit-learn`) — trained on daily revenue features (day-of-week, rolling means, trend)
- **Prophet** — seasonal decomposition with Indian holiday calendar

Both models train on the full order history in PostgreSQL. Output is written to `public.revenue_forecasts` (60 rows: 30 × 2 models).

```bash
mise run forecast    # retrain both models and update the table
```

The forecast is a second opinion, not a guarantee. The models are trained on 24 months of historical data with a strong upward trend. Extrapolation beyond the training window should be treated with appropriate skepticism.

---

## Where to go next

- Running the pipeline end-to-end: [docs/operations.md](operations.md)
- The domain model and business KPI definitions: [docs/business-model.md](business-model.md)
- Why medallion over alternatives: [docs/decisions.md](decisions.md)
- Lakehouse layer contracts (Bronze/Silver/Gold schemas): [docs/lakehouse.md](lakehouse.md)
