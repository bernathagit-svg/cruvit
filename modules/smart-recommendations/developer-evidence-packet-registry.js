/**
 * Cruvit — Smart Recommendations developer evidence packet registry
 * ---------------------------------------------------------------------------
 * Inert, developer/test-only, non-authoritative pure helpers for proving
 * source-backed sun/water evidence packet structure and registry integrity.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Import defines immutable exports only — no evaluation of real plants.
 *  - No DOM, storage, fetch, timers, globals, or persistence.
 *  - Does not import catalog, field-review registry/validator, GOS, v1b,
 *    identity Sidecar, or Smart Recommendations runtime.
 *  - Real registry is empty; synthetic fixtures live only in the harness.
 *  - Does not create field-review records, approve values, or clear needsReview.
 */

export const SR_EVIDENCE_PACKET_REGISTRY_VERSION =
  '0.1.0-sr-evidence-packet-registry';

/** Anti-accident capability token — not authentication. */
export const SR_EVIDENCE_PACKET_REGISTRY_CAPABILITY =
  'explicit_developer_evidence_packet_registry';

/** Packet contract version included in fingerprints. */
export const SR_EVIDENCE_PACKET_CONTRACT_VERSION =
  '0.1.0-sr-evidence-packet-contract';

export const SR_EVIDENCE_PACKET_FIELDS = Object.freeze(['sun', 'water']);

export const SR_EVIDENCE_CLAIM_TYPES = Object.freeze([
  'preference',
  'optimum',
  'tolerance',
  'survival_minimum',
  'general_guidance'
]);

export const SR_EVIDENCE_AUTHORITY_TIERS = Object.freeze(['A', 'B', 'C']);

export const SR_EVIDENCE_PACKET_STATUSES = Object.freeze([
  'draft',
  'collected',
  'stale',
  'withdrawn',
  'superseded',
  'rejected'
]);

export const SR_EVIDENCE_SOURCE_TYPES = Object.freeze([
  'government',
  'university_extension',
  'botanical_institution',
  'peer_reviewed_publication',
  'breeder_or_cultivar_documentation',
  'professional_horticultural_society',
  'professional_grower_or_nursery',
  'institutional_database',
  'commercial_page',
  'blog_or_unsourced_database',
  'ai_generated_summary',
  'other'
]);

export const SR_EVIDENCE_CONTEXT_SETTINGS = Object.freeze([
  'indoor',
  'outdoor',
  'unknown'
]);

export const SR_EVIDENCE_CONTEXT_PLANTINGS = Object.freeze([
  'container',
  'ground',
  'unknown'
]);

export const SR_EVIDENCE_CONTEXT_MATURITIES = Object.freeze([
  'establishment',
  'mature',
  'unknown'
]);

export const SR_EVIDENCE_CONTEXT_OBJECTIVES = Object.freeze([
  'general',
  'flowering',
  'fruiting',
  'unknown'
]);

export const SR_EVIDENCE_PROPOSED_VALUES_SUN = Object.freeze([
  'full_sun',
  'full_sun_to_part_shade',
  'part_shade',
  'full_shade'
]);

export const SR_EVIDENCE_PROPOSED_VALUES_WATER = Object.freeze([
  'low',
  'medium',
  'high',
  'very_high'
]);

export const SR_EVIDENCE_FINDING_SEVERITIES = Object.freeze([
  'error',
  'warning',
  'info'
]);

export const SR_EVIDENCE_FINDING_CODES = Object.freeze([
  'missing_evidence_id',
  'duplicate_evidence_id',
  'semantic_duplicate_packet',
  'unknown_canonical_key',
  'alias_owned_packet',
  'unsupported_field',
  'missing_scientific_identity',
  'unsupported_claim_type',
  'unsupported_authority_tier',
  'unsupported_source_type',
  'missing_source_identity',
  'missing_source_reference',
  'missing_normalized_claim',
  'missing_context_scope',
  'unsupported_packet_status',
  'packet_contract_version_mismatch',
  'source_fingerprint_missing',
  'source_fingerprint_mismatch',
  'content_fingerprint_missing',
  'content_fingerprint_mismatch',
  'unsupported_proposed_value',
  'ai_only_authority',
  'tier_c_as_sole_authority',
  'withdrawn_packet_active',
  'rejected_packet_active',
  'superseded_packet_active',
  'overlapping_active_conflict',
  'alias_canonical_duplicate',
  'multi_field_packet',
  'unstable_fingerprint',
  'registry_or_input_mutation',
  'broad_identity_scope',
  'missing_publication_date',
  'packet_needs_review',
  'authority_corroboration_recommended',
  'short_excerpt_missing',
  'source_update_date_missing',
  'empty_registry_accepted',
  'synthetic_fixture_only',
  'invalid_packets_input',
  'missing_packet_version',
  'missing_publisher',
  'missing_source_title',
  'missing_verified_at',
  'invalid_verified_at'
]);

