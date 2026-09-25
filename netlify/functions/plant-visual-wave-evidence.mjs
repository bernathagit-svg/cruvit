import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

function env(name){try{const v=globalThis.Netlify?.env?.get?.(name);if(v)return v;}catch{}return process.env[name]||'';}
function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}});}
function safeId(v){const s=String(v||'').trim();return /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/.test(s)?s:'';}
function safeSegment(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');}
function client(){return new S3Client({region:'auto',endpoint:`https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),secretAccessKey:env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')}});}
async function readJson(c,bucket,key){try{const out=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));const b=Buffer.from(await out.Body.transformToByteArray());return JSON.parse(b.toString('utf8'));}catch(err){if(err?.name==='NoSuchKey'||err?.Code==='NoSuchKey'||err?.$metadata?.httpStatusCode===404)return null;throw err;}}

export default async(req)=>{
  if(req.method!=='GET')return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const u=new URL(req.url);
  const runId=safeId(u.searchParams.get('runId'));
  const jobId=safeId(u.searchParams.get('jobId'));
  if(!runId||!jobId)return json(400,{ok:false,code:'RUN_ID_AND_JOB_ID_REQUIRED'});
  const required=['PLANT_VISUAL_R2_ACCOUNT_ID','PLANT_VISUAL_R2_ACCESS_KEY_ID','PLANT_VISUAL_R2_SECRET_ACCESS_KEY','PLANT_VISUAL_R2_CANDIDATES_BUCKET'];
  const missing=required.filter(k=>!env(k));if(missing.length)return json(500,{ok:false,code:'ENV_MISSING',missing});
  const key=`candidates/${safeSegment(runId)}/evidence/${safeSegment(jobId)}.json`;
  const evidence=await readJson(client(),env('PLANT_VISUAL_R2_CANDIDATES_BUCKET'),key);
  if(!evidence)return json(404,{ok:false,code:'WAVE_EVIDENCE_NOT_FOUND',runId,jobId});
  return json(200,{ok:true,evidence});
};
export const config={path:'/.netlify/functions/plant-visual-wave-evidence'};