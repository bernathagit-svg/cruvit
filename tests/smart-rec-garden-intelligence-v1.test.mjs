/**
 * Smart Recommendations → Garden Intelligence V1.
 * Zero paid AI. No render-time image search. Catalog Images V1 only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IMAGE_BLOCKED,
  IMAGE_READY,
  SMART_REC_SPECIES_ALIAS_ONTO_CANONICAL,
  attachSmartRecCatalogImage,
  buildSmartRecCardModel,
  buildSmartRecCatalogBySlug,
  compareSmartRecRecommendationRank,
  isPositiveRecommendationIneligible,
  ownedCanonicalSlugSet,
  resolveSmartRecCanonicalSlug,
  resolveSmartRecCatalogDisplay,
  smartRecContextFromGardenArea,
  smartRecDimensionDisplay
} from '../modules/smart-recommendations/smart-rec-garden-intelligence-v1.js';
import {
  HIGH_VISIBILITY_GAPS,
  SPECIES_ALIAS_ONTO_CANONICAL,
  WAVE1_NEW_SEED_SLUGS,
  buildActiveCanonicalImageCoverage
} from '../modules/catalog-media/active-canonical-image-coverage-v1.js';
import {
  mayPromoteUserMediaToCatalogImage,
  resolvePlantDisplayMedia
} from '../modules/catalog-media/licensed-catalog-media-runtime-v1.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import { FIXTURE_PROVIDER_CALLS } from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'app.html');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const MODULE = path.join(ROOT, 'modules', 'smart-recommendations', 'smart-rec-garden-intelligence-v1.js');

let paidNetwork = 0;
const origFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url || '');
  if (/anthropic|api\.openai|wikimedia|commons\.wikimedia|openverse|unsplash|bing/i.test(u)) {
    paidNetwork += 1;
  }
  throw new Error('network forbidden in smart-rec garden intelligence tests: ' + u);
};

function loadSeed() {
  return JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
}

function catalogIndexFromCoverage() {
  const coverage = buildActiveCanonicalImageCoverage(ROOT);
  const seed = loadSeed();
  const seedBySlug = new Map((seed.plants || []).map((p) => [p.slug, p]));
  const plantIndex = {};
  for (const r of coverage.records) {
    const seedP = seedBySlug.get(r.slug) || {};
    const media = seedP.media || seed.catalogMediaByCanonicalSlug?.[r.slug] || null;
    plantIndex[r.slug] = {
      slug: r.slug,
      name: r.name,
      scientific: r.scientific || seedP.scientific || '',
      climateTraits: seedP.climateTraits || null,
      catalogMedia: media,
      media
    };
  }
  return { coverage, plantIndex, catalogBySlug: buildSmartRecCatalogBySlug(plantIndex) };
}

test('paid AI automated tests = 0', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
  assert.equal(paidNetwork, 0);
});

test('species aliases match Catalog Images (not a second image authority)', () => {
  assert.deepEqual({ ...SMART_REC_SPECIES_ALIAS_ONTO_CANONICAL }, { ...SPECIES_ALIAS_ONTO_CANONICAL });
});

test('every IMAGE_READY recommendation renders its catalog image', () => {
  const { coverage, catalogBySlug, plantIndex } = catalogIndexFromCoverage();
  const ready = coverage.records.filter((r) => r.imageStatus === IMAGE_READY);
  assert.ok(ready.length >= 100);
  for (const row of ready) {
    const plant = plantIndex[row.slug];
    const display = resolveSmartRecCatalogDisplay(plant, catalogBySlug);
    assert.equal(display.kind, 'catalog', row.slug);
    assert.match(display.url, /^https:\/\//, row.slug);
    assert.equal(display.imageStatus, IMAGE_READY, row.slug);
    const model = buildSmartRecCardModel(plant, {
      catalogBySlug,
      suitability: { survivalFit: 80, thriveFit: 70, floweringFit: 60, fruitingFit: 50, recommendationLevel: 'good' }
    });
    assert.equal(model.imageUrl, display.url);
    assert.equal(model.placeholder, false);
    assert.equal(model.userUploadRequired, false);
    assert.equal(model.renderTimeImageSearch, false);
  }
});

test('IMAGE_BLOCKED recommendation falls back honestly', () => {
  const { catalogBySlug, plantIndex } = catalogIndexFromCoverage();
  const succulent = plantIndex.succulent;
  assert.ok(succulent);
  const display = resolveSmartRecCatalogDisplay(succulent, catalogBySlug);
  assert.equal(display.kind, 'placeholder');
  assert.equal(display.imageStatus, IMAGE_BLOCKED);
  const model = buildSmartRecCardModel(succulent, { catalogBySlug });
  assert.equal(model.placeholder, true);
  assert.equal(model.imageStatus, IMAGE_BLOCKED);
  assert.equal(model.imageUrl, '');
});

test('alias recommendation resolves canonical image', () => {
  const { catalogBySlug, plantIndex } = catalogIndexFromCoverage();
  assert.equal(resolveSmartRecCanonicalSlug('english-lavender'), 'lavender');
  assert.equal(resolveSmartRecCanonicalSlug('spearmint'), 'mint');
  assert.equal(resolveSmartRecCanonicalSlug('common-jasmine'), 'jasmine');
  assert.equal(resolveSmartRecCanonicalSlug('bell-pepper'), 'sweet-pepper');
  const aliasPlant = { slug: 'english-lavender', name: 'English lavender', scientific: 'Lavandula angustifolia' };
  const attached = attachSmartRecCatalogImage(aliasPlant, catalogBySlug);
  assert.equal(attached.slug, 'lavender');
  const display = resolveSmartRecCatalogDisplay(aliasPlant, catalogBySlug);
  const canon = resolveSmartRecCatalogDisplay(plantIndex.lavender, catalogBySlug);
  assert.equal(display.kind, canon.kind);
  assert.equal(display.url, canon.url);
});

test('no render-time image search and no user media as catalog image', () => {
  assert.equal(mayPromoteUserMediaToCatalogImage(), false);
  const src = fs.readFileSync(MODULE, 'utf8');
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /unsplash|openverse|wikipedia|bing/i);
  const { catalogBySlug, plantIndex } = catalogIndexFromCoverage();
  const gardenPlant = {
    slug: 'mango',
    name: 'Mango',
    scientific: 'Mangifera indica',
    scanPhotoUrl: 'data:image/jpeg;base64,USERSCAN',
    photoUrl: 'data:image/jpeg;base64,USERSCAN',
    catalogMedia: plantIndex.mango.catalogMedia,
    media: plantIndex.mango.media
  };
  const display = resolvePlantDisplayMedia(attachSmartRecCatalogImage(gardenPlant, catalogBySlug));
  assert.notEqual(display.url, gardenPlant.scanPhotoUrl);
  if (display.kind === 'catalog') assert.match(display.url, /^https:\/\//);
});

test('recommendation Add to My Garden preserves canonical identity', () => {
  assert.equal(resolveSmartRecCanonicalSlug('apple-tree'), 'apple');
  const owned = ownedCanonicalSlugSet([{ profileSlug: 'english-lavender' }, { slug: 'mint' }]);
  assert.equal(owned.has('lavender'), true);
  assert.equal(owned.has('english-lavender'), false);
  assert.equal(owned.has('mint'), true);
  const app = fs.readFileSync(APP, 'utf8');
  assert.match(app, /currentPlantSetup=\{slug:canon,source\}/);
  assert.match(app, /savePlantFromLibrary\(currentPlantSetup\.slug/);
  assert.match(app, /SPECIES_PACKET_ALIAS_TO_CANONICAL/);
});

test('Mango / Pineapple / Banana images resolve correctly', () => {
  const { catalogBySlug, plantIndex, coverage } = catalogIndexFromCoverage();
  for (const slug of HIGH_VISIBILITY_GAPS) {
    const row = coverage.records.find((r) => r.slug === slug);
    assert.ok(row, slug);
    const display = resolveSmartRecCatalogDisplay(plantIndex[slug], catalogBySlug);
    if (row.imageStatus === IMAGE_READY) {
      assert.equal(display.kind, 'catalog', slug);
      assert.match(display.url, /^https:\/\//, slug);
    } else {
      assert.equal(display.kind, 'placeholder', slug);
    }
  }
});

test('Wave 1 plants resolve correctly', () => {
  const { catalogBySlug, plantIndex, coverage } = catalogIndexFromCoverage();
  for (const slug of WAVE1_NEW_SEED_SLUGS) {
    const row = coverage.records.find((r) => r.slug === slug);
    assert.ok(row, slug);
    const display = resolveSmartRecCatalogDisplay(plantIndex[slug], catalogBySlug);
    if (row.imageStatus === IMAGE_READY) {
      assert.equal(display.kind, 'catalog', slug);
    } else {
      assert.equal(display.imageStatus === IMAGE_BLOCKED || display.placeholder, true, slug);
    }
  }
});

test('suitability outputs stay four-dimensional; UNKNOWN remains valid', () => {
  const dims = smartRecDimensionDisplay(
    { survivalFit: 80, thriveFit: 55, floweringFit: 70, fruitingFit: 20 },
    { floweringRequirements: '', fruitingRequirements: '' },
    { climateTraits: {} }
  );
  assert.equal(dims.survival, 'strong');
  assert.equal(dims.growth, 'limited');
  assert.equal(dims.flowering, 'UNKNOWN');
  assert.equal(dims.fruiting, 'UNKNOWN');
  const withReqs = smartRecDimensionDisplay(
    { survivalFit: 80, thriveFit: 55, floweringFit: 70, fruitingFit: 20 },
    { floweringRequirements: 'Needs sun', fruitingRequirements: 'Needs chill' },
    {}
  );
  assert.equal(withReqs.flowering, 'strong');
  assert.equal(withReqs.fruiting, 'weak');
});

test('Garden Area overlay fills missing answers and does not override user answers', () => {
  const fromArea = smartRecContextFromGardenArea({ sunExposure: 'full_sun', plantingMode: 'container' }, {});
  assert.equal(fromArea.q2, 'full-sun');
  assert.equal(fromArea.q1, 'balcony');
  const userWins = smartRecContextFromGardenArea(
    { sunExposure: 'full_sun', plantingMode: 'container' },
    { q2: 'shade', q1: 'ground' }
  );
  assert.equal(userWins.q2, 'shade');
  assert.equal(userWins.q1, 'ground');
});

test('app wiring: catalog intelligence module, no Design start, no Identifier rewrite', () => {
  const app = fs.readFileSync(APP, 'utf8');
  assert.match(app, /smart-rec-garden-intelligence-v1\.js/);
  assert.match(app, /buildSmartRecCardModel/);
  assert.match(app, /alignSmartRecSuitabilityWithValidatedOutcomes/);
  assert.match(app, /isPositiveRecommendationIneligible/);
  assert.match(app, /data-sr-outcome="\$\{escapeAttr\(key\)\}"/);
  assert.match(app, /row\('survival',copy\.survival\)/);
  assert.match(app, /row\('growth',copy\.growth\)/);
  assert.match(app, /row\('flowering',copy\.flowering\)/);
  assert.match(app, /row\('fruiting',copy\.fruiting\)/);
  assert.doesNotMatch(app, /Garden Design integration started/);
  const module = fs.readFileSync(MODULE, 'utf8');
  assert.doesNotMatch(module, /plant-identifier-garden-acquire/);
  assert.doesNotMatch(module, /garden-design/);
});

test('paid network remains 0 after Smart Rec Garden Intelligence proofs', () => {
  assert.equal(paidNetwork, 0);
  globalThis.fetch = origFetch;
});


test('explicit positiveRecommendationEligible=false is authoritative for ranking eligibility',()=>{
  assert.equal(isPositiveRecommendationIneligible({
    positiveRecommendationEligible:false,
    recommendationLevel:'good',
    hardSurvivalBlocked:false,
    derivedOverall:'possible',
    derivedSurvival:'supported'
  }),true);
});

test('positive eligibility remains allowed when explicit flag is true and survival is viable',()=>{
  assert.equal(isPositiveRecommendationIneligible({
    positiveRecommendationEligible:true,
    recommendationLevel:'good',
    hardSurvivalBlocked:false,
    derivedOverall:'possible',
    derivedSurvival:'supported'
  }),false);
});

test('explicitly ineligible plant ranks behind otherwise-equal eligible plant',()=>{
  const eligible={
    positiveRecommendationEligible:true,
    recommendationLevel:'good',
    suitabilityScore:75
  };
  const ineligible={
    positiveRecommendationEligible:false,
    recommendationLevel:'good',
    suitabilityScore:95
  };
  assert.ok(compareSmartRecRecommendationRank(eligible,ineligible)<0);
  assert.ok(compareSmartRecRecommendationRank(ineligible,eligible)>0);
});
