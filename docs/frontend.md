# Frontend — Data Product (Phase 5)

> **Status:** ✅ Question-driven console for marketplace stakeholders. Run guide: [`frontend/README.md`](../frontend/README.md).

## What it is

The frontend is the consumption and decision layer of the data platform. It turns committed data into answers for commercial, fulfillment, and data-trust stakeholders rather than doing client-side metric calculations. Business measures come from backend services through stable API paths.

```
OLTP / Gold models → FastAPI endpoints → typed API client → TanStack Query / pages
```

## Design system

The console is designed as a dense operations tool, not a marketing surface: operators scan numbers fast and act on exceptions. That is why display-serif headlines and border-top ghost metrics were replaced with a card-based console language.

- **Palette (premium warm neutrals):** bone ground `#f6f5f1`, warm ink text `#1c1917`, white cards on hairline warm borders `#e2ded5`. Ember `#ea6a33` is the single brand accent (primary actions, brand mark, attention highlights); status colors are muted jewel tones (forest `#4a6b3e`, ochre `#a2592f`, brick `#8f3a28`). No gradients, no purple/indigo defaults.
- **Type:** Geist sans throughout with tight tracking — 20px semibold page titles, 15px semibold section titles, 11px uppercase tracked micro-labels. Business measures use tabular numerals; technical evidence (IDs, endpoints, SQL) uses Geist Mono.
- **Shell (`AppShell`):** slim white sidebar (240px, grouped sections, filled active state) plus a sticky blurred topbar with a section/title breadcrumb and a live trust badge (`GET /trust/status`, sharing the sidebar strip's React Query cache so there is no second fetch). Content is capped at 88rem on a 24px vertical rhythm with 16px card gaps.
- **Surfaces:** `.panel` (white card, hairline border, subtle shadow) is the default container for metrics, filters, errors, and disclosures. Tables are 14px with uppercase 12px sticky headers.
- **Ask workspace exception:** the terminal panel stays inverted (warm ink ground). It is a deliberate tool metaphor, not a second theme.
- **Accessibility posture:** skip link, visible focus rings, focus-trapped mobile drawer, 44px touch targets on links and buttons (the `min-h-11` overrides are intentional), skeleton/error/empty states on every async surface, and `prefers-reduced-motion` support.

## Stakeholder routes and calls

All backend paths below are stable paths prefixed by the frontend API base (`/api` by default).

| Route | Stakeholder label | Business purpose | Actual backend calls |
|---|---|---|---|
| `/` | Today | Marketplace performance with equal-period comparisons, revenue outlook, and attention | `GET /stats/performance-summary?days={30|90|365}`, `GET /stats/overview`, `GET /stats/revenue-trend`, `GET /stats/forecast`, `GET /stats/pareto`, `GET /stats/city-performance`, `GET /stats/seller-performance`, `GET /stats/revenue-by-category` |
| `/ask` | Ask | Ask governed questions using Live books, Documents, or Genie AI | `GET /trust/status`, `POST /ai/ask`, `POST /ai/ask-docs`, `POST /ai/ask-genie` |
| `/sales` | Revenue | Revenue drivers, category movement, city performance, discount bands, and sellers | `GET /stats/category-trend`, `GET /stats/city-performance`, `GET /stats/discount-bands`, `GET /stats/seller-performance` |
| `/sellers` | Sellers | Seller performance and attention flags | `GET /stats/seller-performance` |
| `/operations` | Needs action | Fulfillment, stock, and data-quality exceptions | `GET /stats/city-performance`, `GET /stats/stock-critical`, `GET /stats/dq-checks` |
| `/orders` | Orders | Find and filter operational orders | `GET /orders` |
| `/orders/:id` | Order detail | Inspect and transition one order | `GET /orders/{id}`, `PATCH /orders/{id}/status` |
| `/new` | Book order | Submit an operational order | `POST /orders` |
| `/documents` | Documents | Attach, process, search, and remove grounding files | `GET /documents`, `POST /documents`, `POST /documents/search`, `DELETE /documents/{id}` |
| `/pipeline` | How numbers are trusted | Explain live integrity, real Databricks workflow evidence, forecast freshness, AI readiness, and dated Gold validation | `GET /trust/status` |
| `/customers` | Customers | Revenue concentration and customer lookup | `GET /stats/pareto` |
| `/customers/:id` | Customer detail | Returned orders, paid total, return rate, cities | `GET /orders?customer_id=&limit=100` |
| `/sellers/:id` | Seller detail | Commercial, operational and screening-rule context | `GET /stats/seller-performance?limit=200` |
| `/products/:id` | Product detail | Stock position and estimated revenue exposure | `GET /stats/stock-critical?limit=200` |
| `/inventory` | Inventory | Health bands, exposure estimates, sortable review list | `GET /stats/stock-critical?limit=200` |
| `/performance` | Performance | Window comparison, category momentum, metro and seller breakdowns | `GET /stats/performance-summary`, `GET /stats/category-trend`, `GET /stats/city-performance`, `GET /stats/seller-performance` |
| `/forecast` | Forecast | Batch outlook vs actuals, freshness, assumptions | `GET /stats/forecast`, `GET /trust/status` |

Entity detail pages recompose existing endpoints; gaps (seller/product order drill-down, lifetime customer totals, filtered stats) are specified in [`docs/data-access-contracts.md`](data-access-contracts.md) and surfaced in-product as notices, never fabricated.

## Ask modes

The interface uses stakeholder labels while retaining distinct technical engines:

- **Live books** calls `POST /ai/ask`. It is deterministic, uses no LLM, and computes supported answers from committed orders, stats, and forecast services.
- **Documents** calls `POST /ai/ask-docs`. Retrieval and synthesis are grounded only in attached files; without grounding it reports that it cannot answer from the documents.
- **Genie AI** calls `POST /ai/ask-genie`. Genie creates SQL for each question against published Gold data and returns the answer, SQL, rows, and source metadata.

Ask answers are stateless and never perform actions. Technical evidence such as SQL, endpoint paths, parameters, passages, chunks, and scores remains available through optional disclosures.

## Order booking contract

The booking form submits each line's unit price, quantity, and discount percentage. The server validates the request, computes and persists `final_price`, creates the order and lines, and records the corresponding inventory transaction. The frontend does not claim to fetch or enforce catalog pricing.

## Performance comparisons

`GET /stats/performance-summary` anchors its current window to the latest order date and compares it with the immediately preceding equal-length window. The backend owns revenue, order, AOV, return-rate, and delayed-rate calculations plus absolute and relative changes. When the previous value is zero, relative change is `null`; the frontend does not manufacture a percentage.

## Trust architecture

`GET /trust/status` composes four separate evidence layers: live PostgreSQL integrity checks, latest Databricks workflow metadata, forecast freshness, and Genie configuration. The backend calls the Databricks Jobs API using server-side credentials, normalizes technical results into business impact, and degrades safely when the workspace or permission is unavailable.

The dated Gold contract validation remains a distinct snapshot. A successful workflow run confirms processing completed; it does not by itself replace the documented row-count and revenue validation. The browser contains no Databricks personal access token (PAT), never calls workspace APIs directly, and receives no raw credentials or privileged error details.

## Data flow

```
Browser ──same-origin /api──► Vite dev proxy ──► uvicorn :8000 ──► PostgreSQL
        (VITE_API_URL override for separate deploys; backend CORS then applies)
```

- In development, Vite proxies `/api` to `http://localhost:8000`.
- For separate deployments, `VITE_API_URL` supplies the API base and the backend must allow the frontend origin through `FRONTEND_ORIGINS`.
- `frontend/src/lib/api.ts` is the frontend network boundary. It provides typed JSON and multipart requests; pages do not call `fetch` directly.
- TanStack Query handles server-state caching and document-processing polling.

## Stack

Vite, React 19, strict TypeScript, Tailwind v4, shadcn/ui primitives, TanStack Query, React Router, Recharts, and Lucide icons. `npx tsc -b` gates TypeScript correctness.
