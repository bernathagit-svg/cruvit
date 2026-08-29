/**
 * PRE-SCALE SYSTEMIC FIXES V1 — quality gate harness.
 * Thermal authority, location confidence, chill integration, calibration positives.
 *
 * Run: node --test tests/pre-scale-systemic-fixes-v1.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveSpecificPlantOutcomes,
  measureSpecificPlantEvaluationLatency,
  structuralEnvironmentFromClimateProfile,
  structuralFreezingRiskFromBroadClimate,
  broadClimateFromLocationClimate,
  plantNeedsWinterChill,
  isFrostFreeGrowingClimate
} from '../modules/personal-domain/specific-plant-suitability-contract.js';
import {
  NEEDS_MORE_SPECIFIC_LOCATION,
  LOCATION_NEEDS_CONFIRMATION,
  resolveGardenLocationFromCandidates,
  mayAcceptResolvedLocationForGardenClimate,
  isTooBroadForGardenClimate
} from '../modules/personal-domain/location-granularity-contract.js';
import {
  applyStructuralClimateToProfile,
  fetchStructuralClimateForCoordinates,
  clearStructuralClimateCache
} from '../modules/personal-domain/structural-climate-authority-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');

const CALIBRATION_SLUGS = [
  'cacao',
  'coconut',
  'cypress',
  'kiwi',
  'almond',
  'pistachio',
  'japanese-maple',
  'cherimoya',
  'plumeria',
  'oak-tree'
];

const MATRIX_LOCATIONS = [
  { key: 'Kochi', query: 'Kochi, Kerala' },
  { key: 'Cairo', query: 'Cairo, Egypt' },
  { key: 'Phoenix', query: 'Phoenix, Arizona' },
  { key: 'Singapore', query: 'Singapore' },
  { key: 'Tokyo', query: 'Tokyo, Japan' },
  { key: 'London', query: 'London, United Kingdom' },
  { key: 'Yehiam', query: 'Yehiam, Israel' },
  { key: 'Quito', query: 'Quito, Ecuador' },
  { key: 'MexicoCity', query: 'Mexico City, Mexico' }
];

const REPORT = {
  calibration: [],
  locations: {},
  matrix: [],
  positives: [],
  negatives: [],
  performance: {},
  unknowns: [],
  gateNotes: []
};

function loadSeed() {
  return JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
}

function metaFor(plant) {
  const t = plant.climateTraits || {};
  return {
    frostSensitivity: t.frostSensitivity,
    heatTolerance: t.heatTolerance,
    coldTolerance: t.coldTolerance,
    humidityTolerance: t.humidityTolerance,
    waterNeeds: t.waterNeeds,
    groupIds: t.groupIds || [],
    needsReview: t.needsReview === true,
    survivalVsThriveNotes: t.survivalVsThriveNotes || '',
    floweringRequirements: t.floweringRequirements || '',
    fruitingRequirements: t.fruitingRequirements || '',
    needsWinterChill: t.needsWinterChill === true
  };
}

function inferClimateBand(lat, lon, country = '') {
  const absLat = Math.abs(Number(lat) || 0);
  const c = String(country || '')
    .trim()
    .toLowerCase();
  if (absLat <= 23) return 'Tropical';
  if (
    absLat <= 35 &&
    (c.includes('israel') || (lon >= 34 && lon <= 36 && lat >= 29 && lat <= 34))
  ) {
    return 'Mediterranean';
  }
  if (absLat <= 35) return 'Subtropical';
  if (absLat <= 50) return 'Temperate';
  return 'Cool temperate';
}

async function geocodeOpenMeteoPool(query) {
  const url =
    'https://geocoding-api.open-meteo.com/v1/search?' +
    new URLSearchParams({ name: query, count: '8', language: 'en', format: 'json' });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results || []).map((r) => ({
        name: r.name,
        label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
        lat: Number(r.latitude),
        lon: Number(r.longitude),
        elevation: r.elevation != null ? Number(r.elevation) : null,
        country: r.country || '',
        admin1: r.admin1 || '',
        feature_code: r.feature_code || '',
        climate: inferClimateBand(r.latitude, r.longitude, r.country || ''),
        provider: 'open-meteo'
      }));
    } catch {
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  return [];
}

async function resolveLocation(query) {
  const pool = await geocodeOpenMeteoPool(query);
  const resolved = resolveGardenLocationFromCandidates(pool, query);
  if (!resolved.ok) {
    return { ok: false, ...resolved, pool };
  }
  const loc = resolved.location;
  return {
    ok: true,
    location: {
      ...loc,
      climate: loc.climate || inferClimateBand(loc.lat, loc.lon, loc.country),
      elevation: loc.elevation ?? null
    },
    pool
  };
}

async function hydrate(loc) {
  await new Promise((r) => setTimeout(r, 1800));
  return fetchStructuralClimateForCoordinates(loc.lat, loc.lon, {
    maxAttempts: 6,
    bypassCache: false
  });
}

function buildProfile(loc, structuralClimate) {
  let climateProfile = {
    locationLabel: loc.label,
    climateLabel: loc.climate,
    broadClimate: broadClimateFromLocationClimate(loc.climate),
    freezingRisk: structuralFreezingRiskFromBroadClimate(
      broadClimateFromLocationClimate(loc.climate)
    ),
    elevationM: loc.elevation,
    structuralClimate
  };
  climateProfile = applyStructuralClimateToProfile(climateProfile, structuralClimate);
  return {
    ...climateProfile,
    ...structuralEnvironmentFromClimateProfile(climateProfile)
  };
}

function evaluate(plant, meta, climateProfile) {
  const suitability = {
    recommendationLevel: climateProfile.isFrostFreeGrowingClimate ? 'good' : 'borderline',
    survivalFit: climateProfile.isFrostFreeGrowingClimate
      ? 85
      : climateProfile.freezingRisk === 'high'
        ? 15
        : 70,
    thriveFit: climateProfile.isFrostFreeGrowingClimate
      ? 80
      : climateProfile.freezingRisk === 'high'
        ? 15
        : 55,
    floweringFit: meta.floweringRequirements ? 70 : 50,
    fruitingFit: meta.fruitingRequirements ? 70 : 40,
    warnings: [],
    explanationText: ''
  };
  // Mirror Smart Rec chill thrive cut when deficit
  if (
    plantNeedsWinterChill(meta) &&
    climateProfile.alwaysHot &&
    !climateProfile.coolSeasonSignal
  ) {
    suitability.thriveFit = Math.min(suitability.thriveFit, 30);
    suitability.fruitingFit = Math.min(suitability.fruitingFit, 10);
    suitability.warnings.push(
      'Reliable fruiting is unlikely without winter chill or a clear cool season.'
    );
  }
  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile,
    suitability,
    plant
  });
  return { suitability, outcomes, climateProfile };
}

function positiveEvidenceTrace(plant, meta, climateProfile, outcomes) {
  const evidence = [];
  if (meta.needsReview) evidence.push('FAIL:needsReview-still-true');
  if (!climateProfile.isFrostFreeGrowingClimate && meta.frostSensitivity === 'high') {
    evidence.push('FAIL:high-frost-without-frost-free');
  }
  if (meta.frostSensitivity) evidence.push(`frostSensitivity=${meta.frostSensitivity}`);
  if (meta.humidityTolerance) evidence.push(`humidityTolerance=${meta.humidityTolerance}`);
  if (climateProfile.humiditySignal) evidence.push(`humiditySignal=${climateProfile.humiditySignal}`);
  if (climateProfile.moistureRegime) evidence.push(`moistureRegime=${climateProfile.moistureRegime}`);
  if (climateProfile.isFrostFreeGrowingClimate) evidence.push('isFrostFreeGrowingClimate=true');
  if (meta.floweringRequirements) evidence.push('floweringRequirements:sourced');
  if (meta.fruitingRequirements) evidence.push('fruitingRequirements:sourced');
  if (plant.source?.provenance?.length) {
    evidence.push(
      `provenance:${plant.source.provenance.map((p) => p.sourceId || p.title).join(',')}`
    );
  }
  if (outcomes.survival === 'reliable') evidence.push('survival=reliable');
  if (outcomes.growth === 'supported') evidence.push('growth=supported');
  return evidence;
}

test('calibration set: needsReview cleared only for validated climate scope + provenance', () => {
  const doc = loadSeed();
  const bySlug = Object.fromEntries((doc.plants || []).map((p) => [p.slug, p]));
  for (const slug of CALIBRATION_SLUGS) {
    const p = bySlug[slug];
    assert.ok(p, `missing calibration plant ${slug}`);
    assert.equal(p.climateTraits?.needsReview, false, `${slug} climateTraits.needsReview`);
    assert.ok(Array.isArray(p.source?.provenance) && p.source.provenance.length > 0, `${slug} provenance`);
    assert.equal(p.source?.calibrationSet, 'pre-scale-systemic-fixes-v1');
    REPORT.calibration.push({
      slug,
      role: p.verification?.calibrationRole,
      needsReview: p.climateTraits?.needsReview,
      unknownFields: p.source?.unknownFields || [],
      needsReviewFields: p.source?.needsReviewFields || [],
      provenanceIds: (p.source?.provenance || []).map((x) => x.sourceId)
    });
  }
  // Non-calibration plant remains conservative review flag
  const papaya = bySlug.papaya;
  assert.equal(papaya?.climateTraits?.needsReview, true);
});

test('location: Brazil / California / Singapore / city / ambiguous', async () => {
  const brazil = await resolveLocation('Brazil');
  assert.equal(brazil.ok, false);
  assert.equal(brazil.code, NEEDS_MORE_SPECIFIC_LOCATION);

  const california = await resolveLocation('California');
  assert.equal(california.ok, false);
  assert.equal(california.code, LOCATION_NEEDS_CONFIRMATION);

  const singapore = await resolveLocation('Singapore');
  assert.equal(singapore.ok, true);
  assert.equal(singapore.location.feature_code, 'PPLC');
  assert.ok(!isTooBroadForGardenClimate(singapore.location));
  assert.equal(mayAcceptResolvedLocationForGardenClimate(singapore.location).ok, true);

  const kochi = await resolveLocation('Kochi, Kerala');
  assert.equal(kochi.ok, true);
  assert.match(String(kochi.location.label || kochi.location.name), /Kochi/i);
  assert.match(String(kochi.location.admin1 || kochi.location.label), /Kerala/i);

  const springfield = resolveGardenLocationFromCandidates(
    [
      {
        name: 'Springfield',
        admin1: 'Illinois',
        country: 'United States',
        feature_code: 'PPLA',
        lat: 39.78,
        lon: -89.65,
        label: 'Springfield, Illinois'
      },
      {
        name: 'Springfield',
        admin1: 'Missouri',
        country: 'United States',
        feature_code: 'PPLA2',
        lat: 37.21,
        lon: -93.29,
        label: 'Springfield, Missouri'
      }
    ],
    'Springfield'
  );
  assert.equal(springfield.ok, false);
  assert.equal(springfield.code, LOCATION_NEEDS_CONFIRMATION);

  REPORT.gateNotes.push({
    brazil: brazil.code,
    california: california.code,
    singapore: singapore.location?.label,
    kochi: kochi.location?.label
  });
});

test('matrix hydrate + thermal + chill + differentiation', async () => {
  clearStructuralClimateCache();
  const doc = loadSeed();
  const plants = (doc.plants || []).filter((p) => CALIBRATION_SLUGS.includes(p.slug));
  const hydrateTimes = [];

  for (const locCase of MATRIX_LOCATIONS) {
    const resolved = await resolveLocation(locCase.query);
    if (!resolved.ok) {
      REPORT.locations[locCase.key] = { ok: false, code: resolved.code };
      if (locCase.key === 'Singapore') {
        assert.fail('Singapore must resolve as city-state locality');
      }
      continue;
    }
    const loc = resolved.location;
    const t0 = performance.now();
    const sc = await hydrate(loc);
    hydrateTimes.push(performance.now() - t0);
    if (!sc.ok) {
      // Retry once after backoff (archive 429)
      await new Promise((r) => setTimeout(r, 4000));
      const sc2 = await fetchStructuralClimateForCoordinates(loc.lat, loc.lon, {
        maxAttempts: 6,
        bypassCache: true
      });
      if (!sc2.ok) {
        REPORT.locations[locCase.key] = { ok: false, hydrateError: sc2.error || sc.error };
        // Critical highland locations must hydrate
        if (locCase.key === 'Quito' || locCase.key === 'MexicoCity' || locCase.key === 'Kochi') {
          assert.fail(`${locCase.key} structural hydrate failed: ${sc2.error || sc.error}`);
        }
        continue;
      }
      Object.assign(sc, sc2);
    }
    assert.equal(sc.ok, true, `${locCase.key} structural hydrate`);
    const profile = buildProfile(loc, sc.structuralClimate);
    REPORT.locations[locCase.key] = {
      ok: true,
      label: loc.label,
      elevation: loc.elevation ?? profile.elevationM,
      broadClimate: profile.broadClimate,
      isFrostFreeGrowingClimate: profile.isFrostFreeGrowingClimate,
      alwaysHot: profile.alwaysHot,
      coolSeasonSignal: profile.coolSeasonSignal,
      thermalRegime: profile.thermalRegime,
      coldestMonthMeanMinC: profile.coldestMonthMeanMinC,
      moistureRegime: profile.moistureRegime,
      humiditySignal: profile.humiditySignal
    };

    for (const plant of plants) {
      const meta = metaFor(plant);
      const { outcomes } = evaluate(plant, meta, profile);
      const row = {
        location: locCase.key,
        slug: plant.slug,
        overall: outcomes.overall,
        survival: outcomes.survival,
        growth: outcomes.growth,
        flowering: outcomes.flowering,
        fruiting: outcomes.fruiting,
        limiting: outcomes.limitingFactors,
        unknown: outcomes.unknownEvidence
      };
      REPORT.matrix.push(row);

      if (['good', 'excellent'].includes(outcomes.overall) || ['reliable', 'supported'].includes(outcomes.survival)) {
        if (['good', 'excellent'].includes(outcomes.overall)) {
          const evidence = positiveEvidenceTrace(plant, meta, profile, outcomes);
          assert.ok(
            !evidence.some((e) => e.startsWith('FAIL:')),
            `${plant.slug}@${locCase.key} positive lacks evidence: ${evidence.join('|')}`
          );
          assert.equal(meta.needsReview, false);
          REPORT.positives.push({ ...row, evidence });
        }
      }

      if (outcomes.overall === 'blocked' || outcomes.survival === 'unreliable') {
        assert.ok(
          (outcomes.limitingFactors || []).length > 0,
          `${plant.slug}@${locCase.key} negative without limiting evidence`
        );
        // Missing metadata alone must not be the only negative driver for Not Recommended
        const onlyUnknown =
          (outcomes.limitingFactors || []).length === 0 &&
          (outcomes.unknownEvidence || []).length > 0;
        assert.equal(onlyUnknown, false);
        REPORT.negatives.push({
          ...row,
          limiting: outcomes.limitingFactors
        });
      }

      for (const gap of outcomes.unknownEvidence || []) {
        REPORT.unknowns.push({ location: locCase.key, slug: plant.slug, gap });
      }
    }
  }

  // 1. Quito / Mexico City thermal
  const quito = REPORT.locations.Quito;
  const mexico = REPORT.locations.MexicoCity;
  assert.ok(quito?.ok && mexico?.ok);
  assert.notEqual(quito.isFrostFreeGrowingClimate, true, 'Quito must not be frost-free growing');
  assert.notEqual(mexico.isFrostFreeGrowingClimate, true, 'Mexico City must not be frost-free growing');
  assert.ok(
    quito.thermalRegime === 'cool-highland' ||
      quito.thermalRegime === 'cool-seasonal' ||
      Number(quito.coldestMonthMeanMinC) < 10,
    `Quito thermal=${quito.thermalRegime} cold=${quito.coldestMonthMeanMinC}`
  );
  assert.ok(
    mexico.thermalRegime === 'cool-highland' ||
      mexico.thermalRegime === 'cool-seasonal' ||
      Number(mexico.coldestMonthMeanMinC) < 10,
    `Mexico City thermal=${mexico.thermalRegime}`
  );
  assert.notEqual(quito.alwaysHot, true);
  assert.notEqual(mexico.alwaysHot, true);
  assert.notEqual(quito.broadClimate, 'tropical');

  // 4. Kiwi chill in Singapore / Kochi
  const kiwiSg = REPORT.matrix.find((r) => r.slug === 'kiwi' && r.location === 'Singapore');
  const almondSg = REPORT.matrix.find((r) => r.slug === 'almond' && r.location === 'Singapore');
  assert.ok(kiwiSg);
  assert.equal(kiwiSg.fruiting, 'unreliable');
  assert.notEqual(kiwiSg.overall, 'good');
  assert.ok((kiwiSg.limiting || []).some((m) => /chill|cool season/i.test(m)));
  assert.ok(almondSg);
  assert.equal(almondSg.fruiting, 'unreliable');

  // 5. Kochi differentiation — not identical Borderline for all calibration plants
  const kochiRows = REPORT.matrix.filter((r) => r.location === 'Kochi');
  const kochiOveralls = new Set(kochiRows.map((r) => r.overall));
  assert.ok(kochiOveralls.size > 1, `Kochi collapsed to single overall: ${[...kochiOveralls]}`);
  const kochiGood = kochiRows.filter((r) => r.overall === 'good');
  assert.ok(kochiGood.length >= 1, 'Kochi should have at least one evidence-backed Good');
  const coconutKochi = kochiRows.find((r) => r.slug === 'coconut');
  const cypressKochi = kochiRows.find((r) => r.slug === 'cypress');
  assert.ok(coconutKochi && cypressKochi);
  assert.notEqual(coconutKochi.overall, cypressKochi.overall);

  // 9. Cairo vs Kochi structural differentiation
  assert.notEqual(
    REPORT.locations.Cairo.moistureRegime,
    REPORT.locations.Kochi.moistureRegime
  );
  assert.notEqual(REPORT.locations.Cairo.humiditySignal, REPORT.locations.Kochi.humiditySignal);

  // 6–8 positives exist and unknowns preserved
  assert.ok(REPORT.positives.length >= 1, 'need evidence-backed positives');
  assert.ok(REPORT.unknowns.length >= 1, 'UNKNOWN gaps should remain where metadata absent');

  REPORT.performance.structuralHydrateMs = {
    n: hydrateTimes.length,
    mean: hydrateTimes.reduce((a, b) => a + b, 0) / hydrateTimes.length,
    max: Math.max(...hydrateTimes)
  };

  const samplePlant = plants.find((p) => p.slug === 'coconut');
  const sampleMeta = metaFor(samplePlant);
  const kochiLoc = (await resolveLocation('Kochi, Kerala')).location;
  const kochiSc = await fetchStructuralClimateForCoordinates(kochiLoc.lat, kochiLoc.lon);
  const kochiProfile = buildProfile(kochiLoc, kochiSc.structuralClimate);
  const warm = measureSpecificPlantEvaluationLatency(() => {
    evaluate(samplePlant, sampleMeta, kochiProfile);
  }, 200);
  REPORT.performance.warmPerPlantP95Ms = warm.p95Ms;

  const batch100 = measureSpecificPlantEvaluationLatency(() => {
    for (let i = 0; i < 100; i++) evaluate(samplePlant, sampleMeta, kochiProfile);
  }, 20);
  const batch500 = measureSpecificPlantEvaluationLatency(() => {
    for (let i = 0; i < 500; i++) evaluate(samplePlant, sampleMeta, kochiProfile);
  }, 10);
  REPORT.performance.batch100P95Ms = batch100.p95Ms;
  REPORT.performance.batch500P95Ms = batch500.p95Ms;
  assert.ok(warm.p95Ms < 5, `warm P95 too slow: ${warm.p95Ms}`);
});

test('unit: highland thermal overrides latitude tropical frost-free', () => {
  const highland = {
    broadClimate: 'tropical',
    freezingRisk: 'low',
    coldestMonthMeanMinC: 7.5,
    elevationM: 2850,
    structuralColdRisk: 'elevated',
    thermalRegime: 'cool-highland'
  };
  assert.equal(isFrostFreeGrowingClimate(highland), false);
  const env = structuralEnvironmentFromClimateProfile({
    ...highland,
    climateLabel: 'Tropical',
    structuralClimate: {
      status: 'known',
      thermalRegime: 'cool-highland',
      elevationM: 2850,
      structuralColdRisk: 'elevated',
      freezingRisk: 'medium',
      humiditySignal: 'medium',
      moistureRegime: 'humid',
      evidence: { coldestMonthMeanMinC: 7.5, elevationM: 2850 }
    }
  });
  assert.equal(env.isFrostFreeGrowingClimate, false);
  assert.equal(env.alwaysHot, false);
  assert.equal(env.coolSeasonSignal, true);
});

test('unit: chill deficit constrains kiwi productive outcomes', () => {
  const meta = {
    frostSensitivity: 'low',
    coldTolerance: 'medium',
    heatTolerance: 'medium',
    humidityTolerance: 'medium',
    needsWinterChill: true,
    groupIds: ['temperate-chill-fruit-tree'],
    needsReview: false,
    floweringRequirements: 'Needs winter chill for bloom.',
    fruitingRequirements: 'Needs winter chill for fruit.'
  };
  const climateProfile = {
    broadClimate: 'tropical',
    freezingRisk: 'low',
    humiditySignal: 'high',
    alwaysHot: true,
    coolSeasonSignal: false,
    isFrostFreeGrowingClimate: true,
    moistureRegime: 'humid'
  };
  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile,
    suitability: {
      recommendationLevel: 'good',
      survivalFit: 80,
      thriveFit: 30,
      floweringFit: 70,
      fruitingFit: 10,
      warnings: []
    },
    plant: { slug: 'kiwi' }
  });
  assert.equal(outcomes.fruiting, 'unreliable');
  assert.equal(outcomes.flowering, 'unlikely');
  assert.notEqual(outcomes.overall, 'good');
});

test('report dump', () => {
  const out = path.join(HERE, '_pre-scale-systemic-fixes-v1-report.json');
  fs.writeFileSync(out, JSON.stringify(REPORT, null, 2));
  assert.ok(fs.existsSync(out));
  console.log('\nPRE_SCALE_SYSTEMIC_FIXES_V1 report written:', out);
  console.log('positives:', REPORT.positives.length, 'negatives:', REPORT.negatives.length);
  console.log('Quito:', REPORT.locations.Quito);
  console.log('MexicoCity:', REPORT.locations.MexicoCity);
  console.log('performance:', REPORT.performance);
});
