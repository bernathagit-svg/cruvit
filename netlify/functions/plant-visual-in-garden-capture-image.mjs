import crypto from 'node:crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

function env(name){ try{return Netlify.env.get(name)||'';}catch{return '';} }
function safeId(v,max=180){ const s=String(v||'').trim(); return new RegExp('^[A-Za-z0-9][A-Za-z0-9._:-]{0,'+(max-1)+'}$').test(s)?s:''; }
function safeRun(v){ const s=String(v||'').trim(); return /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(s)?s:''; }
function json(status,body){ return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}}); }
function sha256(bytes){ return crypto.createHash('sha256').update(bytes).digest('hex'); }
function client(){ return new S3Client({region:'auto',endpoint:`https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),secretAccessKey:env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')}}); }
async function readBytes(c,bucket,key){ const out=await c.send(new GetObjectCommand({Bucket:bucket,Key:key})); return Buffer.from(await out.Body.transformToByteArray()); }
async function readJson(c,bucket,key){ const b=await readBytes(c,bucket,key); return JSON.parse(b.toString('utf8')); }
async function loadPlan(req,runId){
  const res=await fetch(new URL('/data/garden-design/plant-visual-in-garden-vision-qa-plans/'+runId+'.json',req.url),{headers:{'cache-control':'no-cache'}});
  if(!res.ok) return null;
  return res.json();
}
export default async(req)=>{
  if(req.method!=='GET') return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const url=new URL(req.url);
  const runId=safeRun(url.searchParams.get('runId'));
  const jobId=safeId(url.searchParams.get('jobId'));
  if(!runId||!jobId) return json(400,{ok:false,code:'RUN_AND_JOB_REQUIRED'});
  const plan=await loadPlan(req,runId);
  if(!plan||!Array.isArray(plan.jobs)) return json(404,{ok:false,code:'VISION_PLAN_NOT_FOUND'});
  const job=plan.jobs.find(j=>j.jobId===jobId);
  if(!job) return json(404,{ok:false,code:'JOB_NOT_IN_VISION_PLAN'});
  const captureKey=String(job.captureObjectKey||'');
  const captureSha=String(job.captureSha256||'');
  if(!captureKey.startsWith('candidates/')||!/^[a-f0-9]{64}$/.test(captureSha)) return json(422,{ok:false,code:'CAPTURE_REFERENCE_INVALID'});
  const required=['PLANT_VISUAL_R2_ACCOUNT_ID','PLANT_VISUAL_R2_ACCESS_KEY_ID','PLANT_VISUAL_R2_SECRET_ACCESS_KEY','PLANT_VISUAL_R2_CANDIDATES_BUCKET'];
  const missing=required.filter(k=>!env(k)); if(missing.length) return json(500,{ok:false,code:'ENV_MISSING',missing});
  const c=client(),bucket=env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
  try{
    const bytes=await readBytes(c,bucket,captureKey);
    if(sha256(bytes)!==captureSha) return json(409,{ok:false,code:'CAPTURE_SHA_MISMATCH'});
    return new Response(bytes,{status:200,headers:{'content-type':'image/jpeg','cache-control':'private, no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex','x-cruvit-qa-run':runId,'x-cruvit-job-id':jobId}});
  }catch(err){
    return json(502,{ok:false,code:'CAPTURE_READ_FAILED',errorName:err?.name||null});
  }
};
export const config={path:'/.netlify/functions/plant-visual-in-garden-capture-image'};