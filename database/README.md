# Database

PostgreSQL schema for Smart-ERP. **Domain contract:** [docs/business-model.md](../docs/business-model.md).

---

## Schema layout

> **Diagram:** [Core OLTP schema — 5 tables with FK relationships](../docs/diagrams/db-schema.html)

| Schema | Purpose |
|---|---|
| `raw` | CSV landing — `raw.purchases` (all TEXT, 1:1 with source) |
| `staging` | Typed intermediate — `staging.purchases` (trimmed, typed, before normalization) |
| `public` | OLTP tables (application reads/writes) |

```
customers 1 ──── ∞ orders 1 ──── ∞ order_items ∞ ──── 1 products
                                                         │
sellers 1 ──── ∞ order_items                             │
               products 1 ──── ∞ inventory (snapshots) ──┘
```

Additional tables in `public`:

```
audit_log          Append-only mutation log (written in-transaction with every state change)
revenue_forecasts  RF + Prophet 30-day projections (written by forecast refresh job)
documents          User-attached business documents metadata
document_chunks    Text chunks + embeddings for RAG
```

---

## Migrations

Applied in filename order by `apply.sh`. All are idempotent.

| File | What it does |
|---|---|
| `001_schemas.sql` | Creates `raw` and `staging` schemas |
| `002_core_tables.sql` | Six core OLTP tables, FKs, CHECKs, indexes, `updated_at` triggers |
| `003_raw_staging.sql` | `raw.purchases` (CSV landing) + `staging.purchases` (typed intermediate) |
| `004_final_price_tolerance.sql` | Widens the `final_price` CHECK from ±₹0.01 to ±₹5.00 (source CSV rounds from higher precision; measured max deviation ≈₹3.99) |
| `005_audit_log.sql` | `audit_log` table — append-only mutation trail, written in the same transaction as each change |
| `006_revenue_forecasts.sql` | `revenue_forecasts` table — RF + Prophet daily projections; UNIQUE on `(model, target_date)` makes reruns idempotent |
| `007_documents.sql` | `documents` + `document_chunks` tables — RAG document registry and text chunks with embeddings |

`002_core_tables.sql` uses DROP + CREATE (not IF NOT EXISTS) — it is an early-scaffold full refresh. All later migrations use `IF NOT EXISTS` and are safely rerunnable.

---

## Key invariants enforced in DDL

These constraints exist in the database layer and cannot be bypassed by the application:

**Money invariant:**
```sql
CHECK (abs(final_price - round(unit_price * quantity * (1 - discount_pct / 100), 2)) <= 5.00)
```
`final_price` must equal `unit_price × quantity × (1 − discount_pct/100)` within ±₹5.00. The tolerance accounts for the source CSV's higher-precision calculation that round-trips to up to ₹3.99 difference.

**Order lifecycle:**
```sql
CHECK (delivery_status IN ('IN TRANSIT', 'DELIVERED', 'DELAYED', 'RETURNED'))
```
Terminal states (`DELIVERED`, `DELAYED`, `RETURNED`) are made immutable by the application layer (the API refuses transitions from terminal states). The database enforces the enum; the application enforces the directed graph.

**Other range constraints:**
- `seller_rating` / `product_rating`: 0.0–5.0
- `shipping_time_days`: 1–6
- `discount_pct`: 0–70
- `stock`: 0–500
- `inventory (product_id, snapshot_date)`: UNIQUE (idempotent re-ingestion)

---

## Applying migrations

The `apply.sh` script applies all migrations in order. It reads connection settings from the standard `PG*` environment variables.

```bash
# Using mise defaults (local embedded Postgres)
./database/apply.sh

# Explicit connection
PGHOST=/tmp/opencode PGPORT=5434 PGUSER=magrey PGDATABASE=smart ./database/apply.sh

# Verify
psql -h /tmp/opencode -p 5434 -U magrey -d smart -c "\dt public.*"
```

The script is idempotent — running it twice produces the same result. `mise run dev-db` calls it automatically as part of Postgres startup.

In CI, the `database-sanity` job applies all migrations against a fresh Postgres container and asserts that the core tables and invariant constraints exist.

---

## Alembic (backend migrations)

The backend also manages schema state via Alembic (`backend/alembic/`). Three Alembic versions mirror the SQL migrations for the tables the application owns:

| Version | Tables |
|---|---|
| `0001_initial.py` | Core OLTP tables (customers, sellers, products, inventory, orders, order_items, audit_log) |
| `0002_revenue_forecasts.py` | `revenue_forecasts` |
| `0003_documents.py` | `documents`, `document_chunks` |

Alembic runs automatically when the Docker container starts (`backend/docker-entrypoint.sh`). Locally, `./database/apply.sh` is the primary migration path — both produce the same schema.

---

## Source data relationship

The CSV (`data/amazon-e-commerce/amazon_ecommerce_1M.csv`) loads into `raw.purchases`, then normalizes into the six core tables via `scripts/seed/ingest.py`. The seed script enforces the acceptance checks in [docs/business-model.md](../docs/business-model.md) §6 before the ingest is considered complete.

See [docs/data-engineering.md](../docs/data-engineering.md) for the full ingestion pipeline.
