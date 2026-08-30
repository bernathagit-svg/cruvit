#!/usr/bin/env node
/**
 * Central regional climate bake runner (NOT user runtime).
 *
 * - Deterministic bbox → CHELSA cell window reads (bounded concurrency)
 * - Resumable / idempotent via progress.json
 * - Writes binary coverage tiles + versioned manifest + checksums
 *
 * Usage:
 *   node scripts/coordinate-climate-v2-bake-region.mjs
 *   node scripts/coordinate-climate-v2-bake-region.mjs --region emed-n-israel-v1
 *
 * Never invoke from ordinary user request paths.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { fromUrl } from 'geotiff';
import {
  CHELSA_V21_BASELINE,
  TERRAIN_LAYER_POLICY_V2,
  chelsaTemperatureToCelsius,
  chelsaPrecipToMm,
  chelsaVpdToPa,
  chelsaHursToPct,
  chelsaPetToMm
} from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import {
  cellsInBbox,
  cellCenterLatLon,
  coverageTileIndexFromCell,
  deriveCellEnumsFromSeries,
  packBinaryClimateCell,
  encodeBinaryCoverageTile,
  buildCoverageManifest,
  COVERAGE_TILE_CELLS,
  COVERAGE_FORMAT_BINARY,
  COVERAGE_TILE_SCHEMA_VERSION,
  CHELSA_BBOX,
  CHELSA_RES_DEG
} from '../modules/personal-domain/coordinate-climate-coverage-tiles-v2.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const COVERAGE_ROOT = path.join(ROOT, 'data', 'coordinate-climate', 'v2', 'coverage');

/** First real regional pack: N Israel + Galilee / Carmel / Upper Jordan margin. */
export const REGIONS = {
  'emed-n-israel-v1': {
    regionId: 'emed-n-israel-v1',
    label: 'Northern Israel / Eastern Mediterranean coastal–highland transect',
    // Inclusive WGS84 bounds — coast, mountains, inland valleys (Yehiam inside).
    bounds: { south: 32.45, north: 33.25, west: 34.85, east: 35.65 },
    why:
      'Meaningful multi-climate Eastern Med pack (coast→highland→inland) including Yehiam validation zone; denser than city pilots; not full planet.'
  }
};

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const VARIABLES = [
  { key: 'tasmin', decode: chelsaTemperatureToCelsius },
  { key: 'tas', decode: chelsaTemperatureToCelsius },
  { key: 'tasmax', decode: chelsaTemperatureToCelsius },
  { key: 'pr', decode: chelsaPrecipToMm },
  { key: 'pet_penman', folder: 'pet', filePrefix: 'CHELSA_pet_penman', decode: chelsaPetToMm },
  { key: 'vpd', decode: chelsaVpdToPa },
  { key: 'hurs', decode: chelsaHursToPct }
];

const BAKE_VERSION = 'bake-2026-08-30-emed-n-israel-v1';
const MAX_CONCURRENCY = 2;
const MAX_ATTEMPTS = 6;

function chelsaUrl(variableSpec, month) {
  const mm = String(month).padStart(2, '0');
  const folder = variableSpec.folder || variableSpec.key;
  const prefix = variableSpec.filePrefix || `CHELSA_${variableSpec.key}`;
  return `${CHELSA_V21_BASELINE.baseUrl}/${folder}/${prefix}_${mm}_1981-2010_V.2.1.tif`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withBackoff(fn, label) {
  let last;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const msg = String(err?.message || err);
      const retryable = /429|timeout|ECONN|ENOTFOUND|fetch|503|502|network/i.test(msg);
      if (!retryable || attempt === MAX_ATTEMPTS) throw err;
      const wait = Math.min(60_000, 1500 * 2 ** (attempt - 1));
      console.warn(`  retry ${label} attempt=${attempt} wait=${wait}ms (${msg.slice(0, 120)})`);
      await sleep(wait);
    }
  }
  throw last;
}

