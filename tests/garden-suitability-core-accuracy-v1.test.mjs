/**
 * Garden suitability core accuracy — fast offline matrix.
 * Real catalog records + cached/local structural climate. Zero paid AI. No live hydrate.
 *
 * Run: node --test tests/garden-suitability-core-accuracy-v1.test.mjs
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
  frostSensitivityIsHard,
  hardFrostOutcomeInvariant,
  isExplicitFrostFreeProtectedContext,
  isHardFrostLimiter,
  isOrdinaryAreaShelter,
  isStrongOutcomeBand,
  prioritizeHardFrostLimiters
} from '../modules/suitability/hard-climate-survival-gate-v1.js';
import {
  deriveSpecificPlantOutcomes,
  findCatalogPlantBySlugOrName,
  plantNeedsWinterChill,
  structuralEnvironmentFromClimateProfile
} from '../modules/personal-domain/specific-plant-suitability-contract.js';
import { resolveTraitEvidenceClass } from '../modules/personal-domain/evidence-strength-propagation-v1-contract.js';
import { BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1 } from '../modules/personal-domain/bootstrap-safe-climate-traits-migration-data-v1.js';
import { coordinateClimateProfileToStructuralPersistence } from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import { buildCoordinateClimateConfidenceV2 } from '../modules/personal-domain/coordinate-climate-confidence-v2-contract.js';
import {
  resolveGardenStructuralClimateFromCoordinateV2,
  resetCoordinateClimateRuntimeCounters,
  getCoordinateClimateRuntimeCounters
} from '../modules/personal-domain/coordinate-climate-garden-hydrate-v2.js';
import { clearGlobalRuntimeCaches } from '../modules/personal-domain/coordinate-climate-global-lookup-v2.js';
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
const origFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url || '');
  if (/anthropic|api\.openai|plant-identify|claude/i.test(u)) paidNetwork += 1;
  throw new Error('network forbidden in garden-suitability-core-accuracy tests: ' + u);
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
    warmestMonthMeanMaxC: profile.warmestMonthMeanMaxC,
    alwaysHot: profile.alwaysHot,
    coolSeasonSignal: profile.coolSeasonSignal,
    highlandModifier: profile.highlandModifier,
    monthlyHursPct: profile.monthlyHursPct,
    meanRelativeHumidityPct: profile.meanRelativeHumidityPct,
    freezingRisk: profile.freezingRisk,
    thermalRegime: profile.thermalRegime,
    structuralColdRisk: profile.structuralColdRisk,
    humiditySignal: profile.humiditySignal,
    confidence: profile.confidence,
    confidenceDimensions: profile.confidenceDimensions,
    localRepresentativeness: profile.localRepresentativeness,
    coordinateClimateV2: profile
  };
  const env = structuralEnvironmentFromClimateProfile(base);
  return {
    siteId,
    label: profile.coordinate?.label || siteId,
    climateProfile: {
      ...base,
      ...env,
      isFrostFreeGrowingClimate: env.isFrostFreeGrowingClimate
    }
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
    label: loc.label,
    loc,
    climateProfile: { ...climateProfile, ...env, isFrostFreeGrowingClimate: env.isFrostFreeGrowingClimate }
  };
}

function evaluateRow({ plant, climate, protection = { plantingMode: 'ground' } }) {
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
  const suitability = {
    survivalFit: fits.survivalFit,
    thriveFit: fits.thriveFit,
    floweringFit: fits.floweringFit,
    fruitingFit: fits.fruitingFit,
    hardSurvivalBlocked: fits.hardSurvivalBlocked === true,
    recommendationLevel: verdict.hardBlocked ? 'blocked' : 'good',
    warnings: verdict.reason ? [verdict.reason] : [],
    explanationText: verdict.reason || ''
  };
  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: climate.climateProfile,
    suitability,
    plant,
    protectedGrowing
  });
  const limiters = prioritizeHardFrostLimiters(outcomes.limitingFactors || []);
  return {
    slug: plant.slug,
    site: climate.siteId,
    protection: protection.plantingMode || 'ground',
    traits: {
      frostSensitivity: meta.frostSensitivity,
      coldTolerance: meta.coldTolerance,
      heatTolerance: meta.heatTolerance,
      needsWinterChill: meta.needsWinterChill === true,
      groupIds: meta.groupIds || []
    },
    evidence: {
      frostSensitivity: resolveTraitEvidenceClass(meta, 'frostSensitivity'),
      coldTolerance: resolveTraitEvidenceClass(meta, 'coldTolerance'),
      floweringRequirements: resolveTraitEvidenceClass(meta, 'floweringRequirements'),
      fruitingRequirements: resolveTraitEvidenceClass(meta, 'fruitingRequirements')
    },
    climate: {
      freezingRisk: climate.climateProfile.freezingRisk,
      thermalRegime: climate.climateProfile.thermalRegime,
      coldestMonthMeanMinC: climate.climateProfile.coldestMonthMeanMinC,
      frostFree: climate.climateProfile.isFrostFreeGrowingClimate === true
    },
    hardBlocked: verdict.hardBlocked === true,
    survival: outcomes.survival,
    survivalLabel: outcomes.survivalLabel,
    growth: outcomes.growth,
    growthLabel: outcomes.growthLabel,
    flowering: outcomes.flowering,
    floweringLabel: outcomes.floweringLabel,
    fruiting: outcomes.fruiting,
    fruitingLabel: outcomes.fruitingLabel,
    overall: outcomes.overall,
    primaryLimiter: limiters[0] || '',
    unknownEvidence: outcomes.unknownEvidence || [],
    limitingFactors: limiters
  };
}

function assertNotOptimisticSurvival(row) {
  assert.notEqual(row.survival, 'reliable');
  assert.equal(isStrongOutcomeBand(row.survivalLabel), false);
  assert.equal(isStrongOutcomeBand(row.survival), false);
}

test('offline matrix: hard-cold mismatch cannot be Reliable/Strong', () => {
  const moj = loadMojstranaClimate();
  assert.equal(elevateAmbientFreezingRisk(moj.climateProfile, moj.loc), 'high');
  const lemon = loadRuntimePlant('lemon');
  const mango = loadRuntimePlant('mango');
  const pineapple = loadSeedPlant('pineapple');
  assert.equal(frostSensitivityIsHard(lemon.climateTraits.frostSensitivity), true);
  const rows = [lemon, mango, pineapple].map((plant) =>
    evaluateRow({ plant, climate: moj, protection: { plantingMode: 'ground' } })
  );
  for (const row of rows) {
    assert.equal(row.hardBlocked, true, row.slug);
    assert.equal(row.survival, 'unreliable', row.slug);
    assertNotOptimisticSurvival(row);
    assert.equal(isHardFrostLimiter(row.primaryLimiter), true, row.slug + ' limiter ' + row.primaryLimiter);
    assert.equal(isStrongOutcomeBand(row.growth), false, row.slug);
    assert.equal(isStrongOutcomeBand(row.flowering), false, row.slug);
    assert.equal(isStrongOutcomeBand(row.fruiting), false, row.slug);
    assert.equal(row.overall, 'blocked', row.slug);
    assert.equal(
      hardFrostOutcomeInvariant({
        limiter: row.primaryLimiter,
        outcomes: {
          survival: row.survivalLabel,
          growth: row.growthLabel,
          flowering: row.floweringLabel,
          fruiting: row.fruitingLabel
        },
        survivalFit: 8,
        hardSurvivalBlocked: true
      }).ok,
      true
    );
  }
  assert.equal(getCoordinateClimateRuntimeCounters().chelsaExternalCalls, 0);
});

test('offline matrix: cold-hardy lavender remains viable in Mojstrana', () => {
  const moj = loadMojstranaClimate();
  const lavender = loadRuntimePlant('lavender');
  assert.equal(lavender.climateTraits.frostSensitivity, 'low');
  assert.equal(lavender.climateTraits.coldTolerance, 'high');
  const row = evaluateRow({ plant: lavender, climate: moj, protection: { plantingMode: 'ground' } });
  assert.equal(row.hardBlocked, false);
  assert.notEqual(row.survival, 'unreliable');
  assert.notEqual(row.overall, 'blocked');
  assert.equal(isHardFrostLimiter(row.primaryLimiter), false);
});

test('offline matrix: warm frost-free climate is not penalized by cold gates', () => {
  const kochi = loadPilotClimate('kochi');
  const singapore = loadPilotClimate('singapore');
  const yehiam = loadPilotClimate('yehiam');
  assert.equal(kochi.climateProfile.freezingRisk, 'low');
  assert.ok(Number(kochi.climateProfile.coldestMonthMeanMinC) > 15);
  assert.equal(yehiam.climateProfile.freezingRisk, 'low');
  const lemon = loadRuntimePlant('lemon');
  const mango = loadRuntimePlant('mango');
  const lemonWarm = evaluateRow({ plant: lemon, climate: kochi, protection: { plantingMode: 'ground' } });
  const lemonMed = evaluateRow({ plant: lemon, climate: yehiam, protection: { plantingMode: 'ground' } });
  const mangoWarm = evaluateRow({ plant: mango, climate: singapore, protection: { plantingMode: 'ground' } });
  for (const row of [lemonWarm, lemonMed, mangoWarm]) {
    assert.equal(row.hardBlocked, false, `${row.slug}@${row.site}`);
    assert.notEqual(row.survival, 'unreliable', `${row.slug}@${row.site}`);
    assert.equal(isHardFrostLimiter(row.primaryLimiter), false, `${row.slug} ${row.primaryLimiter}`);
    assert.notEqual(row.overall, 'blocked', `${row.slug}@${row.site}`);
  }
  assert.notEqual(lemonMed.fruiting, 'unreliable');
  assert.notEqual(lemonMed.flowering, 'unlikely');
});

test('Coconut × Kochi: evidence-honest, not a climate false negative', () => {
  const coconut = loadSeedPlant('coconut');
  const kochi = loadPilotClimate('kochi');
  assert.equal(coconut.climateTraits.frostSensitivity, 'high');
  assert.equal(resolveTraitEvidenceClass(coconut.climateTraits, 'frostSensitivity'), 'HEURISTIC_ASSERTION');
  assert.equal(coconut.climateTraits.reproductiveBiology, undefined);
  assert.equal(kochi.climateProfile.freezingRisk, 'low');
  assert.equal(kochi.climateProfile.isFrostFreeGrowingClimate, true);

  const row = evaluateRow({ plant: coconut, climate: kochi, protection: { plantingMode: 'ground' } });
  assert.equal(row.hardBlocked, false);
  assert.notEqual(row.survival, 'unreliable');
  assert.notEqual(row.overall, 'blocked');
  assert.equal(isHardFrostLimiter(row.primaryLimiter), false);
  assert.notEqual(row.overall, 'good');
  assert.notEqual(row.overall, 'excellent');
  assert.ok(row.fruiting === 'unknown' || row.fruiting === 'constrained' || row.fruiting === 'unreliable');
  assert.ok(
    row.survival === 'constrained' || row.survival === 'reliable',
    'heuristic tropical palm in frost-free Kochi must stay viable'
  );
});

test('offline matrix: chill-requiring apple fails fruiting in always-hot Kochi', () => {
  const apple = loadRuntimePlant('apple');
  assert.equal(plantNeedsWinterChill(apple.climateTraits), true);
  const kochi = loadPilotClimate('kochi');
  const row = evaluateRow({ plant: apple, climate: kochi, protection: { plantingMode: 'ground' } });
  assert.notEqual(row.survival, 'unreliable');
  assert.ok(row.flowering === 'unreliable' || row.flowering === 'unlikely' || row.fruiting === 'unreliable');
  assert.notEqual(row.overall, 'good');
  assert.notEqual(row.overall, 'excellent');
});

test('offline matrix: greenhouse may change exposure; patio/container do not', () => {
  const moj = loadMojstranaClimate();
  const lemon = loadRuntimePlant('lemon');
  const mango = loadRuntimePlant('mango');
  const outdoor = evaluateRow({ plant: lemon, climate: moj, protection: { plantingMode: 'ground' } });
  const patio = evaluateRow({
    plant: lemon,
    climate: moj,
    protection: { plantingMode: 'patio', windExposure: 'sheltered' }
  });
  const pot = evaluateRow({
    plant: mango,
    climate: moj,
    protection: { plantingMode: 'container', containerContext: true }
  });
  const house = evaluateRow({ plant: lemon, climate: moj, protection: { plantingMode: 'greenhouse' } });
  const mangoHouse = evaluateRow({ plant: mango, climate: moj, protection: { plantingMode: 'greenhouse' } });
  assert.equal(isOrdinaryAreaShelter({ plantingMode: 'patio' }), true);
  assert.equal(outdoor.hardBlocked, true);
  assert.equal(patio.hardBlocked, true);
  assert.equal(pot.hardBlocked, true);
  assert.equal(house.hardBlocked, false);
  assert.equal(mangoHouse.hardBlocked, false);
  assert.notEqual(house.survival, 'unreliable');
});

test('invariants A–I hold on the offline matrix', () => {
  const moj = loadMojstranaClimate();
  const kochi = loadPilotClimate('kochi');
  const lemon = loadRuntimePlant('lemon');
  const lavender = loadRuntimePlant('lavender');
  const coconut = loadSeedPlant('coconut');
  const rows = [
    evaluateRow({ plant: lemon, climate: moj }),
    evaluateRow({ plant: lavender, climate: moj }),
    evaluateRow({ plant: coconut, climate: kochi }),
    evaluateRow({ plant: lemon, climate: kochi })
  ];
  for (const row of rows) {
    if (isHardFrostLimiter(row.primaryLimiter) || row.hardBlocked) {
      assertNotOptimisticSurvival(row);
      assert.equal(isStrongOutcomeBand(row.growth), false);
      assert.equal(isStrongOutcomeBand(row.flowering), false);
      assert.equal(isStrongOutcomeBand(row.fruiting), false);
    }
    if (row.survival === 'unreliable') {
      assert.equal(row.overall, 'blocked');
    }
    if (row.overall === 'good' || row.overall === 'excellent') {
      assert.notEqual(row.survival, 'unreliable');
      assert.notEqual(row.survival, 'unknown');
    }
  }
});

test('gate/source: no plant or place hard-codes; no paid AI', () => {
  const gateSrc = fs.readFileSync(GATE, 'utf8');
  assert.doesNotMatch(gateSrc, /lemon/i);
  assert.doesNotMatch(gateSrc, /mango/i);
  assert.doesNotMatch(gateSrc, /coconut/i);
  assert.doesNotMatch(gateSrc, /Mojstrana/i);
  assert.doesNotMatch(gateSrc, /Kochi/i);
  assert.equal(isPaidAiAutomatedTestAllowed(), false);
  assert.equal(paidNetwork, 0);
  globalThis.fetch = origFetch;
});

test('print accuracy matrix (opt-in)', (t) => {
  if (process.env.CRUVIT_PRINT_ACCURACY_MATRIX !== '1') {
    t.skip('set CRUVIT_PRINT_ACCURACY_MATRIX=1 to dump rows');
    return;
  }
  const moj = loadMojstranaClimate();
  const kochi = loadPilotClimate('kochi');
  const singapore = loadPilotClimate('singapore');
  const yehiam = loadPilotClimate('yehiam');
  const lemon = loadRuntimePlant('lemon');
  const mango = loadRuntimePlant('mango');
  const pineapple = loadSeedPlant('pineapple');
  const lavender = loadRuntimePlant('lavender');
  const coconut = loadSeedPlant('coconut');
  const apple = loadRuntimePlant('apple');
  const rows = [
    evaluateRow({ plant: lemon, climate: moj, protection: { plantingMode: 'ground' } }),
    evaluateRow({ plant: mango, climate: moj, protection: { plantingMode: 'ground' } }),
    evaluateRow({ plant: pineapple, climate: moj, protection: { plantingMode: 'ground' } }),
    evaluateRow({ plant: lavender, climate: moj, protection: { plantingMode: 'ground' } }),
    evaluateRow({ plant: lemon, climate: yehiam, protection: { plantingMode: 'ground' } }),
    evaluateRow({ plant: lemon, climate: kochi, protection: { plantingMode: 'ground' } }),
    evaluateRow({ plant: coconut, climate: kochi, protection: { plantingMode: 'ground' } }),
    evaluateRow({ plant: mango, climate: singapore, protection: { plantingMode: 'ground' } }),
    evaluateRow({ plant: apple, climate: kochi, protection: { plantingMode: 'ground' } }),
    evaluateRow({ plant: lemon, climate: moj, protection: { plantingMode: 'greenhouse' } }),
    evaluateRow({ plant: mango, climate: moj, protection: { plantingMode: 'greenhouse' } }),
    evaluateRow({
      plant: lemon,
      climate: moj,
      protection: { plantingMode: 'patio', windExposure: 'sheltered' }
    }),
    evaluateRow({
      plant: mango,
      climate: moj,
      protection: { plantingMode: 'container', containerContext: true }
    })
  ];
  for (const row of rows) {
    t.diagnostic(
      JSON.stringify({
        slug: row.slug,
        site: row.site,
        protection: row.protection,
        traits: row.traits,
        evidence: row.evidence,
        climate: row.climate,
        hardBlocked: row.hardBlocked,
        survival: row.survival,
        growth: row.growth,
        flowering: row.flowering,
        fruiting: row.fruiting,
        overall: row.overall,
        primaryLimiter: row.primaryLimiter,
        unknownEvidence: row.unknownEvidence
      })
    );
  }
});
