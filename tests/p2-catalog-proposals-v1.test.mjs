import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateCatalogExpansionPacket, materializePlantCatalogItemFromPacket } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { normalizeBatch3PacketForClassification, classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import { evaluatePacketContradictionDry } from '../modules/personal-domain/catalog-contradiction-gate-v1.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DIRS=[
  path.join(ROOT,'data/catalog/revalidation/p2-wave-1-proposals-2026-10-01-v1'),
  path.join(ROOT,'data/catalog/revalidation/p2-wave-2-proposals-2026-10-01-v1')
];
function proposals(){
  const rows=[];
  for(const dir of DIRS){
    for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.proposal.json')).sort()){
      rows.push(JSON.parse(fs.readFileSync(path.join(dir,name),'utf8')));
    }
  }
  return rows;
}
function materialize(packet){
  return materializePlantCatalogItemFromPacket({
    ...packet,
    humanApproval:{approvedForIngest:true,approvedAt:'SIMULATION_ONLY',note:'test only'}
  });
}
test('P2 proposal generators produce 13 owner-unapproved packets',()=>{
  for(const script of ['scripts/p2-wave-1-proposals-v1.mjs','scripts/p2-wave-2-proposals-v1.mjs']){
    const r=spawnSync(process.execPath,[script],{cwd:ROOT,encoding:'utf8'});
    assert.equal(r.status,0,r.stderr||r.stdout);
  }
  const rows=proposals();
  assert.equal(rows.length,13);
  assert.ok(rows.every(p=>p.humanApproval?.approvedForIngest===false));
  for(const p of rows){
    const raw=validateCatalogExpansionPacket(p);
    assert.equal(raw.ok,false);
    assert.ok(raw.errors.some(e=>/humanApproval\.approvedForIngest/i.test(e)));
  }
});
test('all 13 proposals are Class A with no material contradiction holds',()=>{
  const rows=proposals();
  const status=rows.map(p=>{
    const ready=classifyPlantDataReadiness(normalizeBatch3PacketForClassification(p));
    const conflict=evaluatePacketContradictionDry(p);
    return {slug:p.identity.canonicalSlug,ready,conflict,p};
  });
  assert.equal(status.filter(x=>x.ready.readinessShort==='A').length,13);
  assert.equal(status.filter(x=>x.conflict.needsHold).length,0);
  const pist=status.find(x=>x.slug==='pistachio');
  assert.equal(pist.ready.readinessShort,'A');
  assert.equal(pist.ready.gate,'PASS');
  assert.equal(pist.conflict.needsHold,false);
  const cold=pist.p.claims.find(c=>c.field==='coldTolerance');
  assert.equal(cold.value,'high');
  assert.ok(cold.sourceIds.includes('ucanr-pistachio-dormancy-cold'));
  assert.ok(cold.sourceIds.includes('usu-pistachio-treebrowser'));
});
test('materialization is lossless for CRUVIT rule context',()=>{
  const bySlug=Object.fromEntries(proposals().map(p=>[p.identity.canonicalSlug,materialize(p)]));
  assert.ok(Object.values(bySlug).every(x=>x.ok));
  assert.ok(bySlug.grapevine.item.climateTraits.hardBlockRules.includes('needs-support'));
  assert.ok(bySlug.passionfruit.item.climateTraits.hardBlockRules.includes('needs-support'));
  assert.ok(bySlug.coconut.item.climateTraits.hardBlockRules.includes('no-small-container'));
  assert.deepEqual(bySlug.lychee.item.climateTraits.hardBlockRules,['needs-cooler-drier-winter-for-fruit','no-small-container']);
  assert.equal(bySlug.lychee.item.climateTraits.needsDrySeason,true);
  assert.ok(bySlug.mandarin.item.climateTraits.warningFlags.includes('thorny'));
  assert.equal(bySlug.almond.item.climateTraits.needsWinterChill,true);
  assert.equal(bySlug.kiwi.item.climateTraits.needsWinterChill,true);
  assert.equal(bySlug.pistachio.item.climateTraits.needsWinterChill,true);
  assert.equal(bySlug.cherimoya.item.climateTraits.needsWinterChill,undefined);
  for(const slug of ['almond','cypress','grapevine','japanese-maple','kiwi','cherimoya','coconut','guava','lychee','mandarin','passionfruit','pistachio','plumeria']){
    assert.ok(Array.isArray(bySlug[slug].item.climateTraits.groupIds));
    assert.ok(bySlug[slug].item.climateTraits.groupIds.length>0);
  }
});
test('legacy-preserved context stays HEURISTIC and cannot masquerade as source-supported',()=>{
  for(const p of proposals()){
    for(const c of p.claims.filter(c=>c.sourceIds?.includes('cruvit-legacy-runtime-context'))){
      assert.equal(c.evidenceClass,'HEURISTIC_ASSERTION');
      assert.match(c.shortExcerpt,/preserved unchanged/i);
    }
  }
});
