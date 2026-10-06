import crypto from 'node:crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { inspectTechnicalQa } from '../../modules/garden-design/asset-factory-v1/technical-qa-v1.js';
import { assessProductionFramingQa } from '../../modules/garden-design/asset-factory-v1/production-framing-qa-v1.js';
import { resolvePlantSizeAuthorityReadiness } from '../../modules/garden-design/asset-factory-v1/plant-size-authority-readiness-v1.js';

const MANIFEST_ID='plant-intake-e2e-final-production-promotion-2026-10-06-v1';
const MODEL_QA_RUN='plant-intake-e2e-wave-model-qa-2026-10-04-v1';
const MODEL_SOURCE='plant-intake-e2e-wave-2026-10-03-v1-flare14';
const FINAL_VISION_RUN='plant-intake-e2e-final-in-garden-vision-revalidation-2026-10-05-v1';
const OWNER_SCOPE='plant-intake-e2e-final-owner-promotion-2026-10-06-v1';

function env(name){try{const v=globalThis.Netlify?.env?.get?.(name);if(v)return v;}catch{}return process.env[name]||'';}
function json(status,body){return new Response(JSON.stringify(body,null,2),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-robots-tag':'noindex, nofollow'}});}
function safe(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');}
function sha256(b){return crypto.createHash('sha256').update(b).digest('hex');}
function client(){return new S3Client({region:'auto',endpoint:`https://${env('PLANT_VISUAL_R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env('PLANT_VISUAL_R2_ACCESS_KEY_ID'),secretAccessKey:env('PLANT_VISUAL_R2_SECRET_ACCESS_KEY')}});}
async function readBytes(c,bucket,key){try{const out=await c.send(new GetObjectCommand({Bucket:bucket,Key:key}));return Buffer.from(await out.Body.transformToByteArray());}catch(err){if(err?.name==='NoSuchKey'||err?.Code==='NoSuchKey'||err?.$metadata?.httpStatusCode===404)return null;throw err;}}
async function readJson(c,bucket,key){const b=await readBytes(c,bucket,key);if(!b)return null;try{return JSON.parse(b.toString('utf8'));}catch{return null;}}
async function staticJson(req,p){const r=await fetch(new URL(p,req.url),{headers:{'cache-control':'no-cache'}});if(!r.ok)return null;return r.json();}

const jobs=[
 {jobId:'strelitzia__mature__default__flowering__v1',canonicalSlug:'strelitzia',scientific:'Strelitzia reginae',visualForm:'herbaceous-clump',architectureMode:'default',growthStage:'mature',phenology:'flowering',sha256:'4b39276b60e35a065cca385ad8474b3698780bf7ee275cb208ab4115c0158245',objectKey:'candidates/plant-intake-e2e-wave-2026-10-03-v1-flare14/strelitzia/strelitzia__mature__default__flowering__v1__4b39276b60e35a065cca385ad8474b3698780bf7ee275cb208ab4115c0158245.png',qaRendererInput:{ok:true,code:'QA_PREVIEW_PRESENTATION_BASELINE',source:'presentation-sizing-v1.1+relative-preview-scale-v1.1+in-garden-qa-scale-policy-v1.1',baseWidthPx:438,effectivePresentationForm:'herbaceous-clump',qaScaleBand:'large',qaMaxHeightPct:78,qaMaxWidthPct:80,qaScalePolicyVersion:'in-garden-qa-scale-policy-v1.1',scale:1,x:0.56,y:0.86,rotation:0,authorityUserResized:false,renderingOwner:'Garden Design production renderer',independentQaScaleMath:false,autoBlendRequired:true}},
 {jobId:'hibiscus__mature__shrub__flowering__v1',canonicalSlug:'hibiscus',scientific:'Hibiscus rosa-sinensis',visualForm:'shrub',architectureMode:'shrub',growthStage:'mature',phenology:'flowering',sha256:'d833d4a2045135e7a88bf2dde9574b3b5d00f4a4c5c89e3e85c97dc72f158c08',objectKey:'candidates/plant-intake-e2e-wave-2026-10-03-v1-flare14/hibiscus/hibiscus__mature__shrub__flowering__v1__d833d4a2045135e7a88bf2dde9574b3b5d00f4a4c5c89e3e85c97dc72f158c08.png',qaRendererInput:{ok:true,code:'QA_PREVIEW_PRESENTATION_BASELINE',source:'presentation-sizing-v1.1+relative-preview-scale-v1.1+in-garden-qa-scale-policy-v1.1',baseWidthPx:316,effectivePresentationForm:'shrub',qaScaleBand:'large',qaMaxHeightPct:78,qaMaxWidthPct:80,qaScalePolicyVersion:'in-garden-qa-scale-policy-v1.1',scale:1,x:0.56,y:0.86,rotation:0,authorityUserResized:false,renderingOwner:'Garden Design production renderer',independentQaScaleMath:false,autoBlendRequired:true}},
 {jobId:'lemon__mature__tree__fruiting__v1',canonicalSlug:'lemon',scientific:'Citrus × limon',visualForm:'tree',architectureMode:'tree',growthStage:'mature',phenology:'fruiting',sha256:'2a4fb92673858b8217840ce7515a0a7fab09666c2903cf7a72ae7e388a939f0d',objectKey:'candidates/plant-intake-e2e-wave-2026-10-03-v1-flare14/lemon/lemon__mature__tree__fruiting__v1__2a4fb92673858b8217840ce7515a0a7fab09666c2903cf7a72ae7e388a939f0d.png',qaRendererInput:{ok:true,code:'QA_PREVIEW_PRESENTATION_BASELINE',source:'tree-scale-v3+alpha-bbox+auto-blend-v3',baseWidthPx:490,effectivePresentationForm:'tree',qaScaleBand:'xxl',qaMaxHeightPct:96,qaMaxWidthPct:96,qaScalePolicyVersion:'in-garden-qa-scale-policy-v1.1',scale:1,x:0.56,y:0.995,rotation:0,authorityUserResized:false,renderingOwner:'Garden Design production renderer',independentQaScaleMath:false,autoBlendRequired:true,qaTreeScaleV3:{enabled:true,model:'tree-scale-v3',depthId:'near',imgHeightPct:108.3680981595092,visibleHeightPct:92,targetVisiblePct:92,bboxFillRatio:0.8489583333333334,groundAnchor:{nx:0.50439453125,ny:0.9388020833333334,source:'alpha-bbox-base-center'},alphaBBox:{exists:true,minX:41,minY:138,maxX:992,maxY:1442,opaque:583526},noMeterClaim:true}}},
 {jobId:'cyclamen__mature__default__flowering__v1',canonicalSlug:'cyclamen',scientific:'Cyclamen persicum',visualForm:'herbaceous-clump',architectureMode:'default',growthStage:'mature',phenology:'flowering',sha256:'b5adc258e13715c021cde93cd2bbd6981f93912c98a72f82a2abca30762a5c42',objectKey:'candidates/plant-intake-e2e-wave-2026-10-03-v1-flare14/cyclamen/cyclamen__mature__default__flowering__v1__b5adc258e13715c021cde93cd2bbd6981f93912c98a72f82a2abca30762a5c42.png',qaRendererInput:{ok:true,code:'QA_PREVIEW_PRESENTATION_BASELINE',source:'OWNER_EXACT_JOB_CALIBRATION_LOG_MIDPOINT_V1+auto-blend-v3',baseWidthPx:82.6578513746892,effectivePresentationForm:'herbaceous-clump',qaScaleBand:'owner-exact-calibration',qaMaxHeightPct:20,qaMaxWidthPct:20,qaScalePolicyVersion:'in-garden-qa-scale-policy-v1.1',scale:1,x:0.56,y:0.94,rotation:0,authorityUserResized:true,renderingOwner:'Garden Design production renderer',independentQaScaleMath:false,autoBlendRequired:true,ownerCalibrationReason:'BRACKETED_OWNER_REVIEW_V2_TOO_LARGE_V3_TOO_SMALL'}}
];

export default async(req)=>{
 if(req.method!=='GET')return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
 const required=['PLANT_VISUAL_R2_ACCOUNT_ID','PLANT_VISUAL_R2_ACCESS_KEY_ID','PLANT_VISUAL_R2_SECRET_ACCESS_KEY','PLANT_VISUAL_R2_CANDIDATES_BUCKET'];
 const missing=required.filter(k=>!env(k));if(missing.length)return json(500,{ok:false,code:'ENV_MISSING',missing});
 const [sizeRegistry,ownerScope,visionStatus]=await Promise.all([
   staticJson(req,'/data/catalog/botanical-size-authority-v1.json'),
   staticJson(req,'/data/garden-design/plant-visual-owner-visual-approvals/'+OWNER_SCOPE+'.json'),
   fetch(new URL('/.netlify/functions/plant-visual-in-garden-vision-qa-status?runId='+FINAL_VISION_RUN,req.url),{headers:{'cache-control':'no-cache'}}).then(r=>r.ok?r.json():null)
 ]);
 if(!sizeRegistry||!ownerScope||!visionStatus)return json(503,{ok:false,code:'FINAL_PROMOTION_EVIDENCE_MISSING'});
 const ownerPass=new Set((ownerScope.decisions||[]).filter(x=>x.ownerDecision==='PASS').map(x=>x.jobId));
 const visionPass=new Set((visionStatus.rows||[]).filter(x=>x.overall==='PASS').map(x=>x.jobId));
 if(ownerPass.size!==4||visionPass.size!==4)return json(409,{ok:false,code:'FINAL_OWNER_OR_VISION_PASS_INCOMPLETE',ownerPass:ownerPass.size,visionPass:visionPass.size});
 const c=client(),bucket=env('PLANT_VISUAL_R2_CANDIDATES_BUCKET'),rows=[];
 for(const j of jobs){
   if(!ownerPass.has(j.jobId)||!visionPass.has(j.jobId))return json(409,{ok:false,code:'FINAL_PASS_MISSING',jobId:j.jobId});
   const b=await readBytes(c,bucket,j.objectKey);
   if(!b)return json(409,{ok:false,code:'CANDIDATE_NOT_FOUND',jobId:j.jobId});
   const actualSha=sha256(b);
   if(actualSha!==j.sha256)return json(409,{ok:false,code:'CANDIDATE_SHA_MISMATCH',jobId:j.jobId,actualSha});
   const modelKey=`candidates/${safe(MODEL_SOURCE)}/model-qa/${safe(MODEL_QA_RUN)}/${safe(j.jobId)}.json`;
   const model=await readJson(c,bucket,modelKey);
   if(!model||model.overall!=='PASS'||model.checks?.botanicalIdentity?.verdict!=='PASS'||model.checks?.architecture?.verdict!=='PASS'||model.checks?.growthStage?.verdict!=='PASS'||model.checks?.phenologyState?.verdict!=='PASS'){
     return json(409,{ok:false,code:'MODEL_QA_PASS_EVIDENCE_MISSING',jobId:j.jobId,modelKey,modelOverall:model?.overall||null});
   }
   const technical=inspectTechnicalQa(b),framing=assessProductionFramingQa(technical);
   if(technical.result!=='PASS'||framing.result!=='PASS')return json(409,{ok:false,code:'LOCAL_QA_NOT_PASS',jobId:j.jobId,technical:technical.result,framing:framing.result});
   const sizeAuthorityPlan=resolvePlantSizeAuthorityReadiness(sizeRegistry,{canonicalSlug:j.canonicalSlug,growthStage:j.growthStage,visualForm:j.visualForm},{contextResolved:false});
   if(!['SIZE_AUTHORITY_READY','SIZE_AUTHORITY_PARTIAL','SIZE_AUTHORITY_CONTEXT_REQUIRED'].includes(sizeAuthorityPlan.state))return json(409,{ok:false,code:'SIZE_AUTHORITY_NOT_PROMOTION_READY',jobId:j.jobId,sizeAuthorityPlan});
   rows.push({...j,bytes:b.length,lineage:MODEL_SOURCE,sourceStatus:'CANDIDATE_R2_VERIFIED',evidenceMismatch:false,expectedEvidenceSha256:null,technicalQA:'PASS',framingQA:'PASS',botanicalIdentityQA:'PASS',architectureQA:'PASS',growthStageQA:'PASS',phenologyStateQA:'PASS',inGardenQA:'PASS',technicalMetrics:technical.metrics,sizeAuthorityPlan,ownerReviewRequired:false,productionApproved:true,ownerVisualQA:'PASS',ownerDecision:'PASS_OWNER_VISUAL_GATES',ownerApprovalEvidence:{source:'R2 model QA PASS + final Auto Blend In-Garden Vision PASS + explicit owner visual PASS',modelQaRunId:MODEL_QA_RUN,finalVisionQaRunId:FINAL_VISION_RUN,ownerReviewId:OWNER_SCOPE,reviewedAt:'2026-10-06',assetBytesChanged:false}});
 }
 return json(200,{contract:'plant-visual-qa-manifest-v1',manifestId:MANIFEST_ID,generatedAt:'2026-10-06',derivedFromManifestId:MODEL_SOURCE,batchId:MANIFEST_ID,bucket:'cruvit-plant-visual-candidates',bounded:true,totalJobs:rows.length,ownerReviewJobs:0,automaticPassJobs:0,ownerApprovedJobs:rows.length,heldJobs:0,paidAiCalls:0,productionWrites:0,registryWrites:0,rendererInputContract:'production-renderer-qa-preview-v1',ownerVisualApprovalApplied:true,productionPromotionAuthorized:true,rows});
};
export const config={path:'/.netlify/functions/plant-intake-e2e-final-promotion-manifest-builder'};