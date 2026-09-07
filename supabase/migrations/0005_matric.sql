-- =============================================================================
-- KELEME — 0005 Matric questions (spec sections 13, 14)
--
-- The design constraint that shapes this whole file: a student must never be
-- able to read `is_correct`. Serving questions as ordinary PostgREST rows makes
-- that impossible — the answer key is one `select *` away, and no amount of
-- frontend care fixes it.
--
-- So students have NO select policy on the options table at all. Every read
-- goes through get_matric_questions(), which projects the options without the
-- answer key, and grading happens inside submit_matric_answer(), which is the
-- only thing that ever compares a student's choice to it.
-- =============================================================================

create table if not exists public.matric_years (
  id         uuid primary key default gen_random_uuid(),
  year       integer not null check (year between 1990 and 2100),
  label      text not null,
  description text,
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists matric_years_year_key on public.matric_years (year);
create index if not exists matric_years_active_idx on public.matric_years (sort_order, year desc) where is_active;

drop trigger if exists matric_years_touch on public.matric_years;
create trigger matric_years_touch before update on public.matric_years
  for each row execute function public.touch_updated_at();

create table if not exists public.matric_questions (
  id               uuid primary key default gen_random_uuid(),
  year_id          uuid not null references public.matric_years (id) on delete cascade,
  subject_id       uuid not null references public.subjects (id) on delete cascade,
  question_html    text not null,
  explanation_html text,
  difficulty       public.question_difficulty not null default 'medium',
  access_tier      public.access_tier not null default 'matric',
  marks            integer not null default 1 check (marks between 1 and 20),
  sort_order       integer not null default 0,
  is_published     boolean not null default false,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists matric_questions_year_subject_idx
  on public.matric_questions (year_id, subject_id, sort_order)
  where is_published;
create index if not exists matric_questions_subject_idx on public.matric_questions (subject_id);
create index if not exists matric_questions_created_idx on public.matric_questions (created_at desc);

drop trigger if exists matric_questions_touch on public.matric_questions;
create trigger matric_questions_touch before update on public.matric_questions
  for each row execute function public.touch_updated_at();

create table if not exists public.matric_question_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.matric_questions (id) on delete cascade,
  label       text not null check (label ~ '^[A-H]$'),
  body_html   text not null,
  is_correct  boolean not null default false,
  sort_order  integer not null default 0
);

create unique index if not exists matric_options_question_label_key
  on public.matric_question_options (question_id, label);
create index if not exists matric_options_question_idx
  on public.matric_question_options (question_id, sort_order);
-- At most one correct answer per question, enforced by the index rather than
-- by application discipline.
create unique index if not exists matric_options_one_correct
  on public.matric_question_options (question_id)
  where is_correct;

-- A question cannot be published without a complete, answerable option set.
-- This is the check that stops a half-finished admin edit from reaching
-- students as an ungradeable question.
create or replace function public.validate_matric_publish()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_options integer;
  v_correct integer;
begin
  if new.is_published then
    select count(*), count(*) filter (where is_correct)
      into v_options, v_correct
    from public.matric_question_options where question_id = new.id;

    if v_options < 2 then
      raise exception 'matric_question_needs_at_least_two_options';
    end if;
    if v_correct <> 1 then
      raise exception 'matric_question_needs_exactly_one_correct_option';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists matric_questions_validate_publish on public.matric_questions;
create trigger matric_questions_validate_publish before update on public.matric_questions
  for each row when (new.is_published) execute function public.validate_matric_publish();

-- ---------------------------------------------------------------------------
-- Practice attempts
-- ---------------------------------------------------------------------------

create table if not exists public.matric_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  year_id      uuid not null references public.matric_years (id) on delete cascade,
  subject_id   uuid not null references public.subjects (id) on delete cascade,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  correct_count integer not null default 0 check (correct_count >= 0),
  answered_count integer not null default 0 check (answered_count >= 0)
);

create index if not exists matric_attempts_user_idx
  on public.matric_attempts (user_id, started_at desc);
-- One open practice run per year+subject: reopening the page should resume,
-- not start a parallel attempt that fragments the student's progress.
create unique index if not exists matric_attempts_open_key
  on public.matric_attempts (user_id, year_id, subject_id)
  where finished_at is null;

