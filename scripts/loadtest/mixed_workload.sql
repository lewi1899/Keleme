-- pgbench script: one student's page view.
--
-- Mirrors what a real navigation costs — the session context every page needs,
-- the dashboard's own reads, and a heartbeat. Each transaction picks a random
-- student and adopts their identity, so RLS is exercised across the whole user
-- base rather than one warm row.
\set student random(1, 100000)

begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-8000-' || lpad(:student::text, 12, '0'),
                    'role', 'authenticated')::text, true);
set local role authenticated;

select public.get_session_context(null);

select coalesce(sum(seconds), 0) from public.daily_activity
where user_id = ('00000000-0000-4000-8000-' || lpad(:student::text, 12, '0'))::uuid
  and activity_date >= current_date - 7;

select cp.content_id, cp.last_opened_at
from public.content_progress cp
where cp.user_id = ('00000000-0000-4000-8000-' || lpad(:student::text, 12, '0'))::uuid
order by cp.last_opened_at desc limit 4;

select * from public.subjects where is_active order by sort_order;

commit;
