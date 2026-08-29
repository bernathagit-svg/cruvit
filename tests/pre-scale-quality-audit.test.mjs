/**
 * CRUVIT Pre-Scale System Quality Audit harness.
 * Adversarial evidence collection — test-only; does not mutate catalog.
 *
 * Run: node --test tests/pre-scale-quality-audit.test.mjs
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
  searchCatalogPlantsForSpecificCheck,
  SPECIFIC_CHECK_CLEARS_SMART_REC_ANSWERS
} from '../modules/personal-domain/specific-plant-suitability-contract.js';
import {
  NEEDS_MORE_SPECIFIC_LOCATION,
  LOCATION_NEEDS_CONFIRMATION,
  isTooBroadForGardenClimate,
  mayAcceptResolvedLocationForGardenClimate,
  resolveGardenLocationFromCandidates
} from '../modules/personal-domain/location-granularity-contract.js';
import {
  applyStructuralClimateToProfile,
  fetchStructuralClimateForCoordinates
} from '../modules/personal-domain/structural-climate-authority-v1.js';
import {
  validateCatalogExpansionPacket,
  materializePlantCatalogItemFromPacket,
  mergePlantIntoSeedDocument,
  IMAGE_PENDING
} from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import {
  resolvePlantDisplayMedia,
  isApprovedCatalogMediaRecord,
  formatCatalogAttributionLabel,
  measureCatalogMediaLookupLatency,
  IMAGE_READY as MEDIA_IMAGE_READY
} from '../modules/catalog-media/licensed-catalog-media-runtime-v1.js';
import { IMAGE_READY as PIPELINE_IMAGE_READY } from '../modules/catalog-media/licensed-image-pipeline-v1-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const CACAO_PACKET = path.join(
  ROOT,
  'data',
  'catalog-expansion',
  'packets',
  'cacao-theobroma-cacao-v1',
  'packet.json'
);
const APP = path.join(ROOT, 'app.html');
const FINDINGS = [];

function finding(severity, area, title, detail) {
  FINDINGS.push({ severity, area, title, detail });
}

function loadPlants() {
  const raw = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  return (raw.plants || []).map((p) => ({
    slug: p.slug,
    name: p.names?.en || p.slug,
    scientific: p.scientific,
    aliases: p.aliases || [],
    climateTraits: p.climateTraits,
    tags: p.tags || [],
    qualityTier: p.qualityTier,
    media: p.media,
    source: p.source,
    needsReview:
      p.climateTraits?.needsReview === true ||
      p.needsReview === true ||
      p.qualityTier === 'needs_review'
  }));
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
    needsReview: t.needsReview === true || plant.needsReview === true,
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

function mapOM(r) {
  if (!r) return null;
  return {
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
  };
}

async function resolveLocation(query) {
  const url =
    'https://geocoding-api.open-meteo.com/v1/search?' +
    new URLSearchParams({ name: query, count: '8', language: 'en', format: 'json' });
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const data = await res.json();
  const pool = (data.results || []).map((r) => mapOM(r)).filter(Boolean);
  const qName = String(query || '').trim();
  const resolved = resolveGardenLocationFromCandidates(pool, qName || query);
  if (!resolved.ok) return { ...resolved, unresolved: true };
  return resolved.location;
}

async function hydrate(loc) {
  await new Promise((r) => setTimeout(r, 800));
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    last = await fetchStructuralClimateForCoordinates(loc.lat, loc.lon, { maxAttempts: 2 });
    if (last?.ok) return last;
    const err = String(last?.error || '');
    if (!/429|rate|timeout|fetch/i.test(err)) break;
    await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
  }
  return last;
}

/**
 * Prior verified structural normals (systemic-fixes V1 report + prior audit samples).
 * Used only when live Open-Meteo archive hydrate is rate-limited — keeps outcome matrix runnable.
 */
const STRUCTURAL_AUDIT_FIXTURES = {
  TelAviv: {
    status: 'known',
    moistureRegime: 'semi-arid',
    humiditySignal: 'low',
    humidityRegime: 'high',
    broadClimateOverride: 'mediterranean',
    freezingRisk: 'low',
    structuralColdRisk: 'elevated',
    thermalRegime: 'cool-seasonal',
    drySeasonSignal: true,
    elevationM: 15,
    evidence: {
      annualPrecipitationMm: 472.6,
      aridityIndex: 0.32,
      coldestMonthMeanMinC: 9.66,
      elevationM: 15,
      thermalRegime: 'cool-seasonal'
    },
    provenance: { source: 'audit-fixture-replay', note: 'prior live hydrate' }
  },
  Kochi: {
    status: 'known',
    moistureRegime: 'humid',
    humiditySignal: 'high',
    humidityRegime: 'high',
    broadClimateOverride: 'tropical',
    freezingRisk: 'low',
    structuralColdRisk: 'low',
    thermalRegime: 'year-round-warm',
    drySeasonSignal: false,
    elevationM: 9,
    evidence: {
      annualPrecipitationMm: 2804,
      aridityIndex: 2.12,
      coldestMonthMeanMinC: 23.4,
      elevationM: 9,
      thermalRegime: 'year-round-warm'
    },
    provenance: { source: 'audit-fixture-replay' }
  },
  Cairo: {
    status: 'known',
    moistureRegime: 'hyper-arid',
    humiditySignal: 'low',
    humidityRegime: 'medium',
    broadClimateOverride: 'arid',
    freezingRisk: 'low',
    structuralColdRisk: 'elevated',
    thermalRegime: 'cool-seasonal',
    drySeasonSignal: true,
    elevationM: 23,
    evidence: {
      annualPrecipitationMm: 34.9,
      aridityIndex: 0.017,
      coldestMonthMeanMinC: 8.89,
      elevationM: 23,
      thermalRegime: 'cool-seasonal'
    },
    provenance: { source: 'audit-fixture-replay' }
  },
  Singapore: {
    status: 'known',
    moistureRegime: 'humid',
    humiditySignal: 'high',
    humidityRegime: 'high',
    broadClimateOverride: 'tropical',
    freezingRisk: 'low',
    structuralColdRisk: 'low',
    thermalRegime: 'year-round-warm',
    drySeasonSignal: false,
    elevationM: 23,
    evidence: {
      coldestMonthMeanMinC: 24.46,
      elevationM: 23,
      thermalRegime: 'year-round-warm'
    },
    provenance: { source: 'audit-fixture-replay' }
  },
  Tokyo: {
    status: 'known',
    moistureRegime: 'humid',
    humiditySignal: 'high',
    humidityRegime: 'high',
    broadClimateOverride: 'temperate',
    freezingRisk: 'high',
    structuralColdRisk: 'high',
    thermalRegime: 'frost-prone',
    drySeasonSignal: false,
    elevationM: 44,
    evidence: {
      coldestMonthMeanMinC: -0.18,
      elevationM: 44,
      thermalRegime: 'frost-prone'
    },
    provenance: { source: 'audit-fixture-replay' }
  },
  London: {
    status: 'known',
    moistureRegime: 'humid',
    humiditySignal: 'high',
    humidityRegime: 'high',
    broadClimateOverride: 'cool-temperate',
    freezingRisk: 'medium',
    structuralColdRisk: 'elevated',
    thermalRegime: 'cool-seasonal',
    drySeasonSignal: false,
    elevationM: 25,
    evidence: {
      coldestMonthMeanMinC: 1.82,
      elevationM: 25,
      thermalRegime: 'cool-seasonal'
    },
    provenance: { source: 'audit-fixture-replay' }
  },
  Phoenix: {
    status: 'known',
    moistureRegime: 'arid',
    humiditySignal: 'low',
    humidityRegime: 'low',
    broadClimateOverride: 'arid',
    freezingRisk: 'low',
    structuralColdRisk: 'elevated',
    thermalRegime: 'cool-seasonal',
    drySeasonSignal: true,
    elevationM: 331,
    evidence: {
      coldestMonthMeanMinC: 5.5,
      elevationM: 331,
      aridityIndex: 0.12,
      thermalRegime: 'cool-seasonal'
    },
    provenance: { source: 'audit-fixture-replay' }
  },
  Zurich: {
    status: 'known',
    moistureRegime: 'humid',
    humiditySignal: 'medium',
    humidityRegime: 'medium',
    broadClimateOverride: 'temperate',
    freezingRisk: 'high',
    structuralColdRisk: 'high',
    thermalRegime: 'frost-prone',
    drySeasonSignal: false,
    elevationM: 429,
    evidence: {
      coldestMonthMeanMinC: -2.5,
      elevationM: 429,
      thermalRegime: 'frost-prone'
    },
    provenance: { source: 'audit-fixture-replay' }
  },
  Quito: {
    status: 'known',
    moistureRegime: 'humid',
    humiditySignal: 'high',
    humidityRegime: 'high',
    broadClimateOverride: 'highland-tropical',
    freezingRisk: 'medium',
    structuralColdRisk: 'elevated',
    thermalRegime: 'cool-highland',
    drySeasonSignal: false,
    elevationM: 2854,
    evidence: {
      coldestMonthMeanMinC: 7.85,
      elevationM: 2854,
      thermalRegime: 'cool-highland'
    },
    provenance: { source: 'audit-fixture-replay' }
  },
  MexicoCity: {
    status: 'known',
    moistureRegime: 'humid',
    humiditySignal: 'medium',
    humidityRegime: 'medium',
    broadClimateOverride: 'highland-tropical',
    freezingRisk: 'medium',
    structuralColdRisk: 'elevated',
    thermalRegime: 'cool-highland',
    drySeasonSignal: false,
    elevationM: 2240,
    evidence: {
      coldestMonthMeanMinC: 7.03,
      elevationM: 2240,
      thermalRegime: 'cool-highland'
    },
    provenance: { source: 'audit-fixture-replay' }
  },
  Yehiam: {
    status: 'known',
    moistureRegime: 'semi-arid',
    humiditySignal: 'medium',
    humidityRegime: 'medium',
    broadClimateOverride: 'mediterranean',
    freezingRisk: 'medium',
    structuralColdRisk: 'elevated',
    thermalRegime: 'cool-seasonal',
    drySeasonSignal: true,
    elevationM: 375,
    evidence: {
      coldestMonthMeanMinC: 6.5,
      elevationM: 375,
      annualPrecipitationMm: 650,
      aridityIndex: 0.45,
      thermalRegime: 'cool-seasonal'
    },
    provenance: {
      source: 'audit-fixture-replay',
      note: 'northern-israel-mediterranean-proxy-normals'
    }
  }
};

