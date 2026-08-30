/**
 * Atmospheric humidity + VPD calibration gate tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chelsaVpdToPa,
  CHELSA_VPD_GEOTIFF_ENCODING,
  COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
  deriveAtmosphericHumidityAuthority,
  humidityRegimeFromMeanRh,
  ATMOSPHERIC_HUMIDITY_AUTHORITY_V2,
  assessRhVpdPhysicalConsistency
} from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import { atmosphericHumidityMismatchForLowTolerancePlant } from '../modules/personal-domain/structural-climate-authority-v1.js';
import { deriveSpecificPlantOutcomes } from '../modules/personal-domain/specific-plant-suitability-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PILOT = path.join(ROOT, 'data', 'coordinate-climate', 'v2', 'pilot');

test('CHELSA VPD encoding: scale 0.1 offset 0', () => {
  assert.equal(CHELSA_VPD_GEOTIFF_ENCODING.scale, 0.1);
  assert.equal(CHELSA_VPD_GEOTIFF_ENCODING.offset, 0);
  assert.equal(chelsaVpdToPa(11492), 1149.2);
  assert.equal(chelsaVpdToPa(12533), 1253.3);
});

test('authority version bumped for VPD scale fix', () => {
  assert.equal(COORDINATE_CLIMATE_AUTHORITY_V2_VERSION, '2.0.3-vpd-scale');
});

test('no Singapore-tuned highInclusiveMin=64', () => {
  assert.equal(ATMOSPHERIC_HUMIDITY_AUTHORITY_V2.meanRhThresholdsPct.highInclusiveMin, 70);
  assert.equal(ATMOSPHERIC_HUMIDITY_AUTHORITY_V2.meanRhThresholdsPct.transitionExclusiveMax, 70);
  assert.ok(/not tuned|NOT fitted|rejected/i.test(ATMOSPHERIC_HUMIDITY_AUTHORITY_V2.justification));
  // May mention Singapore only as rejected prior fit — must not be the justification for thresholds
  assert.ok(/rejected|not tuned/i.test(ATMOSPHERIC_HUMIDITY_AUTHORITY_V2.justification));
  assert.equal(ATMOSPHERIC_HUMIDITY_AUTHORITY_V2.meanRhThresholdsPct.highInclusiveMin, 70);
});

test('Singapore RH 64.7 → borderline (not forced high)', () => {
  const s = JSON.parse(fs.readFileSync(path.join(PILOT, 'singapore.json'), 'utf8'));
  assert.equal(s.meanRelativeHumidityPct, 64.7);
  assert.ok(s.meanVpdPa > 1200 && s.meanVpdPa < 1300);
  assert.equal(humidityRegimeFromMeanRh(s.meanRelativeHumidityPct), 'borderline');
  const atm = deriveAtmosphericHumidityAuthority({
    monthlyHursPct: s.monthlyHursPct,
    meanRelativeHumidityPct: s.meanRelativeHumidityPct,
    monthlyVpdPa: s.monthlyVpdPa,
    meanVpdPa: s.meanVpdPa,
    meanTmeanC: s.monthlyTmeanC.reduce((a, b) => a + b, 0) / 12
  });
  assert.equal(atm.atmosphericHumidityRegime, 'borderline');
  assert.equal(atm.evidence.vpdScaleSuspect, false);
  assert.ok(atm.evidence.physicalConsistency?.plausible);
});

test('threshold sensitivity: 60–69% all borderline — no 0.3% discontinuity', () => {
  const regimes = [60, 62, 64, 64.7, 65, 66, 68, 69.9].map((rh) =>
    humidityRegimeFromMeanRh(rh)
  );
  assert.ok(regimes.every((r) => r === 'borderline'));
  assert.equal(humidityRegimeFromMeanRh(70), 'high');
  assert.equal(humidityRegimeFromMeanRh(59.9), 'medium');
});

test('sensitivity: plant outcome class stable across 64 vs 65 vs 66 RH', () => {
  const meta = {
    humidityTolerance: 'low',
    frostSensitivity: 'low',
    heatTolerance: 'high',
    traitEvidenceClasses: {
      frostSensitivity: 'SOURCE_SUPPORTED',
      humidityTolerance: 'HEURISTIC_ASSERTION',
      heatTolerance: 'SOURCE_SUPPORTED'
    }
  };
  const outcomes = [64, 65, 66].map((rh) => {
    const climateProfile = {
      freezingRisk: 'low',
      isFrostFreeGrowingClimate: true,
      moistureRegime: 'humid',
      meanRelativeHumidityPct: rh,
      monthlyHursPct: Array(12).fill(rh),
      meanVpdPa: 1200,
      monthlyVpdPa: Array(12).fill(1200)
    };
    const m = atmosphericHumidityMismatchForLowTolerancePlant(meta, climateProfile);
    const o = deriveSpecificPlantOutcomes({
      meta,
      climateProfile,
      suitability: {
        recommendationLevel: 'good',
        survivalFit: 85,
        thriveFit: 80,
        floweringFit: 50,
        fruitingFit: 40,
        warnings: [],
        explanationText: ''
      },
      plant: { slug: 'generic', climateTraits: meta }
    });
    return { rh, severity: m?.severity, overall: o.overall, survival: o.survival };
  });
  assert.ok(outcomes.every((x) => x.severity === 'moderate'));
  assert.ok(outcomes.every((x) => x.overall !== 'good' && x.overall !== 'excellent'));
  assert.ok(outcomes.every((x) => x.survival !== 'constrained' && x.survival !== 'unreliable'));
  assert.equal(new Set(outcomes.map((x) => `${x.overall}|${x.survival}`)).size, 1);
});

test('seven pilots physical VPD consistency after scale fix', () => {
  for (const id of ['singapore', 'kochi', 'cairo', 'yehiam', 'tokyo', 'helsinki', 'quito']) {
    const p = JSON.parse(fs.readFileSync(path.join(PILOT, `${id}.json`), 'utf8'));
    assert.ok(p.meanVpdPa < 3000, id);
    const tmean = p.monthlyTmeanC.reduce((a, b) => a + b, 0) / 12;
    const phys = assessRhVpdPhysicalConsistency({
      meanRelativeHumidityPct: p.meanRelativeHumidityPct,
      meanVpdPa: p.meanVpdPa,
      meanTmeanC: tmean
    });
    assert.equal(phys.plausible, true, `${id} ratio=${phys.ratio}`);
  }
});

test('borderline + low humidityTolerance is soft constraint not hard high', () => {
  const meta = { humidityTolerance: 'low', frostSensitivity: 'medium' };
  const m = atmosphericHumidityMismatchForLowTolerancePlant(meta, {
    meanRelativeHumidityPct: 64.7,
    monthlyHursPct: Array(12).fill(64.7)
  });
  assert.equal(m.severity, 'moderate');
  assert.equal(m.regime, 'borderline');
});

test('clear high RH still strong mismatch', () => {
  const meta = { humidityTolerance: 'low' };
  const m = atmosphericHumidityMismatchForLowTolerancePlant(meta, {
    meanRelativeHumidityPct: 78,
    monthlyHursPct: Array(12).fill(78)
  });
  assert.equal(m.severity, 'strong');
});
