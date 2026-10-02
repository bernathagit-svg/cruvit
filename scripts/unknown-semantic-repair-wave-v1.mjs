#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { validateCatalogExpansionPacket, materializePlantCatalogItemFromPacket } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { normalizeBatch3PacketForClassification, classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import { evaluatePacketContradictionDry } from '../modules/personal-domain/catalog-contradiction-gate-v1.js';
const ROOT=process.cwd(),S='SOURCE_SUPPORTED',H='HEURISTIC_ASSERTION';
const src=(sourceId,institution,title,url)=>({sourceId,institution,publisher:institution,title,url,authorityTier:'university_extension',verifiedAt:'2026-10-02'});
const claim=(claimId,field,value,sourceIds,shortExcerpt,evidenceClass=S,extra={})=>({claimId,field,status:'asserted',value,sourceIds,shortExcerpt,evidenceClass,...extra});
const proposals=[];{
 const p={expansionContractVersion:'1.2.0',packetId:'monstera-semantic-audit-proposal-v1',
  identity:{canonicalSlug:'monstera',commonNameEn:'Monstera',acceptedScientificName:'Monstera deliciosa',aliases:['monstera','Swiss cheese plant','ceriman','Mexican breadfruit','Monstera deliciosa']},
  flags:{forceClimateNeedsReview:false,botanicalVerified:true,notes:'Semantic audit repair proposal: edible-ripe-only fruit purpose and calcium-oxalate safety modeled explicitly; no silent inference.'},
  sources:[
   src('ncsu-monstera-deliciosa','North Carolina State University Extension Gardener','Monstera deliciosa','https://plants.ces.ncsu.edu/plants/monstera-deliciosa/'),
   src('uf-ifas-monstera-fruit','University of Florida IFAS Extension','Monstera Growing in the Florida Home Landscape','https://ask.ifas.ufl.edu/publication/hs311'),
   src('uf-ifas-poisonous-houseplants','University of Florida IFAS Extension','Common Poisonous Houseplant Species in Florida','https://edis.ifas.ufl.edu/publication/EP639')
  ],claims:[]};
 p.claims.push(
  claim('monstera-frost','frostSensitivity','high',['ncsu-monstera-deliciosa'],'Warm 60–85°F preference and USDA zones 10a–12b support high frost sensitivity as an explicit heuristic.',H),
  claim('monstera-cold','coldTolerance','very_low',['ncsu-monstera-deliciosa'],'NCSU lists USDA zones 10a–12b.','SOURCE_SUPPORTED',{transformation:'hardiness-zone-to-cold-traits-v1@1.1.0'}),
  claim('monstera-heat','heatTolerance','medium',['ncsu-monstera-deliciosa','uf-ifas-monstera-fruit'],'Warm tropical growth is preferred, but exposed full sun can scorch foliage; retained as medium heat tolerance.',H),
  claim('monstera-humidity','humidityTolerance','high',['ncsu-monstera-deliciosa'],'NCSU states Monstera deliciosa prefers high humidity.',S),
  claim('monstera-water','waterNeeds','medium',['ncsu-monstera-deliciosa','uf-ifas-monstera-fruit'],'Water thoroughly then allow partial drying; periodic irrigation improves growth and fruit.',H),
  claim('monstera-sun','sunNeeds','partial_shade',['ncsu-monstera-deliciosa'],'NCSU lists dappled sunlight and partial shade; fruit production may use more sun.',S),
  claim('monstera-drainage','drainageNeeds','high',['ncsu-monstera-deliciosa','uf-ifas-monstera-fruit'],'NCSU and UF/IFAS require good drainage and warn against flooded/excessively wet soil.',S)
 ); p.claims.push(
  claim('monstera-flower','floweringRequirements','Mature outdoor vines in warm tropical or warm-subtropical conditions can produce a spadix/spathe; flowering is rare indoors.',['ncsu-monstera-deliciosa','uf-ifas-monstera-fruit'],'NCSU and UF/IFAS document inflorescences and note flowering is rare in interior cultivation.',S),
  claim('monstera-fruit','fruitingRequirements','Fruit production is an outdoor warm-climate outcome; fruit takes about 12–14 months to mature and only fully ripe pulp should be eaten.',['uf-ifas-monstera-fruit','uf-ifas-poisonous-houseplants'],'UF/IFAS documents fruit maturation, edible ripe pulp, and calcium-oxalate hazard in unripe fruit.',S),
  claim('monstera-tags','tags',['fruit','edible','houseplant','vine','poisonous','tropical'],['ncsu-monstera-deliciosa','uf-ifas-monstera-fruit'],'NCSU classifies Monstera deliciosa as edible, poisonous, houseplant and vine; UF/IFAS treats it as a tropical/subtropical fruit crop.',S),
  claim('monstera-support','hardBlockRules',['needs-support'],['ncsu-monstera-deliciosa'],'NCSU states sturdy support is necessary to prevent stems from breaking.',S),
  claim('monstera-warnings','warningFlags',['toxic_pets','toxic_humans','ripe_fruit_only','calcium_oxalate'],['uf-ifas-poisonous-houseplants','uf-ifas-monstera-fruit'],'All plant parts and unripe fruit contain irritating calcium oxalate; only ripe fruit pulp is edible.',S),
  claim('monstera-repro-self','reproductive.self_fertile',true,['uf-ifas-poisonous-houseplants'],'UF/IFAS states the flowers are self-pollinating.',S),
  claim('monstera-groups','groupIds',['tropical-shade-houseplant','support-dependent-plant','pet-child-caution','tropical-fruit'],['ncsu-monstera-deliciosa','uf-ifas-monstera-fruit'],'Structural groups reflect documented houseplant, climbing support, toxicity, and fruit-crop roles.',H),
  claim('monstera-survival','survivalVsThriveNotes','Indoor foliage survival is much broader than reliable fruit production; fruiting needs mature outdoor growth in a warm climate and ripe-fruit safety handling.',['ncsu-monstera-deliciosa','uf-ifas-monstera-fruit'], 'Survival/ornamental use is broader than fruiting outcome.',H)
 );
 p.image={status:'IMAGE_PENDING',searchQuery:'Monstera deliciosa'};p.humanApproval={approvedForIngest:false,approvedAt:null,note:'PROPOSAL_ONLY — semantic audit repair requires explicit Owner PASS before canonical ingest.'};proposals.push(p);
}{
 const p={expansionContractVersion:'1.2.0',packetId:'cycas-semantic-audit-proposal-v1',
  identity:{canonicalSlug:'cycas',commonNameEn:'Sago Palm / Cycas',acceptedScientificName:'Cycas revoluta',aliases:['sago palm','king sago palm','cycas','Cycas revoluta']},
  flags:{forceClimateNeedsReview:false,botanicalVerified:true,notes:'Semantic audit repair proposal: gymnosperm non-flowering semantics, dioecy and seed toxicity modeled explicitly.'},
  sources:[
   src('ncsu-cycas-revoluta','North Carolina State University Extension Gardener','Sago Palm - Cycas revoluta','https://plants.ces.ncsu.edu/plants/cycas-revoluta/common-name/sago-palm/'),
   src('uf-ifas-cycas','University of Florida IFAS Extension','Cycas revoluta, Sago Palm','https://edis.ifas.ufl.edu/publication/FR316'),
   src('uf-ifas-sago-pests','University of Florida IFAS Extension','Key Plant, Key Pests: Sago Palm','https://edis.ifas.ufl.edu/publication/EP608')
  ],claims:[]};
 p.claims.push(
  claim('cycas-frost','frostSensitivity','high',['ncsu-cycas-revoluta','uf-ifas-sago-pests'],'Frost damages foliage and UF/IFAS states the plant is not freeze tolerant.',S),
  claim('cycas-cold','coldTolerance','low',['uf-ifas-sago-pests','ncsu-cycas-revoluta'],'UF/IFAS lists USDA zones 8–11; NCSU notes plants do not survive below about 15°F.','SOURCE_SUPPORTED',{transformation:'hardiness-zone-to-cold-traits-v1@1.1.0'}),
  claim('cycas-heat','heatTolerance','medium',['uf-ifas-sago-pests'],'Grows in full sun or partial shade in subtropical climates; no extreme-heat limit is asserted.',H),
  claim('cycas-humidity','humidityTolerance','medium',['uf-ifas-sago-pests'],'Indoor/outdoor subtropical adaptation supports a medium humidity heuristic; no hard humidity threshold is sourced.',H),
  claim('cycas-water','waterNeeds','low',['ncsu-cycas-revoluta','uf-ifas-sago-pests'],'Established plants are drought resistant and intolerant of overwatering.',H),
  claim('cycas-sun','sunNeeds','partial_shade',['ncsu-cycas-revoluta','uf-ifas-sago-pests'],'Sources support full sun to partial shade; partial shade is retained as the conservative general placement.',S),
  claim('cycas-drainage','drainageNeeds','high',['ncsu-cycas-revoluta'],'NCSU states soil should be well-drained and poor drainage/overwatering can cause root rot.',S)
 ); p.claims.push(
  claim('cycas-flower','floweringRequirements','Not applicable: Cycas revoluta is a gymnosperm and does not produce flowers; male and female plants produce separate reproductive cones.',['ncsu-cycas-revoluta','uf-ifas-cycas'],'NCSU explicitly states the plant does not flower and produces cones with exposed seeds.',S),
  claim('cycas-fruit','fruitingRequirements','Not applicable: Cycas revoluta does not produce botanical fruit; pollinated female plants produce toxic seeds that mature in a seedhead.',['ncsu-cycas-revoluta'],'NCSU documents separate male/female plants, pollination, seedhead production, and severe seed toxicity.',S),
  claim('cycas-tags','tags',['ornamental','cycad','gymnosperm','poisonous','houseplant'],['ncsu-cycas-revoluta','uf-ifas-cycas'],'Sources identify a poisonous ornamental cycad/gymnosperm commonly grown indoors and outdoors.',S),
  claim('cycas-warnings','warningFlags',['toxic_pets','toxic_humans','toxic_seeds','spiny'],['ncsu-cycas-revoluta','uf-ifas-cycas'],'All parts contain cycasin; seeds have the highest toxin concentration; foliage is spiny.',S),
  claim('cycas-repro-dio','reproductive.dioecious',true,['ncsu-cycas-revoluta'],'NCSU states separate male and female plants are required to produce seeds.',S),
  claim('cycas-repro-poll','reproductive.requires_pollinator',true,['ncsu-cycas-revoluta'],'Seed production requires pollination between male and female plants; pollination occurs by insects or wind.',S),
  claim('cycas-repro-sex','reproductive.sex_requirement','male_and_female_plants',['ncsu-cycas-revoluta'],'Male and female plants are separate and both are needed for seed production.',S),
  claim('cycas-groups','groupIds',['warm-climate-palm','pet-child-caution'],['ncsu-cycas-revoluta','uf-ifas-sago-pests'],'Legacy structural groups retained with source-backed warm-climate and toxicity context.',H),
  claim('cycas-survival','survivalVsThriveNotes','This slow toxic ornamental tolerates drought once established but is not freeze tolerant and requires good drainage.',['ncsu-cycas-revoluta','uf-ifas-sago-pests'],'Source-backed survival versus care summary.',H)
 );
 p.image={status:'IMAGE_PENDING',searchQuery:'Cycas revoluta'};p.humanApproval={approvedForIngest:false,approvedAt:null,note:'PROPOSAL_ONLY — semantic audit repair requires explicit Owner PASS before canonical ingest.'};proposals.push(p);
}const outDir=path.join(ROOT,'data/catalog/revalidation/semantic-audit-proposals-v1');fs.mkdirSync(outDir,{recursive:true});
const rows=[];for(const p of proposals){
 const sim={...p,humanApproval:{approvedForIngest:true,approvedAt:'SIMULATION_ONLY',note:'QA simulation only'}};
 const v=validateCatalogExpansionPacket(sim);if(!v.ok)throw new Error(p.packetId+': '+v.errors.join('; '));
 const ready=classifyPlantDataReadiness(normalizeBatch3PacketForClassification(p)), conflict=evaluatePacketContradictionDry(p), m=materializePlantCatalogItemFromPacket(sim);
 if(ready.readinessShort!=='A'||ready.gate!=='PASS'||conflict.needsHold||!m.ok)throw new Error(p.identity.canonicalSlug+': proposal QA failed');
 fs.writeFileSync(path.join(outDir,p.identity.canonicalSlug+'.proposal.json'),JSON.stringify(p,null,2)+'\n');
 rows.push({slug:p.identity.canonicalSlug,readiness:ready.readinessShort,gate:ready.gate,contradictionHold:conflict.needsHold,materializationOk:m.ok,tags:m.item.tags,reproductiveBiology:m.item.climateTraits.reproductiveBiology||null,reproductiveClimate:m.item.climateTraits.reproductiveClimate||null});
}
const report={contract:'cruvit-unknown-semantic-repair-wave-v1',createdAt:'2026-10-02',ownerApproved:false,rows};
fs.writeFileSync(path.join(ROOT,'data/catalog/revalidation/unknown-semantic-repair-wave-2026-10-02-v1.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));