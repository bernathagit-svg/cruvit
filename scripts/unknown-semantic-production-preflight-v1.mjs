import fs from 'node:fs';
import path from 'node:path';
import { validateCatalogExpansionPacket, materializePlantCatalogItemFromPacket } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { normalizeBatch3PacketForClassification, classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import { evaluatePacketContradictionDry } from '../modules/personal-domain/catalog-contradiction-gate-v1.js';
const ROOT=process.cwd();
const slugs=['monstera','cycas'];
const rows=[];
for(const slug of slugs){
  const file=path.join(ROOT,'data/catalog/revalidation/semantic-audit-proposals-v1',slug+'.proposal.json');
  const p=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  const sim={...p,humanApproval:{approvedForIngest:true,approvedAt:'SIMULATION_ONLY',note:'production preflight only'}};
  const v=validateCatalogExpansionPacket(sim); if(!v.ok) throw new Error(slug+': '+v.errors.join('; '));
  const ready=classifyPlantDataReadiness(normalizeBatch3PacketForClassification(p));
  const conflict=evaluatePacketContradictionDry(p);
  const m=materializePlantCatalogItemFromPacket(sim,{updatedAt:'2026-10-02T00:00:00.000Z'});
  if(!m.ok) throw new Error(slug+': '+m.errors.join('; '));
  rows.push({slug,readiness:ready.readinessShort,gate:ready.gate,contradictionHold:conflict.needsHold,unknownFields:m.unknownFields,needsReviewFields:m.needsReviewFields,mediaStatus:m.imageStatus||m.item?.source?.imageStatus||null,provenanceCount:m.item?.provenance?.length||0,tags:m.item?.tags||[],reproductiveBiology:m.item?.climateTraits?.reproductiveBiology||null,reproductiveClimate:m.item?.climateTraits?.reproductiveClimate||null});
}
const out={contract:'cruvit-unknown-semantic-production-preflight-v1',createdAt:'2026-10-02',ownerApproved:false,rows};
fs.writeFileSync(path.join(ROOT,'data/catalog/revalidation/unknown-semantic-production-preflight-2026-10-02-v1.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));