/**
 * Cruvit — Smart Recommendations developer Overlay → Product Adapter Bridge
 * ---------------------------------------------------------------------------
 * Developer-only, explicit-call-only, in-memory bridge.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Validates real/synthetic overlays via public overlay APIs only.
 *  - Maps overlay records to Product Adapter Shape B and analyzes via public Adapter APIs.
 *  - Never grants product/eligibility/scalar/recommendation/GOS authority.
 *  - Never mutates overlay, caller snapshots, climateTraits, needsReview, or identity.
 *  - Never calls v1b, Smart Recommendations, GOS, weather, or trusted-location helpers.
 */

import {
  SR_REVIEWED_CLIMATE_PROFILE_CATALOG_OVERLAY_VERSION,
  SR_CATALOG_REVIEWED_CLIMATE_PROFILE_INTEGRATION_CONTRACT_VERSION,
  normalizeReviewedClimateProfileOverlay,
  validateReviewedClimateProfileOverlay,
  getSmartRecDeveloperReviewedClimateProfileCatalogOverlayDescriptor
} from './developer-reviewed-climate-profile-catalog-overlay.js';

import {
  SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_VERSION,
  SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_CONTRACT_VERSION,
  SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_RESULT_CONTRACT_VERSION,
  normalizeReviewedClimateProfileProductAdapterInput,
  validateReviewedClimateProfileProductAdapterInput,
  analyzeReviewedClimateProfileProductCandidate,
  buildReviewedClimateProfileProductAdapterInputFingerprint,
  getSmartRecDeveloperReviewedClimateProfileProductAdapterDescriptor
} from './developer-reviewed-climate-profile-product-adapter.js';

export const SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_VERSION =
  '0.1.0-sr-reviewed-climate-profile-overlay-product-adapter-bridge';

export const SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_CONTRACT_VERSION =
  '0.1.0-sr-reviewed-climate-profile-overlay-product-adapter-bridge-contract';

export const SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_RESULT_CONTRACT_VERSION =
  '0.1.0-sr-reviewed-climate-profile-overlay-product-adapter-bridge-result';

export const SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_CAPABILITY =
  'explicit_developer_real_overlay_product_adapter_bridge_analysis';

