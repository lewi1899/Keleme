-- =============================================================================
-- KELEME — load-test dataset
--
-- Generates a plausible platform at scale so the hot queries can be profiled
-- against real row counts rather than an empty database. Sizes are set by the
-- :students variable (default 100,000).
--
-- This bypasses the auth.users trigger deliberately: handle_new_user does a
-- school lookup and a referral resolution per row, which is correct for a real
-- registration and far too slow for a bulk load. The rows it produces are
-- identical in shape.
--
--   psql -d keleme_load -v students=100000 -f scripts/loadtest/seed.sql
-- =============================================================================

\set ON_ERROR_STOP on
\timing on

\if :{?students}
\else
  \set students 100000
\endif

\echo 'Generating dataset...'

alter table auth.users disable trigger on_auth_user_created;
alter table public.profiles disable trigger profiles_link_referral;

-- ---------------------------------------------------------------------------
-- Schools — 1,200, roughly the number of secondary schools in Ethiopia
-- ---------------------------------------------------------------------------
insert into public.schools (name, region, city)
select
  'School ' || i,
  (array['Addis Ababa','Oromia','Amhara','Tigray','SNNPR','Sidama','Somali','Afar'])[1 + (i % 8)],
  'City ' || (i % 60)
from generate_series(1, 1200) i;

-- ---------------------------------------------------------------------------
-- Students
--
-- Grade mix weighted toward 12 and 11, which is where an exam-prep platform
-- actually concentrates. Streaks and totals are skewed rather than uniform:
-- most students are light users and a small tail are heavy, which is what
-- makes the leaderboard's ORDER BY interesting.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data)
select
  ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'student' || i || '@load.test',
  '{}'::jsonb
from generate_series(1, :students) i;

insert into public.profiles (
  id, full_name, phone, email, grade, school_id, school_name, role,
  display_name, leaderboard_opt_in, current_streak, longest_streak,
  last_activity_date, total_seconds, referral_code, timezone, created_at
)
select
  ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'Student ' || i || ' Tesfaye',
  '+2519' || lpad(i::text, 8, '0'),
  'student' || i || '@load.test',
  (array[9,10,11,12,12,11])[1 + (i % 6)]::smallint,
  s.id,
  s.name,
  'student',
  case when i % 3 = 0 then 'Star ' || i else null end,
  (i % 3 = 0),                                   -- a third opt in to the leaderboard
  case when i % 7 = 0 then (i % 60) else 0 end,  -- most have no streak
  case when i % 7 = 0 then (i % 90) else 0 end,
  case when i % 5 = 0 then current_date - (i % 30) else null end,
  case when i % 4 = 0 then (i % 500000)::bigint else (i % 5000)::bigint end,
  'L' || lpad(to_hex(i), 7, '0'),
  'Africa/Addis_Ababa',
  now() - ((i % 400) || ' days')::interval
from generate_series(1, :students) i
join public.schools s on s.id = (
  select id from public.schools offset (i % 1200) limit 1
);

\echo 'Students inserted.'

-- ---------------------------------------------------------------------------
-- One staff account.
--
-- bench.sql authenticates as this UUID to time the admin paths. Without the
-- row, is_staff() is false, admin_dashboard_metrics() raises 'forbidden', and
-- because psql runs the bench under ON_ERROR_STOP=1 the script aborts there —
-- taking the last five benchmarks with it. That was silent: the run still
-- printed every student-path table above it and exited 0 via the pipeline, so
-- the admin numbers looked absent rather than failed.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000a1'::uuid, 'admin@load.test', '{}'::jsonb);

insert into public.profiles (
  id, full_name, phone, email, grade, school_id, school_name, role,
  leaderboard_opt_in, referral_code, timezone, created_at
)
select
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'Load Test Admin',
  -- NOT a '+2519...' number: students take '+2519' || lpad(i, 8, '0'), so
  -- student 1 already owns +251900000001 and profiles_phone_key is unique.
  '+251111000001',
  'admin@load.test',
  12::smallint,
  s.id,
  s.name,
  'admin',
  false,
  'LADMIN0',
  'Africa/Addis_Ababa',
  now()
from public.schools s
order by s.id
limit 1;

-- ---------------------------------------------------------------------------
-- Units and content
--
-- 10,000 published items — a far larger catalogue than launch, on purpose:
-- the question is where it breaks, not whether it works on day one.
-- ---------------------------------------------------------------------------
insert into public.units (subject_id, title, sort_order)
select s.id, 'Unit ' || u, u
from public.subjects s
cross join generate_series(1, 8) u;

insert into public.content_items (
  content_type, access_tier, grade, subject_id, unit_id, title, description,
  is_published, sort_order, storage_path, youtube_video_id, created_at
)
select
  ct.content_type,
  (array['free','free','premium','premium','matric'])[1 + (i % 5)]::public.access_tier,
  s.grade,
  s.id,
  (select id from public.units where subject_id = s.id order by sort_order limit 1 offset (i % 8)),
  ct.label || ' ' || i || ' — ' || s.name,
  'Generated load-test content item number ' || i,
  (i % 20 <> 0),                                 -- 5% left as drafts
  i % 100,
  case when ct.content_type = 'pdf' then 'grade-' || s.grade || '/load-' || i || '.pdf' end,
  case when ct.content_type = 'youtube' then substr(md5(i::text), 1, 11) end,
  now() - ((i % 365) || ' days')::interval
