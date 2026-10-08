import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { classifyPath, validateDormantReference, buildStatic } from '../tools/deployment/build-static-publish.mjs';

const root=path.resolve(new URL('../',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'config/packaging/static-runtime-manifest-v1.json'),'utf8'));
const dormant=JSON.parse(fs.readFileSync(path.join(root,'config/packaging/dormant-reference-garden-design-pc-wand-v1.json'),'utf8'));
const git=a=>cp.execFileSync('git',a,{cwd:root,encoding:'utf8'}).trimEnd();

test('packaging manifest binds exact approved baseline and classifies all tracked source paths',()=>{
  assert.equal(manifest.baselineSourceSha,'9c36d550a2476a64b4f0013b2599543538afd4fe');
  assert.equal(manifest.baselineSourceTree,'0fb518baf7f06d7adfa6c37c781137b8c12bf3be');
  for(const rel of git(['ls-files']).split(/\r?\n/).filter(Boolean)) assert.doesNotThrow(()=>classifyPath(rel));
});

test('13 production-impact paths have exact reviewed classifications',()=>{
  for(const [p,expected] of Object.entries(manifest.required13ImpactPaths)) assert.equal(classifyPath(p).classification,expected,p);
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

test('Netlify config publishes generated directory and retains separate functions source',()=>{
  const s=fs.readFileSync(path.join(root,'netlify.toml'),'utf8');
  assert.match(s,/publish\s*=\s*"dist-static"/);
  assert.match(s,/command\s*=\s*"node tools\/deployment\/build-static-publish\.mjs --out dist-static"/);
  assert.match(s,/\[functions\][\s\S]*directory\s*=\s*"netlify\/functions"/);
});

test('two independent static builds are deterministic',()=>{
  const a=path.join(root,'.tmp-static-a-'+process.pid);
  const b=path.join(root,'.tmp-static-b-'+process.pid);
  const ar=path.join(root,'.netlify','static-a-receipt-'+process.pid+'.json');
  const br=path.join(root,'.netlify','static-b-receipt-'+process.pid+'.json');
  fs.mkdirSync(path.dirname(ar),{recursive:true});
  const ra=buildStatic({out:a,receipt:ar});
  const rb=buildStatic({out:b,receipt:br});
  assert.equal(ra.outputManifestSha256,rb.outputManifestSha256);
  assert.deepEqual(ra.publicManifest,rb.publicManifest);
  fs.rmSync(a,{recursive:true,force:true});
  fs.rmSync(b,{recursive:true,force:true});
  if(fs.existsSync(ar)) fs.rmSync(ar);
  if(fs.existsSync(br)) fs.rmSync(br);
});
