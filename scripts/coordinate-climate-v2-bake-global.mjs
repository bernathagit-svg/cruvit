#!/usr/bin/env node
/**
 * CRUVIT Global Coordinate Climate Coverage V1 — central bake runner.
 *
 * Deterministic tile-by-tile global CHELSA bake → cruvit-cctb-int16-gzip-v1 tiles.
 * Resumable. Never invoked from user runtime paths.
 *
 * Usage:
 *   node scripts/coordinate-climate-v2-bake-global.mjs --priority-only
 *   node scripts/coordinate-climate-v2-bake-global.mjs --max-tiles 100
 *   node scripts/coordinate-climate-v2-bake-global.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  CHELSA_V21_BASELINE,
  TERRAIN_LAYER_POLICY_V2,
  COORDINATE_CLIMATE_AUTHORITY_V2_VERSION
} from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import {
  CHELSA_WIDTH,
  CHELSA_HEIGHT,
  COVERAGE_TILE_CELLS,
  COVERAGE_FORMAT_BINARY,
  COVERAGE_TILE_SCHEMA_VERSION,
  cellCenterLatLon,
  coverageTileIndexFromLatLon,
  coverageTileIndexFromCell,
  deriveCellEnumsFromSeries,
  encodeBinaryCoverageTile,
  tileFileNameFromKey
} from '../modules/personal-domain/coordinate-climate-coverage-tiles-v2.js';
import { GLOBAL_BAKE_ID_DEFAULT, GLOBAL_PACK_ID } from '../modules/personal-domain/coordinate-climate-global-lookup-v2.js';
import {
  BAKE_MONTHS,
  BAKE_VARIABLES,
  DEFAULT_MAX_CONCURRENCY,
  mapPool,
  readChelsaWindow,
  sampleElevation,
  variableFieldName,
  isCellLand,
  isTileAllNodata,
  chelsaUrl
} from './coordinate-climate-v2-bake-shared.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const GLOBAL_ROOT = path.join(ROOT, 'data', 'coordinate-climate', 'v2', 'coverage', GLOBAL_PACK_ID);

/** Pilot + validation priority coordinates (exact lat/lon). */
const PRIORITY_COORDS = [
  { id: 'yehiam', lat: 33.12806, lon: 35.22028 },
  { id: 'helsinki', lat: 60.16952, lon: 24.93545 },
  { id: 'singapore', lat: 1.28967, lon: 103.85007 },
  { id: 'kochi', lat: 9.93988, lon: 76.26022 },
  { id: 'cairo', lat: 30.06263, lon: 31.24967 },
  { id: 'tokyo', lat: 35.6895, lon: 139.69171 },
  { id: 'quito', lat: -0.22985, lon: -78.52495 },
  { id: 'nyc', lat: 40.7128, lon: -74.006 },
  { id: 'sao-paulo', lat: -23.5505, lon: -46.6333 },
  { id: 'london', lat: 51.5074, lon: -0.1278 },
  { id: 'nairobi', lat: -1.2921, lon: 36.8219 },
  { id: 'sydney', lat: -33.8688, lon: 151.2093 },
  { id: 'atacama', lat: -24.5, lon: -69.25 },
  { id: 'mediterranean', lat: 36.7213, lon: -4.4214 },
  { id: 'chicago', lat: 41.8781, lon: -87.6298 },
  { id: 'patagonia', lat: -50.3421, lon: -72.2672 }
];

const MAX_TX = Math.floor((CHELSA_WIDTH - 1) / COVERAGE_TILE_CELLS);
const MAX_TY = Math.floor((CHELSA_HEIGHT - 1) / COVERAGE_TILE_CELLS);

function parseArgs(argv) {
  const out = {
    priorityOnly: false,
    skipTerrain: false,
    maxTiles: 0,
    concurrency: DEFAULT_MAX_CONCURRENCY,
    globalBakeId: GLOBAL_BAKE_ID_DEFAULT
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--priority-only') out.priorityOnly = true;
    if (argv[i] === '--skip-terrain') out.skipTerrain = true;
    if (argv[i] === '--max-tiles') out.maxTiles = Number(argv[++i]) || 0;
    if (argv[i] === '--concurrency') out.concurrency = Number(argv[++i]) || DEFAULT_MAX_CONCURRENCY;
    if (argv[i] === '--bake-id') out.globalBakeId = argv[++i];
  }
  return out;
}

