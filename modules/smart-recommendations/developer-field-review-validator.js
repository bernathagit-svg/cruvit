/**
 * Cruvit — Smart Recommendations developer field-review validator
 * ---------------------------------------------------------------------------
 * Inert, developer/test-only, non-authoritative audit layer over the closed
 * field-review registry plus harness-supplied synthetic snapshots.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Does not mutate registry, catalog, needsReview, or caller inputs.
 *  - Does not import product runtime, GOS, v1b, identity Sidecar, or catalog.
 *  - Reuses registry fingerprint/normalize helpers; may consume EP snapshots.
 */

import {
  SR_FIELD_REVIEW_REGISTRY_VERSION,
  SR_FIELD_REVIEW_REGISTRY_VERSION_V01,
  SR_FIELD_REVIEW_CONTRACT_VERSION,
  SR_FIELD_REVIEW_CONTRACT_VERSION_V01,
  SR_FIELD_REVIEW_SUPPORTED_CONTRACT_VERSIONS,
  SR_FIELD_REVIEW_SUPPORTED_REGISTRY_VERSIONS,
  SR_FIELD_REVIEW_SUPPORTED_EVIDENCE_PACKET_CONTRACT_VERSIONS,
  SR_FIELD_REVIEW_SUPPORTED_EVIDENCE_PACKET_REGISTRY_VERSIONS,
  SR_FIELD_REVIEW_FIELDS,
  SR_FIELD_REVIEW_CLAIM_TYPES,
  SR_FIELD_REVIEW_STORED_STATUSES,
  SR_FIELD_REVIEW_COMPUTED_ONLY_STATUSES,
  SR_FIELD_REVIEW_SOURCE_KINDS,
  SR_FIELD_REVIEW_DEFAULT_REVIEWED_VALUES_SUN,
  SR_FIELD_REVIEW_DEFAULT_REVIEWED_VALUES_WATER,
  SR_FIELD_REVIEW_COMPOUND_LEGACY_REVIEWED_VALUES,
  buildFieldReviewValueFingerprint,
  normalizeFieldReviewEvidenceRefs,
  normalizeFieldReviewContextScope,
  getEmptySmartRecDeveloperFieldReviewRegistry,
  getSmartRecDeveloperFieldReviewRegistryDescriptor
} from './developer-field-review-registry.js';

import {
  SR_EVIDENCE_PACKET_CONTRACT_VERSION,
  normalizeEvidencePacketContextScope
} from './developer-evidence-packet-registry.js';

export const SR_FIELD_REVIEW_VALIDATOR_VERSION =
  '0.2.0-sr-field-review-validator';

/** Anti-accident capability token — not authentication. */
export const SR_FIELD_REVIEW_VALIDATOR_CAPABILITY =
  'explicit_developer_field_review_validation';

export const SR_FIELD_REVIEW_VALIDATOR_SUPPORTED_CONTRACT_VERSIONS = Object.freeze(
  SR_FIELD_REVIEW_SUPPORTED_CONTRACT_VERSIONS.slice()
);

export const SR_FIELD_REVIEW_VALIDATOR_SUPPORTED_REGISTRY_VERSIONS = Object.freeze(
  SR_FIELD_REVIEW_SUPPORTED_REGISTRY_VERSIONS.slice()
);

export const SR_FIELD_REVIEW_VALIDATOR_SUPPORTED_EVIDENCE_PACKET_CONTRACT_VERSIONS =
  Object.freeze(SR_FIELD_REVIEW_SUPPORTED_EVIDENCE_PACKET_CONTRACT_VERSIONS.slice());

export const SR_FIELD_REVIEW_VALIDATOR_SUPPORTED_EVIDENCE_PACKET_REGISTRY_VERSIONS =
  Object.freeze(SR_FIELD_REVIEW_SUPPORTED_EVIDENCE_PACKET_REGISTRY_VERSIONS.slice());

export const SR_FIELD_REVIEW_VALIDATOR_SEVERITIES = Object.freeze([
  'error',
  'warning',
  'info'
]);

