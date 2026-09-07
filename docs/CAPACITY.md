# Capacity

Measured, not estimated. Everything below comes from a real dataset and a real
concurrent load test; the method is in `scripts/loadtest/` so you can re-run it.

**Short answer: the code is not what limits you.** After the fixes described
below, the database serves ~1,850 page views per second and ~4,760 heartbeats
per second on four cores. The real ceilings are your Supabase plan's storage
and your budget — not the schema.

---

## What was tested

| | |
|---|---|
| Hardware | 4 vCPU, 15GB RAM |
| PostgreSQL | 16.13, **stock settings** (128MB shared_buffers, 4MB work_mem) |
| Students | 100,000 |
| Daily activity rows | 2,400,480 (60 days, 40% of students active) |
| Content items | 10,000 |
| Matric questions | 5,000 with 20,000 options |
| Entitlements | 12,517 |
| Database size | 769 MB |

The stock PostgreSQL settings are deliberate. A tuned instance would look
better; these numbers are a floor, not a best case.

Every query was run **as the `authenticated` role with a forged JWT claim** —
the same path a student's request takes through PostgREST — so RLS was on and
every policy was being evaluated. A benchmark run as superuser skips all of
that and reports numbers the app never sees.

Reproduce it:

```bash
createdb keleme_load
psql -d keleme_load -f tests/supabase_shim.sql
for f in supabase/migrations/*.sql; do psql -d keleme_load -f "$f"; done
psql -d keleme_load -v students=100000 -f scripts/loadtest/seed.sql
psql -d keleme_load -f scripts/loadtest/bench.sql
pgbench -d keleme_load -f scripts/loadtest/mixed_workload.sql -c 25 -j 4 -T 20
```

---

## Throughput

Concurrent clients, 20-second runs:

| Workload | Throughput | Latency at that rate |
|---|---|---|
| Page view (session + dashboard reads) | **1,850 / sec** | 13ms at 25 clients |
| Heartbeat (the main write) | **4,760 / sec** | 10ms at 50 clients |
| Leaderboard page | **187 / sec** | 27ms at 5 clients |

### What that means in students

Turning throughput into users needs an assumption about behaviour, so here is
the one used: an actively studying student loads a page roughly every 30
seconds and sends one heartbeat a minute.

| | Ceiling |
|---|---|
| Concurrent students, from the heartbeat path | ~285,000 |
| Concurrent students, from the page-view path | **~55,000** |
| Registered students | not limited by these tests — limited by storage, below |

The page path binds first, so **roughly 55,000 students studying at the same
moment** on this hardware. Halve it if your students navigate twice as fast;
it is still a number you will not approach for a long time.

A useful sanity check: 55,000 concurrent is not 55,000 registered. If 5% of
your students are online at once — a healthy figure for an education platform
— that is over a million registered accounts before the database is the
problem.

---

## What actually limits you

In the order you will hit them.

### 1. Supabase plan storage — the first real wall

Measured: **7.9 KB per student**, including 60 days of activity history.

> **Superseded by migration 0020.** Two redundant indexes on `daily_activity`
> accounted for most of that. Re-measured after dropping them: **4.5 KB per
> student**, which roughly doubles every ceiling in the table below. See
> "Fix 2 — the storage wall was mostly indexes" at the end of this document
> for the corrected figures.

| Plan | Database | Students it holds (60 days of history) |
|---|---|---|
| Free | 500 MB | **~55,000** |
| Pro ($25/mo) | 8 GB | ~900,000 |

Growth is dominated by `daily_activity` at ~270 bytes per student per active
day. A student active three days a week costs about 42 KB a year.

The free tier is genuinely enough to launch and grow into. You would move to
Pro for storage, not for speed.

### 2. Network latency to Ethiopia

Not measured here, and probably larger than everything else on this page.
Frankfurt is roughly 150–200ms round trip from Addis Ababa. Every request pays
it, so a 15ms query is a 200ms page.

This is why the app batches: `get_session_context` returns the profile,
entitlements, ad level, streak and device validity in **one** call rather than
five. Five sequential calls would cost a second before rendering anything.

Choose the closest Supabase region and treat round trips, not milliseconds of
query time, as the thing to economise.

### 3. Supabase free-tier operational limits

- **50,000 monthly active users** on Auth
- **5 GB bandwidth** per month
- **1 GB file storage** — matters if you upload many PDF textbooks
- **Projects pause after 7 days of inactivity** — irrelevant once you have real
  users, a nuisance while testing

### 4. Everything else

Nothing in the schema *at 100,000 students*. That qualifier turned out to
matter — see "Beyond 100,000" below, which re-ran this at 500,000 and
1,000,000 and found two things that do not hold.

---

## What was fixed to get here

