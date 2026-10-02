#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { materializePlantCatalogItemFromPacket } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
const ROOT=process.cwd();
const SLUGS=[
  'almond','cherimoya','coconut','cypress','grapevine','guava','japanese-maple','kiwi',
  'lychee','mandarin','passionfruit','pistachio','plumeria','pomegranate','apple','fig'
];
function walk(dir,out=[]){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,e.name);
    if(e.isDirectory()) walk(p,out);
    else if(e.name.endsWith('.packet.json')) out.push(p);
  }
  return out;
}
const approved=new Map();
for(const file of walk(path.join(ROOT,'data/catalog-expansion'))){
  const packet=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  if(packet.humanApproval?.approvedForIngest!==true) continue;
  const slug=packet.identity?.canonicalSlug;
  if(!SLUGS.includes(slug)) continue;
  const m=materializePlantCatalogItemFromPacket(packet);
  if(!m.ok) throw new Error(`${slug}: ${m.errors?.join(';')}`);
  approved.set(slug,{slug,scientific:m.item.scientific,tags:m.item.tags||[],climateTraits:m.item.climateTraits,packetId:packet.packetId});
}const missing=SLUGS.filter(s=>!approved.has(s));
if(missing.length) throw new Error('missing approved semantic audit packets: '+missing.join(', '));
const fixture={
  contract:'cruvit-semantic-hard-case-fixture-v1',
  generatedAt:'2026-10-02',
  source:'owner-approved catalog expansion packets',
  slugs:SLUGS,
  rows:SLUGS.map(s=>approved.get(s))
};
const out=path.join(ROOT,'data/catalog/revalidation/semantic-hard-case-fixture-v1.json');
fs.writeFileSync(out,JSON.stringify(fixture,null,2)+'\n');
console.log(JSON.stringify({count:fixture.rows.length,out,slugs:fixture.slugs},null,2));
