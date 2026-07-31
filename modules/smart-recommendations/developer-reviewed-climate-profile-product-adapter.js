/**
 * Cruvit — Smart Recommendations developer reviewedClimateProfile Product Adapter
 * ---------------------------------------------------------------------------
 * Developer-only, explicit-call-only, in-memory analysis helper.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Returns analysis + non-authoritative reviewedCandidateValue only.
 *  - Never grants product/eligibility/scalar/recommendation/GOS authority.
 *  - Never mutates climateTraits, reviewedClimateProfile, needsReview, or identity.
 *  - Never calls v1b, Smart Recommendations, GOS, weather, or trusted-location helpers.
 */

import {
  SR_EVIDENCE_PACKET_FIELDS,
  SR_EVIDENCE_PROPOSED_VALUES_SUN,
  SR_EVIDENCE_PROPOSED_VALUES_WATER,
  SR_EVIDENCE_CONTEXT_SETTINGS,
  SR_EVIDENCE_CONTEXT_PLANTINGS,
  SR_EVIDENCE_CONTEXT_MATURITIES,
  SR_EVIDENCE_CONTEXT_OBJECTIVES,
  SR_EVIDENCE_CONTEXT_DAYPARTS,
  SR_EVIDENCE_CONTEXT_HEAT_PROTECTIONS,
  normalizeEvidencePacketContextScope
} from './developer-evidence-packet-registry.js';

import {
  SR_STRUCTURED_CLIMATE_PROFILE_STATUSES,
  SR_STRUCTURED_CLIMATE_PROFILE_CLAIM_TYPES
} from './developer-structured-climate-profile-registry.js';

import { stableSerialize, sortFindings } from './developer-reviewed-data-source-capture-contract.js';

export const SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_VERSION =
  '0.1.0-sr-reviewed-climate-profile-product-adapter';

export const SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_CONTRACT_VERSION =
  '0.1.0-sr-reviewed-climate-profile-product-adapter-contract';

export const SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_RESULT_CONTRACT_VERSION =
  '0.1.0-sr-reviewed-climate-profile-product-adapter-result';

export const SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_CAPABILITY =
  'explicit_developer_reviewed_climate_profile_product_adapter_analysis';

export const SR_CATALOG_REVIEWED_CLIMATE_PROFILE_INTEGRATION_CONTRACT_VERSION =
  '0.1.0-sr-catalog-reviewed-climate-profile-integration-contract';

export const SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION_FOR_ADAPTER =
  '0.1.0-sr-structured-climate-profile-contract';

export const SR_PRODUCT_ADAPTER_PRIMARY_STATUSES = Object.freeze([
  'adapter_not_run',
  'reviewed_profile_absent',
  'reviewed_profile_stale',
  'reviewed_profile_blocked',
  'identity_blocked',
  'needs_review_blocked',
  'context_unknown',
  'context_incompatible',
  'region_unknown',
  'region_incompatible',
  'legacy_missing',
  'reviewed_non_supported',
  'reviewed_supported_agreement',
  'reviewed_supported_conflict',
  'product_authority_not_granted'
]);

export const SR_PRODUCT_ADAPTER_COMPARISON = Object.freeze([
  'agreement',
  'conflict',
  'legacy_missing',
  'reviewed_missing',
  'not_comparable'
]);

export const SR_PRODUCT_ADAPTER_LEGACY_SOURCES = Object.freeze([
  'catalog',
  'group_default',
  'specific_override',
  'merged',
  'missing'
]);

export const SR_PRODUCT_ADAPTER_ALIAS_STATUSES = Object.freeze([
  'canonical',
  'alias_resolved',
  'unresolved',
  'conflict'
]);

export const SR_PRODUCT_ADAPTER_PARENT_SCOPES = Object.freeze([
  'species',
  'genus',
  'spp_parent',
  'parent_record',
  'unknown'
]);

export const SR_PRODUCT_ADAPTER_INTEGRATION_STATUSES = Object.freeze([
  'inert_imported',
  'inert_blocked',
  'stale'
]);

export const SR_PRODUCT_ADAPTER_FINDING_CODES = Object.freeze([
  'unsupported_adapter_contract',
  'invalid_input',
  'unknown_input_key',
  'canonical_identity_mismatch',
  'accepted_scientific_name_mismatch',
  'field_mismatch',
  'identity_binding_mismatch',
  'catalog_snapshot_fingerprint_mismatch',
  'reviewed_profile_contract_unsupported',
  'reviewed_profile_fingerprint_mismatch',
  'source_batch_unverified',
  'authority_flag_violation',
  'product_authority_attempt',
  'eligibility_authority_attempt',
  'scalar_authority_attempt',
  'runtime_consumption_attempt',
  'GOS_authority_attempt',
  'mutation_detected',
  'needs_review_active',
  'identity_conflict_active',
  'genus_or_parent_scope_blocked',
  'canonical_identity_unconfirmed',
  'reviewed_profile_absent',
  'reviewed_profile_stale',
  'reviewed_profile_blocked',
  'profile_status_blocked',
  'context_missing',
  'context_incompatible',
  'region_unknown',
  'region_incompatible',
  'legacy_value_missing',
  'reviewed_value_missing',
  'legacy_reviewed_agreement',
  'legacy_reviewed_conflict',
  'candidate_value_available',
  'product_authority_not_granted'
]);

const TOP_LEVEL_KEYS = Object.freeze([
  'adapterContractVersion',
  'canonicalKey',
  'acceptedScientificName',
  'field',
  'catalogClimateTraitsSnapshot',
  'reviewedClimateProfileSnapshot',
  'identityState',
  'targetContext',
  'targetRegion',
  'adapterOptions',
  'expectedProfileFingerprint',
  'expectedSourceBatchValidationFingerprint',
  'expectedCatalogSnapshotFingerprint',
  'expectedIdentityBindingFingerprint'
]);

const LEGACY_KEYS = Object.freeze([
  'field',
  'legacyObservedValue',
  'legacySource',
  'legacyNeedsReview',
  'warningFlags',
  'hardBlockRules',
  'climateTraitsFieldFingerprint',
  'descriptiveNotes'
]);

const LEGACY_REQUIRED = Object.freeze([
  'field',
  'legacyObservedValue',
  'legacySource',
  'legacyNeedsReview',
  'warningFlags',
  'hardBlockRules',
  'climateTraitsFieldFingerprint'
]);

const REVIEWED_PARENT_KEYS = Object.freeze([
  'absent',
  'integrationContractVersion',
  'integrationStatus',
  'productAuthority',
  'eligibilityAuthority',
  'scalarAuthority',
  'runtimeRecommendationAuthority',
  'GOSOutcomeAuthority',
  'identityBinding',
  'fieldSnapshot'
]);

const FIELD_SNAPSHOT_KEYS = Object.freeze([
  'profileId',
  'sourceProfileContractVersion',
  'field',
  'profileStatus',
  'reviewedClaimType',
  'reviewedValue',
  'contextScope',
  'profileFingerprint',
  'fieldReviewReference',
  'evidenceRefCount',
  'unresolvedLimitations',
  'sourceBatchId',
  'sourceBatchValidationFingerprint',
  'outcomeApplicability',
  'supersedesProfileId',
  'lastReviewed'
]);

const FIELD_SNAPSHOT_REQUIRED = Object.freeze([
  'profileId',
  'sourceProfileContractVersion',
  'field',
  'profileStatus',
  'contextScope',
  'profileFingerprint',
  'fieldReviewReference',
  'evidenceRefCount',
  'unresolvedLimitations',
  'sourceBatchId',
  'sourceBatchValidationFingerprint'
]);

const IDENTITY_KEYS = Object.freeze([
  'canonicalKey',
  'acceptedScientificName',
  'identityRegistryVersion',
  'currentNeedsReview',
  'currentIdentityConflict',
  'currentIdentityBindingFingerprint',
  'aliasResolutionStatus',
  'parentOrGenusScope',
  'canonicalIdentityConfirmed'
]);

