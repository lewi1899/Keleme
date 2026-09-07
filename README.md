# KELEME

A study platform for Ethiopian students in grades 9 to 12: notes, textbooks,
video lessons and past matric papers, with streaks, a public leaderboard,
weekly prizes and a referral programme.

Built on **Next.js 14** (App Router) and **Supabase** — PostgreSQL, Auth,
Storage, and Row Level Security.

---

> **Want to try it right now?** [TESTING.md](TESTING.md) walks you through
> verifying everything on your own machine — including a ten-minute path that
> needs no accounts at all.

## Contents

- [Architecture](#architecture)
- [Local development](#local-development)
- [Supabase setup](#supabase-setup)
- [Environment variables](#environment-variables)
- [Creating the administrators](#creating-the-administrators)
- [Testing](#testing)
- [Deployment](#deployment)
- [Running the platform](#running-the-platform)
- [Further reading](#further-reading)

---

## Architecture

```
Browser ──► Next.js (App Router)  ──► Supabase PostgREST ──► PostgreSQL + RLS
              │                                                    ▲
              │                                                    │
              └──► Server Actions / Route Handlers ────────────────┘
                       (service role, only where noted)
```

**The database is the security boundary, not the application.** Every rule that
matters — which grade may read which content, whether a student holds a
premium entitlement, who can change a price — is a Row Level Security policy or
a `SECURITY DEFINER` function. The Next.js layer decides what to *draw*; it
never decides what a student is *allowed to see*. That is why the RLS test
suite runs as the `authenticated` role with a forged JWT claim: it proves the
rules hold even when the application is bypassed entirely.

### Three Supabase clients, deliberately separate

| Client | Key | Used for |
|---|---|---|
| `lib/supabase/client.ts` | anon | Browser. Under RLS. |
| `lib/supabase/server.ts` | anon | Server Components, Actions, Route Handlers. Session in cookies. Under RLS. |
| `lib/supabase/public.ts` | anon | Session-free public reads (plans, contacts) so they can be cached. Under RLS. |
| `lib/supabase/admin.ts` | **service role** | **Bypasses RLS.** Four uses only — see below. |

The service-role client is marked `server-only`, so importing it into a client
component is a build error rather than a leaked key. Its only legitimate uses
are places the database genuinely cannot answer for itself:

1. Signing URLs for private storage objects — *after* the caller's entitlement
   has been checked through their own session.
2. The payment webhook, which arrives with no user session.
3. Session revocation, which by definition acts on someone else's session.
4. The seed script.

### Layout

```
src/
  app/
    (auth)/          sign in, register        — public
    (app)/           the student app          — requireUser()
    admin/           the admin panel          — requireStaff() / requireAdmin()
    api/             route handlers
  components/
    ui/              design-system primitives
    admin/  app/  content/  matric/ ...
  lib/
    supabase/        the three clients
    queries/         read paths, shaped per screen
    session.ts       the auth gate
    validation.ts    zod schemas, shared client and server
supabase/migrations/ the schema — the source of truth
tests/               RLS suite + unit tests
```

### Design system

The visual identity is carried over from the original KELEME build: six themes
as CSS custom properties (`[data-theme="..."]` blocks in `globals.css`), Plus
Jakarta Sans for display and Inter for body, the `kl-surface` / `kl-glass` /
`kl-display` utilities, and rounded-2xl cards. Switching a theme is one
attribute write with no React re-render.

Motion lives in the Tailwind theme rather than being re-invented per component,
and every animation collapses to a plain state change under
`prefers-reduced-motion`.

---

## Local development

Requirements: Node 18.17+ (22 recommended) and a Supabase project (the free
tier is enough).

```bash
npm install
cp .env.example .env.local     # then fill it in — see below
npm run dev
```

Open <http://localhost:3000>.

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (pure logic) |
| `npm run test:db` | **Migrations + the RLS suite** against a scratch database |
| `npm run check:bundle` | Verify no server-only secret reached the client bundle |
| `npm run smoke` | Load the public pages in a real browser across themes; fails on any console error |
| `npm run seed` | Create the administrator accounts |

---

## Supabase setup

### 1. Create the project

<https://supabase.com/dashboard> → New project. Note the region — pick the one
closest to Ethiopia (currently `eu-central-1` is the usual choice) since every
query pays that round trip.

### 2. Apply the migrations

The eleven files in `supabase/migrations/` are ordered and idempotent. Apply
them **in filename order**.

**With the Supabase CLI (recommended):**

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

**Or by hand:** open the SQL Editor in the dashboard and run each file in
order, from `0001_init.sql` through `0012_admin_metrics.sql`.

| Migration | What it creates |
|---|---|
| `0001_init` | Extensions, enums, phone normalisation, the grade rule, settings |
| `0002_identity` | Schools, profiles, the auth.users bridge, device sessions, audit log |
| `0003_billing` | Plans, payments, entitlements, the ad-level rule |
| `0004_curriculum` | Subjects, units, content, HTML bodies, progress, bookmarks |
| `0005_matric` | Matric years, questions, options, attempts, the student-facing RPCs |
| `0006_engagement` | Study sessions, streaks, leaderboard, referrals, weekly rewards |
| `0007_platform` | Support phones and emails, announcements, settings policies |
| `0008_storage` | The three buckets and their policies |
| `0009_seed_reference` | Plans, prices, referral tiers, prizes, contacts, subjects, matric years |
| `0010_sessions` | Sign-in, device-session validation, the session context bundle |
| `0011_payment_requests` | Plan requests and payment confirmation |
| `0012_admin_metrics` | Admin analytics, student search, suspension, role changes |

### 3. Storage buckets

Migration `0008` creates them. Verify under Storage:

| Bucket | Public | Holds |
|---|---|---|
| `content-pdfs` | **No** | Textbooks. Reached only through a short-lived signed URL. |
| `content-thumbnails` | Yes | Cover images. Public so they are CDN-cacheable. |
| `avatars` | Yes | Profile pictures, writable only under the owner's own prefix. |

**HTML study content has no bucket.** It lives in `content_html_bodies` and is
rendered server-side, which is what makes "viewable online, never downloadable
as a file" true rather than a UI convention.

### 4. Auth settings

Dashboard → Authentication → Providers:

- **Email** enabled. Everything else off unless you add it deliberately.
- **Confirm email** — your choice. Off gets students in immediately; on is
  safer against throwaway signups. Either works: with confirmation on, `signUp`
  returns no session and the app routes to "check your email". A referral is
  confirmed on first *sign-in* either way, so an unconfirmed account never pays
  out a reward.
- **Site URL** and **Redirect URLs** must include your production domain.

---

## Environment variables

Copy `.env.example` to `.env.local`. You must provide:

| Variable | Where to find it | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → anon public | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role | **YES** |
| `NEXT_PUBLIC_SITE_URL` | Your domain, e.g. `https://keleme.et` | No |
| `KELEME_ADMIN_PASSWORD` | You choose. Seeding only. | **YES** |

> **The service-role key bypasses every RLS policy in the database.** Treat it
> exactly like a database password. Never prefix it with `NEXT_PUBLIC_`, never
> commit it, and never paste it into a client component.

---

## Creating the administrators

Plans, prices, referral tiers, prize slots, support contacts, subjects and
matric years are all seeded by migration `0009`. Administrators are not — they
need `auth.users` rows, which only the service role can write.

```bash
# Set KELEME_ADMIN_PASSWORD in .env.local first (12+ characters).
npm run seed
```

This creates three administrators:

| Name | Default email |
|---|---|
| Lewi Wondimu | `lewiterefe@gmail.com` |
| Fahmi Hassen | `keleme2026@gmail.com` |
| Dawit Semere | `dsemere737@gmail.com` |

Override any of them with `KELEME_ADMIN_LEWI_EMAIL`, `KELEME_ADMIN_LEWI_PHONE`,
and the same pattern for `FAHMI` and `DAWIT`.

**The default phone numbers are placeholders.** They are unique-indexed, so a
placeholder left in place blocks that person from ever registering with their
real number. Set the real ones before seeding, or correct them afterwards in
Admin → Students.

The script is idempotent — re-running it promotes existing accounts rather than
duplicating them, and never overwrites a password. Each administrator should
change their password at their first sign-in.

Adding people later: they register normally, then an administrator promotes
them in **Admin → Team**. There is deliberately no invite-by-email flow, since
that would mean an unauthenticated endpoint that creates privileged accounts.

---

## Testing

```bash
npm test          # 25 unit tests — phone rules, grade access, schemas, formatting
npm run typecheck # tsc --noEmit
npm run lint      # eslint
npm run test:db   # migrations + 12-section RLS suite

npm run build && npm run check:bundle   # no service-role key in the browser

# With the app running (npm start or npm run dev):
npm run smoke     # 9 page/theme combinations in a real browser, screenshots to /tmp
```

### The RLS suite is the important one

`tests/rls_test.sql` runs as the `authenticated` role with a forged JWT claim —
the same way PostgREST executes a student's request — so it proves the rules
are enforced by the database rather than hidden in the UI. It needs a
PostgreSQL 15+ instance; `tests/supabase_shim.sql` supplies the minimum `auth`
and `storage` objects so it can run without Docker or a hosted project.

```bash
# Any local cluster
PGHOST=/tmp PGPORT=5432 PGUSER=postgres npm run test:db

# Or a connection string
DATABASE_URL="postgresql://..." npm run test:db
```

**It drops and recreates `keleme_test`. Never point it at production.**

The twelve sections cover registration hardening, grade separation, premium
gating, ten privilege-escalation attempts, matric answer-key confidentiality,
time-tracking clamps, streak idempotence, leaderboard anonymity, referral
abuse, role boundaries, single-session enforcement, and payment integrity. See
`tests/README.md` for the table of what each one proves.

---

## Deployment

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for the full procedure,
including the pre-launch checklist. In short:

1. Push to a Git repository.
2. Import into Vercel (or any Node host — nothing here is Vercel-specific).
3. Set the five environment variables above.
4. Point your domain at it; add the domain to Supabase's Site URL and Redirect
   URLs.
5. Apply the migrations to the production project and run `npm run seed` once.

---

## Running the platform

Everything below is done from the admin panel. **No code change is needed for
any of it.**

| To do this | Go to |
|---|---|
| Add notes, textbooks, videos | Admin → Content → Add content |
| Change what is Free vs Premium | Admin → Content → edit → step 4 |
| Add subjects and units | Admin → Subjects & units |
| Add matric papers | Admin → Matric questions |
| Change prices or durations | Admin → Plans & pricing |
| Confirm a payment | Admin → Payments |
| Give a student free access | Admin → Students → shield icon |
| Suspend an account | Admin → Students → ban icon |
| Change support numbers or emails | Admin → Contacts |
| Set up weekly prizes | Admin → Rewards |
| Run a week's prizes | Admin → Rewards → Calculate, review, Publish |
| Post a notice to students | Admin → Announcements |
| Change streak or anti-cheat rules | Admin → Settings |
| Add a colleague | Admin → Team |
| See who changed what | Admin → Audit log |

### The weekly prize routine

1. **Calculate last week** — produces a draft ranking. Nothing is awarded yet.
2. **Review it** for anything that looks like automation.
3. **Publish and award** — subscription prizes land on the winners' accounts
   immediately; physical prizes stay pending until you mark them handed over.

The two steps are separate on purpose: fusing them would mean a farmed week
pays out before anyone looks at it.

---

## Further reading

| Document | Covers |
|---|---|
| [TESTING.md](TESTING.md) | **Start here** — testing this on your own computer, with a 15-minute walkthrough |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment and the launch checklist |
| [docs/SECURITY.md](docs/SECURITY.md) | The security model, and an honest account of what content protection can and cannot do |
| [docs/PAYMENTS.md](docs/PAYMENTS.md) | How payments work today and what integrating a provider involves |
| [docs/MOBILE.md](docs/MOBILE.md) | Reusing this backend for an Android/iOS app |
| [tests/README.md](tests/README.md) | What the RLS suite proves |
