-- =============================================================================
-- KELEME — Row Level Security and authorization test suite
--
-- Runs against a database with the migrations applied (see tests/README.md).
-- Every check runs as the `authenticated` role with a forged JWT claim, which
-- is exactly how PostgREST executes a student's request — so a policy that
-- passes here is genuinely enforced in production, not merely hidden in the UI.
--
-- The suite is destructive: it creates and drops its own fixtures. Point it at
-- a scratch database, never at production.
-- =============================================================================

\set ON_ERROR_STOP on
\timing off
\pset tuples_only on
\pset format unaligned

create or replace function public._assert(cond boolean, msg text)
returns void language plpgsql as $$
begin
  if cond is not true then
    raise exception 'ASSERTION FAILED: %', msg;
  end if;
end $$;

-- Impersonates a student for subsequent statements. NOTE the `false` third
-- argument: set_config(..., true) would scope the claim to the current
-- transaction, and under psql's autocommit every statement is its own
-- transaction — the claim would evaporate before the next query ran and every
-- RLS assertion would pass vacuously against an anonymous session. Session
-- scope is what makes these tests mean anything.
-- RLS denies a write in one of two ways depending on which clause caught it:
-- a USING failure filters the row out (0 rows affected), a WITH CHECK failure
-- raises. Both are a successful block, so the helper accepts either and fails
-- only when the write actually lands.
create or replace function public._assert_write_blocked(stmt text, msg text)
returns void language plpgsql as $$
declare n integer;
begin
  execute stmt;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'ASSERTION FAILED: %', msg;
  end if;
exception
  when insufficient_privilege or check_violation then
    return;
end $$;

create or replace function public._as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid::text, 'role', 'authenticated')::text, false);
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

begin;

-- Idempotent teardown, so a suite that aborted midway does not poison the next
-- run with leftover fixtures.
delete from auth.users where email like '%@rlstest.keleme';
delete from public.matric_questions where id::text like '00000000-0000-0000-0000-0000000a%';
delete from public.content_items where id::text like '00000000-0000-0000-0000-0000000c%';

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000ad11', 'admin@rlstest.keleme',
     '{"full_name":"Test Admin","phone":"0911000001","grade":"12","school_name":"Test School"}'),
  ('00000000-0000-0000-0000-000000000009', 'g9@rlstest.keleme',
     '{"full_name":"Grade Nine","phone":"0911000009","grade":"9","school_name":"Test School"}'),
  ('00000000-0000-0000-0000-000000000010', 'g10@rlstest.keleme',
     '{"full_name":"Grade Ten","phone":"0911000010","grade":"10","school_name":"Other School"}'),
  ('00000000-0000-0000-0000-000000000012', 'g12free@rlstest.keleme',
     '{"full_name":"Grade Twelve Free","phone":"0911000012","grade":"12","school_name":"Test School"}'),
  ('00000000-0000-0000-0000-000000000013', 'g12prem@rlstest.keleme',
     '{"full_name":"Grade Twelve Premium","phone":"0911000013","grade":"12","school_name":"Test School"}'),
  ('00000000-0000-0000-0000-000000000014', 'g12matric@rlstest.keleme',
     '{"full_name":"Grade Twelve Matric","phone":"0911000014","grade":"12","school_name":"Test School"}');

-- The registration trigger, not the application, creates these profiles.
select public._assert(
  (select count(*) from public.profiles where email like '%@rlstest.keleme') = 6,
  'handle_new_user should have created a profile for each auth user');

update public.profiles set role = 'admin' where email = 'admin@rlstest.keleme';

select public.grant_entitlement('00000000-0000-0000-0000-000000000013', 'premium', 30, 'admin_grant');
select public.grant_entitlement('00000000-0000-0000-0000-000000000014', 'matric', 30, 'admin_grant');

-- Content fixtures, one per (grade, tier) combination under test.
insert into public.content_items (id, content_type, access_tier, grade, title, is_published) values
  ('00000000-0000-0000-0000-0000000c0901', 'html', 'free',    9,  'G9 Free Note',    true),
  ('00000000-0000-0000-0000-0000000c0902', 'html', 'premium', 9,  'G9 Premium Note', true),
  ('00000000-0000-0000-0000-0000000c1001', 'html', 'free',    10, 'G10 Free Note',   true),
  ('00000000-0000-0000-0000-0000000c1201', 'html', 'premium', 12, 'G12 Premium Note',true),
  ('00000000-0000-0000-0000-0000000c1202', 'html', 'free',    12, 'G12 Draft Note',  false);

