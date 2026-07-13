# Cruvit Project Status

## Vision

Cruvit is an AI-powered gardening platform that combines:

- Garden Design
- Smart Recommendations
- Plant Doctor
- My Garden (Digital Twin)
- Shop

The goal is to become the world's leading AI gardening platform.

---

# Feature Status

Honest classification from a read-only code verification pass. Tiers:
**Implemented** = working end-to-end · **Partial** = UI/flow present but core logic incomplete · **Placeholder** = entry point exists, capability not yet built.

## Implemented
- Home / Entry screen
- Premium dashboard (My Garden)
- Calendar (v14-style: month nav, notes, day details)
- Notifications (preferences + optional browser notification)
- Health Score (`calculateHealthScore`)
- Add Plant popover (Scan / Manual / Smart Recommendations / Garden Design sources)
- Plant cards
- Smart Recommendations (climate/tag filtering + live profile enrichment)
- Multi-language support (EN/HE, RTL/LTR)
- Mobile support (mobile-first responsive)
- GitHub integration
- Netlify deployment (functions present)

## Partial
- Plant Doctor — plant **identification** and care recommendations work (`plant-identify.mjs`, plant-identifier module, `visual_analysis`); structured **disease detection / diagnosis** is not yet a real flow.
- Shop / Cart — cart add/remove/quantity work; **checkout is a stub** (`checkoutDemo()` shows a "ready for Shopify connection" alert) and there is **no Order flow**.
- Garden photo — hero photo upload works (`scanGarden`); per-plant photo replacement is a stub (`replacePlantPhoto`).

## Placeholder
- Garden Design — only a tag-filtered plant-add source (`addPlantFromDesign`). The `ARCHITECTURE.md` capabilities (photo upload, AI garden redesign, garden styles, plant placement) are **not implemented**.

> Note: tiering reflects code as verified during this audit. Update tiers as modules progress (see Update Rules).

---

# Current Baseline

The approved baseline is:

- My Garden v20-v14-calendar-merged — `TODO(baseline-ref)`: add the commit/tag that pins this baseline.
- v14 Calendar
- v19 Add Plant popover
- Current dashboard layout
- Current mobile UI

These must never be replaced unless explicitly approved. Once a new design is approved in Figma, it becomes the new baseline for that screen (see `AGENTS.md` → "Design source of truth").

---

# Active Development

### Next phase — read-only planning for Smart Recommendations browse eligibility
Status: **Next — planning only**
Priority: High
Scope: **read-only inspection and plan only** for Smart Recommendations browse eligibility / broad tag gate (`scorePlantForSource` for `'Smart Recommendations'`); do not implement until explicitly approved. Do not begin other accuracy tasks yet.

**Plant Climate Data Coverage Audit:** Done (read-only). Highest immediate risk was Smart Rec null-meta fallback returning `suitabilityScore: 60` / `recommendationLevel: 'good'`. That risk is now patched (see Completed Checkpoints).

**Remaining climate accuracy tasks (ordered; do not skip ahead):**

| # | Task | Status |
|---|------|--------|
| **A** | Smart Recommendations browse eligibility / broad tag gate | **Next — read-only planning** |
| **B** | Canonical plant identities, aliases, and duplicate records | Planned |
| **C** | Missing climate fields and reviewed catalog data | Planned |
| **D** | Separate survival, thriving, flowering, and fruiting outcomes | Planned |
| **E** | Global catalog validation in small plant batches | Planned |

**Other backlog (not next):** confidence-aware scoring refinements (stale/low `climateConfidence` / `weatherStatus`); Product/Care Schedule runtime planning; existing Product Commerce plan.

**Catalog / climate strategy note:** v1a → v1b → v1c-loader → v1d climateTraits bridge → Climate Risk / Frost Scoring Refinement (`4092627`) → Smart Recommendations catalog climate bridge (`deae8db`) → Location / Weather Reliability confidence metadata (`a94b3fa`) → Location Reliability Enforcement (`17ed381`) → Plant Climate Data Coverage Audit → **Smart Rec missing-metadata safety patch (done)** → **A. SR browse eligibility planning (next)** → B–E accuracy tasks → batch enrichment → on-demand missing profiles → backend/database migration.

