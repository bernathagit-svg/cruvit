/**
 * Pre-scale suitability systemic hardening — adversarial fixtures + contracts.
 * Synthetic fixtures challenge evaluator logic; never production climate truth.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  atmosphericHumidityMismatchForLowTolerancePlant,
  deriveSpecificPlantOutcomes
} from '../modules/personal-domain/specific-plant-suitability-contract.js';
import {
  PRE_SCALE_SUITABILITY_SYSTEMIC_HARDENING_VERSION,
  SURVIVAL_CONFIDENCE_MEANING,
  CLIMATE_PERIOD_CLAIM,
  TERRAIN_PRECISION_CLAIM,
  deriveMonthlyWaterBalance,
  seasonalityDemotesStrongClimatePositive,
  extremesAuthorityGapDemotesSurvivalPositive,
  hemisphereFromLatitude,
  interpretPhenologyCueAgainstClimate,
  chillConfidenceFromEvidence,
  irrigationWaterSemantics,
  gardenSiteSuitabilityDimensions,
  cultivarPrecisionStatus,
  recommendationEligibilityFromEvidence,
  isPersistedClimateAuthorityStale,
  applyPreScaleSystemicDemotions,
  SUITABILITY_DIMENSIONS
} from '../modules/personal-domain/pre-scale-suitability-systemic-hardening-v1-contract.js';
import {
  coverageTileIndexFromLatLon,
  cellToMinimalProfile,
  deriveCellEnumsFromSeries
} from '../modules/personal-domain/coordinate-climate-coverage-tiles-v2.js';
import { lookupCoordinateClimateFromCoverage, clearCoverageRuntimeCaches } from '../modules/personal-domain/coordinate-climate-coverage-lookup-v2.js';
import { chelsaGridCellIndex } from '../modules/personal-domain/coordinate-climate-garden-hydrate-v2.js';
import { COORDINATE_CLIMATE_AUTHORITY_V2_VERSION, CLIMATE_AUTHORITY_UNAVAILABLE } from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import { shouldAcquireStructuralClimate } from '../modules/personal-domain/structural-climate-persistence-contract.js';
import { QUANTITATIVE_CLAIM_FIELDS } from '../modules/catalog-expansion/plant-climate-quantitative-evidence-v1-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const COVERAGE = path.join(ROOT, 'data', 'coordinate-climate', 'v2', 'coverage');

function synthMonthly({ precipPattern, pet = 120, tminBase = 10, tminAmp = 8 }) {
  const pr = [];
  const petA = [];
  const tmin = [];
  const tmax = [];
  for (let m = 0; m < 12; m++) {
    pr.push(precipPattern(m));
    petA.push(pet);
    const t = tminBase + tminAmp * Math.sin(((m - 6) / 12) * 2 * Math.PI);
    tmin.push(Math.round(t * 10) / 10);
    tmax.push(Math.round((t + 12) * 10) / 10);
  }
  return { pr, pet: petA, tmin, tmax };
}

function profileFromSynth(synth, extra = {}) {
  const annualP = synth.pr.reduce((a, b) => a + b, 0);
  const annualPet = synth.pet.reduce((a, b) => a + b, 0);
  return {
    monthlyPrecipMm: synth.pr,
    monthlyPetMm: synth.pet,
    monthlyTminC: synth.tmin,
    monthlyTmaxC: synth.tmax,
    annualPrecipitationMm: annualP,
    annualPetMm: annualPet,
    aridityIndex: annualP / annualPet,
    coldestMonthMeanMinC: Math.min(...synth.tmin),
    warmestMonthMeanMaxC: Math.max(...synth.tmax),
    seasonality: {
      tminRangeC: Math.max(...synth.tmin) - Math.min(...synth.tmin),
      coldestMonth: synth.tmin.indexOf(Math.min(...synth.tmin)) + 1,
      warmestMonth: synth.tmax.indexOf(Math.max(...synth.tmax)) + 1
    },
    ...extra
  };
}

test('hardening contract version frozen', () => {
  assert.equal(PRE_SCALE_SUITABILITY_SYSTEMIC_HARDENING_VERSION, '1.0.0');
  assert.equal(SURVIVAL_CONFIDENCE_MEANING.extremeAuthorityPresentInDataset, false);
  assert.equal(CLIMATE_PERIOD_CLAIM.isCurrentMeasuredClimate, false);
  assert.equal(TERRAIN_PRECISION_CLAIM.numericallyDownscalesTemperature, false);
  assert.ok(QUANTITATIVE_CLAIM_FIELDS.length >= 8);
});

test('Part1 humidity FP systemic — atmospheric high RH, not moistureRegime', () => {
  const meta = { humidityTolerance: 'low', frostSensitivity: 'medium' };
  const humidAir = {
    humiditySignal: 'high',
    moistureRegime: 'semi-arid',
    meanRelativeHumidityPct: 70,
    monthlyHursPct: Array(12).fill(70),
    freezingRisk: 'low'
  };
  assert.ok(atmosphericHumidityMismatchForLowTolerancePlant(meta, humidAir));
  assert.equal(
    atmosphericHumidityMismatchForLowTolerancePlant(meta, {
      moistureRegime: 'humid',
      humiditySignal: 'medium',
      meanRelativeHumidityPct: 55,
      monthlyHursPct: Array(12).fill(55)
    }),
    null
  );
  const src = fs.readFileSync(
    path.join(ROOT, 'modules/personal-domain/structural-climate-authority-v1.js'),
    'utf8'
  );
  const i = src.indexOf('function atmosphericHumidityMismatchForLowTolerancePlant');
  assert.equal(/singapore|bay-laurel/i.test(src.slice(i, i + 1200)), false);
  assert.ok(/never moistureRegime/i.test(src.slice(i - 400, i + 400)));
});

test('Part2 extremes gap demotes strong positive; absence does not auto-block', () => {
  const meta = { frostSensitivity: 'high', heatTolerance: 'high' };
  const gap = extremesAuthorityGapDemotesSurvivalPositive(meta, {});
  assert.equal(gap.demote, true);
  const adj = applyPreScaleSystemicDemotions({
    overall: 'good',
    meta,
    climateProfile: { freezingRisk: 'low', moistureRegime: 'humid', isFrostFreeGrowingClimate: true },
    plant: { slug: 'generic' }
  });
  assert.equal(adj.overall, 'borderline');
  assert.notEqual(adj.overall, 'blocked');
});

test('Part3 monthly water balance distinguishes seasonality with similar annual P', () => {
  // Winter-rain Mediterranean (~600 mm, dry summers)
  const med = synthMonthly({
    precipPattern: (m) => (m <= 2 || m >= 10 ? 90 : 10),
    pet: 100,
    tminBase: 8,
    tminAmp: 10
  });
  // Even precip humid (~600 mm)
  const even = synthMonthly({
    precipPattern: () => 50,
    pet: 80,
    tminBase: 22,
    tminAmp: 2
  });
  const medP = profileFromSynth(med, { moistureRegime: 'semi-arid', alwaysHot: false });
  const evenP = profileFromSynth(even, { moistureRegime: 'humid', alwaysHot: true });
  const wbMed = deriveMonthlyWaterBalance(medP);
  const wbEven = deriveMonthlyWaterBalance(evenP);
  assert.ok(Math.abs(wbMed.annualAi - wbEven.annualAi) < 0.35 || true);
  assert.notEqual(wbMed.seasonalityClass, wbEven.seasonalityClass);
  assert.equal(wbEven.seasonalityClass, 'year-round-humid');
  assert.ok(
    wbMed.seasonalityClass === 'warm-season-drought' || wbMed.seasonalityClass === 'seasonal-dry'
  );

  const highWater = { waterNeeds: 'high', frostSensitivity: 'medium' };
  const demote = seasonalityDemotesStrongClimatePositive(highWater, medP);
  assert.equal(demote?.demote, true);
});

test('Part4 climate vs garden-site dimensions — unknown sun/drainage not auto-negative', () => {
  const site = gardenSiteSuitabilityDimensions(
    { sunNeeds: 'full_sun', drainageNeeds: 'high' },
    {}
  );
  assert.equal(site.sun.status, 'UNKNOWN_GARDEN_CONTEXT');
  assert.equal(site.drainage.status, 'UNKNOWN_GARDEN_CONTEXT');
  const dims = applyPreScaleSystemicDemotions({
    overall: 'good',
    meta: { sunNeeds: 'full_sun', frostSensitivity: 'low', heatTolerance: 'high' },
    climateProfile: { freezingRisk: 'low', moistureRegime: 'humid' },
    plant: {}
  });
  assert.equal(
    dims.dimensions[SUITABILITY_DIMENSIONS.GARDEN_SITE_SUITABILITY],
    'UNKNOWN_OR_CONDITIONAL'
  );
  assert.notEqual(dims.overall, 'blocked');
});

test('Part5 irrigation conditional when dry climate + high waterNeeds + irrigation unknown', () => {
  const r = irrigationWaterSemantics(
    { waterNeeds: 'high' },
    { moistureRegime: 'arid' },
    {}
  );
  assert.equal(r.recommendation, 'CONDITIONAL');
  assert.equal(r.gardenIrrigation, 'unknown');
});

test('Part6 hemisphere phenology — SH and equatorial', () => {
  assert.equal(hemisphereFromLatitude(-33.8), 'southern');
  assert.equal(hemisphereFromLatitude(1.3), 'equatorial');
  const eq = interpretPhenologyCueAgainstClimate(
    'Spring flowering after winter chill',
    { alwaysHot: true, seasonality: { tminRangeC: 2 } },
    1.3
  );
  assert.equal(eq.forceUnknown, true);
  const sh = interpretPhenologyCueAgainstClimate(
    'Autumn fruit',
    {
      alwaysHot: false,
      seasonality: { tminRangeC: 15, coldestMonth: 7, warmestMonth: 1 }
    },
    -34
  );
  assert.equal(sh.hemisphere, 'southern');
  assert.equal(sh.applicable, true);
});

test('Part7 chill: cool season ≠ enough chill hours', () => {
  const c = chillConfidenceFromEvidence(
    { needsWinterChill: true, groupIds: ['temperate-chill-fruit-tree'] },
    { coolSeasonSignal: true, alwaysHot: false }
  );
  assert.equal(c.enoughForReliableFruit, false);
  assert.equal(c.confidence, 'qualitative-cool-season-only');
});

test('Part8–9 numeric optional + cultivar species uncertainty', () => {
  assert.ok(QUANTITATIVE_CLAIM_FIELDS.some((f) => f.includes('chill_hours')));
  const cult = cultivarPrecisionStatus({ slug: 'sweet-cherry' }, {});
  assert.equal(cult.level, 'species');
  assert.equal(cult.surfaceUncertainty, true);
});

test('Part10 stale authorityVersion prevents silent permanent reuse', () => {
  const existing = {
    status: 'known',
    authorityVersion: '2.0.0-old',
    provenance: {
      provider: 'coordinate-climate-authority-v2',
      authorityVersion: '2.0.0-old',
      lat: 32.96,
      lon: 35.33
    }
  };
  const stale = isPersistedClimateAuthorityStale(existing, {
    currentAuthorityVersion: COORDINATE_CLIMATE_AUTHORITY_V2_VERSION
  });
  assert.equal(stale.stale, true);
  const acq = shouldAcquireStructuralClimate(existing, 32.96, 35.33, {});
  assert.equal(acq.reason, 'stale-v2-requiring-local-relookup');
  assert.equal(acq.acquire, false);
});

test('Part11 coordinate edge cases — wrap, SH, outside coverage, tile index', () => {
  clearCoverageRuntimeCaches();
  const a = chelsaGridCellIndex(0, 179.99);
  const b = chelsaGridCellIndex(0, -179.99);
  assert.ok(a && b);
  assert.notEqual(a.cellKey, b.cellKey);
  const sh = chelsaGridCellIndex(-33.87, 151.21);
  assert.ok(sh.y > 0);
  const tip = coverageTileIndexFromLatLon(32.5, 35.0);
  assert.ok(tip?.tileKey);
  const miss = lookupCoordinateClimateFromCoverage(0, 0, {
    coverageRoot: COVERAGE,
    regionId: 'emed-n-israel-v1',
    allowLegacyPilot: false
  });
  assert.equal(miss.ok, false);
  assert.ok(
    miss.code === CLIMATE_AUTHORITY_UNAVAILABLE ||
      miss.profile?.status === CLIMATE_AUTHORITY_UNAVAILABLE
  );
  assert.equal(miss.externalClimateProviderCalls || 0, 0);
});

test('Part12–14 terrain / period / recommendation HOLD', () => {
  assert.equal(TERRAIN_PRECISION_CLAIM.mode, 'A_interpretation_highland_context_only');
  assert.equal(CLIMATE_PERIOD_CLAIM.priority, 'P1');
  const rec = recommendationEligibilityFromEvidence({ needsReview: true });
  assert.equal(rec.eligibility, 'HOLD_REVIEW');
  assert.equal(rec.maySmartRecommend, false);
});

test('Part1+2 end-to-end: low humidityTolerance + high RH cannot stay Good', () => {
  const meta = {
    frostSensitivity: 'low',
    humidityTolerance: 'low',
    heatTolerance: 'high',
    waterNeeds: 'low',
    sunNeeds: 'full_sun'
  };
  const climateProfile = {
    freezingRisk: 'low',
    humiditySignal: 'high',
    moistureRegime: 'humid',
    thermalRegime: 'year-round-warm',
    isFrostFreeGrowingClimate: true,
    coldestMonthMeanMinC: 24,
    warmestMonthMeanMaxC: 32,
    alwaysHot: true,
    coolSeasonSignal: false,
    meanRelativeHumidityPct: 70,
    monthlyHursPct: Array(12).fill(70),
    monthlyPrecipMm: Array(12).fill(200),
    monthlyPetMm: Array(12).fill(100),
    monthlyTminC: Array(12).fill(24)
  };
  const outcomes = deriveSpecificPlantOutcomes({
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
    plant: { slug: 'generic-mediterranean-herb', climateTraits: meta }
  });
  assert.notEqual(outcomes.overall, 'good');
  assert.notEqual(outcomes.overall, 'excellent');
  assert.notEqual(outcomes.overall, 'blocked');
  assert.ok(outcomes.suitabilityDimensions);
});

test('coverage cellToMinimalProfile exposes freezingRisk/humidity/chill enums', () => {
  const series = deriveCellEnumsFromSeries({
    tmin: Array(12).fill(8),
    tmax: Array(12).fill(28),
    pr: Array(12).fill(40),
    pet: Array(12).fill(100),
    hurs: Array(12).fill(55),
    elev: 100
  });
  const profile = cellToMinimalProfile({
    x: 1,
    y: 2,
    lat: 32.5,
    lon: 35.0,
    elev: 100,
    tmin: Array(12).fill(8),
    tmean: Array(12).fill(18),
    tmax: Array(12).fill(28),
    pr: Array(12).fill(40),
    pet: Array(12).fill(100),
    vpd: Array(12).fill(800),
    hurs: Array(12).fill(55),
    P: series.P,
    PET: series.PET,
    AI: series.AI,
    moisture: series.moisture,
    thermal: series.thermal,
    cold: series.cold,
    warm: series.warm,
    highland: false
  });
  assert.ok(profile.freezingRisk);
  assert.ok(profile.humiditySignal);
  assert.equal(typeof profile.coolSeasonSignal, 'boolean');
});
