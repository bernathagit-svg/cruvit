/**
 * Cruvit — Smart Recommendations developer Source Scout → Batch Draft integration
 * ---------------------------------------------------------------------------
 * Deterministic, developer-only, in-memory Scout → Capture → prepare seam.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, persistence, or writes.
 *  - Does not invent Gate A/B approval or call finalizeReviewedDataBatchDraft.
 *  - Does not grant product / catalog / eligibility / GOS authority.
 *  - Does not mutate caller inputs or peer outputs.
 */

import {
  SR_REVIEWED_DATA_SOURCE_SCOUT_VERSION,
  SR_REVIEWED_DATA_SOURCE_SCOUT_CONTRACT_VERSION,
  SR_REVIEWED_DATA_SOURCE_SCOUT_RESULT_CONTRACT_VERSION,
  SR_REVIEWED_DATA_SOURCE_SCOUT_CAPABILITY,
  getSmartRecDeveloperReviewedDataSourceScoutDescriptor
} from './developer-reviewed-data-source-scout.js';

import {
  SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION,
  SR_REVIEWED_DATA_SOURCE_CAPTURE_CAPABILITY,
  SR_REVIEWED_DATA_SOURCE_CAPTURE_MAX_SHORT_EXCERPT_CHARS,
  SR_REVIEWED_DATA_SOURCE_CAPTURE_TOP_LEVEL_KEYS,
  normalizeReviewedDataSourceCapturePacket,
  validateReviewedDataSourceCapturePacket,
  buildReviewedDataCaptureContentFingerprint,
  getSmartRecDeveloperReviewedDataSourceCaptureDescriptor,
  stableSerialize,
  sortFindings,
  normalizeUrlReference,
  isIsoDate
} from './developer-reviewed-data-source-capture-contract.js';

import {
  SR_REVIEWED_DATA_BATCH_DRAFT_GENERATOR_VERSION,
  SR_REVIEWED_DATA_BATCH_DRAFT_WORKFLOW_STAGE1,
  getSmartRecDeveloperReviewedDataBatchDraftGeneratorDescriptor,
  prepareReviewedDataBatchDraft
} from './developer-reviewed-data-batch-draft-generator.js';

export const SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_VERSION =
  '0.1.0-sr-source-scout-batch-draft-integration';

export const SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_CONTRACT_VERSION =
  '0.1.0-sr-source-scout-batch-draft-integration-contract';

export const SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_RESULT_CONTRACT_VERSION =
  '0.1.0-sr-source-scout-batch-draft-integration-result';

export const SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_CAPABILITY =
  'explicit_developer_source_scout_batch_draft_preparation';

export const SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_STATUSES = Object.freeze([
  'integration_not_run',
  'integration_input_invalid',
  'source_scout_result_invalid',
  'source_scout_handoff_not_ready',
  'source_capture_mapping_failed',
  'source_capture_draft_ready',
  'human_review_required',
  'batch_draft_prepared',
  'field_review_approval_required',
  'integration_blocked',
  'integration_failed'
]);

export const SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_HARD_FINDINGS = Object.freeze([
  'unsupported_integration_contract',
  'invalid_integration_input',
  'unknown_integration_input_key',
  'unsupported_source_scout_peer',
  'unsupported_source_capture_peer',
  'unsupported_batch_generator_peer',
  'source_scout_result_invalid',
  'source_scout_handoff_not_ready',
  'source_scout_fingerprint_mismatch',
  'source_scout_handoff_fingerprint_mismatch',
  'identity_snapshot_mismatch',
  'assignment_snapshot_mismatch',
  'source_capture_mapping_failure',
  'source_capture_validation_blocked',
  'missing_human_gate_ab',
  'invalid_human_gate_ab',
  'missing_human_source_annotation',
  'duplicate_source_role',
  'conflict_preservation_failure',
  'informational_claim_authority_attempt',
  'batch_draft_prepare_failure',
  'unexpected_finalization_attempt',
  'gate_c_bypass_attempt',
  'artifact_write_attempt',
  'input_mutation_detected',
  'scout_result_mutation_detected',
  'capture_packet_mutation_detected',
  'prepared_draft_mutation_detected',
  'nondeterministic_integration_output'
]);

export const SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_INFO_FINDINGS = Object.freeze([
  'source_capture_draft_created',
  'human_gate_ab_verified',
  'batch_draft_prepared',
  'field_review_approval_required',
  'human_review_required',
  'rejected_material_preserved',
  'conflict_material_preserved',
  'product_authority_not_granted'
]);

const ALLOWED_INPUT_KEYS = Object.freeze([
  'integrationContractVersion',
  'sourceScoutResult',
  'expectedSourceScoutSummaryFingerprint',
  'expectedSourceScoutHandoffFingerprint',
  'approvedIdentitySnapshot',
  'approvedAssignmentSnapshot',
  'humanGateABApproval',
  'humanSourceAnnotations',
  'batchDraftOptions',
  'expectedIntegrationInputFingerprint'
]);

const REQUIRED_INPUT_KEYS = Object.freeze([
  'integrationContractVersion',
  'sourceScoutResult',
  'expectedSourceScoutSummaryFingerprint',
  'expectedSourceScoutHandoffFingerprint',
  'approvedIdentitySnapshot',
  'approvedAssignmentSnapshot',
  'humanSourceAnnotations',
  'batchDraftOptions'
]);

const IDENTITY_SNAPSHOT_KEYS = Object.freeze([
  'canonicalKey',
  'acceptedScientificName',
  'identityRegistryVersion',
  'currentIdentityBindingFingerprint',
  'currentNeedsReview',
  'currentIdentityConflict',
  'canonicalIdentityConfirmed',
  'parentOrGenusScope',
  'targetField'
]);

const ASSIGNMENT_SNAPSHOT_KEYS = Object.freeze([
  'assignmentId',
  'assignmentFingerprint',
  'canonicalKey',
  'acceptedScientificName',
  'targetField',
  'targetClaimTypes',
  'targetQuestions',
  'targetContext',
  'targetRegion',
  'citationRequirements',
  'allowedSourceClasses',
  'prohibitedSourceClasses',
  'selectedDraftGroupReference'
]);

const SELECTED_GROUP_KEYS = Object.freeze([
  'field',
  'claimType',
  'candidateValue',
  'captureClaimCandidateIds',
  'auditClaimCandidateIds',
  'conflictGroupIds'
]);

const STATUS_PRIORITY = Object.freeze([
  'integration_failed',
  'integration_input_invalid',
  'source_scout_result_invalid',
  'source_scout_handoff_not_ready',
  'integration_blocked',
  'source_capture_mapping_failed',
  'human_review_required',
  'source_capture_draft_ready',
  'batch_draft_prepared',
  'field_review_approval_required',
  'integration_not_run'
]);

const ROLE_RE = /^[a-z][a-z0-9-]{0,47}$/;

const EMPTY_AUTHORITY = Object.freeze({
  approvalAuthority: false,
  evidencePacketAuthority: false,
  fieldReviewAuthority: false,
  structuredProfileAuthority: false,
  batchAuthority: false,
  batchFinalizationAllowed: false,
  artifactWriteAllowed: false,
  catalogAuthority: false,
  productAuthority: false,
  eligibilityAuthority: false,
  scalarAuthority: false,
  runtimeRecommendationAuthority: false,
  GOSOutcomeAuthority: false,
  productUseAllowed: false,
  runtimeConsumptionAllowed: false
});

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

function pushFinding(findings, finding) {
  const code = finding.code;
  if (
    SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_HARD_FINDINGS.indexOf(code) < 0 &&
    SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_INFO_FINDINGS.indexOf(code) < 0
  ) {
    return;
  }
  const hard = SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_HARD_FINDINGS.indexOf(code) >= 0;
  findings.push(
    freezeDeep({
      code: code,
      severity: finding.severity || (hard ? 'error' : 'info'),
      path: finding.path == null ? null : finding.path,
      detail: finding.detail == null ? null : finding.detail,
      expected: finding.expected === undefined ? null : finding.expected,
      actual: finding.actual === undefined ? null : finding.actual
    })
  );
}

function sortIntegrationFindings(findings) {
  return sortFindings(findings);
}

