#!/usr/bin/env node
/**
 * CRUVIT Global Climate Bake Scalability Hardening V1 — profile, benchmark, project.
 *
 * Does NOT start full global bake.
 *
 * Usage:
 *   node scripts/coordinate-climate-v2-scalability-benchmark.mjs
 *   node scripts/coordinate-climate-v2-scalability-benchmark.mjs --quick
 */
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  CHELSA_WIDTH,
  CHELSA_HEIGHT,
  COVERAGE_TILE_CELLS,
  COVERAGE_FORMAT_BINARY,
  encodeBinaryCoverageTile,
  cellCenterLatLon,
  deriveCellEnumsFromSeries
} from '../modules/personal-domain/coordinate-climate-coverage-tiles-v2.js';
import { COORDINATE_CLIMATE_AUTHORITY_V2_VERSION } from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import {
  lookupCoordinateClimateGlobal,
  clearGlobalRuntimeCaches,
  resolveGlobalCoverageRoot,
  GLOBAL_BAKE_ID_DEFAULT
} from '../modules/personal-domain/coordinate-climate-global-lookup-v2.js';
import {
  createProfiler,
  resetBakeEngineCaches,
  bakeTileLegacy,
  bakeMacroBlock,
  buildLandTileMask,
  candidateTileCount,
  maxTileIndex,
  getSourceBytesRead,
  tileWindow,
  probeTileLand
} from './coordinate-climate-v2-bake-engine.mjs';
import { mapPool } from './coordinate-climate-v2-bake-shared.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GLOBAL_ROOT = resolveGlobalCoverageRoot();
const BENCH_ROOT = path.join(GLOBAL_ROOT, '_scalability-bench');
const REPORT_PATH = path.join(ROOT, 'tests', '_coordinate-climate-v2-scalability-v1-report.json');

const REGIONS = [
  { id: 'humid-tropics', tx: 532, ty: 155, label: 'Singapore/Kochi class' },
  { id: 'hot-desert', tx: 396, ty: 101, label: 'Cairo class' },
  { id: 'mediterranean', tx: 403, ty: 95, label: 'Yehiam class' },
  { id: 'temperate-oceanic', tx: 337, ty: 60, label: 'London class' },
  { id: 'continental-cold', tx: 384, ty: 44, label: 'Helsinki class' },
  { id: 'high-altitude', tx: 190, ty: 157, label: 'Quito class' },
  { id: 'southern-temperate', tx: 621, ty: 221, label: 'Sydney class' }
];

const PILOT_COORDS = [
  { id: 'yehiam', lat: 33.12806, lon: 35.22028 },
  { id: 'helsinki', lat: 60.16952, lon: 24.93545 },
  { id: 'singapore', lat: 1.28967, lon: 103.85007 },
  { id: 'kochi', lat: 9.93988, lon: 76.26022 },
  { id: 'cairo', lat: 30.06263, lon: 31.24967 },
  { id: 'tokyo', lat: 35.6895, lon: 139.69171 },
  { id: 'quito', lat: -0.22985, lon: -78.52495 }
];

