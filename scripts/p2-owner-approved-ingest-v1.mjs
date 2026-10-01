#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { validateCatalogExpansionPacket } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { normalizeBatch3PacketForClassification, classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import { evaluatePacketContradictionDry } from '../modules/personal-domain/catalog-contradiction-gate-v1.js';
const ROOT=process.cwd();
const INPUTS=[
  path.join(ROOT,'data/catalog/revalidation/p2-wave-1-proposals-2026-10-01-v1'),
  path.join(ROOT,'data/catalog/revalidation/p2-wave-2-proposals-2026-10-01-v1')
];
const OUT=path.join(ROOT,'data/catalog-expansion/batches/p2-owner-approved-v1/packets');
fs.mkdirSync(OUT,{recursive:true});
const files=INPUTS.flatMap(dir=>fs.readdirSync(dir).filter(n=>n.endsWith('.proposal.json')).map(n=>path.join(dir,n))).sort();
if(files.length!==13) throw new Error(`expected 13 P2 proposals, got ${files.length}`);
const rows=[];for(const file of files){
  const proposal=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  const packet=structuredClone(proposal);
  packet.humanApproval={
    approvedForIngest:true,
    approvedAt:'2026-10-01',
    approvedBy:'CRUVIT Owner',
    note:'Owner PASS approved in chat on 2026-10-01 for all 13 P2 plants; ingest authorized subject to all QA gates and no silent inference.'
  };
  packet.flags={...(packet.flags||{}),forceClimateNeedsReview:false};
  const validation=validateCatalogExpansionPacket(packet);
  if(!validation.ok) throw new Error(`${packet.packetId}: ${validation.errors.join('; ')}`);
  const plant=normalizeBatch3PacketForClassification(packet);
  const ready=classifyPlantDataReadiness(plant);
  const conflict=evaluatePacketContradictionDry(packet);
  if(ready.readinessShort!=='A'||ready.gate!=='PASS') throw new Error(`${plant.slug}: readiness ${ready.readinessShort}/${ready.gate}`);
  if(conflict.needsHold) throw new Error(`${plant.slug}: contradiction hold ${(conflict.holdFields||[]).join(',')}`);
  const out=path.join(OUT,`${plant.slug}.packet.json`);
  fs.writeFileSync(out,JSON.stringify(packet,null,2)+'\n');
  rows.push({slug:plant.slug,packetId:packet.packetId,readiness:ready.readinessShort,gate:ready.gate,contradictionHold:false});
}const summary={
  contract:'cruvit-p2-owner-approved-ingest-v1',
  createdAt:'2026-10-01',
  ownerApproved:true,
  noSilentInference:true,
  packetCount:rows.length,
  classA:rows.filter(r=>r.readiness==='A').length,
  contradictionHolds:rows.filter(r=>r.contradictionHold).length,
  rows
};
fs.writeFileSync(path.join(ROOT,'data/catalog/revalidation/p2-owner-approved-batch-2026-10-01-v1.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
