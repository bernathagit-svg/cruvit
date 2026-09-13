-- CRUVIT Garden Media / Images / Identity V1
-- Additive owned media metadata under garden_profiles.
-- OWNER REVIEW REQUIRED before apply — do not apply silently.
--
-- CRITICAL:
-- 1) This migration does NOT create Storage buckets or storage.objects policies.
-- 2) Private bucket `user-garden-media` + Storage RLS are in a SEPARATE Owner-applied
--    script: supabase/ops/PRIVATE_BUCKET_AND_STORAGE_POLICIES_V1.sql
-- 3) Never store raw image bytes/base64 in Postgres — only storage_path refs.
-- 4) USER media is NOT catalog media. Do not merge with catalog_plants.media.
-- 5) New observation = new row (history). Cover pointers are separate.
-- 6) Postgres FK cascade does NOT delete Supabase Storage objects — app cleanup required.
-- 7) Preferred create flow: insert pending row → upload object → mark validated.
--    Do NOT upload-first (avoids Storage orphans without DB authority).
-- 8) cleanup_pending = bounded cleanup/error state (not overloaded 'deleted').
--
-- Locked storage path shape (enforced below):
--   {user_id}/{garden_profile_id}/{garden_media_id}/{filename}

-- ---------------------------------------------------------------------------
-- garden_media
-- ---------------------------------------------------------------------------
create table if not exists public.garden_media (
  id uuid primary key default gen_random_uuid(),
  garden_profile_id uuid not null references public.garden_profiles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  garden_plant_id uuid null references public.garden_plants (id) on delete set null,
  garden_area_id uuid null references public.garden_areas (id) on delete set null,
  client_instance_id text null,
  storage_bucket text not null default 'user-garden-media',
  storage_path text not null,
  mime_type text not null,
  byte_size bigint not null,
  width integer null,
  height integer null,
  source_module text not null,
  purpose text not null,
  identity_source text not null default 'none',
  identity_confidence text not null default 'none',
  validation_state text not null default 'pending',
  content_sha256 text null,
  captured_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint garden_media_storage_bucket_chk check (storage_bucket = 'user-garden-media'),
  constraint garden_media_storage_path_not_blank check (char_length(trim(storage_path)) > 0),
  constraint garden_media_storage_path_not_data_url check (storage_path !~* '^data:'),
  constraint garden_media_storage_path_no_traversal check (
    storage_path !~ '\.\.'
    and storage_path !~ '^/'
    and storage_path !~ '\\'
  ),
  constraint garden_media_mime_chk check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint garden_media_byte_size_chk check (byte_size > 0 and byte_size <= 8388608),
  constraint garden_media_source_module_chk check (
    source_module in ('my_garden', 'plant_doctor', 'plant_identifier', 'garden_design', 'garden_area', 'import')
  ),
  constraint garden_media_purpose_chk check (
    purpose in (
      'plant_profile',
      'diagnosis',
      'identification',
      'garden_overview',
      'area_reference',
      'design_source',
      'progress_photo'
    )
  ),
  constraint garden_media_identity_source_chk check (
    identity_source in (
      'user_assigned',
      'inherited_from_known_plant_context',
      'identifier_confirmed',
      'doctor_context',
      'uncertain',
      'none'
    )
  ),
  constraint garden_media_identity_confidence_chk check (
    identity_confidence in ('none', 'low', 'medium', 'high')
  ),
  constraint garden_media_validation_state_chk check (
    validation_state in ('pending', 'validated', 'rejected', 'deleted', 'cleanup_pending')
  ),
  constraint garden_media_metadata_object_chk check (jsonb_typeof(metadata) = 'object'),
  constraint garden_media_sha_chk check (
    content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint garden_media_garden_storage_uidx unique (garden_profile_id, storage_path)
);

comment on table public.garden_media is
  'Owned user/Garden media metadata. Private object storage refs only. Not catalog images. Not climate authority. FK cascade does not delete Storage objects.';

comment on column public.garden_media.storage_path is
  'Locked path: {user_id}/{garden_profile_id}/{garden_media_id}/{filename} inside private bucket user-garden-media. Never a data URL or base64 payload.';

comment on column public.garden_media.identity_source is
  'How plant association was established. NOT botanical identification proof.';

comment on column public.garden_media.validation_state is
  'pending=row before/during upload; validated=object durable; rejected; deleted=intentional soft tombstone; cleanup_pending=bounded cleanup/error (upload or storage-delete failure). Do not use deleted for upload failure.';

create index if not exists garden_media_user_id_idx
  on public.garden_media (user_id);

create index if not exists garden_media_garden_profile_id_idx
  on public.garden_media (garden_profile_id);

create index if not exists garden_media_garden_created_idx
  on public.garden_media (garden_profile_id, created_at desc);

create index if not exists garden_media_plant_id_idx
  on public.garden_media (garden_plant_id)
  where garden_plant_id is not null;

create index if not exists garden_media_area_id_idx
  on public.garden_media (garden_area_id)
  where garden_area_id is not null;

create index if not exists garden_media_sha_idx
  on public.garden_media (garden_profile_id, content_sha256)
  where content_sha256 is not null;

-- Optional plant cover pointer (history remains in garden_media rows)
-- Circular FK safety: cover_media_id ON DELETE SET NULL; garden_media.garden_plant_id ON DELETE SET NULL
alter table public.garden_plants
  add column if not exists cover_media_id uuid null references public.garden_media (id) on delete set null;

create index if not exists garden_plants_cover_media_id_idx
  on public.garden_plants (cover_media_id)
  where cover_media_id is not null;

comment on column public.garden_plants.cover_media_id is
  'Optional current display media (same Garden). Historical photos remain as garden_media rows. ON DELETE SET NULL — no circular cascade delete.';

-- Ownership + same-garden plant/area + locked storage path enforcement
create or replace function public.enforce_garden_media_ownership()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  owner_id uuid;
  plant_garden_id uuid;
  area_garden_id uuid;
  expected_prefix text;
  path_parts text[];
  filename text;
begin
  select g.user_id into owner_id
  from public.garden_profiles g
  where g.id = new.garden_profile_id;

  if owner_id is null then
    raise exception 'garden_media_garden_not_found';
  end if;

  new.user_id := owner_id;
  new.updated_at := now();

  -- Locked path: {user_id}/{garden_profile_id}/{garden_media_id}/{filename}
  path_parts := string_to_array(new.storage_path, '/');
  if coalesce(array_length(path_parts, 1), 0) <> 4 then
    raise exception 'garden_media_storage_path_shape_invalid';
  end if;
  if path_parts[1] is distinct from new.user_id::text then
    raise exception 'garden_media_storage_path_owner_mismatch';
  end if;
  if path_parts[2] is distinct from new.garden_profile_id::text then
    raise exception 'garden_media_storage_path_garden_mismatch';
  end if;
  if path_parts[3] is distinct from new.id::text then
    raise exception 'garden_media_storage_path_media_id_mismatch';
  end if;
  filename := path_parts[4];
  if filename is null
     or filename !~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$'
  then
    raise exception 'garden_media_storage_path_filename_invalid';
  end if;
  expected_prefix := new.user_id::text || '/' || new.garden_profile_id::text || '/' || new.id::text || '/';
  if left(new.storage_path, char_length(expected_prefix)) is distinct from expected_prefix then
    raise exception 'garden_media_storage_path_prefix_invalid';
  end if;

  if new.garden_plant_id is not null then
    select p.garden_profile_id into plant_garden_id
    from public.garden_plants p
    where p.id = new.garden_plant_id;
    if plant_garden_id is null then
      raise exception 'garden_media_plant_not_found';
    end if;
    if plant_garden_id is distinct from new.garden_profile_id then
      raise exception 'cross_garden_media_plant_link_forbidden';
    end if;
  end if;

  if new.garden_area_id is not null then
    select a.garden_profile_id into area_garden_id
    from public.garden_areas a
    where a.id = new.garden_area_id;
    if area_garden_id is null then
      raise exception 'garden_media_area_not_found';
    end if;
    if area_garden_id is distinct from new.garden_profile_id then
      raise exception 'cross_garden_media_area_link_forbidden';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists garden_media_enforce_ownership on public.garden_media;
create trigger garden_media_enforce_ownership
  before insert or update on public.garden_media
  for each row
  execute function public.enforce_garden_media_ownership();

-- Cover media must belong to same plant's garden (and preferably same plant)
create or replace function public.enforce_garden_plant_cover_media_same_garden()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  media_garden_id uuid;
  media_plant_id uuid;
begin
  if new.cover_media_id is null then
    return new;
  end if;

  select m.garden_profile_id, m.garden_plant_id
    into media_garden_id, media_plant_id
  from public.garden_media m
  where m.id = new.cover_media_id;

  if media_garden_id is null then
    raise exception 'garden_plant_cover_media_not_found';
  end if;

  if media_garden_id is distinct from new.garden_profile_id then
    raise exception 'cross_garden_cover_media_link_forbidden';
  end if;

  -- If media is plant-scoped, it must match this plant
  if media_plant_id is not null and media_plant_id is distinct from new.id then
    raise exception 'cover_media_plant_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists garden_plants_enforce_cover_media on public.garden_plants;
create trigger garden_plants_enforce_cover_media
  before insert or update of cover_media_id, garden_profile_id on public.garden_plants
  for each row
  execute function public.enforce_garden_plant_cover_media_same_garden();

alter table public.garden_media enable row level security;
alter table public.garden_media force row level security;

drop policy if exists garden_media_select_own on public.garden_media;
create policy garden_media_select_own
  on public.garden_media
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.garden_profiles g
      where g.id = garden_media.garden_profile_id
        and g.user_id = (select auth.uid())
    )
  );

drop policy if exists garden_media_insert_own on public.garden_media;
create policy garden_media_insert_own
  on public.garden_media
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.garden_profiles g
      where g.id = garden_profile_id
        and g.user_id = (select auth.uid())
    )
  );

drop policy if exists garden_media_update_own on public.garden_media;
create policy garden_media_update_own
  on public.garden_media
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.garden_profiles g
      where g.id = garden_media.garden_profile_id
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

drop policy if exists garden_media_delete_own on public.garden_media;
create policy garden_media_delete_own
  on public.garden_media
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.garden_profiles g
      where g.id = garden_media.garden_profile_id
        and g.user_id = (select auth.uid())
    )
  );

revoke all on table public.garden_media from anon;
grant select, insert, update, delete on table public.garden_media to authenticated;

-- STORAGE: NOT in this migration.
-- See: supabase/ops/PRIVATE_BUCKET_AND_STORAGE_POLICIES_V1.sql
-- Bucket create + storage.objects policies are Owner-applied separately.
-- Postgres FK cascade does NOT delete Storage objects.
