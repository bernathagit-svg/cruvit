#!/usr/bin/env node
/**
 * Catalog Approved Packet Backfill Planner v1.
 * Read-only. Scans approved Catalog Expansion packets, validates/materializes them,
 * compares against an optional canonical slug snapshot, and emits an exact backfill plan.
 * No DB writes, no network, no visual generation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateCatalogExpansionPacket,
  materializePlantCatalogItemFromPacket
} from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { seedPlantToCatalogRow } from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

function arg(name,fallback=''){
  const p='--'+name+'=';
  const hit=process.argv.slice(2).find(x=>String(x).startsWith(p));
  return hit?String(hit).slice(p.length):fallback;
}
function walk(dir,out=[]){
  if(!fs.existsSync(dir)) return out;
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory()) walk(p,out);
    else if(ent.isFile() && ent.name.endsWith('.packet.json')) out.push(p);
  }
  return out;
}
function readJson(p){return JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));}

const snapshotPath=arg('catalog-snapshot','');
const existing=new Set();
if(snapshotPath){
  const snap=readJson(path.isAbsolute(snapshotPath)?snapshotPath:path.resolve(process.cwd(),snapshotPath));
  for(const x of (snap.slugs||snap.rows||[])){
    existing.add(String(typeof x==='string'?x:x.slug||'').toLowerCase());
  }
}

const dirs=[
  path.join(ROOT,'data','catalog-expansion','batches'),
  path.join(ROOT,'data','catalog-expansion','packets')
];
const packetFiles=[...new Set(dirs.flatMap(d=>walk(d)))].sort();

const rows=[];
for(const file of packetFiles){
  let packet;
  try{packet=readJson(file);}catch(err){
    rows.push({path:path.relative(ROOT,file),status:'INVALID_JSON',error:String(err.message||err)});
    continue;
  }
  const slug=String(packet.identity?.canonicalSlug||'').toLowerCase();
  const approved=packet.humanApproval?.approvedForIngest===true;
  const validation=validateCatalogExpansionPacket(packet);
  let material=null;
  let catalogRow=null;
  if(approved && validation.ok){
    material=materializePlantCatalogItemFromPacket(packet,{updatedAt:'1970-01-01T00:00:00.000Z'});
    if(material.ok){
      catalogRow=seedPlantToCatalogRow(material.item,{
        catalogVersion:'1.0.0',
        sourcePacket:packet.packetId
      });
    }
  }
  rows.push({
    path:path.relative(ROOT,file),
    packetId:packet.packetId||null,
    slug:slug||null,
    scientific:packet.identity?.acceptedScientificName||null,
    approved,
    validationOk:validation.ok,
    validationErrors:validation.errors||[],
    materializeOk:material?.ok===true,
    verificationState:catalogRow?.verification_state||null,
    needsReview:catalogRow?.needs_review??null,
    sourcePacket:catalogRow?.source_packet||null,
    alreadyCanonical:slug?existing.has(slug):false,
    backfillEligible:Boolean(
      slug && approved && validation.ok && material?.ok===true && !existing.has(slug)
    ),
    row:catalogRow||null
  });
}

const eligible=rows.filter(x=>x.backfillEligible);
const summary={
  contract:'catalog-approved-packet-backfill-plan-v1',
  packetCount:rows.length,
  approvedCount:rows.filter(x=>x.approved).length,
  validApprovedCount:rows.filter(x=>x.approved&&x.validationOk&&x.materializeOk).length,
  alreadyCanonicalCount:rows.filter(x=>x.alreadyCanonical).length,
  backfillEligibleCount:eligible.length,
  verifiedEligibleCount:eligible.filter(x=>x.verificationState==='verified').length,
  reviewEligibleCount:eligible.filter(x=>x.needsReview===true||x.verificationState!=='verified').length,
  noWrites:true
};
const report={summary,eligible:eligible.map(x=>({
  path:x.path,packetId:x.packetId,slug:x.slug,scientific:x.scientific,
  verificationState:x.verificationState,needsReview:x.needsReview,sourcePacket:x.sourcePacket
})),rows};
const out=arg('out','');
if(out){
  const p=path.isAbsolute(out)?out:path.resolve(process.cwd(),out);
  fs.mkdirSync(path.dirname(p),{recursive:true});
  fs.writeFileSync(p,JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({summary,eligible:report.eligible},null,2));
