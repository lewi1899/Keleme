-- =============================================================================
-- KELEME — 0017 Admin query performance
--
-- Two admin paths measured badly against 100,000 students and 2.4M activity
-- rows, both for the same reason: a per-row function call the planner could
-- not turn into an index lookup.
--
--   admin_search_students, "premium only" filter   355ms
--   admin_activity_series, 30 days                 284ms
--
-- Neither is on a student's path, so neither was urgent — but the Students
-- screen is where the team will spend its time, and 355ms per keystroke-driven
-- filter is the difference between a tool that feels alive and one that does
-- not.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- admin_search_students
--
-- The entitlement filters called has_active_entitlement(kind, id) once per
-- profile — 100,000 plpgsql calls, each running its own query. Replaced with
-- an EXISTS against user_entitlements, which the planner satisfies with the
-- existing (user_id, kind, ends_at) index.
--
-- Also folded the previously duplicated filter expression into a single CTE:
-- it was written out twice (once for the page, once for the count), which was
-- both slower and an invitation for the two to drift apart.
-- ---------------------------------------------------------------------------

create or replace function public.admin_search_students(
  p_query  text default null,
  p_grade  smallint default null,
  p_filter text default 'all',
  p_limit  integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit  integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_q      text := nullif(trim(coalesce(p_query, '')), '');
  v_pred   text;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  /*
   * The entitlement filters are built as SQL text rather than selected by a
   * CASE, and that is a performance decision, not a stylistic one.
   *
   * With a CASE, the planner cannot see which branch will run, so it falls
   * back to evaluating an EXISTS once per profile — 100,000 index lookups,
   * measured at 171ms. Written as a plain IN, it becomes a Hash Semi Join
   * against the 10,000 active entitlements: 20ms for the same answer.
   *
   * INJECTION SAFETY: v_pred is chosen from this fixed set of literals and is
   * never built from caller input. Every user-supplied value — the search
   * text, the grade, the limit and offset — is passed as a bound parameter
   * through USING below, never concatenated.
   */
  v_pred := case p_filter
    when 'premium' then
      'and p.id in (select e.user_id from public.user_entitlements e
         where e.kind = ''premium'' and e.revoked_at is null
           and e.starts_at <= now() and e.ends_at > now())'
    when 'matric' then
      'and p.id in (select e.user_id from public.user_entitlements e
         where e.kind = ''matric'' and e.revoked_at is null
           and e.starts_at <= now() and e.ends_at > now())'
    when 'free' then
      'and p.id not in (select e.user_id from public.user_entitlements e
         where e.revoked_at is null and e.starts_at <= now() and e.ends_at > now())'
    when 'suspended' then 'and p.is_suspended'
    when 'streaking'  then 'and p.current_streak > 0'
    else ''
  end;

  execute format($q$
    with scoped as (
      select p.id, p.created_at
      from public.profiles p
      where p.role = 'student'
        and ($2::smallint is null or p.grade = $2)
        and (
          $1::text is null
          or p.full_name ilike '%%' || $1 || '%%'
          or p.email ilike '%%' || $1 || '%%'
          or p.phone like '%%' || $1 || '%%'
          or p.school_name ilike '%%' || $1 || '%%'
        )
        %s
    ),
    page as (
      select s.id, s.created_at from scoped s
      order by s.created_at desc limit $3 offset $4
    )
    select jsonb_build_object(
      'total', (select count(*) from scoped),
      -- Entitlement flags are computed only for the rows on this page, never
      -- for the whole matched set.
      'rows', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.created_at desc)
        from (
          select
            p.id, p.full_name, p.email, p.phone, p.grade, p.school_name,
            p.current_streak, p.total_seconds, p.is_suspended, p.created_at,
            p.last_activity_date, p.leaderboard_opt_in,
            exists (
              select 1 from public.user_entitlements e
              where e.user_id = p.id and e.kind = 'premium'
                and e.revoked_at is null and e.starts_at <= now() and e.ends_at > now()
            ) as is_premium,
            exists (
              select 1 from public.user_entitlements e
              where e.user_id = p.id and e.kind = 'matric'
                and e.revoked_at is null and e.starts_at <= now() and e.ends_at > now()
            ) as is_matric
          from page
          join public.profiles p on p.id = page.id
        ) r
      ), '[]'::jsonb)
    )
  $q$, v_pred)
  into v_result
  using v_q, p_grade, v_limit, v_offset;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_activity_series
--
-- Was LEFT JOINing generate_series against the whole of daily_activity, so a
-- 30-day chart read all 2.4M rows. Aggregating the window first means the
-- index range scan reads only those 30 days, and the series then fills the
-- gaps so days with no activity still render as zero rather than vanishing.
-- ---------------------------------------------------------------------------

create or replace function public.admin_activity_series(p_days integer default 30)
returns table (day date, seconds bigint, learners bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days  integer := greatest(1, least(coalesce(p_days, 30), 180));
  v_today date := (now() at time zone 'Africa/Addis_Ababa')::date;
  v_from  date;
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_from := v_today - (v_days - 1);

  return query
  with totals as (
    select a.activity_date,
           sum(a.seconds)::bigint as secs,
           count(*) filter (where a.seconds > 0)::bigint as learners
    from public.daily_activity a
    where a.activity_date between v_from and v_today
    group by a.activity_date
  )
  select d::date,
         coalesce(t.secs, 0)::bigint,
         coalesce(t.learners, 0)::bigint
  from generate_series(v_from, v_today, interval '1 day') d
  left join totals t on t.activity_date = d::date
  order by d;
end;
$$;

grant execute on function public.admin_search_students(text, smallint, text, integer, integer) to authenticated;
grant execute on function public.admin_activity_series(integer) to authenticated;