const OPTIONS_KEYS = Object.freeze([
  'includeExplanationParts',
  'runtimeConsumptionRequested',
  'productAuthorityRequested',
  'eligibilityAuthorityRequested',
  'scalarAuthorityRequested',
  'GOSAuthorityRequested'
]);

const AUTHORITY_KEYS = Object.freeze([
  'productAuthority',
  'eligibilityAuthority',
  'scalarAuthority',
  'runtimeRecommendationAuthority',
  'GOSOutcomeAuthority'
]);

const FORBIDDEN_VALUE_KEYS = Object.freeze([
  'effectiveValue',
  'resolvedValue',
  'finalValue',
  'recommendedValue',
  'eligibilityValue',
  'matchValue',
  'suitabilityScore'
]);

const CANONICAL_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EP_CONTEXT_CONTRACT = '0.2.0-sr-evidence-packet-contract';

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function freezeDeep(v, seen) {
  seen = seen || new WeakSet();
  if (v === null || typeof v !== 'object') return v;
  if (seen.has(v)) return v;
  seen.add(v);
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) freezeDeep(v[i], seen);
  } else {
    Object.keys(v).forEach(function (k) {
      freezeDeep(v[k], seen);
    });
  }
  return Object.freeze(v);
}

function cloneJson(v) {
  return JSON.parse(JSON.stringify(v));
}

function unknownKeys(obj, allowed) {
  const allow = Object.create(null);
  for (let i = 0; i < allowed.length; i++) allow[allowed[i]] = true;
  return Object.keys(obj || {}).filter(function (k) {
    return !allow[k];
  });
}

function hasAnyKey(obj, keys) {
  for (let i = 0; i < keys.length; i++) {
    if (Object.prototype.hasOwnProperty.call(obj || {}, keys[i])) return true;
  }
  return false;
}

function inList(list, v) {
  return list.indexOf(v) >= 0;
}

function valuesForField(field) {
  if (field === 'sun') return SR_EVIDENCE_PROPOSED_VALUES_SUN;
  if (field === 'water') return SR_EVIDENCE_PROPOSED_VALUES_WATER;
  return null;
}

function normalizeRegion(region) {
  if (region === undefined) return { kind: 'omitted', value: null };
  if (typeof region === 'string') {
    const s = region.trim();
    if (!s) return { kind: 'invalid', value: null };
    return { kind: 'present', value: s };
  }
  if (Array.isArray(region)) {
    const out = [];
    const seen = Object.create(null);
    for (let i = 0; i < region.length; i++) {
      if (!isNonEmptyString(region[i])) return { kind: 'invalid', value: null };
      const s = String(region[i]).trim();
      if (seen[s]) continue;
      seen[s] = true;
      out.push(s);
    }
    out.sort();
    if (!out.length) return { kind: 'invalid', value: null };
    return { kind: 'present', value: out };
  }
  return { kind: 'invalid', value: null };
}

function regionsEqual(a, b) {
  return stableSerialize(a) === stableSerialize(b);
}

function sortStringArray(arr) {
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    if (!isNonEmptyString(arr[i])) return null;
    out.push(String(arr[i]).trim());
  }
  return out.slice().sort();
}

function pushFinding(findings, code, severity, path, detail) {
  findings.push({
    code: code,
    severity: severity,
    path: path || '',
    detail: detail == null ? '' : String(detail)
  });
}

function hasCode(findings, code) {
  return findings.some(function (f) {
    return f.code === code;
  });
}

function authorityBoundaryFalse() {
  return freezeDeep({
    productAuthority: false,
    eligibilityAuthority: false,
    scalarAuthority: false,
    runtimeRecommendationAuthority: false,
    GOSOutcomeAuthority: false,
    productUseAllowed: false,
    runtimeConsumptionAllowed: false
  });
}

export function getSmartRecDeveloperReviewedClimateProfileProductAdapterDescriptor() {
  return freezeDeep({
    module: 'developer-reviewed-climate-profile-product-adapter',
    version: SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_VERSION,
    adapterContractVersion: SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_CONTRACT_VERSION,
    resultContractVersion: SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_RESULT_CONTRACT_VERSION,
    capability: SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_CAPABILITY,
    developerOnly: true,
    authoritative: false,
    productConsumer: false,
    productAuthority: false,
    eligibilityAuthority: false,
    scalarAuthority: false,
    runtimeRecommendationAuthority: false,
    GOSOutcomeAuthority: false,
    productUseAllowed: false,
    runtimeConsumptionAllowed: false,
    network: false,
    externalApi: false,
    persistence: false,
    filesystemWrite: false,
    automaticExecution: false,
    activation: 'explicit_developer_call_only',
    indexHtmlImport: false,
    runtimeImport: false,
    inputMutation: false,
    registryMutation: false,
    gitCommit: false,
    gitPush: false,
    deploy: false,
    supportedPeerContracts: Object.freeze([
      SR_CATALOG_REVIEWED_CLIMATE_PROFILE_INTEGRATION_CONTRACT_VERSION,
      SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION_FOR_ADAPTER,
      '0.2.0-sr-field-review-contract',
      '0.2.0-sr-field-review-registry'
    ]),
    findingCodeCount: SR_PRODUCT_ADAPTER_FINDING_CODES.length
  });
}

function emptyGate(status) {
  return { passed: false, status: status || 'not_evaluated', reasons: [] };
}

function gate(passed, status, reasons) {
  return freezeDeep({
    passed: !!passed,
    status: status,
    reasons: (reasons || []).slice()
  });
}

function emptyCandidate() {
  return freezeDeep({
    reviewedCandidateValue: null,
    reviewedClaimType: null,
    sourceProfileId: null,
    candidateAvailable: false,
    productUseAllowed: false
  });
}

function buildInputFingerprint(normalized) {
  return (
    'adapterInput|' +
    stableSerialize({
      adapterContractVersion: normalized.adapterContractVersion,
      canonicalKey: normalized.canonicalKey,
      acceptedScientificName: normalized.acceptedScientificName,
      field: normalized.field,
      catalogClimateTraitsSnapshot: normalized.catalogClimateTraitsSnapshot,
      reviewedClimateProfileSnapshot: normalized.reviewedClimateProfileSnapshot,
      identityState: normalized.identityState,
      targetContext: normalized.targetContext,
      targetRegion: normalized.targetRegion === undefined ? null : normalized.targetRegion,
      adapterOptions: normalized.adapterOptions,
      expectedProfileFingerprint: normalized.expectedProfileFingerprint || null,
      expectedSourceBatchValidationFingerprint:
        normalized.expectedSourceBatchValidationFingerprint || null,
      expectedCatalogSnapshotFingerprint: normalized.expectedCatalogSnapshotFingerprint || null,
      expectedIdentityBindingFingerprint: normalized.expectedIdentityBindingFingerprint || null
    })
  );
}

function buildSummaryFingerprint(parts) {
  return (
    'adapterResult|' +
    stableSerialize({
      inputFingerprint: parts.inputFingerprint,
      resultContractVersion: SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_RESULT_CONTRACT_VERSION,
      status: parts.status,
      identityGate: parts.identityGate,
      reviewedProfileGate: parts.reviewedProfileGate,
      contextGate: parts.contextGate,
      regionGate: parts.regionGate,
      comparison: parts.comparison,
      findings: parts.findings,
      warnings: parts.warnings,
      candidate: parts.candidate,
      authorityBoundary: parts.authorityBoundary,
      explanationParts: parts.explanationParts
    })
  );
}

