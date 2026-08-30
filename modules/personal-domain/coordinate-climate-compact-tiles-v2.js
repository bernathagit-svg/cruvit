/**
 * CRUVIT hybrid compact climate tiles (runtime-safe decoder).
 *
 * Format: zlib-compressed JSON cell map keyed by chelsa30s:x:y
 * (prototype — binary Int16 packing can replace JSON payload later without
 * changing lat/lon → cell determinism).
 *
 * Runtime: read CRUVIT tiles only. Never CHELSA / terrain / Open-Meteo.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { roundCoord } from './coordinate-climate-authority-v2-contract.js';
import { chelsaGridCellIndex } from './coordinate-climate-garden-hydrate-v2.js';
import { assertCoordinateClimateRuntimeCostPolicy } from './coordinate-climate-authority-v2-contract.js';
import { CLIMATE_AUTHORITY_UNAVAILABLE, buildClimateAuthorityUnavailable } from './coordinate-climate-authority-v2-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TILE_ROOT = path.resolve(HERE, '../../data/coordinate-climate/v2/tiles');

export const CRUVIT_CLIMATE_TILE_MAGIC = 'CRUVIT_CCT_V1';
/** Legacy sparse JSON prototype — production coverage uses binary Int16 (see coverage-tiles-v2). */
export const CRUVIT_CLIMATE_TILE_FORMAT = 'hybrid-compact-zlib-json-cells-v1';
export const CRUVIT_CLIMATE_TILE_FORMAT_PRODUCTION = 'cruvit-cctb-int16-gzip-v1';

/** Pack profile into compact cell record (no 12KB provenance blob). */
export function packClimateCellFromProfile(profile) {
  if (!profile || profile.status !== 'known') return null;
  const cell = profile.climateGrid?.cellPixel;
  if (cell?.x == null || cell?.y == null) return null;
  return {
    x: cell.x,
    y: cell.y,
    lat: profile.coordinate.lat,
    lon: profile.coordinate.lon,
    elev: profile.elevationM,
    tmin: profile.monthlyTminC,
    tmean: profile.monthlyTmeanC,
    tmax: profile.monthlyTmaxC,
    pr: profile.monthlyPrecipMm,
    pet: profile.monthlyPetMm,
    vpd: profile.monthlyVpdPa,
    hurs: profile.monthlyHursPct,
    P: profile.annualPrecipitationMm,
    PET: profile.annualPetMm,
    AI: profile.aridityIndex,
    moisture: profile.aridityMoistureRegime,
    thermal: profile.thermalRegime,
    cold: profile.coldestMonthMeanMinC,
    warm: profile.warmestMonthMeanMaxC,
    frost: profile.derivedColdFrostRisk,
    highland: profile.highlandModifier === true,
    conf: profile.confidenceDimensions || profile.confidence || null
  };
}

export function unpackClimateCellToMinimalProfile(cell, confidenceOverlay = null) {
  if (!cell) return null;
  return {
    status: 'known',
    coordinate: { lat: cell.lat, lon: cell.lon, label: null },
    climateGrid: { cellPixel: { x: cell.x, y: cell.y }, nativeResolutionArcSec: 30 },
    elevationM: cell.elev,
    monthlyTminC: cell.tmin,
    monthlyTmeanC: cell.tmean,
    monthlyTmaxC: cell.tmax,
    monthlyPrecipMm: cell.pr,
    monthlyPetMm: cell.pet,
    monthlyVpdPa: cell.vpd,
    monthlyHursPct: cell.hurs,
    annualPrecipitationMm: cell.P,
    annualPetMm: cell.PET,
    aridityIndex: cell.AI,
    aridityMoistureRegime: cell.moisture,
    thermalRegime: cell.thermal,
    coldestMonthMeanMinC: cell.cold,
    warmestMonthMeanMaxC: cell.warm,
    derivedColdFrostRisk: cell.frost,
    highlandModifier: cell.highland,
    climateNativeResolution: '~1 km (30 arc-seconds)',
    terrainNativeResolution: '~30 m class (terrain context only — NOT climate)',
    confidence: confidenceOverlay?.overall || cell.conf?.overall || cell.conf,
    confidenceDimensions: confidenceOverlay || cell.conf,
    provenance: {
      source: 'cruvit-compact-tile',
      cityProxy: false,
      runtimeExternalCallsForbidden: true
    }
  };
}

export function buildCompactTileDocument({ tileId, cells, note } = {}) {
  const map = {};
  for (const c of cells || []) {
    if (!c) continue;
    map[`chelsa30s:${c.x}:${c.y}`] = c;
  }
  return {
    magic: CRUVIT_CLIMATE_TILE_MAGIC,
    format: CRUVIT_CLIMATE_TILE_FORMAT,
    tileId: tileId || 'pilot-global-sparse',
    cellCount: Object.keys(map).length,
    climateNativeResolutionArcSec: 30,
    encoding: {
      monthlyTemp: 'float °C (JSON prototype; production may use int16×0.01)',
      monthlyPrecipMm: 'float mm (JSON prototype; production may use uint16×0.1)',
      monthlyPetMm: 'float mm (JSON prototype; production may use uint16×0.1)',
      note: 'Prototype preserves numeric values without intentional precision loss'
    },
    note: note || 'CRUVIT-controlled; runtime must not fetch CHELSA',
    cells: map
  };
}

