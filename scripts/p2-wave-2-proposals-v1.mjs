#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { validateCatalogExpansionPacket } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { normalizeBatch3PacketForClassification, classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import { loadCatalogPlants } from '../modules/personal-domain/auto-enrichment-worker-v1.js';
const ROOT=process.cwd(),OUT=path.join(ROOT,'data/catalog/revalidation/p2-wave-2-proposals-2026-10-01-v1');
const H='HEURISTIC_ASSERTION',S='SOURCE_SUPPORTED';
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

const base=(slug,common,scientific,sources,claims,aliases=[],notes='')=>({expansionContractVersion:'1.2.0',packetId:`${slug}-p2-wave-2-proposal-v1`,identity:{canonicalSlug:slug,commonNameEn:common,acceptedScientificName:scientific,aliases},flags:{forceClimateNeedsReview:false,botanicalVerified:true,notes:`P2 proposal only. ${notes}`},sources,claims,image:{status:'IMAGE_PENDING',searchQuery:`${scientific} ${common}`},humanApproval:{approvedForIngest:false,approvedAt:null,note:'PROPOSAL_ONLY — Owner Review gate intentionally not satisfied.'}});
const defs=[];

defs.push(base('cherimoya','Cherimoya','Annona cherimola',[
 src('ucanr-cherimoya','University of California Cooperative Extension','Cherimoya | Topics in Subtropics','https://ucanr.edu/blog/topics-subtropics/article/cherimoya')
],[
 claim('cherimoya-frost','frostSensitivity','high',['ucanr-cherimoya'],'Requires a relatively frost-free environment; mature hardy varieties tolerate only short periods around 26°F.',H),
 claim('cherimoya-cold','coldTolerance','low',['ucanr-cherimoya'],'Mature trees of hardy varieties tolerate short periods around 26°F; prolonged hard freeze is unsuitable.',S,{transformation:'bounded-cold-statement-to-ordinal: short ~26F tolerance -> low'}),
 claim('cherimoya-heat','heatTolerance','medium',['ucanr-cherimoya'],'Sunny warmth is needed for flavor, but inland trees need protection from extremely hot temperatures and dry winds.',H),
 claim('cherimoya-humidity','humidityTolerance','low',['ucanr-cherimoya'],'Cherimoya will not tolerate prolonged high humidity.',S),
 claim('cherimoya-sun','sunNeeds','full_sun',['ucanr-cherimoya'],'A sunny location is needed because sufficient heat is required for good flavor.',S),
 claim('cherimoya-water','waterNeeds','medium',['ucanr-cherimoya'],'Good watering practices are important; soil should not become excessively dry or wet.',H),
 claim('cherimoya-drainage','drainageNeeds','high',['ucanr-cherimoya'],'The most critical soil requirement is good drainage.',S),
 claim('cherimoya-flower','floweringRequirements','Mild relatively frost-free conditions support flowering; hand pollination is commonly used to improve set.',['ucanr-cherimoya'],'The crop is normally hand pollinated; cherimoya requires a relatively frost-free environment.',S),
 claim('cherimoya-fruit','fruitingRequirements','Sunny mild conditions, good drainage, and reliable pollination are needed for fruit production.',['ucanr-cherimoya'],'Sunny warmth develops flavor; good drainage is critical and the crop is commonly hand pollinated.',S),
 claim('cherimoya-tags','tags',['subtropical','fruit','tree','hand-pollination'],['ucanr-cherimoya'],'Catalog tags: subtropical, fruit, tree, hand-pollination',H)
],['custard apple','Annona cherimola']));

