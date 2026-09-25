import { fetchCanonicalCatalogRow } from './_plant-full-onboarding-gate-v1.mjs';
import { hydrateDesignMetadataFromApprovedPacket } from './_catalog-design-metadata-v1.mjs';
import { evaluateFullPlantOnboarding } from '../../modules/catalog/full-plant-onboarding-gate-v1.js';
import { buildPlantVisualVariantPlan } from '../../modules/garden-design/asset-factory-v1/plant-visual-variant-plan-v1.js';
import { buildPlantVisualVariantGapPlan } from '../../modules/garden-design/asset-factory-v1/plant-visual-variant-gap-plan-v1.js';

function json(status,body){
  return new Response(JSON.stringify(body),{
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

async function loadRegistry(req){
  const res=await fetch(
    new URL('/modules/garden-design/assets/plants/design-asset-registry-v1.json?t='+Date.now(),req.url),
    {cache:'no-store'}
  );
  if(!res.ok) throw new Error('REGISTRY_LOAD_FAILED');
  return res.json();
}

export default async(req)=>{
  if(req.method!=='GET') return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const url=new URL(req.url);
  const slugs=String(url.searchParams.get('slugs')||'')
    .split(',').map(safeSlug).filter(Boolean);
  if(!slugs.length) return json(400,{ok:false,code:'SLUGS_REQUIRED'});
  if(slugs.length>100) return json(400,{ok:false,code:'TOO_MANY_SLUGS',maxSlugs:100});

  let registry=null;
  try{registry=await loadRegistry(req);}
  catch(err){return json(503,{ok:false,code:'REGISTRY_LOAD_FAILED',errorName:err?.message||null});}

  const results=[];
  for(const canonicalSlug of slugs){
    let row=null;
    try{row=await fetchCanonicalCatalogRow(canonicalSlug);}
    catch(err){
      results.push({canonicalSlug,status:'CATALOG_READ_FAILED',errorName:err?.message||null});
      continue;
    }
    const hydrated=await hydrateDesignMetadataFromApprovedPacket(req,row);
    const effectiveRow=hydrated.row || row;
    const full=evaluateFullPlantOnboarding(effectiveRow,{canonicalSlug,phenology:'vegetative'});
    const variantPlan=buildPlantVisualVariantPlan({catalogRow:effectiveRow,fullOnboarding:full});
    results.push({
      ...buildPlantVisualVariantGapPlan({variantPlan,registry}),
      designMetadataHydration:{
        hydrated:hydrated.hydrated===true,
        code:hydrated.code,
        packetPath:hydrated.packetPath||null
      }
    });
  }

  return json(200,{
    ok:true,
    version:'plant-visual-variant-gap-plan-v1',
    total:results.length,
    withMissingRequired:results.filter(x=>x.missingRequiredCount>0).length,
    totalMissingRequired:results.reduce((n,x)=>n+(x.missingRequiredCount||0),0),
    totalCoveredRequired:results.reduce((n,x)=>n+(x.coveredRequiredCount||0),0),
    seasonalityResearchRequired:results.filter(x=>x.seasonalityResearchRequired).length,
    paidCalls:0,
    productionWrites:0,
    registryWrites:0,
    results
  });
};

export const config={
  path:'/.netlify/functions/plant-visual-variant-gaps'
};
