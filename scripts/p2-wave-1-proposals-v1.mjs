#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { validateCatalogExpansionPacket } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { normalizeBatch3PacketForClassification, classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import { loadCatalogPlants } from '../modules/personal-domain/auto-enrichment-worker-v1.js';

const ROOT=process.cwd();
const OUT=path.join(ROOT,'data/catalog/revalidation/p2-wave-1-proposals-2026-10-01-v1');
const H='HEURISTIC_ASSERTION', S='SOURCE_SUPPORTED';
const src=(sourceId,institution,title,url,authorityTier='university_extension')=>({sourceId,institution,publisher:institution,title,url,authorityTier,verifiedAt:'2026-10-01'});
const claim=(claimId,field,value,sourceIds,shortExcerpt,evidenceClass=S,extra={})=>({claimId,field,status:'asserted',value,sourceIds,shortExcerpt,evidenceClass,...extra});
const LEGACY_SOURCE_ID='cruvit-legacy-runtime-context';
const PRESERVE_FIELDS=['humidityTolerance','needsWinterChill','survivalVsThriveNotes','groupIds','hardBlockRules','needsDrySeason','warningFlags'];
const currentCatalog=loadCatalogPlants(ROOT);
function preserveLegacyRuleContext(packet){
  const current=currentCatalog[packet.identity.canonicalSlug]?.climateTraits||{};
  let added=false;
  for(const field of PRESERVE_FIELDS){
    if(field==='needsWinterChill'&&packet.identity.canonicalSlug==='cherimoya') continue;
    if(packet.claims.some(c=>c.field===field)) continue;
    if(!Object.prototype.hasOwnProperty.call(current,field)||current[field]==null) continue;
    if(Array.isArray(current[field])&&current[field].length===0) continue;
    packet.claims.push(claim(
      `${packet.identity.canonicalSlug}-legacy-${field}`,
      field,
      structuredClone(current[field]),
      [LEGACY_SOURCE_ID],
      'Existing CRUVIT runtime rule context preserved unchanged for E2E continuity; pending independent source validation.',
      H
    ));
    added=true;
  }
  if(added&&!packet.sources.some(s=>s.sourceId===LEGACY_SOURCE_ID)){
    packet.sources.push(src(
      LEGACY_SOURCE_ID,
      'CRUVIT Legacy Catalog',
      'Existing CRUVIT runtime rule context',
      'urn:cruvit:legacy-runtime-context',
      'internal_legacy'
    ));
  }
  return packet;
}

const base=(slug,common,scientific,sources,claims,aliases=[])=>({
  expansionContractVersion:'1.2.0',
  packetId:`${slug}-p2-wave-1-proposal-v1`,
  identity:{canonicalSlug:slug,commonNameEn:common,acceptedScientificName:scientific,aliases},
  flags:{forceClimateNeedsReview:false,botanicalVerified:true,notes:'P2 full-catalog revalidation proposal. Source-backed facts plus explicitly labeled heuristic interpretations; not approved for ingest.'},
  sources,claims,
  image:{status:'IMAGE_PENDING',searchQuery:`${scientific} ${common}`},
  humanApproval:{approvedForIngest:false,approvedAt:null,note:'PROPOSAL_ONLY — Owner Review gate intentionally not satisfied.'}
});

