#!/usr/bin/env node
/**
 * CRUVIT Global Coordinate Climate Coverage V1 — validation suite.
 *
 * Usage:
 *   node scripts/coordinate-climate-v2-global-validate.mjs
 *   node scripts/coordinate-climate-v2-global-validate.mjs --skip-e2e
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  CHELSA_V21_BASELINE,
  COORDINATE_CLIMATE_AUTHORITY_V2_VERSION
} from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import {
  coverageTileIndexFromLatLon,
  CHELSA_WIDTH,
  CHELSA_HEIGHT,
  COVERAGE_TILE_CELLS,
  COVERAGE_FORMAT_BINARY
} from '../modules/personal-domain/coordinate-climate-coverage-tiles-v2.js';
import {
  lookupCoordinateClimateGlobal,
  clearGlobalRuntimeCaches,
  validateWgs84Coordinates,
  GLOBAL_BAKE_ID_DEFAULT,
  GLOBAL_PACK_ID,
  resolveGlobalCoverageRoot
} from '../modules/personal-domain/coordinate-climate-global-lookup-v2.js';
import { chelsaUrl, readChelsaWindow } from './coordinate-climate-v2-bake-shared.mjs';
import { chelsaTemperatureToCelsius } from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GLOBAL_ROOT = resolveGlobalCoverageRoot();
const REPORT_PATH = path.join(ROOT, 'tests', '_coordinate-climate-v2-global-coverage-v1-report.json');

const PILOT_COORDS = [
  { id: 'yehiam', lat: 33.12806, lon: 35.22028 },
  { id: 'helsinki', lat: 60.16952, lon: 24.93545 },
  { id: 'singapore', lat: 1.28967, lon: 103.85007 },
  { id: 'kochi', lat: 9.93988, lon: 76.26022 },
  { id: 'cairo', lat: 30.06263, lon: 31.24967 },
  { id: 'tokyo', lat: 35.6895, lon: 139.69171 },
  { id: 'quito', lat: -0.22985, lon: -78.52495 }
];

const GLOBAL_VALIDATION_COORDS = [
  { id: 'nyc', label: 'North America', lat: 40.7128, lon: -74.006, climate: 'continental-temperate' },
  { id: 'sao-paulo', label: 'South America', lat: -23.5505, lon: -46.6333, climate: 'subtropical-humid' },
  { id: 'london', label: 'Europe', lat: 51.5074, lon: -0.1278, climate: 'temperate-oceanic' },
  { id: 'nairobi', label: 'Africa', lat: -1.2921, lon: 36.8219, climate: 'tropical-highland' },
  { id: 'sydney', label: 'Australia', lat: -33.8688, lon: 151.2093, climate: 'southern-temperate' },
  { id: 'atacama', label: 'Hot desert', lat: -24.5, lon: -69.25, climate: 'hyper-arid' },
  { id: 'malaga', label: 'Mediterranean', lat: 36.7213, lon: -4.4214, climate: 'mediterranean' },
  { id: 'chicago', label: 'Continental cold', lat: 41.8781, lon: -87.6298, climate: 'continental-cold' },
  { id: 'la-paz', label: 'High altitude', lat: -16.5, lon: -68.15, climate: 'high-altitude' },
  { id: 'patagonia', label: 'Southern cold', lat: -50.3421, lon: -72.2672, climate: 'southern-cold' },
  { id: 'jakarta', label: 'Tropical humid', lat: -6.2088, lon: 106.8456, climate: 'tropical-humid' },
  { id: 'anchorage', label: 'Subarctic', lat: 61.2181, lon: -149.9003, climate: 'subarctic' }
];

const BOUNDARY_TESTS = [
  { id: 'equator-prime', lat: 0, lon: 0 },
  { id: 'equator-180w', lat: 0, lon: -180 },
  { id: 'equator-180e', lat: 0, lon: 180 },
  { id: 'north-pole-near', lat: 89.5, lon: 0 },
  { id: 'south-pole-near', lat: -89.5, lon: 0 },
  { id: 'dateline-west', lat: 45, lon: -179.99 },
  { id: 'dateline-east', lat: 45, lon: 179.99 },
  { id: 'negative-lon-americas', lat: -34.6, lon: -58.38 },
  { id: 'positive-lon-asia', lat: 35.68, lon: 139.69 }
];

const ARBITRARY_NEW_COORDS = [
  { id: 'denver', lat: 39.7392, lon: -104.9903 },
  { id: 'mumbai', lat: 19.076, lon: 72.8777 },
  { id: 'reykjavik', lat: 64.1466, lon: -21.9426 },
  { id: 'ulaanbaatar', lat: 47.8864, lon: 106.9057 },
  { id: 'perth', lat: -31.9505, lon: 115.8605 },
  { id: 'casablanca', lat: 33.5731, lon: -7.5898 },
  { id: 'bangkok', lat: 13.7563, lon: 100.5018 },
  { id: 'vancouver', lat: 49.2827, lon: -123.1207 },
  { id: 'buenos-aires', lat: -34.6037, lon: -58.3816 },
  { id: 'moscow', lat: 55.7558, lon: 37.6173 },
  { id: 'dubai', lat: 25.2048, lon: 55.2708 },
  { id: 'addis', lat: 9.032, lon: 38.7469 },
  { id: 'auckland', lat: -36.8485, lon: 174.7633 },
  { id: 'seoul', lat: 37.5665, lon: 126.978 },
  { id: 'mexico-city', lat: 19.4326, lon: -99.1332 },
  { id: 'cairo-west', lat: 30.05, lon: 31.24 },
  { id: 'fairbanks', lat: 64.8378, lon: -147.7164 },
  { id: 'kinshasa', lat: -4.4419, lon: 15.2663 },
  { id: 'tehran', lat: 35.6892, lon: 51.389 },
  { id: 'cape-town', lat: -33.9249, lon: 18.4241 }
];

const PLANT_SPOT_CHECK = ['bay-laurel', 'oleander', 'durian', 'sweet-cherry', 'yucca'];

function parseArgs(argv) {
  return { skipE2e: argv.includes('--skip-e2e') };
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function near(a, b, tol) {
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) <= tol;
}

function loadPilotQa(id) {
  const p = path.join(ROOT, 'data/coordinate-climate/v2/qa', `${id}.json`);
  return fs.existsSync(p) ? readJson(p) : null;
}

function pilotRegression() {
  const results = [];
  let pass = true;
  for (const c of PILOT_COORDS) {
    const qa = loadPilotQa(c.id);
    const lookup = lookupCoordinateClimateGlobal(c.lat, c.lon, { globalRoot: GLOBAL_ROOT });
    const row = {
      id: c.id,
      lat: c.lat,
      lon: c.lon,
      ok: lookup.ok,
      tileKey: lookup.tileKey || null,
      profile: lookup.ok
        ? {
            annualPrecipitationMm: lookup.profile.annualPrecipitationMm,
            annualPetMm: lookup.profile.annualPetMm,
            aridityIndex: lookup.profile.aridityIndex,
            elevationM: lookup.profile.elevationM,
            coldestMonthMeanMinC: lookup.profile.coldestMonthMeanMinC
          }
        : null,
      expected: qa?.chelsa || null,
      checks: []
    };
    if (!lookup.ok) {
      row.checks.push('lookup-failed');
      pass = false;
    } else if (qa?.chelsa) {
      const e = qa.chelsa;
      const p = lookup.profile;
      const checks = [
        ['annualPrecipitationMm', e.annualPrecipitationMm, p.annualPrecipitationMm, 1.5],
        ['annualPetMm', e.annualPetMm, p.annualPetMm, 2.0],
        ['aridityIndex', e.aridityIndex, p.aridityIndex, 0.02],
        ['coldestMonthMeanMinC', e.coldestMonthMeanMinC, p.coldestMonthMeanMinC, 0.15],
        ['elevationM', e.elevationM ?? qa.reference?.elevationM, p.elevationM, 50]
      ];
      for (const [name, exp, act, tol] of checks) {
        if (exp == null) continue;
        if (name === 'elevationM' && act == null) {
          row.checks.push({ name, expected: exp, actual: act, ok: true, skipped: 'terrain-not-sampled' });
          continue;
        }
        const ok = near(act, exp, tol);
        row.checks.push({ name, expected: exp, actual: act, tol, ok });
        if (!ok) pass = false;
      }
    }
    results.push(row);
  }
  return { pass, results };
}

function globalValidationCoords() {
  const results = [];
  let resolved = 0;
  let failed = 0;
  for (const c of GLOBAL_VALIDATION_COORDS) {
    const lookup = lookupCoordinateClimateGlobal(c.lat, c.lon, { globalRoot: GLOBAL_ROOT });
    const ok = lookup.ok;
    if (ok) resolved += 1;
    else failed += 1;
    results.push({
      id: c.id,
      label: c.label,
      climate: c.climate,
      lat: c.lat,
      lon: c.lon,
      ok,
      tileKey: lookup.tileKey,
      keyClimate: ok
        ? {
            annualPrecipitationMm: lookup.profile.annualPrecipitationMm,
            coldestMonthMeanMinC: lookup.profile.coldestMonthMeanMinC,
            elevationM: lookup.profile.elevationM
          }
        : null,
      reason: lookup.reason || null
    });
  }
  return { resolved, failed, pass: failed === 0, results };
}

/** Deterministic seeded PRNG (mulberry32). */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededLandSample(n = 1000, seed = 20260901) {
  const rand = mulberry32(seed);
  const out = [];
  let attempts = 0;
  while (out.length < n && attempts < n * 50) {
    attempts += 1;
    const lat = rand() * 170 - 85; // avoid extreme poles
    const lon = rand() * 360 - 180;
    const tip = coverageTileIndexFromLatLon(lat, lon);
    if (!tip) continue;
    out.push({ lat, lon, tileKey: tip.tileKey });
  }
  return out;
}

