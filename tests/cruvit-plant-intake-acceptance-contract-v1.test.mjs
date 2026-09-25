import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const contract=JSON.parse(fs.readFileSync('data/catalog/cruvit-plant-intake-acceptance-contract-v1.json','utf8'));

test('final state is only FULL_CRUVIT_APPROVED',()=>{
  assert.equal(contract.finalState,'FULL_CRUVIT_APPROVED');
  assert.equal(contract.finalAuthority,'full-cruvit-plant-approval-v1');
});

test('reuse is mandatory before paid generation',()=>{
  const reuse=contract.stages.find(x=>x.id==='candidate-reuse-first');
  const gen=contract.stages.find(x=>x.id==='bounded-generation');
  assert.ok(reuse && gen);
  assert.ok(reuse.order < gen.order);
  assert.ok(contract.prohibited.includes('duplicate image generation when reusable exact candidate exists'));
});

test('production cannot precede QA or owner promotion approval',()=>{
  const qa=contract.stages.find(x=>x.id==='visual-qa');
  const prod=contract.stages.find(x=>x.id==='production-promotion');
  const reg=contract.stages.find(x=>x.id==='registry-activation');
  assert.ok(qa.order < prod.order);
  assert.ok(prod.order < reg.order);
});

test('all plant-facing CRUVIT modules are covered',()=>{
  for(const k of ['myGarden','smartRecommendations','plantIdentification','plantDoctor','gardenDesign']){
    assert.ok(Array.isArray(contract.moduleCoverage[k]) && contract.moduleCoverage[k].length>0,k);
  }
});
