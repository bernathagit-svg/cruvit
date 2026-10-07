# Six-Plant Evidence Follow-up — 2026-10-07

Status: REVIEW DRAFT. No application, deployment, paid AI or image generation.
Base: bbc7f1b0f03c1eaff8d7f83e9e0599f086d67033.

## Work completed in this continuation

Reviewed the live full-cruvit-plant-approval response for Mango, Date Palm and Monstera, the current catalog row fingerprints, existing evidence, and the actual readiness/visual-planning code. Prepared a bounded data proposal and 12 executable local tests. Ran those tests together with the 42 relevant pre-existing tests: 54 passed, 0 failed. The raw run output is in test-results.tap. These are local behavioral/contract tests, NOT a live E2E pass or proof of botanical accuracy.

## Precise current blockers

Mango is Class C. Its heatTolerance is absent/explicitly UNKNOWN and coldTolerance has only generic HEURISTIC_ASSERTION provenance. The existing approved hardiness transform can use the independently checked 10B-through-11 source band and retain the existing very_low cold ordinal with explicit transformation lineage. Missing reproductive biology is also reported and should not be hidden just because the current Class-A gate does not enforce that reason.

Date Palm and Monstera have Class-A suitability data under the current classifier, but the onboarding gate reports needsWinterChill as MISSING. The reviewed references did not establish a universal winter-chill boolean. The proposal therefore records a source-reviewed UNKNOWN, not false, and does not change their other climate values. This distinguishes a documented unknown from an omitted field.

The two previously approved Size Authority records exist in canonical source at the base commit. Offline resolution retains CONTEXT_REQUIRED and placementScaleHold=true. This continuation did not deploy them. The live functions still use the previously deployed static size registry.

## Primary-source checks

1. Mango cold lineage: UF/IFAS ST404, General Information, USDA zones 10B through 11. https://ask.ifas.ufl.edu/publication/ST404
2. Mango heat: UF/IFAS HS1499 Table 10 distinguishes an optimum of 75–86 F from reported heat damage above 104 F (above 40 C). The proposed medium ordinal is an explicit conservative CRUVIT heuristic, not a literal source label or a guarantee of safety below that temperature. https://ask.ifas.ufl.edu/publication/HS1499
3. Mango reproductive biology: UF/IFAS MG216 describes male and bisexual flowers and insect pollination. No self-fertility boolean is inferred. Favorable dry bloom weather is preserved as a preference, not a mandatory dry-season rule. https://ask.ifas.ufl.edu/publication/MG216
4. Date Palm review: UF/IFAS FR314 covers landscape/fruiting requirements but did not establish a winter-chill boolean for this review. https://ask.ifas.ufl.edu/publication/FR314
5. Monstera review: UF/IFAS HS311 and NCSU distinguish tropical/subtropical cultivation from indoor foliage use; this review did not establish a universal winter-chill boolean. https://ask.ifas.ufl.edu/publication/HS311 ; https://plants.ces.ncsu.edu/plants/monstera-deliciosa/

## Simulation results — not applied

The proposed cold-lineage correction, explicitly heuristic heat field and source-linked reproductive context move the saved Mango fixture from C/PARTIAL to A/PASS in the existing classifier. Humidity and winter chill remain UNKNOWN. The saved row is unchanged.

The two chill fixtures show that the current onboarding contract already accepts an explicit UNKNOWN without inventing a boolean. They test the contract; they are not fresh whole-record E2E executions for Date Palm or Monstera.

## Important all-states accounting defect

The live Mango response reports 3 required variants covered, zero missing, while unknownStates includes flowering. In the Mango draft simulation, FULL_CRUVIT_APPROVED can become true while flowering remains unresolved. This is a reproduced minimum-coverage versus all-states-completion defect, NOT an all-states success.

The live Date Palm and Monstera plans also contain flowering in unknownStates. UNKNOWN must not be relabelled NOT_REQUIRED to improve coverage counts. The current 15 missing-asset planning number is not a final all-states generation budget. Resolve each relevant state, audit existing-asset reuse, and only then request a bounded generation budget.

UF/IFAS ST404 explicitly describes showy Mango flower clusters; FR314 describes visible orange Date Palm inflorescences; NCSU describes Monstera spathes and flowering rarity indoors. These provide evidence for a separate, context-aware visual-state review. This draft does not manufacture new pictures or change the visual requirements registry.

## Safety and publication boundary

No catalog write, Production R2 write, visual Registry activation, paid call or Netlify deployment was executed in this continuation. Existing tracked runtime code, canonical data and image Registry files were unchanged after testing (git diff --exit-code returned 0 for protected paths).

Only proposal.json, this review note and the test evidence are prepared for a review branch; main and the deployed application are not updated by this draft. Applying new climate fields requires separate bounded approval because the preceding approval preserved the existing climate values for Date Palm and Monstera.

Next implementation: approve exact three-record climate patches, apply with optimistic row-fingerprint checks and readback, then separately authorize any metadata deployment. Do not count any plant as all-states complete while a relevant visual state remains unresolved.
