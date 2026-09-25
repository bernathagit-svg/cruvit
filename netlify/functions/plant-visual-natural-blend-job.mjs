import crypto from 'node:crypto';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const PLAN_CONTRACT='plant-visual-natural-blend-plan-v1';
const APPROVAL_CONTRACT='plant-visual-natural-blend-spend-approval-v1';
const OPENAI_EDIT_URL='https://api.openai.com/v1/images/edits';

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
function sha256(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
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
async function readBytes(c,bucket,key){
  try{
    const out=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));
    return Buffer.from(await out.Body.transformToByteArray());
  }catch(err){
    if(err?.name==='NoSuchKey'||err?.Code==='NoSuchKey'||err?.$metadata?.httpStatusCode===404)return null;
    throw err;
  }
}
async function readJson(c,bucket,key){
  const bytes=await readBytes(c,bucket,key);
  if(!bytes)return null;
  try{return JSON.parse(bytes.toString('utf8'));}catch{return null;}
}
async function putBytes(c,bucket,key,bytes,contentType,metadata={}){
  await c.send(new PutObjectCommand({
    Bucket:bucket,Key:key,Body:bytes,ContentType:contentType,
    CacheControl:'private, no-store',Metadata:metadata
  }));
}
async function putJson(c,bucket,key,body,ifNone=false){
  await c.send(new PutObjectCommand({
    Bucket:bucket,Key:key,Body:Buffer.from(JSON.stringify(body,null,2)),
    ContentType:'application/json; charset=utf-8',
    CacheControl:'private, no-store',
    ...(ifNone?{IfNoneMatch:'*'}:{})
  }));
}
async function loadStaticJson(req,path){
  const res=await fetch(new URL(path,req.url),{headers:{'cache-control':'no-cache'}});
  if(!res.ok)return null;
  return res.json();
}
async function loadPlan(req,runId){
  const p=await loadStaticJson(req,'/data/garden-design/plant-visual-natural-blend-plans/'+runId+'.json');
  if(!p||p.contract!==PLAN_CONTRACT||p.runId!==runId)return null;
  return p;
}
async function loadApproval(req,runId){
  const a=await loadStaticJson(req,'/data/garden-design/plant-visual-natural-blend-spend-approvals/'+runId+'.json');
  if(!a||a.contract!==APPROVAL_CONTRACT||a.runId!==runId)return null;
  return a;
}
function approvalOk(a,p){
  if(!a||a.approved!==true)return false;
  if(a.model!==p.model)return false;
  if(Number(a.maxCalls)!==1||Number(a.maxRetries)!==0)return false;
  if(!(Number(a.maxSpendUsd)>0))return false;
  if(a.productionWritesAllowed!==false||a.registryWritesAllowed!==false)return false;
  if(a.sourceGardenMutationAllowed!==false||a.candidateAssetMutationAllowed!==false)return false;
  return String(a.jobId||'')===String(p.sourceJobId||'');
}
function evidencePrefix(plan){
  return `candidates/${safeSegment(plan.sourceManifestId)}/natural-blend/${safeSegment(plan.runId)}`;
}
function evidenceKey(plan){return evidencePrefix(plan)+'/evidence.json';}
function lockKey(plan){return evidencePrefix(plan)+'/lock.json';}

function decodeBase64(s,maxBytes,label){
  const raw=String(s||'').trim();
  if(!raw)throw new Error(label+'_BASE64_REQUIRED');
  let bytes;
  try{bytes=Buffer.from(raw,'base64');}catch{throw new Error(label+'_BASE64_INVALID');}
  if(!bytes.length||bytes.length>maxBytes)throw new Error(label+'_BYTES_INVALID');
  return bytes;
}

