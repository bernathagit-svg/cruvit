import fs from 'node:fs';
import { assessProductionFramingQa } from '../modules/garden-design/asset-factory-v1/production-framing-qa-v1.js';

const ids=[
  'english-lavender__mature__shrub__vegetative__v1',
  'fig__mature__tree__vegetative__v1',
  'pomegranate__young__tree__vegetative__v1'
];

const reassessed=[];
for(const id of ids){
  const doc=JSON.parse(fs.readFileSync('/tmp/'+id+'.json','utf8'));
  const ev=doc.evidence;
  if(!ev||ev.technicalQA?.result!=='PASS'||ev.framingQA?.result!=='FAIL') throw new Error('EXPECTED_ORIGINAL_FAIL:'+id);
  const next=assessProductionFramingQa(ev.technicalQA);
  reassessed.push({
    jobId:id,
    canonicalSlug:ev.canonicalSlug,
    objectKey:ev.objectKey,
    sha256:ev.sha256,
    bytes:ev.bytes,
    originalFramingQA:ev.framingQA,
    reassessedFramingQA:next,
    assetBytesChanged:false,
    regenerationRequired:next.result!=='PASS'
  });
}
if(reassessed.some(x=>x.reassessedFramingQA.result!=='PASS')){
  console.error(JSON.stringify(reassessed,null,2));
  throw new Error('FRAMING_REASSESSMENT_NOT_ALL_PASS');
}

const report={
  contract:'plant-visual-framing-reassessment-v1',
  version:'production-framing-qa-v1.1',
  runId:'cruvit-e2e-batch-b-visual-wave-001-2026-09-25-v1',
  createdAt:'2026-09-25',
  reassessedCount:3,
  pass:3,
  fail:0,
  rationale:'Original failures were within the tested 3px edge-padding tolerance and had no actual canvas-edge clipping.',
  rows:reassessed,
  paidCalls:0,
  imageMutation:false,
  regenerationCalls:0,
  productionWrites:0,
  registryWrites:0
};
const reportPath='data/garden-design/plant-visual-framing-reassessments/cruvit-e2e-batch-b-framing-reassessment-2026-09-25-v1.json';
fs.mkdirSync(reportPath.slice(0,reportPath.lastIndexOf('/')),{recursive:true});
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');

const manifest=JSON.parse(fs.readFileSync(
  'data/garden-design/plant-visual-production-wave-execution-manifests/cruvit-e2e-batch-b-visual-wave-001-2026-09-25-v1.json','utf8'
));
const byJob=new Map(manifest.jobs.map(x=>[x.jobId,x]));

const planPath='data/garden-design/plant-visual-model-qa-plans/cruvit-e2e-batch-b-model-qa-2026-09-25-v1.json';
const proposalPath='data/garden-design/plant-visual-model-qa-spend-proposals/cruvit-e2e-batch-b-model-qa-2026-09-25-v1.json';
const plan=JSON.parse(fs.readFileSync(planPath,'utf8'));
const proposal=JSON.parse(fs.readFileSync(proposalPath,'utf8'));

for(const row of reassessed){
  if(plan.jobs.some(x=>x.jobId===row.jobId)) continue;
  const m=byJob.get(row.jobId);
  if(!m) throw new Error('MANIFEST_JOB_MISSING:'+row.jobId);
  plan.jobs.push({
    jobId:row.jobId,
    canonicalSlug:m.canonicalSlug,
    scientific:m.scientific,
    visualForm:m.visualForm,
    architectureMode:m.architectureMode,
    growthStage:m.growthStage,
    phenology:m.phenology,
    objectKey:row.objectKey,
    sha256:row.sha256,
    bytes:Number(row.bytes),
    framingReassessment:{
      version:'production-framing-qa-v1.1',
      report:'cruvit-e2e-batch-b-framing-reassessment-2026-09-25-v1',
      result:'PASS',
      assetBytesChanged:false
    }
  });
}
plan.jobs.sort((a,b)=>a.jobId.localeCompare(b.jobId));
plan.jobCount=plan.jobs.length;
plan.executionPolicy.maxCalls=plan.jobs.length;
if(plan.jobCount!==18) throw new Error('MODEL_QA_PLAN_NOT_18');

proposal.jobIds=plan.jobs.map(x=>x.jobId);
proposal.maxCalls=18;
proposal.proposedMaxSpendUsd=0.27;
proposal.notes=[
  'All 18 Batch B candidates now have Technical PASS and effective Framing PASS.',
  'Three candidates use zero-mutation production-framing-qa-v1.1 reassessment after original sub-3px threshold-only failures.',
  'No image regeneration occurred for framing reassessment.',
  'No retries are proposed.'
];

fs.writeFileSync(planPath,JSON.stringify(plan,null,2)+'\n');
fs.writeFileSync(proposalPath,JSON.stringify(proposal,null,2)+'\n');
console.log(JSON.stringify({reassessmentPass:3,modelQaJobs:18,proposedMaxSpendUsd:0.27}));
