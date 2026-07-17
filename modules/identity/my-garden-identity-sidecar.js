/**
 * Cruvit — My Garden Identity Sidecar (developer-only, Phase C2)
 * ---------------------------------------------------------------------------
 * Inert in-memory advisory cache for explicit developer consultation of
 * GardenPlant canonical-identity results.
 *
 * NON-CONSUMER CONTRACT
 *  - Stopped on every fresh load. No URL / storage / cookie / cross-tab start.
 *  - Never auto-inspects My Garden, never runs on load/render/save/tasks.
 *  - Never mutates plants or meta; never attaches fields to plants.
 *  - Never persists plantId / canonicalSlug / fingerprints / entries.
 *  - Never reads/writes garden localStorage; never migrates saved data.
 *  - Never fetches the registry or instantiates a second resolver.
 *  - Uses shared garden-plant-identity-consult.js + CruvitIdentityShadow only.
 *  - Does not depend on CruvitGardenIdentityAudit.
 *  - Advisory only — never authoritative.
 *
 * GLOBAL API (frozen)
 *  window.CruvitGardenIdentitySidecar = {
 *    start, stop, isStarted, consult, consultMany, get, delete, clear, status, snapshot
 *  }
 */

import {
  buildGardenPlantIdentityFingerprintInput,
  resolveGardenPlantIdentityReadOnly
} from './garden-plant-identity-consult.js';

const MAX_ENTRIES = 500;
const MAX_CONSULT_MANY = 500;

const _state = {
  started: false,
  entries: new Map(), // gardenPlantId -> frozen SidecarEntry
  registryVersion: null // version associated with current map contents
};

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) deepFreeze(value[i]);
  } else {
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) deepFreeze(value[keys[i]]);
  }
  return Object.freeze(value);
}

function isNonEmptyPrimitive(v) {
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number' && Number.isFinite(v)) return true;
  if (typeof v === 'boolean') return true;
  return false;
}

function gardenPlantIdOf(plantOrId) {
  if (typeof plantOrId === 'string') {
    const t = plantOrId.trim();
    return t.length ? t : null;
  }
  if (typeof plantOrId === 'number' && Number.isFinite(plantOrId)) return String(plantOrId);
  if (typeof plantOrId === 'boolean') return String(plantOrId);
  if (!plantOrId || typeof plantOrId !== 'object') return null;
  if (!isNonEmptyPrimitive(plantOrId.id)) return null;
  return String(plantOrId.id);
}

function getShadowApi() {
  try {
    return (typeof window !== 'undefined' && window.CruvitIdentityShadow) || null;
  } catch (_e) {
    return null;
  }
}

function shadowStatusSnapshot(shadowApi) {
  try {
    if (!shadowApi || typeof shadowApi.status !== 'function') {
      return Object.freeze({ status: 'unavailable', registryVersion: null, error: 'shadow-missing' });
    }
    const s = shadowApi.status() || {};
    return Object.freeze({
      status: typeof s.status === 'string' ? s.status : 'unavailable',
      registryVersion: s.registryVersion != null ? String(s.registryVersion) : null,
      error: s.error != null ? String(s.error) : null
    });
  } catch (_e) {
    return Object.freeze({ status: 'error', registryVersion: null, error: 'status-unavailable' });
  }
}

function currentRegistryVersion(shadowApi) {
  const sh = shadowStatusSnapshot(shadowApi);
  if (sh.registryVersion != null) return sh.registryVersion;
  try {
    if (shadowApi && typeof shadowApi.version === 'function') {
      const v = shadowApi.version();
      return v != null ? String(v) : null;
    }
  } catch (_e) { /* ignore */ }
  return null;
}

function identityFingerprintOf(plant) {
  const input = buildGardenPlantIdentityFingerprintInput(plant);
  return JSON.stringify(input);
}

function opResult(operationStatus, entry) {
  return deepFreeze({ operationStatus, entry: entry == null ? null : entry });
}