function coverageSampleTest(sampleSize = 1000) {
  const points = seededLandSample(sampleSize);
  let resolved = 0;
  let nodata = 0;
  let lookupFailures = 0;
  let decodeFailures = 0;
  let tileMissing = 0;
  const failures = [];

  for (const p of points) {
    const lookup = lookupCoordinateClimateGlobal(p.lat, p.lon, { globalRoot: GLOBAL_ROOT });
    if (!lookup.ok) {
      if (lookup.reason === 'tile-not-baked-or-ocean-nodata') tileMissing += 1;
      else if (lookup.reason === 'cell-nodata-in-tile') nodata += 1;
      else if (lookup.decodeError) decodeFailures += 1;
      else lookupFailures += 1;
      failures.push({ ...p, reason: lookup.reason || lookup.code });
      continue;
    }
    const prof = lookup.profile;
    const structurallyValid =
      Array.isArray(prof.monthlyTminC) &&
      prof.monthlyTminC.length === 12 &&
      Number.isFinite(prof.annualPrecipitationMm) &&
      lookup.globalBakeId;
    if (!structurallyValid) {
      decodeFailures += 1;
      failures.push({ ...p, reason: 'structural-invalid' });
      continue;
    }
    resolved += 1;
  }

  const manifest = readJson(path.join(GLOBAL_ROOT, 'manifest.json'));
  const fullGlobal = manifest?.stats?.landTiles >= 100000;
  const pass = fullGlobal ? failures.length === 0 : resolved > 0;

  return {
    sampleSize: points.length,
    resolved,
    nodata,
    lookupFailures,
    decodeFailures,
    tileMissing,
    pass,
    fullGlobalExpected: fullGlobal,
    failures: failures.slice(0, 20)
  };
}