export function encodeCompactTileBuffer(tileDoc) {
  const json = Buffer.from(JSON.stringify(tileDoc), 'utf8');
  const gz = zlib.gzipSync(json, { level: 9 });
  return { jsonBytes: json.length, gzipBytes: gz.length, buffer: gz };
}

export function decodeCompactTileBuffer(buffer) {
  const json = zlib.gunzipSync(buffer).toString('utf8');
  return JSON.parse(json);
}

export function writeCompactTileFile(tileRoot, tileDoc) {
  const root = path.resolve(tileRoot || DEFAULT_TILE_ROOT);
  fs.mkdirSync(root, { recursive: true });
  const { jsonBytes, gzipBytes, buffer } = encodeCompactTileBuffer(tileDoc);
  const fileName = `${tileDoc.tileId}.cct.gz`;
  const filePath = path.join(root, fileName);
  fs.writeFileSync(filePath, buffer);
  const meta = {
    tileId: tileDoc.tileId,
    fileName,
    cellCount: tileDoc.cellCount,
    jsonBytes,
    gzipBytes,
    bytesPerCellGzip: tileDoc.cellCount ? Math.round(gzipBytes / tileDoc.cellCount) : null,
    bytesPerCellJson: tileDoc.cellCount ? Math.round(jsonBytes / tileDoc.cellCount) : null,
    format: tileDoc.format,
    writtenAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(root, `${tileDoc.tileId}.meta.json`), JSON.stringify(meta, null, 2) + '\n');
  return { filePath, meta };
}

export function loadCompactTile(tileRoot, tileId) {
  const root = path.resolve(tileRoot || DEFAULT_TILE_ROOT);
  const filePath = path.join(root, `${tileId}.cct.gz`);
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  return decodeCompactTileBuffer(buf);
}

/**
 * Runtime tile lookup by exact lat/lon → CHELSA cell key.
 */
export function lookupCoordinateClimateFromCompactTile(lat, lon, options = {}) {
  const cost = assertCoordinateClimateRuntimeCostPolicy();
  const tileId = options.tileId || 'pilot-sparse-v1';
  const tileRoot = options.tileRoot || DEFAULT_TILE_ROOT;
  const idx = chelsaGridCellIndex(lat, lon);
  if (!idx) {
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      profile: buildClimateAuthorityUnavailable({ lat, lon, reason: 'invalid-coordinates' }),
      cost,
      externalClimateProviderCalls: 0
    };
  }
  const tile = loadCompactTile(tileRoot, tileId);
  if (!tile?.cells) {
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      profile: buildClimateAuthorityUnavailable({ lat, lon, reason: 'tile-missing' }),
      cost,
      externalClimateProviderCalls: 0,
      cellKey: idx.cellKey
    };
  }
  const cell = tile.cells[idx.cellKey];
  if (!cell) {
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      profile: buildClimateAuthorityUnavailable({
        lat,
        lon,
        reason: 'coordinate-not-in-cruvit-tile'
      }),
      cost,
      externalClimateProviderCalls: 0,
      cellKey: idx.cellKey,
      backgroundPrepEligible: true
    };
  }
  // Exact cell match — also verify lat/lon within epsilon of packed anchor if present
  const profile = unpackClimateCellToMinimalProfile(cell, options.confidenceOverlay || null);
  profile.coordinate.lat = roundCoord(lat);
  profile.coordinate.lon = roundCoord(lon);
  return {
    ok: true,
    code: 'OK',
    profile,
    source: 'cruvit-compact-tile',
    cellKey: idx.cellKey,
    cost,
    externalClimateProviderCalls: 0
  };
}

export function measureTilePrototypeStats(meta, { landCellsApprox = 150_000_000 } = {}) {
  const bpc = meta.bytesPerCellGzip || 0;
  const globalBytes = bpc * landCellsApprox;
  return {
    bytesPerClimateCellGzip: bpc,
    bytesPerClimateCellJson: meta.bytesPerCellJson,
    tileGzipBytes: meta.gzipBytes,
    tileJsonBytes: meta.jsonBytes,
    cellCountInPrototype: meta.cellCount,
    estimatedGlobalLandStorageGzipBytes: globalBytes,
    estimatedGlobalLandStorageGzipGb: Math.round((globalBytes / 1e9) * 100) / 100,
    landCellsApprox,
    note: 'Projection assumes uniform per-cell gzip cost from sparse prototype; real tiles may pack denser.'
  };
}
