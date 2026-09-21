# CRUVIT Plant Asset Factory — Roadmap Checkpoint V1

Status date: 2026-09-21
Role: execution checkpoint for CRUVIT Garden Operating System visual production and catalog expansion.

## Success definition

CRUVIT must be able to add tens and later hundreds of plants through one controlled pipeline without ad-hoc per-plant fixes and without requiring the owner to manually review routine cases.

A plant batch is not considered production-ready merely because catalog rows or PNGs exist. Readiness is capability-specific and auditable.

## Non-negotiable pipeline

CANONICAL_IDENTITY
→ BOTANICAL_DATA
→ SIZE_AUTHORITY
→ CLIMATE_TRAITS
→ CLIMATE_OUTCOME_READINESS
→ VISUAL_DEMAND
→ VISUAL_GENERATION
→ TECHNICAL_QA
→ FRAMING_QA
→ BOTANICAL_IDENTITY_QA
→ STATE_QA
→ IN_GARDEN_QA
→ OWNER_REVIEW_ONLY_WHEN_REQUIRED
→ PROMOTION
→ PRODUCTION_REGISTRY
→ APP_RUNTIME

No silent guesses. UNKNOWN/BLOCKED is valid.
No generation on render or lookup.
No asset reaches production from generation alone.
No silent binary replacement under an existing asset ID.

## Capability readiness

Plant Identification, Smart Recommendations, Climate Suitability, Garden Design, My Garden, and other modules must consume explicit readiness states. One ready capability must not falsely imply another is ready.

Climate suitability must continue to distinguish:
- survival
- vegetative growth
- flowering
- fruiting


## Plant size authority — locked policy

Absolute plant size must never be derived from visual form alone.

The authority order is:

1. canonical botanical identity,
2. cultivar / rootstock / maintained-form context when materially relevant,
3. source-supported botanical height + spread evidence,
4. growth stage,
5. architecture / visual form,
6. scene geometry and photo calibration,
7. trusted saved placement calibration for the same compatible plant/state family,
8. user resize override as design state,
9. morphology/form-stage fallback only when stronger evidence is unavailable.

Examples:
- Mango and Lemon may both be trees but must not share one universal size.
- Cypress and Oak may both be trees but differ strongly in height/spread architecture.
- Lychee may be materially smaller than other mature fruit trees.
- Banana is herbaceous but may be very large.
- Pineapple is a low rosette despite being mature and fruiting.
- Flowers and shrubs must use plant-specific dimensions where available; “flower = small” and “shrub = medium” are forbidden as botanical truth.

Height and spread are separate dimensions. Independent X/Y stretching to fake botanical spread is forbidden.

The existing Small / Medium / Large / XL / XXL QA bands are fallback presentation tools only. They are not Botanical Size Authority and must never become catalog truth.

Every plant/state receives an explicit size-authority state:
- SIZE_AUTHORITY_READY
- SIZE_AUTHORITY_PARTIAL
- SIZE_AUTHORITY_CONTEXT_REQUIRED
- SIZE_AUTHORITY_CONFLICT_HOLD
- SIZE_AUTHORITY_EVIDENCE_GAP
- SIZE_AUTHORITY_ESTIMATED
- SIZE_AUTHORITY_NOT_EVALUATED

UNKNOWN / HOLD / CONTEXT_REQUIRED are valid outcomes. No silent guessing.

Garden Design may remain usable with an explicitly estimated preview and manual resize when authority is incomplete, but must not present that estimate as meter-accurate truth.

Saved placement calibration may transfer between sibling phenology states only when canonical identity, visual form, architecture, growth stage and visible asset aspect remain compatible. It must never transfer across different canonical plants simply because their morphology matches.

The same size-authority model must expand beyond trees to shrubs, subshrubs, herbaceous plants, rosettes, climbers, palms, grasses, groundcovers and succulents as catalog batches are added.

Machine-readable contract:
- `data/garden-design/plant-size-authority-policy-v1.json`

## Visual storage target

Candidate binaries:
- Cloudflare R2 bucket: cruvit-plant-visual-candidates
- private/non-authoritative
- contains generated candidates, retries, rejected assets, QA candidates and historical evidence binaries

Production binaries:
- Cloudflare R2 bucket: cruvit-plant-visual-production
- only fully approved immutable assets
- content-addressed/versioned keys
- never overwrite an existing production asset ID with different bytes

GitHub remains authoritative for:
- code
- policies
- manifests
- registries
- QA evidence
- checksums
- prompt/model/version metadata

GitHub is not the long-term binary store for large-scale plant PNGs.

## Owner workload target

Owner review is exception-only.

At scale the system should report, for example:
- passed automatically
- regeneration required
- identity blocked
- climate evidence blocked
- owner review required

The owner should not inspect hundreds of routine images.

## Batch ingestion contract

Every new plant batch receives a batch manifest and per-plant states:

