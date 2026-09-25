import crypto from 'node:crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { inspectTechnicalQa } from '../../modules/garden-design/asset-factory-v1/technical-qa-v1.js';
import { assessProductionFramingQa } from '../../modules/garden-design/asset-factory-v1/production-framing-qa-v1.js';
import { resolvePlantSizeAuthorityReadiness } from '../../modules/garden-design/asset-factory-v1/plant-size-authority-readiness-v1.js';

function env(name){try{const v=globalThis.Netlify?.env?.get?.(name);if(v)return v;}catch{}return process.env[name]||'';}
function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}});}
function sha256(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function client(){return new S3Client({region:'auto',endpoint:`https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),secretAccessKey:env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')}});}
async function staticJson(req,path){const res=await fetch(new URL(path,req.url),{headers:{'cache-control':'no-cache'}});if(!res.ok)return null;try{return await res.json();}catch{return null;}}
async function readBytes(c,bucket,key){const out=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));return Buffer.from(await out.Body.transformToByteArray());}

export default async(req)=>{
  if(req.method!=='GET') return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});

  const sourcePlanId='cruvit-e2e-batch-a-in-garden-qa-2026-09-25-v1';
  const manifestId='cruvit-e2e-batch-a-production-promotion-2026-09-25-v1';

  const [
    sourcePlan,
    sizeRegistry,
    firstOwnerApproval,
    inGardenOwnerApproval,
    geometryReport
  ]=await Promise.all([
    staticJson(req,'/data/garden-design/plant-visual-in-garden-model-qa-plans/'+sourcePlanId+'.json'),
    staticJson(req,'/data/catalog/botanical-size-authority-v1.json'),
    staticJson(req,'/data/garden-design/plant-visual-owner-visual-approvals/cruvit-e2e-batch-a-owner-review-2026-09-25-v1.json'),
    staticJson(req,'/data/garden-design/plant-visual-owner-visual-approvals/cruvit-e2e-batch-a-in-garden-owner-review-2026-09-25-v1.json'),
    staticJson(req,'/data/garden-design/plant-visual-in-garden-geometry-qa/cruvit-e2e-batch-a-in-garden-qa-2026-09-25-v1.json')
  ]);
  if(!sourcePlan||!sizeRegistry||!firstOwnerApproval||!inGardenOwnerApproval||!geometryReport){
    return json(503,{ok:false,code:'PROMOTION_BUILDER_STATIC_EVIDENCE_MISSING'});
  }
  if(sourcePlan.jobCount!==12||geometryReport.pass!==12||geometryReport.fail!==0||geometryReport.blocked!==0){
    return json(409,{ok:false,code:'BATCH_A_IN_GARDEN_GATES_INCOMPLETE'});
  }

  const firstOwnerSet=new Set(firstOwnerApproval?.scope?.exactJobIds||[]);
  const inGardenOwnerSet=new Set(inGardenOwnerApproval?.scope?.exactJobIds||[]);
  if(inGardenOwnerSet.size!==12) return json(409,{ok:false,code:'IN_GARDEN_OWNER_SCOPE_NOT_12'});

  const required=['PLANT_VISUAL_R2_ACCOUNT_ID','PLANT_VISUAL_R2_ACCESS_KEY_ID','PLANT_VISUAL_R2_SECRET_ACCESS_KEY','PLANT_VISUAL_R2_CANDIDATES_BUCKET'];
  const missing=required.filter(k=>!env(k)); if(missing.length)return json(500,{ok:false,code:'ENV_MISSING',missing});
  const c=client(),bucket=env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');

  const reportCache=new Map();
  const modelPlanCache=new Map();
  async function modelReport(runId){
    if(reportCache.has(runId)) return reportCache.get(runId);
    const d=await staticJson(req,'/data/garden-design/plant-visual-model-qa-reports/'+runId+'.json');
    reportCache.set(runId,d); return d;
  }
  async function modelPlan(runId){
    if(modelPlanCache.has(runId)) return modelPlanCache.get(runId);
    const d=await staticJson(req,'/data/garden-design/plant-visual-model-qa-plans/'+runId+'.json');
    modelPlanCache.set(runId,d); return d;
  }

  const rows=[];
  for(const job of sourcePlan.jobs||[]){
    const bytes=await readBytes(c,bucket,job.objectKey);
    if(bytes.length!==Number(job.bytes)||sha256(bytes)!==String(job.sha256).toLowerCase()){
      return json(409,{ok:false,code:'CANDIDATE_INTEGRITY_MISMATCH',jobId:job.jobId});
    }
    const technical=inspectTechnicalQa(bytes);
    const framing=assessProductionFramingQa(technical);
    if(technical.result!=='PASS'||framing.result!=='PASS'){
      return json(409,{ok:false,code:'LOCAL_QA_NOT_PASS',jobId:job.jobId,technical,framing});
    }

    const report=await modelReport(job.sourceModelQaRunId);
    const mplan=await modelPlan(job.sourceModelQaRunId);
    if(!report||!mplan) return json(409,{ok:false,code:'MODEL_QA_EVIDENCE_MISSING',jobId:job.jobId});
    const modelPass=(report.passJobs||[]).includes(job.jobId);
    const modelUncertain=(report.uncertainJobs||[]).includes(job.jobId);
    const ownerResolvedModel=modelUncertain && firstOwnerSet.has(job.jobId);
    if(!modelPass&&!ownerResolvedModel){
      return json(409,{ok:false,code:'MODEL_QA_NOT_RESOLVED',jobId:job.jobId});
    }
    if(!inGardenOwnerSet.has(job.jobId)){
      return json(409,{ok:false,code:'IN_GARDEN_OWNER_PASS_MISSING',jobId:job.jobId});
    }
    const geometry=(geometryReport.rows||[]).find(x=>x.jobId===job.jobId);
    if(!geometry||geometry.geometryQa!=='PASS'||geometry.realSavedGardenPhotoUsed!==true){
      return json(409,{ok:false,code:'GEOMETRY_QA_NOT_PASS',jobId:job.jobId});
    }

    const size=resolvePlantSizeAuthorityReadiness(sizeRegistry,{
      canonicalSlug:job.canonicalSlug,
      growthStage:job.growthStage,
      visualForm:job.visualForm
    });
    const sizeAuthorityPlan={
      ...size,
      placementScaleHold:size.state==='SIZE_AUTHORITY_CONTEXT_REQUIRED'
    };
    if(!['SIZE_AUTHORITY_READY','SIZE_AUTHORITY_PARTIAL','SIZE_AUTHORITY_CONTEXT_REQUIRED'].includes(size.state)){
      return json(409,{ok:false,code:'SIZE_AUTHORITY_NOT_VISUAL_PROMOTION_READY',jobId:job.jobId,sizeAuthorityPlan});
    }

    const modelSource=(mplan.jobs||[]).find(x=>x.jobId===job.jobId);
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
      bytes:Number(job.bytes),
      sha256:job.sha256,
      lineage:mplan.sourceManifestId||job.sourceModelQaRunId,
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
        source:modelPass
          ? 'Model QA PASS plus explicit owner in-garden PASS'
          : 'Model QA conservative uncertainty resolved by explicit owner candidate PASS and explicit owner in-garden PASS',
        modelQaRunId:job.sourceModelQaRunId,
        modelQaOriginal:modelPass?'PASS':'UNCERTAIN',
        candidateOwnerResolved:ownerResolvedModel,
        inGardenOwnerPass:true,
        reviewedAt:'2026-09-25',
        assetBytesChanged:false
      }
    });
  }

  return json(200,{
    contract:'plant-visual-qa-manifest-v1',
    manifestId,
    generatedAt:'2026-09-25',
    derivedFromManifestId:sourcePlan.sourceManifestId,
    batchId:'cruvit-e2e-batch-a-production-promotion-2026-09-25-v1',
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
export const config={path:'/.netlify/functions/cruvit-e2e-batch-a-promotion-manifest-builder'};