defs.push(base('coconut','Coconut Palm','Cocos nucifera',[
 src('rhs-cocos-nucifera','Royal Horticultural Society','Cocos nucifera (F) | coconut','https://www.rhs.org.uk/plants/4061/cocos-nucifera-f/details','horticultural_society'),
 src('uf-ifas-coconut-cold','University of Florida IFAS Extension','Cold Damage on Palms','https://edis.ifas.ufl.edu/publication/MG318'),
 src('uh-ctahr-coconut','University of Hawaii CTAHR','Coconut Palms from Seed','https://www.ctahr.hawaii.edu/oc/freepubs/pdf/OF-25.pdf')
],[
 claim('coconut-frost','frostSensitivity','very_high',['uf-ifas-coconut-cold'],'Coconut palms show chilling injury and trunk damage from prolonged chilling or freezing temperatures.',H),
 claim('coconut-cold','coldTolerance','very_low',['rhs-cocos-nucifera'],'RHS hardiness H1A: under glass all year, above 15°C.',S,{transformation:'hardiness-zone-to-cold-traits-v1@1.1.0'}),
 claim('coconut-heat','heatTolerance','high',['uh-ctahr-coconut'],'Young coconuts should be kept warm, preferably never below 70°F and often above 80°F.',H),
 claim('coconut-humidity','humidityTolerance','high',['rhs-cocos-nucifera'],'Cultivation recommends warm conditions with moderate humidity.',H),
 claim('coconut-sun','sunNeeds','full_sun',['rhs-cocos-nucifera'],'Position: Full sun.',S),
 claim('coconut-water','waterNeeds','medium',['rhs-cocos-nucifera'],'Water moderately during the growing season and sparingly in winter.',S),
 claim('coconut-drainage','drainageNeeds','high',['rhs-cocos-nucifera'],'Moist but well-drained growing conditions; loam/sand compost with sharp sand.',S),
 claim('coconut-flower','floweringRequirements','Flowering requires sustained warm tropical growth conditions.',['uh-ctahr-coconut'],'Flower clusters begin forming after trunk development under warm coconut-growing conditions.',H),
 claim('coconut-fruit','fruitingRequirements','Nut production requires sustained tropical warmth and avoidance of chilling/freezing injury.',['uh-ctahr-coconut','uf-ifas-coconut-cold'],'Healthy trees produce nuts under warm tropical culture; cold injury occurs in Cocos nucifera during chilling/freezing exposure.',H),
 claim('coconut-tags','tags',['palm','tropical','fruit','coastal'],['rhs-cocos-nucifera'],'Catalog tags: palm, tropical, fruit, coastal',H)
],['coconut','coconut palm']));

defs.push(base('guava','Guava Tree','Psidium guajava',[
 src('rhs-psidium-guajava','Royal Horticultural Society','Psidium guajava (F) | common guava','https://www.rhs.org.uk/plants/21375/psidium-guajava-f/details','horticultural_society'),
 src('uf-ifas-guava','University of Florida IFAS Extension','Guava Growing in the Florida Home Landscape','https://edis.ifas.ufl.edu/publication/MG045')
],[
 claim('guava-frost','frostSensitivity','high',['uf-ifas-guava'],'Young guava may be killed at 27–28°F; lower temperatures can damage or kill stems, limbs and trunk.',S),
 claim('guava-cold','coldTolerance','very_low',['rhs-psidium-guajava'],'RHS hardiness H2: tolerant of low temperatures but not surviving being frozen.',S,{transformation:'hardiness-zone-to-cold-traits-v1@1.1.0'}),
 claim('guava-heat','heatTolerance','high',['uf-ifas-guava'],'Ideal growth and production temperatures are 73–82°F; guava is adapted to warm subtropical to tropical climates.',H),
 claim('guava-humidity','humidityTolerance','medium',['uf-ifas-guava'],'Warm subtropical/tropical adaptation supports a moderate humidity stance without inventing a numeric threshold.',H),
 claim('guava-sun','sunNeeds','full_sun',['rhs-psidium-guajava'],'Position: Full sun.',S),
 claim('guava-water','waterNeeds','medium',['rhs-psidium-guajava'],'Moist but well-drained growing conditions.',S),
 claim('guava-drainage','drainageNeeds','high',['rhs-psidium-guajava'],'Moist but well-drained soil is specified.',S),
 claim('guava-flower','floweringRequirements','Warm, bright conditions and low freeze risk support flowering.',['rhs-psidium-guajava','uf-ifas-guava'],'Flowers may be produced year-round on new shoots; cold and drought slow or stop growth.',H),
 claim('guava-fruit','fruitingRequirements','Reliable fruit production needs warm subtropical/tropical conditions and protection from damaging cold.',['uf-ifas-guava'],'Guava is adapted to warm subtropical/tropical climates; damaging cold can kill productive wood.',H),
 claim('guava-tags','tags',['fruit','tree','subtropical','edible'],['rhs-psidium-guajava'],'Catalog tags: fruit, tree, subtropical, edible',H)
],['common guava','Psidium guajava']));

