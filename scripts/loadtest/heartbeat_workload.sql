-- pgbench script: the heartbeat alone.
--
-- This is the highest-frequency write in the system — one per active student
-- per minute — so its throughput ceiling is what caps concurrent studying.
\set student random(1, 100000)

begin;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-8000-' || lpad(:student::text, 12, '0'),
                    'role', 'authenticated')::text, true);
set local role authenticated;
select public.record_heartbeat(null);
commit;
