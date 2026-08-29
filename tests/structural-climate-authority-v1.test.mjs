/**
 * Structural Climate Authority V1 — pure derivation + live hydrate smoke.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAMAGING_COLD_MONTH_MEAN_MIN_C,
  STRUCTURAL_CLIMATE_AUTHORITY_VERSION,
  aggregateArchiveDailyToNormals,
  applyStructuralClimateToProfile,
  deriveStructuralClimateFromNormals,
  fetchStructuralClimateForCoordinates,
  humiditySignalFromStructural,
  moistureMismatchForHighHumidityPlant,
  outdoorDamagingColdUnsupported
} from '../modules/personal-domain/structural-climate-authority-v1.js';
import {
  deriveSpecificPlantOutcomes,
  structuralEnvironmentFromClimateProfile
} from '../modules/personal-domain/specific-plant-suitability-contract.js';

test('contract version stable', () => {
  assert.equal(STRUCTURAL_CLIMATE_AUTHORITY_VERSION, '1.0.0');
  assert.equal(DAMAGING_COLD_MONTH_MEAN_MIN_C, 10);
});

test('UNEP AI + RH derive arid humidity low without inventing', () => {
  const derived = deriveStructuralClimateFromNormals({
    annualPrecipitationMm: 32,
    annualEt0Mm: 2000,
    aridityIndex: 0.016,
    meanRelativeHumidityPct: 51,
    coldestMonth: '01',
    coldestMonthMeanMinC: 8.7,
    windowYears: 10,
    sampleDays: 3652
  });
  assert.equal(derived.status, 'known');
  assert.equal(derived.moistureRegime, 'hyper-arid');
  assert.equal(derived.humiditySignal, 'low');
  assert.equal(derived.broadClimateOverride, 'arid');
  assert.equal(derived.structuralColdRisk, 'elevated');
});

test('humid tropical normals keep high humiditySignal', () => {
  const derived = deriveStructuralClimateFromNormals({
    annualPrecipitationMm: 2800,
    annualEt0Mm: 1300,
    aridityIndex: 2.15,
    meanRelativeHumidityPct: 84,
    coldestMonth: '01',
    coldestMonthMeanMinC: 23.4,
    windowYears: 10,
    sampleDays: 3652
  });
  assert.equal(derived.moistureRegime, 'humid');
  assert.equal(derived.humiditySignal, 'high');
  assert.equal(derived.broadClimateOverride, null);
  assert.equal(derived.structuralColdRisk, 'low');
});

test('missing normals → UNKNOWN, no confident humidity', () => {
  const derived = deriveStructuralClimateFromNormals(null);
  assert.equal(derived.status, 'unknown');
  assert.equal(derived.moistureRegime, 'unknown');
  assert.equal(derived.humiditySignal, null);
});

test('applyStructuralClimate overlays arid over subtropical label', () => {
  const sc = deriveStructuralClimateFromNormals({
    annualPrecipitationMm: 40,
    annualEt0Mm: 1900,
    aridityIndex: 0.021,
    meanRelativeHumidityPct: 50,
    coldestMonthMeanMinC: 9,
    windowYears: 10
  });
  const profile = applyStructuralClimateToProfile(
    { climateLabel: 'Subtropical', broadClimate: 'subtropical', humiditySignal: 'medium' },
    sc
  );
  assert.equal(profile.broadClimate, 'arid');
  assert.equal(profile.humiditySignal, 'low');
  assert.equal(profile.moistureRegime, 'hyper-arid');
});

test('outcome: arid structural blocks high-humidity tropical even if frost-free subtropical label', () => {
  const sc = deriveStructuralClimateFromNormals({
    annualPrecipitationMm: 40,
    annualEt0Mm: 1900,
    aridityIndex: 0.021,
    meanRelativeHumidityPct: 50,
    coldestMonthMeanMinC: 9,
    windowYears: 10
  });
  const climateProfile = applyStructuralClimateToProfile(
    {
      climateLabel: 'Subtropical',
      broadClimate: 'subtropical',
      freezingRisk: 'low',
      structuralClimate: sc
    },
    sc
  );
  const env = structuralEnvironmentFromClimateProfile(climateProfile);
  assert.equal(env.broadClimate, 'arid');
  assert.equal(env.humiditySignal, 'low');

  const meta = {
    frostSensitivity: 'high',
    coldTolerance: 'low',
    humidityTolerance: 'high',
    heatTolerance: 'high',
    groupIds: ['tropical-frost-sensitive-fruit'],
    needsReview: true,
    floweringRequirements: 'temp',
    fruitingRequirements: 'pods'
  };
  assert.equal(moistureMismatchForHighHumidityPlant(meta, env), true);
  assert.equal(outdoorDamagingColdUnsupported(meta, env), true);

  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: env,
    suitability: {
      recommendationLevel: 'good',
      survivalFit: 85,
      thriveFit: 80,
      floweringFit: 50,
      fruitingFit: 40,
      warnings: [],
      explanationText: ''
    },
    plant: { slug: 'demo-tropical' }
  });
  assert.equal(outcomes.survival, 'unreliable');
  assert.equal(outcomes.overall, 'blocked');
  assert.ok(outcomes.limitingFactors.some((x) => /arid|humidity|moisture/i.test(x)));
});

test('aggregateArchiveDailyToNormals computes AI + coldest month', () => {
  const daily = {
    time: ['2020-01-01', '2020-01-02', '2020-07-01', '2020-07-02'],
    precipitation_sum: [1, 1, 0, 0],
    et0_fao_evapotranspiration: [2, 2, 5, 5],
    relative_humidity_2m_mean: [40, 40, 30, 30],
    temperature_2m_min: [5, 6, 20, 21]
  };
  const agg = aggregateArchiveDailyToNormals(daily, { years: 1 });
  assert.equal(agg.ok, true);
  assert.ok(agg.normals.aridityIndex != null);
  assert.equal(agg.normals.coldestMonth, '01');
  assert.ok(agg.normals.coldestMonthMeanMinC < 10);
});

test('live hydrate Cairo vs Kochi differentiate moisture (network)', async (t) => {
  let cairo;
  let kochi;
  try {
    await new Promise((r) => setTimeout(r, 1000));
    cairo = await fetchStructuralClimateForCoordinates(30.0444, 31.2357, { maxAttempts: 5 });
    await new Promise((r) => setTimeout(r, 1000));
    kochi = await fetchStructuralClimateForCoordinates(9.9312, 76.2673, { maxAttempts: 5 });
  } catch (err) {
    t.skip(`network failed: ${err?.message || err}`);
    return;
  }
  if (!cairo.ok || !kochi.ok) {
    t.skip(`archive rate-limited or unavailable: ${cairo.error || kochi.error}`);
    return;
  }
  assert.ok(
    cairo.structuralClimate.moistureRegime === 'hyper-arid' ||
      cairo.structuralClimate.moistureRegime === 'arid'
  );
  assert.equal(kochi.structuralClimate.moistureRegime, 'humid');
  assert.equal(cairo.structuralClimate.humiditySignal, 'low');
  assert.equal(kochi.structuralClimate.humiditySignal, 'high');
  assert.notEqual(
    humiditySignalFromStructural(cairo.structuralClimate),
    humiditySignalFromStructural(kochi.structuralClimate)
  );
});
