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
