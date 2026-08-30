/**
 * Coordinate Climate V2 production hardening gates.
 * Run: node --test tests/coordinate-climate-v2-production-hardening.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLIMATE_AUTHORITY_UNAVAILABLE,
  classifyUnepAridityFromIndex,
  chelsaPrecipToMm,
  chelsaPetToMm
} from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import {
  resolveGardenStructuralClimateFromCoordinateV2,
  assertNoExternalStructuralAcquisitionOnUserRuntime,
  resetCoordinateClimateRuntimeCounters,
  getCoordinateClimateRuntimeCounters,
  chelsaGridCellIndex,
  RESOLUTION_CONTRACT_V2,
  CRUVIT_CLIMATE_STORAGE_ARCHITECTURE_V2,
  drainBackgroundClimatePrepQueue
} from '../modules/personal-domain/coordinate-climate-garden-hydrate-v2.js';
import { proveZeroProviderCallsForPlantEvaluations as proveLookup } from '../modules/personal-domain/coordinate-climate-lookup-v2.js';
import { shouldAcquireStructuralClimate } from '../modules/personal-domain/structural-climate-persistence-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data', 'coordinate-climate', 'v2');

function load(id) {
  return JSON.parse(fs.readFileSync(path.join(DATA, 'pilot', `${id}.json`), 'utf8'));
}

test('PART A: Garden hydrate uses V2 local lookup; miss → UNAVAILABLE + prep enqueue', () => {
  resetCoordinateClimateRuntimeCounters();
  drainBackgroundClimatePrepQueue();
  const policy = assertNoExternalStructuralAcquisitionOnUserRuntime();
  assert.equal(policy.openMeteoStructuralAllowed, false);
  assert.equal(policy.chelsaExternalAllowed, false);

  const hel = load('helsinki');
  const ok = resolveGardenStructuralClimateFromCoordinateV2(
    hel.coordinate.lat,
    hel.coordinate.lon,
    { dataRoot: DATA, enqueuePrep: true }
  );
  assert.equal(ok.ok, true);
  assert.match(String(ok.structuralClimate.provenance.provider), /coordinate-climate-authority-v2/);
  assert.equal(ok.cost.openMeteoStructuralCalls, 0);
  assert.equal(ok.cost.chelsaExternalCalls, 0);

  const miss = resolveGardenStructuralClimateFromCoordinateV2(12.345678, 98.765432, {
    dataRoot: DATA,
    enqueuePrep: true
  });
  assert.equal(miss.ok, false);
  assert.equal(miss.code, CLIMATE_AUTHORITY_UNAVAILABLE);
  assert.ok(miss.prepEnqueued);
  assert.equal(miss.cost.chelsaExternalCalls, 0);
  assert.equal(miss.cost.openMeteoStructuralCalls, 0);
});

test('PART A: shouldAcquireStructuralClimate never enables external acquire', () => {
  assert.equal(shouldAcquireStructuralClimate(null, 60.17, 24.94).acquire, false);
  assert.equal(
    shouldAcquireStructuralClimate(null, 60.17, 24.94).reason,
    'v2-local-lookup-only-no-external-acquire'
  );
});

test('PART B: PET/UNEP aridity present on rebuilt pilots', () => {
  const cairo = load('cairo');
  const kochi = load('kochi');
  const yehiam = load('yehiam');
  assert.ok(cairo.annualPetMm != null && cairo.annualPetMm > 0, 'Cairo PET');
  assert.ok(cairo.aridityIndex != null, 'Cairo AI');
  assert.equal(cairo.aridityMethod, 'UNEP_AI_P_over_PET');
  assert.equal(cairo.aridityMoistureRegime, 'hyper-arid');
  assert.ok(kochi.aridityIndex > cairo.aridityIndex);
  assert.match(String(kochi.aridityMoistureRegime), /humid|dry-subhumid/);
  assert.equal(yehiam.aridityMethod, 'UNEP_AI_P_over_PET');
  assert.notEqual(yehiam.aridityMoistureRegime, cairo.aridityMoistureRegime);
  assert.ok(yehiam.aridityIndex > cairo.aridityIndex);
});

test('PART C: Yehiam precip extraction integrity (12 months, scale, cell)', () => {
  const y = load('yehiam');
  assert.equal(y.monthlyPrecipMm.length, 12);
  const sum = y.monthlyPrecipMm.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - y.annualPrecipitationMm) < 0.2);
  assert.equal(chelsaPrecipToMm(12936) /* if raw were 10x annual */, 1293.6);
  assert.ok(y.climateGrid?.cellPixel?.x != null);
  assert.ok(y.provenance?.cityProxy === false);
  // QA note file must exist if investigation recorded
  const inv = path.join(DATA, 'yehiam-precip-investigation.json');
  assert.equal(fs.existsSync(inv), true);
  const report = JSON.parse(fs.readFileSync(inv, 'utf8'));
  assert.equal(report.extractionBugFound, false);
  assert.ok(report.qaIndependentReference);
});

