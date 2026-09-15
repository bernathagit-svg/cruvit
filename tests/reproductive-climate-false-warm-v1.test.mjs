/**
 * Reproductive climate false-warm repair — real catalog records, no plant/place hardcodes in engine.
 * Run: node --test tests/reproductive-climate-false-warm-v1.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveSpecificPlantOutcomes,
  evaluateFloweringFromCatalogEvidence,
  evaluateFruitingFromCatalogEvidence,
  findCatalogPlantBySlugOrName,
  plantNeedsWinterChill,
  plantRequiresYearRoundWarmClimate,
  requirementsWantTropicalWarmth,
  reproductiveProseRejectsYearRoundWarmNeed,
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
import {
  applyHardClimateSurvivalToFits,
  enforceSurvivalDownstreamCaps,
  evaluateHardClimateSurvival,
  HARD_CLIMATE_SURVIVAL_GATE_VERSION
} from '../modules/suitability/hard-climate-survival-gate-v1.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'app.html');
const GATE = path.join(ROOT, 'modules', 'suitability', 'hard-climate-survival-gate-v1.js');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const DATA = path.join(ROOT, 'data', 'coordinate-climate', 'v2');
const PILOT = path.join(DATA, 'pilot');
const QA = path.join(DATA, 'qa');
const FALSE_WARM_LIMITER = /too cool \/ not frost-free for sourced warm (flowering|fruiting) needs/i;

let paidNetwork = 0;
globalThis.fetch = async (url) => {
  const u = String(url || '');
  if (/anthropic|api\.openai|plant-identify|claude/i.test(u)) paidNetwork += 1;
  throw new Error('network forbidden in reproductive-climate-false-warm tests: ' + u);
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
    climateTraits: plant.climateTraits,
    reproductiveBiology: plant.reproductiveBiology || plant.climateTraits.reproductiveBiology || null
  };
}

function loadRuntimePlant(slug) {
  try {
    const traits = catalogClimateTraitsFromApp(slug);
    if (traits && (traits.frostSensitivity || traits.coldTolerance || (traits.groupIds || []).length)) {
      return {
        slug,
        name: slug,
        climateTraits: traits,
        reproductiveBiology: traits.reproductiveBiology || null
      };
    }
  } catch {
    /* library row may omit climateTraits */
  }
  const safe = BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1.plants?.[slug];
  if (safe?.climateTraits) {
    return {
      slug,
      name: safe.name || slug,
      scientific: safe.scientific,
      climateTraits: safe.climateTraits,
      reproductiveBiology: safe.climateTraits.reproductiveBiology || null
    };
  }
  return loadSeedPlant(slug);
}

