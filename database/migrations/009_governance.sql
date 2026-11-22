-- Phase 13 — data governance with Great Expectations (docs/product.md § Data governance).
-- Idempotent. Mirrored by Alembic revision 0005_governance.
-- One row per validation of the books contract (backend/app/governance/contracts.py).

CREATE TABLE IF NOT EXISTS public.governance_runs (
  run_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trigger           TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'running',
  evaluated         INTEGER     NOT NULL DEFAULT 0,
  successful        INTEGER     NOT NULL DEFAULT 0,
  critical_failures INTEGER     NOT NULL DEFAULT 0,
  warnings          INTEGER     NOT NULL DEFAULT 0,
  results           JSONB,
  error             TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  CONSTRAINT governance_runs_status_enum
    CHECK (status IN ('running', 'passed', 'warning', 'failed', 'error')),
  CONSTRAINT governance_runs_trigger_enum CHECK (trigger IN ('api', 'cli', 'import', 'ci'))
);

CREATE INDEX IF NOT EXISTS idx_governance_runs_started ON public.governance_runs (started_at);

COMMENT ON TABLE public.governance_runs IS
  'Great Expectations runs of the books contract: per-expectation results with rule, severity and samples.';
