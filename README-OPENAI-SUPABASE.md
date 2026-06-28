# Cruvit Plant Search

This version uses a true universal plant search flow:
1. Netlify Function `plant-knowledge.mjs` calls OpenAI server-side.
2. It also checks public taxonomy/reference sources (Wikidata, Wikipedia, GBIF, Wikimedia).
3. The local plant list is only a fallback, not the main source.

Required Netlify environment variable:
`OPENAI_API_KEY`

Optional auth (Google / Facebook sign-in on the login screen):

**Option A — Supabase Auth (recommended for production)**
- `SUPABASE_URL` + `SUPABASE_ANON_KEY`
- In Supabase Dashboard → Authentication → Providers: enable **Google** and **Facebook**
- In Supabase → URL Configuration, add redirect URL: `https://friendly-taiyaki-64aacb.netlify.app/` (and your custom domain if any)
- For Facebook in Supabase: create a [Meta app](https://developers.facebook.com/), add Facebook Login, set Valid OAuth Redirect URI to your Supabase callback (`https://<project>.supabase.co/auth/v1/callback`)

**Option B — Direct client IDs (works without Supabase)**
- `GOOGLE_CLIENT_ID` — OAuth Web client ID; authorized JavaScript origin: your Netlify site URL
- `FACEBOOK_APP_ID` — Meta app ID; add your site URL under Facebook Login → Settings → Valid OAuth Redirect URIs (`https://your-site/`)

Do not put API keys inside `index.html`.
