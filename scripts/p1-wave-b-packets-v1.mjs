#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const ROOT=process.cwd();
const OUT=path.join(ROOT,'data/catalog-expansion/batches/p1-review-closure-wave-b-v1/packets');
const verifiedAt='2026-10-01';
const src=(sourceId,institution,publisher,title,url,authorityTier)=>({sourceId,institution,publisher,title,url,authorityTier,verifiedAt});
const UF=(id,title,url)=>src(id,'University of Florida IFAS Extension','UF/IFAS Extension',title,url,'university_extension');
const UCCE=(id,title,url)=>src(id,'University of California Cooperative Extension','UC Agriculture and Natural Resources',title,url,'university_extension');
const UH=(id,title,url)=>src(id,'University of Hawaiʻi at Hilo','Pacific Agriculture and Natural Resources',title,url,'peer_reviewed_publication');
const KEW=(id,title,url)=>src(id,'Royal Botanic Gardens, Kew','Plants of the World Online',title,url,'botanical_institution');
const D=[
{
 slug:'dragon-fruit',common:'Dragon Fruit',scientific:'Selenicereus undatus',
 aliases:['dragon fruit','dragonfruit','pitaya','Selenicereus undatus','Hylocereus undatus'],
 sources:[
  KEW('kew-selenicereus-undatus','Selenicereus undatus - accepted name; Hylocereus undatus synonym','https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:125404-2'),
  UF('ufifas-pitaya-hs303','Pitaya (Dragonfruit) Growing in the Florida Home Landscape','https://edis.ifas.ufl.edu/publication/HS303/pdf')
 ],
 identitySource:'kew-selenicereus-undatus',climateSource:'ufifas-pitaya-hs303',
 frost:'high',cold:'low',heat:'high',humidity:'medium',water:'low',sun:'full_sun_to_part_shade',drainage:'high',
 coldText:'Pitayas grow in tropical/subtropical climates mostly free of frost; long exposure below freezing (31°F/-2°C) can damage plants, though light freeze injury may recover.',
 condition:'Best growth about 65-77°F; full sun crop with some shade tolerance; excessive soil moisture causes disease and well-drained media are used.',
 flower:'Large nocturnal hermaphroditic flowers; some cultivars are self-incompatible. A dry winter/early-spring period supports abundant bloom induction.',
 fruit:'Cross-pollination among different genetic types improves fruit set and size; irrigation is recommended from flowering through harvest.',
 tags:['fruit','cactus','climber','support-dependent']
},
{
 slug:'jackfruit',common:'Jackfruit',scientific:'Artocarpus heterophyllus',
 aliases:['jackfruit','jakfruit','Artocarpus heterophyllus'],
 sources:[UF('ufifas-jackfruit-mg370','Jackfruit Growing in the Florida Home Landscape','https://edis.ifas.ufl.edu/publication/MG370/pdf')],
 identitySource:'ufifas-jackfruit-mg370',climateSource:'ufifas-jackfruit-mg370',
 frost:'high',cold:'low',heat:'high',humidity:'high',water:'medium',sun:'full_sun',drainage:'high',
 coldText:'Leaves may be damaged at 32°F, branches at 30°F, and branches/trees may be killed at 28°F; optimum production is in continuously warm areas.',
 condition:'Adapted to hot humid tropics; moderately drought tolerant but needs water in prolonged dry periods; not tolerant of continuously wet/flooded soil; full sun and well-drained soil.',
 flower:'Male and female flowers occur on the same tree; flowering structures emerge from trunk and large branches.',
 fruit:'Fruit maturity is about 150-180 days after flowering; fruit set and quality are generally enhanced by cross-pollination among cultivars or seedlings.',
 tags:['fruit','tree','edible','tropical']
},
{
 slug:'moringa',common:'Moringa',scientific:'Moringa oleifera',
 aliases:['moringa','drumstick tree','horseradish tree','Moringa oleifera'],
 sources:[
  UCCE('ucce-moringa-2025','Moringa Oleifera (Miracle tree)','https://ucanr.edu/site/ucce-central-sierra-agriculture/article/moringa-oleifera-miracle-tree'),
  UF('ufifas-moringa-miami','Flowering & Shade Trees: Moringa oleifera','https://sfyl.ifas.ufl.edu/miami-dade/landscapes--gardening/flowering--shade-trees-f---z/')
 ],
 identitySource:'ucce-moringa-2025',climateSource:'ucce-moringa-2025',
 frost:'high',cold:'very_low',heat:'high',humidity:'medium',water:'low',sun:'full_sun',drainage:'high',
 coldText:'Moringa is cold sensitive, suited to USDA zone 9b and warmer; winter frosts can kill top growth in California.',
 condition:'Fast-growing drought-tolerant plant adapted to hot, dry climates and low water; UF/IFAS lists full sun, low water and good drainage.',
 flower:'UF/IFAS describes attractive panicles of fragrant cream-colored flowers, particularly during dry weather.',
 fruit:'UCCE notes that plants are grown for leaves and/or pods; less pruning favors pod production.',
 tags:['edible','tree','drought-tolerant','pod']
},
{
 slug:'papaya',common:'Papaya',scientific:'Carica papaya',
 aliases:['papaya','pawpaw','Carica papaya'],
 sources:[UF('ufifas-papaya-mg054','Papaya Growing in the Florida Home Landscape','https://edis.ifas.ufl.edu/publication/MG054/pdf')],
 identitySource:'ufifas-papaya-mg054',climateSource:'ufifas-papaya-mg054',
 frost:'high',cold:'very_low',heat:'high',humidity:'medium',water:'high',sun:'full_sun',drainage:'high',
 coldText:'Papaya grows and fruits best at 70-90°F, is not tolerant of freezing temperatures, and may be damaged or killed below 31°F.',
 condition:'Full sun; best production in warm-hot conditions; well distributed rainfall and watering are important; well-drained soils are recommended.',
 flower:'Female and bisexual flowers can produce fruit; temperatures below 59°F can inhibit flowering and temperatures above 90°F can cause flower drop.',
 fruit:'Female and bisexual plants normally produce fruit; drought can cause flower and young-fruit drop and reduce fruit quality.',
 tags:['fruit','edible','tropical','tree-like']
},
{
 slug:'rambutan',common:'Rambutan',scientific:'Nephelium lappaceum',
 aliases:['rambutan','Nephelium lappaceum'],
 sources:[UH('uhhilo-rambutan-phenology','Phenology and Fruit Development of Rambutan (Nephelium lappaceum L.) Grown in Hawaiʻi','https://hilo.hawaii.edu/panr/writing.php?id=167')],
 identitySource:'uhhilo-rambutan-phenology',climateSource:'uhhilo-rambutan-phenology',
 frost:'high',cold:'very_low',heat:'high',humidity:'high',water:'high',sun:'full_sun_to_part_shade',drainage:'high',
 coldText:'Rambutan is a humid-tropical fruit; flowering research cites mean temperatures above 22°C, while its production regions remain warm year-round.',
 condition:'Native to humid tropical Southeast Asia; Hilo trials averaged 23.8°C with substantial monthly rainfall. Flower induction responds to a short water-stress period, followed by irrigation.',
 flower:'Flower induction requires mean temperatures above 22°C and roughly 2-4 weeks of water stress; excessive rainfall during the expected flowering period favors vegetative growth.',
 fruit:'In Hawaiʻi, developing rambutan fruits matured about 18-20 weeks after anthesis; flowering peaks can occur several times per year under suitable conditions.',
 tags:['fruit','edible','tropical','humid']
},
{
 slug:'starfruit',common:'Starfruit',scientific:'Averrhoa carambola',
 aliases:['starfruit','carambola','Averrhoa carambola'],
 sources:[UF('ufifas-carambola-mg269','Carambola Growing in the Florida Home Landscape','https://edis.ifas.ufl.edu/publication/MG269/pdf')],
 identitySource:'ufifas-carambola-mg269',climateSource:'ufifas-carambola-mg269',
 frost:'high',cold:'low',heat:'high',humidity:'high',water:'high',sun:'full_sun',drainage:'high',
 coldText:'Best growth and fruiting occur around 68-95°F; growth stops below 65°F; young leaves may be killed at 30-32°F and larger tissues at lower freezing temperatures.',
 condition:'Warm to hot conditions, well-drained soil, continuous access to soil moisture, and wind protection are optimum; drought reduces flowering and fruit size.',
 flower:'Established shoots can flower repeatedly; pruning can induce flowering in about 21 days, while cool fall/winter temperatures may prevent fruit set.',
 fruit:'Fruit may develop about 70-80 days after induced flowering; continuous soil moisture supports flowering and fruit production.',
 tags:['fruit','edible','tropical','tree']
},
{
 slug:'strawberry-guava',common:'Strawberry Guava',scientific:'Psidium cattleyanum',
 aliases:['strawberry guava','cattley guava','Psidium cattleyanum','Psidium cattleianum','cherry guava'],
 sources:[
  KEW('kew-psidium-cattleyanum','Psidium cattleyanum Sabine - accepted species','https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:600760-1'),
  UF('ufifas-psidium-cattleianum-st529','Psidium cattleianum: Strawberry Guava','https://edis.ifas.ufl.edu/publication/ST529/pdf')
 ],
 identitySource:'kew-psidium-cattleyanum',climateSource:'ufifas-psidium-cattleianum-st529',
 frost:'high',cold:'very_low',heat:'high',humidity:'medium',water:'medium',sun:'full_sun_to_part_shade',drainage:'high',
 coldText:'UF/IFAS lists USDA hardiness zones 10A-11 for strawberry guava; Kew accepts the canonical name Psidium cattleyanum.',
 condition:'Full sun to partial shade and well-drained sites; strawberry guava is moderately drought tolerant once established.',
 flower:'White fragrant flowers are produced year-round, singly or in small groups at leaf axils.',
 fruit:'Fleshy purplish-red berries follow flowering; the plant is used for fruit but is invasive/not recommended in South Florida and requires escape management elsewhere.',
 tags:['fruit','edible','shrub','invasive-caution']
},
];
function sourceById(d,id){return d.sources.find(s=>s.sourceId===id);}
const claim=(id,field,value,source,excerpt,evidenceClass='HEURISTIC_ASSERTION',extra={})=>({claimId:id,field,status:'asserted',value,sourceIds:[source.sourceId],shortExcerpt:excerpt,evidenceClass,...extra});
function packet(d){
 const identity=sourceById(d,d.identitySource), climate=sourceById(d,d.climateSource);
 const claims=[
  claim('identity-scientific','scientific',d.scientific,identity,d.scientific+' — canonical identity supported by '+identity.institution+'.','SOURCE_SUPPORTED'),
  claim('identity-aliases','aliases',d.aliases,identity,'Current and historical/common names retained as aliases.','HEURISTIC_ASSERTION'),
  claim('frost','frostSensitivity',d.frost,climate,d.coldText,'HEURISTIC_ASSERTION',{transformation:'Conservative frost-sensitivity interpretation from explicit cold/freeze evidence; not a direct source ordinal.'}),
  claim('cold','coldTolerance',d.cold,climate,d.coldText,'SOURCE_SUPPORTED',{transformation:'Conservative qualitative cold-tolerance interpretation from explicit temperature/hardiness evidence.'}),
  claim('heat','heatTolerance',d.heat,climate,d.condition,'HEURISTIC_ASSERTION'),
  claim('humidity','humidityTolerance',d.humidity,climate,d.condition,'HEURISTIC_ASSERTION'),
  claim('water','waterNeeds',d.water,climate,d.condition,'HEURISTIC_ASSERTION'),
  claim('sun','sunNeeds',d.sun,climate,d.condition,'SOURCE_SUPPORTED'),
  claim('drainage','drainageNeeds',d.drainage,climate,d.condition,'SOURCE_SUPPORTED'),
  claim('chill','needsWinterChill',false,climate,'No winter-chill requirement is asserted for this tropical/subtropical catalog purpose.','HEURISTIC_ASSERTION'),
  claim('tags','tags',d.tags,climate,'Catalog tags: '+d.tags.join(', '),'HEURISTIC_ASSERTION'),
  claim('flowering','floweringRequirements',d.flower,climate,d.flower,'SOURCE_SUPPORTED'),
  claim('fruiting','fruitingRequirements',d.fruit,climate,d.fruit,'SOURCE_SUPPORTED')
 ];
 return {expansionContractVersion:'1.2.0',packetId:d.slug+'-p1-review-closure-wave-b-v1',identity:{canonicalSlug:d.slug,commonNameEn:d.common,acceptedScientificName:d.scientific,aliases:d.aliases},flags:{forceClimateNeedsReview:false,botanicalVerified:true,notes:'P1 review closure Wave B; authoritative tropical-fruit evidence and canonical taxonomy where needed.',sourceSupportedEnrichmentV1:true,enrichmentVerifiedAt:verifiedAt},sources:d.sources,claims,image:{status:'IMAGE_PENDING'},humanApproval:{approvedForIngest:true,approvedAt:verifiedAt,approvedBy:'Owner continuation authorization',notes:'Owner instructed continuation of Full Catalog Revalidation/P1 closure; no paid APIs.'}};
}
fs.mkdirSync(OUT,{recursive:true});
for(const d of D) fs.writeFileSync(path.join(OUT,d.slug+'.packet.json'),JSON.stringify(packet(d),null,2)+'\n');
console.log(JSON.stringify({batch:'p1-review-closure-wave-b-v1',count:D.length,slugs:D.map(x=>x.slug),out:path.relative(ROOT,OUT)},null,2));
