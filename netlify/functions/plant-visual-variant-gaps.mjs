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
async function loadPendingPromotionManifest(req,manifestId){
  if(!manifestId) return null;
  if(!/^[a-z0-9][a-z0-9._-]{0,95}$/.test(manifestId)) return null;
  const res=await fetch(
    new URL('/data/garden-design/plant-visual-qa-manifests/'+manifestId+'.json?t='+Date.now(),req.url),
    {cache:'no-store'}
  );
  if(!res.ok) return null;
  const doc=await res.json();
  if(doc?.contract!=='plant-visual-qa-manifest-v1'||doc?.manifestId!==manifestId||!Array.isArray(doc.rows)) return null;
  return doc;
}

function registryWithPending(registry,pendingManifest){
  if(!pendingManifest) return registry;
  const next=structuredClone(registry||{sets:[]});
  if(!Array.isArray(next.sets)) next.sets=[];
  for(const row of pendingManifest.rows||[]){
    if(row.productionApproved!==true) continue;
    let set=next.sets.find(s=>String(s.canonicalSlug||'').toLowerCase()===String(row.canonicalSlug||'').toLowerCase());
    if(!set){
      set={canonicalSlug:row.canonicalSlug,variants:[]};
      next.sets.push(set);
    }
    if(!Array.isArray(set.variants)) set.variants=[];
    set.variants.push({
      canonicalSlug:row.canonicalSlug,
      growthStage:row.growthStage,
      architectureMode:row.architectureMode||row.visualForm||'default',
      visualForm:row.visualForm||null,
      phenology:row.phenology||row.phenologyState||'vegetative',
      phenologyState:row.phenologyState||row.phenology||'vegetative',
      productionApproved:true,
      approvalState:'APPROVED',
      approvalStatus:'approved',
      status:'ready',
      transparencyReady:true,
      pendingPromotion:true,
      pendingManifestId:pendingManifest.manifestId
    });
  }
  return next;
}

export default async(req)=>{
  if(req.method!=='GET') return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const url=new URL(req.url);
  const pendingManifestId=String(url.searchParams.get('pendingManifest')||'').trim().toLowerCase();
  const slugs=String(url.searchParams.get('slugs')||'')
    .split(',').map(safeSlug).filter(Boolean);
  if(!slugs.length) return json(400,{ok:false,code:'SLUGS_REQUIRED'});
  if(slugs.length>100) return json(400,{ok:false,code:'TOO_MANY_SLUGS',maxSlugs:100});

  let registry=null;
  try{registry=await loadRegistry(req);}
  catch(err){return json(503,{ok:false,code:'REGISTRY_LOAD_FAILED',errorName:err?.message||null});}

  const pendingManifest=await loadPendingPromotionManifest(req,pendingManifestId);
  const effectiveRegistry=registryWithPending(registry,pendingManifest);

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
      ...buildPlantVisualVariantGapPlan({variantPlan,registry:effectiveRegistry}),
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
    coverageBasis:pendingManifest
      ? {productionRegistry:true,pendingPromotionManifest:pendingManifest.manifestId}
      : {productionRegistry:true,pendingPromotionManifest:null},
    results
  });
};

export const config={
  path:'/.netlify/functions/plant-visual-variant-gaps'
};
