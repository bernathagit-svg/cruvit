#!/usr/bin/env node
/**
 * CRUVIT Coordinate Climate Authority V2 — PILOT ingestion (build-time only).
 *
 * Samples CHELSA V2.1 climatology COGs + AWS Terrarium elevation at exact
 * pilot coordinates. Writes compact CRUVIT-owned profiles under data/coordinate-climate/v2.
 *
 * NEVER import from browser / user-runtime plant evaluation paths.
 *
 * Usage: node scripts/coordinate-climate-v2-ingest-pilot.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { fromUrl } from 'geotiff';
import {
  CHELSA_V21_BASELINE,
  TERRAIN_LAYER_POLICY_V2,
  COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
  buildCoordinateClimateProfileV2,
  chelsaTemperatureToCelsius,
  chelsaPrecipToMm,
  chelsaVpdToPa,
  chelsaHursToPct,
  chelsaPetToMm,
  coordinateClimateProfileToStructuralPersistence,
  roundCoord
} from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.join(ROOT, 'data', 'coordinate-climate', 'v2');
const PILOT_DIR = path.join(OUT_DIR, 'pilot');

const PILOT_QUERIES = [
  // Geocode often misses Yehiam (known P3); use kibbutz WGS84 (not a city proxy).
  { id: 'yehiam', label: 'Yehiam, Israel', query: 'Yehiam, Israel', fallback: { lat: 33.12806, lon: 35.22028 } },
  { id: 'helsinki', label: 'Helsinki, Finland', query: 'Helsinki, Finland', fallback: { lat: 60.16952, lon: 24.93545 } },
  { id: 'singapore', label: 'Singapore', query: 'Singapore', fallback: { lat: 1.2897, lon: 103.8501 } },
  { id: 'kochi', label: 'Kochi, Kerala, India', query: 'Kochi, Kerala', fallback: { lat: 9.9312, lon: 76.2673 } },
  { id: 'cairo', label: 'Cairo, Egypt', query: 'Cairo, Egypt', fallback: { lat: 30.0444, lon: 31.2357 } },
  { id: 'tokyo', label: 'Tokyo, Japan', query: 'Tokyo, Japan', fallback: { lat: 35.6895, lon: 139.6917 } },
  { id: 'quito', label: 'Quito, Ecuador', query: 'Quito, Ecuador', fallback: { lat: -0.1807, lon: -78.4678 } }
];

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

function chelsaUrl(variableSpec, month) {
  const mm = String(month).padStart(2, '0');
  if (typeof variableSpec === 'string') {
    return `${CHELSA_V21_BASELINE.baseUrl}/${variableSpec}/CHELSA_${variableSpec}_${mm}_1981-2010_V.2.1.tif`;
  }
  const folder = variableSpec.folder || variableSpec.key;
  const prefix = variableSpec.filePrefix || `CHELSA_${variableSpec.key}`;
  return `${CHELSA_V21_BASELINE.baseUrl}/${folder}/${prefix}_${mm}_1981-2010_V.2.1.tif`;
}

async function resolveCoords(entry) {
  try {
    const url =
      'https://geocoding-api.open-meteo.com/v1/search?' +
      new URLSearchParams({ name: entry.query, count: '5', language: 'en', format: 'json' });
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CruvitCoordinateClimateV2-Ingest/0.1' },
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) throw new Error(`geocode-http-${res.status}`);
    const data = await res.json();
    const hit = (data.results || [])[0];
    if (!hit) throw new Error('geocode-empty');
    return {
      lat: Number(hit.latitude),
      lon: Number(hit.longitude),
      resolvedLabel: [hit.name, hit.admin1, hit.country].filter(Boolean).join(', '),
      geocodeProvider: 'open-meteo-geocoding',
      usedFallback: false
    };
  } catch (err) {
    return {
      lat: entry.fallback.lat,
      lon: entry.fallback.lon,
      resolvedLabel: entry.label,
      geocodeProvider: 'fallback-known-coordinate',
      usedFallback: true,
      geocodeError: String(err?.message || err)
    };
  }
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
  return { rgba, width, height };
}

async function sampleTerrariumElevation(lat, lon, zoom = 12) {
  const { x, y, z } = lonLatToTile(lon, lat, zoom);
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CruvitCoordinateClimateV2-Ingest/0.1' },
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`terrarium-http-${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const decoded = decodePngRgba(buf);
  if (!decoded) throw new Error('terrarium-png-decode-failed');
  const { rgba, width } = decoded;
  const n = 2 ** z;
  const xFloat = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yFloat = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const px = Math.min(width - 1, Math.max(0, Math.floor((xFloat - x) * width)));
  const py = Math.min(width - 1, Math.max(0, Math.floor((yFloat - y) * width)));
  const i = (py * width + px) * 4;
  const elev = rgba[i] * 256 + rgba[i + 1] + rgba[i + 2] / 256 - 32768;
  return {
    elevationM: Math.round(elev * 10) / 10,
    tile: { z, x, y, px, py },
    url,
    source: TERRAIN_LAYER_POLICY_V2.preferredOpenOption,
    version: 'terrarium-v1',
    nativeResolution: TERRAIN_LAYER_POLICY_V2.nativeResolutionLabel
  };
}

const tiffCache = new Map();

async function openChelsa(url) {
  if (tiffCache.has(url)) return tiffCache.get(url);
  const tiff = await fromUrl(url);
  tiffCache.set(url, tiff);
  return tiff;
}

async function sampleChelsaPoint(url, lat, lon) {
  const tiff = await openChelsa(url);
  const image = await tiff.getImage();
  const bbox = image.getBoundingBox(); // [minX, minY, maxX, maxY]
  const width = image.getWidth();
  const height = image.getHeight();
  const px = ((lon - bbox[0]) / (bbox[2] - bbox[0])) * width;
  const py = ((bbox[3] - lat) / (bbox[3] - bbox[1])) * height;
  const x = Math.min(width - 1, Math.max(0, Math.floor(px)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(py)));
  const data = await image.readRasters({ window: [x, y, x + 1, y + 1], width: 1, height: 1 });
  const raw = data[0][0];
  const noData = image.getGDALNoData();
  if (noData != null && Number(raw) === Number(noData)) {
    return { raw: null, x, y, bbox, width, height, resX: (bbox[2] - bbox[0]) / width, resY: (bbox[3] - bbox[1]) / height };
  }
  return {
    raw: Number(raw),
    x,
    y,
    bbox,
    width,
    height,
    resX: (bbox[2] - bbox[0]) / width,
    resY: (bbox[3] - bbox[1]) / height
  };
}

async function sampleMonthlySeries(variableSpec, decode, lat, lon) {
  const values = [];
  let gridMeta = null;
  const key = typeof variableSpec === 'string' ? variableSpec : variableSpec.key;
  for (const month of MONTHS) {
    const url = chelsaUrl(variableSpec, month);
    let attempt = 0;
    let sample = null;
    let lastErr = null;
    while (attempt < 4) {
      try {
        sample = await sampleChelsaPoint(url, lat, lon);
        break;
      } catch (err) {
        lastErr = err;
        attempt += 1;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    if (!sample) throw new Error(`${key} m${month}: ${lastErr?.message || 'sample-failed'}`);
    if (!gridMeta) {
      gridMeta = {
        sourceUrlExample: url,
        width: sample.width,
        height: sample.height,
        bbox: sample.bbox,
        resX: sample.resX,
        resY: sample.resY,
        pixel: { x: sample.x, y: sample.y }
      };
    }
    values.push(sample.raw == null ? null : decode(sample.raw));
    process.stdout.write(`  ${key} ${String(month).padStart(2, '0')} raw=${sample.raw} -> ${values[values.length - 1]}\n`);
  }
  return { values, gridMeta, key };
}

function ensureDirs() {
  fs.mkdirSync(PILOT_DIR, { recursive: true });
}

async function ingestOne(entry) {
  const geo = await resolveCoords(entry);
  const lat = geo.lat;
  const lon = geo.lon;
  console.log(`\n=== ${entry.id} @ ${lat}, ${lon} (${geo.resolvedLabel}) ===`);

  let terrain;
  try {
    terrain = await sampleTerrariumElevation(lat, lon, 12);
    console.log(`  elevation=${terrain.elevationM}m tile=${JSON.stringify(terrain.tile)}`);
  } catch (err) {
    console.warn(`  terrain failed: ${err.message}`);
    terrain = {
      elevationM: null,
      source: TERRAIN_LAYER_POLICY_V2.preferredOpenOption,
      version: 'terrarium-v1',
      error: String(err.message || err),
      nativeResolution: TERRAIN_LAYER_POLICY_V2.nativeResolutionLabel
    };
  }

  const series = {};
  let climateGrid = null;
  for (const v of VARIABLES) {
    const { values, gridMeta, key } = await sampleMonthlySeries(v, v.decode, lat, lon);
    series[key] = values;
    if (!climateGrid) {
      climateGrid = {
        dataset: CHELSA_V21_BASELINE.id,
        nativeResolutionArcSec: 30,
        nativeResolutionLabel: CHELSA_V21_BASELINE.nativeResolutionLabel,
        cellPixel: gridMeta.pixel,
        cellResDeg: { x: gridMeta.resX, y: gridMeta.resY },
        bbox: gridMeta.bbox
      };
    }
  }

  const profile = buildCoordinateClimateProfileV2({
    lat,
    lon,
    label: geo.resolvedLabel || entry.label,
    monthlyTminC: series.tasmin,
    monthlyTmeanC: series.tas,
    monthlyTmaxC: series.tasmax,
    monthlyPrecipMm: series.pr,
    monthlyPetMm: series.pet_penman,
    monthlyVpdPa: series.vpd,
    monthlyHursPct: series.hurs,
    elevationM: terrain.elevationM,
    climateGrid,
    terrain,
    provenance: {
      pilotId: entry.id,
      geocode: geo,
      ingestedAt: new Date().toISOString(),
      cityProxy: false,
      usedCityProxy: false,
      acquisitionBytesNote: 'COG range reads via geotiff fromUrl — not full global download'
    }
  });

  const structural = coordinateClimateProfileToStructuralPersistence(profile);
  const profileRel = `pilot/${entry.id}.json`;
  const profilePath = path.join(OUT_DIR, profileRel);
  fs.writeFileSync(
    profilePath,
    JSON.stringify({ ...profile, structuralPersistencePreview: structural }, null, 2)
  );
  return {
    id: entry.id,
    label: profile.coordinate.label,
    lat: roundCoord(lat),
    lon: roundCoord(lon),
    profilePath: profileRel,
    coldestMonthMeanMinC: profile.coldestMonthMeanMinC,
    thermalRegime: profile.thermalRegime,
    moisture: profile.aridityMoistureRegime,
    elevationM: profile.elevationM
  };
}

function storageEstimate(pilotEntries) {
  // Empirical from HEAD sizes + pilot compact profiles
  const monthlyFileMb = {
    tasmin: 115.7,
    tas: 112.7,
    tasmax: 114.4,
    pr: 229.5,
    vpd: 473.3,
    hurs: 361.4
  };
  const months = 12;
  const vars = Object.keys(monthlyFileMb);
  const rawGlobalGb =
    vars.reduce((s, k) => s + monthlyFileMb[k] * months, 0) / 1024;
  const compactProfileBytes = pilotEntries.length
    ? fs.statSync(path.join(OUT_DIR, pilotEntries[0].profilePath)).size
    : 8000;
  // Global land cells ~ 30 arc-sec: ~150M land pixels rough order; store derived monthly vectors per cell
  const landCellsApprox = 150_000_000;
  const derivedGlobalGb = (landCellsApprox * compactProfileBytes) / 1e9;
  const tiledSparseNote =
    'Prefer sparse CRUVIT tiles / on-demand cell materialization over raw global COG mirrors.';
  return {
    variablesRequired: vars,
    variablesDeferred: CHELSA_V21_BASELINE.variablesDeferred,
    rawGlobalChelsaSelectedVarsGbApprox: Math.round(rawGlobalGb * 10) / 10,
    pilotCompactProfileBytesApprox: compactProfileBytes,
    projectedNaivePerCellGlobalGbApprox: Math.round(derivedGlobalGb),
    recommendation: tiledSparseNote,
    oneTimeIngestion: 'COG range sample or regional tile bake — not per-user',
    recurringUserCostUsd: 0
  };
}

async function main() {
  ensureDirs();
  const entries = [];
  const errors = [];
  for (const q of PILOT_QUERIES) {
    try {
      entries.push(await ingestOne(q));
    } catch (err) {
      console.error(`FAIL ${q.id}:`, err);
      errors.push({ id: q.id, error: String(err?.message || err) });
    }
  }

  const index = {
    authorityVersion: COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
    baseline: CHELSA_V21_BASELINE,
    terrainPolicy: TERRAIN_LAYER_POLICY_V2,
    generatedAt: new Date().toISOString(),
    noCityProxy: true,
    entries,
    errors,
    storageEstimate: storageEstimate(entries)
  };
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2));

  const report = {
    generatedAt: index.generatedAt,
    authorityVersion: COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
    entries,
    errors,
    storageEstimate: index.storageEstimate,
    differentiation: buildDifferentiation(entries)
  };
  fs.writeFileSync(
    path.join(ROOT, 'tests', '_coordinate-climate-authority-v2-report.json'),
    JSON.stringify(report, null, 2)
  );
  console.log('\nWrote index + report. entries=', entries.length, 'errors=', errors.length);
  if (errors.length) process.exitCode = 2;
}

function buildDifferentiation(entries) {
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  const pair = (a, b) => {
    const A = byId[a];
    const B = byId[b];
    if (!A || !B) return { a, b, comparable: false };
    return {
      a,
      b,
      comparable: true,
      sameThermal: A.thermalRegime === B.thermalRegime,
      sameMoisture: A.moisture === B.moisture,
      coldestDeltaC:
        A.coldestMonthMeanMinC != null && B.coldestMonthMeanMinC != null
          ? Math.round((A.coldestMonthMeanMinC - B.coldestMonthMeanMinC) * 100) / 100
          : null,
      elevDeltaM:
        A.elevationM != null && B.elevationM != null
          ? Math.round((A.elevationM - B.elevationM) * 10) / 10
          : null
    };
  };
  return {
    yehiam_vs_cairo: pair('yehiam', 'cairo'),
    cairo_vs_kochi: pair('cairo', 'kochi'),
    kochi_vs_singapore: pair('kochi', 'singapore'),
    quito_vs_singapore: pair('quito', 'singapore'),
    helsinki_vs_tokyo: pair('helsinki', 'tokyo'),
    helsinki_not_zurich_proxy: {
      helsinkiPresent: !!byId.helsinki,
      usedZurichProxy: false,
      note: 'Helsinki profile sampled at Helsinki lat/lon only'
    }
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