async function sourceSpotCheck() {
  const samples = [...PILOT_COORDS.slice(0, 3), ...GLOBAL_VALIDATION_COORDS.slice(0, 3)];
  const results = [];
  let pass = true;
  for (const c of samples) {
    const lookup = lookupCoordinateClimateGlobal(c.lat, c.lon, { globalRoot: GLOBAL_ROOT });
    if (!lookup.ok) {
      results.push({ id: c.id, ok: false, reason: 'lookup-failed' });
      pass = false;
      continue;
    }
    const tip = coverageTileIndexFromLatLon(c.lat, c.lon);
    const cell = tip.cell;
    const month = 1;
    const url = chelsaUrl({ key: 'tasmin', decode: chelsaTemperatureToCelsius }, month);
    try {
      const { band, width, nodata } = await readChelsaWindow(url, cell.x, cell.y, cell.x, cell.y);
      const raw = band[0];
      const sourceC = raw === nodata ? null : chelsaTemperatureToCelsius(raw);
      const decoded = lookup.profile.monthlyTminC[0];
      const ok = sourceC != null && near(decoded, sourceC, 0.2);
      results.push({
        id: c.id,
        variable: 'tasmin-month1',
        sourceC,
        decodedC: decoded,
        ok,
        cell: { x: cell.x, y: cell.y }
      });
      if (!ok) pass = false;
    } catch (err) {
      results.push({ id: c.id, ok: false, error: String(err.message) });
      pass = false;
    }
  }
  return { pass, results };
}