export const SR_FIELD_REVIEW_VALIDATOR_FINDING_CODES = Object.freeze([
  'unknown_canonical_key',
  'alias_owned_record',
  'duplicate_canonical_field',
  'unsupported_field',
  'unsupported_review_status',
  'reviewed_supported_missing_value',
  'reviewed_supported_missing_evidence',
  'missing_value_fingerprint',
  'fingerprint_mismatch',
  'stale_registry_version',
  'stale_review_version',
  'missing_source_kind',
  'missing_source_ids',
  'source_kind_source_id_mismatch',
  'unsupported_reviewed_value',
  'unresolved_conflict_marked_supported',
  'identity_ambiguity_ignored',
  'global_needs_review_cleared_while_unresolved',
  'contradictory_records',
  'evidence_reference_missing',
  'evidence_status_review_status_conflict',
  'source_assignment_changed',
  'context_scope_mismatch',
  'review_contract_version_mismatch',
  'registry_or_input_mutation',
  'group_blast_radius_unreviewed',
  'product_inactive_under_global_needs_review',
  'group_source_deferred',
  'empty_registry_accepted',
  'legacy_eligibility_summary',
  'invalid_input',
  'reviewed_claim_type_missing',
  'unsupported_reviewed_claim_type',
  'invalid_evidence_reference_shape',
  'reviewed_claim_semantic_mismatch',
  'evidence_content_fingerprint_mismatch',
  'unsupported_evidence_reference_version',
  'general_guidance_not_approvable'
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

function contextScopeKey(scope, reviewContractVersion) {
  const version = isNonEmptyString(reviewContractVersion)
    ? String(reviewContractVersion).trim()
    : SR_FIELD_REVIEW_CONTRACT_VERSION;
  if (version === SR_FIELD_REVIEW_CONTRACT_VERSION_V01) {
    if (scope === undefined || scope === null) return null;
    if (typeof scope === 'string') {
      const s = scope.trim();
      return s || null;
    }
    if (typeof scope === 'object') return stableSerialize(scope);
    return null;
  }
  const norm = normalizeFieldReviewContextScope(scope, version);
  return norm.ok ? norm.key : null;
}

function compareContext(a, b, reviewContractVersion) {
  return contextScopeKey(a, reviewContractVersion) === contextScopeKey(b, reviewContractVersion);
}

function isActivePacketStatus(status) {
  return status === 'draft' || status === 'collected';
}

function evidenceSnapshotMap(input) {
  const map = Object.create(null);
  const root =
    asObject(input.evidencePacketSnapshots) ||
    asObject(input.evidenceReferenceSnapshots) ||
    asObject(input.packetSnapshots);
  if (root) {
    if (Array.isArray(root.snapshots)) {
      for (let i = 0; i < root.snapshots.length; i++) {
        const s = asObject(root.snapshots[i]);
        if (s && isNonEmptyString(s.evidenceId)) map[String(s.evidenceId).trim()] = s;
      }
    } else if (Array.isArray(root)) {
      for (let i = 0; i < root.length; i++) {
        const s = asObject(root[i]);
        if (s && isNonEmptyString(s.evidenceId)) map[String(s.evidenceId).trim()] = s;
      }
    } else {
      const keys = Object.keys(root);
      for (let i = 0; i < keys.length; i++) {
        const s = asObject(root[keys[i]]);
        if (!s) continue;
        const id = isNonEmptyString(s.evidenceId)
          ? String(s.evidenceId).trim()
          : String(keys[i]).trim();
        if (id) map[id] = Object.assign({}, s, { evidenceId: id });
      }
    }
  }
  const list = Array.isArray(input.syntheticEvidencePacketSnapshots)
    ? input.syntheticEvidencePacketSnapshots
    : [];
  for (let i = 0; i < list.length; i++) {
    const s = asObject(list[i]);
    if (s && isNonEmptyString(s.evidenceId)) map[String(s.evidenceId).trim()] = s;
  }
  return map;
}

function defaultTokensForField(field) {
  if (field === 'sun') return SR_FIELD_REVIEW_DEFAULT_REVIEWED_VALUES_SUN;
  if (field === 'water') return SR_FIELD_REVIEW_DEFAULT_REVIEWED_VALUES_WATER;
  return null;
}

function buildDescriptor() {
  return freezeDeep({
    validatorVersion: SR_FIELD_REVIEW_VALIDATOR_VERSION,
    capability: SR_FIELD_REVIEW_VALIDATOR_CAPABILITY,
    supportedRegistryVersion: SR_FIELD_REVIEW_REGISTRY_VERSION,
    supportedReviewContractVersion: SR_FIELD_REVIEW_CONTRACT_VERSION,
    supportedRegistryVersions: SR_FIELD_REVIEW_VALIDATOR_SUPPORTED_REGISTRY_VERSIONS.slice(),
    supportedReviewContractVersions: SR_FIELD_REVIEW_VALIDATOR_SUPPORTED_CONTRACT_VERSIONS.slice(),
    supportedEvidencePacketContractVersions:
      SR_FIELD_REVIEW_VALIDATOR_SUPPORTED_EVIDENCE_PACKET_CONTRACT_VERSIONS.slice(),
    supportedEvidencePacketRegistryVersions:
      SR_FIELD_REVIEW_VALIDATOR_SUPPORTED_EVIDENCE_PACKET_REGISTRY_VERSIONS.slice(),
    developerOnly: true,
    authoritative: false,
    productConsumer: false,
    runtimeEligibilityAuthority: false,
    registryMutation: false,
    catalogMutation: false,
    evidenceMutation: false,
    fieldReviewMutation: false,
    needsReviewMutation: false,
    persistence: false,
    network: false,
    automaticExecution: false,
    activation: 'explicit_call_only',
    productConsumers: 'none',
    severities: SR_FIELD_REVIEW_VALIDATOR_SEVERITIES.slice(),
    findingCodes: SR_FIELD_REVIEW_VALIDATOR_FINDING_CODES.slice(),
    allowedFields: SR_FIELD_REVIEW_FIELDS.slice(),
    claimTypes: SR_FIELD_REVIEW_CLAIM_TYPES.slice(),
    storedStatuses: SR_FIELD_REVIEW_STORED_STATUSES.slice(),
    sourceKinds: SR_FIELD_REVIEW_SOURCE_KINDS.slice()
  });
}

const DESCRIPTOR = buildDescriptor();

/**
 * Immutable validator descriptor.
 */
export function getSmartRecDeveloperFieldReviewValidatorDescriptor() {
  return DESCRIPTOR;
}

function pushFinding(findings, finding) {
  findings.push(
    freezeDeep({
      code: finding.code,
      severity: finding.severity,
      canonicalKey: finding.canonicalKey == null ? null : finding.canonicalKey,
      field: finding.field == null ? null : finding.field,
      detail: finding.detail == null ? null : finding.detail,
      expected: finding.expected === undefined ? null : finding.expected,
      actual: finding.actual === undefined ? null : finding.actual
    })
  );
}

function flattenRegistryRecords(registry) {
  const out = [];
  const root = asObject(registry);
  if (!root) return out;
  const records = asObject(root.records) || {};
  const keys = Object.keys(records).sort();
  for (let i = 0; i < keys.length; i++) {
    const ck = keys[i];
    const byField = asObject(records[ck]) || {};
    const fields = Object.keys(byField).sort();
    for (let f = 0; f < fields.length; f++) {
      const field = fields[f];
      const rec = asObject(byField[field]);
      if (!rec) continue;
      out.push(
        Object.assign({}, rec, {
          canonicalKey: rec.canonicalKey || ck,
          field: rec.field || field
        })
      );
    }
  }
  return out;
}

function resolveCandidateRecords(input) {
  if (Array.isArray(input.candidateRecords)) return input.candidateRecords.slice();
  if (Array.isArray(input.records)) return input.records.slice();
  if (asObject(input.registry)) return flattenRegistryRecords(input.registry);
  return [];
}

function aliasMapFromInput(input) {
  const map = Object.create(null);
  const raw = asObject(input.aliasToCanonicalMap) || {};
  const keys = Object.keys(raw);
  for (let i = 0; i < keys.length; i++) {
    const a = normalizeKey(keys[i]);
    const c = normalizeKey(raw[keys[i]]);
    if (a && c) map[a] = c;
  }
  if (Array.isArray(input.knownAliasKeys)) {
    for (let i = 0; i < input.knownAliasKeys.length; i++) {
      const a = normalizeKey(input.knownAliasKeys[i]);
      if (a && !map[a]) map[a] = a;
    }
  }
  return map;
}

function setFromArray(arr, normalize) {
  const set = Object.create(null);
  if (!Array.isArray(arr)) return set;
  for (let i = 0; i < arr.length; i++) {
    const v = normalize ? normalize(arr[i]) : String(arr[i]).trim();
    if (v) set[v] = true;
  }
  return set;
}

function conflictEntries(snapshot) {
  const root = asObject(snapshot);
  if (!root) return [];
  if (Array.isArray(root.entries)) return root.entries.slice();
  if (Array.isArray(root)) return root.slice();
  return [];
}

function findConflictsFor(entries, canonicalKey, field) {
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    const e = asObject(entries[i]);
    if (!e) continue;
    const ck = normalizeKey(e.canonicalKey);
    const f = isNonEmptyString(e.field) ? String(e.field).trim() : null;
    if (ck === canonicalKey && (!f || f === field || f === 'both')) out.push(e);
  }
  return out;
}

function needsReviewFor(snapshot, canonicalKey) {
  const root = asObject(snapshot);
  if (!root) return null;
  if (asObject(root.byCanonicalKey)) {
    const v = root.byCanonicalKey[canonicalKey];
    if (typeof v === 'boolean') return v;
  }
  if (typeof root[canonicalKey] === 'boolean') return root[canonicalKey];
  return null;
}

function evidenceMetaMap(input) {
  const map = Object.create(null);
  const list = Array.isArray(input.syntheticEvidenceMetadata)
    ? input.syntheticEvidenceMetadata
    : Array.isArray(input.evidenceMetadata)
      ? input.evidenceMetadata
      : [];
  for (let i = 0; i < list.length; i++) {
    const m = asObject(list[i]);
    if (!m || !isNonEmptyString(m.evidenceId)) continue;
    map[String(m.evidenceId).trim()] = m;
  }
  return map;
}

function currentSnapshotFor(input, canonicalKey, field) {
  const root = asObject(input.currentSourceValueSnapshot) || asObject(input.currentSnapshot);
  if (!root) return null;
  const byCanon = asObject(root.byCanonicalKey) || root;
  const plant = asObject(byCanon[canonicalKey]);
  if (!plant) return null;
  return asObject(plant[field]) || plant;
}

function blastProofFor(input, canonicalKey, field, sourceIds) {
  const root = asObject(input.groupBlastRadiusProof) || asObject(input.blastRadiusProof);
  if (!root) return null;
  const list = Array.isArray(root.proofs)
    ? root.proofs
    : Array.isArray(root)
      ? root
      : [root];
  for (let i = 0; i < list.length; i++) {
    const p = asObject(list[i]);
    if (!p) continue;
    const ck = normalizeKey(p.canonicalKey);
    const f = isNonEmptyString(p.field) ? String(p.field).trim() : null;
    if (ck !== canonicalKey) continue;
    if (f && f !== field) continue;
    if (Array.isArray(sourceIds) && isNonEmptyString(p.groupId)) {
      if (sourceIds.indexOf(String(p.groupId).trim()) < 0) continue;
    }
    return p;
  }
  return null;
}

/**
 * Pure validation entry point for developer field-review registry artifacts.
 * Accepts only explicit snapshots; never fetches product data.
 */
export function validateSmartRecDeveloperFieldReviewRegistry(input) {
  const findings = [];
  const invalidRecords = [];
  const staleRecords = [];
  const canonicalSummary = Object.create(null);

  const src = asObject(input);
  if (!src) {
    pushFinding(findings, {
      code: 'invalid_input',
      severity: 'error',
      detail: 'input_object_required'
    });
    return finalizeReport({
      findings: findings,
      invalidRecords: invalidRecords,
      staleRecords: staleRecords,
      canonicalSummary: canonicalSummary,
      registryVersion: null,
      recordCount: 0,
      checkedCount: 0
    });
  }

  // Mutation probe: if caller provides a mutationAttempt flag, report blocking.
  if (src.mutationAttempt === true) {
    pushFinding(findings, {
      code: 'registry_or_input_mutation',
      severity: 'error',
      detail: 'mutation_attempt_flag'
    });
  }

  const registryDescriptor =
    asObject(src.registryDescriptor) || getSmartRecDeveloperFieldReviewRegistryDescriptor();
  const registry =
    asObject(src.registry) || getEmptySmartRecDeveloperFieldReviewRegistry();
  // Prefer explicit input registryVersion when supplied (synthetic/version probes).
  const registryVersion = isNonEmptyString(src.registryVersion)
    ? String(src.registryVersion).trim()
    : isNonEmptyString(registry.registryVersion)
      ? String(registry.registryVersion).trim()
      : null;

  const reviewContractVersion = isNonEmptyString(src.reviewContractVersion)
    ? String(src.reviewContractVersion).trim()
    : SR_FIELD_REVIEW_CONTRACT_VERSION;

  if (
    SR_FIELD_REVIEW_VALIDATOR_SUPPORTED_REGISTRY_VERSIONS.indexOf(registryVersion) < 0
  ) {
    pushFinding(findings, {
      code: 'stale_registry_version',
      severity: 'error',
      expected: SR_FIELD_REVIEW_VALIDATOR_SUPPORTED_REGISTRY_VERSIONS.slice(),
      actual: registryVersion,
      detail: 'unsupported_or_mismatched_registry_version'
    });
  }

  if (
    SR_FIELD_REVIEW_VALIDATOR_SUPPORTED_CONTRACT_VERSIONS.indexOf(reviewContractVersion) < 0
  ) {
    pushFinding(findings, {
      code: 'review_contract_version_mismatch',
      severity: 'error',
      expected: SR_FIELD_REVIEW_VALIDATOR_SUPPORTED_CONTRACT_VERSIONS.slice(),
      actual: reviewContractVersion,
      detail: 'unsupported_or_mismatched_review_contract_version'
    });
  }

  if (isNonEmptyString(src.evidencePacketRegistryVersion)) {
    const epReg = String(src.evidencePacketRegistryVersion).trim();
    if (
      SR_FIELD_REVIEW_VALIDATOR_SUPPORTED_EVIDENCE_PACKET_REGISTRY_VERSIONS.indexOf(epReg) <
      0
    ) {
      pushFinding(findings, {
        code: 'unsupported_evidence_reference_version',
        severity: 'error',
        detail: 'unsupported_evidence_packet_registry_version',
        actual: epReg
      });
    }
  }

  if (
    registryDescriptor &&
    registryDescriptor.realRecordCount != null &&
    registryDescriptor.realRecordCount !== 0 &&
    Object.keys(asObject(registry.records) || {}).length === 0
  ) {
    // Real empty registry must stay at 0; mismatch is informational for synthetic builds.
  }

  const knownCanonical = setFromArray(
    src.knownCanonicalKeys || SR_FIELD_REVIEW_FIELDS.slice(0, 0),
    normalizeKey
  );
  // Prefer explicit knownCanonicalKeys; empty means no known keys.
  if (Array.isArray(src.knownCanonicalKeys)) {
    // already built
  }

  const aliasMap = aliasMapFromInput(src);
  const aliasOwned = Object.create(null);
  Object.keys(aliasMap).forEach((a) => {
    aliasOwned[a] = true;
  });

  const allowedFields = Array.isArray(src.allowedFields)
    ? src.allowedFields.map((f) => String(f).trim())
    : SR_FIELD_REVIEW_FIELDS.slice();
  const allowedStatuses = Array.isArray(src.allowedStatuses)
    ? src.allowedStatuses.map((s) => String(s).trim())
    : SR_FIELD_REVIEW_STORED_STATUSES.slice();
  const allowedSourceKinds = Array.isArray(src.allowedSourceKinds)
    ? src.allowedSourceKinds.map((s) => String(s).trim())
    : SR_FIELD_REVIEW_SOURCE_KINDS.slice();
  const supportedTokens = Array.isArray(src.supportedReviewedValueTokens)
    ? src.supportedReviewedValueTokens.map((t) => String(t).trim())
    : null;
  const knownEvidence = setFromArray(src.knownEvidenceRefs || src.syntheticEvidenceRefs, (v) =>
    String(v).trim()
  );
  const evidenceMeta = evidenceMetaMap(src);
  const conflicts = conflictEntries(src.conflictSnapshot || src.normalizedConflictSnapshot);
  const supportedReviewVersions = Array.isArray(src.supportedReviewVersions)
    ? src.supportedReviewVersions.map((v) => String(v).trim())
    : null;

  const candidates = resolveCandidateRecords(src);
  const seen = Object.create(null);
  let checkedCount = 0;

  if (candidates.length === 0) {
    pushFinding(findings, {
      code: 'empty_registry_accepted',
      severity: 'info',
      detail: 'empty_real_or_candidate_registry'
    });
  }

  if (asObject(src.legacyAuditSummary)) {
    pushFinding(findings, {
      code: 'legacy_eligibility_summary',
      severity: 'info',
      detail: stableSerialize(src.legacyAuditSummary)
    });
  }

  for (let i = 0; i < candidates.length; i++) {
    const raw = asObject(candidates[i]);
    checkedCount += 1;
    if (!raw) {
      pushFinding(findings, {
        code: 'invalid_input',
        severity: 'error',
        detail: 'record_not_object',
        actual: i
      });
      continue;
    }

    const canonicalKey = normalizeKey(raw.canonicalKey);
    const field = isNonEmptyString(raw.field) ? String(raw.field).trim() : null;
    const reviewStatus = isNonEmptyString(raw.reviewStatus)
      ? String(raw.reviewStatus).trim()
      : null;
    const reviewedValue = isNonEmptyString(raw.reviewedValue)
      ? String(raw.reviewedValue).trim()
      : null;
    const reviewedClaimType = isNonEmptyString(raw.reviewedClaimType)
      ? String(raw.reviewedClaimType).trim()
      : null;
    const valueFingerprint = isNonEmptyString(raw.valueFingerprint)
      ? String(raw.valueFingerprint).trim()
      : null;
    const sourceKind = isNonEmptyString(raw.sourceKind)
      ? String(raw.sourceKind).trim()
      : null;
    const sourceIds = Array.isArray(raw.sourceIds) ? normalizeStringArray(raw.sourceIds) : null;
    const rawEvidenceRefs = Array.isArray(raw.evidenceRefs) ? raw.evidenceRefs : null;
    const reviewVersion = isNonEmptyString(raw.reviewVersion)
      ? String(raw.reviewVersion).trim()
      : null;
    const contextScope = raw.contextScope;
    const isApproval = reviewStatus === 'reviewed_supported';
    const isV02 = reviewContractVersion === SR_FIELD_REVIEW_CONTRACT_VERSION;
    const packetSnapshots = evidenceSnapshotMap(src);
    const recordKey = (canonicalKey || '?') + '::' + (field || '?');
    let recordInvalid = false;
    let recordStale = false;
    let evidenceRefs = null;

    if (!canonicalSummary[canonicalKey || '__unknown__']) {
      canonicalSummary[canonicalKey || '__unknown__'] = {
        sun: null,
        water: null,
        errors: 0,
        warnings: 0
      };
    }
    const summarySlot = canonicalSummary[canonicalKey || '__unknown__'];

    function markError(code, detail, expected, actual) {
      recordInvalid = true;
      summarySlot.errors += 1;
      pushFinding(findings, {
        code: code,
        severity: 'error',
        canonicalKey: canonicalKey,
        field: field,
        detail: detail || null,
        expected: expected,
        actual: actual
      });
    }

    function markWarning(code, detail) {
      summarySlot.warnings += 1;
      pushFinding(findings, {
        code: code,
        severity: 'warning',
        canonicalKey: canonicalKey,
        field: field,
        detail: detail || null
      });
    }

    if (rawEvidenceRefs) {
      const refsNorm = normalizeFieldReviewEvidenceRefs(
        rawEvidenceRefs,
        reviewContractVersion
      );
      if (!refsNorm.ok) {
        for (let rr = 0; rr < refsNorm.reasons.length; rr++) {
          const code = refsNorm.reasons[rr];
          if (code === 'unsupported_evidence_packet_contract_version') {
            markError(
              'unsupported_evidence_reference_version',
              'unsupported_packet_contract_on_ref'
            );
          } else if (code === 'duplicate_evidence_ref') {
            markError('invalid_evidence_reference_shape', 'duplicate_evidence_ref');
          } else if (code === 'unsupported_review_contract_version') {
            markError('review_contract_version_mismatch', code);
          } else {
            markError('invalid_evidence_reference_shape', code);
          }
        }
      } else {
        evidenceRefs = refsNorm.normalized;
      }
    }

    if (!canonicalKey) {
      markError('unknown_canonical_key', 'canonical_key_required');
    } else if (aliasOwned[canonicalKey]) {
      markError('alias_owned_record', 'alias_cannot_own_record');
    } else if (!knownCanonical[canonicalKey]) {
      markError('unknown_canonical_key', 'canonical_key_not_in_known_set', null, canonicalKey);
    }

    if (!field || allowedFields.indexOf(field) < 0) {
      markError('unsupported_field', 'field_must_be_sun_or_water', allowedFields, field);
    }

    if (field && (field === 'sun' || field === 'water')) {
      summarySlot[field] = reviewStatus;
    }

    if (seen[recordKey]) {
      markError('duplicate_canonical_field', 'duplicate_canonical_field', null, recordKey);
      markError('contradictory_records', 'duplicate_implies_contradiction', null, recordKey);
    } else if (canonicalKey && field) {
      seen[recordKey] = true;
    }

    if (!reviewStatus) {
      markError('unsupported_review_status', 'review_status_required');
    } else if (SR_FIELD_REVIEW_COMPUTED_ONLY_STATUSES.indexOf(reviewStatus) >= 0) {
      markError('unsupported_review_status', 'computed_status_not_storable', null, reviewStatus);
    } else if (allowedStatuses.indexOf(reviewStatus) < 0) {
      markError('unsupported_review_status', 'status_not_allowed', allowedStatuses, reviewStatus);
    }

    if (supportedReviewVersions && reviewVersion) {
      if (supportedReviewVersions.indexOf(reviewVersion) < 0) {
        markError(
          'stale_review_version',
          'review_version_unsupported',
          supportedReviewVersions,
          reviewVersion
        );
        recordStale = true;
      }
    }

    // Conflict / identity ambiguity snapshot checks
    const relatedConflicts = canonicalKey && field ? findConflictsFor(conflicts, canonicalKey, field) : [];
    let unresolvedConflict = false;
    let identityAmbiguous = false;
    for (let c = 0; c < relatedConflicts.length; c++) {
      const ce = relatedConflicts[c];
      const classes = Array.isArray(ce.conflictClasses)
        ? ce.conflictClasses
        : isNonEmptyString(ce.conflictClass)
          ? [ce.conflictClass]
          : [];
      if (ce.unresolved === true || ce.status === 'unresolved') unresolvedConflict = true;
      if (
        ce.identityAmbiguous === true ||
        classes.indexOf('identity_ambiguity') >= 0 ||
        classes.indexOf('identity_ambiguous') >= 0
      ) {
        identityAmbiguous = true;
      }
      if (classes.indexOf('quarantined') >= 0 || ce.quarantined === true) {
        identityAmbiguous = true;
      }
    }
    if (asObject(src.quarantinedCanonicalKeys)) {
      if (src.quarantinedCanonicalKeys[canonicalKey] === true) identityAmbiguous = true;
    }
    if (Array.isArray(src.quarantinedCanonicalKeys)) {
      for (let q = 0; q < src.quarantinedCanonicalKeys.length; q++) {
        if (normalizeKey(src.quarantinedCanonicalKeys[q]) === canonicalKey) identityAmbiguous = true;
      }
    }

    const nr = needsReviewFor(src.needsReviewSnapshot, canonicalKey);

    if (isApproval) {
      if (isV02) {
        if (!reviewedClaimType) {
          markError('reviewed_claim_type_missing', 'reviewed_claim_type_required');
        } else if (SR_FIELD_REVIEW_CLAIM_TYPES.indexOf(reviewedClaimType) < 0) {
          markError(
            'unsupported_reviewed_claim_type',
            'claim_type_not_allowed',
            SR_FIELD_REVIEW_CLAIM_TYPES.slice(),
            reviewedClaimType
          );
        } else if (reviewedClaimType === 'general_guidance') {
          markError('general_guidance_not_approvable', 'general_guidance_sole_approval');
        }
      } else if (
        reviewedClaimType != null &&
        SR_FIELD_REVIEW_CLAIM_TYPES.indexOf(reviewedClaimType) < 0
      ) {
        markError(
          'unsupported_reviewed_claim_type',
          'claim_type_not_allowed',
          SR_FIELD_REVIEW_CLAIM_TYPES.slice(),
          reviewedClaimType
        );
      }

      if (!reviewedValue) markError('reviewed_supported_missing_value', 'reviewed_value_required');
      if (!valueFingerprint) markError('missing_value_fingerprint', 'value_fingerprint_required');
      if (!evidenceRefs || evidenceRefs.length === 0) {
        markError('reviewed_supported_missing_evidence', 'evidence_refs_required');
      }
      if (!sourceKind) markError('missing_source_kind', 'source_kind_required');
      else if (allowedSourceKinds.indexOf(sourceKind) < 0) {
        markError('source_kind_source_id_mismatch', 'unsupported_source_kind', allowedSourceKinds, sourceKind);
      }
      if (!sourceIds || sourceIds.length === 0) {
        markError('missing_source_ids', 'source_ids_required');
      }

      if (reviewedValue) {
        if (
          SR_FIELD_REVIEW_COMPOUND_LEGACY_REVIEWED_VALUES.indexOf(reviewedValue) >= 0
        ) {
          markError(
            'unsupported_reviewed_value',
            'compound_legacy_token',
            null,
            reviewedValue
          );
        } else if (supportedTokens && supportedTokens.indexOf(reviewedValue) < 0) {
          markError(
            'unsupported_reviewed_value',
            'token_not_supported',
            supportedTokens,
            reviewedValue
          );
        } else if (!supportedTokens && isV02) {
          const defaults = defaultTokensForField(field);
          if (defaults && defaults.indexOf(reviewedValue) < 0) {
            markError(
              'unsupported_reviewed_value',
              'token_not_in_default_allowlist',
              defaults.slice(),
              reviewedValue
            );
          }
        }
      }

      if (isV02 && contextScope != null) {
        const ctxN = normalizeFieldReviewContextScope(contextScope, reviewContractVersion);
        if (!ctxN.ok) {
          markError('context_scope_mismatch', 'context_normalize_failed');
        }
      }

      let matchingClaimSupport = 0;
      let matchingValueSupport = 0;
      let anyActiveSupport = 0;
      let onlyTolerance = true;
      let onlySurvival = true;
      let onlyGuidance = true;
      let sawAnyPacket = false;

      if (evidenceRefs) {
        for (let e = 0; e < evidenceRefs.length; e++) {
          const ref = evidenceRefs[e];
          const refId = isV02 ? ref.evidenceId : ref;
          const knownOk =
            Object.keys(knownEvidence).length === 0 || knownEvidence[refId] === true;
          if (!knownOk && Object.keys(packetSnapshots).length === 0) {
            markError('evidence_reference_missing', 'evidence_ref_not_in_set', null, refId);
            continue;
          }

          if (!isV02) {
            const meta = evidenceMeta[refId];
            if (meta) {
              if (isNonEmptyString(meta.field) && String(meta.field).trim() !== field) {
                markError(
                  'evidence_status_review_status_conflict',
                  'evidence_field_mismatch',
                  field,
                  meta.field
                );
              }
              if (
                isNonEmptyString(meta.canonicalKey) &&
                normalizeKey(meta.canonicalKey) !== canonicalKey
              ) {
                markError(
                  'evidence_status_review_status_conflict',
                  'evidence_canonical_mismatch',
                  canonicalKey,
                  meta.canonicalKey
                );
              }
              if (meta.status === 'withdrawn' || meta.status === 'superseded') {
                markError(
                  'evidence_status_review_status_conflict',
                  'evidence_' + meta.status,
                  'active',
                  meta.status
                );
                recordStale = true;
              }
              if (
                meta.contextScope != null &&
                !compareContext(meta.contextScope, contextScope, reviewContractVersion)
              ) {
                markError(
                  'context_scope_mismatch',
                  'evidence_context_incompatible',
                  contextScopeKey(contextScope, reviewContractVersion),
                  contextScopeKey(meta.contextScope, reviewContractVersion)
                );
              }
            }
            continue;
          }

          const snap = packetSnapshots[refId];
          if (!snap) {
            markError('evidence_reference_missing', 'packet_snapshot_missing', null, refId);
            continue;
          }
          sawAnyPacket = true;

          if (
            SR_FIELD_REVIEW_VALIDATOR_SUPPORTED_EVIDENCE_PACKET_CONTRACT_VERSIONS.indexOf(
              String(ref.packetContractVersion).trim()
            ) < 0
          ) {
            markError(
              'unsupported_evidence_reference_version',
              'compact_ref_packet_contract',
              null,
              ref.packetContractVersion
            );
          }

          if (normalizeKey(snap.canonicalKey) !== canonicalKey) {
            markError(
              'reviewed_claim_semantic_mismatch',
              'canonical_key_mismatch',
              canonicalKey,
              snap.canonicalKey
            );
          }
          if (isNonEmptyString(snap.field) && String(snap.field).trim() !== field) {
            markError(
              'reviewed_claim_semantic_mismatch',
              'field_mismatch',
              field,
              snap.field
            );
          }

          const snapStatus = isNonEmptyString(snap.packetStatus)
            ? String(snap.packetStatus).trim()
            : null;
          if (!isActivePacketStatus(snapStatus)) {
            markError(
              'evidence_status_review_status_conflict',
              'inactive_packet_' + String(snapStatus),
              'active',
              snapStatus
            );
            if (snapStatus === 'stale') recordStale = true;
          } else {
            anyActiveSupport += 1;
          }

          const snapClaim = isNonEmptyString(snap.claimType)
            ? String(snap.claimType).trim()
            : null;
          if (snapClaim === 'tolerance') onlyGuidance = false;
          else if (snapClaim === 'survival_minimum') {
            onlyGuidance = false;
            onlyTolerance = false;
          } else if (snapClaim === 'preference' || snapClaim === 'optimum') {
            onlyGuidance = false;
            onlyTolerance = false;
            onlySurvival = false;
          } else if (snapClaim === 'general_guidance') {
            onlyTolerance = false;
            onlySurvival = false;
          } else {
            onlyTolerance = false;
            onlySurvival = false;
            onlyGuidance = false;
          }

          if (reviewedClaimType && snapClaim === reviewedClaimType) {
            matchingClaimSupport += 1;
          } else if (reviewedClaimType && snapClaim && snapClaim !== reviewedClaimType) {
            // counted later for sole-support checks
          }

          const snapValue = isNonEmptyString(snap.proposedValue)
            ? String(snap.proposedValue).trim()
            : null;
          if (reviewedValue && snapValue === reviewedValue) {
            matchingValueSupport += 1;
          } else if (reviewedValue && snapValue && snapValue !== reviewedValue) {
            markError(
              'reviewed_claim_semantic_mismatch',
              'proposed_value_mismatch',
              reviewedValue,
              snapValue
            );
          }

          if (
            !compareContext(snap.contextScope, contextScope, reviewContractVersion)
          ) {
            markError(
              'context_scope_mismatch',
              'normalized_context_mismatch',
              contextScopeKey(contextScope, reviewContractVersion),
              contextScopeKey(snap.contextScope, reviewContractVersion)
            );
          }

          const snapFp = isNonEmptyString(snap.contentFingerprint)
            ? String(snap.contentFingerprint).trim()
            : null;
          if (
            snapFp &&
            String(ref.expectedContentFingerprint).trim() !== snapFp
          ) {
            markError(
              'evidence_content_fingerprint_mismatch',
              'expected_vs_snapshot',
              ref.expectedContentFingerprint,
              snapFp
            );
          }
        }
      }

      if (isV02 && isApproval && reviewedClaimType && reviewedClaimType !== 'general_guidance') {
        if (sawAnyPacket && matchingClaimSupport === 0) {
          if (reviewedClaimType === 'preference' && onlyTolerance && anyActiveSupport > 0) {
            markError(
              'reviewed_claim_semantic_mismatch',
              'preference_supported_only_by_tolerance'
            );
          } else if (
            reviewedClaimType === 'optimum' &&
            onlySurvival &&
            anyActiveSupport > 0
          ) {
            markError(
              'reviewed_claim_semantic_mismatch',
              'optimum_supported_only_by_survival_minimum'
            );
          } else if (onlyGuidance && anyActiveSupport > 0) {
            markError(
              'general_guidance_not_approvable',
              'general_guidance_only_support'
            );
          } else {
            markError(
              'reviewed_claim_semantic_mismatch',
              'no_matching_claim_type_support',
              reviewedClaimType,
              null
            );
          }
        }
        if (sawAnyPacket && matchingValueSupport === 0 && reviewedValue) {
          markError(
            'reviewed_claim_semantic_mismatch',
            'no_matching_proposed_value_support',
            reviewedValue,
            null
          );
        }
        if (sawAnyPacket && anyActiveSupport === 0) {
          markError(
            'evidence_status_review_status_conflict',
            'no_active_supporting_packet'
          );
        }
      }

      if (unresolvedConflict) {
        markError(
          'unresolved_conflict_marked_supported',
          'conflict_unresolved_for_field'
        );
      }
      if (identityAmbiguous) {
        markError('identity_ambiguity_ignored', 'identity_ambiguous_or_quarantined');
      }

      if (nr === false && unresolvedConflict) {
        markError(
          'global_needs_review_cleared_while_unresolved',
          'needs_review_false_with_unresolved_conflict'
        );
      }

      // Fingerprint via registry builder
      if (
        reviewedValue &&
        sourceKind &&
        sourceIds &&
        evidenceRefs &&
        contextScope != null &&
        (!isV02 || reviewedClaimType)
      ) {
        const fp = buildFieldReviewValueFingerprint({
          canonicalKey: canonicalKey,
          field: field,
          reviewedClaimType: reviewedClaimType,
          reviewedValue: reviewedValue,
          sourceKind: sourceKind,
          sourceIds: sourceIds,
          evidenceRefs: evidenceRefs,
          contextScope: contextScope,
          reviewContractVersion: reviewContractVersion
        });
        if (fp.ok) {
          if (valueFingerprint && valueFingerprint !== fp.fingerprint) {
            markError(
              'fingerprint_mismatch',
              'stored_fingerprint_mismatch',
              fp.fingerprint,
              valueFingerprint
            );
            recordStale = true;
          }
        }
      }

      // Current snapshot drift
      const cur = currentSnapshotFor(src, canonicalKey, field);
      if (cur && isApproval) {
        if (
          isNonEmptyString(cur.reviewedValue) &&
          reviewedValue &&
          String(cur.reviewedValue).trim() !== reviewedValue
        ) {
          markError(
            'source_assignment_changed',
            'current_reviewed_value_differs',
            reviewedValue,
            cur.reviewedValue
          );
          recordStale = true;
        }
        if (
          isNonEmptyString(cur.sourceKind) &&
          sourceKind &&
          String(cur.sourceKind).trim() !== sourceKind
        ) {
          markError(
            'source_assignment_changed',
            'current_source_kind_differs',
            sourceKind,
            cur.sourceKind
          );
          recordStale = true;
        }
        if (Array.isArray(cur.sourceIds) && sourceIds) {
          const curIds = normalizeStringArray(cur.sourceIds);
          if (curIds && curIds.join(',') !== sourceIds.join(',')) {
            markError(
              'source_assignment_changed',
              'current_source_ids_differ',
              sourceIds,
              curIds
            );
            recordStale = true;
          }
        }
        if (
          cur.contextScope != null &&
          !compareContext(cur.contextScope, contextScope, reviewContractVersion)
        ) {
          markError(
            'context_scope_mismatch',
            'current_context_differs',
            contextScopeKey(contextScope, reviewContractVersion),
            contextScopeKey(cur.contextScope, reviewContractVersion)
          );
          recordStale = true;
        }
        if (
          isNonEmptyString(cur.reviewContractVersion) &&
          SR_FIELD_REVIEW_VALIDATOR_SUPPORTED_CONTRACT_VERSIONS.indexOf(
            String(cur.reviewContractVersion).trim()
          ) >= 0 &&
          String(cur.reviewContractVersion).trim() !== reviewContractVersion
        ) {
          markError(
            'review_contract_version_mismatch',
            'current_contract_version_differs',
            reviewContractVersion,
            cur.reviewContractVersion
          );
          recordStale = true;
        }
      }

      // Climate-group blast radius
      if (sourceKind === 'climate_group') {
        const proof = blastProofFor(src, canonicalKey, field, sourceIds);
        const ok =
          proof &&
          proof.groupExists === true &&
          proof.canonicalAssigned === true &&
          proof.fieldMatches === true &&
          proof.assignmentReviewed === true &&
          proof.blastRadiusReviewed === true &&
          proof.noIgnoredContradiction === true;
        if (!ok) {
          markError(
            'group_blast_radius_unreviewed',
            'climate_group_requires_blast_radius_proof'
          );
        } else {
          markWarning('group_source_deferred', 'climate_group_proof_present_but_non_product');
        }
      }

      if (nr === true) {
        markWarning(
          'product_inactive_under_global_needs_review',
          'developer_valid_but_product_inactive'
        );
      }
    } else if (sourceKind === 'climate_group') {
      markWarning('group_source_deferred', 'non_approval_climate_group_record');
    }

    if (
      reviewedClaimType != null &&
      !isApproval &&
      SR_FIELD_REVIEW_CLAIM_TYPES.indexOf(reviewedClaimType) < 0
    ) {
      markError(
        'unsupported_reviewed_claim_type',
        'claim_type_not_allowed',
        SR_FIELD_REVIEW_CLAIM_TYPES.slice(),
        reviewedClaimType
      );
    }

    // Optional source-kind/source-id policy map
    const kindIdPolicy = asObject(src.sourceKindSourceIdPolicy);
    if (isApproval && sourceKind && sourceIds && kindIdPolicy) {
      const allowedIds = Array.isArray(kindIdPolicy[sourceKind])
        ? kindIdPolicy[sourceKind].map((x) => String(x).trim())
        : null;
      if (allowedIds) {
        for (let s = 0; s < sourceIds.length; s++) {
          if (allowedIds.indexOf(sourceIds[s]) < 0) {
            markError(
              'source_kind_source_id_mismatch',
              'source_id_not_allowed_for_kind',
              allowedIds,
              sourceIds[s]
            );
          }
        }
      }
    }

    if (recordInvalid) {
      invalidRecords.push(
        freezeDeep({
          canonicalKey: canonicalKey,
          field: field,
          reviewStatus: reviewStatus,
          index: i
        })
      );
    }
    if (recordStale) {
      staleRecords.push(
        freezeDeep({
          canonicalKey: canonicalKey,
          field: field,
          reviewStatus: reviewStatus,
          index: i
        })
      );
    }
  }

  // Ensure empty real registry artifact was not mutated conceptually
  const emptyReal = getEmptySmartRecDeveloperFieldReviewRegistry();
  if (Object.keys(emptyReal.records || {}).length !== 0) {
    pushFinding(findings, {
      code: 'registry_or_input_mutation',
      severity: 'error',
      detail: 'empty_real_registry_not_empty'
    });
  }

  return finalizeReport({
    findings: findings,
    invalidRecords: invalidRecords,
    staleRecords: staleRecords,
    canonicalSummary: canonicalSummary,
    registryVersion: registryVersion,
    recordCount: candidates.length,
    checkedCount: checkedCount
  });
}

function finalizeReport(parts) {
  const findings = parts.findings.slice().sort(function (a, b) {
    const sa = String(a.severity) + '|' + String(a.code) + '|' + String(a.canonicalKey) + '|' + String(a.field) + '|' + String(a.detail);
    const sb = String(b.severity) + '|' + String(b.code) + '|' + String(b.canonicalKey) + '|' + String(b.field) + '|' + String(b.detail);
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    return 0;
  });

  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  const findingsByCode = Object.create(null);
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    if (f.severity === 'error') errorCount += 1;
    else if (f.severity === 'warning') warningCount += 1;
    else infoCount += 1;
    if (!findingsByCode[f.code]) findingsByCode[f.code] = [];
    findingsByCode[f.code].push(f);
  }

  const summaryFingerprint = [
    SR_FIELD_REVIEW_VALIDATOR_VERSION,
    String(parts.registryVersion || ''),
    String(parts.recordCount),
    String(parts.checkedCount),
    String(errorCount),
    String(warningCount),
    String(infoCount),
    findings
      .map(function (f) {
        return [
          f.severity,
          f.code,
          f.canonicalKey || '',
          f.field || '',
          f.detail || '',
          f.expected == null ? '' : stableSerialize(f.expected),
          f.actual == null ? '' : stableSerialize(f.actual)
        ].join(':');
      })
      .join(';')
  ].join('|');

  return freezeDeep({
    valid: errorCount === 0,
    validatorVersion: SR_FIELD_REVIEW_VALIDATOR_VERSION,
    registryVersion: parts.registryVersion,
    recordCount: parts.recordCount,
    checkedCount: parts.checkedCount,
    errorCount: errorCount,
    warningCount: warningCount,
    infoCount: infoCount,
    findings: findings,
    findingsByCode: findingsByCode,
    invalidRecords: parts.invalidRecords.slice(),
    staleRecords: parts.staleRecords.slice(),
    canonicalSummary: parts.canonicalSummary,
    summaryFingerprint: summaryFingerprint
  });
}
