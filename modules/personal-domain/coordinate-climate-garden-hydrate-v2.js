/**
 * Garden hydrate → Coordinate Climate Authority V2 (runtime-safe).
 *
 * Confirmed Garden lat/lon → CRUVIT local V2 lookup → structural persistence fields.
 * Never calls CHELSA / terrain / ERA5 / Open-Meteo structural providers.
 * Miss → CLIMATE_AUTHORITY_UNAVAILABLE (+ optional background prep enqueue record).
 */

import {
  CLIMATE_AUTHORITY_UNAVAILABLE,
  COORDINATE_CLIMATE_AUTHORITY_V2_VERSION,
  assertCoordinateClimateRuntimeCostPolicy,
  coordinateClimateProfileToStructuralPersistence,
  buildClimateAuthorityUnavailable
} from './coordinate-climate-authority-v2-contract.js';
import { lookupCoordinateClimateProfile } from './coordinate-climate-lookup-v2.js';
import { buildStructuralClimateServerFields } from './structural-climate-persistence-contract.js';

/** Frozen resolution contract labels (never claim 30 m climate). */
export const RESOLUTION_CONTRACT_V2 = Object.freeze({
  CLIMATE_NATIVE_RESOLUTION: '~1 km (CHELSA 30 arc-seconds)',
  TERRAIN_NATIVE_RESOLUTION: '~30 m class (terrain context only — NOT climate)',
  DERIVED_COORDINATE_PROFILE: 'CRUVIT interpretation for exact lat/lon from native climate cell + terrain elevation',
  GARDEN_CONTEXT: 'User-specific planting-site conditions (separate from climate authority)'
});

/** Selected global storage architecture (production). */
export const CRUVIT_CLIMATE_STORAGE_ARCHITECTURE_V2 = Object.freeze({
  id: 'hybrid-compact-derived-cells-prebaked',
  name: 'CRUVIT compact derived climate cells (pre-baked / scheduled)',
  runtimeReads: 'CRUVIT-controlled index + cell/profile JSON only',
  forbidsRuntimeExternalCogReads: true,
  forbidsUserTriggeredMaterialization: true,
  materialization: 'central ingest / scheduled background bake only',
  cellKeying: 'CHELSA 30-arcsec grid indices (deterministic lat/lon → cell)',
  rationale:
    'Preserves authoritative CHELSA cell values, avoids multi-TB naive per-cell dumps and avoids full global COG mirrors in the hot path; sparse pre-baked cells scale with prepared Gardens/regions.'
});

const _prepQueue = [];
const _runtimeCounters = {
  chelsaExternalCalls: 0,
  terrainProviderExternalCalls: 0,
  era5ExternalCalls: 0,
  openMeteoStructuralCalls: 0,
  localLookups: 0,
  unavailable: 0
};

export function getCoordinateClimateRuntimeCounters() {
  return { ..._runtimeCounters, ...assertCoordinateClimateRuntimeCostPolicy() };
}

export function resetCoordinateClimateRuntimeCounters() {
  _runtimeCounters.chelsaExternalCalls = 0;
  _runtimeCounters.terrainProviderExternalCalls = 0;
  _runtimeCounters.era5ExternalCalls = 0;
  _runtimeCounters.openMeteoStructuralCalls = 0;
  _runtimeCounters.localLookups = 0;
  _runtimeCounters.unavailable = 0;
}

export function drainBackgroundClimatePrepQueue() {
  const items = _prepQueue.splice(0, _prepQueue.length);
  return items;
}

export function enqueueBackgroundClimatePrepNeed({ lat, lon, reason, label } = {}) {
  const item = {
    lat: Number(lat),
    lon: Number(lon),
    label: label || null,
    reason: String(reason || 'coordinate-not-in-cruvit-index'),
    enqueuedAt: new Date().toISOString(),
    note: 'Background central preparation only — does not trigger external fetch inline'
  };
  _prepQueue.push(item);
  return item;
}

/**
 * Production structural authority for a Garden coordinate.
 * @returns {{
 *   ok: boolean,
 *   code: string,
 *   structuralClimate: object|null,
 *   serverFields: object,
 *   profile: object|null,
 *   cost: object,
 *   prepEnqueued: object|null
 * }}
 */
