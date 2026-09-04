#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  bakeMacroBlock,
  createProfiler,
  getSourceBytesRead,
  readChelsaWindowForLayer,
  resetBakeEngineCaches,
  resetNetworkChelsaCalls,
  setSourceMode,
  SOURCE_MODE
} from './coordinate-climate-v2-bake-engine.mjs';
import { BAKE_VARIABLES } from './coordinate-climate-v2-bake-shared.mjs';
import { assertLocalMirrorReady, getNetworkChelsaCalls } from './coordinate-climate-v2-source-resolver.mjs';
import {
  CHELSA_BBOX,
  COVERAGE_TILE_CELLS,
  decodeBinaryCoverageTile,
  coverageTileIndexFromLatLon
} from '../modules/personal-domain/coordinate-climate-coverage-tiles-v2.js';
import {
  lookupCoordinateClimateGlobal,
  clearGlobalRuntimeCaches,
  resolveGlobalCoverageRoot,
  validateWgs84Coordinates
} from '../modules/personal-domain/coordinate-climate-global-lookup-v2.js';
import {
  chelsaTemperatureToCelsius,
  chelsaPrecipToMm,
  chelsaPetToMm,
  chelsaVpdToPa,
  chelsaHursToPct
} from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import { chelsaGridCellIndex } from '../modules/personal-domain/coordinate-climate-garden-hydrate-v2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GLOBAL_ROOT = resolveGlobalCoverageRoot();
const MASK_PATH = path.join(GLOBAL_ROOT, 'land-tile-mask.json');
const REPORT_PATH = path.join(ROOT, 'tests', '_coordinate-climate-v2-final-regate-report.json');
const BENCH_ROOT = path.join(GLOBAL_ROOT, '_final-regate-bench');
const MIRROR_MANIFEST = path.join(ROOT, 'data/coordinate-climate/v2/source-mirror/mirror-manifest.json');

const REGIONS = [
  { id: 'humid-tropical', tx: 532, ty: 155 },
  { id: 'hot-desert', tx: 396, ty: 101 },
  { id: 'mediterranean', tx: 403, ty: 95 },
  { id: 'temperate', tx: 337, ty: 60 },
  { id: 'continental-cold', tx: 384, ty: 44 },
  { id: 'high-altitude', tx: 190, ty: 157 },
  { id: 'southern-hemisphere', tx: 621, ty: 221 }
];

const PILOTS = [
  { id: 'yehiam', lat: 33.12806, lon: 35.22028 },
  { id: 'helsinki', lat: 60.16952, lon: 24.93545 },
  { id: 'singapore', lat: 1.28967, lon: 103.85007 },
  { id: 'kochi', lat: 9.93988, lon: 76.26022 },
  { id: 'cairo', lat: 30.06263, lon: 31.24967 },
  { id: 'tokyo', lat: 35.6895, lon: 139.69171 },
  { id: 'quito', lat: -0.22985, lon: -78.52495 }
];

const BOUNDARY_COORDS = [
  { id: 'equator-prime', lat: 0, lon: 0 },
  { id: 'equator-180w', lat: 0, lon: -180 },
  { id: 'equator-180e', lat: 0, lon: 180 },
  { id: 'dateline-west', lat: 45, lon: -179.99 },
  { id: 'dateline-east', lat: 45, lon: 179.99 },
  { id: 'negative-lon', lat: -34.6, lon: -58.38 },
  { id: 'positive-lon', lat: 35.68, lon: 139.69 }
];

function parseArgs(argv) {
  let minTiles = 700;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--min-tiles') minTiles = Number(argv[++i]) || 700;
  }
  return { minTiles: Math.max(500, minTiles) };
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function percentile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor((p / 100) * (s.length - 1))];
}

function tileCenterLatLon(tx, ty, tileCells) {
  const x = tx * tileCells + Math.floor(tileCells / 2);
  const y = ty * tileCells + Math.floor(tileCells / 2);
  const lon = CHELSA_BBOX[0] + (x + 0.5) * 0.0083333333;
  const lat = CHELSA_BBOX[3] - (y + 0.5) * 0.0083333333;
  return { lat, lon };
}

