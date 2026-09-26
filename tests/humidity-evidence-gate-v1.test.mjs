import test from 'node:test';
import assert from 'node:assert/strict';
import {extractHumidityEvidence,deriveHumidityTrait} from '../modules/catalog/humidity-evidence-gate-v1.js';

test('humidity disease pressure becomes explicit heuristic medium',()=>{
  const e=extractHumidityEvidence('Powdery mildew can become severe during periods of high humidity and poor air circulation.');
  assert.equal(e.kind,'HUMIDITY_OR_WETNESS_DISEASE_PRESSURE');
  const r=deriveHumidityTrait(e);
  assert.equal(r.value,'medium');
  assert.equal(r.evidenceClass,'HEURISTIC_ASSERTION');
});

test('direct high humidity tolerance remains source supported',()=>{
  const e=extractHumidityEvidence('This species tolerates high humidity when established.');
  const r=deriveHumidityTrait(e);
  assert.equal(r.value,'high');
  assert.equal(r.evidenceClass,'SOURCE_SUPPORTED');
});

test('no evidence stays unknown',()=>{
  const r=deriveHumidityTrait(extractHumidityEvidence('Prefers full sun and good drainage.'));
  assert.equal(r.value,null);
  assert.equal(r.evidenceClass,'UNKNOWN');
});


test('cultivar-specific humidity evidence cannot become species trait',()=>{
  const e=extractHumidityEvidence(
    'The Profusion Series is a hybrid cross between species and is tolerant of heat and humidity.'
  );
  assert.equal(e.ok,false);
  assert.equal(e.kind,'CONTEXT_SPECIFIC_CULTIVAR_OR_HYBRID');
  const r=deriveHumidityTrait(e);
  assert.equal(r.value,null);
  assert.equal(r.evidenceClass,'UNKNOWN');
});


test('NC State structured Resistance To Challenges humidity is source-supported high',()=>{
  const e=extractHumidityEvidence(
    'Landscape: Resistance To Challenges: Deer Diseases Foot Traffic Heat Humidity Insect Pests Rabbits Wet Soil Problems: Weedy'
  );
  assert.equal(e.ok,true);
  assert.equal(e.kind,'DIRECT_HIGH_TOLERANCE');
  const r=deriveHumidityTrait(e);
  assert.equal(r.value,'high');
  assert.equal(r.evidenceClass,'SOURCE_SUPPORTED');
});

test('hot humid preferred growing conditions are direct source-supported evidence',()=>{
  const e=extractHumidityEvidence(
    'Common turmeric grows best in hot, humid conditions with full sun in the morning and afternoon shade.'
  );
  assert.equal(e.ok,true);
  const r=deriveHumidityTrait(e);
  assert.equal(r.value,'high');
  assert.equal(r.evidenceClass,'SOURCE_SUPPORTED');
});

test('structured humidity resistance stays blocked when context is cultivar-specific',()=>{
  const e=extractHumidityEvidence(
    'The Alpha cultivar Resistance To Challenges: Heat Humidity Wet Soil.'
  );
  assert.equal(e.ok,false);
  assert.equal(e.kind,'CONTEXT_SPECIFIC_CULTIVAR_OR_HYBRID');
});