const defs=[
base('almond','Almond','Prunus dulcis',[
  src('usu-almond-treebrowser','Utah State University Extension','Almond | TreeBrowser','https://extension.usu.edu/treebrowser/catalog/almond'),
  src('usu-almond-home','Utah State University Extension','How to Grow Almonds in Your Garden','https://extension.usu.edu/yardandgarden/research/almonds-in-the-home-garden'),
  src('ucanr-almond-ipm','University of California Statewide IPM Program','Cultural Tips for Growing Almond','https://ipm.ucanr.edu/home-and-landscape/cultural-tips-for-growing-almond/')
],[
  claim('almond-frost','frostSensitivity','medium',['usu-almond-home'],'Woody stems and branches can be damaged by extreme winter cold; spring frosts commonly damage flowers.',H),
  claim('almond-cold','coldTolerance','medium',['usu-almond-treebrowser'],'Hardiness Zone 6-7.',S,{transformation:'hardiness-zone-to-cold-traits-v1@1.1.0'}),
  claim('almond-heat','heatTolerance','medium',['usu-almond-home'],'Almonds can be grown successfully in Utah’s warmest areas and are adapted to warm climates.',H),
  claim('almond-sun','sunNeeds','full_sun',['usu-almond-home'],'Almonds need full sun.',S),
  claim('almond-water','waterNeeds','medium',['usu-almond-home'],'Mature trees benefit from less frequent, longer, deeper irrigation.',H),
  claim('almond-drainage','drainageNeeds','high',['usu-almond-treebrowser'],'Prefers a light, well-drained soil.',S),
  claim('almond-chill','needsWinterChill',true,['ucanr-almond-ipm'],'Almonds are adapted to areas with adequate chilling, about 400 to 500 hours below 45°F.',S),
  claim('almond-flower','floweringRequirements','Early spring bloom; spring frost can damage flowers and reduce nut set.',['usu-almond-home'],'Almonds flower with or before peaches; spring frosts can damage flowers.',S),
  claim('almond-fruit','fruitingRequirements','Reliable nut set requires compatible cross-pollination and avoidance of damaging spring frost.',['usu-almond-home'],'Most almonds are not self-fruitful; compatible pollen and bees are required, and frost can prevent fruiting.',S),
  claim('almond-tags','tags',['nut','tree','deciduous','orchard'],['usu-almond-treebrowser'],'Catalog tags: nut, tree, deciduous, orchard',S)
],['almond tree','Prunus dulcis']),

base('cypress','Italian Cypress','Cupressus sempervirens',[
  src('ncsu-cupressus-sempervirens','North Carolina State University Extension Gardener','Cupressus sempervirens','https://plants.ces.ncsu.edu/plants/cupressus-sempervirens/')
],[
  claim('cypress-frost','frostSensitivity','medium',['ncsu-cupressus-sempervirens'],'USDA Plant Hardiness Zones 7a-10b; whole-plant frost ordinal retained conservatively as heuristic.',H),
  claim('cypress-cold','coldTolerance','low',['ncsu-cupressus-sempervirens'],'USDA Plant Hardiness Zone: 7a through 10b.',S,{transformation:'hardiness-zone-to-cold-traits-v1@1.1.0'}),
  claim('cypress-heat','heatTolerance','high',['ncsu-cupressus-sempervirens'],'Resistance To Challenges includes Heat.',H),
  claim('cypress-humidity','humidityTolerance','high',['ncsu-cupressus-sempervirens'],'Resistance To Challenges includes Humidity.',H),
  claim('cypress-sun','sunNeeds','full_sun',['ncsu-cupressus-sempervirens'],'Light: Full sun (6 or more hours of direct sunlight a day).',S),
  claim('cypress-water','waterNeeds','low',['ncsu-cupressus-sempervirens'],'Becomes highly drought tolerant as it ages; young plants need adequate water until established.',H),
  claim('cypress-drainage','drainageNeeds','high',['ncsu-cupressus-sempervirens'],'Soil Drainage: Good Drainage; Moist; Occasionally Dry.',S),
  claim('cypress-flower','floweringRequirements','No true flowers; pollen cones appear in early spring.',['ncsu-cupressus-sempervirens'],'No flowers, pollen cones appear in the early spring.',S),
  claim('cypress-tags','tags',['ornamental','tree','evergreen','screen'],['ncsu-cupressus-sempervirens'],'Catalog tags: ornamental, tree, evergreen, screen',S)
],['Italian cypress','Mediterranean cypress']),

base('grapevine','Grapevine','Vitis vinifera',[
  src('ncsu-vitis-vinifera','North Carolina State University Extension Gardener','Vitis vinifera','https://plants.ces.ncsu.edu/plants/vitis-vinifera/')
],[
  claim('grape-frost','frostSensitivity','medium',['ncsu-vitis-vinifera'],'Vines should be protected from winter winds and frost; spring frost risk affects new shoots and production.',H),
  claim('grape-cold','coldTolerance','medium',['ncsu-vitis-vinifera'],'USDA Plant Hardiness Zone: 6a through 10b.',S,{transformation:'hardiness-zone-to-cold-traits-v1@1.1.0'}),
  claim('grape-heat','heatTolerance','medium',['ncsu-vitis-vinifera'],'Hot and humid summers negatively affect fruit production; heat fit is retained conservatively as medium.',H),
  claim('grape-humidity','humidityTolerance','low',['ncsu-vitis-vinifera'],'Hot and humid summers negatively affect fruit production and disease pressure is frequent.',H),
  claim('grape-sun','sunNeeds','full_sun',['ncsu-vitis-vinifera'],'The common grape prefers full sun.',S),
  claim('grape-water','waterNeeds','medium',['ncsu-vitis-vinifera'],'Soil Drainage includes Moist and Occasionally Dry; water need retained as moderate.',H),
  claim('grape-drainage','drainageNeeds','high',['ncsu-vitis-vinifera'],'The common grape prefers well-drained soil.',S),
  claim('grape-flower','floweringRequirements','Spring flowering performs best with full sun, air circulation, and low frost exposure.',['ncsu-vitis-vinifera'],'Numerous tiny flowers bloom in spring; the vine prefers full sun, good circulation and frost-protected sites.',H),
  claim('grape-fruit','fruitingRequirements','Reliable fruit production needs full sun, well-drained soil, support/training, and avoidance of hot-humid disease pressure.',['ncsu-vitis-vinifera'],'Hot and humid summers negatively affect fruit production; support and training should be provided.',H),
  claim('grape-tags','tags',['fruit','vine','climber','edible'],['ncsu-vitis-vinifera'],'Catalog tags: fruit, vine, climber, edible',S)
],['common grape','wine grape','Vitis vinifera']),

base('japanese-maple','Japanese Maple','Acer palmatum',[
  src('ncsu-acer-palmatum','North Carolina State University Extension Gardener','Acer palmatum','https://plants.ces.ncsu.edu/plants/acer-palmatum/')
],[
  claim('maple-frost','frostSensitivity','low',['ncsu-acer-palmatum'],'USDA Zones 5a-8b support whole-plant hardiness; young leaves are frost-sensitive, which is stage-specific and does not set the whole-plant ordinal.',H),
  claim('maple-cold','coldTolerance','medium',['ncsu-acer-palmatum'],'USDA Plant Hardiness Zone: 5a through 8b.',S,{transformation:'hardiness-zone-to-cold-traits-v1@1.1.0'}),
  claim('maple-heat','heatTolerance','low',['ncsu-acer-palmatum'],'Excess sun, drying wind and drought can cause leaf scorch; warm-site heat tolerance retained conservatively as low.',H),
  claim('maple-sun','sunNeeds','partial_shade',['ncsu-acer-palmatum'],'Plant in dappled shade.',S),
  claim('maple-water','waterNeeds','medium',['ncsu-acer-palmatum'],'Plant in evenly moist soil; young leaves are not drought tolerant.',S),
  claim('maple-drainage','drainageNeeds','high',['ncsu-acer-palmatum'],'Plant in evenly moist, well-drained soil.',S),
  claim('maple-flower','floweringRequirements','Small red-to-purple flowers appear in spring.',['ncsu-acer-palmatum'],'Flowers are small and red to purple; bloom time is spring.',S),
  claim('maple-tags','tags',['ornamental','tree','deciduous'],['ncsu-acer-palmatum'],'Catalog tags: ornamental, tree, deciduous',S)
],['Japanese maple','Acer palmatum']),

base('kiwi','Kiwi','Actinidia deliciosa',[
  src('ncsu-actinidia-deliciosa','North Carolina State University Extension Gardener','Actinidia deliciosa','https://plants.ces.ncsu.edu/plants/actinidia-deliciosa/'),
  src('osu-kiwifruit-home','Oregon State University Extension Service','Growing kiwifruit in your home garden','https://extension.oregonstate.edu/catalog/em-9322-growing-kiwifruit-your-home-garden')
],[
  claim('kiwi-frost','frostSensitivity','low',['osu-kiwifruit-home'],'Dormant fuzzy kiwifruit is cold hardy to about 0-10°F, while newly developing shoots are frost-sensitive; stage-specific injury is not promoted to whole-plant sensitivity.',H),
  claim('kiwi-cold','coldTolerance','low',['ncsu-actinidia-deliciosa'],'USDA Plant Hardiness Zone: 7a through 9b.',S,{transformation:'hardiness-zone-to-cold-traits-v1@1.1.0'}),
  claim('kiwi-heat','heatTolerance','medium',['osu-kiwifruit-home'],'Fuzzy kiwifruit is adapted to warmer regions and needs a long frost-free growing season; heat tolerance retained as medium.',H),
  claim('kiwi-sun','sunNeeds','full_sun',['osu-kiwifruit-home'],'Ideal environmental conditions include full sun exposure.',S),
  claim('kiwi-water','waterNeeds','high',['osu-kiwifruit-home'],'Fertile soil with moderate water-holding capacity is recommended; vines require consistent growing-season moisture.',H),
  claim('kiwi-drainage','drainageNeeds','high',['osu-kiwifruit-home'],'Kiwifruit vines are sensitive to poor drainage and roots can suffocate in waterlogged soil.',S),
  claim('kiwi-chill','needsWinterChill',true,['osu-kiwifruit-home'],'After the winter cold or chilling requirement is satisfied and temperatures warm, buds break; fuzzy kiwifruit has a defined winter dormancy requirement.',S),
  claim('kiwi-flower','floweringRequirements','Reliable bloom requires appropriate winter dormancy/chill and protection of early young growth from spring frost.',['osu-kiwifruit-home'],'Kiwifruit break bud early; newly developing young shoots are sensitive to frost injury.',H),
  claim('kiwi-fruit','fruitingRequirements','Fuzzy kiwifruit needs roughly 225-240 frost-free days, full sun, and compatible pollination for reliable fruit production.',['osu-kiwifruit-home'],'Actinidia deliciosa needs about 225 to 240 frost-free days; site selection favors full sun.',S),
  claim('kiwi-tags','tags',['fruit','vine','climber','deciduous','support'],['osu-kiwifruit-home'],'Catalog tags: fruit, vine, climber, deciduous, support',S)
],['fuzzy kiwifruit','Actinidia deliciosa'])
];

fs.mkdirSync(OUT,{recursive:true});
const summary=[];
for(const packet of defs.map(preserveLegacyRuleContext)){
  const fp=path.join(OUT,`${packet.identity.canonicalSlug}.proposal.json`);
  fs.writeFileSync(fp,JSON.stringify(packet,null,2)+'\n');
  const simulatedApproval={...packet,humanApproval:{approvedForIngest:true,approvedAt:'SIMULATION_ONLY',note:'Validation simulation only; does not represent owner approval.'}};
  const validation=validateCatalogExpansionPacket(simulatedApproval);
  const plant=normalizeBatch3PacketForClassification(packet);
  const readiness=classifyPlantDataReadiness(plant);
  summary.push({slug:packet.identity.canonicalSlug,validationWithoutOwnerGate:validation.ok,validationErrors:validation.errors,readiness:readiness.readinessShort,gate:readiness.gate,reasons:readiness.reasons,unknownOutcomes:readiness.unknownOutcomes});
}
const out={contract:'cruvit-p2-wave-1-proposal-review-v1',createdAt:'2026-10-01',proposalOnly:true,ownerApprovalRequired:true,count:summary.length,rows:summary};
fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
