/**
 * Cruvit — My Garden Identity Audit (developer-only, Phase A)
 * ---------------------------------------------------------------------------
 * Opt-in, in-memory diagnostic for measuring advisory canonical identity
 * resolution across existing My Garden plant objects.
 *
 * NON-CONSUMER CONTRACT
 *  - Disabled on every fresh load. No query / storage / cookie activation.
 *  - Never runs automatically on load, render, or task sync.
 *  - Never mutates plants, meta, tasks, preferences, or localStorage.
 *  - Never persists plantId / canonicalSlug.
 *  - Never writes telemetry, logs by default, or mutates the DOM.
 *  - Consults window.CruvitIdentityShadow only (advisory). Never authoritative.
 *  - Separate from CruvitIdentityShadowDebug.
 *  - Per-plant consultation delegated to garden-plant-identity-consult.js
 *    (shared pure module; Sidecar must not depend on this audit module).
 *
 * GLOBAL API (frozen)
 *  window.CruvitGardenIdentityAudit = {
 *    enable, disable, isEnabled, run, runStored, latest, snapshot, clear, status
 *  }
 */

import { resolveGardenPlantIdentityReadOnly } from './garden-plant-identity-consult.js';

const STORAGE_KEY = 'cruvit_mg_v23_real_plant_profiles';
const MAX_REPORTS = 10;
const MAX_PLANTS_PER_RUN = 500;

const _state = {
  enabled: false,
  reports: []
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

function emptyReport(overrides) {
  return deepFreeze(Object.assign({
    auditStatus: 'ok',
    generatedAt: null,
    registryVersion: null,
    totalPlants: 0,
    processedPlants: 0,
    truncatedCount: 0,
    resolvedIdCount: 0,
    resolvedCanonicalCount: 0,
    pendingConflictCount: 0,
    ambiguousCount: 0,
    provisionalCount: 0,
    unresolvedCount: 0,
    conflictingSignalCount: 0,
    missingInputCount: 0,
    registryNotReadyCount: 0,
    distinctCanonicalIdentityCount: 0,
    duplicateInstanceIdentityCount: 0,
    migrationCandidateCount: 0,
    migrationIneligibleCount: 0,
    matchedByCounts: Object.freeze({}),
    results: Object.freeze([])
  }, overrides || {}));
}

function buildMatchedByCounts(results) {
  const counts = Object.create(null);
  for (let i = 0; i < results.length; i++) {
    const m = results[i].matchedBy;
    if (typeof m === 'string' && m) {
      counts[m] = (counts[m] || 0) + 1;
    }
  }
  return Object.freeze(Object.assign({}, counts));
}

function retainReport(report) {
  _state.reports.push(report);
  while (_state.reports.length > MAX_REPORTS) _state.reports.shift();
  return report;
}

function run(plants) {
  if (!_state.enabled) return null;
  if (!Array.isArray(plants)) {
    return retainReport(emptyReport({
      auditStatus: 'invalid_input',
      generatedAt: new Date().toISOString()
    }));
  }

  const shadowApi = getShadowApi();
  const sh = shadowStatusSnapshot(shadowApi);
  const totalPlants = plants.length;
  const processCount = Math.min(totalPlants, MAX_PLANTS_PER_RUN);
  const truncatedCount = Math.max(0, totalPlants - processCount);

  if (sh.status === 'error') {
    return retainReport(emptyReport({
      auditStatus: 'registry_error',
      generatedAt: new Date().toISOString(),
      registryVersion: sh.registryVersion,
      totalPlants,
      processedPlants: processCount,
      truncatedCount,
      registryNotReadyCount: processCount
    }));
  }

  if (sh.status !== 'ready') {
    return retainReport(emptyReport({
      auditStatus: 'registry_not_ready',
      generatedAt: new Date().toISOString(),
      registryVersion: sh.registryVersion,
      totalPlants,
      processedPlants: processCount,
      truncatedCount,
      registryNotReadyCount: processCount
    }));
  }

  const results = [];
  let resolvedIdCount = 0;
  let resolvedCanonicalCount = 0;
  let pendingConflictCount = 0;
  let ambiguousCount = 0;
  let provisionalCount = 0;
  let unresolvedCount = 0;
  let conflictingSignalCount = 0;
  let missingInputCount = 0;
  let migrationCandidateCount = 0;
  let migrationIneligibleCount = 0;
  const canonCounts = Object.create(null);

  for (let i = 0; i < processCount; i++) {
    const plant = plants[i];
    const consultation = resolveGardenPlantIdentityReadOnly(plant, shadowApi);
    results.push(consultation);

    if (consultation.auditReason === 'missing_identity_input') missingInputCount++;
    if (consultation.auditReason === 'conflicting_signals') conflictingSignalCount++;

    switch (consultation.status) {
      case 'resolved_id': resolvedIdCount++; break;
      case 'resolved_canonical': resolvedCanonicalCount++; break;
      case 'pending_conflict': pendingConflictCount++; break;
      case 'ambiguous': ambiguousCount++; break;
      case 'provisional': provisionalCount++; break;
      default: unresolvedCount++; break;
    }

    if (consultation.migrationEligibility === 'candidate') migrationCandidateCount++;
    else migrationIneligibleCount++;

    if (consultation.canonicalSlug) {
      const c = consultation.canonicalSlug;
      canonCounts[c] = (canonCounts[c] || 0) + 1;
    }
  }

  const distinctKeys = Object.keys(canonCounts);
  let duplicateInstanceIdentityCount = 0;
  for (let i = 0; i < distinctKeys.length; i++) {
    const n = canonCounts[distinctKeys[i]];
    if (n > 1) duplicateInstanceIdentityCount += (n - 1);
  }

  return retainReport(emptyReport({
    auditStatus: 'ok',
    generatedAt: new Date().toISOString(),
    registryVersion: sh.registryVersion || (typeof shadowApi.version === 'function' ? shadowApi.version() : null),
    totalPlants,
    processedPlants: processCount,
    truncatedCount,
    resolvedIdCount,
    resolvedCanonicalCount,
    pendingConflictCount,
    ambiguousCount,
    provisionalCount,
    unresolvedCount,
    conflictingSignalCount,
    missingInputCount,
    registryNotReadyCount: 0,
    distinctCanonicalIdentityCount: distinctKeys.length,
    duplicateInstanceIdentityCount,
    migrationCandidateCount,
    migrationIneligibleCount,
    matchedByCounts: buildMatchedByCounts(results),
    results: Object.freeze(results.slice())
  }));
}

function deepCloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function runStored() {
  if (!_state.enabled) return null;

  let rawBefore = null;
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
      return retainReport(emptyReport({
        auditStatus: 'no_stored_garden',
        generatedAt: new Date().toISOString()
      }));
    }
    rawBefore = localStorage.getItem(STORAGE_KEY);
  } catch (_e) {
    return retainReport(emptyReport({
      auditStatus: 'stored_garden_parse_error',
      generatedAt: new Date().toISOString()
    }));
  }

  if (rawBefore == null) {
    return retainReport(emptyReport({
      auditStatus: 'no_stored_garden',
      generatedAt: new Date().toISOString()
    }));
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBefore);
  } catch (_e) {
    let rawAfterParseFail = null;
    try { rawAfterParseFail = localStorage.getItem(STORAGE_KEY); } catch (_e2) { rawAfterParseFail = null; }
    if (rawAfterParseFail !== rawBefore) {
      return retainReport(emptyReport({
        auditStatus: 'stored_garden_changed',
        generatedAt: new Date().toISOString()
      }));
    }
    return retainReport(emptyReport({
      auditStatus: 'stored_garden_parse_error',
      generatedAt: new Date().toISOString()
    }));
  }

  const plantsSrc = parsed && typeof parsed === 'object' && Array.isArray(parsed.plants)
    ? parsed.plants
    : null;
  if (!plantsSrc) {
    let rawAfter = null;
    try { rawAfter = localStorage.getItem(STORAGE_KEY); } catch (_e) { rawAfter = null; }
    if (rawAfter !== rawBefore) {
      return retainReport(emptyReport({
        auditStatus: 'stored_garden_changed',
        generatedAt: new Date().toISOString()
      }));
    }
    return retainReport(emptyReport({
      auditStatus: 'stored_garden_parse_error',
      generatedAt: new Date().toISOString()
    }));
  }

  let clone;
  try {
    clone = deepCloneJson(plantsSrc);
  } catch (_e) {
    return retainReport(emptyReport({
      auditStatus: 'stored_garden_parse_error',
      generatedAt: new Date().toISOString()
    }));
  }

  const report = run(clone);

  let rawAfter = null;
  try { rawAfter = localStorage.getItem(STORAGE_KEY); } catch (_e) { rawAfter = null; }
  if (rawAfter !== rawBefore) {
    return retainReport(emptyReport({
      auditStatus: 'stored_garden_changed',
      generatedAt: new Date().toISOString(),
      registryVersion: report && report.registryVersion,
      totalPlants: report && report.totalPlants
    }));
  }

  return report;
}

