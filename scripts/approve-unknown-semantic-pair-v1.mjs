import fs from 'node:fs';
import path from 'node:path';
import { validateCatalogExpansionPacket, materializePlantCatalogItemFromPacket } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { normalizeBatch3PacketForClassification, classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import { evaluatePacketContradictionDry } from '../modules/personal-domain/catalog-contradiction-gate-v1.js';
const ROOT=process.cwd(), slugs=['monstera','cycas'], rows=[];
for(const slug of slugs){
  const src=path.join(ROOT,'data/catalog/revalidation/semantic-audit-proposals-v1',slug+'.proposal.json');
  const packet=JSON.parse(fs.readFileSync(src,'utf8').replace(/^\uFEFF/,''));
  packet.humanApproval={approvedForIngest:true,approvedAt:'2026-10-02',approvedBy:'CRUVIT Owner',note:'Owner PASS approved in chat on 2026-10-02; canonical and production ingest authorized subject to all QA gates and no silent inference.'};
  const v=validateCatalogExpansionPacket(packet); if(!v.ok) throw new Error(slug+': '+v.errors.join('; '));
  const ready=classifyPlantDataReadiness(normalizeBatch3PacketForClassification(packet));
  const conflict=evaluatePacketContradictionDry(packet); if(ready.readinessShort!=='A'||ready.gate!=='PASS'||conflict.needsHold) throw new Error(slug+': QA failed');
  const m=materializePlantCatalogItemFromPacket(packet,{updatedAt:'2026-10-02T11:43:00.000Z'}); if(!m.ok) throw new Error(slug+': '+m.errors.join('; '));
  const out=path.join(ROOT,'data/catalog-expansion/batches/semantic-audit-owner-approved-v1/packets',slug+'.packet.json'); fs.mkdirSync(path.dirname(out),{recursive:true}); fs.writeFileSync(out,JSON.stringify(packet,null,2)+'\n');
  fs.writeFileSync(path.join(ROOT,'data/catalog/revalidation',slug+'-materialized-v1.json'),JSON.stringify({item:m.item,identityRegistryEntry:m.identityRegistryEntry},null,2)+'\n');
  rows.push({slug,readiness:ready.readinessShort,gate:ready.gate,contradictionHold:false,unknownFields:m.unknownFields,needsReviewFields:m.needsReviewFields,mediaStatus:m.item?.source?.imageStatus||m.item?.media?.imageStatus||null});
}
console.log(JSON.stringify({contract:'cruvit-approve-unknown-semantic-pair-v1',rows},null,2));