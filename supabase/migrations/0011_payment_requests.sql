-- =============================================================================
-- KELEME — 0011 Plan requests and manual payment confirmation
--
-- No payment provider is connected in this release (spec section 28 is
-- explicit that faking one is not acceptable). What ships instead is the real
-- workflow the team can operate on day one:
--
--   1. A student requests a plan. That creates a `pending` payment row with
--      the amount read FROM THE PLAN, never from the request.
--   2. They pay through whatever channel the team already uses, quoting the
--      reference shown on screen.
--   3. An admin confirms it in Admin -> Payments, which is the only thing that
--      creates an entitlement.
--
-- When a provider is integrated later, its webhook calls
-- `confirm_payment` with a provider reference and nothing else about this
-- design changes — the entitlement path is already correct and idempotent.
-- =============================================================================

create or replace function public.request_plan(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan     public.plans;
  v_user     uuid := auth.uid();
  v_existing public.payments;
  v_id       uuid;
  v_grade    smallint;
begin
  if v_user is null or not public.is_active_account() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_plan from public.plans where id = p_plan_id and is_active;
  if v_plan.id is null then
    raise exception 'plan_not_available';
  end if;

  -- The matric package is a grade 12 product. Selling it to a grade 9 student
  -- would take money for something they can never use.
  if v_plan.kind = 'matric' then
    select grade into v_grade from public.profiles where id = v_user;
    if v_grade <> 12 then
      raise exception 'matric_plan_requires_grade_12';
    end if;
  end if;

  -- Reuse an outstanding request for the same plan rather than stacking up a
  -- row per impatient tap, so the student keeps one reference to quote.
  select * into v_existing
  from public.payments
  where user_id = v_user and plan_id = p_plan_id and status = 'pending'
  order by created_at desc
  limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'payment_id', v_existing.id,
      'reference', upper(replace(v_existing.id::text, '-', '')::text),
      'amount', v_existing.amount,
      'plan_name', v_plan.name,
      'reused', true
    );
  end if;

  insert into public.payments (user_id, plan_id, provider, amount, currency, status)
  values (v_user, p_plan_id, 'manual', v_plan.price, v_plan.currency, 'pending')
  returning id into v_id;

  return jsonb_build_object(
    'payment_id', v_id,
    -- A short, quotable reference. Derived from the id so support can find the
    -- row from what the student reads out over the phone.
    'reference', upper(replace(v_id::text, '-', '')::text),
    'amount', v_plan.price,
    'plan_name', v_plan.name,
    'reused', false
  );
end;
$$;

-- The one function that turns money into access. Idempotent: confirming an
-- already-paid payment returns its existing entitlement rather than granting a
-- second one, which is what makes a replayed provider webhook harmless.
create or replace function public.confirm_payment(
  p_payment_id uuid,
  p_provider_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payments;
  v_plan    public.plans;
  v_ent     uuid;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'payment_not_found';
  end if;

  if v_payment.status = 'paid' then
    select id into v_ent from public.user_entitlements where payment_id = p_payment_id limit 1;
    return v_ent;
  end if;

  select * into v_plan from public.plans where id = v_payment.plan_id;
  if v_plan.id is null then
    raise exception 'plan_missing';
  end if;

  update public.payments
  set status = 'paid',
      paid_at = now(),
      provider_reference = coalesce(p_provider_reference, provider_reference)
  where id = p_payment_id;

  v_ent := public.grant_entitlement(
    v_payment.user_id,
    case when v_plan.kind = 'matric' then 'matric' else 'premium' end::public.entitlement_kind,
    v_plan.duration_days,
    'purchase',
    v_plan.id,
    p_payment_id,
    v_plan.name
  );

  return v_ent;
end;
$$;

-- Admin-facing wrapper: authorization plus the audit trail.
create or replace function public.admin_confirm_payment(p_payment_id uuid, p_reference text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ent uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_ent := public.confirm_payment(p_payment_id, p_reference);
  perform public.write_audit_log('payment.confirmed', 'payments', p_payment_id::text,
    jsonb_build_object('reference', p_reference, 'entitlement_id', v_ent));
  return v_ent;
end;
$$;

create or replace function public.admin_reject_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.payments
  set status = 'cancelled', failure_reason = p_reason
  where id = p_payment_id and status = 'pending';

  perform public.write_audit_log('payment.rejected', 'payments', p_payment_id::text,
    jsonb_build_object('reason', p_reason));
end;
$$;

grant execute on function public.request_plan(uuid) to authenticated;
grant execute on function public.admin_confirm_payment(uuid, text) to authenticated;
grant execute on function public.admin_reject_payment(uuid, text) to authenticated;
-- confirm_payment itself is reachable only by the service role (the future
-- provider webhook) and by admin_confirm_payment above.
revoke execute on function public.confirm_payment(uuid, text) from public, anon, authenticated;
