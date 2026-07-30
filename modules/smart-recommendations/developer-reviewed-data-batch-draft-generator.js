/**
 * Cruvit — Smart Recommendations developer reviewed-data Batch Draft Generator
 * ---------------------------------------------------------------------------
 * Deterministic, developer-only, no-network Stage-1 / Stage-2 draft automation.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, persistence, or writes.
 *  - Does not decide botanical truth or grant product / eligibility authority.
 *  - Does not mutate caller inputs or global Registries.
 *  - Does not commit, push, or deploy.
 */

import {
  SR_EVIDENCE_PACKET_CONTRACT_VERSION,
  SR_EVIDENCE_PACKET_REGISTRY_VERSION,
  buildEvidencePacketSourceFingerprint,
  buildEvidencePacketContentFingerprint,
  buildEvidencePacketReferenceSnapshot,
  validateAndBuildEvidencePacketRegistry,
  getEmptySmartRecDeveloperEvidencePacketRegistry,
  getSmartRecDeveloperEvidencePacketRegistryDescriptor
} from './developer-evidence-packet-registry.js';

import { validateSmartRecDeveloperEvidencePacketRegistry } from './developer-evidence-packet-validator.js';

import {
  SR_FIELD_REVIEW_CONTRACT_VERSION,
  SR_FIELD_REVIEW_REGISTRY_VERSION,
  SR_FIELD_REVIEW_STORED_STATUSES,
  buildFieldReviewValueFingerprint,
  buildFieldReviewReferenceSnapshot,
  validateAndBuildFieldReviewRegistry,
  getEmptySmartRecDeveloperFieldReviewRegistry,
  getSmartRecDeveloperFieldReviewRegistryDescriptor
} from './developer-field-review-registry.js';

import { validateSmartRecDeveloperFieldReviewRegistry } from './developer-field-review-validator.js';

import {
  SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
  SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_VERSION,
  buildStructuredClimateProfileFingerprint,
  validateAndBuildStructuredClimateProfileRegistry,
  getEmptySmartRecDeveloperStructuredClimateProfileRegistry,
  getSmartRecDeveloperStructuredClimateProfileRegistryDescriptor
} from './developer-structured-climate-profile-registry.js';

import { validateSmartRecDeveloperStructuredClimateProfileRegistry } from './developer-structured-climate-profile-validator.js';

import {
  SR_REVIEWED_DATA_CONTAINER_CONTRACT_VERSION,
  SR_REVIEWED_DATA_BATCH_VALIDATOR_VERSION,
  validateSmartRecDeveloperReviewedDataBatch
} from './developer-reviewed-data-batch-validator.js';

import {
  SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION,
  SR_REVIEWED_DATA_SOURCE_CAPTURE_FINDING_CODES,
  validateReviewedDataSourceCapturePacket,
  buildReviewedDataCaptureContentFingerprint,
  getSmartRecDeveloperReviewedDataSourceCaptureDescriptor
} from './developer-reviewed-data-source-capture-contract.js';

export const SR_REVIEWED_DATA_BATCH_DRAFT_GENERATOR_VERSION =
  '0.1.0-sr-reviewed-data-batch-draft-generator';

export const SR_REVIEWED_DATA_FIELD_REVIEW_GATE_C_VERSION =
  '0.1.0-sr-reviewed-data-field-review-gate-c';

export const SR_REVIEWED_DATA_BATCH_DRAFT_PREPARE_CAPABILITY =
  'explicit_developer_reviewed_data_batch_draft_prepare';

export const SR_REVIEWED_DATA_BATCH_DRAFT_FINALIZE_CAPABILITY =
  'explicit_developer_reviewed_data_batch_draft_finalize';

export const SR_REVIEWED_DATA_BATCH_DRAFT_WORKFLOW_STAGE1 =
  'field_review_approval_required';

export const SR_REVIEWED_DATA_BATCH_DRAFT_WORKFLOW_STAGE2 =
  'batch_ready_for_commit';

export const SR_REVIEWED_DATA_GATE_C_ALLOWED_STATUSES = Object.freeze([
  'reviewed_supported',
  'reviewed_conflicting',
  'remains_ineligible',
  'modeling_gap',
  'identity_ambiguous',
  'context_ambiguous',
  'preference_tolerance_ambiguous'
]);

export const SR_REVIEWED_DATA_GATE_C_KEYS = Object.freeze([
  'gateContractVersion',
  'batchId',
  'canonicalKey',
  'field',
  'proposedReviewStatus',
  'reviewedClaimType',
  'reviewedValue',
  'reason',
  'unresolvedLimitations',
  'approvalVersion',
  'approvedAt',
  'approverRole',
  'approved',
  'expectedPreparedDraftFingerprint'
]);

export const SR_REVIEWED_DATA_BATCH_DRAFT_FINDING_CODES = Object.freeze(
  SR_REVIEWED_DATA_SOURCE_CAPTURE_FINDING_CODES.slice()
);

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

const PREPARED_DRAFT_VERSION =
  '0.1.0-sr-reviewed-data-prepared-batch-draft';

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
    return (
      '{' +
      keys
        .map(function (k) {
          return JSON.stringify(k) + ':' + stableSerialize(value[k]);
        })
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(String(value));
}

function snapshotClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function pushFinding(findings, partial) {
  const code = partial && partial.code ? String(partial.code) : 'foundation_validation_failure';
  findings.push({
    code: code,
    severity: partial && partial.severity ? partial.severity : 'error',
    path: partial && partial.path != null ? partial.path : null,
    detail: partial && partial.detail != null ? partial.detail : null,
    expected: partial && partial.expected !== undefined ? partial.expected : null,
    actual: partial && partial.actual !== undefined ? partial.actual : null
  });
}

function sortFindings(findings) {
  return findings.slice().sort(function (a, b) {
    const ca = String(a.code || '');
    const cb = String(b.code || '');
    if (ca < cb) return -1;
    if (ca > cb) return 1;
    const pa = String(a.path || '');
    const pb = String(b.path || '');
    if (pa < pb) return -1;
    if (pa > pb) return 1;
    const da = String(a.detail || '');
    const db = String(b.detail || '');
    if (da < db) return -1;
    if (da > db) return 1;
    return 0;
  });
}

function countFindings(findings) {
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (let i = 0; i < findings.length; i++) {
    const s = findings[i].severity;
    if (s === 'warning') warningCount++;
    else if (s === 'info') infoCount++;
    else errorCount++;
  }
  return { errorCount: errorCount, warningCount: warningCount, infoCount: infoCount };
}

function isIsoDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
}

function sortUniqueStrings(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = Object.create(null);
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const s = normalizeTrim(arr[i]);
    if (!s || seen[s]) continue;
    seen[s] = true;
    out.push(s);
  }
  out.sort();
  return out;
}

