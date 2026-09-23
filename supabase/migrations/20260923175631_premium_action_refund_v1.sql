-- CRUVIT Premium Action Refund V1
-- Live migration version: 20260923175631_premium_action_refund_v1
-- Applied to cruvit-production / saiuscqbszafszpdmzfl.
-- One idempotent refund per successful Natural Blend+ consume.

alter table public.premium_action_events
  add column if not exists related_idempotency_key text;

create unique index if not exists premium_action_events_refund_once_uidx
  on public.premium_action_events (user_id, feature, related_idempotency_key)
  where event_kind = 'refund' and related_idempotency_key is not null;

create or replace function public.refund_premium_action(
  p_feature text,
  p_consume_idempotency_key text,
  p_refund_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_ent public.premium_action_entitlements%rowtype;
  v_consume public.premium_action_events%rowtype;
  v_existing_refund public.premium_action_events%rowtype;
  v_new_balance integer;
  v_daily_used integer;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  if p_feature is null or trim(p_feature) <> 'natural_blend' then
    return jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_FEATURE');
  end if;

  if p_consume_idempotency_key is null
     or char_length(trim(p_consume_idempotency_key)) < 8
     or p_refund_idempotency_key is null
     or char_length(trim(p_refund_idempotency_key)) < 8 then
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_KEY_REQUIRED');
  end if;

  select * into v_consume
  from public.premium_action_events
  where user_id = v_user
    and feature = 'natural_blend'
    and event_kind = 'consume'
    and idempotency_key = trim(p_consume_idempotency_key)
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'CONSUME_NOT_FOUND');
  end if;

  select * into v_existing_refund
  from public.premium_action_events
  where user_id = v_user
    and feature = 'natural_blend'
    and event_kind = 'refund'
    and related_idempotency_key = trim(p_consume_idempotency_key)
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_REFUNDED',
      'remaining', v_existing_refund.balance_after,
      'consumeIdempotencyKey', trim(p_consume_idempotency_key),
      'refundIdempotencyKey', v_existing_refund.idempotency_key
    );
  end if;

  select * into v_ent
  from public.premium_action_entitlements
  where user_id = v_user
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_ENTITLED');
  end if;

  select * into v_existing_refund
  from public.premium_action_events
  where user_id = v_user
    and feature = 'natural_blend'
    and event_kind = 'refund'
    and related_idempotency_key = trim(p_consume_idempotency_key)
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_REFUNDED',
      'remaining', v_existing_refund.balance_after,
      'consumeIdempotencyKey', trim(p_consume_idempotency_key),
      'refundIdempotencyKey', v_existing_refund.idempotency_key
    );
  end if;

  v_new_balance := v_ent.natural_blend_remaining + 1;
  v_daily_used := case
    when v_ent.natural_blend_daily_date = current_date
      then greatest(0, v_ent.natural_blend_daily_used - 1)
    else v_ent.natural_blend_daily_used
  end;

  update public.premium_action_entitlements
  set natural_blend_remaining = v_new_balance,
      natural_blend_daily_used = v_daily_used,
      updated_at = now()
  where user_id = v_user;

  insert into public.premium_action_events (
    user_id,
    feature,
    event_kind,
    delta_units,
    balance_after,
    idempotency_key,
    related_idempotency_key,
    metadata
  ) values (
    v_user,
    'natural_blend',
    'refund',
    1,
    v_new_balance,
    trim(p_refund_idempotency_key),
    trim(p_consume_idempotency_key),
    jsonb_build_object('source', 'refund_premium_action_v1')
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'REFUNDED',
    'remaining', v_new_balance,
    'dailyUsed', v_daily_used,
    'consumeIdempotencyKey', trim(p_consume_idempotency_key),
    'refundIdempotencyKey', trim(p_refund_idempotency_key)
  );
end;
$$;

revoke all on function public.refund_premium_action(text, text, text) from public, anon;
grant execute on function public.refund_premium_action(text, text, text) to authenticated;
