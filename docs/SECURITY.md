# Security model

The governing principle: **the database is the security boundary, not the
application.** Every rule that matters is a Row Level Security policy or a
`SECURITY DEFINER` function. The Next.js layer decides what to *draw*; it never
decides what a student is *allowed to see*.

This matters because Supabase's anon key is public by design — it ships in the
browser bundle. Anyone can take it and talk to PostgREST directly, skipping
every line of application code. So the only rules worth having are the ones
that hold when they do.

`tests/rls_test.sql` proves this by running as the `authenticated` role with a
forged JWT claim, exactly as PostgREST executes a student's request.

---

## Authentication

**Registration** collects the phone number, grade and school *before* the
account is created — they travel with the `signUp` call and the profile is
written by a trigger on `auth.users`, so there is no window where an account
exists without them.

That trigger is treated as the security boundary rather than the route that
normally calls it. Since anyone can POST directly to GoTrue with arbitrary
metadata — including `"role": "admin"` — the trigger:

- hard-codes `role = 'student'`, never reading it from metadata;
- re-normalises the phone number in SQL and rejects a non-Ethiopian one;
- clamps the grade to 9–12.

A direct-to-GoTrue signup claiming admin therefore produces an ordinary
student. The RLS suite asserts this explicitly.

**Sign-in** returns one message for both a wrong password and an unknown email,
so the form cannot be used to test whether an address has a KELEME account.

---

## One account, one device

Supabase's JWT is stateless: once issued it stays valid until it expires, and
there is no server-side handle to revoke it mid-flight. Single-session
enforcement therefore needs state of its own.

- Sign-in generates a random token, stores **only its SHA-256 hash** in
  `user_sessions`, and puts the raw token in an httpOnly cookie.
- The same call revokes every other session for that account.
- Every authenticated page validates the token, folded into the same query that
  fetches the session context — so it costs no extra round trip.

Because only the hash is stored, a database dump — or an administrator reading
the table — cannot be replayed to impersonate a student.

Suspension revokes sessions immediately rather than waiting for the next token
refresh.

---

## Content protection

Spec section 22 asks for screenshot prevention. Here is the honest position.

### What is genuinely enforced

**HTML study notes have no file and no URL.** They are stored in
`content_html_bodies` — a table separate from `content_items` under a stricter
policy — and delivered through `get_content_html()`, which checks published
state, grade and entitlement before returning a single row. There is no storage
object, so there is nothing to share, cache or hotlink.

The split into two tables is what makes the paywall honest *and* safe: a free
student can read `content_items` (so they see that a premium note exists and
can decide to buy) while `content_html_bodies` refuses them entirely. A crafted
PostgREST query gets the title and nothing else.

**PDFs live in a private bucket.** No student holds a storage policy on
`content-pdfs`. The only path is `/api/content/[id]/pdf`, which:

1. asks the **database** whether this caller may have this item, using the
   caller's own session — so RLS decides, not the route;
2. only then uses the service role to sign a URL, and only for the
   `storage_path` on that row.

The service role never sees a path from the request. Changing the id in the URL
changes what step 1 answers for.

**The matric answer key is unreadable.** Students have no `SELECT` policy on
`matric_question_options` at all. Questions arrive through
`get_matric_questions()`, which projects options *without* `is_correct`, and
marking happens inside `submit_matric_answer()`. There is nothing in the page
source, the network payload or React state to read ahead.

### What is deterrence, not enforcement

The protected viewer suppresses the context menu, drag, copy and print, and
overlays a watermark carrying the student's own name. This stops casual
copying, which is most of it, and makes a leaked screenshot traceable.

### What a browser cannot do

**A web page cannot prevent a screenshot.** The OS screenshot key, a second
phone pointed at the screen, and developer tools are all outside the page's
reach. Any product claiming otherwise in a browser is wrong.

Real screen-capture blocking needs `FLAG_SECURE` on Android or
`isSecureTextEntry`-equivalent handling on iOS. The delivery path here is built
to port to that unchanged — see [MOBILE.md](MOBILE.md).

---

## Authorization

### Grades

`grade_can_access(viewer, content)` is one function used by RLS policies,
server routes and tests alike, so the three cannot drift. Grades 9–11 are
walled off from each other; grade 12 reaches 9–12.

