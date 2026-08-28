# Personal Domain V0 — Supabase setup

1. Create or open your Supabase project.
2. Enable **Email** provider under Authentication → Providers (smallest path when OAuth env vars are unset).
3. Run migrations in order in the SQL editor (or via Supabase CLI):
   - `supabase/migrations/20250828120000_garden_profiles_v0.sql`
   - `supabase/migrations/20250828210000_garden_profiles_location_v1.sql` (location columns; already live on production — do not re-apply)
   - `supabase/migrations/20250828220000_harden_garden_profile_location_normalizer_search_path.sql` (pins normalizer `search_path`; already live — do not re-apply)
4. Set Netlify environment variables (Site settings → Environment variables):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (browser-safe publishable/anon key only)
5. Do **not** set `SUPABASE_SERVICE_ROLE_KEY` in the frontend or commit it to Git.

Local verification:

```bash
cp .env.example .env
# fill SUPABASE_URL and SUPABASE_ANON_KEY
node --test tests/garden-profile-v0-signout-stale-refresh.test.mjs
node --test tests/garden-profile-location-v1-contract.test.mjs
node --test tests/garden-profile-v0-rls-isolation.test.mjs
```

If email confirmation is enabled, create two test users manually and set `CRUVIT_TEST_USER_A_*` / `CRUVIT_TEST_USER_B_*` in `.env`.

Live location RLS/update checks require the Location V1 migration to be applied; contract/unit tests do not.
