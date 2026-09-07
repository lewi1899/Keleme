-- =============================================================================
-- KELEME — 0003 Plans, payments and entitlements
--
-- The money model has three layers that are kept strictly separate:
--
--   plans              what is for sale, and at what price (admin-editable)
--   payments           an attempt to buy one, with the provider's reference
--   user_entitlements  what a student is actually allowed to do, and until when
--
-- Access is always read from the third. A payment row existing proves nothing;
-- only a live entitlement grants access, and entitlements are written by a
-- SECURITY DEFINER function that no client can call with forged arguments.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Plans (spec sections 12 and 13)
--
-- Standard Premium and the Matric package are the same shape with a different
-- `kind`, so admins get one management screen and the pricing rules can never
-- diverge between the two products. Nothing here is hard-coded in application
-- code: prices, durations, names, ad levels and availability are all rows.
-- ---------------------------------------------------------------------------

create table if not exists public.plans (
  id            uuid primary key default gen_random_uuid(),
  kind          public.plan_kind not null,
  slug          text not null,
  name          text not null,
  description   text,
  duration_days integer not null check (duration_days between 1 and 3650),
  price         numeric(10, 2) not null check (price >= 0),
  currency      text not null default 'ETB' check (char_length(currency) = 3),
  ad_level      public.ad_level not null default 'medium',
  is_active     boolean not null default true,
  is_promotional boolean not null default false,
  promo_ends_at timestamptz,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists plans_slug_key on public.plans (slug);
create index if not exists plans_active_idx on public.plans (kind, sort_order) where is_active;

drop trigger if exists plans_touch on public.plans;
create trigger plans_touch before update on public.plans
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Payments
--
-- Provider-agnostic on purpose: `provider` plus `provider_reference` is enough
-- to reconcile with any Ethiopian PSP. No provider is wired up in this release
-- (see docs/PAYMENTS.md); the table and the state machine exist so integrating
-- one is a single adapter file rather than a schema change.
-- ---------------------------------------------------------------------------

create table if not exists public.payments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  plan_id            uuid not null references public.plans (id) on delete restrict,
  provider           text not null default 'manual',
  provider_reference text,
  amount             numeric(10, 2) not null check (amount >= 0),
  currency           text not null default 'ETB',
  status             public.payment_status not null default 'pending',
  failure_reason     text,
  provider_payload   jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  paid_at            timestamptz
);

-- One reference per provider, so a replayed webhook cannot be double-credited.
create unique index if not exists payments_provider_reference_key
  on public.payments (provider, provider_reference)
  where provider_reference is not null;
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
create index if not exists payments_status_idx on public.payments (status, created_at desc);

drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Entitlements
--
-- One row per grant, never mutated in place except to revoke. Renewals insert
-- a new row starting where the last one ends, so the history of what a student
-- paid for stays auditable.
-- ---------------------------------------------------------------------------

create table if not exists public.user_entitlements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  kind           public.entitlement_kind not null,
  source         public.entitlement_source not null,
  plan_id        uuid references public.plans (id) on delete set null,
  payment_id     uuid references public.payments (id) on delete set null,
  starts_at      timestamptz not null default now(),
  ends_at        timestamptz not null,
  granted_by     uuid references public.profiles (id) on delete set null,
  note           text,
  revoked_at     timestamptz,
  revoked_reason text,
  created_at     timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists entitlements_user_kind_idx
  on public.user_entitlements (user_id, kind, ends_at desc)
  where revoked_at is null;
create index if not exists entitlements_active_idx
  on public.user_entitlements (ends_at desc)
  where revoked_at is null;
create index if not exists entitlements_payment_idx on public.user_entitlements (payment_id);

-- ---------------------------------------------------------------------------
-- Entitlement helpers — the single authority on "may this student do X"
-- ---------------------------------------------------------------------------

create or replace function public.has_active_entitlement(p_kind public.entitlement_kind, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_entitlements
    where user_id = p_user
      and kind = p_kind
      and revoked_at is null
      and starts_at <= now()
      and ends_at > now()
  );
$$;

comment on function public.has_active_entitlement is
  'The one place "is this student premium / does this student own the matric package" is decided. Called from RLS policies and from server routes alike.';

create or replace function public.entitlement_expires_at(p_kind public.entitlement_kind, p_user uuid default auth.uid())
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select max(ends_at) from public.user_entitlements
  where user_id = p_user and kind = p_kind and revoked_at is null and ends_at > now();
$$;

