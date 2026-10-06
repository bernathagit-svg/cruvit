import crypto from 'node:crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { inspectTechnicalQa } from '../../modules/garden-design/asset-factory-v1/technical-qa-v1.js';
import { assessProductionFramingQa } from '../../modules/garden-design/asset-factory-v1/production-framing-qa-v1.js';
import { resolvePlantSizeAuthorityReadiness } from '../../modules/garden-design/asset-factory-v1/plant-size-authority-readiness-v1.js';

const MANIFEST_ID='plant-intake-e2e-final-production-promotion-2026-10-05-v1';
const FINAL_VISION_RUN='plant-intake-e2e-final-in-garden-vision-revalidation-2026-10-05-v1';
const MODEL_RUN='plant-intake-e2e-wave-model-qa-2026-10-04-v1';
const MODEL_SOURCE_MANIFEST='plant-intake-e2e-wave-2026-10-03-v1-flare14';
const OWNER_APPROVAL_ID='plant-intake-e2e-final-owner-visual-approval-2026-10-05-v1';

function env(name){try{return globalThis.Netlify?.env?.get?.(name)||'';}catch{return '';}}
function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}});}
function safe(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');}
function sha256(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function client(){return new S3Client({region:'auto',endpoint:`https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),secretAccessKey:env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')}});}
async function staticJson(req,path){const r=await fetch(new URL(path,req.url),{headers:{'cache-control':'no-cache'}});if(!r.ok)return null;try{return await r.json();}catch{return null;}}
async function readBytes(c,bucket,key){const o=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));return Buffer.from(await o.Body.transformToByteArray());}
async function readJson(c,bucket,key){try{return JSON.parse((await readBytes(c,bucket,key)).toString('utf8'));}catch{return null;}}
function modelEvidenceKey(jobId){return `candidates/${safe(MODEL_SOURCE_MANIFEST)}/model-qa/${safe(MODEL_RUN)}/${safe(jobId)}.json`;}
function visionEvidenceKey(sourceManifestId,jobId){return `candidates/${safe(sourceManifestId)}/in-garden-vision-qa/${safe(FINAL_VISION_RUN)}/${safe(jobId)}.json`;}
function allModelChecksPass(e){const c=e?.checks||{};return ['botanicalIdentity','architecture','growthStage','phenologyState'].every(k=>String(c[k]?.verdict||'').toUpperCase()==='PASS');}

export default async(req)=>{
  if(req.method!=='GET')return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const [plan,sizeRegistry,owner]=await Promise.all([
    staticJson(req,'/data/garden-design/plant-visual-in-garden-vision-qa-plans/'+FINAL_VISION_RUN+'.json'),
    staticJson(req,'/data/catalog/botanical-size-authority-v1.json'),
    staticJson(req,'/data/garden-design/plant-visual-owner-visual-approvals/'+OWNER_APPROVAL_ID+'.json')
  ]);
  if(!plan||!sizeRegistry||!owner)return json(503,{ok:false,code:'STATIC_EVIDENCE_MISSING'});
  if(plan.runId!==FINAL_VISION_RUN||plan.jobCount!==4||!Array.isArray(plan.jobs))return json(409,{ok:false,code:'FINAL_VISION_PLAN_INVALID'});
  const ownerSet=new Set(owner.exactJobIds||[]);
  if(ownerSet.size!==4||!owner.decisions?.every(d=>d.decision==='PASS'&&ownerSet.has(d.jobId)))return json(409,{ok:false,code:'OWNER_VISUAL_APPROVAL_INVALID'});

  const required=['PLANT_VISUAL_R2_ACCOUNT_ID','PLANT_VISUAL_R2_ACCESS_KEY_ID','PLANT_VISUAL_R2_SECRET_ACCESS_KEY','PLANT_VISUAL_R2_CANDIDATES_BUCKET'];
  const missing=required.filter(k=>!env(k));if(missing.length)return json(500,{ok:false,code:'ENV_MISSING',missing});
  const c=client(),bucket=env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
  const rows=[];

  for(const job of plan.jobs){
    if(!ownerSet.has(job.jobId))return json(409,{ok:false,code:'JOB_NOT_OWNER_APPROVED',jobId:job.jobId});
    if(job.finalCaptureEvidence?.autoBlendApplied!==true||job.finalCaptureEvidence?.realSavedGardenPhotoUsed!==true)return json(409,{ok:false,code:'FINAL_CAPTURE_EVIDENCE_INVALID',jobId:job.jobId});
    const candidate=await readBytes(c,bucket,job.objectKey);
    const actualSha=sha256(candidate);
    if(actualSha!==String(job.sha256).toLowerCase())return json(409,{ok:false,code:'CANDIDATE_SHA_MISMATCH',jobId:job.jobId});
    const technical=inspectTechnicalQa(candidate);
    const framing=assessProductionFramingQa(technical);
    if(technical.result!=='PASS'||framing.result!=='PASS')return json(409,{ok:false,code:'LOCAL_QA_NOT_PASS',jobId:job.jobId,technical:technical.result,framing:framing.result});

    const [modelEvidence,visionEvidence]=await Promise.all([
      readJson(c,bucket,modelEvidenceKey(job.jobId)),
      readJson(c,bucket,visionEvidenceKey(plan.sourceManifestId,job.jobId))
    ]);
    if(modelEvidence?.overall!=='PASS'||!allModelChecksPass(modelEvidence))return json(409,{ok:false,code:'MODEL_QA_NOT_PASS',jobId:job.jobId});
    if(visionEvidence?.overall!=='PASS'||String(visionEvidence.captureSha256||'').toLowerCase()!==String(job.captureSha256||'').toLowerCase())return json(409,{ok:false,code:'FINAL_IN_GARDEN_QA_NOT_PASS',jobId:job.jobId});

    const sizeAuthorityPlan=resolvePlantSizeAuthorityReadiness(sizeRegistry,{
      canonicalSlug:job.canonicalSlug,growthStage:job.growthStage,visualForm:job.visualForm
    },{contextResolved:false});
    if(!['SIZE_AUTHORITY_READY','SIZE_AUTHORITY_PARTIAL','SIZE_AUTHORITY_CONTEXT_REQUIRED'].includes(sizeAuthorityPlan.state))return json(409,{ok:false,code:'SIZE_AUTHORITY_NOT_PROMOTION_READY',jobId:job.jobId,sizeAuthorityPlan});
    if(sizeAuthorityPlan.state==='SIZE_AUTHORITY_CONTEXT_REQUIRED'&&sizeAuthorityPlan.placementScaleHold!==true)return json(409,{ok:false,code:'PLACEMENT_SCALE_HOLD_REQUIRED',jobId:job.jobId});

    rows.push({
      jobId:job.jobId,
      canonicalSlug:job.canonicalSlug,
      displayName:null,
      scientific:job.scientific,
      identityScope:'species',
      visualForm:job.visualForm,
      architectureMode:job.architectureMode,
      growthStage:job.growthStage,
      phenology:job.phenology,
      objectKey:job.objectKey,
      bytes:candidate.length,
      sha256:actualSha,
      lineage:MODEL_SOURCE_MANIFEST,
      sourceStatus:'CANDIDATE_R2_VERIFIED',
      evidenceMismatch:false,
      expectedEvidenceSha256:null,
      technicalQA:'PASS',
      framingQA:'PASS',
      botanicalIdentityQA:'PASS',
      architectureQA:'PASS',
      growthStageQA:'PASS',
      phenologyStateQA:'PASS',
      inGardenQA:'PASS',
      technicalMetrics:technical.metrics,
      sizeAuthorityPlan,
      ownerReviewRequired:false,
      productionApproved:true,
      qaRendererInput:job.qaRendererInput,
      ownerVisualQA:'PASS',
      ownerDecision:'PASS_OWNER_VISUAL_GATES',
      ownerApprovalEvidence:{
        source:'Final Auto Blend capture + final In-Garden Vision QA + explicit owner visual PASS',
        modelQaRunId:MODEL_RUN,
        finalVisionQaRunId:FINAL_VISION_RUN,
        ownerCaptureRunId:job.finalCaptureEvidence?.sourceCaptureRunId||null,
        reviewedAt:'2026-10-05',
        assetBytesChanged:false
      }
    });
  }

  return json(200,{
    contract:'plant-visual-qa-manifest-v1',
    manifestId:MANIFEST_ID,
    generatedAt:'2026-10-06',
    derivedFromManifestId:plan.sourceManifestId,
    batchId:MANIFEST_ID,
    bucket:'cruvit-plant-visual-candidates',
    bounded:true,
    totalJobs:rows.length,
    ownerReviewJobs:0,
    automaticPassJobs:0,
    ownerApprovedJobs:rows.length,
    heldJobs:0,
    paidAiCalls:0,
    productionWrites:0,
    registryWrites:0,
    rendererInputContract:'production-renderer-qa-preview-v1',
    ownerVisualApprovalApplied:true,
    productionPromotionAuthorized:false,
    rows
  });
};
export const config={path:'/.netlify/functions/plant-intake-e2e-final-promotion-manifest-builder'};