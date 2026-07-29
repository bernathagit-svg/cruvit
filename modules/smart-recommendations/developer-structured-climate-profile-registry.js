/**
 * Cruvit — Smart Recommendations developer Structured Climate Profile registry
 * ---------------------------------------------------------------------------
 * Inert, developer/test-only, non-authoritative Layer C proof helpers.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Import defines immutable exports only — no evaluation of real plants.
 *  - No DOM, storage, fetch, timers, globals, or persistence.
 *  - Does not mutate catalog, Evidence Packet, Field Review, needsReview,
 *    eligibility, GOS, or v1b.
 *  - Real registry is empty; synthetic fixtures live only in the harness.
 *  - Field Review 0.2.0 is the only accepted reviewer-decision peer.
 */

import {
  SR_FIELD_REVIEW_CONTRACT_VERSION,
  SR_FIELD_REVIEW_REGISTRY_VERSION,
  SR_FIELD_REVIEW_CONTRACT_VERSION_V01,
  SR_FIELD_REVIEW_FIELDS,
  SR_FIELD_REVIEW_CLAIM_TYPES,
  SR_FIELD_REVIEW_DEFAULT_REVIEWED_VALUES_SUN,
  SR_FIELD_REVIEW_DEFAULT_REVIEWED_VALUES_WATER,
  SR_FIELD_REVIEW_COMPOUND_LEGACY_REVIEWED_VALUES,
  normalizeFieldReviewContextScope,
  normalizeFieldReviewEvidenceRefs
} from './developer-field-review-registry.js';

export const SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_VERSION =
  '0.1.0-sr-structured-climate-profile-registry';

/** Anti-accident capability token — not authentication. */
export const SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_CAPABILITY =
  'explicit_developer_structured_climate_profile_registry';

export const SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION =
  '0.1.0-sr-structured-climate-profile-contract';

export const SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_CONTRACT_VERSIONS =
  Object.freeze([SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION]);

export const SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_REGISTRY_VERSIONS =
  Object.freeze([SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_VERSION]);

/** Peer Field Review versions accepted for Layer C profile creation. */
export const SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_FIELD_REVIEW_CONTRACT_VERSIONS =
  Object.freeze([SR_FIELD_REVIEW_CONTRACT_VERSION]);

export const SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_FIELD_REVIEW_REGISTRY_VERSIONS =
  Object.freeze([SR_FIELD_REVIEW_REGISTRY_VERSION]);

export const SR_STRUCTURED_CLIMATE_PROFILE_FIELDS = Object.freeze(
  SR_FIELD_REVIEW_FIELDS.slice()
);

/** Primary reviewed claim types — general_guidance excluded for Layer C. */
export const SR_STRUCTURED_CLIMATE_PROFILE_CLAIM_TYPES = Object.freeze([
  'preference',
  'optimum',
  'tolerance',
  'survival_minimum'
]);

export const SR_STRUCTURED_CLIMATE_PROFILE_STATUSES = Object.freeze([
  'reviewed_supported',
  'reviewed_conflicting',
  'remains_ineligible',
  'modeling_gap',
  'identity_ambiguous',
  'context_ambiguous',
  'preference_tolerance_ambiguous'
]);

export const SR_STRUCTURED_CLIMATE_PROFILE_OUTCOME_APPLICABILITY = Object.freeze([
  'survival',
  'vegetative',
  'flowering',
  'fruiting',
  'reliability'
]);

export const SR_STRUCTURED_CLIMATE_PROFILE_REVIEWED_VALUES_SUN = Object.freeze(
  SR_FIELD_REVIEW_DEFAULT_REVIEWED_VALUES_SUN.slice()
);

export const SR_STRUCTURED_CLIMATE_PROFILE_REVIEWED_VALUES_WATER = Object.freeze(
  SR_FIELD_REVIEW_DEFAULT_REVIEWED_VALUES_WATER.slice()
);

export const SR_STRUCTURED_CLIMATE_PROFILE_COMPOUND_LEGACY_VALUES = Object.freeze(
  SR_FIELD_REVIEW_COMPOUND_LEGACY_REVIEWED_VALUES.slice()
);

export const SR_STRUCTURED_CLIMATE_PROFILE_REASONS = Object.freeze([
  'ok',
  'invalid_input',
  'unsupported_profile_contract_version',
  'unsupported_registry_version',
  'missing_profile_id',
  'duplicate_profile_id',
  'unsupported_field',
  'unsupported_profile_status',
  'canonical_key_required',
  'reviewed_claim_type_required',
  'unsupported_reviewed_claim_type',
  'general_guidance_not_approvable',
  'reviewed_value_required',
  'unsupported_reviewed_value',
  'invalid_context_scope',
  'context_scope_required',
  'invalid_field_review_reference',
  'unsupported_field_review_version',
  'legacy_field_review_insufficient',
  'invalid_evidence_reference',
  'duplicate_evidence_reference',
  'evidence_refs_required',
  'field_review_identity_mismatch',
  'field_review_field_mismatch',
  'field_review_status_mismatch',
  'field_review_claim_mismatch',
  'field_review_value_mismatch',
  'field_review_context_mismatch',
  'field_review_fingerprint_mismatch',
  'field_review_evidence_mismatch',
  'profile_stronger_than_field_review',
  'identity_ambiguous_profile_cannot_be_supported',
  'unsupported_outcome_applicability',
  'duplicate_active_canonical_field',
  'semantic_duplicate',
  'invalid_supersession',
  'fingerprint_mismatch',
  'fingerprint_inputs_incomplete',
  'unresolved_limitations_required',
  'mutation_detected'
]);