-- Ad exposure follows the *best* plan the student currently holds: someone who
-- bought a 1-year subscription and later adds a 1-month matric package should
-- not start seeing ads again.
create or replace function public.current_ad_level(p_user uuid default auth.uid())
returns public.ad_level
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select p.ad_level
      from public.user_entitlements e
      join public.plans p on p.id = e.plan_id
      where e.user_id = p_user
        and e.revoked_at is null
        and e.starts_at <= now()
        and e.ends_at > now()
      order by array_position(array['none','low','medium','high']::text[], p.ad_level::text)
      limit 1
    ),
    -- No paid plan: fall back to the configured free-tier level.
    (select (value #>> '{}')::public.ad_level from public.app_settings where key = 'free_tier_ad_level'),
    'high'::public.ad_level
  );
$$;

-- ---------------------------------------------------------------------------
-- Granting
--
-- Extends rather than stacks: a renewal bought before the current period ends
-- starts where the current one finishes, so nothing is lost by paying early.
-- ---------------------------------------------------------------------------

create or replace function public.grant_entitlement(
  p_user       uuid,
  p_kind       public.entitlement_kind,
  p_days       integer,
  p_source     public.entitlement_source,
  p_plan_id    uuid default null,
  p_payment_id uuid default null,
  p_note       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz;
  v_id    uuid;
begin
  if p_days is null or p_days <= 0 then
    raise exception 'entitlement_days_must_be_positive';
  end if;

  select greatest(now(), coalesce(max(ends_at), now())) into v_start
  from public.user_entitlements
  where user_id = p_user and kind = p_kind and revoked_at is null and ends_at > now();

  insert into public.user_entitlements (
    user_id, kind, source, plan_id, payment_id, starts_at, ends_at, granted_by, note
  ) values (
    p_user, p_kind, p_source, p_plan_id, p_payment_id,
    v_start, v_start + make_interval(days => p_days), auth.uid(), p_note
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.grant_entitlement is
  'Only path that creates access. Not granted to `authenticated` — callable by admins through admin_grant_entitlement, and by the service role from the payment webhook.';

-- Thin admin wrapper that adds the authorization check and the audit trail.
create or replace function public.admin_grant_entitlement(
  p_user  uuid,
  p_kind  public.entitlement_kind,
  p_days  integer,
  p_note  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  v_id := public.grant_entitlement(p_user, p_kind, p_days, 'admin_grant', null, null, p_note);
  perform public.write_audit_log(
    'entitlement.granted', 'user_entitlements', v_id::text,
    jsonb_build_object('user_id', p_user, 'kind', p_kind, 'days', p_days, 'note', p_note)
  );
  return v_id;
end;
$$;

create or replace function public.admin_revoke_entitlement(p_entitlement uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  update public.user_entitlements
  set revoked_at = now(), revoked_reason = p_reason
  where id = p_entitlement and revoked_at is null;

  perform public.write_audit_log(
    'entitlement.revoked', 'user_entitlements', p_entitlement::text,
    jsonb_build_object('reason', p_reason)
  );
end;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.plans             enable row level security;
alter table public.payments          enable row level security;
alter table public.user_entitlements enable row level security;

-- Active plans are public: the pricing page must render before sign-in.
drop policy if exists plans_read_active on public.plans;
create policy plans_read_active on public.plans
  for select using (is_active or public.is_admin());

drop policy if exists plans_admin_write on public.plans;
create policy plans_admin_write on public.plans
  for all using (public.is_admin()) with check (public.is_admin());

-- Students see their own payment history and nothing else. They cannot insert:
-- a payment row is created server-side when checkout starts, so the amount is
-- always read from the plan row rather than from the browser.
drop policy if exists payments_read_own on public.payments;
create policy payments_read_own on public.payments
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists payments_admin_write on public.payments;
create policy payments_admin_write on public.payments
  for all using (public.is_admin()) with check (public.is_admin());

-- Read-only for the owner. There is deliberately no INSERT/UPDATE policy for
-- `authenticated` at all: the only way an entitlement comes into existence is
-- grant_entitlement(), called by an admin or by the service role.
drop policy if exists entitlements_read_own on public.user_entitlements;
create policy entitlements_read_own on public.user_entitlements
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists entitlements_admin_write on public.user_entitlements;
create policy entitlements_admin_write on public.user_entitlements
  for all using (public.is_admin()) with check (public.is_admin());

grant execute on function public.has_active_entitlement(public.entitlement_kind, uuid) to authenticated;
grant execute on function public.entitlement_expires_at(public.entitlement_kind, uuid) to authenticated;
grant execute on function public.current_ad_level(uuid) to authenticated;
grant execute on function public.admin_grant_entitlement(uuid, public.entitlement_kind, integer, text) to authenticated;
grant execute on function public.admin_revoke_entitlement(uuid, text) to authenticated;
revoke execute on function public.grant_entitlement(uuid, public.entitlement_kind, integer, public.entitlement_source, uuid, uuid, text) from public, anon, authenticated;