function resolveStatus(candidates) {
  let best = null;
  let bestIdx = STATUS_PRIORITY.length;
  for (let i = 0; i < candidates.length; i++) {
    const s = candidates[i];
    const idx = STATUS_PRIORITY.indexOf(s);
    if (idx >= 0 && idx < bestIdx) {
      best = s;
      bestIdx = idx;
    }
  }
  return best || 'integration_failed';
}

function authorityBoundary() {
  return freezeDeep(Object.assign({}, EMPTY_AUTHORITY));
}

function buildDescriptor() {
  return freezeDeep({
    developerOnly: true,
    authoritative: false,
    approvalAuthority: false,
    evidencePacketAuthority: false,
    fieldReviewAuthority: false,
    structuredProfileAuthority: false,
    batchAuthority: false,
    batchFinalizationAllowed: false,
    artifactWriteAllowed: false,
    catalogAuthority: false,
    productAuthority: false,
    eligibilityAuthority: false,
    scalarAuthority: false,
    runtimeRecommendationAuthority: false,
    GOSOutcomeAuthority: false,
    productUseAllowed: false,
    runtimeConsumptionAllowed: false,
    network: false,
    externalApi: false,
    externalModel: false,
    persistence: false,
    filesystemWrite: false,
    automaticExecution: false,
    activation: 'explicit_developer_call_only',
    indexHtmlImport: false,
    runtimeImport: false,
    inputMutation: false,
    scoutResultMutation: false,
    capturePacketMutation: false,
    preparedDraftMutation: false,
    gitCommit: false,
    gitPush: false,
    deploy: false,
    capability: SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_CAPABILITY,
    integrationVersion: SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_VERSION,
    integrationContractVersion: SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_CONTRACT_VERSION,
    integrationResultContractVersion:
      SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_RESULT_CONTRACT_VERSION,
    supportedPeerVersions: Object.freeze({
      sourceScout: SR_REVIEWED_DATA_SOURCE_SCOUT_VERSION,
      sourceScoutContract: SR_REVIEWED_DATA_SOURCE_SCOUT_CONTRACT_VERSION,
      sourceScoutResult: SR_REVIEWED_DATA_SOURCE_SCOUT_RESULT_CONTRACT_VERSION,
      sourceCaptureContract: SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION,
      batchDraftGenerator: SR_REVIEWED_DATA_BATCH_DRAFT_GENERATOR_VERSION,
      prepareWorkflow: SR_REVIEWED_DATA_BATCH_DRAFT_WORKFLOW_STAGE1
    })
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperSourceScoutBatchDraftIntegrationDescriptor() {
  return DESCRIPTOR;
}

function scanProhibited(node, path, findings, counters) {
  if (node === null || node === undefined) return;
  if (typeof node === 'string') {
    const s = node.toLowerCase();
    if (
      s.indexOf('gate_c') >= 0 ||
      s.indexOf('gatec') >= 0 ||
      s.indexOf('gate c') >= 0 ||
      s.indexOf('field-review-gate-c') >= 0
    ) {
      counters.gateCBypassAttempts++;
      pushFinding(findings, {
        code: 'gate_c_bypass_attempt',
        path: path,
        detail: 'prohibited_gate_c_token'
      });
    }
    if (
      s.indexOf('finalizerevieweddatabatchdraft') >= 0 ||
      s.indexOf('finalizerequested') >= 0 ||
      s.indexOf('expectedfinalizedbatch') >= 0 ||
      (s.indexOf('finalize') >= 0 && s.indexOf('finalized') < 0 && path.indexOf('fingerprint') < 0)
    ) {
      counters.batchFinalizationAttempts++;
      pushFinding(findings, {
        code: 'unexpected_finalization_attempt',
        path: path,
        detail: 'prohibited_finalize_token'
      });
    }
    if (
      s.indexOf('artifactpath') >= 0 ||
      s.indexOf('artifactwrite') >= 0 ||
      s.indexOf('catalogwrite') >= 0 ||
      s.indexOf('filesystemwrite') >= 0
    ) {
      counters.artifactWrites++;
      pushFinding(findings, {
        code: 'artifact_write_attempt',
        path: path,
        detail: 'prohibited_artifact_token'
      });
    }
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      scanProhibited(node[i], path + '[' + i + ']', findings, counters);
    }
    return;
  }
  if (typeof node === 'object') {
    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const lk = k.toLowerCase();
      const childPath = path ? path + '.' + k : k;
      if (
        lk === 'gatec' ||
        lk === 'gate_c' ||
        lk === 'gatecapproval' ||
        lk === 'fieldreviewgatec' ||
        lk.indexOf('gate_c') >= 0
      ) {
        counters.gateCBypassAttempts++;
        pushFinding(findings, {
          code: 'gate_c_bypass_attempt',
          path: childPath,
          detail: 'prohibited_gate_c_key'
        });
      }
      if (
        lk === 'finalize' ||
        lk === 'finalizerequested' ||
        lk === 'expectedfinalizedbatch' ||
        lk === 'finalizerevieweddatabatchdraft' ||
        lk === 'finalizedbatch'
      ) {
        counters.batchFinalizationAttempts++;
        pushFinding(findings, {
          code: 'unexpected_finalization_attempt',
          path: childPath,
          detail: 'prohibited_finalize_key'
        });
      }
      if (
        lk === 'artifactpath' ||
        lk === 'artifactwrite' ||
        lk === 'catalogwrite' ||
        lk === 'batchwrite' ||
        lk === 'filesystemwrite'
      ) {
        counters.artifactWrites++;
        pushFinding(findings, {
          code: 'artifact_write_attempt',
          path: childPath,
          detail: 'prohibited_artifact_key'
        });
      }
      if (
        lk === 'productauthority' ||
        lk === 'catalogauthority' ||
        lk === 'runtimeconsumptionallowed' ||
        lk === 'productuseallowed'
      ) {
        if (node[k] === true) {
          pushFinding(findings, {
            code: 'invalid_integration_input',
            path: childPath,
            detail: 'authority_injection'
          });
        }
      }
      if (
        lk === 'network' ||
        lk === 'externalmodel' ||
        lk === 'liveprovider' ||
        lk === 'shopify' ||
        lk === 'gitcommit' ||
        lk === 'gitpush' ||
        lk === 'deploy'
      ) {
        if (node[k] === true || (typeof node[k] === 'string' && node[k])) {
          pushFinding(findings, {
            code: 'invalid_integration_input',
            path: childPath,
            detail: 'prohibited_runtime_or_commerce_instruction'
          });
        }
      }
      scanProhibited(node[k], childPath, findings, counters);
    }
  }
}

function checkPeerVersions(findings) {
  if (SR_REVIEWED_DATA_SOURCE_SCOUT_VERSION !== '0.1.0-sr-reviewed-data-source-scout') {
    pushFinding(findings, {
      code: 'unsupported_source_scout_peer',
      detail: 'version',
      actual: SR_REVIEWED_DATA_SOURCE_SCOUT_VERSION
    });
  }
  if (
    SR_REVIEWED_DATA_SOURCE_SCOUT_CONTRACT_VERSION !==
    '0.1.0-sr-reviewed-data-source-scout-contract'
  ) {
    pushFinding(findings, {
      code: 'unsupported_source_scout_peer',
      detail: 'contract',
      actual: SR_REVIEWED_DATA_SOURCE_SCOUT_CONTRACT_VERSION
    });
  }
  if (
    SR_REVIEWED_DATA_SOURCE_SCOUT_RESULT_CONTRACT_VERSION !==
    '0.1.0-sr-reviewed-data-source-scout-result'
  ) {
    pushFinding(findings, {
      code: 'unsupported_source_scout_peer',
      detail: 'result',
      actual: SR_REVIEWED_DATA_SOURCE_SCOUT_RESULT_CONTRACT_VERSION
    });
  }
  if (SR_REVIEWED_DATA_SOURCE_SCOUT_CAPABILITY !== 'explicit_developer_reviewed_data_source_scout_draft') {
    pushFinding(findings, {
      code: 'unsupported_source_scout_peer',
      detail: 'capability',
      actual: SR_REVIEWED_DATA_SOURCE_SCOUT_CAPABILITY
    });
  }
  if (
    SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION !==
    '0.1.0-sr-reviewed-data-source-capture-contract'
  ) {
    pushFinding(findings, {
      code: 'unsupported_source_capture_peer',
      detail: 'contract',
      actual: SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION
    });
  }
  if (
    SR_REVIEWED_DATA_SOURCE_CAPTURE_CAPABILITY !==
    'explicit_developer_reviewed_data_source_capture_validation'
  ) {
    pushFinding(findings, {
      code: 'unsupported_source_capture_peer',
      detail: 'capability',
      actual: SR_REVIEWED_DATA_SOURCE_CAPTURE_CAPABILITY
    });
  }
  if (
    SR_REVIEWED_DATA_BATCH_DRAFT_GENERATOR_VERSION !==
    '0.1.0-sr-reviewed-data-batch-draft-generator'
  ) {
    pushFinding(findings, {
      code: 'unsupported_batch_generator_peer',
      detail: 'version',
      actual: SR_REVIEWED_DATA_BATCH_DRAFT_GENERATOR_VERSION
    });
  }
  if (SR_REVIEWED_DATA_BATCH_DRAFT_WORKFLOW_STAGE1 !== 'field_review_approval_required') {
    pushFinding(findings, {
      code: 'unsupported_batch_generator_peer',
      detail: 'workflow',
      actual: SR_REVIEWED_DATA_BATCH_DRAFT_WORKFLOW_STAGE1
    });
  }
}

export function normalizeSourceScoutBatchDraftIntegrationInput(input) {
  const findings = [];
  const src = asObject(input);
  if (!src) {
    pushFinding(findings, {
      code: 'invalid_integration_input',
      detail: 'input_not_object'
    });
    return freezeDeep({ ok: false, normalized: null, findings: sortIntegrationFindings(findings) });
  }

  const keys = Object.keys(src);
  for (let i = 0; i < keys.length; i++) {
    if (ALLOWED_INPUT_KEYS.indexOf(keys[i]) < 0) {
      pushFinding(findings, {
        code: 'unknown_integration_input_key',
        path: keys[i]
      });
    }
  }
  for (let i = 0; i < REQUIRED_INPUT_KEYS.length; i++) {
    const rk = REQUIRED_INPUT_KEYS[i];
    if (src[rk] === undefined) {
      pushFinding(findings, {
        code: 'invalid_integration_input',
        path: rk,
        detail: 'required_key_missing'
      });
    }
  }

  if (
    src.integrationContractVersion !==
    SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_CONTRACT_VERSION
  ) {
    pushFinding(findings, {
      code: 'unsupported_integration_contract',
      expected: SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_CONTRACT_VERSION,
      actual: src.integrationContractVersion
    });
  }

  const scout = asObject(src.sourceScoutResult);
  if (!scout) {
    pushFinding(findings, {
      code: 'invalid_integration_input',
      path: 'sourceScoutResult',
      detail: 'object_required'
    });
  }

  if (!isNonEmptyString(src.expectedSourceScoutSummaryFingerprint)) {
    pushFinding(findings, {
      code: 'invalid_integration_input',
      path: 'expectedSourceScoutSummaryFingerprint'
    });
  }
  if (!isNonEmptyString(src.expectedSourceScoutHandoffFingerprint)) {
    pushFinding(findings, {
      code: 'invalid_integration_input',
      path: 'expectedSourceScoutHandoffFingerprint'
    });
  }

  const idSnap = asObject(src.approvedIdentitySnapshot);
  if (!idSnap) {
    pushFinding(findings, {
      code: 'invalid_integration_input',
      path: 'approvedIdentitySnapshot'
    });
  } else {
    for (let i = 0; i < IDENTITY_SNAPSHOT_KEYS.length; i++) {
      if (idSnap[IDENTITY_SNAPSHOT_KEYS[i]] === undefined) {
        pushFinding(findings, {
          code: 'invalid_integration_input',
          path: 'approvedIdentitySnapshot.' + IDENTITY_SNAPSHOT_KEYS[i]
        });
      }
    }
  }

  const asSnap = asObject(src.approvedAssignmentSnapshot);
  if (!asSnap) {
    pushFinding(findings, {
      code: 'invalid_integration_input',
      path: 'approvedAssignmentSnapshot'
    });
  } else {
    for (let i = 0; i < ASSIGNMENT_SNAPSHOT_KEYS.length; i++) {
      if (asSnap[ASSIGNMENT_SNAPSHOT_KEYS[i]] === undefined) {
        pushFinding(findings, {
          code: 'invalid_integration_input',
          path: 'approvedAssignmentSnapshot.' + ASSIGNMENT_SNAPSHOT_KEYS[i]
        });
      }
    }
    const sel = asObject(asSnap.selectedDraftGroupReference);
    if (!sel) {
      pushFinding(findings, {
        code: 'invalid_integration_input',
        path: 'approvedAssignmentSnapshot.selectedDraftGroupReference'
      });
    } else {
      for (let i = 0; i < SELECTED_GROUP_KEYS.length; i++) {
        if (sel[SELECTED_GROUP_KEYS[i]] === undefined) {
          pushFinding(findings, {
            code: 'invalid_integration_input',
            path:
              'approvedAssignmentSnapshot.selectedDraftGroupReference.' +
              SELECTED_GROUP_KEYS[i]
          });
        }
      }
    }
  }

  if (!Array.isArray(src.humanSourceAnnotations)) {
    pushFinding(findings, {
      code: 'invalid_integration_input',
      path: 'humanSourceAnnotations',
      detail: 'array_required'
    });
  }

  const opts = asObject(src.batchDraftOptions);
  if (!opts) {
    pushFinding(findings, {
      code: 'invalid_integration_input',
      path: 'batchDraftOptions'
    });
  } else {
    if (!isNonEmptyString(opts.batchId)) {
      pushFinding(findings, {
        code: 'invalid_integration_input',
        path: 'batchDraftOptions.batchId'
      });
    }
    if (!asObject(opts.identityReference)) {
      pushFinding(findings, {
        code: 'invalid_integration_input',
        path: 'batchDraftOptions.identityReference'
      });
    }
    if (!asObject(opts.expectedArtifactCounts)) {
      pushFinding(findings, {
        code: 'invalid_integration_input',
        path: 'batchDraftOptions.expectedArtifactCounts'
      });
    }
  }

  if (src.humanGateABApproval !== undefined && src.humanGateABApproval !== null) {
    if (!asObject(src.humanGateABApproval)) {
      pushFinding(findings, {
        code: 'invalid_human_gate_ab',
        path: 'humanGateABApproval',
        detail: 'object_or_null_required'
      });
    }
  }

  const hard = findings.some(function (f) {
    return SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_HARD_FINDINGS.indexOf(f.code) >= 0;
  });

  const normalized = hard
    ? null
    : freezeDeep({
        integrationContractVersion: src.integrationContractVersion,
        sourceScoutResult: src.sourceScoutResult,
        expectedSourceScoutSummaryFingerprint: normalizeTrim(
          src.expectedSourceScoutSummaryFingerprint
        ),
        expectedSourceScoutHandoffFingerprint: normalizeTrim(
          src.expectedSourceScoutHandoffFingerprint
        ),
        approvedIdentitySnapshot: idSnap,
        approvedAssignmentSnapshot: asSnap,
        humanGateABApproval:
          src.humanGateABApproval === undefined ? null : src.humanGateABApproval,
        humanSourceAnnotations: src.humanSourceAnnotations,
        batchDraftOptions: opts,
        expectedIntegrationInputFingerprint:
          src.expectedIntegrationInputFingerprint === undefined
            ? null
            : src.expectedIntegrationInputFingerprint
      });

  return freezeDeep({
    ok: !hard,
    normalized: normalized,
    findings: sortIntegrationFindings(findings)
  });
}

export function validateSourceScoutBatchDraftIntegrationInput(input) {
  return normalizeSourceScoutBatchDraftIntegrationInput(input);
}

function annotationFingerprint(ann) {
  return (
    'ssbdi-ann|' +
    stableSerialize({
      sourceCandidateId: ann.sourceCandidateId || null,
      sourceMetadataFingerprint: ann.sourceMetadataFingerprint || null,
      claimFingerprint: ann.claimFingerprint || null,
      verifiedAt: ann.verifiedAt || null,
      reviewerSummary: ann.reviewerSummary || null,
      sourceRoleOverride:
        ann.sourceRoleOverride === undefined ? null : ann.sourceRoleOverride
    })
  );
}

function approvalFingerprint(approval) {
  if (approval === null || approval === undefined) return 'pending';
  return 'ssbdi-ab|' + stableSerialize(approval);
}

export function buildSourceScoutBatchDraftIntegrationInputFingerprint(input) {
  const norm = normalizeSourceScoutBatchDraftIntegrationInput(input);
  if (!norm.ok || !norm.normalized) {
    return freezeDeep({
      ok: false,
      fingerprint: null,
      findings: norm.findings
    });
  }
  const n = norm.normalized;
  const anns = (n.humanSourceAnnotations || []).map(annotationFingerprint).sort();
  const body = {
    integrationVersion: SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_VERSION,
    integrationContractVersion: SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_CONTRACT_VERSION,
    peerVersions: {
      sourceScout: SR_REVIEWED_DATA_SOURCE_SCOUT_VERSION,
      sourceCapture: SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION,
      batchGenerator: SR_REVIEWED_DATA_BATCH_DRAFT_GENERATOR_VERSION
    },
    expectedSourceScoutSummaryFingerprint: n.expectedSourceScoutSummaryFingerprint,
    expectedSourceScoutHandoffFingerprint: n.expectedSourceScoutHandoffFingerprint,
    scoutSummaryFingerprint: asObject(n.sourceScoutResult)
      ? n.sourceScoutResult.summaryFingerprint
      : null,
    scoutAssignmentFingerprint: asObject(n.sourceScoutResult)
      ? n.sourceScoutResult.inputFingerprint
      : null,
    approvedIdentitySnapshot: n.approvedIdentitySnapshot,
    approvedAssignmentSnapshot: n.approvedAssignmentSnapshot,
    selectedDraftGroupReference: asObject(n.approvedAssignmentSnapshot)
      ? n.approvedAssignmentSnapshot.selectedDraftGroupReference
      : null,
    humanGateABState: n.humanGateABApproval ? 'approved' : 'pending',
    humanGateABApprovalFingerprint: approvalFingerprint(n.humanGateABApproval),
    humanSourceAnnotationFingerprints: anns,
    batchDraftOptions: n.batchDraftOptions
  };
  return freezeDeep({
    ok: true,
    fingerprint: 'ssbdi-input|' + stableSerialize(body),
    findings: []
  });
}

function recomputeHandoffFingerprint(scoutResult) {
  const handoff = asObject(scoutResult) ? scoutResult.sourceCaptureHandoffDraft : null;
  if (!handoff) return null;
  return 'ss-handoff|' + stableSerialize(handoff);
}

function authorityAllFalse(boundary) {
  const b = asObject(boundary);
  if (!b) return false;
  const keys = Object.keys(EMPTY_AUTHORITY);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (b[k] === true) return false;
  }
  if (b.authoritative === true || b.outputApproval === true) return false;
  return true;
}