const NULL_SENTINEL = '__null__';
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

function pushReason(reasons, code) {
  if (reasons.indexOf(code) < 0) reasons.push(code);
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

function defaultReviewedValuesForField(field) {
  if (field === 'sun') return SR_STRUCTURED_CLIMATE_PROFILE_REVIEWED_VALUES_SUN;
  if (field === 'water') return SR_STRUCTURED_CLIMATE_PROFILE_REVIEWED_VALUES_WATER;
  return null;
}

function isCompoundLegacy(value) {
  return SR_STRUCTURED_CLIMATE_PROFILE_COMPOUND_LEGACY_VALUES.indexOf(value) >= 0;
}

function isSupportedProfileContract(version) {
  return (
    SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_CONTRACT_VERSIONS.indexOf(
      String(version || '').trim()
    ) >= 0
  );
}

function isSupportedFrContract(version) {
  return (
    SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_FIELD_REVIEW_CONTRACT_VERSIONS.indexOf(
      String(version || '').trim()
    ) >= 0
  );
}

function isSupportedFrRegistry(version) {
  return (
    SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_FIELD_REVIEW_REGISTRY_VERSIONS.indexOf(
      String(version || '').trim()
    ) >= 0
  );
}

/**
 * Normalize compact Evidence Packet refs for Profiles (FR 0.2.0 shape only).
 */
export function normalizeStructuredClimateProfileEvidenceRefs(refs) {
  if (refs == null) {
    return freezeDeep({
      ok: false,
      normalized: null,
      reasons: ['invalid_evidence_reference']
    });
  }
  if (!Array.isArray(refs)) {
    return freezeDeep({
      ok: false,
      normalized: null,
      reasons: ['invalid_evidence_reference']
    });
  }
  if (refs.length === 0) {
    return freezeDeep({
      ok: true,
      normalized: Object.freeze([]),
      reasons: ['ok']
    });
  }

  const out = [];
  const seenIds = Object.create(null);
  const reasons = [];

  for (let i = 0; i < refs.length; i++) {
    const item = refs[i];
    if (!asObject(item)) {
      pushReason(reasons, 'invalid_evidence_reference');
      continue;
    }
    const keys = Object.keys(item);
    for (let k = 0; k < keys.length; k++) {
      if (COMPACT_REF_KEYS.indexOf(keys[k]) < 0) {
        pushReason(reasons, 'invalid_evidence_reference');
      }
    }
    const evidenceId = normalizeTrim(item.evidenceId);
    const packetContractVersion = normalizeTrim(item.packetContractVersion);
    const expectedContentFingerprint = normalizeTrim(item.expectedContentFingerprint);
    if (!evidenceId || !packetContractVersion || !expectedContentFingerprint) {
      pushReason(reasons, 'invalid_evidence_reference');
      continue;
    }
    if (seenIds[evidenceId]) {
      pushReason(reasons, 'duplicate_evidence_reference');
      continue;
    }
    seenIds[evidenceId] = true;
    out.push({
      evidenceId: evidenceId,
      packetContractVersion: packetContractVersion,
      expectedContentFingerprint: expectedContentFingerprint
    });
  }

  if (reasons.length) {
    return freezeDeep({ ok: false, normalized: null, reasons: reasons });
  }

  out.sort(function (a, b) {
    if (a.evidenceId < b.evidenceId) return -1;
    if (a.evidenceId > b.evidenceId) return 1;
    return 0;
  });

  return freezeDeep({
    ok: true,
    normalized: Object.freeze(out.map(function (r) {
      return Object.freeze({
        evidenceId: r.evidenceId,
        packetContractVersion: r.packetContractVersion,
        expectedContentFingerprint: r.expectedContentFingerprint
      });
    })),
    reasons: ['ok']
  });
}

/**
 * Normalize Profile context via Field Review 0.2.0 helper (one-way).
 */
export function normalizeStructuredClimateProfileContextScope(scope) {
  const fr = normalizeFieldReviewContextScope(
    scope,
    SR_FIELD_REVIEW_CONTRACT_VERSION
  );
  if (!fr.ok) {
    return freezeDeep({
      ok: false,
      normalized: null,
      key: null,
      reasons: ['invalid_context_scope']
    });
  }
  return freezeDeep({
    ok: true,
    normalized: fr.normalized,
    key: fr.key,
    reasons: ['ok']
  });
}

function normalizeOutcomeApplicability(arr) {
  if (arr == null) {
    return freezeDeep({ ok: true, normalized: null, reasons: ['ok'] });
  }
  if (!Array.isArray(arr)) {
    return freezeDeep({
      ok: false,
      normalized: null,
      reasons: ['unsupported_outcome_applicability']
    });
  }
  if (arr.length === 0) {
    return freezeDeep({ ok: true, normalized: null, reasons: ['ok'] });
  }
  const seen = Object.create(null);
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const t = normalizeTrim(arr[i]);
    if (!t || SR_STRUCTURED_CLIMATE_PROFILE_OUTCOME_APPLICABILITY.indexOf(t) < 0) {
      return freezeDeep({
        ok: false,
        normalized: null,
        reasons: ['unsupported_outcome_applicability']
      });
    }
    if (seen[t]) continue;
    seen[t] = true;
    out.push(t);
  }
  out.sort();
  return freezeDeep({
    ok: true,
    normalized: Object.freeze(out.slice()),
    reasons: ['ok']
  });
}

