/**
 * Cruvit — Smart Recommendations developer reviewed-data Source Capture Contract
 * ---------------------------------------------------------------------------
 * Inert, developer/test-only, non-authoritative validation of human-approved
 * Source Capture Packets for the deterministic batch draft generator.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, persistence, or writes.
 *  - Does not decide botanical truth, approve Field Review, or grant eligibility.
 *  - Does not mutate caller inputs or global Registries.
 */

import {
  SR_EVIDENCE_PACKET_CONTRACT_VERSION,
  SR_EVIDENCE_PACKET_FIELDS,
  SR_EVIDENCE_CLAIM_TYPES,
  SR_EVIDENCE_AUTHORITY_TIERS,
  SR_EVIDENCE_SOURCE_TYPES,
  SR_EVIDENCE_PROPOSED_VALUES_SUN,
  SR_EVIDENCE_PROPOSED_VALUES_WATER,
  SR_EVIDENCE_COMPOUND_LEGACY_PROPOSED_VALUES,
  SR_EVIDENCE_CONTEXT_SETTINGS,
  SR_EVIDENCE_CONTEXT_PLANTINGS,
  SR_EVIDENCE_CONTEXT_MATURITIES,
  SR_EVIDENCE_CONTEXT_OBJECTIVES,
  SR_EVIDENCE_CONTEXT_DAYPARTS,
  SR_EVIDENCE_CONTEXT_HEAT_PROTECTIONS,
  normalizeEvidencePacketContextScope
} from './developer-evidence-packet-registry.js';

export const SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION =
  '0.1.0-sr-reviewed-data-source-capture-contract';

export const SR_REVIEWED_DATA_SOURCE_CAPTURE_CAPABILITY =
  'explicit_developer_reviewed_data_source_capture_validation';

export const SR_REVIEWED_DATA_SOURCE_CAPTURE_MAX_SHORT_EXCERPT_CHARS = 280;

export const SR_REVIEWED_DATA_SOURCE_CAPTURE_TOP_LEVEL_KEYS = Object.freeze([
  'captureContractVersion',
  'batchId',
  'canonicalKey',
  'acceptedScientificName',
  'identityReference',
  'field',
  'reviewedClaimType',
  'proposedValue',
  'contextScope',
  'expectedArtifactCounts',
  'sources',
  'humanApproval'
]);

export const SR_REVIEWED_DATA_SOURCE_CAPTURE_IDENTITY_KEYS = Object.freeze([
  'institution',
  'sourceTitle',
  'sourceReference',
  'acceptedIdentity',
  'knownSynonyms'
]);

export const SR_REVIEWED_DATA_SOURCE_CAPTURE_SOURCE_KEYS = Object.freeze([
  'sourceRole',
  'institution',
  'publisher',
  'sourceType',
  'authorityTier',
  'sourceTitle',
  'sourceReference',
  'sourceIdentity',
  'verifiedAt',
  'shortExcerpt',
  'normalizedClaim',
  'reviewerSummary',
  'limitations',
  'activeSupport',
  'publicationDate',
  'sourceUpdateDate',
  'author',
  'program',
  'daypart',
  'heatProtection',
  'climateOrRegion',
  'season'
]);

export const SR_REVIEWED_DATA_SOURCE_CAPTURE_SOURCE_REQUIRED_KEYS = Object.freeze([
  'sourceRole',
  'institution',
  'publisher',
  'sourceType',
  'authorityTier',
  'sourceTitle',
  'sourceReference',
  'sourceIdentity',
  'verifiedAt',
  'shortExcerpt',
  'normalizedClaim',
  'reviewerSummary',
  'limitations',
  'activeSupport'
]);

export const SR_REVIEWED_DATA_SOURCE_CAPTURE_APPROVAL_KEYS = Object.freeze([
  'approvalVersion',
  'approvedAt',
  'approverRole',
  'approvedGates',
  'approved',
  'expectedCaptureContentFingerprint',
  'sourcesIndependenceDeclared',
  'excerptsHumanVerified'
]);

export const SR_REVIEWED_DATA_SOURCE_CAPTURE_FINDING_CODES = Object.freeze([
  'missing_human_approval',
  'unsupported_contract_version',
  'invalid_identity',
  'identity_ambiguous',
  'source_scope_ambiguous',
  'unsupported_field',
  'unsupported_claim_type',
  'unsupported_atomic_value',
  'new_token_required',
  'context_ambiguous',
  'preference_tolerance_ambiguous',
  'source_conflict',
  'source_not_independent',
  'source_reference_incomplete',
  'excerpt_missing',
  'excerpt_too_long',
  'normalized_claim_missing',
  'limitation_missing',
  'fingerprint_failure',
  'foundation_validation_failure',
  'batch_validation_failure',
  'mutation_detected',
  'product_authority_attempt',
  'automatic_execution_attempt',
  'external_network_attempt',
  'persistence_attempt',
  'stale_capture_approval',
  'stale_field_review_approval',
  'capture_fingerprint_mismatch',
  'prepared_draft_fingerprint_mismatch',
  'duplicate_source_reference',
  'deterministic_id_collision',
  'invalid_approval_gate',
  'unsupported_workflow_transition'
]);

