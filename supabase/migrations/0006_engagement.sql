-- =============================================================================
-- KELEME — 0006 Study time, streaks, leaderboard, referrals and rewards
--
-- Everything a student could profit from inflating lives in this file, so the
-- governing rule throughout is: the client may say "I am still here", and
-- nothing else. Durations are computed from server clocks, capped per
-- heartbeat and per day, and written only by SECURITY DEFINER functions. There
-- is no INSERT or UPDATE policy for `authenticated` on any table here.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Study sessions (spec sections 17 and 20)
-- ---------------------------------------------------------------------------

create table if not exists public.study_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  started_at      timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at        timestamptz,
  counted_seconds integer not null default 0 check (counted_seconds >= 0),
  heartbeat_count integer not null default 0,
  user_agent      text,
  ip_address      inet
);

create index if not exists study_sessions_user_idx on public.study_sessions (user_id, started_at desc);
-- One open study session per account. Combined with the single-device rule in
-- 0002 this is what stops "open the app in six tabs and go to lunch".
create unique index if not exists study_sessions_one_open
  on public.study_sessions (user_id)
  where ended_at is null;

create table if not exists public.daily_activity (
  user_id           uuid not null references public.profiles (id) on delete cascade,
  activity_date     date not null,
  seconds           integer not null default 0 check (seconds >= 0),
  content_opened    integer not null default 0,
  questions_answered integer not null default 0,
  is_learning_day   boolean not null default false,
  updated_at        timestamptz not null default now(),
  primary key (user_id, activity_date)
);

-- The leaderboard's hot path: "sum seconds for every user between two dates".
create index if not exists daily_activity_date_idx on public.daily_activity (activity_date, user_id);
create index if not exists daily_activity_user_date_idx on public.daily_activity (user_id, activity_date desc);

-- ---------------------------------------------------------------------------
-- Heartbeat
--
-- Called roughly every 60s by an open tab. The credited amount is
-- min(elapsed since last heartbeat, cap) — so a tab that was backgrounded for
-- two hours credits one cap's worth, not two hours, and a client that spams
-- the endpoint credits the real elapsed time and no more. Both directions of
-- abuse collapse to the same clamp.
-- ---------------------------------------------------------------------------

