/**
 * Approved Design Assets production E2E V1. Zero spend. No generation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  APPROVED_DESIGN_ASSETS_PRODUCTION_E2E_RUN_ID,
  APPROVED_E2E_SPEND_GATE,
  EXPECTED_LOOKUPS,
  MANGO_OWNED_AREA_ID,
  PRODUCTION_GARDEN_PROFILE_ID,
  runApprovedDesignAssetsProductionE2e
} from '../modules/garden-design/asset-factory-v1/approved-design-assets-production-e2e-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sha(rel) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');
}

test('approved design assets production E2E uses registry authority with zero spend', () => {
  const mangoBefore = sha(EXPECTED_LOOKUPS.mango.file);
  const bananaBefore = sha(EXPECTED_LOOKUPS.banana.file);
  const pineappleBefore = sha(EXPECTED_LOOKUPS.pineapple.file);
  const oliveBefore = sha(EXPECTED_LOOKUPS.olive.file);

  const report = runApprovedDesignAssetsProductionE2e(ROOT);
  assert.equal(report.verdict, 'APPROVED_DESIGN_ASSETS_PRODUCTION_E2E_VALIDATED');
  assert.equal(report.contract, APPROVED_DESIGN_ASSETS_PRODUCTION_E2E_RUN_ID);
  assert.equal(report.spendGate.state, 'DENIED');
  assert.equal(APPROVED_E2E_SPEND_GATE.openaiCalls, 0);
  assert.equal(report.newImageGeneration, 0);
  assert.equal(report.productionDbSchemaChanged, false);
  assert.equal(report.gardenProfileId, PRODUCTION_GARDEN_PROFILE_ID);

  assert.equal(report.authorityPath.authorityFile, 'modules/garden-design/assets/plants/design-asset-registry-v1.json');
  assert.equal(report.authorityPath.registryFirst, true);
  assert.equal(report.authorityPath.visualFormSpriteType, true);
  assert.equal(report.manifest.status, 'MANIFEST_NON_AUTHORITATIVE_SAFE');
  assert.equal(report.manifest.couldOverrideApprovedRegistryMatch, false);

  assert.equal(report.lookups.mango.assetId, 'mango__mature__tree__vegetative__detail-v2__high');
  assert.equal(report.lookups.mango.architectureMode, 'tree');
  assert.equal(report.lookups.mango.placeholder, false);
  assert.equal(report.lookups.banana.assetId, 'banana__mature__default__vegetative__v1');
  assert.equal(report.lookups.banana.representationPolicy, 'GENUS_VISUALLY_REPRESENTABLE');
  assert.equal(report.lookups.banana.scientific, 'Musa spp.');
  assert.equal(report.lookups.pineapple.assetId, 'pineapple__mature__default__vegetative__detail-v2__medium');
  assert.equal(report.lookups.olive.assetId, 'olive-mature-summer-vegetative-v1');

  assert.equal(report.checksums.mango.match, true);
  assert.equal(report.checksums.banana.match, true);
  assert.equal(report.checksums.pineapple.match, true);
  assert.equal(report.checksums.olive.match, true);
  assert.equal(report.binariesModified, false);

  assert.equal(report.ownedCoverage.mango, 'APPROVED BASELINE READY');
  assert.equal(report.ownedCoverage.banana, 'APPROVED BASELINE READY');
  assert.equal(report.ownedCoverage.pineapple, 'APPROVED BASELINE READY');
  assert.equal(report.ownedCoverage.ownedMojstrana, '3 / 3');

  for (const row of report.placements) {
    assert.equal(row.createsGardenPlant, false);
    assert.equal(row.placeholder, false);
    assert.equal(row.reloadMatch, true);
    assert.equal(row.gardenPlantIdUnchanged, true);
    assert.equal(row.payloadHasPng, false);
    assert.equal(row.visual.usedManifest, false);
    assert.equal(row.visual.source, 'design-asset-registry-v1');
  }
  assert.equal(report.mangoArea.placementAreaId, MANGO_OWNED_AREA_ID);
  assert.equal(report.mangoArea.myGardenAreaUnchanged, true);
  assert.equal(report.physicalScale.mango.usesTreePhysicalScaleV1, true);
  assert.equal(report.physicalScale.mango.ownerPreferredRangePosition, 'LOW');
  assert.equal(report.physicalScale.mango.fitToFrame, false);
  assert.equal(report.physicalScale.banana.usesTreePhysicalScaleV1, false);
  assert.equal(report.physicalScale.pineapple.usesTreePhysicalScaleV1, false);
  assert.equal(report.physicalScale.equalVisualHeightForced, false);
  assert.equal(report.deletePlacement.gardenPlantsTableWritten, false);
  assert.equal(report.proposedPlantSafety.createsGardenPlant, false);
  assert.equal(report.proposedPlantSafety.autoOwnOnLookup, false);
  assert.equal(report.proposedPlantSafety.explicitAddToMyGardenRequired, true);

  assert.equal(sha(EXPECTED_LOOKUPS.mango.file), mangoBefore);
  assert.equal(sha(EXPECTED_LOOKUPS.banana.file), bananaBefore);
  assert.equal(sha(EXPECTED_LOOKUPS.pineapple.file), pineappleBefore);
  assert.equal(sha(EXPECTED_LOOKUPS.olive.file), oliveBefore);
  assert.equal(fs.existsSync(report.overlayPath), true);
});
