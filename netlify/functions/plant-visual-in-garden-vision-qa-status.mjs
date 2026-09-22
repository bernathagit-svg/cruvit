import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
function env(name){try{const v=globalThis.Netlify?.env?.get?.(name);if(v)return v;}catch{}return process.env[name]||'';}
function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}});}
function safeId(v){const s=String(v||'').trim();return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(s)?s:'';}
function safeSegment(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');}
function client(){return new S3Client({region:'auto',endpoint:`https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),secretAccessKey:env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')}});}
async function readJson(c,bucket,key){try{const out=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));const b=Buffer.from(await out.Body.transformToByteArray());return JSON.parse(b.toString('utf8'));}catch(err){if(err?.name==='NoSuchKey'||err?.Code==='NoSuchKey'||err?.$metadata?.httpStatusCode===404)return null;throw err;}}
async function loadPlan(req,runId){const res=await fetch(new URL('/data/garden-design/plant-visual-in-garden-vision-qa-plans/'+runId+'.json',req.url),{headers:{'cache-control':'no-cache'}});if(!res.ok)return null;return res.json();}
function evidenceKey(plan,jobId){return `candidates/${safeSegment(plan.sourceManifestId)}/in-garden-vision-qa/${safeSegment(plan.runId)}/${safeSegment(jobId)}.json`;}
export default async(req)=>{
  if(req.method!=='GET')return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const url=new URL(req.url);const runId=safeId(url.searchParams.get('runId'));if(!runId)return json(400,{ok:false,code:'RUN_ID_REQUIRED'});
  const plan=await loadPlan(req,runId);if(!plan||!Array.isArray(plan.jobs))return json(404,{ok:false,code:'IN_GARDEN_VISION_PLAN_NOT_FOUND'});
  const required=['PLANT_VISUAL_R2_ACCOUNT_ID','PLANT_VISUAL_R2_ACCESS_KEY_ID','PLANT_VISUAL_R2_SECRET_ACCESS_KEY','PLANT_VISUAL_R2_CANDIDATES_BUCKET'];const missing=required.filter(k=>!env(k));if(missing.length)return json(500,{ok:false,code:'ENV_MISSING',missing});
  const c=client(),bucket=env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');const rows=[];let actualSpendUsd=0;
  for(const job of plan.jobs){const e=await readJson(c,bucket,evidenceKey(plan,job.jobId));if(!e){rows.push({jobId:job.jobId,canonicalSlug:job.canonicalSlug,status:'PENDING'});continue;}const s=Number(e.actualSpendUsd);if(Number.isFinite(s))actualSpendUsd+=s;rows.push({jobId:job.jobId,canonicalSlug:job.canonicalSlug,status:'REVIEWED',overall:e.overall||'UNCERTAIN',autoPassEligible:e.autoPassEligible===true,actualSpendUsd:Number.isFinite(s)?s:null,checks:e.checks||null,code:e.code||null});}
  return json(200,{ok:true,runId,jobCount:plan.jobCount,reviewed:rows.filter(r=>r.status==='REVIEWED').length,pending:rows.filter(r=>r.status==='PENDING').length,pass:rows.filter(r=>r.overall==='PASS').length,fail:rows.filter(r=>r.overall==='FAIL').length,uncertain:rows.filter(r=>r.overall==='UNCERTAIN').length,autoPassEligible:rows.filter(r=>r.autoPassEligible===true).length,actualSpendUsd:+actualSpendUsd.toFixed(6),productionWrites:0,registryWrites:0,rows});
};
export const config={path:'/.netlify/functions/plant-visual-in-garden-vision-qa-status'};
