import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

function env(name){
  try{const v=globalThis.Netlify?.env?.get?.(name);if(v)return v;}catch{}
  return process.env[name]||'';
}
function json(status,body){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'private, no-store',
      'x-robots-tag':'noindex, nofollow'
    }
  });
}
function safeId(v){
  const s=String(v||'').trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(s)?s:'';
}
function safeSegment(v){
  return String(v||'').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');
}
function client(){
  return new S3Client({
    region:'auto',
    endpoint:`https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials:{
      accessKeyId:env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),
      secretAccessKey:env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')
    }
  });
}
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
  const res=await fetch(new URL('/data/garden-design/plant-visual-natural-blend-plans/'+runId+'.json',req.url),{headers:{'cache-control':'no-cache'}});
  if(!res.ok)return null;
  return res.json();
}

function naturalBlendCostUsd(usage){
  if(!usage||typeof usage!=='object') return null;
  const input=usage.input_tokens_details||{};
  const output=usage.output_tokens_details||{};
  const imageInput=Number(input.image_tokens);
  const textInput=Number(input.text_tokens);
  const imageOutput=Number(output.image_tokens ?? usage.output_tokens);
  if(!Number.isFinite(imageInput)||!Number.isFinite(textInput)||!Number.isFinite(imageOutput)){
    return null;
  }
  return +(
    imageInput * 8 / 1_000_000
    + textInput * 5 / 1_000_000
    + imageOutput * 30 / 1_000_000
  ).toFixed(6);
}

export default async(req)=>{
  if(req.method!=='GET')return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const url=new URL(req.url);
  const runId=safeId(url.searchParams.get('runId'));
  if(!runId)return json(400,{ok:false,code:'RUN_ID_REQUIRED'});
  const plan=await loadPlan(req,runId);
  if(!plan)return json(404,{ok:false,code:'NATURAL_BLEND_PLAN_NOT_FOUND'});
  const required=['PLANT_VISUAL_R2_ACCOUNT_ID','PLANT_VISUAL_R2_ACCESS_KEY_ID','PLANT_VISUAL_R2_SECRET_ACCESS_KEY','PLANT_VISUAL_R2_CANDIDATES_BUCKET'];
  const missing=required.filter(k=>!env(k));
  if(missing.length)return json(500,{ok:false,code:'ENV_MISSING',missing});
  const c=client(),bucket=env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
  const prefix=`candidates/${safeSegment(plan.sourceManifestId)}/natural-blend/${safeSegment(plan.runId)}`;
  const evidence=await readJson(c,bucket,prefix+'/evidence.json');
  const compositeEvidence=await readJson(c,bucket,prefix+'/composite-evidence.json');
  const lock=await readJson(c,bucket,prefix+'/lock.json');
  return json(200,{
    ok:true,
    runId,
    jobId:plan.sourceJobId,
    status:evidence
      ? (evidence.code==='NATURAL_BLEND_EDIT_RECORDED'?'COMPLETED':'EVIDENCE_RECORDED')
      : (lock?'CLAIMED_NO_EVIDENCE':'PENDING'),
    evidence:evidence?{
      code:evidence.code||null,
      model:evidence.model||null,
      quality:evidence.quality||null,
      cropSha256:evidence.cropSha256||null,
      maskSha256:evidence.maskSha256||null,
      outputSha256:evidence.outputSha256||null,
      outputObjectKey:evidence.outputObjectKey||null,
      ownerReviewRequired:evidence.ownerReviewRequired===true,
      productionWrites:evidence.productionWrites||0,
      registryWrites:evidence.registryWrites||0,
      recordedAt:evidence.recordedAt||null,
      providerError:evidence.providerError||null,
      httpStatus:evidence.httpStatus||null,
      usage:evidence.usage||null,
      actualCostUsd:naturalBlendCostUsd(evidence.usage)
    }:null,
    compositeEvidence:compositeEvidence?{
      code:compositeEvidence.code||null,
      sourceCaptureObjectKey:compositeEvidence.sourceCaptureObjectKey||null,
      sourceCaptureSha256:compositeEvidence.sourceCaptureSha256||null,
      naturalBlendOutputObjectKey:compositeEvidence.naturalBlendOutputObjectKey||null,
      naturalBlendOutputSha256:compositeEvidence.naturalBlendOutputSha256||null,
      finalCompositeObjectKey:compositeEvidence.finalCompositeObjectKey||null,
      finalCompositeSha256:compositeEvidence.finalCompositeSha256||null,
      bytes:compositeEvidence.bytes||null,
      hardCompositeClientApplied:compositeEvidence.hardCompositeClientApplied===true,
      productionWrites:compositeEvidence.productionWrites||0,
      registryWrites:compositeEvidence.registryWrites||0,
      recordedAt:compositeEvidence.recordedAt||null
    }:null,
    claimedAt:lock?.claimedAt||null,
    retriesAllowed:lock?.retriesAllowed===true
  });
};

export const config={path:'/.netlify/functions/plant-visual-natural-blend-status'};
