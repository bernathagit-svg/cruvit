import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

function env(name){
  try{const v=globalThis.Netlify?.env?.get?.(name);if(v)return v;}catch{}
  return process.env[name]||'';
}
function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}});}
function safeId(v){const s=String(v||'').trim();return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(s)?s:'';}
function safeSegment(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');}
function client(){return new S3Client({region:'auto',endpoint:`https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),secretAccessKey:env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')}});}
async function readJson(c,bucket,key){
  try{
    const out=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));
    const bytes=Buffer.from(await out.Body.transformToByteArray());
    return JSON.parse(bytes.toString('utf8'));
  }catch(err){
    if(err?.name==='NoSuchKey'||err?.Code==='NoSuchKey'||err?.$metadata?.httpStatusCode===404)return null;
    throw err;
  }
}
async function loadPlan(req,runId){
  const res=await fetch(new URL('/data/garden-design/plant-visual-in-garden-model-qa-plans/'+runId+'.json',req.url),{headers:{'cache-control':'no-cache'}});
  if(!res.ok)return null;
  return res.json();
}
export default async(req)=>{
  if(req.method!=='GET')return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const url=new URL(req.url);
  const runId=safeId(url.searchParams.get('runId'));
  if(!runId)return json(400,{ok:false,code:'RUN_ID_REQUIRED'});
  const plan=await loadPlan(req,runId);
  if(!plan||!Array.isArray(plan.jobs))return json(404,{ok:false,code:'IN_GARDEN_QA_PLAN_NOT_FOUND'});
  const required=['PLANT_VISUAL_R2_ACCOUNT_ID','PLANT_VISUAL_R2_ACCESS_KEY_ID','PLANT_VISUAL_R2_SECRET_ACCESS_KEY','PLANT_VISUAL_R2_CANDIDATES_BUCKET'];
  const missing=required.filter(k=>!env(k));
  if(missing.length)return json(500,{ok:false,code:'ENV_MISSING',missing});
  const c=client(),bucket=env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
  const rows=[];
  for(const job of plan.jobs){
    const key=`candidates/${safeSegment(plan.sourceManifestId)}/in-garden-captures/${safeSegment(runId)}/${safeSegment(job.jobId)}.json`;
    const evidence=await readJson(c,bucket,key);
    rows.push(evidence?{
      jobId:job.jobId,
      canonicalSlug:job.canonicalSlug,
      status:'CAPTURED',
      captureObjectKey:evidence.captureObjectKey,
      sha256:evidence.sha256,
      bytes:evidence.bytes,
      geometry:evidence.geometry||null,
      realSavedGardenPhotoUsed:evidence.realSavedGardenPhotoUsed===true,
      rendererOwner:evidence.rendererOwner||null
    }:{
      jobId:job.jobId,
      canonicalSlug:job.canonicalSlug,
      status:'PENDING'
    });
  }
  return json(200,{
    ok:true,
    runId,
    jobCount:plan.jobCount,
    captured:rows.filter(r=>r.status==='CAPTURED').length,
    pending:rows.filter(r=>r.status==='PENDING').length,
    allRealSavedGardenPhoto:rows.filter(r=>r.status==='CAPTURED').every(r=>r.realSavedGardenPhotoUsed===true),
    productionWrites:0,
    registryWrites:0,
    rows
  });
};
export const config={path:'/.netlify/functions/plant-visual-in-garden-capture-status'};
