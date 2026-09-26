function env(name){
  try{return Netlify.env.get(name)||'';}catch{return process.env[name]||'';}
}
function js(status,source){
  return new Response(source,{
    status,
    headers:{
      'content-type':'application/javascript; charset=utf-8',
      'cache-control':status===200?'public, max-age=60, s-maxage=60':'no-store',
      'x-content-type-options':'nosniff',
      'x-robots-tag':'noindex, nofollow'
    }
  });
}
function safeJson(value){
  return JSON.stringify(value)
    .replace(/</g,'\\u003c')
    .replace(/\u2028/g,'\\u2028')
    .replace(/\u2029/g,'\\u2029');
}

export default async(req)=>{
  if(req.method!=='GET') return js(405,'window.__CRUVIT_CANONICAL_CLIMATE_BOOTSTRAP={ready:false,code:"METHOD_NOT_ALLOWED",plants:{}};');
  const base=String(env('SUPABASE_URL')||'').replace(/\/$/,'');
  const anon=String(env('SUPABASE_ANON_KEY')||'');
  if(!base||!anon){
    return js(503,'window.__CRUVIT_CANONICAL_CLIMATE_BOOTSTRAP={ready:false,code:"SUPABASE_CATALOG_CONFIG_MISSING",plants:{}};');
  }
  const path='/rest/v1/catalog_plants'
    +'?select=slug,scientific_name,climate_traits,flowering_requirements,fruiting_requirements,verification_state,needs_review,updated_at'
    +'&order=slug.asc'
    +'&limit=1000';
  let res;
  try{
    res=await fetch(base+path,{
      headers:{
        apikey:anon,
        authorization:'Bearer '+anon,
        accept:'application/json',
        'cache-control':'no-store'
      }
    });
  }catch{
    return js(503,'window.__CRUVIT_CANONICAL_CLIMATE_BOOTSTRAP={ready:false,code:"CANONICAL_CATALOG_NETWORK_FAILED",plants:{}};');
  }
  let rows=[];
  try{rows=await res.json();}catch{rows=[];}
  if(!res.ok||!Array.isArray(rows)){
    return js(503,'window.__CRUVIT_CANONICAL_CLIMATE_BOOTSTRAP={ready:false,code:"CANONICAL_CATALOG_READ_FAILED",plants:{}};');
  }
  const plants={};
  for(const row of rows){
    const slug=String(row?.slug||'').trim().toLowerCase();
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) continue;
    plants[slug]={
      scientific:String(row?.scientific_name||'').trim()||null,
      climateTraits:row?.climate_traits&&typeof row.climate_traits==='object'?row.climate_traits:null,
      floweringRequirements:row?.flowering_requirements??null,
      fruitingRequirements:row?.fruiting_requirements??null,
      verificationState:String(row?.verification_state||'').trim()||null,
      needsReview:row?.needs_review===true,
      updatedAt:row?.updated_at||null
    };
  }
  const payload={
    ready:true,
    code:'CANONICAL_CATALOG_CLIMATE_READY',
    contract:'canonical-runtime-climate-bootstrap-v1',
    loadedAt:new Date().toISOString(),
    count:Object.keys(plants).length,
    plants
  };
  return js(200,'window.__CRUVIT_CANONICAL_CLIMATE_BOOTSTRAP='+safeJson(payload)+';');
};
export const config={path:'/.netlify/functions/catalog-runtime-climate-bootstrap'};
