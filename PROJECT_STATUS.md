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
| **B** | Canonical plant identities, aliases, and duplicate records | **Frozen (v1)** — **Canonical Identity Foundation v1** is frozen and production-verified (`registryVersion` **1.5.0**; **76** canonical; **1** pending = mulberry; **9** plantIds). Canonical identity remains **advisory**; legacy runtime remains **authoritative**; **no** `plantId`/`canonicalSlug` persistence. **My Garden Phase A–C2 production verified** at `3b8452d` — inert Sidecar stopped by default; explicit developer consult only; **no runtime consumer / auto-population / persistence / UI / authority**. **Lazy/idle Sidecar population deferred**. Climate accuracy C–E remain separate. **Growth Outcome Suitability GOS-3C1** expanded comparison matrix complete locally (test-only; eight Florida-aligned fixtures; GOS_3C1_COMPLETE). Canonical persistence, Shared Plant Picker, and consumer integration remain separate explicitly approved phases. |)
| **C** | Missing climate fields and reviewed catalog data | Planned |
| **D** | Separate survival, thriving, flowering, and fruiting outcomes | Planned |
| **E** | Global catalog validation in small plant batches | Planned |

**Other backlog:** confidence-aware scoring refinements; Product/Care Schedule runtime; **Smart Recommendations filter-based UX** (locked — schema foundation only so far; chat and results table unchanged; sun/water logic/UI not started); **Growth Outcome Suitability** (GOS-3C2 readiness contract complete locally — docs only; GOS-3C1 matrix **979/979** / **8** fixtures unchanged; no UI/ranking/runtime consumer until separately approved).

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

### Add Plant Live Search can expose technical abort messages (UX / performance)
Description: Add Plant may show technical Live Search messages such as "Live search did not improve the local matches." or "signal is aborted without reason" while background enrichment runs.
Priority: Medium
Status: Open — separate from Canonical Identity Foundation
Possible cause: Background Live Search abort / race with local catalog results; technical abort text surfaced to users
Files: Add Plant Live Search path in `index.html` (not identity registry / resolver)
Notes: Does **not** invalidate local-search correctness (e.g. verified `גויאבה תותית` → one strawberry-guava catalog object). **Not** part of Canonical Identity Foundation v1. Fix later so aborted background searches do not expose technical messages; local verified results should display immediately without waiting for Live Search. **Must not** be mixed into the My Garden canonical-adoption task.