create table if not exists public.matric_answers (
  attempt_id  uuid not null references public.matric_attempts (id) on delete cascade,
  question_id uuid not null references public.matric_questions (id) on delete cascade,
  option_id   uuid references public.matric_question_options (id) on delete set null,
  is_correct  boolean not null,
  answered_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

create index if not exists matric_answers_question_idx on public.matric_answers (question_id);

-- ---------------------------------------------------------------------------
-- Access gate
-- ---------------------------------------------------------------------------

create or replace function public.can_access_matric(p_tier public.access_tier default 'matric', p_user uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role  public.user_role;
  v_grade smallint;
  v_ok    boolean;
begin
  select role, grade, (not is_suspended and deactivated_at is null)
    into v_role, v_grade, v_ok
  from public.profiles where id = p_user;

  if v_role is null then return false; end if;
  if v_role in ('admin', 'content_editor') then return true; end if;
  if not coalesce(v_ok, false) then return false; end if;

  -- Matric is a grade 12 product regardless of what has been purchased.
  if v_grade <> 12 then return false; end if;

  return case p_tier
    when 'free' then true
    else public.has_active_entitlement('matric', p_user)
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Student-facing RPCs
-- ---------------------------------------------------------------------------

create or replace function public.get_matric_catalog()
returns table (
  year_id        uuid,
  year           integer,
  label          text,
  subject_id     uuid,
  subject_name   text,
  question_count bigint,
  free_count     bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select y.id, y.year, y.label, s.id, s.name,
         count(*) filter (where q.is_published),
         count(*) filter (where q.is_published and q.access_tier = 'free')
  from public.matric_years y
  join public.matric_questions q on q.year_id = y.id
  join public.subjects s on s.id = q.subject_id
  where y.is_active
    and public.can_access_matric('free')
  group by y.id, y.year, y.label, s.id, s.name
  having count(*) filter (where q.is_published) > 0
  order by y.year desc, s.name;
$$;

-- Options come back WITHOUT is_correct. That omission is the security control;
-- it is not a convenience.
create or replace function public.get_matric_questions(
  p_year_id    uuid,
  p_subject_id uuid,
  p_limit      integer default 25,
  p_offset     integer default 0
)
returns table (
  id             uuid,
  question_html  text,
  difficulty     public.question_difficulty,
  marks          integer,
  access_tier    public.access_tier,
  locked         boolean,
  options        jsonb,
  answered       boolean,
  answered_option uuid,
  answered_correct boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with attempt as (
    select id from public.matric_attempts
    where user_id = auth.uid() and year_id = p_year_id and subject_id = p_subject_id
      and finished_at is null
    limit 1
  )
  select
    q.id,
    -- A locked question shows its shape (difficulty, marks) but not its text,
    -- so the paywall is honest about what is behind it without leaking it.
    case when public.can_access_matric(q.access_tier) then q.question_html else null end,
    q.difficulty,
    q.marks,
    q.access_tier,
    not public.can_access_matric(q.access_tier),
    case when public.can_access_matric(q.access_tier) then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'label', o.label, 'body_html', o.body_html
      ) order by o.sort_order, o.label), '[]'::jsonb)
      from public.matric_question_options o where o.question_id = q.id
    ) else '[]'::jsonb end,
    a.question_id is not null,
    a.option_id,
    a.is_correct
  from public.matric_questions q
  left join attempt at on true
  left join public.matric_answers a on a.attempt_id = at.id and a.question_id = q.id
  where q.year_id = p_year_id
    and q.subject_id = p_subject_id
    and q.is_published
    and public.can_access_matric('free')
  order by q.sort_order, q.created_at
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.start_matric_attempt(p_year_id uuid, p_subject_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.can_access_matric('free') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select id into v_id from public.matric_attempts
  where user_id = auth.uid() and year_id = p_year_id and subject_id = p_subject_id
    and finished_at is null;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.matric_attempts (user_id, year_id, subject_id)
  values (auth.uid(), p_year_id, p_subject_id)
  returning id into v_id;

  return v_id;
end;
$$;

-- Grades server-side and returns the explanation only once the student has
-- committed to an answer. Re-answering the same question is rejected rather
-- than silently overwritten, so a student cannot farm the correct answer by
-- guessing repeatedly and watching the response.
create or replace function public.submit_matric_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_option_id  uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tier    public.access_tier;
  v_correct uuid;
  v_is_correct boolean;
  v_explanation text;
begin
  if not exists (
    select 1 from public.matric_attempts
    where id = p_attempt_id and user_id = auth.uid() and finished_at is null
  ) then
    raise exception 'attempt_not_found' using errcode = '42501';
  end if;

  select access_tier, explanation_html into v_tier, v_explanation
  from public.matric_questions where id = p_question_id and is_published;

  if v_tier is null or not public.can_access_matric(v_tier) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (select 1 from public.matric_answers where attempt_id = p_attempt_id and question_id = p_question_id) then
    raise exception 'already_answered';
  end if;

  -- The option must belong to the question being answered; without this check
  -- a client could submit the correct option id from a different question.
  if not exists (select 1 from public.matric_question_options where id = p_option_id and question_id = p_question_id) then
    raise exception 'option_does_not_belong_to_question';
  end if;

  select id into v_correct from public.matric_question_options
  where question_id = p_question_id and is_correct;

  v_is_correct := (p_option_id = v_correct);

  insert into public.matric_answers (attempt_id, question_id, option_id, is_correct)
  values (p_attempt_id, p_question_id, p_option_id, v_is_correct);

  update public.matric_attempts
  set answered_count = answered_count + 1,
      correct_count = correct_count + case when v_is_correct then 1 else 0 end
  where id = p_attempt_id;

  return jsonb_build_object(
    'is_correct', v_is_correct,
    'correct_option_id', v_correct,
    'explanation_html', v_explanation
  );
end;
$$;

create or replace function public.finish_matric_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.matric_attempts;
begin
  update public.matric_attempts
  set finished_at = now()
  where id = p_attempt_id and user_id = auth.uid() and finished_at is null
  returning * into v_row;

  if v_row.id is null then
    raise exception 'attempt_not_found' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'answered', v_row.answered_count,
    'correct', v_row.correct_count,
    'accuracy', case when v_row.answered_count = 0 then 0
                     else round(v_row.correct_count::numeric * 100 / v_row.answered_count, 1) end
  );