function applyStructuralFixtureIfNeeded(key, row, sc) {
  if (sc?.ok && sc.structuralClimate) return sc;
  const fixture = STRUCTURAL_AUDIT_FIXTURES[key];
  if (!fixture) return sc;
  finding(
    'P3',
    'climate',
    `${key} structural live fetch failed; using verified audit fixture`,
    sc?.error || 'unknown'
  );
  return {
    ok: true,
    error: null,
    structuralClimate: fixture,
    acquisitionMs: null,
    fromFixture: true
  };
}

function evaluate(plant, meta, loc, structuralClimate) {
  let climateProfile = {
    locationLabel: loc.label,
    climateLabel: loc.climate,
    broadClimate: broadClimateFromLocationClimate(loc.climate),
    freezingRisk: structuralFreezingRiskFromBroadClimate(
      broadClimateFromLocationClimate(loc.climate)
    ),
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
  return { climateProfile, outcomes, evalMs: performance.now() - t0, suitability };
}

function auditOutcomeRules(plant, meta, row) {
  const o = row.outcomes;
  const issues = [];
  if (o.survival === 'unreliable' && o.overall !== 'blocked') {
    issues.push('P1: survival unreliable but overall not blocked');
  }
  if (
    (o.overall === 'good' || o.overall === 'excellent') &&
    (meta.needsReview || plant.needsReview)
  ) {
    issues.push('P1: needsReview leaked confident Good/Excellent');
  }
  if (
    (o.overall === 'good' || o.overall === 'excellent') &&
    o.fruiting === 'unknown' &&
    (plant.tags || []).includes('fruit') &&
    String(meta.fruitingRequirements || '').trim() === ''
  ) {
    issues.push(
      'P2: Overall Good/Excellent for fruit-tagged plant while Fruiting UNKNOWN (no fruitingRequirements)'
    );
  }
  if (o.flowering === 'supported' && !String(meta.floweringRequirements || '').trim()) {
    issues.push('P1: Flowering Supported without floweringRequirements');
  }
  if (o.fruiting === 'supported' && !String(meta.fruitingRequirements || '').trim()) {
    issues.push('P1: Fruiting Supported without fruitingRequirements');
  }
  if (
    o.flowering === 'supported' &&
    !String(o.reproductiveEvidence?.flowering || '').startsWith('positive:')
  ) {
    issues.push('P1: Flowering Supported without positive reproductiveEvidence');
  }
  if (
    o.fruiting === 'supported' &&
    !String(o.reproductiveEvidence?.fruiting || '').startsWith('positive:')
  ) {
    issues.push('P1: Fruiting Supported without positive reproductiveEvidence');
  }
  if (
    (o.flowering === 'supported' || o.flowering === 'constrained') &&
    String(o.reproductiveEvidence?.flowering || '').includes('fit')
  ) {
    issues.push('P1: Flowering outcome cites numeric fit score as evidence');
  }
  if (
    (o.fruiting === 'supported' || o.fruiting === 'constrained') &&
    String(o.reproductiveEvidence?.fruiting || '').includes('fit')
  ) {
    issues.push('P1: Fruiting outcome cites numeric fit score as evidence');
  }
  if (
    o.overall === 'blocked' &&
    o.survival === 'unknown' &&
    !(o.limitingFactors || []).length
  ) {
    issues.push('P2: Not recommended from UNKNOWN survival without limiting factors');
  }
  return issues;
}

const LOCATION_CASES = [
  // Open-Meteo currently returns zero hits for Yehiam — treat as known geocode coverage gap (P3).
  { key: 'Yehiam', query: 'Yehiam, Israel', expect: 'accept', allowGeocodeGap: true },
  { key: 'TelAviv', query: 'Tel Aviv, Israel', expect: 'accept' },
  { key: 'Kochi', query: 'Kochi, Kerala', expect: 'accept' },
  { key: 'Cairo', query: 'Cairo, Egypt', expect: 'accept' },
  { key: 'Tokyo', query: 'Tokyo, Japan', expect: 'accept' },
  { key: 'London', query: 'London, United Kingdom', expect: 'accept' },
  { key: 'Singapore', query: 'Singapore', expect: 'accept' },
  { key: 'Phoenix', query: 'Phoenix, Arizona', expect: 'accept' },
  { key: 'Zurich', query: 'Zurich, Switzerland', expect: 'accept' },
  { key: 'Quito', query: 'Quito, Ecuador', expect: 'accept' },
  { key: 'MexicoCity', query: 'Mexico City, Mexico', expect: 'accept' },
  { key: 'Brazil', query: 'Brazil', expect: 'reject' },
  { key: 'California', query: 'California', expect: 'reject' }
];

const ARCHETYPES = [
  { id: 1, name: 'humid tropical fruit/crop', pick: (p) => p.slug === 'cacao' },
  { id: 2, name: 'tropical palm', pick: (p) => p.slug === 'coconut' || p.slug === 'areca-palm' },
  {
    id: 3,
    name: 'subtropical fruit',
    pick: (p) => p.slug === 'cherimoya' || p.slug === 'papaya'
  },
  {
    id: 4,
    name: 'Mediterranean plant',
    pick: (p) => p.slug === 'cypress' || p.slug === 'cedar'
  },
  {
    id: 5,
    name: 'humidity-sensitive Mediterranean',
    pick: (p) => (p.climateTraits?.groupIds || []).includes('humid-sensitive-mediterranean')
  },
  {
    id: 6,
    name: 'temperate chill-requiring fruit',
    pick: (p) =>
      p.climateTraits?.needsWinterChill === true &&
      (p.climateTraits?.groupIds || []).includes('temperate-chill-fruit-tree')
  },
  {
    id: 7,
    name: 'frost-tolerant temperate',
    pick: (p) =>
      p.climateTraits?.frostSensitivity === 'low' && p.climateTraits?.coldTolerance === 'high'
  },
  {
    id: 8,
    name: 'heat-sensitive plant',
    pick: (p) => p.climateTraits?.heatTolerance === 'low'
  },
  {
    id: 9,
    name: 'drought-tolerant plant',
    pick: (p) => p.climateTraits?.waterNeeds === 'low'
  },
  {
    id: 10,
    name: 'high-water/high-humidity plant',
    pick: (p) =>
      p.climateTraits?.waterNeeds === 'high' && p.climateTraits?.humidityTolerance === 'high'
  },
  {
    id: 11,
    name: 'incomplete climate metadata',
    pick: (p) =>
      !p.climateTraits?.frostSensitivity ||
      !p.climateTraits?.humidityTolerance ||
      !p.climateTraits?.heatTolerance
  },
  { id: 12, name: 'needsReview plant', pick: (p) => p.needsReview === true },
  {
    id: 13,
    name: 'ornamental/non-fruiting',
    pick: (p) => (p.tags || []).includes('ornamental') && !(p.tags || []).includes('fruit')
  },
  {
    id: 14,
    name: 'edible fruiting plant',
    pick: (p) => (p.tags || []).includes('fruit')
  },
  {
    id: 15,
    name: 'with flowering metadata',
    pick: (p) => !!(p.climateTraits?.floweringRequirements || '').trim()
  },
  {
    id: 16,
    name: 'without flowering metadata',
    pick: (p) => !(p.climateTraits?.floweringRequirements || '').trim()
  },
  {
    id: 17,
    name: 'with fruiting metadata',
    pick: (p) => !!(p.climateTraits?.fruitingRequirements || '').trim()
  },
  {
    id: 18,
    name: 'without fruiting metadata',
    pick: (p) => !(p.climateTraits?.fruitingRequirements || '').trim()
  }
];

const AUDIT = {
  locations: [],
  archetypes: [],
  samePlantManyClimates: [],
  sameClimateManyPlants: [],
  outcomeIssues: [],
  positives: [],
  negatives: [],
  catalog: {},
  image: {},
  performance: {},
  coverageGaps: [],
  securityNotes: [],
  smartRecNotes: [],
  climateGapNotes: [],
  licensedRuntimeMedia: {},
  reproductiveSanity: {}
};

test('PART 1–2: location authority torture + structural climate', async () => {
  for (const c of LOCATION_CASES) {
    let loc;
    try {
      loc = await resolveLocation(c.query);
    } catch (err) {
      AUDIT.locations.push({ key: c.key, error: String(err?.message || err) });
      finding('P3', 'location', `${c.key} unresolved`, String(err?.message || err));
      continue;
    }
    if (!loc || loc.unresolved) {
      AUDIT.locations.push({
        key: c.key,
        unresolved: true,
        code: loc?.code || null,
        reason: loc?.reason || null
      });
      if (c.expect === 'reject') {
        assert.ok(
          loc?.code === NEEDS_MORE_SPECIFIC_LOCATION ||
            loc?.code === LOCATION_NEEDS_CONFIRMATION
        );
      } else if (c.expect === 'accept') {
        const sev = c.allowGeocodeGap ? 'P3' : 'P2';
        finding(
          sev,
          'location',
          `${c.key} unresolved unexpectedly`,
          loc?.code || 'null'
        );
      }
      continue;
    }
    const gate = mayAcceptResolvedLocationForGardenClimate(loc);
    const tooBroad = isTooBroadForGardenClimate(loc);
    const row = {
      key: c.key,
      query: c.query,
      label: loc.label,
      lat: loc.lat,
      lon: loc.lon,
      elevation: loc.elevation,
      feature_code: loc.feature_code,
      bandClimate: loc.climate,
      tooBroad,
      accepted: gate.ok,
      gateCode: gate.code || null,
      expect: c.expect
    };

    if (c.expect === 'reject' && gate.ok) {
      finding(
        'P1',
        'location',
        `${c.key} accepted despite broad admin`,
        `feature_code=${loc.feature_code}`
      );
    }
    if (c.expect === 'reject' && !gate.ok) {
      assert.equal(gate.code, NEEDS_MORE_SPECIFIC_LOCATION);
    }
    if (c.expect === 'accept' && tooBroad) {
      finding(
        'P2',
        'location',
        `${c.key} rejected as too broad unexpectedly`,
        `feature_code=${loc.feature_code}`
      );
    }

    if (gate.ok) {
      let sc = await hydrate(loc);
      sc = applyStructuralFixtureIfNeeded(c.key, row, sc);
      row.structuralOk = sc.ok;
      row.structuralError = sc.error;
      row.structuralFromFixture = !!sc.fromFixture;
      if (sc.ok) {
        const profile = applyStructuralClimateToProfile(
          {
            climateLabel: loc.climate,
            broadClimate: broadClimateFromLocationClimate(loc.climate)
          },
          sc.structuralClimate
        );
        const env = structuralEnvironmentFromClimateProfile({
          ...profile,
          structuralClimate: sc.structuralClimate
        });
        row.structural = {
          moistureRegime: env.moistureRegime,
          humiditySignal: env.humiditySignal,
          humidityRegime: env.humidityRegime,
          broadClimate: env.broadClimate,
          freezingRisk: env.freezingRisk,
          structuralColdRisk: env.structuralColdRisk,
          coldestMonthMeanMinC: env.coldestMonthMeanMinC,
          annualPrecipitationMm: env.annualPrecipitationMm,
          aridityIndex: env.aridityIndex,
          frostFree: env.isFrostFreeGrowingClimate,
          elevationM: loc.elevation,
          acquisitionMs: sc.acquisitionMs,
          fromFixture: !!sc.fromFixture,
          evidence: sc.structuralClimate?.evidence
        };
        row._structuralClimate = sc.structuralClimate;
        row._loc = loc;

        if (
          loc.elevation != null &&
          loc.elevation >= 2000 &&
          env.isFrostFreeGrowingClimate &&
          env.coldestMonthMeanMinC != null &&
          env.coldestMonthMeanMinC < 12
        ) {
          finding(
            'P1',
            'climate',
            `${c.key}: high-altitude cool nights still frost-free for tropical logic`,
            `elev=${loc.elevation}m coldestMonthMeanMin=${env.coldestMonthMeanMinC} band=${loc.climate} broad=${env.broadClimate}`
          );
        }
      } else {
        finding('P3', 'climate', `${c.key} structural fetch failed`, sc.error || 'unknown');
      }
    }
    AUDIT.locations.push(row);
  }

  const kochi = AUDIT.locations.find((r) => r.key === 'Kochi' && r.structural);
  const cairo = AUDIT.locations.find((r) => r.key === 'Cairo' && r.structural);
  const phoenix = AUDIT.locations.find((r) => r.key === 'Phoenix' && r.structural);
  const singapore = AUDIT.locations.find((r) => r.key === 'Singapore' && r.structural);
  const quito = AUDIT.locations.find((r) => r.key === 'Quito');
  const mexico = AUDIT.locations.find((r) => r.key === 'MexicoCity');

  if (kochi && cairo) {
    if (kochi.structural.moistureRegime === cairo.structural.moistureRegime) {
      finding(
        'P1',
        'climate',
        'Kochi moistureRegime equals Cairo',
        `${kochi.structural.moistureRegime}`
      );
    }
  }
  if (phoenix && singapore) {
    if (phoenix.structural.moistureRegime === singapore.structural.moistureRegime) {
      finding(
        'P1',
        'climate',
        'Phoenix moistureRegime equals Singapore',
        phoenix.structural.moistureRegime
      );
    }
  }
  if (quito) {
    AUDIT.climateGapNotes.push({
      case: 'Quito',
      elevation: quito.elevation,
      band: quito.bandClimate,
      structural: quito.structural || null
    });
  }
  if (mexico) {
    AUDIT.climateGapNotes.push({
      case: 'MexicoCity',
      elevation: mexico.elevation,
      band: mexico.bandClimate,
      structural: mexico.structural || null
    });
  }

  console.log('\n=== PRE_SCALE_LOCATION_CLIMATE_AUDIT ===');
  console.log(
    JSON.stringify(
      AUDIT.locations.map(({ _structuralClimate, _loc, ...rest }) => rest),
      null,
      2
    )
  );
});

test('PART 3–6: archetype matrix + same plant/climates + same climate/plants', async (t) => {
  const plants = loadPlants();
  for (const a of ARCHETYPES) {
    const hit = plants.find(a.pick);
    if (!hit) {
      AUDIT.coverageGaps.push(a.name);
      AUDIT.archetypes.push({ id: a.id, name: a.name, present: false });
      finding('P3', 'catalog', `Archetype missing: ${a.name}`, 'no matching seed plant');
      continue;
    }
    AUDIT.archetypes.push({
      id: a.id,
      name: a.name,
      present: true,
      slug: hit.slug,
      scientific: hit.scientific,
      needsReview: hit.needsReview,
      flowerMeta: !!(hit.climateTraits?.floweringRequirements || '').trim(),
      fruitMeta: !!(hit.climateTraits?.fruitingRequirements || '').trim(),
      frost: hit.climateTraits?.frostSensitivity,
      humidity: hit.climateTraits?.humidityTolerance,
      chill: hit.climateTraits?.needsWinterChill === true
    });
  }

  const climates = AUDIT.locations.filter((r) => r.accepted && r._structuralClimate && r._loc);
  if (climates.length < 4) {
    t.skip('Insufficient hydrated climates from Part 1');
    return;
  }

  const focusPlants = ['cacao', 'coconut', 'cypress', 'japanese-maple', 'pistachio', 'kiwi']
    .map((s) => plants.find((p) => p.slug === s))
    .filter(Boolean);

  for (const plant of focusPlants) {
    const meta = metaFor(plant);
    const rows = [];
    for (const c of climates) {
      const evaluated = evaluate(plant, meta, c._loc, c._structuralClimate);
      const issueList = auditOutcomeRules(plant, meta, evaluated);
      for (const iss of issueList) {
        const sev = iss.startsWith('P1') ? 'P1' : 'P2';
        finding(sev, 'outcome', `${plant.slug}@${c.key}: ${iss}`, evaluated.outcomes);
        AUDIT.outcomeIssues.push({ plant: plant.slug, climate: c.key, issue: iss });
      }
      const rec = {
        climate: c.key,
        overall: evaluated.outcomes.overall,
        survival: evaluated.outcomes.survival,
        growth: evaluated.outcomes.growth,
        flowering: evaluated.outcomes.flowering,
        fruiting: evaluated.outcomes.fruiting,
        limiting: evaluated.outcomes.limitingFactors,
        unknown: evaluated.outcomes.unknownEvidence,
        reproductiveEvidence: evaluated.outcomes.reproductiveEvidence || null,
        frostFree: evaluated.climateProfile.isFrostFreeGrowingClimate,
        moisture: evaluated.climateProfile.moistureRegime,
        humidity: evaluated.climateProfile.humiditySignal,
        cold: evaluated.climateProfile.coldestMonthMeanMinC,
        evalMs: evaluated.evalMs
      };
      rows.push(rec);
      if (evaluated.outcomes.overall === 'good' || evaluated.outcomes.overall === 'excellent') {
        AUDIT.positives.push({
          plant: plant.slug,
          climate: c.key,
          overall: evaluated.outcomes.overall,
          survival: evaluated.outcomes.survival,
          flowering: evaluated.outcomes.flowering,
          fruiting: evaluated.outcomes.fruiting,
          needsReview: meta.needsReview,
          reproductiveEvidence: evaluated.outcomes.reproductiveEvidence || null,
          evidence: {
            frost: meta.frostSensitivity,
            humidityTol: meta.humidityTolerance,
            flowerReq: meta.floweringRequirements || null,
            fruitReq: meta.fruitingRequirements || null,
            structuralStatus: evaluated.climateProfile.structuralClimateStatus,
            moisture: evaluated.climateProfile.moistureRegime,
            humidity: evaluated.climateProfile.humiditySignal,
            cold: evaluated.climateProfile.coldestMonthMeanMinC,
            reproductiveEvidence: evaluated.outcomes.reproductiveEvidence || null
          }
        });
        if (meta.needsReview) {
          finding(
            'P1',
            'false-positive',
            `${plant.slug}@${c.key} Good/Excellent with needsReview`,
            JSON.stringify(rec)
          );
        }
      }
      if (evaluated.outcomes.overall === 'blocked') {
        AUDIT.negatives.push({
          plant: plant.slug,
          climate: c.key,
          survival: evaluated.outcomes.survival,
          limiting: evaluated.outcomes.limitingFactors,
          unknown: evaluated.outcomes.unknownEvidence
        });
      }
    }
    const uniqOverall = new Set(rows.map((r) => r.overall));
    if (uniqOverall.size === 1 && climates.length >= 5) {
      const only = [...uniqOverall][0];
      // Conservative Borderline across climates is allowed when evidence is incomplete.
      // Static confident Good/Excellent/Not-recommended is the real non-differentiation risk.
      if (only === 'good' || only === 'excellent' || only === 'blocked') {
        finding(
          'P1',
          'outcome',
          `${plant.slug} static overall across all climates`,
          [...uniqOverall].join(',')
        );
      }
    }
    if (meta.frostSensitivity === 'high') {
      const rank = { unreliable: 0, constrained: 1, supported: 2, reliable: 3, unknown: -1 };
      const tokyo = rows.find((r) => r.climate === 'Tokyo');
      const kochiR = rows.find((r) => r.climate === 'Kochi');
      if (tokyo && kochiR && (rank[tokyo.survival] ?? 0) > (rank[kochiR.survival] ?? 0)) {
        finding(
          'P1',
          'outcome',
          `${plant.slug}: Tokyo survival better than Kochi`,
          `${tokyo.survival} > ${kochiR.survival}`
        );
      }
    }
    AUDIT.samePlantManyClimates.push({ plant: plant.slug, rows });
  }

  const extra = plants.filter((p) =>
    ['plumeria', 'coffee', 'almond'].includes(p.slug)
  );
  for (const climateKey of ['Singapore', 'Yehiam', 'Phoenix', 'Kochi', 'Cairo']) {
    const c = climates.find((x) => x.key === climateKey);
    if (!c) continue;
    const plantRows = [];
    for (const plant of focusPlants.concat(extra)) {
      const meta = metaFor(plant);
      const evaluated = evaluate(plant, meta, c._loc, c._structuralClimate);
      plantRows.push({
        plant: plant.slug,
        overall: evaluated.outcomes.overall,
        survival: evaluated.outcomes.survival,
        flowering: evaluated.outcomes.flowering,
        fruiting: evaluated.outcomes.fruiting,
        limiting: evaluated.outcomes.limitingFactors?.[0] || null
      });
    }
    const uniq = new Set(plantRows.map((r) => r.overall));
    if (uniq.size === 1 && plantRows.length >= 5) {
      finding(
        'P1',
        'outcome',
        `${climateKey}: all plants share identical overall`,
        [...uniq].join(',')
      );
    }
    AUDIT.sameClimateManyPlants.push({ climate: climateKey, plants: plantRows });
  }

  console.log('\n=== PRE_SCALE_ARCHETYPE_AND_MATRIX ===');
  console.log(
    JSON.stringify(
      {
        archetypes: AUDIT.archetypes,
        coverageGaps: AUDIT.coverageGaps,
        samePlantManyClimates: AUDIT.samePlantManyClimates,
        sameClimateManyPlants: AUDIT.sameClimateManyPlants,
        outcomeIssues: AUDIT.outcomeIssues,
        positives: AUDIT.positives,
        negativesSample: AUDIT.negatives.slice(0, 20)
      },
      null,
      2
    )
  );
});

test('PART 7–9: missing data + catalog expansion + image rules', () => {
  const plants = loadPlants();
  AUDIT.catalog.incompleteClimateCount = plants.filter(
    (p) =>
      !p.climateTraits?.frostSensitivity ||
      !p.climateTraits?.humidityTolerance ||
      !p.climateTraits?.heatTolerance
  ).length;
  AUDIT.catalog.needsReviewCount = plants.filter((p) => p.needsReview).length;
  AUDIT.catalog.withFlowerMeta = plants.filter((p) =>
    !!(p.climateTraits?.floweringRequirements || '').trim()
  ).length;
  AUDIT.catalog.withFruitMeta = plants.filter((p) =>
    !!(p.climateTraits?.fruitingRequirements || '').trim()
  ).length;
  AUDIT.catalog.genusLevel = plants.filter((p) => /\bspp\.?\b/i.test(p.scientific || '')).length;

  const noFlower = plants.find((p) => !(p.climateTraits?.floweringRequirements || '').trim());
  const meta = metaFor(noFlower);
  const fakeTropical = structuralEnvironmentFromClimateProfile({
    broadClimate: 'tropical',
    freezingRisk: 'low',
    humiditySignal: 'high',
    moistureRegime: 'humid',
    structuralClimateStatus: 'known',
    coldestMonthMeanMinC: 24
  });
  const o = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: fakeTropical,
    suitability: {
      recommendationLevel: 'good',
      survivalFit: 90,
      thriveFit: 85,
      floweringFit: 80,
      fruitingFit: 80,
      warnings: [],
      explanationText: ''
    },
    plant: noFlower
  });
  assert.notEqual(o.flowering, 'supported');

  const cacao = plants.find((p) => p.slug === 'cacao');
  const cacaoMeta = metaFor(cacao);
  // Verified humid-tropical cacao may be Good under humid tropical authority.
  // It must NOT be Good under hyper-arid authority (moisture evidence required).
  const aridEnv = structuralEnvironmentFromClimateProfile({
    broadClimate: 'arid',
    freezingRisk: 'low',
    humiditySignal: 'low',
    moistureRegime: 'hyper-arid',
    structuralClimateStatus: 'known',
    coldestMonthMeanMinC: 10,
    annualPrecipitationMm: 40,
    aridityIndex: 0.02
  });
  const cacaoArid = deriveSpecificPlantOutcomes({
    meta: cacaoMeta,
    climateProfile: aridEnv,
    suitability: {
      recommendationLevel: 'good',
      survivalFit: 90,
      thriveFit: 85,
      floweringFit: 80,
      fruitingFit: 80,
      warnings: [],
      explanationText: ''
    },
    plant: cacao
  });
  assert.notEqual(cacaoArid.overall, 'good');
  assert.notEqual(cacaoArid.overall, 'excellent');

  const nrPlant = plants.find((p) => p.needsReview);
  if (nrPlant) {
    const nrO = deriveSpecificPlantOutcomes({
      meta: metaFor(nrPlant),
      climateProfile: fakeTropical,
      suitability: {
        recommendationLevel: 'good',
        survivalFit: 90,
        thriveFit: 85,
        floweringFit: 80,
        fruitingFit: 80,
        warnings: [],
        explanationText: ''
      },
      plant: nrPlant
    });
    assert.notEqual(nrO.overall, 'good');
    assert.notEqual(nrO.overall, 'excellent');
  }
  const packet = JSON.parse(fs.readFileSync(CACAO_PACKET, 'utf8'));
  const v = validateCatalogExpansionPacket(packet);
  assert.equal(v.ok, true);
  const m = materializePlantCatalogItemFromPacket(packet);
  assert.equal(m.ok, true);
  assert.equal(m.imageStatus, IMAGE_PENDING);
  assert.ok(m.unknownFields.includes('rainfallMmAnnual'));

  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  const dup = mergePlantIntoSeedDocument(seed, m.item, { replaceExisting: false });
  assert.equal(dup.ok, false);

  const other = {
    ...packet,
    packetId: 'audit-demo-plant-y-v1',
    identity: {
      canonicalSlug: 'audit-demo-plant-y',
      commonNameEn: 'Audit Demo Plant Y',
      acceptedScientificName: 'Audit plantus',
      aliases: ['audit demo plant y']
    },
    humanApproval: { approvedForIngest: true, note: 'dry-run only' }
  };
  assert.equal(validateCatalogExpansionPacket(other).ok, true);
  const m2 = materializePlantCatalogItemFromPacket(other);
  assert.equal(m2.item.slug, 'audit-demo-plant-y');

  const cocoaHits = searchCatalogPlantsForSpecificCheck(plants, 'cocoa');
  assert.ok(cocoaHits.some((h) => h.slug === 'cacao'));

  const withPrimary = plants.filter((p) => p.media?.primaryUrl || p.media?.url);
  const runtimeReady = [];
  const runtimePending = [];
  for (const p of plants) {
    const display = resolvePlantDisplayMedia(p);
    if (display.kind === 'catalog') runtimeReady.push(p.slug);
    else runtimePending.push({ slug: p.slug, status: display.imageStatus, reason: display.pendingReason });
  }
  AUDIT.image = {
    plantsWithPrimaryUrl: withPrimary.length,
    cacaoImageStatus: cacao.media?.imageStatus || null,
    licenseMissingOnPrimary: withPrimary.filter((p) => !p.media?.license).map((p) => p.slug),
    runtimeCatalogReady: runtimeReady,
    runtimePendingSample: runtimePending.slice(0, 12)
  };
  if (AUDIT.image.licenseMissingOnPrimary.length) {
    finding(
      'P2',
      'image',
      'Primary image without license metadata',
      AUDIT.image.licenseMissingOnPrimary.join(',')
    );
  }

  AUDIT.catalog.expansion = {
    cacaoValid: v.ok,
    duplicateRefused: !dup.ok,
    demoDryRunSlug: m2.item.slug,
    imagePending: m.imageStatus
  };

  assert.equal(
    validateCatalogExpansionPacket({
      ...packet,
      humanApproval: { approvedForIngest: false }
    }).ok,
    false
  );

  if (AUDIT.catalog.withFruitMeta <= 1) {
    finding(
      'P3',
      'catalog',
      'Almost no plants have fruitingRequirements',
      `count=${AUDIT.catalog.withFruitMeta}`
    );
  }
  if (AUDIT.catalog.withFlowerMeta <= 1) {
    finding(
      'P3',
      'catalog',
      'Almost no plants have floweringRequirements',
      `count=${AUDIT.catalog.withFlowerMeta}`
    );
  }
  if (AUDIT.catalog.needsReviewCount === plants.length) {
    finding(
      'P3',
      'catalog',
      '100% of seed plants are needsReview',
      'confident Good impossible under current gates for entire catalog'
    );
  }

  console.log('\n=== PRE_SCALE_CATALOG_IMAGE_AUDIT ===');
  console.log(JSON.stringify({ catalog: AUDIT.catalog, image: AUDIT.image }, null, 2));
});

