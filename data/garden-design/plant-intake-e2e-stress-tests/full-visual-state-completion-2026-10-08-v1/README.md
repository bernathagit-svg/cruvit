# Full visual-state completion gate — local review draft

Date: 2026-10-08
Base commit: `eee0ab34c909ca0323fef32e8f65ddd2dc9eae95`
Local branch: `work/full-state-approval-gate-20261008`
Status: **LOCAL DRAFT VERIFIED — NOT PUSHED OR DEPLOYED**

The prior supplemental climate repair is the immutable baseline. This draft makes one focused runtime change: full CRUVIT approval now requires resolved visual-state applicability as well as the existing minimum required image coverage. The location run is a separate diagnostic artifact; the application scorer and its data were not changed.

## Problem and resulting behavior

Mango previously reached `FULL_CRUVIT_APPROVED` with all three currently required variants covered while flowering applicability remained `UNKNOWN`. The old coverage calculation counted known required variants without making unresolved applicability a final-approval blocker.

The gate now adds `VISUAL_STATE_APPLICABILITY_UNRESOLVED` when any visual-state decision is unresolved. Intake routes that result to `DATA_ENRICHMENT_REQUIRED` with the SYSTEM action `RESEARCH_VISUAL_STATE_APPLICABILITY`. It creates neither an owner-spend action nor an image-generation action.

Three explicit fields distinguish the existing coverage result from complete applicability:
- `minimumVisualCoverageReady`
- `visualStateApplicabilityResolved`
- `allRequiredVisualStatesComplete`

Existing module readiness, including `gardenDesign.ready`, remains unchanged. The gate does not convert UNKNOWN to NOT_REQUIRED, promote an estimate to source-supported evidence, or require OPTIONAL images for minimum completion. Existing size-context and placement holds remain intact.

Intake accepts a positive approval only with an explicit positive completion result and no blockers or explicitly false component results. A legacy positive result that lacks this proof is blocked with `VISUAL_STATE_COMPLETION_RESULT_REQUIRED` and requests `RUN_FULL_CRUVIT_APPROVAL`. That is a request to recompute the gate, not a new botanical UNKNOWN decision. Existing v1 contract names are retained; additive `policyVersion` values identify:
- `full-cruvit-plant-approval-policy-v1.1.0`
- `cruvit-plant-intake-policy-v1.1.0`

The compact API forwards the policy and completion fields. This source change has not been deployed.

## Six-plant before/after result

Source: [verification.json](verification.json), using the exact saved post-repair six-row catalog snapshot and unchanged local authority files. This is not a fresh database read.

| Plant | Data class / gate | Required | Covered | Missing | Unresolved visual applicability |
|---|---|---:|---:|---:|---|
| mango | A / PASS | 3 | 3 | 0 | flowering |
| date-palm | A / PASS | 3 | 0 | 3 | flowering |
| monstera | A / PASS | 3 | 0 | 3 | flowering |
| hydrangea | A / PASS | 3 | 0 | 3 | fruiting |
| fig | A / PASS | 5 | 0 | 5 | flowering |
| lettuce | A / PASS | 1 | 0 | 1 | flowering, fruiting |

All six remain Class A, pass the data gate, and remain ready for onboarding. Existing module outputs are unchanged. Full approval changes from **one approved plant (Mango) to zero** because the unresolved visual-state decisions now block final approval. All six route to data enrichment. Mango retains its existing minimum coverage and Garden Design readiness.

There are **15 missing images among the currently known required variants**. This is not a complete future generation budget: unresolved applicability must first receive explicit source-backed REQUIRED, OPTIONAL, or NOT_REQUIRED decisions. The source catalog uses `bigleaf-hydrangea`, which canonicalizes to `hydrangea`.

## Verification

| Check | Result | Evidence |
|---|---|---|
| Final focused intake + new gate suites | **25/25 pass**, 0 fail, 0 skip | [guard-regression-tests.log](guard-regression-tests.log) |
| New independent cases within that run | **16 pass** | `tests/full-visual-state-completion-v1.test.mjs` |
| Earlier broad run across seven suites | **66/67 pass**, 1 pre-existing failure | [regression-tests.log](regression-tests.log) |
| Before/after gate and scope verifier | **PASS** | [verification.json](verification.json) |
| Actual scorer location matrix | **42/42 executed**, no execution errors or checked invariant violations | [location-regression.log](location-regression.log) and full report below |

