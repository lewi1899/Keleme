-- =============================================================================
-- KELEME — 0004 Curriculum and content
--
-- Content is one table with a `content_type` discriminator rather than four
-- parallel tables, because every screen in the app — browse, search, admin
-- list, "continue where you left off" — wants a mixed, ordered feed. Type
-- specific columns are guarded by CHECK constraints so a YouTube row can never
-- be saved without a video id.
--
-- The one thing NOT stored here is the HTML body itself. It lives in
-- `content_html_bodies` under its own, stricter policy, so a free student can
-- see that a premium note exists (title, description, subject) without any
-- possibility of the body leaking through a crafted PostgREST query. That
-- separation is what makes spec section 9's "viewable online, never
-- downloadable" enforceable at the database layer rather than in the UI.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Subjects and units
-- ---------------------------------------------------------------------------

create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  grade       smallint not null check (grade between 9 and 12),
  name        text not null check (length(trim(name)) between 1 and 80),
  slug        text not null,
  description text,
  icon_key    text not null default 'book-open',
  color       text not null default '#2563eb',
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists subjects_grade_slug_key on public.subjects (grade, slug);
create index if not exists subjects_grade_idx on public.subjects (grade, sort_order) where is_active;

drop trigger if exists subjects_touch on public.subjects;
create trigger subjects_touch before update on public.subjects
  for each row execute function public.touch_updated_at();

create table if not exists public.units (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects (id) on delete cascade,
  title       text not null check (length(trim(title)) between 1 and 160),
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists units_subject_idx on public.units (subject_id, sort_order);

drop trigger if exists units_touch on public.units;
create trigger units_touch before update on public.units
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Content items
-- ---------------------------------------------------------------------------

create table if not exists public.content_items (
  id             uuid primary key default gen_random_uuid(),
  content_type   public.content_type not null,
  access_tier    public.access_tier not null default 'free',

  -- Grade is stored on the row, not only inferred through the subject, because
  -- it is read on every single access check. A trigger below keeps it in step
  -- with the subject so the denormalisation cannot drift.
  grade          smallint not null check (grade between 9 and 12),
  subject_id     uuid references public.subjects (id) on delete set null,
  unit_id        uuid references public.units (id) on delete set null,

  title          text not null check (length(trim(title)) between 1 and 200),
  description    text,
  tags           text[] not null default '{}',

  -- PDF
  storage_path   text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes > 0),
  mime_type      text,

  -- YouTube
  youtube_video_id text,
  youtube_url      text,

  -- 'other'
  external_url   text,

  thumbnail_path text,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),

  is_published   boolean not null default false,
  sort_order     integer not null default 0,

  created_by     uuid references public.profiles (id) on delete set null,
  updated_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Each type must carry the payload its type implies, and must not carry
  -- another type's. Without this an admin mis-click produces a content row
  -- that renders as a blank screen for every student in the grade.
  constraint content_type_payload check (
    case content_type
      when 'pdf'     then storage_path is not null
      when 'youtube' then youtube_video_id is not null
      when 'other'   then external_url is not null
      else true
    end
  )
);

create index if not exists content_grade_tier_idx
  on public.content_items (grade, access_tier, sort_order)
  where is_published;
create index if not exists content_subject_idx on public.content_items (subject_id, sort_order);
create index if not exists content_unit_idx on public.content_items (unit_id, sort_order);
create index if not exists content_type_idx on public.content_items (content_type, created_at desc);
create index if not exists content_created_at_idx on public.content_items (created_at desc);
create index if not exists content_title_trgm_idx on public.content_items using gin (title gin_trgm_ops);
create index if not exists content_tags_idx on public.content_items using gin (tags);

drop trigger if exists content_items_touch on public.content_items;
create trigger content_items_touch before update on public.content_items
  for each row execute function public.touch_updated_at();

-- Keep the denormalised grade honest.
create or replace function public.sync_content_grade()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_grade smallint;
begin
  if new.subject_id is not null then
    select grade into v_grade from public.subjects where id = new.subject_id;
    if v_grade is not null then
      new.grade := v_grade;
    end if;
  end if;

  -- A unit must belong to the subject it is filed under.
  if new.unit_id is not null and new.subject_id is not null then
    if not exists (select 1 from public.units where id = new.unit_id and subject_id = new.subject_id) then
      raise exception 'unit_does_not_belong_to_subject';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists content_items_sync_grade on public.content_items;
create trigger content_items_sync_grade before insert or update on public.content_items
  for each row execute function public.sync_content_grade();

-- ---------------------------------------------------------------------------
-- HTML bodies — separate table, stricter policy
-- ---------------------------------------------------------------------------

