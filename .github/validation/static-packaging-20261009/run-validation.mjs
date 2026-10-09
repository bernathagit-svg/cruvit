import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import cp from 'node:child_process';

const [productArg,evidenceArg]=process.argv.slice(2);
if(!productArg||!evidenceArg) throw new Error('usage: run-validation.mjs <product-dir> <evidence-dir>');
const product=path.resolve(productArg), evidence=path.resolve(evidenceArg);
fs.mkdirSync(evidence,{recursive:true});
const E={
  sha:'5aafb7bcaafda8d55d3684ff557aaf9f0a457834',
  tree:'8d42b0fda9e0d4c99a0b845f46459a780c581d66',
  lock:'fe1ae38c94c5b50b164607842e3fafce099f6d802965687477f826617c6b1d8c',
  manifest:'5f0873ee503e51ce1d1647cf5b0fa7e25aabcc8a2e6a5a9628f8f6b215e87aec'
};
const h=b=>crypto.createHash('sha256').update(b).digest('hex');
const run=(cmd,args,opt={})=>cp.spawnSync(cmd,args,{cwd:opt.cwd||product,encoding:'utf8',env:process.env,maxBuffer:64*1024*1024});
const must=(cmd,args)=>{const r=run(cmd,args);if(r.status!==0)throw new Error(cmd+' failed\n'+r.stdout+'\n'+r.stderr);return r.stdout.trim();};
const git=a=>must('git',a);
const put=(n,o)=>fs.writeFileSync(path.join(evidence,n),typeof o==='string'?o:JSON.stringify(o,null,2)+'\n');
const failures=[];
let decision='HOLD_FOR_SPECIFIC_REASON';