function makeEntry(gardenPlantId, registryVersion, identityFingerprint, resolution) {
  return deepFreeze({
    gardenPlantId,
    registryVersion,
    identityFingerprint,
    resolution
  });
}

function invalidateAllIfRegistryChanged(shadowApi) {
  if (!_state.entries.size) return;
  const v = currentRegistryVersion(shadowApi);
  if (_state.registryVersion != null && v !== _state.registryVersion) {
    _state.entries.clear();
    _state.registryVersion = null;
  }
}

function start() {
  _state.started = true;
  return true;
}

function stop() {
  _state.started = false;
  _state.entries.clear();
  _state.registryVersion = null;
  return false;
}

function isStarted() {
  return _state.started === true;
}

function consult(plant) {
  if (!_state.started) return opResult('not_started', null);

  const shadowApi = getShadowApi();
  invalidateAllIfRegistryChanged(shadowApi);

  if (!plant || typeof plant !== 'object') {
    return opResult('missing_garden_plant_id', null);
  }

  const gardenPlantId = gardenPlantIdOf(plant);
  if (gardenPlantId == null) {
    return opResult('missing_garden_plant_id', null);
  }

  const sh = shadowStatusSnapshot(shadowApi);
  if (sh.status === 'error') {
    return opResult('registry_error', null);
  }
  if (sh.status !== 'ready') {
    return opResult('registry_not_ready', null);
  }

  const registryVersion = currentRegistryVersion(shadowApi);
  const identityFingerprint = identityFingerprintOf(plant);
  const existing = _state.entries.get(gardenPlantId);

  if (existing) {
    if (existing.registryVersion === registryVersion &&
        existing.identityFingerprint === identityFingerprint) {
      return opResult('cache_hit', existing);
    }
    _state.entries.delete(gardenPlantId);
    // fall through to refresh
    const resolution = resolveGardenPlantIdentityReadOnly(plant, shadowApi);
    const entry = makeEntry(gardenPlantId, registryVersion, identityFingerprint, resolution);
    _state.entries.set(gardenPlantId, entry);
    _state.registryVersion = registryVersion;
    return opResult('refreshed', entry);
  }

  if (_state.entries.size >= MAX_ENTRIES) {
    return opResult('capacity_reached', null);
  }

  const resolution = resolveGardenPlantIdentityReadOnly(plant, shadowApi);
  const entry = makeEntry(gardenPlantId, registryVersion, identityFingerprint, resolution);
  _state.entries.set(gardenPlantId, entry);
  _state.registryVersion = registryVersion;
  return opResult('stored', entry);
}

function emptyBatch(overrides) {
  return deepFreeze(Object.assign({
    operationStatus: 'ok',
    totalInputs: 0,
    processedInputs: 0,
    truncatedCount: 0,
    storedCount: 0,
    refreshedCount: 0,
    cacheHitCount: 0,
    missingIdCount: 0,
    idCollisionCount: 0,
    registryNotReadyCount: 0,
    registryErrorCount: 0,
    capacityReachedCount: 0,
    notStartedCount: 0,
    results: Object.freeze([])
  }, overrides || {}));
}

