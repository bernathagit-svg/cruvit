/**
 * Purpose-aware Smart Rec semantics V1.
 * Interprets validated four outcomes. Does not change the suitability engine.
 * Run: node --test tests/smart-rec-purpose-aware-v1.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveSpecificPlantOutcomes,
  findCatalogPlantBySlugOrName,
  structuralEnvironmentFromClimateProfile
} from '../modules/personal-domain/specific-plant-suitability-contract.js';
import { BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1 } from '../modules/personal-domain/bootstrap-safe-climate-traits-migration-data-v1.js';
import { coordinateClimateProfileToStructuralPersistence } from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import { buildCoordinateClimateConfidenceV2 } from '../modules/personal-domain/coordinate-climate-confidence-v2-contract.js';
import {
  resolveGardenStructuralClimateFromCoordinateV2,
  resetCoordinateClimateRuntimeCounters,
  getCoordinateClimateRuntimeCounters
} from '../modules/personal-domain/coordinate-climate-garden-hydrate-v2.js';
import { clearGlobalRuntimeCaches } from '../modules/personal-domain/coordinate-climate-global-lookup-v2.js';
import {
  applyHardClimateSurvivalToFits,
  enforceSurvivalDownstreamCaps,
  evaluateHardClimateSurvival,
  HARD_CLIMATE_SURVIVAL_GATE_VERSION
} from '../modules/suitability/hard-climate-survival-gate-v1.js';
import {
  alignSmartRecSuitabilityWithValidatedOutcomes,
  catalogPurposeCapabilities,
  compareSmartRecRecommendationRank,
  evaluatePurposeFit,
  isPositiveRecommendationRank,
  resolveSmartRecPurpose,
  SMART_REC_GARDEN_INTELLIGENCE_VERSION
} from '../modules/smart-recommendations/smart-rec-garden-intelligence-v1.js';
import { PURPOSE_FIT_STATUS } from '../modules/smart-recommendations/smart-rec-purpose-policy-v1.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'app.html');
const GATE = path.join(ROOT, 'modules', 'suitability', 'hard-climate-survival-gate-v1.js');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const DATA = path.join(ROOT, 'data', 'coordinate-climate', 'v2');
const PILOT = path.join(DATA, 'pilot');
const QA = path.join(DATA, 'qa');

let paidNetwork = 0;
globalThis.fetch = async (url) => {
  const u = String(url || '');
  if (/anthropic|api\.openai|plant-identify|claude/i.test(u)) paidNetwork += 1;
  throw new Error('network forbidden in purpose-aware tests: ' + u);
};

function catalogClimateTraitsFromApp(slug) {
  const app = fs.readFileSync(APP, 'utf8');
  const marker = `{slug:'${slug}',`;
  const i = app.indexOf(marker);
  if (i < 0) throw new Error(`catalog record missing for ${slug}`);
  const next = app.indexOf('{slug:', i + marker.length);
  const slice = app.slice(i, next > i ? next : i + 12000);
  const key = 'climateTraits:';
  const start = slice.indexOf(key);
  if (start < 0) throw new Error(`climateTraits missing for ${slug}`);
  const jsonStart = start + key.length;
  let depth = 0;
  let end = jsonStart;
  for (; end < slice.length; end += 1) {
    const ch = slice[end];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }
  return JSON.parse(slice.slice(jsonStart, end));
}

function loadSeedPlant(slug) {
  const raw = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  const plant = findCatalogPlantBySlugOrName(raw.plants || raw, slug);
  assert.ok(plant?.climateTraits, `seed plant missing: ${slug}`);
  return {
    slug: plant.slug,
    name: plant.names?.en || plant.name || slug,
    scientific: plant.scientific,
    tags: plant.tags || [],
    climateTraits: plant.climateTraits
  };
}

function loadRuntimePlant(slug) {
  try {
    const traits = catalogClimateTraitsFromApp(slug);
    if (traits && (traits.frostSensitivity || traits.coldTolerance || (traits.groupIds || []).length)) {
      return { slug, name: slug, tags: [], climateTraits: traits };
    }
  } catch {
    /* overlay */
  }
  const safe = BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1.plants?.[slug];
  if (safe?.climateTraits) {
    return {
      slug,
      name: safe.name || slug,
      scientific: safe.scientific,
      tags: [],
      climateTraits: safe.climateTraits
    };
  }
  return loadSeedPlant(slug);
}

