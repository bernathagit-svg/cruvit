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


function load(rel){
  return JSON.parse(fs.readFileSync(rel,'utf8'));
}

test('legacy source-backed packet gets deterministic frost-free materialization',()=>{
  const p=load('data/catalog-expansion/batches/bulk-batch-1-v1/packets/acerola.packet.json');
  const m=materializePlantCatalogItemFromPacket(p,{updatedAt:'1970-01-01T00:00:00.000Z'});
  assert.equal(m.ok,true,JSON.stringify(m.errors));
  const rc=m.item?.climateTraits?.reproductiveClimate;
  assert.equal(rc?.fruiting?.requiresFrostFree,true);
  assert.equal(rc?.fruiting?.evidenceClass,'HEURISTIC_ASSERTION');
  assert.equal(rc?.fruiting?.transformRef,'explicit-frost-free-fruiting-requirement-v1@1.0.0');
});

test('legacy cool-season crop gets deterministic fruiting cool-season materialization',()=>{
  const p=load('data/catalog-expansion/batches/bulk-batch-3-v1/packets/garden-pea.packet.json');
  const m=materializePlantCatalogItemFromPacket(p,{updatedAt:'1970-01-01T00:00:00.000Z'});
  assert.equal(m.ok,true,JSON.stringify(m.errors));
  const rc=m.item?.climateTraits?.reproductiveClimate;
  assert.equal(rc?.fruiting?.requiresCoolSeason,true);
  assert.equal(rc?.fruiting?.transformRef,'explicit-cool-season-production-v1@1.0.0');
});

test('legacy strictly tropical fruit-production packet gets conservative warm band',()=>{
  const p=load('data/catalog-expansion/batches/bulk-batch-1-v1/packets/durian.packet.json');
  const m=materializePlantCatalogItemFromPacket(p,{updatedAt:'1970-01-01T00:00:00.000Z'});
  assert.equal(m.ok,true,JSON.stringify(m.errors));
  const rc=m.item?.climateTraits?.reproductiveClimate;
  assert.equal(rc?.fruiting?.summerHeatBand,'warm');
  assert.equal(rc?.fruiting?.transformRef,'qualitative-summer-heat-band-v1@1.0.0');
});

test('insufficient fruiting climate evidence remains unmaterialized',()=>{
  const p=load('data/catalog-expansion/packets/cacao-theobroma-cacao-v1/packet.json');
  const m=materializePlantCatalogItemFromPacket(p,{updatedAt:'1970-01-01T00:00:00.000Z'});
  assert.equal(m.ok,true,JSON.stringify(m.errors));
  assert.equal(m.item?.climateTraits?.reproductiveClimate,undefined);
});
