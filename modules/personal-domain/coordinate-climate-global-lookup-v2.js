/**
 * CRUVIT Global Coordinate Climate Coverage V1 — O(1) deterministic lookup.
 *
 * lat/lon → tile key → local tile file → cell → profile
 * No city proxy. No runtime CHELSA/external climate API.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLIMATE_AUTHORITY_UNAVAILABLE,
  COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
  assertCoordinateClimateRuntimeCostPolicy,
  buildClimateAuthorityUnavailable,
  roundCoord
} from './coordinate-climate-authority-v2-contract.js';
import {
  coverageTileIndexFromLatLon,
  decodeBinaryCoverageTile,
  cellToMinimalProfile,
  COVERAGE_FORMAT_BINARY,
  COVERAGE_TILE_CELLS,
  CHELSA_RES_DEG,
  tileFileNameFromKey
} from './coordinate-climate-coverage-tiles-v2.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_GLOBAL_ROOT = path.resolve(HERE, '../../data/coordinate-climate/v2/coverage/global-v1');

const _tileCache = new Map();
const _manifestCache = new Map();

export const GLOBAL_BAKE_ID_DEFAULT = 'bake-2026-09-01-global-v1-vpd-scale';
export const GLOBAL_PACK_ID = 'global-v1';

export function resolveGlobalCoverageRoot(explicit) {
  return explicit ? path.resolve(explicit) : DEFAULT_GLOBAL_ROOT;
}

export function validateWgs84Coordinates(lat, lon) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, reason: 'invalid-coordinates' };
  }
  if (latitude < -90 || latitude > 90) {
    return { ok: false, reason: 'latitude-out-of-range' };
  }
  if (longitude < -180 || longitude > 180) {
    return { ok: false, reason: 'longitude-out-of-range' };
  }
  return { ok: true, lat: latitude, lon: longitude };
}

export function loadGlobalManifest(globalRoot) {
  const root = resolveGlobalCoverageRoot(globalRoot);
  if (_manifestCache.has(root)) return _manifestCache.get(root);
  const p = path.join(root, 'manifest.json');
  if (!fs.existsSync(p)) return null;
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  _manifestCache.set(root, m);
  return m;
}

export function clearGlobalRuntimeCaches() {
  _tileCache.clear();
  _manifestCache.clear();
}

export function globalTilePath(globalRoot, tileKey) {
  return path.join(resolveGlobalCoverageRoot(globalRoot), 'tiles', tileFileNameFromKey(tileKey));
}

/**
 * Synchronous global lookup (filesystem tile read).
 */
export function lookupCoordinateClimateGlobal(lat, lon, options = {}) {
  const cost = assertCoordinateClimateRuntimeCostPolicy();
  const ext = {
    chelsaExternalCalls: 0,
    terrainProviderExternalCalls: 0,
    openMeteoStructuralCalls: 0,
    era5ExternalCalls: 0,
    aiLlmCalls: 0,
    externalClimateProviderCalls: 0
  };

  const v = validateWgs84Coordinates(lat, lon);
  if (!v.ok) {
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      profile: buildClimateAuthorityUnavailable({ lat, lon, reason: v.reason }),
      cost: { ...cost, ...ext },
      ...ext,
      reason: v.reason
    };
  }

  const tip = coverageTileIndexFromLatLon(v.lat, v.lon);
  if (!tip) {
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      profile: buildClimateAuthorityUnavailable({ lat: v.lat, lon: v.lon, reason: 'grid-index-failed' }),
      cost: { ...cost, ...ext },
      ...ext
    };
  }

  const manifest = loadGlobalManifest(options.globalRoot);
  if (!manifest && options.requireManifest !== false) {
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      profile: buildClimateAuthorityUnavailable({
        lat: v.lat,
        lon: v.lon,
        reason: 'global-manifest-missing'
      }),
      cost: { ...cost, ...ext },
      ...ext,
      tileKey: tip.tileKey
    };
  }

  const tilePath = globalTilePath(options.globalRoot, tip.tileKey);
  if (!fs.existsSync(tilePath)) {
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      profile: buildClimateAuthorityUnavailable({
        lat: v.lat,
        lon: v.lon,
        reason: 'tile-not-baked-or-ocean-nodata'
      }),
      cost: { ...cost, ...ext },
      ...ext,
      tileKey: tip.tileKey,
      cellKey: tip.cell.cellKey
    };
  }

  let decoded;
  const cacheKey = tilePath;
  if (_tileCache.has(cacheKey)) {
    decoded = _tileCache.get(cacheKey);
  } else {
    try {
      decoded = decodeBinaryCoverageTile(fs.readFileSync(tilePath));
      _tileCache.set(cacheKey, decoded);
    } catch (err) {
      return {
        ok: false,
        code: CLIMATE_AUTHORITY_UNAVAILABLE,
        profile: buildClimateAuthorityUnavailable({
          lat: v.lat,
          lon: v.lon,
          reason: 'tile-decode-failed'
        }),
        cost: { ...cost, ...ext },
        ...ext,
        tileKey: tip.tileKey,
        decodeError: String(err?.message || err)
      };
    }
  }

  const cell = decoded.byKey[tip.cell.cellKey];
  if (!cell) {
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      profile: buildClimateAuthorityUnavailable({
        lat: v.lat,
        lon: v.lon,
        reason: 'cell-nodata-in-tile'
      }),
      cost: { ...cost, ...ext },
      ...ext,
      tileKey: tip.tileKey,
      cellKey: tip.cell.cellKey
    };
  }

  const profile = cellToMinimalProfile(cell);
  profile.coordinate.lat = roundCoord(v.lat);
  profile.coordinate.lon = roundCoord(v.lon);
  profile.authorityVersion = manifest?.authorityVersion || COORDINATE_CLIMATE_AUTHORITY_V2_VERSION;
  profile.provenance.bakeVersion = manifest?.globalBakeId || manifest?.bakeVersion || null;
  profile.provenance.regionId = GLOBAL_PACK_ID;
  profile.provenance.format = manifest?.format || COVERAGE_FORMAT_BINARY;
  profile.provenance.lookupPath = 'global-tile-o1';
  profile.provenance.tileKey = tip.tileKey;
  profile.provenance.cellKey = tip.cell.cellKey;

  return {
    ok: true,
    code: 'OK',
    profile,
    source: 'cruvit-global-coverage-tile',
    tileKey: tip.tileKey,
    cellKey: tip.cell.cellKey,
    manifestSha256: manifest?.manifestSha256 || null,
    globalBakeId: manifest?.globalBakeId || null,
    cost: { ...cost, ...ext },
    ...ext,
    lookup: {
      tx: tip.tx,
      ty: tip.ty,
      cellX: tip.cell.x,
      cellY: tip.cell.y,
      tileCells: COVERAGE_TILE_CELLS,
      chelsaResDeg: CHELSA_RES_DEG
    }
  };
}
