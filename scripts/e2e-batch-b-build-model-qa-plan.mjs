import fs from 'node:fs';

const status=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const manifest=JSON.parse(fs.readFileSync(
  'data/garden-design/plant-visual-production-wave-execution-manifests/cruvit-e2e-batch-b-visual-wave-001-2026-09-25-v1.json','utf8'
));
if(status.generated!==18||status.pending!==0||status.technicalPass!==18) throw new Error('BATCH_B_GENERATION_NOT_COMPLETE');
const byJob=new Map(manifest.jobs.map(x=>[x.jobId,x]));
const pass=status.rows.filter(x=>x.framingQA==='PASS');
const fail=status.rows.filter(x=>x.framingQA==='FAIL');
if(pass.length!==15||fail.length!==3) throw new Error('EXPECTED_15_PASS_3_FAIL');

const jobs=pass.map(row=>{
  const m=byJob.get(row.jobId);
  if(!m) throw new Error('MANIFEST_JOB_MISSING:'+row.jobId);
  return {
    jobId:row.jobId,
    canonicalSlug:m.canonicalSlug,
    scientific:m.scientific,
    visualForm:m.visualForm,
    architectureMode:m.architectureMode,
    growthStage:m.growthStage,
    phenology:m.phenology,
    objectKey:row.objectKey,
    sha256:row.sha256,
    bytes:Number(row.bytes)
  };
});
const runId='cruvit-e2e-batch-b-model-qa-2026-09-25-v1';
const plan={
  contract:'plant-visual-model-qa-plan-v1',
  runId,
  sourceManifestId:manifest.runId,
  createdAt:'2026-09-25',
  provider:'openai-responses-api',
  model:'gpt-5.6-luna',
  reasoningEffort:'low',
  purpose:'candidate-pixel-botanical-state-qa',
  jobCount:jobs.length,
  jobs,
  requiredChecks:['botanicalIdentity','architecture','growthStage','phenologyState'],
  outputPolicy:{allowedVerdicts:['PASS','FAIL','UNCERTAIN'],lowConfidenceNeverAutoPass:true,uncertainRoutesToOwnerReview:true,failRoutesToHold:true},
  executionPolicy:{ownerSpendApprovalRequired:true,maxCalls:15,maxRetries:0,candidateR2EvidenceOnly:true,productionWritesAllowed:false,registryWritesAllowed:false},
  safety:{sourceImageMustMatchManifestSha:true,noGeneration:true,noImageMutation:true,noProductionPromotion:true,noRegistryMutation:true}
};
const proposal={
  contract:'plant-visual-model-qa-spend-proposal-v1',
  runId,
  createdAt:'2026-09-25',
  provider:'openai-responses-api',
  model:'gpt-5.6-luna',
  maxCalls:15,
  maxRetries:0,
  perCallReserveUsd:0.01,
  proposedMaxSpendUsd:0.23,
  jobIds:jobs.map(x=>x.jobId),
  allowedActions:[
    'read exact candidate PNG bytes from candidate R2',
    'send one candidate image plus expected metadata to vision QA model',
    'write model QA evidence only to candidate R2'
  ],
  productionWritesAllowed:false,
  registryWritesAllowed:false,
  imageGenerationAllowed:false,
  imageMutationAllowed:false,
  notes:[
    'Only the 15 Batch B candidates with Technical PASS + Framing PASS are admitted.',
    'The three Framing FAIL candidates are excluded pending framing-failure diagnosis.',
    'No retries are proposed.'
  ]
};
const failureReport={
  contract:'plant-visual-framing-failure-routing-v1',
  runId:manifest.runId,
  createdAt:'2026-09-25',
  failedCount:fail.length,
  jobs:fail.map(x=>({
    jobId:x.jobId,
    canonicalSlug:x.canonicalSlug,
    objectKey:x.objectKey,
    sha256:x.sha256,
    bytes:x.bytes,
    technicalQA:x.technicalQA,
    framingQA:x.framingQA,
    nextAction:'DIAGNOSE_EXACT_FRAMING_FAILURE_BEFORE_ANY_REGENERATION'
  })),
  retriesAuthorized:0,
  productionWrites:0,
  registryWrites:0
};
for(const [p,o] of [
  ['data/garden-design/plant-visual-model-qa-plans/'+runId+'.json',plan],
  ['data/garden-design/plant-visual-model-qa-spend-proposals/'+runId+'.json',proposal],
  ['data/garden-design/plant-visual-framing-failure-routes/cruvit-e2e-batch-b-framing-failures-2026-09-25-v1.json',failureReport]
]){
  fs.mkdirSync(p.slice(0,p.lastIndexOf('/')),{recursive:true});
  fs.writeFileSync(p,JSON.stringify(o,null,2)+'\n');
}
console.log(JSON.stringify({modelQaJobs:jobs.length,framingFailures:fail.length,proposedMaxSpendUsd:proposal.proposedMaxSpendUsd}));