function normalizeContextExact(scope, findings, path) {
  if (!asObject(scope)) {
    pushFinding(findings, 'context_missing', 'error', path, 'missing_context');
    return null;
  }
  const unknown = unknownKeys(scope, [
    'setting',
    'planting',
    'maturity',
    'objective',
    'daypart',
    'heatProtection',
    'climateOrRegion',
    'season',
    'outcomeApplicability'
  ]);
  if (unknown.length) {
    pushFinding(findings, 'invalid_input', 'error', path, 'unknown_context_keys:' + unknown.join(','));
    return null;
  }
  const required = ['setting', 'planting', 'maturity', 'objective'];
  for (let i = 0; i < required.length; i++) {
    if (!isNonEmptyString(scope[required[i]])) {
      pushFinding(findings, 'context_missing', 'error', path + '.' + required[i], 'required_missing');
      return null;
    }
  }
  if (!inList(SR_EVIDENCE_CONTEXT_SETTINGS, scope.setting)) {
    pushFinding(findings, 'invalid_input', 'error', path + '.setting', 'invalid_token');
    return null;
  }
  if (!inList(SR_EVIDENCE_CONTEXT_PLANTINGS, scope.planting)) {
    pushFinding(findings, 'invalid_input', 'error', path + '.planting', 'invalid_token');
    return null;
  }
  if (!inList(SR_EVIDENCE_CONTEXT_MATURITIES, scope.maturity)) {
    pushFinding(findings, 'invalid_input', 'error', path + '.maturity', 'invalid_token');
    return null;
  }
  if (!inList(SR_EVIDENCE_CONTEXT_OBJECTIVES, scope.objective)) {
    pushFinding(findings, 'invalid_input', 'error', path + '.objective', 'invalid_token');
    return null;
  }
  const ep = normalizeEvidencePacketContextScope(scope, EP_CONTEXT_CONTRACT);
  if (!ep || !ep.ok || !ep.normalized) {
    pushFinding(findings, 'invalid_input', 'error', path, 'context_normalize_failed');
    return null;
  }
  const out = {
    setting: ep.normalized.setting,
    planting: ep.normalized.planting,
    maturity: ep.normalized.maturity,
    objective: ep.normalized.objective
  };
  if (scope.daypart !== undefined) {
    if (!inList(SR_EVIDENCE_CONTEXT_DAYPARTS, scope.daypart)) {
      pushFinding(findings, 'invalid_input', 'error', path + '.daypart', 'invalid_token');
      return null;
    }
    out.daypart = scope.daypart;
  }
  if (scope.heatProtection !== undefined) {
    if (!inList(SR_EVIDENCE_CONTEXT_HEAT_PROTECTIONS, scope.heatProtection)) {
      pushFinding(findings, 'invalid_input', 'error', path + '.heatProtection', 'invalid_token');
      return null;
    }
    out.heatProtection = scope.heatProtection;
  }
  if (scope.climateOrRegion !== undefined) {
    const r = normalizeRegion(scope.climateOrRegion);
    if (r.kind !== 'present') {
      pushFinding(findings, 'invalid_input', 'error', path + '.climateOrRegion', 'invalid_region');
      return null;
    }
    out.climateOrRegion = r.value;
  }
  if (scope.season !== undefined) {
    if (!isNonEmptyString(scope.season)) {
      pushFinding(findings, 'invalid_input', 'error', path + '.season', 'invalid_season');
      return null;
    }
    out.season = String(scope.season).trim();
  }
  if (scope.outcomeApplicability !== undefined) {
    const oa = sortStringArray(scope.outcomeApplicability);
    if (!oa) {
      pushFinding(findings, 'invalid_input', 'error', path + '.outcomeApplicability', 'invalid');
      return null;
    }
    out.outcomeApplicability = oa;
  }
  return out;
}

function contextsCompatible(target, profile, findings) {
  if (!target || !profile) {
    pushFinding(findings, 'context_missing', 'error', 'context', 'missing_side');
    return { ok: false, status: 'context_unknown' };
  }
  const req = ['setting', 'planting', 'maturity', 'objective'];
  for (let i = 0; i < req.length; i++) {
    if (target[req[i]] !== profile[req[i]]) {
      pushFinding(
        findings,
        'context_incompatible',
        'error',
        'targetContext.' + req[i],
        target[req[i]] + '!=' + profile[req[i]]
      );
      return { ok: false, status: 'context_incompatible' };
    }
  }
  const opt = ['daypart', 'heatProtection', 'season'];
  for (let j = 0; j < opt.length; j++) {
    const k = opt[j];
    const tHas = Object.prototype.hasOwnProperty.call(target, k);
    const pHas = Object.prototype.hasOwnProperty.call(profile, k);
    if (tHas || pHas) {
      if (!tHas || !pHas || target[k] !== profile[k]) {
        pushFinding(findings, 'context_incompatible', 'error', 'targetContext.' + k, 'optional_mismatch');
        return { ok: false, status: 'context_incompatible' };
      }
    }
  }
  const tReg = Object.prototype.hasOwnProperty.call(target, 'climateOrRegion');
  const pReg = Object.prototype.hasOwnProperty.call(profile, 'climateOrRegion');
  if (tReg || pReg) {
    if (!tReg || !pReg || !regionsEqual(target.climateOrRegion, profile.climateOrRegion)) {
      pushFinding(
        findings,
        'context_incompatible',
        'error',
        'targetContext.climateOrRegion',
        'optional_region_mismatch'
      );
      return { ok: false, status: 'context_incompatible' };
    }
  }
  const tOa = Object.prototype.hasOwnProperty.call(target, 'outcomeApplicability');
  const pOa = Object.prototype.hasOwnProperty.call(profile, 'outcomeApplicability');
  if (tOa || pOa) {
    if (!tOa || !pOa || stableSerialize(target.outcomeApplicability) !== stableSerialize(profile.outcomeApplicability)) {
      pushFinding(
        findings,
        'context_incompatible',
        'error',
        'targetContext.outcomeApplicability',
        'optional_mismatch'
      );
      return { ok: false, status: 'context_incompatible' };
    }
  }
  return { ok: true, status: 'compatible' };
}

function evaluateRegionGate(targetRegion, profileScope, findings) {
  const profileHas =
    profileScope && Object.prototype.hasOwnProperty.call(profileScope, 'climateOrRegion');
  const targetNorm = targetRegion === undefined ? { kind: 'omitted', value: null } : normalizeRegion(targetRegion);
  if (targetRegion !== undefined && targetNorm.kind !== 'present') {
    pushFinding(findings, 'invalid_input', 'error', 'targetRegion', 'invalid_region');
    return gate(false, 'region_unknown', ['invalid_target_region']);
  }
  if (!profileHas && targetNorm.kind === 'omitted') {
    return gate(true, 'not_applicable', []);
  }
  if (!profileHas && targetNorm.kind === 'present') {
    pushFinding(findings, 'region_unknown', 'error', 'region', 'profile_region_absent');
    return gate(false, 'region_unknown', ['profile_region_absent']);
  }
  if (profileHas && targetNorm.kind === 'omitted') {
    pushFinding(findings, 'region_unknown', 'error', 'region', 'target_region_absent');
    return gate(false, 'region_unknown', ['target_region_absent']);
  }
  if (!regionsEqual(targetNorm.value, profileScope.climateOrRegion)) {
    pushFinding(findings, 'region_incompatible', 'error', 'region', 'mismatch');
    return gate(false, 'region_incompatible', ['mismatch']);
  }
  return gate(true, 'compatible', []);
}

