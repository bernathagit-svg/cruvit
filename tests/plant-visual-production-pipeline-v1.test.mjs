import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assessProductionFramingQa,
  framingMetricsFromTechnicalQa
} from '../modules/garden-design/asset-factory-v1/production-framing-qa-v1.js';
import {
  derivePresentationSizing
} from '../modules/garden-design/asset-factory-v1/presentation-sizing-v1.js';
import {
  PLANT_VISUAL_DECISION,
  buildPlantVisualProductionPlan,
  evaluatePlantVisualCandidate,
  buildApprovedRegistryVariant
} from '../modules/garden-design/asset-factory-v1/plant-visual-production-pipeline-v1.js';
import {
  parsePlantVisualProductionApproval
} from '../modules/garden-design/asset-factory-v1/plant-visual-production-execute-v1.js';
import {
  partitionPlantVisualWaves
} from '../modules/garden-design/asset-factory-v1/plant-visual-production-wave-v1.js';
import {
  validateProductionRegistryVariant,
  activateProductionRegistryVariant
} from '../modules/garden-design/asset-factory-v1/plant-visual-promotion-guard-v1.js';
import {
  getPlantVisualStorageStatus,
  buildPlantVisualCandidateObjectKey,
  buildPlantVisualProductionObjectKey,
  validatePlantVisualPromotionStorageInput
} from '../modules/garden-design/asset-factory-v1/plant-visual-object-storage-v1.js';
import {
  deriveInGardenQaScale,
  qaScaleBandSpec,
  PILOT_SCALE_CALIBRATION,
  QA_SCALE_POLICY_GOVERNANCE
} from '../modules/garden-design/asset-factory-v1/in-garden-qa-scale-policy-v1.js';

function technicalPass(overrides = {}) {
  return {
    result: 'PASS',
    reasons: [],
    metrics: {
      format: 'png',
      decodes: true,
      width: 1024,
      height: 1536,
      hasAlphaChannel: true,
      bbox: {
        exists: true,
        minX: 35,
        minY: 63,
        maxX: 1006,
        maxY: 1499
      },
      ...overrides
    }
  };
}

test('production prompt requires framing safe-zone and plant-only isolation', () => {
  const plants = [{
    slug: 'fixture-tree',
    canonicalSlug: 'fixture-tree',
    scientific: 'Ficus fixturea',
    tags: ['tree', 'evergreen'],
    growth: 'Evergreen landscape tree',
    identityScope: 'species'
  }];
  const plan = buildPlantVisualProductionPlan(plants, { sets: [] }, {
    ownedCanonicalSlugs: ['fixture-tree']
  });
  const prompt = plan.jobs[0].promptRecord.prompt;
  assert.match(prompt, /FRAMING SAFE ZONE/);
  assert.match(prompt, /must not touch any image boundary/);
  assert.match(prompt, /Center the specimen horizontally/);
  assert.match(prompt, /no more than about 90% of the canvas/);
  assert.match(prompt, /PLANT ONLY/);
  assert.match(prompt, /no people, animals, insects, birds, fish/);
});

test('framing QA rejects a top-cropped cutout and accepts transparent breathing room', () => {
  const pass = assessProductionFramingQa(technicalPass());
  assert.equal(pass.result, 'PASS');
  const fail = assessProductionFramingQa(
    technicalPass({
      bbox: { exists: true, minX: 35, minY: 0, maxX: 1006, maxY: 1499 }
    })
  );
  assert.equal(fail.result, 'FAIL');
  assert.ok(fail.reasons.includes('top-padding-too-small'));
  assert.equal(fail.retryable, true);
});

test('presentation sizing derives Mango/Banana-like sizes from form + alpha bounds, not slug switches', () => {
  const mangoLike = derivePresentationSizing({
    visualForm: 'tree',
    width: 1024,
    height: 1536,
    alphaBBox: { exists: true, minX: 35, minY: 63, maxX: 1006, maxY: 1499 }
  });
  const bananaLike = derivePresentationSizing({
    visualForm: 'herbaceous-clump',
    width: 1024,
    height: 1536,
    alphaBBox: { exists: true, minX: 18, minY: 42, maxX: 988, maxY: 1497 }
  });
  assert.equal(mangoLike.status, 'CALIBRATED_BASELINE');
  assert.ok(mangoLike.baseWidthPx >= 450 && mangoLike.baseWidthPx <= 510);
  assert.equal(bananaLike.status, 'CALIBRATED_BASELINE');
  assert.ok(bananaLike.baseWidthPx >= 380 && bananaLike.baseWidthPx <= 430);
  assert.equal(mangoLike.canonicalSlugIndependent, true);
  assert.equal(bananaLike.ownerManualPerPlantSizingRequired, false);
});

