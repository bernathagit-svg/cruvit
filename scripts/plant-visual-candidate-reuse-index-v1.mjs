import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const plansDir=path.join(ROOT,'data/garden-design/plant-visual-model-qa-plans');
const reportsDir=path.join(ROOT,'data/garden-design/plant-visual-model-qa-reports');
const reviewDir=path.join(ROOT,'data/garden-design/plant-visual-owner-review-routes');

function readJson(fp){return JSON.parse(fs.readFileSync(fp,'utf8'));}
function files(dir){return fs.existsSync(dir)?fs.readdirSync(dir).filter(x=>x.endsWith('.json')):[];}

const reportByRun=new Map();
for(const f of files(reportsDir)){
  const doc=readJson(path.join(reportsDir,f));
  if(doc?.runId) reportByRun.set(doc.runId,doc);
}

const ownerReviewJobs=new Set();
for(const f of files(reviewDir)){
  const doc=readJson(path.join(reviewDir,f));
  for(const j of doc?.jobs||[]) if(j?.jobId) ownerReviewJobs.add(j.jobId);
}

const rows=[];
for(const f of files(plansDir)){
  const plan=readJson(path.join(plansDir,f));
  if(plan?.contract!=='plant-visual-model-qa-plan-v1'||!Array.isArray(plan.jobs)) continue;
  const report=reportByRun.get(plan.runId)||null;
  const pass=new Set(report?.passJobs||[]);
  const uncertain=new Set(report?.uncertainJobs||[]);
  const fail=new Set(report?.failJobs||[]);
  for(const job of plan.jobs){
    if(!job?.jobId||!job?.objectKey||!job?.sha256||!Number(job?.bytes)) continue;
    let modelQA='PENDING';
    if(pass.has(job.jobId)) modelQA='PASS';
    else if(uncertain.has(job.jobId)) modelQA='UNCERTAIN';
    else if(fail.has(job.jobId)) modelQA='FAIL';

    // Model-QA plans are only built from exact candidates that already passed
    // generation integrity + Technical QA + Framing QA in the visual pipeline.
    rows.push({
      jobId:job.jobId,
      canonicalSlug:job.canonicalSlug,
      scientific:job.scientific||null,
      visualForm:job.visualForm||null,
      architectureMode:job.architectureMode||job.visualForm||null,
      growthStage:job.growthStage||null,
      phenology:job.phenology||null,
      objectKey:job.objectKey,
      sha256:job.sha256,
      bytes:Number(job.bytes),
      technicalQA:'PASS',
      framingQA:'PASS',
      modelQA,
      ownerReviewRequired:ownerReviewJobs.has(job.jobId) || modelQA==='UNCERTAIN',
      reusable:modelQA!=='FAIL',
      sourceModelQaRunId:plan.runId,
      sourceManifestId:plan.sourceManifestId||null,
      evidenceBasis:'MODEL_QA_PLAN_ADMISSION_REQUIRES_TECHNICAL_AND_FRAMING_PASS'
    });
  }
}

const byJob=new Map();
for(const row of rows){
  const prev=byJob.get(row.jobId);
  if(!prev || (prev.modelQA==='PENDING' && row.modelQA!=='PENDING')) byJob.set(row.jobId,row);
}
const deduped=[...byJob.values()].sort((a,b)=>a.jobId.localeCompare(b.jobId));
const out={
  contract:'plant-visual-candidate-reuse-index-v1',
  generatedAt:'2026-09-25',
  entryCount:deduped.length,
  reusableCount:deduped.filter(x=>x.reusable).length,
  ownerReviewRequiredCount:deduped.filter(x=>x.ownerReviewRequired).length,
  entries:deduped
};
fs.mkdirSync(path.join(ROOT,'data/garden-design'),{recursive:true});
fs.writeFileSync(
  path.join(ROOT,'data/garden-design/plant-visual-candidate-reuse-index-v1.json'),
  JSON.stringify(out,null,2)+'\n'
);
console.log(JSON.stringify({
  entryCount:out.entryCount,
  reusableCount:out.reusableCount,
  ownerReviewRequiredCount:out.ownerReviewRequiredCount
}));