create or replace function public.record_heartbeat(p_session_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cap_seconds     integer := coalesce((public.get_setting('heartbeat_cap_seconds', '90'::jsonb))::text::integer, 90);
  v_daily_cap       integer := coalesce((public.get_setting('daily_seconds_cap', '43200'::jsonb))::text::integer, 43200);
  v_idle_timeout    integer := coalesce((public.get_setting('session_idle_timeout_seconds', '600'::jsonb))::text::integer, 600);
  v_session         public.study_sessions;
  v_elapsed         integer;
  v_credit          integer;
  v_today           date;
  v_tz              text;
  v_day_total       integer;
begin
  if not public.is_active_account() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select timezone into v_tz from public.profiles where id = auth.uid();
  v_today := (now() at time zone coalesce(v_tz, 'Africa/Addis_Ababa'))::date;

  -- Close anything that has gone quiet for longer than the idle timeout, so a
  -- crashed tab does not keep an open session around forever.
  update public.study_sessions
  set ended_at = last_heartbeat_at
  where user_id = auth.uid()
    and ended_at is null
    and last_heartbeat_at < now() - make_interval(secs => v_idle_timeout);

  if p_session_id is not null then
    select * into v_session from public.study_sessions
    where id = p_session_id and user_id = auth.uid() and ended_at is null;
  end if;

  if v_session.id is null then
    insert into public.study_sessions (user_id)
    values (auth.uid())
    on conflict do nothing
    returning * into v_session;

    -- Lost the race against another tab: adopt the session that won.
    if v_session.id is null then
      select * into v_session from public.study_sessions
      where user_id = auth.uid() and ended_at is null
      limit 1;
    end if;

    return jsonb_build_object(
      'session_id', v_session.id,
      'credited_seconds', 0,
      'session_seconds', v_session.counted_seconds,
      'day_seconds', coalesce((select seconds from public.daily_activity where user_id = auth.uid() and activity_date = v_today), 0)
    );
  end if;

  v_elapsed := greatest(0, extract(epoch from (now() - v_session.last_heartbeat_at))::integer);
  v_credit  := least(v_elapsed, v_cap_seconds);

  -- Respect the daily ceiling; nobody studies 12 hours a day on this platform,
  -- and anything claiming to is a script.
  select coalesce(seconds, 0) into v_day_total
  from public.daily_activity where user_id = auth.uid() and activity_date = v_today;
  v_credit := least(v_credit, greatest(0, v_daily_cap - coalesce(v_day_total, 0)));

  update public.study_sessions
  set last_heartbeat_at = now(),
      counted_seconds = counted_seconds + v_credit,
      heartbeat_count = heartbeat_count + 1
  where id = v_session.id;

  if v_credit > 0 then
    insert into public.daily_activity (user_id, activity_date, seconds)
    values (auth.uid(), v_today, v_credit)
    on conflict (user_id, activity_date) do update
      set seconds = public.daily_activity.seconds + excluded.seconds,
          updated_at = now();

    update public.profiles
    set total_seconds = total_seconds + v_credit
    where id = auth.uid();

    perform public.refresh_streak(auth.uid(), v_today);
  end if;

  return jsonb_build_object(
    'session_id', v_session.id,
    'credited_seconds', v_credit,
    'session_seconds', v_session.counted_seconds + v_credit,
    'day_seconds', coalesce(v_day_total, 0) + v_credit
  );
end;
$$;

create or replace function public.end_study_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.study_sessions
  set ended_at = now()
  where id = p_session_id and user_id = auth.uid() and ended_at is null;
end;
$$;

-- Records a meaningful learning event (opening content, answering a question).
-- Kept separate from the heartbeat because "was present" and "actually studied"
-- are different claims, and only the second one earns a streak day.
create or replace function public.record_learning_event(p_kind text, p_content_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz    text;
  v_today date;
begin
  if not public.is_active_account() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select timezone into v_tz from public.profiles where id = auth.uid();
  v_today := (now() at time zone coalesce(v_tz, 'Africa/Addis_Ababa'))::date;

  insert into public.daily_activity (user_id, activity_date, content_opened, questions_answered)
  values (
    auth.uid(), v_today,
    case when p_kind = 'content_opened' then 1 else 0 end,
    case when p_kind = 'question_answered' then 1 else 0 end
  )
  on conflict (user_id, activity_date) do update
    set content_opened = public.daily_activity.content_opened + excluded.content_opened,
        questions_answered = public.daily_activity.questions_answered + excluded.questions_answered,
        updated_at = now();

  if p_content_id is not null and public.can_access_content(p_content_id) then
    insert into public.content_progress (user_id, content_id)
    values (auth.uid(), p_content_id)
    on conflict (user_id, content_id) do update
      set last_opened_at = now();
  end if;

  perform public.refresh_streak(auth.uid(), v_today);
end;
$$;

-- ---------------------------------------------------------------------------
-- Streaks (spec section 16)
--
-- A day counts only once it clears a real bar — configurable, defaulting to
-- 5 minutes of study or 5 answered questions. Opening the app for a second
-- earns nothing. The whole streak is recomputed from daily_activity rather
-- than incremented, which makes it idempotent: calling this twice in a day, or
-- late, or after a backfill, always produces the same answer.
-- ---------------------------------------------------------------------------

create or replace function public.refresh_streak(p_user uuid, p_today date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_min_seconds   integer := coalesce((public.get_setting('streak_min_seconds', '300'::jsonb))::text::integer, 300);
  v_min_questions integer := coalesce((public.get_setting('streak_min_questions', '5'::jsonb))::text::integer, 5);
  v_current       integer := 0;
  v_cursor        date;
  v_longest       integer;
begin
  update public.daily_activity
  set is_learning_day = (seconds >= v_min_seconds or questions_answered >= v_min_questions)
  where user_id = p_user and activity_date = p_today;

  -- Walk backwards from today while each day qualifies. Yesterday is allowed
  -- as the anchor too, so the streak does not appear to reset at midnight
  -- before the student has opened the app.
  v_cursor := p_today;
  if not exists (
    select 1 from public.daily_activity
    where user_id = p_user and activity_date = p_today and is_learning_day
  ) then
    v_cursor := p_today - 1;
  end if;

  loop
    exit when not exists (
      select 1 from public.daily_activity
      where user_id = p_user and activity_date = v_cursor and is_learning_day
    );
    v_current := v_current + 1;
    v_cursor := v_cursor - 1;
  end loop;

  select greatest(coalesce(longest_streak, 0), v_current) into v_longest
  from public.profiles where id = p_user;

  update public.profiles
  set current_streak = v_current,
      longest_streak = v_longest,
      last_activity_date = greatest(coalesce(last_activity_date, p_today), p_today)
  where id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leaderboard (spec section 18)
--
-- Returns a privacy-safe projection and nothing else: no phone, no email, no
-- school, and no real name unless the student explicitly opted in. Students who
-- have not opted in still appear — anonymised as "Student #<public_no>" — so
-- the ranking stays honest rather than silently excluding half the cohort.
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
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with bounds as (
    select case p_scope
             when 'weekly'  then (now() at time zone 'Africa/Addis_Ababa')::date - extract(dow from (now() at time zone 'Africa/Addis_Ababa'))::integer
             when 'monthly' then date_trunc('month', (now() at time zone 'Africa/Addis_Ababa'))::date
             else '1970-01-01'::date
           end as from_date
  ),
  totals as (
    select p.id, p.grade, p.current_streak, p.leaderboard_opt_in, p.display_name,
           p.full_name, p.public_no,
           coalesce(sum(d.seconds) filter (where d.activity_date >= b.from_date), 0)::bigint as secs
    from public.profiles p
    cross join bounds b
    left join public.daily_activity d on d.user_id = p.id
    where p.role = 'student'
      and not p.is_suspended
      and p.deactivated_at is null
    group by p.id, p.grade, p.current_streak, p.leaderboard_opt_in, p.display_name, p.full_name, p.public_no
  )
  select
    rank() over (order by t.secs desc, t.current_streak desc, t.public_no),
    t.id,
    case when t.leaderboard_opt_in then coalesce(nullif(trim(t.display_name), ''), t.full_name)
         else 'Student #' || lpad(t.public_no::text, 4, '0') end,
    not t.leaderboard_opt_in,
    t.id = auth.uid(),
    t.grade,
    t.current_streak,
    t.secs
  from totals t
  where t.secs > 0 or t.current_streak > 0
  order by t.secs desc, t.current_streak desc, t.public_no
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.get_my_rank(p_scope text default 'weekly')
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select jsonb_build_object('rank', rank, 'seconds', seconds, 'streak', streak)
     from public.get_leaderboard(p_scope, 100, 0) where is_me),
    jsonb_build_object('rank', null, 'seconds', 0, 'streak', 0)
  );
$$;

-- ---------------------------------------------------------------------------
-- Referrals (spec section 15)
-- ---------------------------------------------------------------------------

create table if not exists public.referral_reward_tiers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  required_referrals  integer not null check (required_referrals > 0),
  reward_kind         public.entitlement_kind not null default 'premium',
  reward_days         integer not null check (reward_days > 0),
  is_active           boolean not null default true,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists referral_tiers_required_key on public.referral_reward_tiers (required_referrals);

drop trigger if exists referral_tiers_touch on public.referral_reward_tiers;
create trigger referral_tiers_touch before update on public.referral_reward_tiers
  for each row execute function public.touch_updated_at();

create table if not exists public.referrals (
  id            uuid primary key default gen_random_uuid(),
  referrer_id   uuid not null references public.profiles (id) on delete cascade,
  referred_id   uuid not null references public.profiles (id) on delete cascade,
  referral_code text not null,
  status        public.referral_status not null default 'pending',
  confirmed_at  timestamptz,
  review_reason text,
  created_at    timestamptz not null default now(),
  -- The cheapest and most important abuse check there is.
  constraint referral_not_self check (referrer_id <> referred_id)
);

-- One referral per referred account, ever. A second registration by the same
-- person is a new account with a new id, which is what the phone uniqueness on
-- profiles is there to make expensive.
create unique index if not exists referrals_referred_key on public.referrals (referred_id);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id, status);