test('production planning connects catalog gap detection to quality/prompt planning without generating', () => {
  const plants = [{
    slug: 'fixture-tree',
    canonicalSlug: 'fixture-tree',
    scientific: 'Ficus fixturea',
    tags: ['tree', 'evergreen'],
    growth: 'Evergreen landscape tree',
    identityScope: 'species'
  }];
  const plan = buildPlantVisualProductionPlan(plants, { sets: [] }, {
    ownedCanonicalSlugs: ['fixture-tree']
  });
  assert.ok(plan.jobs.length >= 1);
  assert.equal(plan.generationStarted, false);
  assert.equal(plan.paidCalls, 0);
  assert.equal(plan.productionRegistryWritten, false);
  assert.equal(plan.jobs[0].imageGenerationRequired, true);
  assert.equal(plan.jobs[0].framingQaRequired, true);
  assert.equal(plan.jobs[0].architectureMode, 'tree');
  assert.equal(plan.jobs[0].promptRecord.architectureMode, 'tree');
  assert.ok(plan.jobs[0].promptRecord.prompt);
  assert.ok(['medium', 'high'].includes(plan.jobs[0].qualityPlan.quality));
});

test('framing failure routes to regeneration instead of owner approval', () => {
  const technical = technicalPass({
    bbox: { exists: true, minX: 0, minY: 0, maxX: 1023, maxY: 1535 }
  });
  const evaluation = evaluatePlantVisualCandidate({
    job: { canonicalSlug: 'fixture', visualForm: 'tree' },
    technicalQa: technical,
    botanicalIdentityQa: { result: 'PASS' },
    architectureQa: { result: 'PASS' },
    growthStageQa: { result: 'PASS' },
    phenologyStateQa: { result: 'PASS' },
    inGardenQa: { result: 'PASS' },
    ownerVisualQa: { result: 'UNKNOWN' }
  });
  assert.equal(evaluation.decision, PLANT_VISUAL_DECISION.REGENERATE);
  assert.equal(evaluation.retryRecommended, true);
});

test('all mandatory gates pass but owner review remains default until auto-approval is calibrated', () => {
  const candidate = {
    job: {
      jobId: 'fixture__mature__tree__vegetative__v1',
      canonicalSlug: 'fixture',
      scientific: 'Ficus fixturea',
      identityScope: 'species',
      visualForm: 'tree',
      architectureMode: 'tree',
      growthStage: 'mature',
      phenology: 'vegetative',
      season: 'unknown'
    },
    file: 'candidate.png',
    bytes: 12345,
    technicalQa: technicalPass(),
    botanicalIdentityQa: { result: 'PASS' },
    architectureQa: { result: 'PASS' },
    growthStageQa: { result: 'PASS' },
    phenologyStateQa: { result: 'PASS' },
    inGardenQa: { result: 'PASS' },
    ownerVisualQa: { result: 'UNKNOWN' }
  };
  const review = evaluatePlantVisualCandidate(candidate);
  assert.equal(review.decision, PLANT_VISUAL_DECISION.OWNER_REVIEW);
  assert.equal(review.productionApproved, false);

  const approved = evaluatePlantVisualCandidate({
    ...candidate,
    ownerVisualQa: { result: 'PASS' }
  });
  assert.equal(approved.decision, PLANT_VISUAL_DECISION.AUTO_PASS);
  assert.equal(approved.productionApproved, true);

  const record = buildApprovedRegistryVariant({
    ...candidate,
    ownerVisualQa: { result: 'PASS' },
    assetId: 'fixture-asset-v1',
    sha256: 'abc'
  }, approved);
  assert.equal(record.productionApproved, true);
  assert.equal(record.approvalStatus, 'approved');
  assert.ok(record.baseWidthPx >= 450);
  assert.deepEqual(record.alphaBBox, technicalPass().metrics.bbox);
});