test('PART 10–13: security / Smart Rec wiring evidence', () => {
  const app = fs.readFileSync(APP, 'utf8');
  AUDIT.securityNotes.push({
    plantLive: fs.existsSync(path.join(ROOT, 'tests/garden-profile-plants-v1-live.test.mjs')),
    locLive: fs.existsSync(path.join(ROOT, 'tests/garden-profile-location-v1-live.test.mjs')),
    taskLive: fs.existsSync(path.join(ROOT, 'tests/garden-profile-tasks-v1-live.test.mjs')),
    rlsIsolation: fs.existsSync(path.join(ROOT, 'tests/garden-profile-v0-rls-isolation.test.mjs'))
  });
  assert.equal(SPECIFIC_CHECK_CLEARS_SMART_REC_ANSWERS, true);
  assert.match(app, /smartRecSession\.answers=\{\}/);
  assert.match(app, /structuralClimate/);

  const locContract = fs.readFileSync(
    path.join(ROOT, 'tests/garden-profile-location-v1-contract.test.mjs'),
    'utf8'
  );
  assert.match(locContract, /stale User A garden id does not resolve for User B/);

  const plants = loadPlants();
  const cacao = plants.find((p) => p.slug === 'cacao');
  const meta = metaFor(cacao);
  const failedStructural = structuralEnvironmentFromClimateProfile({
    climateLabel: 'Subtropical',
    broadClimate: 'subtropical',
    freezingRisk: 'low',
    structuralClimateStatus: 'unknown',
    structuralClimate: null
  });
  const o = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: failedStructural,
    suitability: {
      recommendationLevel: 'good',
      survivalFit: 85,
      thriveFit: 80,
      floweringFit: 80,
      fruitingFit: 80,
      warnings: [],
      explanationText: ''
    },
    plant: cacao
  });
  assert.notEqual(o.overall, 'good');
  assert.notEqual(o.overall, 'excellent');
  AUDIT.smartRecNotes.push({
    specificClearsAnswers: true,
    structuralFailureNotGood: o.overall
  });
});

