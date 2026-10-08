import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const BASE='0ca252313fbed6593fce0a754a804e0d352f6aca';
const ALLOWED=[
  'app.html',
  'modules/personal-domain/pre-scale-suitability-systemic-hardening-v1-contract.js',
  'modules/personal-domain/smart-rec-climate-meta-authority-v1.js',
  'modules/personal-domain/specific-plant-suitability-contract.js'
].sort();
const DIR='data/personal-domain/climate-boolean-unknown-2026-10-08-v1';
const OUT=path.join(ROOT,DIR,'scope-verification.json');
const git=(args)=>cp.execFileSync('git',args,{cwd:ROOT,encoding:'utf8',timeout:20000,maxBuffer:6000000}).trimEnd();
const blob=(rel)=>cp.execFileSync('git',['show',BASE+':'+rel],{cwd:ROOT,timeout:20000,maxBuffer:6000000});
const sha=(value)=>crypto.createHash('sha256').update(value).digest('hex');
const readJson=(rel)=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8').replace(/^\uFEFF/,''));
const assert=(ok,reason)=>{if(!ok)throw new Error(reason);};

assert(!fs.existsSync(OUT),'Refuse to overwrite an existing scope report');
const changed=git(['diff',BASE,'--name-only','--diff-filter=DMRT']).split('\n').filter(Boolean).sort();
assert(JSON.stringify(changed)===JSON.stringify(ALLOWED),'Tracked runtime scope differs from the four approved draft paths');

function replaceUnique(src,old,next){
  assert(src.split(old).length===2,'Expected unique source scope marker: '+old.slice(0,90));
  return src.replace(old,next);
}
function maskSpan(src,start,end){
  assert(src.split(start).length===2&&src.split(end).length===2,'Nonunique source boundary');
  const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
  assert(b>a,'Invalid source boundary');
  return src.slice(0,a)+'/* scoped boolean metadata */\n'+src.slice(b);
}
function maskMetadata(src){
  src=maskSpan(src,'/* Single-authority climate meta: track synthetic merge defaults; preserve structured fields. */','const SMART_REC_CLIMATE_GROUPS={');
  src=maskSpan(src,'function climateMetaFromCatalogTraits(traits,scientific){','function getPlantClimateMetadata(slugOrPlant){');
  return src;
}
const appBefore=blob('app.html').toString('utf8');
const appAfter=fs.readFileSync(path.join(ROOT,'app.html'),'utf8');
let appNormalized=replaceUnique(appAfter,
  'if(meta.needsWinterChill===true&&garden.alwaysHot&&!garden.coolSeasonSignal)',
  'if(meta.needsWinterChill&&garden.alwaysHot&&!garden.coolSeasonSignal)');
appNormalized=replaceUnique(appNormalized,
  "if(metaHasGroup('temperate-chill-fruit-tree')&&meta.needsWinterChill===true&&garden.alwaysHot&&!garden.coolSeasonSignal)",
  "if(metaHasGroup('temperate-chill-fruit-tree')&&garden.alwaysHot&&!garden.coolSeasonSignal)");
appNormalized=replaceUnique(appNormalized,
  "if(smartRecMetaHasGroup(meta,'temperate-chill-fruit-tree')&&meta.needsWinterChill===true&&climateProfile.alwaysHot&&!climateProfile.coolSeasonSignal)",
  "if(smartRecMetaHasGroup(meta,'temperate-chill-fruit-tree')&&climateProfile.alwaysHot&&!climateProfile.coolSeasonSignal)");
assert(maskMetadata(appBefore)===maskMetadata(appNormalized),
  'app.html changed outside metadata helpers and three explicit chill guards');

const priorGate=readJson('data/garden-design/plant-intake-e2e-stress-tests/full-visual-state-completion-2026-10-08-v1/verification.json');
const priorLocation=readJson('tests/_six-plant-location-regression-20261008-report.json');
const historical=[
  'tests/_six-plant-location-regression-20261008-report.json',
  'scripts/verify-six-plant-location-regression-20261008.mjs',
  'scripts/verify-full-visual-state-completion-20261008.mjs',
  'tests/full-visual-state-completion-v1.test.mjs',
  'modules/catalog/full-cruvit-plant-approval-v1.js',
  'modules/catalog/cruvit-plant-intake-engine-v1.js',
  'netlify/functions/full-cruvit-plant-approval.mjs',
  'data/plants.seed.json',
  ...['README.md','verification.json','guard-regression-tests.log','regression-tests.log','location-regression.log'].map(n=>
    'data/garden-design/plant-intake-e2e-stress-tests/full-visual-state-completion-2026-10-08-v1/'+n)
];
const protectedPaths=[...new Set([
  ...priorGate.protectedFiles.map(x=>x.path),
  ...priorLocation.preservation.inputFiles.map(x=>x.path),
  ...historical
])].filter(x=>!ALLOWED.includes(x)).sort();
const protectedFiles=protectedPaths.map(rel=>{
  const before=blob(rel),after=fs.readFileSync(path.join(ROOT,rel));
  assert(before.equals(after),'Protected source changed: '+rel);
  return {path:rel,sha256:sha(after),unchanged:true};
});
const sourceFiles=ALLOWED.map(rel=>{
  const before=blob(rel),after=fs.readFileSync(path.join(ROOT,rel));
  return {path:rel,baseBlob:git(['rev-parse',BASE+':'+rel]),baseSha256:sha(before),draftSha256:sha(after)};
});
const report={
  kind:'cruvit-climate-boolean-unknown-scope-v1',
  status:'LOCAL_DRAFT_SCOPE_VERIFIED_NOT_DEPLOYED',
  verifiedAt:new Date().toISOString(),
  baseCommit:BASE,
  branch:git(['branch','--show-current']),
  sourceFiles,
  appOutsideMetadataAndThreeChillGuardsUnchanged:true,
  knownTrueGuardWeightsPreserved:true,
  protectedFiles,
  historicalReportsOverwritten:false,
  catalogDataChanged:false,
  visualRegistryChanged:false,
  originalGateStatusSnapshot:priorGate.evaluations.map(x=>({
    slug:x.sourceCatalogSlug,dataClass:x.dataReadinessClass,dataGate:x.dataGate,
    unknownVisualStates:x.unknownVisualStates
  })),
  limits:[
    'Scope and preservation verification only; functional tests and the fresh location comparison are separate artifacts.',
    'The six-plant data class snapshot is inherited from unchanged catalog/approval sources; no database was queried.',
    'Free-text seasonal heuristics, separate hardBlockRules, reproductiveClimate and confidence propagation are outside this change.',
    'The existing second chill penalty for true plus the temperate group is preserved; its weight was not redesigned.'
  ],
  publication:{publicPushAuthorized:false,publicPushExecuted:false,productionDeploymentAuthorized:false},
  operations:{networkCalls:0,databaseWrites:0,visualRegistryWrites:0,paidAiCalls:0,imageGenerationCalls:0,deployments:0}
};
fs.mkdirSync(path.dirname(OUT),{recursive:true});
fs.writeFileSync(OUT,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,modifiedRuntimeFiles:sourceFiles.length,protectedFiles:protectedFiles.length,appOtherContentUnchanged:true,out:OUT},null,2));
