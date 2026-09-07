-- =============================================================================
-- KELEME — 0001 Extensions, enums and shared helper functions
--
-- Everything in this file is dependency-free groundwork: the enum vocabulary
-- the rest of the schema speaks, plus the small SQL/plpgsql helpers that both
-- application code and (critically) RLS policies call.
--
-- Every helper that an RLS policy depends on is SECURITY DEFINER with a locked
-- search_path. That is deliberate and load-bearing: a policy on `profiles`
-- that called a plain function reading `profiles` would recurse forever. Owned
-- by the migration role, these read underlying tables with RLS bypassed, which
-- both breaks the recursion and keeps the authorization rule in exactly one
-- place instead of being copy-pasted into a dozen policies.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.user_role as enum ('student', 'content_editor', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.content_type as enum ('html', 'pdf', 'youtube', 'other');
exception when duplicate_object then null; end $$;

-- Three tiers, not two: 'matric' content is gated by a *separate* purchase
-- from standard premium, so it cannot be modelled as a boolean.
do $$ begin
  create type public.access_tier as enum ('free', 'premium', 'matric');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.plan_kind as enum ('standard', 'matric');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.entitlement_kind as enum ('premium', 'matric');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.entitlement_source as enum ('purchase', 'referral_reward', 'admin_grant', 'promotion');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ad_level as enum ('none', 'low', 'medium', 'high');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.question_difficulty as enum ('easy', 'medium', 'hard');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.reward_status as enum ('pending', 'awarded', 'claimed', 'forfeited');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.referral_status as enum ('pending', 'confirmed', 'rejected');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.touch_updated_at is
  'Generic BEFORE UPDATE trigger keeping updated_at honest. Attached to every table that carries the column — never set updated_at from the client.';

-- ---------------------------------------------------------------------------
-- Ethiopian phone normalization
--
-- Stored in one canonical shape (+251XXXXXXXXX) so that uniqueness, referral
-- abuse checks and admin lookups all compare the same string regardless of how
-- the student typed it. Accepts 09.., 9.., 2519.., +2519.. and the 07/7 range.
-- Returns NULL for anything that is not a valid Ethiopian mobile number, which
-- lets callers use `is not null` as the validity test.
-- ---------------------------------------------------------------------------

create or replace function public.normalize_et_phone(raw text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  if raw is null then
    return null;
  end if;

  -- Keep digits only; a leading + carries no information once we know the
  -- country code, and students paste numbers with spaces, dashes and dots.
  digits := regexp_replace(raw, '[^0-9]', '', 'g');

  if digits = '' then
    return null;
  end if;

  -- 251XXXXXXXXX (12 digits) — already country-coded.
  if length(digits) = 12 and left(digits, 3) = '251' then
    digits := substr(digits, 4);
  -- 0XXXXXXXXX (10 digits) — national trunk form.
  elsif length(digits) = 10 and left(digits, 1) = '0' then
    digits := substr(digits, 2);
  -- XXXXXXXXX (9 digits) — bare subscriber number.
  elsif length(digits) = 9 then
    -- already in subscriber form
    null;
  else
    return null;
  end if;

  -- Ethiopian mobile ranges: 9 (all operators) and 7 (Safaricom Ethiopia).
  if digits !~ '^[97][0-9]{8}$' then
    return null;
  end if;

  return '+251' || digits;
end;
$$;

comment on function public.normalize_et_phone is
  'Canonicalises any Ethiopian mobile number to +251XXXXXXXXX, or NULL when the input is not a valid Ethiopian mobile number.';

-- ---------------------------------------------------------------------------
-- Grade access rule (spec section 7)
--
-- Grades 9/10/11 are strictly walled off from each other. Grade 12 is the one
-- exception: it reaches down across the whole 9-12 catalogue, because matric
-- revision legitimately spans every earlier year.
--
-- This is a pure function of two grades so the identical rule can be applied
-- in an RLS policy, in a server route, and in a test, with no chance of the
-- three drifting apart.
-- ---------------------------------------------------------------------------

create or replace function public.grade_can_access(viewer_grade smallint, content_grade smallint)
returns boolean
language sql
immutable
as $$
  select case
    when viewer_grade is null or content_grade is null then false
    when viewer_grade = 12 then content_grade between 9 and 12
    else viewer_grade = content_grade
  end;
$$;

comment on function public.grade_can_access is
  'Spec section 7: grades 9-11 see only their own year; grade 12 additionally sees 9, 10 and 11.';

-- ---------------------------------------------------------------------------
-- Application settings
--
-- Defined this early — before anything that reads it — because helper
-- functions in later migrations resolve their defaults from here, and a SQL
-- function body is validated against existing relations at CREATE time.
-- One row per knob, JSONB value so a setting can grow from a scalar into an
-- object without a migration. RLS for this table lives in 0007 alongside the
-- rest of the platform-configuration policies, since it needs is_admin().
-- ---------------------------------------------------------------------------

create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();

create or replace function public.get_setting(p_key text, p_default jsonb default null)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select value from public.app_settings where key = p_key), p_default);
$$;