end;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.matric_years           enable row level security;
alter table public.matric_questions       enable row level security;
alter table public.matric_question_options enable row level security;
alter table public.matric_attempts        enable row level security;
alter table public.matric_answers         enable row level security;

drop policy if exists matric_years_read on public.matric_years;
create policy matric_years_read on public.matric_years
  for select using (public.is_staff() or (is_active and public.can_access_matric('free')));

drop policy if exists matric_years_staff on public.matric_years;
create policy matric_years_staff on public.matric_years
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists matric_questions_read on public.matric_questions;
create policy matric_questions_read on public.matric_questions
  for select using (public.is_staff() or (is_published and public.can_access_matric(access_tier)));

drop policy if exists matric_questions_staff on public.matric_questions;
create policy matric_questions_staff on public.matric_questions
  for all using (public.is_staff()) with check (public.is_staff());

-- Deliberately staff-only. Students reach options exclusively through
-- get_matric_questions(), which strips the answer key.
drop policy if exists matric_options_staff on public.matric_question_options;
create policy matric_options_staff on public.matric_question_options
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists matric_attempts_own on public.matric_attempts;
create policy matric_attempts_own on public.matric_attempts
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists matric_answers_own on public.matric_answers;
create policy matric_answers_own on public.matric_answers
  for select using (
    exists (select 1 from public.matric_attempts a where a.id = attempt_id and a.user_id = auth.uid())
    or public.is_admin()
  );

grant execute on function public.can_access_matric(public.access_tier, uuid) to authenticated;
grant execute on function public.get_matric_catalog() to authenticated;
grant execute on function public.get_matric_questions(uuid, uuid, integer, integer) to authenticated;
grant execute on function public.start_matric_attempt(uuid, uuid) to authenticated;
grant execute on function public.submit_matric_answer(uuid, uuid, uuid) to authenticated;
grant execute on function public.finish_matric_attempt(uuid) to authenticated;