function claimTokenForIds(reviewedClaimType) {
  return String(reviewedClaimType || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

function buildEvidenceId(canonicalKey, field, claimToken, sourceRole) {
  return (
    'ep-' +
    canonicalKey +
    '-' +
    field +
    '-' +
    claimToken +
    '-' +
    sourceRole +
    '-v1'
  );
}

function buildProfileId(canonicalKey, field, claimToken) {
  return 'scp-' + canonicalKey + '-' + field + '-' + claimToken + '-v1';
}

function authorityBoundary() {
  return freezeDeep({
    botanicalAuthority: false,
    productAuthority: false,
    runtimeEligibilityAuthority: false,
    schemaAuthority: false,
    gitCommitPermission: false,
    gitPushPermission: false,
    deployPermission: false,
    filesystemWrite: false,
    network: false,
    persistence: false
  });
}

function buildDescriptor() {
  return freezeDeep({
    generatorVersion: SR_REVIEWED_DATA_BATCH_DRAFT_GENERATOR_VERSION,
    gateCContractVersion: SR_REVIEWED_DATA_FIELD_REVIEW_GATE_C_VERSION,
    captureContractVersion: SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION,
    containerContractVersion: SR_REVIEWED_DATA_CONTAINER_CONTRACT_VERSION,
    capabilities: Object.freeze([
      SR_REVIEWED_DATA_BATCH_DRAFT_PREPARE_CAPABILITY,
      SR_REVIEWED_DATA_BATCH_DRAFT_FINALIZE_CAPABILITY
    ]),
    developerOnly: true,
    authoritative: false,
    productConsumer: false,
    runtimeEligibilityAuthority: false,
    network: false,
    externalApi: false,
    persistence: false,
    filesystemWrite: false,
    automaticExecution: false,
    activation: 'explicit_developer_call_only',
    gitCommit: false,
    gitPush: false,
    deploy: false,
    inputMutation: false,
    registryMutation: false,
    supportedPeerContractVersions: Object.freeze({
      sourceCaptureContract: SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION,
      gateCContract: SR_REVIEWED_DATA_FIELD_REVIEW_GATE_C_VERSION,
      containerContract: SR_REVIEWED_DATA_CONTAINER_CONTRACT_VERSION,
      evidencePacketContract: SR_EVIDENCE_PACKET_CONTRACT_VERSION,
      fieldReviewContract: SR_FIELD_REVIEW_CONTRACT_VERSION,
      fieldReviewRegistry: SR_FIELD_REVIEW_REGISTRY_VERSION,
      structuredClimateProfileContract: SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
      batchValidator: SR_REVIEWED_DATA_BATCH_VALIDATOR_VERSION
    })
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperReviewedDataBatchDraftGeneratorDescriptor() {
  return DESCRIPTOR;
}

function orderedContext(ctx) {
  const o = asObject(ctx) || {};
  const out = {
    setting: o.setting,
    planting: o.planting,
    maturity: o.maturity,
    objective: o.objective
  };
  if (o.daypart !== undefined) out.daypart = o.daypart;
  if (o.heatProtection !== undefined) out.heatProtection = o.heatProtection;
  return out;
}

function orderedCompactRef(ref) {
  return {
    evidenceId: ref.evidenceId,
    packetContractVersion: ref.packetContractVersion,
    expectedContentFingerprint: ref.expectedContentFingerprint
  };
}

function orderedEvidencePacket(p) {
  const out = {
    evidenceId: p.evidenceId,
    packetContractVersion: p.packetContractVersion,
    canonicalKey: p.canonicalKey,
    scientificIdentity: p.scientificIdentity,
    field: p.field,
    claimType: p.claimType,
    proposedValue: p.proposedValue,
    authorityTier: p.authorityTier,
    sourceType: p.sourceType,
    sourceTitle: p.sourceTitle,
    publisher: p.publisher,
    sourceReference: p.sourceReference,
    sourceIdentity: p.sourceIdentity,
    verifiedAt: p.verifiedAt,
    shortExcerpt: p.shortExcerpt,
    reviewerSummary: p.reviewerSummary,
    normalizedClaim: p.normalizedClaim,
    contextScope: orderedContext(p.contextScope),
    packetStatus: p.packetStatus,
    packetVersion: p.packetVersion,
    packetNeedsReview: p.packetNeedsReview,
    activeSupport: p.activeSupport,
    soleAuthority: p.soleAuthority,
    sourceFingerprint: p.sourceFingerprint,
    contentFingerprint: p.contentFingerprint
  };
  const optionals = [
    'publicationDate',
    'sourceUpdateDate',
    'author',
    'program',
    'daypart',
    'heatProtection',
    'climateOrRegion',
    'season',
    'limitations'
  ];
  for (let i = 0; i < optionals.length; i++) {
    const k = optionals[i];
    if (p[k] !== undefined) out[k] = p[k];
  }
  return out;
}

function orderedFieldReview(r) {
  return {
    canonicalKey: r.canonicalKey,
    field: r.field,
    reviewStatus: r.reviewStatus,
    reviewedClaimType: r.reviewedClaimType,
    reviewedValue: r.reviewedValue,
    contextScope: orderedContext(r.contextScope),
    reviewContractVersion: r.reviewContractVersion,
    evidenceRefs: (r.evidenceRefs || []).map(orderedCompactRef),
    sourceKind: r.sourceKind,
    sourceIds: (r.sourceIds || []).slice(),
    reviewVersion: r.reviewVersion,
    reviewedAt: r.reviewedAt,
    reason: r.reason,
    unresolvedLimitations: (r.unresolvedLimitations || []).slice(),
    valueFingerprint: r.valueFingerprint
  };
}

function orderedProfile(p) {
  const out = {
    profileId: p.profileId,
    profileContractVersion: p.profileContractVersion,
    canonicalKey: p.canonicalKey,
    field: p.field,
    profileStatus: p.profileStatus,
    reviewedClaimType: p.reviewedClaimType,
    reviewedValue: p.reviewedValue,
    contextScope: orderedContext(p.contextScope),
    fieldReviewReference: {
      fieldReviewContractVersion: p.fieldReviewReference.fieldReviewContractVersion,
      fieldReviewRegistryVersion: p.fieldReviewReference.fieldReviewRegistryVersion,
      canonicalKey: p.fieldReviewReference.canonicalKey,
      field: p.fieldReviewReference.field,
      reviewStatus: p.fieldReviewReference.reviewStatus,
      valueFingerprint: p.fieldReviewReference.valueFingerprint,
      reviewedClaimType: p.fieldReviewReference.reviewedClaimType,
      reviewedValue: p.fieldReviewReference.reviewedValue
    },
    evidenceRefs: (p.evidenceRefs || []).map(orderedCompactRef),
    unresolvedLimitations: (p.unresolvedLimitations || []).slice(),
    profileFingerprint: p.profileFingerprint
  };
  if (p.outcomeApplicability !== undefined) {
    out.outcomeApplicability = p.outcomeApplicability;
  }
  if (p.supersedesProfileId !== undefined) {
    out.supersedesProfileId = p.supersedesProfileId;
  }
  return out;
}

function orderedManifest(m) {
  return {
    containerContractVersion: m.containerContractVersion,
    batchId: m.batchId,
    canonicalKey: m.canonicalKey,
    acceptedScientificName: m.acceptedScientificName,
    field: m.field,
    reviewedClaimType: m.reviewedClaimType,
    researchHypothesis: m.researchHypothesis,
    contextScope: orderedContext(m.contextScope),
    artifactFiles: {
      evidencePackets: ARTIFACT_FILES.evidencePackets,
      fieldReviewRecords: ARTIFACT_FILES.fieldReviewRecords,
      structuredClimateProfiles: ARTIFACT_FILES.structuredClimateProfiles
    },
    expectedArtifactCounts: {
      evidencePackets: 2,
      fieldReviewRecords: 1,
      structuredClimateProfiles: 1
    },
    requiredContractVersions: {
      containerContractVersion: SR_REVIEWED_DATA_CONTAINER_CONTRACT_VERSION,
      evidencePacketContractVersion: SR_EVIDENCE_PACKET_CONTRACT_VERSION,
      fieldReviewContractVersion: SR_FIELD_REVIEW_CONTRACT_VERSION,
      fieldReviewRegistryVersion: SR_FIELD_REVIEW_REGISTRY_VERSION,
      structuredClimateProfileContractVersion: SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION
    },
    productIsolation: {
      importedByIndexHtml: false,
      productConsumer: false,
      runtimeEligibilityAuthority: false,
      automaticExecution: false
    },
    batchStatus: m.batchStatus,
    unresolvedLimitations: (m.unresolvedLimitations || []).slice()
  };
}

function orderedWrapper(batchId, artifactType, artifactContractVersion, records) {
  return {
    containerContractVersion: SR_REVIEWED_DATA_CONTAINER_CONTRACT_VERSION,
    batchId: batchId,
    artifactType: artifactType,
    artifactContractVersion: artifactContractVersion,
    records: records
  };
}

function canonicalJsonText(obj) {
  return JSON.stringify(obj, null, 2).replace(/\r\n/g, '\n') + '\n';
}

function digestText(text) {
  // Deterministic non-cryptographic digest for summary binding only.
  let h = 5381;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0;
  }
  return s.length + ':' + h.toString(16);
}

function buildSummaryFingerprint(parts) {
  return (
    SR_REVIEWED_DATA_BATCH_DRAFT_GENERATOR_VERSION + '|' + stableSerialize(parts)
  );
}

function buildPreparedDraftFingerprint(body) {
  return PREPARED_DRAFT_VERSION + '|' + stableSerialize(body);
}

function aggregateLimitations(sources) {
  const all = [];
  for (let i = 0; i < sources.length; i++) {
    const lim = sources[i].limitations || [];
    for (let j = 0; j < lim.length; j++) all.push(lim[j]);
  }
  return sortUniqueStrings(all);
}

function proposedReasonFromSources(sources) {
  const parts = [];
  for (let i = 0; i < sources.length; i++) {
    parts.push(sources[i].reviewerSummary);
  }
  return parts.join(' ');
}

function applyOptionFlags(findings, options) {
  const opts = asObject(options) || {};
  if (opts.networkAttempt === true) {
    pushFinding(findings, { code: 'external_network_attempt' });
  }
  if (opts.persistenceAttempt === true) {
    pushFinding(findings, { code: 'persistence_attempt' });
  }
  if (opts.filesystemWriteAttempt === true) {
    pushFinding(findings, { code: 'persistence_attempt', detail: 'filesystem_write_attempt' });
  }
  if (opts.automaticExecutionAttempt === true) {
    pushFinding(findings, { code: 'automatic_execution_attempt' });
  }
  if (opts.productAuthorityAttempt === true) {
    pushFinding(findings, { code: 'product_authority_attempt' });
  }
}

function failReport(partial) {
  const findings = sortFindings(partial.findings || []);
  const counts = countFindings(findings);
  return freezeDeep(
    Object.assign(
      {
        ok: false,
        valid: false,
        descriptor: DESCRIPTOR,
        workflowState: partial.workflowState || null,
        findings: findings,
        warnings: findings.filter(function (f) {
          return f.severity === 'warning';
        }),
        errorCount: counts.errorCount,
        warningCount: counts.warningCount,
        infoCount: counts.infoCount,
        authorityBoundary: authorityBoundary(),
        summaryFingerprint: buildSummaryFingerprint({
          workflowState: partial.workflowState || null,
          findings: findings,
          errorCount: counts.errorCount
        })
      },
      partial
    )
  );
}

/**
 * Stage 1 — prepare non-authoritative draft; stop at Gate C.
 */
export function prepareReviewedDataBatchDraft(capturePacket, options) {
  const findings = [];
  const before = stableSerialize(capturePacket);
  applyOptionFlags(findings, options);

  const captureValidation = validateReviewedDataSourceCapturePacket(capturePacket, options);
  for (let i = 0; i < (captureValidation.findings || []).length; i++) {
    findings.push(captureValidation.findings[i]);
  }

  if (!captureValidation.valid || !captureValidation.normalized) {
    const afterEarly = stableSerialize(capturePacket);
    if (before !== afterEarly) {
      pushFinding(findings, { code: 'mutation_detected', detail: 'input_mutated' });
    }
    return failReport({
      workflowState: null,
      findings: findings,
      captureValidation: captureValidation,
      captureContentFingerprint: captureValidation.captureContentFingerprint || null,
      mutationCheck: freezeDeep({
        inputUnchanged: before === afterEarly,
        registryUnchanged: true
      })
    });
  }

  const normalized = captureValidation.normalized;
  const contentBody = captureValidation.contentBody;
  const captureContentFingerprint = captureValidation.captureContentFingerprint;
  const claimToken = claimTokenForIds(normalized.reviewedClaimType);
  const sources = contentBody.sources.slice();

  const generatedIds = {
    evidenceIds: [],
    profileId: buildProfileId(
      normalized.canonicalKey,
      normalized.field,
      claimToken
    ),
    fieldReviewIdentity: {
      canonicalKey: normalized.canonicalKey,
      field: normalized.field
    }
  };

  const idSeen = Object.create(null);
  const evidencePackets = [];

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const evidenceId = buildEvidenceId(
      normalized.canonicalKey,
      normalized.field,
      claimToken,
      s.sourceRole
    );
    if (idSeen[evidenceId]) {
      pushFinding(findings, {
        code: 'deterministic_id_collision',
        detail: 'duplicate_evidenceId',
        actual: evidenceId
      });
    }
    idSeen[evidenceId] = true;
    generatedIds.evidenceIds.push(evidenceId);

    const srcFp = buildEvidencePacketSourceFingerprint({
      sourceType: s.sourceType,
      sourceTitle: s.sourceTitle,
      publisher: s.publisher,
      sourceReference: s.sourceReference,
      sourceIdentity: s.sourceIdentity
    });
    if (!srcFp.ok) {
      pushFinding(findings, {
        code: 'fingerprint_failure',
        detail: 'evidence_source_fingerprint_failed',
        actual: srcFp.reasons
      });
    }

    const packetDraft = {
      evidenceId: evidenceId,
      packetContractVersion: SR_EVIDENCE_PACKET_CONTRACT_VERSION,
      canonicalKey: normalized.canonicalKey,
      scientificIdentity: normalized.acceptedScientificName,
      field: normalized.field,
      claimType: normalized.reviewedClaimType,
      proposedValue: normalized.proposedValue,
      authorityTier: s.authorityTier,
      sourceType: s.sourceType,
      sourceTitle: s.sourceTitle,
      publisher: s.publisher,
      sourceReference: s.sourceReference,
      sourceIdentity: s.sourceIdentity,
      verifiedAt: s.verifiedAt,
      shortExcerpt: s.shortExcerpt,
      reviewerSummary: s.reviewerSummary,
      normalizedClaim: s.normalizedClaim,
      contextScope: orderedContext(normalized.contextScope),
      packetStatus: 'collected',
      packetVersion: '1',
      packetNeedsReview: false,
      activeSupport: s.activeSupport === true,
      soleAuthority: false
    };

    const optionals = [
      'publicationDate',
      'sourceUpdateDate',
      'author',
      'program',
      'daypart',
      'heatProtection',
      'climateOrRegion',
      'season'
    ];
    for (let o = 0; o < optionals.length; o++) {
      if (s[optionals[o]] !== undefined) packetDraft[optionals[o]] = s[optionals[o]];
    }

    const contentFp = buildEvidencePacketContentFingerprint({
      evidenceId: packetDraft.evidenceId,
      canonicalKey: packetDraft.canonicalKey,
      field: packetDraft.field,
      normalizedClaim: packetDraft.normalizedClaim,
      proposedValue: packetDraft.proposedValue,
      authorityTier: packetDraft.authorityTier,
      sourceReference: packetDraft.sourceReference,
      sourceIdentity: packetDraft.sourceIdentity,
      claimType: packetDraft.claimType,
      packetContractVersion: packetDraft.packetContractVersion,
      contextScope: packetDraft.contextScope
    });
    if (!contentFp.ok) {
      pushFinding(findings, {
        code: 'fingerprint_failure',
        detail: 'evidence_content_fingerprint_failed',
        actual: contentFp.reasons
      });
    }

    packetDraft.sourceFingerprint = srcFp.ok ? srcFp.fingerprint : null;
    packetDraft.contentFingerprint = contentFp.ok ? contentFp.fingerprint : null;
    evidencePackets.push(packetDraft);
  }

  generatedIds.evidenceIds.sort();
  if (idSeen[generatedIds.profileId]) {
    pushFinding(findings, {
      code: 'deterministic_id_collision',
      detail: 'profileId_collides_with_evidenceId',
      actual: generatedIds.profileId
    });
  }

  const emptyEpBefore = stableSerialize(getEmptySmartRecDeveloperEvidencePacketRegistry());
  const epRegistryBuild = validateAndBuildEvidencePacketRegistry(evidencePackets, {
    knownCanonicalKeys: [normalized.canonicalKey],
    packetContractVersion: SR_EVIDENCE_PACKET_CONTRACT_VERSION,
    registryVersion: SR_EVIDENCE_PACKET_REGISTRY_VERSION,
    syntheticFixtureOnly: true
  });
  if (!epRegistryBuild.valid) {
    pushFinding(findings, {
      code: 'foundation_validation_failure',
      detail: 'evidence_packet_registry_build_failed',
      actual: epRegistryBuild.summaryFingerprint || epRegistryBuild.findings
    });
  }

  const epValidatorReport = validateSmartRecDeveloperEvidencePacketRegistry({
    registry: getEmptySmartRecDeveloperEvidencePacketRegistry(),
    registryDescriptor: getSmartRecDeveloperEvidencePacketRegistryDescriptor(),
    registryVersion: SR_EVIDENCE_PACKET_REGISTRY_VERSION,
    packetContractVersion: SR_EVIDENCE_PACKET_CONTRACT_VERSION,
    candidatePackets: evidencePackets,
    knownCanonicalKeys: [normalized.canonicalKey],
    syntheticFixtureOnly: true
  });
  if (!epValidatorReport.valid) {
    pushFinding(findings, {
      code: 'foundation_validation_failure',
      detail: 'evidence_packet_validator_failed',
      actual: epValidatorReport.summaryFingerprint
    });
  }

  const emptyEpAfter = stableSerialize(getEmptySmartRecDeveloperEvidencePacketRegistry());
  if (emptyEpBefore !== emptyEpAfter) {
    pushFinding(findings, {
      code: 'mutation_detected',
      detail: 'empty_evidence_registry_mutated'
    });
  }

  const frozenPackets = evidencePackets.map(function (p) {
    return freezeDeep(orderedEvidencePacket(p));
  });

  const compactRefs = frozenPackets
    .map(function (p) {
      return orderedCompactRef({
        evidenceId: p.evidenceId,
        packetContractVersion: p.packetContractVersion,
        expectedContentFingerprint: p.contentFingerprint
      });
    })
    .sort(function (a, b) {
      if (a.evidenceId < b.evidenceId) return -1;
      if (a.evidenceId > b.evidenceId) return 1;
      return 0;
    });

  const sourceIds = compactRefs.map(function (r) {
    return r.evidenceId;
  });

  const unresolvedLimitations = aggregateLimitations(sources);
  const proposedReason = proposedReasonFromSources(sources);

  const fieldReviewDraft = freezeDeep({
    draftKind: 'field_review_draft_pending_gate_c',
    approvalRequired: true,
    canonicalKey: normalized.canonicalKey,
    field: normalized.field,
    proposedReviewedClaimType: normalized.reviewedClaimType,
    proposedReviewedValue: normalized.proposedValue,
    contextScope: orderedContext(normalized.contextScope),
    evidenceRefs: compactRefs,
    sourceKind: 'evidence_derived_override',
    sourceIds: sourceIds,
    reviewVersion: '1',
    proposedReason: proposedReason,
    proposedUnresolvedLimitations: unresolvedLimitations,
    reviewStatus: null,
    reviewedAt: null,
    valueFingerprint: null,
    reviewed_supported: false
  });

  const draftManifest = freezeDeep(
    orderedManifest({
      containerContractVersion: SR_REVIEWED_DATA_CONTAINER_CONTRACT_VERSION,
      batchId: normalized.batchId,
      canonicalKey: normalized.canonicalKey,
      acceptedScientificName: normalized.acceptedScientificName,
      field: normalized.field,
      reviewedClaimType: normalized.reviewedClaimType,
      researchHypothesis: normalized.proposedValue,
      contextScope: normalized.contextScope,
      batchStatus: 'developer_reviewed_data_pending_product',
      unresolvedLimitations: unresolvedLimitations
    })
  );

  const draftEvidenceWrapper = freezeDeep(
    orderedWrapper(
      normalized.batchId,
      ARTIFACT_TYPES.evidencePackets,
      SR_EVIDENCE_PACKET_CONTRACT_VERSION,
      frozenPackets
    )
  );

  const draftFieldReviewWrapper = freezeDeep(
    orderedWrapper(
      normalized.batchId,
      ARTIFACT_TYPES.fieldReviewRecords,
      SR_FIELD_REVIEW_CONTRACT_VERSION,
      []
    )
  );

  const draftProfileWrapper = freezeDeep(
    orderedWrapper(
      normalized.batchId,
      ARTIFACT_TYPES.structuredClimateProfiles,
      SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
      []
    )
  );

  const preparedBody = {
    preparedDraftVersion: PREPARED_DRAFT_VERSION,
    generatorVersion: SR_REVIEWED_DATA_BATCH_DRAFT_GENERATOR_VERSION,
    captureContentFingerprint: captureContentFingerprint,
    batchId: normalized.batchId,
    canonicalKey: normalized.canonicalKey,
    acceptedScientificName: normalized.acceptedScientificName,
    field: normalized.field,
    reviewedClaimType: normalized.reviewedClaimType,
    proposedValue: normalized.proposedValue,
    contextScope: orderedContext(normalized.contextScope),
    expectedArtifactCounts: {
      evidencePackets: 2,
      fieldReviewRecords: 1,
      structuredClimateProfiles: 1
    },
    generatedIds: generatedIds,
    evidencePackets: frozenPackets.map(function (p) {
      return orderedEvidencePacket(p);
    }),
    evidenceContentFingerprints: frozenPackets.map(function (p) {
      return p.contentFingerprint;
    }),
    compactEvidenceRefs: compactRefs,
    fieldReviewDraft: {
      canonicalKey: fieldReviewDraft.canonicalKey,
      field: fieldReviewDraft.field,
      proposedReviewedClaimType: fieldReviewDraft.proposedReviewedClaimType,
      proposedReviewedValue: fieldReviewDraft.proposedReviewedValue,
      contextScope: fieldReviewDraft.contextScope,
      evidenceRefs: fieldReviewDraft.evidenceRefs,
      sourceKind: fieldReviewDraft.sourceKind,
      sourceIds: fieldReviewDraft.sourceIds,
      reviewVersion: fieldReviewDraft.reviewVersion,
      proposedReason: fieldReviewDraft.proposedReason,
      proposedUnresolvedLimitations: fieldReviewDraft.proposedUnresolvedLimitations,
      approvalRequired: true
    },
    draftManifest: orderedManifest(draftManifest),
    draftWrappers: {
      evidencePackets: orderedWrapper(
        normalized.batchId,
        ARTIFACT_TYPES.evidencePackets,
        SR_EVIDENCE_PACKET_CONTRACT_VERSION,
        frozenPackets.map(function (p) {
          return orderedEvidencePacket(p);
        })
      ),
      fieldReviewRecords: orderedWrapper(
        normalized.batchId,
        ARTIFACT_TYPES.fieldReviewRecords,
        SR_FIELD_REVIEW_CONTRACT_VERSION,
        []
      ),
      structuredClimateProfiles: orderedWrapper(
        normalized.batchId,
        ARTIFACT_TYPES.structuredClimateProfiles,
        SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
        []
      )
    }
  };

  const preparedDraftFingerprint = buildPreparedDraftFingerprint(preparedBody);

  const after = stableSerialize(capturePacket);
  if (before !== after) {
    pushFinding(findings, { code: 'mutation_detected', detail: 'input_mutated' });
  }

  const sorted = sortFindings(findings);
  const counts = countFindings(sorted);
  const ok = counts.errorCount === 0;

  const preparedDraft = ok
    ? freezeDeep(
        Object.assign({}, preparedBody, {
          preparedDraftFingerprint: preparedDraftFingerprint,
          captureSnapshot: freezeDeep(snapshotClone(contentBody)),
          humanApproval: normalized.humanApproval,
          fieldReviewDraft: fieldReviewDraft,
          draftBatchManifest: draftManifest,
          draftEvidencePacketWrapper: draftEvidenceWrapper,
          draftFieldReviewWrapper: draftFieldReviewWrapper,
          draftStructuredClimateProfileWrapper: draftProfileWrapper
        })
      )
    : null;

  return freezeDeep({
    ok: ok,
    valid: ok,
    descriptor: DESCRIPTOR,
    workflowState: ok ? SR_REVIEWED_DATA_BATCH_DRAFT_WORKFLOW_STAGE1 : null,
    captureSnapshot: freezeDeep(snapshotClone(contentBody)),
    captureValidation: captureValidation,
    captureContentFingerprint: captureContentFingerprint,
    preparedDraft: preparedDraft,
    preparedDraftFingerprint: ok ? preparedDraftFingerprint : null,
    generatedIds: freezeDeep(generatedIds),
    evidencePackets: freezeDeep(frozenPackets),
    evidenceValidation: freezeDeep({
      registryBuildValid: epRegistryBuild.valid === true,
      registryBuildSummaryFingerprint: epRegistryBuild.summaryFingerprint || null,
      validatorValid: epValidatorReport.valid === true,
      validatorSummaryFingerprint: epValidatorReport.summaryFingerprint || null
    }),
    fieldReviewDraft: fieldReviewDraft,
    fieldReviewApprovalRequired: true,
    draftBatchManifest: draftManifest,
    draftWrappers: freezeDeep({
      evidencePackets: draftEvidenceWrapper,
      fieldReviewRecords: draftFieldReviewWrapper,
      structuredClimateProfiles: draftProfileWrapper
    }),
    findings: sorted,
    warnings: sorted.filter(function (f) {
      return f.severity === 'warning';
    }),
    errorCount: counts.errorCount,
    warningCount: counts.warningCount,
    infoCount: counts.infoCount,
    summaryFingerprint: buildSummaryFingerprint({
      stage: 'prepare',
      workflowState: ok ? SR_REVIEWED_DATA_BATCH_DRAFT_WORKFLOW_STAGE1 : null,
      captureContentFingerprint: captureContentFingerprint,
      preparedDraftFingerprint: ok ? preparedDraftFingerprint : null,
      findings: sorted,
      errorCount: counts.errorCount
    }),
    authorityBoundary: authorityBoundary(),
    mutationCheck: freezeDeep({
      inputUnchanged: before === after,
      registryUnchanged: emptyEpBefore === emptyEpAfter
    }),
    captureDescriptor: getSmartRecDeveloperReviewedDataSourceCaptureDescriptor()
  });
}

function validateGateCApproval(approval, preparedDraft, findings) {
  const a = asObject(approval);
  if (!a) {
    pushFinding(findings, {
      code: 'missing_human_approval',
      detail: 'gate_c_approval_required'
    });
    return null;
  }

  const keys = Object.keys(a);
  for (let i = 0; i < keys.length; i++) {
    if (SR_REVIEWED_DATA_GATE_C_KEYS.indexOf(keys[i]) < 0) {
      pushFinding(findings, {
        code: 'invalid_approval_gate',
        path: 'fieldReviewApproval.' + keys[i],
        detail: 'unknown_gate_c_key'
      });
    }
  }

  if (normalizeTrim(a.gateContractVersion) !== SR_REVIEWED_DATA_FIELD_REVIEW_GATE_C_VERSION) {
    pushFinding(findings, {
      code: 'unsupported_contract_version',
      detail: 'gate_c_contract_version',
      expected: SR_REVIEWED_DATA_FIELD_REVIEW_GATE_C_VERSION,
      actual: a.gateContractVersion
    });
  }

  if (a.approved !== true) {
    pushFinding(findings, {
      code: 'missing_human_approval',
      detail: 'gate_c_approved_must_be_true'
    });
  }

  if (!normalizeTrim(a.approvalVersion)) {
    pushFinding(findings, {
      code: 'missing_human_approval',
      path: 'fieldReviewApproval.approvalVersion'
    });
  }
  if (!isIsoDate(a.approvedAt)) {
    pushFinding(findings, {
      code: 'missing_human_approval',
      path: 'fieldReviewApproval.approvedAt',
      detail: 'iso_date_required'
    });
  }
  if (!normalizeTrim(a.approverRole)) {
    pushFinding(findings, {
      code: 'missing_human_approval',
      path: 'fieldReviewApproval.approverRole'
    });
  }

  if (normalizeTrim(a.batchId) !== normalizeTrim(preparedDraft.batchId)) {
    pushFinding(findings, {
      code: 'invalid_approval_gate',
      detail: 'gate_c_batchId_mismatch',
      expected: preparedDraft.batchId,
      actual: a.batchId
    });
  }
  if (normalizeKey(a.canonicalKey) !== normalizeKey(preparedDraft.canonicalKey)) {
    pushFinding(findings, {
      code: 'invalid_approval_gate',
      detail: 'gate_c_canonicalKey_mismatch',
      expected: preparedDraft.canonicalKey,
      actual: a.canonicalKey
    });
  }
  if (normalizeTrim(a.field) !== normalizeTrim(preparedDraft.field)) {
    pushFinding(findings, {
      code: 'invalid_approval_gate',
      detail: 'gate_c_field_mismatch',
      expected: preparedDraft.field,
      actual: a.field
    });
  }

  const status = normalizeTrim(a.proposedReviewStatus);
  if (!status || SR_REVIEWED_DATA_GATE_C_ALLOWED_STATUSES.indexOf(status) < 0) {
    pushFinding(findings, {
      code: 'unsupported_workflow_transition',
      detail: 'unsupported_final_fr_status',
      actual: a.proposedReviewStatus,
      expected: SR_REVIEWED_DATA_GATE_C_ALLOWED_STATUSES.slice()
    });
  }
  if (status === 'evidence_collected') {
    pushFinding(findings, {
      code: 'unsupported_workflow_transition',
      detail: 'evidence_collected_not_allowed_as_gate_c'
    });
  }
  if (status && SR_FIELD_REVIEW_STORED_STATUSES.indexOf(status) < 0) {
    pushFinding(findings, {
      code: 'unsupported_workflow_transition',
      detail: 'status_not_storable',
      actual: status
    });
  }

  const reviewedClaimType = normalizeTrim(a.reviewedClaimType);
  const reviewedValue = normalizeTrim(a.reviewedValue);
  if (reviewedClaimType !== normalizeTrim(preparedDraft.reviewedClaimType)) {
    pushFinding(findings, {
      code: 'invalid_approval_gate',
      detail: 'gate_c_reviewedClaimType_mismatch',
      expected: preparedDraft.reviewedClaimType,
      actual: a.reviewedClaimType
    });
  }
  if (reviewedValue !== normalizeTrim(preparedDraft.proposedValue)) {
    pushFinding(findings, {
      code: 'invalid_approval_gate',
      detail: 'gate_c_reviewedValue_must_match_evaluated_hypothesis',
      expected: preparedDraft.proposedValue,
      actual: a.reviewedValue
    });
  }

  if (!normalizeTrim(a.reason)) {
    pushFinding(findings, {
      code: 'foundation_validation_failure',
      detail: 'gate_c_reason_required'
    });
  }

  const limitations = sortUniqueStrings(a.unresolvedLimitations);
  if (!Array.isArray(a.unresolvedLimitations)) {
    pushFinding(findings, {
      code: 'limitation_missing',
      detail: 'gate_c_unresolvedLimitations_required'
    });
  }

  const expectedFp = normalizeTrim(a.expectedPreparedDraftFingerprint);
  if (!expectedFp) {
    pushFinding(findings, {
      code: 'prepared_draft_fingerprint_mismatch',
      detail: 'expectedPreparedDraftFingerprint_required'
    });
  } else if (expectedFp !== preparedDraft.preparedDraftFingerprint) {
    pushFinding(findings, {
      code: 'stale_field_review_approval',
      detail: 'expectedPreparedDraftFingerprint_mismatch',
      expected: preparedDraft.preparedDraftFingerprint,
      actual: expectedFp
    });
    pushFinding(findings, {
      code: 'prepared_draft_fingerprint_mismatch',
      expected: preparedDraft.preparedDraftFingerprint,
      actual: expectedFp
    });
  }

  return {
    gateContractVersion: SR_REVIEWED_DATA_FIELD_REVIEW_GATE_C_VERSION,
    batchId: normalizeTrim(a.batchId),
    canonicalKey: normalizeKey(a.canonicalKey),
    field: normalizeTrim(a.field),
    proposedReviewStatus: status,
    reviewedClaimType: reviewedClaimType,
    reviewedValue: reviewedValue,
    reason: normalizeTrim(a.reason),
    unresolvedLimitations: limitations,
    approvalVersion: normalizeTrim(a.approvalVersion),
    approvedAt: normalizeTrim(a.approvedAt),
    approverRole: normalizeTrim(a.approverRole),
    approved: a.approved === true,
    expectedPreparedDraftFingerprint: expectedFp
  };
}

function rebuildPreparedFingerprint(preparedDraft) {
  const body = {
    preparedDraftVersion: preparedDraft.preparedDraftVersion,
    generatorVersion: preparedDraft.generatorVersion,
    captureContentFingerprint: preparedDraft.captureContentFingerprint,
    batchId: preparedDraft.batchId,
    canonicalKey: preparedDraft.canonicalKey,
    acceptedScientificName: preparedDraft.acceptedScientificName,
    field: preparedDraft.field,
    reviewedClaimType: preparedDraft.reviewedClaimType,
    proposedValue: preparedDraft.proposedValue,
    contextScope: orderedContext(preparedDraft.contextScope),
    expectedArtifactCounts: preparedDraft.expectedArtifactCounts,
    generatedIds: preparedDraft.generatedIds,
    evidencePackets: (preparedDraft.evidencePackets || []).map(orderedEvidencePacket),
    evidenceContentFingerprints: preparedDraft.evidenceContentFingerprints,
    compactEvidenceRefs: (preparedDraft.compactEvidenceRefs || []).map(orderedCompactRef),
    fieldReviewDraft: {
      canonicalKey: preparedDraft.fieldReviewDraft.canonicalKey,
      field: preparedDraft.fieldReviewDraft.field,
      proposedReviewedClaimType: preparedDraft.fieldReviewDraft.proposedReviewedClaimType,
      proposedReviewedValue: preparedDraft.fieldReviewDraft.proposedReviewedValue,
      contextScope: preparedDraft.fieldReviewDraft.contextScope,
      evidenceRefs: preparedDraft.fieldReviewDraft.evidenceRefs,
      sourceKind: preparedDraft.fieldReviewDraft.sourceKind,
      sourceIds: preparedDraft.fieldReviewDraft.sourceIds,
      reviewVersion: preparedDraft.fieldReviewDraft.reviewVersion,
      proposedReason: preparedDraft.fieldReviewDraft.proposedReason,
      proposedUnresolvedLimitations:
        preparedDraft.fieldReviewDraft.proposedUnresolvedLimitations,
      approvalRequired: true
    },
    draftManifest: orderedManifest(preparedDraft.draftManifest || preparedDraft.draftBatchManifest),
    draftWrappers: {
      evidencePackets: orderedWrapper(
        preparedDraft.batchId,
        ARTIFACT_TYPES.evidencePackets,
        SR_EVIDENCE_PACKET_CONTRACT_VERSION,
        (preparedDraft.evidencePackets || []).map(orderedEvidencePacket)
      ),
      fieldReviewRecords: orderedWrapper(
        preparedDraft.batchId,
        ARTIFACT_TYPES.fieldReviewRecords,
        SR_FIELD_REVIEW_CONTRACT_VERSION,
        []
      ),
      structuredClimateProfiles: orderedWrapper(
        preparedDraft.batchId,
        ARTIFACT_TYPES.structuredClimateProfiles,
        SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
        []
      )
    }
  };
  return buildPreparedDraftFingerprint(body);
}

/**
 * Stage 2 — finalize after explicit Gate C approval bound to prepared draft.
 */
export function finalizeReviewedDataBatchDraft(preparedDraft, fieldReviewApproval, options) {
  const findings = [];
  const beforeDraft = stableSerialize(preparedDraft);
  const beforeApproval = stableSerialize(fieldReviewApproval);
  applyOptionFlags(findings, options);

  const draft = asObject(preparedDraft);
  if (
    !draft ||
    normalizeTrim(draft.preparedDraftVersion) !== PREPARED_DRAFT_VERSION ||
    !draft.preparedDraftFingerprint ||
    !Array.isArray(draft.evidencePackets) ||
    draft.evidencePackets.length !== 2
  ) {
    pushFinding(findings, {
      code: 'unsupported_workflow_transition',
      detail: 'stage2_requires_valid_stage1_prepared_draft'
    });
    return failReport({
      workflowState: null,
      findings: findings,
      mutationCheck: freezeDeep({
        inputUnchanged: true,
        registryUnchanged: true
      })
    });
  }

  let liveFp = null;
  try {
    liveFp = rebuildPreparedFingerprint(draft);
  } catch (e) {
    pushFinding(findings, {
      code: 'fingerprint_failure',
      detail: 'prepared_draft_rebuild_failed'
    });
  }
  if (liveFp && liveFp !== draft.preparedDraftFingerprint) {
    pushFinding(findings, {
      code: 'prepared_draft_fingerprint_mismatch',
      detail: 'prepared_draft_mutated_after_stage1',
      expected: draft.preparedDraftFingerprint,
      actual: liveFp
    });
  }

  const gate = validateGateCApproval(fieldReviewApproval, draft, findings);
  const countsEarly = countFindings(sortFindings(findings));
  if (countsEarly.errorCount > 0 || !gate) {
    const afterDraft = stableSerialize(preparedDraft);
    const afterApproval = stableSerialize(fieldReviewApproval);
    if (beforeDraft !== afterDraft || beforeApproval !== afterApproval) {
      pushFinding(findings, { code: 'mutation_detected', detail: 'input_mutated' });
    }
    return failReport({
      workflowState: null,
      preparedDraftFingerprint: draft.preparedDraftFingerprint,
      fieldReviewApproval: gate ? freezeDeep(gate) : null,
      findings: findings,
      mutationCheck: freezeDeep({
        inputUnchanged: beforeDraft === afterDraft && beforeApproval === afterApproval,
        registryUnchanged: true
      })
    });
  }

  const evidencePackets = draft.evidencePackets.map(function (p) {
    return orderedEvidencePacket(p);
  });
  const compactRefs = (draft.compactEvidenceRefs || []).map(orderedCompactRef);
  const sourceIds = (draft.fieldReviewDraft.sourceIds || []).slice().sort();

  const frRecordDraft = {
    canonicalKey: draft.canonicalKey,
    field: draft.field,
    reviewStatus: gate.proposedReviewStatus,
    reviewedClaimType: gate.reviewedClaimType,
    reviewedValue: gate.reviewedValue,
    contextScope: orderedContext(draft.contextScope),
    reviewContractVersion: SR_FIELD_REVIEW_CONTRACT_VERSION,
    evidenceRefs: compactRefs,
    sourceKind: 'evidence_derived_override',
    sourceIds: sourceIds,
    reviewVersion: '1',
    reviewedAt: gate.approvedAt,
    reason: gate.reason,
    unresolvedLimitations: gate.unresolvedLimitations
  };

  const frFp = buildFieldReviewValueFingerprint({
    canonicalKey: frRecordDraft.canonicalKey,
    field: frRecordDraft.field,
    reviewedClaimType: frRecordDraft.reviewedClaimType,
    reviewedValue: frRecordDraft.reviewedValue,
    sourceKind: frRecordDraft.sourceKind,
    sourceIds: frRecordDraft.sourceIds,
    evidenceRefs: frRecordDraft.evidenceRefs,
    contextScope: frRecordDraft.contextScope,
    reviewContractVersion: SR_FIELD_REVIEW_CONTRACT_VERSION
  });
  if (!frFp.ok) {
    pushFinding(findings, {
      code: 'fingerprint_failure',
      detail: 'field_review_value_fingerprint_failed',
      actual: frFp.reasons
    });
  } else {
    frRecordDraft.valueFingerprint = frFp.fingerprint;
  }

  const emptyFrBefore = stableSerialize(getEmptySmartRecDeveloperFieldReviewRegistry());
  const knownEvidenceRefs = evidencePackets.map(function (p) {
    return p.evidenceId;
  });

  const frRegistryBuild = validateAndBuildFieldReviewRegistry([frRecordDraft], {
    knownCanonicalKeys: [draft.canonicalKey],
    knownEvidenceRefs: knownEvidenceRefs,
    reviewContractVersion: SR_FIELD_REVIEW_CONTRACT_VERSION,
    registryVersion: SR_FIELD_REVIEW_REGISTRY_VERSION,
    syntheticFixtureOnly: true
  });
  if (!frRegistryBuild.valid) {
    pushFinding(findings, {
      code: 'foundation_validation_failure',
      detail: 'field_review_registry_build_failed',
      actual: frRegistryBuild.reasons || frRegistryBuild.summaryFingerprint
    });
  }

  const epSnapshots = [];
  for (let i = 0; i < evidencePackets.length; i++) {
    const snap = buildEvidencePacketReferenceSnapshot(evidencePackets[i]);
    if (snap.ok) epSnapshots.push(snap.snapshot);
  }

  const frValidatorReport = validateSmartRecDeveloperFieldReviewRegistry({
    registry: getEmptySmartRecDeveloperFieldReviewRegistry(),
    registryDescriptor: getSmartRecDeveloperFieldReviewRegistryDescriptor(),
    registryVersion: SR_FIELD_REVIEW_REGISTRY_VERSION,
    reviewContractVersion: SR_FIELD_REVIEW_CONTRACT_VERSION,
    evidencePacketRegistryVersion: SR_EVIDENCE_PACKET_REGISTRY_VERSION,
    knownCanonicalKeys: [draft.canonicalKey],
    knownEvidenceRefs: knownEvidenceRefs,
    candidateRecords: [frRecordDraft],
    evidencePacketSnapshots: { snapshots: epSnapshots },
    syntheticEvidencePacketSnapshots: epSnapshots,
    conflictSnapshot: { entries: [] },
    syntheticFixtureOnly: true
  });
  if (!frValidatorReport.valid) {
    pushFinding(findings, {
      code: 'foundation_validation_failure',
      detail: 'field_review_validator_failed',
      actual: frValidatorReport.summaryFingerprint
    });
  }

  const emptyFrAfter = stableSerialize(getEmptySmartRecDeveloperFieldReviewRegistry());
  if (emptyFrBefore !== emptyFrAfter) {
    pushFinding(findings, {
      code: 'mutation_detected',
      detail: 'empty_field_review_registry_mutated'
    });
  }

  const finalFieldReview = freezeDeep(orderedFieldReview(frRecordDraft));

  const profileDraft = {
    profileId: draft.generatedIds.profileId,
    profileContractVersion: SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
    canonicalKey: draft.canonicalKey,
    field: draft.field,
    profileStatus: gate.proposedReviewStatus,
    reviewedClaimType: gate.reviewedClaimType,
    reviewedValue: gate.reviewedValue,
    contextScope: orderedContext(draft.contextScope),
    fieldReviewReference: {
      fieldReviewContractVersion: SR_FIELD_REVIEW_CONTRACT_VERSION,
      fieldReviewRegistryVersion: SR_FIELD_REVIEW_REGISTRY_VERSION,
      canonicalKey: finalFieldReview.canonicalKey,
      field: finalFieldReview.field,
      reviewStatus: finalFieldReview.reviewStatus,
      valueFingerprint: finalFieldReview.valueFingerprint,
      reviewedClaimType: finalFieldReview.reviewedClaimType,
      reviewedValue: finalFieldReview.reviewedValue
    },
    evidenceRefs: compactRefs,
    unresolvedLimitations: gate.unresolvedLimitations
  };

  if (
    profileDraft.profileStatus === 'reviewed_supported' &&
    finalFieldReview.reviewStatus !== 'reviewed_supported'
  ) {
    pushFinding(findings, {
      code: 'foundation_validation_failure',
      detail: 'profile_stronger_than_field_review'
    });
  }

  const profileFp = buildStructuredClimateProfileFingerprint(profileDraft);
  if (!profileFp.ok) {
    pushFinding(findings, {
      code: 'fingerprint_failure',
      detail: 'profile_fingerprint_failed',
      actual: profileFp.reasons
    });
  } else {
    profileDraft.profileFingerprint = profileFp.fingerprint;
  }

  const emptyScpBefore = stableSerialize(
    getEmptySmartRecDeveloperStructuredClimateProfileRegistry()
  );
  const scpRegistryBuild = validateAndBuildStructuredClimateProfileRegistry([profileDraft], {
    profileContractVersion: SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
    registryVersion: SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_VERSION
  });
  if (!scpRegistryBuild.valid) {
    pushFinding(findings, {
      code: 'foundation_validation_failure',
      detail: 'profile_registry_build_failed',
      actual: scpRegistryBuild.reasons
    });
  }

  const frSnap = buildFieldReviewReferenceSnapshot(
    finalFieldReview,
    SR_FIELD_REVIEW_CONTRACT_VERSION
  );
  const scpValidatorReport = validateSmartRecDeveloperStructuredClimateProfileRegistry({
    profiles: [profileDraft],
    fieldReviewSnapshots: frSnap.ok ? [frSnap.snapshot] : [],
    evidencePacketSnapshots: epSnapshots,
    registry: getEmptySmartRecDeveloperStructuredClimateProfileRegistry(),
    registryDescriptor: getSmartRecDeveloperStructuredClimateProfileRegistryDescriptor(),
    syntheticFixtureOnly: true
  });
  if (!scpValidatorReport.valid) {
    pushFinding(findings, {
      code: 'foundation_validation_failure',
      detail: 'profile_validator_failed',
      actual: scpValidatorReport.summaryFingerprint
    });
  }

  const emptyScpAfter = stableSerialize(
    getEmptySmartRecDeveloperStructuredClimateProfileRegistry()
  );
  if (emptyScpBefore !== emptyScpAfter) {
    pushFinding(findings, {
      code: 'mutation_detected',
      detail: 'empty_profile_registry_mutated'
    });
  }

  const structuredClimateProfile = freezeDeep(orderedProfile(profileDraft));

  const manifest = freezeDeep(
    orderedManifest({
      containerContractVersion: SR_REVIEWED_DATA_CONTAINER_CONTRACT_VERSION,
      batchId: draft.batchId,
      canonicalKey: draft.canonicalKey,
      acceptedScientificName: draft.acceptedScientificName,
      field: draft.field,
      reviewedClaimType: draft.reviewedClaimType,
      researchHypothesis: draft.proposedValue,
      contextScope: draft.contextScope,
      batchStatus: 'developer_reviewed_data_pending_product',
      unresolvedLimitations: gate.unresolvedLimitations
    })
  );

  const evidenceWrapper = freezeDeep(
    orderedWrapper(
      draft.batchId,
      ARTIFACT_TYPES.evidencePackets,
      SR_EVIDENCE_PACKET_CONTRACT_VERSION,
      evidencePackets
    )
  );
  const fieldReviewWrapper = freezeDeep(
    orderedWrapper(
      draft.batchId,
      ARTIFACT_TYPES.fieldReviewRecords,
      SR_FIELD_REVIEW_CONTRACT_VERSION,
      [orderedFieldReview(finalFieldReview)]
    )
  );
  const profileWrapper = freezeDeep(
    orderedWrapper(
      draft.batchId,
      ARTIFACT_TYPES.structuredClimateProfiles,
      SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
      [orderedProfile(structuredClimateProfile)]
    )
  );

  const batchReport = validateSmartRecDeveloperReviewedDataBatch({
    manifest: snapshotClone(manifest),
    evidencePacketWrapper: snapshotClone(evidenceWrapper),
    fieldReviewWrapper: snapshotClone(fieldReviewWrapper),
    structuredClimateProfileWrapper: snapshotClone(profileWrapper),
    knownCanonicalKeys: [draft.canonicalKey],
    canonicalIdentitySnapshot: {
      knownCanonicalKeys: [draft.canonicalKey],
      acceptedScientificName: draft.acceptedScientificName
    }
  });
  if (!batchReport.valid) {
    pushFinding(findings, {
      code: 'batch_validation_failure',
      detail: 'shared_batch_validator_failed',
      actual: batchReport.summaryFingerprint || batchReport.findings
    });
  }

  const proposedFiles = freezeDeep([
    {
      relativePath: 'batch.manifest.json',
      parsedObject: manifest,
      canonicalJsonText: canonicalJsonText(manifest)
    },
    {
      relativePath: 'evidence-packets.json',
      parsedObject: evidenceWrapper,
      canonicalJsonText: canonicalJsonText(evidenceWrapper)
    },
    {
      relativePath: 'field-review-records.json',
      parsedObject: fieldReviewWrapper,
      canonicalJsonText: canonicalJsonText(fieldReviewWrapper)
    },
    {
      relativePath: 'structured-climate-profiles.json',
      parsedObject: profileWrapper,
      canonicalJsonText: canonicalJsonText(profileWrapper)
    }
  ]);

  const afterDraft = stableSerialize(preparedDraft);
  const afterApproval = stableSerialize(fieldReviewApproval);
  if (beforeDraft !== afterDraft || beforeApproval !== afterApproval) {
    pushFinding(findings, { code: 'mutation_detected', detail: 'input_mutated' });
  }

  const sorted = sortFindings(findings);
  const counts = countFindings(sorted);
  const ok = counts.errorCount === 0;

  const summaryFingerprint = buildSummaryFingerprint({
    stage: 'finalize',
    workflowState: ok ? SR_REVIEWED_DATA_BATCH_DRAFT_WORKFLOW_STAGE2 : null,
    captureContentFingerprintDigest: digestText(draft.captureContentFingerprint),
    preparedDraftFingerprintDigest: digestText(draft.preparedDraftFingerprint),
    fieldReviewValueFingerprint: finalFieldReview.valueFingerprint || null,
    profileFingerprint: structuredClimateProfile.profileFingerprint || null,
    batchValid: batchReport.valid === true,
    proposedFileDigests: proposedFiles.map(function (f) {
      return {
        relativePath: f.relativePath,
        digest: digestText(f.canonicalJsonText)
      };
    }),
    findingCount: counts.errorCount,
    warningCount: counts.warningCount
  });

  return freezeDeep({
    ok: ok,
    valid: ok,
    descriptor: DESCRIPTOR,
    workflowState: ok ? SR_REVIEWED_DATA_BATCH_DRAFT_WORKFLOW_STAGE2 : null,
    captureContentFingerprint: draft.captureContentFingerprint,
    preparedDraftFingerprint: draft.preparedDraftFingerprint,
    fieldReviewApproval: freezeDeep(gate),
    evidencePackets: freezeDeep(evidencePackets),
    finalFieldReview: finalFieldReview,
    structuredClimateProfile: structuredClimateProfile,
    batchManifest: manifest,
    wrappers: freezeDeep({
      evidencePackets: evidenceWrapper,
      fieldReviewRecords: fieldReviewWrapper,
      structuredClimateProfiles: profileWrapper
    }),
    independentBatchValidation: freezeDeep({
      valid: batchReport.valid === true,
      summaryFingerprint: batchReport.summaryFingerprint || null,
      loadedEvidencePacketCount: batchReport.loadedEvidencePacketCount,
      loadedFieldReviewRecordCount: batchReport.loadedFieldReviewRecordCount,
      loadedStructuredClimateProfileCount: batchReport.loadedStructuredClimateProfileCount,
      findings: batchReport.findings || []
    }),
    evidenceValidation: freezeDeep({
      packetCount: evidencePackets.length
    }),
    fieldReviewValidation: freezeDeep({
      registryBuildValid: frRegistryBuild.valid === true,
      validatorValid: frValidatorReport.valid === true,
      validatorSummaryFingerprint: frValidatorReport.summaryFingerprint || null
    }),
    profileValidation: freezeDeep({
      registryBuildValid: scpRegistryBuild.valid === true,
      validatorValid: scpValidatorReport.valid === true,
      validatorSummaryFingerprint: scpValidatorReport.summaryFingerprint || null
    }),
    proposedFiles: proposedFiles,
    findings: sorted,
    warnings: sorted.filter(function (f) {
      return f.severity === 'warning';
    }),
    errorCount: counts.errorCount,
    warningCount: counts.warningCount,
    infoCount: counts.infoCount,
    summaryFingerprint: summaryFingerprint,
    authorityBoundary: authorityBoundary(),
    mutationCheck: freezeDeep({
      inputUnchanged: beforeDraft === afterDraft && beforeApproval === afterApproval,
      registryUnchanged:
        emptyFrBefore === emptyFrAfter && emptyScpBefore === emptyScpAfter
    })
  });
}