### Known pre-existing Sidecar harness race (test infrastructure)
Description: Normal-browser and headless instrumentation of `tests/my-garden-identity-sidecar.test.html` can intermittently observe late fetch / storage / DOM activity from the real `index.html` iframe bootstrap after the harness installs spies (commonly `final network deltas zero for sidecar window` with `fetch:1`; occasionally DOM length drift or `lsSet>0`).
Priority: Medium
Status: Open — test-infrastructure only; **not** a Sidecar product-behavior failure
Possible cause: iframe bootstrap race (`plants.seed.json`, plant-identifier loader, registry GET, and/or app language/garden storage) relative to harness spy install timing
Files: `tests/my-garden-identity-sidecar.test.html` (harness), real `index.html` bootstrap paths under test — **no Sidecar module change required for diagnosis**
Notes: Same intermittent failures reproduce on clean HEAD `e91b92273f80829dca3dc69381b51f02cebb7c68` without GOS-2B. GOS-2B does **not** reference or consume the Sidecar; no Sidecar code changed for the GOS-2B checkpoint. **Must be stabilized before any future Sidecar runtime, consumer, or persistence phase.** Do not treat dump-dom-only failures as product regressions.

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
| **Growth Outcome Suitability — GOS-3F explicit developer comparison harness complete locally** | Done (local) | **Standalone test-only developer comparison harness only; no evaluator/API/`index.html`/GOS-3C1 harness/schema/pilot/product change; no score/risk mapping; no winner language; no production verification in this commit.** File: `tests/growth-outcome-developer-comparison.test.html` (+ `PROJECT_STATUS.md`). Reuses exact eight GOS-3C1 fixture IDs (copied matrix frozen from commit `4a11dd5`; not a shared runtime source). Invokes GOS via `evaluateGrowthOutcomeForDeveloper` with `GOS_DEVELOPER_CAPABILITY`; nested `result` byte-identical to direct evaluator for trusted fixtures; untrusted fixture expects API fail-closed `trusted_location_required` (`result === null`) while category parity uses direct evaluator nested biology (envelope never classified as biology). Live iframe v1b path unchanged from C1. Frozen expected primary categories: `aligned_unknown` (untrusted); `gos_preserves_unknown` ×6; `blocker_scope_difference` (bloom fruitSet cold). Neutral vocabulary unchanged. Verdict: `GOS_3F_COMPLETE`. **Harness:** **1974/1974**; five consecutive runs all **1974/1974**; ×10 fresh-iframe determinism per fixture. **Non-regression:** developer API **105/105**; evaluator **62/62**; GOS-3C1 comparison **979/979** / **8** (byte-identical harness); pilot validator **69**; pilot harness **936/936**; GOS-1 validator **101**; schema **69/69**; protected blobs (`index.html`, developer API, evaluator, C1 harness) byte-identical to `4a11dd5`; `git diff --check` clean. Full storage/iframe restoration. Production-hosted developer comparison remains a separately approved post-push checkpoint. **GOS-4 not started.** **Push pending** separate approval. |
| **Growth Outcome Suitability — GOS-3E production inert verification** | Done (local) | **Documentation-only after production verification; no runtime/test/module/`index.html` change; no harness execution; no GOS evaluation; no product consumer; no UI/persistence/Sidecar/v1b mapping.** Production: https://friendly-taiyaki-64aacb.netlify.app/ corresponding to commit **`6d4d987ae6c35e089f4dd26a0a33c58fee0ac9ef`**. **Deployed assets (HTTP 200, `application/javascript`):** `/modules/suitability/growth-outcome-developer-api.js` (`GOS_DEVELOPER_API_VERSION` **0.1.0-gos3d**; `git hash-object` matches commit blob `f3ba70b6…`); `/modules/suitability/growth-outcome-evaluator.js` (**0.1.0-gos3a**; blob `174a6067…`). **Fresh Chrome profile:** normal app startup and entry-hub navigation sample (Smart Recommendations, Garden Design, Plant Doctor/diagnose, Identify, return toward My Garden) made **zero** requests for developer API, evaluator, pilot JSON, or developer-API harness; no GOS UI; no GOS window globals; v1b path unchanged. **Isolated descriptor-only import** of the developer API (temporary spies restored): loaded only API + evaluator static dependency; **no** `evaluateGrowthOutcomeForDeveloper` / biology / suitability calls; zero storage/cookie/IndexedDB/DOM/timer/listener/fetch/XHR/WebSocket/global side effects from the module; descriptor deeply frozen, `explicit_call_only`, `authoritative: false`, `runtimeWired: false`, `persistence: false`, `productConsumers: none`; unchanged across repeated reads. Reload after import still made zero automatic GOS requests. Standalone harness HEAD optional (**200**); **not executed**. **Verdict:** `GOS_3E_PRODUCTION_INERT_VERIFIED`. GOS remains **not product-enabled**. **GOS-3F not started.** **Push pending** separate approval. File: `PROJECT_STATUS.md` only. |
| **Growth Outcome Suitability — GOS-3D stopped developer-only API complete locally** | Done (local) | **Stopped, explicit-call-only, non-authoritative thin API over the pure evaluator; no `index.html` import, no runtime/product consumer, no mutable started/enabled state, no pilot load inside the API, no v1b mapping, no UI/persistence/Sidecar/SR/My Garden/Plant Doctor/Garden Design.** Files: `modules/suitability/growth-outcome-developer-api.js` (`GOS_DEVELOPER_API_VERSION` **0.1.0-gos3d**), `tests/growth-outcome-developer-api.test.html`, `PROJECT_STATUS.md`. **Exports:** `GOS_DEVELOPER_API_VERSION`, `GOS_DEVELOPER_CAPABILITY` (`explicit_developer_evaluation`), `GOS_DEVELOPER_MODES`, `GOS_DEVELOPER_API_REASONS`, `getGrowthOutcomeDeveloperApiDescriptor()`, `evaluateGrowthOutcomeForDeveloper(request)`. **Descriptor:** deeply frozen; `activation: explicit_call_only`; `authoritative: false`; `runtimeWired: false`; `persistence: false`; `productConsumers: none`; unchanged after successful calls. **Preflight fail-closed reasons:** `developer_capability_required`, `unsupported_mode`, `profile_required`, `invalid_profile`, `evidence_bundle_required`, `referenced_evidence_missing`, `trusted_location_required`, `valid_user_goal_required`, `user_goal_not_allowed_in_biology_mode` (biology rejects supplied `userGoal`). **Success:** native pass-through of `evaluateBiologicalGrowthOutcomes` / `evaluateGrowthOutcomeSuitability` inside frozen envelope `{ ok, apiStatus, reason, apiVersion, engineVersion, mode, result }`; nested result byte-identical to direct evaluator. **Harness:** **105/105**; five consecutive runs all **105/105**; ×10 determinism; input non-mutation; frozen outputs; zero storage/DOM/network/timer side effects during API calls; static `index.html` / identity-module isolation. **Non-regression:** evaluator **62/62** (byte-identical to `4df7541`); comparison **979/979** / **8** fixtures; pilot validator **69**; pilot harness **936/936**; GOS-1 validator **101**; schema harness **69/69**; `git diff --check` clean. Evaluator, schemas, pilot data, Climate Suitability v1b, and `index.html` unchanged. **Not production-enabled.** Superseded next: GOS-3E production inert verification — see GOS-3E checkpoint row. |
| **Growth Outcome Suitability — GOS-3C2 comparison conclusions and runtime-readiness contract** | Done (local) | **Documentation-only contract freeze; no runtime loader, no evaluator/schema/pilot/test harness change, no Climate Suitability v1b change, no Smart Recommendations/My Garden/Plant Doctor/Garden Design consumer, no UI, no persistence, no Sidecar consumer, no score/risk mapping, no new fixtures.** File: `PROJECT_STATUS.md` only. Freezes: (A) what Climate Suitability v1b answers vs (B) what GOS answers; (C) engines are not direct replacements / no winner / no cross-engine translation; (D) harness-native neutral vocabulary (`aligned_unknown`, `gos_preserves_unknown`, `blocker_scope_difference`, `applicability_difference`, `different_question_not_conflict`, `unresolved_due_missing_input`); (E) what GOS-3C1 proved; (F) what it did not prove (979/979 = approved matrix only); (G) eight mandatory runtime-readiness gates; (H) fallback when untrusted / missing GOS data; (I) deferred list including GOS-3D implementation and mismatched-context fixtures; (J) next step = separately approved **read-only GOS-3D planning only**. **Does not authorize runtime integration.** GOS-3C1 facts unchanged: **8** fixtures, **979/979**, five consecutive stable runs, ×10 determinism. Evaluator **62/62**, pilot **42/5**, registry **1.5.0 / 76 / 1 / 9**, hydration production-verified closed. **Push pending** separate approval. **GOS-3D not started.** |
| **Plant-card image hydration lifecycle stabilization** | Done (pushed / production verified) | **Runtime plant-card hydration + Audit baseline boundary only; no Sidecar/identity/GOS/evaluator/v1b/SR/schema/pilot change; no search/result image-path change; no Audit-only hydration suppression; no fixed delay; no save-without-render workaround.** Files: `index.html`, `tests/my-garden-identity-audit.test.html`, `PROJECT_STATUS.md`. **Runtime:** generation-based stale-result rejection; pass-level batched `service.save` + single `render()`; dedicated plant-card in-flight Set (search/`hydratePlantResultImages` still uses `imageHydrationQueue` unchanged); pass mutex + coalesced retry; retry-safe cleanup after failure/stale; explicit read-only idle contract `isPlantCardHydrationIdle()` / `waitForPlantCardHydrationIdle()` covering scheduled timeout, active pass, in-flight fetches, flush pending, queued retry. Successful current-generation pass still applies resolved URLs, persists them, and performs one batched render so the resolved image displays in the current session. **Audit:** waits for real plant-card hydration idle (existing `waitFor`, 30s bound) before capturing `bodyBefore`; clear failure if idle never reached; `no DOM mutation from audit` equality assertion **unchanged**. Assertion total **126 → 127** (+1 idle-before-baseline). **Behavioral probe (TEMP):** normal saves=1/renders=1 + session DOM display + persisted `imageUrl`; four-plant batch saves=1/renders=1; stale zero mutation/save/render; fail clears in-flight and returns idle/retryable; idle false while scheduled/fetching/flushing and true after success/fail/stale cleanup; result path uncoupled. **Strict Audit gate:** **20/20 consecutive fresh Chrome profiles all 127/127**; zero DOM-mutation failures; zero idle-timeout failures. **Non-regression:** comparison **979/979** (eight fixtures; blob unchanged vs GOS-3C1 `6f37ee4`); evaluator **62/62**; pilot validator **69**; pilot harness **936/936**; GOS-1 validator **101**; schema **69/69**; Resolver **108/108**; Reconciliation **158 / 156 PASS / 2 EXPECTED_QUARANTINED_CONFLICT / 0 unexpected**; Identity **81**; registry **1.5.0 / 76 / 1 / 9**; `git diff --check` clean. **GOS-3C1 implementation remains unchanged.** **Pushed** to `origin/main` at commit **`f7d320cf36b5eb669adcedab701a50e6c218986a`** (together with GOS-3C1). **Automatic Netlify deploy** — no manual deploy or Netlify settings change. **Production verified** at https://friendly-taiyaki-64aacb.netlify.app/ corresponding to that commit: app smoke OK; My Garden / plant cards / Add Plant / language / location intact; four eligible plants resolved with same-session display; **one storage write** and **one batched hydration render** after the initiating render; no render/save/fetch loop; reload reused all four persisted image URLs; production Identity Audit **127/127**; hydration-idle and strict no-DOM-mutation assertions passed (`before=432987 after=432987`); no fatal console errors; no GOS runtime evaluator/pilot/comparison assets requested. **Checkpoint closed** — does **not** block GOS work. **GOS-3C2 not started.** |
| **Growth Outcome Suitability — GOS-3C1 expanded comparison matrix complete locally** | Done (local) | **Test-only comparison-matrix expansion only; no production API, no v1b copy, no evaluator/schema/pilot change, no runtime GOS loading, no Smart Recommendations change, no UI/persistence/identity/Sidecar integration, no cross-engine score/risk map.** Updated `tests/growth-outcome-v1b-comparison.test.html` only (+ `PROJECT_STATUS.md`). Kept all five GOS-3C0 mango fixtures. **Added exactly three Florida-aligned fixtures (total 8):** `lychee_florida_mature_freeze_conflict_preserved` (Homestead Subtropical / freeze `conflictsWith` preserved → survival `unknown` + `sourceCoverage.conflicting`); `florida_bougainvillea_mature_flowering_display` (Miami Tropical / `floweringDisplay` vs fruitSet+ripening `unknown`); `florida_mature_mango_bloom_fruitset_cold` (Homestead / bloom+small-fruit `mango_set_flower_cold` on fruitSet only; survival `possible` empty blockers). **Generic fact-based rule:** reproductive blocker absent from survival → `blocker_scope_difference` before `gos_preserves_unknown` (no new fixture-ID classifier branch; `expectedPrimaryCategory` assertion-only). **Verdict:** GOS_3C1_COMPLETE. **Harness:** **979/979 PASS**. **Five consecutive runs:** all **979/979**. Each of 8 fixtures × **10** fresh iframes; byte-identical normalized v1b/GOS/comparison; storage/cookie/location restored; no confirmed-location leakage; no runtime GOS fetch; no Sidecar; no winner language. **Perf medians (dev only):** iframe bootstrap ~208–229 ms; v1b ~1.3–1.5 ms; GOS ~1.0 ms; comparison ~273–296 ms. **Deferred mismatched-context fixtures:** Olive Mediterranean/California; Apple temperate/California; Mango California region exclusion; chill/pollinizer/cultivar/protected-environment pairs; score/risk mapping. **Non-regression (comparison-adjacent suites):** evaluator **62/62**; pilot validator **69**; pilot harness **936/936**; GOS-1 validator **101**; GOS-1 harness **69/69**; Resolver **108/108**; Reconciliation **158 / 156 PASS / 2 EXPECTED_QUARANTINED_CONFLICT**; Identity **81**; registry **1.5.0 / 76 / 1 / 9**; `git diff --check` clean. Runtime, evaluator, Climate Suitability v1b, Smart Recommendations, schema, pilot data, UI, persistence, identity, and Sidecar were **unchanged** by GOS-3C1. **My Garden Identity Audit (checkpoint verification):** intermittent — not a consistent **126/126**. Sole failed assertion: `no DOM mutation from audit`. Isolation investigation: late **plant-image hydration** in `index.html` (`render()` → `setTimeout(hydratePlantCardImages,0)` → `fetchPlantImageFromWikipedia` → `service.save` / `render`) rewrote existing My Garden plant-card `img` `src`, inline `background-image`, and `data-fallback-list` (Netlify `plant-image` proxy → Wikipedia/Wikimedia); node count unchanged (**827→827**); mutation **not** in Sidecar-related DOM. Audit **never loaded** either GOS-3C1 file (`tests/growth-outcome-v1b-comparison.test.html`, `PROJECT_STATUS.md`). Loaded runtime/Audit/Sidecar/identity/`index.html` blobs were **byte-identical** between baseline `01718c0` and current HEAD. Controlled isolation (identical TEMP runner): LIVE_CURRENT_HEAD **9/10**, EXPORTED_CURRENT_HEAD **9/10**, EXPORTED_BASELINE **10/10**. **GOS-3C1 causation not established** — no causal execution path found. Investigation did **not** establish a baseline-reproduced “known pre-existing flake”; do **not** classify as Sidecar flake or accepted quarantine. Plant-image hydration race is **outside GOS-3C1 scope** (separate future checkpoint); **no runtime fix** made in this commit. **Push pending** separate explicit approval. **Next:** separately approved GOS-3C2 / next-matrix planning only — **not started**. |
| **Growth Outcome Suitability — GOS-3C0 comparison feasibility complete locally** | Done (local) | **Test-only feasibility/determinism harness only; no production API, no v1b copy, no runtime GOS loading, no Smart Recommendations change, no UI/persistence/identity/Sidecar integration, no full fixture matrix, no cross-engine risk-band map.** Added `tests/growth-outcome-v1b-comparison.test.html`. Parent harness imports pure GOS evaluator + loads pilot JSON only; same-origin iframe loads real `../index.html` and invokes live `evaluateClimateSuitabilityV1` / `setAppLocation` / `getAppLocation` / `hasTrustedAppLocation` (post-ready weather stub only; no Sidecar wait; no bootstrap-time spies). **Exact five fixtures:** `untrusted_location_mango`, `trusted_warm_mango_mature_ornamental`, `trusted_warm_mango_mature_reliable_yield`, `florida_young_mango_cold`, `florida_mature_mango_same_cold`. **Verdict:** READY_FOR_FULL_GOS_3C. **Harness:** **601/601 PASS**. **Five consecutive normal-browser runs:** all **601/601**. Each fixture × **10** fresh create/destroy iframes with byte-identical normalized v1b, GOS, and comparison outputs. State: parent localStorage/sessionStorage snapshotted+restored; cookies unchanged; location restored; iframe destroyed every fixture; finally restore; no confirmed fixture location remains. **Observed findings (non-judgmental):** both engines preserve untrusted-location blocking (`aligned_unknown`); v1b one broad result vs GOS six outcomes; `userGoal` changes GOS interpretation only (B/C biology + v1b byte-identical; v1b warm mango `good`/score 71); v1b has no age model; GOS age applicability distinguishes young (`mango_surv_young_freeze_kill` / `blocker_scope_difference`) vs mature (`applicability_difference` / `different_question_not_conflict`). No winner language; no score bridge; cross-engine risk-band mapping deferred. **v1b levels:** notRecommended, unknown, risky, possible, good, excellent. Score-null: untrusted location; missing plant. **Perf medians (dev only, not SLA):** iframe bootstrap ~349 ms; v1b ~1.7 ms; GOS ~1.25 ms; one comparison ~466 ms; five-fixture harness ~26 s. **Non-regression:** evaluator **62/62**; pilot validator **69**; pilot harness **936/936**; GOS-1 validator **101**; GOS-1 harness **69/69**; Audit **126/126**; Resolver **108/108**; Reconciliation **158 / 156 PASS / 2 EXPECTED_QUARANTINED_CONFLICT**; Identity **81**; registry **1.5.0 / 76 / 1 / 9**; `git diff --check` clean. **Superseded next:** GOS-3C1 complete locally — see GOS-3C1 checkpoint row. |
| **Growth Outcome Suitability — GOS-3A / GOS-3B isolated evaluator complete locally** | Done (local) | **Pure fixture-driven evaluator + standalone harness only; no runtime loader, global API, product UI, Climate Suitability v1b change, Smart Recommendations change, Add Plant / Plant Identifier / Garden Design integration, persistence, Sidecar consumer, or automatic pilot-data loading.** Added `modules/suitability/growth-outcome-evaluator.js` (`engineVersion` **0.1.0-gos3a**) and `tests/growth-outcome-evaluator.test.html` (**62/62 PASS**). **Exact exports:** `evaluateBiologicalGrowthOutcomes`, `interpretGrowthOutcomesForGoal`, `evaluateGrowthOutcomeSuitability`, `GROWTH_OUTCOME_NAMES`, `GROWTH_OUTCOME_LEVELS`, `GROWTH_OUTCOME_GOALS`, `GROWTH_OUTCOME_ENGINE_VERSION`. Pure ES module: no DOM, window global, storage, network, timers/listeners, mutable module cache, or application-state access; no import-time execution; no `index.html` wiring. **Six outcomes remain exact and independent:** `survival`, `vegetativeGrowth`, `flowering`, `fruitSet`, `fruitRipeningOrYield`, `longTermReliability`. **Biology vs goal:** biological function does not accept/read `userGoal`; goal interpretation runs after biology; changing only `userGoal` leaves biological outcomes byte-identical. **Category-first:** emits only `possible` / `risky` / `notRecommended` / `unknown`; `internalScore` always `null`; never emits `excellent`/`good`; unknown never becomes score 50. **Applicability:** explicit normalized `regionTags`/`climateTags` only — no coordinate or climate-similarity inference; Florida evidence excluded without compatible tags; cultivar/age/environment/stage filtered independently; broad+specific may coexist; no silent specificity winner; contradiction only via explicit `conflictsWith` or profile `conflicting` (no threshold averaging; age-differentiated Mango claims are not false conflicts). **Hard blockers:** require complete applicable context + comparable input + units; missing age/duration/region/environment/value → unknown or risky with low confidence — not high-confidence blockers. Locked pilot semantics preserved (young Mango age-specific; mature ~25°F limiting; bloom/small-fruit cold → fruitSet only; Bougainvillea frost/zone limiting; Lychee freeze not averaged). **Dependency caps only** (no success inheritance; unknown earlier stages do not fabricate blockers; later stages not auto-`notRecommended`). Outputs deterministic and deeply frozen. **Validation:** evaluator harness **62/62**; pilot validator **69 PASS**; pilot harness **936/936**; GOS-1 validator **101 PASS**; GOS-1 harness **69/69**; Audit **126/126**; Resolver **108/108**; Reconciliation **158 / 156 PASS / 2 EXPECTED_QUARANTINED_CONFLICT / 0 unexpected**; Identity validator **81 PASS**; registry **1.5.0 / 76 / 1 / 9**; `git diff --check` clean. **Perf medians (this machine, 2 warmups + ≥20 iters; development only, not product SLA):** one profile ~0.95 ms; five profiles ~2.70 ms (~0.54 ms/profile); ×100 ~83.0 ms; ×500 ~319.9 ms (~0.64 ms/eval). **Known limitations:** no production region mapper; no climate-normal / chill-hour / Dynamic Chill / GDD / frost-free-season integration; no numeric scoring; no product prose; no runtime identity resolution; no Sidecar consumer; pilot fixtures only. Known pre-existing Sidecar harness race remains a separate test-infrastructure issue (not a GOS-3A/3B blocker). **Next:** GOS-3C — isolated comparison harness against Climate Suitability v1b (test-only; document where v1b and GOS answer different questions; verify v1b/SR unchanged; no automatic winner; no app pilot load; no UI/runtime/persistence/Sidecar). Later separately gated: GOS-3D stopped developer API → GOS-3E prod inert verify → GOS-3F explicit developer comparison → GOS-4 read-only display planning. |
| **Growth Outcome Suitability — GOS-2B Mango-led pilot dataset complete locally** | Done (local) | **Pilot evidence + profiles + isolated validation only; no evaluator, runtime loader, product UI, Climate Suitability v1b change, Smart Recommendations ranking, Add Plant / Plant Identifier integration, persistence, Sidecar consumer, catalog-wide evidence, or user-outcome learning.** Added `data/growth-outcome-pilot/evidence.json` (**42** source-backed evidence records), `data/growth-outcome-pilot/profiles.json` (**5** profiles · **30** explicit outcome blocks), `scripts/validate-growth-outcome-pilot.ps1` (**69 PASS**, exit 0), `tests/growth-outcome-pilot.test.html` (**936/936 PASS**). Updated `scripts/validate-growth-outcome.ps1` coexistence assertion only: GOS-1 remains synthetic-only via `$paths` (does not load/depend on pilot files); obsolete “no pilot directory” assert replaced; schema safeguards preserved; assertion total remains **101 PASS**. **Evidence by plant:** Mango **18** · Lychee **9** · Apple **4** · Olive **4** · Bougainvillea **7**. **Sources:** **8** hardened publications/records (MG216, HS1499, MG051, EP130, DAV1993, HART1975, UCIPM olive, UCANR 8261) across **5** authority groups (UF/IFAS, CTAHR/UH, ASHS, UC IPM, UC ANR). All six outcomes remain explicit per profile (no inherited later-stage success). Regional, cultivar, age, environment, and source limitations preserved. **No high confidence.** No global Mango-yield claim; no global Apple chill-hour threshold; no global Olive chill threshold; no Bougainvillea edible-fruit conclusion. **Profile completeness matrix (dataStatus / confidence):** Mango — survival supported/medium; vegetativeGrowth partial/low; flowering partial/low; fruitSet partial/low; fruitRipeningOrYield unknown/none; longTermReliability unknown/none. Lychee — survival supported/medium; vegetativeGrowth partial/low; flowering partial/low; fruitSet partial/low; fruitRipeningOrYield unknown/none; longTermReliability partial/low. Apple — survival unknown/none; vegetativeGrowth unknown/none; flowering partial/low; fruitSet partial/low; fruitRipeningOrYield unknown/none; longTermReliability partial/low. Olive — survival partial/low; vegetativeGrowth partial/low; flowering conflicting/low; fruitSet unknown/none; fruitRipeningOrYield unknown/none; longTermReliability supported/medium. Bougainvillea — survival partial/low; vegetativeGrowth partial/low; flowering supported/medium; fruitSet unknown/none; fruitRipeningOrYield unknown/none; longTermReliability partial/low (`Bougainvillea spp.`, `needsReview: true`). **Locked effects:** mature Mango ~25°F → limiting (not hard_blocker); young Mango kill → hard_blocker with young-tree applicability; Bougainvillea frost/zone → limiting; Mango flower/small-fruit cold → fruitSet hard_blocker only; Lychee freeze MG051/HS1499 remain separate (not averaged) with `conflictsWith`. **Validation:** pilot validator **69 PASS**; pilot harness **936/936**; GOS-1 validator **101 PASS**; GOS-1 harness **69/69**; Audit **126/126**; Resolver **108/108**; Reconciliation **158 / 156 PASS / 2 EXPECTED_QUARANTINED_CONFLICT / 0 unexpected**; Identity validator **81 PASS**; `registryVersion` **1.5.0**; **76** canonical; **1** pending; **9** plantIds; `git diff --check` clean. **Known pre-existing Sidecar harness race (test infrastructure, not a GOS-2B regression):** normal-browser/headless instrumentation can intermittently observe late fetch/storage/DOM activity from the real `index.html` iframe bootstrap; same behavior reproduces on clean HEAD `e91b922`; no Sidecar code changed; GOS-2B does not reference/consume Sidecar; harness must be stabilized before any future Sidecar runtime/consumer/persistence phase. Sidecar product behavior itself is unchanged. **No runtime product wiring** (`index.html` / modules do not load pilot data). **Next:** GOS-3 — pure shadow evaluator forensic planning and algorithm contract (read-only investigation/planning only; do not implement evaluator, load pilot at runtime, modify product, change Climate Suitability v1b, rank Smart Recommendations, display GOS results, persist computed outcomes, or auto-consume Sidecar). |
| **Growth Outcome Suitability — GOS-1 schema/evidence contract complete locally** | Done (local) | **Schema/evidence contract only; no engine, pilot botanical data, catalog, climateTraits, Climate Suitability v1b, UI, ranking, Add Plant, Plant Identifier, persistence, Sidecar consumer, or runtime loader.** Added `data/growth-outcome.schema.json` (biological profiles), `data/growth-outcome-evidence.schema.json` (source-backed claims), `scripts/validate-growth-outcome.ps1` (101 PASS, exit 0), `tests/growth-outcome-schema.test.html` (69/69 PASS). Draft-07; no package dependency; no product integration. **Six required outcomes:** `survival`, `vegetativeGrowth`, `flowering`, `fruitSet`, `fruitRipeningOrYield`, `longTermReliability` (fruit set and ripening remain distinct). **Boundaries:** biological evidence separate from computed suitability; profile / evidence / regional applicability / computed result separate; user goal belongs to future interpretation/ranking only; each later stage needs its own evidence; missing later-stage evidence stays `unknown`; `supported` requires evidenceRefs; confidence separate from suitability; conflicting evidence preserved; `legacyClimateTraitsCoverage` = `none` \| `environment_only` so climateTraits cannot imply complete GOS; plants without a GOS profile continue using Climate Suitability v1b unchanged. Forbidden on canonical profiles: `score`, `level`, `goalFit`, `recommendedUse`, `overallConclusion`, `suitabilityScore`. No Mango thresholds or botanical claims. Non-regression: Sidecar **126/126**; audit **126/126**; resolver **108/108**; reconciliation **158 / 156 PASS / 2 quarantined / 0 unexpected**; identity validator **81 PASS**; `registryVersion` **1.5.0**; **76** canonical; **1** pending; **9** plantIds. **Next:** GOS-2A — read-only evidence-source audit and claim mapping for the Mango-led pilot (research/source selection only; no pilot JSON; no schema change; no evaluator). **GOS-2B** pilot-data entry requires explicit approval after GOS-2A review. |
| **My Garden Canonical Read-Only Adoption — Phase C2 production verified** | Done (pushed) | **Documentation checkpoint for production verification of the inert Sidecar; no application code change in this docs commit.** Deployed at `main` / `origin/main` **`3b8452dfe6a895bd8c73853a2c593ae8e6fe65bf`**. Frozen global `window.CruvitGardenIdentitySidecar` with exact 10-method API: `start`, `stop`, `isStarted`, `consult`, `consultMany`, `get`, `delete`, `clear`, `status`, `snapshot`. **Production fresh load:** Sidecar exists and API frozen; `started: false`; `size: 0`; no automatic population; developer audit remains disabled. **Explicit isolated fixture verification only** (temporary fixtures; no personal/stored garden read): start + consultations completed without runtime error; `stop()` cleared in-memory entries; no application UI change observed. **Reload:** `started: false`, `size: 0` — confirms no persisted Sidecar state, no URL/storage activation, no automatic restart, no retained entries, no runtime consumer, no authority promotion. Sidecar remains **infrastructure only** and is **not used by My Garden behavior**. Local ship harnesses remain green: Sidecar **126/126**; audit **126/126**; resolver **108/108**; reconciliation **158 / 156 PASS / 2 quarantined**; validator **81 PASS**; network deltas **0**. Existing quarantine behavior unchanged (SG accepted/synonym; Mulberry `pending_conflict`; conflicting signals `ambiguous`; no fabricated plantId; no plant/meta mutation; no persistence/migration; no UI/task/care influence; no extra registry request). **Decision — do not proceed now to automatic lazy/idle population:** it would introduce automatic runtime work before an approved product consumer; the inert Sidecar already proves canonical read-only infrastructure is safe; automatic population can be reconsidered later when Shared Plant Picker, Add Plant, or another approved read-only consumer needs it. Canonical persistence, Shared Plant Picker, and consumer integration remain separate explicitly approved phases. **Rollback** = revert this documentation (code already on `main` at `3b8452d`). **Next recommended task:** read-only Growth Outcome Suitability forensic audit and architecture/data planning (investigation only). |
| **My Garden Canonical Read-Only Adoption — Phase C1 production verified** | Done (pushed) | **Documentation checkpoint for production verification of the shared pure consultation extraction; no application code change in this docs commit.** Deployed at `main` / `origin/main` **`d2392493ff8809e640d47f016f50d03d3a664ab7`**. Shared module `modules/identity/garden-plant-identity-consult.js` loads through the existing audit **ES-module import graph**; **`index.html` unchanged** (no extra script tag required). Frozen globals: `window.CruvitGardenPlantIdentityConsult` (`GARDEN_IDENTITY_SIGNAL_FIELDS`, `buildGardenPlantIdentityFingerprintInput`, `collectGardenPlantIdentitySignals`, `resolveGardenPlantIdentityReadOnly`) and `window.CruvitGardenIdentityAudit`. **Production verification:** `sharedExists/sharedFrozen/auditExists/auditFrozen/reportFrozen/resultsFrozen/everyResultFrozen: true`; `auditEnabledNow: false` on fresh load; `shadowStatus: ready`; `registryVersion: 1.5.0`. Direct shared consult: `Psidium cattleianum` → `resolved_canonical` / `strawberry-guava` / `plantId: null` / `matchedBy: scientificSynonym`. Audit parity identical: accepted `Psidium cattleyanum` → `scientificName`; synonym `Psidium cattleianum` → `scientificSynonym`; Mulberry → `pending_conflict` with null ids; Avocado `profileSlug` + Strawberry Guava scientific → `ambiguous` / `conflicting_signals` with null ids. Non-regression: shared + audit outputs deeply frozen; audit disabled by default; no automatic consultation; no saved-object mutation; no persistence; no UI/task change; no runtime authority change; **no Sidecar**; **no `plantId`/`canonicalSlug` persistence**; **no migration**. Local ship harnesses: audit **126/126**; resolver **108/108**; reconciliation **158 / 156 PASS / 2 quarantined**; validator **81 PASS**; network deltas **0**. **Rollback** = revert this documentation (code already on `main` at `d239249`). **Next recommended task:** Phase C2 — smallest inert developer-only in-memory Sidecar (see Next Recommended Task). **Growth Outcome Suitability** remains locked after safe canonical read-only adoption. |
| **Controlled Canonical Identity Coverage Measurement — Complete** | Done (local) | **Read-only measurement + test-harness correction only; no runtime, audit-module, index.html, registry, resolver, shadow, persistence, UI, task, Sidecar, migration, or authority change.** Ran in an isolated same-origin temporary environment with a fresh temporary browser profile (not the user’s real stored garden; `runStored()` not used on personal/production garden). **Synthetic fixture suites (resolver-safety only — not real-user market coverage):** 20 / 100 / 500 plants with exact expected-versus-actual status counts; 525-input truncation suite processed **500** and truncated **25**. **Safety:** zero plant / nested-meta mutation; zero storage, cookie, UI, task, or render mutation; deterministic repeated results; report buffer capped at **10**; Mulberry remained `pending_conflict`; conflicting canonical signals remained `ambiguous` / `conflicting_signals`; no fabricated `plantId`; **zero** audit network deltas (fetch / XHR / beacon / WebSocket / identity-registry) during explicit `api.run()`; no audit background work while disabled. **Performance (this machine, preliminary):** ~0.30 ms median (20), ~1.85 ms (100), ~10.20 ms (500). **Harness false-positive correction** (`tests/my-garden-identity-audit.test.html` only): prior cumulative `net.fetch === 0` assertion counted unrelated My Garden plant-knowledge / Wikipedia traffic outside the audit window; corrected test measures strict network deltas only immediately before/after synchronous `api.run()` — no domain whitelist and no weakening of the zero-network guarantee. Final harness totals: audit **78/78 PASS**; resolver **108/108**; reconciliation **158 / 156 PASS / 2 EXPECTED_QUARANTINED_CONFLICT**; validator **81 PASS** exit 0; `registryVersion` **1.5.0**; **76** canonical; **1** pending; **9** plantIds; `git diff --check` clean. **Sidecar decision: GO — architecture planning only.** GO authorizes only a separate read-only Sidecar forensic audit and architecture plan. It does **not** authorize Sidecar implementation, automatic runtime consultation, plant mutation, `plantId`/`canonicalSlug` persistence, migration, UI/task/care use, or runtime authority change. `CruvitGardenIdentityAudit` remains developer-only and disabled by default; legacy My Garden remains authoritative. **Growth Outcome Suitability** remains the next locked strategic layer after safe canonical read-only adoption — still unimplemented. **Next recommended task:** read-only forensic audit and architecture planning for an advisory in-memory My Garden canonical identity Sidecar. |
| **My Garden Canonical Read-Only Identity Adoption — Phase A production verified** | Done (pushed) | **Developer-only in-memory audit; production verified at deployed commit `5ad556bd9f55643ca5a4fa7867a9c25426329936`.** Frozen global `window.CruvitGardenIdentityAudit` is present in production; **disabled on every fresh load**; no URL / localStorage / sessionStorage / cookie activation; **no automatic audit execution**; reload resets enabled state; results are **advisory and in-memory only**. Consults existing `CruvitIdentityShadow` only (no second resolver). Independent signal consultation; pending-conflict protection; conflicting canonical signals → `ambiguous` / `conflicting_signals` (no majority vote); max **500** plants/run; max **10** retained reports. **Production fixture verification (isolated fixtures; not the user’s real stored garden):** `auditStatus: ok`; `totalPlants: 8`; `resolvedIdCount: 2`; `resolvedCanonicalCount: 4`; `pendingConflictCount: 1`; `ambiguousCount: 1`; `conflictingSignalCount: 1`; `distinctCanonicalIdentityCount: 3`; `duplicateInstanceIdentityCount: 3`; `migrationCandidateCount: 2`. Fixture behavior verified: Lavender `plantId` → `resolved_id`; Avocado `profileSlug` → `resolved_canonical`; `Psidium cattleyanum` → strawberry-guava via `scientificName`; `Psidium cattleianum` → strawberry-guava via `scientificSynonym` (strawberry-guava `plantId` remains null); Mulberry → `pending_conflict` with null `canonicalSlug`/`plantId`; Hebrew Lavender → `resolved_id` via `localizedName`; conflicting Avocado `profileSlug` + Strawberry Guava scientific → `ambiguous` / `conflicting_signals`; duplicate GardenPlant instances share the same canonical identities. **Production non-regression:** `inputUnchanged: true`; `storageUnchanged: true`; `extraRegistryRequests: 0`; frozen API/report/results; no fabricated `plantId`; no UI/task/persistence/saved-object/authority change; Live Search untouched. **Explicit:** audit remains developer-only and disabled by default; legacy My Garden behavior remains authoritative; **no Sidecar approved**; **no `plantId`/`canonicalSlug` persistence approved**; **no migration approved**. Local harness totals at ship: audit **76/76** (later coverage checkpoint corrected network attribution → **78/78**); resolver **108/108**; reconciliation **158 / 156 PASS / 2 quarantined**; validator **81 PASS**. **Rollback** = revert this documentation (code already on `main` at `5ad556b`). **Superseded next task:** controlled coverage measurement is complete — see **Controlled Canonical Identity Coverage Measurement — Complete**. |
| **Canonical Identity Foundation v1 — Frozen and production verified** | Done (pushed) | **Documentation-only freeze; no code, registry, schema, validator, resolver, catalog, persistence, UI, or authority change in this checkpoint.** Production-verified at `main` / `origin/main` **`3abdde508203382198c63ca21cd1cda43370a42a`**. **Frozen scope:** authoritative registry structure (Model C identity layer); opaque immutable `plantId` format (`^plt_[a-z0-9]{16}$`); `canonicalSlug`, aliases, module keys; `acceptedScientificName`; structured `scientificSynonyms`; `localizedNames` foundation; conflict quarantine (`duplicateConflicts`); exact resolver precedence with collision/ambiguity protection; advisory shadow mode (`CruvitIdentityShadow` + developer-gated debug, off by default); validator + browser test foundations; avocado + strawberry-guava identity and catalog pilots; production verification completed. **Production-verified outcomes:** avocado identity conflict resolved + catalog deduplicated; strawberry-guava identity conflict resolved (`acceptedScientificName: Psidium cattleyanum`; scientific synonym `Psidium cattleianum`); strawberry-guava catalog deduplicated so all approved legacy lookup paths return one catalog object; Add Plant search for `גויאבה תותית` returns one result; accepted name resolves via `matchedBy: scientificName`; synonym via `matchedBy: scientificSynonym`; strawberry-guava `plantId` remains null; guava / `Psidium guajava` remains separate; mulberry remains `pending_conflict`; shadow ready / `version()=1.5.0` / debug disabled; canonical resolver advisory only; no persistence or saved-object shape change; no user-data migration; no runtime authority change. **Frozen counts:** `registryVersion` **1.5.0**; **76** canonical identities; **1** pending conflict; **9** plantIds; **2** localized-name identities; **2** Hebrew locale blocks; **1** indexed scientific synonym (1 synonym identity / 1 synonym entry). **Deliberate exclusions from the freeze:** mulberry remains `pending_conflict` (no further conflict resolution required before the next roadmap phase); no mass plantId allocation; no large catalog expansion; no full localized-name expansion; no authoritative runtime adoption; no saved-user migration; no My Garden plantId persistence; no catalog-wide taxonomy cleanup. **Freeze rule:** future identity changes must be evidence-backed, additive where possible, validator-covered, independently tested, backward compatible, and isolated from My Garden persistence unless explicitly approved. **Separate known issue (not in this foundation):** Add Plant Live Search may expose technical abort messages; does not invalidate local-search correctness; fix later; must not be mixed into My Garden canonical adoption. **Rollback** = revert this documentation entry and restore prior Phase B / next-task wording (no data/code to restore). **Next recommended task:** read-only audit and implementation planning for My Garden canonical read-only identity adoption (planning first — no `plantId`/`canonicalSlug` persistence, no localStorage migration, no UI change, resolver remains non-authoritative). |
| **Strawberry-guava PLANT_LIBRARY catalog deduplication** | Done (pushed) | **Catalog descriptive-layer cleanup only; no plantId; canonical identity remains advisory; legacy runtime remains authoritative.** Removed the earlier duplicate strawberry-guava `PLANT_LIBRARY` row (Record A, `Psidium cattleianum`). Exactly **one** legacy descriptive strawberry-guava catalog row remains (Record B, at its existing array position) with accepted scientific name **Psidium cattleyanum**. `PLANT_INDEX`, `findPlantByName`, `resolvePlantProfileRawLegacy`, and the `resolvePlantProfileRaw` wrapper now return the **same strawberry-guava object** for approved slug, English, Hebrew, accepted-scientific, synonym-scientific, and cherry-guava lookup forms. Surviving fields: `slug: strawberry-guava`, `name: Strawberry Guava`, `he: גויאבה תותית`, `scientific: Psidium cattleyanum`, `status: Evergreen fruit shrub/tree`, `mark: ✓`, `size: 2–6 m`; Record B sun/water/growth/climate/season/guide unchanged. **Aliases exactly:** `strawberry guava`, `psidium cattleyanum`, `psidium cattleianum`, `cherry guava`, `גויאבה תותית` — **cherry guava remains catalog-search-only** (not added to the identity registry). **Tags exactly:** `fruit`, `tree`, `shrub`, `sun`, `גויאבה תותית` — broad Hebrew tag `גויאבה` removed from this record to avoid cross-search with common guava. **Warnings exactly (5):** self-seed in some regions; fruit drop messy; fruit fly in some areas; needs space if allowed to grow; needs pruning to prevent dense growth — conditional/regional wording retained; not universally invasive. **Products remain exactly Record B** (`Fruit tree fertilizer`, `Mulch`, `Pruning shears`, `Fruit fly trap`) — **Compost was not added**. Guava / `Psidium guajava` / `גויאבה` remains a separate catalog record and canonical identity. Add Plant / save-path: `profileSlug` remains `strawberry-guava`; scientific remains `Psidium cattleyanum`; existing saved-object keys/shape unchanged; **no migration**; **no `plantId` or `canonicalSlug`** copied into catalog or saved-user objects. Advisory shadow unchanged: accepted name → `matchedBy: scientificName`; synonym → `matchedBy: scientificSynonym`; `plantId: null`; `registryVersion` **1.5.0**. Smart Recommendations `invasive-caution` / `regional_review` unchanged. Botanical-engine already maps `strawberry guava` / `גויאבה תותית` → `Psidium cattleyanum` and was **not modified**. **Registry unchanged** at this checkpoint: `registryVersion` **1.5.0**; **76** canonical; **1** pending conflict (**mulberry**); **9** plantIds; **1** indexed scientific synonym; strawberry-guava still has **no plantId**. Verified: standalone resolver **108/108 PASS**; reconciliation **158 total — 156 PASS, 0 KNOWN_LEGACY_BUG, 0 KNOWN_RESOLVER_GAP, 2 EXPECTED_QUARANTINED_CONFLICT, 0 EXPECTED_RESOLVED_IDENTITY_CATALOG_DUPLICATE, 0 UNEXPECTED_FAILURE**; validator **81 PASS exit 0**; `git diff --check` clean. **Rollback** = restore deleted Record A, restore former Record B aliases/tags/warnings, restore prior reconciliation expectations, and revert documentation. **Next recommended task:** freeze Canonical Identity Foundation v1, then begin My Garden canonical read-only adoption planning (preserve mulberry pending, `registryVersion` 1.5.0, no new plantId, resolver advisory, legacy authoritative, no saved-data migration yet). |
| **Strawberry-guava identity-layer pilot (Psidium cattleyanum + synonym)** | Done (local; not pushed) | **Identity-layer resolution only; catalog descriptive rows were not deduplicated; no plantId; resolver remains advisory; legacy runtime remains authoritative.** Completed the strawberry-guava quarantined-conflict pilot using the verified scientific-synonym foundation. External botanical verification confirmed **Psidium cattleyanum** as the accepted scientific name and **Psidium cattleianum** as a verified scientific synonym for one species-level identity; **Psidium guajava** / `guava` remains a separate canonical species. Common-name modeling such as **cherry guava** was not changed. Invasive-risk handling remains regional and outside the identity layer. **Registry changes:** removed strawberry-guava from `duplicateConflicts`; added exactly one `canonicalIdentities` entry — `canonicalSlug: strawberry-guava`, `acceptedScientificName: Psidium cattleyanum`, one `scientificSynonyms` entry (`name: Psidium cattleianum`, `relationship: synonym`, `confidence: high`, `needsReview: false`) with structured sources **WFO** `wfo-0000284334` and **POWO** `urn:lsid:ipni.org:names:600760-1` (`verifiedAt: 2026-07-16`); identity `needsReview: false`; **no `plantId`**, **no `localizedNames`**, **no `aliasSlugs`**, **no `moduleKeys`**, and **no** care/product/climate/guide/icon/mark/status/UI-copy fields. **`registryVersion` advanced 1.4.0 → 1.5.0**; canonical count **75 → 76**; pending conflicts **2 → 1** (**mulberry** remains the only pending duplicate conflict); plantId count remains **9**. Resolver (advisory/shadow): `strawberry-guava` → `resolved_canonical` / `matchedBy: canonicalSlug` / `plantId: null`; `Psidium cattleyanum` → `resolved_canonical` / `matchedBy: scientificName` / `plantId: null`; `Psidium cattleianum` → `resolved_canonical` / `matchedBy: scientificSynonym` / `plantId: null`; `Psidium guajava` maps only to `guava`; avocado remains `resolved_canonical` with `plantId: null`; mulberry remains `pending_conflict`. **Catalog unchanged:** both strawberry-guava `PLANT_LIBRARY` rows remain in `index.html` — Record A still uses `Psidium cattleianum`, Record B still uses `Psidium cattleyanum`; `PLANT_INDEX` / Add/save still select Record B; `findPlantByName` may still select Record A. This temporary state remains classified as **`EXPECTED_RESOLVED_IDENTITY_CATALOG_DUPLICATE`** (not presented as repaired). Botanical-engine aliases were not modified. Persistence, saved-user data, object shape, UI, localStorage, telemetry, and network-write behavior unchanged; **no `plantId` or `canonicalSlug` is persisted**. Verified: standalone resolver **108/108 PASS**; validator **81/81 PASS exit 0**; reconciliation **145 total — 138 PASS, 0 KNOWN_LEGACY_BUG, 0 KNOWN_RESOLVER_GAP, 2 EXPECTED_QUARANTINED_CONFLICT, 5 EXPECTED_RESOLVED_IDENTITY_CATALOG_DUPLICATE, 0 UNEXPECTED_FAILURE**; shadow ready / `version()=1.5.0`; debug disabled on fresh load; wrapper≡legacy; `git diff --check` clean; registry UTF-8 without BOM. **Rollback** = restore strawberry-guava to `duplicateConflicts`, remove its canonical identity, restore `registryVersion` 1.4.0, restore validator and test expectations, and leave catalog rows unchanged. **Next recommended task:** read-only planning for strawberry-guava catalog deduplication (field-by-field comparison, Record B survivor analysis, accepted scientific spelling, cherry-guava alias decision, regional invasive-warning policy, warning/product/care merge proposal, botanical-engine consistency check) — do **not** perform catalog deduplication in this checkpoint. |
| **First-class scientific-name synonym foundation** | Done (local; not pushed) | **Schema + validator + advisory resolver + synthetic tests only; no real registry synonym data; no strawberry-guava resolution; no plantId; canonical identity remains advisory; legacy runtime remains authoritative.** `CanonicalIdentity` now supports optional **`scientificSynonyms`** (omit when empty). **`acceptedScientificName` remains unchanged and fully backward compatible** (not moved into a nomenclatural wrapper). Each synonym entry requires `name`, `relationship`, `confidence`, `needsReview`, and non-empty structured **`sources`**. Each source requires **`authority`** (controlled token, e.g. `powo` / `wfo` / `ipni` / `tropicos`) and **`verifiedAt`** (`YYYY-MM-DD`); optional **`recordId`**. **No URLs or unstructured citation prose** in this foundation. Only relationship **`synonym`** is permitted now; future values such as `orthographic_variant`, `historical_name`, `misapplied_name`, or `deprecated_name` are deliberately deferred. **Active-resolution indexing** only when: relationship is `synonym`; confidence is `high`; synonym `needsReview` is `false`; canonical identity `needsReview` is `false`; ≥1 valid source; normalized name non-empty; and no accepted-name, synonym, or pending-conflict collision. Medium/low confidence or needs-review synonym evidence may be stored but **does not resolve** an identity. **Normalization** (`normalizeScientificName`): Unicode NFC; conservative quote/apostrophe folding; trim; whitespace collapse; locale-independent lowercasing; **no** slugification, transliteration, author/rank/cultivar stripping, fuzzy/substring matching, or automatic `×`↔`x` equivalence. **Resolver precedence:** plantId → pending conflict / canonicalSlug → aliasSlug → moduleKey → **acceptedScientificName** → **scientificSynonym** → localizedName → conservative common-name fallback → provisional/unresolved. Successful synonym result: `matchedBy: scientificSynonym`, `inputNamespace: scientificSynonym`, existing `plantId` or `null` (**never fabricate**), immutable frozen result, identity remains advisory. **Collision safety:** accepted↔synonym, synonym↔synonym cross-identity, synonym↔pending-conflict overlap, and duplicate normalized synonym on one identity are invalid; never select by registry/array order; defensive resolver returns **ambiguous** or non-resolving. **Additive stats** (accepted-name `scientificCount` unchanged): `scientificSynonymIdentityCount`, `scientificSynonymEntryCount`, `indexedScientificSynonymCount`, `reviewedButNotIndexedScientificSynonymCount`, `ambiguousScientificSynonymCount`. **Real registry unchanged:** **zero** `scientificSynonyms` entries; `registryVersion` **1.4.0**; **75** canonical; **2** pending conflicts; **9** plantIds; strawberry-guava + both *Psidium* spellings remain quarantined; mulberry remains pending; avocado and Hebrew localized-name behavior unchanged; no catalog/persistence/UI/saved-user/authority change. Verified: standalone resolver **100/100 PASS**; reconciliation **138 total — 133 PASS, 0 KNOWN_LEGACY_BUG, 0 KNOWN_RESOLVER_GAP, 5 EXPECTED_QUARANTINED_CONFLICT, 0 EXPECTED_RESOLVED_IDENTITY_CATALOG_DUPLICATE, 0 UNEXPECTED_FAILURE**; validator **59 PASS exit 0**; `git diff --check` clean. **Rollback** = remove `scientificSynonyms` from the schema, revert scientific-synonym validator checks/fixtures, revert resolver normalization/maps/precedence/stats, and revert standalone resolver tests and documentation. **Next recommended task:** implement the strawberry-guava identity-layer pilot with `acceptedScientificName: Psidium cattleyanum`, scientific synonym `Psidium cattleianum`, structured verified sources, **no plantId**, **no catalog deduplication**, **no** common-name alias changes; mulberry remains pending; canonical identity remains advisory — do **not** perform that pilot in this checkpoint. |
| **Avocado PLANT_LIBRARY catalog deduplication** | Done (pushed) | **Catalog descriptive-layer cleanup only; no plantId; canonical identity remains advisory; legacy runtime remains authoritative.** Removed the earlier duplicate avocado `PLANT_LIBRARY` row (Record A). Exactly **one** legacy descriptive avocado catalog row remains (Record B, at its existing array position). `PLANT_INDEX`, `findPlantByName`, `resolvePlantProfileRawLegacy`, and the `resolvePlantProfileRaw` wrapper now return the **same avocado object** for approved slug, scientific, English, and Hebrew lookup forms. Surviving identity/display fields: `slug: avocado`, `name: Avocado Tree`, `he: אבוקדו`, `scientific: Persea americana`, `status: Sensitive fruit tree`, `mark: !`; aliases retain both `אבוקדו` and `עץ אבוקדו` (so `עץ אבוקדו` remains searchable); tags retain Record B values and add **`subtropical` exactly once**; products remain exactly Record B (`Mulch`, `Avocado/citrus fertilizer`, `Tree guard`, `Drip irrigation`) — **Moisture meter was not added**; warnings conservatively reduced to four distinct risk categories with **no duplicated frost or pollination** warnings: (1) `Very sensitive to poor drainage and root rot`, (2) `Young trees are sensitive to frost and sunburn`, (3) `Needs wind protection; brittle branches can break`, (4) `Variety/pollination affects fruiting`. The surviving record preserves existing Add Plant / save-path behavior: `profileSlug` remains `avocado`; existing saved-object keys and shape remain unchanged; **no migration required**; **no `plantId` or `canonicalSlug`** is copied into catalog or saved-user objects. **Registry unchanged** at this checkpoint: `registryVersion` remains **1.4.0**; **75** canonical identities; **2** pending conflicts (`strawberry-guava`, `mulberry`); **9** plantIds; avocado canonical identity still has **no plantId**. Verified: standalone resolver **74/74 PASS**; reconciliation **138 total — 133 PASS, 0 KNOWN_LEGACY_BUG, 0 KNOWN_RESOLVER_GAP, 5 EXPECTED_QUARANTINED_CONFLICT, 0 EXPECTED_RESOLVED_IDENTITY_CATALOG_DUPLICATE, 0 UNEXPECTED_FAILURE**; validator **46 PASS exit 0**; `git diff --check` clean. Commit `09f465b`. |
| **First duplicate-conflict identity pilot (avocado → Persea americana)** | Done (pushed) | **Identity-layer resolution only; catalog descriptive rows were not deduplicated in this checkpoint; no plantId; resolver remains advisory.** Completed the first quarantined-conflict pilot for **avocado**. External botanical verification (outside the repo) confirmed both duplicate repository records represent the species-level identity **Persea americana**; cultivar modeling is deferred. **Registry changes:** removed avocado from `duplicateConflicts`; added exactly one `canonicalIdentities` entry — `canonicalSlug: avocado`, `acceptedScientificName: Persea americana`, `needsReview: false`; **no `plantId`**, **no `localizedNames`**, **no aliases**, **no module keys**, and **no** care/product/climate/guide/icon/mark/status/UI-copy fields merged into the identity entry. **`registryVersion` advanced 1.3.0 → 1.4.0**; canonical count **74 → 75**; pending conflicts **3 → 2** (`strawberry-guava`, `mulberry` remain quarantined unchanged); plantId count remains **9**. Resolver (advisory/shadow): `avocado` → `resolved_canonical` / `plantId: null`; `Persea americana` → `resolved_canonical` / `plantId: null`. Legacy `resolvePlantProfileRaw` remains authoritative. At the time of this checkpoint, `index.html` still contained two avocado `PLANT_LIBRARY` records (catalog asymmetry later removed in **Avocado PLANT_LIBRARY catalog deduplication**). Persistence, saved-user data, object shape, UI, localStorage, telemetry, and network-write behavior unchanged. Verified at the time: validator **46 PASS exit 0**; standalone resolver **74/74 PASS**; reconciliation **128 total — 118 PASS, 0 KNOWN_LEGACY_BUG, 0 KNOWN_RESOLVER_GAP, 5 EXPECTED_QUARANTINED_CONFLICT, 5 EXPECTED_RESOLVED_IDENTITY_CATALOG_DUPLICATE, 0 UNEXPECTED_FAILURE**. Commit `442de36`. |
| **Exact localized-name matching in shared plant identity resolver** | Done (local; not committed yet) | **Standalone advisory resolver only; registry data unchanged; legacy runtime remains authoritative.** Added Unicode-safe **exact** localized-name lookup to `modules/identity/plant-identity-resolver.js`. Only `localizedNames.primary` and `localizedNames.aliases` are indexed (historical/transliterations/misspellings/deprecated remain unused reserved buckets). Resolution precedence is now: **plantId → canonicalSlug → alias/module key → scientific name → exact localized name → existing common-name fallback**. Localized matching is **exact only** (never fuzzy or substring-based). Unicode normalization preserves non-Latin scripts and uses NFC, conservative quote/apostrophe folding (incl. Hebrew geresh), trim, internal-whitespace collapsing, and **locale-independent `toLowerCase()`** (not `toLocaleLowerCase('en-US')` or any selected locale). Supported input forms: plain localized string; `{name, locale}`; `{localizedName, language}`; and unique locale-free exact global match. Locale-known match confidence is **`exact`**; locale-free unique match confidence is **`high`**. Wrong/unsupported locale warnings remain correct. Same-name multi-identity collisions return **`ambiguous`** (no identity chosen). Conflicts remain **`pending_conflict`**. Existing plantIds are returned; no IDs are created. **Hebrew pilot verified:** `לבנדר` / `אזוביון` → lavender (`plt_aupnyvawcflgjbyh`); `עץ זית` / `זית` → olive (`plt_e1teyafat3k5i3ke`). Standalone resolver harness: **67/67 PASS** (prior 56 + 11 normalization-consistency tests). Reconciliation: **122 total — 114 PASS, 0 KNOWN_LEGACY_BUG, 0 KNOWN_RESOLVER_GAP, 8 EXPECTED_QUARANTINED_CONFLICT, 0 UNEXPECTED_FAILURE**. Runtime-shadow non-regression: app starts; `CruvitIdentityShadow` ready; `version()=1.3.0`; shadow Hebrew resolves via `matchedBy:localizedName`; debug comparison disabled on fresh load; legacy `resolvePlantProfileRaw` remains authoritative; no `plantId`/`canonicalSlug` copied to runtime or saved objects; no localStorage/UI/DOM/telemetry/network-write change. Validator **42 PASS exit 0**; `registryVersion 1.3.0`; **74** canonical / **3** conflicts / **9** plantIds / **2** localized identities / **2** Hebrew locale blocks — **registry data unchanged**. Localized matching is **not** authoritative in My Garden; saved plants do **not** contain localized identity data. **Rollback** = revert resolver localized-lookup changes and corresponding tests/docs. **Next recommended task:** production verification of advisory Hebrew lookup, then read-only planning for the next localized-data expansion or first conflict resolution. |
| **First Hebrew localized plant-name registry pilot (lavender + olive)** | Done (local; not committed yet) | **Registry data only; resolver/runtime do not consume localizedNames.** Added the first canonical localized-name data pilot in `data/plant-identity.registry.json`. **`registryVersion` advanced from 1.2.0 to 1.3.0** (`schemaVersion` unchanged at 1). Exactly **two** canonical identities now contain `localizedNames` — **lavender** and **olive** — with exactly **two** Hebrew (`he`) locale blocks and no other localized data. **Lavender** (`plantId` retained `plt_aupnyvawcflgjbyh`): `primary: ["לבנדר"]`, `aliases: ["אזוביון"]`, `script: "Hebr"`, `confidence: "high"`, `source: "verified-existing-cruvit-catalog"`, `needsReview: false`. **Olive** (`plantId` retained `plt_e1teyafat3k5i3ke`; `moduleKeys.gardenDesignManifest: ["olive-tree"]` unchanged): `primary: ["עץ זית"]`, `aliases: ["זית"]`, `script: "Hebr"`, `confidence: "high"`, `source: "verified-existing-cruvit-catalog"`, `needsReview: false`. All four Hebrew values are unique to their canonical identity (normalized same-locale collisions: **0**). No `localizedNames` on `duplicateConflict` records. Counts unchanged except version/localized: **74** canonical identities, **3** duplicate conflicts, **exactly 9** `plantId` values. Validator **42 PASS exit 0**. Hebrew stored UTF-8 without BOM. Localized names are **registry data only** at this checkpoint — the **canonical resolver does not yet consume `localizedNames`**; runtime behavior, persistence, UI, and user data remain unchanged; My Garden plants do **not** contain localized identity fields. **Rollback** = remove the two `localizedNames` blocks, restore `registryVersion` to 1.2.0, and remove this documentation entry. **Next recommended task:** implement exact localized-name support in the standalone resolver with tests only, while keeping runtime and legacy resolution unchanged. |
| **Canonical Localized Plant Names schema + validator foundation** | Done (local; not committed yet) | **Schema and validation only; no registry data; no runtime/resolver adoption.** Added optional **`localizedNames`** schema support on each canonical identity in `data/plant-identity.schema.json` (`LocalizedNameString`, `LocalizedNameArray`, `LocalizedLocaleBlock`, `LocalizedNames`). Identity-grade localized names remain **separate from `aliasSlugs`** (latin kebab slug tokens only). The **identity registry remains the source of truth for identity-grade names**; the **plant catalog remains responsible for descriptive/display data**. Supported locale keys are exactly **`en, he, ar, es, fr, de, it, pt, ru, zh, ja, ko, hi, tr, nl, pl`**. When a locale block exists it requires **`primary`**, **`confidence`** (`low`/`medium`/`high`), **`source`**, and **`needsReview`**; optional fields are **`aliases`**, **`historical`**, **`transliterations`**, **`misspellings`**, **`deprecated`**, and **`script`** (`^[A-Z][a-z]{3}$`). Both `localizedNames` and locale blocks use **`additionalProperties:false`**. **`localizedNames` remains optional** — the current registry contains **zero** `localizedNames` entries and remains valid. Extended `scripts/validate-plant-identity.ps1` with Unicode-safe validator-only normalization (Unicode Form C, conservative quote/apostrophe normalization including Hebrew geresh, trim, whitespace collapsing, invariant case folding; **no** slugification, **no** removal of non-Latin scripts, **no** transliteration or fuzzy matching) and structural/collision rules that reject unsupported locales, empty/whitespace names, invalid confidence/source/script/`needsReview`, unsupported properties, duplicate normalized names within one identity+locale across buckets, same-locale collisions across canonical identities (a future explicit ambiguity model would be required before such a collision could be accepted), `localizedNames` on `duplicateConflict` records, `plantId` inside localized-name structures, and locale `needsReview:true` when the containing canonical identity is not also `needsReview:true`. **Synthetic fixtures (temp only, removed afterward): 6 positive PASS, 14 negative rejected for the intended reasons.** Normal validator: **42 checks PASS, exit 0**; `registryVersion 1.2.0`; **74 canonical identities, 3 duplicate conflicts, exactly 9 `plantId`, 0 `localizedNames` entries**. **No runtime or user-data behavior changed**; the resolver does **not** consume localized names; Hebrew resolution is **not** yet supported by the canonical resolver. **Rollback** = remove `localizedNames` schema definitions/property, remove localized-name validator checks/helpers, and remove this documentation entry. **Next recommended task:** add a tiny registry-data pilot for verified Hebrew localized names on **lavender** and **olive** only, with schema/validator tests and **no** resolver or runtime adoption. |
| **Empty-query legacy plant-resolution fix (`findPlantByName`)** | Done (local; not committed yet) | **Minimal shared-lookup fix; legacy resolution stays authoritative; canonical identity stays advisory; no data/persistence/UI change.** Fixed the legacy empty-query fallback in **`findPlantByName()`** (`index.html`): `normalizeQuery(name)` is now checked **before** any exact or substring matching, so empty, whitespace-only, `null`, and `undefined` queries return **`null`** (single added line `if(!q) return null;`). This stops unknown `profileSlug`/direct-`slug` objects **with no usable name** from silently falling through the substring branch and selecting the first catalog record (**lavender**). Concretely: **`{profileSlug:"olive-tree"}` now returns `null` in the legacy resolver**, while the **advisory shadow resolver still identifies olive** (`plt_e1teyafat3k5i3ke`, non-authoritative); unknown `profileSlug`/direct-`slug` inputs without a name → legacy `null`; and **unknown `meta.slug` objects that carry an existing meta snapshot continue returning the same meta snapshot object** (unchanged identity — not lavender). **All non-empty matching logic is unchanged**: exact names, scientific names, aliases, Hebrew names (e.g. `לבנדר`→lavender, `זית`→olive still match via the existing catalog paths), and existing substring behavior. **`resolvePlantProfileRaw` and its wrapper remain authoritative and preserve return-object identity** (`resolvePlantProfileRaw(x) === resolvePlantProfileRawLegacy(x)`); **canonical identity remains advisory and non-authoritative**; **no `plantId`/`canonicalSlug` is persisted**; and **no registry, catalog, seed, conflict, alias, UI, My Garden, Smart Recommendations, Garden Design, scan, or care logic changed** (only `index.html` `findPlantByName` and the reconciliation test file). **Isolated real save-flow verification** (fresh throwaway Chrome profile, local same-origin server, no real user data; profile + server + all temp artifacts destroyed afterward): **(A) known plant** — `savePlantFromLibrary('lavender')` completed with no exception, added exactly **1** plant, saved object kept the existing shape (`name,status,mark,source,archived,prefs,scientific,imageUrl,meta,id,profileSlug,addedAt,updatedAt`) with a per-instance `id`, **no `plantId`/`canonicalSlug`**, not duplicated, still species `lavender`; **(B) unknown/meta scan path** — `storePlantProfile(scanProfile)` → `savePlantFromLibrary(...,'Scan & Identify')` remained saveable, added exactly **1** plant, **meta snapshot preserved** (name `Mystery Garden Plant`, `profileSlug scan-mystery-xyz`), **did not become lavender**, **no `plantId` fabricated**, no exception; resolver-level `resolvePlantProfileRawLegacy({meta:{…}})` returned the **same meta object** (identity preserved); **(C) empty-name safety** — `findPlantByName('') === null` and `savePlant('')` added **0** plants (falls back to the existing chooser), no incorrect plant added; **no `plantId`/`canonicalSlug` on any saved plant**. **Updated reconciliation harness** (`tests/plant-identity-reconciliation.test.html`) rebaselined for the fixed behavior and re-run in real headless Chrome: **116 tests — 106 PASS, 0 KNOWN_LEGACY_BUG, 2 KNOWN_RESOLVER_GAP, 8 EXPECTED_QUARANTINED_CONFLICT, 0 UNEXPECTED_FAILURE**; all empty-query, known-name, scientific-name, Hebrew-name, and short-name tests PASS; strict wrapper parity and object-identity PASS; no mutation, UI, persistence-shape, or network-write regression. **Existing unresolved items remain (NOT changed by this fix):** Hebrew localized-name **resolver** coverage for `לבנדר`/`זית` in the canonical resolver (shadow stays provisional), and the quarantined conflicts `avocado`, `strawberry-guava`, `mulberry`. Registry validator **35 PASS exit 0**; `registryVersion 1.2.0`; **74 canonical identities, 3 duplicate conflicts, exactly 9 `plantId`**; no additional IDs; registry/schema/catalog/seed untouched. **Rollback** = remove the `if(!q) return null;` guard from `findPlantByName` and restore the previous reconciliation expectations. **Next recommended task:** review authoritative-readiness gates and choose between resolving the first quarantined duplicate or adding safe localized-name identity coverage. |
| **Plant Identity Reconciliation regression harness (tests only)** | Done (local; not committed yet) | **Tests only; no runtime, data, identity-authority, or user-data change.** Added a standalone browser harness `tests/plant-identity-reconciliation.test.html` that loads the **real `index.html` runtime** in a hidden same-origin iframe and drives the **real** `resolvePlantProfileRaw`, `resolvePlantProfileRawLegacy`, `CruvitIdentityShadow`, and `CruvitIdentityShadowDebug`. It **does not duplicate or reimplement legacy resolution logic**, never writes `localStorage`, never mutates the DOM/UI, and never sends anything externally (a headless result hook is gated behind an explicit `?report` opt-in to a same-origin temporary endpoint only). **Verified totals: 90 tests — 76 PASS, 4 KNOWN_LEGACY_BUG, 2 KNOWN_RESOLVER_GAP, 8 EXPECTED_QUARANTINED_CONFLICT, 0 UNEXPECTED_FAILURE.** Registry coverage asserted: **74 canonical identities, 3 duplicate conflicts, 9 plantId-bearing identities**. Namespace coverage includes canonical slugs, scientific names, aliases, plant IDs, CARE_QUALITY_PROFILES module keys, Garden Design manifest module keys, conflict slugs + scientific spellings, and saved-object forms. **173-vs-167 discrepancy explained (machine-derived):** the previous audit folded **six** targeted object/localized/scan cases (`{profileSlug:"olive-tree"}`, `{meta:{slug:"avocado"}}`, scan-unknown, scan-meta, Hebrew `"לבנדר"`, Hebrew `"צמח לא ידוע"`) into the base inventory; the permanent harness separates **A** the repository-derived base inventory (167 rows), **B** targeted regression cases, and **C** combined unique inputs (172), with the six re-homed into scope B — **no canonical identity was omitted** (the harness asserts the exact 6-row set difference and that all six are represented in scope B). **Exactly 16 distinct canonical identities have `needsReview:true`** (agapanthus, azalea, banana, blueberry, bougainvillea, camellia, geranium, jasmine, melaleuca, mint, oak-tree, orchid, pine-tree, plum, rose, succulent); the **25** needsReview rows are repeated namespace paths to those same 16 identities, **not** 25 identities. **Known legacy bugs pinned but NOT fixed:** an unknown `profileSlug`/direct `slug` with no usable name can fall through `findPlantByName("")` and select **lavender**; `{profileSlug:"olive-tree"}` currently returns legacy **lavender** while the shadow resolver resolves **olive** (`plt_e1teyafat3k5i3ke`). **Known canonical resolver coverage gaps (not changed):** Hebrew localized names `"לבנדר"` and `"זית"` (legacy may resolve; shadow stays provisional). **Expected quarantined conflicts remain:** `avocado`, `strawberry-guava`, `mulberry` → shadow `pending_conflict` with `plantId`/`canonicalSlug` null. The harness confirms **exact legacy return parity** (`resolvePlantProfileRaw(x) === resolvePlantProfileRawLegacy(x)` for every input), **strict object-identity preservation**, **no input/result mutation**, **no `plantId`/`canonicalSlug` copied onto runtime objects**, **no `localStorage` writes**, **no UI mutation**, and **no network writes/telemetry** (fetch/beacon/XHR = 0). The canonical resolver is **still advisory/non-authoritative**; the legacy bug is **not** fixed; localized-name support is **not** added; **no runtime behavior or user data changed.** Registry validator **35 PASS exit 0**; `registryVersion 1.2.0`; exactly 9 `plantId`. **Rollback** = delete `tests/plant-identity-reconciliation.test.html` and remove this documentation entry. **Next recommended task:** plan and implement the smallest regression-tested fix for the empty-query legacy fallback that incorrectly selects lavender, without changing persistence, canonical identity authority, conflicts, or UI. |
| **Developer-gated identity shadow comparison (`resolvePlantProfileRaw`)** | Done (local; not committed yet) | **Advisory comparison only; legacy resolution stays authoritative; off by default.** Implemented the first developer-gated shadow consultation around `resolvePlantProfileRaw` in `index.html`: the original function body was renamed to **`resolvePlantProfileRawLegacy` (unchanged)** and `resolvePlantProfileRaw` is now a **thin wrapper** that calls the legacy function and **always returns its exact result and object identity** (`resolvePlantProfileRaw(input) === resolvePlantProfileRawLegacy(input)` for every branch — verified). Only when the developer explicitly runs `window.CruvitIdentityShadowDebug.enable()` does the wrapper record an in-memory comparison; the consultation calls `CruvitIdentityShadow.get()` at most once and never awaits, mutates, throws, persists, writes storage, changes the DOM/UI, or attaches identity fields to any plant. Added a separate **frozen, non-persisted** `window.CruvitIdentityShadowDebug` controller in `modules/identity/plant-identity-shadow.js` exposing `enable()`, `disable()`, `isEnabled()`, `record(input, legacyResult)`, `latest()`, `snapshot()`, `clear()`. **Debug is disabled on every fresh load**; there is **no URL-query, localStorage, sessionStorage, or cookie activation**. The in-memory comparison buffer is **bounded to 50 records**, **deduplicated** by a conservative primitive key, holds **defensive primitive-only snapshots** (`{inputKey, legacyResolvedSlug, legacyScientificName, identityStatus, loaderStatus, plantId, canonicalSlug, matchedBy, agreesWithLegacy, conflict, warnings}`), never `JSON.stringify`s plant objects, is never persisted or transmitted, and `snapshot()` returns a frozen defensive array. The three same-slug conflicts (`avocado`, `strawberry-guava`, `mulberry`) surface only as advisory **`pending_conflict`** records (`plantId`/`canonicalSlug` null, `agreesWithLegacy:false`) and never copy identity data into the legacy object. **Directly executed** (headless Chrome, real code + controlled stubs) all defensive cases: adapter absent → `unavailable`; loading → `not-ready`; error → `unavailable`; malformed `get()` (`{}`, `{status:null}`, primitive) → `invalid-result`; `get()` throws → `unavailable`; wrapper resilient when the controller is absent or its methods throw (legacy identity preserved, no exception); disabled → **zero `get()` calls**, empty buffer, `record()` returns `null`. Real-`index.html` enabled-mode verified: `apple`/`apple-tree`/`fig-tree`→`resolved_id` (apple/apple/fig), `olive-tree`→`resolved_id` olive (legacy null, `agreesWithLegacy:null`), `almond`→`resolved_canonical`, `agapanthus`→`resolved_canonical`, three conflicts→`pending_conflict`; strict object identity held for all branches; dedupe=1, buffer cap=50, `clear()`/`disable()` effective. Registry validator **35 PASS exit 0**; `registryVersion 1.2.0`; 9 `plantId`; no registry/schema/catalog/seed change; no save/UI/scan/Smart Rec/Garden Design/care change; only new request remains the single same-origin registry GET. **Identity is NOT authoritative and My Garden plants contain no `plantId`.** **Rollback** = restore the original `resolvePlantProfileRaw` name, remove the wrapper, and remove the `CruvitIdentityShadowDebug` additions. Next: review real comparison results in production under explicit developer opt-in before planning any authoritative or persisted identity adoption. |
| **Plant Identity Resolver shadow adoption (startup-only)** | Done (local; not committed yet) | **First non-authoritative runtime adoption; zero runtime consumers.** The shared identity resolver now loads at application startup through a new guarded adapter `modules/identity/plant-identity-shadow.js`, referenced by `index.html` via exactly one external `<script type="module" src="modules/identity/plant-identity-shadow.js">` line near the end of `body` (no existing classic script converted, moved, or reordered). The adapter imports only `./plant-identity-resolver.js` and installs a **frozen** `window.CruvitIdentityShadow` exposing exactly `get(input)`, `status()`, `version()`. It is **development-inspectable and advisory only**: `get()` returns `null` unless the loader is `ready`, otherwise returns the resolver result; it never throws into a caller, never mutates input, never writes storage, never changes the DOM, never emits UI warnings, never allocates IDs, and never selects a pending conflict. `status()` returns a frozen primitive-only snapshot; `version()` returns `registryVersion` when ready else `null`. On evaluation the adapter installs immediately then starts `loadIdentityRegistry()` fire-and-forget (not awaited; no retry loop; internal catch; no user-visible error), relying on the foundation's existing promise guard, so it does not block render, `setTab`, seed loading, Plant Identifier loading, session refresh, or startup. **No existing runtime path calls it** — `resolvePlantProfileRaw`, `savePlantFromLibrary`, scan flows, `smartRecCanonicalKey`/Smart Recommendations, Garden Design, and My Garden persistence remain unchanged; legacy resolution and persistence remain authoritative. **No `plantId`/`canonicalSlug` is persisted; no saved-user migration; no UI change.** Resolver failure is inert (`status` → `error`, `get()` → `null`, application continues unchanged). Conflict slugs `avocado`, `strawberry-guava`, `mulberry` return `pending_conflict` in the shadow resolver with `plantId:null`/`canonicalSlug:null` and never receive identity data. The only new application request is one same-origin GET of `data/plant-identity.registry.json` (no POST/beacon/analytics/telemetry). Local headless-Chrome verification: adapter frozen and present; `status()` → `ready`; `version()` → `1.2.0`; `apple-tree`→`resolved_id`/`apple`/`plt_465b6lc4cnrarxaa` (aliasSlug); `olive-tree`→`resolved_id`/`olive`/`plt_e1teyafat3k5i3ke` (moduleKey); `almond`→`resolved_canonical`/`plantId:null`; `agapanthus`→`resolved_canonical`/`needsReview:true`; the three conflicts → `pending_conflict`; injected registry-failure run → `status error`, all `get()` null, app functional. Registry validator **35 checks PASS, exit 0**; `registryVersion 1.2.0`; exactly 9 `plantId`; no additional IDs; registry/schema/catalog/seed untouched. **Rollback** = remove the module-script line from `index.html` and delete `modules/identity/plant-identity-shadow.js`. Next: read-only planning for the first guarded shadow consultation inside `resolvePlantProfileRaw` (legacy result stays authoritative; no persistence or UI changes). |
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
| **Shared Plant Identity Resolver Foundation** | Done (local; not committed yet) | **Standalone, read-only tooling; not wired into runtime.** Added `modules/identity/plant-identity-resolver.js` — a dependency-free ES module that reads `data/plant-identity.registry.json` and exposes `createPlantIdentityResolver(registryData)` (pure), `loadIdentityRegistry(options?)` (promise-guarded fetch; `idle/loading/ready/error`, retries after error, never blocks startup, never writes), `resolvePlantIdentity(input, options?)`, `getIdentityResolverStatus()`, plus `validateRegistryData`. Builds lookup maps once (`bySlug`, `byAlias`, `byModuleKey` with namespace, `byPlantId`, `byScientific` + ambiguous set, `conflictBySlug`, `conflictByScientific`). Conservative precedence only (no substring/fuzzy): **A** exact `plantId` → **B** exact `canonicalSlug` → **C** exact `aliasSlug` → **D** exact module key (namespace preserved) → **E** normalized `acceptedScientificName` → **F** exact common-name token; a pending-conflict slug/scientific short-circuits to `pending_conflict` before E/F. Immutable frozen result `{status, plantId, canonicalSlug, matchedBy, inputValue, inputNamespace, needsReview, conflict, confidence, warnings, registryVersion}` with statuses `resolved_id | resolved_canonical | pending_conflict | ambiguous | provisional | unresolved`. Verified: `apple-tree→apple/plt_465b6lc4cnrarxaa`, `fig-tree→fig/plt_5ixjl9fmz1ii2rre`, `olive-tree`(gardenDesignManifest)`→olive/plt_e1teyafat3k5i3ke`; aliases/module keys get **no** separate IDs; non-ID identities return `resolved_canonical` + `plantId:null` with `needsReview` mirrored; `avocado`/`strawberry-guava`(both `Psidium cattleianum` and `cattleyanum`)/`mulberry` return `pending_conflict` and never select a `PLANT_LIBRARY` record; unknown/scanned → `provisional`; malformed/empty → `unresolved` (no throw); invalid/failed registry → `unresolved` + warning. Results frozen, conflict data cloned, registry cloned+frozen, no mutable maps exposed, no negative caching across a later successful load, no dependence on array order, no `index.html` globals. Standalone browser harness `tests/plant-identity-resolver.test.html` executed headlessly (Chrome, over a local static server): **32/32 tests PASS** including coverage assertions (74 canonical, 3 conflicts, 9 plantId). **Not imported or consumed by any runtime consumer**; My Garden and saved-user data unchanged; no additional IDs allocated; registry/schema/catalog untouched. **Rollback** = delete the standalone module + test file. Next: review resolver test results and plan the first non-authoritative runtime adoption. |
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
| **17** | Growth Outcome Suitability | **GOS-3C2 complete locally** (comparison conclusions + runtime-readiness contract documented; no runtime authorization). GOS-3C1 matrix remains **8** fixtures / **979/979**. No catalog/UI/ranking/product consumer until separately approved. Before broad Smart Recommendations or Add Plant suitability expansion. |

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
- **17 — Growth Outcome Suitability:** GOS-3F local developer comparison harness complete (**1974/1974**; API path ≡ evaluator + C1 category parity; not product-enabled). GOS-3C1 matrix unchanged (**8** / **979/979**). Do **not** add runtime loader/catalog/UI/ranking/product consumer until separately approved (GOS-4+ / production-3F verify).

