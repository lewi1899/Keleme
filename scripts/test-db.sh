#!/usr/bin/env bash
# =============================================================================
# Runs the migrations and the RLS suite against a throwaway PostgreSQL
# database. Works against a local cluster or a Supabase branch — anything a
# libpq connection string can reach.
#
#   ./scripts/test-db.sh                                  # uses $DATABASE_URL
#   PGHOST=/tmp PGPORT=55432 ./scripts/test-db.sh         # local cluster
#
# The target database is DROPPED and recreated. Never point this at production.
# =============================================================================
set -euo pipefail

# The migrations are idempotent (drop policy if exists ...), which is noisy at
# NOTICE level. Warnings and above still surface.
export PGOPTIONS="-c client_min_messages=warning"

DB_NAME="${KELEME_TEST_DB:-keleme_test}"
PSQL_BASE=(psql -v ON_ERROR_STOP=1 -q)

if [[ -n "${DATABASE_URL:-}" ]]; then
  ADMIN_URL="${DATABASE_URL%/*}/postgres"
  TEST_URL="${DATABASE_URL%/*}/${DB_NAME}"
  ADMIN=("${PSQL_BASE[@]}" "$ADMIN_URL")
  TARGET=("${PSQL_BASE[@]}" "$TEST_URL")
else
  ADMIN=("${PSQL_BASE[@]}" -U "${PGUSER:-postgres}" -d postgres)
  TARGET=("${PSQL_BASE[@]}" -U "${PGUSER:-postgres}" -d "$DB_NAME")
fi

echo "==> Recreating $DB_NAME"
"${ADMIN[@]}" -c "drop database if exists ${DB_NAME};" >/dev/null
"${ADMIN[@]}" -c "create database ${DB_NAME};" >/dev/null

echo "==> Installing local Supabase shim (auth + storage schemas)"
"${TARGET[@]}" -f tests/supabase_shim.sql >/dev/null

echo "==> Applying migrations"
for f in supabase/migrations/*.sql; do
  printf '    %s\n' "$(basename "$f")"
  "${TARGET[@]}" -f "$f" >/dev/null
done

echo "==> Running RLS and authorization suite"
"${TARGET[@]}" -f tests/rls_test.sql 2>&1 | grep -Ev '^(NOTICE|$)' || {
  echo "FAILED"
  exit 1
}

echo "==> OK"
