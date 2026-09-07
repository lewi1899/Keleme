-- =============================================================================
-- KELEME — 0014 RLS performance
--
-- Found by profiling against 100,000 students, 2.4M activity rows and a 10,000
-- item catalogue. Two patterns in the original policies were costing one to two
-- orders of magnitude, and both are the well-known Supabase RLS traps:
--
-- (1) PER-ROW FUNCTION CALLS.
--     `using (public.can_list_content(id))` looks tidy but the planner calls
--     that plpgsql function once PER ROW — 9,500 calls, each running two more
--     queries, to return one page of 24 items. Measured at 131ms.
--
--     The fix is to inline the same logic as a plain predicate the planner can
--     reason about. `grade_can_access` is IMMUTABLE SQL so it inlines; the
--     lookups become InitPlans. Semantics are unchanged — the RLS suite is the
--     proof of that, and it still passes.
--
-- (2) auth.uid() EVALUATED PER ROW.
--     `using (user_id = auth.uid() or public.is_admin())` re-evaluates both
--     calls for every row examined. Wrapping them as `(select auth.uid())`
--     makes PostgreSQL hoist them into an InitPlan, evaluated exactly once.
--
-- These are pure performance changes. Every policy grants and denies exactly
-- what it did before; tests/rls_test.sql is unchanged and still passes all 12
-- sections.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Content catalogue — the hottest read in the app
-- ---------------------------------------------------------------------------

drop policy if exists content_items_read on public.content_items;
create policy content_items_read on public.content_items
  for select using (
    (select public.is_staff())
    or (
      is_published
      and public.grade_can_access((select public.current_grade()), grade)
    )
  );

-- The body stays strictly gated: published, grade-reachable, entitlement held,
-- and the account not suspended. Same three gates as can_access_content, but
-- expressed so the planner evaluates the lookups once instead of per row.
drop policy if exists content_html_read on public.content_html_bodies;
create policy content_html_read on public.content_html_bodies
  for select using (
    (select public.is_staff())
    or (
      (select public.is_active_account())
      and exists (
        select 1
        from public.content_items ci
        where ci.id = content_html_bodies.content_id
          and ci.is_published
          and public.grade_can_access((select public.current_grade()), ci.grade)
          and (
            ci.access_tier = 'free'
            or (ci.access_tier = 'premium' and (select public.has_active_entitlement('premium')))
            or (ci.access_tier = 'matric' and (select public.has_active_entitlement('matric')))
          )
      )
    )
  );

drop policy if exists subjects_read on public.subjects;
create policy subjects_read on public.subjects
  for select using (
    (select public.is_staff())
    or (is_active and public.grade_can_access((select public.current_grade()), grade))
  );

drop policy if exists units_read on public.units;
create policy units_read on public.units
  for select using (
    (select public.is_staff())
    or exists (
      select 1 from public.subjects s
      where s.id = units.subject_id
        and s.is_active
        and public.grade_can_access((select public.current_grade()), s.grade)
    )
  );

-- ---------------------------------------------------------------------------
-- Matric — 5,000 questions, so the same per-row cost applied here
-- ---------------------------------------------------------------------------

drop policy if exists matric_questions_read on public.matric_questions;
create policy matric_questions_read on public.matric_questions
  for select using (
    (select public.is_staff())
    or (
      is_published
      and (select public.is_active_account())
      and (select public.current_grade()) = 12
      and (
        access_tier = 'free'
        or (select public.has_active_entitlement('matric'))
      )
    )
  );

drop policy if exists matric_years_read on public.matric_years;
create policy matric_years_read on public.matric_years
  for select using (
    (select public.is_staff())
    or (
      is_active
      and (select public.is_active_account())
      and (select public.current_grade()) = 12
    )
  );

-- ---------------------------------------------------------------------------
-- Per-user tables
--
-- These carry an `or is_admin()`, which is what stopped the planner using the
-- user_id index: an OR against a per-row function call is not a usable index
-- condition. As InitPlans both sides are constants for the whole scan.
-- ---------------------------------------------------------------------------

drop policy if exists daily_activity_own on public.daily_activity;
create policy daily_activity_own on public.daily_activity
  for select using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists study_sessions_own on public.study_sessions;
create policy study_sessions_own on public.study_sessions
  for select using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists content_progress_own on public.content_progress;
create policy content_progress_own on public.content_progress
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists content_progress_admin_read on public.content_progress;
create policy content_progress_admin_read on public.content_progress
  for select using ((select public.is_admin()));

drop policy if exists bookmarks_own on public.bookmarks;
create policy bookmarks_own on public.bookmarks
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists user_sessions_own on public.user_sessions;
create policy user_sessions_own on public.user_sessions
  for select using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists matric_attempts_own on public.matric_attempts;
create policy matric_attempts_own on public.matric_attempts
  for select using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists matric_answers_own on public.matric_answers;
create policy matric_answers_own on public.matric_answers
  for select using (
    (select public.is_admin())
    or exists (
      select 1 from public.matric_attempts a
      where a.id = matric_answers.attempt_id and a.user_id = (select auth.uid())
    )
  );

drop policy if exists payments_read_own on public.payments;
create policy payments_read_own on public.payments
  for select using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists entitlements_read_own on public.user_entitlements;
create policy entitlements_read_own on public.user_entitlements
  for select using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists referrals_read_own on public.referrals;
create policy referrals_read_own on public.referrals
  for select using (
    referrer_id = (select auth.uid())
    or referred_id = (select auth.uid())
    or (select public.is_admin())
  );

drop policy if exists referral_rewards_own on public.referral_rewards;
create policy referral_rewards_own on public.referral_rewards
  for select using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists weekly_winners_read on public.weekly_reward_winners;
create policy weekly_winners_read on public.weekly_reward_winners
  for select using (
    (select public.is_admin())
    or user_id = (select auth.uid())
    or exists (select 1 from public.weekly_reward_runs r where r.id = run_id and r.published)
  );

-- ---------------------------------------------------------------------------
-- Profiles — deliberately NOT changed
--
-- The obvious move is to apply the same InitPlan wrapping here. It does not
-- work, and the failure is worth recording so nobody tries it again:
--
--   for select using (id = (select auth.uid()) or (select public.is_staff()))
--
-- produces "infinite recursion detected in policy for relation profiles" on
-- any UPDATE. The profiles UPDATE policy's WITH CHECK contains a subquery that
-- reads profiles (to pin role, grade, streak and the rest to their existing
-- values). A bare SECURITY DEFINER call in the SELECT policy is opaque to the
-- planner, so that nests harmlessly; wrapping it in `(select ...)` makes it a
-- SubLink in the query tree, and expanding it re-enters the policies on the
-- same relation.
--
-- Reverting costs essentially nothing. A student's every read of profiles is
-- `id = auth.uid()`, a single index lookup — there is no row count here for a
-- per-row call to be expensive over. The tables that ARE scanned in bulk are
-- the ones changed above.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Announcements — read on every dashboard load
-- ---------------------------------------------------------------------------

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements
  for select using (
    (select public.is_admin())
    or (
      is_active
      and starts_at <= now()
      and (ends_at is null or ends_at > now())
      and (target_grade is null or target_grade = (select public.current_grade()))
    )
  );

-- ---------------------------------------------------------------------------
-- Supporting index
--
-- "What has this student done recently" is the dashboard's query, and it wants
-- user_id first with the date descending.
-- ---------------------------------------------------------------------------

create index if not exists content_progress_user_recent_idx
  on public.content_progress (user_id, last_opened_at desc);