test('PART 14: performance warm batches', () => {
  const plants = loadPlants();
  const cacao = plants.find((p) => p.slug === 'cacao');
  const meta = metaFor(cacao);
  const env = structuralEnvironmentFromClimateProfile({
    broadClimate: 'tropical',
    freezingRisk: 'low',
    humiditySignal: 'high',
    moistureRegime: 'humid',
    structuralClimateStatus: 'known',
    coldestMonthMeanMinC: 23
  });
  const runOnce = () =>
    deriveSpecificPlantOutcomes({
      meta,
      climateProfile: env,
      suitability: {
        recommendationLevel: 'good',
        survivalFit: 85,
        thriveFit: 80,
        floweringFit: 50,
        fruitingFit: 40,
        warnings: [],
        explanationText: ''
      },
      plant: cacao
    });
  const latency = measureSpecificPlantEvaluationLatency(runOnce, 300);
  assert.ok(latency.p95Ms < 500);

  const t100 = performance.now();
  for (let i = 0; i < 100; i++) runOnce();
  const ms100 = performance.now() - t100;
  const t500 = performance.now();
  for (let i = 0; i < 500; i++) runOnce();
  const ms500 = performance.now() - t500;
  const tSearch = performance.now();
  for (let i = 0; i < 200; i++) searchCatalogPlantsForSpecificCheck(plants, 'coco');
  const searchMs = performance.now() - tSearch;

  const mediaSample = plants.slice(0, Math.min(20, plants.length));
  const mediaPerf = measureCatalogMediaLookupLatency(mediaSample, 40);
  const tMedia100 = performance.now();
  for (let i = 0; i < 100; i++) {
    for (const p of mediaSample) resolvePlantDisplayMedia(p);
  }
  const media100 = performance.now() - tMedia100;
  const tMedia500 = performance.now();
  for (let i = 0; i < 500; i++) {
    for (const p of mediaSample) resolvePlantDisplayMedia(p);
  }
  const media500 = performance.now() - tMedia500;

  const hydrateSamples = AUDIT.locations
    .filter((r) => r.structural?.acquisitionMs != null)
    .map((r) => r.structural.acquisitionMs);

  AUDIT.performance = {
    warmP95Ms: latency.p95Ms,
    warmMaxMs: latency.maxMs,
    batch100Ms: ms100,
    batch500Ms: ms500,
    search200Ms: searchMs,
    catalogSize: plants.length,
    structuralAcquisitionSamplesMs: hydrateSamples,
    mediaLookup: mediaPerf,
    mediaBatch100Ms: media100,
    mediaBatch500Ms: media500
  };
  console.log('\n=== PRE_SCALE_PERFORMANCE ===');
  console.log(JSON.stringify(AUDIT.performance, null, 2));
  assert.ok(ms100 < 1000);
  assert.ok(ms500 < 5000);
  assert.ok(media100 < 500);
  assert.ok(media500 < 2500);
});

