# Testing KELEME on your own computer

Two paths. **Path A takes ten minutes and needs no accounts** — it proves the
database schema, all the security rules and the build are sound. **Path B**
gets the real app running in your browser with a live Supabase project.

Do Path A first. If it passes, the foundation is good and Path B is just
configuration.

---

## What you need

| | Path A | Path B |
|---|---|---|
| Node.js 18.17+ (20 or 22 recommended) | required | required |
| PostgreSQL 15+ | required | not needed |
| A free Supabase account | not needed | required |

Check what you have:

```bash
node --version     # v18.17 or higher
psql --version     # 15 or higher  (Path A only)
```

**Installing PostgreSQL**, if you need it:

- **Windows** — <https://www.postgresql.org/download/windows/> (the EDB
  installer). Tick "Command Line Tools" so you get `psql`.
- **macOS** — `brew install postgresql@16 && brew services start postgresql@16`
- **Linux** — `sudo apt install postgresql postgresql-client`

---

## Get the code

```bash
git clone -b claude/interactive-appealing-design-s8xtr1 \
  https://github.com/lewi1899/Keleme.git
cd Keleme
npm install
```

Or unzip the archive you were sent and `cd` into it, then `npm install`.

---

# Path A — verify everything without any accounts

### 1. Static checks

```bash
npm run typecheck   # TypeScript: expect no output
npm run lint        # expect "✔ No ESLint warnings or errors"
npm test            # expect "# pass 25" and "# fail 0"
```

`npm test` runs 25 unit tests: Ethiopian phone normalisation, the grade access
rule, the YouTube link parser, the registration and matric-question schemas,
and formatting.

### 2. The database and security suite — the important one

This applies all 12 migrations to a scratch database and then attacks it.

**macOS / Linux:**

```bash
PGUSER=postgres npm run test:db
```

**Windows (PowerShell):**

```powershell
$env:PGUSER="postgres"; $env:PGPASSWORD="your-postgres-password"
npm run test:db
```

If `psql` is not on your PATH on Windows, add it — it is usually at
`C:\Program Files\PostgreSQL\16\bin`.

You should see:

```
==> Applying migrations
    0001_init.sql
    ... (12 files)
==> Running RLS and authorization suite
== 1. Registration hardening ==
== 2. Grade separation ==
== 3. Premium gating ==
== 4. Escalation attempts ==
== 5. Matric answer key ==
== 6. Time tracking ==
== 7. Streaks ==
== 8. Leaderboard privacy ==
== 9. Referrals ==
== 10. Suspension and roles ==
== 11. Single session ==
== 12. Payments ==
================================================
  ALL RLS ASSERTIONS PASSED
================================================
```

**This is the test that matters.** It runs as the `authenticated` database role
with a forged login token — exactly how a request from a student's browser
reaches the database — and then tries to break in. Among the things it proves
fail:

- a signup claiming `"role": "admin"` still produces an ordinary student
- a grade 9 student cannot read grade 10 content, or even see its subject list
- a free student can see a premium note's title but not its body
- a student cannot give themselves premium, rewrite their study time, change
  their grade, or edit prices
- **no student can read the matric answer key at all**
- a tab left idle for six hours earns 90 seconds, not six hours
- a student who did not opt in never has their real name on the leaderboard
- signing in on a second device signs the first one out
- confirming a payment twice does not grant two subscriptions

> It drops and recreates a database called `keleme_test`. That name only.
> Never point it at a database with real data.

### 3. Build it

```bash
npm run build
```

Then check no secret leaked into the browser bundle:

```bash
npm run check:bundle    # expect "Client bundle is clean."
```

**If all three steps pass, the backend, the security model and the build are
verified on your machine.** You have not seen the UI yet — that is Path B.

---

# Path B — run the real app

### 1. Create a Supabase project

1. Go to <https://supabase.com> and sign up (free tier is enough).
2. **New project.** Give it a name and a strong database password.
3. Region: pick the one closest to Ethiopia — usually **EU (Frankfurt)**.
4. Wait about two minutes for it to provision.

### 2. Apply the database schema

**Easiest way — the SQL editor:**

Open **SQL Editor** in the Supabase dashboard. Then, for each file in
`supabase/migrations/` **in numerical order**, paste its whole contents in and
press Run:

```
0001_init.sql
0002_identity.sql
0003_billing.sql
0004_curriculum.sql
0005_matric.sql
0006_engagement.sql
0007_platform.sql
0008_storage.sql
0009_seed_reference.sql
0010_sessions.sql
0011_payment_requests.sql
0012_admin_metrics.sql
```

Order matters — later files depend on earlier ones. Each should finish with
"Success".

**Or with the CLI**, which does all twelve in one command:

```bash
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push
```

Your project ref is the string in your project URL:
`https://YOUR-PROJECT-REF.supabase.co`.

### 3. Get your keys

In the dashboard: **Project Settings → API**. You need three values:

| Field on that page | Goes into |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` `secret` | `SUPABASE_SERVICE_ROLE_KEY` |

### 4. Configure the app

```bash
cp .env.example .env.local
```

Open `.env.local` and fill it in:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://your-project-ref.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbG..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbG..."
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
KELEME_ADMIN_PASSWORD="pick-a-strong-password-12-chars-min"
```

> The `service_role` key bypasses every security rule in the database. Treat it
> like your database password. It is only ever read on the server —
> `npm run check:bundle` verifies it never reaches the browser.

### 5. Turn off email confirmation (for testing only)

