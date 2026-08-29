/**
 * Reproductive outcome evidence gate — flowering/fruiting must not use default fit scores.
 * Run: node --test tests/reproductive-outcome-evidence-gate.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SPECIFIC_OUTCOME_STATUS,
  deriveSpecificPlantOutcomes,
  evaluateFloweringFromCatalogEvidence,
  evaluateFruitingFromCatalogEvidence,
  parseMinTempCFromRequirements,
  measureSpecificPlantEvaluationLatency,
  structuralEnvironmentFromClimateProfile,
  findCatalogPlantBySlugOrName
} from '../modules/personal-domain/specific-plant-suitability-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.join(HERE, '..', 'data', 'plants.seed.json');

function humidTropical() {
  return structuralEnvironmentFromClimateProfile({
    broadClimate: 'tropical',
    climateLabel: 'Tropical',
    freezingRisk: 'low',
    humiditySignal: 'high',
    moistureRegime: 'humid',
    structuralClimateStatus: 'known',
    coldestMonthMeanMinC: 23.4,
    alwaysHot: true,
    coolSeasonSignal: false,
    thermalRegime: 'year-round-warm',
    isFrostFreeGrowingClimate: true,
    structuralClimate: {
      status: 'known',
      moistureRegime: 'humid',
      humiditySignal: 'high',
      broadClimateOverride: 'tropical',
      freezingRisk: 'low',
      thermalRegime: 'year-round-warm',
      evidence: { coldestMonthMeanMinC: 23.4 }
    }
  });
}

function hyperArid() {
  return structuralEnvironmentFromClimateProfile({
    broadClimate: 'arid',
    climateLabel: 'Arid',
    freezingRisk: 'low',
    humiditySignal: 'low',
    moistureRegime: 'hyper-arid',
    structuralClimateStatus: 'known',
    coldestMonthMeanMinC: 8.89,
    alwaysHot: false,
    coolSeasonSignal: true,
    thermalRegime: 'cool-seasonal',
    isFrostFreeGrowingClimate: false,
    structuralClimate: {
      status: 'known',
      moistureRegime: 'hyper-arid',
      humiditySignal: 'low',
      broadClimateOverride: 'arid',
      freezingRisk: 'low',
      thermalRegime: 'cool-seasonal',
      evidence: { coldestMonthMeanMinC: 8.89, aridityIndex: 0.017 }
    }
  });
}

function frostProne() {
  return structuralEnvironmentFromClimateProfile({
    broadClimate: 'temperate',
    climateLabel: 'Temperate',
    freezingRisk: 'high',
    humiditySignal: 'high',
    moistureRegime: 'humid',
    structuralClimateStatus: 'known',
    coldestMonthMeanMinC: -0.18,
    thermalRegime: 'frost-prone',
    isFrostFreeGrowingClimate: false,
    structuralClimate: {
      status: 'known',
      freezingRisk: 'high',
      thermalRegime: 'frost-prone',
      evidence: { coldestMonthMeanMinC: -0.18 }
    }
  });
}

const stubSuit = {
  recommendationLevel: 'good',
  survivalFit: 85,
  thriveFit: 80,
  floweringFit: 50,
  fruitingFit: 40,
  warnings: [],
  explanationText: ''
};

test('1. no flowering requirements + no negative evidence → Flowering UNKNOWN', () => {
  const o = deriveSpecificPlantOutcomes({
    meta: {
      frostSensitivity: 'low',
      humidityTolerance: 'medium',
      floweringRequirements: '',
      fruitingRequirements: ''
    },
    climateProfile: humidTropical(),
    suitability: { ...stubSuit, floweringFit: 99, fruitingFit: 99 },
    plant: { slug: 'foliage', tags: ['foliage'] }
  });
  assert.equal(o.flowering, SPECIFIC_OUTCOME_STATUS.UNKNOWN);
});

test('2. no fruiting requirements + no negative evidence → Fruiting UNKNOWN', () => {
  const o = deriveSpecificPlantOutcomes({
    meta: {
      frostSensitivity: 'low',
      humidityTolerance: 'medium',
      floweringRequirements: 'Full sun',
      fruitingRequirements: ''
    },
    climateProfile: humidTropical(),
    suitability: { ...stubSuit, floweringFit: 99, fruitingFit: 99 },
    plant: { slug: 'ornamental', tags: ['ornamental'] }
  });
  assert.equal(o.fruiting, SPECIFIC_OUTCOME_STATUS.UNKNOWN);
});

test('3. default numeric fit cannot produce Constrained/Supported', () => {
  const o = deriveSpecificPlantOutcomes({
    meta: {
      frostSensitivity: 'low',
      humidityTolerance: 'medium',
      floweringRequirements: 'Needs some seasonal cue not modeled here.',
      fruitingRequirements: 'Needs some seasonal cue not modeled here.'
    },
    climateProfile: humidTropical(),
    suitability: { ...stubSuit, floweringFit: 50, fruitingFit: 40 },
    plant: { slug: 'opaque-reqs', tags: [] }
  });
  assert.notEqual(o.flowering, SPECIFIC_OUTCOME_STATUS.CONSTRAINED);
  assert.notEqual(o.flowering, SPECIFIC_OUTCOME_STATUS.SUPPORTED);
  assert.notEqual(o.fruiting, SPECIFIC_OUTCOME_STATUS.CONSTRAINED);
  assert.notEqual(o.fruiting, SPECIFIC_OUTCOME_STATUS.SUPPORTED);
  assert.equal(o.flowering, SPECIFIC_OUTCOME_STATUS.UNKNOWN);
  assert.equal(o.fruiting, SPECIFIC_OUTCOME_STATUS.UNKNOWN);
});

test('4. explicit cold failure may produce Flowering Unlikely / Fruiting Unreliable', () => {
  const o = deriveSpecificPlantOutcomes({
    meta: {
      frostSensitivity: 'high',
      coldTolerance: 'low',
      humidityTolerance: 'high',
      groupIds: ['tropical-frost-sensitive-fruit'],
      floweringRequirements: 'Warm tropical flowering.',
      fruitingRequirements: 'Frost-free tropical fruiting.'
    },
    climateProfile: frostProne(),
    suitability: { ...stubSuit, survivalFit: 15, thriveFit: 15, floweringFit: 90, fruitingFit: 90 },
    plant: { slug: 'trop-fruit', tags: ['fruit'] }
  });
  assert.equal(o.survival, SPECIFIC_OUTCOME_STATUS.UNRELIABLE);
  assert.equal(o.flowering, SPECIFIC_OUTCOME_STATUS.UNLIKELY);
  assert.equal(o.fruiting, SPECIFIC_OUTCOME_STATUS.UNRELIABLE);
});

test('5. explicit chill deficit affects flowering/fruiting', () => {
  const o = deriveSpecificPlantOutcomes({
    meta: {
      frostSensitivity: 'medium',
      humidityTolerance: 'medium',
      needsWinterChill: true,
      groupIds: ['temperate-chill-fruit-tree'],
      floweringRequirements: 'Needs winter chill for bloom.',
      fruitingRequirements: 'Needs winter chill for fruit.'
    },
    climateProfile: humidTropical(),
    suitability: { ...stubSuit, floweringFit: 90, fruitingFit: 90 },
    plant: { slug: 'chill-fruit', tags: ['fruit'] }
  });
  assert.equal(o.flowering, SPECIFIC_OUTCOME_STATUS.UNLIKELY);
  assert.equal(o.fruiting, SPECIFIC_OUTCOME_STATUS.UNRELIABLE);
});

test('6. explicit moisture/humidity reproductive requirement affects result', () => {
  const o = deriveSpecificPlantOutcomes({
    meta: {
      frostSensitivity: 'high',
      coldTolerance: 'low',
      humidityTolerance: 'high',
      groupIds: ['tropical-frost-sensitive-fruit'],
      floweringRequirements:
        'Flowering only when temperatures are at or above 68°F (20°C). Drought stress causes flower drop.',
      fruitingRequirements:
        'Needs near year-round soil moisture; drought causes poor fruit production.'
    },
    climateProfile: hyperArid(),
    suitability: { ...stubSuit, floweringFit: 90, fruitingFit: 90 },
    plant: { slug: 'cacao-like', tags: ['fruit'] }
  });
  assert.equal(o.survival, SPECIFIC_OUTCOME_STATUS.UNRELIABLE);
  assert.equal(o.flowering, SPECIFIC_OUTCOME_STATUS.UNLIKELY);
  assert.equal(o.fruiting, SPECIFIC_OUTCOME_STATUS.UNRELIABLE);
});

test('7. positive flowering requires positive evidence (not fit alone)', () => {
  const o = deriveSpecificPlantOutcomes({
    meta: {
      frostSensitivity: 'low',
      floweringRequirements: '',
      fruitingRequirements: ''
    },
    climateProfile: humidTropical(),
    suitability: { ...stubSuit, floweringFit: 100 },
    plant: { slug: 'no-flower-meta', tags: [] }
  });
  assert.notEqual(o.flowering, SPECIFIC_OUTCOME_STATUS.SUPPORTED);
  assert.equal(o.flowering, SPECIFIC_OUTCOME_STATUS.UNKNOWN);
});

test('8. positive fruiting requires positive evidence (not fit alone)', () => {
  const o = deriveSpecificPlantOutcomes({
    meta: {
      frostSensitivity: 'low',
      floweringRequirements: 'Warm tropical flowering.',
      fruitingRequirements: ''
    },
    climateProfile: humidTropical(),
    suitability: { ...stubSuit, fruitingFit: 100 },
    plant: { slug: 'no-fruit-meta', tags: ['ornamental'] }
  });
  assert.notEqual(o.fruiting, SPECIFIC_OUTCOME_STATUS.SUPPORTED);
  assert.equal(o.fruiting, SPECIFIC_OUTCOME_STATUS.UNKNOWN);
});

test('9. Coconut Kochi/Singapore not driven by 50/40 defaults', () => {
  const raw = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  const plants = (raw.plants || []).map((p) => ({
    slug: p.slug,
    name: p.names?.en || p.slug,
    scientific: p.scientific,
    aliases: p.aliases || [],
    climateTraits: p.climateTraits,
    tags: p.tags || []
  }));
  const plant = findCatalogPlantBySlugOrName(plants, 'coconut');
  const t = plant.climateTraits;
  const meta = {
    frostSensitivity: t.frostSensitivity,
    heatTolerance: t.heatTolerance,
    coldTolerance: t.coldTolerance,
    humidityTolerance: t.humidityTolerance,
    waterNeeds: t.waterNeeds,
    groupIds: t.groupIds || [],
    needsReview: t.needsReview === true,
    survivalVsThriveNotes: t.survivalVsThriveNotes || '',
    floweringRequirements: t.floweringRequirements || '',
    fruitingRequirements: t.fruitingRequirements || ''
  };
  const o50 = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: humidTropical(),
    suitability: { ...stubSuit, floweringFit: 50, fruitingFit: 40 },
    plant
  });
  const o99 = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: humidTropical(),
    suitability: { ...stubSuit, floweringFit: 99, fruitingFit: 99 },
    plant
  });
  assert.equal(o50.flowering, o99.flowering);
  assert.equal(o50.fruiting, o99.fruiting);
  assert.equal(o50.flowering, SPECIFIC_OUTCOME_STATUS.SUPPORTED);
  assert.equal(o50.fruiting, SPECIFIC_OUTCOME_STATUS.SUPPORTED);
  assert.match(String(o50.reproductiveEvidence?.flowering || ''), /positive:/);
  assert.match(String(o50.reproductiveEvidence?.fruiting || ''), /positive:/);
});

test('10. Cacao produces evidence-backed reproductive outcomes from sourced metadata', () => {
  const raw = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  const plants = (raw.plants || []).map((p) => ({
    slug: p.slug,
    name: p.names?.en || p.slug,
    scientific: p.scientific,
    aliases: p.aliases || [],
    climateTraits: p.climateTraits,
    tags: p.tags || []
  }));
  const plant = findCatalogPlantBySlugOrName(plants, 'cacao');
  const t = plant.climateTraits;
  const meta = {
    frostSensitivity: t.frostSensitivity,
    heatTolerance: t.heatTolerance,
    coldTolerance: t.coldTolerance,
    humidityTolerance: t.humidityTolerance,
    waterNeeds: t.waterNeeds,
    groupIds: t.groupIds || [],
    needsReview: t.needsReview === true,
    survivalVsThriveNotes: t.survivalVsThriveNotes || '',
    floweringRequirements: t.floweringRequirements || '',
    fruitingRequirements: t.fruitingRequirements || ''
  };
  assert.ok(meta.floweringRequirements);
  assert.ok(meta.fruitingRequirements);
  assert.equal(parseMinTempCFromRequirements(meta.floweringRequirements), 20);

  const kochi = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: humidTropical(),
    suitability: stubSuit,
    plant
  });
  assert.equal(kochi.flowering, SPECIFIC_OUTCOME_STATUS.SUPPORTED);
  assert.equal(kochi.fruiting, SPECIFIC_OUTCOME_STATUS.SUPPORTED);
  assert.match(String(kochi.reproductiveEvidence?.flowering || ''), /20/);

  const cairo = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: hyperArid(),
    suitability: stubSuit,
    plant
  });
  assert.equal(cairo.flowering, SPECIFIC_OUTCOME_STATUS.UNLIKELY);
  assert.equal(cairo.fruiting, SPECIFIC_OUTCOME_STATUS.UNRELIABLE);
});

test('performance: warm evaluator P95 remains fast (no network)', () => {
  const env = humidTropical();
  const latency = measureSpecificPlantEvaluationLatency(() => {
    deriveSpecificPlantOutcomes({
      meta: {
        frostSensitivity: 'high',
        coldTolerance: 'low',
        humidityTolerance: 'high',
        groupIds: ['tropical-frost-sensitive-fruit'],
        floweringRequirements: 'Warm tropical; at or above 20°C.',
        fruitingRequirements: 'Frost-free tropical warmth and moisture.'
      },
      climateProfile: env,
      suitability: stubSuit,
      plant: { slug: 'perf', tags: ['fruit'] }
    });
  }, 300);
  assert.ok(latency.p95Ms < 500, `P95 ${latency.p95Ms}`);
  console.log('\n=== REPRODUCTIVE_EVIDENCE_PERF ===');
  console.log(JSON.stringify(latency));
});

test('helpers: parseMinTemp + evidence evaluators ignore fit scores', () => {
  assert.equal(parseMinTempCFromRequirements('at or above 68°F (20°C)'), 20);
  const flower = evaluateFloweringFromCatalogEvidence({
    meta: { floweringRequirements: '', frostSensitivity: 'low' },
    env: humidTropical(),
    survival: SPECIFIC_OUTCOME_STATUS.RELIABLE
  });
  assert.equal(flower.status, SPECIFIC_OUTCOME_STATUS.UNKNOWN);
  const fruit = evaluateFruitingFromCatalogEvidence({
    meta: { fruitingRequirements: '', frostSensitivity: 'low' },
    plant: { tags: [] },
    env: humidTropical(),
    survival: SPECIFIC_OUTCOME_STATUS.RELIABLE,
    flowering: SPECIFIC_OUTCOME_STATUS.UNKNOWN
  });
  assert.equal(fruit.status, SPECIFIC_OUTCOME_STATUS.UNKNOWN);
});