The first run was not good. These were real problems, found by measuring:

| Query | Before | After | What was wrong |
|---|---|---|---|
| Dashboard: this week's study time | **1,436ms** | **0.1ms** | Filtered by date only, letting RLS filter the rest. Scanned 320,000 rows and discarded every one. |
| Leaderboard, weekly | **2,114ms** | **84ms** | The period filter sat inside the aggregate, so the whole 2.4M-row table was scanned for a 7-day board. |
| Content listing | **131ms** | **15ms** | The RLS policy called a plpgsql function once per row — 9,500 calls for one page of 24. |
| Admin: premium filter | **355ms** | **15ms** | A `CASE` around an `EXISTS` stopped the planner using a semi-join. |
| Admin: 30-day chart | **284ms** | **76ms** | Joined `generate_series` against the whole activity table. |
| Leaderboard page under load | **30/sec** | **187/sec** | Recomputed per viewer; now cached for 60 seconds and shared. |

### The one lesson worth carrying forward

**RLS decides which rows you may see. It does not help the planner decide
which rows to read.**

```sql
-- 1,436ms — scans every student's week, discards 320,000 rows via RLS
select sum(seconds) from daily_activity where activity_date >= '2026-09-01';

-- 0.031ms — same answer, same security, one index lookup
select sum(seconds) from daily_activity
where user_id = auth.uid() and activity_date >= '2026-09-01';
```

46,000× apart. Always filter by `user_id` explicitly on per-user tables. RLS is
the safety net, never the query plan.

The second lesson: in a policy, write `(select auth.uid())` rather than
`auth.uid()`. The subquery form is hoisted into an InitPlan and evaluated once;
the bare call runs per row. The one exception is `profiles`, where wrapping it
causes infinite recursion — the note in migration 0014 explains why.

---

## Two bugs the load test found

Worth recording, because neither would have shown up in functional testing at
small scale.

1. **Bookmarking was completely broken.** `bookmarks.user_id` is `NOT NULL`
   with no default and the client sends only `content_id`, so every insert
   failed the policy check. The optimistic UI made it look like it had worked,
   then silently reverted. Fixed in migration 0015; there is now a regression
   test.

2. **`study_sessions` grew without limit.** One row per student per session,
   never removed — 89,000 rows and 20MB from a twenty-second write test. At
   10,000 daily active students that is roughly 800MB a year of working state.
   Migration 0018 adds `prune_old_sessions()`.

---

## Operating this

**Monthly**, run the retention prune. From the SQL editor:

```sql
select public.prune_old_sessions(30);
```

It deletes closed study sessions and revoked device sessions older than 30
days. It never touches `daily_activity`, `payments`, `entitlements` or
`audit_logs` — those are the record.

**Watch** Database → Usage in the Supabase dashboard. Storage is the number
that will move.

### When to do more

Do these when the number says so, not before. Each is a real change with a real
cost.

| Signal | Action |
|---|---|
| Storage approaching your plan's limit | Upgrade, or archive `daily_activity` older than a year into a summary table |
| Catalogue beyond ~50,000 items | Add a persisted `tsvector` column and GIN index; title search currently uses trigram |
| Leaderboard feels stale | Lower the 60-second cache in `src/lib/queries/leaderboard.ts` — but measure first |
| `daily_activity` beyond ~10M rows | Partition by month |
| Sustained CPU above 80% on Supabase | Upgrade compute; the queries are not the problem |

---

## What was NOT tested

Being explicit, because these gaps are real:

- **The Next.js layer.** These are database numbers. The application server
  adds its own rendering time and its own concurrency limits.
- **PostgREST overhead.** Supabase's API layer sits between the app and
  PostgreSQL and adds latency this test bypasses.
- **Real Supabase hardware.** A free-tier instance is smaller and shared; a
  Pro instance is dedicated. Expect the free tier to be slower than these
  figures and Pro to be comparable or better.
- **Network latency**, which is likely to dominate everything (see above).
- **Storage bandwidth** for PDF downloads.
- **Sustained load.** The longest run was 20 seconds. Nothing here proves
  behaviour over hours, or under vacuum pressure with months of churn.

The honest summary: the schema and queries have been measured and are not the
constraint. The parts that were not measured are the hosting plan and the
network, and both are things you buy rather than things you code.

---

# Beyond 100,000

Everything above was measured at 100,000 students. This section re-runs the
same tooling at **500,000 and 1,000,000** on the same hardware (4 vCPU, 15GB,
PostgreSQL 16.13, stock settings, RLS on, authenticated role) and records what
broke, what was done about it, and what is still open.

Absolute numbers here run slightly slower than the figures above — the weekly
leaderboard reproduced at 100.0ms rather than 84ms, `get_my_rank` at 60.8ms
rather than 43ms — so every before/after below is measured on one machine in
one session rather than compared across runs.

