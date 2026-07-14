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

### Next phase — read-only Smart Recommendations filter and data-readiness planning / catalog task B
Status: **Next — planning and catalog work**
Priority: High
Scope: Filter **UI and logic are not enabled yet**. Schema foundation for filter taxonomy fields is additive only. Next UX planning remains filter matchers/data readiness for sun/water; next catalog implementation remains **B — canonical plant identities, aliases, and duplicate records**. Do not populate taxonomy arrays or implement filter UI in this foundation step.

**Plant Climate Data Coverage Audit:** Done (read-only). Highest immediate risk was Smart Rec null-meta fallback returning `suitabilityScore: 60` / `recommendationLevel: 'good'`. That risk is now patched (see Completed Checkpoints).

**Smart Recommendations Browse Eligibility Audit:** Done (read-only). Previous gate used broad tags/climate prose; correction admits plants with structured climate meta only (see Completed Checkpoints).

**Smart Recommendations Filter and Data-Readiness Audit:** Done (read-only). Of the six initial visible filters, only `sunNeeds` and `waterNeeds` are currently safe for filter use. Growing environment, garden style, garden purpose, and maintenance lack populated structured catalog fields and must stay disabled until enrichment. Advanced filters mostly missing or scoring-only. Schema foundation added (optional arrays + `maintenanceLevel` + `filterTaxonomyMeta`) — **does not enable filters yet**. Free-text `tags` are not authoritative taxonomy.

**Remaining climate accuracy tasks (ordered; do not skip ahead):**

| # | Task | Status |
|---|------|--------|
| **A** | Smart Recommendations browse eligibility / broad tag gate | **Done** |
| **B** | Canonical plant identities, aliases, and duplicate records | **In progress** — Canonical Identity Audit done; Plant Identity Registry Foundation added as **data only**; Stable Plant ID / Dual-Key Migration Audit done (read-only); **Stable Plant ID schema foundation** added (optional opaque `plantId` slot + policy, **no values assigned**); Plant ID Allocation Planning Audit done (read-only); **Model C approved** (registry = authoritative `plantId`/`canonicalSlug`/alias layer, catalog = descriptive layer); **cross-entry validator** added (`scripts/validate-plant-identity.ps1`, now 29 checks PASS); **registry expanded to full canonical coverage** (74 canonical entries + 3 pending conflicts, data only, still no IDs); **allocation tooling foundation** added in default-safe dry-run mode (`scripts/allocate-plant-ids.ps1`; validator now 35 checks PASS; zero IDs; registry unchanged at `1.1.0`); **real nine-ID pilot allocated** (`-Apply`; `lavender, lemon, olive, pomegranate, apple, fig, coconut, papaya, japanese-maple`; nine opaque `plt_…` IDs; `registryVersion 1.1.0`→`1.2.0`; expected-ID validator 36 checks PASS; other 65 canonical + 16 review + 3 conflicts remain ID-free); not wired to runtime. Next: read-only planning for a shared plant identity resolver (no persistence/runtime migration), then remaining unambiguous identities, then dual-key adoption and duplicate cleanup |
| **C** | Missing climate fields and reviewed catalog data | Planned |
| **D** | Separate survival, thriving, flowering, and fruiting outcomes | Planned |
| **E** | Global catalog validation in small plant batches | Planned |

**Other backlog:** confidence-aware scoring refinements; Product/Care Schedule runtime; **Smart Recommendations filter-based UX** (locked — schema foundation only so far; chat and results table unchanged; sun/water logic/UI not started).

**Catalog / climate strategy note:** … → browse-eligibility gate fix (`4724626`) → Filter and Data-Readiness Audit → **SR filter taxonomy schema foundation (additive)** → next UX planning (sun/water readiness) + catalog task B → C–E → enrichment → backend/database migration.

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
Notes: Trusted-location gating and structured-metadata scoring unchanged. Commit `e9fbb20`.

