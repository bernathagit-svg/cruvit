#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  validateCatalogExpansionPacket,
  materializePlantCatalogItemFromPacket
} from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(ROOT,'data','catalog-expansion','approved-runtime-climate-overlay-v1.json');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
function walk(dir,out=[]){
  if(!fs.existsSync(dir)) return out;
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory()) walk(p,out);
    else if(ent.isFile()&&(ent.name.endsWith('.packet.json')||ent.name==='packet.json')) out.push(p);
  }
  return out;
}
function compactClimateTraits(traits={}){
  const out={...traits};
  delete out.plantKnowledge;
  delete out.designMetadata;
  return out;
}
const packetFiles=[
  ...walk(path.join(ROOT,'data','catalog-expansion','batches')),
  ...walk(path.join(ROOT,'data','catalog-expansion','packets'))
].sort();
const plants={},seen=new Set();
for(const file of packetFiles){
  const packet=read(file);
  if(packet.humanApproval?.approvedForIngest!==true) continue;
  const validation=validateCatalogExpansionPacket(packet);
  if(!validation.ok) throw new Error('Approved packet invalid: '+path.relative(ROOT,file));
  const slug=String(packet.identity?.canonicalSlug||'').trim().toLowerCase();
  if(!slug) throw new Error('Approved packet missing canonical slug: '+file);
  if(seen.has(slug)) throw new Error('Duplicate approved packet slug: '+slug);
  seen.add(slug);
  const material=materializePlantCatalogItemFromPacket(packet,{updatedAt:'1970-01-01T00:00:00.000Z'});
  if(!material.ok) throw new Error('Materialize failed: '+slug);
  plants[slug]={
    packetId:packet.packetId,
    scientific:material.item.scientific||null,
    verificationState:'verified',
    needsReview:false,
    climateTraits:compactClimateTraits(material.item.climateTraits||{})
  };
}
const payload={
  schemaVersion:1,
  overlayVersion:'1.0.0',
  authority:'OWNER_APPROVED_CATALOG_EXPANSION_PACKETS',
  plantCount:Object.keys(plants).length,
  plants
};
fs.writeFileSync(OUT,JSON.stringify(payload,null,2)+'\n','utf8');
console.log(JSON.stringify({output:path.relative(ROOT,OUT),plantCount:payload.plantCount},null,2));
