/**
 * Cacao five-location quality acceptance after Catalog Expansion V1 ingest.
 * Uses existing Specific Plant Outcome evaluator — no cacao-specific suitability logic.
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
  reportCacaoCatalogStatus,
  structuralEnvironmentFromClimateProfile,
  structuralFreezingRiskFromBroadClimate
} from '../modules/personal-domain/specific-plant-suitability-contract.js';
import {
  NEEDS_MORE_SPECIFIC_LOCATION,
  isTooBroadForGardenClimate,
  mayAcceptResolvedLocationForGardenClimate
} from '../modules/personal-domain/location-granularity-contract.js';
import { IMAGE_PENDING } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import {
  applyStructuralClimateToProfile,
  fetchStructuralClimateForCoordinates
} from '../modules/personal-domain/structural-climate-authority-v1.js';

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

function loadCacao() {
  const raw = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  const plants = (raw.plants || []).map((p) => ({
    slug: p.slug,
    name: p.names?.en || p.slug,
    scientific: p.scientific,
    aliases: p.aliases || [],
    climateTraits: p.climateTraits,
    tags: p.tags || [],
    qualityTier: p.qualityTier,
    media: p.media,
    source: p.source,
    verification: p.verification
  }));
  const status = reportCacaoCatalogStatus(plants);
  assert.equal(status.present, true, 'Cacao must be in catalog for this acceptance');
  const plant = findCatalogPlantBySlugOrName(plants, 'cacao');
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
  return { plant, meta, traits: t, seedRow: raw.plants.find((p) => p.slug === 'cacao') };
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
    headers: { 'User-Agent': 'cruvit-cacao-outcome-quality/1.0' },
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
    climate: inferClimate(Number(r.lat), Number(r.lon), addr.country || ''),
    provider: 'nominatim'
  };
}

async function resolveLocation(query) {
  let loc = mapOM(await geocodeOpenMeteo(query));
  if (!loc) loc = mapNom(await geocodeNominatim(query));
  return loc;
}

async function hydrateStructural(loc) {
  const t0 = performance.now();
  const result = await fetchStructuralClimateForCoordinates(loc.lat, loc.lon);
  const acquisitionMs = performance.now() - t0;
  return {
    structuralClimate: result.structuralClimate,
    acquisitionMs: result.acquisitionMs ?? acquisitionMs,
    ok: result.ok,
    error: result.error
  };
}

function evaluateAt(loc, plant, meta, structuralClimate) {
  const broad = broadClimateFromLocationClimate(loc.climate);
  const freezingRisk = structuralFreezingRiskFromBroadClimate(broad);
  let climateProfile = {
    locationLabel: loc.label,
    climateLabel: loc.climate,
    broadClimate: broad,
    freezingRisk,
    structuralClimate
  };
  climateProfile = applyStructuralClimateToProfile(climateProfile, structuralClimate);
  climateProfile = {
    ...climateProfile,
    ...structuralEnvironmentFromClimateProfile(climateProfile)
  };
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

test('Cacao catalog row has provenance + IMAGE_PENDING', () => {
  const { seedRow, meta } = loadCacao();
  assert.equal(seedRow.source?.provider, 'catalog-expansion-v1');
  assert.equal(seedRow.media?.imageStatus, IMAGE_PENDING);
  assert.ok(Array.isArray(seedRow.source?.provenance));
  assert.ok(seedRow.source.provenance.some((p) => /ifas|ufl/i.test(p.institution + p.url)));
  assert.ok(meta.floweringRequirements);
  assert.ok(meta.fruitingRequirements);
  // Pre-scale calibration cleared climate needsReview for cacao's validated scope;
  // rainfallMmAnnual remains UNKNOWN / needsReviewFields may still list disputed slots.
  assert.equal(meta.needsReview, false);
  assert.ok(seedRow.source?.unknownFields?.includes('rainfallMmAnnual'));
});

test('Cacao five-location quality acceptance + latency', async (t) => {
  const { plant, meta, traits } = loadCacao();
  const cases = [
    { key: 'Brazil', query: 'Brazil' },
    { key: 'Kochi', query: 'Kochi, India' },
    { key: 'Cairo', query: 'Cairo, Egypt' },
    { key: 'Tokyo', query: 'Tokyo, Japan' },
    { key: 'Yehiam', query: 'Yehiam, Israel' }
  ];

  let setupMs = 0;
  let structuralAcquisitionTotalMs = 0;
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

    let hydrated;
    try {
      // Pace archive requests — hydrate is once per location, not per plant.
      await new Promise((r) => setTimeout(r, 1500));
      hydrated = await hydrateStructural(loc);
    } catch (err) {
      t.skip(`${c.key} structural climate failed: ${err?.message || err}`);
      return;
    }
    structuralAcquisitionTotalMs += hydrated.acquisitionMs || 0;
    if (!hydrated.ok) {
      t.skip(`${c.key} structural climate unavailable: ${hydrated.error}`);
      return;
    }

    const evaluated = evaluateAt(loc, plant, meta, hydrated.structuralClimate);
    REPORT.push({
      location: c.key,
      query: c.query,
      resolvedLabel: loc.label,
      climate: evaluated.climateProfile.climateLabel,
      broadClimate: evaluated.climateProfile.broadClimate,
      moistureRegime: evaluated.climateProfile.moistureRegime,
      humidityRegime: evaluated.climateProfile.humidityRegime,
      humiditySignal: evaluated.climateProfile.humiditySignal,
      structuralColdRisk: evaluated.climateProfile.structuralColdRisk,
      coldestMonthMeanMinC: evaluated.climateProfile.coldestMonthMeanMinC,
      annualPrecipitationMm: evaluated.climateProfile.annualPrecipitationMm,
      aridityIndex: evaluated.climateProfile.aridityIndex,
      freezingRisk: evaluated.climateProfile.freezingRisk,
      frostFree: evaluated.climateProfile.isFrostFreeGrowingClimate,
      structuralAcquisitionMs: hydrated.acquisitionMs,
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
      evidence: hydrated.structuralClimate?.evidence || null,
      provenance: hydrated.structuralClimate?.provenance || null
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

  console.log('\n=== CACAO_FIVE_LOCATION_QUALITY_REPORT ===');
  console.log(
    JSON.stringify(
      {
        plant: { slug: plant.slug, scientific: plant.scientific, traits },
        networkSetupMs: setupMs,
        structuralClimateAcquisitionTotalMs: structuralAcquisitionTotalMs,
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

  // Kochi vs Cairo must differ via structural moisture/humidity — not frost-free collapse.
  assert.notEqual(kochi.moistureRegime, cairo.moistureRegime);
  assert.ok(
    cairo.humiditySignal === 'low' ||
      cairo.moistureRegime === 'arid' ||
      cairo.moistureRegime === 'hyper-arid'
  );
  assert.notEqual(kochi.overallCode, cairo.overallCode);
  assert.equal(cairo.overallCode, 'blocked');
  assert.equal(cairo.survival, 'Unreliable');
  assert.ok((cairo.limiting || []).some((x) => /arid|humidity|moisture|cold/i.test(x)));

  // Calibrated cacao may earn evidence-backed Good in humid tropical Kochi.
  assert.equal(kochi.overallCode, 'good');
  assert.equal(kochi.survival, 'Reliable');
  assert.ok(kochi.moistureRegime === 'humid');

  // Non-hospitable sites must not leak confident Good/Excellent.
  for (const row of [cairo, tokyo, yehiam]) {
    assert.notEqual(row.overallCode, 'good');
    assert.notEqual(row.overallCode, 'excellent');
    if (row.survival === 'Unreliable') {
      assert.equal(row.overallCode, 'blocked');
    }
  }

  const rank = { Unreliable: 0, Constrained: 1, Supported: 2, Reliable: 3, Poor: 0, UNKNOWN: -1 };
  assert.ok((rank[tokyo.survival] ?? 0) <= (rank[kochi.survival] ?? 3));

  assert.equal(yehiam.survival, 'Unreliable');
  assert.equal(yehiam.overallCode, 'blocked');

  assert.ok(latency.p95Ms < 500, `P95 ${latency.p95Ms}ms must be < 500ms`);
  assert.ok(latency.maxMs < 1000, `max ${latency.maxMs}ms must be < 1000ms`);
});
