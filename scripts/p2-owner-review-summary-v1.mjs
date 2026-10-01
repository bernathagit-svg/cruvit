#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { evaluatePacketContradictionDry } from '../modules/personal-domain/catalog-contradiction-gate-v1.js';
import { materializePlantCatalogItemFromPacket } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { normalizeBatch3PacketForClassification, classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import { loadCatalogPlants } from '../modules/personal-domain/auto-enrichment-worker-v1.js';
const ROOT=process.cwd();
const dirs=[
  path.join(ROOT,'data/catalog/revalidation/p2-wave-1-proposals-2026-10-01-v1'),
  path.join(ROOT,'data/catalog/revalidation/p2-wave-2-proposals-2026-10-01-v1')
];
const current=loadCatalogPlants(ROOT);
const fields=['frostSensitivity','coldTolerance','heatTolerance','humidityTolerance','sunNeeds','waterNeeds','drainageNeeds','needsWinterChill','floweringRequirements','fruitingRequirements','survivalVsThriveNotes','groupIds','hardBlockRules','needsDrySeason','warningFlags'];
const rows=[];
for(const dir of dirs){
  for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.proposal.json')).sort()){
    const packet=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
    const slug=packet.identity.canonicalSlug;
    const plant=normalizeBatch3PacketForClassification(packet);
    const ready=classifyPlantDataReadiness(plant);
    const contradiction=evaluatePacketContradictionDry(packet);
    const approvedClone={...packet,humanApproval:{approvedForIngest:true,approvedAt:'SIMULATION_ONLY',note:'Materialization simulation only; not owner approval.'}};
    const materialized=materializePlantCatalogItemFromPacket(approvedClone);
    const before=current[slug]?.climateTraits||{};
    const after=plant.climateTraits||{};
    const materializedTraits=materialized.ok?materialized.item.climateTraits:{};
    const changes=[];
    for(const field of fields){
      const a=before[field]??null,b=after[field]??null;
      if(JSON.stringify(a)!==JSON.stringify(b)) changes.push({field,before:a,proposed:b,evidenceClass:after.traitEvidenceClasses?.[field]||null});
    }
    rows.push({
      slug,
      readiness:ready.readinessShort,
      gate:ready.gate,
      approvedForIngest:packet.humanApproval?.approvedForIngest===true,
      contradictionHold:contradiction.needsHold===true,
      holdFields:contradiction.holdFields||[],
      materializationOk:materialized.ok===true,
      materializationErrors:materialized.errors||[],
      materializedRuleContext:Object.fromEntries(['needsWinterChill','survivalVsThriveNotes','groupIds','hardBlockRules','needsDrySeason','warningFlags'].map(field=>[field,materializedTraits[field]??null])),
      changes
    });
  }
}
const summary={
  contract:'cruvit-p2-owner-review-summary-v1',
  createdAt:'2026-10-01',
  proposalCount:rows.length,
  allClassA:rows.every(r=>r.readiness==='A'),
  allOwnerUnapproved:rows.every(r=>r.approvedForIngest===false),
  allMaterialize:rows.every(r=>r.materializationOk===true),
  contradictionHoldCount:rows.filter(r=>r.contradictionHold).length,
  changedPlantCount:rows.filter(r=>r.changes.length).length,
  rows
};
const out=path.join(ROOT,'data/catalog/revalidation/p2-owner-review-summary-2026-10-01-v1.json');
fs.writeFileSync(out,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
