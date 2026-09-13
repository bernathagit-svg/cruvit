-- CRUVIT Garden Areas / Microclimate V1
-- Additive owned child table under garden_profiles + optional plant link.
-- OWNER REVIEW REQUIRED before apply — do not apply silently.
--
-- Design decisions:
-- 1) context jsonb stores GCP-aligned site fields + provenance
--    (source, confirmationStatus, confidence, precisionLevel, unknownReasons,
--     contractVersion / schema). Bounded columns avoided for V1; validation in
--     garden-areas-v1-contract.js via normalizeAreaContext on every read/write.
-- 2) SQL enforces context is a JSON object only (not array/scalar). App vocab
--    is NOT duplicated as SQL CHECKs.
-- 3) Ambient climate remains garden_profiles.location_structural_climate* ONLY.
--    Area context must never become a second climate authority.
-- 4) greenhouse is an Area site type; must not be treated as ordinary trusted
--    open-ground in GCP projections (semantic loss must be explicit).
-- 5) garden_plants.garden_area_id ON DELETE SET NULL — plants survive area deletion.

-- ---------------------------------------------------------------------------
-- garden_areas
-- ---------------------------------------------------------------------------
create table if not exists public.garden_areas (
  id uuid primary key default gen_random_uuid(),
  garden_profile_id uuid not null references public.garden_profiles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  client_instance_id text not null,
  name text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint garden_areas_name_not_blank check (char_length(trim(name)) > 0),
  constraint garden_areas_client_instance_id_not_blank check (char_length(trim(client_instance_id)) > 0),
  -- Fail-safe: context must be a JSON object (rejects arrays / scalars / null json)
  constraint garden_areas_context_object_chk check (jsonb_typeof(context) = 'object'),
  constraint garden_areas_garden_client_uidx unique (garden_profile_id, client_instance_id)
);

comment on table public.garden_areas is
  'Owned Garden Areas/Zones. Site/microclimate context only — not ambient climate authority. Climate remains garden_profiles.location_structural_climate*.';

comment on column public.garden_areas.context is
  'GCP-aligned Area site context JSON object. Includes site fields (sunExposure, plantingMode/siteType incl. greenhouse, drainage, irrigation*, …) plus provenance (source, confirmationStatus, confidence, precisionLevel, unknownReasons) and contractVersion/schema. MUST be normalized via garden-areas-v1-contract.normalizeAreaContext before suitability use. unknown is valid. Not climate authority.';

create index if not exists garden_areas_user_id_idx
  on public.garden_areas (user_id);

create index if not exists garden_areas_garden_profile_id_idx
  on public.garden_areas (garden_profile_id);

create index if not exists garden_areas_garden_updated_idx
  on public.garden_areas (garden_profile_id, updated_at desc);

create or replace function public.enforce_garden_area_ownership()
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
    raise exception 'garden_area_garden_not_found';
  end if;

  new.user_id := owner_id;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists garden_areas_enforce_ownership on public.garden_areas;
create trigger garden_areas_enforce_ownership
  before insert or update on public.garden_areas
  for each row
  execute function public.enforce_garden_area_ownership();

alter table public.garden_areas enable row level security;
alter table public.garden_areas force row level security;

drop policy if exists garden_areas_select_own on public.garden_areas;
create policy garden_areas_select_own
  on public.garden_areas
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.garden_profiles g
      where g.id = garden_areas.garden_profile_id
        and g.user_id = (select auth.uid())
    )
  );

drop policy if exists garden_areas_insert_own on public.garden_areas;
create policy garden_areas_insert_own
  on public.garden_areas
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.garden_profiles g
      where g.id = garden_profile_id
        and g.user_id = (select auth.uid())
    )
  );

drop policy if exists garden_areas_update_own on public.garden_areas;
create policy garden_areas_update_own
  on public.garden_areas
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.garden_profiles g
      where g.id = garden_areas.garden_profile_id
        and g.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.garden_profiles g
      where g.id = garden_profile_id
        and g.user_id = (select auth.uid())
    )
  );

drop policy if exists garden_areas_delete_own on public.garden_areas;
create policy garden_areas_delete_own
  on public.garden_areas
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.garden_profiles g
      where g.id = garden_areas.garden_profile_id
        and g.user_id = (select auth.uid())
    )
  );

revoke all on table public.garden_areas from anon;
grant select, insert, update, delete on table public.garden_areas to authenticated;

-- ---------------------------------------------------------------------------
-- Optional plant → area link (same garden enforced by trigger)
-- ---------------------------------------------------------------------------
alter table public.garden_plants
  add column if not exists garden_area_id uuid references public.garden_areas (id) on delete set null;

create index if not exists garden_plants_area_id_idx
  on public.garden_plants (garden_area_id)
  where garden_area_id is not null;

comment on column public.garden_plants.garden_area_id is
  'Optional Area in the SAME garden. ON DELETE SET NULL. NULL = unassigned (legacy OK).';

create or replace function public.enforce_garden_plant_area_same_garden()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  area_garden_id uuid;
begin
  if new.garden_area_id is null then
    return new;
  end if;

  select a.garden_profile_id into area_garden_id
  from public.garden_areas a
  where a.id = new.garden_area_id;

  if area_garden_id is null then
    raise exception 'garden_plant_area_not_found';
  end if;

  if area_garden_id is distinct from new.garden_profile_id then
    raise exception 'cross_garden_area_link_forbidden';
  end if;

  return new;
end;
$$;

drop trigger if exists garden_plants_enforce_area_same_garden on public.garden_plants;
create trigger garden_plants_enforce_area_same_garden
  before insert or update of garden_area_id, garden_profile_id on public.garden_plants
  for each row
  execute function public.enforce_garden_plant_area_same_garden();
