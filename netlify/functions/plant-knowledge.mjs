// Cruvit Netlify Function: true universal plant knowledge.
// Primary source: server-side OpenAI. Fallbacks: Wikidata/Wikipedia/GBIF/Wikimedia.
// The browser must never contain the OpenAI key. Keep OPENAI_API_KEY in Netlify Environment Variables.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};
function json(status, body) { return new Response(JSON.stringify(body), { status, headers: corsHeaders }); }
function getApiKey() { return process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || process.env.OPENAI_API_TOKEN || process.env.OPENAI_SECRET_KEY || ''; }
function arr(v) { return Array.isArray(v) ? v.filter(Boolean).map(String) : []; }
function norm(s){return String(s||'').toLowerCase().trim().replace(/['"׳״`]/g,'').replace(/\s+/g,' ');}
function cleanJsonText(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const first = t.indexOf('{'), last = t.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) t = t.slice(first, last + 1);
  return t || '{}';
}
function validImageUrl(img) { return !!img && /^https?:\/\//i.test(img) && !/\.svg($|\?)/i.test(img) && !/source\.unsplash\.com|loremflickr\.com/i.test(img); }
function safeText(v, fallback='') { return String(v || fallback || '').trim(); }

// v91: botanical-only guardrails. Never allow a person/place/movie/company result
// to become a plant just because the text search matched the word.
const PLANT_WORD_RE = /\b(plant|tree|flower|fruit|species|genus|shrub|vine|herb|berry|citrus|rubus|grass|cactus|succulent|orchid|rose|vegetable|cultivar|flora|conifer|cedar|oak|pine|quercus|pinus|cedrus|mango|papaya|pomegranate|lavender|jasmine)\b|צמח|עץ|פרח|פרי|שיח|מטפס|עשב|אלון|אורן|ארז|מנגו|פפאיה|רימון|לבנדר|יסמין/i;
const NON_PLANT_WORD_RE = /\b(actor|actress|singer|musician|dj|artist|politician|footballer|basketball|person|human|film|song|album|company|software|city|village|surname|given name|male given name|female given name|journalist|writer|director|producer|model|athlete|rabbi|professor|lawyer)\b|זמר|שחקן|מוזיקאי|אמן|אישיות|פוליטיקאי|כדורגלן|סופר|במאי|שם פרטי|משפחה|יישוב|חברה|סרט|שיר|אלבום/i;
function looksBotanicalText(obj){
  const t = String([obj?.title,obj?.label,obj?.description,obj?.extract,obj?.scientificName,obj?.canonicalName,obj?.commonName,obj?.kingdom,obj?.rank].filter(Boolean).join(' '));
  if(!t.trim()) return false;
  if(NON_PLANT_WORD_RE.test(t) && !PLANT_WORD_RE.test(t)) return false;
  return PLANT_WORD_RE.test(t) || /\b[A-Z][a-z]+\s+[a-z-]+\b/.test(t);
}
function hasTaxonomicPlantEvidence(ref){
  if(!ref) return false;
  if(ref.gbif && (String(ref.gbif.kingdom||'').toLowerCase()==='plantae' || ref.gbif.scientificName || ref.gbif.canonicalName)) return true;
  if(looksBotanicalText(ref.wikidata) || looksBotanicalText(ref.wiki)) return true;
  return false;
}
function isObviouslyNonPlantProfile(profile){
  const t = String([profile?.commonName,profile?.scientificName,profile?.guide,profile?.imageSearchQuery].filter(Boolean).join(' '));
  return NON_PLANT_WORD_RE.test(t) && !PLANT_WORD_RE.test(t);
}

const COMMON_ALIASES = new Map(Object.entries({
  // Hebrew / English / scientific quick normalisation for common Israeli and garden cases.
  'עץ אלון':'oak tree','אלון':'oak tree','אלון מצוי':'Quercus calliprinos','אלון תבור':'Quercus ithaburensis','אלון התבור':'Quercus ithaburensis','oak':'oak tree','oak tree':'oak tree','quercus':'Quercus',
  'עץ אורן':'pine tree','אורן':'pine tree','אורן ירושלים':'Pinus halepensis','pine':'pine tree','pine tree':'pine tree','pinus':'Pinus',
  'ארז':'Cedrus libani','עץ ארז':'Cedrus libani','ארז הלבנון':'Cedrus libani','cedar':'Cedrus','cedar tree':'Cedrus','cedrus':'Cedrus','cedrus libani':'Cedrus libani',
  'פפאיה':'papaya','עץ פפאיה':'papaya tree','papaya':'papaya','papaya tree':'papaya tree','carica papaya':'Carica papaya',
  'פטל':'raspberry','פטל אדום':'raspberry','raspberry':'raspberry','rubus':'Rubus','blackberry':'blackberry',
  'עץ מנגו':'mango tree','מנגו':'mango tree','mango':'mango tree','mango tree':'mango tree','mangifera indica':'Mangifera indica',
  'רימון':'pomegranate tree','עץ רימון':'pomegranate tree','pomegranate':'pomegranate tree','punica granatum':'Punica granatum',
  'ליצי':'lychee tree','ליצ׳י':'lychee tree','ליצ’י':'lychee tree','lychee':'lychee tree','litchi':'lychee tree','litchi chinensis':'Litchi chinensis',
  'פסיפלורה':'passion fruit vine','passion fruit':'passion fruit vine','passiflora edulis':'Passiflora edulis',
  'גויאבה תותית':'strawberry guava','strawberry guava':'strawberry guava','psidium cattleyanum':'Psidium cattleyanum',
  'לימון':'lemon tree','עץ לימון':'lemon tree','lemon':'lemon tree','citrus limon':'Citrus limon',
  'תפוז':'orange tree','עץ תפוז':'orange tree','orange':'orange tree','citrus sinensis':'Citrus sinensis',
  'זית':'olive tree','עץ זית':'olive tree','olive':'olive tree','olea europaea':'Olea europaea',
  'גפן':'grapevine','ענבים':'grapevine','grape':'grapevine','vitis vinifera':'Vitis vinifera',
  'תאנה':'fig tree','עץ תאנה':'fig tree','fig':'fig tree','ficus carica':'Ficus carica',
  'אבוקדו':'avocado tree','עץ אבוקדו':'avocado tree','avocado':'avocado tree','persea americana':'Persea americana'
}));
function normalizeUserQuery(q){ const n=norm(q); return COMMON_ALIASES.get(n) || q; }

const LOCAL_TAXON_OVERRIDES = new Map(Object.entries({
  'cedrus libani': {title:'Cedar of Lebanon', scientificName:'Cedrus libani', canonicalName:'Cedrus libani', commonName:'Cedar of Lebanon', description:'conifer tree species in the family Pinaceae', kingdom:'Plantae'},
  'cedrus': {title:'Cedar', scientificName:'Cedrus spp.', canonicalName:'Cedrus', commonName:'Cedar', description:'genus of coniferous trees in the family Pinaceae', kingdom:'Plantae'},
  'quercus calliprinos': {title:'Palestine oak', scientificName:'Quercus calliprinos', canonicalName:'Quercus calliprinos', commonName:'Palestine oak', description:'oak tree species', kingdom:'Plantae'},
  'oak tree': {title:'Oak', scientificName:'Quercus spp.', canonicalName:'Quercus', commonName:'Oak tree', description:'tree or shrub in the genus Quercus', kingdom:'Plantae'},
  'pine tree': {title:'Pine', scientificName:'Pinus spp.', canonicalName:'Pinus', commonName:'Pine tree', description:'conifer tree in the genus Pinus', kingdom:'Plantae'},
  'pinus halepensis': {title:'Aleppo pine', scientificName:'Pinus halepensis', canonicalName:'Pinus halepensis', commonName:'Aleppo pine', description:'pine tree species', kingdom:'Plantae'},
  'papaya': {title:'Papaya', scientificName:'Carica papaya', canonicalName:'Carica papaya', commonName:'Papaya', description:'tropical fruit plant', kingdom:'Plantae'},
  'mango tree': {title:'Mango', scientificName:'Mangifera indica', canonicalName:'Mangifera indica', commonName:'Mango tree', description:'tropical fruit tree species', kingdom:'Plantae'},
  'pomegranate tree': {title:'Pomegranate', scientificName:'Punica granatum', canonicalName:'Punica granatum', commonName:'Pomegranate tree', description:'fruit-bearing shrub or small tree', kingdom:'Plantae'},
  'lychee tree': {title:'Lychee', scientificName:'Litchi chinensis', canonicalName:'Litchi chinensis', commonName:'Lychee tree', description:'tropical fruit tree', kingdom:'Plantae'}
}));
function localOverrideFor(raw){ const n=norm(normalizeUserQuery(raw)); return LOCAL_TAXON_OVERRIDES.get(n) || null; }

async function fetchJson(url){
  const res=await fetch(url,{headers:{'Accept':'application/json','User-Agent':'CruvitPlantKnowledge/3.0 (garden app)'}});
  if(!res.ok) throw new Error('HTTP '+res.status);
  return res.json();
}
async function wikiSearch(query, lang='en'){
  const q=String(query||'').trim(); if(!q) return null;
  const url=`https://${lang}.wikipedia.org/w/api.php?`+new URLSearchParams({
    action:'query', generator:'search', gsrsearch:`${q} plant species`, gsrlimit:'8',
    prop:'pageimages|description|extracts', exintro:'1', explaintext:'1', piprop:'thumbnail|original', pithumbsize:'1000', format:'json', origin:'*'
  }).toString();
  const data=await fetchJson(url);
  const pages=Object.values(data?.query?.pages||{});
  if(!pages.length) return null;
  const botanicalPages=pages.filter(p=>looksBotanicalText({title:p.title,description:p.description,extract:p.extract}));
  if(!botanicalPages.length) return null;
  botanicalPages.sort((a,b)=>{
    const at=String(a.title||'')+' '+String(a.description||'')+' '+String(a.extract||'');
    const bt=String(b.title||'')+' '+String(b.description||'')+' '+String(b.extract||'');
    const as=NON_PLANT_WORD_RE.test(at)?-5:0, bs=NON_PLANT_WORD_RE.test(bt)?-5:0;
    return bs-as;
  });
  const best=botanicalPages[0];
  return {title:best.title||q, description:best.description||'', extract:best.extract||'', imageUrl:best?.original?.source||best?.thumbnail?.source||'', lang};
}
async function wikidataSearch(query){
  const q=String(query||'').trim(); if(!q) return null;
  const langs=[/[\u0590-\u05FF]/.test(q)?'he':'en','en','he'];
  for(const language of [...new Set(langs)]){
    try{
      const url='https://www.wikidata.org/w/api.php?'+new URLSearchParams({
        action:'wbsearchentities', search:q, language, uselang:language, type:'item', limit:'8', format:'json', origin:'*'
      }).toString();
      const data=await fetchJson(url);
      const hits=data?.search||[];
      const plantLike=hits.find(h=>looksBotanicalText({title:h.label, description:h.description}));
      if(plantLike) return {title:plantLike.label, description:plantLike.description||'', id:plantLike.id, lang:language};
    }catch(_e){}
  }
  return null;
}
async function gbifSuggest(query){
  const q=String(query||'').trim(); if(!q) return null;
  try{
    const url='https://api.gbif.org/v1/species/suggest?'+new URLSearchParams({q, limit:'8'}).toString();
    const data=await fetchJson(url);
    const plants=(Array.isArray(data)?data:[]).filter(x=>String(x.kingdom||'').toLowerCase()==='plantae' || x.kingdomKey===6 || /plantae/i.test(String(x.kingdom||'')));
    const best=plants[0] || null;
    if(best) return {scientificName:best.scientificName||best.canonicalName||'', canonicalName:best.canonicalName||'', commonName:best.vernacularNames?.[0]||'', rank:best.rank||'', kingdom:best.kingdom||''};
  }catch(_e){}
  return null;
}
async function commonsImage(query){
  const q=String(query||'').trim(); if(!q) return '';
  const url='https://commons.wikimedia.org/w/api.php?'+new URLSearchParams({
    action:'query',generator:'search',gsrnamespace:'6',gsrsearch:`${q} plant flower fruit leaves`,gsrlimit:'20',prop:'imageinfo',iiprop:'url|mime',iiurlwidth:'1000',format:'json',origin:'*'
  }).toString();
  try{const data=await fetchJson(url); const pages=Object.values(data?.query?.pages||{}); for(const p of pages){const info=p?.imageinfo?.[0]||{}; const img=info.thumburl||info.url||''; if((!info.mime||/^image\//.test(info.mime))&&validImageUrl(img)) return img;}}catch(_e){}
  return '';
}
async function resolveImage(...queries){
  for(const q of queries.filter(Boolean)){
    try{const w=await wikiSearch(q,'en'); if(validImageUrl(w?.imageUrl)) return w.imageUrl;}catch(_e){}
    try{const w=await wikiSearch(q,'he'); if(validImageUrl(w?.imageUrl)) return w.imageUrl;}catch(_e){}
    const c=await commonsImage(q); if(validImageUrl(c)) return c;
  }
  return '';
}
async function gatherReference(raw){
  const normalized=normalizeUserQuery(raw);
  const [wd, gbif] = await Promise.all([wikidataSearch(normalized), gbifSuggest(normalized)]);
  let wiki=null;
  try{wiki=await wikiSearch(normalized,'en') || await wikiSearch(normalized,'he');}catch(_e){}
  const local=localOverrideFor(raw) || localOverrideFor(normalized);
  return {normalized, wikidata:wd, gbif: gbif || local, wiki: wiki || (local?{title:local.title,description:local.description,extract:'',imageUrl:'',lang:'local'}:null)};
}

function buildPrompt({plantName, location, climate, language, source, ref}) {
  return `You are Cruvit's horticulture knowledge engine for a real consumer gardening app.

The user typed a plant name. Your job is to resolve it into the most likely real botanical plant and return a complete practical profile.

User typed: "${plantName}"
Normalized candidate: "${ref.normalized}"
Source flow: ${source || 'My Garden'}
User location/climate: ${location || 'Western Galilee, Israel'}, ${climate || 'Mediterranean'}
Preferred UI language: ${language || 'en'}
Wikidata hint: ${ref.wikidata ? JSON.stringify(ref.wikidata) : 'none'}
GBIF hint: ${ref.gbif ? JSON.stringify(ref.gbif) : 'none'}
Wikipedia hint: ${ref.wiki ? JSON.stringify({title:ref.wiki.title, description:ref.wiki.description, extract:String(ref.wiki.extract||'').slice(0,900)}) : 'none'}

Critical rules:
- Accept any real plant in any language or transliteration: common name, Hebrew name, scientific name, tree, shrub, flower, herb, vegetable, fruit, vine, cactus, succulent, houseplant, wildflower, ornamental, etc.
- Do not restrict yourself to a local list. The world plant database is open-ended.
- If the input is broad (for example "oak", "pine", "rose", "ficus"), return the most common garden interpretation and mention ambiguity in warnings.
- If the input is a common Hebrew phrase like "עץ אלון", resolve it to the botanical group/species (Oak / Quercus) and not to an unrelated fallback.
- Do not return generic placeholders as the main profile. Give practical default care for the most likely plant.
- If it is not a plant at all, return {"isPlant": false, "message": "..."}. Otherwise return isPlant true.
- Never treat a person's name, place, band, song, brand, movie, app or company as a plant. If the same word is also a plant name, resolve ONLY to the botanical taxon.
- Prefer botanical taxa with scientific names. If you cannot identify a plant taxon, return isPlant false rather than guessing.
- Warnings must be plant-specific: pet/child toxicity, thorns/spines, aggressive roots, invasive/self-seeding, pests, diseases, frost/heat sensitivity, allergens/skin irritation, bee/wasp/fruit-fly attraction, structural risks. No generic task reminders in warnings.
- Products must be generic categories only, not brand names.
- Return only valid JSON.

JSON shape:
{
  "isPlant": true,
  "commonName": "",
  "hebrewName": "",
  "scientificName": "",
  "confidence": 0.0,
  "icon": "single emoji",
  "sun": "specific light requirement",
  "water": "specific watering guidance",
  "soil": "specific soil/drainage guidance",
  "growth": "specific growth habit",
  "size": "typical mature size range",
  "climateFit": "specific climate suitability and warnings",
  "seasonCare": "specific seasonal care",
  "warnings": ["plant-specific alerts only"],
  "tasks": ["only truly useful recurring care tasks, not too many"],
  "guide": "5-7 concise practical sentences",
  "shoppingProducts": ["generic product category"],
  "imageSearchQuery": "scientific name or best English search query for plant photo"
}`;
}
async function callOpenAI(prompt, apiKey){
  const model=process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:'Return only valid JSON. Be botanically accurate, practical, and do not reject real plants.'},{role:'user',content:prompt}],response_format:{type:'json_object'},temperature:0.01,max_tokens:2200})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data?.error?.message || `OpenAI request failed ${response.status}`);
  return data?.choices?.[0]?.message?.content || '{}';
}
function buildFallbackProfile(raw, ref, imageUrl){
  if(!hasTaxonomicPlantEvidence(ref)) return {isPlant:false,error:'No confident botanical plant match found. Try a scientific name, common plant name, Hebrew plant name or transliteration.'};
  const common = ref?.gbif?.commonName || ref?.gbif?.canonicalName || ref?.gbif?.scientificName || ref?.wiki?.title || ref?.wikidata?.title || normalizeUserQuery(raw) || raw;
  const sci = ref?.gbif?.scientificName || ref?.gbif?.canonicalName || '';
  const text = safeText(ref?.wiki?.extract || ref?.wiki?.description || ref?.wikidata?.description || '');
  return {
    isPlant:true,
    commonName:common,
    hebrewName:/[\u0590-\u05FF]/.test(raw)?raw:'',
    scientificName:sci,
    confidence: ref?.gbif || ref?.wiki || ref?.wikidata ? 0.72 : 0.35,
    imageUrl:imageUrl||'',
    imageSearchQuery:sci||common,
    icon:'🌿',
    sun:'Start with the known needs for the confirmed species; most plants need placement matched to sun exposure and climate.',
    water:'Water according to species, season, soil drainage and plant age; check soil moisture before watering.',
    soil:'Use well-drained soil unless the confirmed species requires wet or acidic conditions.',
    growth:'Growth habit depends on the confirmed species and cultivar.',
    size:'Confirm mature size before planting near walls, pipes, paths or foundations.',
    climateFit:'Check local hardiness, heat, wind and frost exposure before planting.',
    seasonCare:'Create seasonal reminders after confirming exact species and local climate.',
    warnings:['This profile was created from public botanical lookup, not a full expert database. Confirm exact species before purchase, treatment or planting.'],
    tasks:['Confirm exact species/cultivar','Check light and soil before planting','Inspect leaves and soil weekly during establishment'],
    guide: text ? text.slice(0,750) : `${common} appears to be a plant match. Confirm the exact botanical identity, then set watering, light, soil, pruning and seasonal care according to the species and local climate.`,
    shoppingProducts:['Compost or soil amendment','Mulch','Balanced fertilizer']
  };
}
async function normalizeResponse(parsed, requestedName, ref) {
  if (parsed.isPlant === false) return { isPlant:false, error: parsed.warning || parsed.message || 'This does not look like a plant name.' };
  const commonName=safeText(parsed.commonName||parsed.common_name||parsed.name||ref?.wiki?.title||ref?.wikidata?.title||ref?.gbif?.commonName||ref?.gbif?.canonicalName||requestedName);
  const scientificName=safeText(parsed.scientificName||parsed.scientific_name||parsed.scientific||ref?.gbif?.scientificName||ref?.gbif?.canonicalName||'');
  if(!scientificName && !hasTaxonomicPlantEvidence(ref)) return {isPlant:false,error:'No confident botanical plant match found.'};
  const preliminary={commonName,scientificName,guide:parsed.guide||parsed.description||'',imageSearchQuery:parsed.imageSearchQuery||parsed.image_search_query||''};
  if(isObviouslyNonPlantProfile(preliminary)) return {isPlant:false,error:'The result matched a non-plant entity, so it was rejected.'};
  const imageSearchQuery=safeText(parsed.imageSearchQuery||parsed.image_search_query||scientificName||commonName);
  const imageUrl = (validImageUrl(parsed.imageUrl||parsed.image_url||parsed.photoUrl||parsed.photo_url) ? (parsed.imageUrl||parsed.image_url||parsed.photoUrl||parsed.photo_url) : '') || await resolveImage(scientificName, commonName, imageSearchQuery, ref?.wiki?.title, ref?.wikidata?.title, requestedName);
  return {
    isPlant:true, commonName, hebrewName:safeText(parsed.hebrewName||parsed.hebrew_name||(/[\u0590-\u05FF]/.test(requestedName)?requestedName:'')), scientificName,
    confidence: Number(parsed.confidence || 0.86), imageUrl, imageSearchQuery, icon:parsed.icon||'🌿',
    sun:parsed.sun||parsed.light||'Check light requirement by species',
    water:parsed.water||parsed.watering||'Check watering by season and soil',
    soil:parsed.soil||'Well-drained soil unless species requires otherwise',
    growth:parsed.growth||'Growth depends on species and conditions',
    size:parsed.size||'Varies by species, variety and pruning',
    climateFit:parsed.climateFit||parsed.climate_fit||parsed.climate||'Check by local microclimate',
    seasonCare:parsed.seasonCare||parsed.season||'Seasonal care depends on local climate',
    warnings:arr(parsed.warnings).slice(0,8),
    tasks:arr(parsed.tasks).slice(0,5),
    guide:parsed.guide||parsed.careGuide||parsed.description||ref?.wiki?.extract||'Care guidance should be confirmed by exact variety and local conditions.',
    shoppingProducts:(arr(parsed.shoppingProducts).length?arr(parsed.shoppingProducts):arr(parsed.products)).slice(0,6)
  };
}

export default async function handler(request){
  if(request.method==='OPTIONS') return new Response('',{status:200,headers:corsHeaders});
  if(request.method!=='POST') return json(405,{error:'Method not allowed'});
  try{
    const body=await request.json().catch(()=>({}));
    const raw=String(body.plantName||body.query||body.originalQuery||'').trim();
    if(raw.length<2) return json(400,{error:'plantName is required'});
    const ref=await gatherReference(raw);
    const apiKey=getApiKey();
    if(apiKey){
      try{
        const prompt=buildPrompt({plantName:raw, location:body.location, climate:body.climate, language:body.language, source:body.source, ref});
        const text=await callOpenAI(prompt,apiKey);
        const parsed=JSON.parse(cleanJsonText(text));
        const out=await normalizeResponse(parsed,raw,ref);
        if(out.isPlant!==false){ out.matchSource='openai+taxonomy'; return json(200,out); }
        // If OpenAI rejected but public plant references found a likely plant, use fallback instead of failing.
        if(hasTaxonomicPlantEvidence(ref)){
          const imageUrl=await resolveImage(ref.gbif?.scientificName, ref.gbif?.canonicalName, ref.wiki?.title, ref.wikidata?.title, ref.normalized, raw);
          const out2=buildFallbackProfile(raw,ref,imageUrl); out2.matchSource='taxonomy-fallback-after-openai-reject'; return json(200,out2);
        }
        return json(200,out);
      }catch(err){
        // Do not fail the app. Fall through to public taxonomy fallback.
        const imageUrl=await resolveImage(ref.gbif?.scientificName, ref.gbif?.canonicalName, ref.wiki?.title, ref.wikidata?.title, ref.normalized, raw);
        const out=buildFallbackProfile(raw,ref,imageUrl);
        out.matchSource='taxonomy-fallback'; out.warning='OpenAI profile failed; taxonomy fallback used.'; out.debug=err?.message||'';
        return json(200,out);
      }
    }
    const imageUrl=await resolveImage(ref.gbif?.scientificName, ref.gbif?.canonicalName, ref.wiki?.title, ref.wikidata?.title, ref.normalized, raw);
    if(hasTaxonomicPlantEvidence(ref)){ const out=buildFallbackProfile(raw,ref,imageUrl); out.matchSource='taxonomy-fallback'; return json(200,out); }
    return json(200,{isPlant:false,error:'No confident plant match found. Try a common name, scientific name, Hebrew name or transliteration.'});
  }catch(err){ return json(200,{error:err?.message||'Plant knowledge request failed'}); }
}
export const config={path:'/.netlify/functions/plant-knowledge'};
