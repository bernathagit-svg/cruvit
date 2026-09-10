# Product Proof — Pre-Deploy Climate Authority Gate

## Verdict

**PRODUCT_PROOF_CLIMATE_AUTHORITY_BLOCKED**

## Flags

| Flag | Value |
|------|--------|
| MOJSTRANA_RUNTIME_SPECIAL_CASED | **NO** |
| PRODUCTION_CLIMATE_AUTHORITY_MODEL | **C** — global corpus primary + sparse pilot fallback |
| Implementation matches intended model (local/dev) | **YES** |
| Implementation matches intended model (live Netlify) | **NO** — global tiles absent; R2 `NOT_CONNECTED`; runtime is local-FS only |
| GENERIC_COORDINATE_LOOKUP_PROVEN | **YES** (local/dev global-tile-o1) |
| SUPABASE_BLOCKER_REMAINING | **NO** |
| Live deploy readiness | **BLOCKED** |

## 1. Mojstrana lookup (46.42383, 13.8752)

Default hydrate path (`preferGlobal`):

1. First attempt: **global-tile-o1** when corpus available
2. Global corpus lookup attempted: **YES**
3. Tile identity: `chelsa30s-t64:363:70` (file exists locally)
4. Why global succeeds locally: manifest + `tiles/` present under `data/coordinate-climate/v2/coverage/global-v1/`
5. Why `pilot/mojstrana.json` was previously selected: earlier Product Proof probe forced `disableGlobal:true` / live host lacked tiles so sparse fallback was attempted — **not** because runtime special-cases Mojstrana
6. City name in runtime decision logic: **NO** (`mojstrana` string absent from modules/netlify runtime)
7. Coordinate special-case: **NO** — only WGS84 → tile key / sparse epsilon match

**Sparse Mojstrana pilot removed** from `index.json` (one-off deploy workaround rejected).

## 2. Production climate authority

**Intended:** C — global corpus primary + sparse fallback  
**Code:** matches (`coordinate-climate-garden-hydrate-v2.js`)  
**Live host:** effectively sparse-only (global tiles not packaged; no R2 fetch)

## 3. Why live currently fails

Classification: **REQUIRED_GLOBAL_ASSET_NOT_DEPLOYED**

Compounding:

- Global tiles gitignored (`data/coordinate-climate/v2/coverage/**/tiles/`) — ~62k tiles / ~17GB
- R2 object-storage contract: `uploadStatus: NOT_CONNECTED` — no remote tile backend for functions
- `garden-weather` resolves via **local filesystem only** (no R2 runtime fetch)
- Secondary packaging bug fixed in-repo: Netlify prune basename `coverage` was deleting `data/coordinate-climate/v2/coverage` even under `data/` preserve rules

Not a Mojstrana lookup bug. Not a suitability hard-code.

## 4. Generic coordinate proof

| Location | Sparse hit | Lookup source | OK |
|----------|------------|---------------|----|
| Mojstrana 46.42383, 13.8752 | none (after revert) | `global-tile-o1` | YES |
| Ljubljana 46.0569, 14.5058 | none | `global-tile-o1` | YES |
| NYC 40.7128, -74.006 | none | `global-tile-o1` | YES |
| NYC with `disableGlobal` | none | unavailable | expected miss |

**GENERIC_COORDINATE_LOOKUP_PROVEN: YES** — same architecture; no city-specific files for contrast.

## 5. Supabase

**SUPABASE_BLOCKER_REMAINING: NO** for Product Proof account/garden/location flow.

## 6. Exact deploy files (product UI ready; climate assets NOT)

### Product-proof app changes (ready to ship when climate host is ready)

- `app.html` — Hero four-outcome UI + owned-garden location auto-persist
- `modules/personal-domain/smart-rec-hero-answer-view-v1.js` — outcome rows
- `tools/deployment/prune-netlify-static-deploy.mjs` — preserve climate coverage tree
- `tests/smart-rec-hero-answer-wiring-v1.test.mjs` — product-proof regression
- `scripts/_validate-real-user-product-proof-v1.mjs` — local validator (optional; not required live)

### Climate — NOT satisfied by sparse city file

Do **not** deploy `pilot/mojstrana.json`.

Live Product Proof requires the **global-v1 tile corpus** (or a connected object-storage runtime that serves the same `global-tile-o1` path) available to `garden-weather`. That packaging/connection is **out of scope for this gate** and is the remaining authority blocker.

Tracked climate contracts already in git (insufficient alone):

- `data/coordinate-climate/v2/coverage/global-v1/manifest.json`
- `data/coordinate-climate/v2/coverage/global-v1/global-index.json`
- `data/coordinate-climate/v2/coverage/object-storage-contract.json`
- `data/coordinate-climate/v2/index.json` (+ historical sparse pilots only as fallback)

## 7. Live deploy readiness

**PRODUCT_PROOF_CLIMATE_AUTHORITY_BLOCKED**

Owner next step (not executed here): connect/package global climate tiles for Netlify function host using the existing global-tile architecture — not a Mojstrana-only sparse file.

Explicit non-actions: catalog automation NO · Batch 3 NO · catalog expand NO · deployed NO
