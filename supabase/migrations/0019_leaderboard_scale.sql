-- =============================================================================
-- KELEME — 0019 Leaderboard and rank at 500k–1M students
--
-- 0013 made the leaderboard fast at 100,000 students by aggregating the period
-- before joining. That fix does not scale further, because the work it does is
-- proportional to the number of activity rows in the period, and that number
-- grows with the student body:
--
--     students   weekly activity rows   get_leaderboard   get_my_rank
--      100,000              ~280,000           100.0ms        60.8ms
--      500,000            ~1,400,000                 (measured below)
--
-- The board itself is survivable: the app caches it for 60 seconds, so the
-- cost is paid once a minute for the whole site.
--
-- `get_my_rank` is the real problem. Its threshold is the calling student's
-- own seconds, so no two students share a result and nothing can be cached
-- across them. Every dashboard load pays a full period aggregate. At a million
-- students that is roughly a second of database time per page view, which is
-- not a slow page — it is an outage.
--
-- The shape of the fix: stop deriving the ranking per request, and derive it
-- per interval instead.
--
--   leaderboard_top   exact ranks for the head of the board — everything the
--                     board itself can page through, plus enough beyond it
--                     that most engaged students get an exact rank.
--   leaderboard_dist  a ~200-point cumulative distribution for the long tail,
--                     so a student outside the head still gets a rank without
--                     anyone counting the students above them.
--
-- Refresh cost is one aggregate plus ~1,200 row writes per scope, regardless
-- of whether there are 100,000 students or 10,000,000. That last property is
-- the point: a full summary table with an exact row per student would make
-- reads O(1) too, but would churn 400,000 rows a minute at a million students
-- and hand the problem to autovacuum instead.
--
-- WHAT THIS TRADES AWAY, stated plainly:
--   - Ranks become as stale as the refresh interval. The board was already
--     60s stale via the app's unstable_cache, so nothing changes there.
--     `get_my_rank` was live and is now not. A rank a minute old is fine; a
--     rank that costs a second of database time is not.
--   - Below LEADERBOARD_TOP_N the rank is approximate, accurate to within one
--     distribution bucket. The response says so (`approximate: true`) and
--     carries a percentile, which is the more useful number down there
--     anyway.
--
-- Correctness does not depend on the refresh ever running: if a scope has no
-- summary, or one older than the staleness ceiling, both functions fall back
-- to the live computation from 0013. A project that never schedules the
-- refresh behaves exactly as it did before this migration, only slower than
-- one that does.
-- =============================================================================

-- How many students get an exact rank. 5,000 covers the whole pageable board
-- (get_leaderboard caps offset+limit well below this) with room to spare.
create or replace function public.leaderboard_top_n()
returns integer language sql immutable parallel safe as $$ select 5000 $$;

-- Sample points in the tail distribution. 200 buckets over the ranked tail
-- puts the approximate rank within total/200 positions of the true one.
create or replace function public.leaderboard_buckets()
returns integer language sql immutable parallel safe as $$ select 200 $$;

-- A summary older than this is not trusted; the functions fall back to the
-- live aggregate rather than serve a stale board.
create or replace function public.leaderboard_max_staleness()
returns interval language sql immutable parallel safe as $$ select interval '15 minutes' $$;

-- ---------------------------------------------------------------------------
-- Summary tables
-- ---------------------------------------------------------------------------

create table if not exists public.leaderboard_top (
  scope    text   not null,
  rank     bigint not null,
  user_id  uuid   not null references public.profiles(id) on delete cascade,
  seconds  bigint not null,
  primary key (scope, rank)
);

-- Answers "what is MY exact rank" as a primary-key lookup.
create unique index if not exists leaderboard_top_scope_user_idx
  on public.leaderboard_top (scope, user_id);

create table if not exists public.leaderboard_dist (
  scope       text   not null,
  bucket_min  bigint not null,   -- a sampled `seconds` value
  ahead       bigint not null,   -- students strictly above that value
  primary key (scope, bucket_min)
);

create table if not exists public.leaderboard_refresh (
  scope        text        primary key,
  refreshed_at timestamptz not null,
  ranked_total bigint      not null
);

-- These hold one row per ranked student for the head of the board, and the
-- names are resolved at read time through the existing opt-in rules — so the
-- tables themselves carry no display name and no personal data beyond a user
-- id and a duration. Even so, nothing reads them directly: RLS is on with no
-- policy, which denies every non-superuser, and the security-definer functions
-- below are the only way in. That keeps the privacy rules in exactly one place
-- (tests/rls_test.sql section 8) instead of two.
alter table public.leaderboard_top     enable row level security;
alter table public.leaderboard_dist    enable row level security;
alter table public.leaderboard_refresh enable row level security;

