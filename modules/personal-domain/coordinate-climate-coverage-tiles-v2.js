/**
 * CRUVIT climate tile geometry + binary packing (coverage expansion).
 * Does not redesign CoordinateClimateProfile — packs/unpacks the same fields.
 *
 * Production format selection is decided by measured benchmark (see scripts).
 */

import zlib from 'node:zlib';
import {
  classifyUnepAridityFromIndex,
  highlandModifierFromElevation,
  structuralColdRiskFromColdestMonthMeanMinC,
  freezingRiskFromCold,
  thermalRegimeFromCoordinateEvidence,
  humidityRegimeFromMeanRh,
  coolSeasonSignalFromMonthlyTmin,
  alwaysHotSignalFromMonthlyTmin
} from './coordinate-climate-authority-v2-contract.js';
import { buildCoordinateClimateConfidenceV2 } from './coordinate-climate-confidence-v2-contract.js';
import { chelsaGridCellIndex } from './coordinate-climate-garden-hydrate-v2.js';

/** CHELSA global grid constants (must match garden-hydrate). */
export const CHELSA_BBOX = Object.freeze([
  -180.00013888885002,
  -90.00013888884999,
  179.99985967115003,
  83.99986041515001
]);
export const CHELSA_RES_DEG = 0.0083333333;
export const CHELSA_WIDTH = Math.round((CHELSA_BBOX[2] - CHELSA_BBOX[0]) / CHELSA_RES_DEG);
export const CHELSA_HEIGHT = Math.round((CHELSA_BBOX[3] - CHELSA_BBOX[1]) / CHELSA_RES_DEG);

/** Geographic coverage tile: N×N CHELSA cells (stable, partial-bake friendly). */
export const COVERAGE_TILE_CELLS = 64;
export const COVERAGE_TILE_SCHEMA_VERSION = 'cctb-i16-v1';
export const COVERAGE_FORMAT_JSON_GZIP = 'hybrid-compact-zlib-json-cells-v1';
export const COVERAGE_FORMAT_BINARY = 'cruvit-cctb-int16-gzip-v1';

export const MOISTURE_ENUM = Object.freeze({
  unknown: 0,
  'hyper-arid': 1,
  arid: 2,
  'semi-arid': 3,
  'dry-subhumid': 4,
  humid: 5
});
export const THERMAL_ENUM = Object.freeze({
  unknown: 0,
  'frost-prone': 1,
  'cool-highland': 2,
  'cool-seasonal': 3,
  'year-round-warm': 4,
  'mild-seasonal': 5
});
const MOISTURE_FROM = Object.fromEntries(Object.entries(MOISTURE_ENUM).map(([k, v]) => [v, k]));
const THERMAL_FROM = Object.fromEntries(Object.entries(THERMAL_ENUM).map(([k, v]) => [v, k]));

/** Fixed binary cell size (little-endian). */
export const BINARY_CELL_BYTES = 2 + 2 + 2 + // x,y,elev_dm
  12 * 2 * 3 + // tmin,tmean,tmax int16×0.01°C
  12 * 2 + // pr uint16×0.1mm
  12 * 2 + // pet uint16×0.1mm
  12 * 2 + // vpd uint16 Pa (clamped)
  12 * 2 + // hurs uint16×0.1%
  4 + 4 + // annual P, PET ×0.1mm uint32
  2 + // AI ×0.001 uint16
  1 + 1 + 1; // moisture, thermal, flags
// = 4+2+72+24+24+24+24+8+2+3 = 187 — pad to 188 for align
export const BINARY_CELL_STRIDE = 188;

export function cellCenterLatLon(x, y) {
  const lon = CHELSA_BBOX[0] + (x + 0.5) * CHELSA_RES_DEG;
  const lat = CHELSA_BBOX[3] - (y + 0.5) * CHELSA_RES_DEG;
  return { lat, lon };
}

export function coverageTileIndexFromCell(x, y, tileCells = COVERAGE_TILE_CELLS) {
  const tx = Math.floor(Number(x) / tileCells);
  const ty = Math.floor(Number(y) / tileCells);
  return {
    tx,
    ty,
    tileCells,
    tileKey: `chelsa30s-t${tileCells}:${tx}:${ty}`
  };
}

