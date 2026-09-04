#!/usr/bin/env node
/**
 * LOCAL_MIRROR throughput benchmark — no network CHELSA during timed phase.
 *
 * Usage:
 *   node scripts/coordinate-climate-v2-local-throughput-benchmark.mjs
 *   node scripts/coordinate-climate-v2-local-throughput-benchmark.mjs --min-tiles 500
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  bakeMacroBlock,
  createProfiler,
  candidateTileCount,
  resetBakeEngineCaches,
  getSourceBytesRead,
  SOURCE_MODE,
  setSourceMode,
  resetNetworkChelsaCalls,
  getNetworkChelsaCalls
} from './coordinate-climate-v2-bake-engine.mjs';
import { assertLocalMirrorReady } from './coordinate-climate-v2-source-resolver.mjs';
import {
  lookupCoordinateClimateGlobal,
  clearGlobalRuntimeCaches,
  resolveGlobalCoverageRoot
} from '../modules/personal-domain/coordinate-climate-global-lookup-v2.js';
import { decodeBinaryCoverageTile } from '../modules/personal-domain/coordinate-climate-coverage-tiles-v2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = path.join(ROOT, 'tests', '_coordinate-climate-v2-local-mirror-throughput-v1-report.json');
const BENCH_OUT = path.join(ROOT, 'data/coordinate-climate/v2/coverage/global-v1/_local-throughput-bench');
const GLOBAL_ROOT = resolveGlobalCoverageRoot();
const MASK_PATH = path.join(GLOBAL_ROOT, 'land-tile-mask.json');
const MANIFEST_PATH = path.join(ROOT, 'data/coordinate-climate/v2/source-mirror/mirror-manifest.json');

const REGIONS = [
  { id: 'humid-tropics', tx: 532, ty: 155 },
  { id: 'hot-desert', tx: 396, ty: 101 },
  { id: 'mediterranean', tx: 403, ty: 95 },
  { id: 'temperate', tx: 337, ty: 60 },
  { id: 'continental-cold', tx: 384, ty: 44 },
  { id: 'high-altitude', tx: 190, ty: 157 },
  { id: 'southern', tx: 621, ty: 221 },
  { id: 'nyc', tx: 198, ty: 81 },
  { id: 'sao-paulo', tx: 250, ty: 201 },
  { id: 'atacama', tx: 207, ty: 203 },
  { id: 'patagonia', tx: 201, ty: 251 },
  { id: 'tokyo', tx: 599, ty: 90 }
];

function parseArgs(argv) {
  let minTiles = 500;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--min-tiles') minTiles = Number(argv[++i]) || 500;
  }
  return { minTiles };
}

function benchmarkTileCoords(minTiles) {
  const seen = new Set();
  const out = [];
  for (const r of REGIONS) {
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const tx = r.tx + dx;
        const ty = r.ty + dy;
        if (tx < 0 || ty < 0) continue;
        const k = `${tx}:${ty}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ tx, ty, region: r.id });
      }
    }
  }
  return out.slice(0, Math.max(minTiles, out.length));
}

function macroBlocksForTiles(tiles, macroTiles) {
  const m = new Map();
  for (const { tx, ty } of tiles) {
    const mbx = Math.floor(tx / macroTiles);
    const mby = Math.floor(ty / macroTiles);
    m.set(`${mbx}:${mby}`, { mbx, mby });
  }
  return [...m.values()];
}

function memPeakMb() {
  return process.memoryUsage().heapUsed / 1e6;
}

function diskFreeBytes() {
  try {
    const out = spawnSync('powershell', ['-NoProfile', '-Command', '(Get-PSDrive C).Free'], { encoding: 'utf8' });
    return Number(String(out.stdout || '').trim()) || null;
  } catch {
    return null;
  }
}

async function runMacroBenchmark({ tileCells, macroTiles, layerConcurrency, tiles, label, tileFilter }) {
  resetBakeEngineCaches();
  resetNetworkChelsaCalls();
  setSourceMode(SOURCE_MODE.LOCAL_MIRROR);
  const filter = tileFilter || tiles;
  const blocks = macroBlocksForTiles(filter, macroTiles);
  const profiler = createProfiler();
  const srcBefore = getSourceBytesRead();
  let landTiles = 0;
  let cells = 0;
  let gzipBytes = 0;
  const gzipSizes = [];
  const writtenPaths = [];
  const t0 = performance.now();
  let ramPeak = 0;
  const outDir = path.join(BENCH_OUT, label);
  fs.mkdirSync(outDir, { recursive: true });

  for (const { mbx, mby } of blocks) {
    const r = await bakeMacroBlock(mbx, mby, {
      tileCells,
      macroTiles,
      layerConcurrency,
      globalBakeId: 'local-throughput-bench',
      regionId: 'bench',
      profiler
    });
    for (const t of r.results) {
      if (t.skipped) continue;
      if (!filter.some((c) => c.tx === t.tx && c.ty === t.ty)) continue;
      landTiles++;
      cells += t.cellCount;
      gzipBytes += t.gzipBytes;
      gzipSizes.push(t.gzipBytes);
      const fp = path.join(outDir, t.fileName);
      fs.writeFileSync(fp, t.buffer);
      writtenPaths.push(fp);
    }
    ramPeak = Math.max(ramPeak, memPeakMb());
  }
  const durationMs = performance.now() - t0;
  gzipSizes.sort((a, b) => a - b);
  const p95 = gzipSizes.length ? gzipSizes[Math.floor(gzipSizes.length * 0.95)] : null;

  let decompressMs = 0;
  let warmLookupMs = 0;
  if (writtenPaths.length) {
    const sample = writtenPaths.slice(0, Math.min(20, writtenPaths.length));
    const d0 = performance.now();
    for (const p of sample) decodeBinaryCoverageTile(fs.readFileSync(p));
    decompressMs = (performance.now() - d0) / sample.length;
    clearGlobalRuntimeCaches();
    const w0 = performance.now();
    for (let i = 0; i < 100; i++) {
      lookupCoordinateClimateGlobal(40.7128, -74.006 + i * 0.001, { globalRoot: GLOBAL_ROOT });
    }
    warmLookupMs = (performance.now() - w0) / 100;
  }

  return {
    label,
    tileCells,
    macroTiles,
    layerConcurrency,
    landTiles,
    cells,
    durationMs,
    cellsPerSec: cells / (durationMs / 1000),
    tilesPerSec: landTiles / (durationMs / 1000),
    msPerTile: landTiles ? durationMs / landTiles : null,
    gzipBytes,
    avgGzip: landTiles ? gzipBytes / landTiles : null,
    p95Gzip: p95,
    avgDecompressMs: decompressMs || null,
    avgWarmLookupMs: warmLookupMs || null,
    sourceBytesRead: getSourceBytesRead() - srcBefore,
    networkChelsaCalls: getNetworkChelsaCalls(),
    ramPeakMb: ramPeak,
    phases: profiler.pct()
  };
}

async function sweepWorkers(tiles, macroTiles, tileCells) {
  const subset = tiles.slice(0, 100);
  const results = [];
  for (const w of [1, 2, 4, 8]) {
    results.push(
      await runMacroBenchmark({
        tileCells,
        macroTiles,
        layerConcurrency: w,
        tiles: subset,
        label: `worker-sweep-${w}`,
        tileFilter: subset
      })
    );
  }
  return results;
}

function chooseBestWorker(workerSweep) {
  const safe = workerSweep.filter((r) => r.networkChelsaCalls === 0 && r.landTiles > 0);
  return safe.reduce((b, r) => (r.msPerTile && (!b || r.msPerTile < b.msPerTile) ? r : b), null);
}

function tileCoordsForCells(baseTiles, tileCells) {
  const factor = 64 / tileCells;
  return baseTiles.map(({ tx, ty, region }) => ({
    tx: Math.floor(tx / factor),
    ty: Math.floor(ty / factor),
    region
  }));
}

function pilotRegression() {
  const pilots = [
    { id: 'yehiam', lat: 33.12806, lon: 35.22028 },
    { id: 'helsinki', lat: 60.16952, lon: 24.93545 },
    { id: 'singapore', lat: 1.28967, lon: 103.85007 },
    { id: 'kochi', lat: 9.93988, lon: 76.26022 },
    { id: 'cairo', lat: 30.06263, lon: 31.24967 },
    { id: 'tokyo', lat: 35.6895, lon: 139.69171 },
    { id: 'quito', lat: -0.22985, lon: -78.52495 }
  ];
  const results = [];
  let pass = true;
  for (const p of pilots) {
    const qa = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/coordinate-climate/v2/qa', `${p.id}.json`), 'utf8'));
    const l = lookupCoordinateClimateGlobal(p.lat, p.lon, { globalRoot: GLOBAL_ROOT });
    const ok =
      l.ok &&
      Math.abs(l.profile.annualPrecipitationMm - qa.chelsa.annualPrecipitationMm) <= 1.5 &&
      Math.abs(l.profile.coldestMonthMeanMinC - qa.chelsa.coldestMonthMeanMinC) <= 0.15;
    if (!ok) pass = false;
    results.push({ id: p.id, ok, precip: l.profile?.annualPrecipitationMm, exp: qa.chelsa.annualPrecipitationMm });
  }
  return { pass, results };
}

function runE2eRegression() {
  const r = spawnSync('node', ['scripts/coordinate-plant-e2e-truth-v1.mjs', '--global'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 600000
  });
  const reportPath = path.join(ROOT, 'tests/_coordinate-plant-e2e-truth-v1-global-report.json');
  if (!fs.existsSync(reportPath)) {
    return { pass: false, error: r.stderr || r.stdout || 'no-report' };
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  return {
    pass: report.verdict?.includes('PASS') && report.materialFp === 0 && report.materialFn === 0,
    verdict: report.verdict,
    materialFp: report.materialFp ?? 0,
    materialFn: report.materialFn ?? 0,
    heuristicDependent: report.heuristicDependent ?? 0,
    unknownFailures: report.unknownFailures ?? 0,
    cityProxy: report.cityProxy ?? 0,
    externalCalls: report.externalClimateCalls ?? 0
  };
}

function runGlobalValidate() {
  const r = spawnSync('node', ['scripts/coordinate-climate-v2-global-validate.mjs', '--skip-e2e'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 600000
  });
  const reportPath = path.join(ROOT, 'tests/_coordinate-climate-v2-global-coverage-v1-report.json');
  if (!fs.existsSync(reportPath)) return { pass: false, error: r.stderr || r.stdout };
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  return {
    pass: report.verdict?.includes('PASS'),
    boundaryPass: report.boundaryRegression?.pass,
    hemispherePass: report.hemisphereRegression?.pass,
    sourcePixelPass: report.sourcePixelSpotChecks?.pass
  };
}

function countPreservedTiles() {
  const progressPath = path.join(GLOBAL_ROOT, 'progress.json');
  if (!fs.existsSync(progressPath)) return 0;
  const p = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  return (p.completed || []).length;
}

async function main() {
  const args = parseArgs(process.argv);
  assertLocalMirrorReady();
  setSourceMode(SOURCE_MODE.LOCAL_MIRROR);

  const mirrorManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const mirrorValidated = (mirrorManifest.entries || []).filter((e) => e.status === 'validated').length;
  const mirrorBytes = mirrorManifest.actualMirrorBytes ||
    (mirrorManifest.entries || []).filter((e) => e.status === 'validated').reduce((a, e) => a + (e.downloadedBytes || 0), 0);

  if (!fs.existsSync(MASK_PATH)) {
    throw new Error('land-tile-mask.json missing — run coordinate-climate-v2-land-mask-local.mjs first');
  }
  const landMask = JSON.parse(fs.readFileSync(MASK_PATH, 'utf8'));
  const terrestrial = landMask.landTileCount || landMask.projectedLandTiles;
  const candidate = landMask.totalCandidateTiles || candidateTileCount(64);

  const tiles = benchmarkTileCoords(args.minTiles);
  const workerSweep = await sweepWorkers(tiles, 8, 64);
  const bestWorker = chooseBestWorker(workerSweep);
  const workers = bestWorker?.layerConcurrency || 4;

  const macro8 = await runMacroBenchmark({
    tileCells: 64,
    macroTiles: 8,
    layerConcurrency: workers,
    tiles,
    label: 'macro-8x8-64'
  });
  const macro16 = await runMacroBenchmark({
    tileCells: 64,
    macroTiles: 16,
    layerConcurrency: workers,
    tiles,
    label: 'macro-16x16-64'
  });
  const bestMacro = [macro8, macro16].reduce((b, r) =>
    r.msPerTile && (!b || r.msPerTile < b.msPerTile) ? r : b
  );

  const bench64 = await runMacroBenchmark({
    tileCells: 64,
    macroTiles: bestMacro.macroTiles,
    layerConcurrency: workers,
    tiles,
    label: 'tile-64-final'
  });
  const bench128 = await runMacroBenchmark({
    tileCells: 128,
    macroTiles: Math.max(4, bestMacro.macroTiles / 2),
    layerConcurrency: workers,
    tiles: tileCoordsForCells(tiles, 128),
    label: 'tile-128-final',
    tileFilter: tileCoordsForCells(tiles, 128)
  });

  let bench256 = null;
  if (bench128.ramPeakMb < 12000) {
    bench256 = await runMacroBenchmark({
      tileCells: 256,
      macroTiles: Math.max(2, bestMacro.macroTiles / 4),
      layerConcurrency: workers,
      tiles: tileCoordsForCells(tiles, 256),
      label: 'tile-256-final',
      tileFilter: tileCoordsForCells(tiles, 256)
    });
  }

  const tileCandidates = [bench64, bench128, bench256].filter(Boolean);
  const chosenBench = tileCandidates.reduce((b, r) => {
    if (!r.landTiles) return b;
    const score = r.landTiles / (r.durationMs / 1000);
    const bestScore = b ? b.landTiles / (b.durationMs / 1000) : 0;
    return score > bestScore ? r : b;
  }, null);

  const chosenTileCells = chosenBench?.tileCells || 64;
  const msPerTile = chosenBench?.msPerTile || bench64.msPerTile;
  const msConservative = msPerTile * 1.15;
  const msBest = msPerTile;
  const hoursConservative = (terrestrial * msConservative) / 3_600_000;
  const hoursBest = (terrestrial * msBest) / 3_600_000;
  const avgGzip = chosenBench?.avgGzip || bench64.avgGzip || 324394;
  const p95Gzip = chosenBench?.p95Gzip || bench64.p95Gzip;
  const corpusGb = (terrestrial * avgGzip) / 1e9;

  const pilot = pilotRegression();
  const e2e = runE2eRegression();
  const globalVal = runGlobalValidate();

  const regressionsPass =
    pilot.pass &&
    e2e.pass &&
    globalVal.pass !== false &&
    e2e.materialFp === 0 &&
    e2e.materialFn === 0 &&
    e2e.heuristicDependent === 0 &&
    e2e.unknownFailures === 0;

  const mirrorComplete = mirrorValidated >= 84;
  const benchmarkComplete = chosenBench?.landTiles >= args.minTiles;
  const networkZero = chosenBench?.networkChelsaCalls === 0;
  const throughputPass = hoursConservative <= 48;
  const go = mirrorComplete && benchmarkComplete && networkZero && throughputPass && regressionsPass;

  const inv = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/coordinate-climate/v2/source-mirror/source-inventory.json'), 'utf8'));

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: 'CRUVIT_LOCAL_CHELSA_MIRROR_BAKE_THROUGHPUT_V1',
    A_mirrorCompleteCount: `${mirrorValidated}/84`,
    B_actualMirrorGb: mirrorBytes / 1e9,
    C_mirrorDurationMs: mirrorManifest.durationMs || null,
    D_mirrorManifestSha256: mirrorManifest.manifestSha256 || null,
    E_landMaskCandidateCount: candidate,
    F_terrestrialTileCount: terrestrial,
    G_oceanNodataTileCount: landMask.oceanTileCount,
    H_mixedTileCount: landMask.mixedLandOceanTileCount || landMask.mixed?.length || null,
    I_localBenchmarkTileCount: chosenBench?.landTiles || 0,
    J_timedBenchmarkNetworkCalls: chosenBench?.networkChelsaCalls ?? null,
    K_workerSweep: workerSweep,
    L_chosenWorkerCount: workers,
    M_macroComparison: { macro8, macro16 },
    N_chosenMacroSize: bestMacro.macroTiles,
    O_tile64: bench64,
    P_tile128: bench128,
    Q_tile256: bench256,
    R_chosenTileDimensions: chosenTileCells,
    S_measuredCellsPerSec: chosenBench?.cellsPerSec,
    T_measuredTilesPerSec: chosenBench?.tilesPerSec,
    U_resourceMetrics: {
      ramPeakMb: chosenBench?.ramPeakMb,
      cpuLogical: os.cpus().length,
      ramGb: os.totalmem() / 1e9,
      sourceBytesRead: chosenBench?.sourceBytesRead,
      diskFreeGb: diskFreeBytes() ? diskFreeBytes() / 1e9 : null
    },
    V_projectedObjectCount: terrestrial,
    W_projectedFinalCorpusGb: corpusGb,
    X_conservativeFullBakeHours: hoursConservative,
    Y_bestCaseFullBakeHours: hoursBest,
    Z_sourceMirrorAcquisitionGb: inv.projectedMirrorGb,
    AA_sourcePixelEquivalence: globalVal.sourcePixelPass ?? 'see-global-validate',
    AB_sevenCoordinateRegression: pilot,
    AC_coordinatePlant70Pair: e2e,
    AD_boundaryHemisphereRegression: globalVal,
    AE_materialCounts: {
      materialFp: e2e.materialFp ?? 0,
      materialFn: e2e.materialFn ?? 0,
      heuristicDependent: e2e.heuristicDependent ?? 0,
      unknownFailures: e2e.unknownFailures ?? 0,
      cityProxy: e2e.cityProxy ?? 0,
      externalCalls: e2e.externalCalls ?? 0
    },
    AF_resumability: { preservedVerifiedTiles: countPreservedTiles(), note: chosenTileCells !== 64 ? '64x64 tiles not reusable if dimension changes' : 'compatible' },
    AG_filesChanged: [
      'scripts/coordinate-climate-v2-chelsa-mirror.mjs',
      'scripts/coordinate-climate-v2-local-throughput-benchmark.mjs',
      'scripts/coordinate-climate-v2-bake-engine.mjs'
    ],
    AH_blockers: go
      ? []
      : [
          !mirrorComplete ? `mirror-incomplete:${mirrorValidated}/84` : null,
          !benchmarkComplete ? `benchmark-tiles:${chosenBench?.landTiles}/${args.minTiles}` : null,
          !networkZero ? 'network-calls-during-benchmark' : null,
          !throughputPass ? `conservative-hours:${hoursConservative.toFixed(1)}` : null,
          !regressionsPass ? 'regression-failure' : null
        ].filter(Boolean),
    AI_fullGlobalBakeAllowed: go ? 'YES' : 'NO',
    verdict: go
      ? 'CRUVIT_LOCAL_CHELSA_MIRROR_BAKE_THROUGHPUT_V1: PASS'
      : 'CRUVIT_LOCAL_CHELSA_MIRROR_BAKE_THROUGHPUT_V1: BLOCKED'
  };

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        mirror: report.A_mirrorCompleteCount,
        benchmarkTiles: report.I_localBenchmarkTileCount,
        hoursConservative: report.X_conservativeFullBakeHours,
        fullGlobalBakeAllowed: report.AI_fullGlobalBakeAllowed
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
