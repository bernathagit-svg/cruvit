-- CRUVIT Premium Action Entitlements V1
-- Live migration version: 20260923175148_premium_action_entitlements_v1
-- Applied to cruvit-production / saiuscqbszafszpdmzfl.
-- Server-authoritative paid-action quota. Default deny.

create table if not exists public.premium_action_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  natural_blend_enabled boolean not null default false,
  natural_blend_remaining integer not null default 0,
  natural_blend_daily_limit integer not null default 0,
  natural_blend_daily_used integer not null default 0,
  natural_blend_daily_date date not null default current_date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint premium_action_entitlements_remaining_chk check (natural_blend_remaining >= 0),
  constraint premium_action_entitlements_daily_limit_chk check (natural_blend_daily_limit >= 0),
  constraint premium_action_entitlements_daily_used_chk check (natural_blend_daily_used >= 0),
  constraint premium_action_entitlements_metadata_object_chk check (jsonb_typeof(metadata) = 'object')
);

comment on table public.premium_action_entitlements is
  'Server-authoritative paid-action entitlement state. No browser writes. Default deny.';

alter table public.premium_action_entitlements enable row level security;
alter table public.premium_action_entitlements force row level security;

drop policy if exists premium_action_entitlements_select_own on public.premium_action_entitlements;
create policy premium_action_entitlements_select_own
  on public.premium_action_entitlements
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.premium_action_entitlements from anon, authenticated;
grant select on table public.premium_action_entitlements to authenticated;

create table if not exists public.premium_action_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  event_kind text not null,
  delta_units integer not null,
  balance_after integer not null,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint premium_action_events_feature_chk check (feature in ('natural_blend')),
  constraint premium_action_events_kind_chk check (event_kind in ('grant','consume','refund','adjustment')),
  constraint premium_action_events_delta_chk check (delta_units <> 0),
  constraint premium_action_events_balance_chk check (balance_after >= 0),
  constraint premium_action_events_idempotency_not_blank check (char_length(trim(idempotency_key)) > 0),
  constraint premium_action_events_metadata_object_chk check (jsonb_typeof(metadata) = 'object'),
  constraint premium_action_events_idempotency_uidx unique (user_id, feature, idempotency_key)
);

comment on table public.premium_action_events is
  'Append-only server-authoritative paid-action ledger. Users may read own events only.';

create index if not exists premium_action_events_user_created_idx
  on public.premium_action_events (user_id, created_at desc);

alter table public.premium_action_events enable row level security;
alter table public.premium_action_events force row level security;

drop policy if exists premium_action_events_select_own on public.premium_action_events;
create policy premium_action_events_select_own
  on public.premium_action_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.premium_action_events from anon, authenticated;
grant select on table public.premium_action_events to authenticated;

create or replace function public.consume_premium_action(
  p_feature text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_ent public.premium_action_entitlements%rowtype;
  v_existing public.premium_action_events%rowtype;
  v_daily_used integer;
  v_new_balance integer;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;

  if p_feature is null or trim(p_feature) <> 'natural_blend' then
    return jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_FEATURE');
  end if;

  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) < 8 then
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_KEY_REQUIRED');
  end if;

  select *
    into v_existing
  from public.premium_action_events
  where user_id = v_user
    and feature = 'natural_blend'
    and idempotency_key = trim(p_idempotency_key)
    and event_kind = 'consume'
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_CONSUMED',
      'remaining', v_existing.balance_after,
      'idempotencyKey', v_existing.idempotency_key
    );
  end if;

  select *
    into v_ent
  from public.premium_action_entitlements
  where user_id = v_user
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_ENTITLED');
  end if;

  select *
    into v_existing
  from public.premium_action_events
  where user_id = v_user
    and feature = 'natural_blend'
    and idempotency_key = trim(p_idempotency_key)
    and event_kind = 'consume'
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_CONSUMED',
      'remaining', v_existing.balance_after,
      'idempotencyKey', v_existing.idempotency_key
    );
  end if;

  if v_ent.natural_blend_enabled is not true then
    return jsonb_build_object('ok', false, 'code', 'FEATURE_DISABLED');
  end if;

  v_daily_used := case
    when v_ent.natural_blend_daily_date = current_date then v_ent.natural_blend_daily_used
    else 0
  end;

  if v_ent.natural_blend_remaining < 1 then
    return jsonb_build_object(
      'ok', false,
      'code', 'QUOTA_EXHAUSTED',
      'remaining', v_ent.natural_blend_remaining
    );
  end if;

  if v_ent.natural_blend_daily_limit > 0
     and v_daily_used >= v_ent.natural_blend_daily_limit then
    return jsonb_build_object(
      'ok', false,
      'code', 'DAILY_LIMIT_REACHED',
      'remaining', v_ent.natural_blend_remaining,
      'dailyUsed', v_daily_used,
      'dailyLimit', v_ent.natural_blend_daily_limit
    );
  end if;

  v_new_balance := v_ent.natural_blend_remaining - 1;

  update public.premium_action_entitlements
  set natural_blend_remaining = v_new_balance,
      natural_blend_daily_used = v_daily_used + 1,
      natural_blend_daily_date = current_date,
      updated_at = now()
  where user_id = v_user;

  insert into public.premium_action_events (
    user_id,
    feature,
    event_kind,
    delta_units,
    balance_after,
    idempotency_key,
    metadata
  ) values (
    v_user,
    'natural_blend',
    'consume',
    -1,
    v_new_balance,
    trim(p_idempotency_key),
    jsonb_build_object('source', 'consume_premium_action_v1')
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'CONSUMED',
    'remaining', v_new_balance,
    'dailyUsed', v_daily_used + 1,
    'dailyLimit', v_ent.natural_blend_daily_limit,
    'idempotencyKey', trim(p_idempotency_key)
  );
end;
$$;

revoke all on function public.consume_premium_action(text, text) from public, anon;
grant execute on function public.consume_premium_action(text, text) to authenticated;
