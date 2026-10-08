# Preserve unknown climate booleans

This local draft preserves `UNKNOWN` for `needsWinterChill` and `needsDrySeason` through effective climate metadata. Previously, default `false`, true-only accumulation, and group-based chill inference could replace a canonical unknown or explicit false. The draft changes runtime interpretation without changing botanical source data.

Base commit: `0ca252313fbed6593fce0a754a804e0d352f6aca`. Draft branch: `work/climate-unknown-metadata-20261008`. Boolean policy: `climate-boolean-unknown-v1.0.0`. This record describes local verification; it does not record a push, merge, or deployment.

The four modified runtime files are:

- `app.html`: inline reader, merge and canonical-authority handling, plus three existing chill gates.
- `modules/personal-domain/smart-rec-climate-meta-authority-v1.js`: equivalent module reader and merge policy.
- `modules/personal-domain/specific-plant-suitability-contract.js`: tri-state chill consumer.
- `modules/personal-domain/pre-scale-suitability-systemic-hardening-v1-contract.js`: tri-state chill confidence and explicit-true demotion guard.

The policy preserves three distinct values: `true` means an asserted requirement, `false` means an asserted absence of that requirement, and `null` means unknown. Only an own boolean field supplies a known value; inherited values, strings, numbers, and other malformed values cannot become botanical assertions. Any `UNKNOWN` class or status in the field's evidence maps or provenance defeats a conflicting raw boolean. Existing source-supported and `HEURISTIC` labels are retained without upgrading their strength.

At the canonical catalog boundary, a missing, null, or explicitly unknown field becomes authoritative `null` and cannot inherit `true` from group templates or legacy metadata. During ordinary merging, an unrelated input makes no decision. An unasserted null created by the merger carries a `syntheticDefaultFields` marker and remains a non-decision if merged again; an authored null or field-specific evidence does not receive that exemption. Each later field decision replaces its value and its entries in all three evidence maps atomically, removing stale support that the selected decision did not supply. Canonical projection removes the synthetic boolean markers, and review-only remerges preserve selected boolean provenance.

Chill consumers no longer infer a requirement from group membership alone. The three app gates require resolved `needsWinterChill === true`; the two gates that previously required a temperate group retain that condition and their existing weights. Unknown does not prove either a chill deficit or adequate conditions. No new dry-season scoring rule is introduced.

Recorded verification comprises 75 passing tests across two runs: 57 existing regression tests and then 18 independent tests, with zero failures in each log. The independent tests cover malformed and inherited values, conflicting UNKNOWN markers, synthetic-null remerges, evidence replacement, canonical precedence, aliases, the six actual catalog rows, and known-true consumer behavior. The final own-value guard was added after the 57-test run and is covered by the subsequent independent run; these logs are not a claim that all 75 tests ran together on one revision. See `existing-regression-tests.log` and `independent-tests.log`.

`scope-verification.json` records exact SHA-256 preservation of 60 protected files against the base, including catalog snapshots, visual registries, historical reports, coordinate-climate inputs, and the previous full-approval gate. It also records unchanged app content outside the metadata changes and three chill guards, and preservation of known-true guard weights. This is a bounded file-scope check, not a claim about every repository file or live database state.

The new `location-comparison.json` and its `location-comparison.log` record a successful comparison of all 42 pairs (six plants across seven stored location profiles). The actual candidate scorer, outcome derivation, and alignment ran once per pair. The baseline is the unchanged `tests/_six-plant-location-regression-20261008-report.json` included in the base commit; its original source commit is `eee0ab34c909ca0323fef32e8f65ddd2dc9eae95`. The historical runner and report were read and fingerprinted, not rerun or overwritten.

All 42 decision tuples, including scores, outcome dimensions, recommendation levels, and positive eligibility, are unchanged. The result distribution remains 9 good, 24 borderline, and 9 blocked. Mango, Date Palm, and Monstera remain ineligible for a positive recommendation in all seven profiles. There are exactly nine effective-metadata changes:

| Plant | `needsWinterChill` before -> after | `needsDrySeason` before -> after |
|---|---|---|
| Mango | `false` -> `null` | `false` -> `null` |
| Date Palm | `false` -> `null` | `false` -> `null` |
| Monstera | `false` -> `null` | `false` -> `null` |
| Bigleaf Hydrangea | `false` -> `false` | `false` -> `null` |
| Fig | `true` -> `true` | `false` -> `null` |
| Lettuce | `false` -> `false` | `false` -> `null` |

These are derived fields, not catalog edits. Date Palm's separate structured fruiting dry-season requirement remains `true`. Mango's missing humidity field remains missing. Canonical values, evidence classes, quantitative evidence, reproductive fields, and all seven app climate profiles compare equal to the baseline.

The report lists all 147 diagnostic leaf changes: 63 chill changes across the 21 target/location pairs (`required: false -> null`, `confidence: n/a -> unknown`, and newly explicit `enoughForReliableFruit: null`), plus 84 evaluator/hardening version updates across all 42 pairs. There are zero unexpected diagnostic changes, decision differences, canonical input differences, location differences, execution failures, input mutations, or attempted network calls.

The comparison pins 36 input files, loads 18 allowed modules, and verifies 14 app source ranges. Candidate app blob: `7a05f8e0b2f6fc7edf59b651a0abd9b8521f2eb4`. Candidate scorer SHA-256: `a7ba35330805b3c1d2e2b98c5f05ae39f7e0170dc38e59f8faa825f3b7b5952f`. Removing the single approved chill condition from a verification-only copy reproduces the baseline scorer SHA-256 `6a034c7c1ecdb4754ffbe7e2360cff4136c0efc63ba298d4ffa911eacc5a8183`; the actual run uses the candidate source. The three modules report authority `1.1.0`, hardening `1.0.1-boolean-unknown`, and evaluator `1.1.1-boolean-unknown` as applicable.

The comparison ran without a live forecast, cultivar, maturity, soil, irrigation, or shelter information. Scores are product-policy outputs, not probabilities or agronomic certification. QA sidecars were observed separately and not merged into the pilot profiles; the existing confidence propagation gap remains. The unchanged six-plant data-class A snapshot is inherited from the previous verification, not a fresh database read.

The draft performs no database writes, paid AI calls, image generation, visual Registry writes, or deployment. The evidence here comes from local fixtures, source checks, and recorded tests; it does not establish live browser, API, or Production behavior. Free-text seasonal heuristics, separate `hardBlockRules`, structured `reproductiveClimate` rules, and confidence propagation remain outside this change. The pre-existing additional penalty for a known-true chill requirement plus the temperate group is retained. The change does not resolve unknown visual applicability, establish all-state visual completion, or change the previous approval gate.

Consumers must retain the distinction between `null` and `false`; treating every value other than `true` as “not required” would discard this contract. Existing fixtures or clients that rely on direct group-only inference must first obtain an explicit decision from the appropriate metadata authority.
