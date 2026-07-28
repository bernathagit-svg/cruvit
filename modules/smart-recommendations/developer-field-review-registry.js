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
 *  - May import Evidence Packet developer helpers (one-way); never mutates EP.
 *  - Real registry is empty; synthetic fixtures live only in the harness.
 */

import {
  SR_EVIDENCE_CLAIM_TYPES,
  SR_EVIDENCE_PROPOSED_VALUES_SUN,
  SR_EVIDENCE_PROPOSED_VALUES_WATER,
  SR_EVIDENCE_COMPOUND_LEGACY_PROPOSED_VALUES,
  SR_EVIDENCE_PACKET_SUPPORTED_CONTRACT_VERSIONS,
  SR_EVIDENCE_PACKET_SUPPORTED_REGISTRY_VERSIONS,
  SR_EVIDENCE_PACKET_CONTRACT_VERSION,
  normalizeEvidencePacketContextScope
} from './developer-evidence-packet-registry.js';

export const SR_FIELD_REVIEW_REGISTRY_VERSION =
  '0.2.0-sr-field-review-registry';

/** Anti-accident capability token — not authentication. */
export const SR_FIELD_REVIEW_REGISTRY_CAPABILITY =
  'explicit_developer_field_review_registry';

/** Current contract version included in fingerprints. */
export const SR_FIELD_REVIEW_CONTRACT_VERSION =
  '0.2.0-sr-field-review-contract';

/** Explicit legacy contract retained for synthetic 0.1.0 compatibility. */
export const SR_FIELD_REVIEW_CONTRACT_VERSION_V01 =
  '0.1.0-sr-field-review-contract';

/** Explicit legacy registry version retained for synthetic compatibility. */
export const SR_FIELD_REVIEW_REGISTRY_VERSION_V01 =
  '0.1.0-sr-field-review-registry';

export const SR_FIELD_REVIEW_SUPPORTED_CONTRACT_VERSIONS = Object.freeze([
  SR_FIELD_REVIEW_CONTRACT_VERSION_V01,
  SR_FIELD_REVIEW_CONTRACT_VERSION
]);

export const SR_FIELD_REVIEW_SUPPORTED_REGISTRY_VERSIONS = Object.freeze([
  SR_FIELD_REVIEW_REGISTRY_VERSION_V01,
  SR_FIELD_REVIEW_REGISTRY_VERSION
]);

export const SR_FIELD_REVIEW_SUPPORTED_EVIDENCE_PACKET_CONTRACT_VERSIONS =
  Object.freeze(SR_EVIDENCE_PACKET_SUPPORTED_CONTRACT_VERSIONS.slice());

export const SR_FIELD_REVIEW_SUPPORTED_EVIDENCE_PACKET_REGISTRY_VERSIONS =
  Object.freeze(SR_EVIDENCE_PACKET_SUPPORTED_REGISTRY_VERSIONS.slice());

export const SR_FIELD_REVIEW_FIELDS = Object.freeze(['sun', 'water']);

/** Coordinated claim vocabulary — same tokens as Evidence Packet. */
export const SR_FIELD_REVIEW_CLAIM_TYPES = Object.freeze(
  SR_EVIDENCE_CLAIM_TYPES.slice()
);

export const SR_FIELD_REVIEW_DEFAULT_REVIEWED_VALUES_SUN = Object.freeze(
  SR_EVIDENCE_PROPOSED_VALUES_SUN.slice()
);

export const SR_FIELD_REVIEW_DEFAULT_REVIEWED_VALUES_WATER = Object.freeze(
  SR_EVIDENCE_PROPOSED_VALUES_WATER.slice()
);

export const SR_FIELD_REVIEW_COMPOUND_LEGACY_REVIEWED_VALUES = Object.freeze(
  SR_EVIDENCE_COMPOUND_LEGACY_PROPOSED_VALUES.slice()
);

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
  'invalid_records_input',
  'reviewed_claim_type_missing',
  'unsupported_reviewed_claim_type',
  'invalid_evidence_reference_shape',
  'unsupported_evidence_packet_contract_version',
  'duplicate_evidence_ref',
  'context_normalize_failed',
  'unsupported_review_contract_version',
  'general_guidance_not_approvable'
]);