function loadPilotClimate(siteId) {
  const raw = JSON.parse(fs.readFileSync(path.join(PILOT, `${siteId}.json`), 'utf8'));
  let qa = null;
  const qaPath = path.join(QA, `${siteId}.json`);
  if (fs.existsSync(qaPath)) qa = JSON.parse(fs.readFileSync(qaPath, 'utf8'));
  const confidence = buildCoordinateClimateConfidenceV2({ profile: raw, qaRecord: qa });
  const profile = {
    ...raw,
    confidence: confidence.overall,
    confidenceDimensions: confidence.dimensions,
    localRepresentativeness: confidence.localRepresentativeness
  };
  const structural = coordinateClimateProfileToStructuralPersistence(profile);
  const base = {
    ...structural,
    status: structural.status || 'known',
    structuralClimateStatus: 'known',
    structuralClimate: structural,
    coldestMonthMeanMinC: profile.coldestMonthMeanMinC,
    alwaysHot: profile.alwaysHot,
    coolSeasonSignal: profile.coolSeasonSignal,
    freezingRisk: profile.freezingRisk,
    thermalRegime: profile.thermalRegime,
    humiditySignal: profile.humiditySignal,
    confidence: profile.confidence,
    coordinateClimateV2: profile
  };
  const env = structuralEnvironmentFromClimateProfile(base);
  return {
    siteId,
    loc: profile.coordinate,
    climateProfile: { ...base, ...env, isFrostFreeGrowingClimate: env.isFrostFreeGrowingClimate }
  };
}

function loadMojstranaClimate() {
  clearGlobalRuntimeCaches();
  resetCoordinateClimateRuntimeCounters();
  const loc = { lat: 46.42383, lon: 13.8752, label: 'Mojstrana, Slovenia' };
  const resolved = resolveGardenStructuralClimateFromCoordinateV2(loc.lat, loc.lon, {
    dataRoot: DATA,
    enqueuePrep: false,
    label: loc.label
  });
  assert.equal(resolved.ok, true);
  const structural =
    resolved.structuralClimate || coordinateClimateProfileToStructuralPersistence(resolved.profile);
  const climateProfile = {
    freezingRisk: structural.freezingRisk,
    coldestMonthMeanMinC: structural.evidence?.coldestMonthMeanMinC ?? structural.coldestMonthMeanMinC,
    thermalRegime: structural.thermalRegime,
    isFrostFreeGrowingClimate: false,
    structuralClimateStatus: 'known',
    structuralClimate: structural,
    structuralColdRisk: structural.structuralColdRisk
  };
  const env = structuralEnvironmentFromClimateProfile(climateProfile);
  return {
    siteId: 'mojstrana',
    loc,
    climateProfile: { ...climateProfile, ...env, isFrostFreeGrowingClimate: env.isFrostFreeGrowingClimate }
  };
}

function evaluateAligned({ plant, climate, intent = null, genericLevel = 'good' }) {
  const meta = plant.climateTraits;
  const verdict = evaluateHardClimateSurvival({
    meta,
    climateProfile: climate.climateProfile,
    protectionContext: { plantingMode: 'ground' },
    coords: climate.loc || {}
  });
  const fits = applyHardClimateSurvivalToFits(
    { survivalFit: 85, thriveFit: 80, floweringFit: 70, fruitingFit: 70, heatColdFit: 80 },
    verdict
  );
  enforceSurvivalDownstreamCaps(fits);
  const suitability = {
    survivalFit: fits.survivalFit,
    thriveFit: fits.thriveFit,
    floweringFit: fits.floweringFit,
    fruitingFit: fits.fruitingFit,
    hardSurvivalBlocked: fits.hardSurvivalBlocked === true,
    recommendationLevel: verdict.hardBlocked ? 'blocked' : genericLevel,
    suitabilityScore: verdict.hardBlocked ? 0 : 82,
    warnings: verdict.reason ? [verdict.reason] : [],
    explanationText: verdict.reason || ''
  };
  const derived = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: climate.climateProfile,
    suitability,
    plant,
    protectedGrowing: false
  });
  const aligned = alignSmartRecSuitabilityWithValidatedOutcomes(suitability, derived, {
    plant,
    meta,
    intent
  });
  const purpose = aligned.purpose || resolveSmartRecPurpose({ intent, plant, meta });
  return {
    slug: plant.slug,
    site: climate.siteId,
    survival: derived.survival,
    growth: derived.growth,
    flowering: derived.flowering,
    fruiting: derived.fruiting,
    purpose,
    purposeFit: aligned.purposeFit,
    recommendationLevel: aligned.recommendationLevel,
    recommendationLabel: aligned.recommendationLabel,
    hardBlocked: verdict.hardBlocked === true,
    capabilities: catalogPurposeCapabilities(plant, meta)
  };
}

