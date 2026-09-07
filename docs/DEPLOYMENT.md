# Deploying KELEME

Nothing here is host-specific except where noted — this is a standard Next.js
14 application and runs on any Node host. Vercel is used as the worked example
because it is the least work.

---

## 1. Prepare the Supabase project

Use a **separate project** from development. Sharing one means a migration
test, a seed run, or a `test:db` invocation pointed at the wrong connection
string can destroy live student data.

```bash
npx supabase link --project-ref <production-ref>
npx supabase db push
```

Then, in the dashboard:

| Setting | Value |
|---|---|
| Authentication → Site URL | `https://your-domain` |
| Authentication → Redirect URLs | `https://your-domain/**` |
| Authentication → Providers | Email on; everything else off |
| Database → Backups | Enabled (Pro plan) or take manual dumps |

Verify RLS is on for every table:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

**Every row must show `rowsecurity = true`.** A table with RLS off is readable
by anyone holding the anon key, which is public by design.

---

## 2. Deploy the application

```bash
git push origin main
```

Import the repository in Vercel (or your host), then set the environment
variables:

| Variable | Value | Scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production project URL | All |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production anon key | All |
| `SUPABASE_SERVICE_ROLE_KEY` | Production service-role key | **Production only** |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain` | All |

Leave `KELEME_ADMIN_PASSWORD` out of the hosting environment entirely — it is
only read by `npm run seed`, which you run once from your own machine.

> On Vercel, mark `SUPABASE_SERVICE_ROLE_KEY` as sensitive so it cannot be read
> back from the dashboard.

---

## 3. Domain

1. Add the domain in your host's dashboard and follow its DNS instructions.
2. Wait for the certificate to issue — HTTPS is not optional here. Auth cookies
   are set `Secure` in production, so the app simply will not sign anyone in
   over plain HTTP.
3. Add the domain to Supabase's Site URL and Redirect URLs (step 1).
4. Set `NEXT_PUBLIC_SITE_URL` to the final domain and redeploy. Referral links
   are built from it, so a stale value hands students a broken invite.

---

## 4. Seed the administrators

Once, from a trusted machine, with `.env.local` pointing at **production**:

```bash
npm run seed
```

Then immediately:

1. Each administrator signs in and changes their password.
2. Correct the placeholder phone numbers in Admin → Students.
3. Delete the production values from your local `.env.local`.

---

## Pre-launch checklist

Run through this before announcing the platform.

### Verify locally

```bash
npm run typecheck   # clean
npm run lint        # clean
npm test            # 25 unit tests pass
npm run test:db     # 12 RLS sections pass
npm run build       # succeeds
npm run check:bundle # no server-only secret reached the client bundle
```

### Verify in the browser, against production

Auth:

- [ ] Register a new student — the form asks for phone, grade and school before the account is created
- [ ] An invalid phone number (e.g. `0812345678`) is rejected
- [ ] Sign in, sign out, sign in again
- [ ] A wrong password gives the same message as an unknown email
- [ ] Sign in on a second device → the first is signed out and told why

Access:

- [ ] A grade 9 student sees only grade 9 subjects and content
- [ ] A grade 12 student sees grades 9–12
- [ ] A free student sees a premium note's title but gets the paywall, not the body
- [ ] Grant that student premium in Admin → Students → the body is now readable
- [ ] A free PDF downloads; a premium PDF does not until premium is granted
- [ ] A grade 11 student cannot reach `/matric` at all

Content:

- [ ] Upload an HTML note, a PDF and a YouTube link; all three render
- [ ] There is no download control anywhere on an HTML note
- [ ] Unpublishing an item removes it for students immediately

Matric:

- [ ] Add a question with four options and publish it
- [ ] Publishing is refused when zero or two options are marked correct
- [ ] Answer it as a student — marking and the explanation come back
- [ ] Re-answering the same question is refused

Engagement:

- [ ] Study for five minutes → today's time and the streak both move
- [ ] Leave a tab open for an hour without touching it → time barely moves
- [ ] The leaderboard shows `Student #NNNN` for a student who has not opted in
- [ ] Turning on "show my name" in Settings changes the leaderboard row

Money:

- [ ] Request a plan as a student → a pending payment with a reference appears
- [ ] Confirm it in Admin → Payments → premium activates immediately
- [ ] Confirming the same payment twice does not grant two entitlements

Admin:

- [ ] All three administrators can sign in
- [ ] A content editor cannot see Students, Plans, Payments or the Audit log
- [ ] Changing a price in Admin → Plans is visible on the landing page within seconds
- [ ] Changing a support number in Admin → Contacts updates the landing page
- [ ] Every action above appears in Admin → Audit log

Operational:

- [ ] Test on a real phone on mobile data, not just a desktop browser
- [ ] Check all six themes, including the three dark ones
- [ ] No secrets in the client bundle — `npm run check:bundle` passes after a production build
- [ ] The browser console is clean on the dashboard and the content viewer

---

## After launch

**Weekly** — run the prize routine (Admin → Rewards): calculate, review,
publish. Prizes are not automatic on purpose, so a farmed week can be caught
before it pays out.

**Weekly** — skim Admin → Audit log and Admin → Referrals for anything flagged.

**Monthly** — check Admin → Analytics for the study-time trend, and Supabase's
Database → Usage against the free-tier limits.

### Scaling triggers

The current schema is indexed for the expected load. Revisit when:

| Signal | Do this |
|---|---|
| Content catalogue > ~10,000 items | Add a persisted `tsvector` column and a GIN index; the title search currently uses trigram |
| Students > ~50,000 | Materialise the leaderboard on a schedule rather than computing per request |
| `daily_activity` > ~5M rows | Partition by month |
| Storage > 1GB | Move to a paid Supabase plan, or front `content-pdfs` with a CDN |

None of these are needed at launch. Each is a real change with a real cost —
do them when the number says to, not before.
