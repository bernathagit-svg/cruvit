import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {evaluateRow,OUTPUT_PATH,REPAIR_ID} from './prepare-six-plant-climate-supplement-20261007.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,OUTPUT_PATH);
const read=name=>JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const before=read('catalog-before.json'),after=read('catalog-after.json');
const patches=read('catalog-patches.json'),preflight=read('preflight.json');
const live=read('live-intake-readback.json'),approval=read('approval-and-scope.json');
const withoutTimestamp=row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=='updated_at'));
assert.equal(after.target_rows.length,3);
assert.equal(after.control_rows.length,3);
assert.equal(after.other_rows_count,before.other_rows_count);
assert.equal(after.other_rows_md5,before.other_rows_md5);
for(const record of after.target_rows){
  assert.deepEqual(withoutTimestamp(record.row),withoutTimestamp(patches.find(p=>p.slug===record.slug).after));
}
for(const record of after.control_rows){
  const original=before.control_rows.find(p=>p.slug===record.slug);
  assert.equal(record.row_md5,original.row_md5);
  assert.deepEqual(record.row,original.row);
}
for(const [file,hash] of Object.entries(preflight.protectedHashes)){
  assert.equal(sha(fs.readFileSync(path.join(root,file))),hash,file);
}
const tracked=spawnSync('git',['diff','--exit-code','278ab87150fe60377c3a3e56f82dfdf0182c6f67','--','modules','netlify','.github','netlify.toml','data/plants.seed.json','data/plant-identity.registry.json','data/catalog','data/catalog-expansion/packets/six-plant-data-repair-2026-10-07','data/garden-design/plant-intake-e2e-stress-tests/six-plant-data-repair-2026-10-07-v1','data/garden-design/plant-intake-e2e-stress-tests/six-plant-evidence-followup-2026-10-07-v1'],{cwd:root,encoding:'utf8'});
assert.equal(tracked.status,0,'Protected tracked files changed: '+tracked.stdout+tracked.stderr);
assert.equal(live.ok,true);
assert.equal(live.total,6);
assert.equal(live.rows.length,6);
for(const key of ['paidCallsExecuted','catalogWritesExecuted','productionWritesExecuted','registryWritesExecuted'])assert.equal(live[key],0,key);
const actualResults=[...after.target_rows,...after.control_rows].map(record=>evaluateRow(record.row,root));
assert(actualResults.every(row=>row.readinessClass==='A'&&row.onboardingReady));
for(const slug of ['mango','date-palm','monstera']){
  const row=actualResults.find(r=>r.slug===slug);
  assert(row.unknownVisualStates.includes('flowering'));
  assert.equal(row.allStatesComplete,false);
}
const legacyLog=path.join(directory,'regression-tests.tap'),logPath=path.join(directory,'regression-tests.log');
if(fs.existsSync(legacyLog))fs.renameSync(legacyLog,logPath);
const log=fs.readFileSync(logPath,'utf8');
assert(/tests 87\b/.test(log));assert(/pass 87\b/.test(log));assert(/fail 0\b/.test(log));assert(/skipped 0\b/.test(log));
const sourceReport=read('source-verification.json');
assert.equal(sourceReport.checks.length,6);
const summary={
  id:REPAIR_ID,status:'APPLIED_AND_INDEPENDENT_READBACK_VERIFIED',
  appliedAt:after.target_rows[0].row.updated_at,verifiedAt:after.captured_at,
  authorization:approval,
  transaction:{targetTable:'public.catalog_plants',rowsUpdated:3,atomic:true,optimisticApprovedRowHashesChecked:true,
    updatedFields:'Approved climate paths, directly necessary botanical provenance, updated_at',
    exactAfterRowsVerifiedExcludingExpectedUpdatedAt:true,otherRowsPreserved:after.other_rows_count,
    otherRowsMd5:after.other_rows_md5,otherRowsHashFormula:"md5(string_agg(to_jsonb(c)::text,'' order by c.slug)) excluding three target slugs",
    controlRowsPreserved:after.control_rows.map(row=>({slug:row.slug,rowMd5:row.row_md5})),
    targetReadback:after.target_rows.map(row=>({slug:row.slug,rowMd5:row.row_md5}))},
  actualCatalogEvaluation:actualResults,
  tests:{passed:87,failed:0,skipped:0,newIndependentExecutionTests:9,
    execution:'Local node --test against seven relevant suites; not remote CI',log:'regression-tests.log'},
  liveReadback:{endpoint:'https://friendly-taiyaki-64aacb.netlify.app/.netlify/functions/cruvit-plant-intake-engine?slugs=mango,date-palm,monstera,hydrangea,fig,lettuce',
    ok:true,total:live.total,engineMinimumCoverageApprovalCount:live.fullCruvitApproved,byStage:live.byStage,
    paidCallsExecuted:live.paidCallsExecuted,catalogWritesExecuted:live.catalogWritesExecuted,
    productionWritesExecuted:live.productionWritesExecuted,registryWritesExecuted:live.registryWritesExecuted,
    rows:live.rows.map(row=>({slug:row.canonicalSlug,stage:row.stage,blockers:row.fullApprovalBlockers,identity:row.catalogIdentityResolution}))},
  scopeCounters:{catalogRowsUpdated:3,paidAiCalls:0,imageGenerationCalls:0,productionDeploys:0,productionR2Writes:0,visualRegistryWrites:0},
  protectedFileHashes:preflight.protectedHashes,
  codeAndVisualAuthoritiesUnchanged:true,
  remainingWork:{
    allStatesCompleteForTargets:false,
    sourceReviewedUnknownPreserved:true,
    sizeAuthorityMetadataDeploymentPerformed:false,
    notes:[
      'Mango is Class A for data readiness. This does not certify suitability for every location.',
      'Mango still has flowering UNKNOWN although the live minimum-coverage gate reports FULL_CRUVIT_APPROVED.',
      'Date Palm and Monstera still have live size-authority and required-visual blockers; their missing winter-chill evidence-state blocker is resolved.',
      'Previously approved local size metadata remains undeployed; the approved scope prohibited Production deployment.',
      'No flowering UNKNOWN state was converted to NOT_REQUIRED and no new visual asset was generated.'
    ]
  }
};
fs.writeFileSync(path.join(directory,'execution-summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({status:summary.status,appliedAt:summary.appliedAt,rowsUpdated:3,otherRowsPreserved:after.other_rows_count,
  tests:summary.tests,actualCatalogEvaluation:actualResults.map(r=>({slug:r.slug,class:r.readinessClass,onboardingReady:r.onboardingReady,unknownVisualStates:r.unknownVisualStates,allStatesComplete:r.allStatesComplete})),
  liveReadback:summary.liveReadback.byStage,scopeCounters:summary.scopeCounters,protectedFilesUnchanged:true},null,2));
