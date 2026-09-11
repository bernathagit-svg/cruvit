-- CRUVIT Garden OS Spine V1 (Owner-approved final architecture — apply via normal migration path)
-- Additive only:
--   1) public.garden_events — append-oriented durable garden/plant history
--      (optional plant + task + causal parent + correlation episode)
--   2) nullable garden_tasks.source_module + garden_tasks.task_type
-- TEXT fields + app contracts (no PostgreSQL ENUM types).
-- Closed-loop: task_completed ≠ task_outcome_reported (user outcome evidence).
-- Recommendation lifecycle: generated ≠ accepted ≠ rejected ≠ task_created.
-- Learning safety: garden/plant evidence only — never global catalog truth in Spine V1.
-- Plant Doctor / module writers are NOT wired in this draft.

-- ---------------------------------------------------------------------------
-- garden_tasks provenance (nullable; historical rows stay NULL)
-- ---------------------------------------------------------------------------
alter table public.garden_tasks
  add column if not exists source_module text;

alter table public.garden_tasks
  add column if not exists task_type text;

comment on column public.garden_tasks.source_module is
  'Optional module provenance (my_garden|plant_doctor|…). NULL = legacy/unknown. Validated by app contract.';

comment on column public.garden_tasks.task_type is
  'Optional task kind (care|doctor|weather|seasonal|…). NULL = legacy/unknown. Validated by app contract.';

-- ---------------------------------------------------------------------------
-- garden_events
-- ---------------------------------------------------------------------------
create table if not exists public.garden_events (
  id uuid primary key default gen_random_uuid(),
  garden_profile_id uuid not null references public.garden_profiles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Optional plant in the SAME garden. Parent garden delete cascades events.
  -- Plant delete detaches history (SET NULL) so garden-level history survives.
  garden_plant_id uuid references public.garden_plants (id) on delete set null,
  -- Optional task link for closed-loop evidence (completion vs outcome).
  -- Task delete detaches the FK (SET NULL); payload/history remains intact.
  garden_task_id uuid references public.garden_tasks (id) on delete set null,
  -- Direct causal parent in the SAME garden (optional). Parent delete detaches link.
  caused_by_event_id uuid references public.garden_events (id) on delete set null,
  -- Shared episode / decision chain id (optional; not unique).
  correlation_id text,
  -- Payload contract generation; old rows stay readable as contracts evolve.
  schema_version smallint not null default 1,
  event_type text not null,
  source_module text not null,
  client_event_id text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint garden_events_event_type_not_blank check (char_length(trim(event_type)) > 0),
  constraint garden_events_source_module_not_blank check (char_length(trim(source_module)) > 0),
  constraint garden_events_client_event_id_not_blank check (char_length(trim(client_event_id)) > 0),
  constraint garden_events_payload_object_chk check (jsonb_typeof(payload) = 'object'),
  constraint garden_events_schema_version_positive check (schema_version >= 1),
  constraint garden_events_correlation_id_not_blank check (
    correlation_id is null or char_length(trim(correlation_id)) > 0
  ),
  -- Idempotent retries: same garden + client_event_id = one row.
  constraint garden_events_garden_client_uidx unique (garden_profile_id, client_event_id)
);

comment on table public.garden_events is
  'Append-oriented owned garden/plant history. SELECT+INSERT only. Causal chains via caused_by_event_id + correlation_id. task_completed is not treatment success; recommendation_generated is not acceptance.';

comment on column public.garden_events.garden_task_id is
  'Optional garden_tasks link. ON DELETE SET NULL preserves event payload after task removal.';

comment on column public.garden_events.caused_by_event_id is
  'Optional direct causal parent event (same garden). ON DELETE SET NULL.';

comment on column public.garden_events.correlation_id is
  'Optional shared episode/decision chain id across related events.';

comment on column public.garden_events.schema_version is
  'Payload/contract generation. Default 1. App validates supported versions.';

-- Expected reads: garden/plant/task timelines, causal children, episode chains, idempotency.
create index if not exists garden_events_garden_occurred_idx
  on public.garden_events (garden_profile_id, occurred_at desc);

create index if not exists garden_events_plant_occurred_idx
  on public.garden_events (garden_plant_id, occurred_at desc);

