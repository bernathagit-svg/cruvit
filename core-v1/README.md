# CRUVIT CORE V1

This directory is the governance root for the CRUVIT Core V1 stabilization effort.

## Base

- Branch: `stabilize/core-v1`
- Parent: `main@c04a885eb81f37aaa89abe98c4d67b250d7ac67e`
- Commit 1 is governance-only.
- No runtime code or visual assets are imported in Commit 1.

## Golden Baseline rule

`CRUVIT_GOLDEN_BASELINE_V1.json` records immutable source checkpoints, approved visual hashes, screen approval states, routes, and Core V1 invariants.

`DEPENDENCY_MANIFEST_V1.json` records dependency-closed file sets for later supervisor-gated commits. It is descriptive in Commit 1 and does not import those files.

## Non-negotiable locks

- The approved Home/carousel is the Core V1 entrypoint. Legacy `app.html` is not a Golden Source and must remain untouched.
- No full merge of PR #140, #145, or #146.
- No redesign, reconstruction, regeneration, crop substitution, or replacement of approved pixels.
- My Plants remains `LOCKED_IMPLEMENTED`, but its arbitrary runtime data binding is explicitly `UNPROVEN_FOR_ARBITRARY_PLANTS` until the Commit 4 gate proves it without visual drift.
- Core V1 MUST inject `personalDomain` explicitly. The legacy `globalThis.cruvitPersonalDomainV0` fallback is forbidden in Core V1 runtime wiring.
- Paid Plant Identification AI remains OFF.
- No Production DB changes.
- No Preview is created by Commit 1.

## Required commit sequence

1. Governance only.
2. Approved Home/carousel + thin Core V1 shell + transparent navigation to My Garden and Plant Identification only.
3. Approved eight-screen Plant Identification flow only.
4. Minimal approved My Garden path: My Garden main -> My Plants.
5. Atomic Add Plant layer + required tests only.

No later commit begins without its supervisor gate.

## First milestone

Approved Home -> Approved Plant Identification -> known fixture -> atomic Save -> Approved My Garden -> My Plants -> refresh -> same authoritative Plant -> retry -> no duplicate.

## API minimization governance

API minimization is an architecture invariant, not a future optimization.

1. **Canonical-first.** Every read starts from CRUVIT canonical/local persisted data. External providers are used only when data is missing, expired by explicit freshness policy, or a user initiates a genuinely new provider-dependent action.
2. **UI never calls providers directly.** Screens/components never call Anthropic, weather, botanical, image-generation, supplier, or other external APIs. The only allowed path is UI -> CRUVIT domain/data layer -> provider-decision gate -> provider if required.
3. **Fetch once -> reuse many -> explicit invalidation.** Reuse valid Garden snapshots/catalog data between screens. After a successful mutation, invalidate/hydrate only affected identities; do not reload the entire system.
4. **Zero-external-call navigation targets.** Opening Home, My Garden, My Plants, an existing Plant Detail, or an already-identified plant targets zero external provider calls. Rendering a canonical plant image targets zero generation calls. Suitability with already-canonical location/catalog/climate data targets zero external calls.
5. **Plant Identification.** A newly user-initiated image allows at most one identification-provider call on the normal path. Another call requires an explicit user retry or separately-approved recovery policy. Once canonical identity is resolved, persist and reuse it.
6. **Images.** Personal image = stored `garden_media` for the exact Plant Instance. Otherwise use the canonical Production visual for the same `profile_slug`. No render-time generation and no provider image lookup on every screen open.
7. **Request deduplication.** Identical in-flight requests are coalesced; concurrent duplicate provider calls are forbidden.
8. **Provenance / freshness.** Externally acquired data carries source/provider, version where applicable, timestamp, freshness/expiry policy, canonical key, and relevant input/context version so reuse vs refresh is explicit.
9. **Internal DB calls are bounded/batched.** No N+1 Supabase query per plant/card where a snapshot/join/batch can satisfy the screen. Prefer garden-level snapshots and targeted post-mutation hydration.
10. **Acceptance metrics.** Meaningful E2E runs report external provider calls, paid AI calls, Supabase read count, Supabase write count, and duplicate calls. Duplicate-call target is zero; while paid AI is locked off, paid-AI-call target is zero.

