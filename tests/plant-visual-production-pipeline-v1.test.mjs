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
