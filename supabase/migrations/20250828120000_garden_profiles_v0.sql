-- CRUVIT Garden Profile V0 — authenticated ownership boundary
-- Apply in Supabase SQL editor or via Supabase CLI migrate.

create table if not exists public.garden_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'My Garden',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint garden_profiles_name_not_blank check (char_length(trim(name)) > 0)
);

create index if not exists garden_profiles_user_id_idx
  on public.garden_profiles (user_id);

create or replace function public.set_garden_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists garden_profiles_set_updated_at on public.garden_profiles;
create trigger garden_profiles_set_updated_at
  before update on public.garden_profiles
  for each row
  execute function public.set_garden_profiles_updated_at();

create or replace function public.prevent_garden_profile_owner_change()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'garden_profile_owner_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists garden_profiles_prevent_owner_change on public.garden_profiles;
create trigger garden_profiles_prevent_owner_change
  before update on public.garden_profiles
  for each row
  execute function public.prevent_garden_profile_owner_change();

alter table public.garden_profiles enable row level security;
alter table public.garden_profiles force row level security;

drop policy if exists garden_profiles_select_own on public.garden_profiles;
create policy garden_profiles_select_own
  on public.garden_profiles
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists garden_profiles_insert_own on public.garden_profiles;
create policy garden_profiles_insert_own
  on public.garden_profiles
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists garden_profiles_update_own on public.garden_profiles;
create policy garden_profiles_update_own
  on public.garden_profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists garden_profiles_delete_own on public.garden_profiles;
create policy garden_profiles_delete_own
  on public.garden_profiles
  for delete
  to authenticated
  using (user_id = auth.uid());
