-- =============================================================================
-- KELEME — 0018 Retention for high-churn tables
--
-- Found while load testing: `study_sessions` gained 89,000 rows and 20MB from
-- a twenty-second write test, and nothing ever removes them. One row is
-- created per study session per student per day, so at 10,000 daily active
-- students that is ~3.6M rows and roughly 800MB a year — for data whose only
-- purpose is to hold the heartbeat's running total while a session is open.
--
-- The durable record of study time is `daily_activity`, which is one row per
-- student per DAY and is what every report and the leaderboard actually read.
-- Closed study sessions older than the retention window are working state that
-- has already been folded into it.
--
-- `user_sessions` has the same shape: revoked device sessions are kept so a
-- student can see recent devices, not forever.
--
-- Nothing here touches daily_activity, profiles, payments, entitlements or
-- audit_logs. Those are the record.
-- =============================================================================

create or replace function public.prune_old_sessions(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_days     integer := greatest(7, least(coalesce(p_days, 30), 365));
  v_cutoff   timestamptz := now() - make_interval(days => v_days);
  v_study    bigint;
  v_devices  bigint;
begin
  -- Callable by an admin from the dashboard, or by the service role from a
  -- scheduled job. Never by a student.
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Only CLOSED sessions, and only ones older than the window. An open session
  -- belongs to someone who may still be studying right now.
  delete from public.study_sessions
  where ended_at is not null and ended_at < v_cutoff;
  get diagnostics v_study = row_count;

  delete from public.user_sessions
  where revoked_at is not null and revoked_at < v_cutoff;
  get diagnostics v_devices = row_count;

  perform public.write_audit_log('maintenance.pruned_sessions', null, null,
    jsonb_build_object('days', v_days, 'study_sessions', v_study, 'user_sessions', v_devices));

  return jsonb_build_object(
    'study_sessions_deleted', v_study,
    'user_sessions_deleted', v_devices,
    'cutoff', v_cutoff
  );
end;
$$;

comment on function public.prune_old_sessions is
  'Deletes closed study sessions and revoked device sessions older than N days. Working state only — daily_activity, the durable record of study time, is never touched. Run monthly; see docs/CAPACITY.md.';

grant execute on function public.prune_old_sessions(integer) to authenticated;

-- Supports the delete above, and the "close anything gone quiet" sweep that
-- record_heartbeat runs on every beat.
create index if not exists study_sessions_ended_idx
  on public.study_sessions (ended_at)
  where ended_at is not null;
