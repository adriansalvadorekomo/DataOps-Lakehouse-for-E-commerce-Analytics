# Frontend — Data Product (Phase 5)

> **Status:** ✅ Question-driven console for marketplace stakeholders. Run guide: [`frontend/README.md`](../frontend/README.md).

## What it is

The frontend is the consumption and decision layer of the data platform. It turns committed data into answers for commercial, fulfillment, and data-trust stakeholders rather than doing client-side metric calculations. Business measures come from backend services through stable API paths.

```
OLTP / Gold models → FastAPI endpoints → typed API client → TanStack Query / pages
```

## Stakeholder routes and calls

All backend paths below are stable paths prefixed by the frontend API base (`/api` by default).

| Route | Stakeholder label | Business purpose | Actual backend calls |
|---|---|---|---|
| `/` | Today | Marketplace health, revenue outlook, geographic and seller attention | `GET /stats/overview`, `GET /stats/revenue-trend?days=90`, `GET /stats/forecast?trailing=90`, `GET /stats/pareto`, `GET /stats/city-performance`, `GET /stats/seller-performance?limit=20`, `GET /stats/revenue-by-category` |
| `/ask` | Ask | Ask governed questions using Live books, Briefs, or Databricks | `POST /ai/ask`, `POST /ai/ask-docs`, `POST /ai/ask-genie` |
| `/sales` | Revenue | Revenue drivers, category movement, city performance, discount bands, and sellers | `GET /stats/category-trend`, `GET /stats/city-performance`, `GET /stats/discount-bands`, `GET /stats/seller-performance` |
| `/sellers` | Sellers | Seller performance and attention flags | `GET /stats/seller-performance` |
| `/operations` | Needs action | Fulfillment, stock, and data-quality exceptions | `GET /stats/city-performance`, `GET /stats/stock-critical`, `GET /stats/dq-checks` |
| `/orders` | Orders | Find and filter operational orders | `GET /orders` |
| `/orders/:id` | Order detail | Inspect and transition one order | `GET /orders/{id}`, `PATCH /orders/{id}/status` |
| `/new` | Book order | Submit an operational order | `POST /orders` |
| `/documents` | Briefs | Attach, process, search, and remove grounding files | `GET /documents`, `POST /documents`, `POST /documents/search`, `DELETE /documents/{id}` |
| `/pipeline` | How numbers are trusted | Explain live integrity checks and the latest manually recorded Databricks validation | `GET /stats/overview`, `GET /stats/dq-checks` |

## Ask modes

The interface uses stakeholder labels while retaining distinct technical engines:

- **Live books** calls `POST /ai/ask`. It is deterministic, uses no LLM, and computes supported answers from committed orders, stats, and forecast services.
- **Briefs** calls `POST /ai/ask-docs`. Retrieval and synthesis are grounded only in attached files; without grounding it reports that it cannot answer from the documents.
- **Databricks** calls `POST /ai/ask-genie`. Genie creates SQL for each question against published Gold data and returns the answer, SQL, rows, and source metadata.

Ask answers are stateless and never perform actions. Technical evidence such as SQL, endpoint paths, parameters, passages, chunks, and scores remains available through optional disclosures.

## Order booking contract

The booking form submits each line's unit price, quantity, and discount percentage. The server validates the request, computes and persists `final_price`, creates the order and lines, and records the corresponding inventory transaction. The frontend does not claim to fetch or enforce catalog pricing.

## Databricks validation snapshot

`BACKFILL` in `frontend/src/lib/constants.ts` is a manually maintained, static validation snapshot. It records the last known validated Bronze, Silver, and Gold counts and revenue for stakeholder context; it is not a live Databricks status feed.

The browser contains no Databricks personal access token (PAT) and does not poll workspace jobs or workflows. The Pipeline page's live calls cover PostgreSQL overview and mirrored data-quality rules only. Operators follow the outbound workspace link and authenticate there when they need current workflow state.

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