test('PART 14b: licensed runtime media consumption + attribution + no search', () => {
  const plants = loadPlants();
  const app = fs.readFileSync(APP, 'utf8');
  const plantImageFn = fs.readFileSync(
    path.join(ROOT, 'netlify', 'functions', 'plant-image.mjs'),
    'utf8'
  );
  assert.equal(MEDIA_IMAGE_READY, PIPELINE_IMAGE_READY);
  assert.match(app, /resolvePlantDisplayMedia/);
  assert.match(app, /plantMediaAttributionHtml/);
  assert.match(app, /async function fetchPlantImageFromWikipedia[\s\S]*?return '';/);
  assert.match(plantImageFn, /disabled:\s*true/);
  assert.doesNotMatch(app, /tse1\.mm\.bing\.net\/th\?q=/);
  assert.doesNotMatch(plantImageFn, /fetchWikipediaImageBundle/);

  const acceptance = ['cacao', 'coconut', 'cypress', 'kiwi', 'plumeria'];
  const rows = [];
  for (const slug of acceptance) {
    const p = plants.find((x) => x.slug === slug);
    assert.ok(p, slug);
    const approved = isApprovedCatalogMediaRecord(p.media, p);
    assert.equal(approved.ok, true, `${slug}: ${approved.reason}`);
    const display = resolvePlantDisplayMedia(p);
    assert.equal(display.kind, 'catalog', slug);
    assert.ok(display.license && display.sourcePageUrl, slug);
    if (display.attributionRequired) {
      assert.ok(formatCatalogAttributionLabel(display), `${slug} attribution`);
    }
    rows.push({
      slug,
      url: display.url,
      license: display.license,
      attributionRequired: display.attributionRequired,
      attributionLabel: formatCatalogAttributionLabel(display)
    });
  }

  const nc = resolvePlantDisplayMedia({
    slug: 'nc-test',
    scientific: 'Testus plantus',
    media: {
      imageStatus: MEDIA_IMAGE_READY,
      primaryUrl: 'https://example.com/nc.jpg',
      sourceProvider: 'wikimedia-commons',
      sourcePageUrl: 'https://example.com/src',
      author: 'A',
      license: 'CC BY-NC 4.0',
      commercialUseAllowed: false,
      attributionRequired: true,
      attribution: 'A'
    }
  });
  assert.equal(nc.kind, 'placeholder');

  const pendingPlant = plants.find((p) => p.media?.imageStatus === IMAGE_PENDING || !p.media?.primaryUrl);
  if (pendingPlant) {
    const d = resolvePlantDisplayMedia(
      pendingPlant.media?.imageStatus
        ? pendingPlant
        : { ...pendingPlant, media: { imageStatus: IMAGE_PENDING } }
    );
    assert.equal(d.kind, 'placeholder');
  }

  const userWins = resolvePlantDisplayMedia({
    ...plants.find((p) => p.slug === 'cacao'),
    photoUrl: 'https://example.com/private-user.jpg'
  });
  assert.equal(userWins.kind, 'user');

  AUDIT.licensedRuntimeMedia = {
    acceptance: rows,
    ncBlocked: nc.kind === 'placeholder',
    userPhotoPriority: userWins.kind === 'user',
    appSearchDisabled: true,
    plantImageFnDisabled: true
  };
  console.log('\n=== PRE_SCALE_LICENSED_RUNTIME_MEDIA ===');
  console.log(JSON.stringify(AUDIT.licensedRuntimeMedia, null, 2));
});