const COMPACT_REF_KEYS = Object.freeze([
  'evidenceId',
  'packetContractVersion',
  'expectedContentFingerprint'
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

function normalizeTrim(v) {
  if (!isNonEmptyString(v)) return null;
  return String(v).trim();
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

function pushDetail(details, code, detail) {
  details.push(freezeDeep({ code: code, detail: detail == null ? null : detail }));
}

function isContractV01(version) {
  return version === SR_FIELD_REVIEW_CONTRACT_VERSION_V01;
}

function isContractV02(version) {
  return version === SR_FIELD_REVIEW_CONTRACT_VERSION;
}

function isSupportedContract(version) {
  return (
    SR_FIELD_REVIEW_SUPPORTED_CONTRACT_VERSIONS.indexOf(String(version || '').trim()) >= 0
  );
}

function defaultReviewedValuesForField(field) {
  if (field === 'sun') return SR_FIELD_REVIEW_DEFAULT_REVIEWED_VALUES_SUN;
  if (field === 'water') return SR_FIELD_REVIEW_DEFAULT_REVIEWED_VALUES_WATER;
  return null;
}

function isCompoundLegacyReviewedValue(value) {
  return (
    SR_FIELD_REVIEW_COMPOUND_LEGACY_REVIEWED_VALUES.indexOf(String(value || '').trim()) >= 0
  );
}

/**
 * Normalize evidenceRefs for a given Field Review contract version.
 * Does not mutate input.
 */
export function normalizeFieldReviewEvidenceRefs(refs, reviewContractVersion) {
  const version = isNonEmptyString(reviewContractVersion)
    ? String(reviewContractVersion).trim()
    : SR_FIELD_REVIEW_CONTRACT_VERSION;
  const reasons = [];
  const details = [];

  if (!isSupportedContract(version)) {
    return freezeDeep({
      ok: false,
      normalized: null,
      reasons: ['unsupported_review_contract_version'],
      details: []
    });
  }

  if (!Array.isArray(refs)) {
    return freezeDeep({
      ok: false,
      normalized: null,
      reasons: ['invalid_evidence_reference_shape'],
      details: [{ code: 'invalid_evidence_reference_shape', detail: 'not_array' }]
    });
  }

  if (isContractV01(version)) {
    const sorted = normalizeStringArray(refs);
    if (!sorted) {
      return freezeDeep({
        ok: false,
        normalized: null,
        reasons: ['invalid_evidence_reference_shape'],
        details: [{ code: 'invalid_evidence_reference_shape', detail: 'v01_string_refs_required' }]
      });
    }
    return freezeDeep({ ok: true, normalized: sorted, reasons: ['ok'], details: [] });
  }

  const seen = Object.create(null);
  const out = [];
  for (let i = 0; i < refs.length; i++) {
    const item = refs[i];
    if (typeof item === 'string') {
      pushReason(reasons, 'invalid_evidence_reference_shape');
      pushDetail(details, 'invalid_evidence_reference_shape', 'v02_object_required');
      continue;
    }
    const o = asObject(item);
    if (!o) {
      pushReason(reasons, 'invalid_evidence_reference_shape');
      pushDetail(details, 'invalid_evidence_reference_shape', 'not_object');
      continue;
    }
    const keys = Object.keys(o);
    for (let k = 0; k < keys.length; k++) {
      if (COMPACT_REF_KEYS.indexOf(keys[k]) < 0) {
        pushReason(reasons, 'invalid_evidence_reference_shape');
        pushDetail(details, 'invalid_evidence_reference_shape', 'unknown_key:' + keys[k]);
      }
    }
    const evidenceId = normalizeTrim(o.evidenceId);
    const packetContractVersion = normalizeTrim(o.packetContractVersion);
    const expectedContentFingerprint = normalizeTrim(o.expectedContentFingerprint);
    if (!evidenceId || !packetContractVersion || !expectedContentFingerprint) {
      pushReason(reasons, 'invalid_evidence_reference_shape');
      pushDetail(details, 'invalid_evidence_reference_shape', 'missing_required_fields');
      continue;
    }
    if (
      SR_FIELD_REVIEW_SUPPORTED_EVIDENCE_PACKET_CONTRACT_VERSIONS.indexOf(
        packetContractVersion
      ) < 0
    ) {
      pushReason(reasons, 'unsupported_evidence_packet_contract_version');
      pushDetail(
        details,
        'unsupported_evidence_packet_contract_version',
        packetContractVersion
      );
      continue;
    }
    if (seen[evidenceId]) {
      pushReason(reasons, 'duplicate_evidence_ref');
      pushDetail(details, 'duplicate_evidence_ref', evidenceId);
      continue;
    }
    seen[evidenceId] = true;
    out.push({
      evidenceId: evidenceId,
      packetContractVersion: packetContractVersion,
      expectedContentFingerprint: expectedContentFingerprint
    });
  }

  if (reasons.length) {
    return freezeDeep({
      ok: false,
      normalized: null,
      reasons: reasons,
      details: details
    });
  }

  out.sort(function (a, b) {
    if (a.evidenceId < b.evidenceId) return -1;
    if (a.evidenceId > b.evidenceId) return 1;
    return 0;
  });

  return freezeDeep({
    ok: true,
    normalized: out,
    reasons: ['ok'],
    details: []
  });
}

/**
 * Normalize Field Review contextScope for fingerprints / comparison.
 * 0.1.0 preserves legacy string/object behavior; 0.2.0 reuses EP normalize.
 */
export function normalizeFieldReviewContextScope(scope, reviewContractVersion) {
  const version = isNonEmptyString(reviewContractVersion)
    ? String(reviewContractVersion).trim()
    : SR_FIELD_REVIEW_CONTRACT_VERSION;

  if (!isSupportedContract(version)) {
    return freezeDeep({
      ok: false,
      normalized: null,
      key: null,
      reasons: ['unsupported_review_contract_version']
    });
  }

  if (isContractV01(version)) {
    if (scope === undefined || scope === null) {
      return freezeDeep({
        ok: false,
        normalized: null,
        key: null,
        reasons: ['context_scope_required']
      });
    }
    if (typeof scope === 'string') {
      const s = scope.trim();
      if (!s) {
        return freezeDeep({
          ok: false,
          normalized: null,
          key: null,
          reasons: ['context_scope_required']
        });
      }
      return freezeDeep({ ok: true, normalized: s, key: s, reasons: ['ok'] });
    }
    if (typeof scope === 'object') {
      return freezeDeep({
        ok: true,
        normalized: scope,
        key: stableSerialize(scope),
        reasons: ['ok']
      });
    }
    return freezeDeep({
      ok: false,
      normalized: null,
      key: null,
      reasons: ['context_scope_required']
    });
  }

  // 0.2.0 — Evidence Packet structured context only.
  const ep = normalizeEvidencePacketContextScope(
    scope,
    SR_EVIDENCE_PACKET_CONTRACT_VERSION
  );
  if (!ep.ok) {
    return freezeDeep({
      ok: false,
      normalized: null,
      key: null,
      reasons: ['context_normalize_failed'],
      findings: ep.findings || []
    });
  }
  return freezeDeep({
    ok: true,
    normalized: ep.normalized,
    key: stableSerialize(ep.normalized),
    reasons: ['ok']
  });
}

function serializeEvidenceRefsForFingerprint(refs, version) {
  if (!refs) return null;
  if (isContractV01(version)) {
    return Array.isArray(refs) ? refs.join(',') : null;
  }
  if (!Array.isArray(refs)) return null;
  const parts = [];
  for (let i = 0; i < refs.length; i++) {
    const r = refs[i];
    parts.push(
      [
        r.evidenceId,
        r.packetContractVersion,
        r.expectedContentFingerprint
      ].join('~')
    );
  }
  return parts.join(',');
}

function buildDescriptor() {
  return freezeDeep({
    registryVersion: SR_FIELD_REVIEW_REGISTRY_VERSION,
    reviewContractVersion: SR_FIELD_REVIEW_CONTRACT_VERSION,
    supportedContractVersions: SR_FIELD_REVIEW_SUPPORTED_CONTRACT_VERSIONS.slice(),
    supportedRegistryVersions: SR_FIELD_REVIEW_SUPPORTED_REGISTRY_VERSIONS.slice(),
    supportedEvidencePacketContractVersions:
      SR_FIELD_REVIEW_SUPPORTED_EVIDENCE_PACKET_CONTRACT_VERSIONS.slice(),
    supportedEvidencePacketRegistryVersions:
      SR_FIELD_REVIEW_SUPPORTED_EVIDENCE_PACKET_REGISTRY_VERSIONS.slice(),
    capability: SR_FIELD_REVIEW_REGISTRY_CAPABILITY,
    developerOnly: true,
    authoritative: false,
    productConsumer: false,
    runtimeEligibilityAuthority: false,
    runtimeWired: false,
    persistence: false,
    network: false,
    automaticPopulation: false,
    automaticExecution: false,
    catalogMutation: false,
    evidenceMutation: false,
    fieldReviewMutation: false,
    needsReviewMutation: false,
    aliasOwnership: false,
    activation: 'explicit_call_only',
    productConsumers: 'none',
    allowedFields: SR_FIELD_REVIEW_FIELDS.slice(),
    claimTypes: SR_FIELD_REVIEW_CLAIM_TYPES.slice(),
    defaultReviewedValuesSun: SR_FIELD_REVIEW_DEFAULT_REVIEWED_VALUES_SUN.slice(),
    defaultReviewedValuesWater: SR_FIELD_REVIEW_DEFAULT_REVIEWED_VALUES_WATER.slice(),
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

  const reviewContractVersion = isNonEmptyString(o.reviewContractVersion)
    ? String(o.reviewContractVersion).trim()
    : SR_FIELD_REVIEW_CONTRACT_VERSION;

  if (!isSupportedContract(reviewContractVersion)) {
    return freezeDeep({
      ok: false,
      fingerprint: null,
      reasons: ['unsupported_review_contract_version']
    });
  }

  const canonicalKey = normalizeKey(o.canonicalKey);
  const field = isNonEmptyString(o.field) ? String(o.field).trim() : null;
  const reviewedValue = isNonEmptyString(o.reviewedValue)
    ? String(o.reviewedValue).trim()
    : null;
  const reviewedClaimType = isNonEmptyString(o.reviewedClaimType)
    ? String(o.reviewedClaimType).trim()
    : null;
  const sourceKind = isNonEmptyString(o.sourceKind) ? String(o.sourceKind).trim() : null;
  const sourceIds = normalizeStringArray(o.sourceIds);

  const refsNorm = normalizeFieldReviewEvidenceRefs(o.evidenceRefs, reviewContractVersion);
  const evidenceRefs = refsNorm.ok ? refsNorm.normalized : null;

  const ctxNorm = normalizeFieldReviewContextScope(o.contextScope, reviewContractVersion);
  const contextScopeKey = ctxNorm.ok ? ctxNorm.key : null;

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
  if (contextScopeKey == null) pushReason(reasons, 'fingerprint_inputs_incomplete');
  if (isContractV02(reviewContractVersion) && !reviewedClaimType) {
    pushReason(reasons, 'fingerprint_inputs_incomplete');
  }

  if (reasons.length) {
    return freezeDeep({ ok: false, fingerprint: null, reasons: reasons });
  }

  const refsSerialized = serializeEvidenceRefsForFingerprint(
    evidenceRefs,
    reviewContractVersion
  );

  const parts = isContractV01(reviewContractVersion)
    ? [
        canonicalKey,
        field,
        reviewedValue,
        sourceKind,
        sourceIds.join(','),
        refsSerialized,
        contextScopeKey,
        reviewContractVersion
      ]
    : [
        canonicalKey,
        field,
        reviewedClaimType,
        reviewedValue,
        sourceKind,
        sourceIds.join(','),
        refsSerialized,
        contextScopeKey,
        reviewContractVersion
      ];

  return freezeDeep({
    ok: true,
    fingerprint: parts.join('|'),
    reasons: ['ok']
  });
}

/**
 * Optional inert reference snapshot for developer comparison helpers.
 */
export function buildFieldReviewReferenceSnapshot(record, reviewContractVersion) {
  const rec = asObject(record);
  if (!rec) {
    return freezeDeep({ ok: false, snapshot: null, reasons: ['record_required'] });
  }
  const version = isNonEmptyString(reviewContractVersion)
    ? String(reviewContractVersion).trim()
    : isNonEmptyString(rec.reviewContractVersion)
      ? String(rec.reviewContractVersion).trim()
      : SR_FIELD_REVIEW_CONTRACT_VERSION;
  const refs = normalizeFieldReviewEvidenceRefs(rec.evidenceRefs, version);
  const ctx = normalizeFieldReviewContextScope(rec.contextScope, version);
  if (!refs.ok || !ctx.ok) {
    return freezeDeep({
      ok: false,
      snapshot: null,
      reasons: [].concat(refs.reasons || [], ctx.reasons || [])
    });
  }
  return freezeDeep({
    ok: true,
    snapshot: {
      reviewContractVersion: version,
      canonicalKey: normalizeKey(rec.canonicalKey),
      field: normalizeTrim(rec.field),
      reviewStatus: normalizeTrim(rec.reviewStatus),
      reviewedClaimType: normalizeTrim(rec.reviewedClaimType),
      reviewedValue: normalizeTrim(rec.reviewedValue),
      contextScope: ctx.normalized,
      evidenceRefs: refs.normalized,
      valueFingerprint: normalizeTrim(rec.valueFingerprint)
    },
    reasons: ['ok']
  });
}

/**
 * Validate a single developer/synthetic review record.
 * Context is supplied by the caller (harness); this module never loads product maps.
 */
export function validateFieldReviewRecord(record, context) {
  const reasons = [];
  const details = [];
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
      details: [],
      computedFingerprint: null,
      fingerprintMatches: null,
      stale: null,
      normalized: null
    });
  }

  if (!isSupportedContract(reviewContractVersion)) {
    return freezeDeep({
      valid: false,
      reasons: ['unsupported_review_contract_version'],
      details: [],
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
    if (knownCanonical.indexOf(canonicalKey) < 0) {
      pushReason(reasons, 'unknown_canonical_key');
    }
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
  const reviewedClaimType = isNonEmptyString(rec.reviewedClaimType)
    ? String(rec.reviewedClaimType).trim()
    : null;
  const valueFingerprint = isNonEmptyString(rec.valueFingerprint)
    ? String(rec.valueFingerprint).trim()
    : null;
  const sourceKind = isNonEmptyString(rec.sourceKind)
    ? String(rec.sourceKind).trim()
    : null;
  const sourceIds = Array.isArray(rec.sourceIds) ? normalizeStringArray(rec.sourceIds) : null;
  const reviewVersion = isNonEmptyString(rec.reviewVersion)
    ? String(rec.reviewVersion).trim()
    : null;
  const reviewedAt = isNonEmptyString(rec.reviewedAt) ? String(rec.reviewedAt).trim() : null;
  const reasonText = isNonEmptyString(rec.reason) ? String(rec.reason).trim() : null;

  let evidenceRefs = null;
  if (Array.isArray(rec.evidenceRefs)) {
    const refsNorm = normalizeFieldReviewEvidenceRefs(rec.evidenceRefs, reviewContractVersion);
    if (!refsNorm.ok) {
      for (let i = 0; i < refsNorm.reasons.length; i++) {
        if (refsNorm.reasons[i] !== 'ok') pushReason(reasons, refsNorm.reasons[i]);
      }
      for (let d = 0; d < (refsNorm.details || []).length; d++) {
        details.push(refsNorm.details[d]);
      }
    } else {
      evidenceRefs = refsNorm.normalized;
    }
  }

  let contextScope = null;
  let contextNormalized = null;
  if (isContractV01(reviewContractVersion)) {
    if (rec.contextScope === undefined || rec.contextScope === null) {
      contextScope = null;
    } else if (typeof rec.contextScope === 'string') {
      contextScope = rec.contextScope.trim() || null;
    } else if (typeof rec.contextScope === 'object') {
      contextScope = rec.contextScope;
    } else {
      contextScope = null;
    }
    contextNormalized = contextScope;
  } else {
    if (rec.contextScope != null) {
      const ctxNorm = normalizeFieldReviewContextScope(
        rec.contextScope,
        reviewContractVersion
      );
      if (!ctxNorm.ok) {
        pushReason(reasons, 'context_normalize_failed');
        if (isApproval) pushReason(reasons, 'context_scope_required');
      } else {
        contextScope = ctxNorm.normalized;
        contextNormalized = ctxNorm.normalized;
      }
    }
  }

  if (reviewedClaimType != null) {
    if (SR_FIELD_REVIEW_CLAIM_TYPES.indexOf(reviewedClaimType) < 0) {
      pushReason(reasons, 'unsupported_reviewed_claim_type');
    }
  }

  if (isApproval) {
    if (isContractV02(reviewContractVersion)) {
      if (!reviewedClaimType) pushReason(reasons, 'reviewed_claim_type_missing');
      else if (reviewedClaimType === 'general_guidance') {
        pushReason(reasons, 'general_guidance_not_approvable');
      }
    }
    if (!reviewedValue) pushReason(reasons, 'reviewed_value_required');
    if (!valueFingerprint) pushReason(reasons, 'value_fingerprint_required');
    if (!evidenceRefs || evidenceRefs.length === 0) {
      pushReason(reasons, 'evidence_refs_required');
    }
    if (!sourceKind) pushReason(reasons, 'source_kind_required');
    else if (SR_FIELD_REVIEW_SOURCE_KINDS.indexOf(sourceKind) < 0) {
      pushReason(reasons, 'unsupported_source_kind');
    }
    if (!sourceIds || sourceIds.length === 0) pushReason(reasons, 'source_ids_required');
    if (
      contextScope == null ||
      (typeof contextScope === 'string' && !contextScope)
    ) {
      pushReason(reasons, 'context_scope_required');
    }
    if (!reviewVersion) pushReason(reasons, 'review_version_required');
    if (!reviewedAt) pushReason(reasons, 'reviewed_at_required');
    else if (!isIsoDate(reviewedAt)) pushReason(reasons, 'invalid_reviewed_at');
    if (!reasonText) pushReason(reasons, 'reason_required');
  } else {
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

  if (reviewedValue) {
    if (isCompoundLegacyReviewedValue(reviewedValue)) {
      pushReason(reasons, 'unsupported_reviewed_value');
      pushDetail(details, 'unsupported_reviewed_value', 'compound_legacy_token');
    } else if (supportedTokens) {
      if (supportedTokens.indexOf(reviewedValue) < 0) {
        pushReason(reasons, 'unsupported_reviewed_value');
      }
    } else if (isContractV02(reviewContractVersion) && field) {
      const defaults = defaultReviewedValuesForField(field);
      if (defaults && defaults.indexOf(reviewedValue) < 0) {
        pushReason(reasons, 'unsupported_reviewed_value');
      }
    }
  }

  if (knownEvidence && evidenceRefs) {
    for (let i = 0; i < evidenceRefs.length; i++) {
      const id = isContractV01(reviewContractVersion)
        ? evidenceRefs[i]
        : evidenceRefs[i].evidenceId;
      if (knownEvidence.indexOf(id) < 0) {
        pushReason(reasons, 'evidence_ref_missing');
        break;
      }
    }
  }

  let computedFingerprint = null;
  let fingerprintMatches = null;
  let stale = null;

  const canFingerprint =
    isApproval &&
    reviewedValue &&
    sourceKind &&
    sourceIds &&
    evidenceRefs &&
    contextScope != null &&
    (!isContractV02(reviewContractVersion) || reviewedClaimType);

  if (canFingerprint) {
    const fp = buildFieldReviewValueFingerprint({
      canonicalKey: canonicalKey,
      field: field,
      reviewedClaimType: reviewedClaimType,
      reviewedValue: reviewedValue,
      sourceKind: sourceKind,
      sourceIds: sourceIds,
      evidenceRefs: evidenceRefs,
      contextScope: isContractV01(reviewContractVersion)
        ? contextScope
        : rec.contextScope,
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
    details: details,
    computedFingerprint: computedFingerprint,
    fingerprintMatches: fingerprintMatches,
    stale: stale,
    normalized: freezeDeep({
      canonicalKey: canonicalKey,
      field: field,
      reviewStatus: reviewStatus,
      reviewedClaimType: reviewedClaimType,
      reviewedValue: reviewedValue,
      valueFingerprint: valueFingerprint,
      evidenceRefs: evidenceRefs,
      sourceKind: sourceKind,
      sourceIds: sourceIds,
      contextScope: contextNormalized,
      reviewVersion: reviewVersion,
      reviewedAt: reviewedAt,
      reason: reasonText,
      reviewContractVersion: reviewContractVersion,
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

  const ctx = asObject(context) || {};
  const reviewContractVersion = isNonEmptyString(ctx.reviewContractVersion)
    ? String(ctx.reviewContractVersion).trim()
    : SR_FIELD_REVIEW_CONTRACT_VERSION;
  if (!isSupportedContract(reviewContractVersion)) {
    return freezeDeep({
      valid: false,
      reasons: ['unsupported_review_contract_version'],
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
      reviewedClaimType: n.reviewedClaimType,
      reviewedValue: n.reviewedValue,
      valueFingerprint: n.valueFingerprint,
      evidenceRefs: n.evidenceRefs
        ? JSON.parse(JSON.stringify(n.evidenceRefs))
        : null,
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
