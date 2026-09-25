import { planEndToEndPlantBatch } from '../../modules/catalog/cruvit-e2e-plant-batch-planner-v1.js';
function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'}});}
function safeSlug(v){const s=String(v||'').trim().toLowerCase();return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)?s:'';}
export default async(req)=>{
  if(!['GET','POST'].includes(req.method)) return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  let slugs=[];
  if(req.method==='GET'){
    slugs=String(new URL(req.url).searchParams.get('slugs')||'').split(',').map(safeSlug).filter(Boolean);
  }else{
    let body={};try{body=await req.json();}catch{return json(400,{ok:false,code:'JSON_BODY_REQUIRED'});}
    slugs=(Array.isArray(body.slugs)?body.slugs:[]).map(safeSlug).filter(Boolean);
  }
  if(!slugs.length) return json(400,{ok:false,code:'SLUGS_REQUIRED'});
  if(slugs.length>100) return json(400,{ok:false,code:'TOO_MANY_SLUGS',maxSlugs:100});
  const u=new URL('/.netlify/functions/full-cruvit-plant-approval',req.url);
  u.searchParams.set('slugs',slugs.join(','));
  const res=await fetch(u,{cache:'no-store'});
  if(!res.ok) return json(503,{ok:false,code:'FULL_APPROVAL_UNAVAILABLE',status:res.status});
  const full=await res.json();
  return json(200,{ok:true,...planEndToEndPlantBatch(full.evaluations||[])});
};
export const config={path:'/.netlify/functions/cruvit-e2e-plant-batch-plan'};
