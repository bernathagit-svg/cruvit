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
  elevateAmbientFreezingRisk,
  enforceSurvivalDownstreamCaps,
  evaluateHardClimateSurvival,
  hardFrostOutcomeInvariant,
  isExplicitFrostFreeProtectedContext,
  isHardFrostLimiter,
  isOrdinaryAreaShelter,
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
import { findCatalogPlantBySlugOrName } from '../modules/personal-domain/specific-plant-suitability-contract.js';
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
