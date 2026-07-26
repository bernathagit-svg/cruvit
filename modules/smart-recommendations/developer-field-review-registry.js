/**
 * Cruvit — Smart Recommendations developer field-review registry
 * ---------------------------------------------------------------------------
 * Inert, developer/test-only, non-authoritative pure helpers for proving
 * field-specific sun/water review records.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Import defines immutable exports only — no evaluation of real plants.
 *  - No DOM, storage, fetch, timers, globals, or persistence.
 *  - Does not import catalog, identity, GOS, or Smart Recommendations runtime.
 *  - Real registry is empty; synthetic fixtures live only in the harness.
 */

export const SR_FIELD_REVIEW_REGISTRY_VERSION = '0.1.0-sr-field-review-registry';

/** Anti-accident capability token — not authentication. */
export const SR_FIELD_REVIEW_REGISTRY_CAPABILITY =
  'explicit_developer_field_review_registry';

/** Contract version included in fingerprints (docs gate identity). */
export const SR_FIELD_REVIEW_CONTRACT_VERSION =
  '0.1.0-sr-field-review-contract';

export const SR_FIELD_REVIEW_FIELDS = Object.freeze(['sun', 'water']);

export const SR_FIELD_REVIEW_STORED_STATUSES = Object.freeze([
  'reviewed_supported',
  'reviewed_conflicting',
  'remains_ineligible',
  'modeling_gap',
  'identity_ambiguous',
  'context_ambiguous',
  'preference_tolerance_ambiguous',
  'evidence_collected'
]);

export const SR_FIELD_REVIEW_COMPUTED_ONLY_STATUSES = Object.freeze([
  'evidence_missing',
  'conflict_unresolved',
  'stale',
  'fingerprint_mismatch',
  'unsupported_token'
]);

export const SR_FIELD_REVIEW_SOURCE_KINDS = Object.freeze([
  'seed_climateTraits',
  'climate_group',
  'specific_climate_metadata',
  'canonical_catalog_record',
  'evidence_derived_override'
]);

export const SR_FIELD_REVIEW_REASONS = Object.freeze([
  'ok',
  'record_required',
  'canonical_key_required',
  'unknown_canonical_key',
  'alias_owned_record',
  'unsupported_field',
  'unsupported_review_status',
  'computed_status_not_storable',
  'reviewed_value_required',
  'value_fingerprint_required',
  'evidence_refs_required',
  'evidence_ref_missing',
  'source_kind_required',
  'unsupported_source_kind',
  'source_ids_required',
  'context_scope_required',
  'review_version_required',
  'reviewed_at_required',
  'invalid_reviewed_at',
  'reason_required',
  'unsupported_reviewed_value',
  'fingerprint_mismatch',
  'stale_review',
  'fingerprint_inputs_incomplete',
  'duplicate_canonical_field',
  'invalid_records_input'
]);

function deepFreeze(value, seen) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) deepFreeze(value[i], seen);
  } else {
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) deepFreeze(value[keys[i]], seen);
  }
  return Object.freeze(value);
}

function freezeDeep(value) {
  return deepFreeze(value, new WeakSet());
}

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function normalizeKey(v) {
  if (!isNonEmptyString(v)) return null;
  return String(v).trim().toLowerCase();
}

function normalizeStringArray(arr) {
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    if (!isNonEmptyString(arr[i])) return null;
    out.push(String(arr[i]).trim());
  }
  return out.slice().sort();
}

function stableSerialize(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'string') return JSON.stringify(value);
  if (t === 'number') {
    if (!Number.isFinite(value)) return '"__non_finite__"';
    return String(value);
  }
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'undefined') return '"__undefined__"';
  if (Array.isArray(value)) {
    return '[' + value.map(stableSerialize).join(',') + ']';
  }
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    const parts = [];
    for (let i = 0; i < keys.length; i++) {
      parts.push(JSON.stringify(keys[i]) + ':' + stableSerialize(value[keys[i]]));
    }
    return '{' + parts.join(',') + '}';
  }
  return JSON.stringify(String(value));
}