export function coverageTileIndexFromLatLon(lat, lon, tileCells = COVERAGE_TILE_CELLS) {
  const cell = chelsaGridCellIndex(lat, lon, CHELSA_BBOX, CHELSA_RES_DEG);
  if (!cell) return null;
  return { ...coverageTileIndexFromCell(cell.x, cell.y, tileCells), cell };
}

export function cellsInBbox(south, north, west, east) {
  const sw = chelsaGridCellIndex(south, west, CHELSA_BBOX, CHELSA_RES_DEG);
  const ne = chelsaGridCellIndex(north, east, CHELSA_BBOX, CHELSA_RES_DEG);
  if (!sw || !ne) return null;
  const x0 = Math.min(sw.x, ne.x);
  const x1 = Math.max(sw.x, ne.x);
  const y0 = Math.min(sw.y, ne.y);
  const y1 = Math.max(sw.y, ne.y);
  return { x0, x1, y0, y1, width: x1 - x0 + 1, height: y1 - y0 + 1, cellCount: (x1 - x0 + 1) * (y1 - y0 + 1) };
}

function clampInt(v, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function encodeTempC(c) {
  if (!Number.isFinite(c)) return 32767; // nodata
  return clampInt(c * 100, -32000, 32000);
}
function decodeTempC(i) {
  if (i === 32767) return null;
  return i / 100;
}
function encodeMm01(mm) {
  if (!Number.isFinite(mm) || mm < 0) return 65535;
  return clampInt(mm * 10, 0, 65534);
}
function decodeMm01(u) {
  if (u === 65535) return null;
  return u / 10;
}

/**
 * Pack one climate cell into BINARY_CELL_STRIDE bytes (little-endian).
 * Temps: int16 × 0.01°C (exact vs float JSON to 0.01).
 * Precip/PET: uint16 × 0.1 mm (matches CHELSA decode).
 */
export function packBinaryClimateCell(cell) {
  const buf = Buffer.alloc(BINARY_CELL_STRIDE);
  let o = 0;
  buf.writeUInt16LE(cell.x & 0xffff, o); o += 2;
  buf.writeUInt16LE(cell.y & 0xffff, o); o += 2;
  const elevDm = Number.isFinite(cell.elev) ? clampInt(cell.elev * 10, -32000, 32000) : 32767;
  buf.writeInt16LE(elevDm, o); o += 2;
  for (const arr of [cell.tmin, cell.tmean, cell.tmax]) {
    for (let m = 0; m < 12; m++) {
      buf.writeInt16LE(encodeTempC(arr?.[m]), o);
      o += 2;
    }
  }
  for (const arr of [cell.pr, cell.pet]) {
    for (let m = 0; m < 12; m++) {
      buf.writeUInt16LE(encodeMm01(arr?.[m]), o);
      o += 2;
    }
  }
  for (let m = 0; m < 12; m++) {
    const v = cell.vpd?.[m];
    buf.writeUInt16LE(Number.isFinite(v) ? clampInt(v, 0, 65534) : 65535, o);
    o += 2;
  }
  for (let m = 0; m < 12; m++) {
    buf.writeUInt16LE(encodeMm01(cell.hurs?.[m]), o); // ×0.1 % same helper
    o += 2;
  }
  buf.writeUInt32LE(Number.isFinite(cell.P) ? clampInt(cell.P * 10, 0, 0xfffffffe) : 0xffffffff, o);
  o += 4;
  buf.writeUInt32LE(Number.isFinite(cell.PET) ? clampInt(cell.PET * 10, 0, 0xfffffffe) : 0xffffffff, o);
  o += 4;
  buf.writeUInt16LE(Number.isFinite(cell.AI) ? clampInt(cell.AI * 1000, 0, 65534) : 65535, o);
  o += 2;
  buf.writeUInt8(MOISTURE_ENUM[cell.moisture] ?? 0, o); o += 1;
  buf.writeUInt8(THERMAL_ENUM[cell.thermal] ?? 0, o); o += 1;
  let flags = 0;
  if (cell.highland) flags |= 1;
  buf.writeUInt8(flags, o); o += 1;
  // pad to BINARY_CELL_STRIDE
  while (o < BINARY_CELL_STRIDE) {
    buf.writeUInt8(0, o);
    o += 1;
  }
  return buf;
}

export function unpackBinaryClimateCell(buf, offset = 0) {
  let o = offset;
  const x = buf.readUInt16LE(o); o += 2;
  const y = buf.readUInt16LE(o); o += 2;
  const elevRaw = buf.readInt16LE(o); o += 2;
  const elev = elevRaw === 32767 ? null : elevRaw / 10;
  const readTemps = () => {
    const a = [];
    for (let m = 0; m < 12; m++) {
      a.push(decodeTempC(buf.readInt16LE(o)));
      o += 2;
    }
    return a;
  };
  const tmin = readTemps();
  const tmean = readTemps();
  const tmax = readTemps();
  const readMm = () => {
    const a = [];
    for (let m = 0; m < 12; m++) {
      a.push(decodeMm01(buf.readUInt16LE(o)));
      o += 2;
    }
    return a;
  };
  const pr = readMm();
  const pet = readMm();
  const vpd = [];
  for (let m = 0; m < 12; m++) {
    const u = buf.readUInt16LE(o);
    o += 2;
    vpd.push(u === 65535 ? null : u);
  }
  const hurs = readMm();
  const Praw = buf.readUInt32LE(o); o += 4;
  const PETraw = buf.readUInt32LE(o); o += 4;
  const AIraw = buf.readUInt16LE(o); o += 2;
  const moisture = MOISTURE_FROM[buf.readUInt8(o)] || 'unknown'; o += 1;
  const thermal = THERMAL_FROM[buf.readUInt8(o)] || 'unknown'; o += 1;
  const flags = buf.readUInt8(o);
  const { lat, lon } = cellCenterLatLon(x, y);
  const P = Praw === 0xffffffff ? null : Praw / 10;
  const PET = PETraw === 0xffffffff ? null : PETraw / 10;
  const AI = AIraw === 65535 ? null : AIraw / 1000;
  const cold = tmin.includes(null) ? null : Math.min(...tmin);
  const warm = tmax.includes(null) ? null : Math.max(...tmax);
  return {
    x,
    y,
    lat,
    lon,
    elev,
    tmin,
    tmean,
    tmax,
    pr,
    pet,
    vpd,
    hurs,
    P,
    PET,
    AI,
    moisture,
    thermal,
    cold,
    warm,
    highland: !!(flags & 1),
    frost: null
  };
}

export function measurePackPrecisionDelta(originalCell, packedBuf) {
  const u = unpackBinaryClimateCell(packedBuf);
  const deltas = [];
  const push = (name, a, b) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    deltas.push({ name, abs: Math.abs(a - b) });
  };
  for (let m = 0; m < 12; m++) {
    push(`tmin[${m}]`, originalCell.tmin[m], u.tmin[m]);
    push(`pr[${m}]`, originalCell.pr[m], u.pr[m]);
    push(`pet[${m}]`, originalCell.pet[m], u.pet[m]);
  }
  push('P', originalCell.P, u.P);
  push('PET', originalCell.PET, u.PET);
  push('AI', originalCell.AI, u.AI);
  push('elev', originalCell.elev, u.elev);
  const maxAbs = deltas.reduce((m, d) => Math.max(m, d.abs), 0);
  return { maxAbsDelta: maxAbs, sampleCount: deltas.length, withinTemp001: maxAbs <= 0.011 };
}

