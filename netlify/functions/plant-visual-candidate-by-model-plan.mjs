import crypto from 'node:crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

function env(name){try{const v=globalThis.Netlify?.env?.get?.(name);if(v)return v;}catch{}return process.env[name]||'';}
function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}});}
function safeId(v){const s=String(v||'').trim();return /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/.test(s)?s:'';}
function sha256(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function client(){return new S3Client({region:'auto',endpoint:`https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),secretAccessKey:env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')}});}
async function staticJson(req,path){const res=await fetch(new URL(path,req.url),{headers:{'cache-control':'no-cache'}});if(!res.ok)return null;try{return await res.json();}catch{return null;}}
async function readBytes(c,bucket,key){const out=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));return Buffer.from(await out.Body.transformToByteArray());}

export default async(req)=>{
  if(req.method!=='GET') return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const u=new URL(req.url);
  const runId=safeId(u.searchParams.get('runId'));
  const jobId=safeId(u.searchParams.get('jobId'));
  if(!runId||!jobId) return json(400,{ok:false,code:'RUN_ID_AND_JOB_ID_REQUIRED'});

  const plan=await staticJson(req,'/data/garden-design/plant-visual-model-qa-plans/'+runId+'.json');
  if(!plan||plan.contract!=='plant-visual-model-qa-plan-v1'||plan.runId!==runId) {
    return json(404,{ok:false,code:'MODEL_QA_PLAN_NOT_FOUND'});
  }
  const job=(plan.jobs||[]).find(x=>x?.jobId===jobId);
  if(!job||!job.objectKey||!job.sha256||!Number(job.bytes)) return json(404,{ok:false,code:'JOB_NOT_IN_MODEL_QA_PLAN'});
  if(!String(job.objectKey).startsWith('candidates/')) return json(422,{ok:false,code:'NON_CANDIDATE_OBJECT_FORBIDDEN'});

  const required=['PLANT_VISUAL_R2_ACCOUNT_ID','PLANT_VISUAL_R2_ACCESS_KEY_ID','PLANT_VISUAL_R2_SECRET_ACCESS_KEY','PLANT_VISUAL_R2_CANDIDATES_BUCKET'];
  const missing=required.filter(k=>!env(k)); if(missing.length)return json(500,{ok:false,code:'ENV_MISSING',missing});

  try{
    const c=client(),bucket=env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
    const bytes=await readBytes(c,bucket,job.objectKey);
    if(bytes.length!==Number(job.bytes)) return json(409,{ok:false,code:'CANDIDATE_BYTES_MISMATCH'});
    if(sha256(bytes)!==String(job.sha256).toLowerCase()) return json(409,{ok:false,code:'CANDIDATE_SHA_MISMATCH'});
    return new Response(bytes,{status:200,headers:{
      'content-type':'image/png',
      'cache-control':'private, no-store',
      'x-robots-tag':'noindex, nofollow',
      'x-cruvit-model-qa-run':runId,
      'x-cruvit-job-id':jobId
    }});
  }catch(err){
    return json(502,{ok:false,code:'R2_READ_FAILED',errorName:err?.name||null});
  }
};
export const config={path:'/.netlify/functions/plant-visual-candidate-by-model-plan'};
