import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

function env(name) {
  try {
    const value = globalThis.Netlify?.env?.get?.(name);
    if (value) return value;
  } catch {}
  return process.env[name] || '';
}
function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type':'application/json; charset=utf-8',
      'cache-control':'private, no-store',
      'x-robots-tag':'noindex, nofollow'
    }
  });
}
function safeId(value) {
  const id=String(value||'').trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(id) ? id : '';
}
function safeSegment(value) {
  return String(value||'').trim().toLowerCase()
    .replace(/[^a-z0-9._-]+/g,'-')
    .replace(/^-+|-+$/g,'');
}
function s3Client() {
  return new S3Client({
    region:'auto',
    endpoint:`https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials:{
      accessKeyId:env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),
      secretAccessKey:env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')
    }
  });
}
async function readJsonObject(client,bucket,key){
  try{
    const out=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));
    const bytes=Buffer.from(await out.Body.transformToByteArray());
    return JSON.parse(bytes.toString('utf8'));
  }catch(err){
    if(err?.name==='NoSuchKey'||err?.Code==='NoSuchKey'||err?.$metadata?.httpStatusCode===404) return null;
    throw err;
  }
}
async function loadPlan(req,runId){
  const res=await fetch(new URL('/data/garden-design/plant-visual-model-qa-plans/'+runId+'.json',req.url),{headers:{'cache-control':'no-cache'}});
  if(!res.ok) return null;
  return res.json();
}
function evidenceKey(plan,jobId){
  return `candidates/${safeSegment(plan.sourceManifestId)}/model-qa/${safeSegment(plan.runId)}/${safeSegment(jobId)}.json`;
}
export default async (req)=>{
  if(req.method!=='GET') return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const url=new URL(req.url);
  const runId=safeId(url.searchParams.get('runId'));
  if(!runId) return json(400,{ok:false,code:'RUN_ID_REQUIRED'});
  const plan=await loadPlan(req,runId);
  if(!plan||!Array.isArray(plan.jobs)) return json(404,{ok:false,code:'MODEL_QA_PLAN_NOT_FOUND'});
  const required=['PLANT_VISUAL_R2_ACCOUNT_ID','PLANT_VISUAL_R2_ACCESS_KEY_ID','PLANT_VISUAL_R2_SECRET_ACCESS_KEY','PLANT_VISUAL_R2_CANDIDATES_BUCKET'];
  const missing=required.filter(k=>!env(k));
  if(missing.length) return json(500,{ok:false,code:'ENV_MISSING',missing});
  const client=s3Client();
  const bucket=env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
  const rows=[];
  let actualSpendUsd=0;
  for(const job of plan.jobs){
    const evidence=await readJsonObject(client,bucket,evidenceKey(plan,job.jobId));
    if(!evidence){
      rows.push({jobId:job.jobId,canonicalSlug:job.canonicalSlug,status:'PENDING'});
      continue;
    }
    const spend=Number(evidence.actualSpendUsd);
    if(Number.isFinite(spend)) actualSpendUsd+=spend;
    rows.push({
      jobId:job.jobId,
      canonicalSlug:job.canonicalSlug,
      status:'REVIEWED',
      overall:evidence.overall||'UNCERTAIN',
      autoPassEligible:evidence.autoPassEligible===true,
      actualSpendUsd:Number.isFinite(spend)?spend:null,
      code:evidence.code||null,
      checks:evidence.checks||null
    });
  }
  return json(200,{
    ok:true,
    runId,
    jobCount:plan.jobCount,
    reviewed:rows.filter(r=>r.status==='REVIEWED').length,
    pending:rows.filter(r=>r.status==='PENDING').length,
    pass:rows.filter(r=>r.overall==='PASS').length,
    fail:rows.filter(r=>r.overall==='FAIL').length,
    uncertain:rows.filter(r=>r.overall==='UNCERTAIN').length,
    autoPassEligible:rows.filter(r=>r.autoPassEligible===true).length,
    actualSpendUsd:+actualSpendUsd.toFixed(6),
    productionWrites:0,
    registryWrites:0,
    rows
  });
};
export const config={path:'/.netlify/functions/plant-visual-model-qa-status'};