async function mapPool(items, concurrency, worker) {
  const out = new Array(items.length);
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return out;
}

async function readChelsaWindow(url, x0, y0, x1, y1) {
  return withBackoff(async () => {
    const tiff = await fromUrl(url);
    const image = await tiff.getImage();
    const width = x1 - x0 + 1;
    const height = y1 - y0 + 1;
    const data = await image.readRasters({
      window: [x0, y0, x1 + 1, y1 + 1],
      width,
      height,
      resampleMethod: 'nearest'
    });
    const band = data[0];
    const nodata = Number(image.getGDALNoData?.() ?? 65535);
    return { band, width, height, nodata };
  }, url.split('/').pop());
}

function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y, z };
}

function decodePngRgba(buf) {
  if (buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  const idats = [];
  while (offset + 8 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
    offset += 12 + len;
  }
  if (!width || !height || bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) return null;
  const inflated = inflateSync(Buffer.concat(idats));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const rgba = Buffer.alloc(width * height * 4);
  let inPos = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = inflated[inPos++];
    const row = inflated.subarray(inPos, inPos + stride);
    inPos += stride;
    const recon = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const x = row[i];
      const a = i >= bpp ? recon[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let val = x;
      if (filter === 1) val = (x + a) & 255;
      else if (filter === 2) val = (x + b) & 255;
      else if (filter === 3) val = (x + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        val = (x + pr) & 255;
      }
      recon[i] = val;
    }
    for (let x = 0; x < width; x++) {
      const si = x * bpp;
      const di = (y * width + x) * 4;
      rgba[di] = recon[si];
      rgba[di + 1] = recon[si + 1];
      rgba[di + 2] = recon[si + 2];
      rgba[di + 3] = bpp === 4 ? recon[si + 3] : 255;
    }
    prev = recon;
  }
  return { width, height, rgba };
}

const terrariumCache = new Map();

async function sampleElevation(lat, lon, z = 12) {
  const tile = lonLatToTile(lon, lat, z);
  const key = `${z}/${tile.x}/${tile.y}`;
  let png = terrariumCache.get(key);
  if (!png) {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tile.x}/${tile.y}.png`;
    png = await withBackoff(async () => {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'CruvitCoordinateClimateV2-Bake/0.1' },
        signal: AbortSignal.timeout(30000)
      });
      if (!res.ok) throw new Error(`terrarium-${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    }, key);
    terrariumCache.set(key, png);
  }
  const decoded = decodePngRgba(png);
  if (!decoded) return null;
  const n = 2 ** z;
  const xTile = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yTile = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const px = Math.min(decoded.width - 1, Math.max(0, Math.floor((xTile - tile.x) * decoded.width)));
  const py = Math.min(decoded.height - 1, Math.max(0, Math.floor((yTile - tile.y) * decoded.height)));
  const i = (py * decoded.width + px) * 4;
  const r = decoded.rgba[i];
  const g = decoded.rgba[i + 1];
  const b = decoded.rgba[i + 2];
  const elev = r * 256 + g + b / 256 - 32768;
  return Math.round(elev * 10) / 10;
}

