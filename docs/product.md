# Product — the Marketplace Control Tower

> The question every page answers first: **what do I do today, and can I trust the number that tells me so?**

This document explains what the web product is for, who uses it, what it does when new data arrives, and how each screen maps to a business or data-science objective. The numbers and rules behind it are defined in [business-model.md](business-model.md); the system behind it in [architecture.md](architecture.md).

---

## 1. Why it exists

A multi-seller marketplace produces more numbers than anyone reads. Dashboards answer "what are the numbers?"; a team actually needs "**what changed, why, and what should I do about it?**", and needs to know whether the number is trustworthy before acting on it.

The Control Tower turns the books into a short, ranked **morning brief**. Every item:

- is computed **live** from the PostgreSQL books on every load (no nightly extract to go stale),
- carries its **evidence** (the numbers that triggered it) and a **next step**,
- links to the page where the decision is made,
- names the **KPI** it relates to, with the business-model definition one click away,
- uses thresholds that come **from the data itself** (peer percentiles, baseline rates, significance tests), so it stays meaningful when the data changes.

## 2. Who it is for

| Role | Their question | Where they go | Decision it supports |
|---|---|---|---|
| Everyone | What changed, why, and what do I do today? | **Today** | Where to spend the day |
| Commercial lead | Are we on pace? What drives revenue and (estimated) margin? | **Revenue** | Where to push, which discounts to cap |
| CRM / data scientist | Who carries revenue? Who is drifting away? | **Customers** | Who to retain first; size of a win-back campaign |
| Seller manager | Which sellers drive revenue, and which hurt it? | **Sellers** | Grow, coach or put on a performance plan |
| Fulfillment ops | Are deliveries on time? What is stuck? | **Fulfillment** | Which carriers/cities to escalate; which orders to close |
| Category / inventory | What runs out first? What comes back? | **Inventory** | What to reorder, delist, or inspect |
| Planning | What revenue should we expect next? | **Forecast** | Stock and staffing plans |
| Anyone | A question in plain language | **Ask** | — (answers say what they are based on; 👍/👎 ratings are kept) |
| Data owner | Can I trust these numbers? How does new data get in? | **Data & governance** | Whether to report today; what to fix at the source |

## 3. The signals in the brief

Computed by `backend/app/services/insights.py` for the selected window (7, 30, 90 or 365 days, always ending on the **latest order date**, not the wall clock).

| Signal | Rule (data-derived) | KPI | Typical next step |
|---|---|---|---|
| Revenue pace | Current window vs the previous one: ≤ −10% → act, ≤ −3% → watch | K1 | Open Revenue to see which categories/cities explain it |
| Actual vs forecast | Days that were forecast now have actuals: gap ≤ −10% → act | K1 | Refresh the forecast if the gap persists |
| Category momentum | Biggest decline (act if ≥ 15% and ≥ 10% of revenue) and fastest growth | K5 | Review pricing, stock, seller coverage |
| Deep discounts | Estimated margin of the 50–70% band is negative | K6 · K10 | Cap discounts near break-even (35%) |
| Sellers: late deliveries / returns | Above the peer **90th percentile** *and* significantly above the pooled peer rate (**z ≥ 2**), with a volume floor | K4 · K3 · K7 | SLA or listing-quality conversation, largest first |
| Shipments past promise | In-transit orders from the last 30 days older than their promised days | K4 | Chase carriers, oldest first |
| Stock-out risk | Products with stock left and **≤ 14 days of cover** at the last-30-day sales pace | K8 | Reorder, ranked by days of cover |
| Out of stock | Latest snapshot = 0 | K8 | Reorder or delist |
| Return hotspots | Category × brand with return-rate **z ≥ 2** vs baseline, minimum volume scaled to the data | K12 | Inspect listings/quality before promotions |
| Churn risk | Repeat customers quiet for > 2× **their own** usual gap between orders | K11 | Win-back offer, highest lifetime value first |
| Data trust | Contract failures, stale or missing forecast, rejected import rows, never-closed shipments | — | Fix at the source before reporting |
| **Partial window** | Current window holds < 50% of the previous window's orders | — | Check the import covers whole days; revenue/category/customer signals are marked *partial* |

