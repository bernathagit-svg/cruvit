/**
 * Smart Recommendations consumes validated Garden Suitability truth.
 * Does not modify the suitability engine. Zero paid AI. No live climate fetch.
 *
 * Run: node --test tests/smart-rec-suitability-authority-v1.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyHardClimateSurvivalToFits,
  elevateAmbientFreezingRisk,
  enforceSurvivalDownstreamCaps,
  evaluateHardClimateSurvival,
  isExplicitFrostFreeProtectedContext,
  isHardFrostLimiter
} from '../modules/suitability/hard-climate-survival-gate-v1.js';
import {
  deriveSpecificPlantOutcomes,
  findCatalogPlantBySlugOrName,
  structuralEnvironmentFromClimateProfile
} from '../modules/personal-domain/specific-plant-suitability-contract.js';
import { BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1 } from '../modules/personal-domain/bootstrap-safe-climate-traits-migration-data-v1.js';
import { coordinateClimateProfileToStructuralPersistence } from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import {
  resolveGardenStructuralClimateFromCoordinateV2,
  resetCoordinateClimateRuntimeCounters,
  getCoordinateClimateRuntimeCounters
} from '../modules/personal-domain/coordinate-climate-garden-hydrate-v2.js';
import { clearGlobalRuntimeCaches } from '../modules/personal-domain/coordinate-climate-global-lookup-v2.js';
import {
  IMAGE_READY,
  alignSmartRecSuitabilityWithValidatedOutcomes,
  buildSmartRecCardModel,
  buildSmartRecCatalogBySlug,
  compareSmartRecRecommendationRank,
  formatSmartRecOutcomeBand,
  isPositiveRecommendationIneligible,
  isPositiveRecommendationRank,
  resolveSmartRecCanonicalSlug,
  resolveSmartRecCatalogDisplay
} from '../modules/smart-recommendations/smart-rec-garden-intelligence-v1.js';
import { buildActiveCanonicalImageCoverage } from '../modules/catalog-media/active-canonical-image-coverage-v1.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import { FIXTURE_PROVIDER_CALLS } from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'app.html');
const GATE = path.join(ROOT, 'modules', 'suitability', 'hard-climate-survival-gate-v1.js');
const CONTRACT = path.join(ROOT, 'modules', 'personal-domain', 'specific-plant-suitability-contract.js');
const MODULE = path.join(ROOT, 'modules', 'smart-recommendations', 'smart-rec-garden-intelligence-v1.js');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const DATA = path.join(ROOT, 'data', 'coordinate-climate', 'v2');

let paidNetwork = 0;
const origFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url || '');
  if (/anthropic|api\.openai|plant-identify|claude/i.test(u)) paidNetwork += 1;
  throw new Error('network forbidden in smart-rec suitability authority tests: ' + u);
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
      return { slug, name: slug, climateTraits: traits };
    }
  } catch {
    /* library row may omit climateTraits; use bootstrap/seed overlay */
  }
  const safe = BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1.plants?.[slug];
  if (safe?.climateTraits) {
    return {
      slug,
      name: safe.name || slug,
      scientific: safe.scientific,
      climateTraits: safe.climateTraits
    };
  }
  return loadSeedPlant(slug);
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
    loc,
    climateProfile: { ...climateProfile, ...env, isFrostFreeGrowingClimate: env.isFrostFreeGrowingClimate }
  };
}

function consumeSmartRecFromEngine({ plant, climate, protection = { plantingMode: 'ground' } }) {
  const meta = plant.climateTraits;
  const protectedGrowing = isExplicitFrostFreeProtectedContext(protection);
  const verdict = evaluateHardClimateSurvival({
    meta,
    climateProfile: climate.climateProfile,
    protectionContext: protection,
    coords: climate.loc || {}
  });
  const fits = applyHardClimateSurvivalToFits(
    { survivalFit: 85, thriveFit: 80, floweringFit: 70, fruitingFit: 70, heatColdFit: 80 },
    verdict
  );
  enforceSurvivalDownstreamCaps(fits);
  const honest = {
    survivalFit: fits.survivalFit,
    thriveFit: fits.thriveFit,
    floweringFit: fits.floweringFit,
    fruitingFit: fits.fruitingFit,
    hardSurvivalBlocked: fits.hardSurvivalBlocked === true,
    recommendationLevel: verdict.hardBlocked ? 'blocked' : 'good',
    suitabilityScore: verdict.hardBlocked ? 0 : Math.max(0, Math.round(fits.survivalFit)),
    warnings: verdict.reason ? [verdict.reason] : [],
    explanationText: verdict.reason || ''
  };
  const derived = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: climate.climateProfile,
    suitability: honest,
    plant,
    protectedGrowing
  });
  const aligned = alignSmartRecSuitabilityWithValidatedOutcomes(honest, derived);
  const ineligible = isPositiveRecommendationIneligible({
    hardSurvivalBlocked: aligned.hardSurvivalBlocked,
    recommendationLevel: aligned.recommendationLevel,
    derivedOverall: derived.overall,
    derivedSurvival: derived.survival
  });
  const catalogBySlug = buildSmartRecCatalogBySlug({ [plant.slug]: plant });
  const card = buildSmartRecCardModel(
    {
      slug: plant.slug,
      name: plant.name,
      scientific: plant.scientific,
      smartRecSuitability: aligned,
      smartRecDerivedOutcomes: derived
    },
    { catalogBySlug, suitability: aligned, derivedOutcomes: derived, meta }
  );
  return { plant, verdict, derived, aligned, ineligible, card };
}