function loadBootstrapPlant(slug) {
  const safe = BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1.plants?.[slug];
  assert.ok(safe?.climateTraits, `bootstrap plant missing: ${slug}`);
  return {
    slug,
    name: safe.name || slug,
    scientific: safe.scientific,
    climateTraits: safe.climateTraits,
    reproductiveBiology: safe.climateTraits.reproductiveBiology || null
  };
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
    protectedGrowing: false
  });
  const env = structuralEnvironmentFromClimateProfile(climate.climateProfile);
  const flowerEval = evaluateFloweringFromCatalogEvidence({
    meta,
    env,
    survival: outcomes.survival,
    chillDeficit: env.alwaysHot === true && !env.coolSeasonSignal
  });
  const fruitEval = evaluateFruitingFromCatalogEvidence({
    meta,
    plant,
    env,
    survival: outcomes.survival,
    flowering: outcomes.flowering,
    chillDeficit: env.alwaysHot === true && !env.coolSeasonSignal
  });
  return {
    slug: plant.slug,
    site: climate.siteId,
    traits: {
      frostSensitivity: meta.frostSensitivity,
      coldTolerance: meta.coldTolerance,
      needsWinterChill: meta.needsWinterChill === true,
      groupIds: meta.groupIds || [],
      floweringRequirements: meta.floweringRequirements || '',
      fruitingRequirements: meta.fruitingRequirements || ''
    },
    evidenceClass: {
      frostSensitivity: resolveTraitEvidenceClass(meta, 'frostSensitivity'),
      coldTolerance: resolveTraitEvidenceClass(meta, 'coldTolerance'),
      needsWinterChill: resolveTraitEvidenceClass(meta, 'needsWinterChill'),
      floweringRequirements: resolveTraitEvidenceClass(meta, 'floweringRequirements'),
      fruitingRequirements: resolveTraitEvidenceClass(meta, 'fruitingRequirements')
    },
    wantsWarmFlower: requirementsWantTropicalWarmth(meta.floweringRequirements),
    wantsWarmFruit: requirementsWantTropicalWarmth(meta.fruitingRequirements),
    rejectsWarmFlower: reproductiveProseRejectsYearRoundWarmNeed(meta.floweringRequirements),
    rejectsWarmFruit: reproductiveProseRejectsYearRoundWarmNeed(meta.fruitingRequirements),
    plantRequiresYearRoundWarm: plantRequiresYearRoundWarmClimate(meta),
    hardBlocked: verdict.hardBlocked === true,
    survival: outcomes.survival,
    growth: outcomes.growth,
    flowering: outcomes.flowering,
    fruiting: outcomes.fruiting,
    overall: outcomes.overall,
    recommendationLevel: suitability.recommendationLevel,
    primaryLimiter: (outcomes.limitingFactors || [])[0] || '',
    limitingFactors: outcomes.limitingFactors || [],
    flowerEvidence: flowerEval.evidence,
    fruitEvidence: fruitEval.evidence,
    flowerLimiting: flowerEval.limiting || '',
    fruitLimiting: fruitEval.limiting || ''
  };
}

function assertNoFalseWarmLimiter(row) {
  assert.equal(FALSE_WARM_LIMITER.test(row.primaryLimiter), false, `${row.slug} primary: ${row.primaryLimiter}`);
  assert.equal(FALSE_WARM_LIMITER.test(row.flowerLimiting), false, `${row.slug} flower: ${row.flowerLimiting}`);
  assert.equal(FALSE_WARM_LIMITER.test(row.fruitLimiting), false, `${row.slug} fruit: ${row.fruitLimiting}`);
  assert.notEqual(row.flowerEvidence, 'negative:cool-or-not-frost-free-vs-warm-flowering', row.slug);
  assert.notEqual(row.fruitEvidence, 'negative:cool-or-not-frost-free-vs-warm-fruiting', row.slug);
}

test('hard-frost survival gate version is unchanged', () => {
  assert.equal(HARD_CLIMATE_SURVIVAL_GATE_VERSION, '1.1.1');
  const src = fs.readFileSync(GATE, 'utf8');
  assert.match(src, /HARD_CLIMATE_SURVIVAL_GATE_VERSION = '1.1.1'/);
});

test('negated always-hot prose is not a tropical requirement', () => {
  assert.equal(
    reproductiveProseRejectsYearRoundWarmNeed(
      'Nuts require chill and a long growing season; unsuitable for always-hot climates.'
    ),
    true
  );
  assert.equal(
    reproductiveProseRejectsYearRoundWarmNeed('Summer berries; poor in hot arid / always-hot climates.'),
    true
  );
  assert.equal(
    reproductiveProseRejectsYearRoundWarmNeed(
      'Spring flowers after winter chill; poor flowering in always-hot climates.'
    ),
    true
  );
  assert.equal(
    requirementsWantTropicalWarmth(
      'Spring flowers after winter chill; poor flowering in always-hot climates.'
    ),
    false
  );
  assert.equal(
    requirementsWantTropicalWarmth('Inflorescences form under warm tropical conditions; prolonged cool weather slows flowering.'),
    true
  );
  assert.equal(
    requirementsWantTropicalWarmth('Fragrant purple flower spikes in summer.'),
    false
  );
  assert.equal(
    requirementsWantTropicalWarmth('Late spring frost may damage flowers; otherwise temperate hardy.'),
    false
  );
  assert.equal(
    requirementsWantTropicalWarmth('Frost-free ripening season after pollination.'),
    false
  );
});