---

# Growth Outcome Suitability Plan

**Status:** **GOS-3F complete locally** — explicit developer comparison harness `tests/growth-outcome-developer-comparison.test.html` (**1974/1974**; five consecutive stable runs; `GOS_3F_COMPLETE`). Capability-gated API nested results ≡ direct evaluator; neutral v1b categories match frozen GOS-3C1 expectations for all eight fixtures. Prior foundations remain in force: GOS-1 schemas; GOS-2B pilot (**42** / **5**); GOS-3A/3B evaluator (**62/62**); GOS-3C0/3C1 matrix (**8** / **979/979**, harness unchanged); GOS-3C2 readiness contract; GOS-3D developer API (**105/105**); GOS-3E production inert verify. **Not imported by `index.html`.** No application runtime loading, product consumer, UI, persistence, Sidecar consumer, or v1b mapping. Do **not** load pilot data in the application, rewrite catalog/`climateTraits`, change UI, or change Smart Recommendations / Add Plant ranking. Sidecar remains inert and unused by GOS. Mismatched-context Olive/Apple/California fixtures remain deferred. **GOS-3F does not authorize product activation, GOS-4, or production comparison until separately approved.**

**Placement:** After the developer comparison harness, any product display, ranking, or production-hosted comparison requires separate approval and satisfaction of the gates below — and remains **before** broad Smart Recommendations or Add Plant suitability expansion.

