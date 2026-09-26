import test from 'node:test';
import assert from 'node:assert/strict';
import {
  elevateAmbientFreezingRisk,
  evaluateHardClimateSurvival
} from '../modules/suitability/hard-climate-survival-gate-v1.js';

test('missing coldest-month value is UNKNOWN, never coerced to 0C',()=>{
  const risk=elevateAmbientFreezingRisk({
    freezingRisk:'unknown',
    coldestMonthMeanMinC:null,
    thermalRegime:'unknown',
    structuralClimateStatus:'known'
  },{lat:32.99,lon:35.22});
  assert.equal(risk,'unknown');
});

test('hard-frost-sensitive plant is not hard-blocked solely because cold evidence is missing',()=>{
  const out=evaluateHardClimateSurvival({
    meta:{frostSensitivity:'high',coldTolerance:'low'},
    climateProfile:{
      freezingRisk:'unknown',
      coldestMonthMeanMinC:null,
      thermalRegime:'unknown',
      structuralClimateStatus:'known'
    },
    protectionContext:{plantingMode:'ground'},
    coords:{lat:32.99,lon:35.22}
  });
  assert.equal(out.hardBlocked,false);
  assert.equal(out.ambientFreezingRisk,'unknown');
});

test('actual 0C remains high freezing risk',()=>{
  const risk=elevateAmbientFreezingRisk({
    freezingRisk:'unknown',
    coldestMonthMeanMinC:0,
    thermalRegime:'unknown',
    structuralClimateStatus:'known'
  },{lat:32.99,lon:35.22});
  assert.equal(risk,'high');
});