test('SOURCE_SUPPORTED temperate/chill evidence outranks heuristic always-hot tokens', () => {
  const meta = {
    frostSensitivity: 'low',
    coldTolerance: 'high',
    needsWinterChill: true,
    groupIds: ['temperate-chill-fruit-tree'],
    floweringRequirements: 'Spring bloom after chill; poor flowering in always-hot tropical climates.',
    fruitingRequirements: 'Needs winter chill; unsuitable for always-hot tropics.',
    traitEvidenceClasses: {
      frostSensitivity: 'SOURCE_SUPPORTED',
      coldTolerance: 'SOURCE_SUPPORTED',
      needsWinterChill: 'SOURCE_SUPPORTED',
      floweringRequirements: 'SOURCE_SUPPORTED',
      fruitingRequirements: 'SOURCE_SUPPORTED'
    }
  };
  assert.equal(resolveTraitEvidenceClass(meta, 'frostSensitivity'), 'SOURCE_SUPPORTED');
  assert.equal(plantRequiresYearRoundWarmClimate(meta), false);
  assert.equal(requirementsWantTropicalWarmth(meta.floweringRequirements), false);
});

test('explicit tropical reproductive evidence still authorizes year-round-warm need', () => {
  const coconut = loadSeedPlant('coconut');
  assert.equal(plantRequiresYearRoundWarmClimate(coconut.climateTraits), true);
  assert.equal(requirementsWantTropicalWarmth(coconut.climateTraits.floweringRequirements), true);
  const mango = loadBootstrapPlant('mango');
  assert.ok((mango.climateTraits.groupIds || []).includes('tropical-frost-sensitive-fruit'));
  assert.equal(plantRequiresYearRoundWarmClimate(mango.climateTraits), true);
});

test('missing reproductive evidence stays UNKNOWN, not a manufactured warm mismatch', () => {
  const moj = loadMojstranaClimate();
  const env = structuralEnvironmentFromClimateProfile(moj.climateProfile);
  const flower = evaluateFloweringFromCatalogEvidence({
    meta: { frostSensitivity: 'low', coldTolerance: 'high', floweringRequirements: '' },
    env,
    survival: 'reliable'
  });
  assert.equal(flower.status, 'unknown');
  assert.equal(flower.evidence, 'missing:floweringRequirements');
  assert.equal(FALSE_WARM_LIMITER.test(String(flower.limiting || '')), false);
});

test('real catalog: walnut / gooseberry / peony × Mojstrana are not false-warm', () => {
  const moj = loadMojstranaClimate();
  const walnut = loadSeedPlant('english-walnut');
  const gooseberry = loadSeedPlant('gooseberry');
  const peony = loadSeedPlant('garden-peony');
  const lavender = loadRuntimePlant('lavender');

  assert.equal(walnut.slug, 'english-walnut');
  assert.equal(walnut.scientific, 'Juglans regia');
  assert.deepEqual(walnut.climateTraits.groupIds, ['temperate-chill-fruit-tree']);
  assert.equal(walnut.climateTraits.needsWinterChill, true);
  assert.equal(plantNeedsWinterChill(walnut.climateTraits), true);

  const rows = [walnut, gooseberry, peony, lavender].map((plant) =>
    evaluateRow({ plant, climate: moj })
  );
  for (const row of rows) {
    assert.equal(row.hardBlocked, false, row.slug);
    assert.notEqual(row.survival, 'unreliable', row.slug);
    assert.equal(row.plantRequiresYearRoundWarm, false, row.slug);
    assert.equal(row.wantsWarmFlower, false, row.slug);
    assert.notEqual(row.flowering, 'unlikely', row.slug);
    assert.notEqual(row.fruiting, 'unreliable', row.slug);
    assertNoFalseWarmLimiter(row);
  }

  const walnutRow = rows.find((r) => r.slug === 'english-walnut');
  assert.equal(walnutRow.rejectsWarmFruit, true);
  assert.match(walnutRow.flowerEvidence, /incomplete:cannot-compare-flowering-requirements|missing:/);
  assert.equal(walnutRow.recommendationLevel, 'good');
  assert.notEqual(walnutRow.overall, 'good');
});

