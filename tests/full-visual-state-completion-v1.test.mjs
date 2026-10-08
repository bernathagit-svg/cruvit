/**
 * Independent completion-gate regressions.
 * Real cases use the six unchanged catalog-after records and existing authorities.
 * SYNTHETIC cases alter only an in-memory copy to exercise requirement decisions;
 * they are not botanical findings about Mango and are never persisted.
 * Reads files only. No network, generation, database, registry or artifact writes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateFullCruvitPlantApproval } from '../modules/catalog/full-cruvit-plant-approval-v1.js';
import { resolveCruvitPlantIntakeStage } from '../modules/catalog/cruvit-plant-intake-engine-v1.js';
import { buildPlantVisualVariantPlan } from '../modules/garden-design/asset-factory-v1/plant-visual-variant-plan-v1.js';
import { buildPlantVisualVariantGapPlan } from '../modules/garden-design/asset-factory-v1/plant-visual-variant-gap-plan-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = 'data/garden-design/plant-intake-e2e-stress-tests/six-plant-climate-supplement-2026-10-07-v1/';
const read = relative => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const snapshot = read(DATA + 'catalog-after.json');
const rows = new Map([...snapshot.target_rows, ...snapshot.control_rows].map(record => [record.slug, record.row]));
const identity = read('data/plant-identity.registry.json');
const assets = read('modules/garden-design/assets/plants/design-asset-registry-v1.json');
const sizes = read('data/catalog/botanical-size-authority-v1.json');
const media = read('data/catalog-media/active-canonical-image-coverage-v1.json');
const RESEARCH_BLOCKER = 'VISUAL_STATE_APPLICABILITY_UNRESOLVED';
const RESEARCH_ACTION = 'RESEARCH_VISUAL_STATE_APPLICABILITY';
const RECEIPT_BLOCKER = 'VISUAL_STATE_COMPLETION_RESULT_REQUIRED';

function inputsFor(slug) {
  const row = rows.get(slug);
  assert.ok(row, 'Missing saved catalog-after record: ' + slug);
  const id = identity.canonicalIdentities.find(record =>
    record.canonicalSlug === slug || (record.aliasSlugs || []).includes(slug));
  const canonicalSlug = id?.canonicalSlug || slug;
  return {
    catalogRow: clone(row),
    identityRegistry: clone(identity),
    designAssetRegistry: clone(assets),
    sizeAuthorityRegistry: clone(sizes),
    catalogMediaCoverageRecord: clone(media.records.find(record => record.slug === canonicalSlug) || null)
  };
}

function intakeFor(fullApproval, visualTransient = null) {
  return resolveCruvitPlantIntakeStage({
    request: {canonicalSlug: fullApproval.canonicalSlug},
    catalogExists: true,
    fullApproval,
    visualTransient
  });
}

function assertNoPaidOrOwnerActions(intake) {
  assert.deepEqual(intake.paidActions, []);
  assert.deepEqual(intake.ownerActions, []);
  assert.ok(intake.nextActions.every(action => action.actor === 'SYSTEM'));
}

// Fixed expected facts from the published six-record recovery snapshot, not
// values calculated from the changed approval implementation.
const REAL_CASES = [
  {slug:'mango', unknown:['flowering'], required:3, covered:3, missing:0},
  {slug:'date-palm', unknown:['flowering'], required:3, covered:0, missing:3},
  {slug:'monstera', unknown:['flowering'], required:3, covered:0, missing:3},
  {slug:'bigleaf-hydrangea', unknown:['fruiting'], required:3, covered:0, missing:3},
  {slug:'fig', unknown:['flowering'], required:5, covered:0, missing:5},
  {slug:'lettuce', unknown:['flowering','fruiting'], required:1, covered:0, missing:1}
];

for (const expected of REAL_CASES) {
  test('saved ' + expected.slug + ': unresolved states block final approval while Class A and coverage stay intact', () => {
    const input = inputsFor(expected.slug);
    const before = clone(input);
    const result = evaluateFullCruvitPlantApproval(input);
    const design = result.modules.gardenDesign;

    assert.equal(result.modules.climateAndSuitability.readinessClass, 'A');
    assert.equal(result.modules.climateAndSuitability.gate, 'PASS');
    assert.equal(result.onboarding.ready, true);
    assert.deepEqual(design.unknownStates, expected.unknown);
    assert.deepEqual({
      required: design.requiredVariantCount,
      covered: design.coveredRequiredCount,
      missing: design.missingRequiredCount
    }, {required:expected.required, covered:expected.covered, missing:expected.missing});
    assert.equal(design.minimumVisualCoverageReady, expected.slug === 'mango');
    assert.equal(design.visualStateApplicabilityResolved, false);
    assert.equal(design.allRequiredVisualStatesComplete, false);
    assert.equal(result.approved, false);
    assert.equal(result.status, 'ENRICHMENT_REQUIRED');
    assert.ok(result.blockingReasons.includes(RESEARCH_BLOCKER));

    // Even a ready plan with known missing images must first resolve these
    // applicability decisions instead of treating UNKNOWN as a paid job.
    const intake = intakeFor(result, {
      requiredPlanReady:true,
      missingGenerationCount:expected.missing
    });
    assert.equal(intake.finalApproved, false);
    assert.equal(intake.stage, 'DATA_ENRICHMENT_REQUIRED');
    assert.ok(intake.blockingReasons.includes(RESEARCH_BLOCKER));
    assert.ok(intake.systemActions.some(action => action.code === RESEARCH_ACTION && action.actor === 'SYSTEM'));
    assertNoPaidOrOwnerActions(intake);
    assert.deepEqual(input, before, 'Evaluation must preserve the entire input record and authorities');
  });
}

test('saved Mango remains usable for minimum Garden Design coverage without an all-states claim', () => {
  const input = inputsFor('mango');
  const result = evaluateFullCruvitPlantApproval(input);
  const plan = buildPlantVisualVariantPlan({catalogRow:input.catalogRow, fullOnboarding:result.onboarding});
  const gaps = buildPlantVisualVariantGapPlan({variantPlan:plan, registry:input.designAssetRegistry});

  assert.equal(plan.ready, true);
  assert.equal(plan.generationAllowed, true);
  assert.equal(plan.floweringRequired, 'UNKNOWN');
  assert.equal(plan.dormantRequired, 'NOT_REQUIRED');
  assert.equal(gaps.status, 'REQUIRED_VARIANTS_COVERED');
  assert.equal(gaps.generationAllowed, false);
  assert.equal(gaps.requiredVariantCount, 3);
  assert.equal(gaps.coveredRequiredCount, 3);
  assert.equal(result.modules.gardenDesign.ready, true);
  assert.equal(result.modules.gardenDesign.minimumVisualCoverageReady, true);
  assert.equal(result.modules.gardenDesign.allRequiredVisualStatesComplete, false);
  assert.deepEqual(input.catalogRow.climate_traits, rows.get('mango').climate_traits);
});

function claimedComplete(design = {}) {
  return {
    canonicalSlug:'synthetic-intake-contract',
    approved:true,
    status:'FULL_CRUVIT_APPROVED',
    blockingReasons:[],
    modules:{
      gardenDesign:{
        minimumVisualCoverageReady:true,
        visualStateApplicabilityResolved:true,
        allRequiredVisualStatesComplete:true,
        unknownStates:[],
        ...design
      }
    }
  };
}

test('intake cannot bypass any known UNKNOWN with contradictory positive flags and an empty blocker list', () => {
  for (const state of ['young','flowering','fruiting','dormant']) {
    const input = claimedComplete({unknownStates:[state]});
    const before = clone(input);
    const result = intakeFor(input);
    assert.equal(result.finalApproved, false, state);
    assert.equal(result.stage, 'DATA_ENRICHMENT_REQUIRED', state);
    assert.ok(result.blockingReasons.includes(RESEARCH_BLOCKER), state);
    assert.ok(result.systemActions.some(action => action.code === RESEARCH_ACTION), state);
    assertNoPaidOrOwnerActions(result);
    assert.deepEqual(input, before, 'Normalize locally; do not rewrite the supplied gate result');
  }
});

test('legacy approval without a positive completion receipt requests the current gate without inventing botanical UNKNOWN', () => {
  const noReceipt = claimedComplete();
  delete noReceipt.modules.gardenDesign.allRequiredVisualStatesComplete;
  const noModules = claimedComplete();
  delete noModules.modules;
  for (const input of [noReceipt, noModules]) {
    const result = intakeFor(input);
    assert.equal(result.finalApproved, false);
    assert.equal(result.stage, 'BLOCKED');
    assert.deepEqual(result.blockingReasons, [RECEIPT_BLOCKER]);
    assert.ok(result.systemActions.some(action => action.code === 'RUN_FULL_CRUVIT_APPROVAL'));
    assert.ok(!result.systemActions.some(action => action.code === RESEARCH_ACTION));
    assertNoPaidOrOwnerActions(result);
  }
});

test('a false completion receipt with no detailed blocker requests recomputation instead of approval', () => {
  const result = intakeFor(claimedComplete({allRequiredVisualStatesComplete:false}));
  assert.equal(result.finalApproved, false);
  assert.equal(result.stage, 'BLOCKED');
  assert.deepEqual(result.blockingReasons, [RECEIPT_BLOCKER]);
  assert.ok(result.systemActions.some(action => action.code === 'RUN_FULL_CRUVIT_APPROVAL'));
  assert.ok(!result.systemActions.some(action => action.code === RESEARCH_ACTION));
  assertNoPaidOrOwnerActions(result);
});

test('false component flags invalidate a positive completion receipt without inventing botanical UNKNOWN', () => {
  for (const field of ['visualStateApplicabilityResolved', 'minimumVisualCoverageReady']) {
    const result = intakeFor(claimedComplete({[field]:false}));
    assert.equal(result.finalApproved, false, field);
    assert.equal(result.stage, 'BLOCKED', field);
    assert.deepEqual(result.blockingReasons, [RECEIPT_BLOCKER], field);
    assert.ok(result.systemActions.some(action => action.code === 'RUN_FULL_CRUVIT_APPROVAL'), field);
    assert.ok(!result.systemActions.some(action => action.code === RESEARCH_ACTION), field);
    assertNoPaidOrOwnerActions(result);
  }
});

test('explicit gate blockers override contradictory approved/status and positive completion receipt', () => {
  for (const blocker of ['PLANT_KNOWLEDGE_NOT_READY', RESEARCH_BLOCKER]) {
    const input = claimedComplete();
    input.blockingReasons = [blocker];
    const result = intakeFor(input);
    assert.equal(result.finalApproved, false, blocker);
    assert.equal(result.stage, 'DATA_ENRICHMENT_REQUIRED', blocker);
    assert.ok(result.blockingReasons.includes(blocker));
    assertNoPaidOrOwnerActions(result);
  }
});

function syntheticDecisionInput(tag) {
  // SYNTHETIC CONTRACT FIXTURE ONLY. Retain the saved Mango identity/role
  // authorities to isolate the decision rule, but add a fictional visual tag
  // solely in this cloned input. This does not resolve real Mango flowering.
  const input = inputsFor('mango');
  input.catalogRow._syntheticTestFixture = {
    purpose:'Test resolved visual applicability with existing covered roles',
    botanicalClaimAllowed:false,
    persisted:false
  };
  input.catalogRow.climate_traits.designMetadata.tags.push(tag);
  return input;
}

function syntheticEvaluation(tag) {
  const input = syntheticDecisionInput(tag);
  const result = evaluateFullCruvitPlantApproval(input);
  const plan = buildPlantVisualVariantPlan({catalogRow:input.catalogRow, fullOnboarding:result.onboarding});
  const gaps = buildPlantVisualVariantGapPlan({variantPlan:plan, registry:input.designAssetRegistry});
  return {input, result, plan, gaps};
}

for (const fixture of [
  {tag:'spring-bloom', state:'OPTIONAL', optionalCount:1},
  {tag:'not showy', state:'NOT_REQUIRED', optionalCount:0}
]) {
  test('SYNTHETIC resolved ' + fixture.state + ' flowering is compatible with full approval and requires no generation', () => {
    const {input, result, plan, gaps} = syntheticEvaluation(fixture.tag);
    assert.equal(input.catalogRow._syntheticTestFixture.botanicalClaimAllowed, false);
    assert.equal(plan.floweringRequired, fixture.state);
    assert.equal(plan.dormantRequired, 'NOT_REQUIRED');
    assert.deepEqual(plan.unknownStates, []);
    assert.equal(plan.requiredVariants.length, 3);
    assert.equal(plan.optionalVariants.length, fixture.optionalCount);
    assert.ok(!plan.requiredVariants.some(role => role.phenologyState === 'flowering' || role.phenologyState === 'dormant'));
    assert.equal(gaps.missingRequiredCount, 0);
    assert.equal(gaps.missingOptionalCount, fixture.optionalCount);
    assert.equal(gaps.generationAllowed, false);
    assert.equal(result.modules.gardenDesign.minimumVisualCoverageReady, true);
    assert.equal(result.modules.gardenDesign.visualStateApplicabilityResolved, true);
    assert.equal(result.modules.gardenDesign.allRequiredVisualStatesComplete, true);
    assert.deepEqual(result.blockingReasons, []);
    assert.equal(result.approved, true);
    assert.equal(result.status, 'FULL_CRUVIT_APPROVED');

    const intake = intakeFor(result);
    assert.equal(intake.finalApproved, true);
    assert.equal(intake.stage, 'FULL_CRUVIT_APPROVED');
    assert.deepEqual(intake.nextActions, []);
    assertNoPaidOrOwnerActions(intake);
    assert.deepEqual(rows.get('mango').climate_traits.designMetadata.tags, ['tree','fruit','edible','tropical','evergreen']);
  });
}

test('SYNTHETIC resolved REQUIRED flowering still needs its missing exact asset before full approval', () => {
  const {result, plan, gaps} = syntheticEvaluation('showy');
  assert.equal(plan.floweringRequired, 'REQUIRED');
  assert.deepEqual(plan.unknownStates, []);
  assert.equal(gaps.requiredVariantCount, 4);
  assert.equal(gaps.coveredRequiredCount, 3);
  assert.equal(gaps.missingRequiredCount, 1);
  assert.equal(gaps.missingRequired[0].phenologyState, 'flowering');
  assert.equal(result.modules.gardenDesign.visualStateApplicabilityResolved, true);
  assert.equal(result.modules.gardenDesign.minimumVisualCoverageReady, false);
  assert.equal(result.modules.gardenDesign.allRequiredVisualStatesComplete, false);
  assert.equal(result.approved, false);
  assert.equal(result.status, 'VISUAL_COMPLETION_REQUIRED');
  assert.ok(result.blockingReasons.includes('REQUIRED_VISUAL_VARIANTS_MISSING'));
  assert.ok(!result.blockingReasons.includes(RESEARCH_BLOCKER));
});

test('completion evaluation leaves historical catalog artifacts and all existing authorities byte-identical', () => {
  const protectedPaths = [
    DATA + 'catalog-after.json',
    DATA + 'preflight.json',
    DATA + 'live-intake-readback.json',
    DATA + 'execution-summary.json',
    'data/plant-identity.registry.json',
    'data/catalog/botanical-size-authority-v1.json',
    'data/catalog-media/active-canonical-image-coverage-v1.json',
    'modules/garden-design/assets/plants/design-asset-registry-v1.json'
  ];
  const before = new Map(protectedPaths.map(relative => [relative, fs.readFileSync(path.join(ROOT, relative))]));
  for (const expected of REAL_CASES) intakeFor(evaluateFullCruvitPlantApproval(inputsFor(expected.slug)));
  syntheticEvaluation('spring-bloom');
  syntheticEvaluation('not showy');
  for (const [relative, bytes] of before) {
    assert.deepEqual(fs.readFileSync(path.join(ROOT, relative)), bytes, relative);
  }
});
