/**
 * Cruvit — Smart Recommendations developer Structured Climate Profile validator
 * ---------------------------------------------------------------------------
 * Inert, developer/test-only audit layer over Profile Registry builds plus
 * harness-supplied Field Review (and optional Evidence Packet) snapshots.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Does not mutate Profile/FR/EP inputs, catalog, needsReview, or eligibility.
 *  - Does not import Field Review Validator, product runtime, GOS, or v1b.
 */

import {
  SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_VERSION,
  SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
  SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_CAPABILITY,
  SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_CONTRACT_VERSIONS,
  SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_REGISTRY_VERSIONS,
  SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_FIELD_REVIEW_CONTRACT_VERSIONS,
  SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_FIELD_REVIEW_REGISTRY_VERSIONS,
  SR_STRUCTURED_CLIMATE_PROFILE_FIELDS,
  SR_STRUCTURED_CLIMATE_PROFILE_CLAIM_TYPES,
  SR_STRUCTURED_CLIMATE_PROFILE_STATUSES,
  SR_STRUCTURED_CLIMATE_PROFILE_OUTCOME_APPLICABILITY,
  SR_STRUCTURED_CLIMATE_PROFILE_REASONS,
  buildStructuredClimateProfileFingerprint,
  normalizeStructuredClimateProfileContextScope,
  normalizeStructuredClimateProfileEvidenceRefs,
  validateAndBuildStructuredClimateProfileRegistry,
  getEmptySmartRecDeveloperStructuredClimateProfileRegistry,
  getSmartRecDeveloperStructuredClimateProfileRegistryDescriptor
} from './developer-structured-climate-profile-registry.js';

import {
  SR_FIELD_REVIEW_CONTRACT_VERSION,
  SR_FIELD_REVIEW_REGISTRY_VERSION,
  SR_FIELD_REVIEW_CONTRACT_VERSION_V01
} from './developer-field-review-registry.js';

export const SR_STRUCTURED_CLIMATE_PROFILE_VALIDATOR_VERSION =
  '0.1.0-sr-structured-climate-profile-validator';

export const SR_STRUCTURED_CLIMATE_PROFILE_VALIDATOR_CAPABILITY =
  'explicit_developer_structured_climate_profile_validation';

export const SR_STRUCTURED_CLIMATE_PROFILE_VALIDATOR_SUPPORTED_CONTRACT_VERSIONS =
  Object.freeze(SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_CONTRACT_VERSIONS.slice());

export const SR_STRUCTURED_CLIMATE_PROFILE_VALIDATOR_SUPPORTED_REGISTRY_VERSIONS =
  Object.freeze(SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_REGISTRY_VERSIONS.slice());

export const SR_STRUCTURED_CLIMATE_PROFILE_VALIDATOR_SUPPORTED_FIELD_REVIEW_CONTRACT_VERSIONS =
  Object.freeze(
    SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_FIELD_REVIEW_CONTRACT_VERSIONS.slice()
  );

export const SR_STRUCTURED_CLIMATE_PROFILE_VALIDATOR_SUPPORTED_FIELD_REVIEW_REGISTRY_VERSIONS =
  Object.freeze(
    SR_STRUCTURED_CLIMATE_PROFILE_SUPPORTED_FIELD_REVIEW_REGISTRY_VERSIONS.slice()
  );

export const SR_STRUCTURED_CLIMATE_PROFILE_VALIDATOR_SEVERITIES = Object.freeze([
  'error',
  'warning',
  'info'
]);

export const SR_STRUCTURED_CLIMATE_PROFILE_VALIDATOR_FINDING_CODES = Object.freeze([
  'invalid_input',
  'unsupported_profile_contract_version',
  'unsupported_profile_registry_version',
  'missing_field_review_reference',
  'unsupported_field_review_reference_version',
  'legacy_field_review_insufficient',
  'field_review_identity_mismatch',
  'field_review_field_mismatch',
  'field_review_status_mismatch',
  'field_review_claim_mismatch',
  'field_review_value_mismatch',
  'field_review_context_mismatch',
  'field_review_fingerprint_mismatch',
  'evidence_reference_mismatch',
  'evidence_content_fingerprint_mismatch',
  'profile_stronger_than_field_review',
  'identity_ambiguity_conflict',
  'unsupported_reviewed_claim',
  'general_guidance_not_approvable',
  'stale_or_inactive_support',
  'duplicate_active_profile',
  'duplicate_profile_id',
  'semantic_duplicate',
  'invalid_supersession',
  'registry_build_failed',
  'empty_registry_accepted',
  'mutation_detected',
  'fingerprint_mismatch'
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
      profileId: finding.profileId == null ? null : finding.profileId,
      canonicalKey: finding.canonicalKey == null ? null : finding.canonicalKey,
      field: finding.field == null ? null : finding.field,
      detail: finding.detail == null ? null : finding.detail,
      expected: finding.expected === undefined ? null : finding.expected,
      actual: finding.actual === undefined ? null : finding.actual
    })
  );
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