test('paid AI automated tests = 0', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
  assert.equal(paidNetwork, 0);
});

test('stale excellent score cannot override hard-blocked Survival', () => {
  const aligned = alignSmartRecSuitabilityWithValidatedOutcomes(
    {
      suitabilityScore: 92,
      recommendationLevel: 'excellent',
      hardSurvivalBlocked: true,
      survivalFit: 90,
      thriveFit: 88,
      explanationText: 'Looks like a good garden match'
    },
    {
      overall: 'blocked',
      survival: 'unreliable',
      survivalLabel: 'Unreliable',
      growthLabel: 'Unreliable',
      floweringLabel: 'Unlikely',
      fruitingLabel: 'Unreliable',
      limitingFactors: ['Hard frost / freeze risk is too high for outdoor survival.']
    }
  );
  assert.equal(aligned.recommendationLevel, 'blocked');
  assert.equal(aligned.suitabilityScore, 0);
  assert.equal(aligned.hardSurvivalBlocked, true);
  assert.equal(isPositiveRecommendationRank(aligned.recommendationLevel), false);
  assert.equal(
    isPositiveRecommendationIneligible({
      hardSurvivalBlocked: aligned.hardSurvivalBlocked,
      recommendationLevel: aligned.recommendationLevel,
      derivedOverall: 'blocked',
      derivedSurvival: 'unreliable'
    }),
    true
  );
  const card = buildSmartRecCardModel(
    { slug: 'mango', name: 'Mango', smartRecSuitability: aligned },
    {
      suitability: aligned,
      derivedOutcomes: {
        survivalLabel: 'Unreliable',
        growthLabel: 'Unreliable',
        floweringLabel: 'Unlikely',
        fruitingLabel: 'Unreliable',
        limitingFactors: aligned.explanationText ? [aligned.explanationText] : []
      }
    }
  );
  assert.equal(card.outcomes.survival, 'Unreliable');
  assert.notEqual(card.outcomes.survival, formatSmartRecOutcomeBand(90));
  assert.match(card.limiter, /frost|freeze/i);
});

test('Mojstrana outdoor: lemon / mango / pineapple cannot rank as positive recommendations', () => {
  const moj = loadMojstranaClimate();
  assert.equal(elevateAmbientFreezingRisk(moj.climateProfile, moj.loc), 'high');
  const rows = ['lemon', 'mango', 'pineapple'].map((slug) => {
    const plant = slug === 'pineapple' ? loadSeedPlant(slug) : loadRuntimePlant(slug);
    return consumeSmartRecFromEngine({ plant, climate: moj, protection: { plantingMode: 'ground' } });
  });
  for (const row of rows) {
    assert.equal(row.verdict.hardBlocked, true, row.plant.slug);
    assert.equal(row.derived.survival, 'unreliable', row.plant.slug);
    assert.equal(row.derived.overall, 'blocked', row.plant.slug);
    assert.equal(row.ineligible, true, row.plant.slug);
    assert.equal(row.aligned.recommendationLevel, 'blocked', row.plant.slug);
    assert.equal(row.aligned.suitabilityScore, 0, row.plant.slug);
    assert.equal(isPositiveRecommendationRank(row.aligned.recommendationLevel), false, row.plant.slug);
    assert.equal(row.card.outcomes.survival, row.derived.survivalLabel, row.plant.slug);
    assert.equal(row.card.outcomes.growth, row.derived.growthLabel, row.plant.slug);
    assert.equal(row.card.outcomes.flowering, row.derived.floweringLabel, row.plant.slug);
    assert.equal(row.card.outcomes.fruiting, row.derived.fruitingLabel, row.plant.slug);
    assert.equal(isHardFrostLimiter(row.card.limiter), true, row.plant.slug + ' ' + row.card.limiter);
    const leaked = alignSmartRecSuitabilityWithValidatedOutcomes(
      {
        suitabilityScore: 91,
        recommendationLevel: 'good',
        hardSurvivalBlocked: row.verdict.hardBlocked,
        survivalFit: 80,
        explanationText: 'Generic suitabilityScore'
      },
      row.derived
    );
    assert.equal(leaked.recommendationLevel, 'blocked', row.plant.slug);
    assert.equal(isPositiveRecommendationRank(leaked.recommendationLevel), false, row.plant.slug);
  }
  assert.equal(getCoordinateClimateRuntimeCounters().chelsaExternalCalls, 0);
});

