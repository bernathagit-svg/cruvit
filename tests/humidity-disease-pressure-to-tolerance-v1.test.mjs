import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveHumidityToleranceFromDiseasePressure } from '../modules/personal-domain/humidity-disease-pressure-to-tolerance-v1.js';

test('humid production or disease-pressure evidence yields heuristic medium',()=>{
  const r=deriveHumidityToleranceFromDiseasePressure({
    establishedInHumidProductionClimate:true,
    highHumidityOrWetnessRaisesDiseasePressure:true
  });
  assert.equal(r.value,'medium');
  assert.equal(r.evidenceClass,'HEURISTIC_ASSERTION');
});

test('transform never silently upgrades to source supported',()=>{
  const r=deriveHumidityToleranceFromDiseasePressure({
    highHumidityOrWetnessRaisesDiseasePressure:true
  });
  assert.notEqual(r.evidenceClass,'SOURCE_SUPPORTED');
});

test('insufficient evidence remains unknown',()=>{
  const r=deriveHumidityToleranceFromDiseasePressure({});
  assert.equal(r.value,null);
  assert.equal(r.evidenceClass,'UNKNOWN');
});