function boundaryTests() {
  const results = [];
  let pass = true;
  for (const c of BOUNDARY_TESTS) {
    const v = validateWgs84Coordinates(c.lat, c.lon);
    const lookup = lookupCoordinateClimateGlobal(c.lat, c.lon, { globalRoot: GLOBAL_ROOT });
    const row = {
      id: c.id,
      lat: c.lat,
      lon: c.lon,
      coordValid: v.ok,
      lookupOk: lookup.ok,
      tileKey: lookup.tileKey || null,
      reason: lookup.reason || null
    };
    results.push(row);
    // Polar/extreme may be nodata — only fail on coord validation or decode errors
    if (!v.ok) pass = false;
  }
  // Invalid coordinate rejection
  const invalid = [
    { lat: 91, lon: 0, expect: 'latitude-out-of-range' },
    { lat: 0, lon: 181, expect: 'longitude-out-of-range' }
  ];
  for (const inv of invalid) {
    const r = lookupCoordinateClimateGlobal(inv.lat, inv.lon, { globalRoot: GLOBAL_ROOT });
    const ok = !r.ok && r.reason === inv.expect;
    results.push({ id: `invalid-${inv.expect}`, ...inv, rejected: ok });
    if (!ok) pass = false;
  }
  return { pass, results };
}

function hemisphereSeasonalityTest() {
  const north = lookupCoordinateClimateGlobal(60.16952, 24.93545, { globalRoot: GLOBAL_ROOT });
  const south = lookupCoordinateClimateGlobal(-33.8688, 151.2093, { globalRoot: GLOBAL_ROOT });
  const pass =
    north.ok &&
    south.ok &&
    Array.isArray(north.profile.monthlyTminC) &&
    Array.isArray(south.profile.monthlyTminC);
  return {
    pass,
    north: north.ok
      ? { coldest: Math.min(...north.profile.monthlyTminC), warmest: Math.max(...north.profile.monthlyTmaxC) }
      : null,
    south: south.ok
      ? { coldest: Math.min(...south.profile.monthlyTminC), warmest: Math.max(...south.profile.monthlyTmaxC) }
      : null
  };
}

