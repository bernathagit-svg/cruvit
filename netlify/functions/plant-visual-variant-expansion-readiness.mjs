import { routeVariantExpansion } from '../../modules/garden-design/asset-factory-v1/plant-visual-variant-expansion-route-v1.js';

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
function safeId(value){
  const s=String(value||'').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(s)?s:'';
}
async function staticJson(req,path){
  const res=await fetch(new URL(path+'?t='+Date.now(),req.url),{cache:'no-store'});
  if(!res.ok) return null;
  return res.json();
}

export default async(req)=>{
  if(req.method!=='GET') return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const url=new URL(req.url);
  const slugs=String(url.searchParams.get('slugs')||'').split(',').map(safeSlug).filter(Boolean);
  if(!slugs.length) return json(400,{ok:false,code:'SLUGS_REQUIRED'});
  if(slugs.length>50) return json(400,{ok:false,code:'TOO_MANY_SLUGS',maxSlugs:50});

  const pendingManifest=safeId(url.searchParams.get('pendingManifest'));
  const candidateManifest=safeId(url.searchParams.get('candidateManifest'));

  const gapsUrl=new URL('/.netlify/functions/plant-visual-variant-gaps',req.url);
  gapsUrl.searchParams.set('slugs',slugs.join(','));
  if(pendingManifest) gapsUrl.searchParams.set('pendingManifest',pendingManifest);
  const gapsRes=await fetch(gapsUrl,{cache:'no-store'});
  if(!gapsRes.ok) return json(503,{ok:false,code:'VARIANT_GAPS_UNAVAILABLE',status:gapsRes.status});
  const gaps=await gapsRes.json();

  const sizeRegistry=await staticJson(req,'/data/catalog/botanical-size-authority-v1.json');
  if(!sizeRegistry) return json(503,{ok:false,code:'SIZE_AUTHORITY_REGISTRY_UNAVAILABLE'});

  let candidateRows=[];
  if(candidateManifest){
    const doc=await staticJson(
      req,
      '/data/garden-design/plant-visual-qa-manifests/'+candidateManifest+'.json'
    );
    if(doc?.contract==='plant-visual-qa-manifest-v1'&&Array.isArray(doc.rows)){
      candidateRows=doc.rows;
    }
  }

  const routes=(gaps.results||[]).map(gapPlan=>
    routeVariantExpansion({
      gapPlan,
      sizeAuthorityRegistry:sizeRegistry,
      candidateRows:candidateRows.filter(row=>
        String(row.canonicalSlug||'').toLowerCase()===String(gapPlan.canonicalSlug||'').toLowerCase()
      )
    })
  );

  const totals={};
  for(const route of routes){
    for(const [key,value] of Object.entries(route.counts||{})){
      totals[key]=(totals[key]||0)+Number(value||0);
    }
  }

  return json(200,{
    ok:true,
    version:'plant-visual-variant-expansion-route-v1',
    slugs,
    pendingManifest:pendingManifest||null,
    candidateManifest:candidateManifest||null,
    totalMissingRequired:(gaps.results||[]).reduce((n,x)=>n+(x.missingRequiredCount||0),0),
    totals,
    paidGenerationReady:routes.reduce((n,x)=>n+(x.paidGenerationReady||0),0),
    qaRepairReady:routes.reduce((n,x)=>n+(x.qaRepairReady||0),0),
    blockedBeforeGeneration:routes.reduce((n,x)=>n+(x.blockedBeforeGeneration||0),0),
    paidCalls:0,
    productionWrites:0,
    registryWrites:0,
    routes
  });
};

export const config={
  path:'/.netlify/functions/plant-visual-variant-expansion-readiness'
};