---

# Known Issues

### System default location used for recommendations (implementation gap)
Description: `ensureGardenLocation()` still seeds `DEFAULT_GARDEN_LOCATION` (Western Galilee) when no user location exists, but that fallback is **no longer trusted** for suitability, Smart Rec, or weather-care paths.
Priority: High
Status: **Fixed** — Location Reliability Enforcement gates all recommendation and weather-care paths on `hasTrustedAppLocation()`; Western Galilee remains internal crash-prevention only
Files: `index.html` (`hasTrustedAppLocation`, climate suitability, Smart Rec, weather tasks / refresh)
Notes: Existing location UI and `DEFAULT_GARDEN_LOCATION` unchanged; see Location Reliability Plan / Enforcement below.

### Smart Rec null-meta scored as good (accuracy gap)
Description: When `smartRecClimateMetaForPlant()` returned no structured metadata, `smartRecEvaluateSuitability()` previously returned `suitabilityScore: 60` and `recommendationLevel: 'good'`.
Priority: High
Status: **Fixed** — missing-metadata safety patch; trusted location + no meta now returns `suitabilityScore: 50`, `recommendationLevel: 'borderline'`, with explanation that detailed climate data is unavailable
Files: `index.html` (`smartRecEvaluateSuitability` `!meta` branch only)
Notes: Trusted-location gating, structured-metadata scoring, `climateSuitabilityV1FromSnapshot`, and `getSmartRecBrowsePlants` unchanged. Remaining accuracy work: browse tag gate (A), then B–E below.

<!--
Template for each issue:

### <Short description>
Description: <what happens>
Priority: <High | Medium | Low>
Possible cause: <best guess>
Status: <Open | Investigating | Fixed>
Files: <list of files>
-->

---

# Completed Checkpoints