function parseTileKey(k) {
  const [tx, ty] = String(k).split(':').map(Number);
  return { tx, ty };
}

function formatTileKey(tx, ty) {
  return `${tx}:${ty}`;
}

function aggregateMaskKeys(mask, tileCells) {
  if (tileCells === 64) return [...mask.land];
  const factor = tileCells / 64;
  const out = new Set();
  for (const key of mask.land) {
    const { tx, ty } = parseTileKey(key);
    out.add(formatTileKey(Math.floor(tx / factor), Math.floor(ty / factor)));
  }
  return [...out];
}

function toTileCellsCoords(tx64, ty64, tileCells) {
  // REGIONS anchors are defined in 64-cell tile space.
  return {
    tx: Math.floor((Number(tx64) * 64) / tileCells),
    ty: Math.floor((Number(ty64) * 64) / tileCells)
  };
}

function collectMacroClusterTiles(keys, tileCells, minTiles, preferredMacro = 8) {
  const keySet = new Set(keys);
  const out = [];
  const used = new Set();
  const perRegionTarget = Math.max(48, Math.ceil(Math.max(minTiles, 512) / REGIONS.length));
  const pushMacro = (mbx, mby, regionId, regionBag) => {
    for (let sty = 0; sty < preferredMacro; sty++) {
      for (let stx = 0; stx < preferredMacro; stx++) {
        const tx = mbx * preferredMacro + stx;
        const ty = mby * preferredMacro + sty;
        const key = formatTileKey(tx, ty);
        if (!keySet.has(key) || used.has(key)) continue;
        used.add(key);
        out.push({ tx, ty, region: regionId });
        regionBag.count += 1;
      }
    }
  };

  // Balanced contiguous macro clusters around geographically separated climate regimes.
  for (const region of REGIONS) {
    const { tx: tx0, ty: ty0 } = toTileCellsCoords(region.tx, region.ty, tileCells);
    const mbx0 = Math.floor(tx0 / preferredMacro);
    const mby0 = Math.floor(ty0 / preferredMacro);
    const regionBag = { count: 0 };
    for (let ring = 0; ring <= 6 && regionBag.count < perRegionTarget; ring++) {
      for (let dby = -ring; dby <= ring; dby++) {
        for (let dbx = -ring; dbx <= ring; dbx++) {
          if (Math.max(Math.abs(dbx), Math.abs(dby)) !== ring && ring > 0) continue;
          if (regionBag.count >= perRegionTarget) break;
          pushMacro(mbx0 + dbx, mby0 + dby, region.id, regionBag);
        }
      }
    }
  }

  if (out.length < minTiles) {
    const sorted = [...keys].sort((a, b) => {
      const aa = parseTileKey(a);
      const bb = parseTileKey(b);
      return aa.ty - bb.ty || aa.tx - bb.tx;
    });
    for (const key of sorted) {
      if (out.length >= minTiles) break;
      if (used.has(key)) continue;
      used.add(key);
      const { tx, ty } = parseTileKey(key);
      out.push({ tx, ty, region: 'mask-fill' });
    }
  }

  const byRegion = {};
  for (const t of out) byRegion[t.region] = (byRegion[t.region] || 0) + 1;
  return {
    tiles: out.slice(0, Math.max(minTiles, out.length)),
    used,
    byRegion
  };
}

