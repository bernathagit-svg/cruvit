import fs from 'node:fs';

const inputPath=process.argv[2];
const outPath=process.argv[3];
const visionPath=process.argv[4];
const proposalPath=process.argv[5];
const status=JSON.parse(fs.readFileSync(inputPath,'utf8'));
if(!status.ok||status.captured!==status.jobCount||status.pending!==0) throw new Error('CAPTURE_STATUS_INCOMPLETE');

const rows=(status.rows||[]).map(row=>{
  if(row.status!=='CAPTURED'||!row.geometry?.cutout||!row.geometry?.wrapper||!row.geometry?.layer){
    return {...row,geometryQa:'BLOCKED',reasonCodes:['CAPTURE_GEOMETRY_MISSING'],metrics:{}};
  }
  const c=row.geometry.cutout,w=row.geometry.wrapper,l=row.geometry.layer;
  const reasons=[];
  if(c.x<0||c.y<0||c.x+c.width>w.width||c.y+c.height>w.height) reasons.push('CROP_VISIBLE_IN_CONTEXT');
  const expectedGround=l.y*row.geometry.base.height;
  const groundDelta=Math.abs((c.y+c.height)-expectedGround);
  if(groundDelta>Math.max(24,w.height*0.05)) reasons.push('GROUND_CONTACT_BAD');
  const frameAreaRatio=(c.width*c.height)/(w.width*w.height);
  return {
    jobId:row.jobId,canonicalSlug:row.canonicalSlug,status:row.status,
    captureObjectKey:row.captureObjectKey,sha256:row.sha256,bytes:row.bytes,
    geometryQa:reasons.length?'FAIL':'PASS',
    reasonCodes:reasons,
    metrics:{
      cutoutTop:c.y,
      cutoutBottom:c.y+c.height,
      cutoutLeft:c.x,
      cutoutRight:c.x+c.width,
      wrapperWidth:w.width,
      wrapperHeight:w.height,
      expectedGround,
      groundDelta,
      frameAreaRatio:+frameAreaRatio.toFixed(4),
      qaBaseWidthPx:l.qaBaseWidthPx,
      qaEffectiveBaseWidthPx:l.qaEffectiveBaseWidthPx,
      qaScaleBand:l.qaScaleBand,
      qaMaxHeightPct:l.qaMaxHeightPct,
      qaEffectiveMaxHeightPct:l.qaEffectiveMaxHeightPct
    },
    realSavedGardenPhotoUsed:row.realSavedGardenPhotoUsed===true,
    rendererOwner:row.rendererOwner
  };
});
const report={
  contract:'plant-visual-in-garden-geometry-qa-v1',
  runId:status.runId,
  generatedAt:'2026-09-25',
  total:rows.length,
  pass:rows.filter(x=>x.geometryQa==='PASS').length,
  fail:rows.filter(x=>x.geometryQa==='FAIL').length,
  blocked:rows.filter(x=>x.geometryQa==='BLOCKED').length,
  paidCalls:0,networkCalls:0,productionWrites:0,registryWrites:0,
  scalePolicyVersion:'in-garden-qa-scale-policy-v1',
  allRealSavedGardenPhoto:rows.every(x=>x.realSavedGardenPhotoUsed===true),
  rows
};
fs.mkdirSync(outPath.substring(0,outPath.lastIndexOf('/')),{recursive:true});
fs.writeFileSync(outPath,JSON.stringify(report,null,2)+'\n');
if(report.pass!==12||report.fail!==0||report.blocked!==0||!report.allRealSavedGardenPhoto){
  throw new Error('GEOMETRY_QA_NOT_ALL_PASS:'+JSON.stringify({pass:report.pass,fail:report.fail,blocked:report.blocked}));
}