revoke all on public.leaderboard_top     from anon, authenticated;
revoke all on public.leaderboard_dist    from anon, authenticated;
revoke all on public.leaderboard_refresh from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Shared helper: the eligible, period-scoped totals every scope ranks on.
-- ---------------------------------------------------------------------------

create or replace function public.leaderboard_period_start(p_scope text)
returns date
language sql
stable
parallel safe
set search_path = public, pg_temp
as $$
  select case p_scope
    when 'weekly'  then (now() at time zone 'Africa/Addis_Ababa')::date
                        - extract(dow from (now() at time zone 'Africa/Addis_Ababa')::date)::integer
    when 'monthly' then date_trunc('month', (now() at time zone 'Africa/Addis_Ababa')::date)::date
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- refresh_leaderboard(scope)
--
-- Rebuilds one scope's summary. Safe to call concurrently: an advisory lock
-- means a second caller returns immediately rather than duplicating the work,
-- which matters because the lazy path below can fire from several requests at
-- once when a cache expires.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_leaderboard(p_scope text default 'weekly')
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from   date;
  v_total  bigint;
  v_step   bigint;
  v_lock   bigint := hashtext('keleme_leaderboard_' || p_scope);
begin
  if p_scope not in ('weekly', 'monthly', 'all') then
    raise exception 'unknown leaderboard scope %', p_scope using errcode = '22023';
  end if;

  -- Someone else is already rebuilding this scope. Their result is as good as
  -- ours would be, so do not queue behind them.
  if not pg_try_advisory_xact_lock(v_lock) then
    return false;
  end if;

  v_from := public.leaderboard_period_start(p_scope);

  -- Aggregate the period FIRST, then join — the same shape 0013 established.
  -- A lateral sum per profile is the obvious way to write this and is much
  -- slower: it turns one index range scan into one index lookup per student,
  -- which at 500,000 students measured 2.15s against 1.16s for this form.
  if v_from is null then
    create temporary table lb_totals on commit drop as
    select p.id as user_id, p.total_seconds::bigint as seconds, p.current_streak, p.public_no
    from public.profiles p
    where p.role = 'student'
      and not p.is_suspended
      and p.deactivated_at is null
      and (p.total_seconds > 0 or p.current_streak > 0);
  else
    create temporary table lb_totals on commit drop as
    with period as (
      select d.user_id, sum(d.seconds)::bigint as secs
      from public.daily_activity d
      where d.activity_date >= v_from
      group by d.user_id
    )
    select p.id as user_id, coalesce(a.secs, 0)::bigint as seconds, p.current_streak, p.public_no
    from public.profiles p
    left join period a on a.user_id = p.id
    where p.role = 'student'
      and not p.is_suspended
      and p.deactivated_at is null
      and (a.secs > 0 or p.current_streak > 0);
  end if;

  -- One pass produces the ordering both the head and the distribution need.
  create temporary table lb_ranked on commit drop as
  select
    row_number() over (order by t.seconds desc, t.current_streak desc, t.public_no) as rn,
    t.user_id,
    t.seconds
  from lb_totals t;

  select count(*) into v_total from lb_ranked;

  -- Exact head of the board.
  delete from public.leaderboard_top where scope = p_scope;
  insert into public.leaderboard_top (scope, rank, user_id, seconds)
  select p_scope, r.rn, r.user_id, r.seconds
  from lb_ranked r
  where r.rn <= public.leaderboard_top_n();

  -- Cumulative distribution for the tail. Sampling every Nth row of the same
  -- ordering gives each sample an exact "students above me" count, so the
  -- approximation is bounded by the sampling step and never by the data.
  v_step := greatest(1, (v_total / public.leaderboard_buckets())::bigint);

  delete from public.leaderboard_dist where scope = p_scope;
  insert into public.leaderboard_dist (scope, bucket_min, ahead)
  select p_scope, s.seconds, min(s.rn) - 1
  from lb_ranked s
  where s.rn % v_step = 1
  group by s.seconds;

  insert into public.leaderboard_refresh (scope, refreshed_at, ranked_total)
  values (p_scope, now(), v_total)
  on conflict (scope) do update
    set refreshed_at = excluded.refreshed_at,
        ranked_total = excluded.ranked_total;

  return true;
end;
$$;

revoke all on function public.refresh_leaderboard(text) from public, anon, authenticated;

-- True when a scope's summary exists and is fresh enough to serve.
create or replace function public.leaderboard_is_fresh(p_scope text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.leaderboard_refresh r
    where r.scope = p_scope
      and r.refreshed_at > now() - public.leaderboard_max_staleness()
  );
