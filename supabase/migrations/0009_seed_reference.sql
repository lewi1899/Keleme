-- =============================================================================
-- KELEME — 0009 Reference data
--
-- Idempotent: every insert is ON CONFLICT DO NOTHING, so re-running migrations
-- against an existing database never duplicates a plan or resets a price an
-- admin has since changed.
--
-- Administrator ACCOUNTS are not created here — they need rows in auth.users,
-- which only the service role can write. See scripts/seed.ts and
-- docs/DEPLOYMENT.md.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

insert into public.app_settings (key, value, description) values
  ('free_tier_ad_level',        '"high"',  'Ad density shown to students with no paid plan.'),
  ('streak_min_seconds',        '300',     'Seconds of study needed for a day to count toward a streak.'),
  ('streak_min_questions',      '5',       'Questions answered that alternatively qualify a day for a streak.'),
  ('heartbeat_cap_seconds',     '90',      'Maximum seconds credited by a single heartbeat. Caps idle-tab inflation.'),
  ('daily_seconds_cap',         '43200',   'Maximum study seconds credited to one student in one day (12 hours).'),
  ('session_idle_timeout_seconds', '600',  'Study session is closed after this much silence.'),
  ('weekly_reward_winner_count','10',      'How many students are ranked for the weekly prize.'),
  ('referral_burst_limit_per_hour', '10',  'Confirmed referrals per hour before a referrer is flagged for review.'),
  ('leaderboard_enabled',       'true',    'Master switch for the public leaderboard.'),
  ('registration_open',         'true',    'Allows new student registration.'),
  ('signed_url_ttl_seconds',    '300',     'Lifetime of the signed URLs issued for premium PDF downloads.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Plans (spec sections 12 and 13)
--
-- Ad level falls as commitment rises, and the annual plans carry none at all.
-- ---------------------------------------------------------------------------

insert into public.plans (kind, slug, name, description, duration_days, price, ad_level, sort_order) values
  ('standard', 'standard-1m',  'Premium — 1 Month',   'Full access to premium notes, PDFs and videos for your grade.', 30,  50.00,  'high',   1),
  ('standard', 'standard-3m',  'Premium — 3 Months',  'Three months of full premium access, with fewer ads.',          90,  120.00, 'medium', 2),
  ('standard', 'standard-6m',  'Premium — 6 Months',  'Half a year of premium access, with minimal ads.',              180, 180.00, 'low',    3),
  ('standard', 'standard-12m', 'Premium — 1 Year',    'A full year of premium access, completely ad free.',            365, 300.00, 'none',   4),
  ('matric',   'matric-1m',    'Matric Package — 1 Month',  'Grade 12 matric and model questions with explanations.',  30,  80.00,  'high',   1),
  ('matric',   'matric-3m',    'Matric Package — 3 Months', 'Three months of matric and model question practice.',     90,  200.00, 'medium', 2),
  ('matric',   'matric-6m',    'Matric Package — 6 Months', 'Six months of matric practice through exam season.',      180, 350.00, 'low',    3),
  ('matric',   'matric-12m',   'Matric Package — 1 Year',   'A full year of matric practice, completely ad free.',     365, 550.00, 'none',   4)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Referral reward tiers (spec section 15)
-- ---------------------------------------------------------------------------

insert into public.referral_reward_tiers (name, required_referrals, reward_kind, reward_days, sort_order) values
  ('Bronze — 5 friends',  5,  'premium', 30,  1),
  ('Silver — 30 friends', 30, 'premium', 240, 2),
  ('Gold — 50 friends',   50, 'premium', 365, 3)
on conflict (required_referrals) do nothing;

-- ---------------------------------------------------------------------------
-- Weekly reward catalogue and slots (spec section 19)
--
-- Seeded with premium-time prizes because those can be awarded automatically
-- on the day the platform launches. Admins can replace any slot with a
-- physical prize or airtime from the Rewards screen.
-- ---------------------------------------------------------------------------

insert into public.reward_catalog (name, description, reward_type, reward_days, value_birr, sort_order) values
  ('Champion — 1 month premium', 'Awarded to the week''s top student.',        'premium_days', 30, 50.00, 1),
  ('Runner-up — 2 weeks premium','Awarded to second and third place.',         'premium_days', 14, 25.00, 2),
  ('Top ten — 1 week premium',   'Awarded to places four through ten.',        'premium_days', 7,  12.50, 3)
on conflict do nothing;

do $$
declare
  v_first  uuid;
  v_second uuid;
  v_third  uuid;
  i integer;
begin
  select id into v_first  from public.reward_catalog where name = 'Champion — 1 month premium';
  select id into v_second from public.reward_catalog where name = 'Runner-up — 2 weeks premium';
  select id into v_third  from public.reward_catalog where name = 'Top ten — 1 week premium';

  if v_first is null then return; end if;

  insert into public.weekly_reward_slots (rank, reward_id) values (1, v_first)
  on conflict (rank) do nothing;

  for i in 2..3 loop
    insert into public.weekly_reward_slots (rank, reward_id) values (i, v_second)
    on conflict (rank) do nothing;
  end loop;

  for i in 4..10 loop
    insert into public.weekly_reward_slots (rank, reward_id) values (i, v_third)
    on conflict (rank) do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Support contacts (spec sections 4 and 5)
--
-- These are starting values, not constants: every one of them is editable from
-- Admin -> Contacts.
-- ---------------------------------------------------------------------------

insert into public.contact_phones (phone, label, purpose, sort_order) values
  ('0982395841',    'Support',     'General help, complaints and account problems', 1),
  ('+251944046611', 'Suggestions', 'Feature requests and feedback',                 2)
on conflict (phone) do nothing;

insert into public.contact_emails (email, label, purpose, sort_order) values
  ('keleme2026@gmail.com', 'General',    'Main contact address',        1),
  ('lewiterefe@gmail.com', 'Operations', 'Partnerships and operations', 2),
  ('dsemere737@gmail.com', 'Support',    'Technical support',           3)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Subjects, grades 9-12
--
-- A starting syllabus skeleton so the admin content screens are never staring
-- at an empty database on day one. Admins add, rename and reorder freely.
-- ---------------------------------------------------------------------------

do $$
declare
  v_grade smallint;
  v_subject record;
begin
  for v_grade in 9..12 loop
    for v_subject in
      select * from (values
        ('Mathematics',  'mathematics',  'calculator',   '#2563eb', 1),
        ('Physics',      'physics',      'atom',         '#7c3aed', 2),
        ('Chemistry',    'chemistry',    'flask-conical','#0891b2', 3),
        ('Biology',      'biology',      'leaf',         '#16a34a', 4),
        ('English',      'english',      'languages',    '#db2777', 5),
        ('Geography',    'geography',    'globe',        '#ca8a04', 6),
        ('History',      'history',      'landmark',     '#b45309', 7),
        ('Citizenship',  'citizenship',  'scale',        '#475569', 8),
        ('Economics',    'economics',    'trending-up',  '#059669', 9),
        ('ICT',          'ict',          'cpu',          '#4f46e5', 10)
      ) as t(name, slug, icon_key, color, sort_order)
    loop
      insert into public.subjects (grade, name, slug, icon_key, color, sort_order)
      values (v_grade, v_subject.name, v_subject.slug, v_subject.icon_key, v_subject.color, v_subject.sort_order)
      on conflict (grade, slug) do nothing;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Matric years
-- ---------------------------------------------------------------------------

insert into public.matric_years (year, label, sort_order) values
  (2016, '2016 E.C.', 1),
  (2015, '2015 E.C.', 2),
  (2014, '2014 E.C.', 3),
  (2013, '2013 E.C.', 4)
on conflict (year) do nothing;