Severity: **act** (do something today) · **watch** (keep an eye on it) · **info** (context). The brief is ordered by severity, then by impact.

**Why the data-derived thresholds matter.** A fixed rule like "flag sellers above 60% late" breaks as soon as the mix changes. Comparing each seller with their peers, and requiring the difference to be statistically unlikely to be chance, keeps the brief honest: in a 30-day window most sellers have fewer than ten orders, and a seller with 6 orders and 100% late is noise, not news.

## 4. When new data arrives

This is the product's answer to "what happens when we add new data?"

```
CSV export ─► Great Expectations import contract ─► append (idempotent) ─► books contract re-validated
                    │                                    │
                    └─► rejected rows, with the rule      └─► every window, KPI and signal moves forward
                        they broke (report per batch)          on the next load; forecast flagged stale
```

1. **Bring it in.** On *Data & governance*, drop a CSV with the same 20 columns as the source (a template is downloadable), or book a single order from *Fulfillment*.
2. **Gate.** The Great Expectations *import contract* checks every row against business-model rules R1 (required / types), R4 (money invariant ±₹5.00), R5 (allowed values), R6 (ranges), R7 (date window). Broken rows are rejected with the rule and the offending value — never silently dropped.
3. **Append, idempotently.** Each row has a fingerprint (`orders.source_hash`, md5 of its canonical form) shared with the seed, so re-uploading a file, or rows already in the books, adds nothing ("already known").
4. **Re-validate the books.** After a successful import, the *books contract* runs automatically.
5. **Everything moves forward.** Windows are anchored on the latest order date, so the brief, KPIs and charts reflect the new days on the next request. The forecast is flagged *stale* until retrained (`mise run forecast`). If the newest days look incomplete, the brief says so instead of reporting a collapse.

Measured end to end on the 1M-order books: a 505-row export (300 new, 200 already known, 5 broken) was validated in 0.8 s; the books moved from 31 Mar to 15 May 2026 and the brief flagged the new period as partial.

## 5. Data governance (Great Expectations)

Contracts are code (`backend/app/governance/contracts.py`); results are stored and shown.

| Contract | Validates | When | Where the result shows |
|---|---|---|---|
| **Import contract** | Every row of an uploaded CSV (pandas) | On upload | Import report (accepted / already known / rejected by rule) |
| **Books contract** | The live PostgreSQL tables in place: keys (R1), uniqueness (R2), foreign keys (R3), money invariant (R4), allowed values (R5), ranges (R6), date window (R7), lifecycle hygiene (H1) | On demand (*Validate now*, `mise run governance`), after every import, in CI | *Data & governance* → Data contract; the Today trust panel; a brief signal on failure |

Each expectation carries its **rule**, a **severity** (`critical`: numbers may be wrong; `warning`: hygiene to fix at the source) and a plain-language **why**. On the seeded books, 28 of 29 expectations pass; the one warning (H1) is real: ≈ 281,000 orders have been "in transit" for more than 30 days, which no 1–6-day promise explains — the status was never closed. The product reports them as a data-hygiene issue rather than counting them as late deliveries.

The lakehouse keeps its own fail-fast gate (R1–R9 in Spark, before Gold builds); see [architecture.md](architecture.md). Same rule vocabulary, two enforcement points: the OLTP books and the analytical copy.

GE runs with usage analytics disabled; no data or metadata leaves the process.

## 6. Ask: plain-language answers, rated by the people who use them

Ask works like a chat (in the spirit of Claude): one prompt box, documents attached *inside* it with the paperclip (or dropped on it), Enter to send, a stop button while it works.

**Answers arrive as a briefing, not a sentence.** Each business answer is a short report card, the way an executive assistant would present it: the report's title and the date the figures run to, the finding as a headline, the key figures, **a visual chosen for the question** (a trend for revenue and basket size, a ranking for cities, sellers and stock, a split for categories and data checks, a curve for customer concentration, revenue and estimated profit by discount, the forecast against actuals, a status stepper for an order), the numbers behind it on request, *what this means*, a button to the page where you act on it, and the natural next questions. The report layer lives in `backend/app/services/reports.py`.