| Checkpoint | Status | Notes |
|------------|--------|-------|
| **GAS-3A.1** Global Language Control | Done (pushed) | Persistent `#globalAppSettings` language selector on `body` |
| **GAS-2** Global Location Foundation + Control | Done (pushed) | `resolveAppLocation` / `setAppLocation` / `getAppLocation` / location chip + popover |
| **Plant Data Foundation v1** | Done (pushed) | `PlantProfileV1` mapper, `UserPlantV1` fields (`id`, `profileSlug`, `addedAt`), `getPlantProfile()` — commit `cce3b60` |
| **Plant Library Integration v1a** | Done (pushed) | `resolvePlantProfileRaw()` read bridge; `plantMeta()` / `getPlantProfile()` routed — commit `3c70c20` |
| **Climate Suitability Engine v1a** | Done (pushed) | `getGardenClimateProfile()`, `getPlantClimateMetadata()`, `buildClimateSuitabilitySnapshot()` + `window` exports; SR garden read via `getAppClimateProfile()` — commit `a7f6df6` |
| **Climate Suitability Engine v1b** | Done (pushed) | `evaluateClimateSuitabilityV1()` climate-only scoring layer on v1a snapshot; no SR session / UI / persistence — commit `c8a76bc` |
| **Global Plant Catalog Foundation v1a** | Done (pushed) | `data/plants.seed.json` shell, `data/plant-catalog.schema.json` (Environment Suitability + Garden Compatibility extensibility), `catalogItemToLegacyFlat()` / `mergePlantCatalogItems()` legacy bridge; inline `PLANT_LIBRARY` transitional — commit `63b50c4` |
| **Global Plant Catalog Foundation v1b** | Done (pushed) | 32 curated plants in `data/plants.seed.json`; merge-ready seed batch — commit `1d540f0` |
| **Global Plant Catalog Foundation v1c-loader** | Done (pushed) | Non-blocking async `loadPlantCatalogSeed()` for `data/plants.seed.json`; merges via `mergePlantCatalogItems()`; inline `PLANT_LIBRARY` remains fallback; duplicate slugs skipped; startup not blocked — commit `b6c4c39` |
| **Global Plant Catalog Foundation v1d** | Done (pushed) | climateTraits bridge — `catalogItemToLegacyFlat()` preserves seed `climateTraits`; `getPlantClimateMetadata()` uses `SMART_REC_CLIMATE_METADATA` first, then `climateMetaFromCatalogTraits()` for seed-loaded plants; inline lavender/olive/mango unchanged; coconut uses structured metadata — commit `61cdfed` |
| **Climate Risk / Frost Scoring Refinement (v1e)** | Done (pushed) | Conservative frost scoring in `climateSuitabilityV1FromSnapshot()` — high frost-sensitive tropical/warm plants capped when garden is not clearly frost-free; `indoorShelter` lifts cap; SR/`smartRecClimateProfile()` unchanged — commit `4092627` |
| **Smart Recommendations catalog climate bridge** | Done (pushed) | Parts A–C in `index.html` only — `smartRecClimateMetaForPlant()` falls back to catalog `climateTraits` when SMART_REC metadata is missing; SMART_REC remains first priority for inline plants; frost parity + needsReview conservative ranking in `smartRecEvaluateSuitability()`; coconut/papaya/banana/mango borderline (not good/excellent) when scored against unconfirmed internal fallback climate (Western Galilee — test/dev baseline only, not user default); lavender/olive unchanged and strong; no UI/copy/data/schema/module changes — commit `deae8db` |
| **Location / Weather Reliability confidence metadata** | Done (pushed) | Additive reliability metadata on `smartRecClimateProfile()` / `getAppClimateProfile()` — `structuralFreezingRisk`, `forecastFreezingRisk`, `isFrostFreeGrowingClimate`, `locationConfidence`, `climateConfidence`, `weatherStatus`, `weatherAgeMs`, `confidenceNotes`; `data.weatherFetchError` tracked on fetch failure and cleared on success; scoring/SR/UI unchanged at that commit; modules/data/schema/`garden-weather.mjs` unchanged — commit `a94b3fa`. |
| **Location Reliability Enforcement** | Done (pushed) | Hard requirement enforced in `index.html` only — `hasTrustedAppLocation()` / `requireTrustedAppLocationReason()`; Western Galilee / `DEFAULT_GARDEN_LOCATION` remains crash-prevention fallback only (not trusted); climate suitability → `unknown` / `score: null` / `dataSource: location_untrusted` when untrusted; Smart Rec scoring blocked + browse empty until real location confirmed; weather care-task creation and weather refresh blocked until trusted; existing location UI/fallback unchanged; no modules/data/schema/styles/UI markup changes. Local + production verification passed — commit `17ed381`. |
| **Plant Climate Data Coverage Audit** | Done (read-only) | Read-only audit of catalogs/indexes/climate datasets used by CSE + Smart Rec + plant cards. Highest immediate risk: plants without structured climate metadata received `suitabilityScore: 60` / `recommendationLevel: 'good'`. Remaining accuracy backlog ordered A–E (browse gate → identities/duplicates → missing fields → survival/thrive/flower/fruit separation → small-batch catalog validation). |
| **Smart Rec missing-metadata safety patch** | Done (local; not committed yet) | `smartRecEvaluateSuitability()` `!meta` branch only in `index.html`: trusted location + missing structured metadata → `suitabilityScore: 50`, `recommendationLevel: 'borderline'`, explanation that detailed climate data is unavailable and the plant cannot yet be confidently recommended. Trusted-location gating unchanged; structured-metadata scoring unchanged; `climateSuitabilityV1FromSnapshot` and `getSmartRecBrowsePlants` unchanged. Local tests passed (untrusted blocked; trusted+meta unchanged; trusted+no-meta conservative); no console errors. |

---

# Strategic Principle

**CRUVIT is a Garden Operating System / Digital Twin centered on My Garden.**

Do not build isolated modules or jump to Garden Design redesign too early. The hard-to-copy value is **connected user garden data**:

location · climate · personal plant library · photos · tasks · diagnosis · recommendations · design selections · wishlist · purchases · **product outcome memory**

Every roadmap phase should strengthen that shared garden data layer before expanding module-specific UI.

**Location trust rule:** A user's **confirmed** garden location is core garden data. System/internal fallback coordinates (e.g. Western Galilee) are not user garden data and must never drive confident recommendations. See **Location Reliability Plan** below.

---

# Location Reliability Plan

**Hard requirement:** CRUVIT must **never silently use a generic system default location** (such as Western Galilee) for real plant suitability, Smart Recommendations, care tasks, or product recommendations.