function normalizeUnresolvedLimitations(arr) {
  if (arr == null) {
    return freezeDeep({
      ok: false,
      normalized: null,
      reasons: ['unresolved_limitations_required']
    });
  }
  if (!Array.isArray(arr)) {
    return freezeDeep({
      ok: false,
      normalized: null,
      reasons: ['unresolved_limitations_required']
    });
  }
  const seen = Object.create(null);
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const t = normalizeTrim(arr[i]);
    if (!t) continue;
    if (seen[t]) continue;
    seen[t] = true;
    out.push(t);
  }
  out.sort();
  return freezeDeep({
    ok: true,
    normalized: Object.freeze(out.slice()),
    reasons: ['ok']
  });
}

function serializeEvidenceRefs(refs) {
  if (!refs || !refs.length) return '';
  const parts = [];
  for (let i = 0; i < refs.length; i++) {
    const r = refs[i];
    parts.push(
      [r.evidenceId, r.packetContractVersion, r.expectedContentFingerprint].join('~')
    );
  }
  return parts.join(',');
}

/**
 * Semantic Profile fingerprint.
 * profileId is intentionally excluded — identity of the artifact is not
 * meaning-changing for semantic duplicate detection.
 */
export function buildStructuredClimateProfileFingerprint(inputs) {
  const reasons = [];
  const o = asObject(inputs);
  if (!o) {
    return freezeDeep({
      ok: false,
      fingerprint: null,
      reasons: ['fingerprint_inputs_incomplete']
    });
  }

  const profileContractVersion = normalizeTrim(o.profileContractVersion);
  if (!isSupportedProfileContract(profileContractVersion)) {
    return freezeDeep({
      ok: false,
      fingerprint: null,
      reasons: ['unsupported_profile_contract_version']
    });
  }

  const canonicalKey = normalizeKey(o.canonicalKey);
  const field = normalizeTrim(o.field);
  const profileStatus = normalizeTrim(o.profileStatus);
  const reviewedClaimType = isNonEmptyString(o.reviewedClaimType)
    ? String(o.reviewedClaimType).trim()
    : null;
  const reviewedValue = isNonEmptyString(o.reviewedValue)
    ? String(o.reviewedValue).trim()
    : null;

  const ctxNorm = normalizeStructuredClimateProfileContextScope(o.contextScope);
  const contextKey = ctxNorm.ok ? ctxNorm.key : null;

  const refsNorm = normalizeStructuredClimateProfileEvidenceRefs(
    o.evidenceRefs == null ? [] : o.evidenceRefs
  );
  const evidenceRefs = refsNorm.ok ? refsNorm.normalized : null;

  const fr = asObject(o.fieldReviewReference);
  const frFp = fr ? normalizeTrim(fr.valueFingerprint) : null;
  const frContract = fr ? normalizeTrim(fr.fieldReviewContractVersion) : null;
  const frRegistry = fr ? normalizeTrim(fr.fieldReviewRegistryVersion) : null;
  const frStatus = fr ? normalizeTrim(fr.reviewStatus) : null;

  const outcomesNorm = normalizeOutcomeApplicability(o.outcomeApplicability);
  const outcomes = outcomesNorm.ok ? outcomesNorm.normalized : null;

  const limNorm = normalizeUnresolvedLimitations(
    Array.isArray(o.unresolvedLimitations) ? o.unresolvedLimitations : []
  );
  const limitations = limNorm.ok ? limNorm.normalized : null;

  const supersedes = normalizeTrim(o.supersedesProfileId);

  if (!canonicalKey) pushReason(reasons, 'fingerprint_inputs_incomplete');
  if (!field) pushReason(reasons, 'fingerprint_inputs_incomplete');
  if (!profileStatus) pushReason(reasons, 'fingerprint_inputs_incomplete');
  if (!ctxNorm.ok || contextKey == null) pushReason(reasons, 'fingerprint_inputs_incomplete');
  if (!refsNorm.ok) pushReason(reasons, 'fingerprint_inputs_incomplete');
  if (!fr || !frFp || !frContract || !frRegistry || !frStatus) {
    pushReason(reasons, 'fingerprint_inputs_incomplete');
  }
  if (!outcomesNorm.ok) pushReason(reasons, 'fingerprint_inputs_incomplete');
  if (!limNorm.ok) pushReason(reasons, 'fingerprint_inputs_incomplete');

  if (reasons.length) {
    return freezeDeep({ ok: false, fingerprint: null, reasons: reasons });
  }

  const parts = [
    profileContractVersion,
    canonicalKey,
    field,
    profileStatus,
    reviewedClaimType == null ? NULL_SENTINEL : reviewedClaimType,
    reviewedValue == null ? NULL_SENTINEL : reviewedValue,
    contextKey,
    outcomes && outcomes.length ? outcomes.join(',') : NULL_SENTINEL,
    frContract,
    frRegistry,
    frStatus,
    frFp,
    serializeEvidenceRefs(evidenceRefs),
    limitations && limitations.length ? limitations.join(',') : NULL_SENTINEL,
    supersedes == null ? NULL_SENTINEL : supersedes
  ];

  return freezeDeep({
    ok: true,
    fingerprint: parts.join('|'),
    reasons: ['ok']
  });
}

