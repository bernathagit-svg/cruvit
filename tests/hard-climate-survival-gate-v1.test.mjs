/**
 * Hard-climate survival gate — generic frost must cap all four outcomes.
 * Zero paid AI. No Lemon/Mango/Mojstrana hard-codes in the gate.
 *
 * Run: node --test tests/hard-climate-survival-gate-v1.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyHardClimateSurvivalToFits,
  coldToleranceIsLow,
  elevateAmbientFreezingRisk,
  enforceSurvivalDownstreamCaps,
  evaluateHardClimateSurvival,
  frostSensitivityIsHard,
  hardFrostOutcomeInvariant,
  isExplicitFrostFreeProtectedContext,
  isHardFrostLimiter,
  isOrdinaryAreaShelter,
  isStrongOutcomeBand,
  prioritizeHardFrostLimiters,
  suppressStrongBandsWhenHardFrost
} from '../modules/suitability/hard-climate-survival-gate-v1.js';
import { formatSmartRecOutcomeBand } from '../modules/smart-recommendations/smart-rec-garden-intelligence-v1.js';
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
import { BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1 } from '../modules/personal-domain/bootstrap-safe-climate-traits-migration-data-v1.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'app.html');
const GATE = path.join(ROOT, 'modules', 'suitability', 'hard-climate-survival-gate-v1.js');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const DATA = path.join(ROOT, 'data', 'coordinate-climate', 'v2');

let paidNetwork = 0;
const origFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url || '');
  if (/anthropic|api\.openai|plant-identify|claude/i.test(u)) paidNetwork += 1;
  throw new Error('network forbidden in hard-climate-survival-gate tests: ' + u);
};

const TENDER = { frostSensitivity: 'high', coldTolerance: 'low' };
const HARDY = { frostSensitivity: 'low', coldTolerance: 'high' };
const ALPINE_FREEZE = {
  freezingRisk: 'high',
  coldestMonthMeanMinC: -7.1,
  thermalRegime: 'frost-prone',
  isFrostFreeGrowingClimate: false,
  structuralClimateStatus: 'known'
};
const WARM_COASTAL = {
  freezingRisk: 'low',
  coldestMonthMeanMinC: 8.2,
  thermalRegime: 'year-round-warm',
  isFrostFreeGrowingClimate: true,
  structuralClimateStatus: 'known',
  broadClimate: 'mediterranean'
};

function optimisticFits() {
  return { survivalFit: 85, thriveFit: 80, floweringFit: 70, fruitingFit: 70, heatColdFit: 80 };
}

function bandsFromFits(fits) {
  return {
    survival: formatSmartRecOutcomeBand(fits.survivalFit),
    growth: formatSmartRecOutcomeBand(fits.thriveFit),
    flowering: formatSmartRecOutcomeBand(fits.floweringFit),
    fruiting: formatSmartRecOutcomeBand(fits.fruitingFit)
  };
}

function applyOutdoorTender(meta, climate, protection = {}) {
  const verdict = evaluateHardClimateSurvival({
    meta,
    climateProfile: climate,
    protectionContext: protection
  });
  const fits = applyHardClimateSurvivalToFits(optimisticFits(), verdict);
  enforceSurvivalDownstreamCaps(fits);
  return { verdict, fits, bands: bandsFromFits(fits) };
}

function catalogClimateTraitsFromApp(slug) {
  const app = fs.readFileSync(APP, 'utf8');
  const marker = `{slug:'${slug}'`;
  const i = app.indexOf(marker);
  assert.ok(i >= 0, `catalog record missing for ${slug}`);
  const slice = app.slice(i, i + 8000);
  const key = 'climateTraits:';
  const start = slice.indexOf(key);
  assert.ok(start >= 0, `climateTraits missing for ${slug}`);
  const jsonStart = start + key.length;
  assert.equal(slice[jsonStart], '{');
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
  const traits = JSON.parse(slice.slice(jsonStart, end));
  return {
    frostSensitivity: traits.frostSensitivity,
    coldTolerance: traits.coldTolerance,
    heatTolerance: traits.heatTolerance,
    groupIds: []
  };
}

test('contradiction invariant: frost limiter cannot coexist with strong survival', () => {
  const liveContradiction = hardFrostOutcomeInvariant({
    limiter: 'Frost risk is too high for this plant.',
    outcomes: { survival: 'strong', growth: 'strong', flowering: 'strong', fruiting: 'strong' },
    survivalFit: 85
  });
  assert.equal(liveContradiction.ok, false);
  assert.ok(liveContradiction.violations.includes('frost-limiter-with-strong-survival'));
  assert.ok(liveContradiction.violations.includes('survival-blocked-with-strong-growth'));
  assert.ok(liveContradiction.violations.includes('survival-blocked-with-strong-flowering'));
  assert.ok(liveContradiction.violations.includes('survival-blocked-with-strong-fruiting'));
});

test('contradiction invariant is generic: any hard-frost limiter + strong bands fails, unnamed plants', () => {
  const unnamedA = hardFrostOutcomeInvariant({
    limiter: 'Winter freeze / hard frost exceeds this plant’s outdoor survival tolerance.',
    outcomes: { survival: 'strong', growth: 'strong', flowering: 'strong', fruiting: 'strong' },
    survivalFit: 80
  });
  const unnamedB = hardFrostOutcomeInvariant({
    limiter: 'Lethal frost risk is too high for outdoor planting.',
    outcomes: { survival: 'weak', growth: 'strong', flowering: 'strong', fruiting: 'strong' },
    survivalFit: 8,
    hardSurvivalBlocked: true
  });
  assert.equal(unnamedA.ok, false);
  assert.equal(unnamedB.ok, false);
  assert.ok(unnamedB.violations.includes('survival-blocked-with-strong-growth'));
  assert.equal(
    hardFrostOutcomeInvariant({
      limiter: 'Frost risk is too high for this plant.',
      outcomes: { survival: 'weak', growth: 'weak', flowering: 'weak', fruiting: 'weak' },
      survivalFit: 8,
      hardSurvivalBlocked: true
    }).ok,
    true
  );
});

test('A. tender plant × hard-freeze outdoor cannot return strong survival', () => {
  const { verdict, fits, bands } = applyOutdoorTender(TENDER, ALPINE_FREEZE);
  assert.equal(verdict.hardBlocked, true);
  assert.match(verdict.reason, /frost risk is too high/i);
  assert.ok(fits.survivalFit <= 15);
  assert.notEqual(bands.survival, 'strong');
  const inv = hardFrostOutcomeInvariant({
    limiter: verdict.reason,
    outcomes: bands,
    survivalFit: fits.survivalFit,
    hardSurvivalBlocked: fits.hardSurvivalBlocked
  });
  assert.equal(inv.ok, true);
});

test('B. downstream growth/flowering/fruiting cannot stay strong when survival is hard-blocked', () => {
  const { fits, bands, verdict } = applyOutdoorTender(TENDER, ALPINE_FREEZE);
  assert.ok(fits.thriveFit <= fits.survivalFit);
  assert.ok(fits.floweringFit <= 15);
  assert.ok(fits.fruitingFit <= 10);
  assert.notEqual(bands.growth, 'strong');
  assert.notEqual(bands.flowering, 'strong');
  assert.notEqual(bands.fruiting, 'strong');
  assert.equal(
    hardFrostOutcomeInvariant({
      limiter: verdict.reason,
      outcomes: bands,
      survivalFit: fits.survivalFit,
      hardSurvivalBlocked: true
    }).ok,
    true
  );
});

test('C. explicit frost-free greenhouse context may change result', () => {
  const outdoor = applyOutdoorTender(TENDER, ALPINE_FREEZE, { plantingMode: 'ground' });
  const protectedEnv = applyOutdoorTender(TENDER, ALPINE_FREEZE, { plantingMode: 'greenhouse' });
  assert.equal(isExplicitFrostFreeProtectedContext({ plantingMode: 'greenhouse' }), true);
  assert.equal(protectedEnv.verdict.hardBlocked, false);
  assert.equal(protectedEnv.verdict.protectedContext, true);
  assert.ok(protectedEnv.fits.survivalFit > outdoor.fits.survivalFit);
});

test('D. ordinary Area shelter does not erase hard freeze', () => {
  assert.equal(isOrdinaryAreaShelter({ plantingMode: 'patio', windExposure: 'sheltered' }), true);
  const patio = applyOutdoorTender(TENDER, ALPINE_FREEZE, {
    plantingMode: 'patio',
    windExposure: 'sheltered',
    containerContext: false
  });
  const pot = applyOutdoorTender(TENDER, ALPINE_FREEZE, { plantingMode: 'container', containerContext: true });
  assert.equal(patio.verdict.hardBlocked, true);
  assert.equal(pot.verdict.hardBlocked, true);
  assert.notEqual(patio.bands.survival, 'strong');
  assert.notEqual(pot.bands.survival, 'strong');
});

test('E. pineapple / mango-class tender fruit remain blocked in hard freeze', () => {
  const pineappleMeta = { frostSensitivity: 'high', coldTolerance: 'low', groupIds: ['tropical-frost-sensitive-fruit'] };
  const mangoClass = { frostSensitivity: 'high', coldTolerance: 'low', groupIds: ['tropical-frost-sensitive-fruit'] };
  for (const meta of [pineappleMeta, mangoClass]) {
    const { verdict, bands, fits } = applyOutdoorTender(meta, ALPINE_FREEZE);
    assert.equal(verdict.hardBlocked, true);
    assert.notEqual(bands.survival, 'strong');
    assert.equal(
      hardFrostOutcomeInvariant({
        limiter: verdict.reason,
        outcomes: bands,
        survivalFit: fits.survivalFit,
        hardSurvivalBlocked: true
      }).ok,
      true
    );
  }
  const app = fs.readFileSync(APP, 'utf8');
  assert.match(app, /mango:\['tropical-frost-sensitive-fruit'\]/);
  assert.match(app, /tropical-frost-sensitive-fruit':\{[\s\S]*?frostSensitivity:'high'/);
});

test('F. cold-hardy plant remains viable where evidence supports it', () => {
  const { verdict, bands, fits } = applyOutdoorTender(HARDY, ALPINE_FREEZE);
  assert.equal(verdict.hardBlocked, false);
  assert.equal(bands.survival, 'strong');
  assert.ok(fits.survivalFit >= 70);
});

test('G. warm-climate tender plant remains viable when freeze risk is genuinely low', () => {
  const { verdict, bands, fits } = applyOutdoorTender(TENDER, WARM_COASTAL);
  assert.equal(verdict.hardBlocked, false);
  assert.ok(fits.survivalFit >= 70);
  assert.equal(bands.survival, 'strong');
});

test('H. UNKNOWN / missing frost evidence is not optimistic in a freezing climate', () => {
  const { verdict, fits, bands } = applyOutdoorTender({}, ALPINE_FREEZE);
  assert.equal(verdict.conservativeUnknown, true);
  assert.ok(fits.survivalFit <= 35);
  assert.notEqual(bands.survival, 'strong');
});

function resolveMojstranaClimate() {
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
  const climate = {
    freezingRisk: structural.freezingRisk,
    coldestMonthMeanMinC: structural.evidence?.coldestMonthMeanMinC ?? structural.coldestMonthMeanMinC,
    thermalRegime: structural.thermalRegime,
    isFrostFreeGrowingClimate: false,
    structuralClimateStatus: 'known',
    structuralClimate: structural
  };
  return { loc, structural, climate };
}

test('catalog ordinals: very_high frost / very_low cold are hard, not ignored', () => {
  assert.equal(frostSensitivityIsHard('very_high'), true);
  assert.equal(frostSensitivityIsHard('high'), true);
  assert.equal(frostSensitivityIsHard('medium'), false);
  assert.equal(frostSensitivityIsHard(''), false);
  assert.equal(coldToleranceIsLow('very_low'), true);
  assert.equal(coldToleranceIsLow('low'), true);
  assert.equal(coldToleranceIsLow('high'), false);
  const unnamed = applyOutdoorTender(
    { frostSensitivity: 'very_high', coldTolerance: 'very_low' },
    ALPINE_FREEZE
  );
  assert.equal(unnamed.verdict.hardBlocked, true);
  assert.notEqual(unnamed.bands.survival, 'strong');
});

test('Mojstrana structural climate is hard freeze; lemon-class and mango-class both cap', () => {
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
  assert.equal(structural.status, 'known');
  assert.equal(structural.freezingRisk, 'high');
  const climate = {
    freezingRisk: structural.freezingRisk,
    coldestMonthMeanMinC: structural.evidence?.coldestMonthMeanMinC ?? structural.coldestMonthMeanMinC,
    thermalRegime: structural.thermalRegime,
    isFrostFreeGrowingClimate: false,
    structuralClimateStatus: 'known',
    structuralClimate: structural
  };
  const risk = elevateAmbientFreezingRisk(climate, loc);
  assert.equal(risk, 'high');

  const citrus = applyOutdoorTender(
    { frostSensitivity: 'high', coldTolerance: 'low', groupIds: ['warm-citrus-fruit-tree'] },
    climate
  );
  const mangoClass = applyOutdoorTender(
    { frostSensitivity: 'high', coldTolerance: 'low', groupIds: ['tropical-frost-sensitive-fruit'] },
    climate
  );
  for (const row of [citrus, mangoClass]) {
    assert.equal(row.verdict.hardBlocked, true);
    assert.notEqual(row.bands.survival, 'strong');
    assert.notEqual(row.bands.growth, 'strong');
    assert.notEqual(row.bands.flowering, 'strong');
    assert.notEqual(row.bands.fruiting, 'strong');
    assert.equal(
      hardFrostOutcomeInvariant({
        limiter: row.verdict.reason,
        outcomes: row.bands,
        survivalFit: row.fits.survivalFit,
        hardSurvivalBlocked: true
      }).ok,
      true
    );
  }
  assert.equal(getCoordinateClimateRuntimeCounters().chelsaExternalCalls, 0);

  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  const pineapple = findCatalogPlantBySlugOrName(seed.plants || seed, 'pineapple');
  if (pineapple?.climateTraits) {
    const pine = applyOutdoorTender(pineapple.climateTraits, climate);
    assert.equal(pine.verdict.hardBlocked, true);
  }

  const catalogMango = catalogClimateTraitsFromApp('mango');
  assert.equal(catalogMango.frostSensitivity, 'high');
  assert.equal(catalogMango.coldTolerance, 'low');
  catalogMango.groupIds = ['tropical-frost-sensitive-fruit'];
  const mangoFromCatalog = applyOutdoorTender(catalogMango, climate);
  assert.equal(mangoFromCatalog.verdict.hardBlocked, true);
  assert.match(mangoFromCatalog.verdict.reason, /frost risk is too high|winter freeze|hard frost/i);
  assert.notEqual(mangoFromCatalog.bands.survival, 'strong');
  assert.notEqual(mangoFromCatalog.bands.growth, 'strong');
  assert.notEqual(mangoFromCatalog.bands.flowering, 'strong');
  assert.notEqual(mangoFromCatalog.bands.fruiting, 'strong');
  assert.equal(
    hardFrostOutcomeInvariant({
      limiter: mangoFromCatalog.verdict.reason,
      outcomes: mangoFromCatalog.bands,
      survivalFit: mangoFromCatalog.fits.survivalFit,
      hardSurvivalBlocked: true
    }).ok,
    true
  );
  const liveMangoStyleContradiction = hardFrostOutcomeInvariant({
    limiter: 'Frost risk is too high for this plant.',
    outcomes: { survival: 'strong', growth: 'strong', flowering: 'strong', fruiting: 'strong' },
    survivalFit: 85
  });
  assert.equal(liveMangoStyleContradiction.ok, false);
});

test('real catalog lemon × Mojstrana outdoor cannot display Survival Reliable', () => {
  const lemonTraits = BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1.plants.lemon.climateTraits;
  assert.equal(lemonTraits.frostSensitivity, 'very_high');
  assert.equal(lemonTraits.coldTolerance, 'very_low');
  assert.equal(lemonTraits.traitEvidenceClasses.frostSensitivity, 'SOURCE_SUPPORTED');
  assert.equal(lemonTraits.traitEvidenceClasses.coldTolerance, 'SOURCE_SUPPORTED');
  assert.ok(Array.isArray(lemonTraits.groupIds) && lemonTraits.groupIds.includes('warm-citrus-fruit-tree'));

  const { loc, climate } = resolveMojstranaClimate();
  assert.equal(climate.freezingRisk, 'high');
  assert.ok(Number(climate.coldestMonthMeanMinC) <= 0);
  assert.equal(elevateAmbientFreezingRisk(climate, loc), 'high');

  const outdoor = applyOutdoorTender(lemonTraits, climate, { plantingMode: 'ground' });
  assert.equal(outdoor.verdict.hardBlocked, true);
  assert.ok(outdoor.fits.survivalFit <= 15);
  assert.notEqual(outdoor.bands.survival, 'strong');

  const lemonPlant = {
    slug: 'lemon',
    name: 'Lemon Tree',
    scientific: 'Citrus × limon',
    climateTraits: lemonTraits
  };
  const suitability = {
    survivalFit: outdoor.fits.survivalFit,
    thriveFit: outdoor.fits.thriveFit,
    floweringFit: outdoor.fits.floweringFit,
    fruitingFit: outdoor.fits.fruitingFit,
    hardSurvivalBlocked: true,
    recommendationLevel: 'blocked',
    warnings: [outdoor.verdict.reason],
    explanationText: outdoor.verdict.reason
  };
  const outcomes = deriveSpecificPlantOutcomes({
    meta: lemonTraits,
    climateProfile: climate,
    suitability,
    plant: lemonPlant,
    protectedGrowing: false
  });
  const survivalLabel = String(outcomes.survivalLabel || outcomes.survival || '');
  assert.notEqual(survivalLabel, 'Reliable');
  assert.notEqual(survivalLabel.toLowerCase(), 'strong');
  assert.notEqual(survivalLabel.toLowerCase(), 'good');
  assert.equal(isStrongOutcomeBand(survivalLabel), false);
  assert.equal(outcomes.survival, 'unreliable');
  const primary = prioritizeHardFrostLimiters(outcomes.limitingFactors || [])[0] || '';
  assert.equal(isHardFrostLimiter(primary), true);
  assert.doesNotMatch(primary, /Growth confidence bounded/i);

  const warmFrostFree = {
    ...WARM_COASTAL,
    coldestMonthMeanMinC: 12
  };
  const warm = applyOutdoorTender(lemonTraits, warmFrostFree, { plantingMode: 'ground' });
  assert.equal(warm.verdict.hardBlocked, false);
  const warmOutcomes = deriveSpecificPlantOutcomes({
    meta: lemonTraits,
    climateProfile: warmFrostFree,
    suitability: {
      survivalFit: warm.fits.survivalFit,
      thriveFit: warm.fits.thriveFit,
      floweringFit: warm.fits.floweringFit,
      fruitingFit: warm.fits.fruitingFit,
      hardSurvivalBlocked: false,
      recommendationLevel: 'good',
      warnings: [],
      explanationText: ''
    },
    plant: lemonPlant,
    protectedGrowing: false
  });
  assert.notEqual(warmOutcomes.survival, 'unreliable');

  const greenhouse = applyOutdoorTender(lemonTraits, climate, { plantingMode: 'greenhouse' });
  assert.equal(isExplicitFrostFreeProtectedContext({ plantingMode: 'greenhouse' }), true);
  assert.equal(greenhouse.verdict.hardBlocked, false);
  assert.ok(greenhouse.fits.survivalFit > outdoor.fits.survivalFit);
});

test('hard frost limiter outranks soft confidence warning', () => {
  const ordered = prioritizeHardFrostLimiters([
    'Growth confidence bounded: material growth/tolerance traits are not SOURCE_SUPPORTED — provisional only.',
    'Frost risk is too high for this plant.'
  ]);
  assert.equal(ordered[0], 'Frost risk is too high for this plant.');
});

test('display safety net strips Reliable when survivalFit is hard-capped', () => {
  const stripped = suppressStrongBandsWhenHardFrost(
    { survival: 'Reliable', growth: 'Constrained', flowering: 'UNKNOWN', fruiting: 'UNKNOWN' },
    'Growth confidence bounded: material growth/tolerance traits are not SOURCE_SUPPORTED — provisional only.',
    8
  );
  assert.notEqual(String(stripped.survival).toLowerCase(), 'reliable');
});

test('display safety net strips strong bands when limiter is hard frost', () => {
  const stripped = suppressStrongBandsWhenHardFrost(
    { survival: 'strong', growth: 'strong', flowering: 'strong', fruiting: 'strong' },
    'Frost risk is too high for this plant.',
    85
  );
  assert.notEqual(stripped.survival, 'strong');
  assert.notEqual(stripped.growth, 'strong');
  assert.notEqual(stripped.flowering, 'strong');
  assert.notEqual(stripped.fruiting, 'strong');
  assert.equal(isHardFrostLimiter('Frost risk is too high for this plant.'), true);
});

test('engine wiring: frost block caps fits; gate is loaded; no plant/place hard-code', () => {
  const app = fs.readFileSync(APP, 'utf8');
  const gateSrc = fs.readFileSync(GATE, 'utf8');
  assert.match(app, /hard-climate-survival-gate-v1\.js/);
  assert.match(app, /applyHardClimateSurvivalToFits/);
  assert.match(app, /enforceSurvivalDownstreamCaps/);
  assert.match(app, /suppressStrongBandsWhenHardFrost/);
  assert.match(app, /climateTraitOrdinalIsHardFrost/);
  assert.match(app, /hardSurvivalBlocked/);
  assert.match(app, /prioritizeHardFrostLimiters/);
  assert.doesNotMatch(gateSrc, /lemon/i);
  assert.doesNotMatch(gateSrc, /mango/i);
  assert.doesNotMatch(gateSrc, /Mojstrana/i);
  assert.doesNotMatch(gateSrc, /pineapple/i);
});

test('I. no paid AI automated calls', () => {
  assert.equal(isPaidAiAutomatedTestAllowed(), false);
  assert.equal(paidNetwork, 0);
  globalThis.fetch = origFetch;
});
