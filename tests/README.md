# Database tests

`rls_test.sql` is the authorization suite. It proves — against a real
PostgreSQL instance, running as the `authenticated` role with a forged JWT
claim exactly the way PostgREST does — that the security rules KELEME depends
on are enforced by the database and not merely by the user interface.

## Running

```bash
# Against any PostgreSQL 15+ instance
PGHOST=/tmp PGPORT=55432 PGUSER=postgres ./scripts/test-db.sh

# Or against a Supabase branch / any connection string
DATABASE_URL="postgresql://postgres:pass@host:5432/postgres" ./scripts/test-db.sh
```

The script drops and recreates `keleme_test`, installs `supabase_shim.sql`,
applies every migration in order, then runs the suite. **It is destructive —
never point it at production.**

`supabase_shim.sql` exists only so the suite can run without Docker or a hosted
project: it creates the minimum `auth` and `storage` objects Supabase would
otherwise provide. `auth.uid()` is copied verbatim from Supabase, so a policy
that passes here behaves identically in production. It is never applied to a
real Supabase project, which already has these schemas.

## What is covered

| # | Area | What it proves |
|---|------|----------------|
| 1 | Registration hardening | `role: "admin"` in signup metadata is ignored; invalid Ethiopian phone numbers and out-of-range grades are rejected at the database boundary, not just by the form |
| 2 | Grade separation | Grades 9–11 cannot see each other's content or even each other's subject lists; grade 12 reaches the whole 9–12 catalogue |
| 3 | Premium gating | A free student can list a premium item (so the paywall is honest) but cannot read its body through the table or the RPC |
| 4 | Escalation | Ten forged writes — self-promotion to admin, self-granted premium, rewriting study time, streaks, grade, prices, the matric answer key — are all blocked; the legitimate profile edit still succeeds |
| 5 | Matric answer key | No student can select from `matric_question_options` at all; the sanctioned RPC's projection contains no `is_correct`; locked questions withhold text and options; grading is server-side and cannot be replayed |
| 6 | Time anti-cheat | A tab idle for six hours credits at most one 90-second cap; forged activity writes are refused; only one study session stays open per account |
| 7 | Streaks | Consecutive days count, a gap ends the streak, a one-minute day does not qualify, and recomputation is idempotent |
| 8 | Leaderboard privacy | Students who did not opt in appear anonymised as `Student #NNNN` with no real name leak; the projection is structurally asserted to contain no phone, email, school or name field |
| 9 | Referrals | Registration alone pays nothing (pending until first sign-in); five confirmations grant exactly one tier; replaying confirmation cannot pay twice; self-referral and duplicate phone numbers are rejected |
| 10 | Roles | A suspended student loses access while still holding a live entitlement; a content editor manages the catalogue but cannot touch prices or the audit log |

## What is not covered here

Storage object policies are asserted structurally (the policies exist and are
scoped to the right bucket) but the shim does not emulate Supabase's storage
API, so signed-URL issuance is exercised by the application tests instead.