/**
 * Semantic duplicate key — same meaning-changing fingerprint body.
 */
export function buildStructuredClimateProfileSemanticKey(profileOrInputs) {
  const fp = buildStructuredClimateProfileFingerprint(profileOrInputs);
  if (!fp.ok) {
    return freezeDeep({ ok: false, key: null, reasons: fp.reasons.slice() });
  }
  return freezeDeep({ ok: true, key: fp.fingerprint, reasons: ['ok'] });
}

function normalizeFieldReviewReference(ref, profile) {
  const reasons = [];
  const o = asObject(ref);
  if (!o) {
    return freezeDeep({
      ok: false,
      normalized: null,
      reasons: ['invalid_field_review_reference']
    });
  }

  const frContract = normalizeTrim(o.fieldReviewContractVersion);
  const frRegistry = normalizeTrim(o.fieldReviewRegistryVersion);
  const frKey = normalizeKey(o.canonicalKey);
  const frField = normalizeTrim(o.field);
  const reviewStatus = normalizeTrim(o.reviewStatus);
  const valueFingerprint = normalizeTrim(o.valueFingerprint);
  const reviewedClaimType = isNonEmptyString(o.reviewedClaimType)
    ? String(o.reviewedClaimType).trim()
    : null;
  const reviewedValue = isNonEmptyString(o.reviewedValue)
    ? String(o.reviewedValue).trim()
    : null;

  if (!frContract || !frRegistry || !frKey || !frField || !reviewStatus || !valueFingerprint) {
    pushReason(reasons, 'invalid_field_review_reference');
  }

  if (frContract === SR_FIELD_REVIEW_CONTRACT_VERSION_V01) {
    pushReason(reasons, 'legacy_field_review_insufficient');
  } else if (frContract && !isSupportedFrContract(frContract)) {
    pushReason(reasons, 'unsupported_field_review_version');
  }
  if (frRegistry && !isSupportedFrRegistry(frRegistry)) {
    pushReason(reasons, 'unsupported_field_review_version');
  }

  if (profile) {
    if (frKey && profile.canonicalKey && frKey !== profile.canonicalKey) {
      pushReason(reasons, 'field_review_identity_mismatch');
    }
    if (frField && profile.field && frField !== profile.field) {
      pushReason(reasons, 'field_review_field_mismatch');
    }
  }

  if (reasons.length) {
    return freezeDeep({ ok: false, normalized: null, reasons: reasons });
  }

  return freezeDeep({
    ok: true,
    normalized: Object.freeze({
      fieldReviewContractVersion: frContract,
      fieldReviewRegistryVersion: frRegistry,
      canonicalKey: frKey,
      field: frField,
      reviewStatus: reviewStatus,
      valueFingerprint: valueFingerprint,
      reviewedClaimType: reviewedClaimType,
      reviewedValue: reviewedValue
    }),
    reasons: ['ok']
  });
}

/**
 * Validate a single developer/synthetic Structured Climate Profile.
 */
