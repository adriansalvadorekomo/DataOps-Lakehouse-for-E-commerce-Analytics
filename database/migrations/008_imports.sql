-- Phase 12 — bulk CSV imports (docs/product.md, "When new data arrives").
-- Idempotent: safe to re-run. Mirrored by Alembic revision 0004_imports.

-- Row fingerprint of the source record that produced an order. Seeded rows and
-- imported rows use the same canonical form (scripts/seed/ingest.py and
-- backend/app/services/imports.py), so re-importing a known row adds nothing.
-- Not UNIQUE: the source may legitimately contain identical rows; imports
-- skip a row whose fingerprint already exists.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_source_hash ON public.orders (source_hash);
-- Cheap data-version probe for the analytics cache (services/analytics.py).
CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON public.orders (updated_at);

CREATE TABLE IF NOT EXISTS public.import_batches (
  batch_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  filename           TEXT        NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'processing',
  rows_total         INTEGER     NOT NULL DEFAULT 0,
  rows_accepted      INTEGER     NOT NULL DEFAULT 0,
  rows_duplicate     INTEGER     NOT NULL DEFAULT 0,
  rows_rejected      INTEGER     NOT NULL DEFAULT 0,
  rejections_by_rule JSONB       NOT NULL DEFAULT '{}'::jsonb,
  first_order_date   DATE,
  last_order_date    DATE,
  revenue_added      NUMERIC(16, 2) NOT NULL DEFAULT 0,
  governance         JSONB,
  error              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at        TIMESTAMPTZ,
  CONSTRAINT import_batches_status_enum CHECK (status IN ('processing', 'completed', 'failed')),
  CONSTRAINT import_batches_counts_nonneg CHECK (
    rows_total >= 0 AND rows_accepted >= 0 AND rows_duplicate >= 0 AND rows_rejected >= 0)
);

CREATE INDEX IF NOT EXISTS idx_import_batches_created ON public.import_batches (created_at);

CREATE TABLE IF NOT EXISTS public.import_rejections (
  rejection_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id     BIGINT  NOT NULL REFERENCES public.import_batches (batch_id) ON DELETE CASCADE,
  line_no      INTEGER NOT NULL,
  rule         TEXT    NOT NULL,
  message      TEXT    NOT NULL,
  raw          JSONB
);

CREATE INDEX IF NOT EXISTS idx_import_rejections_batch ON public.import_rejections (batch_id);

COMMENT ON TABLE public.import_batches IS
  'One row per uploaded CSV: counts, rejection reasons by rule, date range and revenue added.';
COMMENT ON TABLE public.import_rejections IS
  'Rejected rows (first 500 per batch) with the business-model rule they broke.';

-- Seeds insert explicit order ids; move the identity past them so new orders
-- (POST /orders, imports) never collide with a seeded id.
SELECT setval(pg_get_serial_sequence('public.orders', 'order_id'),
              GREATEST((SELECT COALESCE(MAX(order_id), 0) FROM public.orders), 1),
              (SELECT COUNT(*) > 0 FROM public.orders));
SELECT setval(pg_get_serial_sequence('public.order_items', 'order_item_id'),
              GREATEST((SELECT COALESCE(MAX(order_item_id), 0) FROM public.order_items), 1),
              (SELECT COUNT(*) > 0 FROM public.order_items));
