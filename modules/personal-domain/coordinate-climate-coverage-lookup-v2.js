/**
 * Runtime lookup against CRUVIT coverage tiles (binary or legacy JSON gzip).
 * Never calls CHELSA / terrain / Open-Meteo structural.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  CLIMATE_AUTHORITY_UNAVAILABLE,
  assertCoordinateClimateRuntimeCostPolicy,
  buildClimateAuthorityUnavailable,
  roundCoord
} from './coordinate-climate-authority-v2-contract.js';
import {
  coverageTileIndexFromLatLon,
  decodeBinaryCoverageTile,
  cellToMinimalProfile,
  COVERAGE_FORMAT_BINARY
} from './coordinate-climate-coverage-tiles-v2.js';
import { lookupCoordinateClimateFromCompactTile } from './coordinate-climate-compact-tiles-v2.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_COVERAGE_ROOT = path.resolve(HERE, '../../data/coordinate-climate/v2/coverage');

const _tileCache = new Map();
const _manifestCache = new Map();

export function resolveCoverageRoot(explicit) {
  return explicit ? path.resolve(explicit) : DEFAULT_COVERAGE_ROOT;
}

export function loadCoverageManifest(coverageRoot, regionId) {
  const root = resolveCoverageRoot(coverageRoot);
  const key = `${root}::${regionId}`;
  if (_manifestCache.has(key)) return _manifestCache.get(key);
  const p = path.join(root, regionId, 'manifest.json');
  if (!fs.existsSync(p)) return null;
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  _manifestCache.set(key, m);
  return m;
}

export function loadBinaryCoverageTileFile(filePath) {
  if (_tileCache.has(filePath)) return _tileCache.get(filePath);
  if (!fs.existsSync(filePath)) return null;
  const decoded = decodeBinaryCoverageTile(fs.readFileSync(filePath));
  _tileCache.set(filePath, decoded);
  return decoded;
}

export function clearCoverageRuntimeCaches() {
  _tileCache.clear();
  _manifestCache.clear();
}

/**
 * Exact lat/lon → coverage tile → CHELSA cell profile.
 */
export function lookupCoordinateClimateFromCoverage(lat, lon, options = {}) {
  const cost = assertCoordinateClimateRuntimeCostPolicy();
  const ext = {
    chelsaExternalCalls: 0,
    terrainProviderExternalCalls: 0,
    openMeteoStructuralCalls: 0,
    era5ExternalCalls: 0,
    aiLlmCalls: 0,
    externalClimateProviderCalls: 0
  };

  const tip = coverageTileIndexFromLatLon(lat, lon);
  if (!tip) {
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      profile: buildClimateAuthorityUnavailable({ lat, lon, reason: 'invalid-coordinates' }),
      cost: { ...cost, ...ext },
      ...ext
    };
  }

  const root = resolveCoverageRoot(options.coverageRoot);
  const regionId = options.regionId || 'emed-n-israel-v1';
  const manifest = loadCoverageManifest(root, regionId);
  if (!manifest) {
    // Fallback: legacy pilot sparse JSON tile (still CRUVIT-local)
    if (options.allowLegacyPilot !== false) {
      const legacy = lookupCoordinateClimateFromCompactTile(lat, lon, {
        tileRoot: options.legacyTileRoot,
        tileId: options.legacyTileId || 'pilot-sparse-v1'
      });
      return { ...legacy, ...ext, externalClimateProviderCalls: 0 };
    }
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      profile: buildClimateAuthorityUnavailable({ lat, lon, reason: 'coverage-manifest-missing' }),
      cost: { ...cost, ...ext },
      ...ext,
      tileKey: tip.tileKey
    };
  }

  // Bounds check (coverage miss without provider call)
  const b = manifest.bounds;
  if (b && (lat < b.south || lat > b.north || lon < b.west || lon > b.east)) {
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      profile: buildClimateAuthorityUnavailable({
        lat,
        lon,
        reason: 'outside-coverage-bounds'
      }),
      cost: { ...cost, ...ext },
      ...ext,
      tileKey: tip.tileKey
    };
  }

  const tileMeta = (manifest.tiles || []).find((t) => t.tileKey === tip.tileKey);
  if (!tileMeta) {
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      profile: buildClimateAuthorityUnavailable({
        lat,
        lon,
        reason: 'tile-not-in-manifest'
      }),
      cost: { ...cost, ...ext },
      ...ext,
      tileKey: tip.tileKey,
      backgroundPrepEligible: true
    };
  }

  const tilePath = path.join(root, regionId, 'tiles', tileMeta.fileName);
  const decoded = loadBinaryCoverageTileFile(tilePath);
  if (!decoded) {
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      profile: buildClimateAuthorityUnavailable({ lat, lon, reason: 'tile-file-missing' }),
      cost: { ...cost, ...ext },
      ...ext,
      tileKey: tip.tileKey
    };
  }

  const cellKey = tip.cell.cellKey;
  const cell = decoded.byKey[cellKey];
  if (!cell) {
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      profile: buildClimateAuthorityUnavailable({
        lat,
        lon,
        reason: 'cell-not-in-tile'
      }),
      cost: { ...cost, ...ext },
      ...ext,
      tileKey: tip.tileKey,
      cellKey
    };
  }

  const profile = cellToMinimalProfile(cell);
  profile.coordinate.lat = roundCoord(lat);
  profile.coordinate.lon = roundCoord(lon);
  profile.provenance.bakeVersion = manifest.bakeVersion;
  profile.provenance.regionId = regionId;
  profile.provenance.format = manifest.format || COVERAGE_FORMAT_BINARY;

  return {
    ok: true,
    code: 'OK',
    profile,
    source: 'cruvit-coverage-tile',
    tileKey: tip.tileKey,
    cellKey,
    cost: { ...cost, ...ext },
    ...ext
  };
}

export function sha256File(filePath) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}