Answers use business language — no table, field, model or API names — and international units (₹9.94B, not ₹994 Cr). They say what they are **based on** in plain words ("All orders to date", "Seller scorecard", "return-policy.pdf · passage 2").

| Answer from | Grounded in | How it avoids inventing |
|---|---|---|
| **Business data** | The marketplace's live records | Deterministic question matching, no language model; a question it cannot answer gets "I won't guess" and what it *can* answer |
| **Our documents** | Attached policies, contracts, notes | Local retrieval picks the relevant passages; the language model (Databricks Foundation Model API) may answer only from them |

**Feedback for later learning.** Every answer is stored with its question, mode and what it was based on (`ai_interactions`). Users rate it 👍 or 👎; a 👎 asks *"What would have been more useful?"*. Ratings can be changed or cleared. `GET /ai/interactions?rated=true` exports the question / answer / rating / comment dataset — the preference data a future reward model (reinforcement learning from human feedback) will learn from. `GET /ai/feedback/summary` shows helpful vs not helpful by question type.

**Working state.** While an answer is prepared, a dot-matrix glyph lights up and a shimmering status line moves through the steps ("Reading the order book…", "Comparing periods…") with the elapsed time — inspired by Claude Code. Answers then appear word by word. All of it stops under `prefers-reduced-motion`.

Databricks Genie (SQL over Gold) is deliberately **not** part of the product: business users want answers, not SQL. It stays an analyst tool inside the Databricks workspace.

## 7. Design choices that serve the user

- **One question per page**, stated in the header, with the decision it supports and the as-of date.
- **Every number explains itself**: KPI chips open the business-model definition, formula, baseline and decision.
- **Business language**: "Late deliveries (of completed orders)", not `delayed_rate`; "Delivered late", not `DELAYED`.
- **Shareable state**: window, role and filters live in the URL.
- **⌘K** jumps to any seller, product, customer, order or page.
- **Accessible**: every chart has a "view as table" toggle; keyboard navigation; WCAG AA colour pairs; motion respects `prefers-reduced-motion`.
- **Identity** — the "Signal" design system, drawn from the author's brand mark (a cloud lit on a dot-matrix display with one orange record in transit): orange is reserved for "act now" and live data, violet for forecasts and AI, dot-matrix numerals for the headline figures. Typography follows the consulting register: Source Serif 4 for headlines, Inter for everything people read and compare, IBM Plex Mono for identifiers.

## 8. API map

| Area | Endpoints |
|---|---|
| Brief & freshness | `GET /insights/brief?days=&role=` · `GET /meta/freshness` · `GET /trust/status` |
| KPIs | `/stats/performance-summary`, `daily-revenue`, `revenue-monthly`, `category-comparison`, `margin`, `city-scorecard`, `pareto-curve`, `churn-risk`, `seller-scorecard`, `fulfillment-funnel`, `in-transit-ageing`, `stock-cover`, `return-hotspots`, `forecast` (+ the original `/stats/*` aggregates) |
| Entities | `GET /sellers/{id}` · `/products/{id}` · `/customers/{id}` · `/search?q=` |
| Orders | `GET/POST /orders` · `GET /orders/{id}` · `PATCH /orders/{id}/status` |
| New data | `POST /imports` · `GET /imports` · `GET /imports/{id}` · `GET /imports/template` · `GET /imports/rules` |
| Governance | `GET /governance/contract` · `GET /governance/runs` · `GET /governance/runs/latest` · `POST /governance/runs` |
| Ask & documents | `POST /ai/ask` · `/ai/ask-docs` · `POST /ai/interactions/{id}/feedback` · `GET /ai/interactions` · `GET /ai/feedback/summary` · `/documents` |

Interactive docs: `http://localhost:8000/docs` when the API runs.
