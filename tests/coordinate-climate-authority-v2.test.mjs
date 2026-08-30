/**
 * CRUVIT Coordinate Climate Authority V2 — contract + local lookup gates.
 * Run: node --test tests/coordinate-climate-authority-v2.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLIMATE_AUTHORITY_UNAVAILABLE,
  COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
  CHELSA_V21_BASELINE,
  TERRAIN_LAYER_POLICY_V2,
  buildClimateAuthorityUnavailable,
  buildCoordinateClimateProfileV2,
  coordinateClimateProfileToStructuralPersistence,
  chelsaPrecipToMm,
  chelsaHursToPct,
  chelsaTemperatureToCelsius,
  chelsaVpdToPa,
  assertCoordinateClimateRuntimeCostPolicy
} from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import {
  lookupCoordinateClimateProfile,
  proveZeroProviderCallsForPlantEvaluations,
  loadCoordinateClimateIndex
} from '../modules/personal-domain/coordinate-climate-lookup-v2.js';
import { buildStructuralClimateServerFields } from '../modules/personal-domain/structural-climate-persistence-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data', 'coordinate-climate', 'v2');

function loadProfile(id) {
  return JSON.parse(fs.readFileSync(path.join(DATA, 'pilot', `${id}.json`), 'utf8'));
}

test('scales: CHELSA precip×10, hurs×100, vpd×0.1', () => {
  assert.equal(chelsaPrecipToMm(2337), 233.7);
  assert.equal(chelsaHursToPct(6030), 60.3);
  assert.equal(chelsaTemperatureToCelsius(2661), -7.05);
  assert.equal(chelsaVpdToPa(11492), 1149.2);
});

test('unavailable: no city proxy object', () => {
  const u = buildClimateAuthorityUnavailable({ lat: 1, lon: 2, reason: 'test' });
  assert.equal(u.status, CLIMATE_AUTHORITY_UNAVAILABLE);
  assert.equal(u.provenance.rule, 'NO_CITY_PROXY');
});

test('pilot index present with 7 coordinate entries', () => {
  const idx = loadCoordinateClimateIndex(DATA);
  assert.equal(idx.ok, true);
  assert.equal(idx.entries.length, 7);
  assert.equal(idx.meta.noCityProxy, true);
});

test('Helsinki lookup is coordinate-specific — not Zurich proxy', () => {
  const hel = lookupCoordinateClimateProfile(60.16952, 24.93545, { dataRoot: DATA });
  assert.equal(hel.ok, true);
  assert.equal(hel.profile.coordinate.lat, 60.16952);
  assert.equal(hel.profile.thermalRegime, 'frost-prone');
  assert.ok(hel.profile.coldestMonthMeanMinC < 0);
  assert.equal(hel.profile.provenance?.cityProxy, false);
  assert.equal(hel.cost.chelsaExternalCalls, 0);

  const zurich = lookupCoordinateClimateProfile(47.3769, 8.5417, { dataRoot: DATA });
  assert.equal(zurich.ok, false);
  assert.equal(zurich.code, CLIMATE_AUTHORITY_UNAVAILABLE);
});

test('Yehiam exact coordinate — not regional Cairo proxy', () => {
  const yehiam = loadProfile('yehiam');
  const cairo = loadProfile('cairo');
  assert.notEqual(yehiam.coordinate.lat, cairo.coordinate.lat);
  assert.notEqual(yehiam.aridityMoistureRegime, cairo.aridityMoistureRegime);
  assert.ok(yehiam.annualPrecipitationMm > cairo.annualPrecipitationMm);
  const hit = lookupCoordinateClimateProfile(yehiam.coordinate.lat, yehiam.coordinate.lon, {
    dataRoot: DATA
  });
  assert.equal(hit.ok, true);
});

test('critical differentiations from CHELSA samples', () => {
  const y = loadProfile('yehiam');
  const c = loadProfile('cairo');
  const k = loadProfile('kochi');
  const s = loadProfile('singapore');
  const h = loadProfile('helsinki');
  const t = loadProfile('tokyo');
  const q = loadProfile('quito');

  assert.notEqual(y.aridityMoistureRegime, c.aridityMoistureRegime, 'Yehiam != Cairo moisture');
  assert.notEqual(c.aridityMoistureRegime, k.aridityMoistureRegime, 'Cairo != Kochi moisture');
  assert.equal(k.alwaysHot, true);
  assert.equal(s.alwaysHot, true);
  assert.ok(
    Math.abs(k.annualPrecipitationMm - s.annualPrecipitationMm) > 50 ||
      k.seasonality?.tminRangeC !== s.seasonality?.tminRangeC,
    'Kochi not blindly identical to Singapore'
  );
  assert.equal(q.highlandModifier, true);
  assert.equal(q.thermalRegime, 'cool-highland');
  assert.notEqual(q.thermalRegime, s.thermalRegime, 'Quito != lowland tropical');
  assert.notEqual(h.coldestMonthMeanMinC, t.coldestMonthMeanMinC, 'Helsinki != Tokyo cold');
  assert.equal(h.thermalRegime, 'frost-prone');
  assert.ok(h.coldestMonthMeanMinC < t.coldestMonthMeanMinC);
});

test('resolution honesty: climate ~1km vs terrain ~30m class', () => {
  const h = loadProfile('helsinki');
  assert.match(h.climateNativeResolution, /1 km|30 arc/i);
  assert.match(h.terrainNativeResolution, /30 m/i);
  assert.notEqual(h.climateNativeResolution, h.terrainNativeResolution);
});

test('persistence reuses Garden structural climate columns', () => {
  const h = loadProfile('helsinki');
  const structural = coordinateClimateProfileToStructuralPersistence(h);
  const fields = buildStructuralClimateServerFields(structural);
  assert.equal(fields.location_structural_climate_status, 'known');
  assert.match(String(fields.location_structural_climate_source), /coordinate-climate-authority-v2/);
  assert.equal(fields.location_structural_climate.coordinateClimateV2.authorityVersion, h.authorityVersion);
});

test('100 and 500 plant evaluations: zero external climate provider calls', () => {
  const h = loadProfile('helsinki');
  const p100 = proveZeroProviderCallsForPlantEvaluations(h, 100);
  const p500 = proveZeroProviderCallsForPlantEvaluations(h, 500);
  assert.equal(p100.externalClimateProviderCalls, 0);
  assert.equal(p500.externalClimateProviderCalls, 0);
  assert.equal(p100.chelsaExternalCalls, 0);
  assert.equal(p500.openMeteoStructuralCalls, 0);
  assert.equal(assertCoordinateClimateRuntimeCostPolicy().paidApiUsd, 0);
});

test('unknown coordinate → CLIMATE_AUTHORITY_UNAVAILABLE (no proxy)', () => {
  const miss = lookupCoordinateClimateProfile(-12.34, 56.78, { dataRoot: DATA });
  assert.equal(miss.code, CLIMATE_AUTHORITY_UNAVAILABLE);
  assert.equal(miss.profile.status, CLIMATE_AUTHORITY_UNAVAILABLE);
});

test('baseline license and terrain policy recorded', () => {
  assert.equal(CHELSA_V21_BASELINE.license, 'CC0-1.0');
  assert.equal(TERRAIN_LAYER_POLICY_V2.forbidsPerUserCopernicusApi, true);
  assert.equal(COORDINATE_CLIMATE_AUTHORITY_V2_VERSION.startsWith('2.'), true);
});