### Location requirement

- On **first use**, the app must ask the user to **set or confirm** their garden location.
- The user can choose **current location** (GPS/browser) or **manually enter** a city/location.
- After the user **confirms a location once**, that saved user-specific location becomes the user's **personal default** for future sessions.
- The system must distinguish:
  1. **System/internal fallback location** — technical/dev fallback only; prevents crashes; **not trusted**
  2. **User-confirmed saved location** — the only location trusted for recommendations
- Only a **user-confirmed saved location** may be treated as trusted for recommendations.

### Trusted location criteria (enforced)

`hasTrustedAppLocation()` returns true only when **all** of the following hold:

- `confirmationStatus === 'confirmed'`
- `source !== 'default'`
- `locationConfidence !== 'default'`

Western Galilee / `DEFAULT_GARDEN_LOCATION` may still be seeded by `ensureGardenLocation()` for crash prevention, but it is **not** a trusted user location and must not drive recommendations.

### If no confirmed user location exists

- Do **not** give confident plant suitability recommendations.
- Do **not** treat Western Galilee or any other generic fallback as the user's real location.
- Smart Recommendations must be **gated, limited, or clearly marked** as requiring location confirmation.
- Climate-based care tasks and product recommendations must **not** be generated confidently.
- The app must **prompt the user to set/confirm location** (existing location chip / modal / Smart Rec location step — no new UI).

### Enforcement (implemented)

| Area | Behavior when location is untrusted |
|------|-------------------------------------|
| Climate suitability | `level: 'unknown'`, `score: null`, `dataSource: 'location_untrusted'`, summary from `requireTrustedAppLocationReason()`, warning `"Location not confirmed."` |
| Smart Rec scoring | `smartRecEvaluateSuitability()` → blocked / score `0` with location-required reason |
| Smart Rec browse | `getSmartRecBrowsePlants()` returns `[]` (no trusted climate-ranked results from fallback) |
| Smart Rec confirm | `smartRecConfirmLocation()` opens existing location modal; cannot confirm Western Galilee/default as real location |
| Weather care tasks | `syncWeatherCareTasks()` returns without creating frost/heat/weather tasks from fallback |
| Weather refresh | `refreshGardenSession()` / `refreshGardenWeatherIfStale()` fetch weather only when `hasTrustedAppLocation()` is true |
| Fallback / UI | `ensureGardenLocation()` + `DEFAULT_GARDEN_LOCATION` kept for crash prevention; existing location UI unchanged |

**Code scope:** Only `index.html` application code changed for enforcement. No modules, data files, schemas, styles, or UI markup changes.

**Local runtime tests:** Passed for default/untrusted location, confirmed manual location (e.g. London), and location reset; dashboard still renders; no console errors observed.

### Implementation principle

- A fallback location may exist only as an **internal technical/dev fallback** to prevent crashes.
- It must be marked `locationConfidence: "default"` (or equivalent) and must **not** be used as trusted recommendation input.
- Confidence metadata (`a94b3fa`) plus Location Reliability Enforcement (above) cover the location-trust gate; further **confidence-aware scoring refinements** (e.g. stale weather / low `climateConfidence` caps) remain optional follow-on work. Product recommendation runtime is still unwired and must also respect trusted location when built.

### Current state vs remaining work

| Area | Current (enforcement done) | Remaining |
|------|----------------------------|-----------|
| Climate profile | Exposes `locationConfidence: "default"` for unconfirmed fallback | — |
| Suitability / SR scoring | Gated on `hasTrustedAppLocation()` | Optional caps for stale/low confidence weather/climate |
| Smart Rec browse/sort | Empty / blocked until trusted location | — |
| Weather care tasks / refresh | Skipped until trusted location | — |
| Product recommendations | Not yet wired | No confident product recs without confirmed location + care need |

**Status:** Hard requirement **enforced** in application code (`index.html`). Western Galilee remains internal fallback only. `GAS-2` location control + existing location UI unchanged. Further confidence-aware refinements and product-rec gating are separate follow-on work.

---

# Future Roadmap

Ordered sequence. Do not skip ahead without explicit approval.

