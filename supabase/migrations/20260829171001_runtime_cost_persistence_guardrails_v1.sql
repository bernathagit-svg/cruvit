-- CRUVIT Runtime Cost & Persistence Guardrails V1
-- Live migration version: 20260829171001_runtime_cost_persistence_guardrails_v1
-- Infrastructure + bounded proof only. Does NOT bulk-ingest plants.
-- Authoritative live record on cruvit-production / saiuscqbszafszpdmzfl.
-- Do NOT re-apply if already recorded live.

-- ---------------------------------------------------------------------------
-- A) Structural climate persistence on owned Garden Profiles
-- Acquire once per confirmed location → store → reuse for plant evaluations.
-- ---------------------------------------------------------------------------
alter table public.garden_profiles
  add column if not exists location_structural_climate jsonb,
  add column if not exists location_structural_climate_version text,
  add column if not exists location_structural_climate_fetched_at timestamptz,
  add column if not exists location_structural_climate_source text,
  add column if not exists location_structural_climate_status text;

alter table public.garden_profiles
  drop constraint if exists garden_profiles_structural_climate_status_chk;
alter table public.garden_profiles
  add constraint garden_profiles_structural_climate_status_chk
  check (
    location_structural_climate_status is null
    or location_structural_climate_status in ('known', 'unknown', 'failed')
  );

-- When core location is cleared, structural climate must clear too.
create or replace function public.normalize_garden_profile_location()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.location_lat is not null then
    new.location_lat := round(new.location_lat::numeric, 4);
  end if;
  if new.location_lon is not null then
    new.location_lon := round(new.location_lon::numeric, 4);
  end if;

  if new.location_label is null
     and new.location_lat is null
     and new.location_lon is null
     and new.location_climate is null
     and new.location_source is null
     and new.location_confirmed_at is null then
    new.location_country := null;
    new.location_region := null;
    new.location_timezone := null;
    new.location_updated_at := null;
    new.location_structural_climate := null;
    new.location_structural_climate_version := null;
    new.location_structural_climate_fetched_at := null;
    new.location_structural_climate_source := null;
    new.location_structural_climate_status := null;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- B) Canonical catalog plants (public shared knowledge — NOT user garden rows)
-- Write path is ingestion/service_role only. Browser may SELECT.
-- ---------------------------------------------------------------------------
create table if not exists public.catalog_plants (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  scientific_name text,
  common_names jsonb not null default '{}'::jsonb,
  aliases jsonb not null default '[]'::jsonb,
  climate_traits jsonb not null default '{}'::jsonb,
  flowering_requirements jsonb,
  fruiting_requirements jsonb,
  provenance jsonb not null default '[]'::jsonb,
  needs_review boolean not null default true,
  verification_state text not null default 'needsReview',
  media jsonb not null default '{}'::jsonb,
  media_status text not null default 'IMAGE_PENDING',
  catalog_version text not null default '1.0.0',
  source_packet text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_plants_slug_not_blank check (char_length(trim(slug)) > 0),
  constraint catalog_plants_slug_uidx unique (slug),
  constraint catalog_plants_verification_chk check (
    verification_state in ('verified', 'needsReview', 'conflict', 'unknown')
  ),
  constraint catalog_plants_media_status_chk check (
    media_status in ('IMAGE_READY', 'IMAGE_PENDING', 'IMAGE_OWNER_REVIEW')
  )
);

create index if not exists catalog_plants_needs_review_idx
  on public.catalog_plants (needs_review);
create index if not exists catalog_plants_updated_idx
  on public.catalog_plants (updated_at desc);

alter table public.catalog_plants enable row level security;

drop policy if exists catalog_plants_select_public on public.catalog_plants;
create policy catalog_plants_select_public
  on public.catalog_plants
  for select
  to anon, authenticated
  using (true);

-- Initial privilege intent (incomplete vs Postgres defaults — hardened in 20260829171035).
revoke insert, update, delete on public.catalog_plants from anon, authenticated;
grant select on public.catalog_plants to anon, authenticated;

-- ---------------------------------------------------------------------------
-- C) Garden Design visual assets (metadata only — binaries in Storage later)
-- Public reusable CRUVIT assets. NOT user Garden photos.
-- ---------------------------------------------------------------------------
create table if not exists public.catalog_design_assets (
  id uuid primary key default gen_random_uuid(),
  plant_slug text not null,
  asset_type text not null,
  life_stage text not null,
  seasonal_state text,
  width_px integer,
  height_px integer,
  version text not null default '1.0.0',
  verification_status text not null default 'unverified',
  storage_path text,
  source_provenance jsonb not null default '{}'::jsonb,
  rights_license_status text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_design_assets_plant_slug_not_blank check (char_length(trim(plant_slug)) > 0),
  constraint catalog_design_assets_type_chk check (
    asset_type in ('illustration', 'silhouette', 'seasonal', 'placement')
  ),
  constraint catalog_design_assets_life_stage_chk check (
    life_stage in ('young', 'mature', 'unknown')
  ),
  constraint catalog_design_assets_verification_chk check (
    verification_status in ('verified', 'unverified', 'rejected')
  ),
  constraint catalog_design_assets_rights_chk check (
    rights_license_status in ('cruvit-owned', 'licensed-commercial', 'unknown', 'restricted')
  )
);

create index if not exists catalog_design_assets_plant_slug_idx
  on public.catalog_design_assets (plant_slug);

alter table public.catalog_design_assets enable row level security;

drop policy if exists catalog_design_assets_select_public on public.catalog_design_assets;
create policy catalog_design_assets_select_public
  on public.catalog_design_assets
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.catalog_design_assets from anon, authenticated;
grant select on public.catalog_design_assets to anon, authenticated;

-- ---------------------------------------------------------------------------
-- D) Cost observability events (no private Garden content)
-- Attributable spend/usage for future Owner dashboard.
-- ---------------------------------------------------------------------------
create table if not exists public.runtime_cost_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  provider text not null,
  feature text not null,
  operation text not null,
  trigger_kind text not null,
  estimated_cost_usd numeric(12, 6),
  actual_cost_usd numeric(12, 6),
  units numeric(14, 4),
  unit_kind text,
  success boolean not null default true,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  constraint runtime_cost_events_provider_not_blank check (char_length(trim(provider)) > 0),
  constraint runtime_cost_events_feature_not_blank check (char_length(trim(feature)) > 0),
  constraint runtime_cost_events_operation_not_blank check (char_length(trim(operation)) > 0),
  constraint runtime_cost_events_trigger_chk check (
    trigger_kind in ('user', 'background', 'ingestion', 'system')
  )
);

create index if not exists runtime_cost_events_occurred_idx
  on public.runtime_cost_events (occurred_at desc);
create index if not exists runtime_cost_events_user_idx
  on public.runtime_cost_events (user_id, occurred_at desc);
create index if not exists runtime_cost_events_feature_idx
  on public.runtime_cost_events (feature, occurred_at desc);

alter table public.runtime_cost_events enable row level security;

-- Users may read only their own attribution rows (no content payloads).
drop policy if exists runtime_cost_events_select_own on public.runtime_cost_events;
create policy runtime_cost_events_select_own
  on public.runtime_cost_events
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Inserts: authenticated may attribute own user-triggered events only (no service_role in browser).
drop policy if exists runtime_cost_events_insert_own on public.runtime_cost_events;
create policy runtime_cost_events_insert_own
  on public.runtime_cost_events
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and trigger_kind in ('user', 'system')
  );

revoke update, delete on public.runtime_cost_events from anon, authenticated;
grant select, insert on public.runtime_cost_events to authenticated;
