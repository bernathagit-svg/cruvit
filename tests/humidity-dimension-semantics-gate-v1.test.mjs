/**
 * Humidity dimension semantics — Survival vs Growth/Overall.
 * Qualitative humidityTolerance must not demote Survival without mortality evidence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  atmosphericHumidityMismatchForLowTolerancePlant,
  plantHasHumiditySurvivalThreatEvidence
} from '../modules/personal-domain/structural-climate-authority-v1.js';
import { deriveSpecificPlantOutcomes } from '../modules/personal-domain/specific-plant-suitability-contract.js';
import {
  chelsaVpdToPa,
  ATMOSPHERIC_HUMIDITY_AUTHORITY_V2,
  COORDINATE_CLIMATE_AUTHORITY_V2_VERSION
} from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PILOT = path.join(ROOT, 'data', 'coordinate-climate', 'v2', 'pilot');

test('qualitative humidityTolerance alone has no survival threat evidence', () => {
  assert.equal(plantHasHumiditySurvivalThreatEvidence({ humidityTolerance: 'low' }), false);
  assert.equal(
    plantHasHumiditySurvivalThreatEvidence({
      humidityTolerance: 'low',
      quantitativeEvidence: { humidity_mortality: true }
    }),
    false
  ); // missing provenance
  assert.equal(
    plantHasHumiditySurvivalThreatEvidence({
      humidityTolerance: 'low',
      quantitativeEvidence: {
        humidity_mortality: true,
        humidity_mortality_sourceIds: ['src-1']
      }
    }),
    true
  );
});

test('mismatch without survival evidence: affectsGrowth true, affectsSurvival false', () => {
  const m = atmosphericHumidityMismatchForLowTolerancePlant(
    { humidityTolerance: 'low' },
    { meanRelativeHumidityPct: 72, monthlyHursPct: Array(12).fill(72) }
  );
  assert.equal(m.affectsGrowth, true);
  assert.equal(m.affectsOverall, true);
  assert.equal(m.affectsSurvival, false);
});

test('outcomes: Survival not demoted by humidity; Growth bounded; Overall not Good', () => {
  const meta = {
    frostSensitivity: 'low',
    humidityTolerance: 'low',
    heatTolerance: 'high',
    waterNeeds: 'low',
    // Isolate humidity dimension: survival-authorizing cold trait is source-supported;
    // humidityTolerance remains heuristic → cannot authorize confident Poor.
    traitEvidenceClasses: {
      frostSensitivity: 'SOURCE_SUPPORTED',
      humidityTolerance: 'HEURISTIC_ASSERTION',
      heatTolerance: 'SOURCE_SUPPORTED',
      waterNeeds: 'HEURISTIC_ASSERTION'
    }
  };
  const climateProfile = {
    freezingRisk: 'low',
    isFrostFreeGrowingClimate: true,
    moistureRegime: 'humid',
    meanRelativeHumidityPct: 72,
    monthlyHursPct: Array(12).fill(72),
    meanVpdPa: 900,
    monthlyVpdPa: Array(12).fill(900)
  };
  const o = deriveSpecificPlantOutcomes({
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
    plant: { slug: 'generic-low-hum', climateTraits: meta }
  });
  assert.equal(o.survival, 'reliable');
  assert.equal(o.growth, 'constrained'); // heuristic humidity cannot authorize confident Poor
  assert.notEqual(o.overall, 'good');
  assert.notEqual(o.overall, 'excellent');
  assert.ok(/growth|humidity|evidence-strength|bounded/i.test(o.limitingFactors.join(' ')));
  assert.equal(
    /Documented humidity-related survival threat/i.test(o.limitingFactors.join(' ')),
    false
  );
});

test('documented humidity mortality may constrain Survival', () => {
  const meta = {
    frostSensitivity: 'low',
    humidityTolerance: 'low',
    quantitativeEvidence: {
      humidity_mortality: true,
      humidity_mortality_sourceIds: ['botanical-ref']
    }
  };
  const climateProfile = {
    freezingRisk: 'low',
    isFrostFreeGrowingClimate: true,
    meanRelativeHumidityPct: 75,
    monthlyHursPct: Array(12).fill(75)
  };
  const m = atmosphericHumidityMismatchForLowTolerancePlant(meta, climateProfile);
  assert.equal(m.affectsSurvival, true);
  const o = deriveSpecificPlantOutcomes({
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
    plant: { slug: 'generic', climateTraits: meta }
  });
  assert.equal(o.survival, 'constrained');
});

test('Singapore four: Survival not demoted; Growth constrained; Overall not Good', async () => {
  const { BATCH1_PLANTS } = await import(
    '../data/catalog-expansion/batches/bulk-batch-1-v1/definitions.mjs'
  );
  const s = JSON.parse(fs.readFileSync(path.join(PILOT, 'singapore.json'), 'utf8'));
  const climateProfile = {
    ...s,
    moistureRegime: s.aridityMoistureRegime,
    freezingRisk: 'low',
    isFrostFreeGrowingClimate: true,
    monthlyHursPct: s.monthlyHursPct,
    meanRelativeHumidityPct: s.meanRelativeHumidityPct,
    meanVpdPa: s.meanVpdPa,
    monthlyVpdPa: s.monthlyVpdPa
  };
  for (const slug of ['bay-laurel', 'oleander', 'common-thyme', 'garden-sage']) {
    const def = BATCH1_PLANTS.find((d) => d.slug === slug);
    assert.ok(def, slug);
    const meta = {
      frostSensitivity: def.frostSensitivity,
      humidityTolerance: def.humidityTolerance,
      heatTolerance: def.heatTolerance,
      coldTolerance: def.coldTolerance,
      waterNeeds: def.waterNeeds,
      floweringRequirements: def.floweringRequirements,
      fruitingRequirements: def.fruitingRequirements,
      groupIds: def.groupIds,
      needsReview: def.needsReview,
      // Humidity-isolation fixture: cold traits source-supported so Survival can stay reliable;
      // humidityTolerance stays heuristic → Growth cannot be confident Poor.
      traitEvidenceClasses: {
        frostSensitivity: 'SOURCE_SUPPORTED',
        coldTolerance: 'SOURCE_SUPPORTED',
        heatTolerance: 'SOURCE_SUPPORTED',
        humidityTolerance: 'HEURISTIC_ASSERTION',
        waterNeeds: 'HEURISTIC_ASSERTION'
      }
    };
    assert.equal(meta.humidityTolerance, 'low');
    const o = deriveSpecificPlantOutcomes({
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
      plant: { slug, climateTraits: meta }
    });
    assert.notEqual(o.overall, 'good', slug);
    assert.notEqual(o.overall, 'excellent', slug);
    assert.notEqual(o.survival, 'unreliable', slug);
    assert.equal(o.survival, 'reliable', slug);
    assert.ok(o.growth === 'constrained' || o.growth === 'poor', `${slug} growth=${o.growth}`);
    // Heuristic humidity must not keep confident Poor
    assert.notEqual(o.growth, 'poor', slug);
  }
});

test('prior VPD/RH fixes preserved', () => {
  assert.equal(chelsaVpdToPa(11492), 1149.2);
  assert.equal(ATMOSPHERIC_HUMIDITY_AUTHORITY_V2.meanRhThresholdsPct.highInclusiveMin, 70);
  assert.equal(COORDINATE_CLIMATE_AUTHORITY_V2_VERSION, '2.0.3-vpd-scale');
  const s = JSON.parse(fs.readFileSync(path.join(PILOT, 'singapore.json'), 'utf8'));
  assert.ok(s.meanVpdPa > 1200 && s.meanVpdPa < 1300);
  assert.equal(s.humiditySignal, 'borderline');
});