function parseArgs(argv) {
  const out = { region: 'emed-n-israel-v1', skipTerrain: false, maxCells: 0, repackFromCache: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--region') out.region = argv[++i];
    if (argv[i] === '--skip-terrain') out.skipTerrain = true;
    if (argv[i] === '--max-cells') out.maxCells = Number(argv[++i]) || 0;
    if (argv[i] === '--repack-from-cache') out.repackFromCache = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const region = REGIONS[args.region];
  if (!region) {
    console.error('Unknown region', args.region);
    process.exit(1);
  }

  const outDir = path.join(COVERAGE_ROOT, region.regionId);
  const tilesDir = path.join(outDir, 'tiles');
  const progressPath = path.join(outDir, 'progress.json');
  fs.mkdirSync(tilesDir, { recursive: true });

  const win = cellsInBbox(region.bounds.south, region.bounds.north, region.bounds.west, region.bounds.east);
  console.log('Region', region.regionId, region.bounds);
  console.log('Window', win);

  let cellList = [];
  for (let y = win.y0; y <= win.y1; y++) {
    for (let x = win.x0; x <= win.x1; x++) {
      cellList.push({ x, y });
    }
  }
  if (args.maxCells > 0 && cellList.length > args.maxCells) {
    // Deterministic subsample on a grid for bounded first proof runs
    const step = Math.ceil(Math.sqrt(cellList.length / args.maxCells));
    cellList = cellList.filter((c, idx) => {
      const lx = c.x - win.x0;
      const ly = c.y - win.y0;
      return lx % step === 0 && ly % step === 0;
    });
    console.log(`Subsampled to ${cellList.length} cells (step=${step}) for --max-cells=${args.maxCells}`);
  }

  const progress = fs.existsSync(progressPath)
    ? JSON.parse(fs.readFileSync(progressPath, 'utf8'))
    : {
        regionId: region.regionId,
        bakeVersion: BAKE_VERSION,
        phase: 'chelsa',
        completedLayers: [],
        startedAt: new Date().toISOString()
      };

  // Allocate series arrays: Map cellKey → {tmin:[],...}
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

  const jobs = [];
  for (const v of VARIABLES) {
    for (const month of MONTHS) {
      const id = `${v.key}-${month}`;
      if (progress.completedLayers.includes(id) && progress.layerCache?.[id]) {
        // resume from cached decoded window path if present
        continue;
      }
      jobs.push({ v, month, id });
    }
  }

  console.log(`CHELSA window jobs remaining: ${jobs.length} (concurrency=${MAX_CONCURRENCY})`);

  const layerCacheDir = path.join(outDir, '_layer-cache');
  fs.mkdirSync(layerCacheDir, { recursive: true });

  if (args.repackFromCache) {
    // Load all layers from cache into series (no CHELSA network).
    for (const v of VARIABLES) {
      for (const month of MONTHS) {
        const id = `${v.key}-${month}`;
        const cacheFile = path.join(layerCacheDir, `${id}.json`);
        if (!fs.existsSync(cacheFile)) throw new Error(`missing-layer-cache:${id}`);
        const payload = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        const field =
          v.key === 'tasmin'
            ? 'tmin'
            : v.key === 'tas'
              ? 'tmean'
              : v.key === 'tasmax'
                ? 'tmax'
                : v.key === 'pet_penman'
                  ? 'pet'
                  : v.key;
        const mi = month - 1;
        for (const { x, y } of cellList) {
          const lx = x - win.x0;
          const ly = y - win.y0;
          const idx = ly * payload.width + lx;
          const cell = series.get(`${x}:${y}`);
          if (cell) cell[field][mi] = payload.values[idx];
        }
      }
    }
    console.log('Loaded CHELSA series from layer cache');
  } else {
  await mapPool(jobs, MAX_CONCURRENCY, async ({ v, month, id }) => {
    const cacheFile = path.join(layerCacheDir, `${id}.json`);
    let payload;
    if (fs.existsSync(cacheFile)) {
      payload = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      console.log('  cache-hit', id);
    } else {
      const url = chelsaUrl(v, month);
      console.log('  fetch', id);
      const { band, width, height, nodata } = await readChelsaWindow(url, win.x0, win.y0, win.x1, win.y1);
      const values = [];
      for (let i = 0; i < band.length; i++) {
        const raw = band[i];
        if (raw === nodata || raw === 65535 || !Number.isFinite(Number(raw))) values.push(null);
        else values.push(v.decode(raw));
      }
      payload = { width, height, values };
      fs.writeFileSync(cacheFile, JSON.stringify(payload));
    }

    const field =
      v.key === 'tasmin'
        ? 'tmin'
        : v.key === 'tas'
          ? 'tmean'
          : v.key === 'tasmax'
            ? 'tmax'
            : v.key === 'pet_penman'
              ? 'pet'
              : v.key;
    const mi = month - 1;
    for (const { x, y } of cellList) {
      const lx = x - win.x0;
      const ly = y - win.y0;
      const idx = ly * payload.width + lx;
      const cell = series.get(`${x}:${y}`);
      if (cell) cell[field][mi] = payload.values[idx];
    }
    if (!progress.completedLayers.includes(id)) progress.completedLayers.push(id);
    progress.updatedAt = new Date().toISOString();
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
  });
  } // end else !repackFromCache

  if (!args.skipTerrain) {
    console.log('Sampling terrain (terrarium z=12, cached tiles)...');
    let n = 0;
    for (const { x, y } of cellList) {
      const { lat, lon } = cellCenterLatLon(x, y);
      try {
        series.get(`${x}:${y}`).elev = await sampleElevation(lat, lon, 12);
      } catch (err) {
        console.warn('  elev fail', x, y, err.message);
      }
      n++;
      if (n % 500 === 0) console.log(`  elev ${n}/${cellList.length}`);
    }
  }

  // Pack cells into coverage tiles
  const tileBuckets = new Map();
  for (const cell of series.values()) {
    const derived = deriveCellEnumsFromSeries(cell);
    const packed = {
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
    };
    const tip = coverageTileIndexFromCell(cell.x, cell.y);
    if (!tileBuckets.has(tip.tileKey)) tileBuckets.set(tip.tileKey, { ...tip, cells: [] });
    tileBuckets.get(tip.tileKey).cells.push(packed);
  }

  const tileMetas = [];
  const checksums = {};
  for (const [tileKey, bucket] of tileBuckets) {
    const encoded = encodeBinaryCoverageTile({
      tileKey,
      tx: bucket.tx,
      ty: bucket.ty,
      cells: bucket.cells,
      bakeVersion: BAKE_VERSION,
      regionId: region.regionId
    });
    const fileName = `${tileKey.replace(/:/g, '_')}.cctb.gz`;
    const filePath = path.join(tilesDir, fileName);
    fs.writeFileSync(filePath, encoded.buffer);
    const sha = crypto.createHash('sha256').update(encoded.buffer).digest('hex');
    checksums[fileName] = sha;
    tileMetas.push({
      tileKey,
      tx: bucket.tx,
      ty: bucket.ty,
      fileName,
      cellCount: bucket.cells.length,
      gzipBytes: encoded.gzipBytes,
      rawBytes: encoded.rawBytes,
      bytesPerCellGzip: Math.round((encoded.gzipBytes / bucket.cells.length) * 100) / 100,
      sha256: sha
    });
    console.log('Wrote', fileName, 'cells=', bucket.cells.length, 'gzip=', encoded.gzipBytes);
  }

  const totalGzip = tileMetas.reduce((s, t) => s + t.gzipBytes, 0);
  const manifest = buildCoverageManifest({
    regionId: region.regionId,
    bakeVersion: BAKE_VERSION,
    schemaVersion: COVERAGE_TILE_SCHEMA_VERSION,
    format: COVERAGE_FORMAT_BINARY,
    bounds: region.bounds,
    tiles: tileMetas,
    sourceVersions: {
      chelsa: CHELSA_V21_BASELINE.id,
      petScale: 'raw/100',
      terrain: TERRAIN_LAYER_POLICY_V2.preferredOpenOption,
      terrainZoom: args.skipTerrain ? null : 12
    },
    checksums
  });
  manifest.label = region.label;
  manifest.why = region.why;
  manifest.stats = {
    cellCount: cellList.length,
    tileCount: tileMetas.length,
    totalGzipBytes: totalGzip,
    bytesPerCellGzip: cellList.length ? Math.round((totalGzip / cellList.length) * 100) / 100 : null,
    coverageTileCells: COVERAGE_TILE_CELLS
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  progress.phase = 'done';
  progress.finishedAt = new Date().toISOString();
  progress.stats = manifest.stats;
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2));
  console.log(JSON.stringify(manifest.stats, null, 2));
  console.log('DONE', region.regionId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
