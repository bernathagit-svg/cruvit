/**
 * Owned Garden promotion final gate. Zero spend. No registry write. Binaries immutable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  OWNER_APPROVAL_RECORD,
  OWNED_GARDEN_PROMOTION_FINAL_SPEND_GATE,
  executeOwnedGardenAssetPromotionFinalGate,
  prepareOwnedGardenAssetPromotionFinalGate,
  reconcileBananaIdentityScope,
  writeOwnedGardenAssetPromotionFinalGateReports
} from '../modules/garden-design/asset-factory-v1/owned-garden-asset-promotion-final-gate-v1.js';
import { IDENTITY_PRECISION } from '../modules/garden-design/asset-factory-v1/identity-precision-v1.js';
import {
  BANANA_PROMOTION_CANDIDATE,
  MANGO_PROMOTION_CANDIDATE,
  PINEAPPLE_PROMOTION_CANDIDATE
} from '../modules/garden-design/asset-factory-v1/owned-garden-design-asset-promotion-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'modules/garden-design/assets/plants/design-asset-registry-v1.json');

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('final promotion gate records three owner approvals without writing the registry', () => {
  const registryBefore = sha(REGISTRY);
  const mangoBefore = sha(path.join(ROOT, MANGO_PROMOTION_CANDIDATE.file));
  const bananaBefore = sha(path.join(ROOT, BANANA_PROMOTION_CANDIDATE.file));
  const pineappleBefore = sha(path.join(ROOT, PINEAPPLE_PROMOTION_CANDIDATE.file));

  assert.equal(OWNER_APPROVAL_RECORD.mango.ownerChoice, 'APPROVE_FOR_PRODUCTION_REGISTRY');
  assert.equal(OWNER_APPROVAL_RECORD.banana.ownerChoice, 'APPROVE_FOR_PRODUCTION_REGISTRY');
  assert.equal(OWNER_APPROVAL_RECORD.pineapple.ownerChoice, 'APPROVE_FOR_PRODUCTION_REGISTRY');
  assert.equal(OWNED_GARDEN_PROMOTION_FINAL_SPEND_GATE.state, 'DENIED');
  assert.equal(OWNED_GARDEN_PROMOTION_FINAL_SPEND_GATE.productionRegistryWrite, false);

  const bananaIdentity = reconcileBananaIdentityScope();
  assert.equal(bananaIdentity.identityPrecision, IDENTITY_PRECISION.GENUS_VISUALLY_REPRESENTABLE);
  assert.equal(bananaIdentity.identityScope, 'genus');
  assert.equal(bananaIdentity.speciesInvented, false);
  assert.equal(bananaIdentity.BANANA_IDENTITY_SCOPE_GATE_REQUIRED, false);

  const spend = executeOwnedGardenAssetPromotionFinalGate();
  assert.equal(spend.openaiCalls, 0);
  assert.equal(spend.imageGeneration, 0);
  assert.equal(spend.productionRegistryWritten, false);
  assert.equal(spend.binariesModified, false);

  const prepared = prepareOwnedGardenAssetPromotionFinalGate(ROOT);
  assert.equal(prepared.promotionReady.mango, true);
  assert.equal(prepared.promotionReady.banana, true);
  assert.equal(prepared.promotionReady.pineapple, true);
  assert.equal(prepared.registryRecords.mango.quality, 'high');
  assert.equal(prepared.registryRecords.mango.promptVersion, 'design-cutout-woody-foliage-detail-v2-experiment');
  assert.equal(prepared.registryRecords.mango.mangoLowCopiedAsBotanicalTruth, false);
  assert.equal(prepared.registryRecords.mango.seasonIsIdentity, false);
  assert.equal(prepared.registryRecords.mango.botanicalTaxonId, 'taxon:mangifera-indica');
  assert.equal(prepared.registryRecords.banana.identityScope, 'genus');
  assert.equal(prepared.registryRecords.banana.identityPrecision, 'GENUS_VISUALLY_REPRESENTABLE');
  assert.equal(prepared.registryRecords.banana.scientific, 'Musa spp.');
  assert.equal(prepared.registryRecords.banana.cultivarSpecific, false);
  assert.equal(prepared.registryRecords.banana.botanicalTaxonId, null);
  assert.equal(prepared.registryRecords.pineapple.visualForm, 'rosette');
  assert.equal(prepared.registryRecords.pineapple.quality, 'medium');
  assert.doesNotMatch(prepared.registryRecords.pineapple.file, /pineapple-mature-rosette-vegetative-v1/);
  assert.equal(prepared.registryWritePlan.executeNow, false);
  assert.equal(prepared.registryWritePlan.totalApprovedBaselineAssetsAfterWrite, 4);
  assert.equal(prepared.storagePlan.uploadNow, false);
  assert.equal(prepared.storagePlan.createBucketNow, false);
  assert.equal(prepared.coverage.gardenPlantIdsUnchanged, true);
  assert.deepEqual(
    prepared.coverage.currentOwnedPlants.map((row) => row.gardenPlantId),
    ['gp-mango-owned-1', 'gp-banana-owned-1', 'gp-pineapple-owned-1']
  );

  const written = writeOwnedGardenAssetPromotionFinalGateReports(ROOT);
  assert.equal(written.productionRegistryWritten, false);
  assert.equal(written.bananaGateRequired, false);

  const records = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'data/garden-design/owned-garden-asset-promotion-final-gate-v1/registry-records.json'),
      'utf8'
    )
  );
  assert.equal(Object.keys(records).length, 3);
  assert.ok(!JSON.stringify(records.mango).includes('ownerPreferredRangePosition'));
  assert.ok(!JSON.stringify(records.mango).includes('"LOW"'));

  assert.equal(sha(REGISTRY), registryBefore);
  assert.equal(sha(path.join(ROOT, MANGO_PROMOTION_CANDIDATE.file)), mangoBefore);
  assert.equal(sha(path.join(ROOT, BANANA_PROMOTION_CANDIDATE.file)), bananaBefore);
  assert.equal(sha(path.join(ROOT, PINEAPPLE_PROMOTION_CANDIDATE.file)), pineappleBefore);
});