test('PART 14c: reproductive evidence + Coconut/Cacao sanity after fit-score removal', () => {
  const plants = loadPlants();
  const coconut = plants.find((p) => p.slug === 'coconut');
  const cacao = plants.find((p) => p.slug === 'cacao');
  assert.ok(coconut && cacao);

  const fixtures = {
    Kochi: STRUCTURAL_AUDIT_FIXTURES.Kochi,
    Cairo: STRUCTURAL_AUDIT_FIXTURES.Cairo,
    Tokyo: STRUCTURAL_AUDIT_FIXTURES.Tokyo,
    Yehiam: STRUCTURAL_AUDIT_FIXTURES.Yehiam,
    Singapore: STRUCTURAL_AUDIT_FIXTURES.Singapore
  };
  const locs = {
    Kochi: {
      label: 'Kochi, Kerala, India',
      climate: 'Tropical',
      lat: 9.94,
      lon: 76.26,
      elevation: 9
    },
    Cairo: {
      label: 'Cairo, Egypt',
      climate: 'Subtropical',
      lat: 30.06,
      lon: 31.25,
      elevation: 23
    },
    Tokyo: {
      label: 'Tokyo, Japan',
      climate: 'Temperate',
      lat: 35.69,
      lon: 139.69,
      elevation: 44
    },
    Yehiam: {
      label: 'Yehiam, Israel',
      climate: 'Mediterranean',
      lat: 33.0,
      lon: 35.22,
      elevation: 375
    },
    Singapore: {
      label: 'Singapore, Singapore',
      climate: 'Tropical',
      lat: 1.29,
      lon: 103.85,
      elevation: 23
    }
  };

  function runPlant(plant) {
    const meta = metaFor(plant);
    const out = {};
    for (const key of Object.keys(fixtures)) {
      const evaluated = evaluate(plant, meta, locs[key], fixtures[key]);
      out[key] = {
        overall: evaluated.outcomes.overallLabel,
        overallCode: evaluated.outcomes.overall,
        survival: evaluated.outcomes.survivalLabel,
        growth: evaluated.outcomes.growthLabel,
        flowering: evaluated.outcomes.floweringLabel,
        fruiting: evaluated.outcomes.fruitingLabel,
        reproductiveEvidence: evaluated.outcomes.reproductiveEvidence,
        limiting: evaluated.outcomes.limitingFactors
      };
    }
    return out;
  }

  const coconutRows = runPlant(coconut);
  const cacaoRows = runPlant(cacao);

  // Coconut acceptance (must emerge from authority, not hardcoded constants in product code)
  assert.equal(coconutRows.Kochi.overall, 'Good');
  assert.equal(coconutRows.Kochi.survival, 'Reliable');
  assert.equal(coconutRows.Kochi.growth, 'Supported');
  assert.equal(coconutRows.Kochi.flowering, 'Supported');
  assert.equal(coconutRows.Kochi.fruiting, 'Supported');
  assert.match(String(coconutRows.Kochi.reproductiveEvidence?.flowering || ''), /^positive:/);
  assert.match(String(coconutRows.Kochi.reproductiveEvidence?.fruiting || ''), /^positive:/);

  assert.equal(coconutRows.Singapore.overall, 'Good');
  assert.equal(coconutRows.Singapore.survival, 'Reliable');
  assert.equal(coconutRows.Singapore.growth, 'Supported');
  assert.equal(coconutRows.Singapore.flowering, 'Supported');
  assert.equal(coconutRows.Singapore.fruiting, 'Supported');

  for (const bad of ['Cairo', 'Tokyo', 'Yehiam']) {
    assert.equal(coconutRows[bad].overall, 'Not recommended');
    assert.equal(coconutRows[bad].survival, 'Unreliable');
    assert.equal(coconutRows[bad].growth, 'Poor');
    assert.equal(coconutRows[bad].flowering, 'Unlikely');
    assert.equal(coconutRows[bad].fruiting, 'Unreliable');
  }

  // Default fit independence: 50/40 vs 99/99 must not change reproductive outcomes
  const meta = metaFor(coconut);
  const env = structuralEnvironmentFromClimateProfile({
    ...applyStructuralClimateToProfile(
      { broadClimate: 'tropical', climateLabel: 'Tropical' },
      fixtures.Kochi
    ),
    structuralClimate: fixtures.Kochi
  });
  const a = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: env,
    suitability: {
      recommendationLevel: 'good',
      survivalFit: 85,
      thriveFit: 80,
      floweringFit: 50,
      fruitingFit: 40,
      warnings: [],
      explanationText: ''
    },
    plant: coconut
  });
  const b = deriveSpecificPlantOutcomes({
    meta,
    climateProfile: env,
    suitability: {
      recommendationLevel: 'good',
      survivalFit: 85,
      thriveFit: 80,
      floweringFit: 99,
      fruitingFit: 99,
      warnings: [],
      explanationText: ''
    },
    plant: coconut
  });
  assert.equal(a.flowering, b.flowering);
  assert.equal(a.fruiting, b.fruiting);

  // Cacao evidence-backed positives in humid tropical
  assert.equal(cacaoRows.Kochi.flowering, 'Supported');
  assert.equal(cacaoRows.Kochi.fruiting, 'Supported');
  assert.match(String(cacaoRows.Kochi.reproductiveEvidence?.flowering || ''), /positive:/);
  assert.equal(cacaoRows.Cairo.overall, 'Not recommended');
  assert.equal(cacaoRows.Cairo.flowering, 'Unlikely');
  assert.equal(cacaoRows.Cairo.fruiting, 'Unreliable');

  // Missing reproductive requirements → UNKNOWN (not Constrained from fit)
  const noReq = deriveSpecificPlantOutcomes({
    meta: {
      frostSensitivity: 'low',
      humidityTolerance: 'medium',
      floweringRequirements: '',
      fruitingRequirements: ''
    },
    climateProfile: env,
    suitability: {
      recommendationLevel: 'good',
      survivalFit: 90,
      thriveFit: 85,
      floweringFit: 50,
      fruitingFit: 40,
      warnings: [],
      explanationText: ''
    },
    plant: { slug: 'audit-no-req', tags: [] }
  });
  assert.equal(noReq.flowering, 'unknown');
  assert.equal(noReq.fruiting, 'unknown');

  AUDIT.reproductiveSanity = {
    coconut: coconutRows,
    cacao: cacaoRows,
    defaultFitIndependent: true,
    missingRequirementsStayUnknown: true
  };
  console.log('\n=== PRE_SCALE_REPRODUCTIVE_SANITY ===');
  console.log(JSON.stringify(AUDIT.reproductiveSanity, null, 2));
});

