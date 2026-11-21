# Business model

> **The contract for everything downstream.** Schemas, the seed, the data contracts (Great Expectations), the lakehouse DQ gate, the KPIs and the product all derive from this document. If the data and this document disagree, the document is wrong: fix it here first, then propagate.
>
> Every number below was measured on the source file (`data/amazon-e-commerce/amazon_ecommerce_1M.csv`, 1,000,000 rows) and re-checked by the seed's acceptance checks.

---

## 1. The business in one page

**Smart-ERP runs a multi-seller e-commerce marketplace in India (₹).** Independent sellers list products; customers order through the app, web or tablet; the marketplace takes payment (UPI, cards, cash on delivery) and coordinates delivery with a 1–6 day promise.

| | |
|---|---|
| Period | 31 Mar 2024 → 31 Mar 2026 (24 full months + 1 day) |
| Orders | 1,000,000 (≈ 1,370 a day, every day) |
| Revenue | **₹9,938,876,985** (≈ ₹994 Cr / ₹9.94B) |
| Average order value | ₹9,938.88 |
| Customers / sellers / products | 603,815 / 9,000 / 89,999 |
| Catalogue | 5 categories · 16 subcategories · 12 brands · prices ₹200 – ₹80,000 (median ₹4,972) |
| Cities | Delhi, Mumbai, Bangalore, Chennai, Hyderabad |

**Who decides what — and the question each one brings to the data:**

| Role | Question | KPIs |
|---|---|---|
| Commercial lead | Are we on pace? What drives revenue and margin? | K1, K2, K5, K6, K10 |
| CRM / data science | Who carries revenue, who is drifting away? | K9, K11 |
| Seller manager | Which sellers grow the marketplace, which hurt it? | K7, K3, K4 |
| Fulfillment ops | Are deliveries on time, what is stuck? | K4, K3 |
| Category / inventory | What runs out first, what comes back? | K8, K12 |
| Data owner | Can these numbers be trusted? | rules R1–R9, H1 |

The product built on this ([product.md](product.md)) gives each role one page and a ranked morning brief.

---

## 2. The data

One source row = one purchase = **one order with one line** (the source has no order id and 99.9% of customer-day baskets hold one item). It is normalised into six tables; the schema also supports multi-item orders created through the API.

```
customers 1 ──< orders 1 ──< order_items >── 1 products 1 ──< inventory (stock snapshots)
                                  │
                          sellers 1 ┘
```

| Table | Grain | Rows | Key columns and rules |
|---|---|---|---|
| `customers` | one per buyer | 603,815 | `customer_id` (source `U…`); `home_city` = most frequent city across their orders (ties → most recent) |
| `sellers` | one per seller | 9,000 | `seller_id` (`S…`); `current_rating` = latest snapshot (2.5–5.0) |
| `products` | one per product | 89,999 | `product_id` (`P…`); category, subcategory, brand; `current_price`, rating, reviews = latest snapshot |
| `inventory` | one per product per day observed | ≈ 992,000 | `stock` 0–500; unique (product, date) |
| `orders` | one per order | 1,000,000 | date, ship-to city, payment, device, `delivery_status`, promised `shipping_time_days` 1–6, `source_hash` |
| `order_items` | one per order line | 1,000,000 | `unit_price` and `seller_rating_at_sale` as they were **at the time of sale**; `discount_pct` 0–70; `final_price` |

**Snapshot semantics matter.** Prices, ratings and stock are recorded *per event* in the source (89,981 of 89,999 products change price over time). History lives on the order line (`unit_price`, `seller_rating_at_sale`) and in `inventory`; the entity tables hold the latest value.

**Dropped or moved source columns:** `is_returned` is dropped (identical to `delivery_status = RETURNED`, 115,990 = 115,990: two columns saying the same thing eventually disagree). `location` moves to the order (`ship_to_city`) because 39% of customers order to more than one city.

---

## 3. Order lifecycle

```
              ┌────────────┐
  created ──► │ IN TRANSIT │ 29.4%
              └─────┬──────┘
        ┌───────────┼────────────┐
        ▼           ▼            ▼
   DELIVERED     DELAYED      RETURNED        (terminal, immutable)
     29.5%        29.5%         11.6%
```

- `orders.delivery_status` is the single source of truth. The API allows only `IN TRANSIT → {DELIVERED, DELAYED, RETURNED}`; terminal states never change; every transition is one transaction with an audit-log row.
- `DELAYED` means *delivered, but late*. It is a final outcome, not a step.
- Diagram: [order lifecycle](diagrams/order-lifecycle.html).

---

## 4. Money flow

