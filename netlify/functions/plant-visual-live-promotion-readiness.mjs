import { evaluateQaManifestPromotionReadiness } from '../../modules/garden-design/asset-factory-v1/plant-visual-promotion-readiness-v1.js';
import { evaluateLiveFullPlantOnboarding } from './_plant-full-onboarding-gate-v1.mjs';

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

function safeManifestId(value) {
  const id=String(value||'').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(id)?id:'';
}

async function loadManifest(req, manifestId) {
  const url=new URL('/data/garden-design/plant-visual-qa-manifests/'+manifestId+'.json',req.url);
  const res=await fetch(url,{headers:{'cache-control':'no-cache'}});
  if(!res.ok) throw new Error('QA_MANIFEST_NOT_FOUND');
  const manifest=await res.json();
  if(!manifest || manifest.contract!=='plant-visual-qa-manifest-v1' || manifest.manifestId!==manifestId || !Array.isArray(manifest.rows)){
    throw new Error('QA_MANIFEST_INVALID');
  }
  return manifest;
}

export default async (req) => {
  if(req.method!=='GET') return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const url=new URL(req.url);
  const manifestId=safeManifestId(url.searchParams.get('manifest'));
  if(!manifestId) return json(400,{ok:false,code:'MANIFEST_REQUIRED'});

  let manifest;
  try{manifest=await loadManifest(req,manifestId);}
  catch(err){return json(404,{ok:false,code:err?.message||'QA_MANIFEST_LOAD_FAILED'});}

  let onboarding;
  try{
    onboarding=await evaluateLiveFullPlantOnboarding(
      manifest.rows.map(row=>({
        canonicalSlug:row.canonicalSlug,
        scientific:row.scientific||null,
        phenology:row.phenology||'vegetative'
      }))
    );
  }catch(err){
    return json(503,{ok:false,code:'FULL_PLANT_ONBOARDING_CHECK_UNAVAILABLE',errorName:err?.message||null});
  }

  const visual=evaluateQaManifestPromotionReadiness(manifest);
  const evaluations=visual.evaluations.map((v,index)=>{
    // evaluateLiveFullPlantOnboarding preserves the exact manifest row order.
    // Merge by index, not canonicalSlug, because one plant may have multiple
    // growth-stage / phenology variants in the same manifest.
    const o=onboarding.evaluations[index]||null;
    const ready=Boolean(v.ready && o?.ready===true);
    return {
      jobId:v.jobId,
      canonicalSlug:v.canonicalSlug,
      ready,
      code: ready
        ? 'FULL_PROMOTION_READY'
        : (o?.ready===false ? 'FULL_PLANT_ONBOARDING_BLOCKED' : v.code),
      visualReady:v.ready===true,
      onboardingReady:o?.ready===true,
      visual:v,
      onboarding:o
    };
  });

  return json(200,{
    ok:true,
    version:'plant-visual-live-promotion-readiness-v1',
    manifestId,
    totalJobs:evaluations.length,
    readyJobs:evaluations.filter(x=>x.ready).length,
    blockedJobs:evaluations.filter(x=>!x.ready).length,
    productionWrites:0,
    registryWrites:0,
    onboardingSummary:{
      version:onboarding.version,
      total:onboarding.total,
      ready:onboarding.ready,
      blocked:onboarding.blocked,
      allReady:onboarding.allReady
    },
    evaluations
  });
};

export const config={
  path:'/.netlify/functions/plant-visual-live-promotion-readiness'
};
