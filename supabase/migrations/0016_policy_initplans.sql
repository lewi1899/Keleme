-- =============================================================================
-- KELEME — 0016 InitPlan the remaining policy predicates
--
-- 0014 rewrote the read policies but left the `FOR ALL` write policies alone,
-- and that turned out to matter. Permissive policies are OR'd together, so a
-- SELECT on content_items was evaluating BOTH:
--
--   Filter: (is_staff() OR $0 OR (is_published AND grade_can_access($1, grade)))
--            ^^^^^^^^^^ from content_items_staff_write, once PER ROW
--                       ^^ from content_items_read, already an InitPlan
--
-- The read policy was fixed; the write policy's bare call still ran 9,500
-- times for one page of 24 items, which is where the remaining 75ms was.
--
-- Wrapping each call as `(select ...)` makes it an InitPlan — evaluated once
-- per query instead of once per row. Grants are identical; this is purely
-- about how many times the same question gets asked.
--
-- `profiles` is deliberately excluded — see the note in 0014 for why wrapping
-- it causes infinite recursion.
-- =============================================================================

-- --- catalogue --------------------------------------------------------------

drop policy if exists content_items_staff_write on public.content_items;
create policy content_items_staff_write on public.content_items
  for all using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists content_html_staff_write on public.content_html_bodies;
create policy content_html_staff_write on public.content_html_bodies
  for all using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists subjects_staff_write on public.subjects;
create policy subjects_staff_write on public.subjects
  for all using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists units_staff_write on public.units;
create policy units_staff_write on public.units
  for all using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists schools_staff_write on public.schools;
create policy schools_staff_write on public.schools
  for all using ((select public.is_staff())) with check ((select public.is_staff()));

-- --- matric -----------------------------------------------------------------

drop policy if exists matric_years_staff on public.matric_years;
create policy matric_years_staff on public.matric_years
  for all using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists matric_questions_staff on public.matric_questions;
create policy matric_questions_staff on public.matric_questions
  for all using ((select public.is_staff())) with check ((select public.is_staff()));

drop policy if exists matric_options_staff on public.matric_question_options;
create policy matric_options_staff on public.matric_question_options
  for all using ((select public.is_staff())) with check ((select public.is_staff()));

-- --- billing ----------------------------------------------------------------

drop policy if exists plans_read_active on public.plans;
create policy plans_read_active on public.plans
  for select using (is_active or (select public.is_admin()));

drop policy if exists plans_admin_write on public.plans;
create policy plans_admin_write on public.plans
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists payments_admin_write on public.payments;
create policy payments_admin_write on public.payments
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists entitlements_admin_write on public.user_entitlements;
create policy entitlements_admin_write on public.user_entitlements
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

-- --- engagement -------------------------------------------------------------

drop policy if exists referral_tiers_read on public.referral_reward_tiers;
create policy referral_tiers_read on public.referral_reward_tiers
  for select using (is_active or (select public.is_admin()));

drop policy if exists referral_tiers_admin on public.referral_reward_tiers;
create policy referral_tiers_admin on public.referral_reward_tiers
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists referrals_admin on public.referrals;
create policy referrals_admin on public.referrals
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists reward_catalog_read on public.reward_catalog;
create policy reward_catalog_read on public.reward_catalog
  for select using (is_active or (select public.is_admin()));

drop policy if exists reward_catalog_admin on public.reward_catalog;
create policy reward_catalog_admin on public.reward_catalog
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists weekly_slots_admin on public.weekly_reward_slots;
create policy weekly_slots_admin on public.weekly_reward_slots
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists weekly_runs_read on public.weekly_reward_runs;
create policy weekly_runs_read on public.weekly_reward_runs
  for select using (published or (select public.is_admin()));

drop policy if exists weekly_runs_admin on public.weekly_reward_runs;
create policy weekly_runs_admin on public.weekly_reward_runs
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists weekly_winners_admin on public.weekly_reward_winners;
create policy weekly_winners_admin on public.weekly_reward_winners
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

-- --- platform ---------------------------------------------------------------

drop policy if exists contact_phones_read on public.contact_phones;
create policy contact_phones_read on public.contact_phones
  for select using (is_active or (select public.is_admin()));

drop policy if exists contact_phones_admin on public.contact_phones;
create policy contact_phones_admin on public.contact_phones
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists contact_emails_read on public.contact_emails;
create policy contact_emails_read on public.contact_emails
  for select using (is_active or (select public.is_admin()));

drop policy if exists contact_emails_admin on public.contact_emails;
create policy contact_emails_admin on public.contact_emails
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists announcements_admin on public.announcements;
create policy announcements_admin on public.announcements
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select using ((select public.is_staff()));

drop policy if exists app_settings_admin on public.app_settings;
create policy app_settings_admin on public.app_settings
  for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists audit_logs_admin_read on public.audit_logs;
create policy audit_logs_admin_read on public.audit_logs
  for select using ((select public.is_admin()));

drop policy if exists user_sessions_admin on public.user_sessions;
create policy user_sessions_admin on public.user_sessions
  for all using ((select public.is_admin())) with check ((select public.is_admin()));