try{
  const head=git(['rev-parse','HEAD']), tree=git(['show','-s','--format=%T','HEAD']);
  const envReceipt={
    runnerOS:process.env.RUNNER_OS||null,runnerArch:process.env.RUNNER_ARCH||null,
    platform:os.platform(),release:os.release(),node:process.version,
    productSha:head,productTree:tree,carrierSha:process.env.WORKFLOW_CARRIER_SHA||null,
    runId:process.env.GITHUB_RUN_ID||null,runAttempt:process.env.GITHUB_RUN_ATTEMPT||null,
    credentialLikeKeys:Object.keys(process.env).filter(k=>/(SUPABASE|R2_|OPENAI|ANTHROPIC|CLAUDE|REPLICATE|STABILITY|SHOPIFY|AWS_ACCESS_KEY|AWS_SECRET_ACCESS)/i.test(k))
  };
  put('environment-receipt.json',envReceipt);
  if(head!==E.sha)failures.push('PRODUCT_SHA_MISMATCH');
  if(tree!==E.tree)failures.push('PRODUCT_TREE_MISMATCH');
  if(os.platform()!=='linux')failures.push('NOT_LINUX');
  if(process.versions.node.split('.')[0]!=='22')failures.push('NODE_NOT_22');
  if(envReceipt.credentialLikeKeys.length)failures.push('PRODUCT_CREDENTIALS_PRESENT');

  const lockPath=path.join(product,'config/packaging/static-runtime-source-lock-v1.json');
  const lockBytes=fs.readFileSync(lockPath), lock=JSON.parse(lockBytes), lockHash=h(lockBytes);
  put('source-lock-verification.json',{sha256:lockHash,pathCount:lock.pathCount,classificationCounts:lock.classificationCounts,publicationAuthority:lock.publicationAuthority,ruleConflictCount:lock.ruleConflictCount});
  if(lockHash!==E.lock)failures.push('LOCK_HASH_MISMATCH');
  const c=lock.classificationCounts||{};
  if(lock.pathCount!==2576||c.PUBLIC_STATIC!==1842||c.SERVER_RUNTIME!==75||c.BUILD_ONLY!==612||c.HISTORICAL_EVIDENCE!==47)failures.push('LOCK_POPULATION_MISMATCH');

  const tracked=git(['ls-files']).split(/\r?\n/).filter(Boolean).sort();
  const snapshot=()=>Object.fromEntries(tracked.map(p=>[p,h(fs.readFileSync(path.join(product,...p.split('/'))))]));
  const before=snapshot(), statusBefore=git(['status','--porcelain']);
  put('exact-sha-proof.json',{head,tree,trackedCount:tracked.length,statusBefore});
  if(statusBefore)failures.push('DIRTY_BEFORE');

  const tr=run(process.execPath,['tests/static-runtime-packaging-v1.test.mjs']);
  put('packaging-tests.txt',(tr.stdout||'')+(tr.stderr||''));
  const txt=tr.stdout||'';
  const num=(label)=>Number((txt.match(new RegExp('(?:#|ℹ) '+label+' (\\d+)'))||[])[1]||0);
  const testResult={exitCode:tr.status,pass:num('pass'),fail:num('fail'),skip:num('skipped')};
  put('test-result.json',testResult);
  if(tr.status!==0||testResult.pass!==12||testResult.fail!==0||testResult.skip!==0)failures.push('TEST_RESULT_MISMATCH');

  const recA=path.join(evidence,'build-a.json'),recB=path.join(evidence,'build-b.json');
  const ba=run(process.execPath,['tools/deployment/build-static-publish.mjs','--out','dist-hosted-a','--receipt',recA]);
  const bb=run(process.execPath,['tools/deployment/build-static-publish.mjs','--out','dist-hosted-b','--receipt',recB]);
  put('build-a-output.txt',(ba.stdout||'')+(ba.stderr||'')); put('build-b-output.txt',(bb.stdout||'')+(bb.stderr||''));
  if(ba.status!==0)failures.push('BUILD_A_FAILED'); if(bb.status!==0)failures.push('BUILD_B_FAILED');

  let a=null,b=null;
  if(fs.existsSync(recA))a=JSON.parse(fs.readFileSync(recA,'utf8'));
  if(fs.existsSync(recB))b=JSON.parse(fs.readFileSync(recB,'utf8'));
  if(a&&b){
    const same=JSON.stringify(a.publicManifest)===JSON.stringify(b.publicManifest);
    put('public-manifest.json',{manifestSha256:a.outputManifestSha256,files:a.publicManifest});
    put('excluded-manifest.json',{files:a.excludedManifest});
    put('double-build-verification.json',{a:{public:a.publicFileCount,server:a.serverRuntimeFileCount,excluded:a.excludedFileCount,manifest:a.outputManifestSha256,secretFindings:a.secretFindings?.length||0},b:{public:b.publicFileCount,server:b.serverRuntimeFileCount,excluded:b.excludedFileCount,manifest:b.outputManifestSha256,secretFindings:b.secretFindings?.length||0},completePublicManifestEqual:same});
    put('secret-scan-result.json',{findings:(a.secretFindings?.length||0)+(b.secretFindings?.length||0),buildA:a.secretFindings||[],buildB:b.secretFindings||[]});
    if(a.publicFileCount!==1842||b.publicFileCount!==1842)failures.push('PUBLIC_COUNT_MISMATCH');
    if(a.serverRuntimeFileCount!==75||b.serverRuntimeFileCount!==75)failures.push('FUNCTION_COUNT_MISMATCH');
    if(a.outputManifestSha256!==E.manifest||b.outputManifestSha256!==E.manifest)failures.push('OUTPUT_HASH_MISMATCH');
    if(!same)failures.push('PUBLIC_MANIFEST_DIFFERENCE');
    if((a.secretFindings?.length||0)+(b.secretFindings?.length||0)!==0)failures.push('SECRET_FINDING');
  }

  const fn=git(['ls-files','netlify/functions/**']).split(/\r?\n/).filter(Boolean).sort();
  put('functions-manifest.json',{count:fn.length,files:fn.map(p=>{const z=fs.readFileSync(path.join(product,...p.split('/')));return{path:p,bytes:z.length,sha256:h(z)}})});
  if(fn.length!==75)failures.push('FUNCTION_SOURCE_COUNT_MISMATCH');

  const dormant=JSON.parse(fs.readFileSync(path.join(product,'config/packaging/dormant-reference-garden-design-pc-wand-v1.json'),'utf8'));
  const gd=fs.readFileSync(path.join(product,dormant.sourcePath)), s=gd.toString('utf8');
  const dormantResult={sourceSha256:h(gd),expectedSourceSha256:dormant.sourceSha256,selectorCount:s.split(dormant.selector).length-1,urlCount:s.split(dormant.unresolvedUrl).length-1,missingAssetPresent:fs.existsSync(path.join(product,path.dirname(dormant.sourcePath),dormant.unresolvedUrl)),activeWandPresent:fs.existsSync(path.join(product,path.dirname(dormant.sourcePath),dormant.activeWandAsset.url))};
  put('dormant-contract-verification.json',dormantResult);
  if(dormantResult.sourceSha256!==dormantResult.expectedSourceSha256||dormantResult.selectorCount!==3||dormantResult.urlCount!==1||dormantResult.missingAssetPresent||!dormantResult.activeWandPresent)failures.push('DORMANT_CONTRACT_MISMATCH');

  const after=snapshot(), mutations=tracked.filter(p=>before[p]!==after[p]).map(p=>({path:p,before:before[p],after:after[p]}));
  for(const d of ['dist-hosted-a','dist-hosted-b']){const p=path.join(product,d);if(fs.existsSync(p))fs.rmSync(p,{recursive:true,force:false});}
  const finalStatus=git(['status','--porcelain']);
  put('source-preservation-result.json',{trackedCount:tracked.length,mutationCount:mutations.length,mutations,finalStatus});
  put('final-git-status.txt',finalStatus+'\n');
  if(mutations.length)failures.push('SOURCE_MUTATED');
  if(finalStatus)failures.push('FINAL_STATUS_DIRTY');

  decision=failures.length?'HOLD_FOR_SPECIFIC_REASON':'READY_FOR_ISOLATED_PREPRODUCTION_GATE';
}catch(e){failures.push('VALIDATION_EXCEPTION:'+String(e?.message||e));}
put('decision.json',{decision,failures,productSha:E.sha,carrierSha:process.env.WORKFLOW_CARRIER_SHA||null,runId:process.env.GITHUB_RUN_ID||null});
put('decision.txt',decision+'\n'+failures.join('\n')+'\n');
console.log(JSON.stringify({decision,failures},null,2));
if(failures.length)process.exitCode=1;
