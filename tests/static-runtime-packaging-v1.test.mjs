import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import {
  classifyPath,
  validateDormantReference,
  validateSourceLock,
  buildStatic
} from '../tools/deployment/build-static-publish.mjs';

const root=path.resolve(new URL('../',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'config/packaging/static-runtime-manifest-v1.json'),'utf8'));
const dormant=JSON.parse(fs.readFileSync(path.join(root,'config/packaging/dormant-reference-garden-design-pc-wand-v1.json'),'utf8'));
const sourceLock=JSON.parse(fs.readFileSync(path.join(root,'config/packaging/static-runtime-source-lock-v1.json'),'utf8'));
const git=a=>cp.execFileSync('git',a,{cwd:root,encoding:'utf8'}).trimEnd();
const clone=x=>JSON.parse(JSON.stringify(x));
const lockedPaths=()=>sourceLock.paths.map(x=>x.path).sort();

test('packaging manifest binds exact approved baseline and classifies all tracked source paths',()=>{
  assert.equal(manifest.baselineSourceSha,'9c36d550a2476a64b4f0013b2599543538afd4fe');
  assert.equal(manifest.baselineSourceTree,'0fb518baf7f06d7adfa6c37c781137b8c12bf3be');
  for(const rel of git(['ls-files']).split(/\r?\n/).filter(Boolean)) assert.doesNotThrow(()=>classifyPath(rel));
});

test('exact source lock is authoritative for every tracked path',()=>{
  const tracked=git(['ls-files']).split(/\r?\n/).filter(Boolean).sort();
  const r=validateSourceLock({trackedPaths:tracked,lock:sourceLock,proposalDoc:manifest,checkFilesystem:false});
  assert.equal(r.ok,true,JSON.stringify(r.errors.slice(0,5)));
  assert.equal(r.trackedPathCount,sourceLock.pathCount);
  assert.equal(r.lockedPathCount,sourceLock.pathCount);
  assert.equal(r.classificationCounts.PUBLIC_STATIC,1842);
  assert.equal(r.classificationCounts.SERVER_RUNTIME,75);
});

test('new tracked files under broad PUBLIC_STATIC parents fail until explicitly locked',()=>{
  for(const rel of ['data/garden-design/unreviewed-internal-file.json','modules/unreviewed-runtime-file.js']){
    const r=validateSourceLock({trackedPaths:[...lockedPaths(),rel],lock:sourceLock,proposalDoc:manifest,checkFilesystem:false});
    assert.equal(r.ok,false,rel+' unexpectedly passed');
    assert.ok(r.errors.some(e=>e.code==='TRACKED_PATH_NOT_LOCKED'&&e.path===rel),JSON.stringify(r.errors.slice(0,5)));
  }
});

test('unreviewed rename fails closed',()=>{
  const old='modules/identity/plant-identity-shadow.js';
  const neu='modules/identity/plant-identity-shadow-renamed.js';
  const paths=lockedPaths().filter(x=>x!==old); paths.push(neu); paths.sort();
  const r=validateSourceLock({trackedPaths:paths,lock:sourceLock,proposalDoc:manifest,checkFilesystem:false});
  assert.equal(r.ok,false);
  assert.ok(r.errors.some(e=>e.code==='LOCKED_PATH_DISAPPEARED'&&e.path===old));
  assert.ok(r.errors.some(e=>e.code==='TRACKED_PATH_NOT_LOCKED'&&e.path===neu));
});

test('unreviewed deletion fails closed',()=>{
  const removed='data/plants.seed.json';
  const r=validateSourceLock({trackedPaths:lockedPaths().filter(x=>x!==removed),lock:sourceLock,proposalDoc:manifest,checkFilesystem:false});
  assert.equal(r.ok,false);
  assert.ok(r.errors.some(e=>e.code==='LOCKED_PATH_DISAPPEARED'&&e.path===removed));
});

test('classification proposal change without lock review fails closed',()=>{
  const doc=clone(manifest);
  const target='data/plants.seed.json';
  doc.classifications.unshift({classification:'BUILD_ONLY',exact:[target],reason:'synthetic conflict'});
  const r=validateSourceLock({trackedPaths:lockedPaths(),lock:sourceLock,proposalDoc:doc,checkFilesystem:false});
  assert.equal(r.ok,false);
  assert.ok(r.errors.some(e=>e.code==='PROPOSAL_CLASSIFICATION_DRIFT'&&e.path===target));
});

