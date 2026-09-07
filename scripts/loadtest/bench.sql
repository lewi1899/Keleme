-- =============================================================================
-- KELEME — hot-path benchmark
--
-- Times every query the app actually issues on its busiest screens, run as the
-- `authenticated` role with a forged JWT claim — so RLS is ON and every policy
-- function is being called, exactly as in production. A benchmark run as
-- superuser would skip all of that and report numbers the app never sees.
--
-- Each query runs several times; the reported figure is the median, so one
-- cold read or one background checkpoint does not become the headline.
--
--   psql -d keleme_load -f scripts/loadtest/bench.sql
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off

create extension if not exists plpgsql;

create or replace function pg_temp.bench(p_label text, p_sql text, p_runs integer default 7)
returns table (query text, runs integer, median_ms numeric, min_ms numeric, max_ms numeric)
language plpgsql
as $$
declare
  v_start timestamptz;
  v_times numeric[] := '{}';
  i integer;
begin
  -- One untimed warm-up: the first execution pays for plan caching and page
  -- reads that a busy server would already have done.
  execute p_sql;

  for i in 1..p_runs loop
    v_start := clock_timestamp();
    execute p_sql;
    v_times := v_times || (extract(epoch from (clock_timestamp() - v_start)) * 1000)::numeric;
  end loop;

  select array_agg(t order by t) into v_times from unnest(v_times) t;

  return query select
    p_label,
    p_runs,
    round(v_times[(p_runs + 1) / 2], 1),
    round(v_times[1], 1),
    round(v_times[p_runs], 1);
end;
$$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000042","role":"authenticated"}', false);
set role authenticated;

\echo ''
\echo '=== STUDENT HOT PATHS (RLS on, as an authenticated student) ==='

select * from pg_temp.bench('leaderboard weekly (top 20)',
  $$select * from public.get_leaderboard('weekly', 20, 0)$$);

select * from pg_temp.bench('leaderboard monthly (top 20)',
  $$select * from public.get_leaderboard('monthly', 20, 0)$$);

select * from pg_temp.bench('leaderboard all-time (top 20)',
  $$select * from public.get_leaderboard('all', 20, 0)$$);

select * from pg_temp.bench('my rank (weekly)',
  $$select public.get_my_rank('weekly')$$);

select * from pg_temp.bench('session context (every page load)',
  $$select public.get_session_context('warm-token')$$);

select * from pg_temp.bench('browse subjects for my grade',
  $$select * from public.subjects where is_active order by sort_order$$);

select * from pg_temp.bench('list content, one subject (RLS per row)',
  $$select * from public.content_items where is_published
    order by sort_order limit 24$$);

select * from pg_temp.bench('search content by title',
  $$select * from public.content_items
    where is_published and title ilike '%Notes 42%' limit 24$$);

select * from pg_temp.bench('read one HTML note body',
  $$select public.get_content_html(
      (select id from public.content_items
       where content_type = 'html' and access_tier = 'free' and grade = 9
       and is_published limit 1))$$);

select * from pg_temp.bench('matric catalogue',
  $$select * from public.get_matric_catalog()$$);

select * from pg_temp.bench('dashboard: recent progress',
  $$select cp.content_id, cp.last_opened_at, ci.title
    from public.content_progress cp
    join public.content_items ci on ci.id = cp.content_id
    order by cp.last_opened_at desc limit 4$$);

-- Two shapes of the same question, kept side by side because the gap between
-- them is the single most important performance lesson in this schema.
select * from pg_temp.bench('dashboard: week activity (NO user filter, RLS only)',
  $$select coalesce(sum(seconds), 0) from public.daily_activity
    where activity_date >= current_date - 7$$);

select * from pg_temp.bench('dashboard: week activity (explicit user filter)',
  $$select coalesce(sum(seconds), 0) from public.daily_activity
    where user_id = '00000000-0000-4000-8000-000000000042'
      and activity_date >= current_date - 7$$);

select * from pg_temp.bench('my referral summary',
  $$select public.get_my_referral_summary()$$);

reset role;

\echo ''
\echo '=== WRITE PATH (the most frequent write in the system) ==='

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000777","role":"authenticated"}', false);
set role authenticated;

select * from pg_temp.bench('heartbeat (every 60s per active student)',
  $$select public.record_heartbeat(null)$$, 15);

reset role;

\echo ''
\echo '=== ADMIN PATHS ==='

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', false);
set role authenticated;

select * from pg_temp.bench('admin dashboard metrics',
  $$select public.admin_dashboard_metrics()$$, 5);

select * from pg_temp.bench('admin student search (page 1)',
  $$select public.admin_search_students(null, null, 'all', 25, 0)$$, 5);

select * from pg_temp.bench('admin student search by name',
  $$select public.admin_search_students('Tesfaye', null, 'all', 25, 0)$$, 5);

select * from pg_temp.bench('admin student filter: premium only',
  $$select public.admin_search_students(null, null, 'premium', 25, 0)$$, 5);

select * from pg_temp.bench('admin 30-day activity chart',
  $$select * from public.admin_activity_series(30)$$, 5);

select * from pg_temp.bench('admin content list (page 1)',
  $$select * from public.content_items order by updated_at desc limit 25$$, 5);

reset role;