test('Mojstrana outdoor: lavender remains recommendable and ranks above hard-blocked plants', () => {
  const moj = loadMojstranaClimate();
  const lavender = consumeSmartRecFromEngine({
    plant: loadRuntimePlant('lavender'),
    climate: moj,
    protection: { plantingMode: 'ground' }
  });
  const mango = consumeSmartRecFromEngine({
    plant: loadRuntimePlant('mango'),
    climate: moj,
    protection: { plantingMode: 'ground' }
  });
  assert.equal(lavender.verdict.hardBlocked, false);
  assert.notEqual(lavender.derived.survival, 'unreliable');
  assert.notEqual(lavender.derived.overall, 'blocked');
  assert.equal(lavender.ineligible, false);
  assert.notEqual(lavender.aligned.recommendationLevel, 'blocked');
  assert.equal(lavender.card.outcomes.survival, lavender.derived.survivalLabel);
  assert.equal(isHardFrostLimiter(lavender.card.limiter), false);

  const ranked = [mango.aligned, lavender.aligned].sort(compareSmartRecRecommendationRank);
  assert.equal(ranked[0], lavender.aligned);
  assert.equal(ranked[1], mango.aligned);

  const browse = [mango, lavender]
    .filter((row) => !row.ineligible)
    .sort((a, b) => compareSmartRecRecommendationRank(a.aligned, b.aligned))
    .slice(0, 12)
    .map((row) => row.plant.slug);
  assert.deepEqual(browse, ['lavender']);
  assert.equal(browse.includes('mango'), false);
});

test('IMAGE_READY catalog image and alias resolve without render-time search', () => {
  const coverage = buildActiveCanonicalImageCoverage(ROOT);
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  const seedBySlug = new Map((seed.plants || []).map((p) => [p.slug, p]));
  const plantIndex = {};
  for (const r of coverage.records) {
    const seedP = seedBySlug.get(r.slug) || {};
    plantIndex[r.slug] = {
      slug: r.slug,
      name: r.name,
      scientific: r.scientific || seedP.scientific || '',
      catalogMedia: seedP.media || seed.catalogMediaByCanonicalSlug?.[r.slug] || null,
      media: seedP.media || seed.catalogMediaByCanonicalSlug?.[r.slug] || null
    };
  }
  const catalogBySlug = buildSmartRecCatalogBySlug(plantIndex);
  const lavenderReady = coverage.records.find((r) => r.slug === 'lavender');
  assert.ok(lavenderReady);
  assert.equal(lavenderReady.imageStatus, IMAGE_READY);
  const display = resolveSmartRecCatalogDisplay(plantIndex.lavender, catalogBySlug);
  assert.equal(display.kind, 'catalog');
  assert.match(display.url, /^https:\/\//);
  assert.equal(resolveSmartRecCanonicalSlug('english-lavender'), 'lavender');
  const aliasCard = buildSmartRecCardModel(
    { slug: 'english-lavender', name: 'English lavender', scientific: 'Lavandula angustifolia' },
    { catalogBySlug }
  );
  assert.equal(aliasCard.canonicalSlug, 'lavender');
  assert.equal(aliasCard.imageUrl, display.url);
  assert.equal(aliasCard.userUploadRequired, false);
  assert.equal(aliasCard.renderTimeImageSearch, false);
});

test('app wiring consumes validated outcomes; Add keeps canonical identity; no parallel authorities', () => {
  const app = fs.readFileSync(APP, 'utf8');
  const module = fs.readFileSync(MODULE, 'utf8');
  const gate = fs.readFileSync(GATE, 'utf8');
  const contract = fs.readFileSync(CONTRACT, 'utf8');
  assert.match(app, /smartRecDeriveValidatedOutcomes/);
  assert.match(app, /cruvitDeriveSpecificPlantOutcomes/);
  assert.match(app, /alignSmartRecSuitabilityWithValidatedOutcomes/);
  assert.match(app, /isPositiveRecommendationIneligible/);
  assert.match(app, /smartRecDerivedOutcomes/);
  assert.match(app, /derivedOutcomes:p\.smartRecDerivedOutcomes/);
  assert.match(app, /currentPlantSetup=\{slug:canon,source\}/);
  assert.match(app, /savePlantFromLibrary\(currentPlantSetup\.slug/);
  assert.match(app, /async function fetchPlantImageFromWikipedia[\s\S]*?return '';/);
  assert.match(app, /async function hydratePlantResultImages\(\)\{[\s\S]*?return;/);
  assert.match(app, /smart-rec-garden-intelligence-v1\.js\?v=20260914b/);
  assert.doesNotMatch(app, /Garden Design integration started/);
  assert.doesNotMatch(module, /garden-design/);
  assert.doesNotMatch(module, /fetch\(/);
  assert.doesNotMatch(module, /unsplash|openverse|wikipedia|bing/i);
  assert.match(gate, /export function evaluateHardClimateSurvival/);
  assert.match(contract, /export function deriveSpecificPlantOutcomes/);
});

test('paid network remains 0 after Smart Rec authority proofs', () => {
  assert.equal(paidNetwork, 0);
  assert.equal(getCoordinateClimateRuntimeCounters().chelsaExternalCalls, 0);
  globalThis.fetch = origFetch;
});
