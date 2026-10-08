/**
 * Local before/after verification for the visual-state completion policy.
 * Reads the exact published catalog snapshot and an untouched baseline checkout.
 * Executes pure domain functions only. Writes a new report in this draft only.
 * No network, database, image generation, registry write, or deployment.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const BASE=path.resolve(process.argv[2]||'');
const BASE_COMMIT='eee0ab34c909ca0323fef32e8f65ddd2dc9eae95';
const INPUT='data/garden-design/plant-intake-e2e-stress-tests/six-plant-climate-supplement-2026-10-07-v1/';
const OUTPUT='data/garden-design/plant-intake-e2e-stress-tests/full-visual-state-completion-2026-10-08-v1/';
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:30000}).trim();
const read=(root,relative)=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
const clone=value=>JSON.parse(JSON.stringify(value));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const moduleAt=(root,relative)=>import(pathToFileURL(path.join(root,relative)).href);
assert(process.argv[2],'Pass the unchanged baseline checkout as the sole argument.');
assert.notEqual(BASE,ROOT);
assert.equal(git(BASE,['rev-parse','HEAD']),BASE_COMMIT);
assert.equal(git(BASE,['status','--porcelain=v1']),'','Baseline checkout must stay unchanged.');

let forbiddenNetworkAttempts=0;
globalThis.fetch=()=>{forbiddenNetworkAttempts++;throw new Error('NETWORK_FORBIDDEN_IN_LOCAL_VERIFICATION');};
const oldGate=await moduleAt(BASE,'modules/catalog/full-cruvit-plant-approval-v1.js');
const newGate=await moduleAt(ROOT,'modules/catalog/full-cruvit-plant-approval-v1.js');
const oldIntake=await moduleAt(BASE,'modules/catalog/cruvit-plant-intake-engine-v1.js');
const newIntake=await moduleAt(ROOT,'modules/catalog/cruvit-plant-intake-engine-v1.js');
const snapshot=read(ROOT,INPUT+'catalog-after.json');
const live=read(ROOT,INPUT+'live-intake-readback.json');
const identities=read(ROOT,'data/plant-identity.registry.json');
const assets=read(ROOT,'modules/garden-design/assets/plants/design-asset-registry-v1.json');
const sizes=read(ROOT,'data/catalog/botanical-size-authority-v1.json');
const media=read(ROOT,'data/catalog-media/active-canonical-image-coverage-v1.json');
const records=[...snapshot.target_rows,...snapshot.control_rows];
assert.equal(records.length,6);
const evaluations=[];
for(const record of records){
  const identity=identities.canonicalIdentities.find(item=>item.canonicalSlug===record.slug||(item.aliasSlugs||[]).includes(record.slug));
  const canonicalSlug=identity?.canonicalSlug||record.slug;
  const input={catalogRow:clone(record.row),identityRegistry:clone(identities),designAssetRegistry:clone(assets),
    sizeAuthorityRegistry:clone(sizes),catalogMediaCoverageRecord:clone(media.records.find(row=>row.slug===canonicalSlug)||null)};
  const original=clone(input);
  const before=oldGate.evaluateFullCruvitPlantApproval(input);
  const after=newGate.evaluateFullCruvitPlantApproval(input);
  assert.deepEqual(input,original,record.slug+': input mutated');
  assert.equal(after.modules.climateAndSuitability.readinessClass,'A');
  assert.equal(after.onboarding.ready,true);
  for(const [name,value] of Object.entries(before.modules)){
    if(name!=='gardenDesign')assert.deepEqual(after.modules[name],value,record.slug+': '+name);
  }
  for(const [name,value] of Object.entries(before.modules.gardenDesign)){
    assert.deepEqual(after.modules.gardenDesign[name],value,record.slug+': gardenDesign.'+name);
  }
  assert.equal(after.approved,false);
  assert.equal(after.status,'ENRICHMENT_REQUIRED');
  assert.ok(after.blockingReasons.includes('VISUAL_STATE_APPLICABILITY_UNRESOLVED'));
  assert.equal(after.modules.gardenDesign.visualStateApplicabilityResolved,false);
  assert.equal(after.modules.gardenDesign.allRequiredVisualStatesComplete,false);
  const visualTransient=clone(live.rows.find(row=>row.canonicalSlug===canonicalSlug)?.visualTransient||null);
  const intakeInput={request:{canonicalSlug},catalogExists:true,visualTransient};
  const beforeIntake=oldIntake.resolveCruvitPlantIntakeStage({...intakeInput,fullApproval:before});
  const afterIntake=newIntake.resolveCruvitPlantIntakeStage({...intakeInput,fullApproval:after});
  assert.equal(afterIntake.stage,'DATA_ENRICHMENT_REQUIRED');
  assert.equal(afterIntake.finalApproved,false);
  assert.deepEqual(afterIntake.paidActions,[]);
  assert.deepEqual(afterIntake.ownerActions,[]);
  evaluations.push({
    sourceCatalogSlug:record.slug,canonicalSlug,scientificName:record.row.scientific_name,
    savedDatabaseRowMd5:record.row_md5,catalogRowSha256:hash(JSON.stringify(record.row)),
    dataReadinessClass:after.modules.climateAndSuitability.readinessClass,
    dataGate:after.modules.climateAndSuitability.gate,onboardingReady:after.onboarding.ready,
    requiredVariantCount:after.modules.gardenDesign.requiredVariantCount,
    coveredRequiredCount:after.modules.gardenDesign.coveredRequiredCount,
    missingRequiredCount:after.modules.gardenDesign.missingRequiredCount,
    unknownVisualStates:after.modules.gardenDesign.unknownStates,
    minimumVisualCoverageReady:after.modules.gardenDesign.minimumVisualCoverageReady,
    visualStateApplicabilityResolved:after.modules.gardenDesign.visualStateApplicabilityResolved,
    allRequiredVisualStatesComplete:after.modules.gardenDesign.allRequiredVisualStatesComplete,
    unchangedModuleOutputs:Object.keys(before.modules).filter(key=>key!=='gardenDesign'),
    existingGardenDesignOutputsUnchanged:true,
    before:{fullApproval:before.approved,fullApprovalStatus:before.status,intakeStage:beforeIntake.stage,
      blockingReasons:before.blockingReasons},
    after:{fullApproval:after.approved,fullApprovalStatus:after.status,intakeStage:afterIntake.stage,
      blockingReasons:after.blockingReasons,systemActionCodes:afterIntake.systemActions.map(action=>action.code),
      paidActionCount:afterIntake.paidActions.length,ownerActionCount:afterIntake.ownerActions.length}
  });
}
assert.equal(evaluations.find(row=>row.canonicalSlug==='mango').before.fullApproval,true);
const protectedPaths=[
  INPUT+'catalog-before.json',INPUT+'catalog-after.json',INPUT+'preflight.json',
  INPUT+'execution-summary.json',INPUT+'live-intake-readback.json',
  'data/plant-identity.registry.json','data/catalog/botanical-size-authority-v1.json',
  'data/catalog-media/active-canonical-image-coverage-v1.json',
  'modules/garden-design/assets/plants/design-asset-registry-v1.json',
  'modules/garden-design/asset-factory-v1/design-asset-visual-states-v1.js',
  'modules/garden-design/asset-factory-v1/plant-visual-variant-plan-v1.js',
  'modules/garden-design/asset-factory-v1/plant-visual-variant-gap-plan-v1.js',
  'data/garden-design/design-asset-visual-state-integrity-gate-v1/baseline-validation.json',
  'data/garden-design/design-asset-visual-state-integrity-gate-v1/catalog-integrity-audit.json',
  'data/garden-design/design-asset-visual-state-integrity-gate-v1/integrity-summary.json',
  'data/garden-design/design-asset-visual-states-v1/catalog-state-audit.json',
  'data/garden-design/design-asset-visual-states-v1/visual-states-summary.json',
  'app.html','netlify.toml'
];
const protectedFiles=protectedPaths.map(relative=>{
  const oldBytes=fs.readFileSync(path.join(BASE,relative));
  const newBytes=fs.readFileSync(path.join(ROOT,relative));
  assert.deepEqual(newBytes,oldBytes,relative+': protected source changed');
  return {path:relative,sha256:hash(newBytes),unchanged:true};
});
const allowedChanged=[
  'modules/catalog/full-cruvit-plant-approval-v1.js','modules/catalog/cruvit-plant-intake-engine-v1.js',
  'netlify/functions/full-cruvit-plant-approval.mjs','tests/cruvit-plant-intake-engine-v1.test.mjs',
  'tests/six-plant-evidence-followup-v1.test.mjs'
];
const changed=git(ROOT,['diff',BASE_COMMIT,'--name-only','--diff-filter=DMRT']).split('\n').filter(Boolean);
assert.deepEqual([...changed].sort(),[...allowedChanged].sort());
git(ROOT,['diff','--check']);

async function baselineCount(root){
  const {loadCanonicalCatalog}=await moduleAt(root,'modules/garden-design/asset-factory-v1/catalog-source-v1.js');
  const {deriveVisualStateRequirements}=await moduleAt(root,'modules/garden-design/asset-factory-v1/design-asset-visual-states-v1.js');
  const {validateBaselineCount}=await moduleAt(root,'modules/garden-design/asset-factory-v1/design-asset-visual-state-integrity-gate-v1.js');
  return validateBaselineCount(loadCanonicalCatalog(root).plants.map(plant=>deriveVisualStateRequirements(plant)));
}
const baselineCountBefore=await baselineCount(BASE);
const baselineCountAfter=await baselineCount(ROOT);
assert.deepEqual(baselineCountAfter,baselineCountBefore);
assert.equal(baselineCountBefore.canonicalPlants,125);
const legacyTest='tests/design-asset-visual-state-integrity-gate-v1.test.mjs';
assert.equal(fs.readFileSync(path.join(BASE,legacyTest),'utf8'),fs.readFileSync(path.join(ROOT,legacyTest),'utf8'));
assert.match(fs.readFileSync(path.join(BASE,legacyTest),'utf8'),/baseline\.baseline\.canonicalPlants,\s*122/);
assert.throws(()=>assert.equal(baselineCountBefore.canonicalPlants,122));
const testCounts=filename=>{
  const log=fs.readFileSync(path.join(ROOT,OUTPUT,filename),'utf8');
  const number=label=>Number(log.match(new RegExp('\\b'+label+' (\\d+)'))?.[1]);
  return {log:filename,total:number('tests'),passed:number('pass'),failed:number('fail'),skipped:number('skipped')};
};
const broadTests=testCounts('regression-tests.log');
const guardTests=testCounts('guard-regression-tests.log');
assert.deepEqual([broadTests.total,broadTests.passed,broadTests.failed,broadTests.skipped],[67,66,1,0]);
assert.equal(guardTests.failed,0);assert.equal(guardTests.skipped,0);assert(guardTests.passed>=25);
assert.equal(forbiddenNetworkAttempts,0);
const report={
  id:'full-visual-state-completion-2026-10-08-v1',
  status:'LOCAL_DRAFT_VERIFIED_NOT_DEPLOYED',verifiedAt:new Date().toISOString(),
  baseCommit:BASE_COMMIT,approvalPolicyVersion:newGate.FULL_CRUVIT_PLANT_APPROVAL_POLICY_VERSION,
  intakePolicyVersion:newIntake.CRUVIT_PLANT_INTAKE_ENGINE_POLICY_VERSION,
  evidenceScope:'Exact saved post-repair six-record catalog snapshot with unchanged local authorities, before/after pure approval and intake. This is not a fresh database read, a deployment, or a location-suitability assessment.',
  beforeApproved:evaluations.filter(row=>row.before.fullApproval).length,
  afterApproved:evaluations.filter(row=>row.after.fullApproval).length,
  evaluations,protectedFiles,changedTrackedFiles:changed,
  verification:{broadTests,finalTargetedGuardTests:guardTests,newIndependentCases:16,
    knownPreexistingFailure:{test:legacyTest,expectedCanonicalPlants:122,
      baselineCanonicalPlants:baselineCountBefore.canonicalPlants,draftCanonicalPlants:baselineCountAfter.canonicalPlants,
      baselineArchitectureCount:baselineCountBefore.architectureBaselines,
      pureBuilderIdenticalBeforeAfter:true,legacyTestUnchanged:true,
      explanation:'The existing catalog contains 125 identities. The historical test still expects 122; the same failing assertion is reproduced from the unchanged baseline pure builder. No expectation was weakened.',
      testGeneratedHistoricalReportsRestored:true}},
  scope:{catalogWrites:0,paidAiCalls:0,imageGenerationCalls:0,visualRegistryWrites:0,productionDeploys:0,
    networkAttempts:forbiddenNetworkAttempts,outputWrites:'New draft verification report only'},
  compatibility:{existingMinimumVisualCoveragePreserved:true,unknownNeverConvertedToNotRequired:true,
    optionalImagesNotRequiredForMinimumCompletion:true,legacyApprovalRequiresCurrentGateResult:true,
    policyFieldAddedWithoutRenamingExistingVersion:true,compactResponseIncludesCompletionFields:true},
  publication:{publicPushAuthorized:false,publicPushExecuted:false,productionDeploymentAuthorized:false}
};
fs.mkdirSync(path.join(ROOT,OUTPUT),{recursive:true});
fs.writeFileSync(path.join(ROOT,OUTPUT,'verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,beforeApproved:report.beforeApproved,afterApproved:report.afterApproved,
  plants:evaluations.map(row=>({slug:row.canonicalSlug,class:row.dataReadinessClass,
    unknown:row.unknownVisualStates,missing:row.missingRequiredCount,stage:row.after.intakeStage})),
  verification:report.verification,protectedFilesVerified:protectedFiles.length,networkAttempts:forbiddenNetworkAttempts},null,2));