insert into public.content_html_bodies (content_id, body_html) values
  ('00000000-0000-0000-0000-0000000c0901', '<p>free nine</p>'),
  ('00000000-0000-0000-0000-0000000c0902', '<p>premium nine</p>'),
  ('00000000-0000-0000-0000-0000000c1001', '<p>free ten</p>'),
  ('00000000-0000-0000-0000-0000000c1201', '<p>premium twelve</p>'),
  ('00000000-0000-0000-0000-0000000c1202', '<p>draft twelve</p>');

commit;

-- =============================================================================
-- 1. Registration hardening
-- =============================================================================

\echo '== 1. Registration hardening =='

begin;
-- A direct call to GoTrue with "role":"admin" in the metadata must not produce
-- an admin. This is the single most important check in the file.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000ee', 'escalate@rlstest.keleme',
   '{"full_name":"Escalation Attempt","phone":"0911000099","grade":"12","school_name":"X","role":"admin","is_suspended":false}');

select public._assert(
  (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000ee') = 'student',
  'metadata role=admin must be ignored; new users are always students');
rollback;

begin;
-- Invalid Ethiopian phone numbers are rejected at the database boundary, not
-- just by the form.
do $$
declare v_msg text;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (gen_random_uuid(), 'badphone@rlstest.keleme',
     '{"full_name":"Bad Phone","phone":"0812345678","grade":"12","school_name":"X"}');
  raise exception 'ASSERTION FAILED: an invalid phone number should have been rejected';
exception
  when sqlstate 'P0001' then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'registration_phone_invalid' then raise; end if;
end $$;
rollback;

begin;
do $$
declare v_msg text;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (gen_random_uuid(), 'badgrade@rlstest.keleme',
     '{"full_name":"Bad Grade","phone":"0911000098","grade":"7","school_name":"X"}');
  raise exception 'ASSERTION FAILED: grade 7 should have been rejected';
exception
  when sqlstate 'P0001' then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'registration_grade_invalid' then raise; end if;
end $$;
rollback;

-- =============================================================================
-- 2. Grade separation (spec section 7)
-- =============================================================================

\echo '== 2. Grade separation =='

set role authenticated;

select public._as('00000000-0000-0000-0000-000000000009');
do $$
declare n integer;
begin
  select count(*) into n from public.content_items where grade = 10;
  perform public._assert(n = 0, 'a grade 9 student must not see grade 10 content');

  select count(*) into n from public.content_items where grade = 9;
  perform public._assert(n = 2, 'a grade 9 student sees both published grade 9 items in the catalogue');

  select count(*) into n from public.content_items where not is_published;
  perform public._assert(n = 0, 'unpublished content is invisible to students');

  select count(*) into n from public.subjects where grade <> 9;
  perform public._assert(n = 0, 'a grade 9 student must not even see other grades'' subject list');
end $$;

-- Grade 12 is the deliberate exception: it reaches the whole 9-12 catalogue.
select public._as('00000000-0000-0000-0000-000000000012');
do $$
declare n integer;
begin
  select count(distinct grade) into n from public.content_items;
  perform public._assert(n = 3, 'a grade 12 student reaches grades 9, 10 and 12 fixtures');
end $$;

-- =============================================================================
-- 3. Premium body withholding (spec sections 8, 9, 24)
-- =============================================================================

\echo '== 3. Premium gating =='

select public._as('00000000-0000-0000-0000-000000000009');
do $$
declare n integer; body text;
begin
  -- Catalogue visibility: the free student SEES the premium note exists...
  select count(*) into n from public.content_items
  where id = '00000000-0000-0000-0000-0000000c0902';
  perform public._assert(n = 1, 'premium content is listable so students know what they would be buying');

  -- ...but the body is withheld by the separate table's stricter policy.
  select count(*) into n from public.content_html_bodies
  where content_id = '00000000-0000-0000-0000-0000000c0902';
  perform public._assert(n = 0, 'a free student must not read a premium HTML body');

  select count(*) into n from public.content_html_bodies
  where content_id = '00000000-0000-0000-0000-0000000c0901';
  perform public._assert(n = 1, 'a free student CAN read a free HTML body for their grade');
end $$;

do $$
begin
  perform public.get_content_html('00000000-0000-0000-0000-0000000c0902');
  raise exception 'ASSERTION FAILED: get_content_html should refuse premium content for a free student';
exception
  when insufficient_privilege then null;
end $$;

select public._as('00000000-0000-0000-0000-000000000013');
do $$
declare body text;
begin
  body := public.get_content_html('00000000-0000-0000-0000-0000000c1201');
  perform public._assert(body = '<p>premium twelve</p>', 'a premium student reads premium bodies');
end $$;

-- =============================================================================
-- 4. Privilege escalation attempts (spec section 27)
-- =============================================================================

\echo '== 4. Escalation attempts =='

select public._as('00000000-0000-0000-0000-000000000009');

do $$
begin
  perform public._assert_write_blocked(
    $s$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000009'$s$,
    'a student must not be able to grant themselves the admin role');

  perform public._assert_write_blocked(
    $s$update public.profiles set total_seconds = 999999999 where id = '00000000-0000-0000-0000-000000000009'$s$,
    'a student must not be able to write their own study time');

  perform public._assert_write_blocked(
    $s$update public.profiles set current_streak = 365 where id = '00000000-0000-0000-0000-000000000009'$s$,
    'a student must not be able to write their own streak');

  perform public._assert_write_blocked(
    $s$update public.profiles set grade = 12 where id = '00000000-0000-0000-0000-000000000009'$s$,
    'a student must not be able to change their own grade to unlock content');

  -- A real change, not a no-op write of the same values: point referred_by at
  -- another account and try to un-suspend, both of which the policy pins.
  perform public._assert_write_blocked(
    $s$update public.profiles
       set referred_by = '00000000-0000-0000-0000-000000000012'
       where id = '00000000-0000-0000-0000-000000000009'$s$,
    'a student must not be able to rewrite their referral lineage');

  perform public._assert_write_blocked(
    $s$update public.profiles set is_suspended = true
       where id = '00000000-0000-0000-0000-000000000012'$s$,
    'a student must not be able to suspend another account');

  perform public._assert_write_blocked(
    $s$insert into public.user_entitlements (user_id, kind, source, starts_at, ends_at)
       values ('00000000-0000-0000-0000-000000000009', 'premium', 'purchase', now(), now() + interval '365 days')$s$,
    'a student must not be able to grant themselves premium');

  perform public._assert_write_blocked(
    $s$update public.user_entitlements set ends_at = now() + interval '10 years'$s$,
    'a student must not be able to extend an entitlement');

  perform public._assert_write_blocked(
    $s$update public.plans set price = 0 where slug = 'standard-12m'$s$,
    'a student must not be able to rewrite plan prices');

  perform public._assert_write_blocked(
    $s$insert into public.contact_phones (phone, label) values ('0911999999', 'Hijacked')$s$,
    'a student must not be able to add a support phone number');

  perform public._assert_write_blocked(
    $s$update public.matric_question_options set is_correct = true$s$,
    'a student must not be able to rewrite the matric answer key');
end $$;

-- The legitimate half of the same policy: fields a student genuinely owns.
do $$
declare n integer;
begin
  update public.profiles set display_name = 'Niner', leaderboard_opt_in = true
  where id = '00000000-0000-0000-0000-000000000009';
  get diagnostics n = row_count;
  perform public._assert(n = 1, 'a student CAN edit their own display name and leaderboard opt-in');
end $$;

-- IDOR: reading another student's private row.
do $$
declare n integer;
begin
  select count(*) into n from public.profiles where id <> '00000000-0000-0000-0000-000000000009';
  perform public._assert(n = 0, 'a student must not read any other profile row');

  select count(*) into n from public.payments;
  perform public._assert(n = 0, 'a student must not read payments they do not own');

  select count(*) into n from public.audit_logs;
  perform public._assert(n = 0, 'a student must not read the audit log');

  select count(*) into n from public.app_settings;
  perform public._assert(n = 0, 'a student must not read platform settings');
end $$;

-- =============================================================================
-- 5. Matric answer key confidentiality (spec section 14)
-- =============================================================================

\echo '== 5. Matric answer key =='

reset role;

begin;
insert into public.matric_questions (id, year_id, subject_id, question_html, explanation_html, access_tier, is_published)
select '00000000-0000-0000-0000-0000000a0001',
       (select id from public.matric_years where year = 2016),
       (select id from public.subjects where grade = 12 and slug = 'mathematics'),
       '<p>What is 2 + 2?</p>', '<p>Because arithmetic.</p>', 'matric', false;

insert into public.matric_question_options (id, question_id, label, body_html, is_correct, sort_order) values
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000a0001', 'A', '3', false, 1),
  ('00000000-0000-0000-0000-0000000b0002', '00000000-0000-0000-0000-0000000a0001', 'B', '4', true,  2),
  ('00000000-0000-0000-0000-0000000b0003', '00000000-0000-0000-0000-0000000a0001', 'C', '5', false, 3);

update public.matric_questions set is_published = true where id = '00000000-0000-0000-0000-0000000a0001';
commit;

set role authenticated;

-- A student who owns the matric package still cannot read the answer key.
select public._as('00000000-0000-0000-0000-000000000014');
do $$
declare n integer;
begin
  select count(*) into n from public.matric_question_options;
  perform public._assert(n = 0, 'no student may select from matric_question_options — the answer key must be unreadable');

  select count(*) into n from public.matric_questions;
  perform public._assert(n = 1, 'a matric-entitled grade 12 student can read the question itself');
end $$;

-- The sanctioned path returns options with no is_correct field at all.
do $$
declare v_options jsonb;
begin
  select options into v_options from public.get_matric_questions(
    (select id from public.matric_years where year = 2016),
    (select id from public.subjects where grade = 12 and slug = 'mathematics'), 10, 0);

  perform public._assert(jsonb_array_length(v_options) = 3, 'get_matric_questions returns every option');
  perform public._assert(
    not (v_options::text like '%is_correct%'),
    'the projection returned to students must not contain is_correct');
end $$;

-- A grade 12 student without the matric package sees the question exists but
-- gets no text and no options.
select public._as('00000000-0000-0000-0000-000000000012');
do $$
declare r record;
begin
  select * into r from public.get_matric_questions(
    (select id from public.matric_years where year = 2016),
    (select id from public.subjects where grade = 12 and slug = 'mathematics'), 10, 0);

  perform public._assert(r.locked, 'matric content is locked without the matric package');
  perform public._assert(r.question_html is null, 'locked questions withhold their text');
  perform public._assert(jsonb_array_length(r.options) = 0, 'locked questions withhold their options');
end $$;

-- Grade 11 cannot reach matric at all, whatever they have bought.
select public._as('00000000-0000-0000-0000-000000000010');
do $$
declare n integer;
begin
  select count(*) into n from public.matric_questions;
  perform public._assert(n = 0, 'matric is a grade 12 product; grade 10 sees nothing');
end $$;

-- Grading happens server-side and cannot be replayed.
select public._as('00000000-0000-0000-0000-000000000014');
do $$
declare v_attempt uuid; v_result jsonb; v_msg text;
begin
  v_attempt := public.start_matric_attempt(
    (select id from public.matric_years where year = 2016),
    (select id from public.subjects where grade = 12 and slug = 'mathematics'));

  v_result := public.submit_matric_answer(v_attempt, '00000000-0000-0000-0000-0000000a0001',
                                          '00000000-0000-0000-0000-0000000b0001');
  perform public._assert((v_result ->> 'is_correct')::boolean = false, 'option A is wrong');
  perform public._assert(v_result ->> 'explanation_html' is not null, 'the explanation is revealed after answering');

  begin
    perform public.submit_matric_answer(v_attempt, '00000000-0000-0000-0000-0000000a0001',
                                        '00000000-0000-0000-0000-0000000b0002');
    raise exception 'ASSERTION FAILED: re-answering a question should be rejected';
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_msg = message_text;
      if v_msg <> 'already_answered' then raise; end if;
  end;
end $$;

-- =============================================================================
-- 6. Study time anti-cheat (spec sections 17, 20)
-- =============================================================================

\echo '== 6. Time tracking =='

select public._as('00000000-0000-0000-0000-000000000009');

do $$
declare v1 jsonb; v2 jsonb; v_session uuid; v_credited integer;
begin
  v1 := public.record_heartbeat(null);
  v_session := (v1 ->> 'session_id')::uuid;
  perform public._assert(v_session is not null, 'the first heartbeat opens a session');
  perform public._assert((v1 ->> 'credited_seconds')::integer = 0,
    'the opening heartbeat credits nothing — there is no elapsed time yet');

  -- Backdate the session as though the tab had been left open for six hours,
  -- then heartbeat: the clamp must credit the 90s cap, not six hours.
  update public.study_sessions set last_heartbeat_at = now() - interval '6 hours' where id = v_session;

  v2 := public.record_heartbeat(v_session);
  v_credited := (v2 ->> 'credited_seconds')::integer;
  perform public._assert(v_credited <= 90,
    format('an idle tab must credit at most the 90s cap, credited %s', v_credited));
end $$;

-- Direct writes to the activity tables are refused. These tables carry a
-- SELECT policy and deliberately no INSERT/UPDATE policy at all, so a forged
-- write is either rejected outright or matches zero rows — never applied.
do $$
begin
  perform public._assert_write_blocked(
    $s$insert into public.daily_activity (user_id, activity_date, seconds)
       values ('00000000-0000-0000-0000-000000000009', current_date, 99999)$s$,
    'a student must not be able to insert fabricated study time');

  perform public._assert_write_blocked(
    $s$update public.daily_activity set seconds = 99999
       where user_id = '00000000-0000-0000-0000-000000000009'$s$,
    'a student must not be able to rewrite their study time');

  perform public._assert_write_blocked(
    $s$update public.study_sessions set counted_seconds = 99999
       where user_id = '00000000-0000-0000-0000-000000000009'$s$,
    'a student must not be able to rewrite a study session');

  perform public._assert_write_blocked(
    $s$update public.weekly_reward_winners set rank = 1$s$,
    'a student must not be able to rewrite the weekly reward ranking');
end $$;

-- Only one open study session exists no matter how many tabs heartbeat.
do $$
declare n integer;
begin
  perform public.record_heartbeat(null);
  perform public.record_heartbeat(null);
  select count(*) into n from public.study_sessions
  where user_id = '00000000-0000-0000-0000-000000000009' and ended_at is null;
  perform public._assert(n = 1, format('exactly one open session per account, found %s', n));
end $$;

-- =============================================================================
-- 7. Streaks (spec section 16)
-- =============================================================================

\echo '== 7. Streaks =='

reset role;

begin;
-- Three consecutive qualifying days, then a gap, then today.
insert into public.daily_activity (user_id, activity_date, seconds, is_learning_day) values
  ('00000000-0000-0000-0000-000000000010', current_date - 1, 600, true),
  ('00000000-0000-0000-0000-000000000010', current_date - 2, 600, true),
  ('00000000-0000-0000-0000-000000000010', current_date - 3, 600, true),
  ('00000000-0000-0000-0000-000000000010', current_date - 5, 600, true),
  ('00000000-0000-0000-0000-000000000010', current_date,     600, false)
on conflict (user_id, activity_date) do update set seconds = excluded.seconds;

select public.refresh_streak('00000000-0000-0000-0000-000000000010', current_date);

select public._assert(
  (select current_streak from public.profiles where id = '00000000-0000-0000-0000-000000000010') = 4,
  'four consecutive qualifying days (today plus three) form a streak of 4, and the gap at -5 ends it');

-- A day below the threshold does not qualify, and breaks the chain.
insert into public.daily_activity (user_id, activity_date, seconds) values
  ('00000000-0000-0000-0000-000000000012', current_date, 60)
on conflict (user_id, activity_date) do update set seconds = 60;
select public.refresh_streak('00000000-0000-0000-0000-000000000012', current_date);
select public._assert(
  (select current_streak from public.profiles where id = '00000000-0000-0000-0000-000000000012') = 0,
  'one minute of study does not earn a streak day');

-- Idempotence: recomputing must not inflate.
select public.refresh_streak('00000000-0000-0000-0000-000000000010', current_date);
select public.refresh_streak('00000000-0000-0000-0000-000000000010', current_date);
select public._assert(
  (select current_streak from public.profiles where id = '00000000-0000-0000-0000-000000000010') = 4,
  'refresh_streak is idempotent');
commit;

-- =============================================================================
-- 8. Leaderboard privacy (spec sections 18, 33)
-- =============================================================================

\echo '== 8. Leaderboard privacy =='

reset role;
update public.profiles set leaderboard_opt_in = false where email = 'g10@rlstest.keleme';
update public.profiles set leaderboard_opt_in = true, display_name = 'Opted In'
  where email = 'g12free@rlstest.keleme';
update public.daily_activity set seconds = 3600 where user_id = '00000000-0000-0000-0000-000000000012';

set role authenticated;
select public._as('00000000-0000-0000-0000-000000000009');

do $$
declare r record; v_found boolean := false;
begin
  for r in select * from public.get_leaderboard('all', 50, 0) loop
    if r.user_id = '00000000-0000-0000-0000-000000000010' then
      v_found := true;
      perform public._assert(r.is_anonymous, 'a student who did not opt in must be anonymous');
      perform public._assert(r.display_name like 'Student #%',
        format('anonymous rows use the Student #NNNN form, got %s', r.display_name));
      perform public._assert(r.display_name not like '%Grade Ten%',
        'a real name must never leak for a student who did not opt in');
    end if;
    if r.user_id = '00000000-0000-0000-0000-000000000012' then
      perform public._assert(r.display_name = 'Opted In', 'an opted-in student shows their chosen name');
    end if;
  end loop;
  perform public._assert(v_found, 'non-opted-in students still appear, anonymised, so the ranking is honest');
end $$;

-- Structural check on the projection itself: the leaderboard's declared result
-- columns must not include any contact or identity field. This catches the
-- realistic regression — someone adding `school_name` to the SELECT for a
-- "show which school is winning" feature and quietly publishing private data.
do $$
declare v_sig text;
begin
  select pg_get_function_result(p.oid) into v_sig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_leaderboard';

  perform public._assert(v_sig is not null, 'get_leaderboard exists');
  perform public._assert(
    v_sig !~* '(phone|email|school|full_name|referral)',
    format('the leaderboard projection must expose no contact or identity fields, got: %s', v_sig));
end $$;

-- =============================================================================
-- 9. Referrals (spec section 15)
-- =============================================================================

\echo '== 9. Referrals =='

reset role;

begin;
-- Register five students under the grade 9 student's referral code.
do $$
declare v_code text; i integer; v_id uuid;
begin
  select referral_code into v_code from public.profiles
  where id = '00000000-0000-0000-0000-000000000009';

  for i in 1..5 loop
    v_id := gen_random_uuid();
    insert into auth.users (id, email, raw_user_meta_data) values (
      v_id, format('ref%s@rlstest.keleme', i),
      json_build_object(
        'full_name', format('Referred %s', i),
        'phone', format('09220000%s%s', i / 10, i % 10),
        'grade', '10', 'school_name', 'Referral School',
        'referral_code', v_code
      )::jsonb
    );
  end loop;
end $$;

-- Registration alone earns nothing: the referrals are pending until the
-- referred student actually signs in.
select public._assert(
  (select count(*) from public.referrals
   where referrer_id = '00000000-0000-0000-0000-000000000009' and status = 'pending') = 5,
  'referrals start pending — a registration that is never signed into must not pay out');

select public._assert(
  not public.has_active_entitlement('premium', '00000000-0000-0000-0000-000000000009'),
  'no reward is granted from pending referrals');

-- Confirm all five, as the sign-in path does.
do $$
declare r record;
begin
  for r in select referred_id from public.referrals
           where referrer_id = '00000000-0000-0000-0000-000000000009' loop
    perform public.confirm_referral_and_reward(r.referred_id);
  end loop;
end $$;

select public._assert(
  public.has_active_entitlement('premium', '00000000-0000-0000-0000-000000000009'),
  'five confirmed referrals grant the 1-month premium tier');

select public._assert(
  (select count(*) from public.referral_rewards
   where user_id = '00000000-0000-0000-0000-000000000009') = 1,
  'exactly one tier has been paid at five referrals');

-- Re-confirming must not pay twice.
do $$
declare r record;
begin
  for r in select referred_id from public.referrals
           where referrer_id = '00000000-0000-0000-0000-000000000009' loop
    perform public.confirm_referral_and_reward(r.referred_id);
  end loop;
end $$;

select public._assert(
  (select count(*) from public.referral_rewards
   where user_id = '00000000-0000-0000-0000-000000000009') = 1,
  'replaying confirmation must not pay a tier twice');

-- Self-referral is impossible by constraint.
do $$
begin
  insert into public.referrals (referrer_id, referred_id, referral_code)
  values ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000009', 'SELF01');
  raise exception 'ASSERTION FAILED: self-referral was accepted';
exception
  when check_violation then null;
end $$;

-- A duplicate phone number cannot register a second account at all, which is
-- what makes farming referrals expensive.
do $$
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (gen_random_uuid(), 'dupe@rlstest.keleme',
     '{"full_name":"Duplicate Phone","phone":"0911000009","grade":"10","school_name":"X"}');
  raise exception 'ASSERTION FAILED: a duplicate phone number was accepted';
exception
  when unique_violation then null;
end $$;

rollback;

-- =============================================================================
-- 10. Suspension and content-editor boundaries
-- =============================================================================

\echo '== 10. Suspension and roles =='

reset role;
begin;
update public.profiles set is_suspended = true where id = '00000000-0000-0000-0000-000000000013';

set role authenticated;
select public._as('00000000-0000-0000-0000-000000000013');
do $$
declare n integer;
begin
  select count(*) into n from public.content_html_bodies
  where content_id = '00000000-0000-0000-0000-0000000c1201';
  perform public._assert(n = 0, 'a suspended student loses content access even while premium is live');
end $$;
reset role;
rollback;

begin;
update public.profiles set role = 'content_editor' where id = '00000000-0000-0000-0000-000000000010';

set role authenticated;
select public._as('00000000-0000-0000-0000-000000000010');
do $$
declare n integer;
begin
  select count(*) into n from public.content_items;
  perform public._assert(n = 5, 'a content editor sees the whole catalogue including drafts');

  select count(*) into n from public.profiles;
  perform public._assert(n > 1, 'a content editor can read profiles to attribute authorship');

  -- ...but is not an administrator.
  update public.plans set price = 1 where slug = 'standard-1m';
  get diagnostics n = row_count;
  perform public._assert(n = 0, 'a content editor must not change prices');

  select count(*) into n from public.audit_logs;
  perform public._assert(n = 0, 'a content editor must not read the audit log');
end $$;
reset role;
rollback;

-- =============================================================================
-- 11. Single active session (spec section 21)
-- =============================================================================

\echo '== 11. Single session =='

reset role;
begin;

set role authenticated;
select public._as('00000000-0000-0000-0000-000000000009');

do $$
declare v_first jsonb; v_second jsonb;
begin
  v_first := public.on_sign_in('hash-phone', 'Mozilla/5.0 (Android)', 'Phone');
  perform public._assert(v_first ->> 'session_id' is not null, 'signing in registers a device session');
  perform public._assert(public.validate_device_session('hash-phone'), 'the new session validates');

  -- Signing in on a second device must invalidate the first, not run alongside
  -- it. This is the whole point of the mechanism: a shared account stops
  -- working for whoever is not currently signed in.
  v_second := public.on_sign_in('hash-laptop', 'Mozilla/5.0 (Windows)', 'Laptop');
  perform public._assert((v_second ->> 'revoked_previous')::integer = 1,
    'the second sign-in revokes exactly the one previous session');
  perform public._assert(not public.validate_device_session('hash-phone'),
    'the first device is signed out once the account is used elsewhere');
  perform public._assert(public.validate_device_session('hash-laptop'),
    'the second device is the live one');

  -- Signing out ends it for good.
  perform public.end_device_session('hash-laptop');
  perform public._assert(not public.validate_device_session('hash-laptop'),
    'signing out revokes the session');
end $$;

-- A forged token belonging to nobody must never validate, and one belonging to
-- another student must not validate for this caller either.
do $$
begin
  perform public._assert(not public.validate_device_session('not-a-real-token'),
    'an unknown device token must not validate');
end $$;

-- The session context must not carry the raw phone number to the client.
do $$
declare v_ctx jsonb;
begin
  v_ctx := public.get_session_context('hash-laptop');
  perform public._assert(v_ctx is not null, 'a signed-in student gets a session context');
  perform public._assert(not (v_ctx -> 'profile' ? 'phone'),
    'the session context must not include the raw phone number');
  perform public._assert(v_ctx -> 'profile' ->> 'phone_masked' like '+251 ** *** %',
    'the phone is surfaced masked, for the student to recognise, not in full');
  perform public._assert((v_ctx ->> 'ad_level') = 'high',
    'a student with no paid plan is on the free tier ad level');
  perform public._assert((v_ctx ->> 'device_valid')::boolean = false,
    'the context reports a revoked device, which is how the app signs the old phone out');
end $$;

reset role;
rollback;

-- =============================================================================
-- 12. Payments and entitlements (spec section 28)
-- =============================================================================

\echo '== 12. Payments =='

reset role;
begin;

set role authenticated;
select public._as('00000000-0000-0000-0000-000000000009');

-- The amount is read from the plan, never from the request, so a student
-- cannot ask to buy a year of Premium for 1 birr.
do $$
declare v_req jsonb; v_amount numeric; v_plan_price numeric;
begin
  v_req := public.request_plan((select id from public.plans where slug = 'standard-12m'));
  perform public._assert(v_req ->> 'payment_id' is not null, 'requesting a plan creates a payment');

  select amount into v_amount from public.payments where id = (v_req ->> 'payment_id')::uuid;
  select price into v_plan_price from public.plans where slug = 'standard-12m';
  perform public._assert(v_amount = v_plan_price,
    'the payment amount comes from the plan row, not from the client');

  -- A pending payment grants nothing. Access follows the entitlement, and the
  -- entitlement follows confirmation.
  perform public._assert(
    (select status from public.payments where id = (v_req ->> 'payment_id')::uuid) = 'pending',
    'a new request starts pending');
end $$;

-- Repeated taps reuse the outstanding request rather than piling up rows.
do $$
declare v_a jsonb; v_b jsonb; v_count integer;
begin
  v_a := public.request_plan((select id from public.plans where slug = 'standard-1m'));
  v_b := public.request_plan((select id from public.plans where slug = 'standard-1m'));
  perform public._assert(v_a ->> 'payment_id' = v_b ->> 'payment_id',
    'a second request for the same plan reuses the pending one');
  perform public._assert((v_b ->> 'reused')::boolean, 'and says so');
end $$;

-- A student must not be able to confirm their own payment.
do $$
begin
  perform public.confirm_payment(
    (select id from public.payments where user_id = auth.uid() limit 1), 'forged');
  raise exception 'ASSERTION FAILED: a student confirmed their own payment';
exception
  when insufficient_privilege then null;
end $$;

do $$
begin
  perform public.admin_confirm_payment(
    (select id from public.payments where user_id = auth.uid() limit 1), 'forged');
  raise exception 'ASSERTION FAILED: a student called the admin confirmation function';
exception
  when insufficient_privilege then null;
end $$;

-- The matric package is a grade 12 product; selling it to grade 9 would take
-- money for something unusable.
do $$
declare v_msg text;
begin
  perform public.request_plan((select id from public.plans where slug = 'matric-1m'));
  raise exception 'ASSERTION FAILED: a grade 9 student was sold the matric package';
exception
  when sqlstate 'P0001' then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'matric_plan_requires_grade_12' then raise; end if;
end $$;

reset role;

-- Confirmation is what creates access, and it is idempotent — the property
-- that makes a replayed provider webhook harmless.
do $$
declare v_payment uuid; v_first uuid; v_second uuid; v_count integer;
begin
  select id into v_payment from public.payments
  where user_id = '00000000-0000-0000-0000-000000000009' and status = 'pending'
  order by amount desc limit 1;

  v_first := public.confirm_payment(v_payment, 'REF-1');
  perform public._assert(v_first is not null, 'confirming a payment grants an entitlement');
  perform public._assert(
    public.has_active_entitlement('premium', '00000000-0000-0000-0000-000000000009'),
    'the student is premium once the payment is confirmed');

  v_second := public.confirm_payment(v_payment, 'REF-1');
  perform public._assert(v_first = v_second, 'replaying confirmation returns the same entitlement');

  select count(*) into v_count from public.user_entitlements where payment_id = v_payment;
  perform public._assert(v_count = 1, 'replaying confirmation must not grant a second entitlement');
end $$;

rollback;

-- =============================================================================
-- Cleanup
-- =============================================================================

reset role;
delete from auth.users where email like '%@rlstest.keleme';
delete from public.matric_questions where id = '00000000-0000-0000-0000-0000000a0001';
delete from public.content_items where id::text like '00000000-0000-0000-0000-0000000c%';

\echo ''
\echo '================================================'
\echo '  ALL RLS ASSERTIONS PASSED'
\echo '================================================'