/** Build derived enums from monthly series (bake-time). */
export function deriveCellEnumsFromSeries({ tmin, tmax, pr, pet, hurs, elev }) {
  const annualP = pr.every((v) => Number.isFinite(v))
    ? Math.round(pr.reduce((a, b) => a + b, 0) * 10) / 10
    : null;
  const annualPet = pet.every((v) => Number.isFinite(v))
    ? Math.round(pet.reduce((a, b) => a + b, 0) * 10) / 10
    : null;
  const AI =
    annualP != null && annualPet != null && annualPet > 0
      ? Math.round((annualP / annualPet) * 1000) / 1000
      : null;
  const moisture = AI != null ? classifyUnepAridityFromIndex(AI) : 'unknown';
  const cold = tmin.every((v) => Number.isFinite(v)) ? Math.min(...tmin) : null;
  const warm = tmax.every((v) => Number.isFinite(v)) ? Math.max(...tmax) : null;
  const sc = structuralColdRiskFromColdestMonthMeanMinC(cold);
  const fr = freezingRiskFromCold(cold, sc);
  const thermal = thermalRegimeFromCoordinateEvidence({
    coldestMonthMeanMinC: cold,
    elevationM: elev,
    structuralColdRisk: sc,
    freezingRisk: fr
  });
  const highland = highlandModifierFromElevation(elev).highland === true;
  const meanRh =
    hurs.filter((v) => Number.isFinite(v)).length > 0
      ? hurs.filter((v) => Number.isFinite(v)).reduce((a, b) => a + b, 0) /
        hurs.filter((v) => Number.isFinite(v)).length
      : null;
  const humidityRegime = humidityRegimeFromMeanRh(meanRh);
  return {
    P: annualP,
    PET: annualPet,
    AI,
    moisture,
    thermal,
    cold,
    warm,
    highland,
    humidityRegime,
    // ATMOSPHERIC only — do not blend moistureRegime into humiditySignal
    humiditySignal: humidityRegime === 'unknown' ? null : humidityRegime,
    structuralColdRisk: sc,
    freezingRisk: fr,
    coolSeasonSignal: coolSeasonSignalFromMonthlyTmin(tmin),
    alwaysHot: alwaysHotSignalFromMonthlyTmin(tmin)
  };
}