$$;

comment on table public.leaderboard_top is
  'Exact ranks for the head of each leaderboard scope. Rebuilt by refresh_leaderboard().';
comment on table public.leaderboard_dist is
  'Sampled cumulative distribution used to place students outside leaderboard_top.';

-- ---------------------------------------------------------------------------
-- get_leaderboard — served from the summary, with the 0013 live path as the
-- fallback when no fresh summary exists.
--
-- Output is unchanged: same columns, same order, same privacy rules. Names are
-- still resolved here rather than stored, so a student toggling
-- leaderboard_opt_in takes effect on the next read, not the next refresh.
-- ---------------------------------------------------------------------------
create or replace function public.get_leaderboard(
  p_scope  text default 'weekly',
  p_limit  integer default 20,
  p_offset integer default 0
)
returns table (
  rank         bigint,
  user_id      uuid,
  display_name text,
  is_anonymous boolean,
  is_me        boolean,
  grade        smallint,
  streak       integer,
  seconds      bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_from   date;
  v_limit  integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  -- The fast path. `leaderboard_top` holds the head of the board in rank
  -- order, so this is an index range scan of exactly v_limit rows plus a
  -- primary-key join to profiles for the names — independent of how many
  -- students exist.
  if public.leaderboard_is_fresh(p_scope)
     and (v_offset + v_limit) <= public.leaderboard_top_n()
  then
    return query
    select
      t.rank,
      p.id,
      case when p.leaderboard_opt_in then coalesce(nullif(trim(p.display_name), ''), p.full_name)
           else 'Student #' || lpad(p.public_no::text, 4, '0') end,
      not p.leaderboard_opt_in,
      p.id = auth.uid(),
      p.grade,
      p.current_streak,
      t.seconds
    from public.leaderboard_top t
    join public.profiles p on p.id = t.user_id
    where t.scope = p_scope
      -- A student suspended or deactivated since the refresh must drop off the
      -- board immediately, not at the next rebuild.
      and p.role = 'student'
      and not p.is_suspended
      and p.deactivated_at is null
    order by t.rank
    limit v_limit offset v_offset;

    if found then
      return;
    end if;
  end if;

  -- Fallback: the live computation from 0013, unchanged. Reached when no
  -- refresh has run, when the summary has gone stale, or when a caller pages
  -- past the exact head of the board.
  v_from := public.leaderboard_period_start(p_scope);

  if v_from is null then
    return query
    select
      rank() over (order by p.total_seconds desc, p.current_streak desc, p.public_no),
      p.id,
      case when p.leaderboard_opt_in then coalesce(nullif(trim(p.display_name), ''), p.full_name)
           else 'Student #' || lpad(p.public_no::text, 4, '0') end,
      not p.leaderboard_opt_in,
      p.id = auth.uid(),
      p.grade,
      p.current_streak,
      p.total_seconds
    from public.profiles p
    where p.role = 'student'
      and not p.is_suspended
      and p.deactivated_at is null
      and (p.total_seconds > 0 or p.current_streak > 0)
    order by p.total_seconds desc, p.current_streak desc, p.public_no
    limit v_limit offset v_offset;

  else
    return query
    with period as (
      select d.user_id, sum(d.seconds)::bigint as secs
      from public.daily_activity d
      where d.activity_date >= v_from
      group by d.user_id
    ),
    ranked as (
      select
        p.id, p.grade, p.current_streak, p.leaderboard_opt_in,
        p.display_name, p.full_name, p.public_no,
        coalesce(a.secs, 0)::bigint as secs
      from public.profiles p
      left join period a on a.user_id = p.id
      where p.role = 'student'
        and not p.is_suspended
        and p.deactivated_at is null
        and (a.secs > 0 or p.current_streak > 0)
    )
    select
      rank() over (order by r.secs desc, r.current_streak desc, r.public_no),
      r.id,
      case when r.leaderboard_opt_in then coalesce(nullif(trim(r.display_name), ''), r.full_name)
           else 'Student #' || lpad(r.public_no::text, 4, '0') end,
      not r.leaderboard_opt_in,
      r.id = auth.uid(),
      r.grade,
      r.current_streak,
      r.secs
    from ranked r
    order by r.secs desc, r.current_streak desc, r.public_no
    limit v_limit offset v_offset;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_my_rank — the query this migration exists for.
--
-- The student's own seconds stay live: that is an index lookup on
-- (user_id, activity_date) and costs 0.1ms at every dataset size tested, so
-- there is no reason to serve it from a summary. Only the *position* comes
-- from the summary, because computing a position is what costs a second.
--
-- Adds three fields to the response and removes none:
--   approximate   false for an exact rank from the head of the board
--   percentile    where the student sits, 1 = top
--   ranked_total  how many students are ranked at all
-- ---------------------------------------------------------------------------
create or replace function public.get_my_rank(p_scope text default 'weekly')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_from    date;
  v_secs    bigint;
  v_streak  integer;
  v_rank    bigint;
  v_total   bigint;
  v_approx  boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('rank', null, 'seconds', 0, 'streak', 0,
                              'approximate', false, 'percentile', null, 'ranked_total', 0);
  end if;

  v_from := public.leaderboard_period_start(p_scope);

  select current_streak into v_streak from public.profiles where id = auth.uid();

  if v_from is null then
    select total_seconds into v_secs from public.profiles where id = auth.uid();
  else
    select coalesce(sum(seconds), 0) into v_secs
    from public.daily_activity
    where user_id = auth.uid() and activity_date >= v_from;
  end if;

  if coalesce(v_secs, 0) = 0 and coalesce(v_streak, 0) = 0 then
    return jsonb_build_object('rank', null, 'seconds', 0, 'streak', coalesce(v_streak, 0),
                              'approximate', false, 'percentile', null, 'ranked_total', 0);
  end if;

  if public.leaderboard_is_fresh(p_scope) then
    select ranked_total into v_total from public.leaderboard_refresh where scope = p_scope;

    -- Exact, for anyone in the head of the board: one primary-key lookup.
    select t.rank into v_rank
    from public.leaderboard_top t
    where t.scope = p_scope and t.user_id = auth.uid();

    if v_rank is null then
      -- The tail. Find the tightest sampled point still at or above this
      -- student's seconds; its `ahead` is an exact count of students above
      -- that point, so the error is bounded by the sampling step rather than
      -- by anything about the data.
      v_approx := true;

      select d.ahead + 1 into v_rank
      from public.leaderboard_dist d
      where d.scope = p_scope and d.bucket_min >= v_secs
      order by d.bucket_min asc
      limit 1;

      -- Below every sample: the student is in the last bucket.
      if v_rank is null then
        select coalesce(max(d.ahead) + 1, v_total)
          into v_rank
        from public.leaderboard_dist d
        where d.scope = p_scope;
      end if;
    end if;

  else
    -- No usable summary. The 0013 live path, unchanged.
    if v_from is null then
      select count(*) + 1 into v_rank
      from public.profiles p
      where p.role = 'student' and not p.is_suspended and p.deactivated_at is null
        and p.total_seconds > v_secs;
    else
      select count(*) + 1 into v_rank
      from (
        select d.user_id, sum(d.seconds) as secs
        from public.daily_activity d
        where d.activity_date >= v_from
        group by d.user_id
        having sum(d.seconds) > v_secs
      ) ahead;
    end if;
  end if;

  return jsonb_build_object(
    'rank',         v_rank,
    'seconds',      coalesce(v_secs, 0),
    'streak',       coalesce(v_streak, 0),
    'approximate',  v_approx,
    'percentile',   case when coalesce(v_total, 0) > 0 and v_rank is not null
                         then greatest(1, round(100.0 * v_rank / v_total))::integer end,
    'ranked_total', coalesce(v_total, 0)
  );
end;
$$;

grant execute on function public.get_leaderboard(text, integer, integer) to authenticated, anon;
grant execute on function public.get_my_rank(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Scheduling.
--
-- pg_cron is available on Supabase but not in the local test cluster, so this
-- is conditional: where the extension exists the refreshes are scheduled, and
-- where it does not the migration still applies cleanly and both functions
-- fall back to the live path. See docs/CAPACITY.md for the manual alternative.
--
-- Weekly every minute (matching the app's 60-second cache), monthly every five
-- (four times the rows for a board almost nobody opens), all-time every
-- fifteen (it reads profiles.total_seconds, which is already indexed and took
-- 0.2ms at every size tested — this exists only so get_my_rank has a
-- distribution to place students against).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('keleme-leaderboard-weekly',  '* * * * *',    $cron$select public.refresh_leaderboard('weekly')$cron$);
    perform cron.schedule('keleme-leaderboard-monthly', '*/5 * * * *',  $cron$select public.refresh_leaderboard('monthly')$cron$);
    perform cron.schedule('keleme-leaderboard-alltime', '*/15 * * * *', $cron$select public.refresh_leaderboard('all')$cron$);
  else
    raise notice 'pg_cron not installed: schedule refresh_leaderboard() externally, or the live fallback path will be used.';
  end if;
end;
$$;