defs.push(base('lychee','Lychee Tree','Litchi chinensis',[
 src('uf-ifas-lychee-tree','University of Florida IFAS Extension','Litchi chinensis: Lychee','https://edis.ifas.ufl.edu/publication/ST364'),
 src('uf-ifas-lychee-home','University of Florida IFAS Extension','Lychee Growing in the Florida Home Landscape','https://edis.ifas.ufl.edu/publication/MG051')
],[
 claim('lychee-frost','frostSensitivity','high',['uf-ifas-lychee-home'],'Young lychee trees are damaged by temperatures around 28–32°F; large trees can sustain extensive damage around 24–25°F.',H),
 claim('lychee-cold','coldTolerance','very_low',['uf-ifas-lychee-tree'],'USDA hardiness zones 10 through 11.',S,{transformation:'hardiness-zone-to-cold-traits-v1@1.1.0'}),
 claim('lychee-heat','heatTolerance','medium',['uf-ifas-lychee-home'],'Warm-to-cool subtropical climate with hot humid summers supports growth, but flowering needs a cooler seasonal signal.',H),
 claim('lychee-humidity','humidityTolerance','high',['uf-ifas-lychee-home'],'Lychee is adapted to humid subtropical conditions and hot humid summer fruit growth.',H),
 claim('lychee-sun','sunNeeds','full_sun',['uf-ifas-lychee-tree'],'Easily grown in full sun.',S),
 claim('lychee-water','waterNeeds','high',['uf-ifas-lychee-tree'],'Plants should receive regular watering.',S),
 claim('lychee-drainage','drainageNeeds','high',['uf-ifas-lychee-tree'],'Deep, fertile, well-drained soil is recommended.',S),
 claim('lychee-flower','floweringRequirements','Reliable bloom benefits from a cooler, drier nonfreezing winter period.',['uf-ifas-lychee-home'],'Lychee performs in subtropical climates with a dry, cold, nonfreezing winter period.',S),
 claim('lychee-fruit','fruitingRequirements','Fruit production needs a cooler seasonal flowering signal followed by warm humid growth and consistent moisture.',['uf-ifas-lychee-home'],'Dry cool winter conditions support flowering, followed by hot humid summer fruit development.',H),
 claim('lychee-tags','tags',['fruit','tree','subtropical','edible'],['uf-ifas-lychee-tree'],'Catalog tags: fruit, tree, subtropical, edible',H)
],['litchi','Litchi chinensis']));

defs.push(base('mandarin','Mandarin / Clementine Tree','Citrus reticulata',[
 src('rhs-mandarin-group','Royal Horticultural Society','Citrus reticulata Mandarin Group (F)','https://www.rhs.org.uk/plants/105707/citrus-reticulata-mandarin-group-f/details','horticultural_society'),
 src('uf-ifas-cold-hardy-citrus','University of Florida IFAS Extension','Cold Hardy Citrus','https://ufdcimages.uflib.ufl.edu/IR/00/00/46/24/00001/CH02900.PDF')
],[
 claim('mandarin-frost','frostSensitivity','high',['uf-ifas-cold-hardy-citrus'],'Cold hardiness varies widely among mandarins; cold-hardy selections still require cultivar/rootstock-specific interpretation.',H),
 claim('mandarin-cold','coldTolerance','very_low',['rhs-mandarin-group'],'RHS Mandarin Group hardiness H2: low-temperature tolerant but not surviving freezing.',S,{transformation:'hardiness-zone-to-cold-traits-v1@1.1.0'}),
 claim('mandarin-heat','heatTolerance','medium',['rhs-mandarin-group'],'Best grown in a cool or temperate conservatory/greenhouse and moved outdoors in summer; heat tolerance retained as medium.',H),
 claim('mandarin-humidity','humidityTolerance','medium',['rhs-mandarin-group'],'Moist but well-drained culture supports a moderate humidity stance.',H),
 claim('mandarin-sun','sunNeeds','full_sun',['rhs-mandarin-group'],'Cultivation calls for full light with shade from hot sun under glass.',H),
 claim('mandarin-water','waterNeeds','medium',['rhs-mandarin-group'],'Water freely during spring/summer growth and sparingly in winter.',S),
 claim('mandarin-drainage','drainageNeeds','high',['rhs-mandarin-group'],'Loam-based compost with grit; moist but well-drained growing conditions.',S),
 claim('mandarin-flower','floweringRequirements','Spring flowering needs bright light and protection from damaging frost.',['rhs-mandarin-group'],'Fragrant white flowers are borne in spring; cultivation is sheltered and nonfreezing.',H),
 claim('mandarin-fruit','fruitingRequirements','Reliable fruiting is cultivar-dependent and needs adequate warmth, light, moisture, and low freeze risk.',['rhs-mandarin-group','uf-ifas-cold-hardy-citrus'],'Mandarins differ in cold hardiness; fruit follows spring flowering under protected cultivation.',H),
 claim('mandarin-tags','tags',['fruit','citrus','tree','evergreen','edible'],['rhs-mandarin-group'],'Catalog tags: fruit, citrus, tree, evergreen, edible',H)
],['mandarin','clementine','Citrus reticulata'],
'Cold tolerance is group-level and cultivar/rootstock dependent; Satsuma-specific hardiness is not generalized to all mandarins.'));