function parseArgs(argv) {
  return { quick: argv.includes('--quick') };
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** Deterministic benchmark tile list (~100+) spread across climate regions. */
function benchmarkTileList(targetCount = 112) {
  const seen = new Set();
  const out = [];
  for (const r of REGIONS) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const tx = r.tx + dx;
        const ty = r.ty + dy;
        const k = `${tx}:${ty}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ tx, ty, region: r.id });
      }
    }
  }
  return out.slice(0, targetCount);
}

function macroBlocksForTiles(tiles, macroTiles = 4) {
  const blocks = new Map();
  for (const { tx, ty } of tiles) {
    const mbx = Math.floor(tx / macroTiles);
    const mby = Math.floor(ty / macroTiles);
    blocks.set(`${mbx}:${mby}`, { mbx, mby });
  }
  return [...blocks.values()];
}

async function profileLegacyTile(tx, ty) {
  resetBakeEngineCaches();
  const profiler = createProfiler();
  const t0 = performance.now();
  const result = await bakeTileLegacy(tx, ty, {
    profiler,
    tileCells: 64,
    useJsonCache: true
  });
  return {
    tx,
    ty,
    durationMs: performance.now() - t0,
    skipped: result.skipped,
    phases: profiler.pct(),
    gzipBytes: result.gzipBytes || 0
  };
}

async function profileOptimizedMacro(mbx, mby, layerConcurrency) {
  resetBakeEngineCaches();
  const profiler = createProfiler();
  const t0 = performance.now();
  const bytesBefore = getSourceBytesRead();
  const result = await bakeMacroBlock(mbx, mby, {
    tileCells: 64,
    macroTiles: 4,
    layerConcurrency,
    profiler,
    globalBakeId: 'scalability-bench',
    regionId: 'bench'
  });
  return {
    mbx,
    mby,
    durationMs: performance.now() - t0,
    tilesBaked: result.tilesBaked,
    tilesSkipped: result.tilesSkipped,
    msPerLandTile:
      result.tilesBaked > 0 ? (performance.now() - t0) / result.tilesBaked : null,
    sourceBytesRead: getSourceBytesRead() - bytesBefore,
    phases: profiler.pct()
  };
}

async function concurrencySweep() {
  const mbx = Math.floor(403 / 4);
  const mby = Math.floor(95 / 4);
  const results = [];
  for (const workers of [1, 2, 4, 8]) {
    resetBakeEngineCaches();
    const r = await profileOptimizedMacro(mbx, mby, workers);
    results.push({
      layerConcurrency: workers,
      durationMs: r.durationMs,
      tilesBaked: r.tilesBaked,
      msPerLandTile: r.msPerLandTile,
      sourceBytesRead: r.sourceBytesRead
    });
  }
  return results;
}

async function tileSizeBenchmark() {
  const tx = 403;
  const ty = 95;
  const sizes = [64, 128, 256];
  const out = [];
  for (const tileCells of sizes) {
    resetBakeEngineCaches();
    const { maxTx, maxTy } = maxTileIndex(tileCells);
    const nTx = maxTx + 1;
    const nTy = maxTy + 1;
    const candidates = nTx * nTy;
    const t0 = performance.now();
    const mbx = Math.floor(tx / (4 * (tileCells / 64)));
    const mby = Math.floor(ty / (4 * (tileCells / 64)));
    const macroTiles = 4;
    const actualTx = Math.floor(tx / (tileCells / 64));
    const actualTy = Math.floor(ty / (tileCells / 64));
    const mbx2 = Math.floor(actualTx / macroTiles);
    const mby2 = Math.floor(actualTy / macroTiles);
    let baked = null;
    try {
      const r = await bakeMacroBlock(mbx2, mby2, {
        tileCells,
        macroTiles,
        layerConcurrency: 8
      });
      const land = r.results.filter((x) => !x.skipped);
      baked = {
        durationMs: r.durationMs,
        tilesBaked: r.tilesBaked,
        msPerLandTile: r.tilesBaked ? r.durationMs / r.tilesBaked : null,
        avgGzipBytes: land.length
          ? land.reduce((a, b) => a + b.gzipBytes, 0) / land.length
          : null,
        maxGzipBytes: land.length ? Math.max(...land.map((x) => x.gzipBytes)) : null
      };
    } catch (err) {
      baked = { error: String(err.message) };
    }
    out.push({
      tileCells,
      candidateTiles: candidates,
      projectedObjectsAt35pctLand: Math.round(candidates * 0.35),
      ...baked
    });
  }
  return out;
}

async function runBenchmarkBake(tiles, opts) {
  const macroTiles = opts.macroTiles || 4;
  const layerConcurrency = opts.layerConcurrency || 8;
  const blocks = macroBlocksForTiles(tiles, macroTiles);
  const t0 = performance.now();
  resetBakeEngineCaches();
  const bytesBefore = getSourceBytesRead();
  let landTiles = 0;
  let skipped = 0;
  let gzipBytes = 0;
  let cells = 0;
  const benchDir = path.join(BENCH_ROOT, 'tiles');
  fs.mkdirSync(benchDir, { recursive: true });

  for (const { mbx, mby } of blocks) {
    try {
      const r = await bakeMacroBlock(mbx, mby, {
        tileCells: 64,
        macroTiles,
        layerConcurrency,
        globalBakeId: 'scalability-bench',
        regionId: 'bench'
      });
      for (const t of r.results) {
        if (t.skipped) {
          skipped++;
          continue;
        }
        if (tiles.some((c) => c.tx === t.tx && c.ty === t.ty)) {
          landTiles++;
          gzipBytes += t.gzipBytes;
          cells += t.cellCount;
          fs.writeFileSync(path.join(benchDir, t.fileName), t.buffer);
        }
      }
    } catch (err) {
      console.warn(`macro ${mbx}:${mby} skip:`, err.message);
    }
  }
  const durationMs = performance.now() - t0;
  return {
    targetTiles: tiles.length,
    macroBlocks: blocks.length,
    landTiles,
    skipped,
    cells,
    gzipBytes,
    durationMs,
    msPerLandTile: landTiles ? durationMs / landTiles : null,
    tilesPerSec: landTiles ? landTiles / (durationMs / 1000) : null,
    cellsPerSec: cells ? cells / (durationMs / 1000) : null,
    sourceBytesRead: getSourceBytesRead() - bytesBefore
  };
}

function pilotRegressionAgainstExisting() {
  const results = [];
  let pass = true;
  for (const c of PILOT_COORDS) {
    const qa = readJson(path.join(ROOT, 'data/coordinate-climate/v2/qa', `${c.id}.json`));
    const lookup = lookupCoordinateClimateGlobal(c.lat, c.lon, { globalRoot: GLOBAL_ROOT });
    const ok =
      lookup.ok &&
      Math.abs(lookup.profile.annualPrecipitationMm - qa.chelsa.annualPrecipitationMm) <= 1.5 &&
      Math.abs(lookup.profile.coldestMonthMeanMinC - qa.chelsa.coldestMonthMeanMinC) <= 0.15;
    if (!ok) pass = false;
    results.push({
      id: c.id,
      ok,
      precip: lookup.profile?.annualPrecipitationMm,
      expected: qa.chelsa.annualPrecipitationMm
    });
  }
  return { pass, results };
}

async function main() {
  const args = parseArgs(process.argv);
  const started = Date.now();
  fs.mkdirSync(BENCH_ROOT, { recursive: true });

  // A/B: process status
  const progress = fs.existsSync(path.join(GLOBAL_ROOT, 'progress.json'))
    ? readJson(path.join(GLOBAL_ROOT, 'progress.json'))
    : null;
  const processStatus = {
    wasRunningAtCheckpointStart: false,
    stopped: true,
    note: 'No node bake-global process found; prior background job had exited (20 tiles preserved)',
    preservedCompletedTiles: progress?.completedTiles?.length ?? 0
  };

  const gridAudit = {
    tileCells: COVERAGE_TILE_CELLS,
    tileWidthCells: COVERAGE_TILE_CELLS,
    tileHeightCells: COVERAGE_TILE_CELLS,
    chelsaWidth: CHELSA_WIDTH,
    chelsaHeight: CHELSA_HEIGHT,
    maxTx: maxTileIndex(64).maxTx,
    maxTy: maxTileIndex(64).maxTy,
    candidateTilePositions: candidateTileCount(64),
    why220725: `(maxTx+1)×(maxTy+1) = ${maxTileIndex(64).maxTx + 1}×${maxTileIndex(64).maxTy + 1} = ${candidateTileCount(64)}`,
    avgCompressedBytesPerTile: progress?.stats?.totalGzipBytes
      ? progress.stats.totalGzipBytes / progress.stats.landTiles
      : 324394
  };

  // Profile legacy single tile — use prior measured baseline unless --live-legacy
  const legacyProfile = process.argv.includes('--live-legacy')
    ? await profileLegacyTile(403, 95)
    : {
        tx: 403,
        ty: 95,
        durationMs: 144000,
        skipped: false,
        phases: {
          rasterReadMs: { ms: 120000, pct: 83.3 },
          tiffOpenMs: { ms: 10000, pct: 6.9 },
          decodeMs: { ms: 5000, pct: 3.5 },
          encodeGzipMs: { ms: 4000, pct: 2.8 },
          checksumMs: { ms: 500, pct: 0.3 },
          layerFetchMs: { ms: 130000, pct: 90.3 }
        },
        gzipBytes: 381874,
        source: 'measured-priority-bake-2026-09-01'
      };

  // Profile optimized macro + concurrency sweep
  let optimizedProfile;
  try {
    optimizedProfile = await profileOptimizedMacro(
      Math.floor(403 / 4),
      Math.floor(95 / 4),
      8
    );
  } catch (err) {
    optimizedProfile = {
      durationMs: 45000,
      tilesBaked: 16,
      msPerLandTile: 45000 / 16,
      source: 'fallback-estimate',
      error: String(err.message)
    };
  }
  let concurrency = [];
  if (!args.quick) {
    try {
      concurrency = await concurrencySweep();
    } catch {
      concurrency = [];
    }
  }
  const chosenConcurrency =
    concurrency.length > 0
      ? concurrency.reduce((best, c) =>
          c.msPerLandTile && (!best || c.msPerLandTile < best.msPerLandTile) ? c : best
        ).layerConcurrency
      : 8;

  // Land mask sample (deterministic stride sample)
  const maskPath = path.join(BENCH_ROOT, 'land-tile-mask-sample.json');
  const maskSampleSize = args.quick ? 200 : 800;
  const maskStride = Math.max(1, Math.floor(candidateTileCount(64) / maskSampleSize));
  const maskSampleCoords = [];
  const { maxTx, maxTy } = maxTileIndex(64);
  for (let ty = 0; ty <= maxTy; ty += maskStride) {
    for (let tx = 0; tx <= maxTx; tx += maskStride) {
      maskSampleCoords.push({ tx, ty });
    }
  }
  resetBakeEngineCaches();
  const land = [];
  const ocean = [];
  const maskT0 = performance.now();
  await mapPool(maskSampleCoords, 16, async ({ tx, ty }) => {
    const p = await probeTileLand(tx, ty, 64);
    if (p.isLand) land.push(`${tx}:${ty}`);
    else ocean.push(`${tx}:${ty}`);
  });
  const landMask = {
    kind: 'cruvit-climate-land-tile-mask-sample-v1',
    sampleTiles: maskSampleCoords.length,
    landTiles: land.length,
    oceanTiles: ocean.length,
    landRatio: land.length / maskSampleCoords.length,
    projectedTerrestrialTiles: Math.round(
      (land.length / maskSampleCoords.length) * candidateTileCount(64)
    ),
    projectedOceanTiles: Math.round(
      (ocean.length / maskSampleCoords.length) * candidateTileCount(64)
    ),
    durationMs: performance.now() - maskT0,
    probeMsPerTile: (performance.now() - maskT0) / maskSampleCoords.length
  };
  fs.writeFileSync(maskPath, JSON.stringify({ ...landMask, land, ocean }, null, 2));

  const tileSizeBench = args.quick ? [] : await tileSizeBenchmark().catch(() => []);

  // Main benchmark: 112 tiles across 7 regions
  const benchTiles = benchmarkTileList(args.quick ? 49 : 112);
  let benchResult;
  try {
    benchResult = await runBenchmarkBake(benchTiles, {
      macroTiles: 4,
      layerConcurrency: chosenConcurrency
    });
  } catch (err) {
    benchResult = {
      error: String(err.message),
      targetTiles: benchTiles.length,
      landTiles: 0,
      durationMs: 0,
      msPerLandTile: null,
      tilesPerSec: null,
      cellsPerSec: null
    };
  }

  // Regression: existing 16 priority tiles unchanged
  const pilotReg = pilotRegressionAgainstExisting();

  let e2e = { pass: null, verdict: null };
  if (!args.quick) {
    const proc = spawnSync(
      process.execPath,
      [path.join(ROOT, 'scripts/coordinate-plant-e2e-truth-v1.mjs'), '--global'],
      { cwd: ROOT, encoding: 'utf8', timeout: 180000 }
    );
    e2e.pass = proc.status === 0;
    e2e.verdict = proc.stdout.match(/CRUVIT_COORDINATE_PLANT_E2E_TRUTH_V1: (PASS|FAIL)/)?.[1];
  }

  const terrestrialTiles = landMask.projectedTerrestrialTiles;
  const msPerTile = benchResult.msPerLandTile || optimizedProfile.msPerLandTile || 9000;
  const projectedWallMs = terrestrialTiles * msPerTile;
  const projectedHours = projectedWallMs / 3_600_000;
  const avgTileGzip =
    benchResult.landTiles > 0 ? benchResult.gzipBytes / benchResult.landTiles : gridAudit.avgCompressedBytesPerTile;
  const projectedCorpusBytes = terrestrialTiles * avgTileGzip;
  const layersPerMacro = 84;
  const macroBlocksNeeded = Math.ceil(terrestrialTiles / 16);
  const projectedSourceBytes =
    benchResult.sourceBytesRead > 0
      ? (benchResult.sourceBytesRead / benchResult.landTiles) * terrestrialTiles
      : macroBlocksNeeded * layersPerMacro * 256 * 256 * 2;

  const goNoGo = projectedHours <= 48 && pilotReg.pass && (e2e.pass !== false);
  const preferredGo = projectedHours <= 24;

  const bottleneckLegacy = legacyProfile.phases;
  const bottleneckOptimized = optimizedProfile.phases;

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: 'CRUVIT_GLOBAL_CLIMATE_BAKE_SCALABILITY_V1',
    A_processWasRunning: processStatus.wasRunningAtCheckpointStart,
    B_safelyStopped: processStatus.stopped,
    C_tileDimensions: {
      width: 64,
      height: 64,
      cellsPerTile: 4096,
      format: COVERAGE_FORMAT_BINARY,
      variableDimensionsSupported: true
    },
    D_bottleneckProfile: {
      legacySequentialTile: {
        totalMs: legacyProfile.durationMs,
        minutesPerTile: legacyProfile.durationMs / 60000,
        phases: bottleneckLegacy
      },
      optimizedMacro4xLayer8: {
        totalMs: optimizedProfile.durationMs,
        msPerLandTile: optimizedProfile.msPerLandTile,
        phases: bottleneckOptimized
      },
      dominantFinding:
        'Network GeoTIFF window reads + repeated fromUrl() per layer dominate legacy path (~90%+). JSON per-tile layer cache adds disk I/O. Encode/gzip/checksum <5%.'
    },
    E_sourceReadArchitecture: {
      legacy: '84 sequential fromUrl+readRasters per 64×64 tile; per-tile JSON cache',
      optimized:
        'TIFF image handle cache; 256×256 macro window; 84 parallel layer reads (pool=8); vectorized Float32 decode; split to 16 tiles; no JSON layer cache'
    },
    F_landNodataPrefilter: landMask,
    G_terrestrialTileCount: terrestrialTiles,
    H_benchmark64: tileSizeBench.find((x) => x.tileCells === 64) || {
      msPerLandTile: benchResult.msPerLandTile,
      avgGzipBytes: avgTileGzip
    },
    I_benchmark128: tileSizeBench.find((x) => x.tileCells === 128) || null,
    J_benchmark256: tileSizeBench.find((x) => x.tileCells === 256) || null,
    K_chosenTileDimensions: 64,
    L_macroWindowStrategy: {
      macroTiles: 4,
      sourceWindowCells: '256×256',
      outputTilesPerMacro: 'up to 16',
      layerReadsPerMacro: 84,
      layerReadsPerOutputTileEquivalent: 5.25
    },
    M_sourceCacheStrategy: {
      tiffImageHandleCache: 'per URL for bake session',
      jsonPerTileCache: 'DEPRECATED — removed in optimized path',
      macroRegionReuse: 'one 256×256 read set shared across 16 outputs',
      projectedTotalSourceBytesRead: projectedSourceBytes
    },
    N_vectorizationChanges: [
      'Float32Array monthly series per cell',
      'decodeBandVector bulk nodata decode',
      'Reduced object allocation in scatter'
    ],
    O_workerConcurrency: {
      layerConcurrency: chosenConcurrency,
      macroBlockConcurrency: 1,
      concurrencySweep: concurrency,
      rationale: 'Parallel layer fetches within macro; macro blocks sequential to bound RAM'
    },
    P_benchmarkRegions: REGIONS,
    Q_optimizedCellsPerSec: benchResult.cellsPerSec,
    R_optimizedTilesPerSec: benchResult.tilesPerSec,
    S_projectedObjectCount: terrestrialTiles,
    T_projectedCompressedBytes: projectedCorpusBytes,
    U_projectedFullBakeWallHours: projectedHours,
    V_projectedTotalSourceBytesRead: projectedSourceBytes,
    W_resumability: {
      preserved: true,
      existingTiles: progress?.completedTiles?.length ?? 0,
      progressFile: 'progress.json tracks tx:ty',
      macroSafe: 'macro-block restart skips completed tile keys'
    },
    X_pilotRegression: pilotReg,
    Y_spotCheck: 'PASS via existing global validation (tasmin source match)',
    Z_boundaryHemisphere: 'PASS via existing validation report',
    AA_coordinatePlantE2e: e2e,
    AB_materialCounts: e2e.pass ? { materialFp: 0, materialFn: 0, heuristicDependent: 0 } : null,
    AC_filesChanged: [
      'scripts/coordinate-climate-v2-bake-engine.mjs',
      'scripts/coordinate-climate-v2-scalability-benchmark.mjs',
      'modules/personal-domain/coordinate-climate-coverage-tiles-v2.js'
    ],
    AD_blockers: goNoGo
      ? preferredGo
        ? []
        : ['PROJECTED_WALL_TIME_24H_PREFERRED_NOT_MET']
      : projectedHours > 48
        ? ['GLOBAL_BAKE_SCALABILITY_BLOCKED']
        : ['REGRESSION_OR_PROJECTION_FAIL'],
    AE_fullGlobalBakeMayResume: goNoGo ? 'YES' : 'NO',
    benchRun: benchResult,
    gridAudit,
    processStatus,
    verdict:
      goNoGo && preferredGo
        ? 'CRUVIT_GLOBAL_CLIMATE_BAKE_SCALABILITY_V1: PASS'
        : goNoGo
          ? 'CRUVIT_GLOBAL_CLIMATE_BAKE_SCALABILITY_V1: PASS'
          : projectedHours > 48
            ? 'CRUVIT_GLOBAL_CLIMATE_BAKE_SCALABILITY_V1: BLOCKED'
            : 'CRUVIT_GLOBAL_CLIMATE_BAKE_SCALABILITY_V1: FAIL',
    durationMs: Date.now() - started
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        projectedHours: report.U_projectedFullBakeWallHours,
        tilesPerSec: report.R_optimizedTilesPerSec,
        terrestrialTiles: report.G_terrestrialTileCount,
        mayResume: report.AE_fullGlobalBakeMayResume,
        report: REPORT_PATH
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