### Smart Rec browse gate used broad tags / climate prose (accuracy gap)
Description: `scorePlantForSource(..., 'Smart Recommendations')` admitted plants via substring tags (`mediterranean`, `low water`, `sun`) or climate-string overlap, excluding structured-meta plants (e.g. hydrangea, shade/indoor, `low-water` hyphen) before suitability scoring.
Priority: High
Status: **Fixed** — browse admission now requires non-null `smartRecClimateMetaForPlant(p)`; broad tag/climate-string matching removed for this source
Files: `index.html` (`scorePlantForSource` Smart Recommendations branch only)
Notes: Trusted-location enforcement, suitability scoring, missing-meta patch, blocked-result removal, sort/dedupe, top-12, chat, and results table unchanged. Local tests: gate 62→84, browse 32→40 (trusted London).

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
| **Smart Rec missing-metadata safety patch** | Done (pushed) | `smartRecEvaluateSuitability()` `!meta` branch only in `index.html`: trusted location + missing structured metadata → `suitabilityScore: 50`, `recommendationLevel: 'borderline'`, explanation that detailed climate data is unavailable and the plant cannot yet be confidently recommended. Trusted-location gating unchanged; structured-metadata scoring unchanged. Local tests passed — commit `e9fbb20`. |
| **Smart Recommendations Browse Eligibility Audit** | Done (read-only) | Traced `getSmartRecBrowsePlants()` path. Old gate: tags `mediterranean` / `low water` / `sun` or climate-string overlap. After seed: 84 unique plants, all 84 with structured meta, 62 passed old gate, 22 structured plants excluded before scoring (hydrangea incorrectly excluded despite good London score). |
| **Smart Rec browse-eligibility gate fix** | Done (local; not committed yet) | `index.html` only — `scorePlantForSource()` `'Smart Recommendations'` branch now admits only when `smartRecClimateMetaForPlant(p)` is non-null; broad tag/climate-string matching removed. Trusted-location, suitability scoring, missing-meta patch, blocked-result removal, sort/dedupe, top-12, chat, and results table unchanged. Local tests (trusted London): gate 62→84, browse 32→40; hydrangea good/82; lavender/olive unchanged; mango/lychee blocked+hidden; raspberry borderline; shade plants reach scoring; `low-water` hyphen no longer controls eligibility; synthetic no-meta rejected; no console errors. |
| **Smart Recommendations Filter and Data-Readiness Audit** | Done (read-only) | Of six initial visible filter groups, only `sunNeeds` and `waterNeeds` (via climateTraits / scoring meta) are currently safe for filter use. Growing environment, garden style, garden purpose, and maintenance lack populated structured catalog fields — stay disabled until enrichment. Free-text `tags` are not authoritative taxonomy. Chat and results table unchanged. |
| **SR filter taxonomy schema foundation** | Done (local; not committed yet) | Additive optional fields on `PlantCatalogItem` in `data/plant-catalog.schema.json` only: `growingEnvironments`, `plantingMethods`, `gardenStyles`, `gardenPurposes` (arrays of extensible kebab-case tokens; empty OK; `uniqueItems`), `maintenanceLevel` (`enum`: low/medium/high), `filterTaxonomyMeta` (`needsReview` boolean; `confidence` `enum` low/medium/high — use `needsReview` for draft/review status; `additionalProperties: false`). Existing seed (`data/plants.seed.json`, 32 plants) was checked with a structural PowerShell pass covering required fields and the `additionalProperties` key allow-list against the updated schema. Full draft-07 JSON Schema validation was not available in this environment. The seed file was not modified. Does **not** enable filters, populate catalog data, change climate rules, or touch browse/UI. Canonical identity cleanup remains separate task B. |
| **Canonical Plant Identity Audit** | Done (read-only) | Mapped every identity mechanism (slug, `PLANT_INDEX`, Smart Rec canonical keys, scientific name, common name, `aliases`, `CARE_QUALITY_PROFILES` keys, Garden Design manifest keys, user-plant instance `id` + `profileSlug`/`meta.slug`). Counts: inline `PLANT_LIBRARY` = 55 entries / 52 distinct slugs; seed = 32 distinct (no inline collision); runtime `PLANT_INDEX` = 84 unique slugs; runtime `PLANT_LIBRARY` = 87 entries. Major risks: 3 exact duplicate slugs (`avocado`, `strawberry-guava`, `mulberry`) where `Object.fromEntries` last-key-wins silently selects the second record — including the misspelled `Psidium cattleyanum` over `Psidium cattleianum`; 7 variant slug pairs and 4 cross-module key divergences; no stable catalog-level `plantId` (slug doubles as PK + human key); Garden Design manifest keys unbridged; duplicate/variant records double-render in Smart Rec lists. No files changed by the audit. |
| **Stable Plant ID schema foundation** | Done (local; not committed yet) | **Schema slot + policy only; no values assigned.** Added an **optional** `plantId` property to the `CanonicalIdentity` definition in `data/plant-identity.schema.json` (opaque format `^plt_[a-z0-9]{16}$`; not added to `required`; not added to `DuplicateConflict`, `ObservedRecord`, module keys, or alias records). Policy: `plantId` is the **immutable catalog-level join key**; user plant instance `id` remains a **separate per-garden-instance** identifier; `plantId` is **opaque and never derived** from slug, common name, or scientific name; `slug` remains the canonical human-readable handle; `profileSlug` and `meta.slug` remain during dual-key migration. **No plantId values allocated yet.** `avocado`, `strawberry-guava`, `mulberry` remain **ineligible** for allocation until explicit duplicate-resolution decisions exist. JSON Schema validates plantId **format only** and cannot enforce registry-wide uniqueness — a later allocation task must use collision checking and a registry-wide uniqueness validator. Registry data, catalog records, `data/plants.seed.json`, `index.html`, modules, styles, Netlify functions, and saved-user logic untouched. Next roadmap task: **read-only planning for plantId allocation to unambiguous canonical identities**. |
| **Plant ID allocation tooling foundation (dry-run)** | Done (local; not committed yet) | **Tooling only; zero IDs assigned; registry byte-for-byte unchanged.** Completed the **Plant ID Allocation Pilot Plan** (read-only) and its approved **nine-member pilot** (`lavender, lemon, olive, pomegranate, apple, fig, coconut, papaya, japanese-maple` — all species-level, `needsReview:false`, non-conflict; `apple`/`fig` carry aliases, `olive` a module key). Added `scripts/allocate-plant-ids.ps1` — **dry-run by default**; real writes require a future explicit `-Apply` (not used here); dry-run writes nothing and creates no temp/report files. Safeguards: rejects empty/duplicate allow-lists (exit 3); refuses the **whole** operation (exit 4, no partial work) for unknown slugs, alias-instead-of-canonical, module-key-instead-of-canonical, `needsReview:true`, `duplicateConflicts` slugs, and already-assigned entries; IDs generated with `System.Security.Cryptography.RandomNumberGenerator` + rejection sampling (`plt_`+16 `[a-z0-9]`, opaque, never derived from slug/name/scientific), collision-checked against existing + retired (tombstone-ready) IDs. Extended `scripts/validate-plant-identity.ps1` with 6 eligibility/placement checks (every ID-bearing entry is `needsReview:false`; no `needsReview:true` or conflict slug carries an ID; alias/module arrays contain no `plt_`-formatted tokens; `plantId` occurs only on `CanonicalIdentity`) plus an optional `-ExpectedIdSlugs` pilot-coverage check — now **35 checks PASS, exit 0** with zero IDs. Nine-member dry run: exit 0, 9 unique well-formed candidates, no file change. Negative tests: alias `apple-tree`→4, `needsReview` `rose`→4, conflict `avocado`→4, unknown `banana-tree`→4, duplicate list→3 (all non-zero, no writes). Registry SHA-256 identical before/after (`4EA11AC9…012D`); `registryVersion` unchanged at `1.1.0`; **zero `plantId` fields present**. No runtime, My Garden, module, catalog, schema, or UI changes. Next: review and separately approve the **real** nine-ID pilot allocation (`-Apply`, then `registryVersion`→`1.2.0`). |
| **Plant ID allocation pilot (real, `-Apply`)** | Done (local; not committed yet) | **Nine immutable opaque IDs assigned in the central identity registry; no runtime consumer.** Executed the approved **Plant ID Allocation Pilot** for exactly nine canonical slugs — `lavender, lemon, olive, pomegranate, apple, fig, coconut, papaya, japanese-maple` (all species-level, `needsReview:false`, non-conflict; `apple`/`fig` carry aliases, `olive` a module key). Pre-apply: HEAD `8e06342`, no modified tracked files, normal validator **35 checks PASS exit 0**, `registryVersion 1.1.0`, zero IDs, three conflicts pending; registry SHA-256 `4EA11AC9…012D`. Dry-run immediately before Apply: exit 0, 9 unique well-formed candidates, no file change, hash unchanged. Ran `scripts/allocate-plant-ids.ps1 -Apply` **once**: exit 0, registry updated atomically. Result — exactly **9** canonical entries now carry `plantId`; ID-bearing slug set exactly equals the pilot; every ID matches `^plt_[a-z0-9]{16}$`; all 9 globally unique; no non-pilot / `needsReview:true` / duplicate-conflict entry carries an ID; aliases and module keys received no IDs; canonical entry ordering identical to HEAD (74 entries); only `plantId` fields added. Assignments: `lavender→plt_aupnyvawcflgjbyh`, `lemon→plt_g4kxc4o0421gq265`, `olive→plt_e1teyafat3k5i3ke`, `pomegranate→plt_y7yhzt7rbtxzdijy`, `apple→plt_465b6lc4cnrarxaa`, `fig→plt_5ixjl9fmz1ii2rre`, `coconut→plt_543r4o6ii0l9dv8v`, `papaya→plt_2axx4a6g0uora04d`, `japanese-maple→plt_q9mcjljtt3mofidz`. `registryVersion` bumped `1.1.0`→`1.2.0` (schemaVersion unchanged). Post-allocation validation: normal validator **35 checks PASS exit 0**; `-ExpectedIdSlugs` pilot check **36 checks PASS exit 0** (ID-bearing set exactly equals the nine); coverage still 74 canonical + 3 pending conflicts; conflicts remain unresolved and ID-free. Repeat dry-run of the same nine now correctly refused (exit 4, no writes, hash unchanged). All other 65 canonical entries and all 16 `needsReview:true` identities remain ID-free. Note: the allocator's Windows PowerShell write added a UTF-8 BOM to a UTF-8-without-BOM registry file; the BOM was removed before commit and the allocator was updated to preserve UTF-8 without BOM in future Apply runs. JSON content is otherwise unchanged. No runtime consumer uses `plantId`; no My Garden / saved-user migration; no catalog, module, schema, UI, or deployment change. **Rollback** = remove the nine `plantId` fields and restore `registryVersion` to `1.1.0`. Next: read-only planning for a shared plant identity resolver (no persistence or runtime migration). |
| **Plant Identity registry full canonical coverage** | Done (local; not committed yet) | **Data only; no IDs.** Expanded `data/plant-identity.registry.json` `canonicalIdentities` from 11 to **74 entries** (added **63**: 32 inline + 31 seed) covering every non-conflicted canonical catalog identity; `registryVersion` bumped `1.0.0`→`1.1.0`; entries ordered by `canonicalSlug` for stable diffs. The 3 same-slug conflicts (`avocado`, `strawberry-guava`, `mulberry`) remain **only** in `duplicateConflicts` (unresolved, `pending`, no `plantId`). Verified 7 alias slugs stay collapsed into their canonical entries; verified cross-module keys unchanged. **16 genus-level/"Various" identities marked `needsReview:true` with `acceptedScientificName` omitted** (agapanthus, azalea, banana, blueberry, bougainvillea, camellia, geranium, jasmine, melaleuca, mint, oak-tree, orchid, pine-tree, plum, rose, succulent); the other 58 are species-level `needsReview:false`. **Zero `plantId` values allocated.** No runtime wiring, no saved-user migration, no duplicate resolution, no catalog/record changes. Validator extended with one read-only full-coverage assertion; run: **29 checks PASS, exit 0**; coverage now reports registry canonical-entry count = 74, duplicate-conflict count = 3, and canonical identities not represented = 3 (exactly the pending conflicts). `data/plant-identity.schema.json`, `data/plant-catalog.schema.json`, `data/plants.seed.json`, `index.html`, modules, styles, Netlify functions, and saved-user logic untouched. Next: approved small `plantId` allocation pilot planning. |
| **Plant Identity cross-entry validator foundation** | Done (local; not committed yet) | **Validation tool only; no data or ID changes.** Added `scripts/validate-plant-identity.ps1` — read-only, Windows PowerShell, no dependencies, no temp files. Parses the registry + its schema, `data/plants.seed.json`, `data/plant-catalog.schema.json`, inline `PLANT_LIBRARY` + `CARE_QUALITY_PROFILES`, and the Garden Design manifest. Enforces the registry-wide integrity JSON Schema alone cannot: `canonicalSlug` / `aliasSlug` / module-key uniqueness **across** entries; `plantId` format + global uniqueness + one-`plantId`-per-`canonicalSlug` (0 IDs currently present); no `aliasSlug`=`canonicalSlug` / module-key collisions; duplicate-conflict quarantine (`avocado`/`strawberry-guava`/`mulberry` remain in `duplicateConflicts`, `resolutionStatus=pending`, no `plantId`; strawberry-guava accepted `Psidium cattleianum` vs conflicting `Psidium cattleyanum`); and referential consistency (canonical/alias slugs in the inline+seed catalog union; `careQualityProfiles` + `gardenDesignManifest` keys exist in their namespaces). Identity is **never** inferred from array order. Exit code 0 on pass / 1 on failure / 2 if a source is unreadable. Current run: **28 checks PASS, 0 FAIL, exit 0.** Coverage: 87 raw records (55 inline + 32 seed), 84 unique slugs, 77 canonical identities after alias collapse, 11 registry entries, 3 duplicate conflicts, **58 species-level safe-to-allocate**, **16 genus-level/Various needing review**, **3 blocked by conflicts**. **Model C approved**: the identity registry is the authoritative `plantId` / `canonicalSlug` / alias layer; the catalog remains the descriptive data layer. Validator added **before** registry expansion or ID allocation. No IDs assigned; no registry records added or changed; registry data, catalog records, `index.html`, modules, styles, Netlify functions, and saved-user logic untouched. Next identity task: **expand the registry to cover all canonical catalog identities (data only, still no IDs).** |
| **Plant Identity Registry Foundation** | Done (local; not committed yet) | **Data only.** Added `data/plant-identity.registry.json` (11 canonical mappings + 3 documented duplicate conflicts) and `data/plant-identity.schema.json` (draft-07; `additionalProperties: false` on all defined objects; kebab-case slug validation; `uniqueItems` alias/module-key arrays to reject in-entry duplicates; `duplicateConflicts` with `resolutionStatus` fixed to `pending`; extensible for a future `plantId`). Seeded canonical mappings: variant slug pairs `apple-tree→apple`, `pear-tree→pear`, `peach-tree→peach`, `plum-tree→plum`, `fig-tree→fig`, `grape-vine→grapevine`, `passion-fruit→passionfruit`; cross-module keys `mango-tree→mango`, `lychee-tree→lychee` (CARE_QUALITY_PROFILES), `olive-tree→olive`, `italian-cypress→cypress` (Garden Design manifest). Duplicate conflicts documented (not resolved): `avocado`, `strawberry-guava` (accepted `Psidium cattleianum` vs conflicting `Psidium cattleyanum`), `mulberry`. **No runtime consumer uses it yet. No records renamed, merged, or deleted. Saved My Garden `profileSlug`/`meta.slug` references untouched. Same-slug duplicates are documented only, NOT resolved.** Both files parse; structural validation performed manually (no full draft-07 validator in environment). Next identity task: stable `plantId` + dual-key migration planning; alias wiring and duplicate cleanup come only after that planning. |

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
| **5** | Global Plant Catalog Foundation v1 | **In progress** — foundations through Location Reliability + missing-meta patch + **browse-eligibility gate fix (task A done)**; next UX planning = SR filter and data-readiness; next catalog implementation = B identities/aliases/duplicates; then C–E |
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
- **5 — Global Plant Catalog Foundation v1:** scalable global knowledge base before deep Per-user Plant Library work. Foundations through Location Reliability Enforcement (`17ed381`), Plant Climate Data Coverage Audit, Smart Rec missing-metadata safety patch (`e9fbb20`), **Smart Recommendations browse-eligibility gate fix**, **Filter and Data-Readiness Audit**, and **SR filter taxonomy schema foundation** (additive optional fields on `PlantCatalogItem`; seed unchanged; filters not enabled) are done. **Browse Eligibility Audit:** old gate used broad tags/climate prose; 84 unique plants after seed, all with structured meta, 62 passed old gate, 22 excluded before scoring (hydrangea example). **Gate fix (`index.html` `scorePlantForSource` SR branch only):** admit only when `smartRecClimateMetaForPlant(p)` is non-null; no tag/climate fallback. Local tests: untrusted browse empty; trusted London gate 62→84, browse 32→40; hydrangea good/82; lavender/olive unchanged; mango/lychee blocked+hidden; raspberry borderline; shade plants reach scoring; `low-water` hyphen irrelevant to eligibility; synthetic no-meta rejected; scoring/UI/chat/results table unchanged; no console errors. **Accuracy task A done.** **Filter data readiness:** only `sunNeeds` / `waterNeeds` safe for filters today; other approved groups need enrichment into the new schema fields. **Next UX planning:** sun/water filter matchers when data-ready (UI still not started). **Next catalog implementation:** B — canonical plant identities, aliases, and duplicate records (separate from filter schema). Then C–E → taxonomy enrichment → backend/API migration.
- **6 — Per-user Plant Library v1:** user's saved/catalog plants as first-class data; still separate from global catalog mutations.
- **7 — Shared Plant Picker v1:** one picker UX/data path for Add Plant, Smart Rec, Design — after catalog + library foundations are stable.
- **8 — Garden Photo / Media Library:** garden and plant media tied to `data`, not module-local blobs.
- **9–10 — Identifier / Smart Rec integration:** wire modules through shared plant + climate layer; preserve existing detection/scoring quality. **Smart Recommendations UX Scope (locked):** future filter-based input replaces chat; filters only where structured data is reliable; schema foundation for taxonomy fields is additive only (does not enable filters); **preserve current results table/columns/cards/ordering during filter redesign**; results-table redesign is a later separate phase; keep chat until filter flow is verified (additive/reversible).
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