export const SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_STATUSES = Object.freeze([
  'bridge_not_run',
  'overlay_invalid',
  'overlay_provenance_blocked',
  'record_inventory_mismatch',
  'caller_snapshot_missing',
  'identity_state_blocked',
  'adapter_input_invalid',
  'adapter_analysis_blocked',
  'bridge_analysis_complete'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_FINDING_CODES = Object.freeze([
  'unsupported_bridge_contract',
  'invalid_bridge_input',
  'unknown_bridge_input_key',
  'unsupported_overlay_peer',
  'unsupported_adapter_peer',
  'overlay_validation_failed',
  'overlay_generated_from_mismatch',
  'overlay_record_inventory_mismatch',
  'overlay_record_field_mismatch',
  'missing_catalog_snapshot',
  'catalog_fingerprint_mismatch',
  'missing_identity_state',
  'identity_fingerprint_mismatch',
  'missing_target_context',
  'context_mismatch',
  'target_region_invented',
  'adapter_input_validation_failed',
  'adapter_analysis_failed',
  'adapter_authority_violation',
  'product_use_allowed_violation',
  'runtime_consumption_allowed_violation',
  'overlay_mutation_detected',
  'caller_input_mutation_detected',
  'adapter_result_mutation_detected',
  'nondeterministic_bridge_output',
  'current_needs_review_active',
  'current_identity_conflict_active',
  'current_identity_unconfirmed',
  'non_species_identity_scope',
  'bridge_record_analyzed',
  'bridge_agreement_confirmed',
  'bridge_candidate_non_authoritative',
  'product_authority_not_granted'
]);

const TOP_LEVEL_KEYS = Object.freeze([
  'bridgeContractVersion',
  'overlay',
  'expectedGeneratedFrom',
  'expectedRecordKeys',
  'catalogSnapshotsByRecord',
  'identityStatesByRecord',
  'targetContextsByRecord',
  'targetRegionsByRecord',
  'adapterOptionsByRecord',
  'expectedBridgeInputFingerprint'
]);

const REQUIRED_TOP_LEVEL = Object.freeze([
  'bridgeContractVersion',
  'overlay',
  'expectedGeneratedFrom',
  'expectedRecordKeys',
  'catalogSnapshotsByRecord',
  'identityStatesByRecord',
  'targetContextsByRecord',
  'targetRegionsByRecord',
  'adapterOptionsByRecord'
]);

const FORBIDDEN_VALUE_KEYS = Object.freeze([
  'effectiveValue',
  'resolvedValue',
  'finalValue',
  'recommendedValue',
  'eligibilityValue',
  'matchValue',
  'suitabilityScore',
  'appState',
  'DOM',
  'weather',
  'coordinates',
  'location',
  'storage'
]);

const EXPECTED_RECORD_KEYS = Object.freeze(['lavender', 'rosemary']);

const EXPECTED_FIELDS = Object.freeze({
  lavender: 'sun',
  rosemary: 'water'
});

const EXPECTED_CATALOG = Object.freeze({
  lavender: Object.freeze({
    field: 'sun',
    legacyObservedValue: 'full_sun',
    legacySource: 'group_default',
    legacyNeedsReview: false,
    warningFlags: Object.freeze([]),
    hardBlockRules: Object.freeze(['humid-heat-stress']),
    climateTraitsFieldFingerprint:
      'group_default|lavender|sun|full_sun|false||humid-heat-stress'
  }),
  rosemary: Object.freeze({
    field: 'water',
    legacyObservedValue: 'low',
    legacySource: 'group_default',
    legacyNeedsReview: false,
    warningFlags: Object.freeze([]),
    hardBlockRules: Object.freeze(['humid-heat-stress']),
    climateTraitsFieldFingerprint:
      'group_default|rosemary|water|low|false||humid-heat-stress'
  })
});

const EXPECTED_IDENTITY = Object.freeze({
  lavender: Object.freeze({
    canonicalKey: 'lavender',
    acceptedScientificName: 'Lavandula angustifolia',
    identityRegistryVersion: '1.5.0',
    currentNeedsReview: false,
    currentIdentityConflict: false,
    currentIdentityBindingFingerprint: 'lavender|Lavandula angustifolia|1.5.0|false|false',
    aliasResolutionStatus: 'canonical',
    parentOrGenusScope: 'species',
    canonicalIdentityConfirmed: true
  }),
  rosemary: Object.freeze({
    canonicalKey: 'rosemary',
    acceptedScientificName: 'Salvia rosmarinus',
    identityRegistryVersion: '1.5.0',
    currentNeedsReview: false,
    currentIdentityConflict: false,
    currentIdentityBindingFingerprint: 'rosemary|Salvia rosmarinus|1.5.0|false|false',
    aliasResolutionStatus: 'canonical',
    parentOrGenusScope: 'species',
    canonicalIdentityConfirmed: true
  })
});

const EXPECTED_CONTEXT = Object.freeze({
  setting: 'outdoor',
  planting: 'ground',
  maturity: 'mature',
  objective: 'general'
});

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

const AUTHORITY_KEYS = Object.freeze([
  'productAuthority',
  'eligibilityAuthority',
  'scalarAuthority',
  'runtimeRecommendationAuthority',
  'GOSOutcomeAuthority'
]);

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

function stableSerialize(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) {
    return '[' + v.map(stableSerialize).join(',') + ']';
  }
  const keys = Object.keys(v).sort();
  return (
    '{' +
    keys
      .map(function (k) {
        return JSON.stringify(k) + ':' + stableSerialize(v[k]);
      })
      .join(',') +
    '}'
  );
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

function pushFinding(findings, code, severity, path, detail) {
  findings.push({
    code: code,
    severity: severity,
    path: path || '',
    detail: detail == null ? '' : String(detail)
  });
}

function sortFindings(findings) {
  return (findings || [])
    .slice()
    .sort(function (a, b) {
      const c = String(a.code).localeCompare(String(b.code));
      if (c) return c;
      const p = String(a.path || '').localeCompare(String(b.path || ''));
      if (p) return p;
      return String(a.detail || '').localeCompare(String(b.detail || ''));
    });
}

function hasCode(findings, code) {
  return (findings || []).some(function (f) {
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

function supportedPeers() {
  return freezeDeep({
    overlay: SR_REVIEWED_CLIMATE_PROFILE_CATALOG_OVERLAY_VERSION,
    integration: SR_CATALOG_REVIEWED_CLIMATE_PROFILE_INTEGRATION_CONTRACT_VERSION,
    productAdapter: SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_VERSION,
    adapterContract: SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_CONTRACT_VERSION,
    adapterResult: SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_RESULT_CONTRACT_VERSION,
    structuredClimateProfile: '0.1.0-sr-structured-climate-profile-contract',
    identityRegistry: '1.5.0',
    catalogSchema: 1
  });
}

export function getSmartRecDeveloperReviewedClimateProfileOverlayProductAdapterBridgeDescriptor() {
  return freezeDeep({
    module: 'developer-reviewed-climate-profile-overlay-product-adapter-bridge',
    version: SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_VERSION,
    bridgeContractVersion: SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_CONTRACT_VERSION,
    bridgeResultContractVersion:
      SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_RESULT_CONTRACT_VERSION,
    capability: SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_CAPABILITY,
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
    overlayMutation: false,
    adapterMutation: false,
    registryMutation: false,
    supportedPeers: supportedPeers(),
    statusCount: SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_STATUSES.length,
    findingCodeCount: SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_FINDING_CODES.length
  });
}

function arraysEqualSorted(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const as = a.map(String).slice().sort();
  const bs = b.map(String).slice().sort();
  for (let i = 0; i < as.length; i++) {
    if (as[i] !== bs[i]) return false;
  }
  return true;
}

function normalizeStringArray(arr) {
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
  out.sort();
  return out;
}

function contextExactMatch(ctx) {
  if (!asObject(ctx)) return false;
  return (
    ctx.setting === EXPECTED_CONTEXT.setting &&
    ctx.planting === EXPECTED_CONTEXT.planting &&
    ctx.maturity === EXPECTED_CONTEXT.maturity &&
    ctx.objective === EXPECTED_CONTEXT.objective &&
    Object.keys(ctx).every(function (k) {
      return (
        k === 'setting' ||
        k === 'planting' ||
        k === 'maturity' ||
        k === 'objective' ||
        k === 'daypart' ||
        k === 'heatProtection' ||
        k === 'climateOrRegion' ||
        k === 'season' ||
        k === 'outcomeApplicability'
      );
    }) &&
    ctx.daypart === undefined &&
    ctx.heatProtection === undefined &&
    ctx.climateOrRegion === undefined &&
    ctx.season === undefined &&
    ctx.outcomeApplicability === undefined
  );
}

function catalogMatchesExpected(recordKey, snap) {
  const exp = EXPECTED_CATALOG[recordKey];
  if (!exp || !asObject(snap)) return false;
  if (snap.descriptiveNotes !== undefined) return false;
  if (snap.field !== exp.field) return false;
  if (snap.legacyObservedValue !== exp.legacyObservedValue) return false;
  if (snap.legacySource !== exp.legacySource) return false;
  if (snap.legacyNeedsReview !== exp.legacyNeedsReview) return false;
  if (snap.climateTraitsFieldFingerprint !== exp.climateTraitsFieldFingerprint) return false;
  if (!arraysEqualSorted(snap.warningFlags, exp.warningFlags)) return false;
  if (!arraysEqualSorted(snap.hardBlockRules, exp.hardBlockRules)) return false;
  const allowed = [
    'field',
    'legacyObservedValue',
    'legacySource',
    'legacyNeedsReview',
    'warningFlags',
    'hardBlockRules',
    'climateTraitsFieldFingerprint'
  ];
  return unknownKeys(snap, allowed).length === 0;
}

function identityMatchesExpected(recordKey, id) {
  const exp = EXPECTED_IDENTITY[recordKey];
  if (!exp || !asObject(id)) return false;
  const keys = Object.keys(exp);
  for (let i = 0; i < keys.length; i++) {
    if (id[keys[i]] !== exp[keys[i]]) return false;
  }
  return unknownKeys(id, keys).length === 0;
}

export function normalizeReviewedClimateProfileOverlayProductAdapterBridgeInput(input) {
  const findings = [];
  const raw = asObject(input);
  if (!raw) {
    pushFinding(findings, 'invalid_bridge_input', 'error', '', 'input_not_object');
    return freezeDeep({ ok: false, findings: sortFindings(findings), normalized: null, unknownKeys: [] });
  }
  if (hasAnyKey(raw, FORBIDDEN_VALUE_KEYS)) {
    pushFinding(findings, 'invalid_bridge_input', 'error', '', 'forbidden_value_key');
    return freezeDeep({ ok: false, findings: sortFindings(findings), normalized: null, unknownKeys: [] });
  }
  const unk = unknownKeys(raw, TOP_LEVEL_KEYS);
  if (unk.length) {
    pushFinding(findings, 'unknown_bridge_input_key', 'error', '', unk.slice().sort().join(','));
  }
  for (let r = 0; r < REQUIRED_TOP_LEVEL.length; r++) {
    if (!Object.prototype.hasOwnProperty.call(raw, REQUIRED_TOP_LEVEL[r])) {
      pushFinding(findings, 'invalid_bridge_input', 'error', REQUIRED_TOP_LEVEL[r], 'required');
    }
  }
  if (
    raw.bridgeContractVersion !==
    SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_CONTRACT_VERSION
  ) {
    pushFinding(
      findings,
      'unsupported_bridge_contract',
      'error',
      'bridgeContractVersion',
      String(raw.bridgeContractVersion)
    );
  }

  const recordKeys = normalizeStringArray(raw.expectedRecordKeys);
  if (!recordKeys) {
    pushFinding(findings, 'invalid_bridge_input', 'error', 'expectedRecordKeys', 'invalid');
  }

  const normalized = {
    bridgeContractVersion: raw.bridgeContractVersion,
    overlay: raw.overlay,
    expectedGeneratedFrom: raw.expectedGeneratedFrom,
    expectedRecordKeys: recordKeys,
    catalogSnapshotsByRecord: asObject(raw.catalogSnapshotsByRecord)
      ? cloneJson(raw.catalogSnapshotsByRecord)
      : raw.catalogSnapshotsByRecord,
    identityStatesByRecord: asObject(raw.identityStatesByRecord)
      ? cloneJson(raw.identityStatesByRecord)
      : raw.identityStatesByRecord,
    targetContextsByRecord: asObject(raw.targetContextsByRecord)
      ? cloneJson(raw.targetContextsByRecord)
      : raw.targetContextsByRecord,
    targetRegionsByRecord: asObject(raw.targetRegionsByRecord)
      ? cloneJson(raw.targetRegionsByRecord)
      : raw.targetRegionsByRecord,
    adapterOptionsByRecord: asObject(raw.adapterOptionsByRecord)
      ? cloneJson(raw.adapterOptionsByRecord)
      : raw.adapterOptionsByRecord
  };
  if (raw.expectedBridgeInputFingerprint !== undefined) {
    normalized.expectedBridgeInputFingerprint = raw.expectedBridgeInputFingerprint;
  }
  // Preserve unknown keys for fail-closed reporting (do not strip before report).
  for (let u = 0; u < unk.length; u++) {
    normalized[unk[u]] = raw[unk[u]];
  }

  const hard = findings.filter(function (f) {
    return f.severity === 'error';
  });
  return freezeDeep({
    ok: hard.length === 0,
    findings: sortFindings(findings),
    normalized: cloneJson(normalized),
    unknownKeys: unk.slice().sort()
  });
}

export function validateReviewedClimateProfileOverlayProductAdapterBridgeInput(input) {
  return normalizeReviewedClimateProfileOverlayProductAdapterBridgeInput(input);
}

function buildReviewedClimateProfileSnapshotFromOverlayRecord(recordKey, record, field, findings) {
  const integration = asObject(record && record.reviewedClimateProfile);
  if (!integration) {
    pushFinding(findings, 'overlay_record_field_mismatch', 'error', 'records.' + recordKey, 'missing_integration');
    return null;
  }
  for (let a = 0; a < AUTHORITY_KEYS.length; a++) {
    if (integration[AUTHORITY_KEYS[a]] !== false) {
      pushFinding(
        findings,
        'overlay_validation_failed',
        'error',
        'records.' + recordKey + '.' + AUTHORITY_KEYS[a],
        String(integration[AUTHORITY_KEYS[a]])
      );
      return null;
    }
  }
  const fields = asObject(integration.fields);
  if (!fields || !asObject(fields[field])) {
    pushFinding(findings, 'overlay_record_field_mismatch', 'error', 'records.' + recordKey + '.fields', 'missing_field');
    return null;
  }
  const fieldKeys = Object.keys(fields);
  if (fieldKeys.length !== 1 || fieldKeys[0] !== field) {
    pushFinding(
      findings,
      'overlay_record_field_mismatch',
      'error',
      'records.' + recordKey + '.fields',
      fieldKeys.slice().sort().join(',')
    );
    return null;
  }
  const src = fields[field];
  const unk = unknownKeys(src, FIELD_SNAPSHOT_KEYS.concat(['integrationStatus']));
  if (unk.length) {
    pushFinding(
      findings,
      'overlay_record_field_mismatch',
      'error',
      'records.' + recordKey + '.fields.' + field,
      'unknown:' + unk.join(',')
    );
    return null;
  }
  for (let r = 0; r < FIELD_SNAPSHOT_REQUIRED.length; r++) {
    if (!Object.prototype.hasOwnProperty.call(src, FIELD_SNAPSHOT_REQUIRED[r])) {
      pushFinding(
        findings,
        'overlay_record_field_mismatch',
        'error',
        'records.' + recordKey + '.fields.' + field + '.' + FIELD_SNAPSHOT_REQUIRED[r],
        'required'
      );
      return null;
    }
  }
  if (src.field !== field) {
    pushFinding(findings, 'overlay_record_field_mismatch', 'error', 'records.' + recordKey + '.fields.' + field + '.field', 'mismatch');
    return null;
  }
  const fieldSnapshot = {
    profileId: src.profileId,
    sourceProfileContractVersion: src.sourceProfileContractVersion,
    field: src.field,
    profileStatus: src.profileStatus,
    contextScope: cloneJson(src.contextScope),
    profileFingerprint: src.profileFingerprint,
    fieldReviewReference: cloneJson(src.fieldReviewReference),
    evidenceRefCount: src.evidenceRefCount,
    unresolvedLimitations: cloneJson(src.unresolvedLimitations),
    sourceBatchId: src.sourceBatchId,
    sourceBatchValidationFingerprint: src.sourceBatchValidationFingerprint
  };
  if (src.reviewedClaimType !== undefined) fieldSnapshot.reviewedClaimType = src.reviewedClaimType;
  if (src.reviewedValue !== undefined) fieldSnapshot.reviewedValue = src.reviewedValue;
  if (src.outcomeApplicability !== undefined) fieldSnapshot.outcomeApplicability = cloneJson(src.outcomeApplicability);
  if (src.supersedesProfileId !== undefined) fieldSnapshot.supersedesProfileId = src.supersedesProfileId;
  if (src.lastReviewed !== undefined) fieldSnapshot.lastReviewed = src.lastReviewed;
  // Strip field-level integrationStatus (Shape B prohibition).

  const bind = asObject(integration.identityBinding);
  if (!bind) {
    pushFinding(findings, 'overlay_record_field_mismatch', 'error', 'records.' + recordKey + '.identityBinding', 'missing');
    return null;
  }

  return freezeDeep({
    integrationContractVersion: integration.integrationContractVersion,
    integrationStatus: integration.integrationStatus,
    productAuthority: false,
    eligibilityAuthority: false,
    scalarAuthority: false,
    runtimeRecommendationAuthority: false,
    GOSOutcomeAuthority: false,
    identityBinding: cloneJson(bind),
    fieldSnapshot: fieldSnapshot
  });
}

function buildInputFingerprintParts(parts) {
  return (
    'bridgeInput|' +
    stableSerialize({
      bridgeContractVersion: parts.bridgeContractVersion,
      bridgeVersion: SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_VERSION,
      supportedPeers: supportedPeers(),
      overlayReportFingerprint: parts.overlayReportFingerprint,
      generatedFrom: parts.generatedFrom,
      recordKeys: parts.recordKeys,
      compactProfileFingerprints: parts.compactProfileFingerprints,
      sourceBatchFingerprints: parts.sourceBatchFingerprints,
      catalogFingerprints: parts.catalogFingerprints,
      identityFingerprints: parts.identityFingerprints,
      contexts: parts.contexts,
      targetRegions: parts.targetRegions,
      adapterOptions: parts.adapterOptions
    })
  );
}

function buildSummaryFingerprint(parts) {
  return (
    'bridgeResult|' +
    stableSerialize({
      inputFingerprint: parts.inputFingerprint,
      bridgeResultContractVersion:
        SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_RESULT_CONTRACT_VERSION,
      status: parts.status,
      generatedFrom: parts.generatedFrom,
      recordKeys: parts.recordKeys,
      overlayValidationReference: parts.overlayValidationReference,
      recordResults: parts.recordResultsCompact,
      findings: parts.findings,
      warnings: parts.warnings,
      authorityBoundary: parts.authorityBoundary,
      mutationCheck: parts.mutationCheck
    })
  );
}

function emptyOverlayRef() {
  return {
    ok: false,
    hardErrorCount: 0,
    warningCount: 0,
    reportFingerprint: '',
    overlayContractVersion: SR_REVIEWED_CLIMATE_PROFILE_CATALOG_OVERLAY_VERSION,
    generatedFrom: null
  };
}

function failResult(status, findings, warnings, extras) {
  extras = extras || {};
  const descriptor = getSmartRecDeveloperReviewedClimateProfileOverlayProductAdapterBridgeDescriptor();
  const authorityBoundary = authorityBoundaryFalse();
  const hard = sortFindings(
    (findings || []).filter(function (f) {
      return f.severity === 'error';
    })
  );
  const soft = sortFindings(
    (warnings || [])
      .concat(
        (findings || []).filter(function (f) {
          return f.severity !== 'error';
        })
      )
      .concat([
        {
          code: 'product_authority_not_granted',
          severity: 'info',
          path: 'authorityBoundary',
          detail: 'always_false'
        }
      ])
  );
  const overlayValidationReference = extras.overlayValidationReference || emptyOverlayRef();
  const recordResults = extras.recordResults || [];
  const inputFingerprint =
    extras.inputFingerprint ||
    'bridgeInput|invalid|' + stableSerialize({ status: status, findings: hard });
  const mutationCheck = extras.mutationCheck || { mutated: false };
  const result = {
    descriptor: descriptor,
    bridgeContractVersion: SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_CONTRACT_VERSION,
    bridgeResultContractVersion:
      SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_RESULT_CONTRACT_VERSION,
    status: status,
    generatedFrom: extras.generatedFrom != null ? extras.generatedFrom : null,
    recordKeys: extras.recordKeys || [],
    overlayValidationReference: freezeDeep(overlayValidationReference),
    recordResults: freezeDeep(recordResults),
    findings: freezeDeep(hard),
    warnings: freezeDeep(soft),
    authorityBoundary: authorityBoundary,
    inputFingerprint: inputFingerprint,
    summaryFingerprint: '',
    mutationCheck: freezeDeep(mutationCheck)
  };
  result.summaryFingerprint = buildSummaryFingerprint({
    inputFingerprint: result.inputFingerprint,
    status: result.status,
    generatedFrom: result.generatedFrom,
    recordKeys: result.recordKeys,
    overlayValidationReference: result.overlayValidationReference,
    recordResultsCompact: recordResults.map(function (rr) {
      return {
        recordKey: rr.recordKey,
        adapterStatus: rr.adapterStatus,
        comparison: rr.comparison,
        candidateAvailable: rr.candidateAvailable,
        reviewedCandidateValue: rr.reviewedCandidateValue,
        adapterInputFingerprint: rr.adapterInputFingerprint,
        adapterResultFingerprint: rr.adapterResultFingerprint
      };
    }),
    findings: result.findings,
    warnings: result.warnings,
    authorityBoundary: result.authorityBoundary,
    mutationCheck: result.mutationCheck
  });
  return freezeDeep(result);
}

export function buildReviewedClimateProfileOverlayProductAdapterBridgeInputFingerprint(input) {
  const norm = normalizeReviewedClimateProfileOverlayProductAdapterBridgeInput(input);
  if (!norm.ok || !norm.normalized) return null;
  const overlayVal = validateReviewedClimateProfileOverlay(norm.normalized.overlay, {
    runtimeImport: false
  });
  if (!overlayVal.ok || !overlayVal.normalized) return null;
  const keys = EXPECTED_RECORD_KEYS.slice();
  const compact = {};
  const batches = {};
  const catalogs = {};
  const identities = {};
  const contexts = {};
  const regions = {};
  const options = {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const rec = overlayVal.normalized.records[k];
    const field = EXPECTED_FIELDS[k];
    const fs = rec && rec.reviewedClimateProfile && rec.reviewedClimateProfile.fields[field];
    compact[k] = fs ? fs.profileFingerprint : null;
    batches[k] = fs ? fs.sourceBatchValidationFingerprint : null;
    catalogs[k] =
      (norm.normalized.catalogSnapshotsByRecord &&
        norm.normalized.catalogSnapshotsByRecord[k] &&
        norm.normalized.catalogSnapshotsByRecord[k].climateTraitsFieldFingerprint) ||
      null;
    identities[k] =
      (norm.normalized.identityStatesByRecord &&
        norm.normalized.identityStatesByRecord[k] &&
        norm.normalized.identityStatesByRecord[k].currentIdentityBindingFingerprint) ||
      null;
    contexts[k] = (norm.normalized.targetContextsByRecord && norm.normalized.targetContextsByRecord[k]) || null;
    regions[k] =
      norm.normalized.targetRegionsByRecord &&
      Object.prototype.hasOwnProperty.call(norm.normalized.targetRegionsByRecord, k)
        ? norm.normalized.targetRegionsByRecord[k]
        : undefined;
    options[k] =
      (norm.normalized.adapterOptionsByRecord && norm.normalized.adapterOptionsByRecord[k]) || null;
  }
  return buildInputFingerprintParts({
    bridgeContractVersion: norm.normalized.bridgeContractVersion,
    overlayReportFingerprint: overlayVal.reportFingerprint,
    generatedFrom: overlayVal.normalized.generatedFrom,
    recordKeys: keys,
    compactProfileFingerprints: compact,
    sourceBatchFingerprints: batches,
    catalogFingerprints: catalogs,
    identityFingerprints: identities,
    contexts: contexts,
    targetRegions: regions,
    adapterOptions: options
  });
}

export function analyzeReviewedClimateProfileOverlayWithProductAdapter(input) {
  const callerBefore = stableSerialize(input);
  const overlayBefore = asObject(input) && input.overlay != null ? stableSerialize(input.overlay) : null;
  const findings = [];
  const warnings = [];

  const norm = normalizeReviewedClimateProfileOverlayProductAdapterBridgeInput(input);
  for (let i = 0; i < norm.findings.length; i++) findings.push(norm.findings[i]);
  if (!norm.ok || !norm.normalized) {
    return failResult('adapter_input_invalid', findings, warnings, {});
  }
  const n = norm.normalized;

  // Peer versions
  const overlayDesc = getSmartRecDeveloperReviewedClimateProfileCatalogOverlayDescriptor();
  const adapterDesc = getSmartRecDeveloperReviewedClimateProfileProductAdapterDescriptor();
  if (overlayDesc.version !== SR_REVIEWED_CLIMATE_PROFILE_CATALOG_OVERLAY_VERSION) {
    pushFinding(findings, 'unsupported_overlay_peer', 'error', 'overlay.version', String(overlayDesc.version));
  }
  if (adapterDesc.version !== SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_VERSION) {
    pushFinding(findings, 'unsupported_adapter_peer', 'error', 'adapter.version', String(adapterDesc.version));
  }
  if (adapterDesc.adapterContractVersion !== SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_CONTRACT_VERSION) {
    pushFinding(
      findings,
      'unsupported_adapter_peer',
      'error',
      'adapter.adapterContractVersion',
      String(adapterDesc.adapterContractVersion)
    );
  }
  if (hasCode(findings, 'unsupported_overlay_peer') || hasCode(findings, 'unsupported_adapter_peer')) {
    return failResult('adapter_input_invalid', findings, warnings, {
      generatedFrom: n.expectedGeneratedFrom
    });
  }

  // Overlay normalize + validate (no plants; no runtime import)
  normalizeReviewedClimateProfileOverlay(n.overlay);
  const overlayVal = validateReviewedClimateProfileOverlay(n.overlay, { runtimeImport: false });
  const overlayValidationReference = {
    ok: !!overlayVal.ok,
    hardErrorCount: (overlayVal.hardErrors || []).length,
    warningCount: (overlayVal.warnings || []).length,
    reportFingerprint: overlayVal.reportFingerprint || '',
    overlayContractVersion: SR_REVIEWED_CLIMATE_PROFILE_CATALOG_OVERLAY_VERSION,
    generatedFrom: overlayVal.normalized ? overlayVal.normalized.generatedFrom : null
  };

  if (!overlayVal.ok || (overlayVal.hardErrors && overlayVal.hardErrors.length)) {
    pushFinding(findings, 'overlay_validation_failed', 'error', 'overlay', (overlayVal.hardErrors || []).join(','));
    return failResult('overlay_invalid', findings, warnings, {
      overlayValidationReference: overlayValidationReference,
      generatedFrom: overlayValidationReference.generatedFrom
    });
  }
  if ((overlayVal.warnings || []).length) {
    pushFinding(findings, 'overlay_validation_failed', 'error', 'overlay.warnings', overlayVal.warnings.join(','));
    return failResult('overlay_invalid', findings, warnings, {
      overlayValidationReference: overlayValidationReference,
      generatedFrom: overlayValidationReference.generatedFrom
    });
  }

  const generatedFrom = overlayVal.normalized.generatedFrom;
  if (generatedFrom !== n.expectedGeneratedFrom || generatedFrom !== 'real_reviewed_batch_pilot') {
    pushFinding(
      findings,
      'overlay_generated_from_mismatch',
      'error',
      'generatedFrom',
      String(generatedFrom) + '!=' + String(n.expectedGeneratedFrom)
    );
    return failResult('overlay_provenance_blocked', findings, warnings, {
      overlayValidationReference: overlayValidationReference,
      generatedFrom: generatedFrom
    });
  }

  // Record inventory
  const overlayKeys = Object.keys(overlayVal.normalized.records).sort();
  if (
    !n.expectedRecordKeys ||
    n.expectedRecordKeys.join(',') !== EXPECTED_RECORD_KEYS.join(',') ||
    overlayKeys.join(',') !== EXPECTED_RECORD_KEYS.join(',')
  ) {
    pushFinding(
      findings,
      'overlay_record_inventory_mismatch',
      'error',
      'records',
      overlayKeys.join(',') + '|' + (n.expectedRecordKeys || []).join(',')
    );
    return failResult('record_inventory_mismatch', findings, warnings, {
      overlayValidationReference: overlayValidationReference,
      generatedFrom: generatedFrom,
      recordKeys: overlayKeys
    });
  }

  // Maps must contain exact keys
  const mapNames = [
    'catalogSnapshotsByRecord',
    'identityStatesByRecord',
    'targetContextsByRecord',
    'targetRegionsByRecord',
    'adapterOptionsByRecord'
  ];
  for (let m = 0; m < mapNames.length; m++) {
    const map = asObject(n[mapNames[m]]);
    if (!map) {
      pushFinding(findings, 'caller_snapshot_missing', 'error', mapNames[m], 'missing_map');
      continue;
    }
    const mk = Object.keys(map).sort();
    if (mk.join(',') !== EXPECTED_RECORD_KEYS.join(',')) {
      pushFinding(findings, 'overlay_record_inventory_mismatch', 'error', mapNames[m], mk.join(','));
    }
  }
  if (hasCode(findings, 'overlay_record_inventory_mismatch')) {
    return failResult('record_inventory_mismatch', findings, warnings, {
      overlayValidationReference: overlayValidationReference,
      generatedFrom: generatedFrom,
      recordKeys: EXPECTED_RECORD_KEYS.slice()
    });
  }
  if (hasCode(findings, 'caller_snapshot_missing') && !asObject(n.catalogSnapshotsByRecord)) {
    return failResult('caller_snapshot_missing', findings, warnings, {
      overlayValidationReference: overlayValidationReference,
      generatedFrom: generatedFrom,
      recordKeys: EXPECTED_RECORD_KEYS.slice()
    });
  }

  // Provenance / blocked / stale / authority on records
  for (let i = 0; i < EXPECTED_RECORD_KEYS.length; i++) {
    const rk = EXPECTED_RECORD_KEYS[i];
    const rec = overlayVal.normalized.records[rk];
    const integ = rec.reviewedClimateProfile;
    if (integ.integrationStatus === 'inert_blocked' || integ.integrationStatus === 'stale') {
      pushFinding(
        findings,
        'overlay_validation_failed',
        'error',
        'records.' + rk + '.integrationStatus',
        integ.integrationStatus
      );
    }
    for (let a = 0; a < AUTHORITY_KEYS.length; a++) {
      if (integ[AUTHORITY_KEYS[a]] !== false) {
        pushFinding(
          findings,
          'overlay_validation_failed',
          'error',
          'records.' + rk + '.' + AUTHORITY_KEYS[a],
          'true'
        );
      }
    }
  }
  if (hasCode(findings, 'overlay_validation_failed')) {
    return failResult('overlay_provenance_blocked', findings, warnings, {
      overlayValidationReference: overlayValidationReference,
      generatedFrom: generatedFrom,
      recordKeys: EXPECTED_RECORD_KEYS.slice()
    });
  }

  // Catalog / identity / context / region / options
  for (let i = 0; i < EXPECTED_RECORD_KEYS.length; i++) {
    const rk = EXPECTED_RECORD_KEYS[i];
    const cat = n.catalogSnapshotsByRecord[rk];
    if (!asObject(cat)) {
      pushFinding(findings, 'missing_catalog_snapshot', 'error', 'catalogSnapshotsByRecord.' + rk, 'missing');
    } else if (!catalogMatchesExpected(rk, cat)) {
      if (
        cat &&
        cat.climateTraitsFieldFingerprint &&
        cat.climateTraitsFieldFingerprint !== EXPECTED_CATALOG[rk].climateTraitsFieldFingerprint
      ) {
        pushFinding(
          findings,
          'catalog_fingerprint_mismatch',
          'error',
          'catalogSnapshotsByRecord.' + rk + '.climateTraitsFieldFingerprint',
          String(cat.climateTraitsFieldFingerprint)
        );
      } else {
        pushFinding(findings, 'missing_catalog_snapshot', 'error', 'catalogSnapshotsByRecord.' + rk, 'mismatch');
      }
    }

    const id = n.identityStatesByRecord[rk];
    if (!asObject(id)) {
      pushFinding(findings, 'missing_identity_state', 'error', 'identityStatesByRecord.' + rk, 'missing');
    } else {
      if (id.currentNeedsReview === true) {
        pushFinding(findings, 'current_needs_review_active', 'error', 'identityStatesByRecord.' + rk, 'true');
      }
      if (id.currentIdentityConflict === true) {
        pushFinding(findings, 'current_identity_conflict_active', 'error', 'identityStatesByRecord.' + rk, 'true');
      }
      if (id.canonicalIdentityConfirmed !== true) {
        pushFinding(findings, 'current_identity_unconfirmed', 'error', 'identityStatesByRecord.' + rk, 'false');
      }
      if (id.parentOrGenusScope !== 'species') {
        pushFinding(
          findings,
          'non_species_identity_scope',
          'error',
          'identityStatesByRecord.' + rk + '.parentOrGenusScope',
          String(id.parentOrGenusScope)
        );
      }
      if (
        id.currentIdentityBindingFingerprint !==
        EXPECTED_IDENTITY[rk].currentIdentityBindingFingerprint
      ) {
        pushFinding(
          findings,
          'identity_fingerprint_mismatch',
          'error',
          'identityStatesByRecord.' + rk + '.currentIdentityBindingFingerprint',
          String(id.currentIdentityBindingFingerprint)
        );
      } else if (!identityMatchesExpected(rk, id) && !hasCode(findings, 'current_needs_review_active')) {
        // structural mismatch beyond blockers
        if (
          !hasCode(findings, 'current_identity_conflict_active') &&
          !hasCode(findings, 'current_identity_unconfirmed') &&
          !hasCode(findings, 'non_species_identity_scope')
        ) {
          pushFinding(findings, 'missing_identity_state', 'error', 'identityStatesByRecord.' + rk, 'mismatch');
        }
      }
    }

    const ctx = n.targetContextsByRecord[rk];
    if (!asObject(ctx)) {
      pushFinding(findings, 'missing_target_context', 'error', 'targetContextsByRecord.' + rk, 'missing');
    } else if (!contextExactMatch(ctx)) {
      pushFinding(findings, 'context_mismatch', 'error', 'targetContextsByRecord.' + rk, 'mismatch');
    }

    if (!Object.prototype.hasOwnProperty.call(n.targetRegionsByRecord, rk)) {
      pushFinding(findings, 'target_region_invented', 'error', 'targetRegionsByRecord.' + rk, 'missing');
    } else if (n.targetRegionsByRecord[rk] !== null) {
      pushFinding(
        findings,
        'target_region_invented',
        'error',
        'targetRegionsByRecord.' + rk,
        String(n.targetRegionsByRecord[rk])
      );
    }

    const opts = asObject(n.adapterOptionsByRecord[rk]);
    if (!opts || opts.includeExplanationParts !== true) {
      pushFinding(findings, 'caller_snapshot_missing', 'error', 'adapterOptionsByRecord.' + rk, 'invalid');
    } else {
      const optUnk = unknownKeys(opts, [
        'includeExplanationParts',
        'runtimeConsumptionRequested',
        'productAuthorityRequested',
        'eligibilityAuthorityRequested',
        'scalarAuthorityRequested',
        'GOSAuthorityRequested'
      ]);
      if (optUnk.length) {
        pushFinding(findings, 'unknown_bridge_input_key', 'error', 'adapterOptionsByRecord.' + rk, optUnk.join(','));
      }
      if (
        opts.runtimeConsumptionRequested === true ||
        opts.productAuthorityRequested === true ||
        opts.eligibilityAuthorityRequested === true ||
        opts.scalarAuthorityRequested === true ||
        opts.GOSAuthorityRequested === true
      ) {
        pushFinding(findings, 'invalid_bridge_input', 'error', 'adapterOptionsByRecord.' + rk, 'authority_request');
      }
    }
  }

  if (
    hasCode(findings, 'current_needs_review_active') ||
    hasCode(findings, 'current_identity_conflict_active') ||
    hasCode(findings, 'current_identity_unconfirmed') ||
    hasCode(findings, 'non_species_identity_scope') ||
    hasCode(findings, 'identity_fingerprint_mismatch') ||
    hasCode(findings, 'missing_identity_state')
  ) {
    const idBlocked =
      hasCode(findings, 'current_needs_review_active') ||
      hasCode(findings, 'current_identity_conflict_active') ||
      hasCode(findings, 'current_identity_unconfirmed') ||
      hasCode(findings, 'non_species_identity_scope');
    return failResult(idBlocked ? 'identity_state_blocked' : 'caller_snapshot_missing', findings, warnings, {
      overlayValidationReference: overlayValidationReference,
      generatedFrom: generatedFrom,
      recordKeys: EXPECTED_RECORD_KEYS.slice()
    });
  }

  if (
    hasCode(findings, 'missing_catalog_snapshot') ||
    hasCode(findings, 'catalog_fingerprint_mismatch') ||
    hasCode(findings, 'missing_target_context') ||
    hasCode(findings, 'context_mismatch') ||
    hasCode(findings, 'caller_snapshot_missing') ||
    hasCode(findings, 'unknown_bridge_input_key') ||
    hasCode(findings, 'invalid_bridge_input')
  ) {
    const status = hasCode(findings, 'unknown_bridge_input_key') || hasCode(findings, 'invalid_bridge_input')
      ? 'adapter_input_invalid'
      : 'caller_snapshot_missing';
    return failResult(status, findings, warnings, {
      overlayValidationReference: overlayValidationReference,
      generatedFrom: generatedFrom,
      recordKeys: EXPECTED_RECORD_KEYS.slice()
    });
  }

  if (hasCode(findings, 'target_region_invented')) {
    return failResult('caller_snapshot_missing', findings, warnings, {
      overlayValidationReference: overlayValidationReference,
      generatedFrom: generatedFrom,
      recordKeys: EXPECTED_RECORD_KEYS.slice()
    });
  }

  // Shape B + Adapter analysis
  const recordResults = [];
  const compactProfiles = {};
  const batchFps = {};
  const catalogFps = {};
  const identityFps = {};
  const contextsFp = {};
  const regionsFp = {};
  const optionsFp = {};

  for (let i = 0; i < EXPECTED_RECORD_KEYS.length; i++) {
    const rk = EXPECTED_RECORD_KEYS[i];
    const field = EXPECTED_FIELDS[rk];
    const rec = overlayVal.normalized.records[rk];
    const shapeB = buildReviewedClimateProfileSnapshotFromOverlayRecord(rk, rec, field, findings);
    if (!shapeB) {
      return failResult('record_inventory_mismatch', findings, warnings, {
        overlayValidationReference: overlayValidationReference,
        generatedFrom: generatedFrom,
        recordKeys: EXPECTED_RECORD_KEYS.slice()
      });
    }
    if (shapeB.integrationStatus !== 'inert_imported') {
      pushFinding(
        findings,
        'overlay_validation_failed',
        'error',
        'records.' + rk + '.integrationStatus',
        shapeB.integrationStatus
      );
      return failResult('overlay_provenance_blocked', findings, warnings, {
        overlayValidationReference: overlayValidationReference,
        generatedFrom: generatedFrom,
        recordKeys: EXPECTED_RECORD_KEYS.slice()
      });
    }

    const catalog = cloneJson(n.catalogSnapshotsByRecord[rk]);
    const identity = cloneJson(n.identityStatesByRecord[rk]);
    const targetContext = cloneJson(n.targetContextsByRecord[rk]);
    const adapterOptions = { includeExplanationParts: true };

    const adapterInput = {
      adapterContractVersion: SR_REVIEWED_CLIMATE_PROFILE_PRODUCT_ADAPTER_CONTRACT_VERSION,
      canonicalKey: identity.canonicalKey,
      acceptedScientificName: identity.acceptedScientificName,
      field: field,
      catalogClimateTraitsSnapshot: catalog,
      reviewedClimateProfileSnapshot: cloneJson(shapeB),
      identityState: identity,
      targetContext: targetContext,
      adapterOptions: adapterOptions,
      expectedProfileFingerprint: shapeB.fieldSnapshot.profileFingerprint,
      expectedSourceBatchValidationFingerprint: shapeB.fieldSnapshot.sourceBatchValidationFingerprint,
      expectedCatalogSnapshotFingerprint: catalog.climateTraitsFieldFingerprint,
      expectedIdentityBindingFingerprint: identity.currentIdentityBindingFingerprint
    };
    // targetRegion intentionally omitted when bridge region is null

    compactProfiles[rk] = shapeB.fieldSnapshot.profileFingerprint;
    batchFps[rk] = shapeB.fieldSnapshot.sourceBatchValidationFingerprint;
    catalogFps[rk] = catalog.climateTraitsFieldFingerprint;
    identityFps[rk] = identity.currentIdentityBindingFingerprint;
    contextsFp[rk] = targetContext;
    regionsFp[rk] = null;
    optionsFp[rk] = adapterOptions;

    const adapterValidate = validateReviewedClimateProfileProductAdapterInput(adapterInput);
    if (!adapterValidate.ok) {
      pushFinding(
        findings,
        'adapter_input_validation_failed',
        'error',
        'adapterInput.' + rk,
        (adapterValidate.findings || [])
          .map(function (f) {
            return f.code;
          })
          .join(',')
      );
      return failResult('adapter_input_invalid', findings, warnings, {
        overlayValidationReference: overlayValidationReference,
        generatedFrom: generatedFrom,
        recordKeys: EXPECTED_RECORD_KEYS.slice()
      });
    }

    const adapterResultBefore = null;
    const adapterResult = analyzeReviewedClimateProfileProductCandidate(adapterInput);
    const adapterResultSerialized = stableSerialize(adapterResult);
    if (adapterResultBefore !== null) {
      /* placeholder for mutation check after */
    }

    if (!adapterResult || typeof adapterResult !== 'object') {
      pushFinding(findings, 'adapter_analysis_failed', 'error', 'adapterResult.' + rk, 'null');
      return failResult('adapter_analysis_blocked', findings, warnings, {
        overlayValidationReference: overlayValidationReference,
        generatedFrom: generatedFrom,
        recordKeys: EXPECTED_RECORD_KEYS.slice()
      });
    }

    const ab = adapterResult.authorityBoundary || {};
    const cand = adapterResult.candidate || {};
    if (
      ab.productAuthority === true ||
      ab.eligibilityAuthority === true ||
      ab.scalarAuthority === true ||
      ab.runtimeRecommendationAuthority === true ||
      ab.GOSOutcomeAuthority === true ||
      adapterResult.descriptor.productAuthority === true
    ) {
      pushFinding(findings, 'adapter_authority_violation', 'error', 'adapterResult.' + rk, 'authority_true');
      return failResult('adapter_analysis_blocked', findings, warnings, {
        overlayValidationReference: overlayValidationReference,
        generatedFrom: generatedFrom,
        recordKeys: EXPECTED_RECORD_KEYS.slice()
      });
    }
    if (ab.productUseAllowed === true || cand.productUseAllowed === true) {
      pushFinding(findings, 'product_use_allowed_violation', 'error', 'adapterResult.' + rk, 'true');
      return failResult('adapter_analysis_blocked', findings, warnings, {
        overlayValidationReference: overlayValidationReference,
        generatedFrom: generatedFrom,
        recordKeys: EXPECTED_RECORD_KEYS.slice()
      });
    }
    if (ab.runtimeConsumptionAllowed === true || adapterResult.descriptor.runtimeConsumptionAllowed === true) {
      pushFinding(findings, 'runtime_consumption_allowed_violation', 'error', 'adapterResult.' + rk, 'true');
      return failResult('adapter_analysis_blocked', findings, warnings, {
        overlayValidationReference: overlayValidationReference,
        generatedFrom: generatedFrom,
        recordKeys: EXPECTED_RECORD_KEYS.slice()
      });
    }

    const expectedValue = EXPECTED_CATALOG[rk].legacyObservedValue;
    if (
      adapterResult.status !== 'reviewed_supported_agreement' ||
      adapterResult.comparison !== 'agreement' ||
      !cand.candidateAvailable ||
      cand.reviewedCandidateValue !== expectedValue ||
      adapterResult.humanReviewRequired !== false
    ) {
      pushFinding(
        findings,
        'adapter_analysis_failed',
        'error',
        'adapterResult.' + rk,
        String(adapterResult.status) + '/' + String(adapterResult.comparison)
      );
      return failResult('adapter_analysis_blocked', findings, warnings, {
        overlayValidationReference: overlayValidationReference,
        generatedFrom: generatedFrom,
        recordKeys: EXPECTED_RECORD_KEYS.slice()
      });
    }

    const nestedSoft = (adapterResult.warnings || []).concat(adapterResult.findings || []);
    if (
      !nestedSoft.some(function (f) {
        return f.code === 'product_authority_not_granted';
      })
    ) {
      pushFinding(findings, 'adapter_analysis_failed', 'error', 'adapterResult.' + rk, 'missing_authority_finding');
      return failResult('adapter_analysis_blocked', findings, warnings, {
        overlayValidationReference: overlayValidationReference,
        generatedFrom: generatedFrom,
        recordKeys: EXPECTED_RECORD_KEYS.slice()
      });
    }

    const adapterInputFp =
      buildReviewedClimateProfileProductAdapterInputFingerprint(adapterInput) ||
      adapterResult.inputFingerprint;
    const adapterResultFp = adapterResult.summaryFingerprint;

    // Adapter-result mutation check: re-serialize must match
    if (stableSerialize(adapterResult) !== adapterResultSerialized) {
      pushFinding(findings, 'adapter_result_mutation_detected', 'error', 'adapterResult.' + rk, 'mutated');
      return failResult('adapter_analysis_blocked', findings, warnings, {
        overlayValidationReference: overlayValidationReference,
        generatedFrom: generatedFrom,
        recordKeys: EXPECTED_RECORD_KEYS.slice()
      });
    }

    pushFinding(warnings, 'bridge_record_analyzed', 'info', 'recordResults.' + rk, field);
    pushFinding(warnings, 'bridge_agreement_confirmed', 'info', 'recordResults.' + rk, 'agreement');
    pushFinding(warnings, 'bridge_candidate_non_authoritative', 'info', 'recordResults.' + rk, expectedValue);

    recordResults.push({
      recordKey: rk,
      canonicalKey: identity.canonicalKey,
      field: field,
      overlaySnapshotReference: freezeDeep({
        integrationStatus: shapeB.integrationStatus,
        profileId: shapeB.fieldSnapshot.profileId,
        profileFingerprint: shapeB.fieldSnapshot.profileFingerprint,
        sourceBatchValidationFingerprint: shapeB.fieldSnapshot.sourceBatchValidationFingerprint,
        reviewedValue: shapeB.fieldSnapshot.reviewedValue
      }),
      catalogSnapshotReference: freezeDeep({
        field: catalog.field,
        legacyObservedValue: catalog.legacyObservedValue,
        legacySource: catalog.legacySource,
        climateTraitsFieldFingerprint: catalog.climateTraitsFieldFingerprint
      }),
      identityStateReference: freezeDeep({
        canonicalKey: identity.canonicalKey,
        acceptedScientificName: identity.acceptedScientificName,
        currentIdentityBindingFingerprint: identity.currentIdentityBindingFingerprint,
        parentOrGenusScope: identity.parentOrGenusScope,
        canonicalIdentityConfirmed: identity.canonicalIdentityConfirmed
      }),
      adapterInputFingerprint: adapterInputFp,
      adapterResultFingerprint: adapterResultFp,
      adapterStatus: adapterResult.status,
      comparison: adapterResult.comparison,
      candidateAvailable: true,
      reviewedCandidateValue: expectedValue,
      humanReviewRequired: false,
      productUseAllowed: false,
      runtimeConsumptionAllowed: false,
      authorityBoundary: authorityBoundaryFalse(),
      adapterFindingsReference: freezeDeep({
        findings: cloneJson(adapterResult.findings || []),
        warnings: cloneJson(adapterResult.warnings || []),
        regionGateStatus: adapterResult.regionGate && adapterResult.regionGate.status,
        inputFingerprint: adapterResult.inputFingerprint,
        summaryFingerprint: adapterResult.summaryFingerprint
      })
    });
  }

  pushFinding(warnings, 'product_authority_not_granted', 'info', 'authorityBoundary', 'always_false');

  const inputFingerprint = buildInputFingerprintParts({
    bridgeContractVersion: n.bridgeContractVersion,
    overlayReportFingerprint: overlayVal.reportFingerprint,
    generatedFrom: generatedFrom,
    recordKeys: EXPECTED_RECORD_KEYS.slice(),
    compactProfileFingerprints: compactProfiles,
    sourceBatchFingerprints: batchFps,
    catalogFingerprints: catalogFps,
    identityFingerprints: identityFps,
    contexts: contextsFp,
    targetRegions: regionsFp,
    adapterOptions: optionsFp
  });

  if (
    n.expectedBridgeInputFingerprint !== undefined &&
    n.expectedBridgeInputFingerprint !== inputFingerprint
  ) {
    pushFinding(
      findings,
      'nondeterministic_bridge_output',
      'error',
      'expectedBridgeInputFingerprint',
      'mismatch'
    );
    return failResult('adapter_analysis_blocked', findings, warnings, {
      overlayValidationReference: overlayValidationReference,
      generatedFrom: generatedFrom,
      recordKeys: EXPECTED_RECORD_KEYS.slice(),
      inputFingerprint: inputFingerprint
    });
  }

  // Mutation checks
  const mutationCheck = { mutated: false, overlayMutated: false, callerMutated: false };
  if (overlayBefore != null && stableSerialize(input.overlay) !== overlayBefore) {
    pushFinding(findings, 'overlay_mutation_detected', 'error', 'overlay', 'mutated');
    mutationCheck.mutated = true;
    mutationCheck.overlayMutated = true;
  }
  if (stableSerialize(input) !== callerBefore) {
    pushFinding(findings, 'caller_input_mutation_detected', 'error', '', 'mutated');
    mutationCheck.mutated = true;
    mutationCheck.callerMutated = true;
  }
  if (mutationCheck.mutated) {
    return failResult('adapter_analysis_blocked', findings, warnings, {
      overlayValidationReference: overlayValidationReference,
      generatedFrom: generatedFrom,
      recordKeys: EXPECTED_RECORD_KEYS.slice(),
      inputFingerprint: inputFingerprint,
      mutationCheck: mutationCheck,
      recordResults: recordResults
    });
  }

  // Expected report fingerprint for real pilot
  if (
    overlayVal.reportFingerprint !==
    '0.1.0-sr-reviewed-climate-profile-catalog-overlay|||lavender,rosemary'
  ) {
    pushFinding(
      findings,
      'overlay_validation_failed',
      'error',
      'reportFingerprint',
      overlayVal.reportFingerprint
    );
    return failResult('overlay_invalid', findings, warnings, {
      overlayValidationReference: overlayValidationReference,
      generatedFrom: generatedFrom,
      recordKeys: EXPECTED_RECORD_KEYS.slice(),
      inputFingerprint: inputFingerprint
    });
  }

  const hard = sortFindings(
    findings.filter(function (f) {
      return f.severity === 'error';
    })
  );
  const soft = sortFindings(warnings);
  if (hard.length) {
    return failResult('adapter_analysis_blocked', hard, soft, {
      overlayValidationReference: overlayValidationReference,
      generatedFrom: generatedFrom,
      recordKeys: EXPECTED_RECORD_KEYS.slice(),
      inputFingerprint: inputFingerprint,
      recordResults: recordResults
    });
  }

  const descriptor = getSmartRecDeveloperReviewedClimateProfileOverlayProductAdapterBridgeDescriptor();
  const authorityBoundary = authorityBoundaryFalse();
  const result = {
    descriptor: descriptor,
    bridgeContractVersion: SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_CONTRACT_VERSION,
    bridgeResultContractVersion:
      SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_PRODUCT_ADAPTER_BRIDGE_RESULT_CONTRACT_VERSION,
    status: 'bridge_analysis_complete',
    generatedFrom: generatedFrom,
    recordKeys: EXPECTED_RECORD_KEYS.slice(),
    overlayValidationReference: freezeDeep(overlayValidationReference),
    recordResults: freezeDeep(recordResults),
    findings: freezeDeep(hard),
    warnings: freezeDeep(soft),
    authorityBoundary: authorityBoundary,
    inputFingerprint: inputFingerprint,
    summaryFingerprint: '',
    mutationCheck: freezeDeep(mutationCheck)
  };
  const summary1 = buildSummaryFingerprint({
    inputFingerprint: result.inputFingerprint,
    status: result.status,
    generatedFrom: result.generatedFrom,
    recordKeys: result.recordKeys,
    overlayValidationReference: result.overlayValidationReference,
    recordResultsCompact: recordResults.map(function (rr) {
      return {
        recordKey: rr.recordKey,
        adapterStatus: rr.adapterStatus,
        comparison: rr.comparison,
        candidateAvailable: rr.candidateAvailable,
        reviewedCandidateValue: rr.reviewedCandidateValue,
        adapterInputFingerprint: rr.adapterInputFingerprint,
        adapterResultFingerprint: rr.adapterResultFingerprint
      };
    }),
    findings: result.findings,
    warnings: result.warnings,
    authorityBoundary: result.authorityBoundary,
    mutationCheck: result.mutationCheck
  });
  result.summaryFingerprint = summary1;
  const summary2 = buildSummaryFingerprint({
    inputFingerprint: result.inputFingerprint,
    status: result.status,
    generatedFrom: result.generatedFrom,
    recordKeys: result.recordKeys,
    overlayValidationReference: result.overlayValidationReference,
    recordResultsCompact: recordResults.map(function (rr) {
      return {
        recordKey: rr.recordKey,
        adapterStatus: rr.adapterStatus,
        comparison: rr.comparison,
        candidateAvailable: rr.candidateAvailable,
        reviewedCandidateValue: rr.reviewedCandidateValue,
        adapterInputFingerprint: rr.adapterInputFingerprint,
        adapterResultFingerprint: rr.adapterResultFingerprint
      };
    }),
    findings: result.findings,
    warnings: result.warnings,
    authorityBoundary: result.authorityBoundary,
    mutationCheck: result.mutationCheck
  });
  if (summary1 !== summary2) {
    pushFinding(findings, 'nondeterministic_bridge_output', 'error', 'summaryFingerprint', 'mismatch');
    return failResult('adapter_analysis_blocked', findings, warnings, {
      overlayValidationReference: overlayValidationReference,
      generatedFrom: generatedFrom,
      recordKeys: EXPECTED_RECORD_KEYS.slice(),
      inputFingerprint: inputFingerprint,
      recordResults: recordResults
    });
  }

  return freezeDeep(result);
}
