/** Frozen product integration validation. All output stays outside product/source branches. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(HERE,'test-manifest.json'),'utf8'));
const exceptions=JSON.parse(fs.readFileSync(path.join(HERE,'baseline-exceptions.json'),'utf8'));
const root=path.resolve(process.argv[2]);
const baseline=path.resolve(process.argv[3]);
const out=path.resolve(process.argv[4]);
assert(!fs.existsSync(out),'Refuse to overwrite validation evidence');fs.mkdirSync(out,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const g=(a,cwd=root)=>cp.execFileSync('git',a,{cwd,encoding:'utf8',timeout:30000,maxBuffer:5000000}).trimEnd();
const gb=(a,cwd=root)=>cp.execFileSync('git',a,{cwd,timeout:30000,maxBuffer:20000000});
const read=r=>JSON.parse(fs.readFileSync(path.join(HERE,r),'utf8'));
const hold=[];
const identity={productSha:manifest.productSha,observedHead:g(['rev-parse','HEAD']),baselineSha:manifest.aliasSha,baselineHead:g(['rev-parse','HEAD'],baseline),
 platform:os.platform(),node:process.version,hosted:process.env.RUNNER_ENVIRONMENT||'local',workflowCarrierSha:process.env.WORKFLOW_CARRIER_SHA||g(['rev-parse','HEAD'],HERE),
 runId:process.env.GITHUB_RUN_ID||null,runAttempt:process.env.GITHUB_RUN_ATTEMPT||null,startedAt:new Date().toISOString()};
assert.equal(identity.observedHead,manifest.productSha);assert.equal(identity.baselineHead,manifest.aliasSha);
assert.equal(g(['status','--porcelain']),'');assert.equal(g(['status','--porcelain'],baseline),'');
for(const f of manifest.fileManifest){assert.equal(g(['rev-parse','HEAD:'+f.file]),f.gitBlob,'Required test blob differs: '+f.file);assert.equal(hash(fs.readFileSync(path.join(root,f.file))),f.sha256);}
fs.copyFileSync(path.join(HERE,'test-manifest.json'),path.join(out,'executed-test-manifest.json'));
fs.copyFileSync(path.join(HERE,'baseline-exceptions.json'),path.join(out,'baseline-exceptions.json'));
fs.writeFileSync(path.join(out,'execution-identity.json'),JSON.stringify(identity,null,2)+'\n');
console.log('EXECUTION_IDENTITY='+JSON.stringify(identity));
const referenceDelta=gb(['diff','--binary','--full-index','--no-renames',manifest.baseSha,manifest.aliasSha],baseline);
const integratedDelta=gb(['diff','--binary','--full-index','--no-renames',manifest.climateSha,manifest.productSha]);
assert(referenceDelta.equals(integratedDelta),'Alias delta no longer exact');
assert.equal(g(['rev-parse','HEAD^']),manifest.climateSha);
const raw=g(['diff','--raw','--no-abbrev','--no-renames',manifest.climateSha,manifest.productSha]);
assert.equal(raw,g(['diff','--raw','--no-abbrev','--no-renames',manifest.baseSha,manifest.aliasSha],baseline));
const proof=read('candidate-proof.json');assert.equal(hash(integratedDelta),proof.deltaEquivalence.sha256);
assert.deepEqual(g(['rev-list','--reverse',manifest.baseSha+'..HEAD']).split('\n'),proof.ancestry.slice(1));
const audit=path.join(out,'guard-audit.jsonl');fs.writeFileSync(audit,'');
const beforeRoots=[root,baseline].map(cwd=>({cwd,files:Object.fromEntries(g(['ls-files'],cwd).split('\n').filter(Boolean).map(file=>[file,hash(fs.readFileSync(path.join(cwd,file)))]))}));
const envFor=(cwd,dir)=>{
 const e=Object.fromEntries(Object.entries(process.env).filter(([key])=>['PATH','HOME','USERPROFILE','SYSTEMROOT','WINDIR','PATHEXT','TEMP','TMP','TMPDIR','LANG','LC_ALL'].includes(key.toUpperCase())));
 return {...e,CRUVIT_PRODUCT_ROOT:cwd,CRUVIT_EVIDENCE_DIR:dir,CRUVIT_GUARD_AUDIT:audit,NODE_OPTIONS:'--require='+path.join(HERE,'product-guard.cjs'),CI:'true'};
};
function execute(name,args,cwd=root){
 const dir=path.join(out,name);fs.mkdirSync(dir);
 const r=cp.spawnSync(process.execPath,args,{cwd,env:envFor(cwd,dir),encoding:'utf8',timeout:180000,maxBuffer:30000000});
 fs.writeFileSync(path.join(dir,'stdout.log'),r.stdout||'');fs.writeFileSync(path.join(dir,'stderr.log'),r.stderr||'');
 return {name,dir,exitCode:r.status,error:r.error?.message||null,signal:r.signal,stdout:r.stdout||'',stderr:r.stderr||''};
}
const compact=s=>String(s||'').replace(/\s+/g,' ').trim();
const key=e=>e.file+'\0'+e.name;
function assertion(e){let err=e.error;while(err?.cause)err=err.cause;return err;}
function signature(e){const err=assertion(e);return {file:e.file,name:e.name,code:err?.code,actual:err?.actual,expected:err?.expected,operator:err?.operator,message:compact(err?.message)};}
function closedException(e){
 const ex=exceptions.failures.find(x=>x.file===e.file&&x.name===e.name);
 if(!ex)return false;
 const er=assertion(e);
 return er?.code===ex.code && Object.is(er.actual,ex.actual)&&Object.is(er.expected,ex.expected)&&er.operator===ex.operator
  && compact(er.message).includes(compact(ex.reason)) && er.stack?.replace(/\\/g,'/').includes(ex.file+':'+ex.line+':');
}
function runSuite(name,spec,cwd=root){
 const dir=path.join(out,name); // execute creates it before process starts
 const args=['--test','--test-reporter=tap','--test-reporter-destination='+path.join(dir,'tests.tap'),
  '--test-reporter='+pathToFileURL(path.join(HERE,'event-reporter.mjs')).href,'--test-reporter-destination='+path.join(dir,'events.jsonl'),...spec.files];
 const r=execute(name,args,cwd);
 const tap=fs.existsSync(path.join(dir,'tests.tap'))?fs.readFileSync(path.join(dir,'tests.tap'),'utf8'):'';
 const events=fs.existsSync(path.join(dir,'events.jsonl'))?fs.readFileSync(path.join(dir,'events.jsonl'),'utf8').split('\n').filter(Boolean).map(s=>JSON.parse(s)):[];
 const cases=events.filter(e=>e.event==='test:pass'||e.event==='test:fail');
 const counts=Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo'].map(label=>[label,Number(tap.match(new RegExp('^# '+label+' (\\d+)\\s*$','m'))?.[1]??NaN)]));
 const failures=cases.filter(e=>e.event==='test:fail');const skipped=cases.filter(e=>e.skip);
 const noMissing=counts.tests===spec.expectedTests&&cases.length===spec.expectedTests&&new Set(cases.map(key)).size===cases.length&&spec.files.every(file=>cases.some(e=>e.file===file));
 const noNewSkips=skipped.every(e=>exceptions.skips.some(x=>x.file===e.file&&x.name===e.name&&x.reason===e.skip));
 const knownFailures=failures.every(closedException);
 const passed=noMissing&&counts.cancelled===0&&counts.todo===0&&!r.error&&!r.signal&&
  (spec.requireAllPass?(r.exitCode===0&&counts.pass===spec.expectedTests&&counts.fail===0&&counts.skipped===0):
   ((r.exitCode===0||r.exitCode===1)&&knownFailures&&noNewSkips));
 const result={name,passed,counts,expectedTests:spec.expectedTests,noMissingRequiredTests:noMissing,exitCode:r.exitCode,error:r.error,signal:r.signal,
  cases,failures:failures.map(e=>({...signature(e),documentedException:closedException(e)})),skipped:skipped.map(({file,name,skip})=>({file,name,reason:skip})),
  files:spec.files,logSha256:hash(tap),eventsSha256:hash(fs.readFileSync(path.join(dir,'events.jsonl')))};
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(result,null,2)+'\n');
 console.log('SUITE='+JSON.stringify({name,passed,counts,noMissing,failures:result.failures,skipped:result.skipped}));
 if(!passed)hold.push(name+':required-suite-or-closed-baseline-check-failed');
 return result;
}
const results={};
const projection=execute('registry-projection',['scripts/generate-canonical-alias-authority-v1.mjs','--check']);
results.projection={passed:projection.exitCode===0,exitCode:projection.exitCode};if(!results.projection.passed)hold.push('projection-drift');
for(const name of ['targeted','systemic','unknown','supplementVisual'])results[name]=runSuite(name,manifest.suites[name]);
results.baselineExpanded=runSuite('baseline-expanded',manifest.suites.expanded,baseline);
results.expanded=runSuite('candidate-expanded',manifest.suites.expanded);
const baselineCases=new Map(results.baselineExpanded.cases.map(e=>[key(e),e]));
const candidateCases=new Map(results.expanded.cases.map(e=>[key(e),e]));
const comparison={missingCases:[],newCases:[],changedFailureReasons:[],newFailures:[],newSkips:[],unchangedExceptions:[],resolvedExceptions:[]};
for(const [id,old]of baselineCases){const now=candidateCases.get(id);if(!now){comparison.missingCases.push({file:old.file,name:old.name});continue;}
 if(now.event==='test:fail'){
  if(old.event!=='test:fail')comparison.newFailures.push(signature(now));
  else if(JSON.stringify(signature(old))!==JSON.stringify(signature(now)))comparison.changedFailureReasons.push({before:signature(old),after:signature(now)});
  else comparison.unchangedExceptions.push(signature(now));
 }else if(old.event==='test:fail')comparison.resolvedExceptions.push({file:now.file,name:now.name});
 if(now.skip&&now.skip!==old.skip)comparison.newSkips.push({file:now.file,name:now.name,skip:now.skip});
}
for(const[id,e]of candidateCases)if(!baselineCases.has(id))comparison.newCases.push({file:e.file,name:e.name});
comparison.passed=['missingCases','newCases','changedFailureReasons','newFailures','newSkips'].every(k=>comparison[k].length===0)&&results.baselineExpanded.passed&&results.expanded.passed;
results.expandedComparison=comparison;if(!comparison.passed)hold.push('expanded-identity-reason-comparison');
fs.writeFileSync(path.join(out,'expanded-baseline-comparison.json'),JSON.stringify(comparison,null,2)+'\n');
const matrix=execute('matrix42',['--experimental-vm-modules',path.join(HERE,'integration-matrix.mjs')]);
let matrixReport=null;
try{matrixReport=JSON.parse(fs.readFileSync(path.join(matrix.dir,'integration-42-cases.json'),'utf8'));}catch{}
results.matrix42={passed:matrix.exitCode===0&&matrixReport?.status==='PASS'&&matrixReport?.scope?.observedPairs===42&&matrixReport?.integratedFullComparison?.passed===true,
 exitCode:matrix.exitCode,error:matrix.error,reportStatus:matrixReport?.status||null,observedPairs:matrixReport?.scope?.observedPairs||0,
 integratedFullComparison:matrixReport?.integratedFullComparison||null,failures:matrixReport?.failures||[],summaryByPlant:matrixReport?.summaryByPlant||null,
 stderr:matrix.stderr};if(!results.matrix42.passed)hold.push('fresh-integrated-matrix42');
console.log('MATRIX42='+JSON.stringify(results.matrix42));
const corpus=execute('corpus',['scripts/coordinate-climate-v2-upload-r2.mjs','plan']);let plan=null;try{plan=JSON.parse(corpus.stdout);}catch{}
results.corpus={passed:corpus.exitCode===0&&plan?.localCorpusReady===false&&plan?.r2?.ready===false&&plan?.verdict==='BLOCKED',plan,exitCode:corpus.exitCode};
if(!results.corpus.passed)hold.push('clean-runner-corpus-proof');
const guardEvents=fs.readFileSync(audit,'utf8').split('\n').filter(Boolean).map(s=>JSON.parse(s));
const productCodeNetworkAttempts=guardEvents.filter(e=>e.kind==='NETWORK_ATTEMPT').length;
const forbiddenWrites=guardEvents.filter(e=>e.kind==='FORBIDDEN_WRITE');
if(productCodeNetworkAttempts)hold.push('product-network-attempt');if(forbiddenWrites.length)hold.push('forbidden-product-or-external-write');
const preservation=beforeRoots.map(({cwd,files})=>({root:cwd,head:g(['rev-parse','HEAD'],cwd),changed:Object.entries(files).filter(([file,sha])=>!fs.existsSync(path.join(cwd,file))||hash(fs.readFileSync(path.join(cwd,file)))!==sha).map(([file])=>file),status:g(['status','--porcelain'],cwd),trackedFiles:Object.keys(files).length}));
if(preservation.some(r=>r.changed.length||r.status))hold.push('frozen-checkout-mutated');
assert.equal(g(['rev-parse','HEAD']),manifest.productSha);
const summarize=(r)=>r&&r.cases?{...r,cases:undefined}:r;
const summary={...identity,finishedAt:new Date().toISOString(),status:hold.length?'HOLD':(results.expanded.counts.fail?'REQUIRED_PASS_BASELINE_EXCEPTIONS_REMAIN':'PASS'),
 validationPass:hold.length===0,holdReasons:hold,productCodeNetworkAttempts,forbiddenWrites,legacyReportWritesRedirected:guardEvents.filter(e=>e.kind==='REPORT_REDIRECT'),
 deltaEquivalence:{passed:true,sha256:hash(integratedDelta),rawDiffEqual:true},preservation,
 results:Object.fromEntries(Object.entries(results).map(([k,v])=>[k,summarize(v)])),
 limits:['Disposable candidate only; no merge composition approved.','Expanded baseline failures are not counted as passing tests.','No tests or historical artifacts modified.','No 42-case agronomic accuracy or live forecast guarantee.','Validation tooling is separate from product candidate.'],
 operations:{sqlReplay:0,dbWrites:0,r2Writes:0,registryWrites:0,deploy:0,paidAi:0,imageGeneration:0,merge:0}};
fs.writeFileSync(path.join(out,'integration-summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log('INTEGRATION_SUMMARY='+JSON.stringify({...summary,results:Object.fromEntries(Object.entries(summary.results).map(([k,v])=>[k,v.counts?{passed:v.passed,counts:v.counts,failures:v.failures}:v])),preservation}));
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'# Disposable climate/alias candidate\n\nProduct: `'+manifest.productSha+'`\n\nStatus: **'+summary.status+'**\n\n```json\n'+JSON.stringify({holdReasons:hold,productCodeNetworkAttempts,counts:Object.fromEntries(Object.entries(results).filter(([,v])=>v.counts).map(([k,v])=>[k,v.counts]))},null,2)+'\n```\n\nSTOP: no merge or deploy.\n');
if(hold.length)process.exitCode=1;
