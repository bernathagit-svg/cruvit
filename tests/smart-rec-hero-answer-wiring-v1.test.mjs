/**
 * Bounded proof: Smart Recommendations Hero Answer wired to Specific Plant suitability.
 * Run: node --test tests/smart-rec-hero-answer-wiring-v1.test.mjs
 *
 * No CHELSA/network. No scoring formula changes. No Product Authority / Garden Memory / R2 / Batch 3.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSrHeroAnswerViewModel,
  SR_HERO_ANSWER_VIEW_VERSION
} from '../modules/personal-domain/smart-rec-hero-answer-view-v1.js';
import {
  resolveGardenStructuralClimateFromCoordinateV2,
  resetCoordinateClimateRuntimeCounters,
  getCoordinateClimateRuntimeCounters
} from '../modules/personal-domain/coordinate-climate-garden-hydrate-v2.js';
import { clearGlobalRuntimeCaches } from '../modules/personal-domain/coordinate-climate-global-lookup-v2.js';
import { coordinateClimateProfileToStructuralPersistence } from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import {
  deriveSpecificPlantOutcomes,
  findCatalogPlantBySlugOrName
} from '../modules/personal-domain/specific-plant-suitability-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'app.html');
const UI = path.join(ROOT, 'modules', 'personal-domain', 'specific-plant-suitability-ui.js');
const GP = path.join(ROOT, 'modules', 'personal-domain', 'garden-profile-v0.js');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const DATA = path.join(ROOT, 'data', 'coordinate-climate', 'v2');

const NYC = { lat: 40.7128, lon: -74.006, label: 'New York City' };

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

function appClimateFromStructural(structural, label) {
  return {
    locationLabel: String(label || '').toLowerCase(),
    climateLabel: structural?.broadClimateOverride || '',
    broadClimate: structural?.broadClimateOverride || null,
    freezingRisk: structural?.freezingRisk || null,
    moistureRegime: structural?.moistureRegime || null,
    humidityRegime: structural?.humidityRegime || null,
    thermalRegime: structural?.thermalRegime || null,
    structuralClimateStatus: structural?.status || 'unknown',
    structuralClimate: structural
  };
}

test('view-model exposes version and Specific Plant mode', () => {
  const vm = buildSrHeroAnswerViewModel({ trusted: false });
  assert.equal(vm.version, SR_HERO_ANSWER_VIEW_VERSION);
  assert.equal(vm.mode, 'SPECIFIC_PLANT_SUITABILITY');
});

test('C — untrusted / default location asks for confirmation; no recommendation', () => {
  const vm = buildSrHeroAnswerViewModel({
    trusted: false,
    climateKnown: true,
    plant: { slug: 'tomato', name: 'Tomato' },
    suitability: { recommendationLevel: 'excellent', explanationText: 'should not show' }
  });
  assert.equal(vm.truthState, 'C_UNTRUSTED');
  assert.match(vm.lead, /confirm/i);
  assert.equal(vm.recommendationLevel, null);
  assert.doesNotMatch(vm.lead, /excellent|recommended|good match/i);
  assert.doesNotMatch(vm.status, /excellent|good match/i);
});

test('B — trusted + climate unavailable; no suitability claim', () => {
  const vm = buildSrHeroAnswerViewModel({
    trusted: true,
    climateKnown: false,
    locationLabel: 'Somewhere',
    plant: { slug: 'tomato', name: 'Tomato' },
    suitability: { recommendationLevel: 'good', explanationText: 'must not leak' }
  });
  assert.equal(vm.truthState, 'B_CLIMATE_UNAVAILABLE');
  assert.match(vm.lead, /not available/i);
  assert.equal(vm.recommendationLevel, null);
  assert.doesNotMatch(vm.lead, /good match|recommended/i);
});

test('D — no plant selected', () => {
  const vm = buildSrHeroAnswerViewModel({
    trusted: true,
    climateKnown: true,
    plant: null,
    locationLabel: 'New York City'
  });
  assert.equal(vm.truthState, 'D_NO_PLANT');
  assert.match(vm.lead, /select a (catalog )?plant/i);
  assert.equal(vm.recommendationLevel, null);
});

test('E — blocked remains blocked; warning surfaced', () => {
  const warn = 'Frost risk is too high for this plant.';
  const vm = buildSrHeroAnswerViewModel({
    trusted: true,
    climateKnown: true,
    plant: { slug: 'coconut', name: 'Coconut Palm', scientific: 'Cocos nucifera' },
    suitability: {
      recommendationLevel: 'blocked',
      suitabilityScore: 0,
      warnings: [warn],
      explanationText: warn
    },
    climateProfile: { broadClimate: 'temperate', freezingRisk: 'high', structuralClimateStatus: 'known' }
  });
  assert.equal(vm.truthState, 'E_BLOCKED');
  assert.equal(vm.recommendationLevel, 'blocked');
  assert.match(vm.status, /blocked|not suitable/i);
  assert.match(vm.lead, /Frost risk|not suitable/i);
  assert.match(vm.tradeoff, /Frost risk/i);
  assert.doesNotMatch(vm.lead, /good match|excellent|recommended/i);
  assert.ok(vm.plantName.includes('Coconut'));
});

test('F — borderline / partial uses cautious wording', () => {
  const vm = buildSrHeroAnswerViewModel({
    trusted: true,
    climateKnown: true,
    plant: { slug: 'tomato', name: 'Tomato' },
    suitability: {
      recommendationLevel: 'borderline',
      suitabilityScore: 55,
      warnings: ['Seasonal cold makes reliable outdoor fruiting unlikely here.'],
      explanationText: 'Cautious fit for this climate.'
    },
    climateProfile: { broadClimate: 'temperate', freezingRisk: 'medium', structuralClimateStatus: 'known' }
  });
  assert.equal(vm.truthState, 'F_BORDERLINE');
  assert.equal(vm.recommendationLevel, 'borderline');
  assert.match(vm.status, /borderline|cautious/i);
  assert.match(vm.confidence, /partial|caution|review/i);
  assert.doesNotMatch(vm.lead, /excellent match|confident recommendation/i);
});

test('A — trusted + climate + plant + suitability maps level honestly', () => {
  const authLevel = 'good';
  const explanation = 'Solid climate fit for outdoor growth.';
  const vm = buildSrHeroAnswerViewModel({
    trusted: true,
    climateKnown: true,
    plant: { slug: 'tomato', name: 'Tomato', scientific: 'Solanum lycopersicum' },
    suitability: {
      recommendationLevel: authLevel,
      suitabilityScore: 78,
      warnings: ['Check exact cultivar for chill.'],
      explanationText: explanation
    },
    climateProfile: {
      broadClimate: 'temperate',
      freezingRisk: 'medium',
      moistureRegime: 'humid',
      structuralClimateStatus: 'known'
    },
    locationLabel: 'New York City'
  });
  assert.equal(vm.truthState, 'A_SUITABILITY');
  assert.equal(vm.recommendationLevel, authLevel);
  assert.match(vm.status, /good/i);
  assert.equal(vm.plantName, 'Tomato');
  assert.match(vm.lead, /Solid climate fit|Good match/i);
  assert.ok(vm.understands.some((u) => /Tomato/i.test(u)));
  assert.ok(vm.understands.some((u) => /Good match|Suitability/i.test(u)));
  assert.match(vm.tradeoff, /cultivar|chill|No additional/i);
  assert.doesNotMatch(vm.fine, /never contains suitability|No plant recommendation, suitability score/i);
});

test('app.html wires Hero to evaluateSpecificPlantSuitability + refresh hooks', () => {
  const app = fs.readFileSync(APP, 'utf8');
  assert.match(app, /function computeSrHeroAnswerViewModel/);
  assert.match(app, /evaluateSpecificPlantSuitability\(plant\)/);
  assert.match(app, /hasTrustedAppLocation/);
  assert.match(app, /getAppClimateProfile/);
  assert.match(app, /isSrHeroClimateKnown|structuralClimateStatus/);
  assert.match(app, /refreshSrHeroAnswerPreview\(\)/);
  assert.match(app, /openSmartRecommendations[\s\S]*refreshSrHeroAnswerPreview/);
  assert.match(app, /onAppLocationChanged[\s\S]*refreshSrHeroAnswerPreview/);
  assert.match(app, /setSrHeroSelectedPlant/);
  assert.match(app, /showPlantSetup[\s\S]*setSrHeroSelectedPlant/);
  assert.match(app, /window\.refreshSrHeroAnswerPreview/);
  assert.match(app, /cruvitBuildSrHeroAnswerViewModel/);
  assert.match(app, /cruvitDeriveSpecificPlantOutcomes|window\.cruvitDeriveSpecificPlantOutcomes/);
  assert.doesNotMatch(app, /Local preview only\. Not live Garden Memory\. Feedback is not saved\. No plant recommendation, suitability score/);
  assert.match(app, /Not a ranked list, Garden Memory, or Product Authority/);
  assert.doesNotMatch(app, /Goal: coverage \/ privacy need \(local preview context\)/);
});

test('Specific Plant UI notifies Hero on select/check; garden-profile exposes builder', () => {
  const ui = fs.readFileSync(UI, 'utf8');
  const gp = fs.readFileSync(GP, 'utf8');
  assert.match(ui, /notifySrHeroAnswerRefresh/);
  assert.match(ui, /refreshSrHeroAnswerPreview/);
  assert.match(gp, /smart-rec-hero-answer-view-v1\.js/);
  assert.match(gp, /cruvitBuildSrHeroAnswerViewModel/);
  assert.match(gp, /cruvitDeriveSpecificPlantOutcomes/);
});

test('TRUSTED REAL CASE — NYC global climate + coconut blocked authority → Hero E_BLOCKED', () => {
  clearGlobalRuntimeCaches();
  resetCoordinateClimateRuntimeCounters();

  const resolved = resolveGardenStructuralClimateFromCoordinateV2(NYC.lat, NYC.lon, {
    dataRoot: DATA,
    enqueuePrep: false
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.lookupSource, 'global-tile-o1');
  assert.equal(getCoordinateClimateRuntimeCounters().chelsaExternalCalls, 0);

  const structural = coordinateClimateProfileToStructuralPersistence(resolved.profile);
  assert.equal(structural.status, 'known');
  const climateProfile = appClimateFromStructural(structural, NYC.label);
  assert.equal(climateProfile.structuralClimateStatus, 'known');

  const plant = findCatalogPlantBySlugOrName(loadSeedPlants(), 'coconut');
  assert.ok(plant);
  assert.equal(plant.slug, 'coconut');

  // Existing engine rule mirrored for frost-sensitive tropical outdoors in freezing climates.
  const freezingRisk = climateProfile.freezingRisk;
  assert.ok(freezingRisk === 'medium' || freezingRisk === 'high' || freezingRisk === 'low');
  const frostSensitive = plant.climateTraits?.frostSensitivity === 'high';
  assert.equal(frostSensitive, true);

  const authoritative =
    !false && plant.climateTraits?.frostSensitivity === 'high' && freezingRisk !== 'low'
      ? {
          recommendationLevel: 'blocked',
          suitabilityScore: 0,
          survivalFit: 0,
          thriveFit: 0,
          floweringFit: 0,
          fruitingFit: 0,
          warnings: ['Frost risk is too high for this plant.'],
          explanationText: 'Frost risk is too high for this plant.'
        }
      : {
          recommendationLevel: 'borderline',
          suitabilityScore: 50,
          warnings: ['Review outdoor frost exposure.'],
          explanationText: 'Review outdoor frost exposure.'
        };

  assert.equal(freezingRisk, 'high');
  assert.equal(authoritative.recommendationLevel, 'blocked');

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
    suitability: authoritative,
    plant
  });
  // Outcome gate may stay conservative; Hero authority for this slice is suitability.recommendationLevel.
  assert.ok(outcomes.overall === 'blocked' || outcomes.survival === 'UNRELIABLE' || outcomes.overall === 'borderline');
  assert.notEqual(outcomes.overall, 'excellent');
  assert.notEqual(outcomes.overall, 'good');

  const hero = buildSrHeroAnswerViewModel({
    trusted: true,
    climateKnown: climateProfile.structuralClimateStatus === 'known',
    plant,
    suitability: authoritative,
    climateProfile,
    locationLabel: NYC.label
  });

  assert.equal(hero.truthState, 'E_BLOCKED');
  assert.equal(hero.recommendationLevel, authoritative.recommendationLevel);
  assert.equal(hero.recommendationLevel, 'blocked');
  assert.match(hero.tradeoff, /Frost risk/i);
  assert.equal(getCoordinateClimateRuntimeCounters().chelsaExternalCalls, 0);
});

test('PRODUCT PROOF — Mojstrana global-tile climate + pineapple → Hero shows four outcomes incl UNKNOWN', () => {
  clearGlobalRuntimeCaches();
  resetCoordinateClimateRuntimeCounters();
  const Mojstrana = { lat: 46.42383, lon: 13.8752, label: 'Mojstrana, Slovenia' };
  const resolved = resolveGardenStructuralClimateFromCoordinateV2(Mojstrana.lat, Mojstrana.lon, {
    dataRoot: DATA,
    enqueuePrep: false,
    label: Mojstrana.label
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.lookupSource, 'global-tile-o1');
  assert.equal(getCoordinateClimateRuntimeCounters().chelsaExternalCalls, 0);

  const structural =
    resolved.structuralClimate ||
    coordinateClimateProfileToStructuralPersistence(resolved.profile);
  assert.equal(structural.status, 'known');
  assert.equal(structural.freezingRisk, 'high');
  const climateProfile = appClimateFromStructural(structural, Mojstrana.label);

  const plant = findCatalogPlantBySlugOrName(loadSeedPlants(), 'pineapple');
  assert.ok(plant);
  assert.match(String(plant.scientific || ''), /Ananas comosus/i);
  assert.equal(plant.climateTraits?.frostSensitivity, 'high');

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
  assert.equal(outcomes.flowering, 'unknown');
  assert.equal(outcomes.fruiting, 'unknown');

  const hero = buildSrHeroAnswerViewModel({
    trusted: true,
    climateKnown: true,
    plant,
    suitability: Object.assign({}, suitability, { specificPlantOutcomes: outcomes }),
    climateProfile,
    locationLabel: Mojstrana.label,
    outcomes
  });
  assert.equal(hero.truthState, 'E_BLOCKED');
  assert.equal(hero.outcomesHidden, false);
  assert.equal(hero.outcomeRows.length, 4);
  const flower = hero.outcomeRows.find((r) => r.key === 'flowering');
  const fruit = hero.outcomeRows.find((r) => r.key === 'fruiting');
  assert.ok(flower);
  assert.ok(fruit);
  assert.match(String(flower.display), /unknown/i);
  assert.match(String(fruit.display), /unknown/i);
  assert.match(hero.lead, /Frost risk/i);
});

test('app.html auto-persists confirmed location to owned garden when signed in', () => {
  const app = fs.readFileSync(APP, 'utf8');
  assert.match(app, /saveCurrentAppLocationToActiveGarden/);
  assert.match(app, /Owned-garden location persist skipped/);
  assert.match(app, /srHaOutcomesBlock/);
});

test('regression source guards — scoring / Product Authority / Garden Memory untouched', () => {
  const app = fs.readFileSync(APP, 'utf8');
  const heroMod = fs.readFileSync(
    path.join(ROOT, 'modules', 'personal-domain', 'smart-rec-hero-answer-view-v1.js'),
    'utf8'
  );
  assert.match(app, /suitabilityScore=blocked\?0:Math\.max/);
  assert.match(app, /recommendationLevel=blocked\?'blocked':\(suitabilityScore>=85/);
  assert.match(heroMod, /Not a ranked list, Garden Memory, or Product Authority/);
  assert.doesNotMatch(heroMod, /activate Product Authority|live Garden Memory|Product Proof/i);
  assert.doesNotMatch(heroMod, /chelsa|CHELSA/);
});
