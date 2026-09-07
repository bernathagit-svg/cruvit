/**
 * Single-authority plant runtime wiring proofs.
 * No plant enrichment / migration / Batch 3.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  META_AUTHORITY,
  MERGE_CORE_DEFAULT_VALUES,
  plantHasCanonicalClimateTraits,
  mergeSmartRecClimateMeta,
  climateMetaFromCatalogTraits,
  resolveSmartRecClimateMetaForPlant,
  stripSyntheticCoreDefaults
} from '../modules/personal-domain/smart-rec-climate-meta-authority-v1.js';
import {
  classifyPlantDataReadiness,
  PLANT_DATA_READINESS,
  resolveClimateFieldValueOrigin,
  VALUE_ORIGIN
} from '../modules/personal-domain/plant-data-contract-v1.js';
import { deriveSpecificPlantOutcomes, SPECIFIC_OUTCOME_STATUS } from '../modules/personal-domain/specific-plant-suitability-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'app.html');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const GP = path.join(ROOT, 'modules', 'personal-domain', 'garden-profile-v0.js');

function loadSeed() {
  const raw = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  return Array.isArray(raw) ? raw : raw.plants || [];
}

test('app.html authority order: climateTraits before inline SMART_REC', () => {
  const html = fs.readFileSync(APP, 'utf8');
  assert.match(html, /smartRecPlantHasCanonicalClimateTraits/);
  assert.match(html, /_metaAuthority='canonical-climateTraits'/);
  assert.match(html, /_metaAuthority:'legacy-inline-smart-rec'/);
  assert.match(html, /smartRecStripSyntheticCoreDefaults/);
  assert.match(html, /syntheticDefaultFields/);
  // Precedence: canonical check appears before SMART_REC_CLIMATE_METADATA lookup in function body
  const fn = html.slice(
    html.indexOf('function smartRecClimateMetaForPlant'),
    html.indexOf('function smartRecHasTag')
  );
  const iCanon = fn.indexOf('smartRecPlantHasCanonicalClimateTraits');
  const iLegacy = fn.indexOf('SMART_REC_CLIMATE_METADATA[');
  assert.ok(iCanon >= 0 && iLegacy > iCanon, 'canonical check must precede inline table lookup');
});

test('garden-profile exposes climate meta authority helpers', () => {
  const src = fs.readFileSync(GP, 'utf8');
  assert.match(src, /smart-rec-climate-meta-authority-v1\.js/);
  assert.match(src, /cruvitSmartRecClimateMetaAuthority/);
});

test('A. seed plant climateTraits win; inline cannot override; evidence survives', () => {
  const plant = {
    slug: 'demo-seed',
    name: 'Demo Seed',
    scientific: 'Demo seedus',
    climateTraits: {
      frostSensitivity: 'high',
      coldTolerance: 'low',
      heatTolerance: 'high',
      humidityTolerance: 'medium',
      sunNeeds: 'full_sun',
      waterNeeds: 'medium',
      drainageNeeds: 'high',
      floweringRequirements: 'Warm frost-free bloom.',
      fruitingRequirements: 'Warm season fruit.',
      groupIds: ['tropical-frost-sensitive-fruit'],
      traitEvidenceClasses: {
        frostSensitivity: 'SOURCE_SUPPORTED',
        coldTolerance: 'HEURISTIC_ASSERTION'
      },
      reproductiveBiology: { self_fertile: true }
    }
  };
  const legacyInline = {
    'demo-seed': mergeSmartRecClimateMeta({
      frostSensitivity: 'low', // would wrongly soften if inline won
      coldTolerance: 'high',
      heatTolerance: 'low',
      sunNeeds: 'shade'
    })
  };
  const meta = resolveSmartRecClimateMetaForPlant(plant, {
    legacyInlineTable: legacyInline,
    metaKeyForPlant: (p) => p.slug
  });
  assert.equal(meta._metaAuthority, META_AUTHORITY.CANONICAL_CLIMATE_TRAITS);
  assert.equal(meta.frostSensitivity, 'high');
  assert.equal(meta.sunNeeds, 'full_sun');
  assert.equal(meta.traitEvidenceClasses.frostSensitivity, 'SOURCE_SUPPORTED');
  assert.equal(meta.reproductiveBiology.self_fertile, true);
  assert.notEqual(meta.frostSensitivity, 'low');
});

test('B. legacy bootstrap-only plant uses inline fallback', () => {
  const plant = { slug: 'lavender', name: 'Lavender', scientific: 'Lavandula angustifolia' };
  assert.equal(plantHasCanonicalClimateTraits(plant), false);
  const legacyInline = {
    lavender: mergeSmartRecClimateMeta({
      frostSensitivity: 'low',
      humidityTolerance: 'low',
      sunNeeds: 'full_sun',
      waterNeeds: 'low',
      drainageNeeds: 'high'
    })
  };
  const meta = resolveSmartRecClimateMetaForPlant(plant, {
    legacyInlineTable: legacyInline,
    metaKeyForPlant: (p) => p.slug
  });
  assert.ok(meta);
  assert.equal(meta._metaAuthority, META_AUTHORITY.LEGACY_INLINE_SMART_REC);
  assert.equal(meta.sunNeeds, 'full_sun');
  assert.equal(meta.frostSensitivity, 'low');
});

test('C. missing frost + synthetic medium is not authoritative on canonical path', () => {
  const traits = {
    // frostSensitivity absent
    coldTolerance: 'medium',
    heatTolerance: 'high',
    sunNeeds: 'full_sun',
    waterNeeds: 'medium',
    humidityTolerance: 'medium',
    drainageNeeds: 'high'
  };
  const raw = mergeSmartRecClimateMeta(traits);
  assert.equal(raw.frostSensitivity, 'medium');
  assert.ok(raw.syntheticDefaultFields.includes('frostSensitivity'));
  const stripped = stripSyntheticCoreDefaults(raw);
  assert.equal(stripped.frostSensitivity, undefined);
  const fromCatalog = climateMetaFromCatalogTraits(traits, 'Demo');
  assert.equal(fromCatalog.frostSensitivity, undefined);
  assert.equal(fromCatalog.heatTolerance, 'high');
  // plant-data-contract: synthetic medium must not count as asserted
  const plant = { slug: 'x', name: 'X', scientific: 'X x', climateTraits: traits };
  const mergedRuntime = mergeSmartRecClimateMeta(traits); // has synthetic frost medium
  const origin = resolveClimateFieldValueOrigin('frostSensitivity', {
    plant,
    mergedRuntimeMeta: mergedRuntime
  });
  assert.equal(origin, VALUE_ORIGIN.MERGE_DEFAULT);
});

test('D. explicit source medium remains legitimate', () => {
  const traits = {
    frostSensitivity: 'medium',
    coldTolerance: 'medium',
    heatTolerance: 'medium',
    humidityTolerance: 'medium',
    drainageNeeds: 'medium',
    sunNeeds: 'full_sun',
    waterNeeds: 'medium'
  };
  const meta = climateMetaFromCatalogTraits(traits, 'Medium assertus');
  assert.equal(meta.frostSensitivity, 'medium');
  assert.ok(!(meta.syntheticDefaultFields || []).includes('frostSensitivity'));
  const plant = { slug: 'm', name: 'M', scientific: 'M m', climateTraits: traits };
  assert.equal(
    resolveClimateFieldValueOrigin('frostSensitivity', {
      plant,
      mergedRuntimeMeta: meta
    }),
    VALUE_ORIGIN.ASSERTED_SOURCE
  );
});

test('E. pineapple remains B; flowering/fruiting UNKNOWN; no invented evidence', () => {
  const seed = loadSeed();
  const pineapple = seed.find((p) => p.slug === 'pineapple');
  assert.ok(pineapple);
  const meta = climateMetaFromCatalogTraits(pineapple.climateTraits, pineapple.scientific);
  assert.equal(meta._metaAuthority, META_AUTHORITY.CANONICAL_CLIMATE_TRAITS);
  assert.equal(meta.frostSensitivity, 'high');
  assert.equal(meta.traitEvidenceClasses, undefined);
  const readiness = classifyPlantDataReadiness(pineapple);
  assert.equal(readiness.readinessShort, 'B');
  assert.equal(readiness.readiness, PLANT_DATA_READINESS.B_PARTIAL_OUTCOME_READY);
  const outcomes = deriveSpecificPlantOutcomes({
    meta: {
      ...pineapple.climateTraits,
      floweringRequirements: pineapple.climateTraits.floweringRequirements || '',
      fruitingRequirements: pineapple.climateTraits.fruitingRequirements || ''
    },
    climateProfile: {
      freezingRisk: 'high',
      isFrostFreeGrowingClimate: false,
      thermalRegime: 'frost-prone',
      broadClimate: 'temperate',
      humiditySignal: 'medium',
      coldestMonthMeanMinC: -3.55,
      structuralClimateStatus: 'known'
    },
    suitability: {
      recommendationLevel: 'blocked',
      survivalFit: 0,
      thriveFit: 15,
      floweringFit: 40,
      fruitingFit: 20,
      warnings: ['Frost risk is too high for this plant.']
    },
    plant: pineapple,
    protectedGrowing: false
  });
  assert.equal(outcomes.survival, SPECIFIC_OUTCOME_STATUS.UNRELIABLE);
  assert.ok(
    outcomes.growth === SPECIFIC_OUTCOME_STATUS.POOR ||
      outcomes.growth === SPECIFIC_OUTCOME_STATUS.UNRELIABLE
  );
  assert.equal(outcomes.flowering, SPECIFIC_OUTCOME_STATUS.UNKNOWN);
  assert.equal(outcomes.fruiting, SPECIFIC_OUTCOME_STATUS.UNKNOWN);
});

test('F. Hero/Specific Plant meta authority aligns for same seed plant', () => {
  const plant = {
    slug: 'coconut',
    name: 'Coconut',
    scientific: 'Cocos nucifera',
    climateTraits: {
      frostSensitivity: 'high',
      coldTolerance: 'low',
      heatTolerance: 'high',
      humidityTolerance: 'high',
      sunNeeds: 'full_sun',
      waterNeeds: 'high',
      drainageNeeds: 'high',
      groupIds: ['tropical-frost-sensitive-fruit'],
      needsReview: true,
      traitEvidenceClasses: { frostSensitivity: 'HEURISTIC_ASSERTION' }
    }
  };
  // Fake conflicting inline — must not win
  const legacyInline = {
    coconut: mergeSmartRecClimateMeta({ frostSensitivity: 'low', sunNeeds: 'shade' })
  };
  const meta = resolveSmartRecClimateMetaForPlant(plant, {
    legacyInlineTable: legacyInline,
    metaKeyForPlant: (p) => p.slug
  });
  assert.equal(meta._metaAuthority, META_AUTHORITY.CANONICAL_CLIMATE_TRAITS);
  assert.equal(meta.frostSensitivity, 'high');
  assert.equal(meta.traitEvidenceClasses.frostSensitivity, 'HEURISTIC_ASSERTION');
  assert.equal(meta.needsReview, true);
  // Outcomes from same meta authority
  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: {
      freezingRisk: 'medium',
      isFrostFreeGrowingClimate: false,
      broadClimate: 'temperate',
      structuralClimateStatus: 'known'
    },
    suitability: {
      recommendationLevel: 'blocked',
      survivalFit: 0,
      thriveFit: 20,
      warnings: ['Frost risk is too high for this plant.']
    },
    plant,
    protectedGrowing: false
  });
  assert.equal(outcomes.survival, SPECIFIC_OUTCOME_STATUS.UNRELIABLE);
  assert.equal(outcomes.overall, 'blocked');
});

test('G. no CHELSA / global climate wiring unchanged (source guard)', () => {
  const html = fs.readFileSync(APP, 'utf8');
  assert.doesNotMatch(
    html.slice(html.indexOf('function smartRecClimateMetaForPlant'), html.indexOf('function smartRecHasTag')),
    /CHELSA|chelsa/
  );
  const auth = fs.readFileSync(
    path.join(ROOT, 'modules', 'personal-domain', 'smart-rec-climate-meta-authority-v1.js'),
    'utf8'
  );
  assert.doesNotMatch(auth, /CHELSA|chelsa/);
});

test('merge empty still exposes medium defaults for legacy build compatibility', () => {
  const m = mergeSmartRecClimateMeta({});
  assert.equal(m.frostSensitivity, MERGE_CORE_DEFAULT_VALUES.frostSensitivity);
  assert.ok(m.syntheticDefaultFields.includes('frostSensitivity'));
});
