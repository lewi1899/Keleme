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

Nothing in the schema. The slowest remaining query is the weekly leaderboard
aggregate at 84ms, and it is computed once a minute and shared.

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