test('conflicting classifications require explicit reviewed resolution',()=>{
  const lock=clone(sourceLock);
  const target='data/plants.seed.json';
  const row=lock.paths.find(x=>x.path===target);
  row.proposalClassifications=['BUILD_ONLY','PUBLIC_STATIC'];
  delete row.reviewedConflictResolution;
  const doc=clone(manifest);
  doc.classifications.unshift({classification:'BUILD_ONLY',exact:[target],reason:'synthetic conflict'});
  const r=validateSourceLock({trackedPaths:lockedPaths(),lock,proposalDoc:doc,checkFilesystem:false});
  assert.equal(r.ok,false);
  assert.ok(r.errors.some(e=>e.code==='CONFLICTING_PROPOSALS_UNRESOLVED'&&e.path===target));
});

test('13 production-impact paths have exact reviewed locked classifications',()=>{
  const map=new Map(sourceLock.paths.map(x=>[x.path,x.classification]));
  for(const [p,expected] of Object.entries(manifest.required13ImpactPaths)) assert.equal(map.get(p),expected,p);
});

test('dormant reference record validates exact source and active wand asset',()=>{
  const r=validateDormantReference();
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(r.actual.selectorCount,3);
  assert.equal(r.actual.urlCount,1);
  assert.equal(r.actual.missingAssetExists,false);
  assert.equal(r.actual.activeAssetExists,true);
});

test('dormant record fails closed on selector, URL, count and source-hash changes',()=>{
  const original=fs.readFileSync(path.join(root,dormant.sourcePath),'utf8');
  const cases=[
    original.replace('.pc-wand-btn{','.pc-wand-btn-changed{'),
    original.replace(dormant.unresolvedUrl,'images/other.png'),
    original+'\n.pc-wand-btn{}\n',
    original.replace('Cruvit – Garden Design Studio','Cruvit – Garden Design Studio changed')
  ];
  for(const [i,s] of cases.entries()){
    const d=fs.mkdtempSync(path.join(os.tmpdir(),'cruvit-packaging-dormant-'));
    const f=path.join(d,'index.html');
    fs.writeFileSync(f,s);
    const r=validateDormantReference({sourceFile:f});
    assert.equal(r.ok,false,'case '+i+' unexpectedly passed');
    fs.rmSync(d,{recursive:true,force:true});
  }
});

test('Netlify config remains on separate generated output with separate functions source',()=>{
  const s=fs.readFileSync(path.join(root,'netlify.toml'),'utf8');
  assert.match(s,/publish\s*=\s*"dist-static"/);
  assert.match(s,/command\s*=\s*"node tools\/deployment\/build-static-publish\.mjs --out dist-static"/);
  assert.match(s,/\[functions\][\s\S]*directory\s*=\s*"netlify\/functions"/);
});

test('two independent static builds remain deterministic and artifact-stable',()=>{
  const a=path.join(root,'.tmp-static-a-'+process.pid);
  const b=path.join(root,'.tmp-static-b-'+process.pid);
  const ar=path.join(root,'.netlify','static-a-receipt-'+process.pid+'.json');
  const br=path.join(root,'.netlify','static-b-receipt-'+process.pid+'.json');
  fs.mkdirSync(path.dirname(ar),{recursive:true});
  const ra=buildStatic({out:a,receipt:ar});
  const rb=buildStatic({out:b,receipt:br});
  assert.equal(ra.publicFileCount,1842);
  assert.equal(ra.serverRuntimeFileCount,75);
  assert.equal(ra.outputManifestSha256,'5f0873ee503e51ce1d1647cf5b0fa7e25aabcc8a2e6a5a9628f8f6b215e87aec');
  assert.equal(ra.outputManifestSha256,rb.outputManifestSha256);
  assert.deepEqual(ra.publicManifest,rb.publicManifest);
  assert.equal(ra.secretFindings.length,0);
  fs.rmSync(a,{recursive:true,force:true});
  fs.rmSync(b,{recursive:true,force:true});
  if(fs.existsSync(ar)) fs.rmSync(ar);
  if(fs.existsSync(br)) fs.rmSync(br);
});