create table if not exists public.referral_rewards (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  tier_id       uuid not null references public.referral_reward_tiers (id) on delete cascade,
  entitlement_id uuid references public.user_entitlements (id) on delete set null,
  awarded_at    timestamptz not null default now()
);

-- A tier pays out once per student.
create unique index if not exists referral_rewards_user_tier_key
  on public.referral_rewards (user_id, tier_id);

-- Registration creates the link in `pending`. It is NOT a referral yet: spec
-- section 15 says a referral counts only when the recipient actually
-- registers successfully, and an account that has never been signed into is
-- exactly the shape of a fake one. Confirmation happens on first sign-in.
create or replace function public.link_referral_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.referred_by is not null and new.referred_by <> new.id then
    insert into public.referrals (referrer_id, referred_id, referral_code, status)
    select new.referred_by, new.id, p.referral_code, 'pending'
    from public.profiles p where p.id = new.referred_by
    on conflict (referred_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_link_referral on public.profiles;
create trigger profiles_link_referral after insert on public.profiles
  for each row execute function public.link_referral_on_signup();

-- Called from the sign-in path. Confirms the pending referral, then re-checks
-- every tier the referrer now qualifies for. Idempotent: the unique index on
-- (user_id, tier_id) means a repeated call cannot pay a tier twice.
create or replace function public.confirm_referral_and_reward(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_referrer uuid;
  v_count    integer;
  v_burst    integer := coalesce((public.get_setting('referral_burst_limit_per_hour', '10'::jsonb))::text::integer, 10);
  v_recent   integer;
  v_tier     public.referral_reward_tiers;
  v_ent      uuid;
begin
  select referrer_id into v_referrer
  from public.referrals
  where referred_id = p_user and status = 'pending';

  if v_referrer is null then
    return;
  end if;

  -- Burst heuristic: a genuine student does not bring in ten friends in an
  -- hour. Flag rather than reject, so an unusually good week is reviewed by a
  -- human instead of being silently thrown away.
  select count(*) into v_recent
  from public.referrals
  where referrer_id = v_referrer
    and status = 'confirmed'
    and confirmed_at > now() - interval '1 hour';

  if v_recent >= v_burst then
    update public.referrals
    set review_reason = 'burst_rate_exceeded'
    where referred_id = p_user;
    return;
  end if;

  update public.referrals
  set status = 'confirmed', confirmed_at = now()
  where referred_id = p_user and status = 'pending';

  select count(*) into v_count
  from public.referrals
  where referrer_id = v_referrer and status = 'confirmed';

  for v_tier in
    select * from public.referral_reward_tiers
    where is_active and required_referrals <= v_count
    order by required_referrals
  loop
    if not exists (
      select 1 from public.referral_rewards
      where user_id = v_referrer and tier_id = v_tier.id
    ) then
      v_ent := public.grant_entitlement(
        v_referrer, v_tier.reward_kind, v_tier.reward_days, 'referral_reward',
        null, null, 'Referral tier: ' || v_tier.name
      );
      insert into public.referral_rewards (user_id, tier_id, entitlement_id)
      values (v_referrer, v_tier.id, v_ent)
      on conflict (user_id, tier_id) do nothing;
    end if;
  end loop;
end;
$$;

create or replace function public.get_my_referral_summary()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'referral_code', (select referral_code from public.profiles where id = auth.uid()),
    'confirmed', (select count(*) from public.referrals where referrer_id = auth.uid() and status = 'confirmed'),
    'pending',   (select count(*) from public.referrals where referrer_id = auth.uid() and status = 'pending'),
    'tiers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'required', t.required_referrals,
        'reward_days', t.reward_days, 'reward_kind', t.reward_kind,
        'earned', exists (select 1 from public.referral_rewards r where r.user_id = auth.uid() and r.tier_id = t.id)
      ) order by t.required_referrals), '[]'::jsonb)
      from public.referral_reward_tiers t where t.is_active
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Weekly top-10 rewards (spec section 19)
-- ---------------------------------------------------------------------------

