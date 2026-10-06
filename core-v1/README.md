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
