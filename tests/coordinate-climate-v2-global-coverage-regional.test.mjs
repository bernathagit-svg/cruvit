/**
 * Global Climate Coverage V1 — regional gate tests.
 * Requires baked pack under data/coordinate-climate/v2/coverage/emed-n-israel-v1
 * Run: node --test tests/coordinate-climate-v2-global-coverage-regional.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import {
  COVERAGE_FORMAT_BINARY,
  coverageTileIndexFromLatLon,
  cellsInBbox
} from '../modules/personal-domain/coordinate-climate-coverage-tiles-v2.js';
import {
  lookupCoordinateClimateFromCoverage,
  clearCoverageRuntimeCaches,
  loadCoverageManifest
} from '../modules/personal-domain/coordinate-climate-coverage-lookup-v2.js';
import { CLIMATE_AUTHORITY_UNAVAILABLE } from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import { CONFIDENCE_DIMENSIONS_V2 } from '../modules/personal-domain/coordinate-climate-confidence-v2-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const COVERAGE = path.join(ROOT, 'data', 'coordinate-climate', 'v2', 'coverage');
const REGION = 'emed-n-israel-v1';
const REGION_DIR = path.join(COVERAGE, REGION);

function requireBake() {
  const manPath = path.join(REGION_DIR, 'manifest.json');
  assert.equal(fs.existsSync(manPath), true, 'regional bake manifest missing — run bake script first');
  return JSON.parse(fs.readFileSync(manPath, 'utf8'));
}

test('PART A: production format is binary Int16 gzip', () => {
  const bench = JSON.parse(
    fs.readFileSync(path.join(COVERAGE, '_benchmark', 'tile-format-benchmark.json'), 'utf8')
  );
  assert.equal(bench.selectedProductionFormat, COVERAGE_FORMAT_BINARY);
  assert.ok(bench.precision.withinTemp001);
  assert.ok(bench.binaryGzip.bytesPerCell < bench.jsonGzip.bytesPerCell);
});

test('PART B: deterministic tile scheme lat/lon → tile → cell', () => {
  const a = coverageTileIndexFromLatLon(33.12806, 35.22028);
  const b = coverageTileIndexFromLatLon(33.12806, 35.22028);
  assert.equal(a.tileKey, b.tileKey);
  assert.equal(a.cell.cellKey, b.cell.cellKey);
  assert.match(a.tileKey, /^chelsa30s-t64:/);
});

test('PART C–I: regional bake present with many cells', () => {
  const man = requireBake();
  assert.equal(man.regionId, REGION);
  assert.equal(man.format, COVERAGE_FORMAT_BINARY);
  assert.ok(man.stats.cellCount >= 1000, `expected many cells, got ${man.stats.cellCount}`);
  assert.ok(man.tiles.length >= 1);
  assert.ok(man.stats.totalGzipBytes > 0);
  assert.match(man.climateNativeResolution, /1 km|30/);
  assert.match(man.terrainNativeResolution, /30 m/);
  assert.equal(man.runtimeExternalAcquisitionForbidden, true);
  assert.equal(man.objectStorage.uploaded, false);
});

test('PART D: ≥25 random in-region lookups — zero external calls', () => {
  const man = requireBake();
  clearCoverageRuntimeCaches();
  const { south, north, west, east } = man.bounds;
  const coords = [];
  for (let i = 0; i < 25; i++) {
    // Deterministic pseudo-random inside bounds
    const u = ((i * 57 + 13) % 1000) / 1000;
    const v = ((i * 91 + 29) % 1000) / 1000;
    coords.push({
      lat: south + (north - south) * u,
      lon: west + (east - west) * v
    });
  }
  let ok = 0;
  let ext = 0;
  const t0 = performance.now();
  for (const c of coords) {
    const r = lookupCoordinateClimateFromCoverage(c.lat, c.lon, {
      coverageRoot: COVERAGE,
      regionId: REGION,
      allowLegacyPilot: false
    });
    ext += r.externalClimateProviderCalls || 0;
    ext += r.chelsaExternalCalls || 0;
    if (r.ok) {
      ok++;
      assert.ok(r.profile.climateGrid?.cellPixel);
      assert.match(String(r.profile.climateNativeResolution), /1 km/);
      for (const dim of CONFIDENCE_DIMENSIONS_V2) {
        assert.ok(r.profile.confidenceDimensions?.[dim], dim);
      }
      // Must not default representativeness to high without QA
      assert.notEqual(r.profile.confidenceDimensions.LOCAL_REPRESENTATIVENESS, 'high');
    }
  }
  const ms = performance.now() - t0;
  assert.equal(ext, 0);
  assert.ok(ok >= 20, `expected most in-bounds cells hit; ok=${ok}/25`);
  assert.ok(ms < 5000, `lookup latency too high: ${ms}ms`);
});

test('PART D: outside coverage → UNAVAILABLE + 0 external', () => {
  clearCoverageRuntimeCaches();
  const miss = lookupCoordinateClimateFromCoverage(1.29, 103.85, {
    coverageRoot: COVERAGE,
    regionId: REGION,
    allowLegacyPilot: false
  });
  assert.equal(miss.code, CLIMATE_AUTHORITY_UNAVAILABLE);
  assert.equal(miss.externalClimateProviderCalls, 0);
  assert.equal(miss.chelsaExternalCalls, 0);
});

test('PART G: object storage contract prepared, not uploaded', () => {
  const c = JSON.parse(
    fs.readFileSync(path.join(COVERAGE, 'object-storage-contract.json'), 'utf8')
  );
  assert.equal(c.uploadedInThisCheckpoint, false);
  assert.equal(c.recommendation.backend, 'cloudflare-r2');
  assert.equal(c.recommendation.doNotMigrateFullGlobalYet, true);
});