function findClaim(scout, claimId) {
  const claims = (scout && scout.claimCandidates) || [];
  for (let i = 0; i < claims.length; i++) {
    if (claims[i].claimCandidateId === claimId || claims[i].claimFingerprint === claimId) {
      return claims[i];
    }
  }
  return null;
}

function findSource(scout, sourceCandidateId) {
  const sources = (scout && scout.sourceCandidates) || [];
  for (let i = 0; i < sources.length; i++) {
    if (sources[i].sourceCandidateId === sourceCandidateId) return sources[i];
  }
  return null;
}

function tierForScoutClass(scoutClass) {
  if (scoutClass === 'preferred') return 'A';
  if (scoutClass === 'acceptable_with_limits') return 'B';
  if (scoutClass === 'corroboration_only') return 'C';
  return null;
}

function normalizeLimitations(value) {
  if (Array.isArray(value)) {
    return value
      .map(function (v) {
        return normalizeTrim(v);
      })
      .filter(Boolean);
  }
  const s = normalizeTrim(value);
  return s ? [s] : [];
}

function uniqueText(base, locator, seen) {
  let text = normalizeTrim(base) || '';
  if (!seen[text]) {
    seen[text] = true;
    return text;
  }
  const loc = normalizeTrim(locator) || 'loc';
  let candidate = text + ' [' + loc + ']';
  let n = 2;
  while (seen[candidate]) {
    candidate = text + ' [' + loc + '-' + n + ']';
    n++;
  }
  if (candidate.length > SR_REVIEWED_DATA_SOURCE_CAPTURE_MAX_SHORT_EXCERPT_CHARS) {
    candidate = candidate.slice(0, SR_REVIEWED_DATA_SOURCE_CAPTURE_MAX_SHORT_EXCERPT_CHARS);
  }
  seen[candidate] = true;
  return candidate;
}