**Required biological outcomes (contract):**
- survival
- vegetativeGrowth
- flowering
- fruitSet
- fruitRipeningOrYield
- longTermReliability

**Also planned for later interpretation (not biological evidence):**
- user goal and recommended use
- confidence, sources, region applicability, and unknown fallback (already shaped in GOS-1 contracts)

---

## GOS-3C2 — Comparison Conclusions and Runtime-Readiness Contract

**Checkpoint type:** documentation-only. **File:** `PROJECT_STATUS.md`. **Not authorized:** runtime GOS loading, test/evaluator/schema/pilot changes, score/risk mapping, UI, persistence, Sidecar or module consumers.

### A. What Climate Suitability v1b answers

Climate Suitability Engine **v1b** answers an existing **plant-level climate suitability** question using its own native contract: score, level, factors/blocks, frost and related heuristics, and the trusted-location gate (`hasTrustedAppLocation` / untrusted → score `null` and level `unknown` with `location_untrusted` semantics as exercised in the comparison harness).

v1b’s numeric score and levels (`excellent` … `notRecommended`, plus `unknown`) must **not** be reinterpreted as the six GOS biological outcomes.

### B. What GOS answers

Growth Outcome Suitability evaluates **six independent biological outcomes** (`survival`, `vegetativeGrowth`, `flowering`, `fruitSet`, `fruitRipeningOrYield`, `longTermReliability`) with category-first levels (`possible` / `risky` / `notRecommended` / `unknown`), `internalScore` always `null`, and no score-50 fallback.