export default async(req)=>{
  if(req.method!=='POST')return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});

  let body={};
  try{body=await req.json();}catch{return json(400,{ok:false,code:'JSON_BODY_REQUIRED'});}
  const runId=safeId(body.runId);
  const jobId=safeId(body.jobId);
  if(!runId||!jobId)return json(400,{ok:false,code:'RUN_ID_AND_JOB_ID_REQUIRED'});

  const plan=await loadPlan(req,runId);
  if(!plan)return json(404,{ok:false,code:'NATURAL_BLEND_PLAN_NOT_FOUND'});
  if(jobId!==plan.sourceJobId)return json(404,{ok:false,code:'JOB_NOT_IN_NATURAL_BLEND_PLAN'});

  const approval=await loadApproval(req,runId);
  if(!approvalOk(approval,plan)){
    return json(403,{ok:false,code:'NATURAL_BLEND_SPEND_OWNER_APPROVAL_REQUIRED',runId,jobId});
  }

  const required=[
    'PLANT_VISUAL_R2_ACCOUNT_ID',
    'PLANT_VISUAL_R2_ACCESS_KEY_ID',
    'PLANT_VISUAL_R2_SECRET_ACCESS_KEY',
    'PLANT_VISUAL_R2_CANDIDATES_BUCKET'
  ];
  const missing=required.filter(k=>!env(k));
  const apiKey=env('OPENAI_KEY')||env('OPENAI_API_KEY');
  if(!apiKey)missing.push('OPENAI_KEY_OR_OPENAI_API_KEY');
  if(missing.length)return json(500,{ok:false,code:'ENV_MISSING',missing});

  let cropBytes,maskBytes;
  try{
    cropBytes=decodeBase64(body.cropBase64,8*1024*1024,'CROP');
    maskBytes=decodeBase64(body.maskBase64,8*1024*1024,'MASK');
  }catch(err){
    return json(400,{ok:false,code:String(err?.message||err)});
  }

  const c=client();
  const bucket=env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
  const existing=await readJson(c,bucket,evidenceKey(plan));
  if(existing){
    const out=existing.outputObjectKey?await readBytes(c,bucket,existing.outputObjectKey):null;
    return json(200,{
      ok:true,
      code:'NATURAL_BLEND_ALREADY_HAS_EVIDENCE',
      evidence:existing,
      outputBase64:out?out.toString('base64'):null
    });
  }

  try{
    await putJson(c,bucket,lockKey(plan),{
      contract:'plant-visual-natural-blend-lock-v1',
      runId,jobId,claimedAt:new Date().toISOString(),retriesAllowed:false
    },true);
  }catch(err){
    if(err?.name==='PreconditionFailed'||err?.$metadata?.httpStatusCode===412){
      return json(409,{ok:false,code:'NATURAL_BLEND_JOB_ALREADY_CLAIMED'});
    }
    throw err;
  }

  let sourceCandidate=null;
  if(plan.sourceCandidate?.objectKey && plan.sourceCandidate?.sha256){
    sourceCandidate={
      objectKey:String(plan.sourceCandidate.objectKey),
      sha256:String(plan.sourceCandidate.sha256).toLowerCase()
    };
  }else{
    const manifest=await loadStaticJson(req,'/data/garden-design/plant-visual-qa-manifests/'+plan.sourceManifestId+'.json');
    const row=manifest?.rows?.find(r=>r.jobId===jobId);
    if(row?.objectKey && row?.sha256){
      sourceCandidate={objectKey:row.objectKey,sha256:String(row.sha256).toLowerCase()};
    }
  }
  if(!sourceCandidate){
    return json(409,{ok:false,code:'SOURCE_CANDIDATE_EVIDENCE_MISSING'});
  }

  const candidateBytes=await readBytes(c,bucket,sourceCandidate.objectKey);
  if(!candidateBytes)return json(409,{ok:false,code:'SOURCE_CANDIDATE_NOT_FOUND'});
  if(sha256(candidateBytes)!==sourceCandidate.sha256){
    return json(409,{ok:false,code:'SOURCE_CANDIDATE_INTEGRITY_MISMATCH'});
  }

  const cropSha=sha256(cropBytes);
  const maskSha=sha256(maskBytes);
  const prefix=evidencePrefix(plan);
  const cropKey=prefix+'/input__'+cropSha+'.png';
  const maskKey=prefix+'/mask__'+maskSha+'.png';
  await putBytes(c,bucket,cropKey,cropBytes,'image/png',{
    'cruvit-run-id':runId,'cruvit-job-id':jobId,'cruvit-sha256':cropSha
  });
  await putBytes(c,bucket,maskKey,maskBytes,'image/png',{
    'cruvit-run-id':runId,'cruvit-job-id':jobId,'cruvit-sha256':maskSha
  });

  const commonName=String(plan.canonicalSlug||'plant').replace(/-/g,' ');
  const scientific=String(plan.scientific||'').trim();
  const prompt=[
    'Edit the first image only to make the existing '+commonName+' plant look naturally integrated into the photographed garden.',
    'The second image is the exact plant cutout reference. Preserve that same plant identity, overall silhouette, branching structure, leaf/flower/fruit state, and botanical appearance.',
    'Do not redesign the garden. Do not add or remove plants, paths, walls, windows, irrigation, stones, or architecture.',
    'Within the editable mask only: harmonize local exposure, white balance, color temperature, edge softness, atmospheric sharpness, contact shadow, soil contact, subtle reflected ground color, and ambient light so the plant no longer looks pasted on.',
    scientific ? 'Keep the plant recognizable as the same '+commonName+' ('+scientific+').' : 'Keep the plant recognizable as the same '+commonName+'.',
    'Make only restrained photorealistic integration changes. No stylization, no new objects, no composition changes.',
    'Pixels outside the mask are context only and must be treated as fixed.'
  ].join(' ');

  const form=new FormData();
  form.append('model',plan.model);
  form.append('image[]',new Blob([cropBytes],{type:'image/png'}),'scene-crop.png');
  form.append('image[]',new Blob([candidateBytes],{type:'image/png'}),'lavender-reference.png');
  form.append('mask',new Blob([maskBytes],{type:'image/png'}),'edit-mask.png');
  form.append('prompt',prompt);
  form.append('quality',plan.quality||'medium');
  form.append('size','1024x1024');
  form.append('output_format','png');
  form.append('n','1');

  const response=await fetch(OPENAI_EDIT_URL,{
    method:'POST',
    headers:{Authorization:'Bearer '+apiKey},
    body:form
  });
  const payload=await response.json();
  if(!response.ok||payload?.error){
    const evidence={
      contract:'plant-visual-natural-blend-evidence-v1',
      runId,jobId,code:'NATURAL_BLEND_PROVIDER_FAILURE',
      httpStatus:response.status,
      providerError:payload?.error?.message||null,
      model:plan.model,quality:plan.quality,
      cropSha256:cropSha,maskSha256:maskSha,
      productionWrites:0,registryWrites:0,
      recordedAt:new Date().toISOString()
    };
    await putJson(c,bucket,evidenceKey(plan),evidence);
    return json(502,{ok:false,...evidence});
  }

  const b64=payload?.data?.[0]?.b64_json;
  if(!b64){
    const evidence={
      contract:'plant-visual-natural-blend-evidence-v1',
      runId,jobId,code:'NATURAL_BLEND_OUTPUT_MISSING',
      model:plan.model,quality:plan.quality,
      cropSha256:cropSha,maskSha256:maskSha,
      productionWrites:0,registryWrites:0,
      recordedAt:new Date().toISOString()
    };
    await putJson(c,bucket,evidenceKey(plan),evidence);
    return json(502,{ok:false,...evidence});
  }

  const outputBytes=Buffer.from(b64,'base64');
  const outputSha=sha256(outputBytes);
  const outputKey=prefix+'/output__'+outputSha+'.png';
  await putBytes(c,bucket,outputKey,outputBytes,'image/png',{
    'cruvit-run-id':runId,'cruvit-job-id':jobId,'cruvit-sha256':outputSha
  });
  const readback=await readBytes(c,bucket,outputKey);
  if(!readback||sha256(readback)!==outputSha){
    return json(409,{ok:false,code:'NATURAL_BLEND_OUTPUT_READBACK_MISMATCH'});
  }

  const evidence={
    contract:'plant-visual-natural-blend-evidence-v1',
    runId,jobId,
    code:'NATURAL_BLEND_EDIT_RECORDED',
    model:plan.model,
    quality:plan.quality,
    sourceCandidateObjectKey:sourceCandidate.objectKey,
    sourceCandidateSha256:sourceCandidate.sha256,
    inputObjectKey:cropKey,
    cropSha256:cropSha,
    maskObjectKey:maskKey,
    maskSha256:maskSha,
    outputObjectKey:outputKey,
    outputSha256:outputSha,
    usage:payload?.usage||null,
    sceneSpecific:true,
    hardCompositeBoundaryRequired:true,
    ownerReviewRequired:true,
    productionWrites:0,
    registryWrites:0,
    recordedAt:new Date().toISOString()
  };
  await putJson(c,bucket,evidenceKey(plan),evidence);

  return json(200,{
    ok:true,
    code:evidence.code,
    evidence,
    outputBase64:outputBytes.toString('base64')
  });
};

export const config={path:'/.netlify/functions/plant-visual-natural-blend-job'};
