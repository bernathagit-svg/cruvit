import { evaluateFullPlantOnboarding } from '../../modules/catalog/full-plant-onboarding-gate-v1.js';
import { coordinatePlantOnboarding } from '../../modules/catalog/plant-onboarding-coordinator-v1.js';
import { fetchCanonicalCatalogRow } from './_plant-full-onboarding-gate-v1.mjs';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type':'application/json; charset=utf-8',
      'cache-control':'private, no-store',
      'x-robots-tag':'noindex, nofollow'
    }
  });
}

function safeSlug(value) {
  const s=String(value||'').trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)?s:'';
}

function safePhenology(value) {
  const p=String(value||'vegetative').trim().toLowerCase();
  return ['vegetative','flowering','fruiting'].includes(p)?p:'vegetative';
}

function sanitizeItem(item={}) {
  const canonicalSlug=safeSlug(item.canonicalSlug||item.slug);
  if(!canonicalSlug) return null;
  return {
    canonicalSlug,
    scientific:String(item.scientific||'').trim()||null,
    phenology:safePhenology(item.phenology)
  };
}

async function requestItems(req) {
  if(req.method==='GET') {
    const url=new URL(req.url);
    return String(url.searchParams.get('slugs')||'')
      .split(',')
      .map(x=>sanitizeItem({canonicalSlug:x}))
      .filter(Boolean);
  }
  if(req.method==='POST') {
    let body={};
    try{body=await req.json();}catch{return null;}
    return (Array.isArray(body.items)?body.items:[]).map(sanitizeItem).filter(Boolean);
  }
  return null;
}

export default async (req) => {
  const items=await requestItems(req);
  if(items===null) return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  if(!items.length) return json(400,{ok:false,code:'ITEMS_REQUIRED'});
  if(items.length>100) return json(400,{ok:false,code:'TOO_MANY_ITEMS',maxItems:100});

  const evaluations=[];
  for(const item of items) {
    let row=null;
    try {
      row=await fetchCanonicalCatalogRow(item.canonicalSlug);
    } catch(err) {
      return json(503,{
        ok:false,
        code:'CANONICAL_CATALOG_READ_FAILED',
        canonicalSlug:item.canonicalSlug,
        errorName:err?.message||null
      });
    }
    const full=evaluateFullPlantOnboarding(row,item);
    evaluations.push(coordinatePlantOnboarding({catalogRow:row,fullOnboarding:full}));
  }

  const byRoute={};
  for(const e of evaluations) byRoute[e.route]=(byRoute[e.route]||0)+1;

  return json(200,{
    ok:true,
    version:'plant-onboarding-coordinator-v1',
    total:evaluations.length,
    byRoute,
    visualFactoryAllowed:evaluations.filter(x=>x.visualFactoryAllowed).length,
    visualFactoryBlocked:evaluations.filter(x=>!x.visualFactoryAllowed).length,
    paidCalls:0,
    productionWrites:0,
    catalogWrites:0,
    evaluations
  });
};

export const config={
  path:'/.netlify/functions/plant-onboarding-coordinator'
};