test('hard-frost gate and intelligence version stay on the purpose-policy path', () => {
  assert.equal(HARD_CLIMATE_SURVIVAL_GATE_VERSION, '1.1.1');
  assert.equal(SMART_REC_GARDEN_INTELLIGENCE_VERSION, '1.2.0-purpose-aware');
  const gate = fs.readFileSync(GATE, 'utf8');
  assert.match(gate, /HARD_CLIMATE_SURVIVAL_GATE_VERSION = '1.1.1'/);
});

test('A. fruit-purpose cannot be Good when sourced Fruiting is Unreliable', () => {
  const plant = {
    slug: 'probe-fruit',
    tags: ['fruit', 'tree'],
    climateTraits: { groupIds: ['temperate-chill-fruit-tree'] }
  };
  const derived = {
    survival: 'reliable',
    growth: 'supported',
    flowering: 'supported',
    fruiting: 'unreliable'
  };
  const aligned = alignSmartRecSuitabilityWithValidatedOutcomes(
    { recommendationLevel: 'good', suitabilityScore: 88, hardSurvivalBlocked: false },
    derived,
    { plant, meta: plant.climateTraits, intent: { answers: { q9: 'food-herbs' } } }
  );
  assert.equal(aligned.purpose.role, 'fruiting-crop');
  assert.equal(aligned.purposeFit.status, PURPOSE_FIT_STATUS.UNSUITABLE);
  assert.notEqual(aligned.recommendationLevel, 'good');
  assert.notEqual(aligned.recommendationLevel, 'excellent');
  assert.equal(isPositiveRecommendationRank(aligned.recommendationLevel), false);
  assert.match(aligned.recommendationLabel, /Not for fruit/i);
});

test('B. flowering-purpose cannot be Good when sourced Flowering is Unlikely', () => {
  const plant = {
    slug: 'probe-flower',
    tags: ['ornamental', 'flowering'],
    climateTraits: { floweringRequirements: 'Summer display.' }
  };
  const aligned = alignSmartRecSuitabilityWithValidatedOutcomes(
    { recommendationLevel: 'good', suitabilityScore: 90, hardSurvivalBlocked: false },
    { survival: 'reliable', growth: 'supported', flowering: 'unlikely', fruiting: 'unknown' },
    { plant, meta: plant.climateTraits, intent: { answers: { q6: 'yes-flowering' } } }
  );
  assert.equal(aligned.purpose.role, 'flowering-ornamental');
  assert.equal(aligned.purposeFit.status, PURPOSE_FIT_STATUS.UNSUITABLE);
  assert.equal(isPositiveRecommendationRank(aligned.recommendationLevel), false);
  assert.match(aligned.recommendationLabel, /Not for flowers/i);
});

test('C. root/leaf harvest is not penalized for irrelevant Fruiting UNKNOWN', () => {
  const carrot = loadSeedPlant('carrot');
  const moj = loadMojstranaClimate();
  const row = evaluateAligned({
    plant: carrot,
    climate: moj,
    intent: { answers: { q9: 'food-herbs' } }
  });
  assert.ok(row.capabilities.includes('vegetative-harvest'));
  assert.equal(row.purpose.role, 'vegetative-harvest');
  assert.deepEqual(row.purposeFit.primary, ['survival', 'growth']);
  assert.equal(row.purposeFit.primary.includes('fruiting'), false);
  assert.notEqual(row.purposeFit.status, PURPOSE_FIT_STATUS.UNSUITABLE);
  if (row.fruiting === 'unknown') {
    assert.notEqual(row.purposeFit.status, PURPOSE_FIT_STATUS.UNSUITABLE);
  }
});