When inputs and evidence allow, GOS can preserve outcome-specific blockers, missing inputs, unknown results, conflicting evidence (unaveraged), and explicit applicability filters (regionTags, climateTags, age, cultivar, environment, phenology/stage, and related fields when supplied). Biology remains separate from `userGoal`; goal interpretation may produce `goalFit` / `recommendedUse` / `overallConclusion` without rewriting biology.

### C. Why the engines are not direct replacements

- They answer **materially different questions** (one broad climate-suitability result vs six biological outcomes).
- Similar-looking labels do **not** prove semantic equivalence.
- GOS-3C0/3C1 selected **no winner** and introduced **no** cross-engine score, level, risk-band, or confidence translation.
- **GOS-3C1 does not authorize replacing v1b.**

### D. Approved comparison vocabulary (harness-native)

Frozen from `tests/growth-outcome-v1b-comparison.test.html` `ALLOWED_CATEGORIES` only — no invented categories:

| Category | Neutral meaning |
|----------|-----------------|
| `aligned_unknown` | Both engines block/unknown under untrusted location in the approved fixture path. |
| `gos_preserves_unknown` | GOS keeps later-stage (or other) `unknown` where v1b may still emit a scored climate result — unknown is preserved, not filled. |
| `blocker_scope_difference` | A GOS blocker applies to a different outcome/scope than a broad v1b species heuristic (e.g. reproductive vs survival, or age-specific survival). |
| `applicability_difference` | Explicit applicability (e.g. age) changes GOS behavior where v1b has no equivalent model. |
| `different_question_not_conflict` | Observed divergence reflects different questions, not a judged “conflict winner.” |
| `unresolved_due_missing_input` | Fallback when no allowed category matched — signals incompleteness, not a preferred engine. |