test('paid generation executor is default-deny and requires three matching run flags', () => {
  const denied = parsePlantVisualProductionApproval([
    '--run-id=wave-1',
    '--max-jobs=2',
    '--max-calls=2',
    '--max-spend-usd=1',
    '--allow-paid-calls=2'
  ]);
  assert.equal(denied.ownerApprovedThisRunOnly, false);
  assert.equal(denied.allowNetwork, false);

  const approved = parsePlantVisualProductionApproval([
    '--run-id=wave-1',
    '--approve-envelope=wave-1',
    '--owner-approve-run=wave-1',
    '--execute-production-run=wave-1',
    '--max-jobs=2',
    '--max-calls=2',
    '--max-spend-usd=1',
    '--allow-paid-calls=2'
  ]);
  assert.equal(approved.ownerApprovedThisRunOnly, true);
  assert.equal(approved.allowNetwork, true);
});

test('paid generation approval preserves an exact job-id allowlist', () => {
  const approved = parsePlantVisualProductionApproval([
    '--run-id=owned-pilot-v1',
    '--approve-envelope=owned-pilot-v1',
    '--owner-approve-run=owned-pilot-v1',
    '--execute-production-run=owned-pilot-v1',
    '--job-ids=mango__mature__tree__fruiting__v1,mango__young__tree__vegetative__v1,pineapple__mature__default__fruiting__v1',
    '--max-jobs=3',
    '--max-calls=3',
    '--max-spend-usd=0.5',
    '--allow-paid-calls=3'
  ]);
  assert.deepEqual(approved.jobIds, [
    'mango__mature__tree__fruiting__v1',
    'mango__young__tree__vegetative__v1',
    'pineapple__mature__default__fruiting__v1'
  ]);
  assert.equal(approved.ownerApprovedThisRunOnly, true);
});


test('every active registry asset is explicitly productionApproved', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const registry = JSON.parse(
    fs.readFileSync(
      path.join(root, 'modules/garden-design/assets/plants/design-asset-registry-v1.json'),
      'utf8'
    )
  );
  assert.equal(
    registry.productionPolicy?.productionApprovedRequiredForReadyAssets,
    true
  );
  const active = (registry.sets || []).flatMap((set) =>
    (set.variants || [])
      .filter((variant) =>
        variant.approvalStatus === 'approved' &&
        variant.status === 'ready' &&
        variant.transparencyReady === true
      )
      .map((variant) => ({ slug: set.canonicalSlug, variant }))
  );
  assert.ok(active.length >= 4);
  for (const row of active) {
    assert.equal(
      row.variant.productionApproved,
      true,
      `${row.slug}/${row.variant.assetId} must be productionApproved`
    );
  }
});


test('wave planner bounds hundreds of jobs and prioritizes owned plants without network work', () => {
  const jobs = Array.from({ length: 61 }, (_, i) => ({
    jobId: `job-${i + 1}`,
    canonicalSlug: `plant-${String(i + 1).padStart(3, '0')}`,
    required: true
  }));
  jobs[57].canonicalSlug = 'owned-special';
  const waves = partitionPlantVisualWaves(jobs, {
    signals: { ownedCanonicalSlugs: ['owned-special'] },
    policy: { maxJobsPerWave: 20, maxPlantsPerWave: 20 }
  });
  assert.equal(waves.length, 4);
  assert.ok(waves.every((wave) => wave.jobCount <= 20));
  assert.equal(waves[0].jobs[0].canonicalSlug, 'owned-special');
  assert.equal(waves[0].paidExecutionApproved, false);
  assert.equal(waves[0].productionRegistryWritten, false);
});

test('promotion guard blocks incomplete QA and accepts only complete production records', () => {
  const incomplete = {
    assetId: 'fixture-v1',
    canonicalSlug: 'fixture',
    productionApproved: true,
    approvalStatus: 'approved',
    transparencyReady: true
  };
  const blocked = validateProductionRegistryVariant(incomplete);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.reasons.includes('checksum-required'));
  assert.ok(blocked.reasons.includes('pixel-dimensions-required'));
  assert.ok(blocked.reasons.includes('technicalQA-pass-required'));

  const complete = {
    assetId: 'fixture-v1',
    canonicalSlug: 'fixture',
    scientific: 'Ficus fixturea',
    identityScope: 'species',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenology: 'vegetative',
    season: 'unknown',
    file: 'production/fixture/fixture-v1.png',
    width: 1024,
    height: 1536,
    baseWidthPx: 480,
    alphaBBox: { exists: true, minX: 40, minY: 60, maxX: 990, maxY: 1490 },
    groundAnchor: { nx: 0.5, ny: 0.97, source: 'alpha-bbox-base-center' },
    sha256: 'abc123',
    productionApproved: true,
    approvalStatus: 'approved',
    transparencyReady: true,
    technicalQA: 'PASS',
    framingQA: 'PASS',
    botanicalIdentityQA: 'PASS',
    architectureQA: 'PASS',
    growthStageQA: 'PASS',
    phenologyStateQA: 'PASS',
    inGardenQA: 'PASS'
  };
  assert.equal(validateProductionRegistryVariant(complete).ok, true);

  const activated = activateProductionRegistryVariant({ sets: [] }, complete);
  assert.equal(activated.changed, true);
  assert.equal(activated.registry.sets[0].variants[0].activeForRole, true);
  assert.equal(activated.registry.productionPolicy.immutableAssetIds, true);
});