| # | Phase | Status |
|---|-------|--------|
| **0** | **Preserve My Garden Baseline** | Ongoing — approved v20-v14-calendar-merged baseline protected |
| **1** | **Global App Settings** | |
| | ↳ Global Language Control | **Done** |
| | ↳ Global Location Foundation + Control | **Done** |
| **2** | **Plant Data Foundation v1** | **Done** — `PlantProfileV1` / `UserPlantV1` mappers and fields |
| **3** | **Plant Library Integration v1a** | **Done** — `resolvePlantProfileRaw()` read bridge (`3c70c20`) |
| **4** | Climate Suitability Engine v1 | **Done (v1a + v1b + v1e frost refinement)** — snapshot helpers (`a7f6df6`); scoring layer (`c8a76bc`); frost-risk refinement (`4092627`) |
| **5** | Global Plant Catalog Foundation v1 | **In progress** — v1a–v1d done; frost scoring / SR catalog bridge / location confidence metadata / Location Reliability Enforcement done (`17ed381`); Plant Climate Data Coverage Audit done; **Smart Rec missing-metadata safety patch done**; next = **read-only planning for Smart Recommendations browse eligibility** (accuracy task A); then B–E |
| **6** | Per-user Plant Library v1 | Planned |
| **7** | Shared Plant Picker v1 | Planned |
| **8** | Garden Photo / Media Library Foundation | Planned |
| **9** | Plant Identifier Integration | Planned |
| **10** | Smart Recommendations Integration | Planned |
| **11** | Garden Design Plant Visual Upgrade | Planned |
| **12** | Wishlist as status/filter inside Plant Library | Planned — not a separate duplicate module |
| **13** | Shopify Smart Connection | Planned |
| **14** | Garden Design Studio 2.0 | Planned |
| **15** | AI Garden Coach | Planned |
| **16** | Garden-Level Disease Intelligence | **Future** — documented requirement only; blocked on data foundations (see dedicated plan). Must not remain single-plant-only Plant Doctor. |

### Phase notes (brief)

- **4 — Climate Suitability Engine v1:** done through v1b — snapshot helpers (`a7f6df6`) and climate-only `evaluateClimateSuitabilityV1()` (`c8a76bc`) without rewriting SR rules. **v1e frost refinement done (`4092627`):** `climateSuitabilityV1IsFrostFreeGrowingClimate()` + conservative penalties and level caps in `climateSuitabilityV1FromSnapshot()` only — high frost-sensitive tropical/warm plants (e.g. coconut, papaya, banana, mango) no longer receive optimistic `good` when scored against unconfirmed internal fallback Mediterranean profile; frost warnings and `notRecommended`/`risky` outcomes when frost-free climate is not clear; lavender and olive remain `good` in confirmed Mediterranean conditions; `indoorShelter: true` lifts/reduces conservative cap for protected/indoor growing. **Runtime tests passed:** coconut/papaya/banana/mango `notRecommended` with frost warning; lavender/olive `good`; coconut + `indoorShelter` → `good`; no console errors; My Garden/tasks dashboard renders.
- **5 — Global Plant Catalog Foundation v1:** scalable global knowledge base before deep Per-user Plant Library work. **v1a–v1d, frost scoring, SR catalog climate bridge, location/weather confidence metadata, and Location Reliability Enforcement** are done (`17ed381`). **Plant Climate Data Coverage Audit done (read-only):** mapped catalogs/indexes/climate datasets; highest immediate risk was SR null-meta → `suitabilityScore: 60` / `recommendationLevel: 'good'`. **Smart Rec missing-metadata safety patch done (`index.html` only):** `smartRecEvaluateSuitability()` `!meta` branch now returns `suitabilityScore: 50`, `recommendationLevel: 'borderline'`, with explanation that detailed climate data is unavailable and the plant cannot yet be confidently recommended; trusted-location gating unchanged; structured-metadata scoring unchanged; `climateSuitabilityV1FromSnapshot` and `getSmartRecBrowsePlants` unchanged; local tests passed (untrusted / trusted+meta / trusted+no-meta); no console errors. **Remaining accuracy tasks (ordered):** (A) Smart Recommendations browse eligibility / broad tag gate; (B) canonical plant identities, aliases, and duplicate records; (C) missing climate fields and reviewed catalog data; (D) separate survival, thriving, flowering, and fruiting outcomes; (E) global catalog validation in small plant batches. **Next:** read-only planning for **A — Smart Recommendations browse eligibility**. Then B–E → batch enrichment → on-demand missing profiles → backend/API migration.
- **6 — Per-user Plant Library v1:** user's saved/catalog plants as first-class data; still separate from global catalog mutations.
- **7 — Shared Plant Picker v1:** one picker UX/data path for Add Plant, Smart Rec, Design — after catalog + library foundations are stable.
- **8 — Garden Photo / Media Library:** garden and plant media tied to `data`, not module-local blobs.
- **9–10 — Identifier / Smart Rec integration:** wire modules through shared plant + climate layer; preserve existing detection/scoring quality.
- **11 — Garden Design visual upgrade:** plant visuals only; not full Studio redesign.
- **12 — Wishlist:** filter/status inside Plant Library; no parallel wishlist store.
- **13 — Shopify Smart Connection:** real product catalog, cart/checkout, and **User Product Outcome Memory** (see Product Commerce plan below). Product recommendations must flow from Treatment Calendar (`treatmentId`) — never random.
- **13–15 — Shopify, Design Studio 2.0, AI Coach:** after core garden data graph is connected.
- **16 — Garden-Level Disease Intelligence:** future only — see dedicated plan. Plant Doctor must evolve beyond single-plant diagnosis to garden-wide, individualized, confidence-aware disease/pest/environment reasoning. **Blocked** until canonical identity, per-user Plant Library, zones/positions, photo/symptom history, care/weather history, and multi-plant observation data exist. Do not schedule ahead of those foundations or ahead of current climate accuracy work.

