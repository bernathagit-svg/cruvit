-- CRUVIT Garden Plants Persistence V1
-- Owned child rows under garden_profiles. Plants ONLY — no tasks/photos/events.
-- Do not apply live until Owner review.

create table if not exists public.garden_plants (
  id uuid primary key default gen_random_uuid(),
  garden_profile_id uuid not null references public.garden_profiles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  client_instance_id text not null,
  name text not null,
  status text not null default 'Healthy',
  mark text not null default '✓',
  source text not null default 'My Garden',
  profile_slug text,
  scientific text,
  archived boolean not null default false,
  prefs jsonb not null default '{"autoTasks":true,"reminders":true,"alerts":true}'::jsonb,
  added_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint garden_plants_name_not_blank check (char_length(trim(name)) > 0),
  constraint garden_plants_client_instance_id_not_blank check (char_length(trim(client_instance_id)) > 0),
  constraint garden_plants_mark_chk check (mark in ('✓', '!')),
  constraint garden_plants_garden_client_uidx unique (garden_profile_id, client_instance_id)
);

create index if not exists garden_plants_user_id_idx
  on public.garden_plants (user_id);

create index if not exists garden_plants_garden_profile_id_idx
  on public.garden_plants (garden_profile_id);

create index if not exists garden_plants_garden_updated_idx
  on public.garden_plants (garden_profile_id, updated_at desc);

-- Keep user_id aligned with owning garden_profiles.user_id (prevents spoof / cross-garden moves).
create or replace function public.enforce_garden_plant_ownership()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  owner_id uuid;
begin
  select g.user_id into owner_id
  from public.garden_profiles g
  where g.id = new.garden_profile_id;

  if owner_id is null then
    raise exception 'garden_plant_garden_not_found';
  end if;

  if tg_op = 'UPDATE'
     and new.garden_profile_id is distinct from old.garden_profile_id then
    -- Moving between gardens: destination must exist (selected above) and caller RLS must own it.
    null;
  end if;

  new.user_id := owner_id;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists garden_plants_enforce_ownership on public.garden_plants;
create trigger garden_plants_enforce_ownership
  before insert or update on public.garden_plants
  for each row
  execute function public.enforce_garden_plant_ownership();

create or replace function public.set_garden_plants_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists garden_plants_set_updated_at on public.garden_plants;
create trigger garden_plants_set_updated_at
  before update on public.garden_plants
  for each row
  execute function public.set_garden_plants_updated_at();

alter table public.garden_plants enable row level security;
alter table public.garden_plants force row level security;

drop policy if exists garden_plants_select_own on public.garden_plants;
create policy garden_plants_select_own
  on public.garden_plants
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.garden_profiles g
      where g.id = garden_profile_id
        and g.user_id = (select auth.uid())
    )
  );

drop policy if exists garden_plants_insert_own on public.garden_plants;
create policy garden_plants_insert_own
  on public.garden_plants
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

drop policy if exists garden_plants_update_own on public.garden_plants;
create policy garden_plants_update_own
  on public.garden_plants
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.garden_profiles g
      where g.id = garden_profile_id
        and g.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.garden_profiles g
      where g.id = garden_profile_id
        and g.user_id = (select auth.uid())
    )
  );

drop policy if exists garden_plants_delete_own on public.garden_plants;
create policy garden_plants_delete_own
  on public.garden_plants
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.garden_profiles g
      where g.id = garden_profile_id
        and g.user_id = (select auth.uid())
    )
  );

revoke all on table public.garden_plants from anon;
grant select, insert, update, delete on table public.garden_plants to authenticated;
