import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('candidate reuse index never treats FAIL as reusable',()=>{
  const doc=JSON.parse(fs.readFileSync('data/garden-design/plant-visual-candidate-reuse-index-v1.json','utf8'));
  assert.equal((doc.entries||[]).some(x=>x.modelQA==='FAIL' && x.reusable===true),false);
});

test('Variant Completion Apple/Apricot mature candidates are indexed for reuse',()=>{
  const doc=JSON.parse(fs.readFileSync('data/garden-design/plant-visual-candidate-reuse-index-v1.json','utf8'));
  const ids=new Set((doc.entries||[]).filter(x=>x.reusable).map(x=>x.jobId));
  for(const id of [
    'apple__mature__tree__vegetative__v1',
    'apple__mature__tree__fruiting__v1',
    'apple__mature__tree__dormant__v1',
    'apricot__mature__tree__vegetative__v1',
    'apricot__mature__tree__fruiting__v1',
    'apricot__mature__tree__dormant__v1'
  ]) assert.equal(ids.has(id),true,id);
});