```
final_price = unit_price × quantity × (1 − discount_pct / 100)      ← what the customer paid
```

- **Revenue** = Σ `final_price`. Enforced by a CHECK constraint with a tolerance of **±₹5.00**: the source rounds from higher precision (largest measured deviation ≈ ₹3.99).
- **Discounts are seller-funded**: average 29%, maximum 70%.
- **Payment**: one method per order; UPI, credit card, debit card and cash on delivery are 25% each.
- **Returns** refund the full `final_price`.
- **Margin is estimated.** The source has no cost of goods, so `unit_cost = 0.65 × unit_price` (a blended marketplace assumption). Under it, a sale breaks even at **35% off**. Every margin figure is labelled *estimated*; if real costs arrive they go to `products.unit_cost` and replace the constant.

---

## 5. KPIs

Each KPI has one formula, one query path, a baseline over the full history, and the decision it supports. The product shows each definition behind a "K" chip next to the number.

| # | KPI | Formula | Baseline | Read it as | Decision |
|---|---|---|---|---|---|
| K1 | Revenue | Σ final_price | ₹9.94B; ₹379–428M per month | What customers paid, before returns | Are we on pace? |
| K2 | Average order value | K1 ÷ distinct orders | ₹9,939 | Size of a typical basket | Bundles, basket thresholds |
| K3 | Return rate | RETURNED ÷ all orders | 11.6% | Share of orders refunded | Who to inspect for quality or listing accuracy |
| K4 | Late deliveries | DELAYED ÷ (DELIVERED + DELAYED) | 50.0% | Of orders that arrived, share that arrived late (in-transit excluded) | SLA conversations with sellers and carriers |
| K5 | Revenue by city / category / month | K1 grouped | Electronics 66% of revenue | Where the money comes from | Where to put stock and marketing |
| K6 | Discount bands | K1 by 0–10 / 10–30 / 30–50 / 50–70% | 39% of lines at 30–50% | How deep promotions go | Which discounts to cap |
| K7 | Seller scorecard | Revenue, orders, rating, K3, K4 per seller vs peers | 111 orders per seller over 2 years | Who grows the marketplace, who hurts it | Grow, coach, performance plan |
| K8 | Stock-critical | Latest stock < 20; days of cover = stock ÷ daily units sold (30 days) | 3,561 products (4.0%) | What runs out first | Reorder or delist |
| K9 | Customer concentration | Cumulative revenue share by customer decile | Top 20% = 62.9%; top 10% = 39.5% | Dependence on the best customers | How much retention is worth |
| K10 | Estimated gross margin | Σ (final_price − 0.65 × unit_price × qty) | 13.5% *(estimated)* | Margin under the cost assumption | Which discount levels lose money |
| K11 | Churn risk | Repeat customer quiet for > 2 × their own average gap (gap ≥ 7 days) | Median gap 188 days | Customers off their usual rhythm | Win-back list, highest value first |
| K12 | Return hotspots | Return rate per category × brand vs baseline, flagged at z ≥ 2 | No pair differs materially (11.3–11.8%) | Where returns are abnormal | What to inspect before promotions |

---

## 6. Ingestion and acceptance contract

**Seed (full refresh):** `CSV ─COPY─► raw.purchases (TEXT, 1:1) ─► staging.purchases (typed, trimmed, enums upper-cased) ─► the six tables`. Re-running rebuilds everything identically (`mise run seed`, ≈ 4 min). It also stores a row fingerprint (`orders.source_hash`, md5 of the canonical row) and moves the id sequences past the seeded ids, so new orders and imports never collide.

