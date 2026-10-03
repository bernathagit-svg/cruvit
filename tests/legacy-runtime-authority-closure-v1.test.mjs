import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(p)=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const closure=read(path.join(ROOT,'data','catalog','revalidation','legacy-runtime-authority-closure-v1.json'));
const overlay=read(path.join(ROOT,'data','catalog-expansion','approved-runtime-climate-overlay-v1.json'));
const registry=read(path.join(ROOT,'data','plant-identity.registry.json'));

function appAliasMap(){
  const app=fs.readFileSync(path.join(ROOT,'app.html'),'utf8');
  const aliasStart=app.indexOf('const SPECIES_PACKET_ALIAS_TO_CANONICAL={');
  const aliasEnd=app.indexOf('};',aliasStart);
  assert.ok(aliasStart>=0&&aliasEnd>aliasStart,'SPECIES_PACKET_ALIAS_TO_CANONICAL block not found');
  const aliasBlock=app.slice(aliasStart,aliasEnd);
  return new Map([...aliasBlock.matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)].map(m=>[m[1],m[2]]));
}

function runtimeSlugs(){
  const app=fs.readFileSync(path.join(ROOT,'app.html'),'utf8');
  const start=app.indexOf('const PLANT_LIBRARY=[');
  const end=app.indexOf('];',start);
  assert.ok(start>=0&&end>start,'PLANT_LIBRARY block not found');
  const block=app.slice(start,end);
  const aliases=appAliasMap();
  const canonical=(slug)=>aliases.get(slug)||slug;
  const inline=[...block.matchAll(/slug:'([^']+)'/g)].map(m=>canonical(m[1]));
  const seed=read(path.join(ROOT,'data','plants.seed.json'));
  return [...new Set([...inline,...(seed.plants||[]).map(p=>canonical(p.slug)).filter(Boolean)])];
}

test('every runtime plant without approved packet overlay has an explicit closure-queue row',()=>{
  const runtime=runtimeSlugs();
  const aliases=appAliasMap();
  const approved=new Set(Object.keys(overlay.plants||{}));
  for(const [alias,canonical] of aliases){ if(approved.has(alias)) approved.add(canonical); }
  const legacy=runtime.filter(slug=>!approved.has(slug)).sort();
  const rows=(closure.rows||[]).map(r=>r.slug).sort();
  assert.equal(new Set(rows).size,rows.length,'closure rows must be unique');
  assert.deepEqual(rows,legacy);
  assert.equal(closure.scope.runtimePlantCount,runtime.length);
  assert.equal(closure.scope.legacyAuthorityCount,legacy.length);
});

test('closure state matches identity registry authority',()=>{
  const reg=new Map((registry.canonicalIdentities||[]).map(x=>[x.canonicalSlug,x]));
  for(const row of closure.rows||[]){
    const identity=reg.get(row.slug);
    if(row.state==='SPECIES_IDENTITY_COMPLETE'){
      assert.ok(identity,'missing registry identity: '+row.slug);
      assert.equal(identity.needsReview,false,'species row still needs review: '+row.slug);
      assert.ok(String(identity.acceptedScientificName||'').trim(),'missing accepted scientific name: '+row.slug);
    }else if(row.state==='IDENTITY_REVIEW_REQUIRED'){
      assert.ok(identity,'missing registry row for review case: '+row.slug);
      assert.equal(identity.needsReview,true,'review case unexpectedly resolved: '+row.slug);
    }else if(row.state==='REGISTRY_MISSING'){
      assert.equal(identity,undefined,'registry-missing row unexpectedly exists: '+row.slug);
    }else{
      assert.fail('unsupported closure state: '+row.state);
    }
  }
});