function tileWindow(tx, ty) {
  const x0 = tx * COVERAGE_TILE_CELLS;
  const y0 = ty * COVERAGE_TILE_CELLS;
  const x1 = Math.min(CHELSA_WIDTH - 1, x0 + COVERAGE_TILE_CELLS - 1);
  const y1 = Math.min(CHELSA_HEIGHT - 1, y0 + COVERAGE_TILE_CELLS - 1);
  return { x0, x1, y0, y1, tx, ty };
}

function cellListForWindow(win) {
  const cells = [];
  for (let y = win.y0; y <= win.y1; y++) {
    for (let x = win.x0; x <= win.x1; x++) {
      cells.push({ x, y });
    }
  }
  return cells;
}

function priorityTileKeys() {
  const keys = new Set();
  for (const c of PRIORITY_COORDS) {
    const tip = coverageTileIndexFromLatLon(c.lat, c.lon);
    if (tip) keys.add(`${tip.tx}:${tip.ty}`);
  }
  return [...keys].map((k) => {
    const [tx, ty] = k.split(':').map(Number);
    return { tx, ty };
  });
}

function allTileCoords() {
  const out = [];
  for (let ty = 0; ty <= MAX_TY; ty++) {
    for (let tx = 0; tx <= MAX_TX; tx++) {
      out.push({ tx, ty });
    }
  }
  return out;
}

function loadProgress(progressPath, globalBakeId) {
  if (fs.existsSync(progressPath)) {
    return JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  }
  return {
    globalBakeId,
    phase: 'baking',
    completedTiles: [],
    skippedOceanTiles: [],
    startedAt: new Date().toISOString(),
    stats: {
      landTiles: 0,
      oceanTilesSkipped: 0,
      validCells: 0,
      totalGzipBytes: 0
    }
  };
}

function writeManifest(globalRoot, progress, globalBakeId, tileChecksums) {
  const manifestBody = {
    kind: 'cruvit-climate-global-manifest-v1',
    globalBakeId,
    packId: GLOBAL_PACK_ID,
    authorityVersion: COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
    format: COVERAGE_FORMAT_BINARY,
    schemaVersion: COVERAGE_TILE_SCHEMA_VERSION,
    sourceClimatology: CHELSA_V21_BASELINE.id,
    sourceClimatologyVersion: CHELSA_V21_BASELINE.version,
    sourcePeriod: CHELSA_V21_BASELINE.period,
    coverageDefinition:
      'All valid terrestrial CHELSA 30 arc-sec cells within global bbox; open-ocean / nodata-only tiles omitted',
    lookupModel: 'O(1) deterministic chelsa30s-t64:{tx}:{ty} from WGS84 lat/lon — no tile search loop',
    tileGeometry: {
      tileCells: COVERAGE_TILE_CELLS,
      chelsaResDeg: 0.0083333333,
      chelsaWidth: CHELSA_WIDTH,
      chelsaHeight: CHELSA_HEIGHT,
      maxTx: MAX_TX,
      maxTy: MAX_TY
    },
    climateNativeResolution: '~1 km (CHELSA 30 arc-seconds)',
    terrainNativeResolution: '~30 m class where sampled at bake (NOT climate)',
    sourceVersions: {
      chelsa: CHELSA_V21_BASELINE.id,
      petScale: 'raw/100',
      vpdScale: 'raw×0.1',
      terrain: TERRAIN_LAYER_POLICY_V2.preferredOpenOption
    },
    stats: progress.stats,
    tileCount: progress.stats.landTiles,
    checksums: tileChecksums,
    runtimeExternalAcquisitionForbidden: true,
    objectStorage: {
      prepared: true,
      uploaded: false,
      preferredBackend: 'cloudflare-r2'
    },
    generatedAt: new Date().toISOString(),
    buildCodeVersion: 'coordinate-climate-v2-bake-global.mjs'
  };
  const manifestPath = path.join(globalRoot, 'manifest.json');
  const raw = JSON.stringify(manifestBody, null, 2) + '\n';
  const sha = crypto.createHash('sha256').update(raw).digest('hex');
  manifestBody.manifestSha256 = sha;
  fs.writeFileSync(manifestPath, JSON.stringify({ ...manifestBody, manifestSha256: sha }, null, 2) + '\n');
  fs.writeFileSync(
    path.join(globalRoot, 'global-index.json'),
    JSON.stringify(
      {
        kind: 'cruvit-climate-global-index-v1',
        globalBakeId,
        authorityVersion: COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
        lookup: 'coverageTileIndexFromLatLon → tiles/{tileKey}.cctb.gz',
        tileFilePattern: 'chelsa30s-t64_{tx}_{ty}.cctb.gz',
        manifestSha256: sha,
        generatedAt: new Date().toISOString()
      },
      null,
      2
    ) + '\n'
  );
  return sha;
}

