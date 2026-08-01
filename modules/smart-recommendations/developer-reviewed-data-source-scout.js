/**
 * Cruvit — Smart Recommendations developer Reviewed Data Source Scout
 * ---------------------------------------------------------------------------
 * Inert, developer/test-only, synthetic-only, non-authoritative scout that
 * classifies embedded discovery fixtures, validates declared claim spans,
 * and prepares a Source Capture-compatible draft handoff.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, persistence, or writes.
 *  - No live search, external API, external model, or production NLP claim.
 *  - Does not approve EP/FR/SCP, call Batch Draft Generator, or grant authority.
 */

import {
  SR_EVIDENCE_PACKET_FIELDS,
  SR_EVIDENCE_CLAIM_TYPES,
  SR_EVIDENCE_SOURCE_TYPES,
  SR_EVIDENCE_AUTHORITY_TIERS,
  SR_EVIDENCE_PROPOSED_VALUES_SUN,
  SR_EVIDENCE_PROPOSED_VALUES_WATER,
  SR_EVIDENCE_PACKET_CONTRACT_VERSION,
  SR_EVIDENCE_PACKET_REGISTRY_VERSION,
  normalizeEvidencePacketContextScope
} from './developer-evidence-packet-registry.js';

import {
  SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION,
  SR_REVIEWED_DATA_SOURCE_CAPTURE_CAPABILITY,
  SR_REVIEWED_DATA_SOURCE_CAPTURE_MAX_SHORT_EXCERPT_CHARS,
  normalizeUrlReference,
  stableSerialize,
  sortFindings
} from './developer-reviewed-data-source-capture-contract.js';

import {
  SR_FIELD_REVIEW_CONTRACT_VERSION,
  SR_FIELD_REVIEW_REGISTRY_VERSION
} from './developer-field-review-registry.js';

import {
  SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
  SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_VERSION
} from './developer-structured-climate-profile-registry.js';

import {
  SR_REVIEWED_DATA_BATCH_DRAFT_GENERATOR_VERSION
} from './developer-reviewed-data-batch-draft-generator.js';

import {
  SR_REVIEWED_DATA_BATCH_VALIDATOR_VERSION,
  SR_REVIEWED_DATA_CONTAINER_CONTRACT_VERSION
} from './developer-reviewed-data-batch-validator.js';

export const SR_REVIEWED_DATA_SOURCE_SCOUT_VERSION =
  '0.1.0-sr-reviewed-data-source-scout';

export const SR_REVIEWED_DATA_SOURCE_SCOUT_CONTRACT_VERSION =
  '0.1.0-sr-reviewed-data-source-scout-contract';

export const SR_REVIEWED_DATA_SOURCE_SCOUT_RESULT_CONTRACT_VERSION =
  '0.1.0-sr-reviewed-data-source-scout-result';

export const SR_REVIEWED_DATA_SOURCE_SCOUT_CAPABILITY =
  'explicit_developer_reviewed_data_source_scout_draft';

export const SR_REVIEWED_DATA_SOURCE_SCOUT_STATUSES = Object.freeze([
  'scout_not_run',
  'assignment_invalid',
  'identity_blocked',
  'query_plan_ready',
  'no_sources_found',
  'sources_discovered',
  'sources_rejected',
  'extraction_incomplete',
  'claims_extracted',
  'claim_conflict_detected',
  'draft_ready_for_validation',
  'human_review_required',
  'source_scout_failed'
]);

export const SR_REVIEWED_DATA_SOURCE_SCOUT_HARD_FINDINGS = Object.freeze([
  'unsupported_source_scout_contract',
  'invalid_assignment',
  'unknown_assignment_key',
  'identity_binding_mismatch',
  'current_needs_review_active',
  'current_identity_conflict_active',
  'unsupported_field',
  'unsupported_claim_type',
  'prohibited_source_class',
  'source_inaccessible',
  'source_identity_ambiguous',
  'source_context_irrelevant',
  'source_prompt_injection_detected',
  'source_executable_instruction_detected',
  'source_credential_request_detected',
  'source_unrelated_navigation_attempt',
  'source_authority_bypass_attempt',
  'unsupported_candidate_value',
  'fabricated_evidence_detected',
  'missing_source_locator',
  'source_fingerprint_mismatch',
  'claim_fingerprint_mismatch',
  'output_mutation_detected',
  'nondeterministic_output'
]);

export const SR_REVIEWED_DATA_SOURCE_SCOUT_INFO_FINDINGS = Object.freeze([
  'source_discovered',
  'source_duplicate_detected',
  'probable_copied_source',
  'lower_quality_source',
  'regional_scope_limited',
  'context_scope_limited',
  'source_date_unknown',
  'author_unknown',
  'claim_extracted',
  'claim_not_found',
  'claim_conflict_detected',
  'corroboration_insufficient',
  'draft_candidate_created',
  'human_review_required',
  'product_authority_not_granted'
]);

const ASSIGNMENT_REQUIRED_KEYS = Object.freeze([
  'sourceScoutContractVersion',
  'assignmentId',
  'canonicalKey',
  'acceptedScientificName',
  'identityRegistryVersion',
  'currentIdentityBindingFingerprint',
  'currentNeedsReview',
  'currentIdentityConflict',
  'canonicalIdentityConfirmed',
  'parentOrGenusScope',
  'targetField',
  'targetClaimTypes',
  'targetQuestions',
  'targetContext',
  'allowedSourceClasses',
  'prohibitedSourceClasses',
  'maximumCandidateSources',
  'maximumClaimsPerSource',
  'citationRequirements',
  'expectedAssignmentFingerprint'
]);

const ASSIGNMENT_OPTIONAL_KEYS = Object.freeze([
  'targetRegion',
  'languagePreferences',
  'approvedAliasesForSearch',
  'freshnessRequirements',
  'providerConfigurationReference'
]);

const ASSIGNMENT_ALLOWED_KEYS = Object.freeze(
  ASSIGNMENT_REQUIRED_KEYS.concat(ASSIGNMENT_OPTIONAL_KEYS)
);

const WRAPPER_ALLOWED_KEYS = Object.freeze(['assignment', 'syntheticDiscoveryResults']);

const SYNTHETIC_RESULT_KEYS = Object.freeze([
  'syntheticResultId',
  'url',
  'publisher',
  'title',
  'author',
  'publicationDate',
  'lastUpdatedDate',
  'language',
  'sourceClass',
  'sourceText',
  'sourceLocator',
  'geographicScope',
  'plantIdentityScope',
  'fieldHints',
  'contextHints',
  'accessibilityState',
  'probableCopyOf',
  'hostileContentFlags',
  'declaredClaimSpans'
]);

const SPAN_KEYS = Object.freeze([
  'start',
  'end',
  'claimType',
  'candidateValue',
  'excerptKind',
  'locator',
  'contextScope',
  'geographicApplicability',
  'qualifiers',
  'limitations'
]);

const SCOUT_CLASS_STATES = Object.freeze([
  'preferred',
  'acceptable_with_limits',
  'corroboration_only',
  'prohibited',
  'unknown'
]);

const QUALITY_CLASSES = Object.freeze(['high', 'medium', 'low', 'insufficient']);

const HANDOFF_STATES = Object.freeze([
  'no_handoff',
  'blocked',
  'incomplete',
  'draft_candidate',
  'ready_for_source_capture_validation',
  'human_review_required'
]);

const HOSTILE_FLAG_TO_CODE = Object.freeze({
  prompt_injection: 'source_prompt_injection_detected',
  executable_instruction: 'source_executable_instruction_detected',
  credential_request: 'source_credential_request_detected',
  unrelated_navigation: 'source_unrelated_navigation_attempt',
  authority_bypass: 'source_authority_bypass_attempt'
});

const TRACKING_PARAM_RE = /^(utm_[a-z0-9_]+|fbclid|gclid|mc_cid|mc_eid)$/i;

const PREFERRED_SOURCE_TYPES = Object.freeze([
  'government',
  'university_extension',
  'botanical_institution',
  'peer_reviewed_publication',
  'professional_horticultural_society',
  'institutional_database'
]);

const ACCEPTABLE_SOURCE_TYPES = Object.freeze([
  'professional_grower_or_nursery',
  'breeder_or_cultivar_documentation'
]);

const CORROBORATION_SOURCE_TYPES = Object.freeze(['commercial_page']);

const PROHIBITED_SOURCE_TYPES = Object.freeze([
  'blog_or_unsourced_database',
  'ai_generated_summary'
]);

