#!/bin/sh
# Self-healing local PostgreSQL for development — no docker, no root needed.
# - Binaries: embedded pgserver venv under ~/.local (reinstalled if wiped).
# - Data: ~/.local/share/smart-erp-pgdata (survives reboots; NOT /tmp).
# - Socket: /tmp/opencode (recreated each boot; matches mise.toml PG* defaults).
# - Ensures role/db exist and the schema is migrated; seeding (scripts/seed/)
#   stays an explicit, separate step.
set -e

VENV="$HOME/.local/share/smart-erp-pgvenv"
PGDATA="$HOME/.local/share/smart-erp-pgdata"
SOCKDIR="/tmp/opencode"
PORT="${PGPORT:-5434}"

if [ ! -x "$VENV/bin/python" ]; then
  echo "→ creating embedded-postgres venv"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q pgserver
fi
PGBIN="$(echo "$VENV"/lib/python*/site-packages/pgserver/pginstall/bin)"
export PATH="$PGBIN:$PATH"
mkdir -p "$SOCKDIR"

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "→ initdb $PGDATA"
  initdb -D "$PGDATA" -U postgres --auth=trust -E UTF8 >/dev/null
fi
if ! pg_isready -h "$SOCKDIR" -p "$PORT" >/dev/null 2>&1; then
  echo "→ starting postgres (socket $SOCKDIR:$PORT)"
  pg_ctl -D "$PGDATA" -l "$SOCKDIR/pg.log" \
    -o "-p $PORT -k $SOCKDIR -c listen_addresses=''" start >/dev/null
fi
for i in $(seq 1 30); do
  pg_isready -h "$SOCKDIR" -p "$PORT" >/dev/null 2>&1 && break
  sleep 1
done

PSQL="psql -h $SOCKDIR -p $PORT -U postgres -v ON_ERROR_STOP=1"
$PSQL -tc "SELECT 1 FROM pg_roles WHERE rolname='magrey'" | grep -q 1 \
  || $PSQL -c "CREATE ROLE magrey SUPERUSER LOGIN;" >/dev/null
$PSQL -tc "SELECT 1 FROM pg_database WHERE datname='smart'" | grep -q 1 \
  || $PSQL -c "CREATE DATABASE smart OWNER magrey;" >/dev/null

# Schema (idempotent): core tables must exist or every endpoint 500s.
if ! $PSQL -d smart -tc "SELECT to_regclass('public.orders')" | grep -q orders; then
  echo "→ applying migrations"
  PGHOST="$SOCKDIR" PGPORT="$PORT" PGUSER=magrey PGDATABASE=smart \
    sh "$(dirname "$0")/../../database/apply.sh" >/dev/null
fi
echo "✓ postgres ready ($SOCKDIR:$PORT, db smart)"