The broad failure is the unchanged assertion in `tests/design-asset-visual-state-integrity-gate-v1.test.mjs` expecting 122 canonical plants. The unchanged baseline and this draft both contain **125** canonical identities and produce **130** architecture baselines from the same pure builder. The test expectation was not weakened. Its failing assertion was reproduced against the clean baseline, so this result is not reported as an all-green suite.

Two existing visual test suites write historical reports as a side effect. Five exact test-generated historical files were restored to their original bytes. The verifier confirms all **19 protected files** remain unchanged, including those historical reports, the catalog/identity authorities, visual Registry, size/media authorities, visual planners, `app.html`, and deployment configuration.

The new tests exercise the real six rows, UNKNOWN handling, legacy approval receipts, contradictory blockers and explicit false component flags, positive synthetic OPTIONAL/NOT_REQUIRED decisions, and a missing REQUIRED image. Synthetic applicability fixtures are test-only, clearly labeled, and never written into catalog data.

### Reproduction

Run from the draft worktree:

```sh
node --test tests/cruvit-plant-intake-engine-v1.test.mjs tests/full-visual-state-completion-v1.test.mjs
node scripts/verify-full-visual-state-completion-20261008.mjs C:/Temp/cruvit-climate-supplement-20261007-wt
node --experimental-vm-modules scripts/verify-six-plant-location-regression-20261008.mjs
```

The location harness intentionally uses exclusive output creation and refuses to overwrite an existing report. Run it in a disposable checkout with that output path absent if reproduction is needed. The original run is preserved; no repeat run was needed. The seven-suite historical run predates the final additional guard test and is preserved as actually executed.

## Actual scorer: six plants × seven stored location profiles

Full output: `tests/_six-plant-location-regression-20261008-report.json`.
Harness: `scripts/verify-six-plant-location-regression-20261008.mjs`.

The run uses 33 pinned local inputs: the unchanged application source, 17 source modules, the exact six-row post-repair snapshot, and seven pilot climate profiles plus their seven diagnostic QA files. The scorer is extracted from exact fingerprinted declarations in `app.html` (git blob `dcc93a929c9dfce6e4466cd89d3e56d6288b4db2`; scorer SHA-256 `6a034c7c1ecdb4754ffbe7e2360cff4136c0efc63ba298d4ffa911eacc5a8183`).

The original evaluation, outcome derivation, evidence alignment, and purpose policy execute in a restricted Node VM. No browser, live forecast, provider SDK, database client, process, require, document, or storage is available inside it. External/dynamic imports and network functions are denied. There were zero network attempts and no input mutations. QA is read for diagnostics and is not silently merged into the pilot data.

Cells show **the existing product recommendation level and numeric policy score**. The score is not a success percentage.

| Plant | Yehiam | Helsinki | Singapore | Kochi | Cairo | Tokyo | Quito |
|---|---|---|---|---|---|---|---|
| mango | borderline 81 | blocked 0 | borderline 81 | borderline 81 | borderline 81 | blocked 0 | borderline 81 |
| date-palm | borderline 81 | blocked 0 | borderline 81 | borderline 81 | borderline 81 | blocked 0 | borderline 81 |
| monstera | borderline 62 | blocked 0 | borderline 62 | borderline 62 | blocked 0 | blocked 0 | borderline 62 |
| bigleaf-hydrangea | good 81 | borderline 38 | borderline 81 | borderline 81 | borderline 81 | borderline 38 | good 81 |
| fig | good 81 | blocked 0 | borderline 80 | borderline 80 | good 81 | blocked 0 | good 80 |
| lettuce | good 81 | good 81 | borderline 81 | borderline 81 | borderline 81 | good 81 | good 81 |

Totals: **9 good, 24 borderline, 9 blocked**. All nine blocked results carry a hard-survival block. None of Mango, Date Palm, or Monstera is positively recommendation-eligible in this run.

