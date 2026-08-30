/**
 * Atmospheric humidity semantics gate — ATMOSPHERIC != WATER_BALANCE.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveAtmosphericHumidityAuthority,
  humidityRegimeFromMeanRh,
  ATMOSPHERIC_HUMIDITY_AUTHORITY_V2,
  humiditySignalFromRegimes
} from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import { atmosphericHumidityMismatchForLowTolerancePlant } from '../modules/personal-domain/structural-climate-authority-v1.js';
import { deriveSpecificPlantOutcomes } from '../modules/personal-domain/specific-plant-suitability-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PILOT = path.join(ROOT, 'data', 'coordinate-climate', 'v2', 'pilot');

test('atmospheric contract excludes moistureRegime / P / PET', () => {
  assert.ok(ATMOSPHERIC_HUMIDITY_AUTHORITY_V2.excludes.includes('moistureRegime'));
  assert.ok(ATMOSPHERIC_HUMIDITY_AUTHORITY_V2.excludes.includes('precipitation'));
  assert.equal(ATMOSPHERIC_HUMIDITY_AUTHORITY_V2.meanRhThresholdsPct.highInclusiveMin, 70);
  assert.equal(ATMOSPHERIC_HUMIDITY_AUTHORITY_V2.meanRhThresholdsPct.transitionExclusiveMax, 70);
});

test('Singapore meanRh 64.7 → borderline under transition band (not Singapore-tuned high)', () => {
  const s = JSON.parse(fs.readFileSync(path.join(PILOT, 'singapore.json'), 'utf8'));
  assert.ok(s.meanRelativeHumidityPct >= 64 && s.meanRelativeHumidityPct < 65);
  assert.equal(humidityRegimeFromMeanRh(s.meanRelativeHumidityPct), 'borderline');
  const atm = deriveAtmosphericHumidityAuthority({
    monthlyHursPct: s.monthlyHursPct,
    meanRelativeHumidityPct: s.meanRelativeHumidityPct,
    monthlyVpdPa: s.monthlyVpdPa,
    meanVpdPa: s.meanVpdPa,
    meanTmeanC: s.monthlyTmeanC.reduce((a, b) => a + b, 0) / 12
  });
  assert.equal(atm.atmosphericHumidityRegime, 'borderline');
  assert.equal(atm.humiditySignal, 'borderline');
  assert.ok(atm.notDerivedFrom.includes('moistureRegime'));
  assert.equal(atm.evidence.vpdScaleSuspect, false);
  assert.ok(s.meanVpdPa > 1200 && s.meanVpdPa < 1300);
});

test('moistureRegime=humid alone does NOT trigger low-humidityTolerance penalty', () => {
  const meta = { humidityTolerance: 'low', frostSensitivity: 'medium' };
  // Humid water balance but medium RH (Yehiam-like) — no atmospheric penalty
  assert.equal(
    atmosphericHumidityMismatchForLowTolerancePlant(meta, {
      moistureRegime: 'humid',
      humiditySignal: 'medium',
      meanRelativeHumidityPct: 59.4,
      monthlyHursPct: Array(12).fill(59)
    }),
    null
  );
});

test('missing hurs + humid moistureRegime → atmospheric UNKNOWN → no penalty', () => {
  const meta = { humidityTolerance: 'low' };
  assert.equal(
    atmosphericHumidityMismatchForLowTolerancePlant(meta, {
      moistureRegime: 'humid',
      humiditySignal: 'high' // legacy stored — without hurs must not trust
    }),
    null
  );
});

test('adversarial: humid P/PET + dry air (low RH) → atmospheric not high', () => {
  const atm = deriveAtmosphericHumidityAuthority({
    meanRelativeHumidityPct: 40,
    monthlyHursPct: Array(12).fill(40),
    meanVpdPa: 2000,
    monthlyVpdPa: Array(12).fill(2000)
  });
  assert.equal(atm.atmosphericHumidityRegime, 'low');
  assert.notEqual(atm.atmosphericHumidityRegime, 'high');
});

test('adversarial: arid-ish water balance + high RH → atmospheric high', () => {
  const atm = deriveAtmosphericHumidityAuthority({
    meanRelativeHumidityPct: 72,
    monthlyHursPct: Array(12).fill(72),
    meanVpdPa: 800,
    monthlyVpdPa: Array(12).fill(800)
  });
  assert.equal(atm.atmosphericHumidityRegime, 'high');
});

test('adversarial: seasonal RH swing retained as pattern', () => {
  const months = [75, 75, 70, 55, 45, 40, 40, 45, 55, 65, 70, 75];
  const atm = deriveAtmosphericHumidityAuthority({
    monthlyHursPct: months,
    meanRelativeHumidityPct: months.reduce((a, b) => a + b, 0) / 12
  });
  assert.ok(
    atm.seasonalHumidityPattern === 'strong-seasonal' ||
      atm.seasonalHumidityPattern === 'moderate-seasonal'
  );
});

test('humiditySignalFromRegimes no longer forces arid→atmospheric low', () => {
  assert.equal(humiditySignalFromRegimes('hyper-arid', 'medium'), 'medium');
  assert.equal(humiditySignalFromRegimes('humid', 'medium'), 'medium');
});

test('low humidityTolerance + Singapore hurs → constrained soft (borderline), not Good', () => {
  const s = JSON.parse(fs.readFileSync(path.join(PILOT, 'singapore.json'), 'utf8'));
  const meta = {
    frostSensitivity: 'low',
    humidityTolerance: 'low',
    heatTolerance: 'high',
    waterNeeds: 'low',
    traitEvidenceClasses: {
      frostSensitivity: 'SOURCE_SUPPORTED',
      humidityTolerance: 'HEURISTIC_ASSERTION',
      heatTolerance: 'SOURCE_SUPPORTED'
    }
  };
  const climateProfile = {
    ...s,
    moistureRegime: s.aridityMoistureRegime,
    freezingRisk: 'low',
    isFrostFreeGrowingClimate: true,
    monthlyHursPct: s.monthlyHursPct,
    meanRelativeHumidityPct: s.meanRelativeHumidityPct
  };
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
    plant: { slug: 'generic-low-hum', climateTraits: meta }
  });
  assert.notEqual(o.overall, 'good');
  assert.notEqual(o.overall, 'excellent');
  assert.notEqual(o.survival, 'constrained');
  assert.notEqual(o.survival, 'unreliable');
  assert.ok(o.growth === 'constrained' || o.growth === 'poor');
  assert.ok(/transition band|atmospheric humidity|growth/i.test(o.limitingFactors.join(' ')));
});

test('seven pilots: atmospheric vs water-balance can differ', () => {
  const rows = [];
  for (const id of ['singapore', 'kochi', 'cairo', 'yehiam', 'tokyo', 'helsinki', 'quito']) {
    const p = JSON.parse(fs.readFileSync(path.join(PILOT, `${id}.json`), 'utf8'));
    const atm = deriveAtmosphericHumidityAuthority({
      monthlyHursPct: p.monthlyHursPct,
      meanRelativeHumidityPct: p.meanRelativeHumidityPct,
      monthlyVpdPa: p.monthlyVpdPa,
      meanVpdPa: p.meanVpdPa
    });
    rows.push({
      id,
      meanRh: p.meanRelativeHumidityPct,
      atm: atm.atmosphericHumidityRegime,
      moisture: p.aridityMoistureRegime,
      differ: atm.atmosphericHumidityRegime !== p.aridityMoistureRegime
    });
  }
  const cairo = rows.find((r) => r.id === 'cairo');
  assert.equal(cairo.moisture, 'hyper-arid');
  assert.equal(cairo.atm, 'medium');
  assert.equal(cairo.differ, true);
  const sg = rows.find((r) => r.id === 'singapore');
  assert.equal(sg.atm, 'borderline');
});