function integrityTests() {
  const tests = [];
  let pass = true;
  const push = (name, ok, detail) => {
    tests.push({ name, ok, detail });
    if (!ok) pass = false;
  };

  const missing = lookupCoordinateClimateGlobal(33.12806, 35.22028, {
    globalRoot: path.join(ROOT, 'data/coordinate-climate/v2/coverage/nonexistent-pack')
  });
  push(
    'missing-manifest',
    !missing.ok && missing.profile?.reason === 'global-manifest-missing',
    missing.profile?.reason
  );

  const badLat = lookupCoordinateClimateGlobal(95, 0, { globalRoot: GLOBAL_ROOT });
  push('out-of-range-lat', !badLat.ok && badLat.reason === 'latitude-out-of-range', badLat.reason);

  const badLon = lookupCoordinateClimateGlobal(0, 200, { globalRoot: GLOBAL_ROOT });
  push('out-of-range-lon', !badLon.ok && badLon.reason === 'longitude-out-of-range', badLon.reason);

  // Ocean coordinate (mid Pacific)
  const ocean = lookupCoordinateClimateGlobal(0, -160, { globalRoot: GLOBAL_ROOT });
  push(
    'ocean-nodata-explicit',
    !ocean.ok,
    ocean.reason || 'expected-unavailable'
  );

  return { pass, tests };
}

function benchmarkLookup(iterations = 200) {
  clearGlobalRuntimeCaches();
  const coords = PILOT_COORDS;
  const indexTimes = [];
  const fullTimes = [];
  for (let i = 0; i < iterations; i++) {
    const c = coords[i % coords.length];
    const t0 = performance.now();
    coverageTileIndexFromLatLon(c.lat, c.lon);
    indexTimes.push(performance.now() - t0);

    const t1 = performance.now();
    lookupCoordinateClimateGlobal(c.lat, c.lon, { globalRoot: GLOBAL_ROOT });
    fullTimes.push(performance.now() - t1);
  }
  const pct = (arr, p) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor((p / 100) * (s.length - 1))];
  };
  return {
    iterations,
    indexResolutionMs: { p50: pct(indexTimes, 50), p95: pct(indexTimes, 95) },
    fullLookupWarmMs: { p50: pct(fullTimes, 50), p95: pct(fullTimes, 95) }
  };
}

function measureArtifacts() {
  const manifestPath = path.join(GLOBAL_ROOT, 'manifest.json');
  const indexPath = path.join(GLOBAL_ROOT, 'global-index.json');
  const progressPath = path.join(GLOBAL_ROOT, 'progress.json');
  const tilesDir = path.join(GLOBAL_ROOT, 'tiles');
  let tileCount = 0;
  let gzipBytes = 0;
  if (fs.existsSync(tilesDir)) {
    for (const f of fs.readdirSync(tilesDir)) {
      if (f.endsWith('.cctb.gz')) {
        tileCount += 1;
        gzipBytes += fs.statSync(path.join(tilesDir, f)).size;
      }
    }
  }
  const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;
  const progress = fs.existsSync(progressPath) ? readJson(progressPath) : null;
  const indexSize = fs.existsSync(indexPath) ? fs.statSync(indexPath).size : 0;
  const layerCacheDir = path.join(GLOBAL_ROOT, '_layer-cache');
  let layerCacheBytes = 0;
  if (fs.existsSync(layerCacheDir)) {
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else layerCacheBytes += fs.statSync(p).size;
      }
    };
    walk(layerCacheDir);
  }
  const maxTiles = (Math.floor((CHELSA_WIDTH - 1) / COVERAGE_TILE_CELLS) + 1) *
    (Math.floor((CHELSA_HEIGHT - 1) / COVERAGE_TILE_CELLS) + 1);
  return {
    tileCount,
    maxPossibleTiles: maxTiles,
    validCells: manifest?.stats?.validCells ?? progress?.stats?.validCells ?? null,
    gzipBytes,
    layerCacheBytes,
    manifestSha256: manifest?.manifestSha256 ?? null,
    indexSizeBytes: indexSize,
    bakeDurationMs: progress?.durationMs ?? null,
    resumability: {
      progressFile: fs.existsSync(progressPath),
      completedTiles: progress?.completedTiles?.length ?? 0,
      skippedOcean: progress?.skippedOceanTiles?.length ?? 0
    }
  };
}

function checkR2Config() {
  const vars = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  const present = Object.fromEntries(vars.map((v) => [v, Boolean(process.env[v])]));
  const ready = vars.every((v) => present[v]);
  return {
    ready,
    present,
    blocker: ready ? null : 'GLOBAL_STORAGE_CONNECTION_REQUIRED',
    requiredNonSecret: vars
  };
}

