-- Mirror already-live hardening (Owner applied separately on production).
-- Do not re-apply on live if already present.
-- Pins the Location V1 normalizer trigger function search_path.

alter function public.normalize_garden_profile_location()
  set search_path = pg_catalog;