# Smart Recommendations UX Scope

**Status:** Locked product decision — **documented only**. Do **not** implement filters or redesign the results table yet. Browse eligibility (accuracy task A) is **done**. **Filter and Data-Readiness Audit is complete:** only `sunNeeds` and `waterNeeds` are currently safe for filter use; other approved groups require structured catalog fields and enrichment. **Schema foundation is additive** (`growingEnvironments`, `plantingMethods`, `gardenStyles`, `gardenPurposes`, `maintenanceLevel`, `filterTaxonomyMeta` on `PlantCatalogItem`) and does **not** enable filters yet. Existing chat and results table remain unchanged. Canonical identity cleanup remains separate catalog task B.

### Input experience (future UX phase)

The current **chat-based** Smart Recommendations input flow will be replaced in a future UX phase by a **filter-based** selection experience.

The filter experience may include **only** filters supported by reliable structured data, such as:

- plant type
- indoor or outdoor
- sun
- water
- verified user location and climate suitability
- planting in soil or container
- available size or space
- maintenance level
- flowering, fruit, shade, fragrance, or privacy goals
- pet or child safety
- compatibility with plants already in My Garden
- indoor air-quality interest, using conservative evidence

### Garden style and purpose filters (locked requirement)

Garden type must be represented by **two separate** structured filter groups:

**A. Garden style / ecosystem** (examples):

- tropical
- Japanese
- Mediterranean
- cottage
- desert / xeriscape
- modern / minimal
- woodland / shade

**B. Garden purpose / use** (examples):

- vegetable garden
- herb garden
- edible garden
- fruit garden / orchard
- pollinator garden
- privacy
- flowering
- shade

A plant may belong to **multiple** styles and purposes.

These filters use structured catalog fields `gardenStyles`, `gardenPurposes`, and optional `filterTaxonomyMeta` (confidence / review). Schema names are declared on `PlantCatalogItem` (additive; not yet populated or wired to UI).

Enable style/purpose filters **only** when catalog data is sufficiently reliable.

### Growing environment / site type (locked requirement)

Structured growing-environment filters (examples):

- indoor
- balcony
- rooftop garden
- patio / courtyard
- private garden in open ground
- greenhouse
- windowsill
- vertical garden
- community garden
- office / commercial space

A plant may belong to **multiple** growing environments.

### Planting method / container type (locked requirement)

Structured planting-method filters (examples):

- in ground
- pots / containers
- raised bed
- planter box
- hanging basket
- green wall
- hydroponics
- greenhouse / tunnel
- pond / water garden

A plant may belong to **multiple** planting methods.

### Complementary advanced filters (locked requirement)