function consultMany(plants) {
  if (!_state.started) {
    return emptyBatch({
      operationStatus: 'not_started',
      totalInputs: Array.isArray(plants) ? plants.length : 0,
      notStartedCount: Array.isArray(plants) ? Math.min(plants.length, MAX_CONSULT_MANY) : 0
    });
  }
  if (!Array.isArray(plants)) {
    return emptyBatch({ operationStatus: 'invalid_input' });
  }

  const shadowApi = getShadowApi();
  invalidateAllIfRegistryChanged(shadowApi);

  const totalInputs = plants.length;
  const processCount = Math.min(totalInputs, MAX_CONSULT_MANY);
  const truncatedCount = Math.max(0, totalInputs - processCount);

  // Detect same-id / different-fingerprint collisions within the batch.
  const firstFp = new Map();
  const collisionIds = new Set();
  for (let i = 0; i < processCount; i++) {
    const plant = plants[i];
    const id = gardenPlantIdOf(plant);
    if (id == null || !plant || typeof plant !== 'object') continue;
    const fp = identityFingerprintOf(plant);
    if (firstFp.has(id)) {
      if (firstFp.get(id) !== fp) collisionIds.add(id);
    } else {
      firstFp.set(id, fp);
    }
  }
  for (const id of collisionIds) {
    _state.entries.delete(id);
  }

  const results = [];
  let storedCount = 0;
  let refreshedCount = 0;
  let cacheHitCount = 0;
  let missingIdCount = 0;
  let idCollisionCount = 0;
  let registryNotReadyCount = 0;
  let registryErrorCount = 0;
  let capacityReachedCount = 0;

  for (let i = 0; i < processCount; i++) {
    const plant = plants[i];
    const id = gardenPlantIdOf(plant);

    if (id != null && collisionIds.has(id)) {
      idCollisionCount++;
      results.push(opResult('garden_plant_id_collision', null));
      continue;
    }

    const r = consult(plant);
    results.push(r);
    switch (r.operationStatus) {
      case 'stored': storedCount++; break;
      case 'refreshed': refreshedCount++; break;
      case 'cache_hit': cacheHitCount++; break;
      case 'missing_garden_plant_id': missingIdCount++; break;
      case 'registry_not_ready': registryNotReadyCount++; break;
      case 'registry_error': registryErrorCount++; break;
      case 'capacity_reached': capacityReachedCount++; break;
      default: break;
    }
  }

  return emptyBatch({
    operationStatus: 'ok',
    totalInputs,
    processedInputs: processCount,
    truncatedCount,
    storedCount,
    refreshedCount,
    cacheHitCount,
    missingIdCount,
    idCollisionCount,
    registryNotReadyCount,
    registryErrorCount,
    capacityReachedCount,
    results: Object.freeze(results.slice())
  });
}

function get(plant) {
  if (!_state.started) return null;
  if (!plant || typeof plant !== 'object') return null;

  const shadowApi = getShadowApi();
  invalidateAllIfRegistryChanged(shadowApi);

  const gardenPlantId = gardenPlantIdOf(plant);
  if (gardenPlantId == null) return null;

  const existing = _state.entries.get(gardenPlantId);
  if (!existing) return null;

  const registryVersion = currentRegistryVersion(shadowApi);
  const identityFingerprint = identityFingerprintOf(plant);

  if (existing.registryVersion !== registryVersion ||
      existing.identityFingerprint !== identityFingerprint) {
    _state.entries.delete(gardenPlantId);
    return null;
  }

  return existing;
}

function deleteEntry(plantOrId) {
  const id = gardenPlantIdOf(plantOrId);
  if (id == null) return false;
  if (!_state.entries.has(id)) return false;
  _state.entries.delete(id);
  if (!_state.entries.size) _state.registryVersion = null;
  return true;
}

function clear() {
  const n = _state.entries.size;
  _state.entries.clear();
  _state.registryVersion = null;
  return n;
}

function status() {
  const shadowApi = getShadowApi();
  const sh = shadowStatusSnapshot(shadowApi);
  let registryVersion = currentRegistryVersion(shadowApi);
  return Object.freeze({
    started: _state.started === true,
    size: _state.entries.size,
    maxEntries: MAX_ENTRIES,
    shadowStatus: sh.status,
    registryVersion,
    hasEntries: _state.entries.size > 0
  });
}

function snapshot() {
  const out = [];
  for (const entry of _state.entries.values()) {
    out.push(entry);
  }
  return Object.freeze(out.slice());
}

const api = Object.freeze({
  start,
  stop,
  isStarted,
  consult,
  consultMany,
  get,
  delete: deleteEntry,
  clear,
  status,
  snapshot
});

try {
  if (typeof window !== 'undefined' && !window.CruvitGardenIdentitySidecar) {
    Object.defineProperty(window, 'CruvitGardenIdentitySidecar', {
      value: api,
      writable: false,
      configurable: false,
      enumerable: true
    });
  }
} catch (_e) {
  // Never affect application startup.
}

export {};