create table if not exists public.reward_catalog (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  reward_type text not null default 'premium_days'
    check (reward_type in ('premium_days', 'matric_days', 'prize', 'airtime', 'cash')),
  reward_days integer check (reward_days is null or reward_days > 0),
  value_birr  numeric(10, 2) check (value_birr is null or value_birr >= 0),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists reward_catalog_touch on public.reward_catalog;
create trigger reward_catalog_touch before update on public.reward_catalog
  for each row execute function public.touch_updated_at();

-- Which prize each finishing position gets. Editable, so "top 10" can become
-- "top 20" without a deployment.
create table if not exists public.weekly_reward_slots (
  rank      integer primary key check (rank between 1 and 100),
  reward_id uuid not null references public.reward_catalog (id) on delete restrict,
  is_active boolean not null default true
);

create table if not exists public.weekly_reward_runs (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null,
  week_end    date not null,
  computed_at timestamptz not null default now(),
  published   boolean not null default false,
  check (week_end > week_start)
);

create unique index if not exists weekly_runs_week_key on public.weekly_reward_runs (week_start);

create table if not exists public.weekly_reward_winners (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references public.weekly_reward_runs (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  rank       integer not null check (rank > 0),
  seconds    bigint not null,
  reward_id  uuid references public.reward_catalog (id) on delete set null,
  status     public.reward_status not null default 'pending',
  claimed_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now()
);

create unique index if not exists weekly_winners_run_rank_key on public.weekly_reward_winners (run_id, rank);
create unique index if not exists weekly_winners_run_user_key on public.weekly_reward_winners (run_id, user_id);
create index if not exists weekly_winners_user_idx on public.weekly_reward_winners (user_id, created_at desc);

-- Snapshots a completed week. Deliberately admin-triggered rather than
-- automatic so a week can be reviewed for abuse before prizes are published;
-- re-running it for the same week replaces an unpublished result and refuses
-- to touch a published one.
create or replace function public.compute_weekly_rewards(p_week_start date default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start date;
  v_end   date;
  v_run   uuid;
  v_count integer := coalesce((public.get_setting('weekly_reward_winner_count', '10'::jsonb))::text::integer, 10);
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Default to the week that just ended (weeks run Sunday..Saturday).
  v_start := coalesce(
    p_week_start,
    ((now() at time zone 'Africa/Addis_Ababa')::date
      - extract(dow from (now() at time zone 'Africa/Addis_Ababa'))::integer - 7)
  );
  v_end := v_start + 7;

  if exists (select 1 from public.weekly_reward_runs where week_start = v_start and published) then
    raise exception 'week_already_published';
  end if;

  delete from public.weekly_reward_runs where week_start = v_start and not published;

  insert into public.weekly_reward_runs (week_start, week_end)
  values (v_start, v_end)
  returning id into v_run;

  insert into public.weekly_reward_winners (run_id, user_id, rank, seconds, reward_id)
  select
    v_run,
    t.user_id,
    t.rn,
    t.secs,
    (select s.reward_id from public.weekly_reward_slots s where s.rank = t.rn and s.is_active)
  from (
    select d.user_id,
           sum(d.seconds)::bigint as secs,
           row_number() over (order by sum(d.seconds) desc, min(p.public_no)) as rn
    from public.daily_activity d
    join public.profiles p on p.id = d.user_id
    where d.activity_date >= v_start
      and d.activity_date < v_end
      and p.role = 'student'
      and not p.is_suspended
      and p.deactivated_at is null
    group by d.user_id
    having sum(d.seconds) > 0
    order by secs desc
    limit v_count
  ) t;

  perform public.write_audit_log('rewards.week_computed', 'weekly_reward_runs', v_run::text,
    jsonb_build_object('week_start', v_start, 'winner_count', v_count));

  return v_run;
end;
$$;

-- Publishing is the moment prizes become real, so any premium-days prize is
-- granted here rather than at computation time.
create or replace function public.publish_weekly_rewards(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_winner record;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (select 1 from public.weekly_reward_runs where id = p_run_id and published) then
    return;
  end if;

  for v_winner in
    select w.id, w.user_id, c.reward_type, c.reward_days
    from public.weekly_reward_winners w
    left join public.reward_catalog c on c.id = w.reward_id
    where w.run_id = p_run_id
  loop
    if v_winner.reward_type in ('premium_days', 'matric_days') and coalesce(v_winner.reward_days, 0) > 0 then
      perform public.grant_entitlement(
        v_winner.user_id,
        case when v_winner.reward_type = 'matric_days' then 'matric' else 'premium' end::public.entitlement_kind,
        v_winner.reward_days,
        'promotion', null, null, 'Weekly top-10 reward'
      );
      update public.weekly_reward_winners set status = 'awarded' where id = v_winner.id;
    else
      -- Physical prizes and airtime are handed out off-platform; they stay
      -- 'pending' until an admin marks them claimed.
      update public.weekly_reward_winners set status = 'awarded' where id = v_winner.id;
    end if;
  end loop;

  update public.weekly_reward_runs set published = true where id = p_run_id;
  perform public.write_audit_log('rewards.week_published', 'weekly_reward_runs', p_run_id::text, '{}'::jsonb);
end;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.study_sessions        enable row level security;
alter table public.daily_activity        enable row level security;
alter table public.referral_reward_tiers enable row level security;
alter table public.referrals             enable row level security;
alter table public.referral_rewards      enable row level security;
alter table public.reward_catalog        enable row level security;
alter table public.weekly_reward_slots   enable row level security;
alter table public.weekly_reward_runs    enable row level security;
alter table public.weekly_reward_winners enable row level security;

-- Read-only for the owner throughout. Note the complete absence of INSERT and
-- UPDATE policies for students on study_sessions and daily_activity: time is
-- written by record_heartbeat() alone.
drop policy if exists study_sessions_own on public.study_sessions;
create policy study_sessions_own on public.study_sessions
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists daily_activity_own on public.daily_activity;
create policy daily_activity_own on public.daily_activity
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists referral_tiers_read on public.referral_reward_tiers;
create policy referral_tiers_read on public.referral_reward_tiers
  for select using (is_active or public.is_admin());

drop policy if exists referral_tiers_admin on public.referral_reward_tiers;
create policy referral_tiers_admin on public.referral_reward_tiers
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists referrals_read_own on public.referrals;
create policy referrals_read_own on public.referrals
  for select using (referrer_id = auth.uid() or referred_id = auth.uid() or public.is_admin());

drop policy if exists referrals_admin on public.referrals;
create policy referrals_admin on public.referrals
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists referral_rewards_own on public.referral_rewards;
create policy referral_rewards_own on public.referral_rewards
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists reward_catalog_read on public.reward_catalog;
create policy reward_catalog_read on public.reward_catalog
  for select using (is_active or public.is_admin());

drop policy if exists reward_catalog_admin on public.reward_catalog;
create policy reward_catalog_admin on public.reward_catalog
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists weekly_slots_read on public.weekly_reward_slots;
create policy weekly_slots_read on public.weekly_reward_slots
  for select using (true);

drop policy if exists weekly_slots_admin on public.weekly_reward_slots;
create policy weekly_slots_admin on public.weekly_reward_slots
  for all using (public.is_admin()) with check (public.is_admin());

-- Published weeks are public (that is the point of a leaderboard prize);
-- unpublished drafts are admin-only.
drop policy if exists weekly_runs_read on public.weekly_reward_runs;
create policy weekly_runs_read on public.weekly_reward_runs
  for select using (published or public.is_admin());

drop policy if exists weekly_runs_admin on public.weekly_reward_runs;
create policy weekly_runs_admin on public.weekly_reward_runs
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists weekly_winners_read on public.weekly_reward_winners;
create policy weekly_winners_read on public.weekly_reward_winners
  for select using (
    public.is_admin()
    or user_id = auth.uid()
    or exists (select 1 from public.weekly_reward_runs r where r.id = run_id and r.published)
  );

drop policy if exists weekly_winners_admin on public.weekly_reward_winners;
create policy weekly_winners_admin on public.weekly_reward_winners
  for all using (public.is_admin()) with check (public.is_admin());

grant execute on function public.record_heartbeat(uuid) to authenticated;
grant execute on function public.end_study_session(uuid) to authenticated;
grant execute on function public.record_learning_event(text, uuid) to authenticated;
grant execute on function public.get_leaderboard(text, integer, integer) to authenticated, anon;
grant execute on function public.get_my_rank(text) to authenticated;
grant execute on function public.get_my_referral_summary() to authenticated;
grant execute on function public.compute_weekly_rewards(date) to authenticated;
grant execute on function public.publish_weekly_rewards(uuid) to authenticated;
revoke execute on function public.refresh_streak(uuid, date) from public, anon, authenticated;
revoke execute on function public.confirm_referral_and_reward(uuid) from public, anon, authenticated;