Additional structured filters (examples):

- sun exposure
- wind exposure
- irrigation availability
- drainage
- available space
- maximum plant height and width
- maintenance level
- pot / container size
- heat, cold, and frost suitability
- pet and child toxicity
- perennial or annual
- growth speed

### Initial visible filter groups

On first release of the filter UX, show these groups in the primary filter surface:

- growing environment
- garden style
- garden purpose
- sun
- water
- maintenance

All other supported filters should initially appear under **Advanced Filters**.

### Architecture and rollout rules

- The taxonomy must be **extensible through data or configuration**.
- Adding a new environment, style, purpose, or planting method must **not** require rewriting the UI.
- A plant may belong to multiple environments, planting methods, styles, and purposes.
- Filters may be enabled **only** when reliable structured catalog data exists.
- **Hard gate:** confirmed-location climate suitability remains mandatory. Style, purpose, or environment alone must **never** recommend a climate-unsuitable plant.
- The existing Smart Recommendations **results table remains unchanged** during the filter UX phase.
- Results-table redesign remains a **separate later task**.
- The existing **chat flow remains available** until the filter flow is verified; migration must stay **additive and reversible**.

### Results display (preserve during filter redesign)

During the filter-based input redesign, the **existing selected-plant results display must remain unchanged**.

Preserve exactly during that phase:

