-- CRUVIT Garden Tasks Persistence V1
-- Owned child rows under garden_profiles. Tasks ONLY — no events, media, or Garden Memory.
-- Do not apply live until Owner review.

create table if not exists public.garden_tasks (
  id uuid primary key default gen_random_uuid(),
  garden_profile_id uuid not null references public.garden_profiles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  client_instance_id text not null,
  -- Optional FK to server plant in the SAME garden.
  -- ON DELETE SET NULL detaches completed tasks (done=true) so history/plant_name survive.
  -- Open linked tasks (done=false) are deleted first by
  -- public.delete_open_garden_tasks_for_deleted_plant() BEFORE DELETE on garden_plants.
  garden_plant_id uuid references public.garden_plants (id) on delete set null,
  icon text not null default '🌿',
  title text not null,
  when_label text not null default 'This week',
  priority text not null default 'Low',
  due_on date,
  auto_generated boolean not null default false,
  plant_name text,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint garden_tasks_title_not_blank check (char_length(trim(title)) > 0),
  constraint garden_tasks_client_instance_id_not_blank check (char_length(trim(client_instance_id)) > 0),
  constraint garden_tasks_priority_chk check (priority in ('High', 'Medium', 'Low')),
  constraint garden_tasks_garden_client_uidx unique (garden_profile_id, client_instance_id)
);

create index if not exists garden_tasks_user_id_idx
  on public.garden_tasks (user_id);

create index if not exists garden_tasks_garden_profile_id_idx
  on public.garden_tasks (garden_profile_id);

create index if not exists garden_tasks_garden_plant_id_idx
  on public.garden_tasks (garden_plant_id);

create index if not exists garden_tasks_garden_updated_idx
  on public.garden_tasks (garden_profile_id, updated_at desc);

-- Keep user_id aligned with owning garden; enforce plant FK same-garden.
create or replace function public.enforce_garden_task_ownership()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  owner_id uuid;
  plant_garden_id uuid;
begin
  select g.user_id into owner_id
  from public.garden_profiles g
  where g.id = new.garden_profile_id;

  if owner_id is null then
    raise exception 'garden_task_garden_not_found';
  end if;

  if new.garden_plant_id is not null then
    select p.garden_profile_id into plant_garden_id
    from public.garden_plants p
    where p.id = new.garden_plant_id;

    if plant_garden_id is null then
      raise exception 'garden_task_plant_not_found';
    end if;

    if plant_garden_id is distinct from new.garden_profile_id then
      raise exception 'garden_task_plant_garden_mismatch';
    end if;
  end if;

  new.user_id := owner_id;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists garden_tasks_enforce_ownership on public.garden_tasks;
create trigger garden_tasks_enforce_ownership
  before insert or update on public.garden_tasks
  for each row
  execute function public.enforce_garden_task_ownership();

create or replace function public.set_garden_tasks_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists garden_tasks_set_updated_at on public.garden_tasks;
create trigger garden_tasks_set_updated_at
  before update on public.garden_tasks
  for each row
  execute function public.set_garden_tasks_updated_at();

-- Product invariant on plant delete (server-side, not frontend-ordered):
-- open (done=false) tasks linked to the plant are removed;
-- completed (done=true) tasks remain and garden_plant_id is SET NULL by FK.
create or replace function public.delete_open_garden_tasks_for_deleted_plant()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  delete from public.garden_tasks t
  where t.garden_plant_id = old.id
    and t.done = false;
  return old;
end;
$$;

drop trigger if exists garden_plants_delete_open_tasks on public.garden_plants;
create trigger garden_plants_delete_open_tasks
  before delete on public.garden_plants
  for each row
  execute function public.delete_open_garden_tasks_for_deleted_plant();

alter table public.garden_tasks enable row level security;
alter table public.garden_tasks force row level security;

drop policy if exists garden_tasks_select_own on public.garden_tasks;
create policy garden_tasks_select_own
  on public.garden_tasks
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

drop policy if exists garden_tasks_insert_own on public.garden_tasks;
create policy garden_tasks_insert_own
  on public.garden_tasks
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

drop policy if exists garden_tasks_update_own on public.garden_tasks;
create policy garden_tasks_update_own
  on public.garden_tasks
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

drop policy if exists garden_tasks_delete_own on public.garden_tasks;
create policy garden_tasks_delete_own
  on public.garden_tasks
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

revoke all on table public.garden_tasks from anon;
grant select, insert, update, delete on table public.garden_tasks to authenticated;
