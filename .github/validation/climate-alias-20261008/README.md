# Disposable integration validation — no merge authority

Product candidate: `9c36d550a2476a64b4f0013b2599543538afd4fe` on `integration/climate-alias-candidate-20261008`.
Direct parent: `97d839085d6dc20d588d81e8b29fd8ab141c954d`.
Complete cherry-pick source: `844f9fbc7945db357cf4adc5ba9ecc511490a209`; applied using `git cherry-pick -x` with zero conflicts.

This branch contains validation tooling only, separately from the frozen product candidate. A successful validation result does NOT authorize merging this disposable candidate, any constituent branch, or this tooling branch into main. Final merge composition requires a separate Supervisor Gate.

## Scope and proof

`candidate-proof.json` records the complete original alias delta and candidate delta. Raw full-width object IDs, operation types, modes, paths, and the full binary/full-index diff are identical. The 20-file delta changes four existing files and adds 16. All 2,551 paths outside this delta stay identical to the frozen climate parent. `run-integration.mjs` recomputes the raw and complete binary diff using separate pinned candidate and alias-baseline checkouts; patch-id is not used as sole proof. Ancestry is checked against the exact four preserved climate commits plus the new candidate commit.

`test-manifest.json` was generated before execution and identifies all required test files by exact Git blob and SHA-256. Counts per full suite: alias 65; systemic 113; previously verified current UNKNOWN/tri-state behavior 75; six-plant proposal/execution and visual-state/approval contracts 65; expanded 347. Suites overlap. Existing test sources, assertions, execution selection and skip conditions are unchanged. The systemic nine-file list is copied from the exact existing workflow. No SQL, database client, media generation or deployment script is executed; the climate uploader is invoked with `plan` only.

## Expanded baseline exceptions

`baseline-exceptions.json` is closed before execution and contains the four previously documented failure identities/reasons and nine pre-existing missing-corpus skips. Fresh same-environment runs of alias baseline `844f9fb` and the integrated candidate compare all test identities, failure reason/code/operator/actual/expected, and skip reasons. Unknown exceptions, new skips, changed reasons, missing tests and network attempts produce HOLD. Expected failures remain visibly failed in counts; they are not rewritten into passes. The policy success label `REQUIRED_PASS_BASELINE_EXCEPTIONS_REMAIN` is distinct from an all-green expanded suite.

## Fresh 42-case product run

`integration-matrix.mjs` is a NEW validator outside the candidate. Its fixtures and behavior functions are copied byte-for-byte from the unchanged historical boolean validator. `matrix-adaptation-proof.json` inventories the bounded adaptations: explicit external product root/output; exact new Smart Rec and two shared identity-module source pins; and a second complete comparison against the approved `97d8390` report. All original 14 app source-range fingerprints, fixture pins, scorer condition checks and pre-UNKNOWN behavior expectations are retained. The matrix loads and executes the integrated product modules, not old module bytes. No semantic/diagnostic changes from the approved UNKNOWN report are expected. The original source runner, reports, fingerprints and pins remain intact; the new report is created outside product with exclusive creation.

## I/O boundary

Tests run without Production/service credentials. The validation-only guard blocks live fetch/HTTP/HTTPS/TCP/TLS/WebSocket/UDP paths, records any attempted network, and constrains writes. The one old media benchmark that writes its result JSON has its output redirected into fresh external evidence; its historical report bytes, assertions and test code remain unchanged. This is output handling, not a replacement identity source or test result. All tracked candidate and baseline files are hashed before/after and both working trees must remain clean. GitHub checkout/setup/artifact infrastructure is outside product networking; product attempts must remain zero.

## Tooling preparation history

The initial local launch (local-v1) failed before test execution because the custom reporter path needed a file URL on Windows and the copied integration module had a displaced shebang. The next launch (local-v2) executed the tests but its new audit logger recursed when a media test emitted its report. This occurred on both pinned product and baseline; the trace points solely into the new guard. The logger now uses the captured native write function. These were validation-only fixes; no product files, fixtures, tests, assertions or exception lists changed. All initial evidence is retained outside source and no such failed attempt is claimed as passing. Final runs use fresh evidence directories.

## Local execution

```sh
node .github/validation/climate-alias-20261008/run-integration.mjs /path/to/exact-candidate /path/to/exact-844f9fb /path/to/new-evidence-directory
```

The hosted workflow checks out all three roles separately: validation carrier, exact candidate SHA, and exact alias baseline SHA. Product checkout has sufficient ancestry for lineage proof. It uses GitHub-hosted Ubuntu 24.04 and Node 22, does not install dependencies or use Production credentials, and uploads logs even on HOLD. Report product SHA and workflow-carrier SHA separately.

STOP after evidence delivery: no merge, deploy, SQL replay, DB/R2/Registry write, paid AI or image generation.