- the current results table
- current result columns
- current plant result presentation
- current plant cards or result rows
- current result ordering and actions, unless a logic fix is separately approved

### Results-table redesign (separate later phase)

Results-table redesign is a **separate later UX phase**, after:

- browse eligibility is reliable
- filter logic is stable
- recommendation data is sufficiently complete

### Migration rule

Do **not** remove the existing chat implementation immediately. The future filter implementation must be **additive and reversible** until the filter flow is verified.

---

# Future Roadmap (priority buckets)

Legacy buckets retained for quick scanning. See numbered roadmap above for execution order.

## High
- Next UX planning — sun/water filter readiness (only currently safe structured filters; UI not started)
- Next catalog implementation — canonical plant identities, aliases, and duplicate records (accuracy task B; separate from filter schema)
- Remaining climate accuracy tasks C–E (missing climate fields; survival/thrive/flower/fruit separation; small-batch catalog validation)
- Enrichment of optional SR filter taxonomy fields (after B / when approved)
- Per-user Plant Library v1
- Shared Plant Picker v1

## Medium
- Confidence-aware scoring refinements (stale/low climate/weather confidence; location trust already enforced)
- Product/Care Schedule runtime planning
- Garden Photo / Media Library Foundation
- Plant Identifier Integration
- Smart Recommendations Integration
- Smart Recommendations filter-based UX (locked; schema foundation additive only; audit complete — sun/water only safe today; preserve chat + results table — see UX Scope)
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