create index if not exists garden_events_task_occurred_idx
  on public.garden_events (garden_task_id, occurred_at desc);

create index if not exists garden_events_caused_by_idx
  on public.garden_events (caused_by_event_id, occurred_at desc)
  where caused_by_event_id is not null;

create index if not exists garden_events_garden_correlation_idx
  on public.garden_events (garden_profile_id, correlation_id, occurred_at desc)
  where correlation_id is not null;

create index if not exists garden_events_user_id_idx
  on public.garden_events (user_id);

-- Keep user_id aligned with owning garden; enforce plant/task/causal same-garden.
create or replace function public.enforce_garden_event_ownership()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  owner_id uuid;
  plant_garden_id uuid;
  task_garden_id uuid;
  parent_garden_id uuid;
begin
  -- Append-only: reject UPDATE attempts at the trigger layer as defense-in-depth
  -- (RLS also omits UPDATE/DELETE policies).
  if tg_op = 'UPDATE' then
    raise exception 'garden_event_immutable';
  end if;

  select g.user_id into owner_id
  from public.garden_profiles g
  where g.id = new.garden_profile_id;

  if owner_id is null then
    raise exception 'garden_event_garden_not_found';
  end if;

  if new.garden_plant_id is not null then
    select p.garden_profile_id into plant_garden_id
    from public.garden_plants p
    where p.id = new.garden_plant_id;

    if plant_garden_id is null then
      raise exception 'garden_event_plant_not_found';
    end if;

    if plant_garden_id is distinct from new.garden_profile_id then
      raise exception 'garden_event_plant_garden_mismatch';
    end if;
  end if;

  if new.garden_task_id is not null then
    select t.garden_profile_id into task_garden_id
    from public.garden_tasks t
    where t.id = new.garden_task_id;

    if task_garden_id is null then
      raise exception 'garden_event_task_not_found';
    end if;

    if task_garden_id is distinct from new.garden_profile_id then
      raise exception 'garden_event_task_garden_mismatch';
    end if;
  end if;

  if new.caused_by_event_id is not null then
    if new.caused_by_event_id = new.id then
      raise exception 'garden_event_causal_self_ref';
    end if;

    select e.garden_profile_id into parent_garden_id
    from public.garden_events e
    where e.id = new.caused_by_event_id;

    if parent_garden_id is null then
      raise exception 'garden_event_causal_parent_not_found';
    end if;

    if parent_garden_id is distinct from new.garden_profile_id then
      raise exception 'garden_event_causal_garden_mismatch';
    end if;
  end if;

  new.user_id := owner_id;
  new.event_type := trim(new.event_type);
  new.source_module := trim(new.source_module);
  new.client_event_id := trim(new.client_event_id);
  if new.correlation_id is not null then
    new.correlation_id := trim(new.correlation_id);
    if char_length(new.correlation_id) = 0 then
      new.correlation_id := null;
    end if;
  end if;
  if new.schema_version is null then
    new.schema_version := 1;
  end if;
  if new.payload is null then
    new.payload := '{}'::jsonb;
  end if;
  if new.occurred_at is null then
    new.occurred_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists garden_events_enforce_ownership on public.garden_events;
create trigger garden_events_enforce_ownership
  before insert or update on public.garden_events
  for each row
  execute function public.enforce_garden_event_ownership();

alter table public.garden_events enable row level security;
alter table public.garden_events force row level security;

-- Append-only for authenticated clients: SELECT + INSERT own rows only.
-- No UPDATE / DELETE policies (mutable history forbidden).
-- Parent garden DELETE cascades child events (safe ownership wipe).

drop policy if exists garden_events_select_own on public.garden_events;
create policy garden_events_select_own
  on public.garden_events
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.garden_profiles g
      where g.id = garden_events.garden_profile_id
        and g.user_id = (select auth.uid())
    )
  );

drop policy if exists garden_events_insert_own on public.garden_events;
create policy garden_events_insert_own
  on public.garden_events
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.garden_profiles g
      where g.id = garden_profile_id
        and g.user_id = (select auth.uid())
    )
  );

revoke all on table public.garden_events from anon;
grant select, insert on table public.garden_events to authenticated;
-- Intentionally no grant of update/delete to authenticated.