test('PART E: resolution contract frozen separately', () => {
  assert.match(RESOLUTION_CONTRACT_V2.CLIMATE_NATIVE_RESOLUTION, /1 km|30/);
  assert.match(RESOLUTION_CONTRACT_V2.TERRAIN_NATIVE_RESOLUTION, /30 m/);
  assert.notEqual(
    RESOLUTION_CONTRACT_V2.CLIMATE_NATIVE_RESOLUTION,
    RESOLUTION_CONTRACT_V2.TERRAIN_NATIVE_RESOLUTION
  );
  assert.equal(CRUVIT_CLIMATE_STORAGE_ARCHITECTURE_V2.forbidsUserTriggeredMaterialization, true);
});

test('PART G: same-area sensitivity — grid/elevation pairs', () => {
  const quito = load('quito');
  const singapore = load('singapore');
  assert.notEqual(quito.thermalRegime, singapore.thermalRegime);
  assert.equal(quito.highlandModifier, true);

  // Adjacent cell index changes with ~1km shift
  const a = chelsaGridCellIndex(quito.coordinate.lat, quito.coordinate.lon);
  const b = chelsaGridCellIndex(quito.coordinate.lat + 0.01, quito.coordinate.lon);
  assert.notEqual(a.cellKey, b.cellKey);

  // Yehiam vs Cairo same broad region class thermally possible but moisture AI differs
  const yehiam = load('yehiam');
  const cairo = load('cairo');
  assert.notEqual(yehiam.aridityIndex, cairo.aridityIndex);
});

test('PART H: 100/500 + unprepared coordinate zero external', () => {
  resetCoordinateClimateRuntimeCounters();
  const hel = load('helsinki');
  const p100 = proveLookup(hel, 100);
  const p500 = proveLookup(hel, 500);
  assert.equal(p100.externalClimateProviderCalls, 0);
  assert.equal(p500.externalClimateProviderCalls, 0);

  const miss = resolveGardenStructuralClimateFromCoordinateV2(-11.11, 22.22, {
    dataRoot: DATA,
    enqueuePrep: false
  });
  assert.equal(miss.code, CLIMATE_AUTHORITY_UNAVAILABLE);
  const c = getCoordinateClimateRuntimeCounters();
  assert.equal(c.chelsaExternalCalls, 0);
  assert.equal(c.openMeteoStructuralCalls, 0);
  assert.equal(c.terrainProviderExternalCalls, 0);
});

test('PET decode scale (raw/100 mm; CMI-validated)', () => {
  assert.equal(chelsaPetToMm(15000), 150);
  assert.equal(chelsaPetToMm(5613), 56.1);
  assert.equal(classifyUnepAridityFromIndex(0.02), 'hyper-arid');
  assert.equal(classifyUnepAridityFromIndex(1.2), 'humid');
});

test('PART B: humid tropics remain humid under UNEP AI (not precip-band)', () => {
  const singapore = load('singapore');
  const kochi = load('kochi');
  assert.equal(singapore.aridityMoistureRegime, 'humid');
  assert.equal(kochi.aridityMoistureRegime, 'humid');
  assert.ok(singapore.aridityIndex >= 0.65);
  assert.ok(kochi.aridityIndex >= 0.65);
});

test('PART G: same-area sensitivity — MENA pair + highland vs lowland', () => {
  const yehiam = load('yehiam');
  const cairo = load('cairo');
  // Same broad MENA/Eastern-Med corridor does not imply identical derived profiles
  assert.notEqual(yehiam.climateGrid.cellPixel.x, cairo.climateGrid.cellPixel.x);
  assert.notEqual(yehiam.elevationM, cairo.elevationM);
  assert.ok(yehiam.aridityIndex > 0.5, 'Yehiam humid-class AI from P/PET');
  assert.ok(cairo.aridityIndex < 0.05, 'Cairo hyper-arid AI');

  const quito = load('quito');
  const nearQuitoCell = chelsaGridCellIndex(quito.coordinate.lat + 0.008333, quito.coordinate.lon);
  const quitoCell = chelsaGridCellIndex(quito.coordinate.lat, quito.coordinate.lon);
  assert.notEqual(nearQuitoCell.cellKey, quitoCell.cellKey, 'grid-cell boundary shifts cell key');
});