export function resolveGardenStructuralClimateFromCoordinateV2(lat, lon, options = {}) {
  const cost = assertCoordinateClimateRuntimeCostPolicy();
  _runtimeCounters.localLookups += 1;

  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    _runtimeCounters.unavailable += 1;
    const profile = buildClimateAuthorityUnavailable({
      lat,
      lon,
      reason: 'invalid-coordinates'
    });
    const structural = coordinateClimateProfileToStructuralPersistence(profile);
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      structuralClimate: structural,
      serverFields: buildStructuralClimateServerFields(structural),
      profile,
      cost: getCoordinateClimateRuntimeCounters(),
      prepEnqueued: null,
      resolutionContract: RESOLUTION_CONTRACT_V2
    };
  }

  // Reuse known matching Garden structural if already V2 and coords match.
  const existing = options.existingStructural;
  if (
    existing &&
    typeof existing === 'object' &&
    existing.status === 'known' &&
    String(existing.provenance?.provider || '').includes('coordinate-climate-authority-v2')
  ) {
    const pLat = Number(existing.provenance?.lat);
    const pLon = Number(existing.provenance?.lon);
    if (
      Number.isFinite(pLat) &&
      Number.isFinite(pLon) &&
      Math.abs(pLat - latitude) < 0.00015 &&
      Math.abs(pLon - longitude) < 0.00015
    ) {
      return {
        ok: true,
        code: 'REUSE_PERSISTED_V2',
        structuralClimate: existing,
        serverFields: buildStructuralClimateServerFields(existing),
        profile: existing.coordinateClimateV2 || null,
        cost: getCoordinateClimateRuntimeCounters(),
        prepEnqueued: null,
        resolutionContract: RESOLUTION_CONTRACT_V2
      };
    }
  }

  const lookup = lookupCoordinateClimateProfile(latitude, longitude, {
    dataRoot: options.dataRoot
  });

  if (!lookup.ok) {
    _runtimeCounters.unavailable += 1;
    const prep =
      options.enqueuePrep === false
        ? null
        : enqueueBackgroundClimatePrepNeed({
            lat: latitude,
            lon: longitude,
            label: options.label,
            reason: lookup.profile?.reason || lookup.code
          });
    const structural = coordinateClimateProfileToStructuralPersistence(lookup.profile);
    return {
      ok: false,
      code: CLIMATE_AUTHORITY_UNAVAILABLE,
      structuralClimate: structural,
      serverFields: buildStructuralClimateServerFields(structural),
      profile: lookup.profile,
      cost: getCoordinateClimateRuntimeCounters(),
      prepEnqueued: prep,
      resolutionContract: RESOLUTION_CONTRACT_V2
    };
  }

  const structural = coordinateClimateProfileToStructuralPersistence(lookup.profile);
  return {
    ok: true,
    code: 'OK',
    structuralClimate: structural,
    serverFields: buildStructuralClimateServerFields(structural),
    profile: lookup.profile,
    cost: getCoordinateClimateRuntimeCounters(),
    prepEnqueued: null,
    resolutionContract: RESOLUTION_CONTRACT_V2,
    matchedEntry: lookup.matchedEntry || null
  };
}

/**
 * Hard rule: Open-Meteo / CHELSA structural acquisition is forbidden on user runtime paths.
 */
export function assertNoExternalStructuralAcquisitionOnUserRuntime() {
  return {
    openMeteoStructuralAllowed: false,
    chelsaExternalAllowed: false,
    terrainExternalAllowed: false,
    era5ExternalAllowed: false,
    authority: 'coordinate-climate-authority-v2-local-lookup',
    onMiss: CLIMATE_AUTHORITY_UNAVAILABLE,
    version: COORDINATE_CLIMATE_AUTHORITY_V2_VERSION
  };
}

/** Deterministic CHELSA 30" cell indices for exact lat/lon. */
export function chelsaGridCellIndex(lat, lon, bbox = [-180.00013888885002, -90.00013888884999, 179.99985967115003, 83.99986041515001], res = 0.0083333333) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const width = Math.round((bbox[2] - bbox[0]) / res);
  const height = Math.round((bbox[3] - bbox[1]) / res);
  const x = Math.min(width - 1, Math.max(0, Math.floor((longitude - bbox[0]) / res)));
  const y = Math.min(height - 1, Math.max(0, Math.floor((bbox[3] - latitude) / res)));
  return { x, y, resDeg: res, cellKey: `chelsa30s:${x}:${y}` };
}
