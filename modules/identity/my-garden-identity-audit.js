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
 *
 * GLOBAL API (frozen)
 *  window.CruvitGardenIdentityAudit = {
 *    enable, disable, isEnabled, run, runStored, latest, snapshot, clear, status
 *  }
 */

const STORAGE_KEY = 'cruvit_mg_v23_real_plant_profiles';
const MAX_REPORTS = 10;
const MAX_PLANTS_PER_RUN = 500;

const TIER_RANK = Object.freeze({
  plantId: 1,
  canonicalSlug: 2,
  profileSlug: 3,
  'meta.slug': 4,
  slug: 5,
  scientific: 6,
  'meta.scientific': 7,
  he: 8,
  'meta.he': 9,
  name: 10,
  'meta.name': 11
});

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

function isNonEmptyPrimitive(v) {
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number' && Number.isFinite(v)) return true;
  if (typeof v === 'boolean') return true;
  return false;
}

function asSignalValue(v) {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length ? t : null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
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

function collectSignals(plant) {
  const out = [];
  const seen = new Set();
  if (!plant || typeof plant !== 'object') return out;
  const meta = (plant.meta && typeof plant.meta === 'object') ? plant.meta : null;

  const push = (field, raw) => {
    const value = asSignalValue(raw);
    if (value == null) return;
    const key = field + '\0' + value;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(Object.freeze({ field, value, rank: TIER_RANK[field] || 99 }));
  };

  push('plantId', plant.plantId);
  push('canonicalSlug', plant.canonicalSlug);
  push('profileSlug', plant.profileSlug);
  if (meta) push('meta.slug', meta.slug);
  push('slug', plant.slug);
  push('scientific', plant.scientific);
  if (meta) push('meta.scientific', meta.scientific);
  push('he', plant.he);
  if (meta) push('meta.he', meta.he);
  push('name', plant.name);
  if (meta) push('meta.name', meta.name);

  out.sort((a, b) => a.rank - b.rank);
  return out;
}

function snapshotShadowResult(raw, field, value) {
  if (!raw || typeof raw !== 'object') {
    return Object.freeze({
      field,
      value,
      status: 'null',
      plantId: null,
      canonicalSlug: null,
      matchedBy: null,
      confidence: null,
      needsReview: null,
      registryVersion: null,
      warnings: Object.freeze([])
    });
  }
  const warnings = Array.isArray(raw.warnings)
    ? Object.freeze(raw.warnings.map((w) => (w == null ? '' : String(w))))
    : Object.freeze([]);
  return Object.freeze({
    field,
    value,
    status: typeof raw.status === 'string' ? raw.status : 'null',
    plantId: raw.plantId == null ? null : String(raw.plantId),
    canonicalSlug: raw.canonicalSlug == null ? null : String(raw.canonicalSlug),
    matchedBy: raw.matchedBy == null ? null : String(raw.matchedBy),
    confidence: raw.confidence == null ? null : String(raw.confidence),
    needsReview: raw.needsReview === true,
    registryVersion: raw.registryVersion == null ? null : String(raw.registryVersion),
    warnings
  });
}

function emptyConsultation(overrides) {
  return deepFreeze(Object.assign({
    status: 'unresolved',
    auditReason: null,
    plantId: null,
    canonicalSlug: null,
    matchedBy: null,
    confidence: null,
    needsReview: null,
    registryVersion: null,
    sourceInstanceId: null,
    selectedSignal: null,
    inputSignalsUsed: Object.freeze([]),
    signalResults: Object.freeze([]),
    conflictingSignals: Object.freeze([]),
    warnings: Object.freeze([]),
    migrationEligibility: 'ineligible_unresolved'
  }, overrides || {}));
}

function sourceInstanceIdOf(plant) {
  if (!plant || typeof plant !== 'object') return null;
  if (isNonEmptyPrimitive(plant.id)) return String(plant.id);
  return null;
}

function migrationEligibilityFor(status, needsReview, auditReason) {
  if (status === 'registry_not_ready') return 'registry_not_ready';
  if (status === 'pending_conflict' || auditReason === 'conflicting_signals') return 'ineligible_conflict';
  if (status === 'ambiguous') return 'ineligible_ambiguous';
  if (status === 'provisional') return 'ineligible_provisional';
  if (status === 'unresolved') return 'ineligible_unresolved';
  if (status === 'resolved_canonical') return 'not_yet_allocated';
  if (status === 'resolved_id' && needsReview !== true && auditReason !== 'conflicting_signals') {
    return 'candidate';
  }
  return 'ineligible_unresolved';
}

/**
 * Pure per-plant consultation. Never mutates plant. Never attached to plant.
 * Never used by application logic.
 */
function resolveGardenPlantIdentityReadOnly(plant, shadowApi) {
  const sourceInstanceId = sourceInstanceIdOf(plant);
  const signals = collectSignals(plant);
  const inputSignalsUsed = Object.freeze(signals.map((s) =>
    Object.freeze({ field: s.field, value: s.value })
  ));

  if (!signals.length) {
    return emptyConsultation({
      status: 'unresolved',
      auditReason: 'missing_identity_input',
      sourceInstanceId,
      inputSignalsUsed,
      migrationEligibility: 'ineligible_unresolved'
    });
  }

  const signalResults = [];
  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i];
    let raw = null;
    try {
      raw = shadowApi && typeof shadowApi.get === 'function' ? shadowApi.get(sig.value) : null;
    } catch (_e) {
      raw = null;
    }
    signalResults.push(snapshotShadowResult(raw, sig.field, sig.value));
  }
  const frozenSignalResults = Object.freeze(signalResults.slice());

  const pending = frozenSignalResults.filter((r) => r.status === 'pending_conflict');
  if (pending.length) {
    const warnings = Object.freeze(['pending_conflict_signal']);
    const conflictingSignals = Object.freeze(pending.map((r) =>
      Object.freeze({ field: r.field, value: r.value, status: r.status, canonicalSlug: r.canonicalSlug })
    ));
    return emptyConsultation({
      status: 'pending_conflict',
      auditReason: 'pending_conflict',
      plantId: null,
      canonicalSlug: null,
      matchedBy: pending[0].matchedBy,
      confidence: pending[0].confidence,
      needsReview: null,
      registryVersion: pending[0].registryVersion,
      sourceInstanceId,
      selectedSignal: pending[0].field,
      inputSignalsUsed,
      signalResults: frozenSignalResults,
      conflictingSignals,
      warnings,
      migrationEligibility: 'ineligible_conflict'
    });
  }

  const canonicalHits = frozenSignalResults.filter((r) =>
    (r.status === 'resolved_id' || r.status === 'resolved_canonical') && r.canonicalSlug
  );

  if (canonicalHits.length) {
    const distinct = [];
    const seenCanon = new Set();
    for (let i = 0; i < canonicalHits.length; i++) {
      const c = canonicalHits[i].canonicalSlug;
      if (!seenCanon.has(c)) {
        seenCanon.add(c);
        distinct.push(c);
      }
    }
    if (distinct.length > 1) {
      const conflictingSignals = Object.freeze(canonicalHits.map((r) =>
        Object.freeze({
          field: r.field,
          value: r.value,
          status: r.status,
          canonicalSlug: r.canonicalSlug,
          plantId: r.plantId
        })
      ));
      return emptyConsultation({
        status: 'ambiguous',
        auditReason: 'conflicting_signals',
        plantId: null,
        canonicalSlug: null,
        matchedBy: null,
        confidence: null,
        needsReview: null,
        registryVersion: canonicalHits[0].registryVersion,
        sourceInstanceId,
        selectedSignal: null,
        inputSignalsUsed,
        signalResults: frozenSignalResults,
        conflictingSignals,
        warnings: Object.freeze(['conflicting_canonical_signals']),
        migrationEligibility: 'ineligible_conflict'
      });
    }

    // Agreeing canonical — pick representative by tier rank.
    let selected = canonicalHits[0];
    let bestRank = TIER_RANK[selected.field] || 99;
    for (let i = 1; i < canonicalHits.length; i++) {
      const r = canonicalHits[i];
      const rank = TIER_RANK[r.field] || 99;
      if (rank < bestRank) {
        selected = r;
        bestRank = rank;
      }
    }
    const status = selected.status === 'resolved_id' ? 'resolved_id' : 'resolved_canonical';
    return emptyConsultation({
      status,
      auditReason: 'single_canonical',
      plantId: selected.plantId,
      canonicalSlug: selected.canonicalSlug,
      matchedBy: selected.matchedBy,
      confidence: selected.confidence,
      needsReview: selected.needsReview === true,
      registryVersion: selected.registryVersion,
      sourceInstanceId,
      selectedSignal: selected.field,
      inputSignalsUsed,
      signalResults: frozenSignalResults,
      conflictingSignals: Object.freeze([]),
      warnings: Object.freeze([]),
      migrationEligibility: migrationEligibilityFor(status, selected.needsReview === true, 'single_canonical')
    });
  }

  // No canonical result — prefer ambiguous > provisional > unresolved.
  const hasAmbiguous = frozenSignalResults.some((r) => r.status === 'ambiguous');
  if (hasAmbiguous) {
    const first = frozenSignalResults.find((r) => r.status === 'ambiguous');
    return emptyConsultation({
      status: 'ambiguous',
      auditReason: 'resolver_ambiguous',
      plantId: null,
      canonicalSlug: null,
      matchedBy: first ? first.matchedBy : null,
      confidence: first ? first.confidence : null,
      needsReview: null,
      registryVersion: first ? first.registryVersion : null,
      sourceInstanceId,
      selectedSignal: first ? first.field : null,
      inputSignalsUsed,
      signalResults: frozenSignalResults,
      conflictingSignals: Object.freeze([]),
      warnings: Object.freeze(['resolver_ambiguous']),
      migrationEligibility: 'ineligible_ambiguous'
    });
  }

  const hasProvisional = frozenSignalResults.some((r) => r.status === 'provisional');
  if (hasProvisional) {
    const first = frozenSignalResults.find((r) => r.status === 'provisional');
    return emptyConsultation({
      status: 'provisional',
      auditReason: 'provisional',
      plantId: null,
      canonicalSlug: null,
      matchedBy: first ? first.matchedBy : null,
      confidence: first ? first.confidence : null,
      needsReview: null,
      registryVersion: first ? first.registryVersion : null,
      sourceInstanceId,
      selectedSignal: first ? first.field : null,
      inputSignalsUsed,
      signalResults: frozenSignalResults,
      conflictingSignals: Object.freeze([]),
      warnings: Object.freeze(['not-in-registry']),
      migrationEligibility: 'ineligible_provisional'
    });
  }

  return emptyConsultation({
    status: 'unresolved',
    auditReason: 'unresolved',
    sourceInstanceId,
    inputSignalsUsed,
    signalResults: frozenSignalResults,
    migrationEligibility: 'ineligible_unresolved'
  });
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