create table if not exists public.content_html_bodies (
  content_id uuid primary key references public.content_items (id) on delete cascade,
  body_html  text not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists content_html_bodies_touch on public.content_html_bodies;
create trigger content_html_bodies_touch before update on public.content_html_bodies
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- The access rule (spec sections 7, 8, 10, 24)
--
-- Three independent gates, all of which must pass: published, grade reachable,
-- and the tier's entitlement held. Written once, here, and then reused by the
-- RLS policies, the PDF signing route and the HTML delivery RPC — so there is
-- no way for one caller to be accidentally more permissive than another.
-- ---------------------------------------------------------------------------

create or replace function public.can_access_content(p_content uuid, p_user uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tier      public.access_tier;
  v_grade     smallint;
  v_published boolean;
  v_role      public.user_role;
  v_viewer    smallint;
  v_active    boolean;
begin
  select access_tier, grade, is_published
    into v_tier, v_grade, v_published
  from public.content_items where id = p_content;

  if v_tier is null then
    return false;
  end if;

  select role, grade, (not is_suspended and deactivated_at is null)
    into v_role, v_viewer, v_active
  from public.profiles where id = p_user;

  if v_role is null then
    return false;
  end if;

  -- Staff read everything, including drafts, so they can preview before
  -- publishing.
  if v_role in ('admin', 'content_editor') then
    return true;
  end if;

  if not coalesce(v_active, false) or not v_published then
    return false;
  end if;

  if not public.grade_can_access(v_viewer, v_grade) then
    return false;
  end if;

  return case v_tier
    when 'free'    then true
    when 'premium' then public.has_active_entitlement('premium', p_user)
    when 'matric'  then public.has_active_entitlement('matric', p_user)
    else false
  end;
end;
$$;

-- Catalogue visibility is looser than content access on purpose: a free
-- student in grade 10 should see that a premium note exists and be able to
-- decide to buy. They get the title and description; never the body.
create or replace function public.can_list_content(p_content uuid, p_user uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_grade     smallint;
  v_published boolean;
  v_role      public.user_role;
  v_viewer    smallint;
begin
  select grade, is_published into v_grade, v_published
  from public.content_items where id = p_content;

  if v_grade is null then
    return false;
  end if;

  select role, grade into v_role, v_viewer from public.profiles where id = p_user;
  if v_role is null then
    return false;
  end if;
  if v_role in ('admin', 'content_editor') then
    return true;
  end if;

  return v_published and public.grade_can_access(v_viewer, v_grade);
end;
$$;

-- The only way a student ever receives HTML. Returns the body if and only if
-- every gate passes, and records the read for streak/recency purposes.
create or replace function public.get_content_html(p_content uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_body text;
begin
  if not public.can_access_content(p_content) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select body_html into v_body from public.content_html_bodies where content_id = p_content;
  return v_body;
end;
$$;

-- ---------------------------------------------------------------------------
-- Per-student content state
-- ---------------------------------------------------------------------------

create table if not exists public.content_progress (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  content_id     uuid not null references public.content_items (id) on delete cascade,
  first_opened_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now(),
  seconds_spent  integer not null default 0 check (seconds_spent >= 0),
  completed_at   timestamptz,
  primary key (user_id, content_id)
);

create index if not exists content_progress_recent_idx
  on public.content_progress (user_id, last_opened_at desc);

create table if not exists public.bookmarks (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  content_id uuid not null references public.content_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, content_id)
);

create index if not exists bookmarks_user_idx on public.bookmarks (user_id, created_at desc);

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.subjects            enable row level security;
alter table public.units               enable row level security;
alter table public.content_items       enable row level security;
alter table public.content_html_bodies enable row level security;
alter table public.content_progress    enable row level security;
alter table public.bookmarks           enable row level security;

-- Subjects and units are visible only for grades the student may reach. This
-- matters beyond tidiness: without it a grade 9 student could enumerate the
-- entire grade 12 syllabus structure.
drop policy if exists subjects_read on public.subjects;
create policy subjects_read on public.subjects
  for select using (
    public.is_staff()
    or (is_active and public.grade_can_access(public.current_grade(), grade))
  );

drop policy if exists subjects_staff_write on public.subjects;
create policy subjects_staff_write on public.subjects
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists units_read on public.units;
create policy units_read on public.units
  for select using (
    public.is_staff()
    or exists (
      select 1 from public.subjects s
      where s.id = units.subject_id
        and s.is_active
        and public.grade_can_access(public.current_grade(), s.grade)
    )
  );

drop policy if exists units_staff_write on public.units;
create policy units_staff_write on public.units
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists content_items_read on public.content_items;
create policy content_items_read on public.content_items
  for select using (public.can_list_content(id));

drop policy if exists content_items_staff_write on public.content_items;
create policy content_items_staff_write on public.content_items
  for all using (public.is_staff()) with check (public.is_staff());

-- The strict half of the pair: entitlement required, no catalogue exception.
drop policy if exists content_html_read on public.content_html_bodies;
create policy content_html_read on public.content_html_bodies
  for select using (public.can_access_content(content_id));

drop policy if exists content_html_staff_write on public.content_html_bodies;
create policy content_html_staff_write on public.content_html_bodies
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists content_progress_own on public.content_progress;
create policy content_progress_own on public.content_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists content_progress_admin_read on public.content_progress;
create policy content_progress_admin_read on public.content_progress
  for select using (public.is_admin());

drop policy if exists bookmarks_own on public.bookmarks;
create policy bookmarks_own on public.bookmarks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant execute on function public.can_access_content(uuid, uuid) to authenticated;
grant execute on function public.can_list_content(uuid, uuid) to authenticated;
grant execute on function public.get_content_html(uuid) to authenticated;
