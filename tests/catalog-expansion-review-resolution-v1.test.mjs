import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { materializePlantCatalogItemFromPacket } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';

function readJson(path){ return JSON.parse(fs.readFileSync(path,'utf8')); }

test('Cacao review resolution keeps explicit disputes but does not globally block catalog readiness',()=>{
  const packet=readJson('data/catalog-expansion/packets/cacao-theobroma-cacao-v1/packet.json');
  const out=materializePlantCatalogItemFromPacket(packet,{updatedAt:'2026-09-24T00:00:00Z'});
  assert.equal(out.ok,true);
  assert.equal(out.item.climateTraits.needsReview,false);
  assert.equal(out.item.climateTraits.reviewResolution.globalCatalogReady,true);
  assert.deepEqual(
    out.item.climateTraits.reviewResolution.nonBlockingDisputedFields,
    ['coldDamageThresholdC','taxonomy.family']
  );
  assert.equal(out.item.climateTraits.traitProvenance.coldDamageThresholdC.status,'disputed');
});

test('Blue Gum regional review resolution does not globally block materialization',()=>{
  const packet=readJson('data/catalog-expansion/batches/bulk-batch-1-v1/packets/blue-gum.packet.json');
  const out=materializePlantCatalogItemFromPacket(packet,{updatedAt:'2026-09-24T00:00:00Z'});
  assert.equal(out.ok,true);
  assert.equal(out.item.climateTraits.needsReview,false);
  assert.equal(out.item.climateTraits.reviewResolution.globalCatalogReady,true);
  assert.equal(out.item.climateTraits.reviewResolution.regionalRestrictionReviewRequired,true);
});