const sourcePlan=JSON.parse(fs.readFileSync(
  'data/garden-design/plant-visual-in-garden-model-qa-plans/cruvit-e2e-batch-a-in-garden-qa-2026-09-25-v1.json','utf8'
));
const byJob=new Map(sourcePlan.jobs.map(x=>[x.jobId,x]));
const visionJobs=rows.map(row=>{
  const src=byJob.get(row.jobId);
  if(!src) throw new Error('SOURCE_PLAN_JOB_MISSING:'+row.jobId);
  return {
    jobId:row.jobId,canonicalSlug:row.canonicalSlug,scientific:src.scientific,
    visualForm:src.visualForm,architectureMode:src.architectureMode,
    growthStage:src.growthStage,phenology:src.phenology,
    objectKey:src.objectKey,sha256:src.sha256,
    qaRendererInput:src.qaRendererInput,
    captureObjectKey:row.captureObjectKey,
    captureSha256:row.sha256,
    geometryMetrics:row.metrics
  };
});
const visionRunId='cruvit-e2e-batch-a-in-garden-vision-qa-2026-09-25-v1';
const vision={
  contract:'plant-visual-in-garden-vision-qa-plan-v1',
  runId:visionRunId,
  sourceCaptureRunId:status.runId,
  sourceManifestId:sourcePlan.sourceManifestId,
  createdAt:'2026-09-25',
  provider:'openai-responses-api',model:'gpt-5.6-luna',reasoningEffort:'low',imageDetail:'high',
  jobCount:visionJobs.length,jobs:visionJobs,
  requiredChecks:['perspective','groundContact','stickerLook','halo','sharpnessMatch','colorTonalMatch','scaleRealism','silhouette'],
  outputPolicy:{allowedVerdicts:['PASS','FAIL','UNCERTAIN'],failRoutesToHold:true,uncertainRoutesToOwnerReview:true,allPassRequiredForAutomaticInGardenPass:true},
  executionPolicy:{ownerSpendApprovalRequired:true,maxCalls:12,maxRetries:0,candidateEvidenceOnly:true,productionWritesAllowed:false,registryWritesAllowed:false},
  safety:{sourceCaptureShaMustMatch:true,realSavedGardenPhotoEvidenceRequired:true,noGeneration:true,noImageMutation:true,noProductionPromotion:true}
};
fs.mkdirSync(visionPath.substring(0,visionPath.lastIndexOf('/')),{recursive:true});
fs.writeFileSync(visionPath,JSON.stringify(vision,null,2)+'\n');

const proposal={
  contract:'plant-visual-in-garden-vision-qa-spend-proposal-v1',
  runId:visionRunId,createdAt:'2026-09-25',
  provider:'openai-responses-api',model:'gpt-5.6-luna',
  jobCount:12,maxCalls:12,maxRetries:0,perCallReserveUsd:0.01,
  proposedMaxSpendUsd:0.18,
  rationale:[
    'Batch A has 12 geometry-pass in-garden captures.',
    'Prior Wave 2 used 6 calls with actual spend about USD 0.0044; Wave 3 used similarly low actual spend.',
    'USD 0.18 preserves conservative bounded headroom for 12 high-detail calls.'
  ],
  jobIds:visionJobs.map(x=>x.jobId),
  allowedActions:[
    'read exact in-garden QA capture bytes from candidate R2',
    'send one renderer capture plus expected plant metadata to vision QA model',
    'write in-garden vision QA evidence only to candidate R2'
  ],
  productionWritesAllowed:false,registryWritesAllowed:false,imageGenerationAllowed:false,imageMutationAllowed:false
};
fs.mkdirSync(proposalPath.substring(0,proposalPath.lastIndexOf('/')),{recursive:true});
fs.writeFileSync(proposalPath,JSON.stringify(proposal,null,2)+'\n');
console.log(JSON.stringify({geometry:{pass:report.pass,fail:report.fail},visionJobs:vision.jobCount,proposedMaxSpendUsd:proposal.proposedMaxSpendUsd}));
