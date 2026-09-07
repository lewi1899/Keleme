# Prompt for a future session

Copy everything between the lines into a new Claude Code chat. It carries the
context a fresh session will not have.

---

## KELEME — scale, speed and roadmap review

I run KELEME, a study platform for Ethiopian students in grades 9–12. I want
you to make it hold more users, run faster, and be a better product. Work from
evidence, not opinion.

### The codebase

- Repo: `https://github.com/lewi1899/Keleme`
- Branch: `claude/interactive-appealing-design-s8xtr1`
- Stack: Next.js 14 (App Router) + Supabase (PostgreSQL, Auth, Storage, RLS)
- ~150 files, 18 SQL migrations, 29 page routes

Clone it and read these first — they will save you from re-deriving things I
already paid to have measured:

| Read | For |
|---|---|
| `docs/CAPACITY.md` | Measured load-test results, the method, and what was NOT tested |
| `docs/SECURITY.md` | The security model and its known limits |
| `README.md` | Architecture and the admin runbook |
| `tests/rls_test.sql` | The 14-section authorization suite |
| `TESTING.md` | How to run everything locally |

### Ground rules

1. **Measure before and after. Never claim an improvement you did not time.**
   The tooling already exists: `npm run loadtest` seeds 100k students and
   benchmarks every hot query; `scripts/loadtest/mixed_workload.sql` and
   `heartbeat_workload.sql` are pgbench scripts for concurrency.
2. **The RLS suite must stay green.** `npm run test:db` — 14 sections. It is
   the safety net for every change you make to a policy or a query. If a
   change makes it fail, the change is wrong, not the test.
3. **Also keep green:** `npm test` (25 unit tests), `npm run typecheck`,
   `npm run lint`, `npm run build`, `npm run check:bundle`.
4. **Tell me what you did not test.** The last session was explicit about its
   gaps; be the same. I would rather have a smaller honest result than a
   larger claimed one.
5. **Recommend, do not just comply.** If something I ask for is a bad idea,
   say so with a reason, then do the version you would actually ship.

### Baseline — where it already is

Measured on 4 vCPU with stock PostgreSQL settings, 100,000 students, 2.4M
activity rows, RLS on, as an authenticated student:

| Workload | Now |
|---|---|
| Page views | ~1,850/sec |
| Heartbeats (main write) | ~4,760/sec |
| Leaderboard page | ~187/sec |
| Storage | 7.9 KB per student |

A previous session already fixed six slow paths (a 1,436ms dashboard query, a
2,114ms leaderboard, per-row RLS function calls, and more). **Do not redo that
work** — read `docs/CAPACITY.md` and the migration comments in `0013`–`0018`
first, then find what is left.

---

## What I want from you

Deliver a **prioritised plan with measured evidence**, then implement the parts
I approve. Cover these four areas.

### 1. Maximum users — what is the next ceiling?

The last test found storage and network latency bind before the code does.
Verify that, then push further:

- Where does it break next? Re-run the load test at **500,000 and 1,000,000
  students** and find what degrades first.
- `daily_activity` is the growth driver (~270 bytes per student per active
  day). Is monthly partitioning worth it, and at what row count?
- The weekly leaderboard is still an 84ms aggregate under its 60-second cache.
  Is a materialised view or a summary table better at 500k users?
- `get_my_rank` is ~43ms per view and cannot be cached across users. Can that
  be made cheap, or should the UI stop showing an exact rank below some
  position?
- Supabase connection limits and Supavisor pooling — what settings does this
  app actually need, and what breaks without them?
- Model the cost curve: what does 10k / 100k / 1M students cost per month on
  Supabase, and where is the sensible upgrade point?

### 2. Speed — including what to REMOVE

I want the app fast on a cheap Android phone on Ethiopian mobile data. Latency
to Frankfurt is ~150–200ms per round trip, so **every request removed is worth
more than every millisecond shaved.**

Known candidates — verify each, do not take my word:

- **Recharts is 102KB and used on exactly one admin screen** (`/admin/analytics`,
  190KB first load). Two simple charts. Replacing it with inline SVG would
  likely remove the whole dependency. Measure the before/after.
- Audit every route's bundle. `/matric/[yearId]/[subjectId]` is 140KB and
  `/premium` is 131KB — find out why and whether it is justified.
- Count the round trips per page. `get_session_context` already batches five
  reads into one; find the pages that still do not.
- Fonts: Plus Jakarta Sans + Inter are self-hosted across six weights. How much
  is that costing on a first visit, and can it be subset?
- What can be statically rendered or cached that currently is not?
- Is anything in `package.json` unused or replaceable with less?

Give me a table of **what to delete, what it saves, and what it costs me.**

### 3. What to add — product, not plumbing

Ranked by impact on real students, with effort estimates.

Things I know are missing, for you to assess rather than assume:

- **Amharic / local language support.** There is no i18n at all. For Ethiopian
  students this may matter more than anything else on this list — tell me what
  it would take.
- **Offline.** `manifest.json` ships but there is no service worker. The
  original build had one plus an IndexedDB cache. On Ethiopian data plans,
  offline reading may be the single biggest feature. What is the right design
  now that content is server-gated?
- **Features from the original build that were never ported:** flashcards with
  SM-2 spaced repetition, an AI tutor, an exam builder, full-text search,
  XP/badges gamification. Which are worth bringing back, and which were right
  to drop?
- **Ads.** The entitlement system computes an ad level per plan, but nothing
  renders an ad. That is real revenue not being collected.
- **Payments.** No provider is connected; there is a working manual
  confirmation flow instead. See `docs/PAYMENTS.md`. What would it take to
  integrate Chapa or Telebirr properly?
- **Push notifications** for streaks and weekly prizes.
- **Search.** Currently a trigram `ilike` on titles only. The spec wanted full
  PostgreSQL full-text search across content.
- Anything you think is more important than the above — say so.

### 4. Risks and quality

- Run `/security-review` on the current branch.
- No rate limiting exists on auth. How exposed is that, and what is the cheapest
  fix?
- Email confirmation is off by default for testing. What should launch settings
  be?
- Are there other bugs of the kind the load test caught — things that only fail
  at scale, or that a broken feature hides behind optimistic UI? The bookmark
  bug was invisible until 100k rows existed.
- What in this codebase will be hardest to maintain in a year?

---

## How to deliver

1. **First, a written plan** — findings, priorities, effort, expected gain, and
   what you propose to cut. Do not start implementing until I have seen it.
2. Then implement what I approve, in reviewable commits, with tests.
3. Update `docs/CAPACITY.md` with any new measurements.

If you find something genuinely broken while investigating, tell me
immediately rather than folding it into the plan.
