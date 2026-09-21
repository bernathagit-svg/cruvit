# Design Asset Factory V1 — Architecture

Automation-first production for Garden Design cutouts. Chat/manual generation is calibration only. This document is the owner-reviewable architecture. Live registry writes, image generation, and paid calls are not performed by this task.

## End-to-end pipeline

catalog canonical plant
→ visualForm + habitModifiers + lifecycle + purposeCapabilities
→ requiredVariants[] / optionalVariants[]
→ gap detector vs Design Asset Registry
→ idempotent jobs (NEEDED)
→ priority bands
→ owner spend envelope (default DENY)
→ prompt factory
→ provider adapter `generateAsset` (capped)
→ technical QA (local)
→ identity/variant QA (UNKNOWN allowed; paid QA shares envelope)
→ bounded retry
→ CANDIDATE (owner review required; auto-approval not implemented)
→ APPROVED metadata + object-storage binary
→ owner exception queue only

Lookup / render never generates. `DESIGN_ASSET_PRODUCTION_PIPELINE.autonomousGeneration` stays **false** until a later owner enablement.

## Gap detector

Input: catalog plants + current registry + optional usage signals.
Output: required-only job records `{ canonicalSlug, visualForm, growthStage, phenology, season, required, reason, priority }`.
Optional variants never enter default production.
Unknown morphology → BLOCKED, not spend.

## Job model

Identity: `canonicalSlug + variantKey + version` (`jobId`).
States: NEEDED → QUEUED → APPROVED_FOR_SPEND → GENERATING → GENERATED → QA_PENDING → CANDIDATE | QA_FAILED | REJECTED.
QA_FAILED → RETRY_APPROVED (envelope maxRetries) or REJECTED / BLOCKED.
Same identity cannot create a second production asset.

## Prompt factory

Template `design-cutout-v1` built from scientific identity, visualForm, growthStage, habit, phenology, season, composition standard, transparent background. No species switch statements. Records `promptTemplateVersion`, `provider`, `model`, `settings`.

## Provider abstraction

`generateAsset(job, settings)` with adapters: OpenAI Images, Stability, Replicate, local GPU, future. Result: provider, model, actualCalls, usage, cost, output metadata, failure code. Provider is provenance, not registry identity. Architecture adapters refuse network (`FACTORY_NETWORK_DENIED`).

## Spend control

Wraps `paid-image-spend-gate-v1`. Envelope: `runId`, `provider`, `model`, `maxJobs`, `maxCalls`, `maxRetries`, `maxSpendUsd`. Missing any required field or `--dry-run` → 0 network. No carry-forward, no top-up, no billing/key changes. Does not probe keys with a generation request.

The hard USD gate charges **total expected API spend** (known image-output + conservative text-input allowance). Image-output-only caps such as `$0.50` are insufficient because gpt-image-2 also bills text-input tokens ($5 / 1M, published). Exact per-run tokens are unknown until usage returns.

## In-garden QA

Isolation transparency is not enough. Approval requires `ASSET_QA = PASS` and `IN_GARDEN_QA = PASS`. The required composition background is the real persisted Garden Design source photo (`garden_designs.source_media_id` → `garden_media` → private `user-garden-media` signed URL). Local representative photos are supplementary only. If the signed URL cannot be loaded safely, review is **BLOCKED** — no silent fallback. Runtime blend (contact shadow / slight tone / light edge soften) is a CSS experiment only and is not baked into botanical identity.

## Technical QA (local, $0)

Decode, PNG/WebP, alpha present, transparent corners, no opaque rectangular plate, dimensions, bbox, crop, edge contact, alpha coverage, halo/background heuristics, file size. PASS/FAIL + reasons.

## Identity QA

Local heuristics can FAIL mismatches. They cannot prove species: result may be UNKNOWN. Low confidence never auto-approves. Any model-based QA is paid and must use the same envelope (not executed without a new owner approval).

## Retry policy

`maxRetryCount` from the same envelope. Retryable: crop, background artifact, composition, halo, opaque plate, edge contact, alpha coverage. Non-retryable: ambiguous identity, unresolved genus/species, missing morphology authority.

## Candidate vs approved

