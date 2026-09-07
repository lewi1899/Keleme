-- =============================================================================
-- KELEME — 0012 Admin analytics
--
-- One function per dashboard rather than one query per tile. The overview
-- screen shows fifteen numbers; fetching them as fifteen PostgREST requests
-- would mean fifteen round trips and fifteen separate planner runs over the
-- same tables. Here they share scans and arrive together.
--
-- Every function checks is_admin() itself. They are SECURITY DEFINER, so
-- without that check they would be an aggregate-shaped hole straight through
-- RLS.
-- =============================================================================

create or replace function public.admin_dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Africa/Addis_Ababa')::date;
  v_week_start date := v_today - extract(dow from (now() at time zone 'Africa/Addis_Ababa'))::integer;
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'students', (
      select jsonb_build_object(
        'total', count(*),
        'new_today', count(*) filter (where created_at >= v_today),
        'new_this_week', count(*) filter (where created_at >= v_week_start),
        'suspended', count(*) filter (where is_suspended),
        -- "Active" means studied in the last seven days, not "has an account".
        'active_7d', count(*) filter (
          where last_activity_date is not null and last_activity_date >= v_today - 7
        ),
        'with_streak', count(*) filter (where current_streak > 0)
      )
      from public.profiles where role = 'student'
    ),
    'entitlements', jsonb_build_object(
      'premium', (
        select count(distinct user_id) from public.user_entitlements
        where kind = 'premium' and revoked_at is null and starts_at <= now() and ends_at > now()
      ),
      'matric', (
        select count(distinct user_id) from public.user_entitlements
        where kind = 'matric' and revoked_at is null and starts_at <= now() and ends_at > now()
      ),
      'expiring_7d', (
        select count(distinct user_id) from public.user_entitlements
        where revoked_at is null and ends_at between now() and now() + interval '7 days'
      )
    ),
    'content', (
      select jsonb_build_object(
        'total', count(*),
        'published', count(*) filter (where is_published),
        'draft', count(*) filter (where not is_published),
        'free', count(*) filter (where access_tier = 'free'),
        'premium', count(*) filter (where access_tier = 'premium'),
        'html', count(*) filter (where content_type = 'html'),
        'pdf', count(*) filter (where content_type = 'pdf'),
        'youtube', count(*) filter (where content_type = 'youtube')
      )
      from public.content_items
    ),
    'matric_questions', (
      select jsonb_build_object(
        'total', count(*),
        'published', count(*) filter (where is_published)
      )
      from public.matric_questions
    ),
    'study', jsonb_build_object(
      'seconds_today', coalesce((select sum(seconds) from public.daily_activity where activity_date = v_today), 0),
      'seconds_week',  coalesce((select sum(seconds) from public.daily_activity where activity_date >= v_week_start), 0),
      'learners_today', coalesce((select count(*) from public.daily_activity where activity_date = v_today and seconds > 0), 0)
    ),
    'referrals', jsonb_build_object(
      'confirmed', (select count(*) from public.referrals where status = 'confirmed'),
      'pending',   (select count(*) from public.referrals where status = 'pending'),
      'flagged',   (select count(*) from public.referrals where review_reason is not null and status = 'pending'),
      'rewards_paid', (select count(*) from public.referral_rewards)
    ),
    'payments', jsonb_build_object(
      'pending', (select count(*) from public.payments where status = 'pending'),
      'paid_this_month', (
        select count(*) from public.payments
        where status = 'paid' and paid_at >= date_trunc('month', now())
      ),
      'revenue_this_month', coalesce((
        select sum(amount) from public.payments
        where status = 'paid' and paid_at >= date_trunc('month', now())
      ), 0)
    ),
    'grade_distribution', coalesce((
      select jsonb_object_agg(grade::text, n)
      from (select grade, count(*) as n from public.profiles where role = 'student' group by grade) g
    ), '{}'::jsonb),
    'top_schools', coalesce((
      select jsonb_agg(jsonb_build_object('school', school, 'students', n) order by n desc)
      from (
        select coalesce(s.name, p.school_name, 'Unknown') as school, count(*) as n
        from public.profiles p
        left join public.schools s on s.id = p.school_id
        where p.role = 'student'
        group by 1
        order by n desc
        limit 8
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

-- Daily study totals for the analytics chart. Bounded by an explicit day
-- count so the endpoint can never be asked for the whole table.
create or replace function public.admin_activity_series(p_days integer default 30)
returns table (day date, seconds bigint, learners bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 180));
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  -- generate_series so days with no activity appear as zero rather than being
  -- silently dropped, which would make a flat chart look like a busy one.
  select d::date,
         coalesce(sum(a.seconds), 0)::bigint,
         count(a.user_id) filter (where a.seconds > 0)::bigint
  from generate_series(
    (now() at time zone 'Africa/Addis_Ababa')::date - (v_days - 1),
    (now() at time zone 'Africa/Addis_Ababa')::date,
    interval '1 day'
  ) d
  left join public.daily_activity a on a.activity_date = d::date
  group by d
  order by d;
end;
$$;

-- Paginated student search for the admin Students screen. A LIKE across
-- name/email/phone plus a total count, in one call, so the table can show
-- "showing 20 of 4,312" without a second query.
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
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_q text := nullif(trim(coalesce(p_query, '')), '');
  v_total bigint;
  v_rows jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with filtered as (
    select p.*,
           public.has_active_entitlement('premium', p.id) as is_premium,
           public.has_active_entitlement('matric', p.id) as is_matric
    from public.profiles p
    where p.role = 'student'
      and (p_grade is null or p.grade = p_grade)
      and (
        v_q is null
        or p.full_name ilike '%' || v_q || '%'
        or p.email ilike '%' || v_q || '%'
        or p.phone like '%' || v_q || '%'
        or p.school_name ilike '%' || v_q || '%'
      )
  ),
  scoped as (
    select * from filtered
    where case p_filter
      when 'premium'   then is_premium
      when 'matric'    then is_matric
      when 'free'      then not is_premium and not is_matric
      when 'suspended' then is_suspended
      when 'streaking' then current_streak > 0
      else true
    end
  )
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select id, full_name, email, phone, grade, school_name, current_streak,
           total_seconds, is_suspended, created_at, last_activity_date,
           is_premium, is_matric, leaderboard_opt_in
    from scoped
    order by created_at desc
    limit v_limit offset v_offset
  ) t;

  -- Counted separately from the page above, so the UI can say "20 of 4,312"
  -- rather than "20 of 20".
  select count(*) into v_total from public.profiles p
  where p.role = 'student'
    and (p_grade is null or p.grade = p_grade)
    and (
      v_q is null
      or p.full_name ilike '%' || v_q || '%'
      or p.email ilike '%' || v_q || '%'
      or p.phone like '%' || v_q || '%'
      or p.school_name ilike '%' || v_q || '%'
    )
    and case p_filter
      when 'premium'   then public.has_active_entitlement('premium', p.id)
      when 'matric'    then public.has_active_entitlement('matric', p.id)
      when 'free'      then not public.has_active_entitlement('premium', p.id)
                           and not public.has_active_entitlement('matric', p.id)
      when 'suspended' then p.is_suspended
      when 'streaking' then p.current_streak > 0
      else true
    end;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

create or replace function public.admin_set_suspension(p_user uuid, p_suspended boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.profiles
  set is_suspended = p_suspended,
      suspended_reason = case when p_suspended then p_reason else null end
  where id = p_user;

  -- A suspension must take effect now, not at the next token refresh, so the
  -- device sessions go with it.
  if p_suspended then
    update public.user_sessions
    set revoked_at = now(), revoked_reason = 'account_suspended'
    where user_id = p_user and revoked_at is null;

    update public.study_sessions set ended_at = now()
    where user_id = p_user and ended_at is null;
  end if;

  perform public.write_audit_log(
    case when p_suspended then 'student.suspended' else 'student.unsuspended' end,
    'profiles', p_user::text, jsonb_build_object('reason', p_reason)
  );
end;
$$;

create or replace function public.admin_set_role(p_user uuid, p_role public.user_role)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining integer;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Refuse to remove the last administrator. Locking the whole team out of
  -- the platform is a one-click mistake worth making impossible.
  if p_role <> 'admin' then
    select count(*) into v_remaining
    from public.profiles
    where role = 'admin' and not is_suspended and id <> p_user;

    if v_remaining = 0 then
      raise exception 'cannot_remove_last_admin';
    end if;
  end if;

  update public.profiles set role = p_role where id = p_user;

  perform public.write_audit_log('role.changed', 'profiles', p_user::text,
    jsonb_build_object('role', p_role));
end;
$$;

grant execute on function public.admin_dashboard_metrics() to authenticated;
grant execute on function public.admin_activity_series(integer) to authenticated;
grant execute on function public.admin_search_students(text, smallint, text, integer, integer) to authenticated;
grant execute on function public.admin_set_suspension(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_role(uuid, public.user_role) to authenticated;