test('promotion guard forbids silent binary replacement under an existing asset id', () => {
  const base = {
    assetId: 'fixture-v1',
    canonicalSlug: 'fixture',
    scientific: 'Ficus fixturea',
    identityScope: 'species',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenology: 'vegetative',
    season: 'unknown',
    file: 'production/fixture/fixture-v1.png',
    width: 1024,
    height: 1536,
    baseWidthPx: 480,
    alphaBBox: { exists: true, minX: 40, minY: 60, maxX: 990, maxY: 1490 },
    groundAnchor: { nx: 0.5, ny: 0.97, source: 'alpha-bbox-base-center' },
    sha256: 'checksum-a',
    productionApproved: true,
    approvalStatus: 'approved',
    transparencyReady: true,
    technicalQA: 'PASS',
    framingQA: 'PASS',
    botanicalIdentityQA: 'PASS',
    architectureQA: 'PASS',
    growthStageQA: 'PASS',
    phenologyStateQA: 'PASS',
    inGardenQA: 'PASS'
  };
  const first = activateProductionRegistryVariant({ sets: [] }, base);
  assert.throws(
    () => activateProductionRegistryVariant(first.registry, { ...base, sha256: 'checksum-b' }),
    (err) => err && err.code === 'IMMUTABLE_ASSET_ID_CONFLICT'
  );
});


test('plant visual storage contract uses separate candidate/production buckets and immutable checksum keys', () => {
  const status = getPlantVisualStorageStatus({
    PLANT_VISUAL_R2_ACCOUNT_ID: 'acct',
    PLANT_VISUAL_R2_ACCESS_KEY_ID: 'id',
    PLANT_VISUAL_R2_SECRET_ACCESS_KEY: 'secret',
    PLANT_VISUAL_R2_CANDIDATES_BUCKET: 'cruvit-plant-visual-candidates',
    PLANT_VISUAL_R2_PRODUCTION_BUCKET: 'cruvit-plant-visual-production'
  });
  assert.equal(status.ready, true);

  const candidateKey = buildPlantVisualCandidateObjectKey({
    runId: 'wave-001',
    canonicalSlug: 'Mango',
    assetId: 'mango__young__tree__vegetative__v1',
    sha256: 'ABC123'
  });
  assert.equal(
    candidateKey,
    'candidates/wave-001/mango/mango__young__tree__vegetative__v1__abc123.png'
  );

  const productionKey = buildPlantVisualProductionObjectKey({
    canonicalSlug: 'mango',
    growthStage: 'young',
    architectureMode: 'tree',
    phenology: 'vegetative',
    assetId: 'mango__young__tree__vegetative__v1',
    sha256: 'abc123'
  });
  assert.equal(
    productionKey,
    'production/mango/young__tree__vegetative/mango__young__tree__vegetative__v1__abc123.png'
  );
});

test('plant visual production storage refuses promotion until every mandatory QA gate passes', () => {
  const base = {
    canonicalSlug: 'mango',
    growthStage: 'young',
    architectureMode: 'tree',
    phenology: 'vegetative',
    assetId: 'mango__young__tree__vegetative__v1',
    sha256: 'abc123',
    technicalQA: 'PASS',
    framingQA: 'PASS',
    botanicalIdentityQA: 'PASS',
    architectureQA: 'PASS',
    growthStageQA: 'PASS',
    phenologyStateQA: 'PASS',
    inGardenQA: 'PASS',
    productionApproved: true
  };
  assert.equal(validatePlantVisualPromotionStorageInput(base).ok, true);

  const blocked = validatePlantVisualPromotionStorageInput({
    ...base,
    inGardenQA: 'UNKNOWN',
    productionApproved: false
  });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.failed.includes('inGardenQA'));
  assert.ok(blocked.failed.includes('productionApproved'));
});

