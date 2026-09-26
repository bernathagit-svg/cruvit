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

test('insufficient fruiting climate evidence remains unmaterialized when no researched state is asserted',()=>{
  const p=load('data/catalog-expansion/packets/cacao-theobroma-cacao-v1/packet.json');
  p.claims=p.claims.filter(x=>!String(x.field||'').startsWith('reproductiveClimate.'));
  const m=materializePlantCatalogItemFromPacket(p,{updatedAt:'1970-01-01T00:00:00.000Z'});
  assert.equal(m.ok,true,JSON.stringify(m.errors));
  assert.equal(m.item?.climateTraits?.reproductiveClimate,undefined);
});


test('eight researched reproductive packets validate and materialize without invented support',()=>{
  const cases=[
    {
      path:'data/catalog-expansion/packets/cacao-theobroma-cacao-v1/packet.json',
      check:rc=>assert.equal(rc?.fruiting?.evidenceState,'RESEARCHED_UNQUANTIFIED')
    },
    {
      path:'data/catalog-expansion/batches/bulk-batch-1-v1/packets/feijoa.packet.json',
      check:rc=>assert.equal(rc?.fruiting?.evidenceState,'RESEARCHED_UNQUANTIFIED')
    },
    {
      path:'data/catalog-expansion/batches/bulk-batch-1-v1/packets/loquat.packet.json',
      check:rc=>assert.equal(rc?.fruiting?.minReproductiveEventC,-2.2)
    },
    {
      path:'data/catalog-expansion/batches/bulk-batch-2-v1/packets/sapodilla.packet.json',
      check:rc=>assert.equal(rc?.fruiting?.evidenceState,'RESEARCHED_UNQUANTIFIED')
    },
    {
      path:'data/catalog-expansion/batches/wave1-selective-v1/packets/strawberry.packet.json',
      check:rc=>{
        assert.equal(rc?.fruiting?.evidenceState,'CONTEXT_DEPENDENT');
        assert.deepEqual(rc?.fruiting?.contextKeys,['cultivar','bearingType']);
      }
    },
    {
      path:'data/catalog-expansion/batches/bulk-batch-3-v1/packets/sweet-orange.packet.json',
      check:rc=>assert.equal(rc?.fruiting?.evidenceState,'RESEARCHED_UNQUANTIFIED')
    },
    {
      path:'data/catalog-expansion/batches/bulk-batch-2-v1/packets/tamarind.packet.json',
      check:rc=>assert.equal(rc?.fruiting?.evidenceState,'RESEARCHED_UNQUANTIFIED')
    },
    {
      path:'data/catalog-expansion/batches/bulk-batch-1-v1/packets/white-sapote.packet.json',
      check:rc=>{
        assert.equal(rc?.flowering?.seasonalInductionCue,'cool_or_dry');
        assert.equal(rc?.fruiting?.seasonalInductionCue,'cool_or_dry');
        assert.equal(rc?.fruiting?.evidenceClass,'HEURISTIC_ASSERTION');
      }
    }
  ];
  for(const row of cases){
    const p=JSON.parse(fs.readFileSync(row.path,'utf8'));
    const v=validateCatalogExpansionPacket(p);
    assert.equal(v.ok,true,row.path+': '+JSON.stringify(v.errors));
    const m=materializePlantCatalogItemFromPacket(p,{updatedAt:'1970-01-01T00:00:00.000Z'});
    assert.equal(m.ok,true,row.path);
    row.check(m.item?.climateTraits?.reproductiveClimate);
  }
});

test('researched evidence state alone never manufactures a positive climate requirement',()=>{
  const p=JSON.parse(fs.readFileSync(
    'data/catalog-expansion/packets/cacao-theobroma-cacao-v1/packet.json','utf8'
  ));
  const m=materializePlantCatalogItemFromPacket(p,{updatedAt:'1970-01-01T00:00:00.000Z'});
  const fruit=m.item?.climateTraits?.reproductiveClimate?.fruiting;
  assert.equal(fruit?.evidenceState,'RESEARCHED_UNQUANTIFIED');
  assert.equal(fruit?.requiresFrostFree,undefined);
  assert.equal(fruit?.requiresCoolSeason,undefined);
  assert.equal(fruit?.summerHeatBand,undefined);
  assert.equal(fruit?.minWarmestMonthMeanMaxC,undefined);
});
