#!/usr/bin/env bash
# =============================================================================
# Seeds a large dataset and benchmarks every hot query against it.
#
#   PGUSER=postgres ./scripts/loadtest/run.sh            # 100,000 students
#   KELEME_LOAD_STUDENTS=25000 ./scripts/loadtest/run.sh # smaller and faster
#
# Drops and recreates `keleme_load`. Never point this at production.
# Results and the analysis of them live in docs/CAPACITY.md.
# =============================================================================
set -euo pipefail
export PGOPTIONS="-c client_min_messages=warning"

DB="${KELEME_LOAD_DB:-keleme_load}"
STUDENTS="${KELEME_LOAD_STUDENTS:-100000}"
PSQL=(psql -v ON_ERROR_STOP=1 -q)

if [[ -n "${DATABASE_URL:-}" ]]; then
  ADMIN=("${PSQL[@]}" "${DATABASE_URL%/*}/postgres")
  TARGET=("${PSQL[@]}" "${DATABASE_URL%/*}/${DB}")
else
  ADMIN=("${PSQL[@]}" -U "${PGUSER:-postgres}" -d postgres)
  TARGET=("${PSQL[@]}" -U "${PGUSER:-postgres}" -d "$DB")
fi

echo "==> Recreating $DB"
"${ADMIN[@]}" -c "drop database if exists ${DB};" >/dev/null
"${ADMIN[@]}" -c "create database ${DB};" >/dev/null

echo "==> Schema"
"${TARGET[@]}" -f tests/supabase_shim.sql >/dev/null
for f in supabase/migrations/*.sql; do "${TARGET[@]}" -f "$f" >/dev/null; done

echo "==> Seeding $STUDENTS students (this takes a few minutes)"
"${TARGET[@]}" -v students="$STUDENTS" -f scripts/loadtest/seed.sql 2>&1 \
  | grep -vE "^(INSERT|SET|ALTER|Time:|VACUUM)" || true

echo ""
echo "==> Benchmarking hot queries"
# The exit status of `psql | grep` is grep's, and a trailing `|| true` discards
# even that — which is how a hard psql error (ON_ERROR_STOP aborting the script
# partway) previously looked identical to a clean run. Capture psql's own
# status and fail loudly on it.
#
# The `|| bench_status=$?` is load-bearing: under `set -e` a bare failing
# assignment exits the script before the next line can read `$?`.
bench_status=0
bench_output="$("${TARGET[@]}" -f scripts/loadtest/bench.sql 2>&1)" || bench_status=$?
printf '%s\n' "$bench_output" | grep -vE "^(CREATE|SET|NOTICE)" || true
if [[ $bench_status -ne 0 ]]; then
  echo ""
  echo "!! bench.sql failed (psql exit $bench_status) — the numbers above are incomplete."
  exit "$bench_status"
fi

cat <<'NOTE'

==> Concurrency

The query timings above are single-query latency. For throughput under
concurrent load, run pgbench against the same database:

  pgbench -d keleme_load -f scripts/loadtest/mixed_workload.sql     -c 25 -j 4 -T 20
  pgbench -d keleme_load -f scripts/loadtest/heartbeat_workload.sql -c 50 -j 4 -T 20

Measured figures and what they mean are in docs/CAPACITY.md.
NOTE
