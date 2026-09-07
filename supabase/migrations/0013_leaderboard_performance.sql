-- =============================================================================
-- KELEME — 0013 Leaderboard performance
--
-- Found by profiling against 100,000 students and 2.4M activity rows: the
-- original get_leaderboard took 2.1 SECONDS and read 2.4 million buffers.
--
-- Three things were wrong with it, and the plan named all three:
--
--   1. The period filter lived inside `sum(...) FILTER (WHERE activity_date >=
--      ...)`, which is applied AFTER the join. So the whole of daily_activity
--      was sequentially scanned even though a weekly board needs seven days of
--      it, and the (activity_date, user_id) index was never used.
--   2. It grouped all 100,000 profiles and then discarded 51,599 of them.
--   3. The aggregate spilled to disk ("external merge Disk: 7144kB").
--
-- The rewrite aggregates the period's activity FIRST, so the index range scan
-- reads only the days in scope, and joins the (much smaller) result to
-- profiles. The all-time scope skips daily_activity entirely: profiles
-- .total_seconds is already maintained by record_heartbeat and is exactly this
-- number, which is what that column is for.
--
-- Output is unchanged — same columns, same ordering, same privacy rules.
-- =============================================================================

-- Supports the range scan with an index-only path: activity_date leads for the
-- range, and seconds rides along so the aggregate never touches the heap.
create index if not exists daily_activity_period_idx
  on public.daily_activity (activity_date) include (user_id, seconds);

-- The old partial index only covered opted-in students, but the leaderboard
-- deliberately ranks everyone (anonymising those who did not opt in), so it
-- could never be used. Replaced with one that matches the actual predicate.
drop index if exists public.profiles_leaderboard_idx;
create index if not exists profiles_ranking_idx
  on public.profiles (total_seconds desc, public_no)
  where role = 'student' and not is_suspended and deactivated_at is null;

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
  v_today  date := (now() at time zone 'Africa/Addis_Ababa')::date;
begin
  v_from := case p_scope
    when 'weekly'  then v_today - extract(dow from v_today)::integer
    when 'monthly' then date_trunc('month', v_today)::date
    else null                       -- null means all-time
  end;

  if v_from is null then
    -- All-time: profiles.total_seconds already holds this figure, maintained
    -- by record_heartbeat. No reason to re-derive it from 2.4M rows.
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
    -- Period scopes: aggregate the days in scope BEFORE joining to profiles,
    -- so the index range scan reads only those days.
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
-- get_my_rank
--
-- Was calling get_leaderboard(scope, 100, 0) and scanning the result for the
-- caller — which meant paying for the whole top-100 board, and returning
-- "unranked" for anyone below 100th. Now it counts how many students are ahead,
-- which is one aggregate and is correct at any position.
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
  v_today   date := (now() at time zone 'Africa/Addis_Ababa')::date;
  v_secs    bigint;
  v_streak  integer;
  v_rank    bigint;
begin
  if auth.uid() is null then
    return jsonb_build_object('rank', null, 'seconds', 0, 'streak', 0);
  end if;

  v_from := case p_scope
    when 'weekly'  then v_today - extract(dow from v_today)::integer
    when 'monthly' then date_trunc('month', v_today)::date
    else null
  end;

  select current_streak into v_streak from public.profiles where id = auth.uid();

  if v_from is null then
    select total_seconds into v_secs from public.profiles where id = auth.uid();
  else
    select coalesce(sum(seconds), 0) into v_secs
    from public.daily_activity
    where user_id = auth.uid() and activity_date >= v_from;
  end if;

  if coalesce(v_secs, 0) = 0 and coalesce(v_streak, 0) = 0 then
    return jsonb_build_object('rank', null, 'seconds', 0, 'streak', coalesce(v_streak, 0));
  end if;

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
    ) ahead
    join public.profiles p on p.id = ahead.user_id
    where p.role = 'student' and not p.is_suspended and p.deactivated_at is null;
  end if;

  return jsonb_build_object('rank', v_rank, 'seconds', coalesce(v_secs, 0), 'streak', coalesce(v_streak, 0));
end;
$$;

grant execute on function public.get_leaderboard(text, integer, integer) to authenticated, anon;
grant execute on function public.get_my_rank(text) to authenticated;
