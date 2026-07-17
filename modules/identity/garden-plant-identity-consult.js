/**
 * Cruvit — GardenPlant identity consultation (pure, advisory)
 * ---------------------------------------------------------------------------
 * Shared, dependency-light consultation for collecting GardenPlant identity
 * signals and consolidating CruvitIdentityShadow results.
 *
 * PURE CONTRACT
 *  - No automatic execution, storage, DOM, network, timers, or console output.
 *  - Does not instantiate a resolver or fetch the registry.
 *  - Accepts Shadow (or compatible { get }) as an explicit argument.
 *  - Never mutates plant, meta, signal arrays, or resolver responses.
 *  - Returns deeply frozen results. Advisory only — never authoritative.
 *
 * ESM + frozen global (installed once on evaluation):
 *  window.CruvitGardenPlantIdentityConsult = {
 *    collectGardenPlantIdentitySignals,
 *    resolveGardenPlantIdentityReadOnly,
 *    buildGardenPlantIdentityFingerprintInput,
 *    GARDEN_IDENTITY_SIGNAL_FIELDS
 *  }
 */

export const GARDEN_IDENTITY_SIGNAL_FIELDS = Object.freeze([
  'plantId',
  'canonicalSlug',
  'profileSlug',
  'meta.slug',
  'slug',
  'scientific',
  'meta.scientific',
  'he',
  'meta.he',
  'name',
  'meta.name'
]);

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

/**
 * Collect identity-relevant signals from a GardenPlant-shaped object.
 * Never mutates plant. Returns a new sorted array of frozen { field, value, rank }.
 */
export function collectGardenPlantIdentitySignals(plant) {
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

/**
 * Stable fingerprint input for future Sidecar caching.
 * Returns a deeply frozen ordered list of { field, value } only — no hash,
 * no timestamps, no mutation. Does not change consultation semantics.
 */
export function buildGardenPlantIdentityFingerprintInput(plant) {
  const signals = collectGardenPlantIdentitySignals(plant);
  return Object.freeze(signals.map((s) =>
    Object.freeze({ field: s.field, value: s.value })
  ));
}

/**
 * Pure per-plant consultation. Never mutates plant. Never attached to plant.
 * Never used by application business logic. shadowApi must expose get(input).
 */
export function resolveGardenPlantIdentityReadOnly(plant, shadowApi) {
  const sourceInstanceId = sourceInstanceIdOf(plant);
  const signals = collectGardenPlantIdentitySignals(plant);
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

const api = Object.freeze({
  collectGardenPlantIdentitySignals,
  resolveGardenPlantIdentityReadOnly,
  buildGardenPlantIdentityFingerprintInput,
  GARDEN_IDENTITY_SIGNAL_FIELDS
});

try {
  if (typeof window !== 'undefined' && !window.CruvitGardenPlantIdentityConsult) {
    Object.defineProperty(window, 'CruvitGardenPlantIdentityConsult', {
      value: api,
      writable: false,
      configurable: false,
      enumerable: true
    });
  }
} catch (_e) {
  // Never affect application startup.
}
