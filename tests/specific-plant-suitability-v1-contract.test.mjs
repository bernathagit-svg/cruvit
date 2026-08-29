/**
 * Specific Plant Outcome Quality Gate — acceptance proofs.
 * Live UI still calls smartRecEvaluateSuitability; overall uses deriveSpecificPlantOutcomes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SPECIFIC_OUTCOME_STATUS,
  buildSpecificPlantSuitabilityViewModel,
  compareSpecificPlantAcrossHydratedGardens,
  deriveOverallVerdict,
  deriveSpecificPlantOutcomes,
  findCatalogPlantBySlugOrName,
  hasFloweringEvidence,
  hasFruitingEvidence,
  insufficientClimateMetaSuitabilityResult,
  isFrostFreeGrowingClimate,
  reportCacaoCatalogStatus,
  reportCoconutCatalogStatus,
  runSpecificPlantSuitabilityEvaluation,
  searchCatalogPlantsForSpecificCheck,
  yehiamLocationAliasSupportedInSource
} from '../modules/personal-domain/specific-plant-suitability-contract.js';
import {
  buildServerLocationPayload,
  serverLocationToAppPartial
} from '../modules/personal-domain/garden-profile-location-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const APP = path.join(ROOT, 'app.html');
const CONTRACT = path.join(
  ROOT,
  'modules',
  'personal-domain',
  'specific-plant-suitability-contract.js'
);
const UI_MOD = path.join(
  ROOT,
  'modules',
  'personal-domain',
  'specific-plant-suitability-ui.js'
);

function loadSeedPlants() {
  const text = fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, '');
  const raw = JSON.parse(text);
  return (raw.plants || []).map((p) => ({
    slug: p.slug,
    name: p.names?.en || p.name || p.slug,
    scientific: p.scientific,
    aliases: p.aliases || [],
    climateTraits: p.climateTraits || null,
    tags: p.tags || []
  }));
}

function coconutPlantAndMeta() {
  const plant = findCatalogPlantBySlugOrName(loadSeedPlants(), 'coconut');
  assert.ok(plant);
  const t = plant.climateTraits;
  const meta = {
    frostSensitivity: t.frostSensitivity,
    heatTolerance: t.heatTolerance,
    coldTolerance: t.coldTolerance,
    groupIds: t.groupIds || [],
    needsReview: t.needsReview === true,
    survivalVsThriveNotes: t.survivalVsThriveNotes || '',
    floweringRequirements: t.floweringRequirements || '',
    fruitingRequirements: t.fruitingRequirements || ''
  };
  return { plant, meta };
}

function climateYehiam() {
  return {
    locationLabel: 'Yehiam, Israel',
    climateLabel: 'Mediterranean',
    broadClimate: 'mediterranean',
    freezingRisk: 'low',
    isFrostFreeGrowingClimate: false
  };
}

function climateLondon() {
  return {
    locationLabel: 'London, United Kingdom',
    climateLabel: 'Cool temperate',
    broadClimate: 'cool-temperate',
    freezingRisk: 'high',
    isFrostFreeGrowingClimate: false
  };
}

function climateTropicalFrostFree() {
  return {
    locationLabel: 'Singapore',
    climateLabel: 'Tropical',
    broadClimate: 'tropical',
    freezingRisk: 'low',
    isFrostFreeGrowingClimate: true
  };
}

test('1. high frost-sensitive tropical + non-frost-free Garden is NOT overall Borderline', () => {
  const { plant, meta } = coconutPlantAndMeta();
  assert.equal(isFrostFreeGrowingClimate(climateYehiam()), false);
  assert.equal(meta.frostSensitivity, 'high');
  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: climateYehiam(),
    suitability: {
      recommendationLevel: 'borderline',
      survivalFit: 70,
      thriveFit: 55,
      floweringFit: 50,
      fruitingFit: 40,
      warnings: [
        'Needs a frost-free climate; outdoor reliability is limited where winters are cool or frost-prone.'
      ],
      explanationText:
        'Needs a frost-free climate; outdoor reliability is limited where winters are cool or frost-prone.'
    },
    plant,
    protectedGrowing: false
  });
  assert.equal(outcomes.survival, SPECIFIC_OUTCOME_STATUS.UNRELIABLE);
  assert.equal(outcomes.overall, 'blocked');
  assert.equal(outcomes.overallLabel, 'Not recommended');
  assert.notEqual(outcomes.overall, 'borderline');
});

test('2. reliable survival failure always forces NOT RECOMMENDED', () => {
  const overall = deriveOverallVerdict({
    survival: SPECIFIC_OUTCOME_STATUS.UNRELIABLE,
    growth: SPECIFIC_OUTCOME_STATUS.CONSTRAINED,
    flowering: SPECIFIC_OUTCOME_STATUS.UNKNOWN,
    fruiting: SPECIFIC_OUTCOME_STATUS.UNKNOWN,
    suitability: { recommendationLevel: 'borderline' }
  });
  assert.equal(overall, 'blocked');
});

test('3. survival can be YES while fruiting is UNRELIABLE', () => {
  const plant = {
    slug: 'warm-fruit-demo',
    name: 'Warm Fruit Demo',
    tags: ['fruit']
  };
  const meta = {
    frostSensitivity: 'low',
    groupIds: ['tropical-frost-sensitive-fruit'],
    fruitingRequirements: 'Frost-free warmth for reliable fruiting',
    floweringRequirements: ''
  };
  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: climateYehiam(),
    suitability: {
      recommendationLevel: 'good',
      survivalFit: 85,
      thriveFit: 75,
      floweringFit: 70,
      fruitingFit: 25,
      warnings: [],
      explanationText: ''
    },
    plant,
    protectedGrowing: false
  });
  assert.equal(outcomes.survival, SPECIFIC_OUTCOME_STATUS.RELIABLE);
  assert.equal(outcomes.fruiting, SPECIFIC_OUTCOME_STATUS.UNRELIABLE);
  assert.notEqual(outcomes.overall, 'blocked');
  assert.ok(
    outcomes.limitingFactors.some((w) => /fruit production is not expected/i.test(w))
  );
});

test('4. growth viable while flowering remains UNKNOWN', () => {
  const plant = { slug: 'foliage-demo', name: 'Foliage Demo', tags: ['foliage'] };
  const meta = {
    frostSensitivity: 'low',
    groupIds: ['tropical-shade-houseplant'],
    floweringRequirements: '',
    fruitingRequirements: ''
  };
  assert.equal(hasFloweringEvidence(meta, plant), false);
  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: climateTropicalFrostFree(),
    suitability: {
      recommendationLevel: 'good',
      survivalFit: 90,
      thriveFit: 85,
      floweringFit: 80,
      fruitingFit: 50,
      warnings: [],
      explanationText: ''
    },
    plant,
    protectedGrowing: false
  });
  assert.equal(outcomes.growth, SPECIFIC_OUTCOME_STATUS.SUPPORTED);
  assert.equal(outcomes.flowering, SPECIFIC_OUTCOME_STATUS.UNKNOWN);
});

test('5. fruiting cannot be inferred when metadata is absent', () => {
  const plant = { slug: 'ornamental-demo', name: 'Ornamental Demo', tags: ['ornamental'] };
  const meta = {
    frostSensitivity: 'low',
    groupIds: ['frost-sensitive-ornamental'],
    floweringRequirements: 'Full sun',
    fruitingRequirements: ''
  };
  assert.equal(hasFruitingEvidence(meta, plant), false);
  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: climateTropicalFrostFree(),
    suitability: {
      recommendationLevel: 'good',
      survivalFit: 88,
      thriveFit: 80,
      floweringFit: 75,
      fruitingFit: 90,
      warnings: [],
      explanationText: ''
    },
    plant,
    protectedGrowing: false
  });
  assert.equal(outcomes.fruiting, SPECIFIC_OUTCOME_STATUS.UNKNOWN);
  assert.notEqual(outcomes.fruiting, SPECIFIC_OUTCOME_STATUS.SUPPORTED);
});

test('6. colder Garden is equal or worse survival for frost-sensitive tropical', () => {
  const { plant, meta } = coconutPlantAndMeta();
  const yehiam = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: climateYehiam(),
    suitability: {
      recommendationLevel: 'borderline',
      survivalFit: 70,
      thriveFit: 55,
      floweringFit: 50,
      fruitingFit: 40,
      warnings: [],
      explanationText: ''
    },
    plant
  });
  const london = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: climateLondon(),
    suitability: {
      recommendationLevel: 'blocked',
      survivalFit: 15,
      thriveFit: 10,
      floweringFit: 10,
      fruitingFit: 5,
      warnings: ['Frost risk is too high for this plant.'],
      explanationText: 'Frost risk is too high for this plant.'
    },
    plant
  });
  assert.equal(yehiam.survival, SPECIFIC_OUTCOME_STATUS.UNRELIABLE);
  assert.equal(london.survival, SPECIFIC_OUTCOME_STATUS.UNRELIABLE);
  assert.equal(yehiam.overall, 'blocked');
  assert.equal(london.overall, 'blocked');
  // London has explicit high freezingRisk factor; Yehiam fails frost-free requirement.
  assert.ok(london.limitingFactors.some((w) => /Frost risk is too high/i.test(w)));
  assert.ok(yehiam.limitingFactors.some((w) => /frost-free/i.test(w)));
});

test('7. Garden switch recomputes all four outcomes (hydrate comparator)', () => {
  const { plant, meta } = coconutPlantAndMeta();
  const yehiamPayload = buildServerLocationPayload({
    label: 'Yehiam, Israel',
    climate: 'Mediterranean',
    lat: 32.9967,
    lon: 35.2205,
    country: 'Israel',
    source: 'manual',
    confirmedAt: '2026-08-29T12:00:00.000Z'
  });
  const londonPayload = buildServerLocationPayload({
    label: 'London, United Kingdom',
    climate: 'Cool temperate',
    lat: 51.5074,
    lon: -0.1278,
    country: 'United Kingdom',
    source: 'manual',
    confirmedAt: '2026-08-29T12:00:00.000Z'
  });
  const comparison = compareSpecificPlantAcrossHydratedGardens(
    meta,
    { id: 'g-yehiam', name: 'Yehiam', ...yehiamPayload },
    { id: 'g-london', name: 'London', ...londonPayload },
    serverLocationToAppPartial,
    plant
  );
  assert.equal(comparison.gardenA.outcomes.survival, SPECIFIC_OUTCOME_STATUS.UNRELIABLE);
  assert.equal(comparison.gardenB.outcomes.survival, SPECIFIC_OUTCOME_STATUS.UNRELIABLE);
  assert.equal(comparison.gardenA.outcomes.overall, 'blocked');
  assert.equal(comparison.gardenB.outcomes.overall, 'blocked');
  assert.ok(comparison.gardenA.outcomes.growth);
  assert.ok(comparison.gardenA.outcomes.flowering);
  assert.ok(comparison.gardenA.outcomes.fruiting);
  assert.notEqual(
    comparison.gardenA.climate.freezingRisk,
    comparison.gardenB.climate.freezingRisk
  );
});

test('8. Smart Rec browse path unchanged; specific check clears prefs', () => {
  const app = fs.readFileSync(APP, 'utf8');
  assert.match(app, /function getSmartRecBrowsePlants/);
  assert.match(app, /smartRecSession\.compiledFilters/);
  assert.match(app, /function evaluateSpecificPlantSuitability/);
  assert.match(app, /smartRecSession\.answers=\{\}/);
  const session = { answers: { q7: 'drought', q5: 'yes-edible' } };
  runSpecificPlantSuitabilityEvaluation(
    () => ({ recommendationLevel: 'good' }),
    { slug: 'x' },
    session
  );
  assert.equal(session.answers.q7, 'drought');
});

test('9. UNKNOWN remains conservative for missing climate meta', () => {
  const suitability = insufficientClimateMetaSuitabilityResult();
  const outcomes = deriveSpecificPlantOutcomes({
    meta: null,
    climateProfile: climateYehiam(),
    suitability,
    plant: { slug: 'mystery', name: 'Mystery' }
  });
  assert.equal(outcomes.survival, SPECIFIC_OUTCOME_STATUS.UNKNOWN);
  assert.equal(outcomes.overall, 'borderline');
  assert.notEqual(outcomes.overall, 'excellent');
  assert.notEqual(outcomes.overall, 'good');
});

test('10. no plant-specific hardcoded exceptions in outcome module', () => {
  const src = fs.readFileSync(CONTRACT, 'utf8');
  assert.doesNotMatch(src, /if\s*\(\s*(plant|p|slug).*coconut/i);
  assert.doesNotMatch(src, /slug\s*===\s*['"]coconut['"]/);
  assert.doesNotMatch(src, /slug\s*===\s*['"]mango['"]/);
  assert.match(src, /deriveSpecificPlantOutcomes/);
  assert.match(src, /isFrostFreeGrowingClimate/);
});

test('Coconut / Yehiam four-outcome result (quality gate)', () => {
  const { plant, meta } = coconutPlantAndMeta();
  const report = reportCoconutCatalogStatus(loadSeedPlants());
  assert.equal(report.present, true);
  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: climateYehiam(),
    suitability: {
      recommendationLevel: 'borderline',
      survivalFit: 70,
      thriveFit: 55,
      floweringFit: 50,
      fruitingFit: 40,
      warnings: [],
      explanationText: ''
    },
    plant
  });
  assert.equal(outcomes.survival, SPECIFIC_OUTCOME_STATUS.UNRELIABLE);
  assert.equal(outcomes.growth, SPECIFIC_OUTCOME_STATUS.POOR);
  // Calibrated coconut has sourced floweringRequirements; Yehiam remains non-viable overall
  assert.ok(
    outcomes.flowering === SPECIFIC_OUTCOME_STATUS.CONSTRAINED ||
      outcomes.flowering === SPECIFIC_OUTCOME_STATUS.UNLIKELY ||
      outcomes.flowering === SPECIFIC_OUTCOME_STATUS.UNKNOWN
  );
  assert.equal(outcomes.fruiting, SPECIFIC_OUTCOME_STATUS.UNRELIABLE);
  assert.equal(outcomes.overall, 'blocked');
  assert.equal(outcomes.overallLabel, 'Not recommended');
});

test('Coconut / London four-outcome result (quality gate)', () => {
  const { plant, meta } = coconutPlantAndMeta();
  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: climateLondon(),
    suitability: {
      recommendationLevel: 'blocked',
      survivalFit: 10,
      thriveFit: 10,
      floweringFit: 10,
      fruitingFit: 5,
      warnings: ['Frost risk is too high for this plant.'],
      explanationText: 'Frost risk is too high for this plant.'
    },
    plant
  });
  assert.equal(outcomes.survival, SPECIFIC_OUTCOME_STATUS.UNRELIABLE);
  assert.equal(outcomes.overall, 'blocked');
  assert.ok(outcomes.limitingFactors.some((w) => /Frost risk is too high/i.test(w)));
});

test('Cacao is present after Catalog Expansion V1 ingest; Coconut still searchable', () => {
  const plants = loadSeedPlants();
  const cacao = reportCacaoCatalogStatus(plants);
  assert.equal(cacao.present, true);
  assert.equal(cacao.identity?.slug, 'cacao');
  assert.equal(cacao.canJudgeResponsibly, true);
  assert.equal(searchCatalogPlantsForSpecificCheck(plants, 'Cocos nucifera')[0]?.slug, 'coconut');
  assert.equal(searchCatalogPlantsForSpecificCheck(plants, 'Theobroma cacao')[0]?.slug, 'cacao');
});

test('view model surfaces four outcomes with prominent overall', () => {
  const { plant, meta } = coconutPlantAndMeta();
  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: climateYehiam(),
    suitability: {
      recommendationLevel: 'borderline',
      survivalFit: 70,
      thriveFit: 55,
      floweringFit: 50,
      fruitingFit: 40,
      warnings: [],
      explanationText: ''
    },
    plant
  });
  const vm = buildSpecificPlantSuitabilityViewModel({
    plant,
    gardenName: 'Yehiam Plot',
    locationLabel: 'Yehiam, Israel',
    climateLabel: 'Mediterranean',
    suitability: { recommendationLevel: 'borderline', warnings: [] },
    outcomes
  });
  assert.equal(vm.levelLabel, 'Not recommended');
  assert.equal(vm.survivalLabel, 'Unreliable');
  assert.ok(vm.floweringLabel === 'Constrained' || vm.floweringLabel === 'Unlikely' || vm.floweringLabel === 'UNKNOWN');
});

test('UI + wiring expose four-outcome block; Yehiam alias supported', () => {
  const app = fs.readFileSync(APP, 'utf8');
  const ui = fs.readFileSync(UI_MOD, 'utf8');
  assert.match(ui, /Overall:/);
  assert.match(ui, /Survival/);
  assert.match(ui, /Growth/);
  assert.match(ui, /Flowering/);
  assert.match(ui, /Fruiting/);
  assert.match(ui, /deriveSpecificPlantOutcomes/);
  assert.match(app, /getClimateMetaForPlant:smartRecClimateMetaForPlant/);
  assert.equal(yehiamLocationAliasSupportedInSource(app), true);
});

test('protected growing may keep high-frost plant from outdoor survival fail', () => {
  const { plant, meta } = coconutPlantAndMeta();
  const outdoor = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: climateYehiam(),
    suitability: {
      recommendationLevel: 'borderline',
      survivalFit: 70,
      thriveFit: 55,
      floweringFit: 50,
      fruitingFit: 40,
      warnings: [],
      explanationText: ''
    },
    plant,
    protectedGrowing: false
  });
  const sheltered = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: climateYehiam(),
    suitability: {
      recommendationLevel: 'good',
      survivalFit: 80,
      thriveFit: 70,
      floweringFit: 60,
      fruitingFit: 50,
      warnings: [],
      explanationText: ''
    },
    plant,
    protectedGrowing: true
  });
  assert.equal(outdoor.overall, 'blocked');
  assert.notEqual(sheltered.survival, SPECIFIC_OUTCOME_STATUS.UNRELIABLE);
});