function enable() {
  _state.enabled = true;
  return true;
}

function disable() {
  _state.enabled = false;
  return false;
}

function isEnabled() {
  return _state.enabled === true;
}

function latest() {
  if (!_state.reports.length) return null;
  return _state.reports[_state.reports.length - 1];
}

function snapshot() {
  return Object.freeze(_state.reports.slice());
}

function clear() {
  _state.reports.length = 0;
  return true;
}

function status() {
  const shadowApi = getShadowApi();
  const sh = shadowStatusSnapshot(shadowApi);
  let registryVersion = null;
  try {
    if (shadowApi && typeof shadowApi.version === 'function') registryVersion = shadowApi.version();
  } catch (_e) { registryVersion = sh.registryVersion; }
  return Object.freeze({
    enabled: _state.enabled === true,
    reportCount: _state.reports.length,
    hasLatest: _state.reports.length > 0,
    shadowStatus: sh.status,
    registryVersion: registryVersion != null ? registryVersion : sh.registryVersion,
    maxReports: MAX_REPORTS,
    maxPlantsPerRun: MAX_PLANTS_PER_RUN
  });
}

const api = Object.freeze({
  enable,
  disable,
  isEnabled,
  run,
  runStored,
  latest,
  snapshot,
  clear,
  status
});

try {
  if (typeof window !== 'undefined' && !window.CruvitGardenIdentityAudit) {
    Object.defineProperty(window, 'CruvitGardenIdentityAudit', {
      value: api,
      writable: false,
      configurable: false,
      enumerable: true
    });
  }
} catch (_e) {
  // Never affect application startup.
}

// Module evaluation installs the frozen global; no public ESM surface required.
export {};
