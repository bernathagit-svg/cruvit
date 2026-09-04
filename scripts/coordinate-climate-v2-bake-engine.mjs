/**
 * Optimized global bake engine — macro windows, TIFF cache, vectorized decode, profiling.
 * ENGINEERING ONLY — preserves Coordinate Climate V2 science/encoding semantics.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fromUrl, fromFile } from 'geotiff';
import {
  CHELSA_WIDTH,
  CHELSA_HEIGHT,
  COVERAGE_TILE_CELLS,
  cellCenterLatLon,
  deriveCellEnumsFromSeries,
  encodeBinaryCoverageTile
} from '../modules/personal-domain/coordinate-climate-coverage-tiles-v2.js';
import {
  BAKE_MONTHS,
  BAKE_VARIABLES,
  chelsaUrl,
  mapPool,
  isCellLand,
  isTileAllNodata,
  variableFieldName,
  withBackoff
} from './coordinate-climate-v2-bake-shared.mjs';
import {
  SOURCE_MODE,
  resolveSourceForLayer,
  getNetworkChelsaCalls,
  resetNetworkChelsaCalls,
  setSourceMode,
  getSourceMode
} from './coordinate-climate-v2-source-resolver.mjs';

export { SOURCE_MODE, setSourceMode, getSourceMode, getNetworkChelsaCalls, resetNetworkChelsaCalls };

/** Cached GeoTIFF image handles — avoids repeated fromUrl/metadata per layer read. */
const _tiffImageCache = new Map();
let _sourceBytesRead = 0;

export function resetBakeEngineCaches() {
  _tiffImageCache.clear();
  _sourceBytesRead = 0;
}

export function getSourceBytesRead() {
  return _sourceBytesRead;
}

export async function getChelsaImageForLayer(v, month) {
  const src = resolveSourceForLayer(v, month);
  if (_tiffImageCache.has(src.cacheKey)) return _tiffImageCache.get(src.cacheKey);
  const entry = await (async () => {
    if (src.kind === 'local') {
      const tiff = await fromFile(src.localPath);
      const image = await tiff.getImage();
      const nodata = Number(image.getGDALNoData?.() ?? 65535);
      return { tiff, image, nodata, url: src.localPath, local: true };
    }
    return getChelsaImageRemote(src.url);
  })();
  _tiffImageCache.set(src.cacheKey, entry);
  return entry;
}

async function getChelsaImageRemote(url) {
  if (_tiffImageCache.has(url)) return _tiffImageCache.get(url);
  const entry = await withBackoff(async () => {
    const tiff = await fromUrl(url, { allowFullFile: false });
    const image = await tiff.getImage();
    const nodata = Number(image.getGDALNoData?.() ?? 65535);
    return { tiff, image, nodata, url, local: false };
  }, `open-${url.split('/').pop()}`);
  _tiffImageCache.set(url, entry);
  return entry;
}

/** @deprecated use getChelsaImageForLayer */
export async function getChelsaImage(url) {
  return getChelsaImageRemote(url);
}

export async function readChelsaWindowForLayer(v, month, x0, y0, x1, y1, profiler) {
  const src = resolveSourceForLayer(v, month);
  return readChelsaWindowFromImage(v, month, x0, y0, x1, y1, profiler);
}

async function readChelsaWindowFromImage(v, month, x0, y0, x1, y1, profiler) {
  const t0 = performance.now();
  const { image, nodata } = await getChelsaImageForLayer(v, month);
  const tOpen = performance.now() - t0;
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const tRead0 = performance.now();
  const data = await image.readRasters({
    window: [x0, y0, x1 + 1, y1 + 1],
    width,
    height,
    resampleMethod: 'nearest'
  });
  const tRead = performance.now() - tRead0;
  const band = data[0];
  _sourceBytesRead += band.byteLength || band.length * 2;
  if (profiler) {
    profiler.add('tiffOpenMs', tOpen);
    profiler.add('rasterReadMs', tRead);
    profiler.add('diskRasterBytes', band.byteLength || band.length * 2);
  }
  return { band, width, height, nodata };
}

export async function readChelsaWindowCached(url, x0, y0, x1, y1, profiler) {
  return withBackoff(async () => {
    const t0 = performance.now();
    const { image, nodata } = await getChelsaImage(url);
    const tOpen = performance.now() - t0;
    const width = x1 - x0 + 1;
    const height = y1 - y0 + 1;
    const tRead0 = performance.now();
    const data = await image.readRasters({
      window: [x0, y0, x1 + 1, y1 + 1],
      width,
      height,
      resampleMethod: 'nearest'
    });
    const tRead = performance.now() - tRead0;
    const band = data[0];
    _sourceBytesRead += band.byteLength || band.length * 2;
    if (profiler) {
      profiler.add('tiffOpenMs', tOpen);
      profiler.add('rasterReadMs', tRead);
      profiler.add('networkRasterBytes', band.byteLength || band.length * 2);
    }
    return { band, width, height, nodata };
  }, url.split('/').pop());
}