from generate_series(1, 10000) i
join lateral (
  select id, grade, name from public.subjects order by id offset (i % 40) limit 1
) s on true
join lateral (
  select
    (array['html','html','pdf','youtube'])[1 + (i % 4)]::public.content_type as content_type,
    (array['Notes','Notes','Textbook','Video'])[1 + (i % 4)] as label
) ct on true;

-- HTML bodies for every html item.
insert into public.content_html_bodies (content_id, body_html)
select id, '<h2>Section</h2><p>' || repeat('Generated study content for load testing. ', 40) || '</p>'
from public.content_items where content_type = 'html';

\echo 'Content inserted.'

-- ---------------------------------------------------------------------------
-- Matric questions — 5,000 across the years, with four options each
-- ---------------------------------------------------------------------------
insert into public.matric_questions (
  year_id, subject_id, question_html, explanation_html, difficulty, access_tier,
  marks, sort_order, is_published
)
select
  y.id,
  s.id,
  '<p>Load-test question ' || i || ': which of these is correct?</p>',
  '<p>Because of the reason explained here.</p>',
  (array['easy','medium','hard'])[1 + (i % 3)]::public.question_difficulty,
  case when i % 10 = 0 then 'free' else 'matric' end::public.access_tier,
  1,
  i % 200,
  true
from generate_series(1, 5000) i
join lateral (select id from public.matric_years order by year desc offset (i % 4) limit 1) y on true
join lateral (select id from public.subjects where grade = 12 order by id offset (i % 10) limit 1) s on true;

insert into public.matric_question_options (question_id, label, body_html, is_correct, sort_order)
select q.id, l.label, 'Option ' || l.label, (l.n = 1 + (('x' || substr(md5(q.id::text), 1, 8))::bit(32)::bigint % 4)), l.n
from public.matric_questions q
cross join (values ('A',0),('B',1),('C',2),('D',3)) as l(label, n);

\echo 'Matric questions inserted.'

-- ---------------------------------------------------------------------------
-- Daily activity — the biggest table, and the one the leaderboard aggregates
--
-- 60 days for the 40% of students who are active. This is what a platform
-- looks like two months after launch.
-- ---------------------------------------------------------------------------
insert into public.daily_activity (user_id, activity_date, seconds, content_opened, questions_answered, is_learning_day)
select
  p.id,
  current_date - d,
  (200 + (abs(hashtext(p.id::text || d::text)) % 5400))::integer,
  abs(hashtext(p.id::text)) % 8,
  abs(hashtext(d::text || p.id::text)) % 15,
  (abs(hashtext(p.id::text || d::text)) % 5400) > 300
from public.profiles p
cross join generate_series(0, 59) d
where p.role = 'student'
  and abs(hashtext(p.id::text)) % 10 < 4        -- 40% are active
on conflict do nothing;

\echo 'Daily activity inserted.'

-- ---------------------------------------------------------------------------
-- Entitlements, payments, referrals
-- ---------------------------------------------------------------------------
insert into public.user_entitlements (user_id, kind, source, starts_at, ends_at)
select
  p.id,
  case when abs(hashtext(p.id::text)) % 5 = 0 then 'matric' else 'premium' end::public.entitlement_kind,
  'purchase',
  now() - interval '30 days',
  now() + ((abs(hashtext(p.id::text)) % 300) || ' days')::interval
from public.profiles p
where p.role = 'student' and abs(hashtext(p.id::text)) % 8 = 0;   -- ~12% paying

insert into public.payments (user_id, plan_id, provider, amount, status, paid_at)
select
  p.id,
  (select id from public.plans where slug = 'standard-3m'),
  'manual',
  120,
  'paid',
  now() - interval '30 days'
from public.profiles p
where p.role = 'student' and abs(hashtext(p.id::text)) % 8 = 0;

-- A referral graph: every 6th student was brought in by an earlier one.
insert into public.referrals (referrer_id, referred_id, referral_code, status, confirmed_at)
select
  ('00000000-0000-4000-8000-' || lpad(((i / 6) + 1)::text, 12, '0'))::uuid,
  ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'L' || lpad(to_hex((i / 6) + 1), 7, '0'),
  'confirmed',
  now() - ((i % 100) || ' days')::interval
from generate_series(7, :students) i
where i % 6 = 0
on conflict do nothing;

alter table auth.users enable trigger on_auth_user_created;
alter table public.profiles enable trigger profiles_link_referral;

-- Statistics decide every plan below; without this the planner is working from
-- the empty-table estimates it had before the load.
\echo 'Analyzing...'
vacuum analyze;

\echo ''
\echo '=== dataset ==='
select 'profiles' as t, count(*) from public.profiles
union all select 'daily_activity', count(*) from public.daily_activity
union all select 'content_items', count(*) from public.content_items
union all select 'content_html_bodies', count(*) from public.content_html_bodies
union all select 'matric_questions', count(*) from public.matric_questions
union all select 'matric_question_options', count(*) from public.matric_question_options
union all select 'user_entitlements', count(*) from public.user_entitlements
union all select 'referrals', count(*) from public.referrals
union all select 'units', count(*) from public.units
order by 1;

select pg_size_pretty(pg_database_size(current_database())) as database_size;
