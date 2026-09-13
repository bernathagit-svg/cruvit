-- PRIVATE_BUCKET_AND_STORAGE_POLICIES_V1
-- CRUVIT — Owner-applied ONLY after Media V1 migration review approval.
-- DO NOT run automatically with garden_media migration.
-- DO NOT create public URLs / anonymous access.
--
-- Prerequisites:
--   - Production Storage currently clean (zero buckets / zero storage.objects policies) OK
--   - garden_media migration applied (or applying in same Owner session after this review)
--
-- Bucket config (exact):
--   name/id: user-garden-media
--   public: false
--   file_size_limit: 8388608
--   allowed MIME: image/jpeg, image/png, image/webp
--
-- Locked object path (first segment = auth.uid):
--   {user_id}/{garden_profile_id}/{garden_media_id}/{filename}

-- ---------------------------------------------------------------------------
-- 1) Private bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-garden-media',
  'user-garden-media',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[];

-- ---------------------------------------------------------------------------
-- 2) storage.objects policies — bucket-scoped, authenticated owner path only
--    First path segment must equal auth.uid()::text
--    No broad "authenticated can access all buckets" policies.
-- ---------------------------------------------------------------------------

-- SELECT (signed/private delivery via Storage API; no anonymous)
drop policy if exists user_garden_media_select_own on storage.objects;
create policy user_garden_media_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'user-garden-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- INSERT
drop policy if exists user_garden_media_insert_own on storage.objects;
create policy user_garden_media_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'user-garden-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- UPDATE — included for same-object replace/metadata under owner path only.
-- Prefer delete+insert for V1 uploads; UPDATE is owner-scoped and bucket-limited.
drop policy if exists user_garden_media_update_own on storage.objects;
create policy user_garden_media_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'user-garden-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'user-garden-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- DELETE
drop policy if exists user_garden_media_delete_own on storage.objects;
create policy user_garden_media_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'user-garden-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- Explicit: no policies for anon on this bucket.
-- Explicit: no public bucket read.
-- MIME + size also enforced by bucket allowed_mime_types + file_size_limit above.
-- App must still validate before upload; client checks are not sufficient alone.