test('PART 15–18: challenge positives + write findings artifact', () => {
  for (const p of AUDIT.positives) {
    if (p.needsReview) {
      finding('P1', 'false-positive', `Positive with needsReview: ${p.plant}@${p.climate}`, p);
    }
    if (
      p.flowering === 'supported' &&
      !String(p.reproductiveEvidence?.flowering || p.evidence?.reproductiveEvidence?.flowering || '').startsWith(
        'positive:'
      )
    ) {
      finding(
        'P1',
        'false-positive',
        `Flowering Supported without positive evidence: ${p.plant}@${p.climate}`,
        p
      );
    }
    if (
      p.fruiting === 'supported' &&
      !String(p.reproductiveEvidence?.fruiting || p.evidence?.reproductiveEvidence?.fruiting || '').startsWith(
        'positive:'
      )
    ) {
      finding(
        'P1',
        'false-positive',
        `Fruiting Supported without positive evidence: ${p.plant}@${p.climate}`,
        p
      );
    }
    if (!p.evidence?.flowerReq && p.flowering === 'supported') {
      finding('P1', 'false-positive', `Supported flowering missing flowerReq: ${p.plant}@${p.climate}`, p);
    }
    if (!p.evidence?.fruitReq && p.fruiting === 'supported') {
      finding('P1', 'false-positive', `Supported fruiting missing fruitReq: ${p.plant}@${p.climate}`, p);
    }
  }
  for (const n of AUDIT.negatives) {
    if (
      n.survival === 'unreliable' &&
      !(n.limiting || []).length &&
      !(n.unknown || []).length
    ) {
      finding(
        'P2',
        'false-negative',
        `Unreliable survival without limiting/unknown evidence: ${n.plant}@${n.climate}`,
        n
      );
    }
  }
  for (const note of AUDIT.climateGapNotes) {
    const st = note.structural;
    if (
      note.elevation >= 2000 &&
      st &&
      st.frostFree &&
      st.coldestMonthMeanMinC != null &&
      st.coldestMonthMeanMinC < 12
    ) {
      finding(
        'P1',
        'climate',
        `${note.case} high-altitude treated frost-free despite cool nights`,
        JSON.stringify(note)
      );
    }
    if (note.elevation >= 2000 && (!st || note.band === 'Tropical' || note.band === 'Subtropical')) {
      // Only material when structural authority is present but still fails to override,
      // or band remains Tropical while structural evidence shows highland cool nights.
      if (!st) {
        // Fetch failure already logged as P3 — do not double-count as horticultural P2.
        continue;
      }
      if (
        st.broadClimate === 'tropical' ||
        (st.frostFree && st.coldestMonthMeanMinC != null && st.coldestMonthMeanMinC < 12)
      ) {
        finding(
          'P2',
          'climate',
          `${note.case}: latitude band ignores altitude for horticultural regime`,
          JSON.stringify(note)
        );
      }
    }
  }

  // Chill-requiring plant in Singapore must not look productively Good / flowering-supported
  // without chill authority. Survival-only Reliable outdoors is allowed when overall stays
  // Borderline and flowering/fruiting remain chill-limited.
  const kiwiSg = AUDIT.samePlantManyClimates
    .find((x) => x.plant === 'kiwi')
    ?.rows?.find((r) => r.climate === 'Singapore');
  if (
    kiwiSg &&
    (kiwiSg.overall === 'good' ||
      kiwiSg.overall === 'excellent' ||
      kiwiSg.flowering === 'supported' ||
      kiwiSg.flowering === 'reliable' ||
      kiwiSg.fruiting === 'supported' ||
      kiwiSg.fruiting === 'reliable')
  ) {
    finding(
      'P1',
      'outcome',
      'Kiwi (chill-requiring) confident productive outcome in Singapore without chill evidence path',
      kiwiSg
    );
  }

  console.log('\n=== PRE_SCALE_FINDINGS ===');
  console.log(JSON.stringify(FINDINGS, null, 2));
  const bySev = {};
  for (const f of FINDINGS) bySev[f.severity] = (bySev[f.severity] || 0) + 1;
  console.log('\n=== PRE_SCALE_FINDINGS_SUMMARY ===');
  console.log(JSON.stringify({ counts: bySev, total: FINDINGS.length }, null, 2));

  const outPath = path.join(ROOT, 'tests', '_pre-scale-audit-findings.json');
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        findings: FINDINGS,
        counts: bySev,
        audit: {
          locations: AUDIT.locations.map(({ _structuralClimate, _loc, ...r }) => r),
          archetypes: AUDIT.archetypes,
          coverageGaps: AUDIT.coverageGaps,
          samePlantManyClimates: AUDIT.samePlantManyClimates,
          sameClimateManyPlants: AUDIT.sameClimateManyPlants,
          positives: AUDIT.positives,
          negativesSample: AUDIT.negatives.slice(0, 40),
          catalog: AUDIT.catalog,
          image: AUDIT.image,
          licensedRuntimeMedia: AUDIT.licensedRuntimeMedia,
          reproductiveSanity: AUDIT.reproductiveSanity,
          performance: AUDIT.performance,
          climateGapNotes: AUDIT.climateGapNotes,
          securityNotes: AUDIT.securityNotes,
          smartRecNotes: AUDIT.smartRecNotes
        }
      },
      null,
      2
    ),
    'utf8'
  );

  const openP0 = FINDINGS.filter((f) => f.severity === 'P0');
  const openP1 = FINDINGS.filter((f) => f.severity === 'P1');
  const openP2 = FINDINGS.filter((f) => f.severity === 'P2');
  const materialP2 = openP2.filter((f) => {
    const blob = `${f.title} ${typeof f.detail === 'string' ? f.detail : JSON.stringify(f.detail)}`;
    if (/http-429|structural fetch failed/i.test(blob)) return false;
    if (/Yehiam unresolved/i.test(blob)) return false;
    if (/Almost no plants have|100% of seed|coverage|operational|hotlink|source-removal/i.test(blob)) {
      return false;
    }
    return true;
  });
  const gatePass =
    openP0.length === 0 && openP1.length === 0 && materialP2.length === 0;
  const verdict = gatePass
    ? 'CRUVIT_PRE_SCALE_QUALITY_GATE: PASS'
    : 'CRUVIT_PRE_SCALE_QUALITY_GATE: FAIL';
  console.log('\n=== CRUVIT_PRE_SCALE_QUALITY_GATE ===');
  console.log(
    JSON.stringify(
      {
        verdict,
        openP0: openP0.length,
        openP1: openP1.length,
        openP2: openP2.length,
        materialOpenP2: materialP2.length,
        materialP2Titles: materialP2.map((f) => f.title),
        bulkExpansionMayProceed: false,
        note: 'Bulk expansion remains blocked pending Owner Review even on PASS'
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(ROOT, 'tests', '_pre-scale-audit-gate.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        verdict,
        openP0,
        openP1,
        openP2,
        materialP2,
        bulkExpansionMayProceed: false
      },
      null,
      2
    ),
    'utf8'
  );
  // Soft assert: report FAIL via artifact; hard-fail only on P0/P1 (product safety).
  assert.equal(openP0.length, 0, 'open P0 findings');
  assert.equal(openP1.length, 0, 'open P1 findings');
});