---

# Product Commerce & Treatment Calendar Plan

**Principle:** Products in CRUVIT must **not** be recommended randomly. Every product recommendation must be connected to:

- a specific **plant** (`plantId` / `profileSlug`)
- a specific **care need** / **`treatmentId`**
- **correct timing** (purchase/preparation lead time before use window)
- a **purchase/preparation task**
- a **use/application task**
- **outcome feedback** after use

Schema foundation (committed `416fc78`): `PlantTreatmentDefinition`, linked `purchaseTaskId` / `useTaskId`, `purchaseLeadDays` / `leadDays`, `PlantTreatmentOutcomeFeedbackSpec`, and `onNegativeOutcome` placeholders in `data/plant-catalog.schema.json`. Runtime wiring is future work.

## User Product Outcome Memory (planned)

Per-user memory of how products performed — **not global**. A product that failed for one user may still be valid for others.

### Negative outcome rule

If a product was **not good** for a specific user, CRUVIT must **not** recommend that same product to that user again in the same or similar relevant context.

**Track (per user):**

| Field | Purpose |
|-------|---------|
| `userId` | Owner of the memory |
| `productId` / `shopifyProductId` / `variantId` | Product identity |
| `treatmentId` / `careNeed` | Linked care need |
| `plantId` / `profileSlug` | Linked plant instance or profile |
| plant group | When scope applies to a group |
| condition / diagnosis | When Plant Doctor context applies |
| `outcome` | `didNotHelp` · `worsened` · `badFit` · `userRejected` · `qualityIssue` |
| reason / notes | Optional user or system note |
| `doNotRecommendAgain` | `true` when exclusion applies |
| `createdAt` / `updatedAt` | Audit |
| `scope` | `same_plant` · `same_treatment` · `same_plant_group` · `user_global` (when appropriate) |

**Recommendation rule:** Before showing a product, check the user's outcome/exclusion history. If the product is marked `doNotRecommendAgain` for that user and scope, **do not** show it as the main recommendation — suggest **alternative products for the same care need** instead.

### Positive outcome rule

If a product was marked **excellent/helpful** by a specific user, CRUVIT should **prefer** that product for that same user in future similar situations.

**Track (per user):**

