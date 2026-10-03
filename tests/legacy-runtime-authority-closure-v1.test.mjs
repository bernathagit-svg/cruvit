import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(p)=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const closure=read(path.join(ROOT,'data','catalog','revalidation','legacy-runtime-authority-closure-v1.json'));
const overlay=read(path.join(ROOT,'data','catalog-expansion','approved-runtime-climate-overlay-v1.json'));
const broad=read(path.join(ROOT,'data','catalog','revalidation','broad-runtime-identity-authority-v1.json'));
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

test('every runtime plant without approved packet overlay is covered by broad identity authority',()=>{
  const runtime=runtimeSlugs();
  const aliases=appAliasMap();
  const approved=new Set(Object.keys(overlay.plants||{}));
  for(const [alias,canonical] of aliases){ if(approved.has(alias)) approved.add(canonical); }
  const nonPacket=runtime.filter(slug=>!approved.has(slug)).sort();
  const broadSlugs=Object.keys(broad.plants||{}).sort();
  const rows=(closure.rows||[]).map(r=>r.slug).sort();
  assert.deepEqual(nonPacket,broadSlugs);
  assert.deepEqual(rows,broadSlugs);
  assert.equal(closure.scope.runtimePlantCount,runtime.length);
  assert.equal(closure.scope.legacyAuthorityCount,0);
  assert.equal(closure.scope.broadIdentityAuthorityCount,broadSlugs.length);
  assert.equal(closure.scope.precisionResolutionPendingCount,broadSlugs.length);
  assert.equal(closure.authorityClosureState,'CLOSED_WITH_BROAD_IDENTITIES');
});

test('broad closure rows have canonical broad registry identities and remain precision-blocked',()=>{
  const reg=new Map((registry.canonicalIdentities||[]).map(x=>[x.canonicalSlug,x]));
  for(const row of closure.rows||[]){
    assert.equal(row.state,'BROAD_IDENTITY_VALID');
    assert.equal(row.broadAuthority,true);
    const identity=reg.get(row.slug);
    assert.ok(identity,'missing registry identity: '+row.slug);
    assert.equal(identity.needsReview,true,'broad identity must remain review-scoped: '+row.slug);
    const broadRow=broad.plants?.[row.slug];
    assert.ok(broadRow,'missing broad authority row: '+row.slug);
    assert.ok(['genus','broad'].includes(broadRow.identityScope));
    assert.match(String(broadRow.scientific||''),/(spp\.?|Various)/i);
  }
});
