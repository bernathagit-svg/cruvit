/**
 * Garden Design physical-scale foundation V1. Zero spend. No generation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SIZE_EVIDENCE_UNKNOWN,
  auditBotanicalSizeEvidence,
  computeSceneVisualScale,
  extractPlantLibraryCopy
} from '../modules/garden-design/asset-factory-v1/composition-calibration-v2.js';
import { computeTreeSceneScaleV3 } from '../modules/garden-design/asset-factory-v1/composition-calibration-v3.js';
import {
  DIMENSION_EVIDENCE,
  PHYSICAL_SCALE_MODEL_VERSION,
  PHYSICAL_SCALE_PERSISTENCE_PROPOSAL,
  addKnownReference,
  classifyCatalogDimensionEvidence,
  classifyUserConfirmedDimension,
  computePhysicalSceneScale,
  emptyPhotoScaleCalibration,
  interpolatePixelsPerMeter,
  mayDrivePhysicalMeterPreview,
  resolveGrowthStageDimensions
} from '../modules/garden-design/asset-factory-v1/physical-scale-foundation-v1.js';
import { CALIBRATION_BATCH_1_CACHE_BUST } from '../modules/garden-design/asset-factory-v1/calibration-review-candidates-v1.js';
import { isUsableDesignVariant } from '../modules/garden-design/garden-design-asset-registry-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MANGO_BBOX = { exists: true, minX: 33, minY: 148, maxX: 1008, maxY: 1422 };

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function calibratedDoor(sceneWidth = 480, sceneHeight = 360, depthBand = 'near') {
  const empty = emptyPhotoScaleCalibration();
  const added = addKnownReference(empty, {
    pointA: { nx: 0.2, ny: 0.4 },
    pointB: { nx: 0.2, ny: 0.9 },
    knownMeters: 2.1,
    kind: 'door_height',
    depthBand,
    sceneWidthPx: sceneWidth,
    sceneHeightPx: sceneHeight
  });
  assert.equal(added.ok, true, added.code);
  return added.calibration;
}

test('catalog mango cannot drive labelled meters and does not invent them', () => {
  const appHtml = read('app.html');
  const mangoCopy = extractPlantLibraryCopy(appHtml, 'mango');
  const v2 = auditBotanicalSizeEvidence({}, mangoCopy);
  const physical = classifyCatalogDimensionEvidence({}, {
    visualForm: 'tree',
    growthStage: 'mature',
    librarySizeCopy: mangoCopy.size
  });
  assert.equal(v2.status, SIZE_EVIDENCE_UNKNOWN);
  assert.equal(physical.evidenceClass, DIMENSION_EVIDENCE.UNKNOWN);
  assert.equal(physical.mayDrivePhysicalMeterPreview, false);
  assert.equal(physical.usedUnprovenancedCopy, false);
  assert.equal(mayDrivePhysicalMeterPreview(physical.evidenceClass), false);
});

test('only SOURCE_SUPPORTED_RANGE and USER_CONFIRMED may drive a physical meter preview', () => {
  const supported = classifyCatalogDimensionEvidence({
    gardenCompatibility: { spacing: { matureHeightMMin: 8, matureHeightMMax: 15, matureSpreadM: 10 } },
    climateTraits: { traitEvidenceClasses: { matureHeightM: 'SOURCE_SUPPORTED' } }
  }, { visualForm: 'tree', growthStage: 'mature' });
  const heuristic = classifyCatalogDimensionEvidence({
    gardenCompatibility: { spacing: { matureHeightM: 10, matureSpreadM: 8 } },
    climateTraits: { traitEvidenceClasses: { matureHeightM: 'HEURISTIC_ASSERTION' } }
  }, { visualForm: 'shrub', growthStage: 'mature' });
  const confirmed = classifyUserConfirmedDimension({
    heightMMin: 6,
    heightMMax: 12,
    growthStage: 'mature',
    visualForm: 'palm'
  });
  assert.equal(supported.evidenceClass, DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE);
  assert.equal(supported.mayDrivePhysicalMeterPreview, true);
  assert.equal(heuristic.evidenceClass, DIMENSION_EVIDENCE.HEURISTIC_RANGE);
  assert.equal(heuristic.mayDrivePhysicalMeterPreview, false);
  assert.equal(confirmed.evidenceClass, DIMENSION_EVIDENCE.USER_CONFIRMED);
  assert.equal(mayDrivePhysicalMeterPreview(confirmed.evidenceClass), true);
});

test('young size is not a fixed percentage of mature size', () => {
  const mature = classifyUserConfirmedDimension({
    heightMMin: 8,
    heightMMax: 12,
    growthStage: 'mature',
    visualForm: 'tree'
  });
  const young = resolveGrowthStageDimensions({
    growthStage: 'young',
    visualForm: 'tree',
    userConfirmed: mature
  });
  assert.equal(young.evidenceClass, DIMENSION_EVIDENCE.UNKNOWN);
  assert.equal(young.derivedFromOtherStage, false);
  assert.deepEqual(young.otherStageEvidenceIgnored, ['mature']);
  assert.equal(young.heightM, null);
});

test('photo calibration plus USER_CONFIRMED renders a physically larger mango than V3 heuristic', () => {
  const calibration = calibratedDoor();
  const confirmed = classifyUserConfirmedDimension({
    heightMMin: 8,
    heightMMax: 12,
    growthStage: 'mature',
    visualForm: 'tree'
  });
  const physical = computePhysicalSceneScale({
    growthStage: 'mature',
    visualForm: 'tree',
    userConfirmed: confirmed,
    photoCalibration: calibration,
    bbox: MANGO_BBOX,
    canvasHeight: 1536,
    sceneWidthPx: 480,
    sceneHeightPx: 360,
    depthId: 'near'
  });
  const v3 = computeTreeSceneScaleV3({
    visualForm: 'tree',
    growthStage: 'mature',
    depthId: 'near',
    bbox: MANGO_BBOX,
    canvasHeight: 1536
  });
  const v2 = computeSceneVisualScale({ visualForm: 'tree', depthId: 'near', ownerScale: 1 });
  assert.equal(physical.status, 'PHYSICAL_SCALE_READY');
  assert.equal(physical.label, 'Suggested mature size');
  assert.equal(physical.exact, false);
  assert.equal(physical.mangoHardCoded, false);
  assert.equal(physical.usedInventedMeters, false);
  assert.equal(physical.displayHeightM, 10);
  assert.ok(physical.visibleHeightPct > v3.visibleHeightPct);
  assert.ok(physical.visibleHeightPct > v2.heightPct);
  assert.equal(PHYSICAL_SCALE_MODEL_VERSION, 'physical-scale-foundation-v1');
});

test('UNKNOWN botanical meters stay blocked and do not pretend to know height', () => {
  const blocked = computePhysicalSceneScale({
    growthStage: 'mature',
    visualForm: 'tree',
    catalogEvidence: classifyCatalogDimensionEvidence({}, { growthStage: 'mature', visualForm: 'tree' }),
    photoCalibration: calibratedDoor(),
    bbox: MANGO_BBOX,
    sceneHeightPx: 360,
    depthId: 'middle'
  });
  assert.equal(blocked.status, 'PHYSICAL_SCALE_BLOCKED');
  assert.ok(blocked.reasons.includes('BOTANICAL_METERS_UNKNOWN'));
  assert.equal(blocked.displayHeightM, null);
});

test('near/far references interpolate pixels-per-meter by placement y', () => {
  let cal = emptyPhotoScaleCalibration();
  cal = addKnownReference(cal, {
    pointA: { nx: 0.1, ny: 0.35 },
    pointB: { nx: 0.1, ny: 0.55 },
    knownMeters: 2,
    kind: 'fence_height',
    depthBand: 'far',
    sceneWidthPx: 480,
    sceneHeightPx: 360
  }).calibration;
  cal = addKnownReference(cal, {
    pointA: { nx: 0.8, ny: 0.45 },
    pointB: { nx: 0.8, ny: 0.95 },
    knownMeters: 2,
    kind: 'door_height',
    depthBand: 'near',
    sceneWidthPx: 480,
    sceneHeightPx: 360
  }).calibration;
  const near = interpolatePixelsPerMeter(cal, 0.88, { width: 480, height: 360 });
  const far = interpolatePixelsPerMeter(cal, 0.4, { width: 480, height: 360 });
  assert.equal(near.mode, 'NEAR_FAR_INTERPOLATED');
  assert.ok(near.pixelsPerMeter > far.pixelsPerMeter);
});

test('user override is separate from botanical source truth', () => {
  const confirmed = classifyUserConfirmedDimension({
    heightMMin: 8,
    heightMMax: 8,
    growthStage: 'mature',
    visualForm: 'climber'
  });
  const suggested = computePhysicalSceneScale({
    growthStage: 'mature',
    visualForm: 'climber',
    userConfirmed: confirmed,
    photoCalibration: calibratedDoor(),
    sceneHeightPx: 360,
    depthId: 'middle'
  });
  const overridden = computePhysicalSceneScale({
    growthStage: 'mature',
    visualForm: 'climber',
    userConfirmed: confirmed,
    userOverride: { kind: 'multiplier', value: 0.7 },
    photoCalibration: calibratedDoor(),
    sceneHeightPx: 360,
    depthId: 'middle'
  });
  assert.equal(suggested.label, 'Suggested mature size');
  assert.equal(overridden.label, 'User override');
  assert.equal(overridden.userOverrideSeparateFromBotanicalTruth, true);
  assert.equal(overridden.suggestedHeightM, 8);
  assert.ok(Math.abs(overridden.displayHeightM - 5.6) < 0.001);
});

test('generic visualForm path has no mango hard-coded multiplier or invented meters', () => {
  const src = read('modules/garden-design/asset-factory-v1/physical-scale-foundation-v1.js');
  const runtime = read('modules/garden-design/asset-factory-v1/physical-scale-foundation-v1-runtime.js');
  assert.doesNotMatch(src, /mangoHeight|MANGO_HEIGHT|mangoMeters|10\s*\*\s*ppm/i);
  assert.doesNotMatch(runtime, /mangoHeight|MANGO_HEIGHT|hardCodeMango/i);
  assert.match(src, /mangoHardCoded: false/);
  for (const form of ['tree', 'shrub', 'palm', 'climber', 'rosette', 'herbaceous-clump', 'subshrub']) {
    const row = computePhysicalSceneScale({
      growthStage: 'mature',
      visualForm: form,
      userConfirmed: classifyUserConfirmedDimension({
        heightMMin: 1.2,
        heightMMax: 1.8,
        growthStage: 'mature',
        visualForm: form
      }),
      photoCalibration: calibratedDoor(),
      sceneHeightPx: 360,
      depthId: 'middle'
    });
    assert.equal(row.mangoHardCoded, false, form);
    assert.equal(row.usedInventedMeters, false, form);
    assert.equal(row.visualForm, form);
  }
});

test('persistence proposal does not apply a migration', () => {
  assert.equal(PHYSICAL_SCALE_PERSISTENCE_PROPOSAL.applyMigrationNow, false);
  assert.ok(PHYSICAL_SCALE_PERSISTENCE_PROPOSAL.tables.some((row) => row.table === 'garden_designs'));
  assert.equal(
    isUsableDesignVariant({
      approvalStatus: 'candidate',
      file: 'batch-1-candidates/calibration-batch-1/mango-mature-vegetative-v1.png'
    }),
    false
  );
});

test('review harness wires physical scale V1 without generation endpoints', () => {
  const html = read('modules/garden-design/calibration-review.html');
  const app = read('app.html');
  assert.match(html, /PHYSICAL SCALE V1/);
  assert.match(html, /Suggested mature size/);
  assert.match(html, /photo-cal-scene/);
  assert.match(html, /physical-v1-scene/);
  assert.match(html, /Does this now read as the plausible size of a mature Mango tree/);
  assert.match(html, /physical-scale-foundation-v1-runtime\.js/);
  assert.match(app, new RegExp(`calibration-review\\.html\\?v=${CALIBRATION_BATCH_1_CACHE_BUST}`));
  assert.equal(CALIBRATION_BATCH_1_CACHE_BUST, '20260919i');
  assert.doesNotMatch(html, /api\.openai\.com/);
  assert.doesNotMatch(html, /images\/generations/);
});