## First, a correction

**The admin benchmarks in `bench.sql` had never run.** `seed.sql` created no
staff profile, so the first admin call raised `forbidden`, `ON_ERROR_STOP`
aborted psql, and `run.sh` discarded the status twice over — the exit code of
`psql | grep` is grep's, and a trailing `|| true` swallowed even that. A failed
run printed every student-path table and exited 0.

The admin figures quoted in the table above (355ms → 15ms, 284ms → 76ms) did
not come from this tooling. Both are fixed in `0019`-era commits; the admin
numbers below are the first this suite has produced.

## Where it degrades

| Query | 100k | 500k | 1M | Shape |
|---|---|---|---|---|
| session context | 0.9ms | 0.9ms | 0.9ms | **flat** |
| heartbeat | 0.1ms | 0.1ms | 0.1ms | **flat** |
| weekly seconds (user-filtered) | 0.1ms | 0.1ms | 0.1ms | **flat** |
| list content, one subject | 21.7ms | 22.9ms | 22.3ms | **flat** |
| search content by title | 23.4ms | 24.1ms | 23.6ms | **flat** |
| leaderboard all-time | 0.2ms | 0.2ms | 0.2ms | **flat** |
| **my rank (weekly)** | 60.8ms | **586.5ms** | 367.8ms* | linear |
| **leaderboard weekly** | 100.0ms | **692.3ms** | **1,537.9ms** | linear |
| **leaderboard monthly** | 136.4ms | **996.6ms** | **2,264.5ms** | linear |
| admin dashboard metrics | 94.3ms | 507.6ms | 822.7ms | linear |
| admin student search by name | 103.2ms | 502.7ms | 1,026.5ms | linear |
| admin 30-day activity chart | 100.1ms | 453.4ms | 873.4ms | linear |

\* The 1M figure for `get_my_rank` is lower than the 500k one because the
planner switched to a parallel plan at that table size. It is not an
improvement; the work still grows with the data.

The read paths that 0013–0018 fixed are genuinely flat — session context and
the heartbeat cost the same at a million students as at a hundred thousand.
Everything that aggregates `daily_activity` across all students grows with it.

**`get_my_rank` is the one that actually breaks the app.** The board is cached
for 60 seconds and shared, so its cost is paid once a minute for the whole
site. `get_my_rank`'s threshold is the calling student's own seconds, so no two
students share a result and nothing caches across them — every dashboard load
pays a full period aggregate. At a million students that is a second of
database time per page view, which is not a slow page, it is an outage.

## Fix 1 — rank and board from a summary (migration 0019)

Stop deriving the ranking per request; derive it per interval.

- `leaderboard_top` — exact ranks for the head of the board, 5,000 rows/scope.
- `leaderboard_dist` — a ~200-point cumulative distribution for the long tail.

Refresh cost is one aggregate plus ~1,200 row writes per scope, **independent
of student count**. A full per-student summary would also make reads O(1) but
would churn 400,000 rows a minute at a million students and hand the problem to
autovacuum instead.

| Query | 500k before | 500k after | 1M before | 1M after |
|---|---|---|---|---|
| my rank (weekly) | 586.5ms | **0.2ms** | 367.8ms | **0.2ms** |
| leaderboard weekly | 692.3ms | **0.4ms** | 1,537.9ms | **0.3ms** |
| leaderboard monthly | 996.6ms | **0.4ms** | 2,264.5ms | **0.1ms** |

The after-numbers at 1M are the same as at 500k. That is the property worth
having: reads no longer scale with the student body at all.

Refresh cost, paid once per interval rather than once per request:

| Scope | 500k | 1M | Schedule |
|---|---|---|---|
| weekly | 1.16s | 5.15s | every minute |
| monthly | 1.18s | 3.99s | every 5 minutes |
| all-time | 1.00s | 1.74s | every 15 minutes |

### Accuracy, measured against ground truth

