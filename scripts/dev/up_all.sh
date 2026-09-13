#!/bin/sh
# One command for the whole local stack: Postgres → backend → frontend.
# Usage: mise run dev   (stop everything with: mise run stop-all)
# Refuses to start over occupied ports instead of producing ghost servers.
set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOGDIR="$ROOT/logs"
mkdir -p "$LOGDIR"

cd "$ROOT"
echo "→ [1/3] database"
sh "$ROOT/scripts/dev/db_up.sh"

busy() { curl -sf -m 2 -o /dev/null "http://127.0.0.1:$1$2" 2>/dev/null; }
if busy 8000 /health || busy 5173 /; then
  echo "ERROR: :8000 or :5173 already serving — run 'mise run stop-all' first." >&2
  exit 1
fi

echo "→ [2/3] backend"
setsid nohup uv run uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 \
  >"$LOGDIR/dev-backend.log" 2>&1 < /dev/null & disown
for i in $(seq 1 30); do busy 8000 /health && break; sleep 2; done
busy 8000 /health || { echo "ERROR: backend never came up — see logs/dev-backend.log" >&2; exit 1; }

echo "→ [3/3] frontend"
cd "$ROOT/frontend"
setsid nohup npm run dev -- --port 5173 --strictPort --host 127.0.0.1 \
  >"$LOGDIR/dev-frontend.log" 2>&1 < /dev/null & disown
cd "$ROOT"
for i in $(seq 1 30); do busy 5173 / && break; sleep 2; done
busy 5173 / || { echo "ERROR: frontend never came up — see logs/dev-frontend.log" >&2; exit 1; }

echo "✓ stack up:  app http://localhost:5173  api http://localhost:8000/health"
echo "  logs: logs/dev-backend.log logs/dev-frontend.log   stop: mise run stop-all"
