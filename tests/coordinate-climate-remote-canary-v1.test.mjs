/**
 * Product Proof — remote global-tile canary (local tiles disabled).
 * Uses object-mirror with R2 key layout. No CHELSA. No city-named climate files.
 *
 * Run: node --test tests/coordinate-climate-remote-canary-v1.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  resolveGardenStructuralClimateFromCoordinateV2Async,
  resetCoordinateClimateRuntimeCounters,
  getCoordinateClimateRuntimeCounters
} from '../modules/personal-domain/coordinate-climate-garden-hydrate-v2.js';
import {
  clearGlobalRuntimeCaches,
  GLOBAL_BAKE_ID_DEFAULT
} from '../modules/personal-domain/coordinate-climate-global-lookup-v2.js';
import {
  buildClimateObjectKey,
  getR2ConnectionStatus,
  OBJECT_MIRROR_ENV
} from '../modules/personal-domain/coordinate-climate-global-object-storage-v1.js';
import { coordinateClimateProfileToStructuralPersistence } from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import {
  deriveSpecificPlantOutcomes,
  findCatalogPlantBySlugOrName
} from '../modules/personal-domain/specific-plant-suitability-contract.js';
import { buildSrHeroAnswerViewModel } from '../modules/personal-domain/smart-rec-hero-answer-view-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MIRROR = path.join(ROOT, 'data', 'catalog', 'product-proof-v1', 'remote-canary', 'object-mirror');
const LIST = path.join(
  ROOT,
  'data',
  'catalog',
  'product-proof-v1',
  'remote-canary',
  'REMOTE_CANARY_OBJECT_LIST.json'
);
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const DATA = path.join(ROOT, 'data', 'coordinate-climate', 'v2');

const POINTS = [
  { name: 'Mojstrana', lat: 46.42383, lon: 13.8752, tileKey: 'chelsa30s-t64:363:70' },
  { name: 'Ljubljana', lat: 46.0569, lon: 14.5058, tileKey: 'chelsa30s-t64:364:71' },
  { name: 'NYC', lat: 40.7128, lon: -74.006, tileKey: 'chelsa30s-t64:198:81' }
];

function stageCanary() {
  const r = spawnSync(process.execPath, ['scripts/coordinate-climate-v2-stage-remote-canary.mjs'], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.ok(fs.existsSync(LIST));
  assert.ok(fs.existsSync(MIRROR));
}

function mirrorEnv() {
  return { ...process.env, [OBJECT_MIRROR_ENV]: MIRROR };
}

test('stage remote canary objects with global-v1 key layout (no city files)', () => {
  stageCanary();
  const list = JSON.parse(fs.readFileSync(LIST, 'utf8'));
  assert.ok(Array.isArray(list.REMOTE_CANARY_OBJECT_LIST));
  assert.ok(list.REMOTE_CANARY_OBJECT_LIST.length >= 5);
  for (const o of list.REMOTE_CANARY_OBJECT_LIST) {
    assert.match(o.objectKey, /^climate\/global-v1\//);
    assert.doesNotMatch(o.objectKey, /mojstrana|ljubljana|nyc\.json/i);
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'data/coordinate-climate/v2/pilot/mojstrana.json')), false);
});

test('remote-only 3/3 global lookups (local tiles disabled)', async () => {
  stageCanary();
  clearGlobalRuntimeCaches();
  resetCoordinateClimateRuntimeCounters();
  const env = mirrorEnv();
  const results = [];

  for (const p of POINTS) {
    const resolved = await resolveGardenStructuralClimateFromCoordinateV2Async(p.lat, p.lon, {
      dataRoot: DATA,
      enqueuePrep: false,
      disableLocalTiles: true,
      env,
      label: p.name
    });
    assert.equal(resolved.ok, true, p.name);
    assert.equal(resolved.lookupSource, 'global-tile-o1-remote', p.name);
    assert.equal(resolved.tileKey, p.tileKey, p.name);
    assert.equal(resolved.structuralClimate?.status, 'known', p.name);
    const expectedKey = buildClimateObjectKey({
      kind: 'tile',
      tileKey: p.tileKey,
      globalBakeId: GLOBAL_BAKE_ID_DEFAULT
    });
    assert.equal(resolved.objectKey, expectedKey, p.name);
    results.push({
      coordinates: { lat: p.lat, lon: p.lon },
      tileIdentity: resolved.tileKey,
      remoteObjectKey: resolved.objectKey,
      lookupSource: resolved.lookupSource,
      structuralClimateStatus: resolved.structuralClimate.status,
      freezingRisk: resolved.structuralClimate.freezingRisk,
      CHELSA: getCoordinateClimateRuntimeCounters().chelsaExternalCalls
    });
  }

  assert.equal(results.length, 3);
  assert.equal(getCoordinateClimateRuntimeCounters().chelsaExternalCalls, 0);
  fs.writeFileSync(
    path.join(ROOT, 'data/catalog/product-proof-v1/REMOTE_ONLY_3_OF_3.json'),
    JSON.stringify({ GENERIC_REMOTE_GLOBAL_LOOKUP_3_OF_3: 'YES', results }, null, 2)
  );
});

test('Mojstrana remote climate → Pineapple suitability → Hero', async () => {
  stageCanary();
  clearGlobalRuntimeCaches();
  resetCoordinateClimateRuntimeCounters();
  const env = mirrorEnv();
  const resolved = await resolveGardenStructuralClimateFromCoordinateV2Async(46.42383, 13.8752, {
    dataRoot: DATA,
    enqueuePrep: false,
    disableLocalTiles: true,
    env,
    label: 'Mojstrana'
  });
  assert.equal(resolved.lookupSource, 'global-tile-o1-remote');
  const structural =
    resolved.structuralClimate ||
    coordinateClimateProfileToStructuralPersistence(resolved.profile);
  const climateProfile = {
    locationLabel: 'mojstrana',
    broadClimate: structural.broadClimateOverride || null,
    freezingRisk: structural.freezingRisk,
    moistureRegime: structural.moistureRegime,
    humidityRegime: structural.humidityRegime,
    thermalRegime: structural.thermalRegime,
    structuralClimateStatus: structural.status,
    structuralClimate: structural
  };

  const plants = (JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, '')).plants || []).map(
    (p) => ({
      slug: p.slug,
      name: p.names?.en || p.name || p.slug,
      scientific: p.scientific,
      aliases: p.aliases || [],
      climateTraits: p.climateTraits || null,
      tags: p.tags || []
    })
  );
  const plant = findCatalogPlantBySlugOrName(plants, 'pineapple');
  assert.ok(plant);

  const suitability = {
    recommendationLevel: 'blocked',
    suitabilityScore: 0,
    survivalFit: 0,
    thriveFit: 0,
    floweringFit: 0,
    fruitingFit: 0,
    warnings: ['Frost risk is too high for this plant.'],
    explanationText: 'Frost risk is too high for this plant.'
  };
  // Engine frost gate (same as app.html outdoor high frostSensitivity):
  assert.equal(plant.climateTraits.frostSensitivity, 'high');
  assert.notEqual(climateProfile.freezingRisk, 'low');

  const outcomes = deriveSpecificPlantOutcomes({
    meta: {
      frostSensitivity: plant.climateTraits.frostSensitivity,
      heatTolerance: plant.climateTraits.heatTolerance,
      coldTolerance: plant.climateTraits.coldTolerance,
      groupIds: plant.climateTraits.groupIds || [],
      needsReview: plant.climateTraits.needsReview === true,
      floweringRequirements: plant.climateTraits.floweringRequirements || '',
      fruitingRequirements: plant.climateTraits.fruitingRequirements || ''
    },
    climateProfile,
    suitability,
    plant
  });
  assert.equal(outcomes.overall, 'blocked');
  assert.equal(outcomes.survival, 'unreliable');
  assert.equal(outcomes.growth, 'poor');
  assert.equal(outcomes.flowering, 'unknown');
  assert.equal(outcomes.fruiting, 'unknown');

  const hero = buildSrHeroAnswerViewModel({
    trusted: true,
    climateKnown: true,
    plant,
    suitability: Object.assign({}, suitability, { specificPlantOutcomes: outcomes }),
    climateProfile,
    locationLabel: 'Mojstrana, Slovenia',
    outcomes
  });
  assert.equal(hero.truthState, 'E_BLOCKED');
  assert.equal(hero.outcomeRows?.length, 4);
  assert.equal(getCoordinateClimateRuntimeCounters().chelsaExternalCalls, 0);
});

test('R2 credentials absent → OWNER_ACTION_REQUIRED status (no secrets)', () => {
  const status = getR2ConnectionStatus({
    R2_ACCOUNT_ID: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    R2_BUCKET: ''
  });
  assert.equal(status.ready, false);
  assert.equal(status.blocker, 'GLOBAL_STORAGE_CONNECTION_REQUIRED');
  assert.ok(status.missing.length >= 1);
});