async function bakeTile({ tx, ty, globalRoot, globalBakeId, skipTerrain, layerCacheRoot }) {
  const win = tileWindow(tx, ty);
  const cellList = cellListForWindow(win);
  const tileKey = `chelsa30s-t${COVERAGE_TILE_CELLS}:${tx}:${ty}`;
  const series = new Map();
  for (const { x, y } of cellList) {
    series.set(`${x}:${y}`, {
      x,
      y,
      tmin: Array(12).fill(null),
      tmean: Array(12).fill(null),
      tmax: Array(12).fill(null),
      pr: Array(12).fill(null),
      pet: Array(12).fill(null),
      vpd: Array(12).fill(null),
      hurs: Array(12).fill(null),
      elev: null
    });
  }

  const tileCacheDir = path.join(layerCacheRoot, `t${tx}_${ty}`);
  fs.mkdirSync(tileCacheDir, { recursive: true });

  for (const v of BAKE_VARIABLES) {
    for (const month of BAKE_MONTHS) {
      const id = `${v.key}-${month}`;
      const cacheFile = path.join(tileCacheDir, `${id}.json`);
      let payload;
      if (fs.existsSync(cacheFile)) {
        payload = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      } else {
        const url = chelsaUrl(v, month);
        const { band, width, height, nodata } = await readChelsaWindow(
          url,
          win.x0,
          win.y0,
          win.x1,
          win.y1
        );
        const values = [];
        for (let i = 0; i < band.length; i++) {
          const raw = band[i];
          if (raw === nodata || raw === 65535 || !Number.isFinite(Number(raw))) values.push(null);
          else values.push(v.decode(raw));
        }
        payload = { width, height, values };
        fs.writeFileSync(cacheFile, JSON.stringify(payload));
      }
      const field = variableFieldName(v);
      const mi = month - 1;
      for (const { x, y } of cellList) {
        const lx = x - win.x0;
        const ly = y - win.y0;
        const idx = ly * payload.width + lx;
        series.get(`${x}:${y}`)[field][mi] = payload.values[idx];
      }
    }
  }

  if (isTileAllNodata([...series.values()])) {
    return { skipped: true, reason: 'ocean-nodata', tileKey };
  }

  if (!skipTerrain) {
    for (const cell of series.values()) {
      if (!isCellLand(cell)) continue;
      const { lat, lon } = cellCenterLatLon(cell.x, cell.y);
      try {
        cell.elev = await sampleElevation(lat, lon, 12);
      } catch {
        // elevation optional
      }
    }
  }

  const packedCells = [];
  for (const cell of series.values()) {
    if (!isCellLand(cell)) continue;
    const derived = deriveCellEnumsFromSeries(cell);
    packedCells.push({
      x: cell.x,
      y: cell.y,
      ...cellCenterLatLon(cell.x, cell.y),
      elev: cell.elev,
      tmin: cell.tmin,
      tmean: cell.tmean,
      tmax: cell.tmax,
      pr: cell.pr,
      pet: cell.pet,
      vpd: cell.vpd,
      hurs: cell.hurs,
      ...derived
    });
  }

  if (packedCells.length === 0) {
    return { skipped: true, reason: 'no-land-cells', tileKey };
  }

  const encoded = encodeBinaryCoverageTile({
    tileKey,
    tx,
    ty,
    cells: packedCells,
    bakeVersion: globalBakeId,
    regionId: GLOBAL_PACK_ID
  });
  const tilesDir = path.join(globalRoot, 'tiles');
  fs.mkdirSync(tilesDir, { recursive: true });
  const fileName = tileFileNameFromKey(tileKey);
  const filePath = path.join(tilesDir, fileName);
  fs.writeFileSync(filePath, encoded.buffer);
  const sha = crypto.createHash('sha256').update(encoded.buffer).digest('hex');
  return {
    skipped: false,
    tileKey,
    fileName,
    cellCount: packedCells.length,
    gzipBytes: encoded.gzipBytes,
    sha256: sha
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const started = Date.now();
  const tilesDir = path.join(GLOBAL_ROOT, 'tiles');
  const progressPath = path.join(GLOBAL_ROOT, 'progress.json');
  const checksumPath = path.join(GLOBAL_ROOT, 'tile-checksums.json');
  fs.mkdirSync(GLOBAL_ROOT, { recursive: true });
  fs.mkdirSync(tilesDir, { recursive: true });

  let tileCoords = args.priorityOnly ? priorityTileKeys() : allTileCoords();
  if (args.maxTiles > 0) tileCoords = tileCoords.slice(0, args.maxTiles);

  const progress = loadProgress(progressPath, args.globalBakeId);
  const completed = new Set(progress.completedTiles || []);
  const checksums = fs.existsSync(checksumPath)
    ? JSON.parse(fs.readFileSync(checksumPath, 'utf8'))
    : {};

  const pending = tileCoords.filter(({ tx, ty }) => !completed.has(`${tx}:${ty}`));
  console.log(
    JSON.stringify({
      globalBakeId: args.globalBakeId,
      totalCandidateTiles: tileCoords.length,
      pending: pending.length,
      alreadyCompleted: completed.size,
      maxTx: MAX_TX,
      maxTy: MAX_TY,
      priorityOnly: args.priorityOnly
    })
  );

  let baked = 0;
  for (const { tx, ty } of pending) {
    const key = `${tx}:${ty}`;
    try {
      const result = await bakeTile({
        tx,
        ty,
        globalRoot: GLOBAL_ROOT,
        globalBakeId: args.globalBakeId,
        skipTerrain: args.skipTerrain,
        layerCacheRoot: path.join(GLOBAL_ROOT, '_layer-cache')
      });
      if (result.skipped) {
        progress.skippedOceanTiles.push(key);
        progress.stats.oceanTilesSkipped += 1;
      } else {
        completed.add(key);
        progress.completedTiles.push(key);
        checksums[result.fileName] = result.sha256;
        progress.stats.landTiles += 1;
        progress.stats.validCells += result.cellCount;
        progress.stats.totalGzipBytes += result.gzipBytes;
        baked += 1;
        console.log(`BAKED ${result.tileKey} cells=${result.cellCount} gzip=${result.gzipBytes}`);
      }
      progress.updatedAt = new Date().toISOString();
      fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
      fs.writeFileSync(checksumPath, JSON.stringify(checksums, null, 2));
      if (baked % 5 === 0) writeManifest(GLOBAL_ROOT, progress, args.globalBakeId, checksums);
    } catch (err) {
      console.error(`FAIL tile ${key}:`, err.message);
      progress.lastError = { key, message: String(err.message), at: new Date().toISOString() };
      fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
      throw err;
    }
  }

  progress.phase = pending.length === 0 ? 'done' : 'partial';
  progress.finishedAt = new Date().toISOString();
  progress.durationMs = Date.now() - started;
  const manifestSha = writeManifest(GLOBAL_ROOT, progress, args.globalBakeId, checksums);
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));

  console.log(
    JSON.stringify(
      {
        verdict: 'GLOBAL_BAKE_PHASE_COMPLETE',
        bakedThisRun: baked,
        landTiles: progress.stats.landTiles,
        validCells: progress.stats.validCells,
        totalGzipBytes: progress.stats.totalGzipBytes,
        manifestSha256: manifestSha,
        durationMs: progress.durationMs
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