export function validateStructuredClimateProfile(profile, context) {
  const reasons = [];
  const ctx = asObject(context) || {};
  const profileContractVersion = isNonEmptyString(ctx.profileContractVersion)
    ? String(ctx.profileContractVersion).trim()
    : SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION;

  const rec = asObject(profile);
  if (!rec) {
    return freezeDeep({
      valid: false,
      reasons: ['invalid_input'],
      computedFingerprint: null,
      fingerprintMatches: null,
      normalized: null,
      semanticKey: null
    });
  }

  if (!isSupportedProfileContract(profileContractVersion)) {
    return freezeDeep({
      valid: false,
      reasons: ['unsupported_profile_contract_version'],
      computedFingerprint: null,
      fingerprintMatches: null,
      normalized: null,
      semanticKey: null
    });
  }

  const declaredContract = normalizeTrim(rec.profileContractVersion);
  if (declaredContract && !isSupportedProfileContract(declaredContract)) {
    pushReason(reasons, 'unsupported_profile_contract_version');
  }
  if (declaredContract && declaredContract !== profileContractVersion) {
    pushReason(reasons, 'unsupported_profile_contract_version');
  }

  const profileId = normalizeTrim(rec.profileId);
  if (!profileId) pushReason(reasons, 'missing_profile_id');

  const canonicalKey = normalizeKey(rec.canonicalKey);
  if (!canonicalKey) pushReason(reasons, 'canonical_key_required');

  const field = normalizeTrim(rec.field);
  if (!field || SR_STRUCTURED_CLIMATE_PROFILE_FIELDS.indexOf(field) < 0) {
    pushReason(reasons, 'unsupported_field');
  }

  const profileStatus = normalizeTrim(rec.profileStatus);
  if (
    !profileStatus ||
    SR_STRUCTURED_CLIMATE_PROFILE_STATUSES.indexOf(profileStatus) < 0
  ) {
    pushReason(reasons, 'unsupported_profile_status');
  }

  const isSupported = profileStatus === 'reviewed_supported';
  const reviewedClaimType = isNonEmptyString(rec.reviewedClaimType)
    ? String(rec.reviewedClaimType).trim()
    : null;
  const reviewedValue = isNonEmptyString(rec.reviewedValue)
    ? String(rec.reviewedValue).trim()
    : null;

  if (reviewedClaimType != null) {
    if (reviewedClaimType === 'general_guidance') {
      pushReason(reasons, 'general_guidance_not_approvable');
    } else if (
      SR_STRUCTURED_CLIMATE_PROFILE_CLAIM_TYPES.indexOf(reviewedClaimType) < 0
    ) {
      if (SR_FIELD_REVIEW_CLAIM_TYPES.indexOf(reviewedClaimType) >= 0) {
        pushReason(reasons, 'unsupported_reviewed_claim_type');
      } else {
        pushReason(reasons, 'unsupported_reviewed_claim_type');
      }
    }
  }

  if (isSupported) {
    if (!reviewedClaimType) pushReason(reasons, 'reviewed_claim_type_required');
    if (!reviewedValue) pushReason(reasons, 'reviewed_value_required');
    if (profileStatus === 'identity_ambiguous') {
      pushReason(reasons, 'identity_ambiguous_profile_cannot_be_supported');
    }
  }

  if (profileStatus === 'identity_ambiguous' && isSupported) {
    pushReason(reasons, 'identity_ambiguous_profile_cannot_be_supported');
  }

  if (reviewedValue) {
    if (isCompoundLegacy(reviewedValue)) {
      pushReason(reasons, 'unsupported_reviewed_value');
    } else if (field) {
      const defaults = defaultReviewedValuesForField(field);
      if (defaults && defaults.indexOf(reviewedValue) < 0) {
        pushReason(reasons, 'unsupported_reviewed_value');
      }
    }
  }

  let contextScope = null;
  let contextKey = null;
  if (rec.contextScope == null) {
    if (isSupported) pushReason(reasons, 'context_scope_required');
    else pushReason(reasons, 'invalid_context_scope');
  } else {
    const ctxNorm = normalizeStructuredClimateProfileContextScope(rec.contextScope);
    if (!ctxNorm.ok) {
      pushReason(reasons, 'invalid_context_scope');
      if (isSupported) pushReason(reasons, 'context_scope_required');
    } else {
      contextScope = ctxNorm.normalized;
      contextKey = ctxNorm.key;
    }
  }

  const frNorm = normalizeFieldReviewReference(rec.fieldReviewReference, {
    canonicalKey: canonicalKey,
    field: field
  });
  let fieldReviewReference = null;
  if (!frNorm.ok) {
    for (let i = 0; i < frNorm.reasons.length; i++) {
      pushReason(reasons, frNorm.reasons[i]);
    }
  } else {
    fieldReviewReference = frNorm.normalized;
  }

  let evidenceRefs = null;
  if (isSupported) {
    if (!Array.isArray(rec.evidenceRefs) || rec.evidenceRefs.length === 0) {
      pushReason(reasons, 'evidence_refs_required');
    } else {
      const refsNorm = normalizeStructuredClimateProfileEvidenceRefs(rec.evidenceRefs);
      if (!refsNorm.ok) {
        for (let i = 0; i < refsNorm.reasons.length; i++) {
          pushReason(reasons, refsNorm.reasons[i]);
        }
      } else {
        evidenceRefs = refsNorm.normalized;
      }
    }
  } else if (rec.evidenceRefs != null) {
    const refsNorm = normalizeStructuredClimateProfileEvidenceRefs(rec.evidenceRefs);
    if (!refsNorm.ok) {
      for (let i = 0; i < refsNorm.reasons.length; i++) {
        pushReason(reasons, refsNorm.reasons[i]);
      }
    } else {
      evidenceRefs = refsNorm.normalized;
    }
  } else {
    evidenceRefs = Object.freeze([]);
  }

  const outcomesNorm = normalizeOutcomeApplicability(rec.outcomeApplicability);
  let outcomeApplicability = null;
  if (!outcomesNorm.ok) {
    pushReason(reasons, 'unsupported_outcome_applicability');
  } else {
    outcomeApplicability = outcomesNorm.normalized;
  }

  const limNorm = normalizeUnresolvedLimitations(
    Array.isArray(rec.unresolvedLimitations) ? rec.unresolvedLimitations : null
  );
  let unresolvedLimitations = null;
  if (!limNorm.ok) {
    pushReason(reasons, 'unresolved_limitations_required');
  } else {
    unresolvedLimitations = limNorm.normalized;
  }

  const supersedesProfileId = normalizeTrim(rec.supersedesProfileId);
  if (supersedesProfileId && profileId && supersedesProfileId === profileId) {
    pushReason(reasons, 'invalid_supersession');
  }

  // Authority / FR alignment when FR ref is present
  if (fieldReviewReference) {
    if (
      isSupported &&
      fieldReviewReference.reviewStatus !== 'reviewed_supported'
    ) {
      pushReason(reasons, 'profile_stronger_than_field_review');
    }
    if (
      fieldReviewReference.reviewStatus === 'identity_ambiguous' &&
      isSupported
    ) {
      pushReason(reasons, 'identity_ambiguous_profile_cannot_be_supported');
    }
    if (
      isSupported &&
      fieldReviewReference.reviewedClaimType != null &&
      reviewedClaimType &&
      fieldReviewReference.reviewedClaimType !== reviewedClaimType
    ) {
      pushReason(reasons, 'field_review_claim_mismatch');
    }
    if (
      isSupported &&
      fieldReviewReference.reviewedValue != null &&
      reviewedValue &&
      fieldReviewReference.reviewedValue !== reviewedValue
    ) {
      pushReason(reasons, 'field_review_value_mismatch');
    }
    if (
      isSupported &&
      profileStatus === 'reviewed_supported' &&
      fieldReviewReference.reviewStatus === 'reviewed_supported' &&
      !fieldReviewReference.reviewedClaimType &&
      reviewedClaimType
    ) {
      // FR ref omitted claim — still require match via Validator snapshots;
      // Registry only flags missing peer claim when FR supplies one.
    }
  }

  // Optional FR evidence-ref cross-check via context
  const peerRefs = Array.isArray(ctx.fieldReviewEvidenceRefs)
    ? ctx.fieldReviewEvidenceRefs
    : null;
  if (peerRefs && evidenceRefs && isSupported) {
    const peerNorm = normalizeStructuredClimateProfileEvidenceRefs(peerRefs);
    if (peerNorm.ok) {
      const a = serializeEvidenceRefs(evidenceRefs);
      const b = serializeEvidenceRefs(peerNorm.normalized);
      if (a !== b) pushReason(reasons, 'field_review_evidence_mismatch');
    }
  }

  const peerContext = ctx.fieldReviewContextScope;
  if (peerContext != null && contextScope != null && isSupported) {
    const peerCtx = normalizeStructuredClimateProfileContextScope(peerContext);
    if (peerCtx.ok && peerCtx.key !== contextKey) {
      pushReason(reasons, 'field_review_context_mismatch');
    }
  }

  let computedFingerprint = null;
  let fingerprintMatches = null;
  let semanticKey = null;

  const canFingerprint =
    profileId &&
    canonicalKey &&
    field &&
    profileStatus &&
    contextScope != null &&
    fieldReviewReference &&
    evidenceRefs != null &&
    unresolvedLimitations != null &&
    outcomesNorm.ok;

  if (canFingerprint && reasons.indexOf('unsupported_profile_contract_version') < 0) {
    const fp = buildStructuredClimateProfileFingerprint({
      profileContractVersion: profileContractVersion,
      canonicalKey: canonicalKey,
      field: field,
      profileStatus: profileStatus,
      reviewedClaimType: reviewedClaimType,
      reviewedValue: reviewedValue,
      contextScope: contextScope,
      outcomeApplicability: outcomeApplicability,
      fieldReviewReference: fieldReviewReference,
      evidenceRefs: evidenceRefs,
      unresolvedLimitations: unresolvedLimitations,
      supersedesProfileId: supersedesProfileId
    });
    if (fp.ok) {
      computedFingerprint = fp.fingerprint;
      semanticKey = fp.fingerprint;
      const stored = normalizeTrim(rec.profileFingerprint);
      if (stored) {
        fingerprintMatches = stored === computedFingerprint;
        if (!fingerprintMatches) pushReason(reasons, 'fingerprint_mismatch');
      }
    } else {
      for (let i = 0; i < fp.reasons.length; i++) {
        if (fp.reasons[i] !== 'ok') pushReason(reasons, fp.reasons[i]);
      }
    }
  }

  const valid = reasons.length === 0;
  if (valid) pushReason(reasons, 'ok');

  const normalized = valid
    ? freezeDeep({
        profileId: profileId,
        profileContractVersion: profileContractVersion,
        canonicalKey: canonicalKey,
        field: field,
        profileStatus: profileStatus,
        reviewedClaimType: reviewedClaimType,
        reviewedValue: reviewedValue,
        contextScope: contextScope,
        fieldReviewReference: fieldReviewReference,
        evidenceRefs: evidenceRefs,
        outcomeApplicability: outcomeApplicability,
        unresolvedLimitations: unresolvedLimitations,
        supersedesProfileId: supersedesProfileId,
        profileFingerprint: computedFingerprint
      })
    : null;

  return freezeDeep({
    valid: valid,
    reasons: reasons.slice(),
    computedFingerprint: computedFingerprint,
    fingerprintMatches: fingerprintMatches,
    normalized: normalized,
    semanticKey: semanticKey
  });
}

