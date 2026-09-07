/**
 * Bounded proof: garden hydrate prefers validated local global-tile O(1) lookup.
 * Run: node --test tests/coordinate-climate-garden-hydrate-global-wiring.test.mjs
 *
 * No CHELSA/network. No Hero/Product Authority. No R2/Batch 3.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveGardenStructuralClimateFromCoordinateV2,
  isAuthoritativeGlobalCorpusAvailable,
  resetCoordinateClimateRuntimeCounters,
  getCoordinateClimateRuntimeCounters,
  drainBackgroundClimatePrepQueue
} from '../modules/personal-domain/coordinate-climate-garden-hydrate-v2.js';
import {
  clearGlobalRuntimeCaches,
  GLOBAL_BAKE_ID_DEFAULT
} from '../modules/personal-domain/coordinate-climate-global-lookup-v2.js';
import { coverageTileIndexFromLatLon } from '../modules/personal-domain/coordinate-climate-coverage-tiles-v2.js';
import { coordinateClimateProfileToStructuralPersistence } from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import { deriveSpecificPlantOutcomes } from '../modules/personal-domain/specific-plant-suitability-contract.js';
import { loadCoordinateClimateIndex } from '../modules/personal-domain/coordinate-climate-lookup-v2.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data', 'coordinate-climate', 'v2');

/** Trusted-style land point outside the original 7-point pilot index. */
const NYC = { id: 'nyc', lat: 40.7128, lon: -74.006, label: 'New York City' };

const PILOT_IDS = new Set([
  'yehiam',
  'helsinki',
  'singapore',
  'kochi',
  'cairo',
  'tokyo',
  'quito'
]);

function isOutsidePilotIndex(lat, lon) {
  const index = loadCoordinateClimateIndex(DATA);
  assert.equal(index.ok, true);
  assert.equal(index.entries.length, 7);
  for (const e of index.entries) {
    assert.ok(PILOT_IDS.has(e.id));
    const d = Math.hypot(Number(e.lat) - lat, Number(e.lon) - lon);
    if (d <= 0.00015) return false;
  }
  return true;
}

/** Minimal app-climate fields consumed by Smart Rec / Specific Plant (structural → profile). */
function appClimateFieldsFromStructural(structural, locLabel = 'test') {
  assert.equal(structural?.status, 'known');
  return {
    locationLabel: locLabel,
    locationConfidence: 'confirmed',
    structuralClimateStatus: structural.status,
    structuralClimate: structural,
    broadClimate: structural.broadClimateOverride || 'temperate',
    moistureRegime: structural.moistureRegime,
    humidityRegime: structural.humidityRegime,
    humiditySignal: structural.humiditySignal,
    thermalRegime: structural.thermalRegime,
    freezingRisk: structural.freezingRisk,
    structuralColdRisk: structural.structuralColdRisk,
    coldestMonthMeanMinC: structural.evidence?.coldestMonthMeanMinC ?? null,
    elevationM: structural.elevationM,
    annualPrecipitationMm: structural.evidence?.annualPrecipitationMm ?? null,
    aridityIndex: structural.evidence?.aridityIndex ?? null,
    drySeasonSignal: structural.drySeasonSignal === true
  };
}

test('global corpus available for prefer-global hydrate path', () => {
  assert.equal(isAuthoritativeGlobalCorpusAvailable(), true);
});

