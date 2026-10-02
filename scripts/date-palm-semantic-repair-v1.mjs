#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { validateCatalogExpansionPacket, materializePlantCatalogItemFromPacket } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { normalizeBatch3PacketForClassification, classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import { evaluatePacketContradictionDry } from '../modules/personal-domain/catalog-contradiction-gate-v1.js';
const ROOT=process.cwd(), S='SOURCE_SUPPORTED', H='HEURISTIC_ASSERTION';
const src=(sourceId,institution,title,url)=>({sourceId,institution,publisher:institution,title,url,authorityTier:'university_extension',verifiedAt:'2026-10-02'});
const claim=(claimId,field,value,sourceIds,shortExcerpt,evidenceClass=S,extra={})=>({claimId,field,status:'asserted',value,sourceIds,shortExcerpt,evidenceClass,...extra});
const packet={
 expansionContractVersion:'1.2.0',packetId:'date-palm-semantic-audit-proposal-v1',
 identity:{canonicalSlug:'date-palm',commonNameEn:'Date Palm',acceptedScientificName:'Phoenix dactylifera',aliases:['date palm','true date palm','Phoenix dactylifera']},
 flags:{forceClimateNeedsReview:false,botanicalVerified:true,notes:'Semantic audit repair proposal: fruit-crop purpose and reproductive biology added from authoritative sources; no silent inference.'},
 sources:[
  src('uf-ifas-phoenix-dactylifera','University of Florida IFAS Extension','Phoenix dactylifera, Date Palm','https://ask.ifas.ufl.edu/publication/FR314'),
  src('ua-date-palm','University of Arizona Campus Arboretum','Palms on the University of Arizona Campus','https://arboretum.arizona.edu/palms'),
  src('ucanr-date-palm-field-day','University of California Cooperative Extension','Date Palm Field Day','https://ucanr.edu/node/154297/printable/print'),
  src('msu-date-palm','Mississippi State University Extension Service','Palms & Cycads for the Midsouth Landscape','https://www.extension.msstate.edu/publications/palms-cycads-for-the-midsouth-landscape')
 ],claims:[]};packet.claims.push(
 claim('date-frost','frostSensitivity','medium',['msu-date-palm'],'Leaves can burn near 20°F and plants may be killed near 10°F; whole-plant frost sensitivity retained as medium.',H),
 claim('date-cold','coldTolerance','low',['msu-date-palm'],'Mississippi State Extension lists Phoenix dactylifera as USDA zone 8b and reports hardiness around 12°F.','SOURCE_SUPPORTED',{transformation:'hardiness-zone-to-cold-traits-v1@1.1.0'}),
 claim('date-heat','heatTolerance','high',['ucanr-date-palm-field-day'],'UC Cooperative Extension states date fruit production needs high heat and arid weather.',H),
 claim('date-humidity','humidityTolerance','medium',['uf-ifas-phoenix-dactylifera'],'UF/IFAS says date palm prefers dry climates but also occurs in humid Florida; fruiting under Gulf Coast humidity is cultivar-limited.',H),
 claim('date-water','waterNeeds','medium',['ucanr-date-palm-field-day','uf-ifas-phoenix-dactylifera'],'Date palms need ample water/groundwater while fruit production favors arid weather.',H),
 claim('date-sun','sunNeeds','full_sun',['uf-ifas-phoenix-dactylifera'],'UF/IFAS states date palm requires full sun for optimal growth.',S),
 claim('date-drainage','drainageNeeds','high',['uf-ifas-phoenix-dactylifera'],'UF/IFAS recommends neutral to acidic, well-drained soils.',S),
 claim('date-flower','floweringRequirements','Male and female flowers occur on separate trees; both sexes are needed in the area for fruit production.',['uf-ifas-phoenix-dactylifera','ua-date-palm'],'UF/IFAS and University of Arizona describe separate male and female plants and flowers.',S),
 claim('date-fruit','fruitingRequirements','Edible date production needs male and female trees, hot dry weather, and adequate water; humid climates can sharply limit productive cultivars.',['uf-ifas-phoenix-dactylifera','ucanr-date-palm-field-day'],'UF/IFAS documents edible dates and both-sex requirement; UC Extension states high heat and arid weather are needed to produce fruit.',S),
 claim('date-tags','tags',['fruit','edible','palm','tree'],['uf-ifas-phoenix-dactylifera','ua-date-palm'],'Phoenix dactylifera bears edible commercial dates and is a palm tree food crop.',S)
);packet.claims.push(
 claim('date-repro-dioecious','reproductive.dioecious',true,['ua-date-palm','uf-ifas-phoenix-dactylifera'],'Date palms are dioecious, with separate male and female plants.',S),
 claim('date-repro-pollinator','reproductive.requires_pollinator',true,['uf-ifas-phoenix-dactylifera'],'Fruit production requires female and male trees in the same area.',S),
 claim('date-repro-sex','reproductive.sex_requirement','male_and_female_plants',['uf-ifas-phoenix-dactylifera','ua-date-palm'],'Both male and female plants are needed for reliable date fruit production.',S),
 claim('date-repro-compatible','reproductive.compatible_pollinator_requirement','male_pollen_source_for_female_tree',['ua-date-palm'],'University of Arizona notes pollen is transferred from male flowers to female plants and cultivation may use manual pollination.',S),
 claim('date-repro-cultivar','reproductive.cultivar_dependency',true,['uf-ifas-phoenix-dactylifera'],'UF/IFAS notes hundreds of date palm varieties and strong differences in fruiting under humid Gulf Coast conditions.',S),
 claim('date-group','groupIds',['hot-dry-palm'],['ucanr-date-palm-field-day'],'Structural group retained from explicit hot/arid palm production ecology.',H),
 claim('date-block','hardBlockRules',['no-small-container'],['uf-ifas-phoenix-dactylifera','msu-date-palm'],'Very large mature palm size supports a no-small-container placement rule.',H),
 claim('date-warning','warningFlags',['thorny'],['uf-ifas-phoenix-dactylifera'],'UF/IFAS notes 3-4 inch thorns formed by modified leaflets on the petiole.',S),
 claim('date-survival-thrive','survivalVsThriveNotes','The palm can grow in some humid or marginal climates, but reliable edible fruit production is much narrower and favors hot arid conditions with adequate irrigation.',['uf-ifas-phoenix-dactylifera','ucanr-date-palm-field-day'],'Survival/landscape growth is broader than commercial fruit production climate.',H)
);
packet.image={status:'IMAGE_PENDING',searchQuery:'Phoenix dactylifera Date Palm'};
packet.humanApproval={approvedForIngest:false,approvedAt:null,note:'PROPOSAL_ONLY — semantic audit repair requires explicit Owner PASS before canonical ingest.'};const validation=validateCatalogExpansionPacket({...packet,humanApproval:{approvedForIngest:true,approvedAt:'SIMULATION_ONLY',note:'QA simulation only'}});
if(!validation.ok) throw new Error(validation.errors.join('; '));
const plant=normalizeBatch3PacketForClassification(packet), readiness=classifyPlantDataReadiness(plant), contradiction=evaluatePacketContradictionDry(packet);
const material=materializePlantCatalogItemFromPacket({...packet,humanApproval:{approvedForIngest:true,approvedAt:'SIMULATION_ONLY',note:'QA simulation only'}});
const outDir=path.join(ROOT,'data/catalog/revalidation/semantic-audit-proposals-v1');fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,'date-palm.proposal.json'),JSON.stringify(packet,null,2)+'\n');
const report={contract:'cruvit-date-palm-semantic-repair-v1',createdAt:'2026-10-02',ownerApproved:false,validationOk:validation.ok,readiness:readiness.readinessShort,gate:readiness.gate,reasons:readiness.reasons,unknownOutcomes:readiness.unknownOutcomes,contradictionHold:contradiction.needsHold,holdFields:contradiction.holdFields,materializationOk:material.ok,materialized:{tags:material.item?.tags||[],climateTraits:material.item?.climateTraits||null}};
fs.writeFileSync(path.join(ROOT,'data/catalog/revalidation/date-palm-semantic-repair-2026-10-02-v1.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({validationOk:report.validationOk,readiness:report.readiness,gate:report.gate,unknownOutcomes:report.unknownOutcomes,contradictionHold:report.contradictionHold,materializationOk:report.materializationOk,reproductiveClimate:report.materialized.climateTraits?.reproductiveClimate,reproductiveBiology:report.materialized.climateTraits?.reproductiveBiology},null,2));