**Catalog task B — canonical plant identities: read-only planning for a shared plant identity resolver (no persistence or runtime migration).** Done so far: Canonical Identity Audit; **data-only Plant Identity Registry Foundation** (`data/plant-identity.registry.json` + `data/plant-identity.schema.json`); **Stable Plant ID / Dual-Key Migration Audit** (read-only); **Stable Plant ID schema foundation** — optional opaque `plantId` slot (`^plt_[a-z0-9]{16}$`) added to `CanonicalIdentity` with policy; **Plant ID Allocation Planning Audit** (read-only) with **Model C approved** (registry = authoritative `plantId`/`canonicalSlug`/alias layer, catalog = descriptive layer); **cross-entry validator** `scripts/validate-plant-identity.ps1` (read-only; enforces global/registry-wide uniqueness, quarantine, referential consistency, and full canonical coverage); **registry expanded to full canonical coverage** (74 canonical entries + 3 pending conflicts); the **allocation tooling foundation** (`scripts/allocate-plant-ids.ps1`, dry-run-safe; validator extended to 35 checks incl. eligibility/placement + optional `-ExpectedIdSlugs`); and the **real nine-ID pilot allocation** (`-Apply` for `lavender, lemon, olive, pomegranate, apple, fig, coconut, papaya, japanese-maple`; nine opaque `plt_…` IDs assigned in the registry; `registryVersion 1.1.0`→`1.2.0`; normal validator 35 checks PASS + `-ExpectedIdSlugs` 36 checks PASS; repeat run correctly refused). The registry is **not wired into runtime** and same-slug duplicates remain **documented, not resolved**. The next identity step is **read-only planning for a shared plant identity resolver** (design only — no persistence, no runtime wiring, no saved-user migration). Dual-key adoption and duplicate resolution are later tasks (`avocado`/`strawberry-guava`/`mulberry` stay ineligible until explicit duplicate-resolution decisions; the 16 genus-level/Various identities stay `needsReview:true` and are excluded from the first pilot). Keep `profileSlug`/`meta.slug` for saved My Garden plants. Do not rename, merge, or delete records, do not modify saved user plants, and do not populate SR taxonomy arrays or implement filter UI in these identity steps. Then climate accuracy C–E; sun/water filter logic/UI only when separately approved.

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