Ground truth built with the function's own ordering (`seconds desc,
current_streak desc, public_no`), not a weaker one:

| True rank | Reported (1M) | Error |
|---|---|---|
| 1 | 1 | 0 |
| 500 | 500 | 0 |
| 5,000 | 5,000 | 0 |
| 5,001 | 4,841 | −160 (3.20%) |
| 50,000 | 48,401 | −1,599 (3.20%) |
| 150,000 | 150,041 | +41 (0.03%) |
| 300,000 | 297,661 | −2,339 (0.78%) |
| 399,000 | 396,881 | −2,119 (0.53%) |

Exact through the head of the board; every tail error inside the 2,420-row
sampling step, as designed.

### What this trades away

- Ranks are as stale as the refresh interval. The board was already 60s stale
  via the app's cache, so nothing changes there. `get_my_rank` was live and is
  now not.
- Below rank 5,000 the rank is approximate. The response says so
  (`approximate: true`) and carries a percentile; the dashboard shows
  "Top 18%" rather than a six-digit ordinal it cannot justify.
- **Correctness never depends on the refresh running.** A missing or stale
  scope falls back to the live 0013 path, so a project that never schedules it
  behaves exactly as it did before, only slower than one that does.

## Fix 2 — the storage wall was mostly indexes (migration 0020)

The section above is right that a Supabase plan's storage binds first. It was
looking in the wrong place. At 500,000 students:

| | |
|---|---|
| `daily_activity` heap | 876 MB |
| `daily_activity` indexes | **2,289 MB** (2.6× the data) |
| whole database | 3,573 MB |

Four indexes on one table; two earn nothing:

- `daily_activity_date_idx` `(activity_date, user_id)` — **830 MB, 0 scans**
  across a full seed and the entire benchmark suite. 0013 added `period_idx`
  with the same leading column plus `INCLUDE (user_id, seconds)`.
- `daily_activity_user_date_idx` `(user_id, activity_date DESC)` — 511 MB and
  a million scans, but the primary key is `(user_id, activity_date)`: same
  columns, same order, differing only in the second column's direction. A
  btree reads backwards as cheaply as forwards.

Verified with both dropped, on the two shapes the app actually issues:

```
where user_id = ? and activity_date >= ?
  -> Index Scan using daily_activity_pkey            13 buffers, 0.172ms
where user_id = ? order by activity_date desc limit 5
  -> Index Scan Backward using daily_activity_pkey   10 buffers, 0.038ms
```

| | 500k | 1M |
|---|---|---|
| Database before | 3,573 MB | 7,093 MB |
| Database after | **2,232 MB** | **4,411 MB** |
| Per student | 7.32 → **4.57 KB** | 7.26 → **4.52 KB** |

Every student-facing benchmark unchanged across two full runs. The one line
that regresses is the bench's own anti-pattern canary, "week activity (NO user
filter, RLS only)", 120ms → 145ms — the app reads `daily_activity` in exactly
one place and always with `.eq("user_id", ...)`.

### What that does to the plan ceiling

Recomputed at the measured 4.5 KB/student:

| Plan | Database | Students, before | Students, after |
|---|---|---|---|
| Free | 500 MB | ~65,000 | **~110,000** |
| Pro ($25/mo) | 8 GB | ~1,100,000 | **~1,800,000** |

## Still open

Ranked by what would bite first.

1. **Admin paths are linear and uncached.** 822ms dashboard metrics, 1,026ms
   student search by name at 1M. `admin_dashboard_metrics()` is six
   `count(*) FILTER (...)` over every student row — inherently O(n), not
   optimisable, but eminently cacheable: every figure on it is a site-wide
   total and none is per-viewer. The obvious `unstable_cache` wrapper does
   **not** work as-is: the callback cannot use `cookies()`, and a service-role
   client has no `auth.uid()` so the function's own `is_staff()` check would
   reject it. Doing this properly means a service-role-callable variant, which
   moves a security check out of the database — worth it only when staff
   actually feel the latency. Not done, deliberately.
2. **`daily_activity` partitioning.** Not needed yet. With the index diet the
   table is 876 MB of heap at 500k and the only full-range scan left is the
   leaderboard refresh, which is off the request path. Monthly partitioning
   becomes worth it when retention (0018) starts deleting old rows in bulk —
   `DROP PARTITION` is instant where `DELETE` of 12M rows is not — so the
   trigger is the first retention sweep, not a row count.
3. **Connection limits.** Untested here. Every measurement in this document is
   single-connection latency or pgbench against a local socket; none of it
   exercises Supavisor.

## Not tested

Being explicit, as the previous run was:

- **No pgbench concurrency runs at 500k or 1M.** All the figures in this
  section are single-query latency. The throughput numbers earlier in this
  document (1,850 page views/sec, 4,760 heartbeats/sec) were measured at 100k
  and have **not** been re-measured at the larger sizes.
- **No Supabase connection-pooling test.** No Supavisor, no connection limits,
  no PostgREST in the path — these are direct libpq connections.
- **No network latency.** Everything is a local unix socket. The 150–200ms
  Addis–Frankfurt round trip still dominates any figure here.
- **The refresh schedule is untested end to end.** `pg_cron` is not installed
  in the local cluster, so the scheduling block was exercised only by its
  `else` branch. The refresh function itself was called directly and measured.
- **Seeded data is synthetic and uniform.** Real study time is bursty and
  clustered around exams; a real weekly aggregate may be cheaper (fewer active
  students) or more skewed than these numbers suggest.