Subjects and units are filtered too, not just content — otherwise a grade 9
student could enumerate the entire grade 12 syllabus structure.

### Entitlements

Premium status is **not** denormalised onto the profile. A boolean there would
go stale the moment a subscription lapsed at midnight. `has_active_entitlement`
reads live rows with real dates, and is the single authority.

Entitlements have no INSERT or UPDATE policy for `authenticated` at all. The
only path is `grant_entitlement()`, which is revoked from `authenticated` and
reachable only through the admin wrapper or the service role.

### Roles

| Role | Can |
|---|---|
| `student` | Their own data, content their grade and plan allow |
| `content_editor` | The catalogue and matric questions |
| `admin` | Everything, including people, money and settings |

Content editors are excluded from student records, prices, rewards, settings
and the audit log. Removing the last administrator is refused **in SQL**, not
in the UI.

Admin nav items a content editor cannot use are removed rather than disabled —
but that is presentation. `requireAdmin` and RLS are the controls.

---

## Anti-cheat

Everything a student could profit from inflating is written by
`SECURITY DEFINER` functions only. `study_sessions` and `daily_activity` carry
a `SELECT` policy and deliberately no `INSERT`/`UPDATE` policy, so a forged
write is refused or matches zero rows.

The client may say "I am still here" and nothing else:

| Attack | What stops it |
|---|---|
| Leaving a tab open all night | Each heartbeat credits `min(elapsed, 90s)` — an idle stretch earns one cap, not eight hours |
| Spamming the heartbeat endpoint | Same clamp from the other direction: it credits real elapsed time and no more |
| Opening six tabs | A partial unique index allows one open study session per account |
| Sending fake activity | No write policy exists; only `record_heartbeat()` can write time |
| Claiming a client timestamp | No timestamp is ever accepted from the client |
| A scripted 24-hour day | A configurable daily cap, default 12 hours |

Streaks are **recomputed** from `daily_activity` rather than incremented, so
calling the function twice, late, or after a backfill always gives the same
answer.

---

## Privacy

`get_leaderboard()` returns rank, display name, grade, streak and seconds —
and nothing else. No phone, no email, no school, and no real name unless the
student explicitly opted in. Students who have not opted in still appear,
anonymised as `Student #NNNN`, so the ranking stays honest rather than quietly
excluding half the cohort.

The RLS suite asserts the projection structurally: a regression that added
`school_name` for a "which school is winning" feature would fail the test
rather than quietly publish private data.

The session context sent to the browser **masks the phone number**
(`+251 ** *** 344`) — enough for a student to recognise their own, not enough
to be a contact list if the payload leaks.

Admins do see full contact details, because supporting a student and delivering
a prize both require reaching them. Those rows are unreadable to everyone else.

---

## Referral abuse

A referral pays only when the invited student registers **and signs in** — an
account that is never used is exactly the shape of a fake one.

| Attack | What stops it |
|---|---|
| Referring yourself | A `CHECK` constraint on the row |
| The same person twice | `profiles.phone` is unique-indexed |
| Counting the same invite twice | `referrals.referred_id` is unique-indexed |
| Bulk fake accounts | Confirmations above an hourly limit are held for human review, not paid |
| Replaying confirmation | `(user_id, tier_id)` is unique-indexed, so a tier pays once |

---

## Audit

Every administrative action writes to `audit_logs` through
`write_audit_log()`, which reads the actor from `auth.uid()` — so the actor
cannot be forged. The table is readable by admins and writable through that
function alone.

---

## Known limitations

Stated plainly rather than buried:

1. **Screenshots cannot be prevented in a browser.** See above.
2. **No rate limiting on auth.** Supabase provides some; if brute-forcing
   becomes a problem, add Cloudflare Turnstile or a WAF rule in front of
   `/login`.
3. **`get_my_rank` only searches the top 100.** A student below that sees
   "Unranked". Materialising the leaderboard would fix it; not worth doing
   before the numbers justify it.
4. **Email is not verified by default.** Turn on "Confirm email" in Supabase if
   throwaway signups become a problem. Referrals already require a sign-in, so
   they are unaffected either way.
5. **No automated refund handling.** A refund is an admin revoking the
   entitlement in Admin → Students.