/** Vectorized decode to Float32Array (NaN = nodata). */
export function decodeBandVector(band, nodata, decodeFn) {
  const out = new Float32Array(band.length);
  const nd = nodata;
  for (let i = 0; i < band.length; i++) {
    const raw = band[i];
    if (raw === nd || raw === 65535 || !Number.isFinite(Number(raw))) out[i] = NaN;
    else out[i] = decodeFn(raw);
  }
  return out;
}

export function createProfiler() {
  const phases = {};
  return {
    phases,
    add(name, ms) {
      phases[name] = (phases[name] || 0) + ms;
    },
    time(name, fn) {
      const t0 = performance.now();
      const r = fn();
      this.add(name, performance.now() - t0);
      return r;
    },
    async timeAsync(name, fn) {
      const t0 = performance.now();
      const r = await fn();
      this.add(name, performance.now() - t0);
      return r;
    },
    pct() {
      const total = Object.values(phases).reduce((a, b) => a + b, 0) || 1;
      return Object.fromEntries(
        Object.entries(phases).map(([k, v]) => [k, { ms: v, pct: (100 * v) / total }])
      );
    }
  };
}

export function tileWindow(tx, ty, tileCells = COVERAGE_TILE_CELLS) {
  const x0 = tx * tileCells;
  const y0 = ty * tileCells;
  const x1 = Math.min(CHELSA_WIDTH - 1, x0 + tileCells - 1);
  const y1 = Math.min(CHELSA_HEIGHT - 1, y0 + tileCells - 1);
  return { x0, x1, y0, y1, tx, ty, tileCells };
}

export function macroWindow(mbx, mby, tileCells, macroTiles) {
  const x0 = mbx * tileCells * macroTiles;
  const y0 = mby * tileCells * macroTiles;
  const span = tileCells * macroTiles;
  const x1 = Math.min(CHELSA_WIDTH - 1, x0 + span - 1);
  const y1 = Math.min(CHELSA_HEIGHT - 1, y0 + span - 1);
  return { x0, x1, y0, y1, mbx, mby, tileCells, macroTiles, span };
}

export function maxTileIndex(tileCells = COVERAGE_TILE_CELLS) {
  return {
    maxTx: Math.floor((CHELSA_WIDTH - 1) / tileCells),
    maxTy: Math.floor((CHELSA_HEIGHT - 1) / tileCells)
  };
}

export function candidateTileCount(tileCells = COVERAGE_TILE_CELLS) {
  const { maxTx, maxTy } = maxTileIndex(tileCells);
  return (maxTx + 1) * (maxTy + 1);
}

/** RAW UInt16 validity — inspect source pixels before climate decode/scale. */
export function isRawChelsaSourcePixelValid(raw, nodata) {
  const v = Number(raw);
  if (!Number.isFinite(v)) return false;
  const nd = Number(nodata);
  if (Number.isFinite(nd) && v === nd) return false;
  // CHELSA uint16 ocean / missing sentinel (pet_penman, pr-class layers)
  if (v === 65535) return false;
  // GDAL int32 sentinel sometimes stored in metadata (tasmin/tas/tasmax)
  if (v === -2147483647 || v === 2147483647) return false;
  return true;
}

export function landMaskProbeVariable() {
  return BAKE_VARIABLES.find((v) => v.key === 'pet_penman') || BAKE_VARIABLES[4];
}
/** Land probe via pet_penman month-1 — tasmin has numeric values over ocean; pet uses 65535 nodata. */
export async function probeTileLand(tx, ty, tileCells, profiler) {
  const win = tileWindow(tx, ty, tileCells);
  const v = landMaskProbeVariable();
  const { band, nodata } = await readChelsaWindowForLayer(v, 1, win.x0, win.y0, win.x1, win.y1, profiler);
  let valid = 0;
  for (let i = 0; i < band.length; i++) {
    if (isRawChelsaSourcePixelValid(band[i], nodata)) valid++;
  }
  return { tx, ty, validCells: valid, isLand: valid >= 3 };
}