Dashboard → **Authentication → Providers → Email** → turn **Confirm email**
off. This lets you register test accounts without checking an inbox. Turn it
back on before going live.

### 6. Create the admin accounts

```bash
npm run seed
```

This creates three administrators, all using the password you set:

| Name | Email |
|---|---|
| Lewi Wondimu | `lewiterefe@gmail.com` |
| Fahmi Hassen | `keleme2026@gmail.com` |
| Dawit Semere | `dsemere737@gmail.com` |

To use different emails or real phone numbers, uncomment the
`KELEME_ADMIN_*` lines in `.env.local` first.

### 7. Run it

```bash
npm run dev
```

Open <http://localhost:3000>.

---

## A 15-minute walkthrough

Do these in order — each one sets up the next.

### Sign in as an admin

1. **Sign in** with `lewiterefe@gmail.com` and your `KELEME_ADMIN_PASSWORD`.
2. Click your avatar → **Admin**. You should see the full sidebar.

### Add some content

3. **Admin → Content → Add content.**
4. Choose **Study note**. Title: `Unit 1 — Algebra Basics`.
5. In the note body paste: `<h2>Algebra</h2><p>A variable is a symbol.</p>`
6. Grade **9**, Subject **Mathematics**, access **Free**, toggle **Publish now**, Save.
7. Add a second one exactly the same but titled `Unit 2 — Premium Notes` and
   set access to **Premium**.

### Register a student and check the paywall

8. Open a **private/incognito window** → <http://localhost:3000/register>.
9. Register: any name, any email, phone `0912345678`, **Grade 9**, any school.
10. You land on the dashboard. Open **Study → Mathematics**.
11. Open the **free** note — you can read it.
12. Open the **premium** note — **you see the title but get a paywall, not the
    body.** That is the security model working.

### Grant premium

13. Back in the admin window: **Admin → Students**. Your test student is there.
14. Click the **shield icon** → grant **KELEME Premium**, 30 days → Grant.
15. In the student window, refresh the premium note — **now it reads.**

### Test grade separation

16. Admin → Content → add a note for **Grade 10**, Free, published.
17. As the Grade 9 student, go to **Study**. **The Grade 10 note is not there,
    and neither is any Grade 10 subject.** The database is filtering it, not
    the page.

### Test the single-device rule

18. Open a **third** browser (or another private window) and sign in as the
    same student.
19. Refresh the second window → **you are signed out with "your account was
    opened on another device."**

### Test streaks and time

20. As the student, open a note and leave the tab focused for a few minutes,
    moving the mouse occasionally.
21. Go to the dashboard — **Today** and the ring have moved.
22. Now leave the tab in the background for ten minutes and come back. Barely
    anything is added — the idle clamp at work.

### Test matric (grade 12 only)

23. Register a **Grade 12** student in another private window. They now have a
    **Matric** tab; the Grade 9 student never does.
24. Admin → **Matric questions** → Add year `2016`, then Add question with four
    options, mark one correct, publish.
25. As the Grade 12 student, open Matric → 2016 → Mathematics. The question is
    **locked** (no matric package).
26. Grant them the Matric Package in Admin → Students, refresh, answer it —
    marking and the explanation come back from the server.

### Test payments

27. As a student: **Go Premium** → choose a plan → you get an amount and a
    reference, and support phone numbers to call.
28. Admin → **Payments** → the request is waiting → **Confirm** → the student's
    premium activates immediately.

### Test the leaderboard's privacy

29. Student → **Leaderboard**. You appear as a number — `Student #0004` or
    similar — **not your name**. (The count includes the three admin accounts,
    so the first student is not necessarily #0001.)
30. **Settings** → turn on "Show my name on the public leaderboard" → save →
    back to the leaderboard, now your name shows.

### Test the themes

31. Click the palette icon in the header. Try **AMOLED Black**, **Forest
    Green**, **Royal Purple**. The whole app re-themes instantly, charts
    included.

---

## Optional: a browser check across themes

With the app running in another terminal:

```bash
npm run smoke
```

Loads the public pages in a real browser across four themes and fails on any
console error. Screenshots land in `/tmp/keleme-smoke` (or set `SMOKE_OUT`).

---

## If something goes wrong

| Symptom | Cause and fix |
|---|---|
| `Missing required environment variable` | `.env.local` is missing or a value is blank. It must be `.env.local`, not `.env.example`. |
| Sign-in does nothing | Email confirmation is on. Turn it off (step 5), or check the inbox. |
| `relation "public.profiles" does not exist` | Migrations were not applied, or not in order. Re-run from `0001`. |
| `npm run seed` says "phone number is not valid" | A `KELEME_ADMIN_*_PHONE` in `.env.local` is not an Ethiopian mobile number. Use the `09xxxxxxxx` form. |
| `npm run test:db` — `psql: command not found` | PostgreSQL client tools are not on your PATH. On Windows add `C:\Program Files\PostgreSQL\16\bin`. |
| `npm run test:db` — authentication failed | Set `PGPASSWORD` too, or edit `pg_hba.conf` to trust local connections. |
| Content saves but students cannot see it | It is still a draft. Publish it — the eye icon in Admin → Content. |
| Grade 12 student has no Matric tab | Matric is grade 12 only. Check the student's grade in Admin → Students. |
| Port 3000 already in use | `npm run dev -- -p 3001` |

Still stuck: run `npm run test:db` first. If that passes, the problem is
configuration, not the code.