function buildSummaryFingerprint(parts) {
  return [
    SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_VERSION,
    SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
    parts.profileCount || 0,
    parts.valid ? 1 : 0,
    parts.reasonCodes ? parts.reasonCodes.join(',') : '',
    parts.semanticKeys ? parts.semanticKeys.join(',') : ''
  ].join('|');
}

/**
 * Validate and build a synthetic Profile registry. Never mutates inputs.
 * Never populates the exported empty real registry.
 */
export function validateAndBuildStructuredClimateProfileRegistry(profiles, context) {
  const reasons = [];
  const snapshotBefore = Array.isArray(profiles) ? stableSerialize(profiles) : null;

  if (!Array.isArray(profiles)) {
    return freezeDeep({
      valid: false,
      reasons: ['invalid_input'],
      registry: null,
      profileResults: [],
      summaryFingerprint: buildSummaryFingerprint({
        profileCount: 0,
        valid: false,
        reasonCodes: ['invalid_input'],
        semanticKeys: []
      })
    });
  }

  const ctx = asObject(context) || {};
  const profileContractVersion = isNonEmptyString(ctx.profileContractVersion)
    ? String(ctx.profileContractVersion).trim()
    : SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION;
  if (!isSupportedProfileContract(profileContractVersion)) {
    return freezeDeep({
      valid: false,
      reasons: ['unsupported_profile_contract_version'],
      registry: null,
      profileResults: [],
      summaryFingerprint: buildSummaryFingerprint({
        profileCount: 0,
        valid: false,
        reasonCodes: ['unsupported_profile_contract_version'],
        semanticKeys: []
      })
    });
  }

  const registryVersion = isNonEmptyString(ctx.registryVersion)
    ? String(ctx.registryVersion).trim()
    : SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_VERSION;
  if (
    SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_REGISTRY_VERSIONS.indexOf(registryVersion) < 0
  ) {
    return freezeDeep({
      valid: false,
      reasons: ['unsupported_registry_version'],
      registry: null,
      profileResults: [],
      summaryFingerprint: buildSummaryFingerprint({
        profileCount: 0,
        valid: false,
        reasonCodes: ['unsupported_registry_version'],
        semanticKeys: []
      })
    });
  }

  const profileResults = [];
  const byId = Object.create(null);
  const semanticSeen = Object.create(null);
  const activeSeen = Object.create(null);
  const nested = Object.create(null);
  const supersedeTargets = Object.create(null);
  const semanticKeys = [];
  let allValid = true;

  for (let i = 0; i < profiles.length; i++) {
    const result = validateStructuredClimateProfile(profiles[i], {
      profileContractVersion: profileContractVersion,
      fieldReviewEvidenceRefs: ctx.fieldReviewEvidenceRefs,
      fieldReviewContextScope: ctx.fieldReviewContextScope
    });
    profileResults.push(result);
    if (!result.valid) {
      allValid = false;
      for (let r = 0; r < result.reasons.length; r++) {
        if (result.reasons[r] !== 'ok') pushReason(reasons, result.reasons[r]);
      }
      continue;
    }
    const n = result.normalized;
    if (byId[n.profileId]) {
      allValid = false;
      pushReason(reasons, 'duplicate_profile_id');
      continue;
    }
    byId[n.profileId] = n;

    if (semanticSeen[n.profileFingerprint]) {
      allValid = false;
      pushReason(reasons, 'semantic_duplicate');
      continue;
    }
    semanticSeen[n.profileFingerprint] = n.profileId;
    semanticKeys.push(n.profileFingerprint);

    const activeKey = n.canonicalKey + '::' + n.field;
    if (activeSeen[activeKey]) {
      allValid = false;
      pushReason(reasons, 'duplicate_active_canonical_field');
      continue;
    }
    activeSeen[activeKey] = n.profileId;

    if (n.supersedesProfileId) {
      supersedeTargets[n.supersedesProfileId] = n.profileId;
    }

    if (!nested[n.canonicalKey]) nested[n.canonicalKey] = Object.create(null);
    nested[n.canonicalKey][n.field] = {
      profileId: n.profileId,
      profileContractVersion: n.profileContractVersion,
      canonicalKey: n.canonicalKey,
      field: n.field,
      profileStatus: n.profileStatus,
      reviewedClaimType: n.reviewedClaimType,
      reviewedValue: n.reviewedValue,
      contextScope: n.contextScope,
      fieldReviewReference: n.fieldReviewReference,
      evidenceRefs: n.evidenceRefs
        ? JSON.parse(JSON.stringify(n.evidenceRefs))
        : [],
      outcomeApplicability: n.outcomeApplicability
        ? n.outcomeApplicability.slice()
        : null,
      unresolvedLimitations: n.unresolvedLimitations.slice(),
      supersedesProfileId: n.supersedesProfileId,
      profileFingerprint: n.profileFingerprint
    };
  }

  // Minimal supersession: targets must exist in this batch when claimed
  const ids = Object.keys(byId);
  for (let i = 0; i < ids.length; i++) {
    const p = byId[ids[i]];
    if (p.supersedesProfileId && !byId[p.supersedesProfileId]) {
      allValid = false;
      pushReason(reasons, 'invalid_supersession');
    }
  }

  // If A is superseded by B, A and B must not both count as active for same key —
  // for v0.1 we only allow one profile per key+field in the input set (already checked).

  if (snapshotBefore != null) {
    const after = stableSerialize(profiles);
    if (after !== snapshotBefore) {
      allValid = false;
      pushReason(reasons, 'mutation_detected');
    }
  }

  if (allValid && reasons.length === 0) pushReason(reasons, 'ok');

  const reasonCodes = reasons.filter(function (r) {
    return r !== 'ok';
  });
  reasonCodes.sort();

  const registry = allValid
    ? freezeDeep({
        registryVersion: SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_VERSION,
        profileContractVersion: SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
        profiles: nested
      })
    : null;

  return freezeDeep({
    valid: allValid,
    reasons: reasons.slice(),
    registry: registry,
    profileResults: profileResults,
    summaryFingerprint: buildSummaryFingerprint({
      profileCount: profiles.length,
      valid: allValid,
      reasonCodes: reasonCodes,
      semanticKeys: semanticKeys.slice().sort()
    })
  });
}

