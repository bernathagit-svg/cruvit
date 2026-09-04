/**
 * Shared CHELSA bake utilities (central ingest only — never user runtime).
 */
import fs from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { fromUrl } from 'geotiff';
import {
  CHELSA_V21_BASELINE,
  chelsaTemperatureToCelsius,
  chelsaPrecipToMm,
  chelsaVpdToPa,
  chelsaHursToPct,
  chelsaPetToMm
} from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';

export const BAKE_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const BAKE_VARIABLES = [
  { key: 'tasmin', decode: chelsaTemperatureToCelsius },
  { key: 'tas', decode: chelsaTemperatureToCelsius },
  { key: 'tasmax', decode: chelsaTemperatureToCelsius },
  { key: 'pr', decode: chelsaPrecipToMm },
  { key: 'pet_penman', folder: 'pet', filePrefix: 'CHELSA_pet_penman', decode: chelsaPetToMm },
  { key: 'vpd', decode: chelsaVpdToPa },
  { key: 'hurs', decode: chelsaHursToPct }
];

export const DEFAULT_MAX_CONCURRENCY = 2;
export const DEFAULT_MAX_ATTEMPTS = 6;

export function chelsaUrl(variableSpec, month) {
  const mm = String(month).padStart(2, '0');
  const folder = variableSpec.folder || variableSpec.key;
  const prefix = variableSpec.filePrefix || `CHELSA_${variableSpec.key}`;
  return `${CHELSA_V21_BASELINE.baseUrl}/${folder}/${prefix}_${mm}_1981-2010_V.2.1.tif`;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function withBackoff(fn, label, maxAttempts = DEFAULT_MAX_ATTEMPTS) {
  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const msg = String(err?.message || err);
      const retryable = /429|timeout|ECONN|ENOTFOUND|fetch|503|502|network/i.test(msg);
      if (!retryable || attempt === maxAttempts) throw err;
      const wait = Math.min(60_000, 1500 * 2 ** (attempt - 1));
      console.warn(`  retry ${label} attempt=${attempt} wait=${wait}ms (${msg.slice(0, 120)})`);
      await sleep(wait);
    }
  }
  throw last;
}

export async function mapPool(items, concurrency, worker) {
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

export async function readChelsaWindow(url, x0, y0, x1, y1) {
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

export async function sampleElevation(lat, lon, z = 12) {
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

export function variableFieldName(v) {
  if (v.key === 'tasmin') return 'tmin';
  if (v.key === 'tas') return 'tmean';
  if (v.key === 'tasmax') return 'tmax';
  if (v.key === 'pet_penman') return 'pet';
  return v.key;
}

export function loadLayerCacheOrFetch(layerCacheDir, v, month, win, cellList, series, progress, progressPath) {
  const id = `${v.key}-${month}`;
  const cacheFile = path.join(layerCacheDir, `${id}.json`);
  return (async () => {
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
      payload = { width, height, values, nodata };
      fs.writeFileSync(cacheFile, JSON.stringify(payload));
    }
    const field = variableFieldName(v);
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
    return id;
  })();
}

export function isCellLand(cell) {
  const tmin = cell?.tmin || [];
  const valid = tmin.filter((v) => Number.isFinite(v)).length;
  return valid >= 3;
}

export function isTileAllNodata(seriesValues) {
  let land = 0;
  for (const cell of seriesValues) {
    if (isCellLand(cell)) land += 1;
  }
  return land === 0;
}
