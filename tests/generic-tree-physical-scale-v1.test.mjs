/**
 * Generic tree physical-scale V1. Zero spend. No generation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computeTreePhysicalScale,
  GENERIC_TREE_SCALE_CONTRACT,
  MANGO_GARDEN_DESIGN_PREFERENCE,
  MANGO_ASSET_STATUS,
  TREE_SIZE_EVIDENCE_PRECEDENCE,
  TREE_PHYSICAL_SCALE_CLASSES
} from '../modules/garden-design/asset-factory-v1/generic-tree-physical-scale-v1.js';
import {
  auditCatalogTrees,
  writeGenericTreePhysicalScaleReports
} from '../modules/garden-design/asset-factory-v1/tree-catalog-size-audit-v1.js';
import { CALIBRATION_BOTANICAL_SIZE_EVIDENCE } from '../modules/garden-design/asset-factory-v1/physical-scale-evidence-v1.js';
import { DIMENSION_EVIDENCE } from '../modules/garden-design/asset-factory-v1/physical-scale-foundation-v1.js';
import { CALIBRATION_BATCH_1_CACHE_BUST } from '../modules/garden-design/asset-factory-v1/calibration-review-candidates-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MANGO_BBOX = { exists: true, minX: 33, minY: 148, maxX: 1008, maxY: 1422 };

test('generic tree contract forbids universal size and mango copy', () => {
  assert.equal(GENERIC_TREE_SCALE_CONTRACT.universalTreeSize, false);
  assert.equal(GENERIC_TREE_SCALE_CONTRACT.mangoLowCopiedToOtherTrees, false);
  assert.equal(GENERIC_TREE_SCALE_CONTRACT.speciesSpecificDimensionsRequired, true);
  assert.equal(GENERIC_TREE_SCALE_CONTRACT.gardenDesignWorksWithUnknown, true);
  assert.equal(GENERIC_TREE_SCALE_CONTRACT.otherFormsInheritTreeRules, false);
  assert.deepEqual(TREE_SIZE_EVIDENCE_PRECEDENCE, [
    'CULTIVAR_SPECIFIC_SOURCE',
    'SPECIES_SOURCE_SUPPORTED_RANGE',
    'USER_CONFIRMED',
    'UNKNOWN'
  ]);
  assert.equal(MANGO_GARDEN_DESIGN_PREFERENCE.ownerPreferredRangePosition, 'LOW');
  assert.equal(MANGO_GARDEN_DESIGN_PREFERENCE.modifiesSourceMatureHeightRange, false);
  assert.equal(MANGO_GARDEN_DESIGN_PREFERENCE.applyMigrationNow, false);
  assert.equal(MANGO_ASSET_STATUS.scale, 'PHYSICAL_SCALE_DIRECTION_VALIDATED');
  assert.equal(MANGO_ASSET_STATUS.architecture, 'ARCHITECTURE_REGEN_CANDIDATE');
  assert.equal(MANGO_ASSET_STATUS.regenerateNow, false);
});

test('tree engine uses mango evidence and keeps LOW as design state only', () => {
  const mango = CALIBRATION_BOTANICAL_SIZE_EVIDENCE.mango;
  const low = computeTreePhysicalScale({
    canonicalSlug: 'mango',
    visualForm: 'tree',
    growthStage: 'mature',
    rangeBand: 'LOW',
    ownerPreferredRangePosition: 'LOW',
    bbox: MANGO_BBOX,
    canvasWidth: 1024,
    canvasHeight: 1536,
    sceneHeightPx: 360,
    depthId: 'middle',
    lockScaleMode: 'ESTIMATED'
  });
  assert.equal(low.ok, true);
  assert.equal(low.rangeBand, 'LOW');
  assert.equal(low.botanicalHeightRangeM.min, mango.heightM.min);
  assert.equal(low.botanicalHeightRangeM.max, mango.heightM.max);
  assert.equal(low.displayHeightM, null);
  assert.equal(low.fitToFrame, false);
  assert.equal(low.clippingAllowed, true);
  assert.match(low.label, /Estimated/);
  assert.equal(low.sizeEvidencePrecedence, 'SPECIES_SOURCE_SUPPORTED_RANGE');
});

test('unknown trees stay usable without invented meters', () => {
  const unknown = computeTreePhysicalScale({
    canonicalSlug: 'cork-oak',
    visualForm: 'tree',
    growthStage: 'mature',
    plant: {},
    bbox: MANGO_BBOX,
    canvasWidth: 1024,
    canvasHeight: 1536,
    sceneHeightPx: 360,
    depthId: 'middle',
    lockScaleMode: 'ESTIMATED'
  });
  assert.equal(unknown.ok, true);
  assert.equal(unknown.code, 'TREE_SCALE_UNKNOWN_USABLE');
  assert.equal(unknown.gardenDesignBlocked, false);
  assert.equal(unknown.displayHeightM, null);
  assert.equal(unknown.usedInventedMeters, false);
  assert.equal(unknown.label, 'Estimated size');
});

test('tree engine rejects other forms and mango dimension leaks', () => {
  const shrub = computeTreePhysicalScale({ canonicalSlug: 'lavender', visualForm: 'shrub' });
  assert.equal(shrub.ok, false);
  assert.equal(shrub.code, 'NOT_TREE_FORM');
  const leak = computeTreePhysicalScale({
    canonicalSlug: 'cork-oak',
    visualForm: 'tree',
    growthStage: 'mature',
    plant: {
      matureHeightMMin: 9.144,
      matureHeightMMax: 18.288,
      matureSpreadMMin: 9.144,
      matureSpreadMMax: 15.24,
      climateTraits: { traitEvidenceClasses: { matureHeightM: 'SOURCE_SUPPORTED' } }
    }
  });
  assert.equal(leak.ok, false);
  assert.equal(leak.code, 'MANGO_DIMENSION_LEAK');
});

test('catalog tree audit does not invent dimensions or copy mango', () => {
  const written = writeGenericTreePhysicalScaleReports(ROOT);
  const audit = JSON.parse(fs.readFileSync(written.auditPath, 'utf8'));
  const preference = JSON.parse(fs.readFileSync(written.preferencePath, 'utf8'));
  const live = auditCatalogTrees(ROOT);
  assert.equal(live.treeCount, audit.treeCount);
  assert.ok(audit.treeCount > 0);
  assert.equal(audit.inventedDimensions, false);
  assert.deepEqual(audit.mangoDimensionLeaks, []);
  assert.ok(audit.trees.every((row) => row.visualForm === 'tree'));
  assert.ok(audit.trees.every((row) => row.inventedDimensions === false));
  const mango = audit.trees.find((row) => row.canonicalSlug === 'mango');
  assert.ok(mango);
  assert.equal(mango.scientificName, 'Mangifera indica');
  assert.equal(mango.catalogClass, TREE_PHYSICAL_SCALE_CLASSES.SIZE_EVIDENCE_GAP);
  assert.equal(mango.sourcePresent, 'NO');
  assert.equal(mango.matureHeightEvidenceState, DIMENSION_EVIDENCE.UNKNOWN);
  assert.equal(mango.calibrationPackPresent, true);
  assert.ok(audit.engineReadyCalibrationOnly.includes('mango'));
  assert.ok(audit.physicalScaleReady.every((slug) => slug !== 'mango' || mango.sourcePresent === 'YES'));
  assert.equal(preference.ownerPreferredRangePosition, 'LOW');
  assert.equal(preference.modifiesSourceMatureHeightRange, false);
  assert.equal(preference.applyMigrationNow, false);
  assert.equal(written.spend.additionalSpendUsd, 0);
  assert.equal(CALIBRATION_BATCH_1_CACHE_BUST, '20260919n');
});