function initCellSeries(win) {
  const series = new Map();
  for (let y = win.y0; y <= win.y1; y++) {
    for (let x = win.x0; x <= win.x1; x++) {
      series.set(`${x}:${y}`, {
        x,
        y,
        tmin: new Float32Array(12),
        tmean: new Float32Array(12),
        tmax: new Float32Array(12),
        pr: new Float32Array(12),
        pet: new Float32Array(12),
        vpd: new Float32Array(12),
        hurs: new Float32Array(12),
        elev: null
      });
      for (let m = 0; m < 12; m++) {
        series.get(`${x}:${y}`).tmin[m] = NaN;
        series.get(`${x}:${y}`).tmean[m] = NaN;
        series.get(`${x}:${y}`).tmax[m] = NaN;
        series.get(`${x}:${y}`).pr[m] = NaN;
        series.get(`${x}:${y}`).pet[m] = NaN;
        series.get(`${x}:${y}`).vpd[m] = NaN;
        series.get(`${x}:${y}`).hurs[m] = NaN;
      }
    }
  }
  return series;
}

function floatSeriesToArrays(cell) {
  const toArr = (fa) => Array.from(fa, (v) => (Number.isFinite(v) ? v : null));
  return {
    ...cell,
    tmin: toArr(cell.tmin),
    tmean: toArr(cell.tmean),
    tmax: toArr(cell.tmax),
    pr: toArr(cell.pr),
    pet: toArr(cell.pet),
    vpd: toArr(cell.vpd),
    hurs: toArr(cell.hurs)
  };
}

function scatterLayerIntoSeries(series, win, layerValues, field, monthIndex) {
  const w = win.x1 - win.x0 + 1;
  for (let y = win.y0; y <= win.y1; y++) {
    for (let x = win.x0; x <= win.x1; x++) {
      const idx = (y - win.y0) * w + (x - win.x0);
      const cell = series.get(`${x}:${y}`);
      if (cell) cell[field][monthIndex] = layerValues[idx];
    }
  }
}

/** Fetch all 84 layers for a window (parallel layer concurrency). */
export async function fetchAllLayersForWindow(win, { layerConcurrency = 8, profiler } = {}) {
  const tasks = [];
  for (const v of BAKE_VARIABLES) {
    for (const month of BAKE_MONTHS) {
      tasks.push({ v, month });
    }
  }
  const layers = [];
  await mapPool(tasks, layerConcurrency, async ({ v, month }) => {
    const t0 = performance.now();
    const { band, width, height, nodata } = await readChelsaWindowForLayer(
      v,
      month,
      win.x0,
      win.y0,
      win.x1,
      win.y1,
      profiler
    );
    const tDec0 = performance.now();
    const values = decodeBandVector(band, nodata, v.decode);
    if (profiler) profiler.add('decodeMs', performance.now() - tDec0);
    if (profiler) profiler.add('layerFetchMs', performance.now() - t0);
    layers.push({ v, month, values, width, height, field: variableFieldName(v) });
  });
  return layers;
}

function packTileFromSeries({ tx, ty, tileCells, series, win, globalBakeId, regionId, profiler }) {
  const subWin = tileWindow(tx, ty, tileCells);
  const subCells = [];
  for (let y = subWin.y0; y <= subWin.y1; y++) {
    for (let x = subWin.x0; x <= subWin.x1; x++) {
      const c = series.get(`${x}:${y}`);
      if (c) subCells.push(c);
    }
  }
  const landCells = subCells.filter((c) => isCellLand(floatSeriesToArrays(c)));
  if (landCells.length === 0) return { skipped: true, reason: 'ocean-nodata', tx, ty };

  const packedCells = [];
  for (const cell of landCells) {
    const arr = floatSeriesToArrays(cell);
    const derived = deriveCellEnumsFromSeries(arr);
    packedCells.push({
      x: cell.x,
      y: cell.y,
      ...cellCenterLatLon(cell.x, cell.y),
      elev: cell.elev,
      tmin: arr.tmin,
      tmean: arr.tmean,
      tmax: arr.tmax,
      pr: arr.pr,
      pet: arr.pet,
      vpd: arr.vpd,
      hurs: arr.hurs,
      ...derived
    });
  }

  const tileKey = `chelsa30s-t${tileCells}:${tx}:${ty}`;
  const tEnc0 = performance.now();
  const encoded = encodeBinaryCoverageTile({
    tileKey,
    tx,
    ty,
    cells: packedCells,
    bakeVersion: globalBakeId,
    regionId,
    tileCells
  });
  if (profiler) profiler.add('encodeGzipMs', performance.now() - tEnc0);
  const tHash0 = performance.now();
  const sha = crypto.createHash('sha256').update(encoded.buffer).digest('hex');
  if (profiler) profiler.add('checksumMs', performance.now() - tHash0);
  return {
    skipped: false,
    tx,
    ty,
    tileKey,
    fileName: `${tileKey.replace(/:/g, '_')}.cctb.gz`,
    cellCount: packedCells.length,
    gzipBytes: encoded.gzipBytes,
    sha256: sha,
    buffer: encoded.buffer
  };
}

