/**
 * P0 humidityTolerance=low × humid climate — systemic contract proofs.
 * Plant-agnostic: no Singapore / slug hardcodes in the rule under test.
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
import { atmosphericHumidityMismatchForLowTolerancePlant as fromStructural } from '../modules/personal-domain/structural-climate-authority-v1.js';
import {
  materializeQuantitativeEvidenceFromClaims,
  quantitativeColdSurvivalUnsupported,
  quantitativeGrowthWarmSeasonUnsupported,
  readOptionalNumericThreshold,
  validateQuantitativeClaims
} from '../modules/catalog-expansion/plant-climate-quantitative-evidence-v1-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

test('atmospheric humidity mismatch is plant-agnostic (no site/slug hardcode)', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'modules/personal-domain/structural-climate-authority-v1.js'),
    'utf8'
  );
  const fnBlock = src.slice(
    src.indexOf('function atmosphericHumidityMismatchForLowTolerancePlant'),
    src.indexOf('function atmosphericHumidityMismatchForLowTolerancePlant') + 1200
  );
  assert.equal(/singapore|bay-laurel|oleander|thyme|sage/i.test(fnBlock), false);
  assert.equal(fromStructural, atmosphericHumidityMismatchForLowTolerancePlant);
});

test('humidityTolerance=low + humid moistureRegime alone does NOT mismatch; high RH does', () => {
  const meta = {
    frostSensitivity: 'medium',
    humidityTolerance: 'low',
    heatTolerance: 'high',
    coldTolerance: 'medium',
    waterNeeds: 'low',
    floweringRequirements: 'spring foliage',
    fruitingRequirements: null,
    traitEvidenceClasses: {
      frostSensitivity: 'SOURCE_SUPPORTED',
      coldTolerance: 'SOURCE_SUPPORTED',
      heatTolerance: 'SOURCE_SUPPORTED',
      humidityTolerance: 'HEURISTIC_ASSERTION',
      waterNeeds: 'HEURISTIC_ASSERTION'
    }
  };
  assert.equal(
    atmosphericHumidityMismatchForLowTolerancePlant(meta, {
      humiditySignal: 'medium',
      moistureRegime: 'humid',
      meanRelativeHumidityPct: 55,
      monthlyHursPct: Array(12).fill(55)
    }),
    null
  );
  const climateProfile = {
    freezingRisk: 'low',
    humiditySignal: 'high',
    moistureRegime: 'humid',
    thermalRegime: 'year-round-warm',
    isFrostFreeGrowingClimate: true,
    coldestMonthMeanMinC: 24,
    warmestMonthMeanMaxC: 32,
    broadClimate: 'tropical',
    alwaysHot: true,
    coolSeasonSignal: false,
    meanRelativeHumidityPct: 70,
    monthlyHursPct: Array(12).fill(70)
  };
  assert.ok(atmosphericHumidityMismatchForLowTolerancePlant(meta, climateProfile));
  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile,
    suitability: {
      recommendationLevel: 'good',
      survivalFit: 85,
      thriveFit: 80,
      floweringFit: 70,
      fruitingFit: 40,
      warnings: [],
      explanationText: ''
    },
    plant: { slug: 'generic-low-humidity-plant', climateTraits: meta }
  });
  assert.notEqual(outcomes.overall, 'good');
  assert.notEqual(outcomes.overall, 'excellent');
  assert.notEqual(outcomes.survival, 'constrained'); // qualitative humidity ≠ survival
  assert.notEqual(outcomes.survival, 'unreliable');
  assert.ok(
    outcomes.growth === 'constrained' || outcomes.growth === 'poor'
  );
  assert.notEqual(outcomes.overall, 'blocked');
});

test('humidityTolerance=low + semi-arid does not trigger humid mismatch', () => {
  const meta = { humidityTolerance: 'low', frostSensitivity: 'medium' };
  const climateProfile = {
    humiditySignal: 'low',
    moistureRegime: 'semi-arid',
    freezingRisk: 'low'
  };
  assert.equal(atmosphericHumidityMismatchForLowTolerancePlant(meta, climateProfile), null);
});

test('waterNeeds is not equated with humidityTolerance', () => {
  const meta = {
    humidityTolerance: 'medium',
    waterNeeds: 'low',
    frostSensitivity: 'medium'
  };
  const climateProfile = {
    humiditySignal: 'medium',
    moistureRegime: 'humid',
    freezingRisk: 'low'
  };
  assert.equal(atmosphericHumidityMismatchForLowTolerancePlant(meta, climateProfile), null);
});

test('absence of quantitative thresholds does not create a negative', () => {
  const meta = { frostSensitivity: 'medium', humidityTolerance: 'medium' };
  assert.equal(readOptionalNumericThreshold(meta, 'minimum_survival_temperature_c'), null);
  assert.equal(
    quantitativeColdSurvivalUnsupported(meta, { coldestMonthMeanMinC: 5 }),
    null
  );
});

test('authoritative quantitative min survival is additive when present', () => {
  const meta = {
    frostSensitivity: 'medium',
    quantitativeEvidence: { minimum_survival_temperature_c: 12 }
  };
  const hit = quantitativeColdSurvivalUnsupported(meta, { coldestMonthMeanMinC: 8 });
  assert.equal(hit.unsupported, true);
  const ok = quantitativeColdSurvivalUnsupported(meta, { coldestMonthMeanMinC: 14 });
  assert.equal(ok.unsupported, false);
});


test('optimum growth lower bound requires provenance and materializes generically', () => {
  const claims = [{
    claimId: 'quantitative-optimum-growth-temperature-min-c',
    field: 'quantitative.optimum_growth_temperature_min_c',
    status: 'asserted',
    value: 24,
    sourceIds: ['uf-ifas-hs1499-mango'],
    shortExcerpt: 'Optimum growing temperature range 75–86°F.'
  }];
  const errors = validateQuantitativeClaims(claims, new Set(['uf-ifas-hs1499-mango']), []);
  assert.deepEqual(errors, []);
  const materialized = materializeQuantitativeEvidenceFromClaims(claims);
  assert.equal(materialized.quantitativeEvidence.optimum_growth_temperature_min_c, 24);
  assert.deepEqual(
    materialized.quantitativeProvenance.optimum_growth_temperature_min_c.sourceIds,
    ['uf-ifas-hs1499-mango']
  );
});

test('optimum growth lower bound constrains strong Growth but not Survival', () => {
  const meta = {
    frostSensitivity: 'high',
    coldTolerance: 'low',
    heatTolerance: 'high',
    quantitativeEvidence: { optimum_growth_temperature_min_c: 24 },
    quantitativeProvenance: {
      optimum_growth_temperature_min_c: {
        evidenceClass: 'SOURCE_SUPPORTED',
        sourceIds: ['uf-ifas-hs1499-mango'],
        shortExcerpt: 'Optimum growing temperature range 75–86°F.'
      }
    },
    traitEvidenceClasses: {
      frostSensitivity: 'SOURCE_SUPPORTED',
      coldTolerance: 'SOURCE_SUPPORTED',
      heatTolerance: 'SOURCE_SUPPORTED'
    }
  };
  const q = quantitativeGrowthWarmSeasonUnsupported(meta, { warmestMonthMeanMaxC: 22.05 });
  assert.equal(q.unsupported, true);
  assert.equal(
    quantitativeGrowthWarmSeasonUnsupported(meta, { warmestMonthMeanMaxC: 26.35 }).unsupported,
    false
  );
  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: {
      broadClimate: 'subtropical',
      freezingRisk: 'low',
      isFrostFreeGrowingClimate: true,
      moistureRegime: 'humid',
      coldestMonthMeanMinC: 11.05,
      warmestMonthMeanMaxC: 22.05,
      structuralClimateStatus: 'known'
    },
    suitability: {
      recommendationLevel: 'good',
      survivalFit: 85,
      thriveFit: 80,
      warnings: [],
      explanationText: ''
    },
    plant: { slug: 'quantitative-growth-demo', climateTraits: meta }
  });
  assert.equal(outcomes.survival, 'reliable');
  assert.equal(outcomes.growth, 'constrained');
  assert.equal(outcomes.overall, 'borderline');
  assert.ok(outcomes.limitingFactors.some((x) => /optimum-growth lower bound/i.test(String(x))));
});