test('D. foliage/structure is not penalized for irrelevant reproductive UNKNOWN', () => {
  const bay = loadSeedPlant('bay-laurel');
  const moj = loadMojstranaClimate();
  const row = evaluateAligned({
    plant: bay,
    climate: moj,
    intent: { answers: { q6: 'foliage' } }
  });
  assert.equal(row.purpose.role, 'foliage-structure');
  assert.deepEqual(row.purposeFit.primary, ['survival', 'growth']);
  assert.equal(row.purposeFit.primary.includes('flowering'), false);
  assert.equal(row.purposeFit.primary.includes('fruiting'), false);
});

test('E. hard Survival blocker always wins', () => {
  const lemon = loadRuntimePlant('lemon');
  const moj = loadMojstranaClimate();
  const row = evaluateAligned({
    plant: lemon,
    climate: moj,
    intent: { answers: { q6: 'foliage' } }
  });
  assert.equal(row.hardBlocked, true);
  assert.equal(row.survival, 'unreliable');
  assert.equal(row.purposeFit.status, PURPOSE_FIT_STATUS.BLOCKED);
  assert.equal(row.recommendationLevel, 'blocked');
});

test('F. UNKNOWN remains provisional, never promoted to Good', () => {
  const plant = {
    slug: 'probe-unknown-fruit',
    tags: ['fruit'],
    climateTraits: { groupIds: ['temperate-chill-fruit-tree'] }
  };
  const aligned = alignSmartRecSuitabilityWithValidatedOutcomes(
    { recommendationLevel: 'good', suitabilityScore: 91, hardSurvivalBlocked: false },
    { survival: 'reliable', growth: 'supported', flowering: 'unknown', fruiting: 'unknown' },
    { plant, meta: plant.climateTraits, intent: { answers: { q5: 'yes-edible' } } }
  );
  assert.equal(aligned.purposeFit.status, PURPOSE_FIT_STATUS.EVIDENCE_LIMITED);
  assert.equal(isPositiveRecommendationRank(aligned.recommendationLevel), false);
  assert.match(aligned.recommendationLabel, /Evidence-limited for fruit/i);
});

test('G. explicit user purpose outranks default catalog purpose', () => {
  const peony = loadSeedPlant('garden-peony');
  const catalog = resolveSmartRecPurpose({ plant: peony, meta: peony.climateTraits });
  const foliage = resolveSmartRecPurpose({
    plant: peony,
    meta: peony.climateTraits,
    intent: { answers: { q6: 'foliage' } }
  });
  assert.equal(catalog.role, 'flowering-ornamental');
  assert.equal(catalog.source, 'catalog');
  assert.equal(foliage.role, 'foliage-structure');
  assert.match(foliage.source, /^user/);
});

test('H. same canonical plant can be evaluated for multiple purposes', () => {
  const bay = loadSeedPlant('bay-laurel');
  const moj = loadMojstranaClimate();
  const foliage = evaluateAligned({
    plant: bay,
    climate: moj,
    intent: { answers: { q6: 'foliage' } }
  });
  const harvest = evaluateAligned({
    plant: bay,
    climate: moj,
    intent: { answers: { q9: 'food-herbs' } }
  });
  assert.equal(foliage.slug, harvest.slug);
  assert.equal(foliage.survival, harvest.survival);
  assert.equal(foliage.growth, harvest.growth);
  assert.equal(foliage.flowering, harvest.flowering);
  assert.equal(foliage.fruiting, harvest.fruiting);
  assert.equal(foliage.purpose.role, 'foliage-structure');
  assert.equal(harvest.purpose.role, 'vegetative-harvest');
});

