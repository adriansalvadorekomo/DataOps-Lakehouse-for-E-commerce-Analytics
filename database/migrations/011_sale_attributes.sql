-- Category, subcategory and brand AS SOLD, on the order line (docs/business-model.md §2, §7 finding 9).
-- Idempotent. Mirrored by Alembic revision 0007_sale_attributes.
--
-- In the source these are per-sale attributes: 89,933 of 89,999 product ids appear
-- under more than one category (89,971 under more than one brand). Joining sales to
-- the product's LATEST category misattributes revenue (Electronics showed 24% instead
-- of 66%). Like unit_price and seller_rating_at_sale, they are kept as they were at
-- the time of sale; products keeps the latest values for the catalogue.

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS category    TEXT;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS subcategory TEXT;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS brand       TEXT;

-- Seeded lines: take the values from the source row (staging keeps them after a seed;
-- on a fresh database staging has no row_idx yet, so this is skipped).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'staging' AND table_name = 'purchases' AND column_name = 'row_idx') THEN
    EXECUTE 'UPDATE public.order_items oi
             SET category = s.category, subcategory = s.subcategory, brand = s.brand
             FROM staging.purchases s
             WHERE oi.category IS NULL AND s.row_idx = oi.order_id';
  END IF;
END $$;

-- Lines created without a source row (API orders): the product's current values.
UPDATE public.order_items oi
SET category = p.category, subcategory = p.subcategory, brand = p.brand
FROM public.products p
WHERE oi.category IS NULL AND p.product_id = oi.product_id;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_category_enum') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_category_enum
      CHECK (category IS NULL OR category IN ('Electronics', 'Home', 'Sports', 'Beauty', 'Clothing'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_items_category ON public.order_items (category);
CREATE INDEX IF NOT EXISTS idx_order_items_brand ON public.order_items (brand);
