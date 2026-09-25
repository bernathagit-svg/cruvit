import {
  evaluateFullCruvitPlantApproval,
  summarizeFullCruvitPlantApproval
} from '../../modules/catalog/full-cruvit-plant-approval-v1.js';
import { fetchCanonicalCatalogRow } from './_plant-full-onboarding-gate-v1.mjs';

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
async function staticJson(req,path){
  const res=await fetch(new URL(path+'?t='+Date.now(),req.url),{cache:'no-store'});
  if(!res.ok) throw new Error('STATIC_DATA_UNAVAILABLE:'+path);
  return res.json();
}
async function requestSlugs(req){
  if(req.method==='GET'){
    const u=new URL(req.url);
    return String(u.searchParams.get('slugs')||'').split(',').map(safeSlug).filter(Boolean);
  }
  if(req.method==='POST'){
    let body={}; try{body=await req.json();}catch{return null;}
    return (Array.isArray(body.slugs)?body.slugs:[]).map(safeSlug).filter(Boolean);
  }
  return null;
}

export default async(req)=>{
  const slugs=await requestSlugs(req);
  if(slugs===null) return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  if(!slugs.length) return json(400,{ok:false,code:'SLUGS_REQUIRED'});
  if(slugs.length>100) return json(400,{ok:false,code:'TOO_MANY_SLUGS',maxSlugs:100});

  let identityRegistry,designAssetRegistry,sizeAuthorityRegistry,catalogMediaCoverage;
  try{
    [identityRegistry,designAssetRegistry,sizeAuthorityRegistry,catalogMediaCoverage]=await Promise.all([
      staticJson(req,'/data/plant-identity.registry.json'),
      staticJson(req,'/modules/garden-design/assets/plants/design-asset-registry-v1.json'),
      staticJson(req,'/data/catalog/botanical-size-authority-v1.json'),
      staticJson(req,'/data/catalog-media/active-canonical-image-coverage-v1.json')
    ]);
  }catch(err){
    return json(503,{ok:false,code:'APPROVAL_STATIC_DATA_UNAVAILABLE',errorName:err?.message||null});
  }

  const evaluations=[];
  for(const slug of slugs){
    let row=null;
    try{ row=await fetchCanonicalCatalogRow(slug); }
    catch(err){
      return json(503,{ok:false,code:'CANONICAL_CATALOG_READ_FAILED',canonicalSlug:slug,errorName:err?.message||null});
    }
    const id=(identityRegistry?.canonicalIdentities||[]).find(x=>
      String(x?.canonicalSlug||'').toLowerCase()===slug
      || (x?.aliasSlugs||[]).some(a=>String(a||'').toLowerCase()===slug)
    )||null;
    const mediaSlug=String(id?.canonicalSlug||slug).toLowerCase();
    const mediaRecord=(catalogMediaCoverage?.records||[]).find(x=>String(x?.slug||'').toLowerCase()===mediaSlug)||null;
    evaluations.push(evaluateFullCruvitPlantApproval({
      catalogRow:row,
      identityRegistry,
      designAssetRegistry,
      sizeAuthorityRegistry,
      catalogMediaCoverageRecord:mediaRecord
    }));
  }

  const summary=summarizeFullCruvitPlantApproval(evaluations);
  const compact=new URL(req.url).searchParams.get('compact')==='1';
  if(compact){
    const blockerCounts={};
    for(const row of evaluations){
      for(const b of row.blockingReasons||[]) blockerCounts[b]=(blockerCounts[b]||0)+1;
    }
    return json(200,{
      ok:true,
      version:summary.version,
      total:summary.total,
      approved:summary.approved,
      blocked:summary.blocked,
      byStatus:summary.byStatus,
      blockerCounts,
      rows:evaluations.map(row=>({
        canonicalSlug:row.canonicalSlug,
        scientific:row.scientific,
        status:row.status,
        approved:row.approved,
        blockingReasons:row.blockingReasons,
        climateClass:row.modules?.climateAndSuitability?.readinessClass||null,
        identityReady:row.modules?.canonicalIdentity?.ready===true,
        mediaReady:row.modules?.myGarden?.catalogMedia?.ready===true,
        doctorReady:row.modules?.plantDoctor?.ready===true,
        gardenDesignReady:row.modules?.gardenDesign?.ready===true,
        missingVisualVariants:row.modules?.gardenDesign?.missingRequiredCount??null,
        sizeStates:row.modules?.gardenDesign?.sizeAuthority?.states||[]
      }))
    });
  }
  return json(200,{ok:true,...summary});
};

export const config={path:'/.netlify/functions/full-cruvit-plant-approval'};
