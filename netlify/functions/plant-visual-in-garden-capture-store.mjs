import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

function env(name){
  try{ const v=globalThis.Netlify?.env?.get?.(name); if(v) return v; }catch{}
  return process.env[name]||'';
}
function json(status,body){
  return new Response(JSON.stringify(body),{
    status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}
  });
}
function safeId(v){ const s=String(v||'').trim(); return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(s)?s:''; }
function safeSegment(v){ return String(v||'').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,''); }
function sha256(bytes){ return crypto.createHash('sha256').update(bytes).digest('hex'); }
function client(){ return new S3Client({
  region:'auto',
  endpoint:`https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials:{accessKeyId:env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),secretAccessKey:env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')}
});}
async function readBytes(c,bucket,key){
  try{
    const out=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));
    return Buffer.from(await out.Body.transformToByteArray());
  }catch(err){
    if(err?.name==='NoSuchKey'||err?.Code==='NoSuchKey'||err?.$metadata?.httpStatusCode===404) return null;
    throw err;
  }
}
async function loadPlan(req,runId){
  const res=await fetch(new URL('/data/garden-design/plant-visual-in-garden-model-qa-plans/'+runId+'.json',req.url),{headers:{'cache-control':'no-cache'}});
  if(!res.ok) return null;
  return res.json();
}
export default async (req)=>{
  if(req.method!=='POST') return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  let body={}; try{body=await req.json();}catch{return json(400,{ok:false,code:'JSON_BODY_REQUIRED'});}
  const runId=safeId(body.runId), jobId=safeId(body.jobId);
  if(!runId||!jobId) return json(400,{ok:false,code:'RUN_ID_AND_JOB_ID_REQUIRED'});
  const plan=await loadPlan(req,runId);
  if(!plan||!Array.isArray(plan.jobs)) return json(404,{ok:false,code:'IN_GARDEN_QA_PLAN_NOT_FOUND'});
  const job=plan.jobs.find(j=>j.jobId===jobId);
  if(!job) return json(404,{ok:false,code:'JOB_NOT_IN_IN_GARDEN_QA_PLAN'});
  const required=['PLANT_VISUAL_R2_ACCOUNT_ID','PLANT_VISUAL_R2_ACCESS_KEY_ID','PLANT_VISUAL_R2_SECRET_ACCESS_KEY','PLANT_VISUAL_R2_CANDIDATES_BUCKET'];
  const missing=required.filter(k=>!env(k));
  if(missing.length) return json(500,{ok:false,code:'ENV_MISSING',missing});

  const arr=Array.isArray(body.bytes)?body.bytes:null;
  if(!arr||!arr.length||arr.length>15*1024*1024) return json(400,{ok:false,code:'PNG_BYTES_REQUIRED'});
  const bytes=Buffer.from(arr);
  const digest=sha256(bytes);
  const bucket=env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
  const c=client();
  const key=`candidates/${safeSegment(plan.sourceManifestId)}/in-garden-captures/${safeSegment(runId)}/${safeSegment(jobId)}__${digest}.png`;
  const metaKey=`candidates/${safeSegment(plan.sourceManifestId)}/in-garden-captures/${safeSegment(runId)}/${safeSegment(jobId)}.json`;

  const existing=await readBytes(c,bucket,key);
  if(!existing){
    await c.send(new PutObjectCommand({
      Bucket:bucket,Key:key,Body:bytes,ContentType:'image/png',CacheControl:'private, no-store',
      Metadata:{'cruvit-run-id':runId,'cruvit-job-id':jobId,'cruvit-sha256':digest}
    }));
  }
  const readback=await readBytes(c,bucket,key);
  if(!readback||readback.length!==bytes.length||sha256(readback)!==digest){
    return json(409,{ok:false,code:'CAPTURE_READBACK_INTEGRITY_MISMATCH'});
  }
  const evidence={
    contract:'plant-visual-in-garden-capture-evidence-v1',
    runId,jobId,canonicalSlug:job.canonicalSlug,
    captureObjectKey:key,bytes:bytes.length,sha256:digest,
    geometry:body.geometry||null,
    rendererOwner:'Garden Design production renderer',
    realSavedGardenPhotoUsed:body.realSavedGardenPhotoUsed===true,
    sourceGardenSignedUrlPersisted:false,
    sourceGardenImageCopiedToPlantStorage:false,
    independentQaScaleMath:false,
    productionWrites:0,registryWrites:0,
    recordedAt:new Date().toISOString()
  };
  await c.send(new PutObjectCommand({
    Bucket:bucket,Key:metaKey,Body:Buffer.from(JSON.stringify(evidence,null,2)),
    ContentType:'application/json; charset=utf-8',CacheControl:'private, no-store'
  }));
  return json(200,{ok:true,code:'IN_GARDEN_CAPTURE_R2_VERIFIED',evidence});
};
export const config={path:'/.netlify/functions/plant-visual-in-garden-capture-store'};