INGESTED
→ IDENTITY_RESOLVED
→ BOTANICAL_DATA_READY
→ SIZE_AUTHORITY_EVALUATED
→ CLIMATE_READY
→ VISUAL_DEMAND_READY
→ VISUALS_READY
→ PRODUCT_READY

Any stage may be BLOCKED with an explicit reason code.

## Visual family scaling strategy

Calibrate rules by visual family rather than by individual slug. Examples:
- tree / woody dense foliage
- large-leaf herbaceous
- shrub
- climber
- rosette
- succulent
- palm-like
- dormant branch structure
- flowering state
- fruiting state

A family may scale only after its prompt + QA policy has demonstrated reliable performance.



## Batch-scale QA architecture — locked

Plant Visual QA is batch/manifest driven. It must not require code edits for each plant.

For every batch:
1. candidate binaries live in candidate R2,
2. batch evidence is converted to one `plant-visual-qa-manifest-v1`,
3. the generic candidate reader resolves `manifestId + jobId` to an R2 object,
4. the QA surface loads the manifest dynamically,
5. the QA surface delegates in-garden rendering to the production Garden Design renderer in read-only mode,
6. Size Authority / promotion presentation sizing / compatible saved placement anchors provide renderer inputs,
7. owner review defaults to exceptions only,
8. promotion remains a separate explicit gate.

Locked invariants:
- no per-species allowlist in the QA reader,
- no per-job renderer code,
- no independent QA scale renderer,
- no Small/Medium/Large/XL/XXL vocabulary as production size truth,
- no species-specific `baseWidthPx` hard-codes in the QA runtime,
- saved placement anchors are data records and require compatibility checks,
- size preferences are data records, not `if canonicalSlug === ...` code,
- every production job carries an explicit `sizeAuthorityPlan`,
- wave planning automatically loads `botanical-size-authority-v1.json`,
- non-tree forms use the same Size Authority model when canonical evidence becomes available,
- owner workload target remains exception-only.

Generic building blocks:
- `modules/garden-design/asset-factory-v1/plant-visual-qa-manifest-v1.js`
- `scripts/plant-visual-qa-manifest-v1.mjs`
- `netlify/functions/plant-visual-qa-candidate.mjs`
- `modules/garden-design/asset-factory-v1/production-renderer-qa-preview-v1.js`
- `data/garden-design/garden-design-qa-saved-placement-anchor-registry-v1.json`
- `data/garden-design/garden-design-size-preference-registry-v1.json`

A batch of 10, 50, 100 or more visual jobs must use the same code path. Scale-up is controlled by data volume and exception rate, not by adding plant-specific branches.

## Current pilot checkpoint

Validated generation/framing candidates:
- banana young vegetative: reuse existing candidate; no duplicate paid generation
- mango young vegetative: Technical QA PASS; Framing QA PASS
- mango mature fruiting v3: Technical QA PASS; Framing QA PASS
- pineapple mature fruiting: Technical QA PASS; Framing QA PASS

Generation is not the final approval. These now proceed to botanical/state/in-garden QA.

## Schedule targets

These are execution targets, not permission to bypass QA:

- 2026-09-21 to 2026-09-22: plant visual R2 architecture + pilot candidate storage foundation
- 2026-09-22 to 2026-09-23: Botanical + State + In-Garden QA for pilot assets
- 2026-09-23: promotion of assets that pass full gates + E2E proof
- 2026-09-24 to 2026-09-26: first real production wave, ~10–12 plants / up to ~24 visual jobs
- 2026-09-26 to 2026-09-27: Wave 1 postmortem and family-rule hardening
- 2026-09-28 to 2026-10-04: expand by ~30–40 additional plants if exception rate is acceptable
- first half of October 2026: target ~100 plants through the full pipeline
- October–November 2026: progress toward continuous batch production and hundreds of plants, conditional on automated QA quality and low owner-review rate

## Scale gate

Do not increase batch size merely because generation is cheap or fast.

Scale only when:
1. identity blockers are controlled,
2. size authority is explicit (ready, partial, context-required, hold, gap or estimated),
3. climate readiness is explicit,
4. visual demand is biologically derived,
5. automated Technical + Framing QA are stable,
6. botanical/state QA has a repeatable path,
7. real in-garden QA is operational,
8. owner-review exception rate is low enough to preserve automation-first operation.

## Immediate next sequence

1. Lock plant visual R2 storage contract.
2. Create/wire candidate and production buckets with separate least-privilege credentials.
3. Move pilot candidates out of temporary Netlify Blob/GitHub candidate locations into candidate R2 storage.
4. Preserve hashes and lineage in GitHub evidence.
5. Run Botanical Identity QA + State QA.
6. Run In-Garden QA on the real persisted Garden Design photo.
7. Promote only assets that pass all mandatory gates.
8. Run first real bounded visual production wave.
