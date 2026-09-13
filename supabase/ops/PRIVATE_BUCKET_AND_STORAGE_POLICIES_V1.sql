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
-- Locked object path (first segment = auth.uid; second = owned garden):
--   {user_id}/{garden_profile_id}/{garden_media_id}/{filename}
--
-- V1 Storage ops: SELECT / INSERT / DELETE only.
-- NO UPDATE policy (immutable objects; new observation = new object/row).

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
-- 2) storage.objects policies — bucket-scoped, owner + owned-garden path
--    (storage.foldername(name))[1] = auth.uid()
--    (storage.foldername(name))[2] = garden_profiles.id owned by auth.uid()
--    No UPDATE policy in V1.
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
    and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.garden_profiles g
      where g.id = ((storage.foldername(name))[2])::uuid
        and g.user_id = (select auth.uid())
    )
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
    and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.garden_profiles g
      where g.id = ((storage.foldername(name))[2])::uuid
        and g.user_id = (select auth.uid())
    )
  );

-- UPDATE — intentionally NOT created in V1 (immutable media objects).
drop policy if exists user_garden_media_update_own on storage.objects;

-- DELETE
drop policy if exists user_garden_media_delete_own on storage.objects;
create policy user_garden_media_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'user-garden-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.garden_profiles g
      where g.id = ((storage.foldername(name))[2])::uuid
        and g.user_id = (select auth.uid())
    )
  );

-- Explicit: no policies for anon on this bucket.
-- Explicit: no public bucket read.
-- Explicit: no UPDATE policy (drop above is defensive if a prior draft existed).
-- MIME + size also enforced by bucket allowed_mime_types + file_size_limit above.
-- App must still validate before upload; client checks are not sufficient alone.
-- Preferred create flow: insert garden_media pending → upload → mark validated
--   (never upload-first orphans).
