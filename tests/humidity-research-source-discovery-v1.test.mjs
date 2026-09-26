import test from 'node:test';
import assert from 'node:assert/strict';
import {generatedNcsuSpeciesSource} from '../netlify/functions/humidity-research.mjs';

test('plain binomial scientific name gets deterministic NC State candidate',()=>{
  const s=generatedNcsuSpeciesSource('Pyrus communis','pear');
  assert.equal(s.url,'https://plants.ces.ncsu.edu/plants/pyrus-communis/');
  assert.equal(s.sourceId,'ncsu-auto-pear');
  assert.equal(s.generatedDiscovery,true);
});

test('hybrid is excluded from generated source discovery',()=>{
  assert.equal(generatedNcsuSpeciesSource('Fragaria × ananassa','strawberry'),null);
});

test('variety or subspecies is excluded from generated source discovery',()=>{
  assert.equal(generatedNcsuSpeciesSource('Cynara cardunculus var. scolymus','artichoke'),null);
  assert.equal(generatedNcsuSpeciesSource('Daucus carota subsp. sativus','carrot'),null);
});