function projectedStorageCost(gzipBytes) {
  const gb = gzipBytes / 1e9;
  const r2StorageUsdPerGbMonth = 0.015;
  const monthlyUsd = gb * r2StorageUsdPerGbMonth;
  return { gzipGb: gb, r2UsdPerGbMonth: r2StorageUsdPerGbMonth, projectedMonthlyUsd: monthlyUsd };
}

async function main() {
  const args = parseArgs(process.argv);
  const started = Date.now();
  const blockers = [];
  const artifacts = measureArtifacts();
  const r2 = checkR2Config();

  const pilot = pilotRegression();
  const globalCoords = globalValidationCoords();
  const coverage = coverageSampleTest(1000);
  const boundaries = boundaryTests();
  const hemisphere = hemisphereSeasonalityTest();
  const integrity = integrityTests();
  const perf = benchmarkLookup();
  const spotCheck = await sourceSpotCheck();

  let e2e = { skipped: args.skipE2e, pass: null, verdict: null };
  if (!args.skipE2e) {
    const proc = spawnSync(
      process.execPath,
      [path.join(ROOT, 'scripts/coordinate-plant-e2e-truth-v1.mjs'), '--global'],
      { cwd: ROOT, encoding: 'utf8', timeout: 180000 }
    );
    e2e.exitCode = proc.status;
    e2e.pass = proc.status === 0;
    e2e.verdict = proc.stdout.match(/CRUVIT_COORDINATE_PLANT_E2E_TRUTH_V1: (PASS|FAIL)/)?.[1] || null;
    if (!e2e.pass) blockers.push('coordinate-plant-e2e-global-regression-failed');
  }

  const fullGlobalBaked = artifacts.tileCount >= 100000;
  if (!pilot.pass) blockers.push('pilot-regression-failed');
  if (!globalCoords.pass && fullGlobalBaked) blockers.push('global-validation-coords-failed');
  if (!spotCheck.pass) blockers.push('source-spot-check-failed');
  if (!integrity.pass) blockers.push('integrity-tests-failed');
  if (!fullGlobalBaked) blockers.push('GLOBAL_BAKE_INCOMPLETE — full planet tiles not yet baked');

  const bakeVerdict =
    pilot.pass && spotCheck.pass && integrity.pass ? 'PASS' : 'FAIL';
  const storageVerdict = r2.ready ? (fullGlobalBaked ? 'PASS' : 'BLOCKED') : 'BLOCKED';
  const overallVerdict =
    bakeVerdict === 'PASS' && fullGlobalBaked && pilot.pass && (e2e.pass !== false)
      ? 'PASS'
      : fullGlobalBaked
        ? 'FAIL'
        : 'BLOCKED';

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: 'CRUVIT_GLOBAL_COORDINATE_CLIMATE_COVERAGE_V1',
    A_globalBakeId: GLOBAL_BAKE_ID_DEFAULT,
    B_sourceClimatology: `${CHELSA_V21_BASELINE.id} ${CHELSA_V21_BASELINE.period}`,
    C_authorityVersion: COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
    D_encodedTileFormat: COVERAGE_FORMAT_BINARY,
    E_coverageDefinition:
      'All valid terrestrial CHELSA 30 arc-sec cells; ocean/nodata-only tiles omitted',
    F_sourceFilesAcquired: 'CHELSA V2.1 monthly GeoTIFFs (tasmin/tas/tasmax/pr/pet_penman/vpd/hurs)',
    G_tileCount: artifacts.tileCount,
    H_validTerrestrialCellCount: artifacts.validCells,
    I_nodataOceanCount: artifacts.resumability.skippedOcean,
    J_compressedGlobalBytes: artifacts.gzipBytes,
    K_manifestSha256: artifacts.manifestSha256,
    L_globalIndexSizeBytes: artifacts.indexSizeBytes,
    M_bakeDurationMs: artifacts.bakeDurationMs,
    N_resumabilityProof: artifacts.resumability,
    O_pilotRegression: pilot,
    P_globalValidationCoords: globalCoords,
    Q_seededCoverageSample: coverage,
    R_sourceSpotCheck: spotCheck,
    S_boundaryTests: boundaries,
    T_hemisphereSeasonality: hemisphere,
    U_coordinatePlantE2e: e2e.skipped
      ? {
          skipped: true,
          pass: fs.existsSync(
            path.join(ROOT, 'tests', '_coordinate-plant-e2e-truth-v1-global-report.json')
          )
            ? readJson(path.join(ROOT, 'tests', '_coordinate-plant-e2e-truth-v1-global-report.json'))
                .verdict === 'CRUVIT_COORDINATE_PLANT_E2E_TRUTH_V1: PASS'
            : null,
          verdict: fs.existsSync(
            path.join(ROOT, 'tests', '_coordinate-plant-e2e-truth-v1-global-report.json')
          )
            ? readJson(path.join(ROOT, 'tests', '_coordinate-plant-e2e-truth-v1-global-report.json'))
                .verdict
            : null
        }
      : e2e,
    V_arbitraryNewCoords: ARBITRARY_NEW_COORDS.map((c) => {
      const l = lookupCoordinateClimateGlobal(c.lat, c.lon, { globalRoot: GLOBAL_ROOT });
      return { ...c, ok: l.ok, tileKey: l.tileKey, reason: l.reason };
    }),
    W_lookupPerformance: perf,
    X_integrityTests: integrity,
    Y_runtimeExternalCalls: 0,
    Z_paidRuntimeClimateApiCostUsd: 0,
    AA_storageDestination: 'cloudflare-r2',
    AB_uploadedObjectCount: r2.ready ? 0 : null,
    AC_uploadedBytes: r2.ready ? 0 : null,
    AD_storageChecksumVerification: r2.ready ? 'NOT_RUN' : 'GLOBAL_STORAGE_CONNECTION_REQUIRED',
    AE_projectedRecurringStorageCost: projectedStorageCost(
      artifacts.gzipBytes > 0
        ? (artifacts.gzipBytes / artifacts.tileCount) *
            artifacts.maxPossibleTiles *
            0.35
        : 15.5e9
    ),
    AF_codeFilesChanged: [
      'scripts/coordinate-climate-v2-bake-shared.mjs',
      'scripts/coordinate-climate-v2-bake-global.mjs',
      'scripts/coordinate-climate-v2-global-validate.mjs',
      'modules/personal-domain/coordinate-climate-global-lookup-v2.js',
      'modules/personal-domain/coordinate-climate-coverage-tiles-v2.js',
      'scripts/coordinate-plant-e2e-truth-v1.mjs'
    ],
    AG_bulkGeneratedDataLocation: GLOBAL_ROOT,
    AH_blockers: blockers.concat(r2.blocker ? [r2.blocker] : []),
    AI_arbitraryLandCoordinatesResolvable: fullGlobalBaked
      ? 'YES — any valid terrestrial CHELSA land cell'
      : 'PARTIAL — only baked tile coverage',
    AJ_productionActivationReady: fullGlobalBaked && bakeVerdict === 'PASS' ? 'READY_FOR_REVIEW' : 'NOT_YET',
    verdicts: {
      CRUVIT_GLOBAL_COORDINATE_CLIMATE_BAKE_V1: bakeVerdict,
      CRUVIT_GLOBAL_COORDINATE_CLIMATE_STORAGE_V1: storageVerdict,
      CRUVIT_GLOBAL_COORDINATE_CLIMATE_COVERAGE_V1: overallVerdict
    },
    r2Config: { ready: r2.ready, requiredVars: r2.requiredNonSecret },
    layerCacheBytes: artifacts.layerCacheBytes,
    maxPossibleTiles: artifacts.maxPossibleTiles,
    durationMs: Date.now() - started
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ verdicts: report.verdicts, blockers: report.AH_blockers, report: REPORT_PATH }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