### E. What GOS-3C1 proved (approved matrix only)

- Trusted and untrusted location behavior compared (untrusted → both blocked/unknown alignment).
- Approved goal pair: changing only `userGoal` did not alter biology (v1b unchanged; GOS biology byte-identical).
- Age applicability exercised (young vs mature Mango cold fixtures).
- Reproductive blocker scope separated from survival (`blocker_scope_difference` / bloom–fruitSet cold).
- Conflicting Lychee freeze evidence remained uncombined (`conflictsWith` / conflicting coverage).
- Bougainvillea flowering success did not imply fruit success (floweringDisplay vs fruit unknown).
- Deterministic outputs for **8** fixtures × **10** fresh iframes; five consecutive **979/979** runs; isolation/restoration protections passed.
- No runtime GOS import; no winner language; no score/risk map.

### F. What GOS-3C1 did not prove

- Global plant or regional coverage; California/Mediterranean alignment; temperate Apple contexts.
- Complete cultivar coverage; numeric chill-hour behavior; pollinizer true/false pairs; protected-environment temperature-gain behavior.
- Product-facing explanation UX; Smart Recommendations ranking behavior; runtime consumer safety; persistence of GOS results; replacement of Climate Suitability v1b.

**979/979 proves the approved matrix contracts only — not global production readiness.**

