/**
 * Smart Recommendations live render — eligible cards must reach the DOM.
 * Does not modify the suitability engine. Zero paid AI.
 *
 * Run: node --test tests/smart-rec-live-render-v1.test.mjs
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
  alignSmartRecSuitabilityWithValidatedOutcomes,
  buildSmartRecCardModel,
  buildSmartRecCatalogBySlug,
  buildSmartRecVisibleResultsModel,
  isPositiveRecommendationIneligible,
  resolveSmartRecCanonicalSlug,
  smartRecEmptyStateKind
} from '../modules/smart-recommendations/smart-rec-garden-intelligence-v1.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import { FIXTURE_PROVIDER_CALLS } from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'app.html');
const CSS = path.join(ROOT, 'modules', 'smart-rec', 'smart-rec.host.css');
const GATE = path.join(ROOT, 'modules', 'suitability', 'hard-climate-survival-gate-v1.js');
const MODULE = path.join(ROOT, 'modules', 'smart-recommendations', 'smart-rec-garden-intelligence-v1.js');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const DATA = path.join(ROOT, 'data', 'coordinate-climate', 'v2');

let paidNetwork = 0;
const origFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url || '');
  if (/anthropic|api\.openai|plant-identify|claude/i.test(u)) paidNetwork += 1;
  throw new Error('network forbidden in smart-rec live render tests: ' + u);
};

function librarySlice() {
  const app = fs.readFileSync(APP, 'utf8');
  const start = app.indexOf('const PLANT_LIBRARY=[');
  const end = app.indexOf('function climateMetaFromCatalogTraits');
  return app.slice(start, end);
}

function catalogSlugs() {
  return [...new Set([...librarySlice().matchAll(/\{slug:'([^']+)'/g)].map((m) => m[1]))];
}

function traitsFromApp(slug) {
  const lib = librarySlice();
  const marker = `{slug:'${slug}',`;
  const i = lib.indexOf(marker);
  if (i < 0) return null;
  const next = lib.indexOf('{slug:', i + marker.length);
  const slice = lib.slice(i, next > i ? next : i + 20000);
  const key = 'climateTraits:';
  const s = slice.indexOf(key);
  if (s < 0) return null;
  const jsonStart = s + key.length;
  let depth = 0;
  let endIdx = jsonStart;
  for (; endIdx < slice.length; endIdx += 1) {
    const ch = slice[endIdx];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        endIdx += 1;
        break;
      }
    }
  }
  try {
    return JSON.parse(slice.slice(jsonStart, endIdx));
  } catch {
    return null;
  }
}

function loadSeedPlant(slug) {
  const raw = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  const plant = findCatalogPlantBySlugOrName(raw.plants || raw, slug);
  assert.ok(plant?.climateTraits, `seed plant missing: ${slug}`);
  return {
    slug: plant.slug,
    name: plant.names?.en || plant.name || slug,
    scientific: plant.scientific,
    climateTraits: plant.climateTraits
  };
}

function loadRuntimePlant(slug) {
  const traits = traitsFromApp(slug);
  if (traits && (traits.frostSensitivity || traits.coldTolerance || (traits.groupIds || []).length)) {
    return { slug, name: slug, climateTraits: traits };
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

function evaluateEligibility(plant, climate) {
  const meta = plant.climateTraits;
  const verdict = evaluateHardClimateSurvival({
    meta,
    climateProfile: climate.climateProfile,
    protectionContext: { plantingMode: 'ground' },
    coords: climate.loc
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
    suitabilityScore: verdict.hardBlocked ? 0 : Math.round(fits.survivalFit),
    explanationText: verdict.reason || ''
  };
  const derived = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: climate.climateProfile,
    suitability: honest,
    plant,
    protectedGrowing: false
  });
  const aligned = alignSmartRecSuitabilityWithValidatedOutcomes(honest, derived);
  const ineligible = isPositiveRecommendationIneligible({
    hardSurvivalBlocked: aligned.hardSurvivalBlocked,
    recommendationLevel: aligned.recommendationLevel,
    derivedOverall: derived.overall,
    derivedSurvival: derived.survival
  });
  return { plant, verdict, derived, aligned, ineligible };
}

function renderCardsHtml(plants) {
  return plants
    .map((row) => {
      const model = buildSmartRecCardModel(
        {
          slug: row.plant.slug,
          name: row.plant.name,
          scientific: row.plant.scientific,
          smartRecSuitability: row.aligned,
          smartRecDerivedOutcomes: row.derived
        },
        { suitability: row.aligned, derivedOutcomes: row.derived, meta: row.plant.climateTraits }
      );
      return `<article class="sr-plant-card" data-sr-plant-card="${model.canonicalSlug}"><h3>${model.name}</h3><dl class="sr-outcomes"><dd data-sr-outcome="survival">${model.outcomes.survival}</dd></dl><p class="sr-plant-limiter">${model.limiter}</p><button class="sr-plant-add">Add to My Garden</button></article>`;
    })
    .join('');
}

test('paid AI automated tests = 0', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
  assert.equal(paidNetwork, 0);
});

test('Mojstrana has eligible positive-control plants; tropicals stay excluded', () => {
  const moj = loadMojstranaClimate();
  assert.equal(elevateAmbientFreezingRisk(moj.climateProfile, moj.loc), 'high');
  const slugs = catalogSlugs();
  const withMeta = slugs
    .map((slug) => {
      try {
        return loadRuntimePlant(slug);
      } catch {
        return { slug, climateTraits: null };
      }
    })
    .filter((p) => p.climateTraits);
  const rows = withMeta.map((plant) => evaluateEligibility(plant, moj));
  const eligible = rows.filter((r) => !r.ineligible);
  const ineligible = rows.filter((r) => r.ineligible);
  assert.ok(slugs.length >= 40, 'canonical library candidates');
  assert.equal(withMeta.length, rows.length);
  assert.ok(eligible.length >= 1, 'eligible must not be empty');
  assert.ok(
    eligible.some((r) => r.plant.slug === 'lavender'),
    'lavender remains recommendable'
  );
  assert.ok(ineligible.length >= 3);
  for (const slug of ['lemon', 'mango']) {
    const row = rows.find((r) => r.plant.slug === slug);
    assert.ok(row, slug);
    assert.equal(row.ineligible, true, slug);
    assert.equal(row.verdict.hardBlocked, true, slug);
  }
  const pineapple = evaluateEligibility(loadSeedPlant('pineapple'), moj);
  assert.equal(pineapple.ineligible, true);
  assert.equal(pineapple.verdict.hardBlocked, true);
  assert.equal(getCoordinateClimateRuntimeCounters().chelsaExternalCalls, 0);
});

test('eligible result list reaches renderer and creates visible cards', () => {
  const moj = loadMojstranaClimate();
  const lavender = evaluateEligibility(loadRuntimePlant('lavender'), moj);
  assert.equal(lavender.ineligible, false);
  const waiting = buildSmartRecVisibleResultsModel({
    hasTrustedLocation: true,
    eligiblePlants: [],
    rankedLimit: 12
  });
  assert.equal(waiting.shouldRenderCards, false);
  assert.equal(waiting.emptyKind, 'none-eligible');
  assert.equal(waiting.renderedCardCount, 0);

  const gatedOff = buildSmartRecVisibleResultsModel({
    hasTrustedLocation: false,
    eligiblePlants: [lavender],
    rankedLimit: 12
  });
  assert.equal(gatedOff.emptyKind, 'need-location');
  assert.equal(gatedOff.shouldRenderCards, false);

  const live = buildSmartRecVisibleResultsModel({
    hasTrustedLocation: true,
    eligiblePlants: [lavender],
    rankedLimit: 12
  });
  assert.equal(live.emptyKind, null);
  assert.equal(live.shouldRenderCards, true);
  assert.equal(live.renderedCardCount, 1);
  const html = renderCardsHtml(live.ranked);
  assert.match(html, /data-sr-plant-card="lavender"/);
  assert.match(html, /sr-plant-card/);
  assert.match(html, /Add to My Garden/);
  assert.match(html, new RegExp(lavender.derived.survivalLabel || lavender.derived.survival, 'i'));
  assert.equal(isHardFrostLimiter(lavender.aligned.explanationText || ''), false);
});

test('empty list gets an explicit empty state; blank panel is impossible', () => {
  assert.equal(smartRecEmptyStateKind({ hasTrustedLocation: false, eligibleCount: 0 }), 'need-location');
  assert.equal(smartRecEmptyStateKind({ hasTrustedLocation: true, eligibleCount: 0 }), 'none-eligible');
  assert.equal(smartRecEmptyStateKind({ hasTrustedLocation: true, eligibleCount: 3 }), null);
  const app = fs.readFileSync(APP, 'utf8');
  assert.match(app, /data-sr-empty="\$\{escapeAttr\(emptyKind\|\|'waiting'\)\}"/);
  assert.match(app, /needLocationEmpty/);
  assert.match(app, /noneEligibleEmpty/);
  assert.match(app, /renderSmartRecResultsEmpty\('need-location'\)/);
  assert.match(app, /renderSmartRecResultsEmpty\('none-eligible'\)/);
  assert.doesNotMatch(app, /if\(smartRecSession\.step!=='results'\)\{\s*renderSmartRecResultsEmpty\(\);/);
});

test('live wiring: trusted location renders cards without waiting for chat results step', () => {
  const app = fs.readFileSync(APP, 'utf8');
  assert.match(app, /function refreshSmartRecBrowse\(\)\{[\s\S]*?if\(!hasTrustedAppLocation\(\)\)/);
  assert.doesNotMatch(
    app,
    /function refreshSmartRecBrowse\(\)\{[\s\S]*?if\(smartRecSession\.step!=='results'\)/
  );
  assert.match(app, /initSmartRecSession[\s\S]*?refreshSmartRecBrowse\(\);/);
  assert.match(app, /data-sr-plant-card="\$\{escapeAttr\(canon\)\}"/);
  assert.match(app, /data-sr-card-count="\$\{list\.length\}"/);
  assert.match(app, /currentPlantSetup=\{slug:canon,source\}/);
  assert.match(app, /savePlantFromLibrary\(currentPlantSetup\.slug/);
  assert.equal(resolveSmartRecCanonicalSlug('english-lavender'), 'lavender');
  assert.doesNotMatch(app, /Garden Design integration started/);
});

test('no overflow/clipping makes cards unreachable', () => {
  const css = fs.readFileSync(CSS, 'utf8');
  const app = fs.readFileSync(APP, 'utf8');
  assert.match(css, /#smart-rec-root \{[\s\S]*?overflow-y:\s*auto;/);
  assert.match(css, /#smart-rec-root \.sr-app-panel \{[\s\S]*?overflow:\s*visible;/);
  assert.match(css, /#smart-rec-root \.sr-results-pane \{[\s\S]*?min-height:\s*320px;/);
  assert.match(css, /#smart-rec-root \.sr-results-body \{[\s\S]*?min-height:\s*240px;/);
  assert.match(css, /grid-template-rows:\s*auto minmax\(320px, 1fr\)/);
  assert.match(css, /grid-template-rows:\s*auto auto minmax\(320px, auto\)/);
  assert.match(app, /smart-rec\.host\.css\?v=20260915a/);
  const bodyBlock = css.match(/#smart-rec-root \.sr-results-body \{[^}]+\}/)[0];
  assert.doesNotMatch(bodyBlock, /min-height:\s*0/);
});

test('suitability engine and hard-frost path are unchanged by live-render fix', () => {
  const gate = fs.readFileSync(GATE, 'utf8');
  const module = fs.readFileSync(MODULE, 'utf8');
  assert.match(gate, /export function evaluateHardClimateSurvival/);
  assert.doesNotMatch(gate, /Mojstrana/i);
  assert.doesNotMatch(module, /lavender.*hardcode|hardcode.*lavender/i);
  assert.doesNotMatch(module, /garden-design/);
});

test('paid network remains 0 after live render proofs', () => {
  assert.equal(paidNetwork, 0);
  assert.equal(getCoordinateClimateRuntimeCounters().chelsaExternalCalls, 0);
  globalThis.fetch = origFetch;
});
