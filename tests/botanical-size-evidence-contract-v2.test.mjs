/**
 * Botanical size evidence contract V2. Zero spend. No catalog write. No mass enrichment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TREE_SIZE_EVIDENCE_ELIGIBLE } from '../modules/garden-design/asset-factory-v1/multi-form-plant-architecture-v1.js';
import {
  FUTURE_WRITE_PATH,
  ROLE_BASED_PILOT_SET,
  SIZE_EVIDENCE_SCENARIOS,
  SOURCE_QUALITY_TIERS,
  classifyBotanicalSizePrecedence,
  classifyCultivarOrRootstockSensitivity,
  classifySourceQuality,
  mapApprovedMangoEvidenceToV2Record,
  validateBotanicalSizeEvidenceRecord,
  writeBotanicalSizeEvidenceContractReports
} from '../modules/garden-design/asset-factory-v1/botanical-size-evidence-contract-v2.js';
import { computeTreePhysicalScale, TREE_SIZE_EVIDENCE_PRECEDENCE } from '../modules/garden-design/asset-factory-v1/generic-tree-physical-scale-v1.js';
import { DIMENSION_EVIDENCE } from '../modules/garden-design/asset-factory-v1/physical-scale-foundation-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

test('V2 contract forbids universal mature size and catalog writes', () => {
  assert.deepEqual(TREE_SIZE_EVIDENCE_PRECEDENCE, [
    'CULTIVAR_SPECIFIC_SOURCE',
    'ROOTSTOCK_SPECIFIC_SOURCE',
    'ARCHITECTURE_SPECIFIC_SOURCE',
    'SPECIES_SOURCE_SUPPORTED_RANGE',
    'USER_CONFIRMED_TARGET',
    'UNKNOWN'
  ]);
  assert.equal(FUTURE_WRITE_PATH.applyWriteNow, false);
  assert.ok(SIZE_EVIDENCE_SCENARIOS.NATURAL_MATURE);
  assert.ok(SIZE_EVIDENCE_SCENARIOS.MAINTAINED_GARDEN);
  assert.ok(SIZE_EVIDENCE_SCENARIOS.ROOTSTOCK_SPECIFIC);
  const written = writeBotanicalSizeEvidenceContractReports(ROOT);
  const report = JSON.parse(fs.readFileSync(written.reportPath, 'utf8'));
  assert.equal(report.massTreeEnrichmentExecuted, false);
  assert.equal(report.universalMatureSize, false);
  assert.equal(report.userResizeChangesBotanicalTruth, false);
  assert.equal(report.productionCatalogMutated, false);
  assert.equal(report.spend.additionalSpendUsd, 0);
});

test('user confirmed is design truth and does not overwrite botanical source', () => {
  assert.equal(
    classifyBotanicalSizePrecedence({
      evidenceClass: DIMENSION_EVIDENCE.USER_CONFIRMED,
      mayDrivePhysicalMeterPreview: true
    }),
    'USER_CONFIRMED_TARGET'
  );
  const mango = mapApprovedMangoEvidenceToV2Record();
  assert.equal(validateBotanicalSizeEvidenceRecord(mango).ok, true);
  assert.equal(classifyBotanicalSizePrecedence(mango), 'SPECIES_SOURCE_SUPPORTED_RANGE');
  assert.match(mango.originalSourceWording, /Not a cultivar/);
  assert.equal(mango.productionCatalogWritten, false);
});

test('cultivar/rootstock sensitivity is a data pattern, not exhaustive truth', () => {
  const apple = classifyCultivarOrRootstockSensitivity('apple');
  const lemon = classifyCultivarOrRootstockSensitivity('lemon');
  const olive = classifyCultivarOrRootstockSensitivity('olive');
  assert.equal(apple.flag, 'CULTIVAR_OR_ROOTSTOCK_SENSITIVE');
  assert.equal(apple.exhaustive, false);
  assert.equal(lemon.flag, 'CULTIVAR_OR_ROOTSTOCK_SENSITIVE');
  assert.equal(olive.sensitive, false);
  assert.equal(olive.exhaustive, false);
});

test('role-based pilot uses seven eligible trees and does not fetch new values', () => {
  assert.equal(ROLE_BASED_PILOT_SET.length, 7);
  assert.deepEqual(
    ROLE_BASED_PILOT_SET.map((row) => row.canonicalSlug),
    ['blue-gum', 'cypress', 'olive', 'lemon', 'apple', 'japanese-maple', 'mango']
  );
  for (const row of ROLE_BASED_PILOT_SET) {
    assert.ok(TREE_SIZE_EVIDENCE_ELIGIBLE.includes(row.canonicalSlug));
  }
  const nursery = classifySourceQuality({ provider: 'SEO nursery blog aggregator' });
  const extension = classifySourceQuality({ provider: 'UF/IFAS Extension' });
  assert.equal(nursery.mayDrivePhysicalMeterPreview, false);
  assert.equal(extension.tier, SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION);
  const papaya = validateBotanicalSizeEvidenceRecord({
    ...mapApprovedMangoEvidenceToV2Record(),
    canonicalSlug: 'papaya'
  });
  assert.equal(papaya.ok, false);
  assert.ok(papaya.errors.includes('papaya-excluded-from-tree-enrichment'));
  const unknown = computeTreePhysicalScale({
    canonicalSlug: 'olive',
    visualForm: 'tree',
    plant: {}
  });
  assert.equal(unknown.gardenDesignBlocked, false);
  assert.equal(unknown.displayHeightM, null);
});