test('positive tropical controls remain warm-authorized; cold mismatch still blocks', () => {
  const moj = loadMojstranaClimate();
  const kochi = loadPilotClimate('kochi');
  const coconut = loadSeedPlant('coconut');
  const mangoBootstrap = loadBootstrapPlant('mango');
  const mangoRuntime = loadRuntimePlant('mango');
  const lemon = loadRuntimePlant('lemon');
  const apple = loadRuntimePlant('apple');

  const coconutKochi = evaluateRow({ plant: coconut, climate: kochi });
  assert.equal(coconutKochi.hardBlocked, false);
  assert.notEqual(coconutKochi.survival, 'unreliable');
  assert.equal(coconutKochi.plantRequiresYearRoundWarm, true);
  assert.notEqual(coconutKochi.flowering, 'unlikely');
  assertNoFalseWarmLimiter(coconutKochi);

  const mangoKochi = evaluateRow({ plant: mangoBootstrap, climate: kochi });
  assert.equal(mangoKochi.plantRequiresYearRoundWarm, true);
  assert.equal(mangoKochi.hardBlocked, false);
  assert.notEqual(mangoKochi.survival, 'unreliable');
  assert.notEqual(mangoKochi.flowering, 'unlikely');
  assertNoFalseWarmLimiter(mangoKochi);

  const lemonKochi = evaluateRow({ plant: lemon, climate: kochi });
  assert.equal(lemonKochi.hardBlocked, false);
  assert.notEqual(lemonKochi.survival, 'unreliable');
  assertNoFalseWarmLimiter(lemonKochi);

  const coconutMoj = evaluateRow({ plant: coconut, climate: moj });
  const mangoMoj = evaluateRow({ plant: mangoRuntime, climate: moj });
  const lemonMoj = evaluateRow({ plant: lemon, climate: moj });
  assert.equal(coconutMoj.hardBlocked, true);
  assert.equal(coconutMoj.survival, 'unreliable');
  assert.equal(mangoMoj.hardBlocked, true);
  assert.equal(mangoMoj.survival, 'unreliable');
  assert.equal(lemonMoj.hardBlocked, true);
  assert.equal(lemonMoj.survival, 'unreliable');
  assert.equal(lemonMoj.overall, 'blocked');

  const appleKochi = evaluateRow({ plant: apple, climate: kochi });
  assert.equal(plantNeedsWinterChill(apple.climateTraits), true);
  assert.ok(
    appleKochi.flowering === 'unlikely' || appleKochi.fruiting === 'unreliable',
    `apple kochi flowering=${appleKochi.flowering} fruiting=${appleKochi.fruiting}`
  );
  assert.notEqual(appleKochi.flowerEvidence, 'negative:cool-or-not-frost-free-vs-warm-flowering');
});

test('recommendationLevel remains browse-rank; derived overall voids flowering', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'modules', 'personal-domain', 'specific-plant-suitability-contract.js'),
    'utf8'
  );
  assert.match(src, /void flowering;/);
  assert.match(src, /fruitOriented &&[\s\S]*fruiting === SPECIFIC_OUTCOME_STATUS.UNRELIABLE/);
  const smart = fs.readFileSync(
    path.join(ROOT, 'modules', 'smart-recommendations', 'smart-rec-garden-intelligence-v1.js'),
    'utf8'
  );
  assert.match(smart, /Hard-blocked Survival \/ validated blocked overall cannot be a positive recommendation/);
  assert.equal(/flowering === .*unlikely/.test(smart), false);
});

test('paid AI automated calls stay 0', () => {
  assert.equal(isPaidAiAutomatedTestAllowed(), false);
  assert.equal(paidNetwork, 0);
  assert.equal(getCoordinateClimateRuntimeCounters().chelsaExternalCalls, 0);
});
