/**
 * Coordinate Climate V2 — accuracy confidence + compact tile + zero-API gates.
 * Run: node --test tests/coordinate-climate-v2-accuracy-gate.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCoordinateClimateConfidenceV2,
  applyRepresentativenessToSuitabilityClaim,
  CONFIDENCE_DIMENSIONS_V2
} from '../modules/personal-domain/coordinate-climate-confidence-v2-contract.js';
import {
  lookupCoordinateClimateFromCompactTile,
  measureTilePrototypeStats
} from '../modules/personal-domain/coordinate-climate-compact-tiles-v2.js';
import {
  resolveGardenStructuralClimateFromCoordinateV2,
  resetCoordinateClimateRuntimeCounters,
  getCoordinateClimateRuntimeCounters,
  drainBackgroundClimatePrepQueue,
  RESOLUTION_CONTRACT_V2
} from '../modules/personal-domain/coordinate-climate-garden-hydrate-v2.js';
import { proveZeroProviderCallsForPlantEvaluations } from '../modules/personal-domain/coordinate-climate-lookup-v2.js';
import { deriveSpecificPlantOutcomes } from '../modules/personal-domain/specific-plant-suitability-contract.js';
import { CLIMATE_AUTHORITY_UNAVAILABLE } from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data', 'coordinate-climate', 'v2');
const QA = path.join(DATA, 'qa');
const TILES = path.join(DATA, 'tiles');

function loadPilot(id) {
  return JSON.parse(fs.readFileSync(path.join(DATA, 'pilot', `${id}.json`), 'utf8'));
}

test('PART A: confidence dimensions are explicit (not one opaque high)', () => {
  const yehiam = loadPilot('yehiam');
  const qa = JSON.parse(fs.readFileSync(path.join(QA, 'yehiam.json'), 'utf8'));
  const conf = buildCoordinateClimateConfidenceV2({ profile: yehiam, qaRecord: qa });
  for (const k of CONFIDENCE_DIMENSIONS_V2) {
    assert.ok(conf.dimensions[k], k);
  }
  assert.equal(conf.dimensions.SOURCE_DATA_INTEGRITY, 'high');
  assert.equal(conf.dimensions.LOCAL_REPRESENTATIVENESS, 'low');
  assert.notEqual(conf.dimensions.SOURCE_DATA_INTEGRITY, conf.dimensions.LOCAL_REPRESENTATIVENESS);
  assert.equal(conf.overall, 'low');
  assert.ok(yehiam.confidenceDimensions?.LOCAL_REPRESENTATIVENESS === 'low');
});

test('PART B/C: Yehiam preserve CHELSA + demote representativeness', () => {
  const y = JSON.parse(fs.readFileSync(path.join(QA, 'yehiam-local-representativeness.json'), 'utf8'));
  assert.equal(y.chelsa.annualPrecipitationMm, 1293.6);
  assert.equal(y.decision, 'PRESERVE_CHELSA_DEMOTE_LOCAL_REPRESENTATIVENESS');
  assert.equal(y.answers.D, false);
  assert.equal(y.answers.A, true);
  assert.ok(y.representativeness.materialDivergence);
});

test('PART D: diverse accuracy sample present', () => {
  const idx = JSON.parse(fs.readFileSync(path.join(QA, 'index.json'), 'utf8'));
  assert.ok(idx.sampleCount >= 12);
  assert.equal(idx.runtimeForbidden, true);
  const tags = new Set();
  for (const e of idx.entries) {
    const row = JSON.parse(fs.readFileSync(path.join(QA, `${e.id}.json`), 'utf8'));
    for (const t of row.tags || []) tags.add(t);
  }
  assert.ok(tags.has('humid-tropical'));
  assert.ok(tags.has('hyper-arid') || tags.has('arid'));
  assert.ok(tags.has('mediterranean'));
  assert.ok(tags.has('highland'));
});

test('PART E/G: compact tile lookup + resolution truth', () => {
  assert.match(RESOLUTION_CONTRACT_V2.CLIMATE_NATIVE_RESOLUTION, /1 km|30/);
  assert.notEqual(
    RESOLUTION_CONTRACT_V2.CLIMATE_NATIVE_RESOLUTION,
    RESOLUTION_CONTRACT_V2.TERRAIN_NATIVE_RESOLUTION
  );
  const hel = loadPilot('helsinki');
  const hit = lookupCoordinateClimateFromCompactTile(hel.coordinate.lat, hel.coordinate.lon, {
    tileRoot: TILES,
    tileId: 'pilot-sparse-v1'
  });
  assert.equal(hit.ok, true);
  assert.equal(hit.externalClimateProviderCalls, 0);
  assert.equal(hit.profile.annualPrecipitationMm, hel.annualPrecipitationMm);
  assert.match(String(hit.profile.climateNativeResolution), /1 km/);

  const miss = lookupCoordinateClimateFromCompactTile(12.34, 56.78, {
    tileRoot: TILES,
    tileId: 'pilot-sparse-v1'
  });
  assert.equal(miss.code, CLIMATE_AUTHORITY_UNAVAILABLE);
  assert.equal(miss.externalClimateProviderCalls, 0);
});

test('PART F: cache miss does not fetch externally', () => {
  resetCoordinateClimateRuntimeCounters();
  drainBackgroundClimatePrepQueue();
  const miss = resolveGardenStructuralClimateFromCoordinateV2(-33.86, 151.21, {
    dataRoot: DATA,
    enqueuePrep: true
  });
  assert.equal(miss.code, CLIMATE_AUTHORITY_UNAVAILABLE);
  assert.ok(miss.prepEnqueued);
  const c = getCoordinateClimateRuntimeCounters();
  assert.equal(c.chelsaExternalCalls, 0);
  assert.equal(c.openMeteoStructuralCalls, 0);
  assert.equal(c.terrainProviderExternalCalls, 0);
});

test('PART H: uncertain representativeness demotes strong moisture claim', () => {
  const adj = applyRepresentativenessToSuitabilityClaim({
    overallRecommendation: 'good',
    confidence: {
      dimensions: {
        LOCAL_REPRESENTATIVENESS: 'low',
        OVERALL_AUTHORITY_CONFIDENCE: 'low'
      }
    },
    moistureOrPrecipDependent: true
  });
  assert.equal(adj.demoted, true);
  assert.equal(adj.adjustedRecommendation, 'borderline');

  const yehiam = loadPilot('yehiam');
  const out = deriveSpecificPlantOutcomes({
    meta: {
      frostSensitivity: 'medium',
      humidityTolerance: 'high',
      groupIds: ['tropical-frost-sensitive-fruit']
    },
    climateProfile: {
      ...yehiam,
      moistureRegime: yehiam.aridityMoistureRegime,
      confidenceDimensions: yehiam.confidenceDimensions,
      localRepresentativeness: yehiam.localRepresentativeness,
      confidence: yehiam.confidence
    },
    suitability: {
      survivalFit: 80,
      thriveFit: 75,
      recommendationLevel: 'good',
      explanationText: 'ok'
    },
    plant: { commonName: 'test' }
  });
  assert.ok(out.overall === 'borderline' || out.representativenessAdjustment);
});

test('PART I: 1/100/1000 lookups + 100/500 evals zero external', () => {
  const hel = loadPilot('helsinki');
  let ext = 0;
  for (let i = 0; i < 1000; i++) {
    const r = lookupCoordinateClimateFromCompactTile(hel.coordinate.lat, hel.coordinate.lon, {
      tileRoot: TILES,
      tileId: 'pilot-sparse-v1'
    });
    ext += r.externalClimateProviderCalls || 0;
  }
  assert.equal(ext, 0);
  assert.equal(proveZeroProviderCallsForPlantEvaluations(hel, 100).externalClimateProviderCalls, 0);
  assert.equal(proveZeroProviderCallsForPlantEvaluations(hel, 500).externalClimateProviderCalls, 0);

  resetCoordinateClimateRuntimeCounters();
  const again = resolveGardenStructuralClimateFromCoordinateV2(hel.coordinate.lat, hel.coordinate.lon, {
    dataRoot: DATA,
    existingStructural: {
      status: 'known',
      provenance: {
        provider: 'coordinate-climate-authority-v2',
        lat: hel.coordinate.lat,
        lon: hel.coordinate.lon
      }
    }
  });
  assert.equal(again.code, 'REUSE_PERSISTED_V2');
  assert.equal(getCoordinateClimateRuntimeCounters().chelsaExternalCalls, 0);
});

test('PART J: prototype metrics exist and beat naive 12KB JSON', () => {
  const report = JSON.parse(fs.readFileSync(path.join(TILES, 'prototype-metrics.json'), 'utf8'));
  assert.ok(report.tile.bytesPerCellGzip < 4000);
  assert.ok(report.compressionVsNaiveJson > 2);
  const proj = measureTilePrototypeStats(report.tile);
  assert.ok(proj.estimatedGlobalLandStorageGzipGb > 0);
  assert.ok(proj.estimatedGlobalLandStorageGzipGb < 1800);
});
