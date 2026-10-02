import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { materializePlantCatalogItemFromPacket } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixture=JSON.parse(fs.readFileSync(path.join(ROOT,'data/catalog/revalidation/semantic-hard-case-fixture-v1.json'),'utf8'));
function walk(dir,out=[]){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,e.name);
    if(e.isDirectory()) walk(p,out);
    else if(e.name.endsWith('.packet.json')) out.push(p);
  }
  return out;
}
test('semantic hard-case fixture exactly mirrors approved packet materialization',()=>{
  assert.equal(fixture.contract,'cruvit-semantic-hard-case-fixture-v1');
  assert.equal(fixture.rows.length,16);
  const wanted=new Set(fixture.slugs);
  const latest=new Map();  for(const file of walk(path.join(ROOT,'data/catalog-expansion'))){
    const packet=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
    const slug=packet.identity?.canonicalSlug;
    if(!wanted.has(slug)||packet.humanApproval?.approvedForIngest!==true) continue;
    const m=materializePlantCatalogItemFromPacket(packet);
    assert.equal(m.ok,true,slug);
    latest.set(slug,{slug,scientific:m.item.scientific,tags:m.item.tags||[],climateTraits:m.item.climateTraits,packetId:packet.packetId});
  }
  assert.equal(latest.size,fixture.rows.length);
  for(const row of fixture.rows){
    assert.deepEqual(row,latest.get(row.slug),row.slug);
  }
});
