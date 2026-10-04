# Phase 2 Data-Access Contracts (Smart-ERP Business OS)

> **Status:** 📋 Specified, not built. The phase-1 frontend ships honest fallbacks everywhere a contract below is missing (visible notices, links to the closest working surface).
> **Convention:** per `docs/development.md` — logic in `backend/app/services/`, HTTP in `backend/app/api/`, tests in `backend/tests/`, wire new intents into `services/assistant.py`.

## Why these exist

The entity experiences (`/sellers/:id`, `/products/:id`, `/customers/:id`) and the order workspace are fully composed, but recompose only what current endpoints return. Each gap below names the smallest additive capability that removes a fallback notice. No existing route changes shape; all additions are additive and paginated.

## C1 — Order transaction filters

**Gap:** `GET /orders` filters only by `customer_id` + `delivery_status`, sorts `order_id DESC`, returns no total.
**Contract:** additive query params + `X-Total-Count` header:

```text
GET /orders?seller_id=S2679&product_id=P39256&date_from=2026-01-01&date_to=2026-03-31&sort=total_desc&limit=20&offset=0
```

- `seller_id`, `product_id`: match `order_items` lines (join, distinct orders).
- `date_from`, `date_to`: inclusive `order_date` range (`422` on invalid/empty range).
- `sort`: `newest` (default, current behavior) | `oldest` | `total_desc` | `total_asc` (`total` = Σ line `final_price`).
- `X-Total-Count`: matching rows ignoring `limit/offset`.
- Frontend removes: seller/product drill-down notices, "more follow" pager copy.

## C2 — Seller summary

**Gap:** no `GET /sellers`, no per-seller history; Seller detail reads the top-200 revenue set.
**Contract:**

```text
GET /sellers/{seller_id}/summary
→ { seller_id, current_rating, revenue, lines, avg_rating,
    delayed_rate, return_rate, rank_by_revenue,
    monthly: [{ month: YYYY-MM, revenue, lines }] (trailing 12) }
```

- `404` unknown seller. `monthly` powers the seller revenue-trend block.
- Frontend removes: "outside the watched set" fallback, rank-in-set copy.

## C3 — Product summary

**Gap:** no product aggregates; Product detail reads the low-stock set only.
**Contract:**

```text
GET /products/{product_id}/summary
→ { product_id, category, subcategory, brand, current_price,
    product_rating, review_count, latest_stock, latest_snapshot_date,
    revenue_90d, lines_90d, monthly: [{ month, revenue }] (trailing 12) }
```

- `404` unknown product.

## C4 — Customer summary

**Gap:** Customer detail caps at 100 returned orders; no lifetime totals.
**Contract:**

```text
GET /customers/{customer_id}/summary
→ { customer_id, home_city, first_purchase_date, order_count,
    lifetime_paid, return_rate, cities: [..], monthly: [{ month, paid }] }
```

- `404` unknown customer. `home_city`/`first_purchase_date` already in `customers`.

## C5 — Filtered stats

**Gap:** stats endpoints aggregate everything; Performance cannot scope a breakdown.
**Contract:** additive optional params, same shapes:

```text
GET /stats/revenue-trend?seller_id=&city=&category=
GET /stats/category-trend?city=
GET /stats/city-performance?category=
```

- Each filters the underlying joins; unfiltered behavior unchanged.

## Acceptance per contract

New service + router + `backend/tests/test_*.py` coverage (shapes, `404`/`422`, idempotent reads), `docs/business-model.md` updated if any KPI definition moves, frontend fallback notice removed in the same PR that ships the contract.