defs.push(base('passionfruit','Passionfruit Vine','Passiflora edulis',[
 src('rhs-passiflora-edulis','Royal Horticultural Society','Passiflora edulis (F) | purple granadilla','https://www.rhs.org.uk/plants/69583/passiflora-edulis-f/details','horticultural_society'),
 src('uf-ifas-passionfruit','University of Florida IFAS Extension','The Passion Fruit in Florida','https://edis.ifas.ufl.edu/publication/HS1406')
],[
 claim('passion-frost','frostSensitivity','very_high',['uf-ifas-passionfruit'],'Young plants should be planted after frost risk; cold below about 50°F is a management concern and freezing exposure requires protection.',H),
 claim('passion-cold','coldTolerance','very_low',['rhs-passiflora-edulis'],'RHS hardiness H1A for Passiflora edulis.',S,{transformation:'hardiness-zone-to-cold-traits-v1@1.1.0'}),
 claim('passion-heat','heatTolerance','medium',['uf-ifas-passionfruit'],'Best growth temperatures are warm; planting guidance avoids temperatures above about 90°F during establishment.',H),
 claim('passion-humidity','humidityTolerance','medium',['uf-ifas-passionfruit'],'Florida culture supports moderate humid-condition tolerance without a numeric humidity threshold.',H),
 claim('passion-sun','sunNeeds','full_sun',['uf-ifas-passionfruit'],'Passion fruit grows best in full sun or where vines can reach full sun after climbing.',S),
 claim('passion-water','waterNeeds','medium',['uf-ifas-passionfruit'],'Irrigation is needed during dry periods; moderate drought tolerance is reported in landscape guidance.',H),
 claim('passion-drainage','drainageNeeds','high',['uf-ifas-passionfruit'],'Passion fruit vines should be planted in well-drained soils.',S),
 claim('passion-flower','floweringRequirements','Warm bright conditions, full sun, support, and protection from cold favor flowering.',['uf-ifas-passionfruit'],'Full sun is recommended; cold/frost exposure is avoided for young plants.',H),
 claim('passion-fruit','fruitingRequirements','Reliable fruiting needs warmth, full sun, regular water, trellis support, and frost protection.',['uf-ifas-passionfruit'],'Full sun, well-drained soil and irrigation are recommended; fruit ripens about 70–80 days after pollination.',S),
 claim('passion-tags','tags',['fruit','vine','climber','edible','support'],['rhs-passiflora-edulis'],'Catalog tags: fruit, vine, climber, edible, support',H)
],['purple granadilla','passion fruit','Passiflora edulis']));

