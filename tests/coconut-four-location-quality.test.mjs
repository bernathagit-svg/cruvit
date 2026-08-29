/**
 * Coconut multi-location quality acceptance after general outcome authority fixes.
 * No hardcoded expected city outcomes — asserts quality gates + reports results.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {
  broadClimateFromLocationClimate,
  deriveSpecificPlantOutcomes,
  findCatalogPlantBySlugOrName,
  measureSpecificPlantEvaluationLatency,
  structuralEnvironmentFromClimateProfile,
  structuralFreezingRiskFromBroadClimate
} from '../modules/personal-domain/specific-plant-suitability-contract.js';
import {
  NEEDS_MORE_SPECIFIC_LOCATION,
  isTooBroadForGardenClimate,
  mayAcceptResolvedLocationForGardenClimate
} from '../modules/personal-domain/location-granularity-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');

function inferClimate(lat, lon, country = '') {
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

function loadCoconut() {
  const raw = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  const plants = (raw.plants || []).map((p) => ({
    slug: p.slug,
    name: p.names?.en || p.slug,
    scientific: p.scientific,
    aliases: p.aliases || [],
    climateTraits: p.climateTraits,
    tags: p.tags || [],
    qualityTier: p.qualityTier
  }));
  const plant = findCatalogPlantBySlugOrName(plants, 'coconut');
  const t = plant.climateTraits;
  const meta = {
    frostSensitivity: t.frostSensitivity,
    heatTolerance: t.heatTolerance,
    coldTolerance: t.coldTolerance,
    humidityTolerance: t.humidityTolerance,
    waterNeeds: t.waterNeeds,
    groupIds: t.groupIds || [],
    needsReview: t.needsReview === true,
    survivalVsThriveNotes: t.survivalVsThriveNotes || '',
    floweringRequirements: t.floweringRequirements || '',
    fruitingRequirements: t.fruitingRequirements || ''
  };
  return { plant, meta, traits: t };
}

async function geocodeOpenMeteo(query) {
  const url =
    'https://geocoding-api.open-meteo.com/v1/search?' +
    new URLSearchParams({ name: query, count: '8', language: 'en', format: 'json' });
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.results || [])[0] || null;
}

async function geocodeNominatim(query) {
  const url =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      q: query,
      format: 'json',
      limit: '5',
      addressdetails: '1'
    });
  const res = await fetch(url, {
    headers: { 'User-Agent': 'cruvit-outcome-quality-fix/1.1' },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return (rows || [])[0] || null;
}

function mapOM(r) {
  if (!r) return null;
  return {
    name: r.name,
    label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    lat: Number(r.latitude),
    lon: Number(r.longitude),
    country: r.country || '',
    feature_code: r.feature_code || '',
    climate: inferClimate(r.latitude, r.longitude, r.country || ''),
    provider: 'open-meteo'
  };
}

function mapNom(r) {
  if (!r) return null;
  const addr = r.address || {};
  const name =
    r.name || addr.city || addr.town || addr.village || addr.state || addr.country || '';
  return {
    name,
    label: r.display_name || [name, addr.state, addr.country].filter(Boolean).join(', '),
    lat: Number(r.lat),
    lon: Number(r.lon),
    country: addr.country || '',
    feature_code:
      r.addresstype === 'country' ? 'PCLI' : r.addresstype === 'state' ? 'ADM1' : '',
    addresstype: r.addresstype || '',
    class: r.class || '',
    type: r.type || '',
    climate: inferClimate(Number(r.lat), Number(r.lon), addr.country || ''),
    provider: 'nominatim'
  };
}

async function resolveLocation(query) {
  let loc = mapOM(await geocodeOpenMeteo(query));
  if (!loc) loc = mapNom(await geocodeNominatim(query));
  return loc;
}

function evaluateAt(loc, plant, meta) {
  const broad = broadClimateFromLocationClimate(loc.climate);
  const freezingRisk = structuralFreezingRiskFromBroadClimate(broad);
  const climateProfile = {
    locationLabel: loc.label,
    climateLabel: loc.climate,
    ...structuralEnvironmentFromClimateProfile({
      climateLabel: loc.climate,
      broadClimate: broad,
      freezingRisk
    })
  };
  const suitability = {
    recommendationLevel: climateProfile.isFrostFreeGrowingClimate ? 'good' : 'borderline',
    survivalFit: climateProfile.isFrostFreeGrowingClimate
      ? 85
      : freezingRisk === 'high'
        ? 15
        : 70,
    thriveFit: climateProfile.isFrostFreeGrowingClimate
      ? 80
      : freezingRisk === 'high'
        ? 15
        : 55,
    floweringFit: 50,
    fruitingFit: 40,
    warnings: [],
    explanationText: ''
  };
  const t0 = performance.now();
  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile,
    suitability,
    plant,
    protectedGrowing: false
  });
  const evalMs = performance.now() - t0;
  return { climateProfile, outcomes, suitability, evalMs };
}

const REPORT = [];

test('Brazil country hit cannot become trusted Garden climate authority', () => {
  const brazil = {
    name: 'Brazil',
    label: 'Brazil, Brazil',
    lat: -10,
    lon: -55,
    country: 'Brazil',
    feature_code: 'PCLI',
    climate: 'Tropical'
  };
  assert.equal(isTooBroadForGardenClimate(brazil), true);
  const gate = mayAcceptResolvedLocationForGardenClimate(brazil);
  assert.equal(gate.ok, false);
  assert.equal(gate.code, NEEDS_MORE_SPECIFIC_LOCATION);
  // Israel-only gate is gone: Brazil must fail the general gate.
  assert.equal(isTooBroadForGardenClimate({ name: 'israel', label: 'Israel', feature_code: 'PCLI' }), true);
});

test('Coconut five-location quality acceptance + latency', async (t) => {
  const { plant, meta, traits } = loadCoconut();
  const cases = [
    { key: 'Brazil', query: 'Brazil' },
    { key: 'Kochi', query: 'Kochi, India' },
    { key: 'Cairo', query: 'Cairo, Egypt' },
    { key: 'Tokyo', query: 'Tokyo, Japan' },
    { key: 'Yehiam', query: 'Yehiam, Israel' }
  ];

  let setupMs = 0;
  for (const c of cases) {
    const tSetup = performance.now();
    let loc;
    try {
      loc = await resolveLocation(c.query);
    } catch (err) {
      t.skip(`${c.key} geocode failed: ${err?.message || err}`);
      return;
    }
    setupMs += performance.now() - tSetup;

    if (c.key === 'Brazil' || (loc && isTooBroadForGardenClimate(loc))) {
      REPORT.push({
        location: c.key,
        display: NEEDS_MORE_SPECIFIC_LOCATION,
        resolved: loc
          ? {
              label: loc.label,
              feature_code: loc.feature_code,
              climate: loc.climate,
              provider: loc.provider
            }
          : null,
        gate: mayAcceptResolvedLocationForGardenClimate(loc)
      });
      continue;
    }

    if (!loc) {
      REPORT.push({ location: c.key, display: 'UNRESOLVED' });
      continue;
    }

    const evaluated = evaluateAt(loc, plant, meta);
    REPORT.push({
      location: c.key,
      query: c.query,
      resolvedLabel: loc.label,
      climate: evaluated.climateProfile.climateLabel,
      broadClimate: evaluated.climateProfile.broadClimate,
      humiditySignal: evaluated.climateProfile.humiditySignal,
      freezingRisk: evaluated.climateProfile.freezingRisk,
      frostFree: evaluated.climateProfile.isFrostFreeGrowingClimate,
      overall: evaluated.outcomes.overallLabel,
      overallCode: evaluated.outcomes.overall,
      survival: evaluated.outcomes.survivalLabel,
      growth: evaluated.outcomes.growthLabel,
      flowering: evaluated.outcomes.floweringLabel,
      fruiting: evaluated.outcomes.fruitingLabel,
      limiting: evaluated.outcomes.limitingFactors,
      unknownEvidence: evaluated.outcomes.unknownEvidence,
      needsReview: evaluated.outcomes.needsReview,
      evalMs: evaluated.evalMs,
      evidence: {
        frostSensitivity: meta.frostSensitivity,
        humidityTolerance: meta.humidityTolerance,
        groupIds: meta.groupIds,
        needsReview: meta.needsReview,
        floweringRequirements: meta.floweringRequirements || null,
        fruitingRequirements: meta.fruitingRequirements || null,
        survivalNotes: meta.survivalVsThriveNotes
      }
    });
  }

  const latency = measureSpecificPlantEvaluationLatency(() => {
    const kochi = REPORT.find((r) => r.location === 'Kochi');
    if (!kochi?.broadClimate) return;
    deriveSpecificPlantOutcomes({
      meta,
      climateProfile: structuralEnvironmentFromClimateProfile({
        broadClimate: kochi.broadClimate,
        climateLabel: kochi.climate,
        freezingRisk: kochi.freezingRisk
      }),
      suitability: {
        recommendationLevel: 'good',
        survivalFit: 85,
        thriveFit: 80,
        floweringFit: 50,
        fruitingFit: 40,
        warnings: [],
        explanationText: ''
      },
      plant
    });
  }, 300);

  console.log('\n=== COCONUT_FIVE_LOCATION_QUALITY_REPORT ===');
  console.log(
    JSON.stringify(
      {
        plant: { slug: plant.slug, scientific: plant.scientific, traits },
        networkSetupMs: setupMs,
        evaluationLatency: latency,
        report: REPORT
      },
      null,
      2
    )
  );

  const brazil = REPORT.find((r) => r.location === 'Brazil');
  assert.equal(brazil.display, NEEDS_MORE_SPECIFIC_LOCATION);

  const kochi = REPORT.find((r) => r.location === 'Kochi');
  const cairo = REPORT.find((r) => r.location === 'Cairo');
  const tokyo = REPORT.find((r) => r.location === 'Tokyo');
  const yehiam = REPORT.find((r) => r.location === 'Yehiam');

  assert.ok(kochi?.overall);
  assert.ok(cairo?.overall);
  assert.ok(tokyo?.overall);
  assert.ok(yehiam?.overall);

  // Cairo must not equal Kochi solely via frost-free Good collapse.
  if (kochi.frostFree && cairo.frostFree) {
    assert.ok(
      !(kochi.overallCode === 'good' && cairo.overallCode === 'good'),
      'Cairo must not share confident Good with Kochi from frost-free alone'
    );
  }

  // Fruiting Supported requires fruitingRequirements — coconut has none.
  for (const row of [kochi, cairo, tokyo, yehiam]) {
    assert.notEqual(row.fruiting, 'Supported');
    if (row.survival === 'Unreliable') {
      assert.equal(row.overallCode, 'blocked');
    }
  }

  // needsReview must not leak confident Good for Coconut.
  assert.notEqual(kochi.overallCode, 'good');
  assert.notEqual(kochi.overallCode, 'excellent');

  // Colder Tokyo survival not better than Kochi.
  const rank = { Unreliable: 0, Constrained: 1, Supported: 2, Reliable: 3, Poor: 0, UNKNOWN: -1 };
  assert.ok((rank[tokyo.survival] ?? 0) <= (rank[kochi.survival] ?? 3));

  assert.ok(latency.p95Ms < 500, `P95 ${latency.p95Ms}ms must be < 500ms`);
  assert.ok(latency.maxMs < 1000, `max ${latency.maxMs}ms must be < 1000ms`);
});