function buildSourceScoutReference(scout, handoffFp) {
  const metrics = asObject(scout.metrics) || {};
  return freezeDeep({
    sourceScoutVersion: SR_REVIEWED_DATA_SOURCE_SCOUT_VERSION,
    sourceScoutContractVersion: SR_REVIEWED_DATA_SOURCE_SCOUT_CONTRACT_VERSION,
    sourceScoutResultContractVersion: SR_REVIEWED_DATA_SOURCE_SCOUT_RESULT_CONTRACT_VERSION,
    status: scout.status || null,
    handoffState: scout.handoffState || null,
    assignmentFingerprint: scout.inputFingerprint || null,
    summaryFingerprint: scout.summaryFingerprint || null,
    handoffFingerprint: handoffFp,
    sourceCandidateCount: Array.isArray(scout.sourceCandidates)
      ? scout.sourceCandidates.length
      : 0,
    claimCandidateCount: Array.isArray(scout.claimCandidates)
      ? scout.claimCandidates.length
      : 0,
    rejectedSourceCount: Array.isArray(scout.rejectedSources)
      ? scout.rejectedSources.length
      : metrics.rejectedCount || 0,
    conflictGroupCount: Array.isArray(scout.conflictGroups)
      ? scout.conflictGroups.length
      : metrics.conflictGroupCount || 0,
    authorityBoundary: authorityBoundary()
  });
}

function buildCaptureDraftReference(packet, contentFp, approvalState) {
  if (!packet) return null;
  return freezeDeep({
    captureContractVersion: SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION,
    canonicalKey: packet.canonicalKey || null,
    field: packet.field || null,
    reviewedClaimType: packet.reviewedClaimType || null,
    proposedValue: packet.proposedValue || null,
    contextScope: packet.contextScope || null,
    sourceCount: Array.isArray(packet.sources) ? packet.sources.length : 0,
    contentFingerprint: contentFp || null,
    approvalState: approvalState,
    captureLegalKeysOnly: true,
    topLevelKeys: Object.keys(packet).slice().sort()
  });
}

function buildCaptureValidationReference(validation, contentFp, approved) {
  if (!validation) return null;
  return freezeDeep({
    valid: validation.valid === true,
    hardErrorCount: validation.errorCount || 0,
    warningCount: validation.warningCount || 0,
    contentFingerprint: contentFp || validation.captureContentFingerprint || null,
    approvedGatesAB: approved === true,
    nestedFindingCodes: ((validation.findings || []).map(function (f) {
      return f.code;
    })).sort()
  });
}

function buildBatchPrepReference(prep) {
  if (!prep) return null;
  return freezeDeep({
    generatorVersion: SR_REVIEWED_DATA_BATCH_DRAFT_GENERATOR_VERSION,
    preparationOk: prep.ok === true || prep.valid === true,
    workflowState: prep.workflowState || null,
    fieldReviewApprovalRequired: prep.fieldReviewApprovalRequired === true,
    preparedDraftFingerprint: prep.preparedDraftFingerprint || null,
    evidencePacketDraftCount: Array.isArray(prep.evidencePackets)
      ? prep.evidencePackets.length
      : 0,
    fieldReviewDraftPresent: !!prep.fieldReviewDraft,
    finalizedBatchAbsent: true,
    gateCAbsent: true,
    authorityBoundary: authorityBoundary()
  });
}

function buildSummaryFingerprint(parts) {
  return 'ssbdi-summary|' + stableSerialize(parts);
}