defs.push(base('pistachio','Pistachio','Pistacia vera',[
 src('ucanr-pistachio-calendar','University of California Cooperative Extension','Pistachio: Calendar of Operations for Home Gardeners','https://ucanr.edu/sites/default/files/2010-06/18997.pdf'),
 src('ucanr-pistachio-climate','University of California Cooperative Extension','California Pistachio Research: Climate & Cultivars','https://ucanr.edu/site/california-pistachio-research/climate-cultivars'),
 src('ucanr-pistachio-dormancy-cold','University of California Cooperative Extension','Pistachio Notes: winter dormancy and cold survival','https://ucanr.edu/sites/default/files/2023-02/Pistachio_Notes_Newsletter96633.pdf'),
 src('usu-pistachio-treebrowser','Utah State University Extension','Pistachio | TreeBrowser','https://extension.usu.edu/treebrowser/catalog/pistachio')
],[
 claim('pistachio-frost','frostSensitivity','medium',['ucanr-pistachio-calendar'],'Trees tolerate short winter cold near 27°F, while leaves and flowers are injured by early fall or spring frost; whole-plant sensitivity retained as medium.',H),
 claim('pistachio-cold','coldTolerance','high',['ucanr-pistachio-dormancy-cold','usu-pistachio-treebrowser'],'UC notes that increasingly dormant Pistacia vera seedlings can survive about 10°F and colder; USU lists Pistacia vera in USDA zones 4-9 and reports established fruiting trees in Logan, Utah.',S,{transformation:'dormant-survival-plus-hardiness-zone-to-cold-traits-v1@1.1.0'}),
 claim('pistachio-heat','heatTolerance','high',['ucanr-pistachio-calendar'],'Warm, dry weather from July to early September is important for proper kernel maturation.',S),
 claim('pistachio-humidity','humidityTolerance','low',['ucanr-pistachio-calendar'],'Heavy rainfall during pollination reduces fruit set and promotes wet-weather diseases.',H),
 claim('pistachio-sun','sunNeeds','full_sun',['ucanr-pistachio-calendar'],'Pistachio orchard culture is a full-sun nut-tree system; hot dry ripening weather is required.',H),
 claim('pistachio-water','waterNeeds','medium',['ucanr-pistachio-calendar'],'Established trees tolerate drought, but quality kernel production requires substantial summer irrigation.',H),
 claim('pistachio-drainage','drainageNeeds','high',['ucanr-pistachio-calendar'],'Deep, light- to medium-textured, well-drained soils are preferred; wet soil promotes root/crown disease.',S),
 claim('pistachio-chill','needsWinterChill',true,['ucanr-pistachio-calendar'],'About 850 hours below 45°F are required for pistachio flowering and production.',S),
 claim('pistachio-flower','floweringRequirements','High winter chilling is required; male and female trees are needed for pollination.',['ucanr-pistachio-calendar'],'About 850 hours below 45°F are required; male and female flowers occur on separate trees.',S),
 claim('pistachio-fruit','fruitingRequirements','Nut production needs winter chill, pollination, and warm dry summer ripening conditions.',['ucanr-pistachio-calendar'],'High chilling plus warm dry July–early September weather are important for kernel maturation.',S),
 claim('pistachio-tags','tags',['nut','tree','deciduous','orchard'],['ucanr-pistachio-climate'],'Catalog tags: nut, tree, deciduous, orchard',H)
],['Pistacia vera'],
'Whole-plant coldTolerance uses dormant survival and hardiness-zone evidence; fall/spring frost injury remains stage-specific frost/reproductive evidence.'));

defs.push(base('plumeria','Plumeria','Plumeria rubra',[
 src('uf-ifas-plumeria','University of Florida IFAS Extension','Plumeria rubra -- Frangipani','https://hort.ifas.ufl.edu/trees/PLURUBA.pdf'),
 src('rhs-plumeria-rubra','Royal Horticultural Society','Plumeria rubra | frangipani','https://www.rhs.org.uk/plants/94126/plumeria-rubra/details','horticultural_society')
],[
 claim('plumeria-frost','frostSensitivity','very_high',['uf-ifas-plumeria'],'Frangipani is very susceptible to freezing temperatures and should be protected from frost.',S),
 claim('plumeria-cold','coldTolerance','very_low',['rhs-plumeria-rubra'],'RHS hardiness H1B for Plumeria rubra.',S,{transformation:'hardiness-zone-to-cold-traits-v1@1.1.0'}),
 claim('plumeria-heat','heatTolerance','high',['uf-ifas-plumeria'],'Fast growth in full sun and tropical/subtropical landscape use support high heat tolerance.',H),
 claim('plumeria-humidity','humidityTolerance','medium',['uf-ifas-plumeria'],'No strong humidity threshold is sourced; retained as a moderate heuristic.',H),
 claim('plumeria-sun','sunNeeds','full_sun',['uf-ifas-plumeria'],'Plants grow quickly in full sun.',S),
 claim('plumeria-water','waterNeeds','low',['uf-ifas-plumeria'],'Frangipani is fairly drought tolerant.',H),
 claim('plumeria-drainage','drainageNeeds','high',['uf-ifas-plumeria'],'Plants grow on a variety of well-drained soils.',S),
 claim('plumeria-flower','floweringRequirements','Warm frost-free conditions with full sun support flowering.',['uf-ifas-plumeria'],'Plumeria flowers from warm-season branch tips and is very susceptible to freezing temperatures.',H),
 claim('plumeria-tags','tags',['ornamental','tropical','fragrant','deciduous'],['rhs-plumeria-rubra'],'Catalog tags: ornamental, tropical, fragrant, deciduous',S)
],['frangipani','Plumeria rubra']));

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
const out={contract:'cruvit-p2-wave-2-proposal-review-v1',createdAt:'2026-10-01',proposalOnly:true,ownerApprovalRequired:true,count:summary.length,rows:summary};
fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