test('pilot QA surface is bounded to four migrated candidates and stays non-production', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const fn = fs.readFileSync(path.join(root, 'netlify/functions/plant-visual-pilot-qa.mjs'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'modules/garden-design/plant-visual-pilot-qa-v1.html'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'modules/garden-design/asset-factory-v1/plant-visual-pilot-qa-runtime-v1.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.html'), 'utf8');

  const ids = [
    'banana__young__default__vegetative__v1',
    'mango__young__tree__vegetative__v1',
    'pineapple__mature__default__fruiting__v1',
    'mango__mature__tree__fruiting__v1'
  ];
  for (const id of ids) assert.ok(fn.includes(id));

  assert.match(fn, /PLANT_VISUAL_R2_CANDIDATES_BUCKET/);
  assert.doesNotMatch(fn, /PutObjectCommand/);
  assert.doesNotMatch(fn, /PLANT_VISUAL_R2_PRODUCTION_BUCKET/);
  assert.match(fn, /productionApproved: false/);
  assert.match(page, /Four bounded candidates only/);
  assert.match(runtime, /CALIBRATION_SOURCE_MESSAGE_TYPE/);
  assert.match(fn, /OWNER_REVIEW_REQUIRED/);
  assert.match(runtime, /PASS_OWNER_VISUAL_GATES/);
  assert.match(app, /#plant-visual-pilot-qa-v1/);
  assert.match(app, /openPlantVisualPilotQaReview/);
});

test('pilot in-garden QA uses bounded small-medium-large review scales without meter claims', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const page = fs.readFileSync(path.join(root, 'modules/garden-design/plant-visual-pilot-qa-v1.html'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'modules/garden-design/asset-factory-v1/plant-visual-pilot-qa-runtime-v1.js'), 'utf8');
  const rootCause = JSON.parse(fs.readFileSync(path.join(root, 'data/garden-design/plant-visual-pilot-in-garden-scale-root-cause-v1.json'), 'utf8'));

  assert.match(runtime, /reviewScene\(row, 'small'\)/);
  assert.match(runtime, /reviewScene\(row, 'medium'\)/);
  assert.match(runtime, /reviewScene\(row, 'large'\)/);
  assert.doesNotMatch(runtime, /data-size-scenario="NATURAL_MATURE"/);
  assert.match(page, /review-plant-box\.small\{height:34%\}/);
  assert.match(page, /review-plant-box\.medium\{height:54%\}/);
  assert.match(page, /review-plant-box\.large\{height:78%\}/);
  assert.match(page, /review-plant-box\{[^}]*width:80%/);
  assert.equal(rootCause.decision.clippingAllowed, false);
  assert.equal(rootCause.decision.meterAccuracyClaimed, false);
  assert.equal(rootCause.decision.productionGardenDesignScaleChanged, false);
});