| Field | Purpose |
|-------|---------|
| `outcome` | `excellent` · `helped` · `userPrefers` · `repeatRecommended` |
| `helpedScore` / `satisfactionScore` | When available |
| `repeatRecommendationPreferred` | `true` when user wants repeats |
| related `productId` / `shopifyProductId` / `variantId` | Product identity |
| related `treatmentId` / `careNeed` | Linked care need |
| related `plantId` / `profileSlug` | Linked plant |
| related plant group | Group scope |
| related condition / diagnosis | Diagnosis context |
| `createdAt` / `updatedAt` | Audit |
| `scope` | `same_plant` · `same_treatment` · `same_plant_group` · `user_global` (when appropriate) |

**Recommendation rule:** Before showing a product, check positive outcome history. If the product was previously excellent/helpful for this user and the current care need is similar, **increase its recommendation priority** for that user.

### Safeguards (all product commerce)

- Do **not** recommend products randomly.
- Do **not** recommend a product if there is **no current care need** / active `treatmentId`.
- Still respect **safety**, **timing**, **plant condition**, **environment**, **stock/availability**, and **user preferences**.
- Do **not** fake reviews or product outcomes.
- If **real reviews** exist → show ratings/comments.
- If **no reviews** exist → show **“No user reviews yet”**.
- If the user **does not want** the suggested product → offer **alternative products for the same care need**.

**Implementation order (planned):** Treatment Calendar task runtime → outcome feedback capture on garden `data` → User Product Outcome Memory store → recommendation gate before Shop/care UI → Shopify Smart Connection (phase 13).

---

# Garden-Level Disease Intelligence Plan

**Status:** Future roadmap requirement — **documented only**. Do **not** implement until required data foundations exist. Do **not** move this ahead of those foundations or ahead of the current next task (Smart Recommendations browse eligibility planning).

**Principle:** Plant Doctor must **not** remain a single-plant diagnosis tool. When disease (or strong disease suspicion) is identified in one plant, CRUVIT must reason about the **whole garden** — connecting the case to My Garden, comparing other plants, distinguishing contagious vs environmental root causes, and producing **individualized**, confidence-aware actions for each plant.

### When disease or strong suspicion is identified

CRUVIT must:

1. Connect the case to the **correct plant** in My Garden.
2. Examine symptoms and history from **other plants and trees** in the same garden.
3. Analyze whether the root cause is one (or more) of:
   - contagious disease spread
   - pest spread
   - watering or drainage problems
   - nutrient deficiency
   - heat or cold stress
   - chemical damage
   - another garden-wide environmental pattern

### Structured per-plant symptom matrix

Analysis must use a structured per-plant symptom matrix containing, where available:

- canonical plant identity
- garden location or zone
- symptoms
- affected plant parts
- severity
- timing
- recent photos and scans
- care history
- watering
- soil and drainage
- recent weather or season
- neighboring plants
- confidence

### Individualized garden-wide recommendations

If disease is detected or strongly suspected in one plant, the system must also generate individualized recommendations for the rest of the garden.

For each other plant, determine:

- whether it is a susceptible host
- proximity to the affected plant
- shared soil, irrigation, tools, insects, wind, water, or physical contact
- whether it needs urgent inspection, preventive action, isolation, sanitation, watering changes, monitoring only, or no action

Clearly separate:

- actions for the confirmed or suspected **affected** plant
- **preventive** actions for exposed plants
- **monitoring-only** plants
- plants with **no meaningful risk**

### Recommendation quality rules

Recommendations must be:

- individualized per plant
- risk-ranked
- time-sensitive
- confidence-aware
- evidence-based
- conservative when diagnosis confidence is low

Do **not** recommend blanket treatment of the whole garden when the diagnosis is uncertain.

### Required foundations before implementation

Do not start Garden-Level Disease Intelligence until these foundations are in place:

- canonical plant identity
- reliable per-user Plant Library
- garden map / zones / plant positions
- per-plant photo and symptom history
- care, watering, soil, weather, and treatment history
- multi-plant observation data

Related roadmap foundations include Per-user Plant Library v1, Garden Photo / Media Library, garden zone/position data, and shared plant + climate graph wiring. Plant Doctor remains an external module with protected detection quality until a safe, additive integration plan is approved.

---

# Future Roadmap (priority buckets)

Legacy buckets retained for quick scanning. See numbered roadmap above for execution order.