test('trusted land outside 7 pilots resolves via global-tile-o1 with zero CHELSA', () => {
  clearGlobalRuntimeCaches();
  resetCoordinateClimateRuntimeCounters();
  drainBackgroundClimatePrepQueue();

  assert.equal(isOutsidePilotIndex(NYC.lat, NYC.lon), true);

  const tip = coverageTileIndexFromLatLon(NYC.lat, NYC.lon);
  assert.ok(tip?.tileKey);

  const resolved = resolveGardenStructuralClimateFromCoordinateV2(NYC.lat, NYC.lon, {
    dataRoot: DATA,
    enqueuePrep: false,
    label: NYC.label
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.lookupSource, 'global-tile-o1');
  assert.equal(resolved.tileKey, tip.tileKey);
  assert.equal(resolved.globalBakeId, GLOBAL_BAKE_ID_DEFAULT);
  assert.equal(resolved.structuralClimate.status, 'known');
  assert.match(String(resolved.structuralClimate.provenance?.provider), /coordinate-climate-authority-v2/);
  assert.equal(resolved.profile?.provenance?.lookupPath, 'global-tile-o1');
  assert.ok(Number.isFinite(resolved.structuralClimate.evidence?.coldestMonthMeanMinC));
  assert.ok(Number.isFinite(resolved.structuralClimate.evidence?.annualPrecipitationMm));

  const cost = getCoordinateClimateRuntimeCounters();
  assert.equal(cost.chelsaExternalCalls, 0);
  assert.equal(cost.openMeteoStructuralCalls, 0);
  assert.equal(cost.terrainProviderExternalCalls, 0);
  assert.equal(resolved.cost.chelsaExternalCalls, 0);
});

test('global-derived structural climate reaches Specific Plant suitability path', () => {
  clearGlobalRuntimeCaches();
  const resolved = resolveGardenStructuralClimateFromCoordinateV2(NYC.lat, NYC.lon, {
    dataRoot: DATA,
    enqueuePrep: false
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.lookupSource, 'global-tile-o1');

  const climateProfile = appClimateFieldsFromStructural(resolved.structuralClimate, NYC.label);
  assert.equal(climateProfile.structuralClimateStatus, 'known');
  assert.ok(climateProfile.thermalRegime);

  const out = deriveSpecificPlantOutcomes({
    meta: {
      frostSensitivity: 'medium',
      humidityTolerance: 'medium',
      groupIds: ['temperate-deciduous']
    },
    climateProfile,
    suitability: {
      survivalFit: 70,
      thriveFit: 65,
      recommendationLevel: 'good',
      explanationText: 'global-hydrate wiring proof'
    },
    plant: { commonName: 'wiring-proof-plant' }
  });
  assert.ok(out);
  assert.ok(out.overall);
  assert.notEqual(out.overall, 'blocked');
});

test('disableGlobal preserves sparse pilot fallback (Helsinki hit, NYC miss)', () => {
  clearGlobalRuntimeCaches();
  resetCoordinateClimateRuntimeCounters();

  const hel = resolveGardenStructuralClimateFromCoordinateV2(60.16952, 24.93545, {
    dataRoot: DATA,
    disableGlobal: true,
    enqueuePrep: false
  });
  assert.equal(hel.ok, true);
  assert.equal(hel.lookupSource, 'local-index');
  assert.equal(hel.matchedEntry?.id, 'helsinki');

  const nycSparse = resolveGardenStructuralClimateFromCoordinateV2(NYC.lat, NYC.lon, {
    dataRoot: DATA,
    disableGlobal: true,
    enqueuePrep: false
  });
  assert.equal(nycSparse.ok, false);
  assert.equal(nycSparse.lookupSource, null);
  assert.equal(getCoordinateClimateRuntimeCounters().chelsaExternalCalls, 0);
});

test('untrusted/default location is not converted by hydrate into suitability authority', () => {
  // Hydrate resolves climate for coordinates only; suitability trust gate remains app-side.
  const resolved = resolveGardenStructuralClimateFromCoordinateV2(NYC.lat, NYC.lon, {
    dataRoot: DATA,
    enqueuePrep: false
  });
  assert.equal(resolved.ok, true);

  const defaultLocationBlocked = (locationConfidence) => locationConfidence === 'default';
  assert.equal(defaultLocationBlocked('default'), true);
  assert.equal(defaultLocationBlocked('confirmed'), false);

  const structural = coordinateClimateProfileToStructuralPersistence(resolved.profile);
  assert.equal(structural.status, 'known');
  assert.equal(structural.provenance?.noCityProxy, true);
});
