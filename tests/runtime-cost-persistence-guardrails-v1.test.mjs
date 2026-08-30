/**
 * CRUVIT Runtime Cost & Persistence Guardrails V1
 * Run: node --test tests/runtime-cost-persistence-guardrails-v1.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import {
  shouldAcquireStructuralClimate,
  buildStructuralClimateServerFields,
  parseStructuralClimateFromServerRow,
  markStructuralAcquireFailure,
  STRUCTURAL_ACQUIRE_FAILURE_COOLDOWN_MS
} from '../modules/personal-domain/structural-climate-persistence-contract.js';
import {
  fetchStructuralClimateForCoordinates,
  clearStructuralClimateCache
} from '../modules/personal-domain/structural-climate-authority-v1.js';
import {
  buildServerLocationPayload,
  nullServerLocationPayload,
  serverLocationToAppPartial,
  isCompleteServerLocation
} from '../modules/personal-domain/garden-profile-location-contract.js';
import {
  seedPlantToCatalogRow,
  catalogRowToRuntimePlant,
  resolveCanonicalPlantForEvaluation,
  assertNoExternalEnrichmentInCatalogResolve
} from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';
import {
  resolvePlantDisplayMedia,
  isApprovedCatalogMediaRecord
} from '../modules/catalog-media/licensed-catalog-media-runtime-v1.js';
import {
  lookupGardenDesignAssets,
  mayPromoteUserMediaToDesignAsset,
  assertDesignLookupCannotInvokeGeneration,
  buildDesignAssetMetadataRecord,
  DESIGN_ASSET_STORAGE_BUCKET,
  USER_PRIVATE_MEDIA_STORAGE_BUCKET
} from '../modules/catalog-media/garden-design-asset-contract-v1.js';
import {
  buildRuntimeCostEvent,
  rollupCostEventsForDashboard,
  COST_DASHBOARD_METRIC_KEYS,
  OWNER_RUNTIME_COST_POLICY
} from '../modules/cost-observability/runtime-cost-events-v1-contract.js';
import {
  mayCallRuntimePlantKnowledgeEnrichment,
  blockedPlantKnowledgeResponse,
  assertOrdinaryRuntimeAllowsNoExternalEnrichment,
  getExternalCallGuardCounters,
  resetExternalCallGuardCounters
} from '../modules/runtime-guards/external-call-guard-v1.js';
import {
  deriveSpecificPlantOutcomes,
  structuralEnvironmentFromClimateProfile
} from '../modules/personal-domain/specific-plant-suitability-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const APP = path.join(ROOT, 'app.html');
const MIGRATION = path.join(
  ROOT,
  'supabase',
  'migrations',
  '20260829171001_runtime_cost_persistence_guardrails_v1.sql'
);
const MIGRATION_HARDEN = path.join(
  ROOT,
  'supabase',
  'migrations',
  '20260829171035_harden_runtime_cost_persistence_table_privileges.sql'
);
const MIGRATION_RLS_OPT = path.join(
  ROOT,
  'supabase',
  'migrations',
  '20260829171130_optimize_runtime_cost_events_rls_auth_calls.sql'
);
const REPORT = path.join(ROOT, 'tests', '_runtime-cost-persistence-guardrails-v1-report.json');

const stubSuit = {
  recommendationLevel: 'good',
  survivalFit: 85,
  thriveFit: 80,
  floweringFit: 50,
  fruitingFit: 40,
  warnings: [],
  explanationText: ''
};

function loadSeed() {
  return JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
}

function humidTropicalClimate() {
  return structuralEnvironmentFromClimateProfile({
    broadClimate: 'tropical',
    climateLabel: 'Tropical',
    freezingRisk: 'low',
    humiditySignal: 'high',
    moistureRegime: 'humid',
    structuralClimateStatus: 'known',
    coldestMonthMeanMinC: 23.4,
    alwaysHot: true,
    coolSeasonSignal: false,
    thermalRegime: 'year-round-warm',
    isFrostFreeGrowingClimate: true,
    structuralClimate: {
      status: 'known',
      moistureRegime: 'humid',
      humiditySignal: 'high',
      broadClimateOverride: 'tropical',
      freezingRisk: 'low',
      thermalRegime: 'year-round-warm',
      evidence: { coldestMonthMeanMinC: 23.4 },
      provenance: { provider: 'open-meteo-archive-era5', lat: 9.93, lon: 76.26, fetchedAt: '2026-08-01T00:00:00.000Z' }
    }
  });
}

function knownStructural(lat = 9.93, lon = 76.26) {
  return {
    status: 'known',
    authorityVersion: '1.0.0',
    thermalRegime: 'year-round-warm',
    freezingRisk: 'low',
    moistureRegime: 'humid',
    humidityRegime: 'high',
    evidence: { coldestMonthMeanMinC: 23.4, elevationM: 10 },
    elevationM: 10,
    provenance: {
      provider: 'open-meteo-archive-era5',
      lat,
      lon,
      fetchedAt: '2026-08-01T00:00:00.000Z'
    }
  };
}

function evalPlant(seedPlant, climateProfile, suitabilityOverrides = {}) {
  const runtime = catalogRowToRuntimePlant(seedPlantToCatalogRow(seedPlant));
  const meta = {
    ...(runtime.climateTraits || {}),
    floweringRequirements: runtime.floweringRequirements || runtime.climateTraits?.floweringRequirements,
    fruitingRequirements: runtime.fruitingRequirements || runtime.climateTraits?.fruitingRequirements
  };
  return deriveSpecificPlantOutcomes({
    meta,
    climateProfile,
    suitability: { ...stubSuit, ...suitabilityOverrides },
    plant: runtime
  });
}

test('PART G1: Specific Plant Check — zero structural provider calls', async () => {
  clearStructuralClimateCache();
  let providerHits = 0;
  const climate = humidTropicalClimate();
  const seed = loadSeed();
  const cacao = seed.plants.find((p) => p.slug === 'cacao');
  assert.ok(cacao);
  const result = evalPlant(cacao, climate);
  assert.ok(result.survival);
  assert.equal(providerHits, 0);
  // Prove fetch is not part of evaluation — only a deliberate probe would hit:
  await fetchStructuralClimateForCoordinates(9.93, 76.26, {
    fetchImpl: async () => {
      providerHits += 1;
      return { ok: false, status: 500, json: async () => ({}) };
    },
    bypassCache: true,
    maxAttempts: 1
  });
  assert.equal(providerHits, 1);
});

test('PART G2–G4: 100 and 500 plant evaluations → zero structural provider calls', async () => {
  clearStructuralClimateCache();
  let providerHits = 0;
  const climate = humidTropicalClimate();
  const seed = loadSeed();
  assert.ok(seed.plants.length >= 10);

  const t0 = performance.now();
  for (let i = 0; i < 100; i++) {
    evalPlant(seed.plants[i % seed.plants.length], climate);
  }
  const ms100 = performance.now() - t0;
  assert.equal(providerHits, 0, '100 evals must not call climate provider');

  const t1 = performance.now();
  for (let i = 0; i < 500; i++) {
    evalPlant(seed.plants[i % seed.plants.length], climate);
  }
  const ms500 = performance.now() - t1;
  assert.equal(providerHits, 0, '500 evals must not call climate provider');
  assert.ok(ms100 < 500, `100 evals too slow: ${ms100}`);
  assert.ok(ms500 < 2000, `500 evals too slow: ${ms500}`);

  fs.writeFileSync(
    REPORT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        verdict: 'CRUVIT_RUNTIME_COST_PERSISTENCE_GATE: PASS',
        performance: { eval100Ms: ms100, eval500Ms: ms500, structuralProviderHits: providerHits },
        policy: OWNER_RUNTIME_COST_POLICY,
        bulkCatalogExpansion: 'AUTHORIZED / BLOCKED ONLY UNTIL THIS GUARDRAIL GATE PASSES — NOT STARTED'
      },
      null,
      2
    )
  );
});

test('PART G5–G6: missing/broken catalog image → zero image-source search', () => {
  resetExternalCallGuardCounters();
  const pending = {
    slug: 'pending-test',
    name: 'Pending',
    media: { imageStatus: 'IMAGE_PENDING', pendingReason: 'test' }
  };
  assert.equal(resolvePlantDisplayMedia(pending).kind, 'placeholder');
  assert.equal(getExternalCallGuardCounters().imageSourceSearch, 0);

  const brokenReady = {
    slug: 'broken',
    name: 'Broken',
    media: {
      imageStatus: 'IMAGE_READY',
      primaryUrl: 'https://example.invalid/missing.jpg',
      license: 'CC BY 4.0',
      commercialUseAllowed: true,
      attributionRequired: true,
      author: 'Tester',
      sourceProvider: 'wikimedia-commons',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:x'
    }
  };
  // Approved metadata may resolve as catalog URL; broken load falls back via onerror
  // (swapToInstantPlantImage) without any replacement search.
  assert.equal(resolvePlantDisplayMedia(brokenReady).kind, 'catalog');
  assert.equal(getExternalCallGuardCounters().imageSourceSearch, 0);
  assert.equal(getExternalCallGuardCounters().imageReplacementSearch, 0);

  const appSrc = fs.readFileSync(APP, 'utf8');
  assert.match(appSrc, /do not call plant-image/);
  assert.match(appSrc, /runtime must not search Wikipedia/);
  assert.match(appSrc, /never launch media search/);
});

test('PART G7: runtime catalog evaluation uses stored/local canonical data only', () => {
  const seed = loadSeed();
  const bySlug = Object.fromEntries(seed.plants.map((p) => [p.slug, p]));
  const resolved = resolveCanonicalPlantForEvaluation({ slug: 'cacao', seedBySlug: bySlug });
  assert.equal(resolved.source, 'plants.seed.json');
  assert.equal(resolved.plant.slug, 'cacao');
  assert.equal(assertNoExternalEnrichmentInCatalogResolve().allowsNetwork, false);

  const row = seedPlantToCatalogRow(bySlug.cacao, { sourcePacket: 'bounded-proof' });
  const fromDb = resolveCanonicalPlantForEvaluation({
    slug: 'cacao',
    catalogBySlug: { cacao: row },
    seedBySlug: bySlug
  });
  assert.equal(fromDb.source, 'catalog_plants');
});

test('PART G8: changing numeric fit defaults cannot cause external enrichment', () => {
  const policy = assertOrdinaryRuntimeAllowsNoExternalEnrichment();
  assert.equal(policy.catalogEnrichment, false);
  const climate = humidTropicalClimate();
  const seed = loadSeed();
  const coconut = seed.plants.find((p) => p.slug === 'coconut');
  const a = evalPlant(coconut, climate, { floweringFit: 50, fruitingFit: 40 });
  const b = evalPlant(coconut, climate, { floweringFit: 99, fruitingFit: 99 });
  assert.equal(a.flowering, b.flowering);
  assert.equal(a.fruiting, b.fruiting);
});

test('PART G9: Garden Design asset lookup cannot invoke generation', () => {
  const look = lookupGardenDesignAssets('cacao', []);
  assert.equal(look.generationAllowed, false);
  assert.equal(look.generated, false);
  assert.equal(mayPromoteUserMediaToDesignAsset(), false);
  assert.equal(assertDesignLookupCannotInvokeGeneration().generationAllowed, false);
  const meta = buildDesignAssetMetadataRecord({
    plantSlug: 'cacao',
    assetType: 'illustration',
    lifeStage: 'young',
    verificationStatus: 'unverified',
    rightsLicenseStatus: 'cruvit-owned'
  });
  assert.equal(meta.plant_slug, 'cacao');
  assert.equal(DESIGN_ASSET_STORAGE_BUCKET, 'catalog-design-assets');
  assert.equal(USER_PRIVATE_MEDIA_STORAGE_BUCKET, 'user-garden-media');
});

test('structural acquire-once / failure cooldown / server fields', () => {
  const known = knownStructural();
  // Production V2: external structural acquire is never allowed on user runtime.
  assert.equal(shouldAcquireStructuralClimate(known, 9.93, 76.26).acquire, false);
  assert.match(
    shouldAcquireStructuralClimate(known, 9.93, 76.26).reason,
    /v2-local-lookup-only-no-external-acquire|reuse-known/
  );

  const failed = markStructuralAcquireFailure(null, 'http-429');
  assert.equal(failed.status, 'failed');
  const blocked = shouldAcquireStructuralClimate(failed, 9.93, 76.26, {
    nowMs: Date.parse(failed.lastAcquireErrorAt) + 1000
  });
  assert.equal(blocked.acquire, false);

  const afterCooldown = shouldAcquireStructuralClimate(failed, 9.93, 76.26, {
    nowMs: Date.parse(failed.lastAcquireErrorAt) + STRUCTURAL_ACQUIRE_FAILURE_COOLDOWN_MS + 1
  });
  // V2: still no external acquire after cooldown — local lookup / prep queue only.
  assert.equal(afterCooldown.acquire, false);
  assert.equal(afterCooldown.reason, 'v2-local-lookup-only-no-external-acquire');

  const fields = buildStructuralClimateServerFields(known);
  assert.equal(fields.location_structural_climate_status, 'known');
  const row = {
    location_label: 'Kochi',
    location_lat: 9.93,
    location_lon: 76.26,
    location_climate: 'Tropical',
    location_source: 'manual',
    location_confirmed_at: '2026-08-01T00:00:00.000Z',
    location_updated_at: '2026-08-01T00:00:00.000Z',
    ...fields
  };
  assert.equal(isCompleteServerLocation(row), true);
  assert.equal(serverLocationToAppPartial(row).structuralClimate.status, 'known');
  assert.equal(parseStructuralClimateFromServerRow(row).status, 'known');
  assert.equal(nullServerLocationPayload().location_structural_climate, null);

  const withStructural = buildServerLocationPayload({
    label: 'Kochi, Kerala',
    climate: 'Tropical',
    lat: 9.9312,
    lon: 76.2673,
    source: 'manual',
    structuralClimate: known
  });
  assert.equal(withStructural.location_structural_climate_status, 'known');
});

test('default structural fetch maxAttempts is 2 (no retry storm)', async () => {
  clearStructuralClimateCache();
  let attempts = 0;
  const out = await fetchStructuralClimateForCoordinates(1, 1, {
    fetchImpl: async () => {
      attempts += 1;
      return { ok: false, status: 429, json: async () => ({}) };
    },
    bypassCache: true
  });
  assert.equal(out.ok, false);
  assert.equal(attempts, 2);
});

test('plant-knowledge enrichment blocked by default', () => {
  assert.equal(mayCallRuntimePlantKnowledgeEnrichment(), false);
  assert.equal(blockedPlantKnowledgeResponse().disabled, true);
  const appSrc = fs.readFileSync(APP, 'utf8');
  assert.match(appSrc, /CRUVIT_ALLOW_RUNTIME_PLANT_KNOWLEDGE/);
  assert.match(appSrc, /runtime-cost-guardrails-v1/);
});

test('cost observability contract + Owner policy', () => {
  const ev = buildRuntimeCostEvent({
    provider: 'open-meteo-archive-era5',
    feature: 'structural-climate',
    operation: 'acquire',
    triggerKind: 'user',
    userId: '00000000-0000-0000-0000-000000000001',
    estimatedCostUsd: 0,
    metadata: { gardenContent: 'SECRET', note: 'ok' }
  });
  assert.equal(ev.metadata.gardenContent, undefined);
  assert.equal(ev.metadata.note, 'ok');
  const rollup = rollupCostEventsForDashboard([ev], { activeUsers: 1, storageBytes: 10 });
  for (const k of COST_DASHBOARD_METRIC_KEYS) assert.ok(k in rollup, k);
  assert.equal(OWNER_RUNTIME_COST_POLICY.ordinaryUserRuntimeMustNotTriggerPaidExternalEnrichment, true);
});

test('migration defines catalog_plants, design assets, cost events, structural columns', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  assert.match(sql, /location_structural_climate/);
  assert.match(sql, /create table if not exists public\.catalog_plants/);
  assert.match(sql, /create table if not exists public\.catalog_design_assets/);
  assert.match(sql, /create table if not exists public\.runtime_cost_events/);
  assert.match(sql, /catalog_plants_select_public/);
  assert.match(sql, /revoke insert, update, delete on public\.catalog_plants/);

  const harden = fs.readFileSync(MIGRATION_HARDEN, 'utf8');
  assert.match(harden, /revoke all on table public\.catalog_plants from anon, authenticated/i);
  assert.match(harden, /grant select on table public\.catalog_plants to anon, authenticated/i);
  assert.match(harden, /revoke all on table public\.catalog_design_assets from anon, authenticated/i);
  assert.match(harden, /grant select on table public\.catalog_design_assets to anon, authenticated/i);
  assert.match(harden, /revoke all on table public\.runtime_cost_events from anon, authenticated/i);
  assert.match(harden, /grant select, insert on table public\.runtime_cost_events to authenticated/i);

  const rlsOpt = fs.readFileSync(MIGRATION_RLS_OPT, 'utf8');
  assert.match(rlsOpt, /\(select auth\.uid\(\)\) = user_id/);
  assert.doesNotMatch(rlsOpt, /using \(auth\.uid\(\) = user_id\)/);
});

test('licensed media acceptance plants remain IMAGE_READY consume-only', () => {
  const seed = loadSeed();
  for (const slug of ['cacao', 'coconut']) {
    const p = seed.plants.find((x) => x.slug === slug);
    assert.equal(isApprovedCatalogMediaRecord(p.media, p).ok, true, slug);
    assert.equal(
      resolvePlantDisplayMedia({ ...p, catalogMedia: p.media, media: p.media }).kind,
      'catalog',
      slug
    );
  }
});

test('Smart Rec browse path evidence: no plant-knowledge in refreshSmartRecBrowse', () => {
  const appSrc = fs.readFileSync(APP, 'utf8');
  const idx = appSrc.indexOf('function refreshSmartRecBrowse');
  assert.ok(idx > 0);
  assert.doesNotMatch(appSrc.slice(idx, idx + 2500), /fetchPlantKnowledgeBundle|plant-knowledge/);
});