export function normalizeReviewedClimateProfileProductAdapterInput(input) {
  const findings = [];
  const raw = asObject(input);
  if (!raw) {
    pushFinding(findings, 'invalid_input', 'error', '', 'input_not_object');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (hasAnyKey(raw, FORBIDDEN_VALUE_KEYS)) {
    pushFinding(findings, 'product_authority_attempt', 'error', '', 'forbidden_value_key');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  const unk = unknownKeys(raw, TOP_LEVEL_KEYS);
  if (unk.length) {
    pushFinding(findings, 'unknown_input_key', 'error', '', unk.join(','));
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (raw.adapterContractVersion !== SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_CONTRACT_VERSION) {
    pushFinding(findings, 'unsupported_adapter_contract', 'error', 'adapterContractVersion', String(raw.adapterContractVersion));
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (!isNonEmptyString(raw.canonicalKey) || !CANONICAL_KEY_RE.test(raw.canonicalKey)) {
    pushFinding(findings, 'invalid_input', 'error', 'canonicalKey', 'invalid');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (!isNonEmptyString(raw.acceptedScientificName)) {
    pushFinding(findings, 'invalid_input', 'error', 'acceptedScientificName', 'invalid');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (!inList(SR_EVIDENCE_PACKET_FIELDS, raw.field)) {
    pushFinding(findings, 'invalid_input', 'error', 'field', 'unsupported_field');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }

  const optsRaw = asObject(raw.adapterOptions);
  if (!optsRaw) {
    pushFinding(findings, 'invalid_input', 'error', 'adapterOptions', 'missing');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  const optUnk = unknownKeys(optsRaw, OPTIONS_KEYS);
  if (optUnk.length) {
    pushFinding(findings, 'unknown_input_key', 'error', 'adapterOptions', optUnk.join(','));
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (optsRaw.runtimeConsumptionRequested === true) {
    pushFinding(findings, 'runtime_consumption_attempt', 'error', 'adapterOptions', 'true');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (optsRaw.productAuthorityRequested === true) {
    pushFinding(findings, 'product_authority_attempt', 'error', 'adapterOptions', 'true');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (optsRaw.eligibilityAuthorityRequested === true) {
    pushFinding(findings, 'eligibility_authority_attempt', 'error', 'adapterOptions', 'true');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (optsRaw.scalarAuthorityRequested === true) {
    pushFinding(findings, 'scalar_authority_attempt', 'error', 'adapterOptions', 'true');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (optsRaw.GOSAuthorityRequested === true) {
    pushFinding(findings, 'GOS_authority_attempt', 'error', 'adapterOptions', 'true');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  const adapterOptions = {
    includeExplanationParts: optsRaw.includeExplanationParts === undefined ? true : !!optsRaw.includeExplanationParts
  };

  const legacy = asObject(raw.catalogClimateTraitsSnapshot);
  if (!legacy) {
    pushFinding(findings, 'invalid_input', 'error', 'catalogClimateTraitsSnapshot', 'missing');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  const legUnk = unknownKeys(legacy, LEGACY_KEYS);
  if (legUnk.length) {
    pushFinding(findings, 'unknown_input_key', 'error', 'catalogClimateTraitsSnapshot', legUnk.join(','));
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  for (let i = 0; i < LEGACY_REQUIRED.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(legacy, LEGACY_REQUIRED[i])) {
      pushFinding(findings, 'invalid_input', 'error', 'catalogClimateTraitsSnapshot.' + LEGACY_REQUIRED[i], 'required');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
  }
  if (legacy.field !== raw.field) {
    pushFinding(findings, 'field_mismatch', 'error', 'catalogClimateTraitsSnapshot.field', legacy.field + '!=' + raw.field);
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (!inList(SR_PRODUCT_ADAPTER_LEGACY_SOURCES, legacy.legacySource)) {
    pushFinding(findings, 'invalid_input', 'error', 'catalogClimateTraitsSnapshot.legacySource', 'invalid');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (typeof legacy.legacyNeedsReview !== 'boolean') {
    pushFinding(findings, 'invalid_input', 'error', 'catalogClimateTraitsSnapshot.legacyNeedsReview', 'not_boolean');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  const warn = sortStringArray(legacy.warningFlags);
  const hard = sortStringArray(legacy.hardBlockRules);
  if (!warn || !hard) {
    pushFinding(findings, 'invalid_input', 'error', 'catalogClimateTraitsSnapshot', 'flags_not_string_arrays');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (!isNonEmptyString(legacy.climateTraitsFieldFingerprint)) {
    pushFinding(findings, 'invalid_input', 'error', 'catalogClimateTraitsSnapshot.climateTraitsFieldFingerprint', 'invalid');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  let legacyObservedValue = legacy.legacyObservedValue;
  if (legacy.legacySource === 'missing') {
    if (legacyObservedValue !== null) {
      pushFinding(findings, 'invalid_input', 'error', 'catalogClimateTraitsSnapshot.legacyObservedValue', 'must_be_null_when_missing');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
  } else {
    const allow = valuesForField(raw.field);
    if (!inList(allow, legacyObservedValue)) {
      pushFinding(findings, 'invalid_input', 'error', 'catalogClimateTraitsSnapshot.legacyObservedValue', 'not_allowlisted');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
  }
  const catalogClimateTraitsSnapshot = {
    field: legacy.field,
    legacyObservedValue: legacyObservedValue,
    legacySource: legacy.legacySource,
    legacyNeedsReview: legacy.legacyNeedsReview,
    warningFlags: warn,
    hardBlockRules: hard,
    climateTraitsFieldFingerprint: String(legacy.climateTraitsFieldFingerprint).trim()
  };
  if (legacy.descriptiveNotes !== undefined) {
    if (!isNonEmptyString(legacy.descriptiveNotes)) {
      pushFinding(findings, 'invalid_input', 'error', 'catalogClimateTraitsSnapshot.descriptiveNotes', 'invalid');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    catalogClimateTraitsSnapshot.descriptiveNotes = String(legacy.descriptiveNotes).trim();
  }

  const id = asObject(raw.identityState);
  if (!id) {
    pushFinding(findings, 'invalid_input', 'error', 'identityState', 'missing');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  const idUnk = unknownKeys(id, IDENTITY_KEYS);
  if (idUnk.length) {
    pushFinding(findings, 'unknown_input_key', 'error', 'identityState', idUnk.join(','));
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  for (let j = 0; j < IDENTITY_KEYS.length; j++) {
    if (!Object.prototype.hasOwnProperty.call(id, IDENTITY_KEYS[j])) {
      pushFinding(findings, 'invalid_input', 'error', 'identityState.' + IDENTITY_KEYS[j], 'required');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
  }
  if (id.canonicalKey !== raw.canonicalKey) {
    pushFinding(findings, 'canonical_identity_mismatch', 'error', 'identityState.canonicalKey', 'mismatch');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (id.acceptedScientificName !== raw.acceptedScientificName) {
    pushFinding(findings, 'accepted_scientific_name_mismatch', 'error', 'identityState.acceptedScientificName', 'mismatch');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (!isNonEmptyString(id.identityRegistryVersion)) {
    pushFinding(findings, 'invalid_input', 'error', 'identityState.identityRegistryVersion', 'invalid');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (typeof id.currentNeedsReview !== 'boolean' || typeof id.currentIdentityConflict !== 'boolean' || typeof id.canonicalIdentityConfirmed !== 'boolean') {
    pushFinding(findings, 'invalid_input', 'error', 'identityState', 'boolean_flags_invalid');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (!isNonEmptyString(id.currentIdentityBindingFingerprint)) {
    pushFinding(findings, 'invalid_input', 'error', 'identityState.currentIdentityBindingFingerprint', 'invalid');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (!inList(SR_PRODUCT_ADAPTER_ALIAS_STATUSES, id.aliasResolutionStatus)) {
    pushFinding(findings, 'invalid_input', 'error', 'identityState.aliasResolutionStatus', 'invalid');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (!inList(SR_PRODUCT_ADAPTER_PARENT_SCOPES, id.parentOrGenusScope)) {
    pushFinding(findings, 'invalid_input', 'error', 'identityState.parentOrGenusScope', 'invalid');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  const identityState = {
    canonicalKey: id.canonicalKey,
    acceptedScientificName: id.acceptedScientificName,
    identityRegistryVersion: String(id.identityRegistryVersion).trim(),
    currentNeedsReview: id.currentNeedsReview,
    currentIdentityConflict: id.currentIdentityConflict,
    currentIdentityBindingFingerprint: String(id.currentIdentityBindingFingerprint).trim(),
    aliasResolutionStatus: id.aliasResolutionStatus,
    parentOrGenusScope: id.parentOrGenusScope,
    canonicalIdentityConfirmed: id.canonicalIdentityConfirmed
  };

  const targetContext = normalizeContextExact(raw.targetContext, findings, 'targetContext');
  if (!targetContext) {
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }

  let reviewedClimateProfileSnapshot = null;
  const rev = asObject(raw.reviewedClimateProfileSnapshot);
  if (!rev) {
    pushFinding(findings, 'invalid_input', 'error', 'reviewedClimateProfileSnapshot', 'missing');
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  const revUnk = unknownKeys(rev, REVIEWED_PARENT_KEYS);
  if (revUnk.length) {
    pushFinding(findings, 'unknown_input_key', 'error', 'reviewedClimateProfileSnapshot', revUnk.join(','));
    return { ok: false, findings: sortFindings(findings), normalized: null };
  }
  if (rev.absent === true) {
    const only = Object.keys(rev);
    if (only.length !== 1 || only[0] !== 'absent') {
      pushFinding(findings, 'invalid_input', 'error', 'reviewedClimateProfileSnapshot', 'absent_sentinel_extra_keys');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    reviewedClimateProfileSnapshot = { absent: true };
  } else {
    if (rev.integrationContractVersion !== SR_CATALOG_REVIEWED_CLIMATE_PROFILE_INTEGRATION_CONTRACT_VERSION) {
      pushFinding(findings, 'unsupported_adapter_contract', 'error', 'reviewedClimateProfileSnapshot.integrationContractVersion', String(rev.integrationContractVersion));
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    if (!inList(SR_PRODUCT_ADAPTER_INTEGRATION_STATUSES, rev.integrationStatus)) {
      pushFinding(findings, 'invalid_input', 'error', 'reviewedClimateProfileSnapshot.integrationStatus', 'invalid');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    for (let a = 0; a < AUTHORITY_KEYS.length; a++) {
      if (rev[AUTHORITY_KEYS[a]] !== false) {
        const code =
          AUTHORITY_KEYS[a] === 'productAuthority'
            ? 'product_authority_attempt'
            : AUTHORITY_KEYS[a] === 'eligibilityAuthority'
              ? 'eligibility_authority_attempt'
              : AUTHORITY_KEYS[a] === 'scalarAuthority'
                ? 'scalar_authority_attempt'
                : AUTHORITY_KEYS[a] === 'GOSOutcomeAuthority'
                  ? 'GOS_authority_attempt'
                  : 'authority_flag_violation';
        pushFinding(findings, code, 'error', 'reviewedClimateProfileSnapshot.' + AUTHORITY_KEYS[a], String(rev[AUTHORITY_KEYS[a]]));
        return { ok: false, findings: sortFindings(findings), normalized: null };
      }
    }
    const bind = asObject(rev.identityBinding);
    if (!bind) {
      pushFinding(findings, 'invalid_input', 'error', 'reviewedClimateProfileSnapshot.identityBinding', 'missing');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    if (bind.canonicalKey !== raw.canonicalKey) {
      pushFinding(findings, 'canonical_identity_mismatch', 'error', 'reviewedClimateProfileSnapshot.identityBinding.canonicalKey', 'mismatch');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    if (bind.acceptedScientificName !== raw.acceptedScientificName) {
      pushFinding(findings, 'accepted_scientific_name_mismatch', 'error', 'reviewedClimateProfileSnapshot.identityBinding.acceptedScientificName', 'mismatch');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    if (!isNonEmptyString(bind.identityRegistryVersion) || !isNonEmptyString(bind.identityBindingFingerprint)) {
      pushFinding(findings, 'invalid_input', 'error', 'reviewedClimateProfileSnapshot.identityBinding', 'incomplete');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    if (typeof bind.needsReviewAtImport !== 'boolean' || typeof bind.identityConflictAtImport !== 'boolean') {
      pushFinding(findings, 'invalid_input', 'error', 'reviewedClimateProfileSnapshot.identityBinding', 'flags');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    const fs = asObject(rev.fieldSnapshot);
    if (!fs) {
      pushFinding(findings, 'invalid_input', 'error', 'reviewedClimateProfileSnapshot.fieldSnapshot', 'missing');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    const fsUnk = unknownKeys(fs, FIELD_SNAPSHOT_KEYS);
    if (fsUnk.length) {
      pushFinding(findings, 'unknown_input_key', 'error', 'reviewedClimateProfileSnapshot.fieldSnapshot', fsUnk.join(','));
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    for (let r = 0; r < FIELD_SNAPSHOT_REQUIRED.length; r++) {
      if (!Object.prototype.hasOwnProperty.call(fs, FIELD_SNAPSHOT_REQUIRED[r])) {
        pushFinding(findings, 'invalid_input', 'error', 'reviewedClimateProfileSnapshot.fieldSnapshot.' + FIELD_SNAPSHOT_REQUIRED[r], 'required');
        return { ok: false, findings: sortFindings(findings), normalized: null };
      }
    }
    if (fs.field !== raw.field) {
      pushFinding(findings, 'field_mismatch', 'error', 'reviewedClimateProfileSnapshot.fieldSnapshot.field', 'mismatch');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    if (fs.sourceProfileContractVersion !== SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION_FOR_ADAPTER) {
      pushFinding(findings, 'reviewed_profile_contract_unsupported', 'error', 'fieldSnapshot.sourceProfileContractVersion', String(fs.sourceProfileContractVersion));
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    if (!inList(SR_STRUCTURED_CLIMATE_PROFILE_STATUSES, fs.profileStatus)) {
      pushFinding(findings, 'invalid_input', 'error', 'fieldSnapshot.profileStatus', 'invalid');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    if (fs.profileStatus === 'reviewed_supported') {
      if (!inList(SR_STRUCTURED_CLIMATE_PROFILE_CLAIM_TYPES, fs.reviewedClaimType)) {
        pushFinding(findings, 'invalid_input', 'error', 'fieldSnapshot.reviewedClaimType', 'required_for_supported');
        return { ok: false, findings: sortFindings(findings), normalized: null };
      }
      const allow = valuesForField(raw.field);
      if (!inList(allow, fs.reviewedValue)) {
        pushFinding(findings, 'invalid_input', 'error', 'fieldSnapshot.reviewedValue', 'not_allowlisted');
        return { ok: false, findings: sortFindings(findings), normalized: null };
      }
    }
    const profileContext = normalizeContextExact(fs.contextScope, findings, 'fieldSnapshot.contextScope');
    if (!profileContext) {
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    if (!isNonEmptyString(fs.profileId) || !isNonEmptyString(fs.profileFingerprint) || !isNonEmptyString(fs.sourceBatchId) || !isNonEmptyString(fs.sourceBatchValidationFingerprint)) {
      pushFinding(findings, 'invalid_input', 'error', 'fieldSnapshot', 'fingerprint_or_ids');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    if (typeof fs.evidenceRefCount !== 'number' || !Number.isInteger(fs.evidenceRefCount) || fs.evidenceRefCount < 0) {
      pushFinding(findings, 'invalid_input', 'error', 'fieldSnapshot.evidenceRefCount', 'invalid');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    const limits = sortStringArray(fs.unresolvedLimitations);
    if (!limits) {
      pushFinding(findings, 'invalid_input', 'error', 'fieldSnapshot.unresolvedLimitations', 'invalid');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    const fr = asObject(fs.fieldReviewReference);
    if (!fr || !isNonEmptyString(fr.valueFingerprint)) {
      pushFinding(findings, 'invalid_input', 'error', 'fieldSnapshot.fieldReviewReference', 'invalid');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    const fieldSnapshot = {
      profileId: String(fs.profileId).trim(),
      sourceProfileContractVersion: fs.sourceProfileContractVersion,
      field: fs.field,
      profileStatus: fs.profileStatus,
      contextScope: profileContext,
      profileFingerprint: String(fs.profileFingerprint).trim(),
      fieldReviewReference: cloneJson(fr),
      evidenceRefCount: fs.evidenceRefCount,
      unresolvedLimitations: limits,
      sourceBatchId: String(fs.sourceBatchId).trim(),
      sourceBatchValidationFingerprint: String(fs.sourceBatchValidationFingerprint).trim()
    };
    if (fs.reviewedClaimType !== undefined) fieldSnapshot.reviewedClaimType = fs.reviewedClaimType;
    if (fs.reviewedValue !== undefined) fieldSnapshot.reviewedValue = fs.reviewedValue;
    if (fs.outcomeApplicability !== undefined) {
      const oa = sortStringArray(fs.outcomeApplicability);
      if (!oa) {
        pushFinding(findings, 'invalid_input', 'error', 'fieldSnapshot.outcomeApplicability', 'invalid');
        return { ok: false, findings: sortFindings(findings), normalized: null };
      }
      fieldSnapshot.outcomeApplicability = oa;
    }
    if (fs.supersedesProfileId !== undefined) {
      if (!isNonEmptyString(fs.supersedesProfileId)) {
        pushFinding(findings, 'invalid_input', 'error', 'fieldSnapshot.supersedesProfileId', 'invalid');
        return { ok: false, findings: sortFindings(findings), normalized: null };
      }
      fieldSnapshot.supersedesProfileId = String(fs.supersedesProfileId).trim();
    }
    if (fs.lastReviewed !== undefined) {
      if (!isNonEmptyString(fs.lastReviewed)) {
        pushFinding(findings, 'invalid_input', 'error', 'fieldSnapshot.lastReviewed', 'invalid');
        return { ok: false, findings: sortFindings(findings), normalized: null };
      }
      fieldSnapshot.lastReviewed = String(fs.lastReviewed).trim();
    }
    reviewedClimateProfileSnapshot = {
      integrationContractVersion: rev.integrationContractVersion,
      integrationStatus: rev.integrationStatus,
      productAuthority: false,
      eligibilityAuthority: false,
      scalarAuthority: false,
      runtimeRecommendationAuthority: false,
      GOSOutcomeAuthority: false,
      identityBinding: {
        canonicalKey: bind.canonicalKey,
        acceptedScientificName: bind.acceptedScientificName,
        identityRegistryVersion: String(bind.identityRegistryVersion).trim(),
        identityBindingFingerprint: String(bind.identityBindingFingerprint).trim(),
        needsReviewAtImport: bind.needsReviewAtImport,
        identityConflictAtImport: bind.identityConflictAtImport
      },
      fieldSnapshot: fieldSnapshot
    };
  }

  const normalized = {
    adapterContractVersion: raw.adapterContractVersion,
    canonicalKey: raw.canonicalKey,
    acceptedScientificName: raw.acceptedScientificName,
    field: raw.field,
    catalogClimateTraitsSnapshot: catalogClimateTraitsSnapshot,
    reviewedClimateProfileSnapshot: reviewedClimateProfileSnapshot,
    identityState: identityState,
    targetContext: targetContext,
    adapterOptions: adapterOptions
  };
  if (raw.targetRegion !== undefined) normalized.targetRegion = normalizeRegion(raw.targetRegion).value;
  if (raw.expectedProfileFingerprint !== undefined) {
    if (!isNonEmptyString(raw.expectedProfileFingerprint)) {
      pushFinding(findings, 'invalid_input', 'error', 'expectedProfileFingerprint', 'invalid');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    normalized.expectedProfileFingerprint = String(raw.expectedProfileFingerprint).trim();
  }
  if (raw.expectedSourceBatchValidationFingerprint !== undefined) {
    if (!isNonEmptyString(raw.expectedSourceBatchValidationFingerprint)) {
      pushFinding(findings, 'invalid_input', 'error', 'expectedSourceBatchValidationFingerprint', 'invalid');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    normalized.expectedSourceBatchValidationFingerprint = String(raw.expectedSourceBatchValidationFingerprint).trim();
  }
  if (raw.expectedCatalogSnapshotFingerprint !== undefined) {
    if (!isNonEmptyString(raw.expectedCatalogSnapshotFingerprint)) {
      pushFinding(findings, 'invalid_input', 'error', 'expectedCatalogSnapshotFingerprint', 'invalid');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    normalized.expectedCatalogSnapshotFingerprint = String(raw.expectedCatalogSnapshotFingerprint).trim();
  }
  if (raw.expectedIdentityBindingFingerprint !== undefined) {
    if (!isNonEmptyString(raw.expectedIdentityBindingFingerprint)) {
      pushFinding(findings, 'invalid_input', 'error', 'expectedIdentityBindingFingerprint', 'invalid');
      return { ok: false, findings: sortFindings(findings), normalized: null };
    }
    normalized.expectedIdentityBindingFingerprint = String(raw.expectedIdentityBindingFingerprint).trim();
  }

  return {
    ok: findings.filter(function (f) { return f.severity === 'error'; }).length === 0,
    findings: sortFindings(findings),
    normalized: freezeDeep(cloneJson(normalized))
  };
}

export function validateReviewedClimateProfileProductAdapterInput(input) {
  return normalizeReviewedClimateProfileProductAdapterInput(input);
}

export function analyzeReviewedClimateProfileProductCandidate(input) {
  const before = stableSerialize(input);
  const findings = [];
  const warnings = [];
  const explanationParts = [];
  const descriptor = getSmartRecDeveloperReviewedClimateProfileProductAdapterDescriptor();

  function failHard(status, extraFindings) {
    const all = sortFindings(findings.concat(extraFindings || []));
    const hard = all.filter(function (f) { return f.severity === 'error'; });
    const soft = all.filter(function (f) { return f.severity !== 'error'; });
    soft.push({
      code: 'product_authority_not_granted',
      severity: 'info',
      path: 'authorityBoundary',
      detail: 'always_false'
    });
    const sortedSoft = sortFindings(soft);
    const authorityBoundary = authorityBoundaryFalse();
    const identityGate = emptyGate('failed');
    const reviewedProfileGate = emptyGate('failed');
    const contextGate = emptyGate('failed');
    const regionGate = emptyGate('failed');
    const candidate = emptyCandidate();
    const inputFingerprint = 'adapterInput|invalid|' + stableSerialize({ status: status });
    const result = {
      descriptor: descriptor,
      adapterContractVersion: SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_CONTRACT_VERSION,
      resultContractVersion: SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_RESULT_CONTRACT_VERSION,
      status: status,
      canonicalKey: asObject(input) && input.canonicalKey ? input.canonicalKey : null,
      acceptedScientificName: asObject(input) && input.acceptedScientificName ? input.acceptedScientificName : null,
      field: asObject(input) && input.field ? input.field : null,
      identityGate: identityGate,
      reviewedProfileGate: reviewedProfileGate,
      contextGate: contextGate,
      regionGate: regionGate,
      legacySnapshot: null,
      reviewedSnapshotReference: null,
      comparison: 'not_comparable',
      findings: freezeDeep(hard),
      warnings: freezeDeep(sortedSoft),
      candidate: candidate,
      authorityBoundary: authorityBoundary,
      explanationParts: freezeDeep([]),
      inputFingerprint: inputFingerprint,
      summaryFingerprint: '',
      mutationCheck: freezeDeep({ mutated: false })
    };
    result.summaryFingerprint = buildSummaryFingerprint(result);
    const after = stableSerialize(input);
    if (before !== after) {
      hard.push({
        code: 'mutation_detected',
        severity: 'error',
        path: '',
        detail: 'input_mutated'
      });
      result.findings = freezeDeep(sortFindings(hard));
      result.mutationCheck = freezeDeep({ mutated: true });
      result.summaryFingerprint = buildSummaryFingerprint(result);
    }
    return freezeDeep(result);
  }

  const norm = normalizeReviewedClimateProfileProductAdapterInput(input);
  if (!norm.ok || !norm.normalized) {
    for (let i = 0; i < norm.findings.length; i++) findings.push(norm.findings[i]);
    const primary = hasCode(findings, 'unsupported_adapter_contract')
      ? 'product_authority_not_granted'
      : hasCode(findings, 'unknown_input_key')
        ? 'product_authority_not_granted'
        : 'product_authority_not_granted';
    return failHard(primary, []);
  }

  const n = norm.normalized;
  for (let i = 0; i < norm.findings.length; i++) {
    if (norm.findings[i].severity === 'error') findings.push(norm.findings[i]);
    else warnings.push(norm.findings[i]);
  }

  // Expected fingerprint / stale checks
  if (n.expectedCatalogSnapshotFingerprint !== undefined &&
      n.expectedCatalogSnapshotFingerprint !== n.catalogClimateTraitsSnapshot.climateTraitsFieldFingerprint) {
    pushFinding(findings, 'catalog_snapshot_fingerprint_mismatch', 'error', 'expectedCatalogSnapshotFingerprint', 'mismatch');
  }
  if (n.expectedIdentityBindingFingerprint !== undefined &&
      n.expectedIdentityBindingFingerprint !== n.identityState.currentIdentityBindingFingerprint) {
    pushFinding(findings, 'identity_binding_mismatch', 'error', 'expectedIdentityBindingFingerprint', 'mismatch');
  }

  let reviewedAbsent = !!(n.reviewedClimateProfileSnapshot && n.reviewedClimateProfileSnapshot.absent === true);
  let fieldSnapshot = null;
  if (!reviewedAbsent) {
    fieldSnapshot = n.reviewedClimateProfileSnapshot.fieldSnapshot;
    if (n.expectedProfileFingerprint !== undefined &&
        n.expectedProfileFingerprint !== fieldSnapshot.profileFingerprint) {
      pushFinding(findings, 'reviewed_profile_fingerprint_mismatch', 'error', 'expectedProfileFingerprint', 'mismatch');
    }
    if (n.expectedSourceBatchValidationFingerprint !== undefined &&
        n.expectedSourceBatchValidationFingerprint !== fieldSnapshot.sourceBatchValidationFingerprint) {
      pushFinding(findings, 'source_batch_unverified', 'error', 'expectedSourceBatchValidationFingerprint', 'mismatch');
    }
    if (n.reviewedClimateProfileSnapshot.identityBinding.identityBindingFingerprint !==
        n.identityState.currentIdentityBindingFingerprint) {
      // Current identity state overrides import-time; treat as binding mismatch for stale import snapshot.
      pushFinding(findings, 'identity_binding_mismatch', 'error', 'identityBinding', 'current_differs_from_import_binding');
    }
  }

  if (findings.some(function (f) { return f.severity === 'error'; })) {
    let stalePrimary = 'product_authority_not_granted';
    if (
      hasCode(findings, 'reviewed_profile_fingerprint_mismatch') ||
      hasCode(findings, 'source_batch_unverified') ||
      hasCode(findings, 'catalog_snapshot_fingerprint_mismatch') ||
      hasCode(findings, 'reviewed_profile_contract_unsupported')
    ) {
      stalePrimary = 'reviewed_profile_stale';
    } else if (
      hasCode(findings, 'canonical_identity_mismatch') ||
      hasCode(findings, 'accepted_scientific_name_mismatch') ||
      hasCode(findings, 'identity_binding_mismatch') ||
      hasCode(findings, 'field_mismatch')
    ) {
      stalePrimary = 'identity_blocked';
    }
    return failHard(stalePrimary, []);
  }

  // Identity gates
  let identityGate;
  if (!n.identityState.canonicalIdentityConfirmed) {
    pushFinding(findings, 'canonical_identity_unconfirmed', 'error', 'identityState', 'unconfirmed');
    identityGate = gate(false, 'identity_blocked', ['canonical_identity_unconfirmed']);
  } else if (n.identityState.currentIdentityConflict || n.identityState.aliasResolutionStatus === 'conflict') {
    pushFinding(findings, 'identity_conflict_active', 'error', 'identityState', 'conflict');
    identityGate = gate(false, 'identity_blocked', ['identity_conflict_active']);
  } else if (n.identityState.parentOrGenusScope !== 'species') {
    pushFinding(findings, 'genus_or_parent_scope_blocked', 'error', 'identityState.parentOrGenusScope', n.identityState.parentOrGenusScope);
    identityGate = gate(false, 'identity_blocked', ['genus_or_parent_scope_blocked']);
  } else if (n.identityState.aliasResolutionStatus === 'unresolved') {
    pushFinding(findings, 'canonical_identity_unconfirmed', 'error', 'identityState.aliasResolutionStatus', 'unresolved');
    identityGate = gate(false, 'identity_blocked', ['alias_unresolved']);
  } else {
    identityGate = gate(true, 'passed', []);
  }

  let needsReviewBlocked = false;
  if (n.identityState.currentNeedsReview) {
    pushFinding(findings, 'needs_review_active', 'error', 'identityState.currentNeedsReview', 'true');
    needsReviewBlocked = true;
  }

  // Reviewed profile gate
  let reviewedProfileGate;
  let primaryFromReviewed = null;
  if (reviewedAbsent) {
    pushFinding(findings, 'reviewed_profile_absent', 'error', 'reviewedClimateProfileSnapshot', 'absent');
    reviewedProfileGate = gate(false, 'reviewed_profile_absent', ['absent']);
    primaryFromReviewed = 'reviewed_profile_absent';
  } else if (n.reviewedClimateProfileSnapshot.integrationStatus === 'stale') {
    pushFinding(findings, 'reviewed_profile_stale', 'error', 'integrationStatus', 'stale');
    reviewedProfileGate = gate(false, 'reviewed_profile_stale', ['stale']);
    primaryFromReviewed = 'reviewed_profile_stale';
  } else if (n.reviewedClimateProfileSnapshot.integrationStatus === 'inert_blocked') {
    pushFinding(findings, 'reviewed_profile_blocked', 'error', 'integrationStatus', 'inert_blocked');
    reviewedProfileGate = gate(false, 'reviewed_profile_blocked', ['inert_blocked']);
    primaryFromReviewed = 'reviewed_profile_blocked';
  } else if (fieldSnapshot.profileStatus !== 'reviewed_supported') {
    pushFinding(findings, 'profile_status_blocked', 'error', 'fieldSnapshot.profileStatus', fieldSnapshot.profileStatus);
    reviewedProfileGate = gate(false, 'reviewed_non_supported', ['profile_status_blocked']);
    primaryFromReviewed = 'reviewed_non_supported';
  } else {
    reviewedProfileGate = gate(true, 'passed', []);
  }

  // Context gate
  let contextGate;
  if (reviewedAbsent || !fieldSnapshot) {
    contextGate = gate(false, 'context_unknown', ['reviewed_absent']);
  } else {
    const ctx = contextsCompatible(n.targetContext, fieldSnapshot.contextScope, findings);
    contextGate = gate(ctx.ok, ctx.status, ctx.ok ? [] : [ctx.status]);
  }

  // Region gate
  let regionGate;
  if (reviewedAbsent || !fieldSnapshot) {
    regionGate = gate(false, 'region_unknown', ['reviewed_absent']);
  } else {
    regionGate = evaluateRegionGate(n.targetRegion, fieldSnapshot.contextScope, findings);
  }

  // Comparison
  let comparison = 'not_comparable';
  let status = 'product_authority_not_granted';
  const legacyMissing = n.catalogClimateTraitsSnapshot.legacySource === 'missing';
  if (legacyMissing) {
    pushFinding(warnings, 'legacy_value_missing', 'warning', 'catalogClimateTraitsSnapshot', 'missing');
  }

  if (!identityGate.passed) {
    status = 'identity_blocked';
    comparison = 'not_comparable';
  } else if (needsReviewBlocked) {
    status = 'needs_review_blocked';
    comparison = 'not_comparable';
  } else if (primaryFromReviewed) {
    status = primaryFromReviewed;
    comparison = reviewedAbsent ? 'reviewed_missing' : 'not_comparable';
    if (reviewedAbsent) pushFinding(warnings, 'reviewed_value_missing', 'warning', 'reviewedClimateProfileSnapshot', 'absent');
  } else if (!contextGate.passed) {
    status = contextGate.status;
    comparison = 'not_comparable';
  } else if (!regionGate.passed) {
    status = regionGate.status;
    comparison = 'not_comparable';
  } else if (legacyMissing) {
    status = 'legacy_missing';
    comparison = 'legacy_missing';
  } else if (n.catalogClimateTraitsSnapshot.legacyObservedValue === fieldSnapshot.reviewedValue) {
    status = 'reviewed_supported_agreement';
    comparison = 'agreement';
    pushFinding(warnings, 'legacy_reviewed_agreement', 'info', 'comparison', 'equal');
  } else {
    status = 'reviewed_supported_conflict';
    comparison = 'conflict';
    pushFinding(warnings, 'legacy_reviewed_conflict', 'warning', 'comparison', 'differ');
  }

  // Candidate exposure
  let candidate = emptyCandidate();
  const canCandidate =
    !reviewedAbsent &&
    n.reviewedClimateProfileSnapshot.integrationStatus === 'inert_imported' &&
    fieldSnapshot &&
    fieldSnapshot.profileStatus === 'reviewed_supported' &&
    identityGate.passed &&
    !needsReviewBlocked &&
    contextGate.passed &&
    regionGate.passed &&
    fieldSnapshot.reviewedValue != null;

  if (canCandidate && (status === 'reviewed_supported_agreement' || status === 'reviewed_supported_conflict' || status === 'legacy_missing')) {
    candidate = freezeDeep({
      reviewedCandidateValue: fieldSnapshot.reviewedValue,
      reviewedClaimType: fieldSnapshot.reviewedClaimType || null,
      sourceProfileId: fieldSnapshot.profileId,
      candidateAvailable: true,
      productUseAllowed: false
    });
    pushFinding(warnings, 'candidate_value_available', 'info', 'candidate', 'non_authoritative');
  }

  pushFinding(warnings, 'product_authority_not_granted', 'info', 'authorityBoundary', 'always_false');

  if (n.adapterOptions.includeExplanationParts) {
    explanationParts.push({ category: 'legacy_source', code: n.catalogClimateTraitsSnapshot.legacySource });
    explanationParts.push({ category: 'reviewed_profile_status', code: reviewedAbsent ? 'absent' : fieldSnapshot.profileStatus });
    explanationParts.push({ category: 'agreement_status', code: comparison });
    explanationParts.push({ category: 'identity_gate', code: identityGate.status });
    explanationParts.push({ category: 'context_gate', code: contextGate.status });
    explanationParts.push({ category: 'region_gate', code: regionGate.status });
    explanationParts.push({ category: 'product_authority_not_granted', code: 'false' });
    explanationParts.sort(function (a, b) {
      const c = String(a.category).localeCompare(String(b.category));
      if (c) return c;
      return String(a.code).localeCompare(String(b.code));
    });
  }

  const hard = sortFindings(findings.filter(function (f) { return f.severity === 'error'; }));
  const soft = sortFindings(warnings.concat(findings.filter(function (f) { return f.severity !== 'error'; })));

  // If hard findings appeared during gate evaluation after normalize, remap status by priority.
  if (hard.length) {
    if (hasCode(hard, 'identity_conflict_active') || hasCode(hard, 'genus_or_parent_scope_blocked') || hasCode(hard, 'canonical_identity_unconfirmed')) {
      status = 'identity_blocked';
    } else if (hasCode(hard, 'needs_review_active')) {
      status = 'needs_review_blocked';
    } else if (hasCode(hard, 'reviewed_profile_stale')) {
      status = 'reviewed_profile_stale';
    } else if (hasCode(hard, 'reviewed_profile_blocked')) {
      status = 'reviewed_profile_blocked';
    } else if (hasCode(hard, 'reviewed_profile_absent')) {
      status = 'reviewed_profile_absent';
    } else if (hasCode(hard, 'profile_status_blocked')) {
      status = 'reviewed_non_supported';
    } else if (hasCode(hard, 'context_missing')) {
      status = 'context_unknown';
    } else if (hasCode(hard, 'context_incompatible')) {
      status = 'context_incompatible';
    } else if (hasCode(hard, 'region_unknown')) {
      status = 'region_unknown';
    } else if (hasCode(hard, 'region_incompatible')) {
      status = 'region_incompatible';
    }
    // Blocked paths never expose candidate.
    if (status !== 'reviewed_supported_agreement' && status !== 'reviewed_supported_conflict' && status !== 'legacy_missing') {
      candidate = emptyCandidate();
    }
  }

  const reviewedSnapshotReference = reviewedAbsent
    ? freezeDeep({ absent: true })
    : freezeDeep({
        profileId: fieldSnapshot.profileId,
        profileFingerprint: fieldSnapshot.profileFingerprint,
        sourceBatchValidationFingerprint: fieldSnapshot.sourceBatchValidationFingerprint,
        profileStatus: fieldSnapshot.profileStatus,
        reviewedClaimType: fieldSnapshot.reviewedClaimType || null,
        reviewedValue: fieldSnapshot.reviewedValue || null,
        integrationStatus: n.reviewedClimateProfileSnapshot.integrationStatus
      });

  const inputFingerprint = buildInputFingerprint(n);
  const authorityBoundary = authorityBoundaryFalse();
  const result = {
    descriptor: descriptor,
    adapterContractVersion: SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_CONTRACT_VERSION,
    resultContractVersion: SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_RESULT_CONTRACT_VERSION,
    status: status,
    canonicalKey: n.canonicalKey,
    acceptedScientificName: n.acceptedScientificName,
    field: n.field,
    identityGate: freezeDeep(identityGate),
    reviewedProfileGate: freezeDeep(reviewedProfileGate),
    contextGate: freezeDeep(contextGate),
    regionGate: freezeDeep(regionGate),
    legacySnapshot: freezeDeep(cloneJson(n.catalogClimateTraitsSnapshot)),
    reviewedSnapshotReference: reviewedSnapshotReference,
    comparison: comparison,
    findings: freezeDeep(hard),
    warnings: freezeDeep(soft),
    candidate: candidate,
    authorityBoundary: authorityBoundary,
    explanationParts: freezeDeep(explanationParts),
    inputFingerprint: inputFingerprint,
    summaryFingerprint: '',
    mutationCheck: freezeDeep({ mutated: false }),
    humanReviewRequired: status === 'reviewed_supported_conflict' || hard.length > 0
  };
  result.summaryFingerprint = buildSummaryFingerprint(result);

  const after = stableSerialize(input);
  if (before !== after) {
    const mutatedFindings = hard.concat([{
      code: 'mutation_detected',
      severity: 'error',
      path: '',
      detail: 'input_mutated'
    }]);
    result.findings = freezeDeep(sortFindings(mutatedFindings));
    result.mutationCheck = freezeDeep({ mutated: true });
    result.status = 'product_authority_not_granted';
    result.candidate = emptyCandidate();
    result.summaryFingerprint = buildSummaryFingerprint(result);
  }

  return freezeDeep(result);
}

export function buildReviewedClimateProfileProductAdapterInputFingerprint(input) {
  const norm = normalizeReviewedClimateProfileProductAdapterInput(input);
  if (!norm.ok || !norm.normalized) return null;
  return buildInputFingerprint(norm.normalized);
}
