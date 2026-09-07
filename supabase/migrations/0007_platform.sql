-- =============================================================================
-- KELEME — 0007 Platform configuration: contacts, announcements, settings RLS
--
-- Spec sections 4 and 5 are explicit that support phone numbers and email
-- addresses must not be baked into the UI. They are rows here, with a label, an
-- active flag and an ordering, so the team can rotate a number the day a SIM
-- changes without a deployment.
-- =============================================================================

create table if not exists public.contact_phones (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  label       text not null default 'Support',
  purpose     text,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists contact_phones_phone_key on public.contact_phones (phone);
create index if not exists contact_phones_active_idx on public.contact_phones (sort_order) where is_active;

-- Stored in the same canonical form as student phone numbers so `tel:` links
-- and any future SMS integration get one predictable shape.
create or replace function public.normalize_contact_phone()
returns trigger
language plpgsql
as $$
declare
  v_normalized text;
begin
  v_normalized := public.normalize_et_phone(new.phone);
  if v_normalized is null then
    raise exception 'invalid_ethiopian_phone_number';
  end if;
  new.phone := v_normalized;
  return new;
end;
$$;

drop trigger if exists contact_phones_normalize on public.contact_phones;
create trigger contact_phones_normalize before insert or update of phone on public.contact_phones
  for each row execute function public.normalize_contact_phone();

drop trigger if exists contact_phones_touch on public.contact_phones;
create trigger contact_phones_touch before update on public.contact_phones
  for each row execute function public.touch_updated_at();

create table if not exists public.contact_emails (
  id         uuid primary key default gen_random_uuid(),
  email      text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  label      text not null default 'General',
  purpose    text,
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists contact_emails_email_key on public.contact_emails (lower(email));
create index if not exists contact_emails_active_idx on public.contact_emails (sort_order) where is_active;

drop trigger if exists contact_emails_touch on public.contact_emails;
create trigger contact_emails_touch before update on public.contact_emails
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------

create table if not exists public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  level        text not null default 'info' check (level in ('info', 'success', 'warning', 'critical')),
  target_grade smallint check (target_grade is null or target_grade between 9 and 12),
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz,
  is_active    boolean not null default true,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists announcements_live_idx on public.announcements (starts_at desc)
  where is_active;

drop trigger if exists announcements_touch on public.announcements;
create trigger announcements_touch before update on public.announcements
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Support contact bundle
--
-- One call for everything the "Contact us" surface needs, so the client is not
-- making three round trips on a slow connection to render one panel.
-- ---------------------------------------------------------------------------

create or replace function public.get_support_contacts()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'phones', (
      select coalesce(jsonb_agg(jsonb_build_object('phone', phone, 'label', label, 'purpose', purpose)
        order by sort_order, label), '[]'::jsonb)
      from public.contact_phones where is_active
    ),
    'emails', (
      select coalesce(jsonb_agg(jsonb_build_object('email', email, 'label', label, 'purpose', purpose)
        order by sort_order, label), '[]'::jsonb)
      from public.contact_emails where is_active
    )
  );
$$;

create or replace function public.admin_set_setting(p_key text, p_value jsonb, p_description text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.app_settings (key, value, description, updated_by)
  values (p_key, p_value, p_description, auth.uid())
  on conflict (key) do update
    set value = excluded.value,
        description = coalesce(excluded.description, public.app_settings.description),
        updated_by = auth.uid(),
        updated_at = now();

  perform public.write_audit_log('settings.updated', 'app_settings', p_key,
    jsonb_build_object('value', p_value));
end;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.contact_phones enable row level security;
alter table public.contact_emails enable row level security;
alter table public.announcements  enable row level security;
alter table public.app_settings   enable row level security;

-- Contacts are public on purpose: a student who cannot sign in is exactly the
-- person who needs the support number.
drop policy if exists contact_phones_read on public.contact_phones;
create policy contact_phones_read on public.contact_phones
  for select using (is_active or public.is_admin());

drop policy if exists contact_phones_admin on public.contact_phones;
create policy contact_phones_admin on public.contact_phones
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists contact_emails_read on public.contact_emails;
create policy contact_emails_read on public.contact_emails
  for select using (is_active or public.is_admin());

drop policy if exists contact_emails_admin on public.contact_emails;
create policy contact_emails_admin on public.contact_emails
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements
  for select using (
    public.is_admin()
    or (
      is_active
      and starts_at <= now()
      and (ends_at is null or ends_at > now())
      and (target_grade is null or target_grade = public.current_grade())
    )
  );

drop policy if exists announcements_admin on public.announcements;
create policy announcements_admin on public.announcements
  for all using (public.is_admin()) with check (public.is_admin());

-- Settings are readable by staff only. Anything a student legitimately needs
-- from them (ad level, streak thresholds) is surfaced through a function that
-- returns just that value.
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select using (public.is_staff());

drop policy if exists app_settings_admin on public.app_settings;
create policy app_settings_admin on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

grant execute on function public.get_support_contacts() to authenticated, anon;
grant execute on function public.admin_set_setting(text, jsonb, text) to authenticated;
grant execute on function public.get_setting(text, jsonb) to authenticated;