/** Legacy-style single-tile bake (for profiling comparison). */
export async function bakeTileLegacy(tx, ty, opts = {}) {
  const tileCells = opts.tileCells || COVERAGE_TILE_CELLS;
  const profiler = opts.profiler || createProfiler();
  const win = tileWindow(tx, ty, tileCells);
  const t0 = performance.now();
  const probe = await probeTileLand(tx, ty, tileCells, profiler);
  if (!probe.isLand) {
    return { skipped: true, reason: 'ocean-nodata', profiler, durationMs: performance.now() - t0 };
  }
  const series = initCellSeries(win);
  const layers = await fetchAllLayersForWindow(win, {
    layerConcurrency: 1,
    profiler
  });
  for (const layer of layers) {
    scatterLayerIntoSeries(series, win, layer.values, layer.field, layer.month - 1);
  }
  const result = packTileFromSeries({
    tx,
    ty,
    tileCells,
    series,
    win,
    globalBakeId: opts.globalBakeId || 'bench',
    regionId: opts.regionId || 'bench',
    profiler
  });
  result.profiler = profiler;
  result.durationMs = performance.now() - t0;
  return result;
}

/** Optimized macro-block bake: one window read set → split into up to macroTiles² output tiles. */
export async function bakeMacroBlock(mbx, mby, opts = {}) {
  const tileCells = opts.tileCells || COVERAGE_TILE_CELLS;
  const macroTiles = opts.macroTiles || 4;
  const layerConcurrency = opts.layerConcurrency || 8;
  const globalBakeId = opts.globalBakeId || 'bench';
  const regionId = opts.regionId || 'bench';
  const profiler = opts.profiler || createProfiler();
  const win = macroWindow(mbx, mby, tileCells, macroTiles);
  const t0 = performance.now();
  const series = initCellSeries(win);
  const layers = await fetchAllLayersForWindow(win, { layerConcurrency, profiler });
  for (const layer of layers) {
    scatterLayerIntoSeries(series, win, layer.values, layer.field, layer.month - 1);
  }
  const results = [];
  for (let sty = 0; sty < macroTiles; sty++) {
    for (let stx = 0; stx < macroTiles; stx++) {
      const tx = mbx * macroTiles + stx;
      const ty = mby * macroTiles + sty;
      const { maxTx, maxTy } = maxTileIndex(tileCells);
      if (tx > maxTx || ty > maxTy) continue;
      const packed = packTileFromSeries({
        tx,
        ty,
        tileCells,
        series,
        win,
        globalBakeId,
        regionId,
        profiler
      });
      results.push(packed);
    }
  }
  return {
    mbx,
    mby,
    results,
    profiler,
    durationMs: performance.now() - t0,
    tilesBaked: results.filter((r) => !r.skipped).length,
    tilesSkipped: results.filter((r) => r.skipped).length
  };
}

