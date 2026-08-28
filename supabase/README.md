# Personal Domain V0 — Supabase setup

1. Create or open your Supabase project.
2. Enable **Email** provider under Authentication → Providers (smallest path when OAuth env vars are unset).
3. Run `supabase/migrations/20250828120000_garden_profiles_v0.sql` in the SQL editor (or via Supabase CLI).
4. Set Netlify environment variables (Site settings → Environment variables):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (browser-safe publishable/anon key only)
5. Do **not** set `SUPABASE_SERVICE_ROLE_KEY` in the frontend or commit it to Git.

Local verification:

```bash
cp .env.example .env
# fill SUPABASE_URL and SUPABASE_ANON_KEY
node --test tests/garden-profile-v0-rls-isolation.test.mjs
```

If email confirmation is enabled, create two test users manually and set `CRUVIT_TEST_USER_A_*` / `CRUVIT_TEST_USER_B_*` in `.env`.