**Incremental (CSV import):** same 20 columns, validated row by row by the Great Expectations import contract, appended idempotently (rows whose fingerprint is already in the books are skipped). See [product.md §4](product.md#4-when-new-data-arrives).

**Acceptance checks** — the seed fails unless all pass:

| Check | Expected |
|---|---|
| Raw rows / orders | exactly 1,000,000 / 1,000,000 |
| Customers / sellers / products | 603,815 / 9,000 / 89,999 |
| Orphan order lines (no order, product or seller) | 0 |
| NULL in any key | 0 |
| `final_price` invariant violations (±₹5.00) | 0 |
| Σ `final_price` | ₹9,938,876,985 ± ₹1,000 |

**Rule vocabulary** shared by the OLTP contract (Great Expectations), the import gate and the lakehouse gate: R1 keys present · R2 keys unique · R3 foreign keys resolve · R4 money invariant · R5 allowed values · R6 ranges · R7 date window · R8 revenue checksum (full load) · R9 source schema · H1 lifecycle hygiene (no order "in transit" for more than 30 days).

---

## 7. What the data says (analyst notes)

These findings shape how the KPIs should — and should not — be used.

1. **The marketplace is flat, not growing.** Every full month lands between ₹379M and ₹428M (3% variation); the first 12 months (₹4.98B) match the last 12 (₹4.96B). An earlier version of this document claimed "30× growth (₹13.9M → ₹423.7M a month)": that compared a one-day first "month" (31 Mar 2024) with a full month. **Implication:** trend signals should compare equal windows (which the brief does), and growth targets cannot be calibrated on this history.
2. **Electronics wins on price, not volume.** Each category has ~200,000 orders, but an average Electronics order is ₹32,889 against ₹1,647 for Clothing — 66% of revenue from 20% of orders. Category mix moves revenue far more than order count does.
3. **Discounts are deep, and the deep ones lose money (estimated).** 39% of order lines carry 30–50% off and 7% carry 50–70%. Under the cost assumption, the 30–50% band runs at −3.7% margin and the 50–70% band at −63%; overall estimated margin is 13.5%. Returns do *not* fall or rise with discount depth (11.6–11.8% in every band), so deep discounts buy volume without buying loyalty that shows up here.
4. **Half of completed deliveries are late, regardless of the promise.** The late rate is 50% whether the promise was 1 day or 6. In real operations that would point at the promise logic, not at carriers. Here it is a property of the synthetic data — the product still measures it per seller and city, where differences would be actionable.
5. **≈ 29% of orders stay "in transit" forever.** The share is the same in every quarter, including orders two years old. No 1–6 day promise explains that: those statuses were never closed. The product reports them as a data-hygiene issue (H1, ≈ 281,000 orders) and excludes them from the late-delivery rate instead of counting them as late.
6. **Returns are not predictable from what the data records.** 11.3–11.8% across categories and brands, and essentially zero correlation with discount (0.0007) or seller rating (0.0014). A return-propensity model (K12 as a model) would have no signal to learn on this data; the honest deliverable is the hotspot test, which correctly finds nothing material.
7. **Repeat customers carry the business.** 45% of customers ordered more than once and they bring 67% of revenue; the top 10% of customers bring 39.5%. Typical repeat customers come back every ~6 months (median gap 188 days), so "quiet" must be judged against each customer's own rhythm — which is why K11 uses their personal gap, not a fixed 90 days.
8. **Sellers are long-tail.** The top 10% of sellers make 13% of revenue, and a seller averages ~4–5 orders a month. Per-seller rates over short windows are noisy; flags therefore require a volume floor *and* statistical significance.
9. **Cities, payment methods and devices are evenly split** (≈ ₹2.0B per city; 25% per payment method; 33% per device). That uniformity is a hallmark of synthetic data. The views keep them because real data would not be uniform.

---

## 8. Objectives

**Business objectives the platform serves**

| Objective | Measured by | Where |
|---|---|---|
| Protect revenue pace | K1 vs previous window and forecast | Today, Revenue |
| Stop selling below cost | K10 by discount band, K6 | Revenue, brief "deep discounts" |
| Deliver on the promise | K4 per seller and city; shipments past promise | Fulfillment, Sellers |
| Never miss a sale to a stock-out | K8 days of cover | Inventory |
| Keep the best customers | K9, K11 win-back list | Customers |
| Report only numbers that pass the contract | Great Expectations + lakehouse gate | Data & governance |

**Data-science objectives — and what this data supports**

| Objective | Status | Why |
|---|---|---|
| 30-day revenue forecast | **Shipped**: Random Forest, 3.4% MAPE (rolling one-day-ahead, 90 days); Prophet as second opinion (4.0%) | Stable daily series with weekly pattern |
| Churn risk (K11) | **Shipped as a rule**, per-customer cadence | Interpretable and actionable; a model needs labels that this data does not have |
| Return propensity (K12) | **Not worth a model on this data** — hotspot test shipped instead | No feature correlates with returns (finding 6) |
| Anomaly detection on sellers | **Shipped** as peer percentile + significance | Robust to the long tail (finding 8) |

---

## 9. Assumptions and limits

- **Synthetic source.** Uniform cities, payments and devices, flat revenue, status-independent lateness: treat findings 1, 4, 5, 6 and 9 as properties of the dataset, not of a real market. The pipeline, contracts and product are built to work on real data.
- **Estimated margin.** 65% cost assumption until real costs exist.
- **One line per order** in the source; multi-item orders exist only through the API.
- **Status hygiene.** Never-closed "in transit" orders are excluded from K4 until closed at the source.