### Runtime-readiness gates (mandatory before any future API/loader/consumer)

All applicable gates must be explicitly satisfied or handled conservatively. **GOS-3C2 documents the gates; it does not implement them.**

1. **Trusted location** — Trusted location required; untrusted must block GOS or return native unknown/blocked behavior; default Western Galilee must never be treated as confirmed user location.
2. **Profile and evidence availability** — Valid GOS profile + validated referenced evidence required; missing data must not invent outcomes; existing v1b remains available for its climate-suitability question when GOS data is unavailable.
3. **Explicit applicability inputs** — Inputs required by an applicable rule must be supplied explicitly or remain missing (including where relevant: `regionTags`, `climateTags`, `ageClass`, cultivar, growing environment, units, duration, phenology/stage, `chillHours`, pollinizer availability, protected-growing context). **No** coordinate-to-region or hidden-value inference.
4. **Unknown and conflict preservation** — Unknown stays unknown; conflicts unaveraged; missing inputs exposed internally; no success/failure inheritance across biological stages.
5. **Biology / userGoal separation** — Biological outputs identical when only `userGoal` changes; `goalFit` / `recommendedUse` / `overallConclusion` may interpret but never rewrite biology.
6. **Evidence traceability** — Future consumer contracts must preserve access to evidence used/excluded, applicability reasons, blockers, limiting factors, missing inputs, conflicting-source status, and profile/schema (or equivalent) provenance. UI not defined here.
7. **Safe coexistence with v1b** — No score mapping, silent merging, automatic winner, v1b replacement, or Smart Recommendations ranking change; product path must state which engine answers which question.
8. **Consumer input readiness** — Current My Garden and Smart Recommendations do **not** guarantee all GOS inputs. Future consumers must **not** guess missing age, cultivar, phenology, chill hours, pollinizer, protected environment, or explicit regional applicability.

