-- Assistant interactions and human feedback (docs/product.md § Ask).
-- Idempotent. Mirrored by Alembic revision 0006_ai_feedback.
-- Every answer is logged with its question, mode, intent and sources; users rate it
-- 👍 (+1) or 👎 (−1, optional comment). Together they form a preference dataset for
-- later reward modelling / reinforcement learning from human feedback.

CREATE TABLE IF NOT EXISTS public.ai_interactions (
  interaction_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mode           TEXT        NOT NULL,
  question       TEXT        NOT NULL,
  answer         TEXT        NOT NULL,
  intent         TEXT,
  sources        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  latency_ms     INTEGER,
  rating         SMALLINT,
  comment        TEXT,
  rated_at       TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_interactions_mode_enum CHECK (mode IN ('data', 'docs')),
  CONSTRAINT ai_interactions_rating_enum CHECK (rating IS NULL OR rating IN (-1, 1))
);

CREATE INDEX IF NOT EXISTS idx_ai_interactions_created ON public.ai_interactions (created_at);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_rating ON public.ai_interactions (rating);

COMMENT ON TABLE public.ai_interactions IS
  'Assistant question/answer log with 👍/👎 ratings: the preference dataset for future RLHF.';