## High
- Next — read-only planning for Smart Recommendations browse eligibility (accuracy task A)
- Remaining climate accuracy tasks B–E (identities/duplicates; missing climate fields; survival/thrive/flower/fruit separation; small-batch catalog validation)
- Per-user Plant Library v1
- Shared Plant Picker v1

## Medium
- Confidence-aware scoring refinements (stale/low climate/weather confidence; location trust already enforced)
- Product/Care Schedule runtime planning
- Garden Photo / Media Library Foundation
- Plant Identifier Integration
- Smart Recommendations Integration
- Garden Design Plant Visual Upgrade
- Wishlist (Plant Library status/filter)

## Low
- Shopify Smart Connection (includes User Product Outcome Memory)
- Garden Design Studio 2.0
- AI Garden Coach

## Strategic future (foundation-gated)
- Garden-Level Disease Intelligence — **strategically important, locked CRUVIT requirement**; implementation deferred until required foundations exist (canonical identity, per-user Plant Library, zones/positions, photo/symptom/care history, multi-plant observations). See dedicated plan. Not low priority — foundation-gated only.

---

# UI/UX Principles

- Premium
- Natural
- Minimal
- Elegant
- Calm
- Consistent

---

# Figma is the Design Authority

The latest approved Figma design is the single source of truth for UI/UX.

If the current implementation differs from the approved Figma design,
the implementation should be updated to match Figma.

Never invent a new layout when an approved Figma design exists.

---

# Development Workflow

Every feature follows this process:

1. Design in Figma.
2. User approves the design.
3. Analyze the existing implementation.
4. Create a small implementation plan.
5. Implement the approved Figma design.
6. Verify desktop and mobile responsiveness.
7. Report changed files.

When implementing Figma:

- Match spacing precisely.
- Match typography.
- Match colors.
- Match hierarchy.
- Match animations when possible.
- Reuse existing components whenever possible.
- Do not rewrite unrelated code.

---

# Technical Debt

_No technical debt items currently tracked._

---

# External Module Integration

When integrating an external working module, especially a ZIP module:

1. Analyze first.
2. Compare with the current Cruvit architecture.
3. Identify dependencies, data models, APIs, and UI entry points.
4. Identify what should be preserved exactly.
5. Identify what may be adapted.
6. Present an integration plan.
7. Wait for user approval.
8. Only then implement incrementally.

Never rewrite a working external module immediately after importing it.

## Plant Doctor (external module specifics)

- The working ZIP version is the protected source.
- Detection logic, API behavior, result quality, and workflow must be preserved.
- UI/UX may be redesigned later from approved Figma.
- Data integration with the shared Cruvit plant database is allowed only with a safe, additive, reversible plan.
- **Future direction:** Plant Doctor must not remain a single-plant diagnosis tool. Approved long-term requirements for garden-wide disease intelligence (symptom matrix, root-cause differentiation, individualized risk-ranked actions, no blanket treatment under low confidence) are recorded in **Garden-Level Disease Intelligence Plan**. Implementation waits on required data foundations.

(Canonical process rule lives in `AGENTS.md` → "External module integration rule".)

---

# Next Recommended Task

**Read-only planning for Smart Recommendations browse eligibility.** Do not implement yet. Plant Climate Data Coverage Audit is done; Smart Rec missing-metadata safety patch is done (`smartRecEvaluateSuitability()` `!meta` → `suitabilityScore: 50` / `recommendationLevel: 'borderline'` with unavailable-data explanation; trusted-location gating and structured-metadata scoring unchanged). **Plan only** how to fix the broad tag gate in `scorePlantForSource(..., 'Smart Recommendations')` (accuracy task A) — wrong inclusions (e.g. `sun`-only) and exclusions (e.g. shade plants / `low-water` vs `low water`) — without redesigning UI. Remaining ordered tasks after A: B identities/duplicates → C missing climate fields → D survival/thrive/flower/fruit separation → E small-batch catalog validation.

> Always keep exactly ONE recommended next task here.
> When the next phase is chosen and planned, replace with the approved implementation task.

---

# Update Rules

Whenever a feature is completed:

Update this document.

Whenever a bug is fixed:

Update this document.

Whenever priorities change:

Update this document.

This file must always represent the current state of the Cruvit project.