Mango and Date Palm are blocked in the stored Helsinki and Tokyo profiles by the cold/frost gates. Monstera is also blocked there, and is blocked in Cairo by the aridity/moisture gate. In the five nonblocked Mango and Date Palm cases, score 81 remains borderline and ineligible for a positive recommendation. Their evidence trace constrains survival/growth because `frostSensitivity` remains `HEURISTIC_ASSERTION`; their `coldTolerance` evidence remains `SOURCE_SUPPORTED`. Mango fruiting remains context-dependent/unknown and lacks cultivar, local-climate, and bloom-weather resolution.

PASS certifies execution, source fidelity, preservation, and the generic product invariants checked by this harness. It does **not** certify agronomic accuracy, browser/live-data operation, or expected crop yield. There is no pre-repair score matrix in this artifact, so no observed score is attributed causally to the previous data repair.

## Adjacent findings, documented without additional code changes

1. **UNKNOWN versus effective metadata.** Mango's missing and Date Palm/Monstera's null canonical `needsWinterChill` retain evidence class UNKNOWN. The existing `smartRecMergeClimateMeta` nevertheless supplies internal `false`. This is a pre-existing effective default, not a new botanical assertion or catalog write. Consumers should be reviewed so it cannot be displayed as an established no-chill requirement.
2. **Confidence propagation.** All 42 outputs have `climateAuthorityConfidence:null` and `representativenessAdjustment:null`. QA files exist. Pilot profiles mark high confidence but lack populated dimensions/representativeness; the runtime path does not merge QA. The structural adapter retains high confidence in `structuralClimate.provenance.confidence`, but `smartRecClimateProfile` does not forward the relevant top-level fields and `deriveSpecificPlantOutcomes` does not consume that nested confidence field or the app's distinct `climateConfidence`. This produces a null confidence bundle in the tested path. The stored Yehiam QA reports low local representativeness/overall confidence while its pilot says high. Trace the complete data flow before changing recommendation policy. A null representativeness adjustment alone is not proof of absent QA: the finalizer also returns null when no demotion or forced UNKNOWN occurs.
3. **Primary explanation ordering.** Monstera–Cairo is hard-blocked for aridity, but the leading explanation still mentions support/trellis. A later focused change should prioritize the decisive limiting factor.
4. **Historical catalog count test.** The expected122/current125 mismatch requires its own baseline-count decision; it was not fixed by this approval-gate draft.

Trace references at the unchanged base: `app.html::smartRecMergeClimateMeta`, `app.html::smartRecClimateProfile`, and `modules/personal-domain/specific-plant-suitability-contract.js::deriveSpecificPlantOutcomes/finalizeOutcomes`. Exact raw outputs and canonical/effective metadata are retained in the location report.

The location names identify stored fixtures, not independently re-geocoded or climatologically certified places. Historical monthly profiles and recorded periods were reused. No live extremes or forecast were supplied; the app's forecast-derived `extremeHeatRisk:low` is a default here, not evidence of heatwave safety. Cultivar, maturity, sunlight, soil, irrigation, support, and protective conditions were not established. Even a good overall result may retain unknown flowering/fruiting; full catalog approval and Class A do not take location as input and are not proof of success at every site.

## Exact scope and publication boundary

Existing tracked changes are limited to:
1. `modules/catalog/full-cruvit-plant-approval-v1.js`
2. `modules/catalog/cruvit-plant-intake-engine-v1.js`
3. `netlify/functions/full-cruvit-plant-approval.mjs`
4. `tests/cruvit-plant-intake-engine-v1.test.mjs`
5. `tests/six-plant-evidence-followup-v1.test.mjs`

New files are this README, three logs, the gate verification JSON, one test file, two verifier scripts, and the full location report: **14 files in total (5 modified, 9 added)**.

This draft performed no database writes, paid AI calls, image generation, Registry edits, R2 writes, deployment, merge, or new public push. The earlier publication approval covered the previous 13-file climate repair. Publication of this new runtime change is a separate pending step; Production deployment remains unauthorized. The existing baseline worktree remains clean.