test('I. ranking respects purpose-fit before generic tie-break score', () => {
  const suitable = {
    hardSurvivalBlocked: false,
    recommendationLevel: 'borderline',
    suitabilityScore: 40,
    purposeFit: { status: PURPOSE_FIT_STATUS.SUITABLE }
  };
  const limited = {
    hardSurvivalBlocked: false,
    recommendationLevel: 'good',
    suitabilityScore: 99,
    purposeFit: { status: PURPOSE_FIT_STATUS.EVIDENCE_LIMITED }
  };
  assert.ok(compareSmartRecRecommendationRank(suitable, limited) < 0);
});

test('real catalog matrix rows stay evidence-honest', () => {
  const moj = loadMojstranaClimate();
  const kochi = loadPilotClimate('kochi');
  const food = { answers: { q9: 'food-herbs' } };
  const flowers = { answers: { q6: 'yes-flowering' } };
  const rows = [
    evaluateAligned({ plant: loadSeedPlant('english-walnut'), climate: moj, intent: food }),
    evaluateAligned({ plant: loadSeedPlant('garden-peony'), climate: moj, intent: flowers }),
    evaluateAligned({ plant: loadSeedPlant('carrot'), climate: moj, intent: food }),
    evaluateAligned({ plant: loadSeedPlant('broccoli'), climate: moj, intent: food }),
    evaluateAligned({ plant: loadRuntimePlant('lavender'), climate: moj, intent: flowers }),
    evaluateAligned({ plant: loadRuntimePlant('apple'), climate: kochi, intent: food }),
    evaluateAligned({ plant: loadRuntimePlant('lemon'), climate: moj, intent: food }),
    evaluateAligned({ plant: loadSeedPlant('bay-laurel'), climate: moj, intent: { answers: { q6: 'foliage' } } })
  ];
  const walnut = rows.find((r) => r.slug === 'english-walnut');
  assert.equal(walnut.purpose.role, 'fruiting-crop');
  assert.notEqual(walnut.recommendationLevel, 'good');
  const peony = rows.find((r) => r.slug === 'garden-peony');
  assert.equal(peony.purpose.role, 'flowering-ornamental');
  if (peony.flowering === 'unlikely') {
    assert.equal(isPositiveRecommendationRank(peony.recommendationLevel), false);
  }
  if (peony.flowering === 'unknown') {
    assert.equal(peony.purposeFit.status, PURPOSE_FIT_STATUS.EVIDENCE_LIMITED);
    assert.equal(isPositiveRecommendationRank(peony.recommendationLevel), false);
  }
  const carrot = rows.find((r) => r.slug === 'carrot');
  assert.equal(carrot.purpose.role, 'vegetative-harvest');
  const broccoli = rows.find((r) => r.slug === 'broccoli');
  assert.equal(broccoli.purpose.role, 'vegetative-harvest');
  const lemon = rows.find((r) => r.slug === 'lemon');
  assert.equal(lemon.purposeFit.status, PURPOSE_FIT_STATUS.BLOCKED);
  const apple = rows.find((r) => r.slug === 'apple');
  assert.equal(apple.purpose.role, 'fruiting-crop');
  assert.ok(
    apple.flowering === 'unlikely' || apple.fruiting === 'unreliable' || apple.purposeFit.status !== PURPOSE_FIT_STATUS.SUITABLE
  );
});

test('no common-name hardcodes in the purpose policy', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'modules', 'smart-recommendations', 'smart-rec-purpose-policy-v1.js'),
    'utf8'
  );
  assert.doesNotMatch(src, /english-walnut|garden-peony|carrot|broccoli|lavender|walnut|peony/i);
  assert.doesNotMatch(src, /mojstrana|kochi/i);
  const app = fs.readFileSync(APP, 'utf8');
  assert.match(app, /smart-rec-garden-intelligence-v1\.js\?v=20260915c/);
  assert.match(app, /recommendationLabel/);
});

test('J. paid AI automated calls stay 0', () => {
  assert.equal(isPaidAiAutomatedTestAllowed(), false);
  assert.equal(paidNetwork, 0);
  assert.equal(getCoordinateClimateRuntimeCounters().chelsaExternalCalls, 0);
});