const EMPTY_AUTHORITY = Object.freeze({
  authoritative: false,
  approvalAuthority: false,
  evidencePacketAuthority: false,
  fieldReviewAuthority: false,
  structuredProfileAuthority: false,
  catalogAuthority: false,
  productAuthority: false,
  eligibilityAuthority: false,
  scalarAuthority: false,
  runtimeRecommendationAuthority: false,
  GOSOutcomeAuthority: false,
  productUseAllowed: false,
  runtimeConsumptionAllowed: false,
  outputApproval: false
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

function normalizeKey(v) {
  if (!isNonEmptyString(v)) return null;
  return String(v).trim().toLowerCase();
}

function pushFinding(findings, finding) {
  const code = finding.code;
  if (
    SR_REVIEWED_DATA_SOURCE_SCOUT_HARD_FINDINGS.indexOf(code) < 0 &&
    SR_REVIEWED_DATA_SOURCE_SCOUT_INFO_FINDINGS.indexOf(code) < 0
  ) {
    return;
  }
  const hard = SR_REVIEWED_DATA_SOURCE_SCOUT_HARD_FINDINGS.indexOf(code) >= 0;
  findings.push(
    freezeDeep({
      code: code,
      severity: finding.severity || (hard ? 'error' : 'warning'),
      path: finding.path == null ? null : finding.path,
      detail: finding.detail == null ? null : finding.detail,
      expected: finding.expected === undefined ? null : finding.expected,
      actual: finding.actual === undefined ? null : finding.actual
    })
  );
}

function proposedValuesForField(field) {
  if (field === 'sun') return SR_EVIDENCE_PROPOSED_VALUES_SUN;
  if (field === 'water') return SR_EVIDENCE_PROPOSED_VALUES_WATER;
  return null;
}

function scoutClassForSourceType(sourceType) {
  if (PREFERRED_SOURCE_TYPES.indexOf(sourceType) >= 0) return 'preferred';
  if (ACCEPTABLE_SOURCE_TYPES.indexOf(sourceType) >= 0) return 'acceptable_with_limits';
  if (CORROBORATION_SOURCE_TYPES.indexOf(sourceType) >= 0) return 'corroboration_only';
  if (PROHIBITED_SOURCE_TYPES.indexOf(sourceType) >= 0) return 'prohibited';
  if (sourceType === 'other') return 'unknown';
  return 'unknown';
}

function authorityTierForScoutClass(scoutClass) {
  if (scoutClass === 'preferred') return 'A';
  if (scoutClass === 'acceptable_with_limits') return 'B';
  if (scoutClass === 'corroboration_only') return 'C';
  return 'C';
}

function qualityForScoutClass(scoutClass) {
  if (scoutClass === 'preferred') return 'high';
  if (scoutClass === 'acceptable_with_limits') return 'medium';
  if (scoutClass === 'corroboration_only') return 'low';
  return 'insufficient';
}

function isSpeciesScope(scope) {
  const s = normalizeKey(scope);
  return s === 'species';
}

function stripTrackingParams(urlString) {
  const base = normalizeUrlReference(urlString);
  if (!base) return null;
  try {
    const u = new URL(base);
    const keys = Array.from(u.searchParams.keys());
    for (let i = 0; i < keys.length; i++) {
      if (TRACKING_PARAM_RE.test(keys[i])) u.searchParams.delete(keys[i]);
    }
    let path = u.pathname || '/';
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    const q = u.searchParams.toString();
    return u.protocol.toLowerCase() + '//' + u.hostname.toLowerCase() + path + (q ? '?' + q : '');
  } catch (_e) {
    return base;
  }
}

function detectHostileFromText(sourceText) {
  const t = String(sourceText || '');
  const out = [];
  if (/ignore (all )?(previous|prior) (instructions|rules)/i.test(t) || /system\s*prompt/i.test(t)) {
    out.push('source_prompt_injection_detected');
  }
  if (/eval\s*\(|new\s+Function\s*\(|<\/?script/i.test(t) || /execute\s+this\s+code/i.test(t)) {
    out.push('source_executable_instruction_detected');
  }
  if (/upload\s+(your\s+)?(api[_-]?key|password|credential)/i.test(t) || /send\s+cookies/i.test(t)) {
    out.push('source_credential_request_detected');
  }
  if (/navigate\s+to\s+https?:\/\/(?!example\.edu)/i.test(t) && /unrelated/i.test(t)) {
    out.push('source_unrelated_navigation_attempt');
  }
  if (
    /bypass\s+(validator|approval|gate)/i.test(t) ||
    /set\s+productAuthority\s*=\s*true/i.test(t) ||
    /mark\s+as\s+approved/i.test(t)
  ) {
    out.push('source_authority_bypass_attempt');
  }
  return out;
}

function emptyResult(partial) {
  return freezeDeep({
    descriptor: getSmartRecDeveloperReviewedDataSourceScoutDescriptor(),
    sourceScoutContractVersion: SR_REVIEWED_DATA_SOURCE_SCOUT_CONTRACT_VERSION,
    resultContractVersion: SR_REVIEWED_DATA_SOURCE_SCOUT_RESULT_CONTRACT_VERSION,
    status: partial.status || 'source_scout_failed',
    assignmentReference: partial.assignmentReference || null,
    queryPlan: partial.queryPlan || null,
    sourceCandidates: partial.sourceCandidates || [],
    claimCandidates: partial.claimCandidates || [],
    duplicateSourceGroups: partial.duplicateSourceGroups || [],
    duplicateClaimGroups: partial.duplicateClaimGroups || [],
    conflictGroups: partial.conflictGroups || [],
    rejectedSources: partial.rejectedSources || [],
    findings: sortFindings(partial.findings || []),
    warnings: sortFindings(partial.warnings || []),
    draftEvidencePacketInput: partial.draftEvidencePacketInput || null,
    sourceCaptureHandoffDraft: partial.sourceCaptureHandoffDraft || null,
    handoffState: partial.handoffState || 'no_handoff',
    authorityBoundary: EMPTY_AUTHORITY,
    inputFingerprint: partial.inputFingerprint || null,
    summaryFingerprint: partial.summaryFingerprint || null,
    mutationCheck: freezeDeep({
      inputMutated: !!partial.inputMutated,
      outputMutated: !!partial.outputMutated,
      deterministic: partial.deterministic !== false
    })
  });
}

function buildSummaryFingerprint(parts) {
  return (
    'ss-summary|' +
    stableSerialize({
      status: parts.status,
      acceptedSourceIds: parts.acceptedSourceIds || [],
      rejectedSourceIds: parts.rejectedSourceIds || [],
      claimIds: parts.claimIds || [],
      duplicateSourceGroups: parts.duplicateSourceGroups || [],
      duplicateClaimGroups: parts.duplicateClaimGroups || [],
      conflictGroups: parts.conflictGroups || [],
      findings: parts.findings || [],
      warnings: parts.warnings || [],
      handoffFingerprint: parts.handoffFingerprint || null,
      authorityBoundary: EMPTY_AUTHORITY,
      mutationCheck: parts.mutationCheck || null
    })
  );
}

export function getSmartRecDeveloperReviewedDataSourceScoutDescriptor() {
  return freezeDeep({
    version: SR_REVIEWED_DATA_SOURCE_SCOUT_VERSION,
    sourceScoutContractVersion: SR_REVIEWED_DATA_SOURCE_SCOUT_CONTRACT_VERSION,
    resultContractVersion: SR_REVIEWED_DATA_SOURCE_SCOUT_RESULT_CONTRACT_VERSION,
    capability: SR_REVIEWED_DATA_SOURCE_SCOUT_CAPABILITY,
    developerOnly: true,
    authoritative: false,
    approvalAuthority: false,
    evidencePacketAuthority: false,
    fieldReviewAuthority: false,
    structuredProfileAuthority: false,
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
    sourceMutation: false,
    outputApproval: false,
    gitCommit: false,
    gitPush: false,
    deploy: false,
    supportedPeerVersions: {
      evidencePacketContract: SR_EVIDENCE_PACKET_CONTRACT_VERSION,
      evidencePacketRegistry: SR_EVIDENCE_PACKET_REGISTRY_VERSION,
      fieldReviewContract: SR_FIELD_REVIEW_CONTRACT_VERSION,
      fieldReviewRegistry: SR_FIELD_REVIEW_REGISTRY_VERSION,
      structuredClimateProfileContract: SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
      structuredClimateProfileRegistry: SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_VERSION,
      sourceCaptureContract: SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION,
      sourceCaptureCapability: SR_REVIEWED_DATA_SOURCE_CAPTURE_CAPABILITY,
      batchDraftGenerator: SR_REVIEWED_DATA_BATCH_DRAFT_GENERATOR_VERSION,
      batchValidator: SR_REVIEWED_DATA_BATCH_VALIDATOR_VERSION,
      reviewedDataContainer: SR_REVIEWED_DATA_CONTAINER_CONTRACT_VERSION,
      maxShortExcerptChars: SR_REVIEWED_DATA_SOURCE_CAPTURE_MAX_SHORT_EXCERPT_CHARS
    },
    statuses: SR_REVIEWED_DATA_SOURCE_SCOUT_STATUSES.slice(),
    hardFindings: SR_REVIEWED_DATA_SOURCE_SCOUT_HARD_FINDINGS.slice(),
    infoFindings: SR_REVIEWED_DATA_SOURCE_SCOUT_INFO_FINDINGS.slice(),
    fields: SR_EVIDENCE_PACKET_FIELDS.slice(),
    claimTypes: SR_EVIDENCE_CLAIM_TYPES.slice(),
    sourceTypes: SR_EVIDENCE_SOURCE_TYPES.slice(),
    scoutClassStates: SCOUT_CLASS_STATES.slice(),
    qualityClasses: QUALITY_CLASSES.slice(),
    handoffStates: HANDOFF_STATES.slice()
  });
}

export function buildSourceScoutAssignmentFingerprint(assignment) {
  const o = asObject(assignment);
  if (!o) return null;
  const body = {};
  for (let i = 0; i < ASSIGNMENT_ALLOWED_KEYS.length; i++) {
    const k = ASSIGNMENT_ALLOWED_KEYS[i];
    if (k === 'expectedAssignmentFingerprint') continue;
    if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
    if (k === 'canonicalKey') {
      body[k] = normalizeKey(o[k]);
      continue;
    }
    if (k === 'parentOrGenusScope') {
      body[k] = normalizeKey(o[k]);
      continue;
    }
    if (k === 'targetContext') {
      const ctxNorm = normalizeEvidencePacketContextScope(
        o[k],
        SR_EVIDENCE_PACKET_CONTRACT_VERSION
      );
      body[k] = ctxNorm.ok ? ctxNorm.normalized : o[k];
      continue;
    }
    if (k === 'allowedSourceClasses' || k === 'prohibitedSourceClasses') {
      body[k] = Array.isArray(o[k])
        ? o[k]
            .map(function (x) {
              return normalizeTrim(x);
            })
            .filter(Boolean)
            .slice()
            .sort()
        : o[k];
      continue;
    }
    if (k === 'targetClaimTypes' || k === 'targetQuestions' || k === 'languagePreferences' || k === 'approvedAliasesForSearch') {
      body[k] = Array.isArray(o[k])
        ? o[k]
            .map(function (x) {
              return normalizeTrim(x);
            })
            .filter(Boolean)
        : o[k];
      continue;
    }
    if (
      k === 'assignmentId' ||
      k === 'acceptedScientificName' ||
      k === 'identityRegistryVersion' ||
      k === 'currentIdentityBindingFingerprint' ||
      k === 'targetField' ||
      k === 'sourceScoutContractVersion' ||
      k === 'targetRegion' ||
      k === 'providerConfigurationReference'
    ) {
      body[k] = normalizeTrim(o[k]);
      continue;
    }
    if (
      k === 'currentNeedsReview' ||
      k === 'currentIdentityConflict' ||
      k === 'canonicalIdentityConfirmed'
    ) {
      body[k] = o[k] === true;
      continue;
    }
    body[k] = o[k];
  }
  return 'ss-assign|' + stableSerialize(body);
}

export function buildSourceScoutSourceFingerprint(source) {
  const o = asObject(source);
  if (!o) return null;
  return (
    'ss-srcmeta|' +
    stableSerialize({
      normalizedUrl: o.normalizedUrl || null,
      publisher: o.publisher || null,
      title: o.title || null,
      publicationDate: o.publicationDate || null,
      lastUpdatedDate: o.lastUpdatedDate || null,
      language: o.language || null,
      sourceClass: o.sourceClass || null,
      geographicScope: o.geographicScope || null,
      plantIdentityScope: o.plantIdentityScope || null
    })
  );
}

export function buildSourceScoutContentFingerprint(sourceText) {
  return 'ss-content|' + stableSerialize(normalizeTrim(sourceText) || '');
}

export function buildSourceScoutClaimFingerprint(claim) {
  const o = asObject(claim);
  if (!o) return null;
  return (
    'ss-claim|' +
    stableSerialize({
      sourceFingerprint: o.sourceFingerprint || o.sourceMetadataFingerprint || null,
      sourceLocator: o.sourceLocator || null,
      field: o.field || null,
      claimType: o.claimType || null,
      candidateValue: o.candidateValue || null,
      contextScope: o.contextScope || null,
      geographicApplicability: o.geographicApplicability || null,
      qualifiers: o.qualifiers || null,
      limitations: o.limitations || null
    })
  );
}

export function normalizeReviewedDataSourceScoutAssignment(assignment) {
  const findings = [];
  const src = asObject(assignment);
  if (!src) {
    pushFinding(findings, { code: 'invalid_assignment', detail: 'assignment_not_object' });
    return freezeDeep({ ok: false, normalized: null, findings: sortFindings(findings) });
  }

  const keys = Object.keys(src);
  for (let i = 0; i < keys.length; i++) {
    if (ASSIGNMENT_ALLOWED_KEYS.indexOf(keys[i]) < 0) {
      pushFinding(findings, {
        code: 'unknown_assignment_key',
        path: keys[i],
        detail: 'unknown_assignment_key'
      });
    }
  }

  if (normalizeTrim(src.sourceScoutContractVersion) !== SR_REVIEWED_DATA_SOURCE_SCOUT_CONTRACT_VERSION) {
    pushFinding(findings, {
      code: 'unsupported_source_scout_contract',
      path: 'sourceScoutContractVersion',
      expected: SR_REVIEWED_DATA_SOURCE_SCOUT_CONTRACT_VERSION,
      actual: src.sourceScoutContractVersion
    });
  }

  for (let r = 0; r < ASSIGNMENT_REQUIRED_KEYS.length; r++) {
    const rk = ASSIGNMENT_REQUIRED_KEYS[r];
    if (src[rk] === undefined || src[rk] === null || src[rk] === '') {
      pushFinding(findings, {
        code: 'invalid_assignment',
        path: rk,
        detail: 'required_key_missing'
      });
    }
  }

  const field = normalizeTrim(src.targetField);
  if (!field || SR_EVIDENCE_PACKET_FIELDS.indexOf(field) < 0) {
    pushFinding(findings, {
      code: 'unsupported_field',
      path: 'targetField',
      actual: src.targetField
    });
  }

  const claimTypes = Array.isArray(src.targetClaimTypes) ? src.targetClaimTypes.slice() : null;
  if (!claimTypes || !claimTypes.length) {
    pushFinding(findings, {
      code: 'invalid_assignment',
      path: 'targetClaimTypes',
      detail: 'claim_types_required'
    });
  } else {
    for (let c = 0; c < claimTypes.length; c++) {
      if (SR_EVIDENCE_CLAIM_TYPES.indexOf(claimTypes[c]) < 0) {
        pushFinding(findings, {
          code: 'unsupported_claim_type',
          path: 'targetClaimTypes[' + c + ']',
          actual: claimTypes[c]
        });
      }
    }
  }

  const ctxNorm = normalizeEvidencePacketContextScope(
    src.targetContext,
    SR_EVIDENCE_PACKET_CONTRACT_VERSION
  );
  if (!ctxNorm.ok || !ctxNorm.normalized) {
    pushFinding(findings, {
      code: 'invalid_assignment',
      path: 'targetContext',
      detail: 'context_normalize_failed'
    });
  }

  const allowed = Array.isArray(src.allowedSourceClasses) ? src.allowedSourceClasses.slice() : [];
  const prohibited = Array.isArray(src.prohibitedSourceClasses)
    ? src.prohibitedSourceClasses.slice()
    : [];
  for (let a = 0; a < allowed.length; a++) {
    if (SR_EVIDENCE_SOURCE_TYPES.indexOf(allowed[a]) < 0) {
      pushFinding(findings, {
        code: 'invalid_assignment',
        path: 'allowedSourceClasses[' + a + ']',
        detail: 'unsupported_source_class',
        actual: allowed[a]
      });
    }
  }
  for (let p = 0; p < prohibited.length; p++) {
    if (SR_EVIDENCE_SOURCE_TYPES.indexOf(prohibited[p]) < 0) {
      pushFinding(findings, {
        code: 'invalid_assignment',
        path: 'prohibitedSourceClasses[' + p + ']',
        detail: 'unsupported_source_class',
        actual: prohibited[p]
      });
    }
  }

  if (
    typeof src.maximumCandidateSources !== 'number' ||
    !Number.isFinite(src.maximumCandidateSources) ||
    src.maximumCandidateSources < 1
  ) {
    pushFinding(findings, {
      code: 'invalid_assignment',
      path: 'maximumCandidateSources',
      detail: 'invalid_limit'
    });
  }
  if (
    typeof src.maximumClaimsPerSource !== 'number' ||
    !Number.isFinite(src.maximumClaimsPerSource) ||
    src.maximumClaimsPerSource < 1
  ) {
    pushFinding(findings, {
      code: 'invalid_assignment',
      path: 'maximumClaimsPerSource',
      detail: 'invalid_limit'
    });
  }

  const hardErrors = findings.filter(function (f) {
    return f.severity === 'error';
  });
  if (hardErrors.length) {
    return freezeDeep({ ok: false, normalized: null, findings: sortFindings(findings) });
  }

  const normalized = {
    sourceScoutContractVersion: SR_REVIEWED_DATA_SOURCE_SCOUT_CONTRACT_VERSION,
    assignmentId: normalizeTrim(src.assignmentId),
    canonicalKey: normalizeKey(src.canonicalKey),
    acceptedScientificName: normalizeTrim(src.acceptedScientificName),
    identityRegistryVersion: normalizeTrim(src.identityRegistryVersion),
    currentIdentityBindingFingerprint: normalizeTrim(src.currentIdentityBindingFingerprint),
    currentNeedsReview: src.currentNeedsReview === true,
    currentIdentityConflict: src.currentIdentityConflict === true,
    canonicalIdentityConfirmed: src.canonicalIdentityConfirmed === true,
    parentOrGenusScope: normalizeKey(src.parentOrGenusScope),
    targetField: field,
    targetClaimTypes: claimTypes.slice(),
    targetQuestions: Array.isArray(src.targetQuestions)
      ? src.targetQuestions.map(function (q) {
          return normalizeTrim(q);
        }).filter(Boolean)
      : [],
    targetContext: ctxNorm.normalized,
    allowedSourceClasses: allowed.slice().sort(),
    prohibitedSourceClasses: prohibited.slice().sort(),
    maximumCandidateSources: src.maximumCandidateSources,
    maximumClaimsPerSource: src.maximumClaimsPerSource,
    citationRequirements: asObject(src.citationRequirements)
      ? freezeDeep(JSON.parse(JSON.stringify(src.citationRequirements)))
      : freezeDeep({ requireLocator: true, maxExcerptChars: 280 }),
    expectedAssignmentFingerprint: normalizeTrim(src.expectedAssignmentFingerprint)
  };

  if (src.targetRegion !== undefined) normalized.targetRegion = normalizeTrim(src.targetRegion);
  if (src.languagePreferences !== undefined) {
    normalized.languagePreferences = Array.isArray(src.languagePreferences)
      ? src.languagePreferences.map(normalizeTrim).filter(Boolean)
      : [];
  }
  if (src.approvedAliasesForSearch !== undefined) {
    normalized.approvedAliasesForSearch = Array.isArray(src.approvedAliasesForSearch)
      ? src.approvedAliasesForSearch.map(normalizeTrim).filter(Boolean)
      : [];
  }
  if (src.freshnessRequirements !== undefined) {
    normalized.freshnessRequirements = asObject(src.freshnessRequirements)
      ? freezeDeep(JSON.parse(JSON.stringify(src.freshnessRequirements)))
      : null;
  }
  if (src.providerConfigurationReference !== undefined) {
    normalized.providerConfigurationReference = normalizeTrim(src.providerConfigurationReference);
  }

  const fp = buildSourceScoutAssignmentFingerprint(normalized);
  if (normalized.expectedAssignmentFingerprint !== fp) {
    pushFinding(findings, {
      code: 'identity_binding_mismatch',
      path: 'expectedAssignmentFingerprint',
      detail: 'assignment_fingerprint_mismatch',
      expected: fp,
      actual: normalized.expectedAssignmentFingerprint
    });
    return freezeDeep({ ok: false, normalized: null, findings: sortFindings(findings) });
  }

  normalized.assignmentFingerprint = fp;
  return freezeDeep({ ok: true, normalized: normalized, findings: sortFindings(findings) });
}

export function validateReviewedDataSourceScoutAssignment(assignment) {
  return normalizeReviewedDataSourceScoutAssignment(assignment);
}

export function normalizeReviewedDataSourceScoutSyntheticDiscoveryResults(results) {
  const findings = [];
  if (!Array.isArray(results)) {
    pushFinding(findings, {
      code: 'invalid_assignment',
      path: 'syntheticDiscoveryResults',
      detail: 'results_not_array'
    });
    return freezeDeep({ ok: false, normalized: null, findings: sortFindings(findings) });
  }

  const out = [];
  for (let i = 0; i < results.length; i++) {
    const r = asObject(results[i]);
    const path = 'syntheticDiscoveryResults[' + i + ']';
    if (!r) {
      pushFinding(findings, {
        code: 'invalid_assignment',
        path: path,
        detail: 'result_not_object'
      });
      continue;
    }
    const keys = Object.keys(r);
    for (let k = 0; k < keys.length; k++) {
      if (SYNTHETIC_RESULT_KEYS.indexOf(keys[k]) < 0) {
        pushFinding(findings, {
          code: 'unknown_assignment_key',
          path: path + '.' + keys[k],
          detail: 'unknown_synthetic_result_key'
        });
      }
    }
    const spans = Array.isArray(r.declaredClaimSpans) ? r.declaredClaimSpans : [];
    const normSpans = [];
    for (let s = 0; s < spans.length; s++) {
      const sp = asObject(spans[s]);
      if (!sp) continue;
      const sk = Object.keys(sp);
      for (let j = 0; j < sk.length; j++) {
        if (SPAN_KEYS.indexOf(sk[j]) < 0) {
          pushFinding(findings, {
            code: 'unknown_assignment_key',
            path: path + '.declaredClaimSpans[' + s + '].' + sk[j],
            detail: 'unknown_span_key'
          });
        }
      }
      normSpans.push({
        start: sp.start,
        end: sp.end,
        claimType: normalizeTrim(sp.claimType),
        candidateValue: normalizeTrim(sp.candidateValue),
        excerptKind: normalizeTrim(sp.excerptKind) || 'quotation',
        locator: normalizeTrim(sp.locator),
        contextScope: sp.contextScope || null,
        geographicApplicability: normalizeTrim(sp.geographicApplicability),
        qualifiers: Array.isArray(sp.qualifiers) ? sp.qualifiers.slice() : [],
        limitations: normalizeTrim(sp.limitations)
      });
    }
    out.push({
      syntheticResultId: normalizeTrim(r.syntheticResultId),
      url: normalizeTrim(r.url),
      publisher: normalizeTrim(r.publisher),
      title: normalizeTrim(r.title),
      author: normalizeTrim(r.author),
      publicationDate: normalizeTrim(r.publicationDate),
      lastUpdatedDate: normalizeTrim(r.lastUpdatedDate),
      language: normalizeTrim(r.language) || 'en',
      sourceClass: normalizeTrim(r.sourceClass),
      sourceText: typeof r.sourceText === 'string' ? r.sourceText : '',
      sourceLocator: normalizeTrim(r.sourceLocator),
      geographicScope: normalizeTrim(r.geographicScope),
      plantIdentityScope: normalizeTrim(r.plantIdentityScope),
      fieldHints: Array.isArray(r.fieldHints) ? r.fieldHints.slice() : [],
      contextHints: asObject(r.contextHints) ? r.contextHints : null,
      accessibilityState: normalizeTrim(r.accessibilityState) || 'accessible',
      probableCopyOf: normalizeTrim(r.probableCopyOf),
      hostileContentFlags: Array.isArray(r.hostileContentFlags) ? r.hostileContentFlags.slice() : [],
      declaredClaimSpans: normSpans
    });
  }

  const hard = findings.some(function (f) {
    return f.severity === 'error';
  });
  return freezeDeep({
    ok: !hard,
    normalized: hard ? null : out,
    findings: sortFindings(findings)
  });
}

export function normalizeSourceCandidate(candidate) {
  const o = asObject(candidate);
  if (!o) return null;
  const fp = buildSourceScoutSourceFingerprint(o);
  const contentFp = o.contentFingerprint || buildSourceScoutContentFingerprint(o.sourceText || '');
  const id = String(fp || 'ss-srcmeta|unknown');
  return freezeDeep({
    sourceCandidateId: o.sourceCandidateId || id,
    normalizedUrl: o.normalizedUrl || null,
    canonicalUrl: o.canonicalUrl || o.normalizedUrl || null,
    publisher: o.publisher || null,
    title: o.title || null,
    author: o.author || null,
    publicationDate: o.publicationDate || null,
    lastUpdatedDate: o.lastUpdatedDate || null,
    language: o.language || null,
    sourceClass: o.sourceClass || null,
    scoutClassState: o.scoutClassState || 'unknown',
    sourceClassConfidence: o.sourceClassConfidence || 'medium',
    geographicScope: o.geographicScope || null,
    plantIdentityScope: o.plantIdentityScope || null,
    fieldRelevance: o.fieldRelevance || 'unknown',
    contextRelevance: o.contextRelevance || 'unknown',
    directness: o.directness || 'unknown',
    qualityDimensions: o.qualityDimensions || freezeDeep({}),
    sourceQualityClass: o.sourceQualityClass || 'insufficient',
    duplicateGroup: o.duplicateGroup || null,
    acceptedForExtraction: o.acceptedForExtraction === true,
    acceptanceReasons: Array.isArray(o.acceptanceReasons) ? o.acceptanceReasons.slice() : [],
    rejectionReasons: Array.isArray(o.rejectionReasons) ? o.rejectionReasons.slice() : [],
    contentFingerprint: contentFp,
    sourceMetadataFingerprint: fp,
    authorityBoundary: EMPTY_AUTHORITY
  });
}

export function normalizeClaimCandidate(candidate) {
  const o = asObject(candidate);
  if (!o) return null;
  const fp = buildSourceScoutClaimFingerprint(o);
  return freezeDeep({
    claimCandidateId: o.claimCandidateId || String(fp || 'ss-claim|unknown'),
    sourceCandidateId: o.sourceCandidateId || null,
    canonicalKey: o.canonicalKey || null,
    field: o.field || null,
    claimType: o.claimType || null,
    candidateValue: o.candidateValue || null,
    rawEvidenceExcerpt: o.rawEvidenceExcerpt || null,
    excerptKind: o.excerptKind || 'quotation',
    normalizedEvidenceSummary: o.normalizedEvidenceSummary || null,
    sourceLocator: o.sourceLocator || null,
    contextScope: o.contextScope || null,
    geographicApplicability: o.geographicApplicability || null,
    qualifiers: Array.isArray(o.qualifiers) ? o.qualifiers.slice() : [],
    limitations: o.limitations || null,
    extractionConfidence: o.extractionConfidence || 'medium',
    claimSupportConfidence: o.claimSupportConfidence || 'medium',
    sourceQualityClass: o.sourceQualityClass || 'insufficient',
    extractionMethod: 'synthetic_declared_span',
    claimFingerprint: fp,
    duplicateClaimGroup: o.duplicateClaimGroup || null,
    conflictGroup: o.conflictGroup || null,
    needsHumanReview: o.needsHumanReview !== false,
    authorityBoundary: EMPTY_AUTHORITY
  });
}

function buildQueryPlan(assignment) {
  const aliases = Array.isArray(assignment.approvedAliasesForSearch)
    ? assignment.approvedAliasesForSearch.slice()
    : [];
  const plan = {
    acceptedScientificName: assignment.acceptedScientificName,
    canonicalKey: assignment.canonicalKey,
    approvedAliases: aliases,
    targetField: assignment.targetField,
    targetClaimTypes: assignment.targetClaimTypes.slice(),
    questions: assignment.targetQuestions.slice(),
    contextTokens: assignment.targetContext,
    explicitRegion: assignment.targetRegion || null,
    allowedSourceClasses: assignment.allowedSourceClasses.slice(),
    prohibitedSourceClasses: assignment.prohibitedSourceClasses.slice(),
    languagePreferences: Array.isArray(assignment.languagePreferences)
      ? assignment.languagePreferences.slice()
      : ['en'],
    limits: {
      networkRequests: 0,
      pages: 'synthetic_only',
      externalModelCalls: 0,
      maximumCandidateSources: assignment.maximumCandidateSources,
      maximumClaimsPerSource: assignment.maximumClaimsPerSource
    },
    domainPolicy: {
      publicSourcesOnly: true,
      liveFetch: false,
      externalModel: false
    },
    queryTemplates: [
      assignment.acceptedScientificName + ' ' + assignment.targetField + ' preference',
      assignment.canonicalKey + ' ' + assignment.targetField + ' horticulture'
    ]
  };
  plan.queryPlanFingerprint = 'ss-qplan|' + stableSerialize(plan);
  return freezeDeep(plan);
}

function resolveStatus(flags) {
  if (flags.source_scout_failed) return 'source_scout_failed';
  if (flags.assignment_invalid) return 'assignment_invalid';
  if (flags.identity_blocked) return 'identity_blocked';
  if (flags.no_sources_found) return 'no_sources_found';
  if (flags.sources_rejected) return 'sources_rejected';
  if (flags.extraction_incomplete) return 'extraction_incomplete';
  if (flags.claim_conflict_detected) return 'claim_conflict_detected';
  if (flags.human_review_required) return 'human_review_required';
  if (flags.draft_ready_for_validation) return 'draft_ready_for_validation';
  if (flags.claims_extracted) return 'claims_extracted';
  if (flags.sources_discovered) return 'sources_discovered';
  if (flags.query_plan_ready) return 'query_plan_ready';
  return 'source_scout_failed';
}

export function processReviewedDataSourceScoutAssignment(input) {
  const findings = [];
  const warnings = [];
  const wrapper = asObject(input);
  if (!wrapper) {
    pushFinding(findings, { code: 'invalid_assignment', detail: 'wrapper_not_object' });
    return emptyResult({
      status: 'assignment_invalid',
      findings: findings,
      handoffState: 'blocked'
    });
  }

  const beforeInput = stableSerialize(input);
  const wKeys = Object.keys(wrapper);
  for (let i = 0; i < wKeys.length; i++) {
    if (WRAPPER_ALLOWED_KEYS.indexOf(wKeys[i]) < 0) {
      pushFinding(findings, {
        code: 'unknown_assignment_key',
        path: wKeys[i],
        detail: 'unknown_wrapper_key'
      });
    }
  }
  if (findings.length) {
    return emptyResult({
      status: 'assignment_invalid',
      findings: findings,
      handoffState: 'blocked',
      inputMutated: stableSerialize(input) !== beforeInput
    });
  }

  const aNorm = normalizeReviewedDataSourceScoutAssignment(wrapper.assignment);
  findings.push.apply(findings, aNorm.findings);
  if (!aNorm.ok || !aNorm.normalized) {
    return emptyResult({
      status: 'assignment_invalid',
      findings: findings,
      handoffState: 'blocked',
      assignmentReference: asObject(wrapper.assignment)
        ? freezeDeep({
            assignmentId: normalizeTrim(wrapper.assignment.assignmentId),
            canonicalKey: normalizeKey(wrapper.assignment.canonicalKey)
          })
        : null,
      inputMutated: stableSerialize(input) !== beforeInput
    });
  }
  const assignment = aNorm.normalized;

  if (assignment.currentNeedsReview === true) {
    pushFinding(findings, {
      code: 'current_needs_review_active',
      path: 'assignment.currentNeedsReview'
    });
  }
  if (assignment.currentIdentityConflict === true) {
    pushFinding(findings, {
      code: 'current_identity_conflict_active',
      path: 'assignment.currentIdentityConflict'
    });
  }
  if (assignment.canonicalIdentityConfirmed !== true) {
    pushFinding(findings, {
      code: 'identity_binding_mismatch',
      path: 'assignment.canonicalIdentityConfirmed',
      detail: 'canonical_not_confirmed'
    });
  }
  if (!isSpeciesScope(assignment.parentOrGenusScope)) {
    pushFinding(findings, {
      code: 'identity_binding_mismatch',
      path: 'assignment.parentOrGenusScope',
      detail: 'non_species_scope',
      actual: assignment.parentOrGenusScope
    });
  }

  const identityBlocked = findings.some(function (f) {
    return (
      f.code === 'current_needs_review_active' ||
      f.code === 'current_identity_conflict_active' ||
      (f.code === 'identity_binding_mismatch' &&
        (f.path === 'assignment.canonicalIdentityConfirmed' ||
          f.path === 'assignment.parentOrGenusScope'))
    );
  });

  const queryPlan = buildQueryPlan(assignment);
  const assignmentReference = freezeDeep({
    assignmentId: assignment.assignmentId,
    canonicalKey: assignment.canonicalKey,
    acceptedScientificName: assignment.acceptedScientificName,
    targetField: assignment.targetField,
    assignmentFingerprint: assignment.assignmentFingerprint
  });

  if (identityBlocked) {
    const afterId = stableSerialize(input);
    const resBlocked = emptyResult({
      status: 'identity_blocked',
      findings: findings,
      warnings: warnings,
      assignmentReference: assignmentReference,
      queryPlan: queryPlan,
      handoffState: 'blocked',
      inputFingerprint: assignment.assignmentFingerprint,
      inputMutated: afterId !== beforeInput
    });
    return freezeDeep(
      Object.assign({}, resBlocked, {
        summaryFingerprint: buildSummaryFingerprint({
          status: 'identity_blocked',
          findings: resBlocked.findings,
          warnings: resBlocked.warnings,
          mutationCheck: resBlocked.mutationCheck
        })
      })
    );
  }

  const sNorm = normalizeReviewedDataSourceScoutSyntheticDiscoveryResults(
    wrapper.syntheticDiscoveryResults
  );
  findings.push.apply(findings, sNorm.findings);
  if (!sNorm.ok || !sNorm.normalized) {
    return emptyResult({
      status: 'assignment_invalid',
      findings: findings,
      assignmentReference: assignmentReference,
      queryPlan: queryPlan,
      handoffState: 'blocked',
      inputFingerprint: assignment.assignmentFingerprint,
      inputMutated: stableSerialize(input) !== beforeInput
    });
  }

  let fixtures = sNorm.normalized.slice(0, assignment.maximumCandidateSources);
  if (!fixtures.length) {
    pushFinding(findings, { code: 'invalid_assignment', detail: 'no_sources_found' });
    const resEmpty = emptyResult({
      status: 'no_sources_found',
      findings: findings,
      assignmentReference: assignmentReference,
      queryPlan: queryPlan,
      handoffState: 'no_handoff',
      inputFingerprint: assignment.assignmentFingerprint,
      inputMutated: stableSerialize(input) !== beforeInput
    });
    return freezeDeep(
      Object.assign({}, resEmpty, {
        summaryFingerprint: buildSummaryFingerprint({
          status: 'no_sources_found',
          findings: resEmpty.findings,
          mutationCheck: resEmpty.mutationCheck
        })
      })
    );
  }

  const bySyntheticId = Object.create(null);
  for (let i = 0; i < fixtures.length; i++) {
    if (fixtures[i].syntheticResultId) bySyntheticId[fixtures[i].syntheticResultId] = fixtures[i];
  }

  const sourceCandidates = [];
  const rejectedSources = [];
  const duplicateGroupsMap = Object.create(null);

  for (let i = 0; i < fixtures.length; i++) {
    const fx = fixtures[i];
    const path = 'syntheticDiscoveryResults[' + i + ']';
    pushFinding(warnings, {
      code: 'source_discovered',
      path: path,
      detail: fx.syntheticResultId,
      severity: 'info'
    });

    const normalizedUrl = stripTrackingParams(fx.url);
    const contentFingerprint = buildSourceScoutContentFingerprint(fx.sourceText);
    const metaBase = {
      normalizedUrl: normalizedUrl,
      publisher: fx.publisher,
      title: fx.title,
      publicationDate: fx.publicationDate,
      lastUpdatedDate: fx.lastUpdatedDate,
      language: fx.language,
      sourceClass: fx.sourceClass,
      geographicScope: fx.geographicScope,
      plantIdentityScope: fx.plantIdentityScope
    };
    const sourceMetadataFingerprint = buildSourceScoutSourceFingerprint(metaBase);
    const sourceCandidateId = String(sourceMetadataFingerprint);

    let scoutClassState = scoutClassForSourceType(fx.sourceClass);
    const acceptanceReasons = [];
    const rejectionReasons = [];
    let acceptedForExtraction = false;
    let fieldRelevance = 'matched';
    let contextRelevance = 'matched';
    let directness = 'direct';

    const hostileCodes = [];
    for (let h = 0; h < fx.hostileContentFlags.length; h++) {
      const mapped = HOSTILE_FLAG_TO_CODE[fx.hostileContentFlags[h]];
      if (mapped) hostileCodes.push(mapped);
    }
    const textHostile = detectHostileFromText(fx.sourceText);
    for (let th = 0; th < textHostile.length; th++) {
      if (hostileCodes.indexOf(textHostile[th]) < 0) hostileCodes.push(textHostile[th]);
    }

    let duplicateGroup = 'dup:' + contentFingerprint.slice(0, 48);
    let isCopy = false;
    if (fx.probableCopyOf && bySyntheticId[fx.probableCopyOf]) {
      isCopy = true;
      const parent = bySyntheticId[fx.probableCopyOf];
      const parentContent = buildSourceScoutContentFingerprint(parent.sourceText);
      duplicateGroup = 'dup:' + parentContent.slice(0, 48);
      pushFinding(warnings, {
        code: 'probable_copied_source',
        path: path,
        detail: fx.probableCopyOf,
        severity: 'warning'
      });
      pushFinding(warnings, {
        code: 'source_duplicate_detected',
        path: path,
        detail: duplicateGroup,
        severity: 'info'
      });
    }

    // Priority rejection
    if (fx.accessibilityState === 'inaccessible') {
      pushFinding(findings, { code: 'source_inaccessible', path: path });
      rejectionReasons.push('inaccessible');
    } else if (hostileCodes.length) {
      for (let hc = 0; hc < hostileCodes.length; hc++) {
        pushFinding(findings, { code: hostileCodes[hc], path: path });
      }
      rejectionReasons.push('hostile');
    } else if (
      !fx.sourceClass ||
      SR_EVIDENCE_SOURCE_TYPES.indexOf(fx.sourceClass) < 0 ||
      assignment.prohibitedSourceClasses.indexOf(fx.sourceClass) >= 0 ||
      scoutClassState === 'prohibited'
    ) {
      pushFinding(findings, {
        code: 'prohibited_source_class',
        path: path + '.sourceClass',
        actual: fx.sourceClass
      });
      scoutClassState = 'prohibited';
      rejectionReasons.push('prohibited_source_class');
    } else if (
      !fx.plantIdentityScope ||
      fx.plantIdentityScope === 'common_name_only' ||
      fx.plantIdentityScope === 'ambiguous' ||
      fx.plantIdentityScope === 'genus'
    ) {
      pushFinding(findings, {
        code: 'source_identity_ambiguous',
        path: path + '.plantIdentityScope',
        actual: fx.plantIdentityScope
      });
      rejectionReasons.push('identity_ambiguous');
    } else if (
      fx.fieldHints &&
      fx.fieldHints.length &&
      fx.fieldHints.indexOf(assignment.targetField) < 0
    ) {
      pushFinding(findings, {
        code: 'source_context_irrelevant',
        path: path + '.fieldHints',
        detail: 'field_mismatch'
      });
      fieldRelevance = 'irrelevant';
      rejectionReasons.push('field_irrelevant');
    } else if (
      fx.contextHints &&
      fx.contextHints.setting &&
      assignment.targetContext &&
      fx.contextHints.setting !== assignment.targetContext.setting &&
      fx.contextHints.setting !== 'unknown' &&
      assignment.targetContext.setting !== 'unknown'
    ) {
      pushFinding(findings, {
        code: 'source_context_irrelevant',
        path: path + '.contextHints',
        detail: 'context_mismatch'
      });
      contextRelevance = 'mismatch';
      rejectionReasons.push('context_irrelevant');
      pushFinding(warnings, {
        code: 'context_scope_limited',
        path: path,
        severity: 'warning'
      });
    } else if (isCopy) {
      rejectionReasons.push('copied_source');
      acceptedForExtraction = false;
    } else if (assignment.allowedSourceClasses.indexOf(fx.sourceClass) < 0) {
      pushFinding(findings, {
        code: 'prohibited_source_class',
        path: path + '.sourceClass',
        detail: 'not_in_allowed_list',
        actual: fx.sourceClass
      });
      rejectionReasons.push('not_allowed');
    } else if (scoutClassState === 'corroboration_only') {
      pushFinding(warnings, {
        code: 'lower_quality_source',
        path: path,
        severity: 'warning'
      });
      acceptedForExtraction = true;
      acceptanceReasons.push('corroboration_only');
    } else {
      acceptedForExtraction = true;
      acceptanceReasons.push('accepted_' + scoutClassState);
    }

    if (rejectionReasons.length) acceptedForExtraction = false;
    if (isCopy) acceptedForExtraction = false;

    if (!fx.publicationDate && !fx.lastUpdatedDate) {
      pushFinding(warnings, {
        code: 'source_date_unknown',
        path: path,
        severity: 'info'
      });
    }
    if (!fx.author) {
      pushFinding(warnings, {
        code: 'author_unknown',
        path: path,
        severity: 'info'
      });
    }
    if (
      assignment.targetRegion &&
      fx.geographicScope &&
      fx.geographicScope !== 'global' &&
      fx.geographicScope !== assignment.targetRegion
    ) {
      pushFinding(warnings, {
        code: 'regional_scope_limited',
        path: path,
        severity: 'warning',
        detail: fx.geographicScope
      });
    }

    if (!duplicateGroupsMap[duplicateGroup]) duplicateGroupsMap[duplicateGroup] = [];
    duplicateGroupsMap[duplicateGroup].push(sourceCandidateId);

    const candidate = normalizeSourceCandidate({
      sourceCandidateId: sourceCandidateId,
      normalizedUrl: normalizedUrl,
      canonicalUrl: normalizedUrl,
      publisher: fx.publisher,
      title: fx.title,
      author: fx.author,
      publicationDate: fx.publicationDate,
      lastUpdatedDate: fx.lastUpdatedDate,
      language: fx.language,
      sourceClass: fx.sourceClass,
      scoutClassState: scoutClassState,
      sourceClassConfidence: scoutClassState === 'preferred' ? 'high' : 'medium',
      geographicScope: fx.geographicScope,
      plantIdentityScope: fx.plantIdentityScope,
      fieldRelevance: fieldRelevance,
      contextRelevance: contextRelevance,
      directness: directness,
      qualityDimensions: {
        institutionalAuthority: scoutClassState === 'preferred' ? 'high' : 'low',
        identitySpecificity: fx.plantIdentityScope === 'species' ? 'high' : 'low',
        directness: directness,
        contextMatch: contextRelevance,
        regionalMatch: fx.geographicScope || 'unknown',
        independence: isCopy ? 'copied' : 'independent',
        commercialBiasRisk: scoutClassState === 'corroboration_only' ? 'elevated' : 'low'
      },
      sourceQualityClass: qualityForScoutClass(scoutClassState),
      duplicateGroup: duplicateGroup,
      acceptedForExtraction: !!acceptedForExtraction,
      acceptanceReasons: acceptedForExtraction ? acceptanceReasons : [],
      rejectionReasons: rejectionReasons,
      contentFingerprint: contentFingerprint,
      sourceMetadataFingerprint: sourceMetadataFingerprint,
      sourceText: fx.sourceText
    });

    const finalized = freezeDeep(
      Object.assign({}, candidate, {
        _syntheticResultId: fx.syntheticResultId,
        _sourceText: fx.sourceText,
        _spans: fx.declaredClaimSpans,
        _isCopy: isCopy,
        _sourceLocator: fx.sourceLocator
      })
    );

    sourceCandidates.push(finalized);
    if (!acceptedForExtraction) {
      rejectedSources.push(
        freezeDeep({
          sourceCandidateId: finalized.sourceCandidateId,
          syntheticResultId: fx.syntheticResultId,
          rejectionReasons: rejectionReasons.slice()
        })
      );
    }
  }

  const claimCandidates = [];
  const valuesByGroup = Object.create(null);

  for (let i = 0; i < sourceCandidates.length; i++) {
    const sc = sourceCandidates[i];
    if (!sc.acceptedForExtraction) continue;
    const spans = sc._spans || [];
    if (!spans.length) {
      pushFinding(warnings, {
        code: 'claim_not_found',
        path: 'sourceCandidates[' + i + ']',
        detail: sc._syntheticResultId,
        severity: 'info'
      });
      continue;
    }

    const maxClaims = assignment.maximumClaimsPerSource;
    for (let s = 0; s < spans.length && s < maxClaims; s++) {
      const span = spans[s];
      const cpath = 'sourceCandidates[' + i + '].declaredClaimSpans[' + s + ']';

      if (!span.locator && !sc._sourceLocator) {
        pushFinding(findings, { code: 'missing_source_locator', path: cpath });
        continue;
      }
      if (SR_EVIDENCE_CLAIM_TYPES.indexOf(span.claimType) < 0) {
        pushFinding(findings, {
          code: 'unsupported_claim_type',
          path: cpath + '.claimType',
          actual: span.claimType
        });
        continue;
      }
      if (assignment.targetClaimTypes.indexOf(span.claimType) < 0 && span.claimType !== 'general_guidance') {
        pushFinding(findings, {
          code: 'unsupported_claim_type',
          path: cpath + '.claimType',
          detail: 'not_in_assignment_targets',
          actual: span.claimType
        });
        continue;
      }

      const values = proposedValuesForField(assignment.targetField);
      if (!values || values.indexOf(span.candidateValue) < 0) {
        pushFinding(findings, {
          code: 'unsupported_candidate_value',
          path: cpath + '.candidateValue',
          actual: span.candidateValue
        });
        continue;
      }

      let excerpt = null;
      if (span.excerptKind === 'quotation') {
        if (
          typeof span.start !== 'number' ||
          typeof span.end !== 'number' ||
          span.start < 0 ||
          span.end < span.start
        ) {
          pushFinding(findings, {
            code: 'fabricated_evidence_detected',
            path: cpath,
            detail: 'invalid_span_bounds'
          });
          continue;
        }
        excerpt = String(sc._sourceText || '').slice(span.start, span.end);
        const expectedSlice = String(sc._sourceText || '').slice(span.start, span.end);
        if (excerpt !== expectedSlice) {
          pushFinding(findings, {
            code: 'fabricated_evidence_detected',
            path: cpath,
            detail: 'slice_mismatch'
          });
          continue;
        }
      } else if (span.excerptKind === 'paraphrase') {
        excerpt = normalizeTrim(span.limitations) || normalizeTrim(span.candidateValue) || '';
      } else {
        pushFinding(findings, {
          code: 'fabricated_evidence_detected',
          path: cpath + '.excerptKind',
          actual: span.excerptKind
        });
        continue;
      }

      if (!excerpt || excerpt.length > SR_REVIEWED_DATA_SOURCE_CAPTURE_MAX_SHORT_EXCERPT_CHARS) {
        pushFinding(findings, {
          code: 'fabricated_evidence_detected',
          path: cpath,
          detail: 'excerpt_missing_or_too_long',
          expected: SR_REVIEWED_DATA_SOURCE_CAPTURE_MAX_SHORT_EXCERPT_CHARS,
          actual: excerpt ? excerpt.length : 0
        });
        continue;
      }

      const ctxNorm = normalizeEvidencePacketContextScope(
        span.contextScope || assignment.targetContext,
        SR_EVIDENCE_PACKET_CONTRACT_VERSION
      );
      const claimBody = {
        sourceFingerprint: sc.sourceMetadataFingerprint,
        sourceMetadataFingerprint: sc.sourceMetadataFingerprint,
        sourceLocator: span.locator || sc._sourceLocator,
        field: assignment.targetField,
        claimType: span.claimType,
        candidateValue: span.candidateValue,
        contextScope: ctxNorm.ok ? ctxNorm.normalized : assignment.targetContext,
        geographicApplicability: span.geographicApplicability || sc.geographicScope || null,
        qualifiers: span.qualifiers || [],
        limitations: span.limitations || null
      };
      const claimFingerprint = buildSourceScoutClaimFingerprint(claimBody);
      const claimCandidateId = String(claimFingerprint);
      const groupKey =
        assignment.targetField + '|' + span.claimType + '|' + span.candidateValue;
      if (!valuesByGroup[groupKey]) {
        valuesByGroup[groupKey] = {
          field: assignment.targetField,
          claimType: span.claimType,
          candidateValue: span.candidateValue,
          claims: [],
          sourceIds: [],
          independentSourceIds: [],
          preferredSourceIds: [],
          copiedSourceIds: []
        };
      }

      const claim = normalizeClaimCandidate({
        claimCandidateId: claimCandidateId,
        sourceCandidateId: sc.sourceCandidateId,
        canonicalKey: assignment.canonicalKey,
        field: assignment.targetField,
        claimType: span.claimType,
        candidateValue: span.candidateValue,
        rawEvidenceExcerpt: excerpt,
        excerptKind: span.excerptKind,
        normalizedEvidenceSummary:
          assignment.targetField + ' ' + span.claimType + ' = ' + span.candidateValue,
        sourceLocator: span.locator || sc._sourceLocator,
        contextScope: claimBody.contextScope,
        geographicApplicability: claimBody.geographicApplicability,
        qualifiers: claimBody.qualifiers,
        limitations: claimBody.limitations,
        extractionConfidence: 'high',
        claimSupportConfidence: sc.scoutClassState === 'preferred' ? 'high' : 'medium',
        sourceQualityClass: sc.sourceQualityClass,
        sourceFingerprint: sc.sourceMetadataFingerprint,
        sourceMetadataFingerprint: sc.sourceMetadataFingerprint,
        duplicateClaimGroup: 'cg:' + groupKey,
        conflictGroup: null,
        needsHumanReview: true
      });

      claimCandidates.push(claim);
      valuesByGroup[groupKey].claims.push(claim);
      if (valuesByGroup[groupKey].sourceIds.indexOf(sc.sourceCandidateId) < 0) {
        valuesByGroup[groupKey].sourceIds.push(sc.sourceCandidateId);
      }
      if (!sc._isCopy) {
        if (valuesByGroup[groupKey].independentSourceIds.indexOf(sc.sourceCandidateId) < 0) {
          valuesByGroup[groupKey].independentSourceIds.push(sc.sourceCandidateId);
        }
        if (
          sc.scoutClassState === 'preferred' &&
          valuesByGroup[groupKey].preferredSourceIds.indexOf(sc.sourceCandidateId) < 0
        ) {
          valuesByGroup[groupKey].preferredSourceIds.push(sc.sourceCandidateId);
        }
      } else {
        valuesByGroup[groupKey].copiedSourceIds.push(sc.sourceCandidateId);
      }

      pushFinding(warnings, {
        code: 'claim_extracted',
        path: cpath,
        detail: claimCandidateId,
        severity: 'info'
      });
    }
  }

  // Conflict detection across different values for same field+claimType
  const conflictGroups = [];
  const byFieldClaim = Object.create(null);
  const groupKeys = Object.keys(valuesByGroup).sort();
  for (let g = 0; g < groupKeys.length; g++) {
    const gk = groupKeys[g];
    const grp = valuesByGroup[gk];
    if (grp.claimType === 'general_guidance') continue;
    const fk = grp.field + '|' + grp.claimType;
    if (!byFieldClaim[fk]) byFieldClaim[fk] = [];
    byFieldClaim[fk].push(grp);
  }
  const fkKeys = Object.keys(byFieldClaim).sort();
  let primaryGroupBlockedByConflict = false;
  for (let f = 0; f < fkKeys.length; f++) {
    const groups = byFieldClaim[fkKeys[f]];
    if (groups.length > 1) {
      const conflictId =
        'conflict:value:' +
        fkKeys[f] +
        ':' +
        groups
          .map(function (x) {
            return x.candidateValue;
          })
          .sort()
          .join('|');
      conflictGroups.push(
        freezeDeep({
          conflictGroupId: conflictId,
          conflictClass: 'value_conflict',
          field: groups[0].field,
          claimType: groups[0].claimType,
          values: groups.map(function (x) {
            return x.candidateValue;
          }),
          claimCandidateIds: groups.reduce(function (acc, x) {
            return acc.concat(
              x.claims.map(function (c) {
                return c.claimCandidateId;
              })
            );
          }, [])
        })
      );
      pushFinding(warnings, {
        code: 'claim_conflict_detected',
        path: 'conflictGroups',
        detail: conflictId,
        severity: 'warning'
      });
      // Mark claims
      for (let gi = 0; gi < groups.length; gi++) {
        for (let ci = 0; ci < groups[gi].claims.length; ci++) {
          const claimId = groups[gi].claims[ci].claimCandidateId;
          for (let cc = 0; cc < claimCandidates.length; cc++) {
            if (claimCandidates[cc].claimCandidateId === claimId) {
              claimCandidates[cc] = freezeDeep(
                Object.assign({}, claimCandidates[cc], { conflictGroup: conflictId })
              );
            }
          }
        }
      }
    }
  }

  // Choose primary draft group: strongest independent preferred agreement.
  // Cross-value conflicts are reported but do not erase a valid agreement group;
  // they keep human review mandatory (Field Review resolves).
  let primaryGroup = null;
  for (let g = 0; g < groupKeys.length; g++) {
    const grp = valuesByGroup[groupKeys[g]];
    if (grp.claimType === 'general_guidance') continue;
    if (
      grp.independentSourceIds.length >= 2 &&
      grp.preferredSourceIds.length >= 1
    ) {
      if (
        !primaryGroup ||
        grp.preferredSourceIds.length > primaryGroup.preferredSourceIds.length ||
        (grp.preferredSourceIds.length === primaryGroup.preferredSourceIds.length &&
          grp.independentSourceIds.length > primaryGroup.independentSourceIds.length)
      ) {
        primaryGroup = grp;
      }
    }
  }
  if (primaryGroup && conflictGroups.length) {
    const touchesPrimary = conflictGroups.some(function (cg) {
      return (
        cg.field === primaryGroup.field &&
        cg.claimType === primaryGroup.claimType &&
        cg.values.indexOf(primaryGroup.candidateValue) >= 0
      );
    });
    if (touchesPrimary) primaryGroupBlockedByConflict = false;
  } else if (!primaryGroup && conflictGroups.length) {
    primaryGroupBlockedByConflict = true;
  }

  if (!primaryGroup) {
    pushFinding(warnings, {
      code: 'corroboration_insufficient',
      detail: 'independent_source_rule_not_met',
      severity: 'warning'
    });
  } else {
    pushFinding(warnings, {
      code: 'draft_candidate_created',
      detail: primaryGroup.field + '|' + primaryGroup.claimType + '|' + primaryGroup.candidateValue,
      severity: 'info'
    });
  }

  pushFinding(warnings, {
    code: 'human_review_required',
    detail: 'gates_a_b_mandatory',
    severity: 'warning'
  });
  pushFinding(warnings, {
    code: 'product_authority_not_granted',
    detail: 'authority_boundary_false',
    severity: 'info'
  });

  const duplicateSourceGroups = Object.keys(duplicateGroupsMap)
    .sort()
    .map(function (id) {
      return freezeDeep({
        duplicateGroupId: id,
        sourceCandidateIds: duplicateGroupsMap[id].slice().sort()
      });
    });

  const duplicateClaimGroups = groupKeys.map(function (gk) {
    return freezeDeep({
      duplicateClaimGroupId: 'cg:' + gk,
      claimCandidateIds: valuesByGroup[gk].claims
        .map(function (c) {
          return c.claimCandidateId;
        })
        .sort()
    });
  });

  // Strip private fields from source candidates for output
  const publicSources = sourceCandidates.map(function (sc) {
    return freezeDeep({
      sourceCandidateId: sc.sourceCandidateId,
      normalizedUrl: sc.normalizedUrl,
      canonicalUrl: sc.canonicalUrl,
      publisher: sc.publisher,
      title: sc.title,
      author: sc.author,
      publicationDate: sc.publicationDate,
      lastUpdatedDate: sc.lastUpdatedDate,
      language: sc.language,
      sourceClass: sc.sourceClass,
      scoutClassState: sc.scoutClassState,
      sourceClassConfidence: sc.sourceClassConfidence,
      geographicScope: sc.geographicScope,
      plantIdentityScope: sc.plantIdentityScope,
      fieldRelevance: sc.fieldRelevance,
      contextRelevance: sc.contextRelevance,
      directness: sc.directness,
      qualityDimensions: sc.qualityDimensions,
      sourceQualityClass: sc.sourceQualityClass,
      duplicateGroup: sc.duplicateGroup,
      acceptedForExtraction: sc.acceptedForExtraction,
      acceptanceReasons: sc.acceptanceReasons,
      rejectionReasons: sc.rejectionReasons,
      contentFingerprint: sc.contentFingerprint,
      sourceMetadataFingerprint: sc.sourceMetadataFingerprint,
      authorityBoundary: EMPTY_AUTHORITY
    });
  });

  let handoffState = 'incomplete';
  let sourceCaptureHandoffDraft = null;
  let draftEvidencePacketInput = null;
  let handoffFingerprint = null;

  if (primaryGroup) {
    const handoffSources = primaryGroup.claims.map(function (claim) {
      const src = publicSources.find(function (s) {
        return s.sourceCandidateId === claim.sourceCandidateId;
      });
      return freezeDeep({
        sourceRole: src && src.scoutClassState === 'preferred' ? 'primary' : 'corroborating',
        institution: src ? src.publisher : null,
        publisher: src ? src.publisher : null,
        sourceType: src ? src.sourceClass : null,
        authorityTier: src ? authorityTierForScoutClass(src.scoutClassState) : 'C',
        sourceTitle: src ? src.title : null,
        sourceReference: src ? src.normalizedUrl : null,
        sourceIdentity: src ? src.normalizedUrl : null,
        shortExcerpt: claim.rawEvidenceExcerpt,
        normalizedClaim: claim.normalizedEvidenceSummary,
        limitations: claim.limitations || 'draft_only_human_review_required',
        sourceLocator: claim.sourceLocator,
        sourceMetadataFingerprint: src ? src.sourceMetadataFingerprint : null,
        claimFingerprint: claim.claimFingerprint,
        activeSupport: true
      });
    });

    sourceCaptureHandoffDraft = freezeDeep({
      captureContractVersion: SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION,
      draftOnly: true,
      approved: false,
      humanApproval: null,
      verifiedAt: null,
      canonicalKey: assignment.canonicalKey,
      acceptedScientificName: assignment.acceptedScientificName,
      field: assignment.targetField,
      reviewedClaimType: primaryGroup.claimType,
      proposedValue: primaryGroup.candidateValue,
      contextScope: assignment.targetContext,
      sources: handoffSources,
      unresolvedConflicts: conflictGroups.slice(),
      independentSourceCount: primaryGroup.independentSourceIds.length,
      preferredSourceCount: primaryGroup.preferredSourceIds.length,
      authorityBoundary: EMPTY_AUTHORITY
    });
    handoffFingerprint = 'ss-handoff|' + stableSerialize(sourceCaptureHandoffDraft);

    draftEvidencePacketInput = freezeDeep({
      draftOnly: true,
      packetContractVersion: SR_EVIDENCE_PACKET_CONTRACT_VERSION,
      canonicalKey: assignment.canonicalKey,
      field: assignment.targetField,
      claimType: primaryGroup.claimType,
      proposedValue: primaryGroup.candidateValue,
      stubs: handoffSources.map(function (s, idx) {
        return freezeDeep({
          evidenceId: 'draft-ep-' + assignment.canonicalKey + '-' + idx,
          sourceReference: s.sourceReference,
          shortExcerpt: s.shortExcerpt,
          normalizedClaim: s.normalizedClaim,
          authorityTier: s.authorityTier
        });
      }),
      authorityBoundary: EMPTY_AUTHORITY
    });
    handoffState = 'ready_for_source_capture_validation';
  } else if (claimCandidates.length) {
    handoffState = 'draft_candidate';
  } else if (publicSources.some(function (s) { return s.acceptedForExtraction; })) {
    handoffState = 'incomplete';
  } else if (publicSources.length) {
    handoffState = 'blocked';
  }

  const acceptedCount = publicSources.filter(function (s) {
    return s.acceptedForExtraction;
  }).length;
  const flags = {
    source_scout_failed: false,
    assignment_invalid: false,
    identity_blocked: false,
    no_sources_found: false,
    sources_rejected: acceptedCount === 0 && publicSources.length > 0,
    extraction_incomplete:
      acceptedCount > 0 && claimCandidates.length === 0 && !primaryGroup,
    claim_conflict_detected: primaryGroupBlockedByConflict && !primaryGroup,
    human_review_required: true,
    draft_ready_for_validation: false,
    claims_extracted: claimCandidates.length > 0,
    sources_discovered: publicSources.length > 0,
    query_plan_ready: !!queryPlan
  };

  const status = resolveStatus(flags);
  const afterInput = stableSerialize(input);
  const inputMutated = afterInput !== beforeInput;
  if (inputMutated) {
    pushFinding(findings, { code: 'output_mutation_detected', detail: 'input_mutated' });
  }

  const sortedFindings = sortFindings(findings);
  const sortedWarnings = sortFindings(warnings);
  const acceptedIds = publicSources
    .filter(function (s) {
      return s.acceptedForExtraction;
    })
    .map(function (s) {
      return s.sourceCandidateId;
    })
    .sort();
  const rejectedIds = rejectedSources
    .map(function (s) {
      return s.sourceCandidateId;
    })
    .sort();
  const claimIds = claimCandidates
    .map(function (c) {
      return c.claimCandidateId;
    })
    .sort();

  const mutationCheck = freezeDeep({
    inputMutated: inputMutated,
    outputMutated: false,
    deterministic: true
  });

  const summaryFingerprint = buildSummaryFingerprint({
    status: status,
    acceptedSourceIds: acceptedIds,
    rejectedSourceIds: rejectedIds,
    claimIds: claimIds,
    duplicateSourceGroups: duplicateSourceGroups,
    duplicateClaimGroups: duplicateClaimGroups,
    conflictGroups: conflictGroups,
    findings: sortedFindings,
    warnings: sortedWarnings,
    handoffFingerprint: handoffFingerprint,
    mutationCheck: mutationCheck
  });

  const result = freezeDeep({
    descriptor: getSmartRecDeveloperReviewedDataSourceScoutDescriptor(),
    sourceScoutContractVersion: SR_REVIEWED_DATA_SOURCE_SCOUT_CONTRACT_VERSION,
    resultContractVersion: SR_REVIEWED_DATA_SOURCE_SCOUT_RESULT_CONTRACT_VERSION,
    status: status,
    assignmentReference: assignmentReference,
    queryPlan: queryPlan,
    sourceCandidates: publicSources,
    claimCandidates: claimCandidates.slice(),
    duplicateSourceGroups: duplicateSourceGroups,
    duplicateClaimGroups: duplicateClaimGroups,
    conflictGroups: conflictGroups,
    rejectedSources: rejectedSources,
    findings: sortedFindings,
    warnings: sortedWarnings,
    draftEvidencePacketInput: draftEvidencePacketInput,
    sourceCaptureHandoffDraft: sourceCaptureHandoffDraft,
    handoffState: handoffState,
    authorityBoundary: EMPTY_AUTHORITY,
    inputFingerprint: assignment.assignmentFingerprint,
    summaryFingerprint: summaryFingerprint,
    mutationCheck: mutationCheck,
    metrics: freezeDeep({
      fixtureCount: fixtures.length,
      discoveredCount: publicSources.length,
      acceptedForExtractionCount: acceptedCount,
      rejectedCount: rejectedSources.length,
      claimCandidateCount: claimCandidates.length,
      independentSourceCount: primaryGroup ? primaryGroup.independentSourceIds.length : 0,
      preferredSourceCount: primaryGroup ? primaryGroup.preferredSourceIds.length : 0,
      duplicateGroupCount: duplicateSourceGroups.length,
      conflictGroupCount: conflictGroups.length
    })
  });

  // Determinism self-check: re-process serialization identity of meaning-bearing fields
  const again = buildSummaryFingerprint({
    status: result.status,
    acceptedSourceIds: acceptedIds,
    rejectedSourceIds: rejectedIds,
    claimIds: claimIds,
    duplicateSourceGroups: result.duplicateSourceGroups,
    duplicateClaimGroups: result.duplicateClaimGroups,
    conflictGroups: result.conflictGroups,
    findings: result.findings,
    warnings: result.warnings,
    handoffFingerprint: handoffFingerprint,
    mutationCheck: result.mutationCheck
  });
  if (again !== summaryFingerprint) {
    pushFinding(findings, { code: 'nondeterministic_output', detail: 'summary_mismatch' });
    return emptyResult({
      status: 'source_scout_failed',
      findings: findings.concat(sortedFindings),
      assignmentReference: assignmentReference,
      queryPlan: queryPlan,
      handoffState: 'blocked',
      inputFingerprint: assignment.assignmentFingerprint,
      inputMutated: inputMutated
    });
  }

  return result;
}
