import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  validateCatalogExpansionPacket,
  materializePlantCatalogItemFromPacket
} from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';

const packet=JSON.parse(fs.readFileSync(
  'data/catalog-expansion/batches/bulk-batch-3-v1/packets/pomegranate.packet.json','utf8'
));

test('pomegranate packet materializes structured reproductive climate',()=>{
  const v=validateCatalogExpansionPacket(packet);
  assert.equal(v.ok,true,JSON.stringify(v.errors));
  const m=materializePlantCatalogItemFromPacket(packet,{updatedAt:'1970-01-01T00:00:00.000Z'});
  assert.equal(m.ok,true);
  const rc=m.item?.climateTraits?.reproductiveClimate;
  assert.equal(rc?.contractVersion,'reproductive-climate-v1');
  assert.equal(rc?.fruiting?.summerHeatBand,'hot');
  assert.equal(rc?.fruiting?.evidenceClass,'HEURISTIC_ASSERTION');
  assert.deepEqual(rc?.fruiting?.sourceIds,['ncsu-punica-granatum']);
});

test('invalid reproductive climate band is rejected',()=>{
  const bad=structuredClone(packet);
  const c=bad.claims.find(x=>x.field==='reproductiveClimate.fruiting.summerHeatBand');
  c.value='pretty warm';
  const v=validateCatalogExpansionPacket(bad);
  assert.equal(v.ok,false);
  assert.ok(v.errors.some(e=>e.includes('must be cool|mild|warm|hot|very_hot')));
});

test('reproductive climate claim requires evidence class',()=>{
  const bad=structuredClone(packet);
  const c=bad.claims.find(x=>x.field==='reproductiveClimate.fruiting.summerHeatBand');
  delete c.evidenceClass;
  const v=validateCatalogExpansionPacket(bad);
  assert.equal(v.ok,false);
  assert.ok(v.errors.some(e=>e.includes('reproductiveClimate assertions require evidenceClass')));
});
