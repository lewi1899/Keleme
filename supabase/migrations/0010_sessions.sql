-- =============================================================================
-- KELEME — 0010 Sign-in RPCs: device sessions and referral confirmation
--
-- Supabase's JWT is stateless: once issued it stays valid until it expires, and
-- there is no server-side handle to revoke it mid-flight. Spec section 21 wants
-- one account = one active session, so we keep our own device-session record
-- alongside the JWT and check it on every navigation.
--
-- The browser holds a random token in an httpOnly cookie; only its SHA-256 hash
-- is ever stored. Signing in elsewhere revokes every other row, so the first
-- device's next request finds its session gone and is bounced to sign-in.
-- =============================================================================

-- Called once, immediately after a successful password sign-in. Does the three
-- things that must happen atomically at that moment: revoke other devices,
-- record this one, and confirm a pending referral now that we know the account
-- is real enough to have been signed into.
create or replace function public.on_sign_in(
  p_token_hash text,
  p_user_agent text default null,
  p_device_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_revoked  integer := 0;
  v_id       uuid;
  v_suspended boolean;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select is_suspended into v_suspended from public.profiles where id = v_user;
  if coalesce(v_suspended, false) then
    raise exception 'account_suspended' using errcode = '42501';
  end if;

  update public.user_sessions
  set revoked_at = now(), revoked_reason = 'signed_in_elsewhere'
  where user_id = v_user and revoked_at is null;
  get diagnostics v_revoked = row_count;

  insert into public.user_sessions (user_id, token_hash, user_agent, device_label)
  values (v_user, p_token_hash, left(coalesce(p_user_agent, ''), 400), p_device_label)
  returning id into v_id;

  -- Close any study session the previous device left open, so its time cannot
  -- keep accruing against an account that has moved to another phone.
  update public.study_sessions
  set ended_at = now()
  where user_id = v_user and ended_at is null;

  perform public.confirm_referral_and_reward(v_user);

  return jsonb_build_object('session_id', v_id, 'revoked_previous', v_revoked);
end;
$$;

-- Checked on every authenticated navigation. Cheap by design: one indexed
-- lookup on the token hash, and a last_seen_at write that costs a single page
-- update. Returns false when the session was revoked by a sign-in elsewhere,
-- which the app turns into a "signed in on another device" sign-out.
create or replace function public.validate_device_session(p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.user_sessions
  set last_seen_at = now()
  where token_hash = p_token_hash
    and user_id = auth.uid()
    and revoked_at is null
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

create or replace function public.end_device_session(p_token_hash text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.user_sessions
  set revoked_at = now(), revoked_reason = 'signed_out'
  where token_hash = p_token_hash and user_id = auth.uid() and revoked_at is null;

  update public.study_sessions
  set ended_at = now()
  where user_id = auth.uid() and ended_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- The bundle every authenticated page needs
--
-- Profile, entitlements, ad level and streak in one round trip. On a 3G
-- connection in Addis, four sequential queries to render a header is the
-- difference between a fast app and a slow one.
-- ---------------------------------------------------------------------------

create or replace function public.get_session_context(p_token_hash text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_valid boolean := true;
  v_tz    text;
begin
  if v_user is null then
    return null;
  end if;

  -- Folded into this call rather than made a second round trip: every
  -- authenticated page needs both answers, and on a slow mobile connection the
  -- extra request is more expensive than the query.
  if p_token_hash is not null then
    v_valid := public.validate_device_session(p_token_hash);
  end if;

  select timezone into v_tz from public.profiles where id = v_user;

  return jsonb_build_object(
    'device_valid', v_valid,
    'profile', (
      -- The raw phone number is removed and replaced with a masked form. The
      -- student can still recognise their own number; a leaked payload does not
      -- hand anyone a contact list.
      select to_jsonb(p) - 'phone' || jsonb_build_object('phone_masked',
        case when p.phone is null then null
             else '+251 ** *** ' || right(p.phone, 3) end)
      from public.profiles p where p.id = v_user
    ),
    'is_premium', public.has_active_entitlement('premium'),
    'is_matric',  public.has_active_entitlement('matric'),
    'premium_until', public.entitlement_expires_at('premium'),
    'matric_until',  public.entitlement_expires_at('matric'),
    'ad_level', public.current_ad_level(),
    'today_seconds', coalesce((
      select seconds from public.daily_activity
      where user_id = v_user
        and activity_date = (now() at time zone coalesce(v_tz, 'Africa/Addis_Ababa'))::date
    ), 0),
    'unread_announcements', (
      select count(*) from public.announcements
      where is_active and starts_at <= now() and (ends_at is null or ends_at > now())
    )
  );
end;
$$;

grant execute on function public.on_sign_in(text, text, text) to authenticated;
grant execute on function public.validate_device_session(text) to authenticated;
grant execute on function public.end_device_session(text) to authenticated;
grant execute on function public.get_session_context(text) to authenticated;