const ERROR_CODES = Object.freeze([
  'missing_evidence_id',
  'duplicate_evidence_id',
  'semantic_duplicate_packet',
  'unknown_canonical_key',
  'alias_owned_packet',
  'unsupported_field',
  'missing_scientific_identity',
  'unsupported_claim_type',
  'unsupported_authority_tier',
  'unsupported_source_type',
  'missing_source_identity',
  'missing_source_reference',
  'missing_normalized_claim',
  'missing_context_scope',
  'unsupported_packet_status',
  'packet_contract_version_mismatch',
  'source_fingerprint_missing',
  'source_fingerprint_mismatch',
  'content_fingerprint_missing',
  'content_fingerprint_mismatch',
  'unsupported_proposed_value',
  'ai_only_authority',
  'tier_c_as_sole_authority',
  'withdrawn_packet_active',
  'rejected_packet_active',
  'superseded_packet_active',
  'overlapping_active_conflict',
  'alias_canonical_duplicate',
  'multi_field_packet',
  'unstable_fingerprint',
  'registry_or_input_mutation',
  'invalid_packets_input',
  'missing_packet_version',
  'missing_publisher',
  'missing_source_title',
  'missing_verified_at',
  'invalid_verified_at'
]);

const WARNING_CODES = Object.freeze([
  'broad_identity_scope',
  'missing_publication_date',
  'packet_needs_review',
  'authority_corroboration_recommended',
  'short_excerpt_missing',
  'source_update_date_missing'
]);

