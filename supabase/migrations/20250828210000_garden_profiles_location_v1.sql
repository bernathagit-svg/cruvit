-- CRUVIT Garden Profile Location V1 — trusted location on owned garden_profiles
-- DO NOT apply to production until Owner Review approves this repository change.
-- Extends public.garden_profiles only (no separate location table / ownership layer).

alter table public.garden_profiles
  add column if not exists location_label text,
  add column if not exists location_lat numeric(7, 4),
  add column if not exists location_lon numeric(8, 4),
  add column if not exists location_climate text,
  add column if not exists location_country text,
  add column if not exists location_region text,
  add column if not exists location_timezone text,
  add column if not exists location_source text,
  add column if not exists location_confirmed_at timestamptz,
  add column if not exists location_updated_at timestamptz;

-- Precision: numeric(7,4)/numeric(8,4) stores at most 4 decimal places.
-- Range validation for geographic coordinates:
alter table public.garden_profiles
  drop constraint if exists garden_profiles_location_lat_range_chk;
alter table public.garden_profiles
  add constraint garden_profiles_location_lat_range_chk
  check (
    location_lat is null
    or (location_lat >= -90 and location_lat <= 90)
  );

alter table public.garden_profiles
  drop constraint if exists garden_profiles_location_lon_range_chk;
alter table public.garden_profiles
  add constraint garden_profiles_location_lon_range_chk
  check (
    location_lon is null
    or (location_lon >= -180 and location_lon <= 180)
  );

-- Never allow location_source='default' as server-owned trusted location.
alter table public.garden_profiles
  drop constraint if exists garden_profiles_location_source_chk;
alter table public.garden_profiles
  add constraint garden_profiles_location_source_chk
  check (
    location_source is null
    or location_source in ('manual', 'geolocation')
  );

-- Complete-or-null: either no location authority, or a complete trusted core.
-- Optional metadata (country/region/timezone) may exist only with a complete core.
-- location_updated_at is required when a complete location exists.
alter table public.garden_profiles
  drop constraint if exists garden_profiles_location_complete_or_null_chk;
alter table public.garden_profiles
  add constraint garden_profiles_location_complete_or_null_chk
  check (
    (
      location_label is null
      and location_lat is null
      and location_lon is null
      and location_climate is null
      and location_source is null
      and location_confirmed_at is null
      and location_updated_at is null
      and location_country is null
      and location_region is null
      and location_timezone is null
    )
    or (
      location_label is not null
      and char_length(trim(location_label)) > 0
      and location_lat is not null
      and location_lon is not null
      and location_climate is not null
      and char_length(trim(location_climate)) > 0
      and location_source in ('manual', 'geolocation')
      and location_confirmed_at is not null
      and location_updated_at is not null
    )
  );

-- Normalize precision + strip orphaned optional metadata when clearing core location.
create or replace function public.normalize_garden_profile_location()
returns trigger
language plpgsql
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
  end if;

  return new;
end;
$$;

drop trigger if exists garden_profiles_normalize_location on public.garden_profiles;
create trigger garden_profiles_normalize_location
  before insert or update on public.garden_profiles
  for each row
  execute function public.normalize_garden_profile_location();

-- RLS policies unchanged: own-row SELECT/INSERT/UPDATE/DELETE remain the security boundary.
-- Owner-immutable user_id trigger unchanged.
