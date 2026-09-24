import crypto from 'node:crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
function env(name){try{const v=globalThis.Netlify?.env?.get?.(name);if(v)return v;}catch{} return process.env[name]||'';}
function safe(v){const s=String(v||'').trim();return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,180}$/.test(s)?s:'';}
function safeSeg(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');}
function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}});}
function sha256(b){return crypto.createHash('sha256').update(b).digest('hex');}
function client(){return new S3Client({region:'auto',endpoint:`https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),secretAccessKey:env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')}});}
async function read(c,bucket,key){const out=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));return Buffer.from(await out.Body.transformToByteArray());}
async function loadPlan(req,runId){const res=await fetch(new URL('/data/garden-design/plant-visual-in-garden-model-qa-plans/'+runId+'.json',req.url),{headers:{'cache-control':'no-cache'}});return res.ok?res.json():null;}
export default async(req)=>{
  if(req.method!=='GET')return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const url=new URL(req.url),runId=safe(url.searchParams.get('runId')),jobId=safe(url.searchParams.get('jobId'));
  if(!runId||!jobId)return json(400,{ok:false,code:'RUN_AND_JOB_REQUIRED'});
  const plan=await loadPlan(req,runId); if(!plan)return json(404,{ok:false,code:'PLAN_NOT_FOUND'});
  const job=(plan.jobs||[]).find(j=>j.jobId===jobId); if(!job)return json(404,{ok:false,code:'JOB_NOT_IN_PLAN'});
  const required=['PLANT_VISUAL_R2_ACCOUNT_ID','PLANT_VISUAL_R2_ACCESS_KEY_ID','PLANT_VISUAL_R2_SECRET_ACCESS_KEY','PLANT_VISUAL_R2_CANDIDATES_BUCKET'];
  const missing=required.filter(k=>!env(k)); if(missing.length)return json(500,{ok:false,code:'ENV_MISSING',missing});
  const c=client(),bucket=env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
  const evidenceKey=`candidates/${safeSeg(plan.sourceManifestId)}/in-garden-captures/${safeSeg(runId)}/${safeSeg(jobId)}.json`;
  try{
    const ev=JSON.parse((await read(c,bucket,evidenceKey)).toString('utf8'));
    const key=String(ev.captureObjectKey||''); const expected=String(ev.sha256||'');
    if(!key.startsWith('candidates/')||!/^[a-f0-9]{64}$/.test(expected))return json(422,{ok:false,code:'EVIDENCE_INVALID'});
    const bytes=await read(c,bucket,key); if(sha256(bytes)!==expected)return json(409,{ok:false,code:'CAPTURE_SHA_MISMATCH'});
    return new Response(bytes,{status:200,headers:{'content-type':'image/jpeg','cache-control':'private, no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex','x-cruvit-qa-run':runId,'x-cruvit-job-id':jobId}});
  }catch(err){return json(502,{ok:false,code:'CAPTURE_READ_FAILED',errorName:err?.name||null});}
};
export const config={path:'/.netlify/functions/plant-visual-in-garden-current-capture-image'};