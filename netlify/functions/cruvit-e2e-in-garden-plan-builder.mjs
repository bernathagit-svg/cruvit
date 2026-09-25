import crypto from 'node:crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { inspectTechnicalQa } from '../../modules/garden-design/asset-factory-v1/technical-qa-v1.js';
import { derivePresentationSizing } from '../../modules/garden-design/asset-factory-v1/presentation-sizing-v1.js';
import {
  deriveInGardenQaScale,
  qaScaleBandSpec
} from '../../modules/garden-design/asset-factory-v1/in-garden-qa-scale-policy-v1.js';

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
  const bundleId=safeId(u.searchParams.get('bundleId'));
  const runId=safeId(u.searchParams.get('runId'));
  if(!bundleId||!runId) return json(400,{ok:false,code:'BUNDLE_ID_AND_RUN_ID_REQUIRED'});

  const bundle=await staticJson(req,'/data/garden-design/plant-visual-owner-review-bundles/'+bundleId+'.json');
  if(!bundle||bundle.contract!=='cruvit-e2e-owner-review-bundle-v1') return json(404,{ok:false,code:'OWNER_REVIEW_BUNDLE_NOT_FOUND'});

  const required=['PLANT_VISUAL_R2_ACCOUNT_ID','PLANT_VISUAL_R2_ACCESS_KEY_ID','PLANT_VISUAL_R2_SECRET_ACCESS_KEY','PLANT_VISUAL_R2_CANDIDATES_BUCKET'];
  const missing=required.filter(k=>!env(k)); if(missing.length)return json(500,{ok:false,code:'ENV_MISSING',missing});

  const c=client(),bucket=env('PLANT_VISUAL_R2_CANDIDATES_BUCKET');
  const jobs=[];
  for(const item of bundle.jobs||[]){
    const plan=await staticJson(req,'/data/garden-design/plant-visual-model-qa-plans/'+item.sourceModelQaRunId+'.json');
    if(!plan||plan.contract!=='plant-visual-model-qa-plan-v1') return json(409,{ok:false,code:'SOURCE_MODEL_QA_PLAN_MISSING',sourceModelQaRunId:item.sourceModelQaRunId});
    const src=(plan.jobs||[]).find(x=>x.jobId===item.jobId);
    if(!src||!src.objectKey||!src.sha256||!Number(src.bytes)) return json(409,{ok:false,code:'SOURCE_JOB_INVALID',jobId:item.jobId});
    const bytes=await readBytes(c,bucket,src.objectKey);
    if(bytes.length!==Number(src.bytes)||sha256(bytes)!==String(src.sha256).toLowerCase()) return json(409,{ok:false,code:'SOURCE_CANDIDATE_INTEGRITY_MISMATCH',jobId:item.jobId});
    const technical=inspectTechnicalQa(bytes);
    if(technical.result!=='PASS') return json(409,{ok:false,code:'SOURCE_CANDIDATE_TECHNICAL_QA_NOT_PASS',jobId:item.jobId,reasons:technical.reasons});
    const presentation=derivePresentationSizing({
      visualForm:src.visualForm,
      architectureMode:src.architectureMode,
      width:technical.metrics.width,
      height:technical.metrics.height,
      alphaBBox:technical.metrics.bbox
    });
    if(presentation.status!=='CALIBRATED_BASELINE') return json(409,{ok:false,code:'PRESENTATION_SIZING_BLOCKED',jobId:item.jobId});
    const scale=deriveInGardenQaScale({
      jobId:item.jobId,
      visualForm:src.visualForm,
      growthStage:src.growthStage,
      phenology:src.phenology
    },{calibrationStatus:'validated'});
    const band=qaScaleBandSpec(scale.recommendedBand);
    jobs.push({
      jobId:item.jobId,
      canonicalSlug:item.canonicalSlug,
      scientific:item.scientific,
      visualForm:src.visualForm,
      architectureMode:src.architectureMode,
      growthStage:src.growthStage,
      phenology:src.phenology,
      objectKey:src.objectKey,
      sha256:src.sha256,
      bytes:Number(src.bytes),
      sourceModelQaRunId:item.sourceModelQaRunId,
      qaRendererInput:{
        ok:true,
        code:'QA_PREVIEW_PRESENTATION_BASELINE',
        source:'presentation-sizing-v1+in-garden-qa-scale-policy-v1',
        baseWidthPx:presentation.baseWidthPx,
        qaScaleBand:scale.recommendedBand,
        qaMaxHeightPct:band.maxHeightPct,
        qaMaxWidthPct:band.maxWidthPct,
        qaScalePolicyVersion:scale.policyVersion,
        scale:1,
        x:0.56,
        y:0.86,
        rotation:0,
        authorityUserResized:false,
        renderingOwner:'Garden Design production renderer',
        independentQaScaleMath:false
      }
    });
  }

  return json(200,{
    contract:'plant-visual-in-garden-model-qa-plan-v1',
    runId,
    sourceManifestId:bundleId,
    sourceAssuranceReport:'cruvit-e2e-owner-review-bundle-v1',
    createdAt:'2026-09-25',
    rendererOwner:'Garden Design production renderer',
    sourceGardenRequirement:'real saved Garden Design source photo only',
    sourceGarden:{
      designId:'a1a34009-a0b6-4e4a-a141-8926dd60334e',
      sourceMediaId:'08bc3085-9d6c-4c7e-a67a-dba324f00e70',
      storageBucket:'user-garden-media',
      storagePath:'819f3520-f516-4cb0-9a8c-f3eb8255126e/fab7eec4-86b7-4b8a-838d-8aa4bba61657/08bc3085-9d6c-4c7e-a67a-dba324f00e70/garden-source.jpg',
      validationState:'validated',
      signedUrlPersisted:false,
      objectCopiedToPlantStorage:false
    },
    provider:'openai-responses-api',
    model:'gpt-5.6-luna',
    reasoningEffort:'low',
    jobCount:jobs.length,
    jobs,
    requiredChecks:['perspective','groundContact','stickerLook','halo','sharpnessMatch','colorTonalMatch','scaleRealism','silhouette'],
    outputPolicy:{allowedVerdicts:['PASS','FAIL','UNCERTAIN'],failRoutesToHold:true,uncertainRoutesToOwnerReview:true,noSilentPass:true},
    executionPolicy:{ownerSpendApprovalRequired:true,maxCalls:jobs.length,maxRetries:0,productionWritesAllowed:false,registryWritesAllowed:false,candidateEvidenceOnly:true},
    safety:{realSavedGardenPhotoRequired:true,localStandInForbidden:true,rendererSnapshotMustUseQaRendererInput:true,noGardenPhotoMutation:true,noImageGeneration:true,noProductionPromotion:true}
  });
};
export const config={path:'/.netlify/functions/cruvit-e2e-in-garden-plan-builder'};
