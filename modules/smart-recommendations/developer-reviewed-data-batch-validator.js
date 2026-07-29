/**
 * Cruvit — Smart Recommendations developer reviewed-data batch validator
 * ---------------------------------------------------------------------------
 * Pure, developer-only orchestrator over already-parsed reviewed-data wrappers.
 * Validates Container → Evidence Packet → Field Review → Structured Climate Profile.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Accepts already-parsed objects only; never fetches JSON itself.
 *  - Does not mutate global Registries, catalog, needsReview, or eligibility.
 *  - Does not import product runtime, GOS, or v1b.
 */

import {
  SR_EVIDENCE_PACKET_CONTRACT_VERSION,
  SR_EVIDENCE_PACKET_REGISTRY_VERSION,
  buildEvidencePacketSourceFingerprint,
  buildEvidencePacketContentFingerprint,
  buildEvidencePacketReferenceSnapshot,
  getEmptySmartRecDeveloperEvidencePacketRegistry,
  getSmartRecDeveloperEvidencePacketRegistryDescriptor
} from './developer-evidence-packet-registry.js';

import { validateSmartRecDeveloperEvidencePacketRegistry } from './developer-evidence-packet-validator.js';

import {
  SR_FIELD_REVIEW_CONTRACT_VERSION,
  SR_FIELD_REVIEW_REGISTRY_VERSION,
  buildFieldReviewValueFingerprint,
  buildFieldReviewReferenceSnapshot,
  getEmptySmartRecDeveloperFieldReviewRegistry,
  getSmartRecDeveloperFieldReviewRegistryDescriptor
} from './developer-field-review-registry.js';

import { validateSmartRecDeveloperFieldReviewRegistry } from './developer-field-review-validator.js';

import {
  SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
  SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_VERSION,
  buildStructuredClimateProfileFingerprint,
  getEmptySmartRecDeveloperStructuredClimateProfileRegistry,
  getSmartRecDeveloperStructuredClimateProfileRegistryDescriptor
} from './developer-structured-climate-profile-registry.js';

import { validateSmartRecDeveloperStructuredClimateProfileRegistry } from './developer-structured-climate-profile-validator.js';

export const SR_REVIEWED_DATA_CONTAINER_CONTRACT_VERSION =
  '0.1.0-sr-reviewed-data-container';

export const SR_REVIEWED_DATA_BATCH_VALIDATOR_VERSION =
  '0.1.0-sr-reviewed-data-batch-validator';

export const SR_REVIEWED_DATA_BATCH_VALIDATOR_CAPABILITY =
  'explicit_developer_reviewed_data_batch_validation';

export const SR_REVIEWED_DATA_BATCH_VALIDATOR_SEVERITIES = Object.freeze([
  'error',
  'warning',
  'info'
]);

export const SR_REVIEWED_DATA_BATCH_VALIDATOR_FINDING_CODES = Object.freeze([
  'invalid_input',
  'unsupported_container_contract_version',
  'invalid_manifest_shape',
  'unknown_manifest_key',
  'invalid_artifact_declaration',
  'missing_artifact_wrapper',
  'invalid_artifact_wrapper',
  'unknown_wrapper_key',
  'artifact_count_mismatch',
  'batch_id_mismatch',
  'canonical_identity_mismatch',
  'field_mismatch',
  'reviewed_claim_mismatch',
  'context_mismatch',
  'evidence_packet_validation_failed',
  'field_review_validation_failed',
  'structured_profile_validation_failed',
  'fingerprint_mismatch',
  'product_isolation_violation',
  'mutation_detected'
]);

const MANIFEST_KEYS = Object.freeze([
  'containerContractVersion',
  'batchId',
  'canonicalKey',
  'acceptedScientificName',
  'field',
  'reviewedClaimType',
  'researchHypothesis',
  'contextScope',
  'artifactFiles',
  'expectedArtifactCounts',
  'requiredContractVersions',
  'productIsolation',
  'batchStatus',
  'unresolvedLimitations'
]);

const WRAPPER_KEYS = Object.freeze([
  'containerContractVersion',
  'batchId',
  'artifactType',
  'artifactContractVersion',
  'records'
]);

const ARTIFACT_FILES = Object.freeze({
  evidencePackets: 'evidence-packets.json',
  fieldReviewRecords: 'field-review-records.json',
  structuredClimateProfiles: 'structured-climate-profiles.json'
});

const ARTIFACT_TYPES = Object.freeze({
  evidencePackets: 'evidence_packets',
  fieldReviewRecords: 'field_review_records',
  structuredClimateProfiles: 'structured_climate_profiles'
});