export function cellToMinimalProfile(cell) {
  // Re-derive enums from series so coverage profiles match pilot authority fields
  // (binary packs moisture/thermal only; freezingRisk/humidity/chill must be restored).
  const derived =
    Array.isArray(cell.tmin) && Array.isArray(cell.pr)
      ? deriveCellEnumsFromSeries({
          tmin: cell.tmin,
          tmax: cell.tmax,
          pr: cell.pr,
          pet: cell.pet,
          hurs: cell.hurs,
          elev: cell.elev
        })
      : null;
  const conf = buildCoordinateClimateConfidenceV2({
    profile: {
      missingFields: [],
      climateGrid: { cellPixel: { x: cell.x, y: cell.y } },
      elevationM: cell.elev,
      annualPetMm: cell.PET ?? derived?.PET,
      annualPrecipitationMm: cell.P ?? derived?.P,
      coldestMonthMeanMinC: cell.cold ?? derived?.cold,
      warmestMonthMeanMaxC: cell.warm ?? derived?.warm,
      climateNativeResolution: '~1 km (30 arc-seconds)'
    },
    qaRecord: null
  });
  return {
    status: 'known',
    coordinate: { lat: cell.lat, lon: cell.lon, label: null },
    climateGrid: {
      cellPixel: { x: cell.x, y: cell.y },
      nativeResolutionArcSec: 30,
      nativeResolutionLabel: '~1 km (30 arc-seconds)'
    },
    elevationM: cell.elev,
    monthlyTminC: cell.tmin,
    monthlyTmeanC: cell.tmean,
    monthlyTmaxC: cell.tmax,
    monthlyPrecipMm: cell.pr,
    monthlyPetMm: cell.pet,
    monthlyVpdPa: cell.vpd,
    monthlyHursPct: cell.hurs,
    annualPrecipitationMm: cell.P ?? derived?.P,
    annualPetMm: cell.PET ?? derived?.PET,
    aridityIndex: cell.AI ?? derived?.AI,
    aridityMoistureRegime: cell.moisture ?? derived?.moisture,
    thermalRegime: cell.thermal ?? derived?.thermal,
    coldestMonthMeanMinC: cell.cold ?? derived?.cold,
    warmestMonthMeanMaxC: cell.warm ?? derived?.warm,
    highlandModifier: cell.highland ?? derived?.highland,
    humidityRegime: derived?.humidityRegime ?? null,
    humiditySignal: derived?.humiditySignal ?? null,
    structuralColdRisk: derived?.structuralColdRisk ?? null,
    freezingRisk: derived?.freezingRisk ?? null,
    coolSeasonSignal: derived?.coolSeasonSignal ?? null,
    alwaysHot: derived?.alwaysHot ?? null,
    climateNativeResolution: '~1 km (30 arc-seconds)',
    terrainNativeResolution: '~30 m class (terrain context only — NOT climate)',
    confidence: conf.overall,
    confidenceDimensions: conf.dimensions,
    localRepresentativeness: conf.localRepresentativeness,
    provenance: {
      source: 'cruvit-coverage-tile',
      format: COVERAGE_FORMAT_BINARY,
      cityProxy: false,
      runtimeExternalCallsForbidden: true,
      climateNativeResolution: '~1 km (30 arc-seconds)',
      terrainNativeResolution: '~30 m class where sampled at bake'
    }
  };
}