Generation success ≠ approval. Mandatory gates → CANDIDATE. Owner review required initially. `AUTO_APPROVAL_ELIGIBLE` criteria exist; **not implemented**.

## Exception queue

Owner sees: identity uncertain, QA conflict, repeated failure, cost anomaly, variant ambiguity, provider disagreement. Routine passes should later flow without review.

## Registry model

Proposed record: assetId, canonicalSlug, variantKey, promptTemplateVersion, provider, model, generationRunId, provenance, rights, dimensions, alpha metrics, QA result, approvalStatus, filePath, createdAt. URLs are not identity. Live `design-asset-registry-v1.json` is not modified by the factory in this task.

## Storage scale plan

**Recommend:** approved binaries in dedicated Cloudflare R2 bucket `cruvit-design-assets` (`design-assets/{canonicalSlug}/{assetId}.png`); candidates in temporary working storage; metadata in Supabase/registry. Do not mix with the climate-data bucket. Do not create the bucket until calibration proves the pipeline. User garden photos must never be copied into the repo. No storage migration in this task.

## Prioritization

1. owned plants  
2. high-frequency recommended  
3. Garden Design surfaced  
4. portfolio / launch coverage gaps  
5. remaining catalog  

## Pilot role

Olive/Mango paid-pilot-2 calibrates prompt, model, native-alpha, QA thresholds, retry rate. It is not the long-term workflow. Factory demand is catalog-derived.

## DB changes

None applied. Proposed later: `catalog_design_asset_jobs` (not created). Optional column expansion of `catalog_design_assets` at APPROVED publish time.


## Plant Visual Production Pipeline V1 — production path

The scalable production path is now implemented as orchestration over the existing factory components:

`canonical catalog → required visual states → gap detection → quality/prompt plan → explicit spend envelope → image generation → technical QA → framing QA → botanical/state QA → in-garden QA → presentation sizing → promotion gate → immutable publish → registry activation`.

### New invariants learned from the Mango/Banana production incident

1. **Asset quality and renderer sizing are separate concerns.** Never regenerate a good source image to solve a runtime-size problem.
2. **Source resolution is preserved.** Presentation size is metadata; production binaries are not resampled merely to look larger in Garden Design.
3. **Framing is a mandatory production gate.** Alpha bounds must preserve transparent breathing room above and beside the specimen. A cutout that visually touches/crosses the canvas edge is rejected/regenerated before promotion.
4. **Presentation size is derived, not handwritten per species.** `presentation-sizing-v1` uses `visualForm + alphaBBox + source dimensions`. It contains no canonical-slug switch. Trusted physical-size authority may override it at runtime.
5. **One canonical Design Asset powers picker + canvas.** The same resolved asset identity is used by thumbnails, placement canvas, save/reload, and future variants.
6. **Generation never happens on lookup/render.** Paid generation exists only in the owner-approved production executor and remains default-deny.
7. **New production records carry `productionApproved:true`.** Candidate generation success is never equivalent to production approval.
8. **Owner workload target is exceptions-only.** Routine passes are intended to auto-flow after the auto-approval calibration gate is explicitly enabled; ambiguous identity, QA conflict, repeated failure, or unusual cost remains Owner Review.

### Generic paid generation executor

`plant-visual-production-execute-v1.js` is the reusable generation path for future waves. It only allows network when the same run id is present in all three explicit run controls:

- `--run-id=<id>`
- `--approve-envelope=<id>`
- `--owner-approve-run=<id>`
- `--execute-production-run=<id>`

and the ordinary max-jobs / max-calls / max-spend / paid-call limits are also present.

Generated files are **candidates only** under `assets/plants/candidates/plant-visual-production-v1/<runId>/`. The executor never writes the live production registry.

### Presentation sizing calibration

`presentation-sizing-v1` uses normalized alpha bounds so transparent padding does not make a plant look artificially small. The current profile calibration reproduces the owner-approved Mango/Banana visual sizing from the production incident without plant-name rules:

- Mango-like tree alpha bounds → ~480 px baseline at the 1200 px reference scene.
- Banana-like herbaceous clump alpha bounds → ~405 px baseline at the same reference scene.

These are neutral presentation baselines, not botanical meter claims. Physical-size authority remains the higher-level source when trusted evidence exists.
