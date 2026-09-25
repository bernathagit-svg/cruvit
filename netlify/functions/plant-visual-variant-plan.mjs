import { fetchCanonicalCatalogRow } from './_plant-full-onboarding-gate-v1.mjs';
import { evaluateFullPlantOnboarding } from '../../modules/catalog/full-plant-onboarding-gate-v1.js';
import { buildPlantVisualVariantPlan } from '../../modules/garden-design/asset-factory-v1/plant-visual-variant-plan-v1.js';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'private, no-store',
      'x-robots-tag':'noindex, nofollow'
    }
  });
}
function safeSlug(value){
  const s=String(value||'').trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)?s:'';
}
function safePhenology(value){
  const p=String(value||'vegetative').trim().toLowerCase();
  return ['vegetative','flowering','fruiting'].includes(p)?p:'vegetative';
}

export default async (req) => {
  if(req.method!=='GET' && req.method!=='POST') return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  let items=[];
  if(req.method==='GET'){
    const url=new URL(req.url);
    items=String(url.searchParams.get('slugs')||'').split(',').map((slug)=>({
      canonicalSlug:safeSlug(slug),
      phenology:'vegetative'
    })).filter(x=>x.canonicalSlug);
  } else {
    let body={};
    try{body=await req.json();}catch{return json(400,{ok:false,code:'JSON_BODY_REQUIRED'});}
    items=(Array.isArray(body.items)?body.items:[]).map((item)=>({
      canonicalSlug:safeSlug(item?.canonicalSlug||item?.slug),
      scientific:String(item?.scientific||'').trim()||null,
      phenology:safePhenology(item?.phenology)
    })).filter(x=>x.canonicalSlug);
  }
  if(!items.length) return json(400,{ok:false,code:'ITEMS_REQUIRED'});
  if(items.length>100) return json(400,{ok:false,code:'TOO_MANY_ITEMS',maxItems:100});

  const results=[];
  for(const item of items){
    let row=null;
    try{row=await fetchCanonicalCatalogRow(item.canonicalSlug);}
    catch(err){
      results.push({
        canonicalSlug:item.canonicalSlug,
        ready:false,
        code:'CANONICAL_CATALOG_READ_FAILED',
        errorName:err?.message||null
      });
      continue;
    }
    const full=evaluateFullPlantOnboarding(row,item);
    results.push(buildPlantVisualVariantPlan({catalogRow:row,fullOnboarding:full}));
  }

  return json(200,{
    ok:true,
    version:'plant-visual-variant-plan-v1',
    total:results.length,
    ready:results.filter(x=>x.ready).length,
    blocked:results.filter(x=>!x.ready).length,
    seasonalityResearchRequired:results.filter(x=>x.seasonalityResearchRequired).length,
    paidCalls:0,
    productionWrites:0,
    registryWrites:0,
    results
  });
};

export const config={
  path:'/.netlify/functions/plant-visual-variant-plan'
};