function indexFieldReviewSnapshots(list) {
  const map = Object.create(null);
  if (!Array.isArray(list)) return map;
  for (let i = 0; i < list.length; i++) {
    const s = asObject(list[i]);
    if (!s) continue;
    const ck = normalizeKey(s.canonicalKey);
    const field = normalizeTrim(s.field);
    if (!ck || !field) continue;
    map[ck + '::' + field] = s;
  }
  return map;
}

function indexEvidenceSnapshots(list) {
  const map = Object.create(null);
  if (!Array.isArray(list)) return map;
  for (let i = 0; i < list.length; i++) {
    const s = asObject(list[i]);
    if (!s) continue;
    const id = normalizeTrim(s.evidenceId);
    if (!id) continue;
    map[id] = s;
  }
  return map;
}

function buildDescriptor() {
  return freezeDeep({
    validatorVersion: SR_STRUCTURED_CLIMATE_PROFILE_VALIDATOR_VERSION,
    capability: SR_STRUCTURED_CLIMATE_PROFILE_VALIDATOR_CAPABILITY,
    supportedRegistryVersion: SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_VERSION,
    supportedProfileContractVersion: SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
    supportedRegistryVersions:
      SR_STRUCTURED_CLIMATE_PROFILE_VALIDATOR_SUPPORTED_REGISTRY_VERSIONS.slice(),
    supportedProfileContractVersions:
      SR_STRUCTURED_CLIMATE_PROFILE_VALIDATOR_SUPPORTED_CONTRACT_VERSIONS.slice(),
    supportedFieldReviewContractVersions:
      SR_STRUCTURED_CLIMATE_PROFILE_VALIDATOR_SUPPORTED_FIELD_REVIEW_CONTRACT_VERSIONS.slice(),
    supportedFieldReviewRegistryVersions:
      SR_STRUCTURED_CLIMATE_PROFILE_VALIDATOR_SUPPORTED_FIELD_REVIEW_REGISTRY_VERSIONS.slice(),
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
    findingCodes: SR_STRUCTURED_CLIMATE_PROFILE_VALIDATOR_FINDING_CODES.slice(),
    severities: SR_STRUCTURED_CLIMATE_PROFILE_VALIDATOR_SEVERITIES.slice(),
    realProfileCount: 0
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperStructuredClimateProfileValidatorDescriptor() {
  return DESCRIPTOR;
}

function buildReportSummaryFingerprint(parts) {
  const findings = parts.findings || [];
  const codes = findings
    .map(function (f) {
      return f.code;
    })
    .slice()
    .sort();
  return [
    SR_STRUCTURED_CLIMATE_PROFILE_VALIDATOR_VERSION,
    SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_VERSION,
    parts.valid ? 1 : 0,
    parts.profileCount || 0,
    findings.length,
    codes.join(','),
    parts.registrySummaryFingerprint || ''
  ].join('|');
}

/**
 * Validate a synthetic Profile collection against plain FR (and optional EP) snapshots.
 */
export function validateSmartRecDeveloperStructuredClimateProfileRegistry(input) {
  const findings = [];
  const src = asObject(input) || {};

  const profilesSnap = Array.isArray(src.profiles)
    ? stableSerialize(src.profiles)
    : null;
  const frSnap = Array.isArray(src.fieldReviewSnapshots)
    ? stableSerialize(src.fieldReviewSnapshots)
    : null;
  const epSnap = Array.isArray(src.evidencePacketSnapshots)
    ? stableSerialize(src.evidencePacketSnapshots)
    : null;

  if (!Array.isArray(src.profiles)) {
    pushFinding(findings, {
      code: 'invalid_input',
      severity: 'error',
      detail: 'profiles_array_required'
    });
    return finalize(false, findings, 0, null, profilesSnap, frSnap, epSnap, src);
  }

  const frMap = indexFieldReviewSnapshots(src.fieldReviewSnapshots);
  const epMap = indexEvidenceSnapshots(src.evidencePacketSnapshots);

  const build = validateAndBuildStructuredClimateProfileRegistry(src.profiles, {
    profileContractVersion: SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
    registryVersion: SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_VERSION
  });

  if (!build.valid) {
    pushFinding(findings, {
      code: 'registry_build_failed',
      severity: 'error',
      detail: (build.reasons || []).filter(function (r) {
        return r !== 'ok';
      }).join(',')
    });
    for (let i = 0; i < (build.reasons || []).length; i++) {
      const code = build.reasons[i];
      if (code === 'ok') continue;
      if (code === 'duplicate_profile_id') {
        pushFinding(findings, { code: 'duplicate_profile_id', severity: 'error' });
      } else if (code === 'duplicate_active_canonical_field') {
        pushFinding(findings, { code: 'duplicate_active_profile', severity: 'error' });
      } else if (code === 'semantic_duplicate') {
        pushFinding(findings, { code: 'semantic_duplicate', severity: 'error' });
      } else if (code === 'invalid_supersession') {
        pushFinding(findings, { code: 'invalid_supersession', severity: 'error' });
      } else if (code === 'unsupported_profile_contract_version') {
        pushFinding(findings, {
          code: 'unsupported_profile_contract_version',
          severity: 'error'
        });
      } else if (code === 'unsupported_registry_version') {
        pushFinding(findings, {
          code: 'unsupported_profile_registry_version',
          severity: 'error'
        });
      } else if (code === 'mutation_detected') {
        pushFinding(findings, { code: 'mutation_detected', severity: 'error' });
      } else if (code === 'general_guidance_not_approvable') {
        pushFinding(findings, {
          code: 'general_guidance_not_approvable',
          severity: 'error'
        });
      } else if (code === 'fingerprint_mismatch') {
        pushFinding(findings, { code: 'fingerprint_mismatch', severity: 'error' });
      }
    }
  }

  if (src.profiles.length === 0 && build.valid) {
    pushFinding(findings, {
      code: 'empty_registry_accepted',
      severity: 'info',
      detail: 'realProfileCount_0'
    });
  }

  for (let i = 0; i < src.profiles.length; i++) {
    const raw = asObject(src.profiles[i]);
    if (!raw) {
      pushFinding(findings, { code: 'invalid_input', severity: 'error' });
      continue;
    }
    const profileId = normalizeTrim(raw.profileId);
    const canonicalKey = normalizeKey(raw.canonicalKey);
    const field = normalizeTrim(raw.field);
    const profileStatus = normalizeTrim(raw.profileStatus);
    const reviewedClaimType = isNonEmptyString(raw.reviewedClaimType)
      ? String(raw.reviewedClaimType).trim()
      : null;
    const reviewedValue = isNonEmptyString(raw.reviewedValue)
      ? String(raw.reviewedValue).trim()
      : null;

    const frRef = asObject(raw.fieldReviewReference);
    if (!frRef) {
      pushFinding(findings, {
        code: 'missing_field_review_reference',
        severity: 'error',
        profileId: profileId,
        canonicalKey: canonicalKey,
        field: field
      });
      continue;
    }

    const frContract = normalizeTrim(frRef.fieldReviewContractVersion);
    if (frContract === SR_FIELD_REVIEW_CONTRACT_VERSION_V01) {
      pushFinding(findings, {
        code: 'legacy_field_review_insufficient',
        severity: 'error',
        profileId: profileId,
        canonicalKey: canonicalKey,
        field: field
      });
    } else if (
      !frContract ||
      SR_STRUCTURED_CLIMATE_PROFILE_VALIDATOR_SUPPORTED_FIELD_REVIEW_CONTRACT_VERSIONS.indexOf(
        frContract
      ) < 0
    ) {
      pushFinding(findings, {
        code: 'unsupported_field_review_reference_version',
        severity: 'error',
        profileId: profileId,
        expected: SR_FIELD_REVIEW_CONTRACT_VERSION,
        actual: frContract
      });
    }

    const snapKey = (canonicalKey || '') + '::' + (field || '');
    const snap = frMap[snapKey];
    if (!snap) {
      pushFinding(findings, {
        code: 'missing_field_review_reference',
        severity: 'error',
        profileId: profileId,
        canonicalKey: canonicalKey,
        field: field,
        detail: 'snapshot_not_found'
      });
      continue;
    }

    const snapKeyN = normalizeKey(snap.canonicalKey);
    const snapField = normalizeTrim(snap.field);
    if (snapKeyN !== canonicalKey) {
      pushFinding(findings, {
        code: 'field_review_identity_mismatch',
        severity: 'error',
        profileId: profileId,
        expected: snapKeyN,
        actual: canonicalKey
      });
    }
    if (snapField !== field) {
      pushFinding(findings, {
        code: 'field_review_field_mismatch',
        severity: 'error',
        profileId: profileId,
        expected: snapField,
        actual: field
      });
    }

    const snapStatus = normalizeTrim(snap.reviewStatus);
    const refStatus = normalizeTrim(frRef.reviewStatus);
    if (refStatus !== snapStatus) {
      pushFinding(findings, {
        code: 'field_review_status_mismatch',
        severity: 'error',
        profileId: profileId,
        expected: snapStatus,
        actual: refStatus
      });
    }

    if (profileStatus === 'reviewed_supported') {
      if (snapStatus !== 'reviewed_supported') {
        pushFinding(findings, {
          code: 'profile_stronger_than_field_review',
          severity: 'error',
          profileId: profileId,
          detail: 'unresolved_or_non_supported_fr'
        });
        pushFinding(findings, {
          code: 'stale_or_inactive_support',
          severity: 'error',
          profileId: profileId
        });
      }
      if (snapStatus === 'identity_ambiguous') {
        pushFinding(findings, {
          code: 'identity_ambiguity_conflict',
          severity: 'error',
          profileId: profileId
        });
      }
      if (normalizeTrim(snap.reviewedClaimType) === 'general_guidance') {
        pushFinding(findings, {
          code: 'general_guidance_not_approvable',
          severity: 'error',
          profileId: profileId
        });
      }
      if (
        reviewedClaimType &&
        SR_STRUCTURED_CLIMATE_PROFILE_CLAIM_TYPES.indexOf(reviewedClaimType) < 0
      ) {
        pushFinding(findings, {
          code: 'unsupported_reviewed_claim',
          severity: 'error',
          profileId: profileId,
          actual: reviewedClaimType
        });
      }

      const snapClaim = normalizeTrim(snap.reviewedClaimType);
      if (snapClaim && reviewedClaimType && snapClaim !== reviewedClaimType) {
        pushFinding(findings, {
          code: 'field_review_claim_mismatch',
          severity: 'error',
          profileId: profileId,
          expected: snapClaim,
          actual: reviewedClaimType
        });
      }
      const snapValue = normalizeTrim(snap.reviewedValue);
      if (snapValue && reviewedValue && snapValue !== reviewedValue) {
        pushFinding(findings, {
          code: 'field_review_value_mismatch',
          severity: 'error',
          profileId: profileId,
          expected: snapValue,
          actual: reviewedValue
        });
      }
    }

    const snapFp = normalizeTrim(snap.valueFingerprint);
    const refFp = normalizeTrim(frRef.valueFingerprint);
    if (snapFp && refFp && snapFp !== refFp) {
      pushFinding(findings, {
        code: 'field_review_fingerprint_mismatch',
        severity: 'error',
        profileId: profileId,
        expected: snapFp,
        actual: refFp
      });
    }

    const profileCtx = normalizeStructuredClimateProfileContextScope(raw.contextScope);
    const snapCtx = normalizeStructuredClimateProfileContextScope(snap.contextScope);
    if (profileCtx.ok && snapCtx.ok && profileCtx.key !== snapCtx.key) {
      pushFinding(findings, {
        code: 'field_review_context_mismatch',
        severity: 'error',
        profileId: profileId
      });
    }

    const profileRefs = normalizeStructuredClimateProfileEvidenceRefs(
      raw.evidenceRefs == null ? [] : raw.evidenceRefs
    );
    const snapRefs = normalizeStructuredClimateProfileEvidenceRefs(
      snap.evidenceRefs == null ? [] : snap.evidenceRefs
    );
    if (profileRefs.ok && snapRefs.ok) {
      if (
        serializeEvidenceRefs(profileRefs.normalized) !==
        serializeEvidenceRefs(snapRefs.normalized)
      ) {
        pushFinding(findings, {
          code: 'evidence_reference_mismatch',
          severity: 'error',
          profileId: profileId
        });
      }
    }

    if (profileRefs.ok && Object.keys(epMap).length > 0) {
      for (let r = 0; r < profileRefs.normalized.length; r++) {
        const ref = profileRefs.normalized[r];
        const ep = epMap[ref.evidenceId];
        if (!ep) {
          pushFinding(findings, {
            code: 'evidence_reference_mismatch',
            severity: 'error',
            profileId: profileId,
            detail: 'evidence_snapshot_missing',
            actual: ref.evidenceId
          });
          continue;
        }
        const epFp =
          normalizeTrim(ep.contentFingerprint) ||
          normalizeTrim(ep.expectedContentFingerprint);
        if (epFp && epFp !== ref.expectedContentFingerprint) {
          pushFinding(findings, {
            code: 'evidence_content_fingerprint_mismatch',
            severity: 'error',
            profileId: profileId,
            expected: epFp,
            actual: ref.expectedContentFingerprint
          });
        }
      }
    }
  }

  return finalize(
    findings.filter(function (f) {
      return f.severity === 'error';
    }).length === 0 && build.valid,
    findings,
    src.profiles.length,
    build.summaryFingerprint,
    profilesSnap,
    frSnap,
    epSnap,
    src
  );
}

function finalize(
  valid,
  findings,
  profileCount,
  registrySummaryFingerprint,
  profilesSnap,
  frSnap,
  epSnap,
  src
) {
  if (profilesSnap != null && Array.isArray(src.profiles)) {
    if (stableSerialize(src.profiles) !== profilesSnap) {
      pushFinding(findings, {
        code: 'mutation_detected',
        severity: 'error',
        detail: 'profiles'
      });
      valid = false;
    }
  }
  if (frSnap != null && Array.isArray(src.fieldReviewSnapshots)) {
    if (stableSerialize(src.fieldReviewSnapshots) !== frSnap) {
      pushFinding(findings, {
        code: 'mutation_detected',
        severity: 'error',
        detail: 'fieldReviewSnapshots'
      });
      valid = false;
    }
  }
  if (epSnap != null && Array.isArray(src.evidencePacketSnapshots)) {
    if (stableSerialize(src.evidencePacketSnapshots) !== epSnap) {
      pushFinding(findings, {
        code: 'mutation_detected',
        severity: 'error',
        detail: 'evidencePacketSnapshots'
      });
      valid = false;
    }
  }

  const sorted = findings.slice().sort(function (a, b) {
    const ca = String(a.code);
    const cb = String(b.code);
    if (ca < cb) return -1;
    if (ca > cb) return 1;
    const pa = String(a.profileId || '');
    const pb = String(b.profileId || '');
    if (pa < pb) return -1;
    if (pa > pb) return 1;
    return 0;
  });

  const errorCount = sorted.filter(function (f) {
    return f.severity === 'error';
  }).length;
  const finalValid = valid && errorCount === 0;

  const findingsByCode = Object.create(null);
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i].code;
    findingsByCode[c] = (findingsByCode[c] || 0) + 1;
  }

  return freezeDeep({
    valid: finalValid,
    findings: sorted,
    findingsByCode: findingsByCode,
    profileCount: profileCount,
    registryDescriptor: getSmartRecDeveloperStructuredClimateProfileRegistryDescriptor(),
    validatorDescriptor: DESCRIPTOR,
    emptyRegistry: getEmptySmartRecDeveloperStructuredClimateProfileRegistry(),
    summaryFingerprint: buildReportSummaryFingerprint({
      valid: finalValid,
      findings: sorted,
      profileCount: profileCount,
      registrySummaryFingerprint: registrySummaryFingerprint || ''
    })
  });
}

// Re-export useful peers for harness convenience
export {
  SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_VERSION,
  SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION,
  SR_STRUCTURED_CLIMATE_PROFILE_REGISTRY_CAPABILITY,
  SR_STRUCTURED_CLIMATE_PROFILE_FIELDS,
  SR_STRUCTURED_CLIMATE_PROFILE_CLAIM_TYPES,
  SR_STRUCTURED_CLIMATE_PROFILE_STATUSES,
  SR_STRUCTURED_CLIMATE_PROFILE_OUTCOME_APPLICABILITY,
  SR_STRUCTURED_CLIMATE_PROFILE_REASONS,
  SR_FIELD_REVIEW_CONTRACT_VERSION,
  SR_FIELD_REVIEW_REGISTRY_VERSION,
  buildStructuredClimateProfileFingerprint,
  normalizeStructuredClimateProfileContextScope,
  normalizeStructuredClimateProfileEvidenceRefs,
  validateAndBuildStructuredClimateProfileRegistry,
  getEmptySmartRecDeveloperStructuredClimateProfileRegistry,
  getSmartRecDeveloperStructuredClimateProfileRegistryDescriptor
};