export const SR_REVIEWED_DATA_SOURCE_CAPTURE_SEVERITIES = Object.freeze([
  'error',
  'warning',
  'info'
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

function isIsoDate(v) {
  if (!isNonEmptyString(v)) return false;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00.000Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function sortUniqueStrings(arr) {
  if (!Array.isArray(arr)) return null;
  const out = [];
  const seen = Object.create(null);
  for (let i = 0; i < arr.length; i++) {
    if (!isNonEmptyString(arr[i])) return null;
    const s = String(arr[i]).trim();
    if (seen[s]) continue;
    seen[s] = true;
    out.push(s);
  }
  return out.slice().sort();
}

function claimToken(claimType) {
  const c = normalizeTrim(claimType);
  if (!c) return null;
  return c.replace(/_/g, '-');
}

function proposedValuesForField(field) {
  if (field === 'sun') return SR_EVIDENCE_PROPOSED_VALUES_SUN;
  if (field === 'water') return SR_EVIDENCE_PROPOSED_VALUES_WATER;
  return null;
}

function normalizeUrlReference(url) {
  const s = normalizeTrim(url);
  if (!s) return null;
  let out = s;
  try {
    const u = new URL(s);
    let path = u.pathname || '/';
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    out = u.protocol.toLowerCase() + '//' + u.hostname.toLowerCase() + path + (u.search || '');
  } catch (_e) {
    out = s.replace(/\/+$/, '').toLowerCase();
  }
  return out;
}

function hostnameOf(url) {
  const s = normalizeTrim(url);
  if (!s) return null;
  try {
    return new URL(s).hostname.toLowerCase();
  } catch (_e) {
    return null;
  }
}

function hasHtmlFragment(text) {
  return /<\s*\/?\s*[a-zA-Z][^>]*>/.test(text) || /&lt;\s*\/?\s*[a-zA-Z]/.test(text);
}

function isMultiParagraph(text) {
  return /\n\s*\n/.test(text) || text.split(/\n/).filter(function (l) {
    return l.trim().length > 0;
  }).length > 2;
}

function isValidSourceRole(role) {
  return typeof role === 'string' && /^[a-z][a-z0-9-]{0,47}$/.test(role);
}

function expectedBatchIdPrefix(canonicalKey, field, reviewedClaimType) {
  const ck = normalizeKey(canonicalKey);
  const f = normalizeTrim(field);
  const ct = claimToken(reviewedClaimType);
  if (!ck || !f || !ct) return null;
  return ck + '-' + f + '-' + ct;
}

function validateBatchIdShape(batchId, canonicalKey, field, reviewedClaimType) {
  const id = normalizeTrim(batchId);
  const prefix = expectedBatchIdPrefix(canonicalKey, field, reviewedClaimType);
  if (!id || !prefix) return { ok: false, detail: 'batchId_or_prefix_incomplete' };
  if (id !== id.toLowerCase()) return { ok: false, detail: 'batchId_not_lowercase' };
  const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-v\\d+$');
  if (!re.test(id)) return { ok: false, detail: 'batchId_mismatch_convention', expectedPrefix: prefix };
  return { ok: true, prefix: prefix };
}

function pushFinding(findings, finding) {
  findings.push(
    freezeDeep({
      code: finding.code,
      severity: finding.severity || 'error',
      path: finding.path == null ? null : finding.path,
      detail: finding.detail == null ? null : finding.detail,
      expected: finding.expected === undefined ? null : finding.expected,
      actual: finding.actual === undefined ? null : finding.actual
    })
  );
}

function sortFindings(findings) {
  return findings.slice().sort(function (a, b) {
    const c = String(a.code || '').localeCompare(String(b.code || ''));
    if (c) return c;
    const p = String(a.path || '').localeCompare(String(b.path || ''));
    if (p) return p;
    return String(a.detail || '').localeCompare(String(b.detail || ''));
  });
}

function countFindings(findings) {
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (let i = 0; i < findings.length; i++) {
    if (findings[i].severity === 'error') errorCount++;
    else if (findings[i].severity === 'warning') warningCount++;
    else infoCount++;
  }
  return { errorCount: errorCount, warningCount: warningCount, infoCount: infoCount };
}

function buildDescriptor() {
  return freezeDeep({
    captureContractVersion: SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION,
    capability: SR_REVIEWED_DATA_SOURCE_CAPTURE_CAPABILITY,
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
    productConsumers: 'none',
    maxShortExcerptChars: SR_REVIEWED_DATA_SOURCE_CAPTURE_MAX_SHORT_EXCERPT_CHARS,
    supportedPeerVersions: {
      evidencePacketContractVersion: SR_EVIDENCE_PACKET_CONTRACT_VERSION,
      fieldReviewContractVersion: '0.2.0-sr-field-review-contract',
      structuredClimateProfileContractVersion:
        '0.1.0-sr-structured-climate-profile-contract',
      reviewedDataContainerContractVersion: '0.1.0-sr-reviewed-data-container',
      batchAutomationContractVersion: '0.1.0-sr-reviewed-data-batch-automation-contract'
    },
    allowedFields: SR_EVIDENCE_PACKET_FIELDS.slice(),
    claimTypes: SR_EVIDENCE_CLAIM_TYPES.slice(),
    findingCodes: SR_REVIEWED_DATA_SOURCE_CAPTURE_FINDING_CODES.slice(),
    severities: SR_REVIEWED_DATA_SOURCE_CAPTURE_SEVERITIES.slice()
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperReviewedDataSourceCaptureDescriptor() {
  return DESCRIPTOR;
}

/**
 * Normalize meaning-bearing capture content without humanApproval.
 * Does not mutate input. Returns frozen normalized object or null with findings.
 */
export function normalizeReviewedDataSourceCapturePacket(capturePacket) {
  const findings = [];
  const src = asObject(capturePacket);
  if (!src) {
    pushFinding(findings, {
      code: 'foundation_validation_failure',
      detail: 'capture_packet_required'
    });
    return freezeDeep({ ok: false, normalized: null, findings: sortFindings(findings) });
  }

  const keys = Object.keys(src);
  for (let i = 0; i < keys.length; i++) {
    if (SR_REVIEWED_DATA_SOURCE_CAPTURE_TOP_LEVEL_KEYS.indexOf(keys[i]) < 0) {
      pushFinding(findings, {
        code: 'foundation_validation_failure',
        path: keys[i],
        detail: 'unknown_top_level_key',
        actual: keys[i]
      });
    }
  }

  const captureContractVersion = normalizeTrim(src.captureContractVersion);
  if (captureContractVersion !== SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION) {
    pushFinding(findings, {
      code: 'unsupported_contract_version',
      expected: SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION,
      actual: src.captureContractVersion
    });
  }

  const batchId = normalizeTrim(src.batchId);
  const canonicalKey = normalizeKey(src.canonicalKey);
  const acceptedScientificName = normalizeTrim(src.acceptedScientificName);
  const field = normalizeTrim(src.field);
  const reviewedClaimType = normalizeTrim(src.reviewedClaimType);
  const proposedValue = normalizeTrim(src.proposedValue);

  if (!canonicalKey) {
    pushFinding(findings, { code: 'invalid_identity', detail: 'canonicalKey_required' });
  }
  if (!acceptedScientificName) {
    pushFinding(findings, { code: 'invalid_identity', detail: 'acceptedScientificName_required' });
  }
  if (!field || SR_EVIDENCE_PACKET_FIELDS.indexOf(field) < 0) {
    pushFinding(findings, {
      code: 'unsupported_field',
      actual: src.field,
      expected: SR_EVIDENCE_PACKET_FIELDS.slice()
    });
  }
  if (!reviewedClaimType || SR_EVIDENCE_CLAIM_TYPES.indexOf(reviewedClaimType) < 0) {
    pushFinding(findings, {
      code: 'unsupported_claim_type',
      actual: src.reviewedClaimType
    });
  }
  if (
    proposedValue &&
    SR_EVIDENCE_COMPOUND_LEGACY_PROPOSED_VALUES.indexOf(proposedValue) >= 0
  ) {
    pushFinding(findings, {
      code: 'new_token_required',
      detail: 'compound_legacy_token',
      actual: proposedValue
    });
  }
  const allowedValues = proposedValuesForField(field);
  if (!proposedValue || !allowedValues || allowedValues.indexOf(proposedValue) < 0) {
    pushFinding(findings, {
      code: 'unsupported_atomic_value',
      actual: src.proposedValue,
      path: 'proposedValue'
    });
  }

  const batchCheck = validateBatchIdShape(batchId, canonicalKey, field, reviewedClaimType);
  if (!batchCheck.ok) {
    pushFinding(findings, {
      code: 'foundation_validation_failure',
      detail: batchCheck.detail || 'invalid_batchId',
      expected: batchCheck.expectedPrefix || null,
      actual: batchId
    });
  }

  const idRef = asObject(src.identityReference);
  let normalizedIdentity = null;
  if (!idRef) {
    pushFinding(findings, { code: 'invalid_identity', detail: 'identityReference_required' });
  } else {
    const idKeys = Object.keys(idRef);
    for (let i = 0; i < idKeys.length; i++) {
      if (SR_REVIEWED_DATA_SOURCE_CAPTURE_IDENTITY_KEYS.indexOf(idKeys[i]) < 0) {
        pushFinding(findings, {
          code: 'foundation_validation_failure',
          path: 'identityReference.' + idKeys[i],
          detail: 'unknown_identity_key'
        });
      }
    }
    const institution = normalizeTrim(idRef.institution);
    const sourceTitle = normalizeTrim(idRef.sourceTitle);
    const sourceReference = normalizeTrim(idRef.sourceReference);
    const acceptedIdentity = normalizeTrim(idRef.acceptedIdentity);
    const knownSynonyms =
      idRef.knownSynonyms === undefined ? undefined : sortUniqueStrings(idRef.knownSynonyms);
    if (!institution || !sourceTitle || !sourceReference || !acceptedIdentity) {
      pushFinding(findings, {
        code: 'invalid_identity',
        detail: 'identityReference_incomplete'
      });
    }
    if (idRef.knownSynonyms !== undefined && knownSynonyms == null) {
      pushFinding(findings, {
        code: 'invalid_identity',
        detail: 'knownSynonyms_invalid'
      });
    }
    if (
      acceptedIdentity &&
      acceptedScientificName &&
      acceptedIdentity !== acceptedScientificName
    ) {
      pushFinding(findings, {
        code: 'invalid_identity',
        detail: 'acceptedIdentity_mismatch',
        expected: acceptedScientificName,
        actual: acceptedIdentity
      });
    }
    normalizedIdentity = {
      institution: institution,
      sourceTitle: sourceTitle,
      sourceReference: sourceReference,
      acceptedIdentity: acceptedIdentity
    };
    if (knownSynonyms) normalizedIdentity.knownSynonyms = knownSynonyms;
  }

  const ctxNorm = normalizeEvidencePacketContextScope(
    src.contextScope,
    SR_EVIDENCE_PACKET_CONTRACT_VERSION
  );
  if (!ctxNorm.ok || !ctxNorm.normalized) {
    pushFinding(findings, {
      code: 'context_ambiguous',
      detail: 'contextScope_normalize_failed',
      actual: ctxNorm.reasons || null
    });
  } else {
    const c = ctxNorm.normalized;
    if (SR_EVIDENCE_CONTEXT_SETTINGS.indexOf(c.setting) < 0) {
      pushFinding(findings, { code: 'context_ambiguous', detail: 'setting' });
    }
    if (SR_EVIDENCE_CONTEXT_PLANTINGS.indexOf(c.planting) < 0) {
      pushFinding(findings, { code: 'context_ambiguous', detail: 'planting' });
    }
    if (SR_EVIDENCE_CONTEXT_MATURITIES.indexOf(c.maturity) < 0) {
      pushFinding(findings, { code: 'context_ambiguous', detail: 'maturity' });
    }
    if (SR_EVIDENCE_CONTEXT_OBJECTIVES.indexOf(c.objective) < 0) {
      pushFinding(findings, { code: 'context_ambiguous', detail: 'objective' });
    }
  }

  const counts = asObject(src.expectedArtifactCounts);
  if (
    !counts ||
    counts.evidencePackets !== 2 ||
    counts.fieldReviewRecords !== 1 ||
    counts.structuredClimateProfiles !== 1
  ) {
    pushFinding(findings, {
      code: 'foundation_validation_failure',
      detail: 'invalid_expected_artifact_counts',
      expected: { evidencePackets: 2, fieldReviewRecords: 1, structuredClimateProfiles: 1 },
      actual: counts
    });
  }

  if (!Array.isArray(src.sources) || src.sources.length < 2) {
    pushFinding(findings, {
      code: 'source_reference_incomplete',
      detail: 'sources_require_at_least_two'
    });
  }

  const normalizedSources = [];
  const roleSeen = Object.create(null);
  const refSeen = Object.create(null);
  const hostSeen = Object.create(null);
  const pubSeen = Object.create(null);
  const instSeen = Object.create(null);
  const excerptSeen = Object.create(null);
  const claimSeen = Object.create(null);

  if (Array.isArray(src.sources)) {
    for (let i = 0; i < src.sources.length; i++) {
      const path = 'sources[' + i + ']';
      const s = asObject(src.sources[i]);
      if (!s) {
        pushFinding(findings, {
          code: 'source_reference_incomplete',
          path: path,
          detail: 'source_object_required'
        });
        continue;
      }
      const sKeys = Object.keys(s);
      for (let k = 0; k < sKeys.length; k++) {
        if (SR_REVIEWED_DATA_SOURCE_CAPTURE_SOURCE_KEYS.indexOf(sKeys[k]) < 0) {
          pushFinding(findings, {
            code: 'foundation_validation_failure',
            path: path + '.' + sKeys[k],
            detail: 'unknown_source_key'
          });
        }
      }
      for (let r = 0; r < SR_REVIEWED_DATA_SOURCE_CAPTURE_SOURCE_REQUIRED_KEYS.length; r++) {
        const rk = SR_REVIEWED_DATA_SOURCE_CAPTURE_SOURCE_REQUIRED_KEYS[r];
        if (!(rk in s)) {
          pushFinding(findings, {
            code: 'source_reference_incomplete',
            path: path + '.' + rk,
            detail: 'missing_required_source_key'
          });
        }
      }

      const sourceRole = normalizeKey(s.sourceRole);
      const institution = normalizeTrim(s.institution);
      const publisher = normalizeTrim(s.publisher);
      const sourceType = normalizeTrim(s.sourceType);
      const authorityTier = normalizeTrim(s.authorityTier);
      const sourceTitle = normalizeTrim(s.sourceTitle);
      const sourceReference = normalizeTrim(s.sourceReference);
      const sourceIdentity = normalizeTrim(s.sourceIdentity) || sourceReference;
      const verifiedAt = normalizeTrim(s.verifiedAt);
      const shortExcerpt = normalizeTrim(s.shortExcerpt);
      const normalizedClaim = normalizeTrim(s.normalizedClaim);
      const reviewerSummary = normalizeTrim(s.reviewerSummary);
      const limitations = sortUniqueStrings(s.limitations);
      const activeSupport = s.activeSupport;

      if (!isValidSourceRole(sourceRole)) {
        pushFinding(findings, {
          code: 'deterministic_id_collision',
          path: path + '.sourceRole',
          detail: 'invalid_sourceRole',
          actual: s.sourceRole
        });
      } else if (roleSeen[sourceRole]) {
        pushFinding(findings, {
          code: 'deterministic_id_collision',
          path: path + '.sourceRole',
          detail: 'duplicate_sourceRole',
          actual: sourceRole
        });
      } else {
        roleSeen[sourceRole] = true;
      }

      if (!institution || !publisher || !sourceTitle || !sourceReference || !sourceIdentity) {
        pushFinding(findings, {
          code: 'source_reference_incomplete',
          path: path
        });
      }
      if (!sourceType || SR_EVIDENCE_SOURCE_TYPES.indexOf(sourceType) < 0) {
        pushFinding(findings, {
          code: 'foundation_validation_failure',
          path: path + '.sourceType',
          detail: 'unsupported_source_type',
          actual: s.sourceType
        });
      }
      if (!authorityTier || SR_EVIDENCE_AUTHORITY_TIERS.indexOf(authorityTier) < 0) {
        pushFinding(findings, {
          code: 'foundation_validation_failure',
          path: path + '.authorityTier',
          detail: 'unsupported_authority_tier',
          actual: s.authorityTier
        });
      }
      if (!verifiedAt || !isIsoDate(verifiedAt)) {
        pushFinding(findings, {
          code: 'source_reference_incomplete',
          path: path + '.verifiedAt',
          detail: 'invalid_verifiedAt'
        });
      }
      if (!shortExcerpt) {
        pushFinding(findings, { code: 'excerpt_missing', path: path + '.shortExcerpt' });
      } else {
        if (shortExcerpt.length > SR_REVIEWED_DATA_SOURCE_CAPTURE_MAX_SHORT_EXCERPT_CHARS) {
          pushFinding(findings, {
            code: 'excerpt_too_long',
            path: path + '.shortExcerpt',
            actual: shortExcerpt.length,
            expected: SR_REVIEWED_DATA_SOURCE_CAPTURE_MAX_SHORT_EXCERPT_CHARS
          });
        }
        if (hasHtmlFragment(shortExcerpt)) {
          pushFinding(findings, {
            code: 'excerpt_too_long',
            path: path + '.shortExcerpt',
            detail: 'html_fragment_rejected'
          });
        }
        if (isMultiParagraph(shortExcerpt)) {
          pushFinding(findings, {
            code: 'excerpt_too_long',
            path: path + '.shortExcerpt',
            detail: 'multi_paragraph_rejected'
          });
        }
      }
      if (!normalizedClaim) {
        pushFinding(findings, {
          code: 'normalized_claim_missing',
          path: path + '.normalizedClaim'
        });
      } else if (shortExcerpt && normalizedClaim === shortExcerpt) {
        pushFinding(findings, {
          code: 'normalized_claim_missing',
          path: path + '.normalizedClaim',
          detail: 'must_differ_from_excerpt'
        });
      }
      if (!reviewerSummary) {
        pushFinding(findings, {
          code: 'source_reference_incomplete',
          path: path + '.reviewerSummary'
        });
      }
      if (!limitations || limitations.length === 0) {
        pushFinding(findings, {
          code: 'limitation_missing',
          path: path + '.limitations'
        });
      }
      if (typeof activeSupport !== 'boolean') {
        pushFinding(findings, {
          code: 'source_reference_incomplete',
          path: path + '.activeSupport',
          detail: 'boolean_required'
        });
      }

      const normRef = normalizeUrlReference(sourceReference);
      if (!normRef) {
        pushFinding(findings, {
          code: 'source_reference_incomplete',
          path: path + '.sourceReference'
        });
      } else if (refSeen[normRef]) {
        pushFinding(findings, {
          code: 'duplicate_source_reference',
          path: path + '.sourceReference',
          actual: normRef
        });
      } else {
        refSeen[normRef] = true;
      }

      const host = hostnameOf(sourceReference);
      if (!host) {
        pushFinding(findings, {
          code: 'source_not_independent',
          path: path + '.sourceReference',
          detail: 'hostname_required'
        });
      } else if (hostSeen[host]) {
        pushFinding(findings, {
          code: 'source_not_independent',
          path: path + '.sourceReference',
          detail: 'duplicate_hostname',
          actual: host
        });
      } else {
        hostSeen[host] = true;
      }

      if (publisher) {
        const pk = publisher.toLowerCase();
        if (pubSeen[pk]) {
          pushFinding(findings, {
            code: 'source_not_independent',
            path: path + '.publisher',
            detail: 'duplicate_publisher',
            actual: publisher
          });
        } else {
          pubSeen[pk] = true;
        }
      }
      if (institution) {
        const ik = institution.toLowerCase();
        if (instSeen[ik]) {
          pushFinding(findings, {
            code: 'source_not_independent',
            path: path + '.institution',
            detail: 'duplicate_institution',
            actual: institution
          });
        } else {
          instSeen[ik] = true;
        }
      }
      if (shortExcerpt) {
        if (excerptSeen[shortExcerpt]) {
          pushFinding(findings, {
            code: 'source_conflict',
            path: path + '.shortExcerpt',
            detail: 'duplicate_excerpt'
          });
        } else {
          excerptSeen[shortExcerpt] = true;
        }
      }
      if (normalizedClaim) {
        if (claimSeen[normalizedClaim]) {
          pushFinding(findings, {
            code: 'source_conflict',
            path: path + '.normalizedClaim',
            detail: 'duplicate_normalized_claim'
          });
        } else {
          claimSeen[normalizedClaim] = true;
        }
      }

      const ns = {
        sourceRole: sourceRole,
        institution: institution,
        publisher: publisher,
        sourceType: sourceType,
        authorityTier: authorityTier,
        sourceTitle: sourceTitle,
        sourceReference: sourceReference,
        sourceIdentity: sourceIdentity,
        verifiedAt: verifiedAt,
        shortExcerpt: shortExcerpt,
        normalizedClaim: normalizedClaim,
        reviewerSummary: reviewerSummary,
        limitations: limitations || [],
        activeSupport: activeSupport === true
      };

      const optionalStringKeys = [
        'publicationDate',
        'sourceUpdateDate',
        'author',
        'program',
        'daypart',
        'heatProtection',
        'climateOrRegion',
        'season'
      ];
      for (let o = 0; o < optionalStringKeys.length; o++) {
        const ok = optionalStringKeys[o];
        if (s[ok] === undefined || s[ok] === null) continue;
        const ov = normalizeTrim(s[ok]);
        if (!ov) {
          pushFinding(findings, {
            code: 'source_reference_incomplete',
            path: path + '.' + ok,
            detail: 'empty_optional_omitted_required'
          });
          continue;
        }
        if (
          (ok === 'publicationDate' || ok === 'sourceUpdateDate') &&
          !isIsoDate(ov)
        ) {
          pushFinding(findings, {
            code: 'source_reference_incomplete',
            path: path + '.' + ok,
            detail: 'invalid_iso_date'
          });
        }
        if (ok === 'daypart' && SR_EVIDENCE_CONTEXT_DAYPARTS.indexOf(ov) < 0) {
          pushFinding(findings, {
            code: 'context_ambiguous',
            path: path + '.daypart',
            actual: ov
          });
        }
        if (
          ok === 'heatProtection' &&
          SR_EVIDENCE_CONTEXT_HEAT_PROTECTIONS.indexOf(ov) < 0
        ) {
          pushFinding(findings, {
            code: 'context_ambiguous',
            path: path + '.heatProtection',
            actual: ov
          });
        }
        ns[ok] = ov;
      }

      normalizedSources.push(ns);
    }
  }

  normalizedSources.sort(function (a, b) {
    const ra = normalizeUrlReference(a.sourceReference) || '';
    const rb = normalizeUrlReference(b.sourceReference) || '';
    if (ra < rb) return -1;
    if (ra > rb) return 1;
    if (a.sourceRole < b.sourceRole) return -1;
    if (a.sourceRole > b.sourceRole) return 1;
    return 0;
  });

  const humanApproval = asObject(src.humanApproval);
  let normalizedApproval = null;
  if (!humanApproval) {
    pushFinding(findings, { code: 'missing_human_approval', detail: 'humanApproval_required' });
  } else {
    const aKeys = Object.keys(humanApproval);
    for (let i = 0; i < aKeys.length; i++) {
      if (SR_REVIEWED_DATA_SOURCE_CAPTURE_APPROVAL_KEYS.indexOf(aKeys[i]) < 0) {
        pushFinding(findings, {
          code: 'invalid_approval_gate',
          path: 'humanApproval.' + aKeys[i],
          detail: 'unknown_approval_key'
        });
      }
    }
    const approvedGates = Array.isArray(humanApproval.approvedGates)
      ? humanApproval.approvedGates.map(function (g) {
          return String(g).trim().toUpperCase();
        })
      : null;
    const gatesOk =
      approvedGates &&
      approvedGates.length === 2 &&
      approvedGates[0] === 'A' &&
      approvedGates[1] === 'B';
    if (humanApproval.approved !== true) {
      pushFinding(findings, {
        code: 'missing_human_approval',
        detail: 'approved_must_be_true'
      });
    }
    if (!gatesOk) {
      pushFinding(findings, {
        code: 'invalid_approval_gate',
        detail: 'approvedGates_must_be_A_B',
        actual: humanApproval.approvedGates
      });
    }
    if (!normalizeTrim(humanApproval.approvalVersion)) {
      pushFinding(findings, {
        code: 'missing_human_approval',
        path: 'humanApproval.approvalVersion'
      });
    }
    if (!isIsoDate(humanApproval.approvedAt)) {
      pushFinding(findings, {
        code: 'missing_human_approval',
        path: 'humanApproval.approvedAt',
        detail: 'iso_date_required'
      });
    }
    if (!normalizeTrim(humanApproval.approverRole)) {
      pushFinding(findings, {
        code: 'missing_human_approval',
        path: 'humanApproval.approverRole'
      });
    }
    if (humanApproval.sourcesIndependenceDeclared !== true) {
      pushFinding(findings, {
        code: 'missing_human_approval',
        detail: 'sourcesIndependenceDeclared_required'
      });
    }
    if (humanApproval.excerptsHumanVerified !== true) {
      pushFinding(findings, {
        code: 'missing_human_approval',
        detail: 'excerptsHumanVerified_required'
      });
    }
    if (!normalizeTrim(humanApproval.expectedCaptureContentFingerprint)) {
      pushFinding(findings, {
        code: 'capture_fingerprint_mismatch',
        detail: 'expectedCaptureContentFingerprint_required'
      });
    }
    normalizedApproval = {
      approvalVersion: normalizeTrim(humanApproval.approvalVersion),
      approvedAt: normalizeTrim(humanApproval.approvedAt),
      approverRole: normalizeTrim(humanApproval.approverRole),
      approvedGates: gatesOk ? ['A', 'B'] : approvedGates,
      approved: humanApproval.approved === true,
      expectedCaptureContentFingerprint: normalizeTrim(
        humanApproval.expectedCaptureContentFingerprint
      ),
      sourcesIndependenceDeclared: humanApproval.sourcesIndependenceDeclared === true,
      excerptsHumanVerified: humanApproval.excerptsHumanVerified === true
    };
  }

  const contentBody = {
    captureContractVersion: captureContractVersion,
    batchId: batchId,
    canonicalKey: canonicalKey,
    acceptedScientificName: acceptedScientificName,
    identityReference: normalizedIdentity,
    field: field,
    reviewedClaimType: reviewedClaimType,
    proposedValue: proposedValue,
    contextScope: ctxNorm && ctxNorm.ok ? ctxNorm.normalized : null,
    expectedArtifactCounts: {
      evidencePackets: 2,
      fieldReviewRecords: 1,
      structuredClimateProfiles: 1
    },
    sources: normalizedSources
  };

  const sortedFindings = sortFindings(findings);
  const countsF = countFindings(sortedFindings);
  if (countsF.errorCount > 0) {
    return freezeDeep({
      ok: false,
      normalized: null,
      contentBody: freezeDeep(contentBody),
      humanApproval: normalizedApproval ? freezeDeep(normalizedApproval) : null,
      findings: sortedFindings
    });
  }

  return freezeDeep({
    ok: true,
    normalized: freezeDeep(
      Object.assign({}, contentBody, { humanApproval: normalizedApproval })
    ),
    contentBody: freezeDeep(contentBody),
    humanApproval: freezeDeep(normalizedApproval),
    findings: sortedFindings
  });
}

/**
 * Deterministic capture content fingerprint (excludes humanApproval).
 */
export function buildReviewedDataCaptureContentFingerprint(capturePacketOrContentBody) {
  const asCapture = asObject(capturePacketOrContentBody);
  let contentBody = null;

  if (asCapture && Array.isArray(asCapture.sources) && asCapture.captureContractVersion) {
    // Always normalize meaning-bearing content the same way as validate/prepare.
    // When humanApproval is absent, inject a structural placeholder so contentBody
    // normalization still runs; approval binding is not part of this fingerprint.
    const forNorm = asCapture.humanApproval
      ? asCapture
      : Object.assign({}, asCapture, {
          humanApproval: {
            approvalVersion: '1',
            approvedAt: '2000-01-01',
            approverRole: 'fingerprint_placeholder',
            approvedGates: ['A', 'B'],
            approved: true,
            expectedCaptureContentFingerprint: 'fingerprint_placeholder',
            sourcesIndependenceDeclared: true,
            excerptsHumanVerified: true
          }
        });
    const norm = normalizeReviewedDataSourceCapturePacket(forNorm);
    contentBody = norm.contentBody;
    if (!contentBody) {
      return freezeDeep({
        ok: false,
        fingerprint: null,
        reasons: ['fingerprint_inputs_incomplete'],
        findings: norm.findings || []
      });
    }
  }

  if (!contentBody) {
    return freezeDeep({
      ok: false,
      fingerprint: null,
      reasons: ['fingerprint_inputs_incomplete']
    });
  }

  // Rebuild fingerprint from meaning-bearing body only (no approval).
  const body = {
    captureContractVersion: contentBody.captureContractVersion,
    batchId: contentBody.batchId,
    canonicalKey: contentBody.canonicalKey,
    acceptedScientificName: contentBody.acceptedScientificName,
    identityReference: contentBody.identityReference,
    field: contentBody.field,
    reviewedClaimType: contentBody.reviewedClaimType,
    proposedValue: contentBody.proposedValue,
    contextScope: contentBody.contextScope,
    expectedArtifactCounts: contentBody.expectedArtifactCounts,
    sources: contentBody.sources
  };

  if (
    !body.captureContractVersion ||
    !body.batchId ||
    !body.canonicalKey ||
    !body.acceptedScientificName ||
    !body.identityReference ||
    !body.field ||
    !body.reviewedClaimType ||
    !body.proposedValue ||
    !body.contextScope ||
    !Array.isArray(body.sources) ||
    body.sources.length < 2
  ) {
    return freezeDeep({
      ok: false,
      fingerprint: null,
      reasons: ['fingerprint_inputs_incomplete']
    });
  }

  const fingerprint =
    SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION + '|' + stableSerialize(body);
  return freezeDeep({ ok: true, fingerprint: fingerprint, reasons: ['ok'] });
}

/**
 * Full validate: normalize + fingerprint + approval binding.
 * Does not mutate input.
 */
export function validateReviewedDataSourceCapturePacket(capturePacket, options) {
  const opts = asObject(options) || {};
  const before = stableSerialize(capturePacket);
  const findings = [];

  if (opts.networkAttempt === true) {
    pushFinding(findings, { code: 'external_network_attempt' });
  }
  if (opts.persistenceAttempt === true) {
    pushFinding(findings, { code: 'persistence_attempt' });
  }
  if (opts.automaticExecutionAttempt === true) {
    pushFinding(findings, { code: 'automatic_execution_attempt' });
  }
  if (opts.productAuthorityAttempt === true) {
    pushFinding(findings, { code: 'product_authority_attempt' });
  }

  const norm = normalizeReviewedDataSourceCapturePacket(capturePacket);
  for (let i = 0; i < (norm.findings || []).length; i++) {
    findings.push(norm.findings[i]);
  }

  let fingerprint = null;
  if (norm.contentBody) {
    const fp = buildReviewedDataCaptureContentFingerprint(norm.contentBody);
    if (!fp.ok) {
      pushFinding(findings, {
        code: 'fingerprint_failure',
        detail: 'capture_content_fingerprint_failed',
        actual: fp.reasons
      });
    } else {
      fingerprint = fp.fingerprint;
      if (norm.humanApproval) {
        if (
          norm.humanApproval.expectedCaptureContentFingerprint !== fingerprint
        ) {
          pushFinding(findings, {
            code: 'stale_capture_approval',
            detail: 'expectedCaptureContentFingerprint_mismatch',
            expected: fingerprint,
            actual: norm.humanApproval.expectedCaptureContentFingerprint
          });
          pushFinding(findings, {
            code: 'capture_fingerprint_mismatch',
            expected: fingerprint,
            actual: norm.humanApproval.expectedCaptureContentFingerprint
          });
        }
      }
    }
  }

  const after = stableSerialize(capturePacket);
  if (before !== after) {
    pushFinding(findings, { code: 'mutation_detected', detail: 'input_mutated' });
  }

  const sorted = sortFindings(findings);
  const counts = countFindings(sorted);
  return freezeDeep({
    valid: counts.errorCount === 0,
    captureContractVersion: SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION,
    capability: SR_REVIEWED_DATA_SOURCE_CAPTURE_CAPABILITY,
    normalized: counts.errorCount === 0 ? norm.normalized : null,
    contentBody: norm.contentBody || null,
    captureContentFingerprint: fingerprint,
    findings: sorted,
    errorCount: counts.errorCount,
    warningCount: counts.warningCount,
    infoCount: counts.infoCount,
    mutationDetected: before !== after
  });
}

export {
  claimToken,
  expectedBatchIdPrefix,
  validateBatchIdShape,
  normalizeUrlReference,
  stableSerialize,
  isIsoDate,
  sortFindings,
  countFindings
};