test('pilot owner scale calibration is job-specific and mature mango can exceed Large without clipping', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const page = fs.readFileSync(path.join(root, 'modules/garden-design/plant-visual-pilot-qa-v1.html'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'modules/garden-design/asset-factory-v1/plant-visual-pilot-qa-runtime-v1.js'), 'utf8');
  const owner = JSON.parse(fs.readFileSync(path.join(root, 'data/garden-design/plant-visual-pilot-owner-scale-calibration-v1.json'), 'utf8'));

  assert.match(runtime, /banana__young__default__vegetative__v1': 'large'/);
  assert.match(runtime, /mango__young__tree__vegetative__v1': 'large'/);
  assert.match(runtime, /pineapple__mature__default__fruiting__v1': 'medium'/);
  assert.match(runtime, /reviewScene\(row, 'xl'\)/);
  assert.match(runtime, /reviewScene\(row, 'xxl'\)/);
  assert.match(page, /review-plant-box\.xl\{height:88%;width:90%\}/);
  assert.match(page, /review-plant-box\.xxl\{height:94%;width:96%\}/);
  assert.equal(owner.decisions.find((r) => r.jobId === 'mango__mature__tree__fruiting__v1').acceptedCurrentBand, false);
  assert.equal(owner.invariants.includes('No preferred scale may permit clipping.'), true);
});

test('in-garden QA scale policy derives morphology + stage defaults instead of per-species sizes', () => {
  const banana = deriveInGardenQaScale({
    jobId: 'banana__young__default__vegetative__v1',
    visualForm: 'herbaceous-clump',
    growthStage: 'young',
    phenology: 'vegetative'
  });
  const mangoYoung = deriveInGardenQaScale({
    jobId: 'mango__young__tree__vegetative__v1',
    visualForm: 'tree',
    growthStage: 'young',
    phenology: 'vegetative'
  });
  const pineapple = deriveInGardenQaScale({
    jobId: 'pineapple__mature__default__fruiting__v1',
    visualForm: 'rosette',
    growthStage: 'mature',
    phenology: 'fruiting'
  });
  const mangoMature = deriveInGardenQaScale({
    jobId: 'mango__mature__tree__fruiting__v1',
    visualForm: 'tree',
    growthStage: 'mature',
    phenology: 'fruiting'
  });

  assert.equal(banana.recommendedBand, 'large');
  assert.equal(mangoYoung.recommendedBand, 'large');
  assert.equal(pineapple.recommendedBand, 'medium');
  assert.equal(mangoMature.recommendedBand, 'xxl');
  assert.deepEqual(mangoMature.reviewBands, ['xl', 'xxl']);
  assert.equal(mangoMature.phenologyAffectsScale, false);
});

test('in-garden QA scale policy keeps phenology separate from size and supports exact owner calibration', () => {
  const vegetative = deriveInGardenQaScale({
    jobId: 'fixture__mature__tree__vegetative__v1',
    visualForm: 'tree',
    growthStage: 'mature',
    phenology: 'vegetative'
  });
  const fruiting = deriveInGardenQaScale({
    jobId: 'fixture__mature__tree__fruiting__v1',
    visualForm: 'tree',
    growthStage: 'mature',
    phenology: 'fruiting'
  });
  assert.equal(vegetative.recommendedBand, fruiting.recommendedBand);
  assert.equal(vegetative.recommendedBand, 'xxl');

  const owner = deriveInGardenQaScale({
    jobId: 'pineapple__mature__default__fruiting__v1',
    visualForm: 'rosette',
    growthStage: 'mature',
    phenology: 'fruiting'
  }, {
    ownerCalibration: PILOT_SCALE_CALIBRATION
  });
  assert.equal(owner.recommendedBand, 'medium');
  assert.deepEqual(owner.reviewBands, ['medium']);
  assert.equal(owner.source, 'OWNER_EXACT_JOB_CALIBRATION');
});

test('in-garden QA scale policy is bounded, non-meter and cautious for unknown morphology', () => {
  const unknown = deriveInGardenQaScale({
    jobId: 'unknown__mature__default__vegetative__v1',
    visualForm: 'unknown',
    growthStage: 'mature'
  });
  assert.equal(unknown.recommendedBand, 'medium');
  assert.equal(unknown.ownerReviewRequired, true);
  assert.equal(unknown.meterAccuracyClaimed, false);
  assert.equal(unknown.clippingAllowed, false);

  for (const band of ['small', 'medium', 'large', 'xl', 'xxl']) {
    const spec = qaScaleBandSpec(band);
    assert.ok(spec.maxHeightPct > 0 && spec.maxHeightPct <= 94);
    assert.ok(spec.maxWidthPct > 0 && spec.maxWidthPct <= 96);
  }

  assert.equal(QA_SCALE_POLICY_GOVERNANCE.perSpeciesHardcodingForbidden, true);
  assert.equal(QA_SCALE_POLICY_GOVERNANCE.phenologyAloneMayNotChooseScale, true);
  assert.equal(QA_SCALE_POLICY_GOVERNANCE.productionPhysicalScaleSeparate, true);
});

test('pilot QA recovered candidates remain explicitly quarantined from production', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const evidence = JSON.parse(fs.readFileSync(path.join(root, 'data/garden-design/plant-visual-pilot-r2-migration-v1.json'), 'utf8'));
  const recovered = evidence.candidates.filter((row) => row.evidenceMismatch === true);
  assert.equal(recovered.length, 2);
  for (const row of recovered) {
    assert.equal(row.productionApproved, false);
    assert.match(row.objectKey, /\/recovered\//);
    assert.ok(row.expectedEvidenceSha256);
    assert.notEqual(row.sha256, row.expectedEvidenceSha256);
  }
});