/**
 * Encode a coverage tile: header JSON + concatenated binary cells, then gzip.
 */
export function encodeBinaryCoverageTile({ tileKey, tx, ty, cells, bakeVersion, regionId }) {
  const header = {
    magic: 'CRUVIT_CCTB',
    format: COVERAGE_FORMAT_BINARY,
    schemaVersion: COVERAGE_TILE_SCHEMA_VERSION,
    tileKey,
    tx,
    ty,
    tileCells: COVERAGE_TILE_CELLS,
    cellCount: cells.length,
    cellStride: BINARY_CELL_STRIDE,
    bakeVersion: bakeVersion || null,
    regionId: regionId || null,
    climateNativeResolutionArcSec: 30
  };
  const headerJson = Buffer.from(JSON.stringify(header), 'utf8');
  const headerLen = Buffer.alloc(4);
  headerLen.writeUInt32LE(headerJson.length, 0);
  const body = Buffer.concat(cells.map((c) => (Buffer.isBuffer(c) ? c : packBinaryClimateCell(c))));
  const raw = Buffer.concat([headerLen, headerJson, body]);
  const gzip = zlib.gzipSync(raw, { level: 9 });
  return {
    header,
    rawBytes: raw.length,
    gzipBytes: gzip.length,
    bytesPerCellGzip: cells.length ? gzip.length / cells.length : null,
    buffer: gzip
  };
}

export function decodeBinaryCoverageTile(gzipBuf) {
  const raw = zlib.gunzipSync(gzipBuf);
  const headerLen = raw.readUInt32LE(0);
  const header = JSON.parse(raw.subarray(4, 4 + headerLen).toString('utf8'));
  const body = raw.subarray(4 + headerLen);
  const stride = header.cellStride || BINARY_CELL_STRIDE;
  const cells = [];
  const byKey = {};
  for (let i = 0; i + stride <= body.length; i += stride) {
    const cell = unpackBinaryClimateCell(body, i);
    cells.push(cell);
    byKey[`chelsa30s:${cell.x}:${cell.y}`] = cell;
  }
  return { header, cells, byKey };
}

export function buildCoverageManifest({
  regionId,
  bakeVersion,
  schemaVersion = COVERAGE_TILE_SCHEMA_VERSION,
  format = COVERAGE_FORMAT_BINARY,
  bounds,
  tiles,
  sourceVersions,
  checksums
} = {}) {
  return {
    kind: 'cruvit-climate-coverage-manifest-v1',
    regionId,
    bakeVersion,
    schemaVersion,
    format,
    bounds,
    climateNativeResolution: '~1 km (CHELSA 30 arc-seconds)',
    terrainNativeResolution: '~30 m class where available (NOT climate)',
    sourceVersions: sourceVersions || {
      chelsa: '2.1-climatologies-1981-2010',
      pet: 'pet_penman raw/100',
      terrain: 'aws-elevation-tiles-terrarium'
    },
    tileCount: Array.isArray(tiles) ? tiles.length : 0,
    tiles: tiles || [],
    checksums: checksums || {},
    runtimeExternalAcquisitionForbidden: true,
    objectStorage: {
      prepared: true,
      uploaded: false,
      note: 'Contract only — no full-world upload in this checkpoint'
    },
    generatedAt: new Date().toISOString()
  };
}
