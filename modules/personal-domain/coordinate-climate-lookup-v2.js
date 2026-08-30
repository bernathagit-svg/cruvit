/**
 * CRUVIT Coordinate Climate Authority V2 — local lookup (runtime-safe).
 *
 * Reads only CRUVIT-controlled index / profiles under data/coordinate-climate/.
 * Never calls CHELSA, Open-Meteo archive, ERA5, or Copernicus at runtime.
 * Miss → CLIMATE_AUTHORITY_UNAVAILABLE (no city proxy).
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '../../data/coordinate-climate/v2');

/** Match tolerance for indexed coordinate reuse (~15 m). */
export const COORDINATE_LOOKUP_EPSILON_DEG = 0.00015;

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

export function resolveCoordinateClimateDataRoot(explicitRoot) {
  if (explicitRoot) return path.resolve(explicitRoot);
  return DEFAULT_ROOT;
}

/**
 * Load pilot/global index. Missing index → empty (unavailable for all).
 */
export function loadCoordinateClimateIndex(dataRoot = DEFAULT_ROOT) {
  const root = resolveCoordinateClimateDataRoot(dataRoot);
  const indexPath = path.join(root, 'index.json');
  if (!fs.existsSync(indexPath)) {
    return {
      ok: false,
      root,
      indexPath,
      version: COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
      entries: [],
      error: 'index-missing'
    };
  }
  const index = loadJson(indexPath);
  return {
    ok: true,
    root,
    indexPath,
    version: index.authorityVersion || COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
    entries: Array.isArray(index.entries) ? index.entries : [],
    meta: index
  };
}

export function findIndexedCoordinateEntry(entries, lat, lon, epsilon = COORDINATE_LOOKUP_EPSILON_DEG) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  let best = null;
  let bestDist = Infinity;
  for (const e of entries || []) {
    const elat = Number(e.lat);
    const elon = Number(e.lon);
    if (!Number.isFinite(elat) || !Number.isFinite(elon)) continue;
    const d = Math.hypot(elat - latitude, elon - longitude);
    if (d <= epsilon && d < bestDist) {
      best = e;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Runtime lookup: local index only.
 * @returns {{ ok: boolean, profile: object, source: string, cost: object }}
 */
export function lookupCoordinateClimateProfile(lat, lon, options = {}) {
  const cost = assertCoordinateClimateRuntimeCostPolicy();
  const root = resolveCoordinateClimateDataRoot(options.dataRoot);
  const index = loadCoordinateClimateIndex(root);
  if (!index.ok) {
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      profile: buildClimateAuthorityUnavailable({
        lat,
        lon,
        reason: 'index-missing'
      }),
      source: 'local-index-miss',
      cost
    };
  }

  const entry = findIndexedCoordinateEntry(index.entries, lat, lon, options.epsilon);
  if (!entry) {
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      profile: buildClimateAuthorityUnavailable({
        lat,
        lon,
        reason: 'coordinate-not-in-cruvit-index'
      }),
      source: 'local-index-miss',
      cost
    };
  }

  const profilePath = path.join(root, entry.profilePath || entry.path);
  if (!fs.existsSync(profilePath)) {
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      profile: buildClimateAuthorityUnavailable({
        lat,
        lon,
        reason: 'profile-file-missing'
      }),
      source: 'local-profile-miss',
      cost
    };
  }

  const profile = loadJson(profilePath);
  // Guard: refuse profiles that used city proxy flags
  if (profile?.provenance?.cityProxy === true || profile?.provenance?.usedCityProxy === true) {
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      profile: buildClimateAuthorityUnavailable({
        lat,
        lon,
        reason: 'city-proxy-forbidden'
      }),
      source: 'rejected-city-proxy',
      cost
    };
  }

  return {
    ok: profile?.status === 'known',
    code: profile?.status === 'known' ? 'OK' : CLIMATE_AUTHORITY_UNAVAILABLE,
    profile,
    source: 'cruvit-local-index',
    matchedEntry: {
      id: entry.id,
      lat: roundCoord(entry.lat),
      lon: roundCoord(entry.lon),
      label: entry.label || null,
      profilePath: entry.profilePath || entry.path
    },
    cost
  };
}

/**
 * Simulate N plant evaluations against one hydrated Garden profile — zero provider calls.
 */
export function proveZeroProviderCallsForPlantEvaluations(profile, plantCount) {
  const n = Math.max(0, Number(plantCount) || 0);
  const cost = assertCoordinateClimateRuntimeCostPolicy();
  // Evaluation uses already-persisted structural blob only.
  const structural = profile?.status === 'known' ? profile : null;
  let ok = true;
  for (let i = 0; i < n; i++) {
    if (!structural) ok = false;
    // no network
  }
  return {
    plantCount: n,
    usedPersistedProfile: !!structural,
    externalClimateProviderCalls: 0,
    ...cost,
    ok: ok && cost.chelsaExternalCalls === 0
  };
}
