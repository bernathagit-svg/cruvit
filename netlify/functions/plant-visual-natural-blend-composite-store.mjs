import crypto from 'node:crypto';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const PLAN_CONTRACT='plant-visual-natural-blend-plan-v1';
const APPROVAL_CONTRACT='plant-visual-natural-blend-spend-approval-v1';

function env(name){try{const v=globalThis.Netlify?.env?.get?.(name);if(v)return v;}catch{}return process.env[name]||'';}
function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}});}
function safeId(v){const s=String(v||'').trim();return /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/.test(s)?s:'';}
function safeSegment(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');}
function sha256(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function client(){return new S3Client({region:'auto',endpoint:`https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),secretAccessKey:env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')}});}
async function readBytes(c,bucket,key){try{const out=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));return Buffer.from(await out.Body.transformToByteArray());}catch(err){if(err?.name==='NoSuchKey'||err?.Code==='NoSuchKey'||err?.$metadata?.httpStatusCode===404)return null;throw err;}}
async function readJson(c,bucket,key){const b=await readBytes(c,bucket,key);if(!b)return null;try{return JSON.parse(b.toString('utf8'));}catch{return null;}}
async function putBytes(c,bucket,key,bytes,type,metadata={}){await c.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:type,CacheControl:'private, no-store',Metadata:metadata}));}
async function putJson(c,bucket,key,body){await c.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:Buffer.from(JSON.stringify(body,null,2)),ContentType:'application/json; charset=utf-8',CacheControl:'private, no-store'}));}
async function loadStaticJson(req,path){const res=await fetch(new URL(path,req.url),{headers:{'cache-control':'no-cache'}});if(!res.ok)return null;return res.json();}
function prefix(plan){return `candidates/${safeSegment(plan.sourceManifestId)}/natural-blend/${safeSegment(plan.runId)}`;}

export default async(req)=>{
  if(req.method!=='POST')return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  let body={};try{body=await req.json();}catch{return json(400,{ok:false,code:'JSON_BODY_REQUIRED'});}
  const runId=safeId(body.runId),jobId=safeId(body.jobId);
  if(!runId||!jobId)return json(400,{ok:false,code:'RUN_ID_AND_JOB_ID_REQUIRED'});
  const plan=await loadStaticJson(req,'/data/garden-design/plant-visual-natural-blend-plans/'+runId+'.json');
  if(!plan||plan.contract!==PLAN_CONTRACT||plan.runId!==runId)return json(404,{ok:false,code:'NATURAL_BLEND_PLAN_NOT_FOUND'});
  if(plan.sourceJobId!==jobId)return json(404,{ok:false,code:'JOB_NOT_IN_NATURAL_BLEND_PLAN'});
  const compositeMode=String(plan?.inputContract?.finalCompositeBoundaryMode||'HARD_ROUNDED_RECT_V1');
  const compositeProfile=String(plan?.inputContract?.compositeProfile||'DEFAULT');
  if(body.compositeMode && String(body.compositeMode)!==compositeMode)return json(409,{ok:false,code:'COMPOSITE_MODE_PLAN_MISMATCH'});
  if(body.compositeProfile && String(body.compositeProfile)!==compositeProfile)return json(409,{ok:false,code:'COMPOSITE_PROFILE_PLAN_MISMATCH'});
  const approval=await loadStaticJson(req,'/data/garden-design/plant-visual-natural-blend-spend-approvals/'+runId+'.json');
  if(!approval||approval.contract!==APPROVAL_CONTRACT||approval.approved!==true||approval.jobId!==jobId)return json(403,{ok:false,code:'NATURAL_BLEND_OWNER_APPROVAL_REQUIRED'});

  const required=['PLANT_VISUAL_R2_ACCOUNT_ID','PLANT_VISUAL_R2_ACCESS_KEY_ID','PLANT_VISUAL_R2_SECRET_ACCESS_KEY','PLANT_VISUAL_R2_CANDIDATES_BUCKET'];
  const missing=required.filter(k=>!env(k));if(missing.length)return json(500,{ok:false,code:'ENV_MISSING',missing});

  const raw=String(body.compositeBase64||'').trim();
  if(!raw)return json(400,{ok:false,code:'COMPOSITE_BASE64_REQUIRED'});
  let bytes;try{bytes=Buffer.from(raw,'base64');}catch{return json(400,{ok:false,code:'COMPOSITE_BASE64_INVALID'});}
  if(!bytes.length||bytes.length>10*1024*1024)return json(400,{ok:false,code:'COMPOSITE_BYTES_INVALID'});
  if(!(bytes[0]===0xff&&bytes[1]===0xd8))return json(400,{ok:false,code:'COMPOSITE_MUST_BE_JPEG'});

  const c=client(),bucket=env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
  const p=prefix(plan);
  const blendEvidence=await readJson(c,bucket,p+'/evidence.json');
  if(!blendEvidence||blendEvidence.code!=='NATURAL_BLEND_EDIT_RECORDED')return json(409,{ok:false,code:'NATURAL_BLEND_EDIT_EVIDENCE_REQUIRED'});

  const sourceCapture=plan.sourceCapture;
  if(!sourceCapture?.objectKey||!sourceCapture?.sha256)return json(409,{ok:false,code:'SOURCE_CAPTURE_EVIDENCE_REQUIRED'});
  const sourceBytes=await readBytes(c,bucket,sourceCapture.objectKey);
  if(!sourceBytes||sha256(sourceBytes)!==String(sourceCapture.sha256).toLowerCase())return json(409,{ok:false,code:'SOURCE_CAPTURE_INTEGRITY_MISMATCH'});

  const compositeSha=sha256(bytes);
  const key=p+'/final-composite__'+compositeSha+'.jpg';
  await putBytes(c,bucket,key,bytes,'image/jpeg',{
    'cruvit-run-id':runId,
    'cruvit-job-id':jobId,
    'cruvit-sha256':compositeSha,
    'cruvit-source-capture-sha':String(sourceCapture.sha256).toLowerCase()
  });
  const readback=await readBytes(c,bucket,key);
  if(!readback||sha256(readback)!==compositeSha)return json(409,{ok:false,code:'COMPOSITE_READBACK_MISMATCH'});

  const evidence={
    contract:'plant-visual-natural-blend-composite-evidence-v1',
    runId,jobId,
    code:'NATURAL_BLEND_FINAL_COMPOSITE_RECORDED',
    sourceCaptureObjectKey:sourceCapture.objectKey,
    sourceCaptureSha256:String(sourceCapture.sha256).toLowerCase(),
    naturalBlendOutputObjectKey:blendEvidence.outputObjectKey,
    naturalBlendOutputSha256:blendEvidence.outputSha256,
    finalCompositeObjectKey:key,
    finalCompositeSha256:compositeSha,
    bytes:bytes.length,
    compositeMode,
    compositeProfile,
    hardCompositeClientApplied:compositeMode!=='FEATHERED_EDIT_REGION_V1',
    featheredCompositeClientApplied:compositeMode==='FEATHERED_EDIT_REGION_V1',
    originalCandidateMutation:false,
    sourceGardenMutation:false,
    productionWrites:0,
    registryWrites:0,
    recordedAt:new Date().toISOString()
  };
  await putJson(c,bucket,p+'/composite-evidence.json',evidence);
  return json(200,{ok:true,code:evidence.code,evidence});
};

export const config={path:'/.netlify/functions/plant-visual-natural-blend-composite-store'};