function buildDescriptor() {
  return freezeDeep({
    registryVersion: SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_VERSION,
    profileContractVersion: SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
    supportedContractVersions:
      SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_CONTRACT_VERSIONS.slice(),
    supportedRegistryVersions:
      SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_REGISTRY_VERSIONS.slice(),
    supportedFieldReviewContractVersions:
      SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_FIELD_REVIEW_CONTRACT_VERSIONS.slice(),
    supportedFieldReviewRegistryVersions:
      SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_FIELD_REVIEW_REGISTRY_VERSIONS.slice(),
    capability: SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_CAPABILITY,
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
    profileMutation: false,
    needsReviewMutation: false,
    activation: 'explicit_call_only',
    productConsumers: 'none',
    allowedFields: SR_STRUCTURED_CLIMATE_PROFILE_FIELDS.slice(),
    claimTypes: SR_STRUCTURED_CLIMATE_PROFILE_CLAIM_TYPES.slice(),
    storedStatuses: SR_STRUCTURED_CLIMATE_PROFILE_STATUSES.slice(),
    outcomeApplicabilityTokens:
      SR_STRUCTURED_CLIMATE_PROFILE_OUTCOME_APPLICABILITY.slice(),
    reasons: SR_STRUCTURED_CLIMATE_PROFILE_REASONS.slice(),
    realProfileCount: 0
  });
}

const DESCRIPTOR = buildDescriptor();

const EMPTY_REGISTRY = freezeDeep({
  registryVersion: SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_VERSION,
  profileContractVersion: SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
  profiles: {}
});

export function getSmartRecDeveloperStructuredClimateProfileRegistryDescriptor() {
  return DESCRIPTOR;
}

export function getEmptySmartRecDeveloperStructuredClimateProfileRegistry() {
  return EMPTY_REGISTRY;
}
