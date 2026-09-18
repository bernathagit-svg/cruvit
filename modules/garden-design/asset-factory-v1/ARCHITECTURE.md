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

**Recommend:** binaries in `catalog-design-assets` object storage/CDN; job + QA metadata in a durable job store; thin public row in `catalog_design_assets` only on APPROVED. Repo PNG embedding does not scale to thousands of assets or Netlify frontend deploys. User garden photos must never auto-promote. No storage migration in this task.

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