const INFO_CODES = Object.freeze([
  'empty_registry_accepted',
  'synthetic_fixture_only'
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

function pushFinding(findings, finding) {
  findings.push(
    freezeDeep({
      code: finding.code,
      severity: finding.severity,
      evidenceId: finding.evidenceId == null ? null : finding.evidenceId,
      canonicalKey: finding.canonicalKey == null ? null : finding.canonicalKey,
      field: finding.field == null ? null : finding.field,
      detail: finding.detail == null ? null : finding.detail,
      expected: finding.expected === undefined ? null : finding.expected,
      actual: finding.actual === undefined ? null : finding.actual
    })
  );
}

function findingSeverityForCode(code) {
  if (ERROR_CODES.indexOf(code) >= 0) return 'error';
  if (WARNING_CODES.indexOf(code) >= 0) return 'warning';
  if (INFO_CODES.indexOf(code) >= 0) return 'info';
  return 'error';
}

function addCode(findings, code, meta) {
  pushFinding(
    findings,
    Object.assign(
      {
        code: code,
        severity: findingSeverityForCode(code)
      },
      meta || {}
    )
  );
}

function isStructuredContextScope(scope) {
  const o = asObject(scope);
  if (!o) return false;
  if (
    !isNonEmptyString(o.setting) ||
    SR_EVIDENCE_CONTEXT_SETTINGS.indexOf(String(o.setting).trim()) < 0
  ) {
    return false;
  }
  if (
    !isNonEmptyString(o.planting) ||
    SR_EVIDENCE_CONTEXT_PLANTINGS.indexOf(String(o.planting).trim()) < 0
  ) {
    return false;
  }
  if (
    !isNonEmptyString(o.maturity) ||
    SR_EVIDENCE_CONTEXT_MATURITIES.indexOf(String(o.maturity).trim()) < 0
  ) {
    return false;
  }
  if (
    !isNonEmptyString(o.objective) ||
    SR_EVIDENCE_CONTEXT_OBJECTIVES.indexOf(String(o.objective).trim()) < 0
  ) {
    return false;
  }
  return true;
}

function normalizeContextScope(scope) {
  if (!isStructuredContextScope(scope)) return null;
  const o = scope;
  const out = {
    setting: String(o.setting).trim(),
    planting: String(o.planting).trim(),
    maturity: String(o.maturity).trim(),
    objective: String(o.objective).trim()
  };
  if (isNonEmptyString(o.season)) out.season = String(o.season).trim();
  if (o.climateOrRegion != null) {
    if (Array.isArray(o.climateOrRegion)) {
      out.climateOrRegion = o.climateOrRegion
        .map(function (x) {
          return String(x).trim();
        })
        .filter(Boolean)
        .sort();
    } else if (isNonEmptyString(o.climateOrRegion)) {
      out.climateOrRegion = String(o.climateOrRegion).trim();
    }
  }
  if (isNonEmptyString(o.humidity)) out.humidity = String(o.humidity).trim();
  if (isNonEmptyString(o.drainage)) out.drainage = String(o.drainage).trim();
  if (isNonEmptyString(o.lightIntensity)) {
    out.lightIntensity = String(o.lightIntensity).trim();
  }
  if (isNonEmptyString(o.protectedCultivation)) {
    out.protectedCultivation = String(o.protectedCultivation).trim();
  }
  return out;
}

function contextScopeKey(scope) {
  const n = normalizeContextScope(scope);
  if (!n) return null;
  return stableSerialize(n);
}

function proposedValueAllowed(field, value) {
  if (!isNonEmptyString(value)) return false;
  const v = String(value).trim();
  if (field === 'sun') return SR_EVIDENCE_PROPOSED_VALUES_SUN.indexOf(v) >= 0;
  if (field === 'water') return SR_EVIDENCE_PROPOSED_VALUES_WATER.indexOf(v) >= 0;
  return false;
}

function isActiveSupportStatus(status) {
  return status === 'draft' || status === 'collected';
}

function buildDescriptor() {
  return freezeDeep({
    registryVersion: SR_EVIDENCE_PACKET_REGISTRY_VERSION,
    packetContractVersion: SR_EVIDENCE_PACKET_CONTRACT_VERSION,
    capability: SR_EVIDENCE_PACKET_REGISTRY_CAPABILITY,
    developerOnly: true,
    authoritative: false,
    productConsumer: false,
    runtimeEligibilityAuthority: false,
    catalogMutation: false,
    fieldReviewMutation: false,
    needsReviewMutation: false,
    identityMutation: false,
    persistence: false,
    network: false,
    automaticExecution: false,
    automaticApproval: false,
    activation: 'explicit_call_only',
    productConsumers: 'none',
    allowedFields: SR_EVIDENCE_PACKET_FIELDS.slice(),
    claimTypes: SR_EVIDENCE_CLAIM_TYPES.slice(),
    authorityTiers: SR_EVIDENCE_AUTHORITY_TIERS.slice(),
    packetStatuses: SR_EVIDENCE_PACKET_STATUSES.slice(),
    sourceTypes: SR_EVIDENCE_SOURCE_TYPES.slice(),
    findingSeverities: SR_EVIDENCE_FINDING_SEVERITIES.slice(),
    findingCodes: SR_EVIDENCE_FINDING_CODES.slice(),
    realPacketCount: 0
  });
}

const DESCRIPTOR = buildDescriptor();

const EMPTY_REGISTRY = freezeDeep({
  registryVersion: SR_EVIDENCE_PACKET_REGISTRY_VERSION,
  packetContractVersion: SR_EVIDENCE_PACKET_CONTRACT_VERSION,
  packets: Object.freeze([])
});

/**
 * Immutable descriptor. Safe to call any number of times; never mutates.
 */
export function getSmartRecDeveloperEvidencePacketRegistryDescriptor() {
  return DESCRIPTOR;
}

/**
 * Empty real registry (zero real evidence packets). Deeply frozen.
 */
export function getEmptySmartRecDeveloperEvidencePacketRegistry() {
  return EMPTY_REGISTRY;
}

/**
 * Deterministic source fingerprint from source identity/reference.
 */
export function buildEvidencePacketSourceFingerprint(inputs) {
  const o = asObject(inputs);
  if (!o) {
    return freezeDeep({
      ok: false,
      fingerprint: null,
      reasons: ['fingerprint_inputs_incomplete']
    });
  }

  const sourceType = normalizeTrim(o.sourceType);
  const sourceTitle = normalizeTrim(o.sourceTitle);
  const publisher = normalizeTrim(o.publisher);
  const sourceReference = normalizeTrim(o.sourceReference);
  const sourceIdentity = normalizeTrim(o.sourceIdentity) || sourceReference;

  if (!sourceType || !sourceTitle || !publisher || !sourceReference || !sourceIdentity) {
    return freezeDeep({
      ok: false,
      fingerprint: null,
      reasons: ['fingerprint_inputs_incomplete']
    });
  }

  const fingerprint = [
    sourceType,
    sourceTitle,
    publisher,
    sourceIdentity,
    sourceReference
  ].join('|');

  return freezeDeep({ ok: true, fingerprint: fingerprint, reasons: ['ok'] });
}

/**
 * Deterministic content fingerprint for packet semantic core.
 */
export function buildEvidencePacketContentFingerprint(inputs) {
  const o = asObject(inputs);
  if (!o) {
    return freezeDeep({
      ok: false,
      fingerprint: null,
      reasons: ['fingerprint_inputs_incomplete']
    });
  }

  const evidenceId = normalizeTrim(o.evidenceId);
  const canonicalKey = normalizeKey(o.canonicalKey);
  const field = normalizeTrim(o.field);
  const normalizedClaim = normalizeTrim(o.normalizedClaim);
  const proposedValue = normalizeTrim(o.proposedValue);
  const authorityTier = normalizeTrim(o.authorityTier);
  const sourceReference = normalizeTrim(o.sourceReference);
  const sourceIdentity = normalizeTrim(o.sourceIdentity) || sourceReference;
  const claimType = normalizeTrim(o.claimType);
  const packetContractVersion = normalizeTrim(o.packetContractVersion);
  const ctxKey = contextScopeKey(o.contextScope);

  if (
    !evidenceId ||
    !canonicalKey ||
    !field ||
    !normalizedClaim ||
    !proposedValue ||
    !authorityTier ||
    !sourceIdentity ||
    !sourceReference ||
    !claimType ||
    !packetContractVersion ||
    !ctxKey
  ) {
    return freezeDeep({
      ok: false,
      fingerprint: null,
      reasons: ['fingerprint_inputs_incomplete']
    });
  }

  const fingerprint = [
    evidenceId,
    canonicalKey,
    field,
    normalizedClaim,
    proposedValue,
    authorityTier,
    sourceIdentity,
    sourceReference,
    ctxKey,
    claimType,
    packetContractVersion
  ].join('|');

  return freezeDeep({ ok: true, fingerprint: fingerprint, reasons: ['ok'] });
}

/**
 * Validate a single developer/synthetic evidence packet. Does not mutate input.
 */
export function validateEvidencePacket(packet, context) {
  const findings = [];
  const ctx = asObject(context) || {};
  const knownCanonical = Array.isArray(ctx.knownCanonicalKeys)
    ? ctx.knownCanonicalKeys.map(normalizeKey).filter(Boolean)
    : null;
  const knownAliases = Array.isArray(ctx.knownAliasKeys)
    ? ctx.knownAliasKeys.map(normalizeKey).filter(Boolean)
    : [];
  const aliasMap = asObject(ctx.aliasToCanonicalMap) || {};
  const packetContractVersion = isNonEmptyString(ctx.packetContractVersion)
    ? String(ctx.packetContractVersion).trim()
    : SR_EVIDENCE_PACKET_CONTRACT_VERSION;

  const rec = asObject(packet);
  if (!rec) {
    addCode(findings, 'missing_evidence_id', { detail: 'packet_required' });
    return freezeDeep({
      valid: false,
      findings: findings,
      errorCount: findings.filter(function (f) {
        return f.severity === 'error';
      }).length,
      warningCount: 0,
      infoCount: 0,
      computedSourceFingerprint: null,
      computedContentFingerprint: null,
      sourceFingerprintMatches: null,
      contentFingerprintMatches: null,
      normalized: null
    });
  }

  if (rec.fields != null || Array.isArray(rec.field)) {
    addCode(findings, 'multi_field_packet', {
      evidenceId: normalizeTrim(rec.evidenceId),
      detail: 'one_packet_one_field'
    });
  }

  const evidenceId = normalizeTrim(rec.evidenceId);
  if (!evidenceId) addCode(findings, 'missing_evidence_id', {});

  const canonicalKey = normalizeKey(rec.canonicalKey);
  if (!canonicalKey) {
    addCode(findings, 'unknown_canonical_key', { detail: 'canonical_key_required' });
  } else {
    if (knownAliases.indexOf(canonicalKey) >= 0) {
      addCode(findings, 'alias_owned_packet', {
        evidenceId: evidenceId,
        canonicalKey: canonicalKey
      });
    }
    const mapped = normalizeKey(aliasMap[canonicalKey] || aliasMap[rec.canonicalKey]);
    if (mapped && mapped !== canonicalKey) {
      addCode(findings, 'alias_owned_packet', {
        evidenceId: evidenceId,
        canonicalKey: canonicalKey,
        detail: 'alias_map_owner'
      });
    }
    if (knownCanonical && knownCanonical.indexOf(canonicalKey) < 0) {
      addCode(findings, 'unknown_canonical_key', {
        evidenceId: evidenceId,
        canonicalKey: canonicalKey
      });
    }
  }

  const field = normalizeTrim(rec.field);
  if (!field || SR_EVIDENCE_PACKET_FIELDS.indexOf(field) < 0) {
    addCode(findings, 'unsupported_field', {
      evidenceId: evidenceId,
      field: field
    });
  }

  const scientificIdentity = normalizeTrim(rec.scientificIdentity);
  const identityScope = normalizeTrim(rec.identityScope);
  if (!scientificIdentity && identityScope !== 'broad' && identityScope !== 'unknown') {
    addCode(findings, 'missing_scientific_identity', {
      evidenceId: evidenceId,
      canonicalKey: canonicalKey
    });
  }
  if (identityScope === 'broad' || identityScope === 'unknown') {
    addCode(findings, 'broad_identity_scope', {
      evidenceId: evidenceId,
      canonicalKey: canonicalKey,
      detail: identityScope
    });
  }

  const claimType = normalizeTrim(rec.claimType);
  if (!claimType || SR_EVIDENCE_CLAIM_TYPES.indexOf(claimType) < 0) {
    addCode(findings, 'unsupported_claim_type', {
      evidenceId: evidenceId,
      actual: claimType
    });
  }

  const authorityTier = normalizeTrim(rec.authorityTier);
  if (!authorityTier || SR_EVIDENCE_AUTHORITY_TIERS.indexOf(authorityTier) < 0) {
    addCode(findings, 'unsupported_authority_tier', {
      evidenceId: evidenceId,
      actual: authorityTier
    });
  }

  const sourceType = normalizeTrim(rec.sourceType);
  if (!sourceType || SR_EVIDENCE_SOURCE_TYPES.indexOf(sourceType) < 0) {
    addCode(findings, 'unsupported_source_type', {
      evidenceId: evidenceId,
      actual: sourceType
    });
  }

  const sourceTitle = normalizeTrim(rec.sourceTitle);
  if (!sourceTitle) {
    addCode(findings, 'missing_source_title', { evidenceId: evidenceId });
  }

  const publisher = normalizeTrim(rec.publisher);
  if (!publisher) {
    addCode(findings, 'missing_publisher', { evidenceId: evidenceId });
  }

  const sourceReference = normalizeTrim(rec.sourceReference);
  const sourceIdentity = normalizeTrim(rec.sourceIdentity) || sourceReference;
  if (!sourceIdentity) {
    addCode(findings, 'missing_source_identity', { evidenceId: evidenceId });
  }
  if (!sourceReference) {
    addCode(findings, 'missing_source_reference', { evidenceId: evidenceId });
  }

  const verifiedAt = normalizeTrim(rec.verifiedAt);
  if (!verifiedAt) {
    addCode(findings, 'missing_verified_at', { evidenceId: evidenceId });
  } else if (!isIsoDate(verifiedAt)) {
    addCode(findings, 'invalid_verified_at', {
      evidenceId: evidenceId,
      actual: verifiedAt
    });
  }

  const normalizedClaim = normalizeTrim(rec.normalizedClaim);
  if (!normalizedClaim) {
    addCode(findings, 'missing_normalized_claim', { evidenceId: evidenceId });
  }

  const contextScope = normalizeContextScope(rec.contextScope);
  if (!contextScope) {
    addCode(findings, 'missing_context_scope', {
      evidenceId: evidenceId,
      detail:
        typeof rec.contextScope === 'string'
          ? 'free_text_only_rejected'
          : 'structured_context_required'
    });
  }

  const packetStatus = normalizeTrim(rec.packetStatus);
  if (!packetStatus || SR_EVIDENCE_PACKET_STATUSES.indexOf(packetStatus) < 0) {
    addCode(findings, 'unsupported_packet_status', {
      evidenceId: evidenceId,
      actual: packetStatus
    });
  }

  const packetVersion = normalizeTrim(rec.packetVersion);
  if (!packetVersion) {
    addCode(findings, 'missing_packet_version', { evidenceId: evidenceId });
  }

  const packetContract = normalizeTrim(rec.packetContractVersion);
  if (!packetContract || packetContract !== packetContractVersion) {
    addCode(findings, 'packet_contract_version_mismatch', {
      evidenceId: evidenceId,
      expected: packetContractVersion,
      actual: packetContract
    });
  }

  const proposedValue = normalizeTrim(rec.proposedValue);
  if (!proposedValue || (field && !proposedValueAllowed(field, proposedValue))) {
    addCode(findings, 'unsupported_proposed_value', {
      evidenceId: evidenceId,
      field: field,
      actual: proposedValue
    });
  }

  if (rec.packetNeedsReview != null && typeof rec.packetNeedsReview !== 'boolean') {
    addCode(findings, 'packet_needs_review', {
      evidenceId: evidenceId,
      detail: 'packetNeedsReview_must_be_boolean'
    });
  } else if (rec.packetNeedsReview === true) {
    addCode(findings, 'packet_needs_review', {
      evidenceId: evidenceId
    });
  }

  if (sourceType === 'ai_generated_summary') {
    addCode(findings, 'ai_only_authority', {
      evidenceId: evidenceId,
      detail: 'ai_summary_non_authoritative'
    });
  }

  if (authorityTier === 'C' && rec.soleAuthority === true) {
    addCode(findings, 'tier_c_as_sole_authority', {
      evidenceId: evidenceId,
      canonicalKey: canonicalKey,
      field: field
    });
  }

  if (authorityTier === 'B' && packetStatus === 'collected' && rec.soleAuthority === true) {
    addCode(findings, 'authority_corroboration_recommended', {
      evidenceId: evidenceId,
      detail: 'tier_b_sole_scope'
    });
  }

  const treatAsActive = rec.activeSupport === true;
  if (packetStatus === 'withdrawn' && treatAsActive) {
    addCode(findings, 'withdrawn_packet_active', {
      evidenceId: evidenceId
    });
  }
  if (packetStatus === 'rejected' && treatAsActive) {
    addCode(findings, 'rejected_packet_active', {
      evidenceId: evidenceId
    });
  }
  if (packetStatus === 'superseded' && treatAsActive) {
    addCode(findings, 'superseded_packet_active', {
      evidenceId: evidenceId
    });
  }
  if (
    packetStatus === 'superseded' &&
    !normalizeTrim(rec.supersededBy) &&
    !normalizeTrim(rec.supersedes)
  ) {
    // Lifecycle inconsistency when superseded without pointers — only when active.
    if (treatAsActive) {
      addCode(findings, 'superseded_packet_active', {
        evidenceId: evidenceId,
        detail: 'missing_supersession_pointer'
      });
    }
  }

  if (!isNonEmptyString(rec.publicationDate) && packetStatus === 'collected') {
    addCode(findings, 'missing_publication_date', { evidenceId: evidenceId });
  }
  if (!isNonEmptyString(rec.shortExcerpt) && packetStatus === 'collected') {
    addCode(findings, 'short_excerpt_missing', { evidenceId: evidenceId });
  }
  if (!isNonEmptyString(rec.sourceUpdateDate) && packetStatus === 'collected') {
    addCode(findings, 'source_update_date_missing', { evidenceId: evidenceId });
  }

  let computedSourceFingerprint = null;
  let computedContentFingerprint = null;
  let sourceFingerprintMatches = null;
  let contentFingerprintMatches = null;

  const srcFp = buildEvidencePacketSourceFingerprint({
    sourceType: sourceType,
    sourceTitle: sourceTitle,
    publisher: publisher,
    sourceReference: sourceReference,
    sourceIdentity: sourceIdentity
  });
  if (srcFp.ok) {
    computedSourceFingerprint = srcFp.fingerprint;
    const providedSrc = normalizeTrim(rec.sourceFingerprint);
    if (!providedSrc) {
      addCode(findings, 'source_fingerprint_missing', { evidenceId: evidenceId });
    } else {
      sourceFingerprintMatches = providedSrc === computedSourceFingerprint;
      if (!sourceFingerprintMatches) {
        addCode(findings, 'source_fingerprint_mismatch', {
          evidenceId: evidenceId,
          expected: computedSourceFingerprint,
          actual: providedSrc
        });
        addCode(findings, 'unstable_fingerprint', {
          evidenceId: evidenceId,
          detail: 'source'
        });
      }
    }
  } else if (evidenceId) {
    addCode(findings, 'source_fingerprint_missing', {
      evidenceId: evidenceId,
      detail: 'cannot_compute'
    });
  }

  const contentFp = buildEvidencePacketContentFingerprint({
    evidenceId: evidenceId,
    canonicalKey: canonicalKey,
    field: field,
    normalizedClaim: normalizedClaim,
    proposedValue: proposedValue,
    authorityTier: authorityTier,
    sourceIdentity: sourceIdentity,
    sourceReference: sourceReference,
    contextScope: contextScope || rec.contextScope,
    claimType: claimType,
    packetContractVersion: packetContract || packetContractVersion
  });
  if (contentFp.ok) {
    computedContentFingerprint = contentFp.fingerprint;
    const providedContent = normalizeTrim(rec.contentFingerprint);
    if (!providedContent) {
      addCode(findings, 'content_fingerprint_missing', { evidenceId: evidenceId });
    } else {
      contentFingerprintMatches = providedContent === computedContentFingerprint;
      if (!contentFingerprintMatches) {
        addCode(findings, 'content_fingerprint_mismatch', {
          evidenceId: evidenceId,
          expected: computedContentFingerprint,
          actual: providedContent
        });
        addCode(findings, 'unstable_fingerprint', {
          evidenceId: evidenceId,
          detail: 'content'
        });
      }
    }
  } else if (evidenceId) {
    addCode(findings, 'content_fingerprint_missing', {
      evidenceId: evidenceId,
      detail: 'cannot_compute'
    });
  }

  const errorCount = findings.filter(function (f) {
    return f.severity === 'error';
  }).length;
  const warningCount = findings.filter(function (f) {
    return f.severity === 'warning';
  }).length;
  const infoCount = findings.filter(function (f) {
    return f.severity === 'info';
  }).length;

  return freezeDeep({
    valid: errorCount === 0,
    findings: findings,
    errorCount: errorCount,
    warningCount: warningCount,
    infoCount: infoCount,
    computedSourceFingerprint: computedSourceFingerprint,
    computedContentFingerprint: computedContentFingerprint,
    sourceFingerprintMatches: sourceFingerprintMatches,
    contentFingerprintMatches: contentFingerprintMatches,
    normalized: freezeDeep({
      evidenceId: evidenceId,
      canonicalKey: canonicalKey,
      scientificIdentity: scientificIdentity,
      identityScope: identityScope,
      field: field,
      proposedValue: proposedValue,
      claimType: claimType,
      authorityTier: authorityTier,
      sourceType: sourceType,
      sourceTitle: sourceTitle,
      publisher: publisher,
      sourceReference: sourceReference,
      sourceIdentity: sourceIdentity,
      verifiedAt: verifiedAt,
      normalizedClaim: normalizedClaim,
      contextScope: contextScope,
      packetStatus: packetStatus,
      packetVersion: packetVersion,
      packetContractVersion: packetContract,
      sourceFingerprint: normalizeTrim(rec.sourceFingerprint),
      contentFingerprint: normalizeTrim(rec.contentFingerprint),
      packetNeedsReview: rec.packetNeedsReview === true,
      activeSupport: treatAsActive,
      soleAuthority: rec.soleAuthority === true,
      publicationDate: normalizeTrim(rec.publicationDate),
      shortExcerpt: normalizeTrim(rec.shortExcerpt),
      reviewerSummary: normalizeTrim(rec.reviewerSummary),
      supersedes: normalizeTrim(rec.supersedes),
      supersededBy: normalizeTrim(rec.supersededBy)
    })
  });
}

function semanticDupKey(n) {
  if (!n || !n.sourceReference || !n.field || !n.normalizedClaim || !n.contextScope) {
    return null;
  }
  return [
    String(n.sourceReference).trim().toLowerCase(),
    n.field,
    String(n.normalizedClaim).trim().toLowerCase(),
    contextScopeKey(n.contextScope)
  ].join('::');
}

function activeOverlapKey(n) {
  if (!n || !n.canonicalKey || !n.field || !n.contextScope) return null;
  return [n.canonicalKey, n.field, contextScopeKey(n.contextScope)].join('::');
}

function countFindings(findings) {
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (let i = 0; i < findings.length; i++) {
    if (findings[i].severity === 'error') errorCount++;
    else if (findings[i].severity === 'warning') warningCount++;
    else if (findings[i].severity === 'info') infoCount++;
  }
  return {
    errorCount: errorCount,
    warningCount: warningCount,
    infoCount: infoCount
  };
}

function buildFindingsByCode(findings) {
  const by = Object.create(null);
  for (let i = 0; i < findings.length; i++) {
    const c = findings[i].code;
    if (!by[c]) by[c] = [];
    by[c].push(findings[i]);
  }
  const keys = Object.keys(by).sort();
  const out = Object.create(null);
  for (let i = 0; i < keys.length; i++) out[keys[i]] = by[keys[i]];
  return out;
}

function buildSummaryFingerprint(parts) {
  return [
    SR_EVIDENCE_PACKET_REGISTRY_VERSION,
    SR_EVIDENCE_PACKET_CONTRACT_VERSION,
    String(parts.packetCount),
    String(parts.checkedCount),
    String(parts.errorCount),
    String(parts.warningCount),
    String(parts.infoCount),
    parts.findings
      .map(function (f) {
        return [
          f.severity,
          f.code,
          f.evidenceId || '',
          f.canonicalKey || '',
          f.field || '',
          f.detail || '',
          f.expected == null ? '' : stableSerialize(f.expected),
          f.actual == null ? '' : stableSerialize(f.actual)
        ].join(':');
      })
      .join(';')
  ].join('|');
}

/**
 * Validate and build a synthetic evidence packet registry from caller packets.
 * Never mutates inputs. Never populates the exported empty real registry.
 */
export function validateAndBuildEvidencePacketRegistry(packets, context) {
  const findings = [];
  const ctx = asObject(context) || {};
  const snapshotBefore = Array.isArray(packets) ? stableSerialize(packets) : null;

  if (!Array.isArray(packets)) {
    addCode(findings, 'invalid_packets_input', {});
    const counts = countFindings(findings);
    return freezeDeep({
      valid: false,
      registryVersion: SR_EVIDENCE_PACKET_REGISTRY_VERSION,
      packetContractVersion: SR_EVIDENCE_PACKET_CONTRACT_VERSION,
      packetCount: 0,
      checkedCount: 0,
      errorCount: counts.errorCount,
      warningCount: counts.warningCount,
      infoCount: counts.infoCount,
      findings: findings,
      findingsByCode: freezeDeep(buildFindingsByCode(findings)),
      invalidPackets: [],
      duplicatePackets: [],
      stalePackets: [],
      registry: null,
      packetResults: [],
      summaryFingerprint: buildSummaryFingerprint({
        packetCount: 0,
        checkedCount: 0,
        errorCount: counts.errorCount,
        warningCount: counts.warningCount,
        infoCount: counts.infoCount,
        findings: findings
      })
    });
  }

  if (packets.length === 0) {
    addCode(findings, 'empty_registry_accepted', {});
    if (ctx.syntheticFixtureOnly === true) {
      addCode(findings, 'synthetic_fixture_only', {});
    }
  } else if (ctx.syntheticFixtureOnly === true) {
    addCode(findings, 'synthetic_fixture_only', {});
  }

  const packetResults = [];
  const invalidPackets = [];
  const duplicatePackets = [];
  const stalePackets = [];
  const seenIds = Object.create(null);
  const semanticSeen = Object.create(null);
  const activeByOverlap = Object.create(null);
  const sourceFieldCounts = Object.create(null);
  const aiSourceSeen = Object.create(null);
  const built = [];

  for (let i = 0; i < packets.length; i++) {
    const result = validateEvidencePacket(packets[i], ctx);
    packetResults.push(result);
    const n = result.normalized;

    if (!result.valid) {
      invalidPackets.push(n && n.evidenceId ? n.evidenceId : 'index:' + i);
      for (let f = 0; f < result.findings.length; f++) {
        findings.push(result.findings[f]);
      }
      continue;
    }

    for (let f = 0; f < result.findings.length; f++) {
      findings.push(result.findings[f]);
    }

    if (n.packetStatus === 'stale') {
      stalePackets.push(n.evidenceId);
    }

    if (seenIds[n.evidenceId]) {
      addCode(findings, 'duplicate_evidence_id', {
        evidenceId: n.evidenceId,
        canonicalKey: n.canonicalKey,
        field: n.field
      });
      duplicatePackets.push(n.evidenceId);
      invalidPackets.push(n.evidenceId);
      continue;
    }
    seenIds[n.evidenceId] = true;

    const sem = semanticDupKey(n);
    if (sem) {
      if (semanticSeen[sem]) {
        addCode(findings, 'semantic_duplicate_packet', {
          evidenceId: n.evidenceId,
          canonicalKey: n.canonicalKey,
          field: n.field,
          detail: sem
        });
        duplicatePackets.push(n.evidenceId);
        invalidPackets.push(n.evidenceId);
        continue;
      }
      semanticSeen[sem] = n.evidenceId;
    }

    const srcFieldKey =
      (n.sourceReference ? String(n.sourceReference).trim().toLowerCase() : '') +
      '::' +
      (n.field || '');
    if (srcFieldKey !== '::') {
      sourceFieldCounts[srcFieldKey] = (sourceFieldCounts[srcFieldKey] || 0) + 1;
    }

    if (n.sourceType === 'ai_generated_summary' && n.sourceReference) {
      const aiKey = String(n.sourceReference).trim().toLowerCase();
      if (aiSourceSeen[aiKey]) {
        addCode(findings, 'semantic_duplicate_packet', {
          evidenceId: n.evidenceId,
          detail: 'repeated_ai_summary_same_source'
        });
        duplicatePackets.push(n.evidenceId);
      } else {
        aiSourceSeen[aiKey] = n.evidenceId;
      }
    }

    if (isActiveSupportStatus(n.packetStatus) || n.activeSupport) {
      const ov = activeOverlapKey(n);
      if (ov) {
        const prev = activeByOverlap[ov];
        if (prev && prev.proposedValue !== n.proposedValue) {
          addCode(findings, 'overlapping_active_conflict', {
            evidenceId: n.evidenceId,
            canonicalKey: n.canonicalKey,
            field: n.field,
            expected: prev.proposedValue,
            actual: n.proposedValue
          });
        } else if (!prev) {
          activeByOverlap[ov] = n;
        }
      }
    }

    // Alias/canonical duplicate: same evidenceId semantic under alias and canonical.
    if (
      Array.isArray(ctx.knownAliasKeys) &&
      asObject(ctx.aliasToCanonicalMap) &&
      n.canonicalKey
    ) {
      const aliases = Object.keys(ctx.aliasToCanonicalMap);
      for (let a = 0; a < aliases.length; a++) {
        const aliasKey = normalizeKey(aliases[a]);
        const canon = normalizeKey(ctx.aliasToCanonicalMap[aliases[a]]);
        if (canon === n.canonicalKey && aliasKey && packets.some) {
          // Detect if another packet claims the alias key with same field/claim.
          for (let j = 0; j < packets.length; j++) {
            if (j === i) continue;
            const other = asObject(packets[j]);
            if (!other) continue;
            if (
              normalizeKey(other.canonicalKey) === aliasKey &&
              normalizeTrim(other.field) === n.field &&
              normalizeTrim(other.normalizedClaim) === n.normalizedClaim
            ) {
              addCode(findings, 'alias_canonical_duplicate', {
                evidenceId: n.evidenceId,
                canonicalKey: n.canonicalKey,
                field: n.field,
                detail: aliasKey
              });
            }
          }
        }
      }
    }

    built.push({
      evidenceId: n.evidenceId,
      canonicalKey: n.canonicalKey,
      scientificIdentity: n.scientificIdentity,
      identityScope: n.identityScope,
      field: n.field,
      proposedValue: n.proposedValue,
      claimType: n.claimType,
      authorityTier: n.authorityTier,
      sourceType: n.sourceType,
      sourceTitle: n.sourceTitle,
      publisher: n.publisher,
      sourceReference: n.sourceReference,
      sourceIdentity: n.sourceIdentity,
      verifiedAt: n.verifiedAt,
      normalizedClaim: n.normalizedClaim,
      contextScope: n.contextScope,
      packetStatus: n.packetStatus,
      packetVersion: n.packetVersion,
      packetContractVersion: n.packetContractVersion,
      sourceFingerprint: n.sourceFingerprint,
      contentFingerprint: n.contentFingerprint,
      packetNeedsReview: n.packetNeedsReview
    });
  }

  // Artificial split: same source+field with multiple active collected packets.
  const srcKeys = Object.keys(sourceFieldCounts);
  for (let s = 0; s < srcKeys.length; s++) {
    if (sourceFieldCounts[srcKeys[s]] > 2) {
      addCode(findings, 'semantic_duplicate_packet', {
        detail: 'artificial_split_same_source_field:' + srcKeys[s]
      });
    }
  }

  if (Array.isArray(packets) && snapshotBefore !== null) {
    const after = stableSerialize(packets);
    if (after !== snapshotBefore) {
      addCode(findings, 'registry_or_input_mutation', {
        detail: 'packets_mutated'
      });
    }
  }

  const counts = countFindings(findings);
  const valid = counts.errorCount === 0;
  const registry = valid
    ? freezeDeep({
        registryVersion: SR_EVIDENCE_PACKET_REGISTRY_VERSION,
        packetContractVersion: SR_EVIDENCE_PACKET_CONTRACT_VERSION,
        packets: built
      })
    : null;

  const findingsByCode = freezeDeep(buildFindingsByCode(findings));
  const summaryFingerprint = buildSummaryFingerprint({
    packetCount: built.length,
    checkedCount: packets.length,
    errorCount: counts.errorCount,
    warningCount: counts.warningCount,
    infoCount: counts.infoCount,
    findings: findings
  });

  return freezeDeep({
    valid: valid,
    registryVersion: SR_EVIDENCE_PACKET_REGISTRY_VERSION,
    packetContractVersion: SR_EVIDENCE_PACKET_CONTRACT_VERSION,
    packetCount: built.length,
    checkedCount: packets.length,
    errorCount: counts.errorCount,
    warningCount: counts.warningCount,
    infoCount: counts.infoCount,
    findings: findings,
    findingsByCode: findingsByCode,
    invalidPackets: freezeDeep(invalidPackets.slice().sort()),
    duplicatePackets: freezeDeep(duplicatePackets.slice().sort()),
    stalePackets: freezeDeep(stalePackets.slice().sort()),
    registry: registry,
    packetResults: packetResults,
    summaryFingerprint: summaryFingerprint
  });
}