const CONTEXT_CORE_KEYS = Object.freeze([
  'setting',
  'planting',
  'maturity',
  'objective'
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

function normalizeTrim(v) {
  if (!isNonEmptyString(v)) return null;
  return String(v).trim();
}

function normalizeKey(v) {
  if (!isNonEmptyString(v)) return null;
  return String(v).trim().toLowerCase();
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

function pushFinding(findings, finding) {
  findings.push(
    freezeDeep({
      code: finding.code,
      severity: finding.severity || 'error',
      detail: finding.detail || null,
      expected: finding.expected == null ? null : finding.expected,
      actual: finding.actual == null ? null : finding.actual
    })
  );
}

function hasError(findings) {
  for (let i = 0; i < findings.length; i++) {
    if (findings[i].severity === 'error') return true;
  }
  return false;
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

function sortFindings(findings) {
  return findings.slice().sort(function (a, b) {
    const ak = [a.severity || '', a.code || '', a.detail || '', stableSerialize(a.actual)].join('|');
    const bk = [b.severity || '', b.code || '', b.detail || '', stableSerialize(b.actual)].join('|');
    if (ak < bk) return -1;
    if (ak > bk) return 1;
    return 0;
  });
}

function buildFindingsByCode(findings) {
  const out = Object.create(null);
  for (let i = 0; i < findings.length; i++) {
    const code = findings[i].code;
    if (!out[code]) out[code] = 0;
    out[code] += 1;
  }
  return out;
}

function contextCoreKey(scope) {
  const o = asObject(scope);
  if (!o) return null;
  const core = {};
  for (let i = 0; i < CONTEXT_CORE_KEYS.length; i++) {
    const k = CONTEXT_CORE_KEYS[i];
    if (!isNonEmptyString(o[k])) return null;
    core[k] = String(o[k]).trim();
  }
  return stableSerialize(core);
}

function contextsMatch(a, b) {
  const ka = contextCoreKey(a);
  const kb = contextCoreKey(b);
  return ka != null && kb != null && ka === kb;
}

function snapshotClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function buildDescriptor() {
  return freezeDeep({
    validatorVersion: SR_REVIEWED_DATA_BATCH_VALIDATOR_VERSION,
    containerContractVersion: SR_REVIEWED_DATA_CONTAINER_CONTRACT_VERSION,
    capability: SR_REVIEWED_DATA_BATCH_VALIDATOR_CAPABILITY,
    developerOnly: true,
    authoritative: false,
    productConsumer: false,
    runtimeEligibilityAuthority: false,
    catalogMutation: false,
    evidenceMutation: false,
    fieldReviewMutation: false,
    profileMutation: false,
    needsReviewMutation: false,
    persistence: false,
    network: false,
    automaticExecution: false,
    activation: 'explicit_call_only',
    productConsumers: 'none',
    severities: SR_REVIEWED_DATA_BATCH_VALIDATOR_SEVERITIES.slice(),
    findingCodes: SR_REVIEWED_DATA_BATCH_VALIDATOR_FINDING_CODES.slice(),
    foundationDefaults: {
      realPacketCount: 0,
      realRecordCount: 0,
      realProfileCount: 0
    }
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperReviewedDataBatchValidatorDescriptor() {
  return DESCRIPTOR;
}

function buildSummaryFingerprint(parts) {
  const findings = parts.findings || [];
  const codes = findings
    .map(function (f) {
      return f.code;
    })
    .slice()
    .sort();
  return [
    SR_REVIEWED_DATA_BATCH_VALIDATOR_VERSION,
    SR_REVIEWED_DATA_CONTAINER_CONTRACT_VERSION,
    parts.valid ? '1' : '0',
    String(parts.loadedEvidencePacketCount || 0),
    String(parts.loadedFieldReviewRecordCount || 0),
    String(parts.loadedStructuredClimateProfileCount || 0),
    String(parts.errorCount || 0),
    String(parts.warningCount || 0),
    String(parts.infoCount || 0),
    codes.join(','),
    parts.productIsolation || 'failed',
    parts.batchId || ''
  ].join('|');
}

function validateWrapper(wrapper, expectedType, expectedContract, batchId, findings, label) {
  if (wrapper == null) {
    pushFinding(findings, {
      code: 'missing_artifact_wrapper',
      severity: 'error',
      detail: label
    });
    return null;
  }
  const o = asObject(wrapper);
  if (!o) {
    pushFinding(findings, {
      code: 'invalid_artifact_wrapper',
      severity: 'error',
      detail: label + '_not_object'
    });
    return null;
  }
  const keys = Object.keys(o);
  for (let i = 0; i < keys.length; i++) {
    if (WRAPPER_KEYS.indexOf(keys[i]) < 0) {
      pushFinding(findings, {
        code: 'unknown_wrapper_key',
        severity: 'error',
        detail: label,
        actual: keys[i]
      });
    }
  }
  for (let i = 0; i < WRAPPER_KEYS.length; i++) {
    if (!(WRAPPER_KEYS[i] in o)) {
      pushFinding(findings, {
        code: 'invalid_artifact_wrapper',
        severity: 'error',
        detail: label + '_missing_' + WRAPPER_KEYS[i]
      });
    }
  }
  if (normalizeTrim(o.containerContractVersion) !== SR_REVIEWED_DATA_CONTAINER_CONTRACT_VERSION) {
    pushFinding(findings, {
      code: 'unsupported_container_contract_version',
      severity: 'error',
      detail: label + '_container',
      expected: SR_REVIEWED_DATA_CONTAINER_CONTRACT_VERSION,
      actual: o.containerContractVersion
    });
  }
  if (normalizeTrim(o.batchId) !== batchId) {
    pushFinding(findings, {
      code: 'batch_id_mismatch',
      severity: 'error',
      detail: label,
      expected: batchId,
      actual: o.batchId
    });
  }
  if (normalizeTrim(o.artifactType) !== expectedType) {
    pushFinding(findings, {
      code: 'invalid_artifact_wrapper',
      severity: 'error',
      detail: label + '_artifactType',
      expected: expectedType,
      actual: o.artifactType
    });
  }
  if (normalizeTrim(o.artifactContractVersion) !== expectedContract) {
    pushFinding(findings, {
      code: 'invalid_artifact_wrapper',
      severity: 'error',
      detail: label + '_artifactContractVersion',
      expected: expectedContract,
      actual: o.artifactContractVersion
    });
  }
  if (!Array.isArray(o.records)) {
    pushFinding(findings, {
      code: 'invalid_artifact_wrapper',
      severity: 'error',
      detail: label + '_records_not_array'
    });
    return null;
  }
  return o;
}

/**
 * Pure batch validation entry point.
 * @param {object} input already-parsed manifest + wrappers (+ optional identity)
 */
export function validateSmartRecDeveloperReviewedDataBatch(input) {
  const findings = [];
  const src = asObject(input);
  if (!src) {
    pushFinding(findings, {
      code: 'invalid_input',
      severity: 'error',
      detail: 'input_object_required'
    });
    return finalize({
      findings: findings,
      loadedEvidencePacketCount: 0,
      loadedFieldReviewRecordCount: 0,
      loadedStructuredClimateProfileCount: 0,
      batchId: null,
      productIsolation: 'failed',
      mutationDetected: false
    });
  }

  const manifestBefore = snapshotClone(src.manifest);
  const epBefore = snapshotClone(src.evidencePacketWrapper || src.evidencePackets);
  const frBefore = snapshotClone(src.fieldReviewWrapper || src.fieldReviewRecords);
  const scpBefore = snapshotClone(
    src.structuredClimateProfileWrapper || src.structuredClimateProfiles
  );

  const manifest = asObject(src.manifest);
  if (!manifest) {
    pushFinding(findings, {
      code: 'invalid_manifest_shape',
      severity: 'error',
      detail: 'manifest_object_required'
    });
    return finalize({
      findings: findings,
      loadedEvidencePacketCount: 0,
      loadedFieldReviewRecordCount: 0,
      loadedStructuredClimateProfileCount: 0,
      batchId: null,
      productIsolation: 'failed',
      mutationDetected: false
    });
  }

  // 1. Container version
  if (
    normalizeTrim(manifest.containerContractVersion) !==
    SR_REVIEWED_DATA_CONTAINER_CONTRACT_VERSION
  ) {
    pushFinding(findings, {
      code: 'unsupported_container_contract_version',
      severity: 'error',
      expected: SR_REVIEWED_DATA_CONTAINER_CONTRACT_VERSION,
      actual: manifest.containerContractVersion
    });
  }

  // 2. Manifest shape / unknown keys
  const mKeys = Object.keys(manifest);
  for (let i = 0; i < mKeys.length; i++) {
    if (MANIFEST_KEYS.indexOf(mKeys[i]) < 0) {
      pushFinding(findings, {
        code: 'unknown_manifest_key',
        severity: 'error',
        actual: mKeys[i]
      });
    }
  }
  for (let i = 0; i < MANIFEST_KEYS.length; i++) {
    if (!(MANIFEST_KEYS[i] in manifest)) {
      pushFinding(findings, {
        code: 'invalid_manifest_shape',
        severity: 'error',
        detail: 'missing_' + MANIFEST_KEYS[i]
      });
    }
  }

  const batchId = normalizeTrim(manifest.batchId);
  if (!batchId) {
    pushFinding(findings, {
      code: 'invalid_manifest_shape',
      severity: 'error',
      detail: 'batchId_required'
    });
  }

  // 3. Exact artifact file declarations
  const artifactFiles = asObject(manifest.artifactFiles);
  if (!artifactFiles) {
    pushFinding(findings, {
      code: 'invalid_artifact_declaration',
      severity: 'error',
      detail: 'artifactFiles_required'
    });
  } else {
    const afKeys = Object.keys(artifactFiles);
    const expectedKeys = Object.keys(ARTIFACT_FILES);
    for (let i = 0; i < afKeys.length; i++) {
      if (expectedKeys.indexOf(afKeys[i]) < 0) {
        pushFinding(findings, {
          code: 'invalid_artifact_declaration',
          severity: 'error',
          detail: 'unknown_artifact_file_key',
          actual: afKeys[i]
        });
      }
    }
    for (let i = 0; i < expectedKeys.length; i++) {
      const k = expectedKeys[i];
      if (artifactFiles[k] !== ARTIFACT_FILES[k]) {
        pushFinding(findings, {
          code: 'invalid_artifact_declaration',
          severity: 'error',
          detail: k,
          expected: ARTIFACT_FILES[k],
          actual: artifactFiles[k]
        });
      }
    }
  }

  const required = asObject(manifest.requiredContractVersions) || {};
  if (
    normalizeTrim(required.containerContractVersion) !==
      SR_REVIEWED_DATA_CONTAINER_CONTRACT_VERSION ||
    normalizeTrim(required.evidencePacketContractVersion) !==
      SR_EVIDENCE_PACKET_CONTRACT_VERSION ||
    normalizeTrim(required.fieldReviewContractVersion) !== SR_FIELD_REVIEW_CONTRACT_VERSION ||
    normalizeTrim(required.fieldReviewRegistryVersion) !== SR_FIELD_REVIEW_REGISTRY_VERSION ||
    normalizeTrim(required.structuredClimateProfileContractVersion) !==
      SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION
  ) {
    pushFinding(findings, {
      code: 'invalid_manifest_shape',
      severity: 'error',
      detail: 'requiredContractVersions_mismatch',
      actual: required
    });
  }

  // 4. Wrapper shapes
  const epWrapper = validateWrapper(
    src.evidencePacketWrapper || src.evidencePackets,
    ARTIFACT_TYPES.evidencePackets,
    SR_EVIDENCE_PACKET_CONTRACT_VERSION,
    batchId,
    findings,
    'evidence_packets'
  );
  const frWrapper = validateWrapper(
    src.fieldReviewWrapper || src.fieldReviewRecords,
    ARTIFACT_TYPES.fieldReviewRecords,
    SR_FIELD_REVIEW_CONTRACT_VERSION,
    batchId,
    findings,
    'field_review_records'
  );
  const scpWrapper = validateWrapper(
    src.structuredClimateProfileWrapper || src.structuredClimateProfiles,
    ARTIFACT_TYPES.structuredClimateProfiles,
    SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
    batchId,
    findings,
    'structured_climate_profiles'
  );

  const expectedCounts = asObject(manifest.expectedArtifactCounts) || {};
  const loadedEp = epWrapper && Array.isArray(epWrapper.records) ? epWrapper.records.length : 0;
  const loadedFr = frWrapper && Array.isArray(frWrapper.records) ? frWrapper.records.length : 0;
  const loadedScp =
    scpWrapper && Array.isArray(scpWrapper.records) ? scpWrapper.records.length : 0;

  // 5. Manifest counts versus wrapper counts
  if (
    expectedCounts.evidencePackets !== loadedEp ||
    expectedCounts.fieldReviewRecords !== loadedFr ||
    expectedCounts.structuredClimateProfiles !== loadedScp
  ) {
    pushFinding(findings, {
      code: 'artifact_count_mismatch',
      severity: 'error',
      detail: 'manifest_vs_wrapper',
      expected: expectedCounts,
      actual: {
        evidencePackets: loadedEp,
        fieldReviewRecords: loadedFr,
        structuredClimateProfiles: loadedScp
      }
    });
  }

  const identity = asObject(src.canonicalIdentitySnapshot) || asObject(src.identitySnapshot) || {};
  const knownCanonicalKeys = Array.isArray(src.knownCanonicalKeys)
    ? src.knownCanonicalKeys.map(normalizeKey).filter(Boolean)
    : Array.isArray(identity.knownCanonicalKeys)
      ? identity.knownCanonicalKeys.map(normalizeKey).filter(Boolean)
      : [normalizeKey(manifest.canonicalKey)].filter(Boolean);

  const acceptedScientific =
    normalizeTrim(identity.acceptedScientificName) ||
    normalizeTrim(manifest.acceptedScientificName);

  // 6–9. Identity / field / claim / context consistency
  if (epWrapper) {
    for (let i = 0; i < epWrapper.records.length; i++) {
      const p = asObject(epWrapper.records[i]) || {};
      if (normalizeKey(p.canonicalKey) !== normalizeKey(manifest.canonicalKey)) {
        pushFinding(findings, {
          code: 'canonical_identity_mismatch',
          severity: 'error',
          detail: 'evidence_packet',
          expected: manifest.canonicalKey,
          actual: p.canonicalKey
        });
      }
      if (
        acceptedScientific &&
        normalizeTrim(p.scientificIdentity) &&
        normalizeTrim(p.scientificIdentity) !== acceptedScientific
      ) {
        pushFinding(findings, {
          code: 'canonical_identity_mismatch',
          severity: 'error',
          detail: 'scientific_identity',
          expected: acceptedScientific,
          actual: p.scientificIdentity
        });
      }
      if (normalizeTrim(p.field) !== normalizeTrim(manifest.field)) {
        pushFinding(findings, {
          code: 'field_mismatch',
          severity: 'error',
          detail: 'evidence_packet',
          expected: manifest.field,
          actual: p.field
        });
      }
      if (normalizeTrim(p.claimType) !== normalizeTrim(manifest.reviewedClaimType)) {
        pushFinding(findings, {
          code: 'reviewed_claim_mismatch',
          severity: 'error',
          detail: 'evidence_packet_claimType',
          expected: manifest.reviewedClaimType,
          actual: p.claimType
        });
      }
      if (normalizeTrim(p.proposedValue) !== normalizeTrim(manifest.researchHypothesis)) {
        pushFinding(findings, {
          code: 'reviewed_claim_mismatch',
          severity: 'error',
          detail: 'evidence_packet_proposedValue',
          expected: manifest.researchHypothesis,
          actual: p.proposedValue
        });
      }
      if (!contextsMatch(p.contextScope, manifest.contextScope)) {
        pushFinding(findings, {
          code: 'context_mismatch',
          severity: 'error',
          detail: 'evidence_packet',
          expected: contextCoreKey(manifest.contextScope),
          actual: contextCoreKey(p.contextScope)
        });
      }
    }
  }

  if (frWrapper) {
    for (let i = 0; i < frWrapper.records.length; i++) {
      const r = asObject(frWrapper.records[i]) || {};
      if (normalizeKey(r.canonicalKey) !== normalizeKey(manifest.canonicalKey)) {
        pushFinding(findings, {
          code: 'canonical_identity_mismatch',
          severity: 'error',
          detail: 'field_review',
          expected: manifest.canonicalKey,
          actual: r.canonicalKey
        });
      }
      if (normalizeTrim(r.field) !== normalizeTrim(manifest.field)) {
        pushFinding(findings, {
          code: 'field_mismatch',
          severity: 'error',
          detail: 'field_review',
          expected: manifest.field,
          actual: r.field
        });
      }
      if (normalizeTrim(r.reviewedClaimType) !== normalizeTrim(manifest.reviewedClaimType)) {
        pushFinding(findings, {
          code: 'reviewed_claim_mismatch',
          severity: 'error',
          detail: 'field_review_claim',
          expected: manifest.reviewedClaimType,
          actual: r.reviewedClaimType
        });
      }
      if (normalizeTrim(r.reviewedValue) !== normalizeTrim(manifest.researchHypothesis)) {
        pushFinding(findings, {
          code: 'reviewed_claim_mismatch',
          severity: 'error',
          detail: 'field_review_value',
          expected: manifest.researchHypothesis,
          actual: r.reviewedValue
        });
      }
      if (!contextsMatch(r.contextScope, manifest.contextScope)) {
        pushFinding(findings, {
          code: 'context_mismatch',
          severity: 'error',
          detail: 'field_review',
          expected: contextCoreKey(manifest.contextScope),
          actual: contextCoreKey(r.contextScope)
        });
      }
    }
  }

  if (scpWrapper) {
    for (let i = 0; i < scpWrapper.records.length; i++) {
      const p = asObject(scpWrapper.records[i]) || {};
      if (normalizeKey(p.canonicalKey) !== normalizeKey(manifest.canonicalKey)) {
        pushFinding(findings, {
          code: 'canonical_identity_mismatch',
          severity: 'error',
          detail: 'structured_climate_profile',
          expected: manifest.canonicalKey,
          actual: p.canonicalKey
        });
      }
      if (normalizeTrim(p.field) !== normalizeTrim(manifest.field)) {
        pushFinding(findings, {
          code: 'field_mismatch',
          severity: 'error',
          detail: 'structured_climate_profile',
          expected: manifest.field,
          actual: p.field
        });
      }
      if (normalizeTrim(p.reviewedClaimType) !== normalizeTrim(manifest.reviewedClaimType)) {
        pushFinding(findings, {
          code: 'reviewed_claim_mismatch',
          severity: 'error',
          detail: 'profile_claim',
          expected: manifest.reviewedClaimType,
          actual: p.reviewedClaimType
        });
      }
      if (normalizeTrim(p.reviewedValue) !== normalizeTrim(manifest.researchHypothesis)) {
        pushFinding(findings, {
          code: 'reviewed_claim_mismatch',
          severity: 'error',
          detail: 'profile_value',
          expected: manifest.researchHypothesis,
          actual: p.reviewedValue
        });
      }
      if (!contextsMatch(p.contextScope, manifest.contextScope)) {
        pushFinding(findings, {
          code: 'context_mismatch',
          severity: 'error',
          detail: 'structured_climate_profile',
          expected: contextCoreKey(manifest.contextScope),
          actual: contextCoreKey(p.contextScope)
        });
      }
    }
  }

  // 10. Evidence Packet Registry and Validator
  let epReport = null;
  const epSnapshots = [];
  if (epWrapper && Array.isArray(epWrapper.records)) {
    for (let i = 0; i < epWrapper.records.length; i++) {
      const p = asObject(epWrapper.records[i]) || {};
      const srcFp = buildEvidencePacketSourceFingerprint({
        sourceType: p.sourceType,
        sourceTitle: p.sourceTitle,
        publisher: p.publisher,
        sourceReference: p.sourceReference,
        sourceIdentity: p.sourceIdentity || p.sourceReference
      });
      const contentFp = buildEvidencePacketContentFingerprint({
        evidenceId: p.evidenceId,
        canonicalKey: p.canonicalKey,
        field: p.field,
        normalizedClaim: p.normalizedClaim,
        proposedValue: p.proposedValue,
        authorityTier: p.authorityTier,
        sourceIdentity: p.sourceIdentity || p.sourceReference,
        sourceReference: p.sourceReference,
        contextScope: p.contextScope,
        claimType: p.claimType,
        packetContractVersion: p.packetContractVersion
      });
      if (!srcFp.ok || srcFp.fingerprint !== normalizeTrim(p.sourceFingerprint)) {
        pushFinding(findings, {
          code: 'fingerprint_mismatch',
          severity: 'error',
          detail: 'evidence_sourceFingerprint',
          expected: srcFp.fingerprint,
          actual: p.sourceFingerprint
        });
      }
      if (!contentFp.ok || contentFp.fingerprint !== normalizeTrim(p.contentFingerprint)) {
        pushFinding(findings, {
          code: 'fingerprint_mismatch',
          severity: 'error',
          detail: 'evidence_contentFingerprint',
          expected: contentFp.fingerprint,
          actual: p.contentFingerprint
        });
      }
    }

    const epInput = asObject(src.evidencePacketValidatorInput) || {};
    epReport = validateSmartRecDeveloperEvidencePacketRegistry(
      Object.assign(
        {
          registry: getEmptySmartRecDeveloperEvidencePacketRegistry(),
          registryDescriptor: getSmartRecDeveloperEvidencePacketRegistryDescriptor(),
          registryVersion: SR_EVIDENCE_PACKET_REGISTRY_VERSION,
          packetContractVersion: SR_EVIDENCE_PACKET_CONTRACT_VERSION,
          knownCanonicalKeys: knownCanonicalKeys,
          candidatePackets: epWrapper.records,
          syntheticFixtureOnly: false,
          copyrightExcerptPolicy: { maxShortExcerptChars: 280 },
          currentSourceSnapshot: { bySourceIdentity: {} },
          lifecycleSnapshot: { links: [] },
          fieldReviewReferenceSnapshot: { decisions: [] }
        },
        epInput,
        {
          candidatePackets: epWrapper.records,
          knownCanonicalKeys: knownCanonicalKeys
        }
      )
    );
    if (!epReport.valid) {
      pushFinding(findings, {
        code: 'evidence_packet_validation_failed',
        severity: 'error',
        detail: 'validator_invalid',
        actual: epReport.summaryFingerprint
      });
    }

    // 11. Evidence Packet reference snapshots
    for (let i = 0; i < epWrapper.records.length; i++) {
      const snap = buildEvidencePacketReferenceSnapshot(epWrapper.records[i]);
      if (!snap.ok) {
        pushFinding(findings, {
          code: 'evidence_packet_validation_failed',
          severity: 'error',
          detail: 'reference_snapshot_failed',
          actual: snap.reasons
        });
      } else {
        epSnapshots.push(snap.snapshot);
      }
    }
  }

  // 12. Field Review Registry and Validator
  let frReport = null;
  let frSnapshot = null;
  if (frWrapper && Array.isArray(frWrapper.records)) {
    for (let i = 0; i < frWrapper.records.length; i++) {
      const r = asObject(frWrapper.records[i]) || {};
      const fp = buildFieldReviewValueFingerprint({
        canonicalKey: r.canonicalKey,
        field: r.field,
        reviewedClaimType: r.reviewedClaimType,
        reviewedValue: r.reviewedValue,
        sourceKind: r.sourceKind,
        sourceIds: r.sourceIds,
        evidenceRefs: r.evidenceRefs,
        contextScope: r.contextScope,
        reviewContractVersion: SR_FIELD_REVIEW_CONTRACT_VERSION
      });
      if (!fp.ok || fp.fingerprint !== normalizeTrim(r.valueFingerprint)) {
        pushFinding(findings, {
          code: 'fingerprint_mismatch',
          severity: 'error',
          detail: 'field_review_valueFingerprint',
          expected: fp.fingerprint,
          actual: r.valueFingerprint
        });
      }
    }

    const knownEvidenceRefs = epSnapshots.map(function (s) {
      return s.evidenceId;
    });
    const frInput = asObject(src.fieldReviewValidatorInput) || {};
    frReport = validateSmartRecDeveloperFieldReviewRegistry(
      Object.assign(
        {
          registry: getEmptySmartRecDeveloperFieldReviewRegistry(),
          registryDescriptor: getSmartRecDeveloperFieldReviewRegistryDescriptor(),
          registryVersion: SR_FIELD_REVIEW_REGISTRY_VERSION,
          reviewContractVersion: SR_FIELD_REVIEW_CONTRACT_VERSION,
          evidencePacketRegistryVersion: SR_EVIDENCE_PACKET_REGISTRY_VERSION,
          knownCanonicalKeys: knownCanonicalKeys,
          knownEvidenceRefs: knownEvidenceRefs,
          candidateRecords: frWrapper.records,
          evidencePacketSnapshots: { snapshots: epSnapshots },
          syntheticEvidencePacketSnapshots: epSnapshots,
          conflictSnapshot: { entries: [] }
        },
        frInput,
        {
          candidateRecords: frWrapper.records,
          knownCanonicalKeys: knownCanonicalKeys,
          evidencePacketSnapshots: { snapshots: epSnapshots },
          syntheticEvidencePacketSnapshots: epSnapshots,
          knownEvidenceRefs: knownEvidenceRefs
        }
      )
    );
    if (!frReport.valid) {
      pushFinding(findings, {
        code: 'field_review_validation_failed',
        severity: 'error',
        detail: 'validator_invalid',
        actual: frReport.summaryFingerprint
      });
    }

    // 13. Field Review reference snapshot
    if (frWrapper.records.length === 1) {
      const frSnap = buildFieldReviewReferenceSnapshot(
        frWrapper.records[0],
        SR_FIELD_REVIEW_CONTRACT_VERSION
      );
      if (!frSnap.ok) {
        pushFinding(findings, {
          code: 'field_review_validation_failed',
          severity: 'error',
          detail: 'reference_snapshot_failed',
          actual: frSnap.reasons
        });
      } else {
        frSnapshot = frSnap.snapshot;
      }
    }
  }

  // 14. Structured Climate Profile Registry and Validator
  let scpReport = null;
  if (scpWrapper && Array.isArray(scpWrapper.records)) {
    for (let i = 0; i < scpWrapper.records.length; i++) {
      const p = asObject(scpWrapper.records[i]) || {};
      const fp = buildStructuredClimateProfileFingerprint({
        profileContractVersion: p.profileContractVersion,
        canonicalKey: p.canonicalKey,
        field: p.field,
        profileStatus: p.profileStatus,
        reviewedClaimType: p.reviewedClaimType,
        reviewedValue: p.reviewedValue,
        contextScope: p.contextScope,
        outcomeApplicability: p.outcomeApplicability,
        fieldReviewReference: p.fieldReviewReference,
        evidenceRefs: p.evidenceRefs,
        unresolvedLimitations: p.unresolvedLimitations,
        supersedesProfileId: p.supersedesProfileId
      });
      if (!fp.ok || fp.fingerprint !== normalizeTrim(p.profileFingerprint)) {
        pushFinding(findings, {
          code: 'fingerprint_mismatch',
          severity: 'error',
          detail: 'profileFingerprint',
          expected: fp.fingerprint,
          actual: p.profileFingerprint
        });
      }
    }

    const frSnapshots = [];
    if (frSnapshot) {
      frSnapshots.push({
        fieldReviewContractVersion: SR_FIELD_REVIEW_CONTRACT_VERSION,
        fieldReviewRegistryVersion: SR_FIELD_REVIEW_REGISTRY_VERSION,
        canonicalKey: frSnapshot.canonicalKey,
        field: frSnapshot.field,
        reviewStatus: frSnapshot.reviewStatus,
        valueFingerprint: frSnapshot.valueFingerprint,
        reviewedClaimType: frSnapshot.reviewedClaimType,
        reviewedValue: frSnapshot.reviewedValue,
        contextScope: frSnapshot.contextScope,
        evidenceRefs: frSnapshot.evidenceRefs
      });
    } else if (frWrapper && frWrapper.records.length) {
      const r = asObject(frWrapper.records[0]) || {};
      frSnapshots.push({
        fieldReviewContractVersion: SR_FIELD_REVIEW_CONTRACT_VERSION,
        fieldReviewRegistryVersion: SR_FIELD_REVIEW_REGISTRY_VERSION,
        canonicalKey: r.canonicalKey,
        field: r.field,
        reviewStatus: r.reviewStatus,
        valueFingerprint: r.valueFingerprint,
        reviewedClaimType: r.reviewedClaimType,
        reviewedValue: r.reviewedValue,
        contextScope: r.contextScope,
        evidenceRefs: r.evidenceRefs
      });
    }

    const scpInput = asObject(src.structuredClimateProfileValidatorInput) || {};
    scpReport = validateSmartRecDeveloperStructuredClimateProfileRegistry(
      Object.assign(
        {
          profiles: scpWrapper.records,
          fieldReviewSnapshots: frSnapshots,
          evidencePacketSnapshots: epSnapshots
        },
        scpInput,
        {
          profiles: scpWrapper.records,
          fieldReviewSnapshots: frSnapshots,
          evidencePacketSnapshots: epSnapshots
        }
      )
    );
    if (!scpReport.valid) {
      pushFinding(findings, {
        code: 'structured_profile_validation_failed',
        severity: 'error',
        detail: 'validator_invalid',
        actual: scpReport.summaryFingerprint
      });
    }
  }

  // 15. Expected versus actual counts (also vs frozen lavender batch when declared)
  if (
    expectedCounts.evidencePackets !== 2 ||
    expectedCounts.fieldReviewRecords !== 1 ||
    expectedCounts.structuredClimateProfiles !== 1
  ) {
    // Only enforce frozen lavender counts when this is the lavender batch id.
    if (batchId === 'lavender-sun-preference-v1') {
      pushFinding(findings, {
        code: 'artifact_count_mismatch',
        severity: 'error',
        detail: 'lavender_expected_counts',
        expected: { evidencePackets: 2, fieldReviewRecords: 1, structuredClimateProfiles: 1 },
        actual: expectedCounts
      });
    }
  }

  // 17. Mutation detection
  const mutationDetected =
    stableSerialize(src.manifest) !== stableSerialize(manifestBefore) ||
    stableSerialize(src.evidencePacketWrapper || src.evidencePackets) !==
      stableSerialize(epBefore) ||
    stableSerialize(src.fieldReviewWrapper || src.fieldReviewRecords) !==
      stableSerialize(frBefore) ||
    stableSerialize(src.structuredClimateProfileWrapper || src.structuredClimateProfiles) !==
      stableSerialize(scpBefore);
  if (mutationDetected || src.mutationAttempt === true) {
    pushFinding(findings, {
      code: 'mutation_detected',
      severity: 'error',
      detail: src.mutationAttempt === true ? 'mutation_attempt_flag' : 'input_mutated'
    });
  }

  // 18. Product-isolation declaration
  const isolation = asObject(manifest.productIsolation) || {};
  let productIsolation = 'passed';
  if (
    isolation.importedByIndexHtml !== false ||
    isolation.productConsumer !== false ||
    isolation.runtimeEligibilityAuthority !== false ||
    isolation.automaticExecution !== false
  ) {
    productIsolation = 'failed';
    pushFinding(findings, {
      code: 'product_isolation_violation',
      severity: 'error',
      detail: 'manifest_productIsolation',
      actual: isolation
    });
  }
  if (src.forceProductConsumer === true || src.importedByIndexHtml === true) {
    productIsolation = 'failed';
    pushFinding(findings, {
      code: 'product_isolation_violation',
      severity: 'error',
      detail: 'input_product_consumer_flag'
    });
  }

  // Foundation defaults must remain zero on empty registries
  const epDesc = getSmartRecDeveloperEvidencePacketRegistryDescriptor();
  const frDesc = getSmartRecDeveloperFieldReviewRegistryDescriptor();
  const scpDesc = getSmartRecDeveloperStructuredClimateProfileRegistryDescriptor();
  if (
    epDesc.realPacketCount !== 0 ||
    frDesc.realRecordCount !== 0 ||
    scpDesc.realProfileCount !== 0
  ) {
    pushFinding(findings, {
      code: 'mutation_detected',
      severity: 'error',
      detail: 'foundation_default_count_nonzero',
      actual: {
        realPacketCount: epDesc.realPacketCount,
        realRecordCount: frDesc.realRecordCount,
        realProfileCount: scpDesc.realProfileCount
      }
    });
  }

  return finalize({
    findings: findings,
    loadedEvidencePacketCount: loadedEp,
    loadedFieldReviewRecordCount: loadedFr,
    loadedStructuredClimateProfileCount: loadedScp,
    batchId: batchId,
    productIsolation: productIsolation,
    mutationDetected: mutationDetected,
    evidencePacketReport: epReport,
    fieldReviewReport: frReport,
    structuredClimateProfileReport: scpReport
  });
}

function finalize(parts) {
  const findings = sortFindings(parts.findings || []);
  const counts = countFindings(findings);
  const valid = counts.errorCount === 0;
  const summaryFingerprint = buildSummaryFingerprint({
    valid: valid,
    loadedEvidencePacketCount: parts.loadedEvidencePacketCount,
    loadedFieldReviewRecordCount: parts.loadedFieldReviewRecordCount,
    loadedStructuredClimateProfileCount: parts.loadedStructuredClimateProfileCount,
    errorCount: counts.errorCount,
    warningCount: counts.warningCount,
    infoCount: counts.infoCount,
    findings: findings,
    productIsolation: parts.productIsolation,
    batchId: parts.batchId
  });

  return freezeDeep({
    valid: valid,
    validatorVersion: SR_REVIEWED_DATA_BATCH_VALIDATOR_VERSION,
    containerContractVersion: SR_REVIEWED_DATA_CONTAINER_CONTRACT_VERSION,
    capability: SR_REVIEWED_DATA_BATCH_VALIDATOR_CAPABILITY,
    batchId: parts.batchId,
    foundationDefaults: {
      realPacketCount: 0,
      realRecordCount: 0,
      realProfileCount: 0
    },
    loadedEvidencePacketCount: parts.loadedEvidencePacketCount || 0,
    loadedFieldReviewRecordCount: parts.loadedFieldReviewRecordCount || 0,
    loadedStructuredClimateProfileCount: parts.loadedStructuredClimateProfileCount || 0,
    errorCount: counts.errorCount,
    warningCount: counts.warningCount,
    infoCount: counts.infoCount,
    findings: findings,
    findingsByCode: freezeDeep(buildFindingsByCode(findings)),
    findingCount: findings.length,
    summaryFingerprint: summaryFingerprint,
    productIsolation: parts.productIsolation || 'failed',
    mutationDetected: parts.mutationDetected === true,
    evidencePacketReport: parts.evidencePacketReport || null,
    fieldReviewReport: parts.fieldReviewReport || null,
    structuredClimateProfileReport: parts.structuredClimateProfileReport || null
  });
}

// Re-export builders for harness convenience (no authority).
export {
  buildEvidencePacketSourceFingerprint,
  buildEvidencePacketContentFingerprint,
  buildFieldReviewValueFingerprint,
  buildStructuredClimateProfileFingerprint,
  hasError
};
