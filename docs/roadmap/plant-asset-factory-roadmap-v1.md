# CRUVIT Plant Asset Factory — Roadmap Checkpoint V1

Status date: 2026-09-21
Role: execution checkpoint for CRUVIT Garden Operating System visual production and catalog expansion.

## Success definition

CRUVIT must be able to add tens and later hundreds of plants through one controlled pipeline without ad-hoc per-plant fixes and without requiring the owner to manually review routine cases.

A plant batch is not considered production-ready merely because catalog rows or PNGs exist. Readiness is capability-specific and auditable.

## Non-negotiable pipeline

CANONICAL_IDENTITY
→ BOTANICAL_DATA
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
2. climate readiness is explicit,
3. visual demand is biologically derived,
4. automated Technical + Framing QA are stable,
5. botanical/state QA has a repeatable path,
6. real in-garden QA is operational,
7. owner-review exception rate is low enough to preserve automation-first operation.

## Immediate next sequence

1. Lock plant visual R2 storage contract.
2. Create/wire candidate and production buckets with separate least-privilege credentials.
3. Move pilot candidates out of temporary Netlify Blob/GitHub candidate locations into candidate R2 storage.
4. Preserve hashes and lineage in GitHub evidence.
5. Run Botanical Identity QA + State QA.
6. Run In-Garden QA on the real persisted Garden Design photo.
7. Promote only assets that pass all mandatory gates.
8. Run first real bounded visual production wave.