### Approved fallback contract

- **Untrusted location:** GOS remains blocked/unknown per its native contract.
- **No valid GOS profile/evidence:** do not fabricate a GOS result; existing v1b may continue answering its climate-suitability question.
- Continuing v1b is **not** equivalent to generating missing GOS outcomes.
- No score-50 or generic borderline fallback may be introduced into GOS.

### Deferred (explicit)

Production-hosted GOS-3F developer comparison verification (post-push); **GOS-4** read-only display planning; product runtime activation / `index.html` loading; replacement of Climate Suitability v1b; Smart Recommendations integration/ranking; My Garden / Plant Doctor / Garden Design consumers; UI display; result persistence; Sidecar consumer; cross-engine score/risk mapping; global catalog expansion; Shopify/commercial use; extra fixtures only to increase species count.

**Deferred comparison contexts (retained):** Olive Mediterranean/California; Apple temperate/California; Mango California region exclusion; numeric chill-hour fixtures; pollinizer pairs; cultivar pairs; protected-environment temperature-gain fixtures.

### Next-step boundary

GOS-3F local developer comparison harness is complete (see checkpoint row). The next separately approved steps are production-hosted developer comparison verification (after push/deploy) and/or **GOS-4** planning — do **not** start them automatically. **GOS-3F does not authorize product wiring or GOS-4.**

### GOS-3C2 completion criteria

This checkpoint is complete when this document clearly contains: engine responsibility boundaries; approved neutral comparison vocabulary; proven vs unproven conclusions; runtime-readiness gates; fallback contract; deferred work; next-step boundary; and **no runtime authorization**.

---

## GOS-3D — Stopped Developer-Only API

**Checkpoint type:** implementation of a stopped, developer/test-only, non-authoritative API. **Not** production-enabled. **Not** imported by `index.html`.

**Files:** `modules/suitability/growth-outcome-developer-api.js`; `tests/growth-outcome-developer-api.test.html`; this document.

**Contract summary:**
- Import is inert; frozen descriptor only (`explicit_call_only`; no mutable `started`/`enabled`/`available` state).
- Every call independently requires `capability: explicit_developer_evaluation`.
- API-level readiness preflight (capability, mode, profile structure, referenced-evidence completeness, trusted location, goal rules) before any evaluator call.
- Biology mode rejects a supplied `userGoal` (`user_goal_not_allowed_in_biology_mode`); suitability requires a valid `GROWTH_OUTCOME_GOALS` value.
- Success returns a frozen envelope with native evaluator `result` pass-through (no remapping, no score fallback, no v1b merge).
- No DOM, storage, network, timers, globals, persistence, or product consumers.

**Validation:** developer-API harness **105/105** (five consecutive runs); evaluator **62/62**; comparison **979/979**; pilot validator **69**; pilot harness **936/936**; GOS-1 validator **101**; schema harness **69/69**.

---

## GOS-3E — Production Inert Verification

**Checkpoint type:** production verification only (no runtime/test code change). **Verdict:** `GOS_3E_PRODUCTION_INERT_VERIFIED`.

**Production URL:** https://friendly-taiyaki-64aacb.netlify.app/  
**Deployed commit:** `6d4d987ae6c35e089f4dd26a0a33c58fee0ac9ef`  
**Versions:** developer API **0.1.0-gos3d**; evaluator **0.1.0-gos3a** (HTTP 200; `git hash-object` matches commit blobs).

**Proved:**
- Files are deployed/static-servable.
- Normal app startup and sampled entry-hub navigation (Smart Recommendations, Garden Design, Plant Doctor, Identify, My Garden return) made **zero** requests for developer API, evaluator, pilot data, or developer-API harness.
- Direct isolated `import()` of the developer API succeeded; only static dependency load was the evaluator.
- Descriptor-only access (`getGrowthOutcomeDeveloperApiDescriptor`); **no evaluation invoked**.
- Zero module-caused storage/DOM/timer/listener/global/network side effects beyond the two module files; descriptor remained frozen and `explicit_call_only` / non-authoritative / not runtime-wired / no persistence / no product consumers.
- Reload after import still made zero automatic GOS requests; normal app paths and v1b unchanged.
- Standalone harness was **not** run (HEAD-only existence optional).

**Not claimed:** GOS is not product-enabled; no ranking/UI/persistence/consumer.

---

## GOS-3F — Explicit Developer Comparison Harness

**Checkpoint type:** local test-only implementation. **Verdict:** `GOS_3F_COMPLETE`.

**File:** `tests/growth-outcome-developer-comparison.test.html`

**Contract:**
- Exact eight GOS-3C1 fixture IDs (copied matrix from commit `4a11dd5`; not a shared runtime source).
- GOS invoked through `evaluateGrowthOutcomeForDeveloper` + `GOS_DEVELOPER_CAPABILITY`.
- Nested API `result` byte-identical to direct evaluator (biology + suitability) for trusted fixtures.
- Untrusted fixture: API fail-closed `trusted_location_required` / `result === null`; category parity uses direct evaluator nested biology (API envelope never classified as a biological result).
- Live isolated iframe v1b path (same as GOS-3C1); classifier uses nested GOS only.
- Frozen expected primary categories match GOS-3C1 conclusions; no score/risk mapping; no winner language.
- Determinism ×10 fresh iframes per fixture; full storage/location restoration.

**Validation:** harness **1974/1974** (five consecutive runs); developer API **105/105**; evaluator **62/62**; GOS-3C1 **979/979** / **8**; pilot **69** / **936/936**; GOS-1 **101**; schema **69/69**.

**Production verification of this harness remains separately approved after push/deploy. GOS-4 not started.**

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
- Growth Outcome Suitability — GOS-3F local developer comparison harness complete (`GOS_3F_COMPLETE`; **1974/1974**; API path ≡ evaluator + C1 category parity; not product-enabled); GOS-3C1 matrix **979/979** / **8** fixtures unchanged; production-3F verify / GOS-4+ separately approved (no app pilot load, UI, ranking, persistence, score bridge, or Sidecar consumer)
- Next UX planning — sun/water filter readiness (only currently safe structured filters; UI not started)
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
- Growth Outcome Suitability — **GOS-3C1 complete locally** (eight-fixture Florida-aligned comparison matrix). No catalog/UI/ranking/product consumer yet. Before broad Smart Recommendations / Add Plant suitability expansion. See dedicated plan.

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

**Production-hosted GOS-3F developer comparison verification and/or GOS-4 planning only when separately approved (do not start automatically).** GOS-3F local harness is complete (`tests/growth-outcome-developer-comparison.test.html`; **1974/1974**; `GOS_3F_COMPLETE`; API nested ≡ evaluator; C1 category parity across eight fixtures). Do **not** wire the developer API into the app, load pilot data at runtime, add UI/ranking/persistence, replace v1b, map scores/risk bands, or consume Sidecar. Keep canonical identity advisory and legacy My Garden authoritative. **GOS-4 not started.**

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