/** Build or load land-tile mask using one tasmin probe per tile (parallel). */
/** Fast land mask via macro-block pet_penman probe (correct ocean nodata semantics). */
export async function buildLandTileMaskMacro(opts = {}) {
  const tileCells = opts.tileCells || COVERAGE_TILE_CELLS;
  const macroTiles = opts.macroTiles || 8;
  const maskPath = opts.maskPath;
  if (maskPath && fs.existsSync(maskPath) && !opts.force) {
    return JSON.parse(fs.readFileSync(maskPath, 'utf8'));
  }
  const { maxTx, maxTy } = maxTileIndex(tileCells);
  const maxMbx = Math.floor(maxTx / macroTiles);
  const maxMby = Math.floor(maxTy / macroTiles);
  const v = landMaskProbeVariable();
  const landOnly = [];
  const mixed = [];
  const ocean = [];
  const land = [];
  const cellsPerTile = tileCells * tileCells;
  let totalValidLandCells = 0;
  let totalNodataCells = 0;

  for (let mby = 0; mby <= maxMby; mby++) {
    for (let mbx = 0; mbx <= maxMbx; mbx++) {
      const win = macroWindow(mbx, mby, tileCells, macroTiles);
      const { band, nodata } = await readChelsaWindowForLayer(v, 1, win.x0, win.y0, win.x1, win.y1);
      const w = win.x1 - win.x0 + 1;
      for (let sty = 0; sty < macroTiles; sty++) {
        for (let stx = 0; stx < macroTiles; stx++) {
          const tx = mbx * macroTiles + stx;
          const ty = mby * macroTiles + sty;
          if (tx > maxTx || ty > maxTy) continue;
          const sx0 = stx * tileCells;
          const sy0 = sty * tileCells;
          let valid = 0;
          let probed = 0;
          for (let ly = 0; ly < tileCells; ly++) {
            for (let lx = 0; lx < tileCells; lx++) {
              const gx = win.x0 + sx0 + lx;
              const gy = win.y0 + sy0 + ly;
              if (gx > win.x1 || gy > win.y1) continue;
              probed++;
              const idx = (gy - win.y0) * w + (gx - win.x0);
              if (isRawChelsaSourcePixelValid(band[idx], nodata)) valid++;
            }
          }
          totalValidLandCells += valid;
          totalNodataCells += probed - valid;
          const key = `${tx}:${ty}`;
          if (valid < 3) {
            ocean.push(key);
          } else {
            land.push(key);
            if (valid >= cellsPerTile) landOnly.push(key);
            else mixed.push(key);
          }
        }
      }
    }
    if (mby % 5 === 0) process.stderr.write(`land-mask macro row ${mby}/${maxMby}\n`);
  }

  const totalCandidate = (maxTx + 1) * (maxTy + 1);
  const mask = {
    kind: 'cruvit-climate-land-tile-mask-v2',
    method: 'macro-block-pet-penman-month1-raw-validity',
    probeVariable: v.key,
    probeMonth: 1,
    tileCells,
    macroTiles,
    totalCandidateTiles: totalCandidate,
    landTileCount: land.length,
    landOnlyTileCount: landOnly.length,
    mixedLandOceanTileCount: mixed.length,
    oceanTileCount: ocean.length,
    pureLandTileCount: landOnly.length,
    totalValidLandCells,
    totalNodataCells,
    land,
    landOnly,
    mixed,
    ocean,
    generatedAt: new Date().toISOString()
  };
  if (maskPath) fs.writeFileSync(maskPath, JSON.stringify(mask));
  return mask;
}

export async function buildLandTileMask(opts = {}) {
  if (opts.useMacro !== false) return buildLandTileMaskMacro(opts);
  const tileCells = opts.tileCells || COVERAGE_TILE_CELLS;
  const { maxTx, maxTy } = maxTileIndex(tileCells);
  const maskPath = opts.maskPath;
  if (maskPath && fs.existsSync(maskPath)) {
    return JSON.parse(fs.readFileSync(maskPath, 'utf8'));
  }
  const coords = [];
  for (let ty = 0; ty <= maxTy; ty++) {
    for (let tx = 0; tx <= maxTx; tx++) coords.push({ tx, ty });
  }
  const sampleOnly = opts.sampleTiles || coords.length;
  const toProbe = opts.sampleTiles ? coords.slice(0, sampleOnly) : coords;
  const land = [];
  const ocean = [];
  const probeConcurrency = opts.probeConcurrency || 16;
  await mapPool(toProbe, probeConcurrency, async ({ tx, ty }) => {
    const p = await probeTileLand(tx, ty, tileCells);
    if (p.isLand) land.push(`${tx}:${ty}`);
    else ocean.push(`${tx}:${ty}`);
  });
  const mask = {
    kind: 'cruvit-climate-land-tile-mask-v1',
    tileCells,
    probedTiles: toProbe.length,
    totalCandidateTiles: coords.length,
    landTileCount: land.length,
    oceanTileCount: ocean.length,
    landRatio: land.length / toProbe.length,
    projectedLandTiles: Math.round((land.length / toProbe.length) * coords.length),
    projectedOceanTiles: Math.round((ocean.length / toProbe.length) * coords.length),
    land,
    ocean,
    generatedAt: new Date().toISOString()
  };
  if (maskPath) fs.writeFileSync(maskPath, JSON.stringify(mask, null, 2));
  return mask;
}

export function writeTileOutput(globalRoot, result) {
  if (result.skipped || !result.buffer) return null;
  const tilesDir = path.join(globalRoot, 'tiles');
  fs.mkdirSync(tilesDir, { recursive: true });
  const filePath = path.join(tilesDir, result.fileName);
  fs.writeFileSync(filePath, result.buffer);
  return filePath;
}