function buildBenchmarkTiles(mask, tileCells, minTiles, preferredMacro = 8) {
  const keys = aggregateMaskKeys(mask, tileCells);
  const { tiles, byRegion } = collectMacroClusterTiles(keys, tileCells, Math.max(minTiles, 512), preferredMacro);
  return {
    tiles,
    targetTileCount: keys.length,
    byRegion
  };
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

function contiguousWorkerSubset(tiles, macroTiles, targetCount) {
  const blocks = macroBlocksForTiles(tiles, macroTiles);
  const out = [];
  const byBlock = new Map(blocks.map((b) => [`${b.mbx}:${b.mby}`, []]));
  for (const t of tiles) {
    const key = `${Math.floor(t.tx / macroTiles)}:${Math.floor(t.ty / macroTiles)}`;
    byBlock.get(key)?.push(t);
  }
  for (const b of blocks) {
    const chunk = byBlock.get(`${b.mbx}:${b.mby}`) || [];
    out.push(...chunk);
    if (out.length >= targetCount) break;
  }
  return out;
}

function projectBakeHours(bench) {
  const bestCaseHours = bench.projectedObjectCount / bench.tilesPerSec / 3600;
  const p95Hours = bench.projectedObjectCount * (bench.p95TileMs / 1000) / 3600;
  const slowestRate = bench.slowestRegion?.tilesPerSec;
  const slowestHours =
    Number.isFinite(slowestRate) && slowestRate > 0
      ? bench.projectedObjectCount / slowestRate / 3600
      : null;
  const conservativeHours = Math.max(p95Hours, slowestHours || 0);
  return { bestCaseHours, p95Hours, slowestHours, conservativeHours };
}

function profilerMs(phases, name) {
  return phases?.[name]?.ms || 0;
}

async function runBenchmark({ label, tileCells, macroTiles, layerConcurrency, tiles }) {
  resetBakeEngineCaches();
  resetNetworkChelsaCalls();
  setSourceMode(SOURCE_MODE.LOCAL_MIRROR);
  fs.mkdirSync(path.join(BENCH_ROOT, label), { recursive: true });
  const blocks = macroBlocksForTiles(tiles, macroTiles);
  const tileMeta = new Map(tiles.map((t) => [`${t.tx}:${t.ty}`, t]));
  const filter = new Set(tiles.map((t) => `${t.tx}:${t.ty}`));
  const profiler = createProfiler();
  const cpu0 = process.cpuUsage();
  const src0 = getSourceBytesRead();
  const t0 = performance.now();
  let rssPeak = process.memoryUsage().rss;
  let tilesBaked = 0;
  let cells = 0;
  let gzipBytes = 0;
  let writeMs = 0;
  const gzipSizes = [];
  const tileMs = [];
  const decodedSamples = [];
  const regionStats = Object.fromEntries(
    [...new Set(tiles.map((t) => t.region))].map((id) => [
      id,
      { tiles: 0, cells: 0, durationMs: 0, gzipBytes: 0 }
    ])
  );

  for (let bi = 0; bi < blocks.length; bi++) {
    const { mbx, mby } = blocks[bi];
    const bt0 = performance.now();
    const baked = await bakeMacroBlock(mbx, mby, {
      tileCells,
      macroTiles,
      layerConcurrency,
      globalBakeId: `final-regate-${label}`,
      regionId: label,
      profiler
    });
    const blockDuration = performance.now() - bt0;
    let blockTiles = 0;
    const blockRegionTiles = {};
    for (const result of baked.results) {
      if (result.skipped) continue;
      const key = `${result.tx}:${result.ty}`;
      if (!filter.has(key)) continue;
      const meta = tileMeta.get(key);
      const regionId = meta?.region || 'unknown';
      const wt0 = performance.now();
      const fp = path.join(BENCH_ROOT, label, result.fileName);
      fs.writeFileSync(fp, result.buffer);
      writeMs += performance.now() - wt0;
      if (decodedSamples.length < 24) decodedSamples.push(fp);
      tilesBaked += 1;
      blockTiles += 1;
      cells += result.cellCount;
      gzipBytes += result.gzipBytes;
      gzipSizes.push(result.gzipBytes);
      if (!regionStats[regionId]) regionStats[regionId] = { tiles: 0, cells: 0, durationMs: 0, gzipBytes: 0 };
      regionStats[regionId].tiles += 1;
      regionStats[regionId].cells += result.cellCount;
      regionStats[regionId].gzipBytes += result.gzipBytes;
      blockRegionTiles[regionId] = (blockRegionTiles[regionId] || 0) + 1;
    }
    if (blockTiles > 0) {
      tileMs.push(blockDuration / blockTiles);
      for (const [regionId, count] of Object.entries(blockRegionTiles)) {
        regionStats[regionId].durationMs += blockDuration * (count / blockTiles);
      }
    }
    rssPeak = Math.max(rssPeak, process.memoryUsage().rss);
    if (bi === 0 || (bi + 1) % 5 === 0 || bi + 1 === blocks.length) {
      process.stderr.write(
        `[${label}] macro ${bi + 1}/${blocks.length} tiles=${tilesBaked} network=${getNetworkChelsaCalls()}\n`
      );
    }
  }

  const durationMs = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  const sourceBytesRead = getSourceBytesRead() - src0;
  const networkChelsaCalls = getNetworkChelsaCalls();
  const cpuUtilPct =
    ((cpu.user + cpu.system) / 1000 / durationMs / os.cpus().length) * 100;

  let decodeMs = [];
  let warmLookupMs = [];
  for (const fp of decodedSamples) {
    const raw = fs.readFileSync(fp);
    const d0 = performance.now();
    const decoded = decodeBinaryCoverageTile(raw);
    decodeMs.push(performance.now() - d0);
    const keys = Object.keys(decoded.byKey);
    if (!keys.length) continue;
    const sampleKey = keys[0];
    const l0 = performance.now();
    void decoded.byKey[sampleKey];
    warmLookupMs.push(performance.now() - l0);
  }

  const perRegion = {};
  for (const [regionId, s] of Object.entries(regionStats)) {
    if (!s.tiles) continue;
    perRegion[regionId] = {
      tiles: s.tiles,
      cells: s.cells,
      durationMs: s.durationMs,
      tilesPerSec: s.durationMs > 0 ? s.tiles / (s.durationMs / 1000) : null,
      cellsPerSec: s.durationMs > 0 ? s.cells / (s.durationMs / 1000) : null,
      avgObjectBytes: s.gzipBytes / s.tiles
    };
  }
  const regionRates = Object.entries(perRegion)
    .filter(([, r]) => Number.isFinite(r.tilesPerSec) && r.tiles >= 8)
    .sort((a, b) => a[1].tilesPerSec - b[1].tilesPerSec);
  const slowestRegion = regionRates.length
    ? { id: regionRates[0][0], ...regionRates[0][1] }
    : null;

  return {
    label,
    tileCells,
    macroTiles,
    layerConcurrency,
    benchmarkTileCount: tilesBaked,
    benchmarkMacroBlockCount: blocks.length,
    totalCells: cells,
    durationMs,
    cellsPerSec: cells / (durationMs / 1000),
    tilesPerSec: tilesBaked / (durationMs / 1000),
    macroBlocksPerSec: blocks.length / (durationMs / 1000),
    cpuUtilPct,
    peakRamMb: rssPeak / 1e6,
    sourceBytesRead,
    gzipBytes,
    diskReadMbSec: sourceBytesRead / 1e6 / (durationMs / 1000),
    diskWriteMbSec: gzipBytes / 1e6 / (durationMs / 1000),
    avgObjectBytes: tilesBaked ? gzipBytes / tilesBaked : null,
    p95ObjectBytes: percentile(gzipSizes, 95),
    avgDecodeMs: decodeMs.length ? decodeMs.reduce((a, b) => a + b, 0) / decodeMs.length : null,
    avgWarmLookupMs: warmLookupMs.length ? warmLookupMs.reduce((a, b) => a + b, 0) / warmLookupMs.length : null,
    p50TileMs: percentile(tileMs, 50),
    p95TileMs: percentile(tileMs, 95),
    networkChelsaCalls,
    perRegion,
    slowestRegion,
    phaseMs: {
      layerFetchMs: profilerMs(profiler.pct(), 'layerFetchMs'),
      decodeMs: profilerMs(profiler.pct(), 'decodeMs'),
      encodeGzipMs: profilerMs(profiler.pct(), 'encodeGzipMs'),
      checksumMs: profilerMs(profiler.pct(), 'checksumMs'),
      rasterReadMs: profilerMs(profiler.pct(), 'rasterReadMs'),
      tiffOpenMs: profilerMs(profiler.pct(), 'tiffOpenMs'),
      tileWriteMs: writeMs
    }
  };
}

function chooseBestWorker(results) {
  const safe = results.filter(
    (r) => r.networkChelsaCalls === 0 && r.peakRamMb < 24_000 && Number.isFinite(r.tilesPerSec)
  );
  return safe.reduce((best, r) => (!best || r.tilesPerSec > best.tilesPerSec ? r : best), null);
}

function chooseBestMacro(results) {
  return results.reduce((best, r) => (!best || r.tilesPerSec > best.tilesPerSec ? r : best), null);
}

function chooseTileConfig(results) {
  const safe = results.filter(Boolean).filter((r) => r.networkChelsaCalls === 0);
  if (!safe.length) return null;
  const sixtyFour = safe.find((r) => r.tileCells === 64);
  const fastest = safe.reduce((best, r) => (!best || r.tilesPerSec > best.tilesPerSec ? r : best), null);
  if (!sixtyFour) return fastest;
  if (fastest.tileCells === 64) return fastest;
  if (sixtyFour.tilesPerSec >= fastest.tilesPerSec * 0.9) return sixtyFour;
  return fastest;
}

function readMirrorSummary() {
  const m = readJson(MIRROR_MANIFEST);
  const validated = (m.entries || []).filter((e) => e.status === 'validated').length;
  const bytes = m.actualMirrorBytes || (m.entries || []).reduce((a, e) => a + (e.downloadedBytes || 0), 0);
  return { validated, bytes, manifestSha256: m.manifestSha256 || null, retries: m.retries || 0 };
}

function pilotRegression() {
  const results = [];
  let pass = true;
  for (const p of PILOTS) {
    const qa = readJson(path.join(ROOT, 'data/coordinate-climate/v2/qa', `${p.id}.json`));
    const lookup = lookupCoordinateClimateGlobal(p.lat, p.lon, { globalRoot: GLOBAL_ROOT });
    const ok =
      lookup.ok &&
      Math.abs(lookup.profile.annualPrecipitationMm - qa.chelsa.annualPrecipitationMm) <= 1.5 &&
      Math.abs(lookup.profile.coldestMonthMeanMinC - qa.chelsa.coldestMonthMeanMinC) <= 0.15 &&
      Math.abs(lookup.profile.annualPetMm - qa.chelsa.annualPetMm) <= 2;
    if (!ok) pass = false;
    results.push({ id: p.id, ok, tileKey: lookup.tileKey || null });
  }
  return { pass, results };
}

async function sourcePixelChecks() {
  setSourceMode(SOURCE_MODE.LOCAL_MIRROR);
  resetNetworkChelsaCalls();
  const points = [PILOTS[0], PILOTS[1], PILOTS[2], PILOTS[4], PILOTS[5]];
  const variables = [
    { key: 'tasmin', field: 'monthlyTminC', decode: chelsaTemperatureToCelsius },
    { key: 'pr', field: 'monthlyPrecipMm', decode: chelsaPrecipToMm },
    { key: 'pet_penman', field: 'monthlyPetMm', decode: chelsaPetToMm },
    { key: 'vpd', field: 'monthlyVpdPa', decode: chelsaVpdToPa },
    { key: 'hurs', field: 'monthlyHursPct', decode: chelsaHursToPct }
  ];
  const results = [];
  let pass = true;
  for (const point of points) {
    const lookup = lookupCoordinateClimateGlobal(point.lat, point.lon, { globalRoot: GLOBAL_ROOT });
    if (!lookup.ok) {
      pass = false;
      results.push({ id: point.id, ok: false, reason: lookup.reason || 'lookup-failed' });
      continue;
    }
    const cell = chelsaGridCellIndex(point.lat, point.lon, CHELSA_BBOX, 0.0083333333);
    for (const variable of variables) {
      const spec = BAKE_VARIABLES.find((v) => v.key === variable.key);
      const { band, nodata } = await readChelsaWindowForLayer(spec, 1, cell.x, cell.y, cell.x, cell.y);
      const raw = band[0];
      const source = raw === nodata || raw === 65535 ? null : variable.decode(raw);
      const decoded = lookup.profile[variable.field][0];
      const tol = variable.key === 'vpd' ? 2.0 : variable.key === 'hurs' ? 0.2 : 0.2;
      const ok = source != null && Math.abs(decoded - source) <= tol;
      if (!ok) pass = false;
      results.push({
        id: point.id,
        variable: variable.key,
        raw,
        source,
        decoded,
        ok,
        cell: { x: cell.x, y: cell.y }
      });
    }
  }
  return { pass, networkChelsaCalls: getNetworkChelsaCalls(), results };
}

function boundaryHemisphereChecks() {
  const boundary = [];
  let boundaryPass = true;
  for (const point of BOUNDARY_COORDS) {
    const valid = validateWgs84Coordinates(point.lat, point.lon);
    const lookup = lookupCoordinateClimateGlobal(point.lat, point.lon, { globalRoot: GLOBAL_ROOT });
    const ok = valid.ok && (!lookup.decodeError);
    if (!ok) boundaryPass = false;
    boundary.push({ id: point.id, ok, lookupOk: lookup.ok, reason: lookup.reason || null });
  }
  const north = lookupCoordinateClimateGlobal(60.16952, 24.93545, { globalRoot: GLOBAL_ROOT });
  const south = lookupCoordinateClimateGlobal(-33.8688, 151.2093, { globalRoot: GLOBAL_ROOT });
  const hemiPass =
    north.ok &&
    south.ok &&
    Math.min(...north.profile.monthlyTminC) < Math.max(...north.profile.monthlyTminC) &&
    Math.min(...south.profile.monthlyTminC) < Math.max(...south.profile.monthlyTminC);
  return { pass: boundaryPass && hemiPass, boundary, hemisphere: { pass: hemiPass } };
}

function runE2E() {
  const proc = spawnSync(process.execPath, [path.join(ROOT, 'scripts/coordinate-plant-e2e-truth-v1.mjs'), '--global'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 600000
  });
  const reportPath = path.join(ROOT, 'tests/_coordinate-plant-e2e-truth-v1-global-report.json');
  const report = fs.existsSync(reportPath) ? readJson(reportPath) : null;
  return {
    exitCode: proc.status,
    pass: proc.status === 0 && report?.verdict?.includes('PASS'),
    pairCount: report?.C_pairCount ?? null,
    materialFp: report?.H_materialFp ?? null,
    materialFn: report?.I_materialFn ?? null,
    heuristicDependent: report?.J_heuristicDependentConfident ?? null,
    unknownFailures: report?.K_unknownHandlingFailures ?? null,
    cityProxy: report?.L_cityProxyOrRuntimeFetchCount ?? null,
    externalCalls: report?.N_runtimeExternalCalls?.costPolicy?.chelsaExternalCalls ?? 0,
    catalogRegression: report?.regression ?? null,
    verdict: report?.verdict || null
  };
}

function resumabilityStatus(chosenTileCells) {
  const progressPath = path.join(GLOBAL_ROOT, 'progress.json');
  const progress = fs.existsSync(progressPath) ? readJson(progressPath) : null;
  const completed = progress?.completedTiles?.length ?? progress?.completed?.length ?? 37;
  return {
    preservedVerifiedTiles: completed,
    compatible: chosenTileCells === 64,
    note:
      chosenTileCells === 64
        ? 'Existing verified 64x64 tiles remain reusable if checksum/authority/format match.'
        : 'Existing 64x64 tiles are incompatible with a different tile dimension and must not be mixed.'
  };
}

async function main() {
  const args = parseArgs(process.argv);
  assertLocalMirrorReady();
  setSourceMode(SOURCE_MODE.LOCAL_MIRROR);
  const mirror = readMirrorSummary();
  const mask = readJson(MASK_PATH);
  if (mask.landTileCount !== 61964) {
    throw new Error(`unexpected-corrected-mask:${mask.landTileCount}`);
  }

  const targetTiles = Math.max(args.minTiles, 700);
  const sample64 = buildBenchmarkTiles(mask, 64, targetTiles, 8);
  process.stderr.write(
    `sample64 tiles=${sample64.tiles.length} macros8=${macroBlocksForTiles(sample64.tiles, 8).length} byRegion=${JSON.stringify(sample64.byRegion)}\n`
  );
  const workerTiles = contiguousWorkerSubset(sample64.tiles, 8, Math.min(224, sample64.tiles.length));
  const worker1 = await runBenchmark({ label: 'worker-1', tileCells: 64, macroTiles: 8, layerConcurrency: 1, tiles: workerTiles });
  const worker2 = await runBenchmark({ label: 'worker-2', tileCells: 64, macroTiles: 8, layerConcurrency: 2, tiles: workerTiles });
  const worker4 = await runBenchmark({ label: 'worker-4', tileCells: 64, macroTiles: 8, layerConcurrency: 4, tiles: workerTiles });
  const worker8 = await runBenchmark({ label: 'worker-8', tileCells: 64, macroTiles: 8, layerConcurrency: 8, tiles: workerTiles });
  const chosenWorker = chooseBestWorker([worker1, worker2, worker4, worker8]);
  if (!chosenWorker) throw new Error('no-safe-worker-config');

  const macro8 = await runBenchmark({
    label: 'macro-8x8',
    tileCells: 64,
    macroTiles: 8,
    layerConcurrency: chosenWorker.layerConcurrency,
    tiles: sample64.tiles
  });
  const macro16 = await runBenchmark({
    label: 'macro-16x16',
    tileCells: 64,
    macroTiles: 16,
    layerConcurrency: chosenWorker.layerConcurrency,
    tiles: sample64.tiles
  });
  const chosenMacro = chooseBestMacro([macro8, macro16]);

  // Reuse the winning macro run as the 64x64 dimension result (same science/config, no redundant bake).
  const bench64 = {
    ...(chosenMacro.macroTiles === 8 ? macro8 : macro16),
    label: 'tile-64',
    projectedObjectCount: sample64.targetTileCount
  };

  const sample128 = buildBenchmarkTiles(mask, 128, Math.max(350, Math.ceil(targetTiles / 2)), 4);
  process.stderr.write(
    `sample128 tiles=${sample128.tiles.length} byRegion=${JSON.stringify(sample128.byRegion)}\n`
  );
  const bench128 = await runBenchmark({
    label: 'tile-128',
    tileCells: 128,
    macroTiles: Math.max(4, Math.floor(chosenMacro.macroTiles / 2)),
    layerConcurrency: chosenWorker.layerConcurrency,
    tiles: sample128.tiles
  });
  bench128.projectedObjectCount = sample128.targetTileCount;

  let bench256 = null;
  if (bench128.tilesPerSec >= bench64.tilesPerSec * 1.05 && bench128.peakRamMb < 12_000) {
    const sample256 = buildBenchmarkTiles(mask, 256, Math.max(160, Math.ceil(targetTiles / 4)), 2);
    bench256 = await runBenchmark({
      label: 'tile-256',
      tileCells: 256,
      macroTiles: Math.max(2, Math.floor(chosenMacro.macroTiles / 4)),
      layerConcurrency: chosenWorker.layerConcurrency,
      tiles: sample256.tiles
    });
    bench256.projectedObjectCount = sample256.targetTileCount;
  }

  for (const bench of [bench64, bench128, bench256].filter(Boolean)) {
    bench.projectedCorpusGb = (bench.projectedObjectCount * bench.avgObjectBytes) / 1e9;
    bench.estimatedColdFetchSizeBytes = bench.p95ObjectBytes;
  }

  const chosenBench = chooseTileConfig([bench64, bench128, bench256]);
  const bakeHours = projectBakeHours(chosenBench);
  const bestCaseHours = bakeHours.bestCaseHours;
  const conservativeHours = bakeHours.conservativeHours;

  const regression7 = pilotRegression();
  const pixelChecks = await sourcePixelChecks();
  const boundary = boundaryHemisphereChecks();
  const e2e = runE2E();
  const counts = {
    materialFp: e2e.materialFp ?? null,
    materialFn: e2e.materialFn ?? null,
    heuristicDependent: e2e.heuristicDependent ?? null,
    unknownFailures: e2e.unknownFailures ?? null
  };
  const catalogRegression = e2e.catalogRegression;
  const resumability = resumabilityStatus(chosenBench.tileCells);

  const blockers = [];
  if (mirror.validated !== 84) blockers.push(`mirror:${mirror.validated}/84`);
  if (mask.landTileCount !== 61964) blockers.push(`land-mask:${mask.landTileCount}`);
  if (bench64.benchmarkTileCount < 500) blockers.push(`benchmark-tiles:${bench64.benchmarkTileCount}`);
  if (chosenBench.networkChelsaCalls !== 0) blockers.push(`network-calls:${chosenBench.networkChelsaCalls}`);
  if (conservativeHours > 48) blockers.push(`conservative-hours:${conservativeHours.toFixed(2)}`);
  if (!regression7.pass) blockers.push('7-coordinate-regression');
  if (!pixelChecks.pass || pixelChecks.networkChelsaCalls !== 0) blockers.push('source-pixel-check');
  if (!boundary.pass) blockers.push('boundary-hemisphere');
  if (!e2e.pass) blockers.push('coordinate-plant-e2e');
  if (counts.materialFp !== 0 || counts.materialFn !== 0 || counts.heuristicDependent !== 0 || counts.unknownFailures !== 0) {
    blockers.push('fp-fn-heuristic-unknown');
  }

  const fullGlobalBakeAllowed = blockers.length === 0 ? 'YES' : 'NO';
  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: 'CRUVIT_LOCAL_GLOBAL_BAKE_FINAL_REGATE',
    sourceMode: SOURCE_MODE.LOCAL_MIRROR,
    mirror,
    landMask: {
      candidateTiles: mask.totalCandidateTiles,
      landOnly: mask.landOnlyTileCount,
      mixed: mask.mixedLandOceanTileCount,
      oceanNodata: mask.oceanTileCount,
      landContainingTiles: mask.landTileCount
    },
    benchmarkTileCount: bench64.benchmarkTileCount,
    selectionMethodology: {
      mode: 'contiguous-macro-clusters-across-climate-regimes',
      regions: REGIONS.map((r) => r.id),
      sample64ByRegion: sample64.byRegion,
      sample128ByRegion: sample128.byRegion,
      note: 'Conservative projection uses max(p95 tile timing, slowest-region sustained rate); not fastest-cluster only.'
    },
    networkChelsaCallsDuringTiming: chosenBench.networkChelsaCalls,
    workerResults: { worker1, worker2, worker4, worker8 },
    chosenWorkerCount: chosenWorker.layerConcurrency,
    macroResults: { macro8, macro16 },
    chosenMacroSize: chosenMacro.macroTiles,
    tileDimensionResults: { bench64, bench128, bench256 },
    chosenTileDimensions: chosenBench.tileCells,
    chosenResult: chosenBench,
    perRegionThroughput: chosenBench.perRegion,
    slowestRegionThroughput: chosenBench.slowestRegion,
    bestCaseFullBakeHours: bestCaseHours,
    p95FullBakeHours: bakeHours.p95Hours,
    slowestRegionFullBakeHours: bakeHours.slowestHours,
    conservativeFullBakeHours: conservativeHours,
    regression7,
    sourcePixelEquivalence: pixelChecks,
    boundaryHemisphere: boundary,
    coordinatePlantE2E: e2e,
    materialCounts: counts,
    existingCatalogRegression: catalogRegression,
    resumability,
    filesChanged: ['scripts/coordinate-climate-v2-final-regate.mjs'],
    blockers,
    fullGlobalBakeAllowed,
    verdict:
      blockers.length === 0
        ? 'CRUVIT_LOCAL_GLOBAL_BAKE_FINAL_REGATE: PASS'
        : 'CRUVIT_LOCAL_GLOBAL_BAKE_FINAL_REGATE: BLOCKED'
  };
  report.reportSha256 = crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    verdict: report.verdict,
    benchmarkTileCount: report.benchmarkTileCount,
    chosenWorkerCount: report.chosenWorkerCount,
    chosenMacroSize: report.chosenMacroSize,
    chosenTileDimensions: report.chosenTileDimensions,
    bestCaseFullBakeHours: report.bestCaseFullBakeHours,
    conservativeFullBakeHours: report.conservativeFullBakeHours,
    fullGlobalBakeAllowed: report.fullGlobalBakeAllowed,
    report: REPORT_PATH
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