export function prepareSourceScoutBatchDraftIntegration(input) {
  const findings = [];
  const warnings = [];
  const statusFlags = [];
  const counters = {
    sourceCaptureMappings: 0,
    sourceCaptureValidations: 0,
    batchDraftPreparations: 0,
    batchFinalizationAttempts: 0,
    gateCBypassAttempts: 0,
    artifactWrites: 0
  };

  const beforeInput = stableSerialize(input);
  const scoutBefore =
    asObject(input) && asObject(input.sourceScoutResult)
      ? stableSerialize(input.sourceScoutResult)
      : null;

  checkPeerVersions(findings);
  // Scan only integration-controlled keys — never deep-scan the Scout result body.
  if (asObject(input)) {
    const scanKeys = [
      'integrationContractVersion',
      'expectedSourceScoutSummaryFingerprint',
      'expectedSourceScoutHandoffFingerprint',
      'approvedIdentitySnapshot',
      'approvedAssignmentSnapshot',
      'humanGateABApproval',
      'humanSourceAnnotations',
      'batchDraftOptions',
      'expectedIntegrationInputFingerprint'
    ];
    for (let si = 0; si < scanKeys.length; si++) {
      if (input[scanKeys[si]] !== undefined) {
        scanProhibited(input[scanKeys[si]], scanKeys[si], findings, counters);
      }
    }
    const topKeys = Object.keys(input);
    for (let ti = 0; ti < topKeys.length; ti++) {
      const tk = topKeys[ti];
      if (ALLOWED_INPUT_KEYS.indexOf(tk) < 0) {
        scanProhibited(tk, tk, findings, counters);
      }
    }
  }

  const norm = normalizeSourceScoutBatchDraftIntegrationInput(input);
  for (let i = 0; i < norm.findings.length; i++) findings.push(norm.findings[i]);

  let inputFp = null;
  const inputFpBuild = buildSourceScoutBatchDraftIntegrationInputFingerprint(input);
  if (inputFpBuild.ok) inputFp = inputFpBuild.fingerprint;

  if (
    asObject(input) &&
    input.expectedIntegrationInputFingerprint &&
    inputFp &&
    input.expectedIntegrationInputFingerprint !== inputFp
  ) {
    pushFinding(findings, {
      code: 'invalid_integration_input',
      path: 'expectedIntegrationInputFingerprint',
      detail: 'fingerprint_mismatch',
      expected: input.expectedIntegrationInputFingerprint,
      actual: inputFp
    });
  }

  let scoutRef = null;
  let captureDraftRef = null;
  let captureValRef = null;
  let batchPrepRef = null;
  let handoffState = 'human_review_required';
  let capturePacket = null;
  let captureContentFp = null;
  let preparedDraft = null;
  let mappingAudit = null;

  const hardPeer = findings.some(function (f) {
    return (
      f.code === 'unsupported_source_scout_peer' ||
      f.code === 'unsupported_source_capture_peer' ||
      f.code === 'unsupported_batch_generator_peer'
    );
  });
  if (hardPeer) statusFlags.push('integration_blocked');

  const hardInput = findings.some(function (f) {
    return (
      f.code === 'unsupported_integration_contract' ||
      f.code === 'invalid_integration_input' ||
      f.code === 'unknown_integration_input_key' ||
      f.code === 'gate_c_bypass_attempt' ||
      f.code === 'unexpected_finalization_attempt' ||
      f.code === 'artifact_write_attempt'
    );
  });
  if (hardInput) statusFlags.push('integration_input_invalid');

  const n = norm.ok ? norm.normalized : null;

  if (n && !hardPeer && !hardInput) {
    const scout = asObject(n.sourceScoutResult);
    const handoffFp = recomputeHandoffFingerprint(scout);
    scoutRef = buildSourceScoutReference(scout, handoffFp);

    if (!scout || scout.status !== 'human_review_required') {
      pushFinding(findings, {
        code: 'source_scout_result_invalid',
        path: 'sourceScoutResult.status',
        expected: 'human_review_required',
        actual: scout ? scout.status : null
      });
      statusFlags.push('source_scout_result_invalid');
    }
    if (!scout || scout.handoffState !== 'ready_for_source_capture_validation') {
      pushFinding(findings, {
        code: 'source_scout_handoff_not_ready',
        path: 'sourceScoutResult.handoffState',
        expected: 'ready_for_source_capture_validation',
        actual: scout ? scout.handoffState : null
      });
      statusFlags.push('source_scout_handoff_not_ready');
    }
    if (!scout || !authorityAllFalse(scout.authorityBoundary)) {
      pushFinding(findings, {
        code: 'source_scout_result_invalid',
        path: 'sourceScoutResult.authorityBoundary',
        detail: 'authority_not_all_false'
      });
      statusFlags.push('source_scout_result_invalid');
    }
    if (!scout || scout.summaryFingerprint !== n.expectedSourceScoutSummaryFingerprint) {
      pushFinding(findings, {
        code: 'source_scout_fingerprint_mismatch',
        path: 'sourceScoutResult.summaryFingerprint',
        expected: n.expectedSourceScoutSummaryFingerprint,
        actual: scout ? scout.summaryFingerprint : null
      });
      statusFlags.push('source_scout_result_invalid');
    }
    if (!handoffFp || handoffFp !== n.expectedSourceScoutHandoffFingerprint) {
      pushFinding(findings, {
        code: 'source_scout_handoff_fingerprint_mismatch',
        expected: n.expectedSourceScoutHandoffFingerprint,
        actual: handoffFp
      });
      statusFlags.push('source_scout_handoff_not_ready');
    }

    const id = n.approvedIdentitySnapshot;
    const assignRef = asObject(scout.assignmentReference) || {};

    if (
      id.canonicalIdentityConfirmed !== true ||
      id.currentNeedsReview === true ||
      id.currentIdentityConflict === true ||
      id.parentOrGenusScope !== 'species' ||
      !isNonEmptyString(id.canonicalKey) ||
      !isNonEmptyString(id.acceptedScientificName) ||
      !isNonEmptyString(id.identityRegistryVersion) ||
      !isNonEmptyString(id.currentIdentityBindingFingerprint) ||
      !isNonEmptyString(id.targetField) ||
      (assignRef.canonicalKey && id.canonicalKey !== assignRef.canonicalKey) ||
      (assignRef.acceptedScientificName &&
        id.acceptedScientificName !== assignRef.acceptedScientificName) ||
      (assignRef.targetField && id.targetField !== assignRef.targetField)
    ) {
      pushFinding(findings, {
        code: 'identity_snapshot_mismatch',
        path: 'approvedIdentitySnapshot',
        detail: 'identity_blocked_or_mismatch'
      });
      statusFlags.push('integration_blocked');
    }

    const asnap = n.approvedAssignmentSnapshot;
    if (
      !asnap.assignmentFingerprint ||
      !scout.inputFingerprint ||
      asnap.assignmentFingerprint !== scout.inputFingerprint ||
      asnap.canonicalKey !== id.canonicalKey ||
      asnap.acceptedScientificName !== id.acceptedScientificName ||
      asnap.targetField !== id.targetField ||
      (assignRef.assignmentId && asnap.assignmentId !== assignRef.assignmentId) ||
      (assignRef.assignmentFingerprint &&
        asnap.assignmentFingerprint !== assignRef.assignmentFingerprint)
    ) {
      pushFinding(findings, {
        code: 'assignment_snapshot_mismatch',
        path: 'approvedAssignmentSnapshot'
      });
      statusFlags.push('integration_blocked');
    }

    const sel = asObject(asnap.selectedDraftGroupReference);
    const captureIds = Array.isArray(sel.captureClaimCandidateIds)
      ? sel.captureClaimCandidateIds.slice()
      : [];
    const auditIds = Array.isArray(sel.auditClaimCandidateIds)
      ? sel.auditClaimCandidateIds.slice()
      : [];
    const conflictIds = Array.isArray(sel.conflictGroupIds)
      ? sel.conflictGroupIds.slice()
      : [];

    if (sel.claimType === 'general_guidance') {
      pushFinding(findings, {
        code: 'informational_claim_authority_attempt',
        path: 'selectedDraftGroupReference.claimType'
      });
      statusFlags.push('integration_blocked');
    }

    if (captureIds.length < 2) {
      pushFinding(findings, {
        code: 'source_capture_mapping_failure',
        path: 'selectedDraftGroupReference.captureClaimCandidateIds',
        detail: 'requires_at_least_2'
      });
      statusFlags.push('source_capture_mapping_failed');
    }

    const scoutConflicts = Array.isArray(scout.conflictGroups) ? scout.conflictGroups : [];
    const scoutRejected = Array.isArray(scout.rejectedSources) ? scout.rejectedSources : [];
    if (scoutConflicts.length > 0 && conflictIds.length === 0) {
      pushFinding(findings, {
        code: 'conflict_preservation_failure',
        path: 'selectedDraftGroupReference.conflictGroupIds',
        detail: 'scout_conflicts_not_preserved'
      });
      statusFlags.push('source_capture_mapping_failed');
    }
    if (scoutConflicts.length > 0) {
      for (let i = 0; i < scoutConflicts.length; i++) {
        const cgid = scoutConflicts[i].conflictGroupId;
        if (conflictIds.indexOf(cgid) < 0) {
          pushFinding(findings, {
            code: 'conflict_preservation_failure',
            path: 'selectedDraftGroupReference.conflictGroupIds',
            detail: 'missing_conflict_group',
            actual: cgid
          });
          statusFlags.push('source_capture_mapping_failed');
        }
      }
    }
    if (auditIds.length < captureIds.length) {
      pushFinding(findings, {
        code: 'conflict_preservation_failure',
        path: 'selectedDraftGroupReference.auditClaimCandidateIds',
        detail: 'audit_must_cover_capture_and_conflicts'
      });
      statusFlags.push('source_capture_mapping_failed');
    }

    const mappingHardBefore = statusFlags.indexOf('source_capture_mapping_failed') >= 0 ||
      statusFlags.indexOf('integration_blocked') >= 0 ||
      statusFlags.indexOf('source_scout_result_invalid') >= 0 ||
      statusFlags.indexOf('source_scout_handoff_not_ready') >= 0;

    if (!mappingHardBefore) {
      const activePairs = [];
      for (let i = 0; i < captureIds.length; i++) {
        const claim = findClaim(scout, captureIds[i]);
        if (!claim) {
          pushFinding(findings, {
            code: 'source_capture_mapping_failure',
            path: 'captureClaimCandidateIds[' + i + ']',
            detail: 'claim_not_found',
            actual: captureIds[i]
          });
          statusFlags.push('source_capture_mapping_failed');
          continue;
        }
        if (
          claim.field !== sel.field ||
          claim.claimType !== sel.claimType ||
          claim.candidateValue !== sel.candidateValue
        ) {
          pushFinding(findings, {
            code: 'source_capture_mapping_failure',
            path: 'captureClaimCandidateIds[' + i + ']',
            detail: 'group_mismatch'
          });
          statusFlags.push('source_capture_mapping_failed');
          continue;
        }
        if (claim.claimType === 'general_guidance') {
          pushFinding(findings, {
            code: 'informational_claim_authority_attempt',
            path: 'captureClaimCandidateIds[' + i + ']'
          });
          statusFlags.push('integration_blocked');
          continue;
        }
        const srcCand = findSource(scout, claim.sourceCandidateId);
        if (!srcCand || srcCand.acceptedForExtraction !== true) {
          pushFinding(findings, {
            code: 'source_capture_mapping_failure',
            path: 'captureClaimCandidateIds[' + i + ']',
            detail: 'source_not_capture_eligible'
          });
          statusFlags.push('source_capture_mapping_failed');
          continue;
        }
        if (srcCand.scoutClassState !== 'preferred') {
          pushFinding(findings, {
            code: 'source_capture_mapping_failure',
            path: 'captureClaimCandidateIds[' + i + ']',
            detail: 'capture_active_requires_preferred',
            actual: srcCand.scoutClassState
          });
          statusFlags.push('source_capture_mapping_failed');
          continue;
        }
        // Conflicting value claims must not be Capture-active
        let inConflictOtherValue = false;
        for (let c = 0; c < scoutConflicts.length; c++) {
          const cg = scoutConflicts[c];
          if (
            Array.isArray(cg.values) &&
            cg.values.indexOf(sel.candidateValue) >= 0 &&
            cg.values.length > 1 &&
            Array.isArray(cg.claimCandidateIds) &&
            cg.claimCandidateIds.indexOf(claim.claimCandidateId) >= 0 &&
            claim.candidateValue !== sel.candidateValue
          ) {
            inConflictOtherValue = true;
          }
        }
        if (inConflictOtherValue) {
          pushFinding(findings, {
            code: 'source_capture_mapping_failure',
            path: 'captureClaimCandidateIds[' + i + ']',
            detail: 'conflicting_claim_not_allowed_as_active'
          });
          statusFlags.push('source_capture_mapping_failed');
          continue;
        }
        activePairs.push({ claim: claim, source: srcCand });
      }

      if (statusFlags.indexOf('source_capture_mapping_failed') < 0 &&
          statusFlags.indexOf('integration_blocked') < 0) {
        activePairs.sort(function (a, b) {
          const fa = a.source.sourceMetadataFingerprint || '';
          const fb = b.source.sourceMetadataFingerprint || '';
          if (fa < fb) return -1;
          if (fa > fb) return 1;
          return String(a.claim.claimCandidateId).localeCompare(
            String(b.claim.claimCandidateId)
          );
        });

        const anns = Array.isArray(n.humanSourceAnnotations)
          ? n.humanSourceAnnotations
          : [];
        const roleSeen = Object.create(null);
        const excerptSeen = Object.create(null);
        const claimSeen = Object.create(null);
        const mappedSources = [];
        const auditSources = [];

        for (let i = 0; i < activePairs.length; i++) {
          const pair = activePairs[i];
          const claim = pair.claim;
          const srcCand = pair.source;
          let ann = null;
          for (let a = 0; a < anns.length; a++) {
            const cand = asObject(anns[a]);
            if (
              cand &&
              cand.sourceCandidateId === claim.sourceCandidateId &&
              cand.sourceMetadataFingerprint === srcCand.sourceMetadataFingerprint &&
              cand.claimFingerprint === claim.claimFingerprint
            ) {
              ann = cand;
              break;
            }
          }
          if (!ann) {
            pushFinding(findings, {
              code: 'missing_human_source_annotation',
              path: 'humanSourceAnnotations',
              detail: 'missing_for_capture_active',
              actual: claim.sourceCandidateId
            });
            statusFlags.push('source_capture_mapping_failed');
            continue;
          }
          if (!isIsoDate(ann.verifiedAt) || !normalizeTrim(ann.reviewerSummary)) {
            pushFinding(findings, {
              code: 'missing_human_source_annotation',
              path: 'humanSourceAnnotations',
              detail: 'verifiedAt_or_reviewerSummary_invalid'
            });
            statusFlags.push('source_capture_mapping_failed');
            continue;
          }

          let role =
            i === 0 ? 'primary' : 'corroborating-' + i;
          if (ann.sourceRoleOverride !== undefined && ann.sourceRoleOverride !== null) {
            const ov = normalizeTrim(ann.sourceRoleOverride);
            if (!ov || !ROLE_RE.test(ov)) {
              pushFinding(findings, {
                code: 'source_capture_mapping_failure',
                path: 'humanSourceAnnotations.sourceRoleOverride',
                detail: 'invalid_role'
              });
              statusFlags.push('source_capture_mapping_failed');
              continue;
            }
            role = ov;
          }
          if (roleSeen[role]) {
            pushFinding(findings, {
              code: 'duplicate_source_role',
              path: 'sources.sourceRole',
              actual: role
            });
            statusFlags.push('source_capture_mapping_failed');
            continue;
          }
          roleSeen[role] = true;

          const tier = tierForScoutClass(srcCand.scoutClassState);
          if (!tier) {
            pushFinding(findings, {
              code: 'source_capture_mapping_failure',
              detail: 'authority_tier_unmapped'
            });
            statusFlags.push('source_capture_mapping_failed');
            continue;
          }

          const rawExcerpt = claim.rawEvidenceExcerpt;
          const shortExcerpt = uniqueText(
            rawExcerpt,
            claim.sourceLocator,
            excerptSeen
          );
          let normalizedClaim = uniqueText(
            claim.normalizedEvidenceSummary,
            claim.sourceLocator,
            claimSeen
          );
          if (normalizedClaim === shortExcerpt) {
            normalizedClaim = uniqueText(
              (claim.normalizedEvidenceSummary || 'claim') + ' support',
              claim.sourceLocator,
              claimSeen
            );
          }

          const mapped = {
            sourceRole: role,
            institution: srcCand.publisher,
            publisher: srcCand.publisher,
            sourceType: srcCand.sourceClass,
            authorityTier: tier,
            sourceTitle: srcCand.title,
            sourceReference: srcCand.normalizedUrl || srcCand.canonicalUrl,
            sourceIdentity: srcCand.normalizedUrl || srcCand.canonicalUrl,
            verifiedAt: ann.verifiedAt,
            shortExcerpt: shortExcerpt,
            normalizedClaim: normalizedClaim,
            reviewerSummary: normalizeTrim(ann.reviewerSummary),
            limitations: normalizeLimitations(claim.limitations),
            activeSupport: true
          };
          if (srcCand.publicationDate) mapped.publicationDate = srcCand.publicationDate;
          if (srcCand.lastUpdatedDate) mapped.sourceUpdateDate = srcCand.lastUpdatedDate;
          if (srcCand.author) mapped.author = srcCand.author;

          mappedSources.push(mapped);
          auditSources.push(
            freezeDeep({
              sourceCandidateId: claim.sourceCandidateId,
              claimCandidateId: claim.claimCandidateId,
              claimFingerprint: claim.claimFingerprint,
              sourceMetadataFingerprint: srcCand.sourceMetadataFingerprint,
              sourceLocator: claim.sourceLocator,
              rawEvidenceExcerpt: rawExcerpt,
              scoutClassState: srcCand.scoutClassState,
              authorityTier: tier,
              sourceRole: role,
              captureActive: true
            })
          );
        }

        // Preserve rejected + conflict material in audit
        const rejectedAudit = scoutRejected.map(function (r) {
          return freezeDeep({
            sourceCandidateId: r.sourceCandidateId,
            rejectionReasons: r.rejectionReasons || [],
            captureActive: false
          });
        });
        const conflictAudit = scoutConflicts.map(function (cg) {
          return freezeDeep({
            conflictGroupId: cg.conflictGroupId,
            field: cg.field,
            claimType: cg.claimType,
            values: cg.values || [],
            claimCandidateIds: cg.claimCandidateIds || [],
            captureActive: false
          });
        });

        if (scoutRejected.length > 0 && rejectedAudit.length === 0) {
          pushFinding(findings, {
            code: 'conflict_preservation_failure',
            detail: 'rejected_material_lost'
          });
          statusFlags.push('source_capture_mapping_failed');
        }

        if (
          statusFlags.indexOf('source_capture_mapping_failed') < 0 &&
          statusFlags.indexOf('integration_blocked') < 0 &&
          mappedSources.length >= 2
        ) {
          const opts = n.batchDraftOptions;
          const counts = asObject(opts.expectedArtifactCounts) || {};
          if (counts.evidencePackets !== mappedSources.length) {
            pushFinding(findings, {
              code: 'source_capture_mapping_failure',
              path: 'batchDraftOptions.expectedArtifactCounts.evidencePackets',
              expected: mappedSources.length,
              actual: counts.evidencePackets
            });
            statusFlags.push('source_capture_mapping_failed');
          } else {
            capturePacket = {
              captureContractVersion: SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION,
              batchId: opts.batchId,
              canonicalKey: id.canonicalKey,
              acceptedScientificName: id.acceptedScientificName,
              identityReference: opts.identityReference,
              field: sel.field,
              reviewedClaimType: sel.claimType,
              proposedValue: sel.candidateValue,
              contextScope: asnap.targetContext,
              expectedArtifactCounts: {
                evidencePackets: mappedSources.length,
                fieldReviewRecords: counts.fieldReviewRecords || 1,
                structuredClimateProfiles: counts.structuredClimateProfiles || 1
              },
              sources: mappedSources
            };

            // Ensure only Capture-legal top-level keys
            const pktKeys = Object.keys(capturePacket);
            for (let k = 0; k < pktKeys.length; k++) {
              if (SR_REVIEWED_DATA_SOURCE_CAPTURE_TOP_LEVEL_KEYS.indexOf(pktKeys[k]) < 0) {
                pushFinding(findings, {
                  code: 'source_capture_mapping_failure',
                  path: pktKeys[k],
                  detail: 'illegal_capture_key'
                });
                statusFlags.push('source_capture_mapping_failed');
              }
            }

            const beforeCapture = stableSerialize(capturePacket);
            const fpRes = buildReviewedDataCaptureContentFingerprint(capturePacket);
            if (!fpRes.ok || !fpRes.fingerprint) {
              pushFinding(findings, {
                code: 'source_capture_mapping_failure',
                detail: 'content_fingerprint_failed',
                actual: fpRes.reasons || null
              });
              statusFlags.push('source_capture_mapping_failed');
            } else {
              captureContentFp = fpRes.fingerprint;
              counters.sourceCaptureMappings = 1;
              pushFinding(findings, {
                code: 'source_capture_draft_created',
                detail: 'capture_content_fingerprint_bound'
              });
              pushFinding(findings, {
                code: 'human_review_required',
                detail: 'gates_a_b_or_field_review'
              });
              if (rejectedAudit.length > 0) {
                pushFinding(findings, {
                  code: 'rejected_material_preserved',
                  detail: String(rejectedAudit.length)
                });
              }
              if (conflictAudit.length > 0) {
                pushFinding(findings, {
                  code: 'conflict_material_preserved',
                  detail: String(conflictAudit.length)
                });
              }
              pushFinding(findings, {
                code: 'product_authority_not_granted',
                detail: 'authority_boundary_false'
              });

              mappingAudit = freezeDeep({
                selectedDraftGroupReference: sel,
                captureActiveSources: auditSources,
                rejectedSources: rejectedAudit,
                conflictGroups: conflictAudit,
                auditClaimCandidateIds: auditIds,
                originalExcerpts: auditSources.map(function (s) {
                  return s.rawEvidenceExcerpt;
                })
              });

              captureDraftRef = buildCaptureDraftReference(
                capturePacket,
                captureContentFp,
                n.humanGateABApproval ? 'approved_pending_attach' : 'pending_ab'
              );

              const afterCaptureMap = stableSerialize(capturePacket);
              if (beforeCapture !== afterCaptureMap) {
                pushFinding(findings, {
                  code: 'capture_packet_mutation_detected',
                  detail: 'during_fingerprint'
                });
              }

              const pendingPath =
                n.humanGateABApproval === null || n.humanGateABApproval === undefined;

              if (pendingPath) {
                handoffState = 'human_review_required';
                statusFlags.push('source_capture_draft_ready');
                captureDraftRef = buildCaptureDraftReference(
                  capturePacket,
                  captureContentFp,
                  'pending_ab'
                );
                captureValRef = null;
                batchPrepRef = null;
              } else {
                const ab = asObject(n.humanGateABApproval);
                if (!ab) {
                  pushFinding(findings, {
                    code: 'missing_human_gate_ab',
                    path: 'humanGateABApproval'
                  });
                  statusFlags.push('human_review_required');
                } else {
                  const gates = Array.isArray(ab.approvedGates)
                    ? ab.approvedGates.map(function (g) {
                        return String(g).trim().toUpperCase();
                      })
                    : [];
                  const gatesOk =
                    gates.length === 2 &&
                    gates.indexOf('A') >= 0 &&
                    gates.indexOf('B') >= 0;
                  if (
                    ab.approved !== true ||
                    !gatesOk ||
                    !normalizeTrim(ab.approvalVersion) ||
                    !isIsoDate(ab.approvedAt) ||
                    !normalizeTrim(ab.approverRole) ||
                    ab.sourcesIndependenceDeclared !== true ||
                    ab.excerptsHumanVerified !== true
                  ) {
                    pushFinding(findings, {
                      code: 'invalid_human_gate_ab',
                      path: 'humanGateABApproval'
                    });
                    statusFlags.push('human_review_required');
                  } else if (
                    ab.expectedCaptureContentFingerprint !== captureContentFp
                  ) {
                    pushFinding(findings, {
                      code: 'invalid_human_gate_ab',
                      path: 'humanGateABApproval.expectedCaptureContentFingerprint',
                      detail: 'content_fingerprint_mismatch',
                      expected: captureContentFp,
                      actual: ab.expectedCaptureContentFingerprint
                    });
                    statusFlags.push('human_review_required');
                  } else {
                    const approvedPacket = Object.assign({}, capturePacket, {
                      humanApproval: {
                        approvalVersion: ab.approvalVersion,
                        approvedAt: ab.approvedAt,
                        approverRole: ab.approverRole,
                        approvedGates: ['A', 'B'],
                        approved: true,
                        expectedCaptureContentFingerprint: captureContentFp,
                        sourcesIndependenceDeclared: true,
                        excerptsHumanVerified: true
                      }
                    });
                    const beforeApproved = stableSerialize(approvedPacket);
                    const validation = validateReviewedDataSourceCapturePacket(
                      approvedPacket
                    );
                    counters.sourceCaptureValidations = 1;
                    captureValRef = buildCaptureValidationReference(
                      validation,
                      captureContentFp,
                      true
                    );
                    const afterApproved = stableSerialize(approvedPacket);
                    if (beforeApproved !== afterApproved) {
                      pushFinding(findings, {
                        code: 'capture_packet_mutation_detected',
                        detail: 'during_validation'
                      });
                    }
                    if (!validation.valid) {
                      pushFinding(findings, {
                        code: 'source_capture_validation_blocked',
                        detail: 'capture_validation_failed',
                        actual: validation.errorCount
                      });
                      statusFlags.push('source_capture_mapping_failed');
                    } else {
                      pushFinding(findings, {
                        code: 'human_gate_ab_verified',
                        detail: 'gates_a_b'
                      });
                      const beforePrepPacket = stableSerialize(
                        validation.normalized || approvedPacket
                      );
                      const prep = prepareReviewedDataBatchDraft(
                        validation.normalized || approvedPacket
                      );
                      counters.batchDraftPreparations = 1;
                      const afterPrepPacket = stableSerialize(
                        validation.normalized || approvedPacket
                      );
                      if (beforePrepPacket !== afterPrepPacket) {
                        pushFinding(findings, {
                          code: 'capture_packet_mutation_detected',
                          detail: 'during_prepare'
                        });
                      }
                      batchPrepRef = buildBatchPrepReference(prep);
                      if (
                        !prep ||
                        (prep.ok !== true && prep.valid !== true) ||
                        prep.workflowState !==
                          SR_REVIEWED_DATA_BATCH_DRAFT_WORKFLOW_STAGE1 ||
                        prep.fieldReviewApprovalRequired !== true
                      ) {
                        pushFinding(findings, {
                          code: 'batch_draft_prepare_failure',
                          detail: 'prepare_or_workflow_failed',
                          actual: prep ? prep.workflowState : null
                        });
                        statusFlags.push('integration_failed');
                      } else {
                        preparedDraft = prep.preparedDraft || null;
                        const beforePrepared = preparedDraft
                          ? stableSerialize(preparedDraft)
                          : null;
                        // Touch-read only; no mutation expected
                        if (
                          preparedDraft &&
                          beforePrepared !== stableSerialize(preparedDraft)
                        ) {
                          pushFinding(findings, {
                            code: 'prepared_draft_mutation_detected'
                          });
                        }
                        pushFinding(findings, {
                          code: 'batch_draft_prepared',
                          detail: prep.preparedDraftFingerprint || null
                        });
                        pushFinding(findings, {
                          code: 'field_review_approval_required',
                          detail: 'generator_workflow_stage1'
                        });
                        handoffState = 'human_review_required';
                        statusFlags.push('batch_draft_prepared');
                        captureDraftRef = buildCaptureDraftReference(
                          validation.normalized || approvedPacket,
                          captureContentFp,
                          'approved_ab'
                        );
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  } else if (!n) {
    statusFlags.push('integration_input_invalid');
  }

  const afterInput = stableSerialize(input);
  if (beforeInput !== afterInput) {
    pushFinding(findings, { code: 'input_mutation_detected' });
    statusFlags.push('integration_failed');
  }
  if (
    scoutBefore !== null &&
    asObject(input) &&
    asObject(input.sourceScoutResult) &&
    scoutBefore !== stableSerialize(input.sourceScoutResult)
  ) {
    pushFinding(findings, { code: 'scout_result_mutation_detected' });
    statusFlags.push('integration_failed');
  }

  const sortedFindings = sortIntegrationFindings(findings);
  const hardErrors = sortedFindings.filter(function (f) {
    return SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_HARD_FINDINGS.indexOf(f.code) >= 0;
  });
  for (let i = 0; i < sortedFindings.length; i++) {
    if (
      SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_INFO_FINDINGS.indexOf(
        sortedFindings[i].code
      ) >= 0 ||
      sortedFindings[i].severity === 'warning'
    ) {
      warnings.push(sortedFindings[i]);
    }
  }

  if (hardErrors.length && statusFlags.length === 0) {
    statusFlags.push('integration_failed');
  }

  const status = resolveStatus(statusFlags.length ? statusFlags : ['integration_failed']);

  const mutationCheck = freezeDeep({
    inputUnchanged: beforeInput === afterInput,
    scoutResultUnchanged:
      scoutBefore === null ||
      (asObject(input) &&
        asObject(input.sourceScoutResult) &&
        scoutBefore === stableSerialize(input.sourceScoutResult)),
    capturePacketUnchanged: true,
    preparedDraftUnchanged: true,
    deterministic: true
  });

  const summaryFp = buildSummaryFingerprint({
    status: status,
    sourceScoutReference: scoutRef,
    sourceCaptureDraftReference: captureDraftRef,
    sourceCaptureValidationReference: captureValRef,
    batchDraftPreparationReference: batchPrepRef,
    nestedWorkflowState: batchPrepRef ? batchPrepRef.workflowState : null,
    findings: sortedFindings,
    warnings: sortIntegrationFindings(warnings),
    authorityBoundary: authorityBoundary(),
    mutationCheck: mutationCheck,
    workflowCounters: counters,
    mappingAudit: mappingAudit
      ? {
          rejectedCount: mappingAudit.rejectedSources.length,
          conflictCount: mappingAudit.conflictGroups.length,
          captureActiveCount: mappingAudit.captureActiveSources.length
        }
      : null
  });

  // Determinism self-check
  const summaryFp2 = buildSummaryFingerprint({
    status: status,
    sourceScoutReference: scoutRef,
    sourceCaptureDraftReference: captureDraftRef,
    sourceCaptureValidationReference: captureValRef,
    batchDraftPreparationReference: batchPrepRef,
    nestedWorkflowState: batchPrepRef ? batchPrepRef.workflowState : null,
    findings: sortedFindings,
    warnings: sortIntegrationFindings(warnings),
    authorityBoundary: authorityBoundary(),
    mutationCheck: mutationCheck,
    workflowCounters: counters,
    mappingAudit: mappingAudit
      ? {
          rejectedCount: mappingAudit.rejectedSources.length,
          conflictCount: mappingAudit.conflictGroups.length,
          captureActiveCount: mappingAudit.captureActiveSources.length
        }
      : null
  });
  if (summaryFp !== summaryFp2) {
    pushFinding(findings, { code: 'nondeterministic_integration_output' });
  }

  const finalFindings = sortIntegrationFindings(findings);

  return freezeDeep({
    descriptor: DESCRIPTOR,
    integrationContractVersion: SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_CONTRACT_VERSION,
    integrationResultContractVersion:
      SR_SOURCE_SCOUT_BATCH_DRAFT_INTEGRATION_RESULT_CONTRACT_VERSION,
    status: status,
    sourceScoutReference: scoutRef,
    sourceCaptureDraftReference: captureDraftRef,
    sourceCaptureValidationReference: captureValRef,
    batchDraftPreparationReference: batchPrepRef,
    mappingAudit: mappingAudit,
    findings: finalFindings,
    warnings: sortIntegrationFindings(warnings),
    handoffState: handoffState,
    authorityBoundary: authorityBoundary(),
    inputFingerprint: inputFp,
    summaryFingerprint: summaryFp,
    mutationCheck: mutationCheck,
    workflowCounters: freezeDeep(counters),
    scoutDescriptor: getSmartRecDeveloperReviewedDataSourceScoutDescriptor(),
    captureDescriptor: getSmartRecDeveloperReviewedDataSourceCaptureDescriptor(),
    generatorDescriptor: getSmartRecDeveloperReviewedDataBatchDraftGeneratorDescriptor()
  });
}