function isIsoDate(v) {
  if (!isNonEmptyString(v)) return false;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00.000Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function pushReason(reasons, code) {
  if (reasons.indexOf(code) === -1) reasons.push(code);
}

function buildDescriptor() {
  return freezeDeep({
    registryVersion: SR_FIELD_REVIEW_REGISTRY_VERSION,
    reviewContractVersion: SR_FIELD_REVIEW_CONTRACT_VERSION,
    capability: SR_FIELD_REVIEW_REGISTRY_CAPABILITY,
    developerOnly: true,
    authoritative: false,
    productConsumer: false,
    runtimeEligibilityAuthority: false,
    runtimeWired: false,
    persistence: false,
    network: false,
    automaticPopulation: false,
    catalogMutation: false,
    needsReviewMutation: false,
    aliasOwnership: false,
    activation: 'explicit_call_only',
    productConsumers: 'none',
    allowedFields: SR_FIELD_REVIEW_FIELDS.slice(),
    storedStatuses: SR_FIELD_REVIEW_STORED_STATUSES.slice(),
    computedOnlyStatuses: SR_FIELD_REVIEW_COMPUTED_ONLY_STATUSES.slice(),
    sourceKinds: SR_FIELD_REVIEW_SOURCE_KINDS.slice(),
    reasons: SR_FIELD_REVIEW_REASONS.slice(),
    realRecordCount: 0
  });
}

const DESCRIPTOR = buildDescriptor();

const EMPTY_REGISTRY = freezeDeep({
  registryVersion: SR_FIELD_REVIEW_REGISTRY_VERSION,
  records: {}
});

/**
 * Immutable descriptor. Safe to call any number of times; never mutates.
 */
export function getSmartRecDeveloperFieldReviewRegistryDescriptor() {
  return DESCRIPTOR;
}

/**
 * Empty real registry (zero real plant review records). Deeply frozen.
 */
export function getEmptySmartRecDeveloperFieldReviewRegistry() {
  return EMPTY_REGISTRY;
}

/**
 * Build a deterministic canonical value fingerprint.
 * Returns { ok, fingerprint, reasons } — does not throw for ordinary incomplete input.
 */
export function buildFieldReviewValueFingerprint(inputs) {
  const reasons = [];
  const o = asObject(inputs);
  if (!o) {
    return freezeDeep({
      ok: false,
      fingerprint: null,
      reasons: ['fingerprint_inputs_incomplete']
    });
  }

  const canonicalKey = normalizeKey(o.canonicalKey);
  const field = isNonEmptyString(o.field) ? String(o.field).trim() : null;
  const reviewedValue = isNonEmptyString(o.reviewedValue) ? String(o.reviewedValue).trim() : null;
  const sourceKind = isNonEmptyString(o.sourceKind) ? String(o.sourceKind).trim() : null;
  const sourceIds = normalizeStringArray(o.sourceIds);
  const evidenceRefs = normalizeStringArray(o.evidenceRefs);
  const reviewContractVersion = isNonEmptyString(o.reviewContractVersion)
    ? String(o.reviewContractVersion).trim()
    : null;

  let contextScopeNorm = null;
  if (o.contextScope === undefined || o.contextScope === null) {
    contextScopeNorm = null;
  } else if (typeof o.contextScope === 'string') {
    contextScopeNorm = o.contextScope.trim();
    if (!contextScopeNorm) contextScopeNorm = null;
  } else if (typeof o.contextScope === 'object') {
    contextScopeNorm = stableSerialize(o.contextScope);
  } else {
    contextScopeNorm = null;
  }

  if (!canonicalKey) pushReason(reasons, 'fingerprint_inputs_incomplete');
  if (!field || SR_FIELD_REVIEW_FIELDS.indexOf(field) < 0) {
    pushReason(reasons, 'fingerprint_inputs_incomplete');
  }
  if (!reviewedValue) pushReason(reasons, 'fingerprint_inputs_incomplete');
  if (!sourceKind) pushReason(reasons, 'fingerprint_inputs_incomplete');
  if (!sourceIds || sourceIds.length === 0) pushReason(reasons, 'fingerprint_inputs_incomplete');
  if (!evidenceRefs || evidenceRefs.length === 0) {
    pushReason(reasons, 'fingerprint_inputs_incomplete');
  }
  if (contextScopeNorm == null) pushReason(reasons, 'fingerprint_inputs_incomplete');
  if (!reviewContractVersion) pushReason(reasons, 'fingerprint_inputs_incomplete');

  if (reasons.length) {
    return freezeDeep({ ok: false, fingerprint: null, reasons: reasons });
  }

  const fingerprint = [
    canonicalKey,
    field,
    reviewedValue,
    sourceKind,
    sourceIds.join(','),
    evidenceRefs.join(','),
    contextScopeNorm,
    reviewContractVersion
  ].join('|');

  return freezeDeep({ ok: true, fingerprint: fingerprint, reasons: ['ok'] });
}

/**
 * Validate a single developer/synthetic review record.
 * Context is supplied by the caller (harness); this module never loads product maps.
 */
export function validateFieldReviewRecord(record, context) {
  const reasons = [];
  const ctx = asObject(context) || {};
  const knownCanonical = Array.isArray(ctx.knownCanonicalKeys)
    ? ctx.knownCanonicalKeys.map((k) => normalizeKey(k)).filter(Boolean)
    : [];
  const knownAliases = Array.isArray(ctx.knownAliasKeys)
    ? ctx.knownAliasKeys.map((k) => normalizeKey(k)).filter(Boolean)
    : [];
  const knownEvidence = Array.isArray(ctx.knownEvidenceRefs)
    ? ctx.knownEvidenceRefs.map((k) => String(k).trim()).filter((k) => k.length > 0)
    : null;
  const supportedTokens = Array.isArray(ctx.supportedReviewedValueTokens)
    ? ctx.supportedReviewedValueTokens.map((k) => String(k).trim()).filter((k) => k.length > 0)
    : null;
  const reviewContractVersion = isNonEmptyString(ctx.reviewContractVersion)
    ? String(ctx.reviewContractVersion).trim()
    : SR_FIELD_REVIEW_CONTRACT_VERSION;

  const rec = asObject(record);
  if (!rec) {
    return freezeDeep({
      valid: false,
      reasons: ['record_required'],
      computedFingerprint: null,
      fingerprintMatches: null,
      stale: null,
      normalized: null
    });
  }

  const canonicalKey = normalizeKey(rec.canonicalKey);
  if (!canonicalKey) pushReason(reasons, 'canonical_key_required');
  else {
    if (knownAliases.indexOf(canonicalKey) >= 0) pushReason(reasons, 'alias_owned_record');
    if (knownCanonical.indexOf(canonicalKey) < 0) pushReason(reasons, 'unknown_canonical_key');
  }

  const field = isNonEmptyString(rec.field) ? String(rec.field).trim() : null;
  if (!field || SR_FIELD_REVIEW_FIELDS.indexOf(field) < 0) {
    pushReason(reasons, 'unsupported_field');
  }

  const reviewStatus = isNonEmptyString(rec.reviewStatus)
    ? String(rec.reviewStatus).trim()
    : null;
  if (!reviewStatus) {
    pushReason(reasons, 'unsupported_review_status');
  } else if (SR_FIELD_REVIEW_COMPUTED_ONLY_STATUSES.indexOf(reviewStatus) >= 0) {
    pushReason(reasons, 'computed_status_not_storable');
  } else if (SR_FIELD_REVIEW_STORED_STATUSES.indexOf(reviewStatus) < 0) {
    pushReason(reasons, 'unsupported_review_status');
  }

  const isApproval = reviewStatus === 'reviewed_supported';
  const reviewedValue = isNonEmptyString(rec.reviewedValue)
    ? String(rec.reviewedValue).trim()
    : null;
  const valueFingerprint = isNonEmptyString(rec.valueFingerprint)
    ? String(rec.valueFingerprint).trim()
    : null;
  const sourceKind = isNonEmptyString(rec.sourceKind)
    ? String(rec.sourceKind).trim()
    : null;
  const sourceIds = Array.isArray(rec.sourceIds) ? normalizeStringArray(rec.sourceIds) : null;
  const evidenceRefs = Array.isArray(rec.evidenceRefs)
    ? normalizeStringArray(rec.evidenceRefs)
    : null;
  const reviewVersion = isNonEmptyString(rec.reviewVersion)
    ? String(rec.reviewVersion).trim()
    : null;
  const reviewedAt = isNonEmptyString(rec.reviewedAt) ? String(rec.reviewedAt).trim() : null;
  const reasonText = isNonEmptyString(rec.reason) ? String(rec.reason).trim() : null;

  let contextScope = null;
  if (rec.contextScope === undefined || rec.contextScope === null) {
    contextScope = null;
  } else if (typeof rec.contextScope === 'string') {
    contextScope = rec.contextScope.trim() || null;
  } else if (typeof rec.contextScope === 'object') {
    contextScope = rec.contextScope;
  } else {
    contextScope = null;
  }

  if (isApproval) {
    if (!reviewedValue) pushReason(reasons, 'reviewed_value_required');
    if (!valueFingerprint) pushReason(reasons, 'value_fingerprint_required');
    if (!evidenceRefs || evidenceRefs.length === 0) pushReason(reasons, 'evidence_refs_required');
    if (!sourceKind) pushReason(reasons, 'source_kind_required');
    else if (SR_FIELD_REVIEW_SOURCE_KINDS.indexOf(sourceKind) < 0) {
      pushReason(reasons, 'unsupported_source_kind');
    }
    if (!sourceIds || sourceIds.length === 0) pushReason(reasons, 'source_ids_required');
    if (contextScope == null || (typeof contextScope === 'string' && !contextScope)) {
      pushReason(reasons, 'context_scope_required');
    }
    if (!reviewVersion) pushReason(reasons, 'review_version_required');
    if (!reviewedAt) pushReason(reasons, 'reviewed_at_required');
    else if (!isIsoDate(reviewedAt)) pushReason(reasons, 'invalid_reviewed_at');
    if (!reasonText) pushReason(reasons, 'reason_required');
  } else {
    // Non-approval records may optionally carry value/source; if present, validate shape.
    if (sourceKind != null && SR_FIELD_REVIEW_SOURCE_KINDS.indexOf(sourceKind) < 0) {
      pushReason(reasons, 'unsupported_source_kind');
    }
    if (rec.sourceIds != null && (!sourceIds || sourceIds.length === 0)) {
      pushReason(reasons, 'source_ids_required');
    }
    if (reviewedAt != null && !isIsoDate(reviewedAt)) {
      pushReason(reasons, 'invalid_reviewed_at');
    }
    if (!reasonText) pushReason(reasons, 'reason_required');
    if (!reviewVersion) pushReason(reasons, 'review_version_required');
  }

  if (supportedTokens && reviewedValue && supportedTokens.indexOf(reviewedValue) < 0) {
    pushReason(reasons, 'unsupported_reviewed_value');
  }

  if (knownEvidence && evidenceRefs) {
    for (let i = 0; i < evidenceRefs.length; i++) {
      if (knownEvidence.indexOf(evidenceRefs[i]) < 0) {
        pushReason(reasons, 'evidence_ref_missing');
        break;
      }
    }
  }

  let computedFingerprint = null;
  let fingerprintMatches = null;
  let stale = null;

  if (isApproval && reviewedValue && sourceKind && sourceIds && evidenceRefs && contextScope != null) {
    const fp = buildFieldReviewValueFingerprint({
      canonicalKey: canonicalKey,
      field: field,
      reviewedValue: reviewedValue,
      sourceKind: sourceKind,
      sourceIds: sourceIds,
      evidenceRefs: evidenceRefs,
      contextScope: contextScope,
      reviewContractVersion: reviewContractVersion
    });
    if (fp.ok) {
      computedFingerprint = fp.fingerprint;
      if (valueFingerprint) {
        fingerprintMatches = valueFingerprint === computedFingerprint;
        if (!fingerprintMatches) {
          pushReason(reasons, 'fingerprint_mismatch');
          pushReason(reasons, 'stale_review');
          stale = true;
        } else {
          stale = false;
        }
      }
    } else {
      for (let i = 0; i < fp.reasons.length; i++) pushReason(reasons, fp.reasons[i]);
    }
  }

  // Optional current* overrides for stale checks without mutating the record.
  if (isApproval && computedFingerprint && asObject(ctx.currentFingerprintInputs)) {
    const cur = buildFieldReviewValueFingerprint(
      Object.assign({}, ctx.currentFingerprintInputs, {
        reviewContractVersion:
          ctx.currentFingerprintInputs.reviewContractVersion || reviewContractVersion
      })
    );
    if (cur.ok) {
      if (cur.fingerprint !== computedFingerprint) {
        pushReason(reasons, 'stale_review');
        stale = true;
        fingerprintMatches = false;
      }
    }
  }

  const valid = reasons.length === 0;
  if (valid) pushReason(reasons, 'ok');

  return freezeDeep({
    valid: valid,
    reasons: reasons,
    computedFingerprint: computedFingerprint,
    fingerprintMatches: fingerprintMatches,
    stale: stale,
    normalized: freezeDeep({
      canonicalKey: canonicalKey,
      field: field,
      reviewStatus: reviewStatus,
      reviewedValue: reviewedValue,
      valueFingerprint: valueFingerprint,
      evidenceRefs: evidenceRefs,
      sourceKind: sourceKind,
      sourceIds: sourceIds,
      contextScope: contextScope,
      reviewVersion: reviewVersion,
      reviewedAt: reviewedAt,
      reason: reasonText,
      unresolvedLimitations:
        rec.unresolvedLimitations == null ? null : rec.unresolvedLimitations
    })
  });
}

/**
 * Validate and build a nested synthetic registry from caller-provided records.
 * Never mutates inputs. Never populates the exported empty real registry.
 */
export function validateAndBuildFieldReviewRegistry(records, context) {
  const reasons = [];
  if (!Array.isArray(records)) {
    return freezeDeep({
      valid: false,
      reasons: ['invalid_records_input'],
      registry: null,
      recordResults: []
    });
  }

  const nested = Object.create(null);
  const seen = Object.create(null);
  const recordResults = [];
  let allValid = true;

  for (let i = 0; i < records.length; i++) {
    const result = validateFieldReviewRecord(records[i], context);
    recordResults.push(result);
    if (!result.valid) {
      allValid = false;
      for (let r = 0; r < result.reasons.length; r++) {
        if (result.reasons[r] !== 'ok') pushReason(reasons, result.reasons[r]);
      }
      continue;
    }
    const n = result.normalized;
    const uniq = n.canonicalKey + '::' + n.field;
    if (seen[uniq]) {
      allValid = false;
      pushReason(reasons, 'duplicate_canonical_field');
      continue;
    }
    seen[uniq] = true;
    if (!nested[n.canonicalKey]) nested[n.canonicalKey] = Object.create(null);
    nested[n.canonicalKey][n.field] = {
      canonicalKey: n.canonicalKey,
      field: n.field,
      reviewStatus: n.reviewStatus,
      reviewedValue: n.reviewedValue,
      valueFingerprint: n.valueFingerprint,
      evidenceRefs: n.evidenceRefs ? n.evidenceRefs.slice() : null,
      sourceKind: n.sourceKind,
      sourceIds: n.sourceIds ? n.sourceIds.slice() : null,
      contextScope: n.contextScope,
      reviewVersion: n.reviewVersion,
      reviewedAt: n.reviewedAt,
      reason: n.reason,
      unresolvedLimitations: n.unresolvedLimitations
    };
  }

  if (allValid && reasons.length === 0) pushReason(reasons, 'ok');

  const registry = allValid
    ? freezeDeep({
        registryVersion: SR_FIELD_REVIEW_REGISTRY_VERSION,
        records: nested
      })
    : null;

  return freezeDeep({
    valid: allValid,
    reasons: reasons,
    registry: registry,
    recordResults: recordResults
  });
}
