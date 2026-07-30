/**
 * Cruvit — Smart Recommendations developer reviewedClimateProfile catalog overlay
 * ---------------------------------------------------------------------------
 * Inert, developer/test-only, non-authoritative schema/overlay proof helpers.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, timers, persistence, or writes.
 *  - Does not grant product, eligibility, scalar, recommendation, or GOS authority.
 *  - Does not mutate plants.seed.json, climateTraits, needsReview, or identity conflicts.
 *  - Synthetic overlay only; does not load Lavender/Rosemary reviewed-data batches.
 */

export const SR_REVIEWED_CLIMATE_PROFILE_CATALOG_OVERLAY_VERSION =
  '0.1.0-sr-reviewed-climate-profile-catalog-overlay';

export const SR_REVIEWED_CLIMATE_PROFILE_CATALOG_OVERLAY_CAPABILITY =
  'explicit_developer_reviewed_climate_profile_catalog_overlay_validation';

export const SR_CATALOG_REVIEWED_CLIMATE_PROFILE_INTEGRATION_CONTRACT_VERSION =
  '0.1.0-sr-catalog-reviewed-climate-profile-integration-contract';

export const SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION_FOR_OVERLAY =
  '0.1.0-sr-structured-climate-profile-contract';

export const SR_REVIEWED_CLIMATE_PROFILE_CATALOG_SCHEMA_VERSION = 1;

export const SR_REVIEWED_CLIMATE_PROFILE_IDENTITY_REGISTRY_VERSION = '1.5.0';

export const SR_REVIEWED_CLIMATE_PROFILE_INTEGRATION_STATUSES = Object.freeze([
  'inert_imported',
  'inert_blocked',
  'stale'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_FIELDS = Object.freeze(['sun', 'water']);

export const SR_REVIEWED_CLIMATE_PROFILE_STATUSES = Object.freeze([
  'reviewed_supported',
  'reviewed_conflicting',
  'remains_ineligible',
  'modeling_gap',
  'identity_ambiguous',
  'context_ambiguous',
  'preference_tolerance_ambiguous'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_CLAIM_TYPES = Object.freeze([
  'preference',
  'optimum',
  'tolerance',
  'survival_minimum'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_VALUES_SUN = Object.freeze([
  'full_sun',
  'full_sun_to_part_shade',
  'part_shade',
  'full_shade'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_VALUES_WATER = Object.freeze([
  'low',
  'medium',
  'high',
  'very_high'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_COMPOUND_LEGACY_VALUES = Object.freeze([
  'morning_sun_part_shade',
  'bright_shade'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_OUTCOME_APPLICABILITY = Object.freeze([
  'survival',
  'vegetative',
  'flowering',
  'fruiting',
  'reliability'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_CONTEXT_SETTINGS = Object.freeze([
  'indoor',
  'outdoor',
  'unknown'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_CONTEXT_PLANTINGS = Object.freeze([
  'container',
  'ground',
  'unknown'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_CONTEXT_MATURITIES = Object.freeze([
  'establishment',
  'mature',
  'unknown'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_CONTEXT_OBJECTIVES = Object.freeze([
  'general',
  'flowering',
  'fruiting',
  'unknown'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_CONTEXT_DAYPARTS = Object.freeze([
  'morning',
  'afternoon',
  'all_day',
  'unknown'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_CONTEXT_HEAT_PROTECTIONS = Object.freeze([
  'required',
  'beneficial',
  'not_required',
  'unknown'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_TOP_LEVEL_KEYS = Object.freeze([
  'overlayContractVersion',
  'integrationContractVersion',
  'catalogSchemaVersion',
  'identityRegistryVersion',
  'generatedFrom',
  'records'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_INTEGRATION_KEYS = Object.freeze([
  'integrationContractVersion',
  'integrationStatus',
  'productAuthority',
  'eligibilityAuthority',
  'scalarAuthority',
  'runtimeRecommendationAuthority',
  'GOSOutcomeAuthority',
  'identityBinding',
  'fields'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_IDENTITY_BINDING_KEYS = Object.freeze([
  'canonicalKey',
  'acceptedScientificName',
  'identityRegistryVersion',
  'identityBindingFingerprint',
  'needsReviewAtImport',
  'identityConflictAtImport'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_SNAPSHOT_KEYS = Object.freeze([
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
  'integrationStatus',
  'outcomeApplicability',
  'supersedesProfileId',
  'lastReviewed'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_SNAPSHOT_REQUIRED_KEYS = Object.freeze([
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
  'sourceBatchValidationFingerprint',
  'integrationStatus'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_FR_REF_REQUIRED_KEYS = Object.freeze([
  'fieldReviewContractVersion',
  'fieldReviewRegistryVersion',
  'canonicalKey',
  'field',
  'reviewStatus',
  'valueFingerprint'
]);

export const SR_REVIEWED_CLIMATE_PROFILE_FINDING_CODES = Object.freeze([
  'unsupported_overlay_contract',
  'unknown_overlay_key',
  'unknown_record_key',
  'unknown_catalog_key',
  'canonical_identity_mismatch',
  'profile_field_duplicate',
  'profile_contract_unsupported',
  'profile_fingerprint_mismatch',
  'field_review_reference_mismatch',
  'source_batch_unverified',
  'stale_profile_snapshot',
  'context_mismatch',
  'profile_status_unsupported',
  'reviewed_value_mismatch',
  'product_authority_attempt',
  'eligibility_authority_attempt',
  'scalar_authority_attempt',
  'runtime_recommendation_authority_attempt',
  'GOS_authority_attempt',
  'runtime_import_attempt',
  'mutation_detected',
  'identity_conflict_active',
  'needs_review_active',
  'climate_traits_value_conflict'
]);

const PLANT_CATALOG_ITEM_KNOWN_KEYS = Object.freeze([
  'schemaVersion',
  'slug',
  'names',
  'aliases',
  'scientific',
  'taxonomy',
  'tags',
  'icon',
  'care',
  'climateLabel',
  'climateTraits',
  'reviewedClimateProfile',
  'environmentSuitability',
  'growingEnvironments',
  'plantingMethods',
  'gardenStyles',
  'gardenPurposes',
  'maintenanceLevel',
  'filterTaxonomyMeta',
  'gardenCompatibility',
  'warnings',
  'products',
  'media',
  'careSchedule',
  'verification',
  'qualityTier',
  'source',
  'updatedAt'
]);

const CANONICAL_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

function pushFinding(findings, code, severity, path, detail) {
  findings.push(
    freezeDeep({
      code: code,
      severity: severity,
      path: path || '',
      detail: detail || ''
    })
  );
}

function hasFinding(findings, code) {
  return findings.some(function (f) {
    return f.code === code;
  });
}

function unknownKeys(obj, allowed) {
  const allow = Object.create(null);
  for (let i = 0; i < allowed.length; i++) allow[allowed[i]] = true;
  return Object.keys(obj || {}).filter(function (k) {
    return !allow[k];
  });
}

export function buildReviewedClimateProfileIdentityBindingFingerprint(binding) {
  const o = asObject(binding) || {};
  return [
    String(o.canonicalKey || '').trim(),
    String(o.acceptedScientificName || '').trim(),
    String(o.identityRegistryVersion || '').trim(),
    o.needsReviewAtImport === true ? 'true' : o.needsReviewAtImport === false ? 'false' : '',
    o.identityConflictAtImport === true
      ? 'true'
      : o.identityConflictAtImport === false
        ? 'false'
        : ''
  ].join('|');
}

function contextKey(scope) {
  const o = asObject(scope);
  if (!o) return '__null__';
  const parts = [o.setting, o.planting, o.maturity, o.objective];
  if (o.daypart !== undefined) parts.push('daypart=' + o.daypart);
  if (o.heatProtection !== undefined) parts.push('heatProtection=' + o.heatProtection);
  if (o.climateOrRegion !== undefined) {
    const region = Array.isArray(o.climateOrRegion)
      ? o.climateOrRegion.slice().sort().join(',')
      : String(o.climateOrRegion);
    parts.push('climateOrRegion=' + region);
  }
  if (o.season !== undefined) parts.push('season=' + o.season);
  return parts.join('/');
}

export function buildReviewedClimateProfileCompactFingerprint(snapshot, canonicalKey) {
  const o = asObject(snapshot) || {};
  const fr = asObject(o.fieldReviewReference) || {};
  return [
    String(o.sourceProfileContractVersion || ''),
    String(canonicalKey || ''),
    String(o.field || ''),
    String(o.profileStatus || ''),
    o.reviewedClaimType == null ? '__null__' : String(o.reviewedClaimType),
    o.reviewedValue == null ? '__null__' : String(o.reviewedValue),
    contextKey(o.contextScope),
    String(fr.valueFingerprint || ''),
    String(o.evidenceRefCount),
    String(o.sourceBatchId || ''),
    String(o.sourceBatchValidationFingerprint || '')
  ].join('|');
}

function normalizeContextScope(scope, findings, path) {
  const o = asObject(scope);
  if (!o) {
    pushFinding(findings, 'context_mismatch', 'error', path, 'missing_context_scope');
    return null;
  }
  const unknown = unknownKeys(o, [
    'setting',
    'planting',
    'maturity',
    'objective',
    'daypart',
    'heatProtection',
    'climateOrRegion',
    'season'
  ]);
  if (unknown.length) {
    pushFinding(
      findings,
      'context_mismatch',
      'error',
      path,
      'unknown_context_keys:' + unknown.join(',')
    );
    return null;
  }
  if (
    SR_REVIEWED_CLIMATE_PROFILE_CONTEXT_SETTINGS.indexOf(o.setting) < 0 ||
    SR_REVIEWED_CLIMATE_PROFILE_CONTEXT_PLANTINGS.indexOf(o.planting) < 0 ||
    SR_REVIEWED_CLIMATE_PROFILE_CONTEXT_MATURITIES.indexOf(o.maturity) < 0 ||
    SR_REVIEWED_CLIMATE_PROFILE_CONTEXT_OBJECTIVES.indexOf(o.objective) < 0
  ) {
    pushFinding(findings, 'context_mismatch', 'error', path, 'invalid_required_context_token');
    return null;
  }
  const out = {
    setting: o.setting,
    planting: o.planting,
    maturity: o.maturity,
    objective: o.objective
  };
  if (o.daypart !== undefined) {
    if (SR_REVIEWED_CLIMATE_PROFILE_CONTEXT_DAYPARTS.indexOf(o.daypart) < 0) {
      pushFinding(findings, 'context_mismatch', 'error', path + '.daypart', 'invalid_daypart');
      return null;
    }
    out.daypart = o.daypart;
  }
  if (o.heatProtection !== undefined) {
    if (SR_REVIEWED_CLIMATE_PROFILE_CONTEXT_HEAT_PROTECTIONS.indexOf(o.heatProtection) < 0) {
      pushFinding(
        findings,
        'context_mismatch',
        'error',
        path + '.heatProtection',
        'invalid_heatProtection'
      );
      return null;
    }
    out.heatProtection = o.heatProtection;
  }
  if (o.climateOrRegion !== undefined) {
    if (isNonEmptyString(o.climateOrRegion)) {
      out.climateOrRegion = String(o.climateOrRegion).trim();
    } else if (Array.isArray(o.climateOrRegion) && o.climateOrRegion.length) {
      const arr = o.climateOrRegion
        .map(function (x) {
          return String(x || '').trim();
        })
        .filter(Boolean)
        .sort();
      const uniq = Array.from(new Set(arr));
      if (!uniq.length) {
        pushFinding(
          findings,
          'context_mismatch',
          'error',
          path + '.climateOrRegion',
          'empty_climateOrRegion'
        );
        return null;
      }
      out.climateOrRegion = uniq;
    } else {
      pushFinding(
        findings,
        'context_mismatch',
        'error',
        path + '.climateOrRegion',
        'invalid_climateOrRegion'
      );
      return null;
    }
  }
  if (o.season !== undefined) {
    if (!isNonEmptyString(o.season)) {
      pushFinding(findings, 'context_mismatch', 'error', path + '.season', 'invalid_season');
      return null;
    }
    out.season = String(o.season).trim();
  }
  return out;
}

function allowedValuesForField(field) {
  if (field === 'sun') return SR_REVIEWED_CLIMATE_PROFILE_VALUES_SUN;
  if (field === 'water') return SR_REVIEWED_CLIMATE_PROFILE_VALUES_WATER;
  return [];
}

function validateClaimValue(field, claim, value, required, findings, path) {
  if (required) {
    if (!isNonEmptyString(claim)) {
      pushFinding(findings, 'reviewed_value_mismatch', 'error', path, 'reviewed_claim_type_required');
    }
    if (!isNonEmptyString(value)) {
      pushFinding(findings, 'reviewed_value_mismatch', 'error', path, 'reviewed_value_required');
    }
  }
  if (claim !== undefined && claim !== null) {
    if (claim === 'general_guidance') {
      pushFinding(findings, 'reviewed_value_mismatch', 'error', path, 'general_guidance_not_allowed');
    } else if (SR_REVIEWED_CLIMATE_PROFILE_CLAIM_TYPES.indexOf(claim) < 0) {
      pushFinding(findings, 'reviewed_value_mismatch', 'error', path, 'invalid_reviewedClaimType');
    }
  }
  if (value !== undefined && value !== null) {
    if (SR_REVIEWED_CLIMATE_PROFILE_COMPOUND_LEGACY_VALUES.indexOf(value) >= 0) {
      pushFinding(findings, 'reviewed_value_mismatch', 'error', path, 'compound_legacy_value');
    } else if (allowedValuesForField(field).indexOf(value) < 0) {
      pushFinding(findings, 'reviewed_value_mismatch', 'error', path, 'invalid_reviewedValue');
    }
  }
}

function normalizeFieldReviewReference(ref, canonicalKey, field, findings, path) {
  const o = asObject(ref);
  if (!o) {
    pushFinding(findings, 'field_review_reference_mismatch', 'error', path, 'missing');
    return null;
  }
  const unknown = unknownKeys(o, [
    'fieldReviewContractVersion',
    'fieldReviewRegistryVersion',
    'canonicalKey',
    'field',
    'reviewStatus',
    'valueFingerprint',
    'reviewedClaimType',
    'reviewedValue'
  ]);
  if (unknown.length) {
    pushFinding(
      findings,
      'field_review_reference_mismatch',
      'error',
      path,
      'unknown_keys:' + unknown.join(',')
    );
    return null;
  }
  for (let i = 0; i < SR_REVIEWED_CLIMATE_PROFILE_FR_REF_REQUIRED_KEYS.length; i++) {
    const k = SR_REVIEWED_CLIMATE_PROFILE_FR_REF_REQUIRED_KEYS[i];
    if (!isNonEmptyString(o[k]) && typeof o[k] !== 'string') {
      pushFinding(findings, 'field_review_reference_mismatch', 'error', path + '.' + k, 'missing');
    } else if (!isNonEmptyString(o[k])) {
      pushFinding(findings, 'field_review_reference_mismatch', 'error', path + '.' + k, 'empty');
    }
  }
  if (String(o.canonicalKey || '').trim() !== canonicalKey) {
    pushFinding(
      findings,
      'field_review_reference_mismatch',
      'error',
      path + '.canonicalKey',
      'canonical_mismatch'
    );
  }
  if (String(o.field || '').trim() !== field) {
    pushFinding(findings, 'field_review_reference_mismatch', 'error', path + '.field', 'field_mismatch');
  }
  const out = {
    fieldReviewContractVersion: String(o.fieldReviewContractVersion || '').trim(),
    fieldReviewRegistryVersion: String(o.fieldReviewRegistryVersion || '').trim(),
    canonicalKey: String(o.canonicalKey || '').trim(),
    field: String(o.field || '').trim(),
    reviewStatus: String(o.reviewStatus || '').trim(),
    valueFingerprint: String(o.valueFingerprint || '').trim()
  };
  if (o.reviewedClaimType !== undefined && o.reviewedClaimType !== null) {
    out.reviewedClaimType = String(o.reviewedClaimType).trim();
  }
  if (o.reviewedValue !== undefined && o.reviewedValue !== null) {
    out.reviewedValue = String(o.reviewedValue).trim();
  }
  return out;
}

function normalizeFieldSnapshot(raw, fieldKey, canonicalKey, findings, path) {
  const o = asObject(raw);
  if (!o) {
    pushFinding(findings, 'unknown_catalog_key', 'error', path, 'snapshot_not_object');
    return null;
  }
  const unknown = unknownKeys(o, SR_REVIEWED_CLIMATE_PROFILE_SNAPSHOT_KEYS);
  if (unknown.length) {
    pushFinding(
      findings,
      'unknown_catalog_key',
      'error',
      path,
      'unknown_keys:' + unknown.join(',')
    );
  }
  if (unknown.indexOf('sourceExcerpt') >= 0 || unknown.indexOf('excerpt') >= 0) {
    pushFinding(findings, 'unknown_catalog_key', 'error', path, 'source_excerpt_injection');
  }
  for (let i = 0; i < SR_REVIEWED_CLIMATE_PROFILE_SNAPSHOT_REQUIRED_KEYS.length; i++) {
    const k = SR_REVIEWED_CLIMATE_PROFILE_SNAPSHOT_REQUIRED_KEYS[i];
    if (o[k] === undefined || o[k] === null) {
      pushFinding(findings, 'unknown_catalog_key', 'error', path + '.' + k, 'missing_required');
    }
  }
  if (o.sourceProfileContractVersion !== SR_STRUCTURED_CLIMATE_PROFILE_CONTRACT_VERSION_FOR_OVERLAY) {
    pushFinding(
      findings,
      'profile_contract_unsupported',
      'error',
      path + '.sourceProfileContractVersion',
      String(o.sourceProfileContractVersion)
    );
  }
  if (String(o.field || '') !== fieldKey) {
    pushFinding(findings, 'canonical_identity_mismatch', 'error', path + '.field', 'field_key_mismatch');
  }
  if (SR_REVIEWED_CLIMATE_PROFILE_STATUSES.indexOf(o.profileStatus) < 0) {
    pushFinding(
      findings,
      'profile_status_unsupported',
      'error',
      path + '.profileStatus',
      String(o.profileStatus)
    );
  }
  if (SR_REVIEWED_CLIMATE_PROFILE_INTEGRATION_STATUSES.indexOf(o.integrationStatus) < 0) {
    pushFinding(
      findings,
      'stale_profile_snapshot',
      'error',
      path + '.integrationStatus',
      String(o.integrationStatus)
    );
  }
  if (o.integrationStatus === 'stale') {
    pushFinding(findings, 'stale_profile_snapshot', 'error', path + '.integrationStatus', 'stale');
  }
  validateClaimValue(
    fieldKey,
    o.reviewedClaimType,
    o.reviewedValue,
    o.profileStatus === 'reviewed_supported',
    findings,
    path
  );
  const contextScope = normalizeContextScope(o.contextScope, findings, path + '.contextScope');
  const fieldReviewReference = normalizeFieldReviewReference(
    o.fieldReviewReference,
    canonicalKey,
    fieldKey,
    findings,
    path + '.fieldReviewReference'
  );
  if (!isNonEmptyString(o.sourceBatchId) || !isNonEmptyString(o.sourceBatchValidationFingerprint)) {
    pushFinding(findings, 'source_batch_unverified', 'error', path, 'missing_batch_binding');
  }
  if (typeof o.evidenceRefCount !== 'number' || o.evidenceRefCount < 0 || o.evidenceRefCount % 1 !== 0) {
    pushFinding(findings, 'unknown_catalog_key', 'error', path + '.evidenceRefCount', 'invalid');
  }
  if (!Array.isArray(o.unresolvedLimitations)) {
    pushFinding(findings, 'unknown_catalog_key', 'error', path + '.unresolvedLimitations', 'invalid');
  }
  const limitations = Array.isArray(o.unresolvedLimitations)
    ? o.unresolvedLimitations
        .map(function (x) {
          return String(x || '').trim();
        })
        .filter(Boolean)
        .sort()
    : [];
  const out = {
    profileId: String(o.profileId || '').trim(),
    sourceProfileContractVersion: String(o.sourceProfileContractVersion || '').trim(),
    field: fieldKey,
    profileStatus: String(o.profileStatus || '').trim(),
    contextScope: contextScope,
    profileFingerprint: String(o.profileFingerprint || '').trim(),
    fieldReviewReference: fieldReviewReference,
    evidenceRefCount: o.evidenceRefCount,
    unresolvedLimitations: limitations,
    sourceBatchId: String(o.sourceBatchId || '').trim(),
    sourceBatchValidationFingerprint: String(o.sourceBatchValidationFingerprint || '').trim(),
    integrationStatus: String(o.integrationStatus || '').trim()
  };
  if (o.reviewedClaimType !== undefined && o.reviewedClaimType !== null) {
    out.reviewedClaimType = String(o.reviewedClaimType).trim();
  }
  if (o.reviewedValue !== undefined && o.reviewedValue !== null) {
    out.reviewedValue = String(o.reviewedValue).trim();
  }
  if (Array.isArray(o.outcomeApplicability) && o.outcomeApplicability.length) {
    const oa = Array.from(
      new Set(
        o.outcomeApplicability.map(function (x) {
          return String(x || '').trim();
        })
      )
    )
      .filter(Boolean)
      .sort();
    for (let i = 0; i < oa.length; i++) {
      if (SR_REVIEWED_CLIMATE_PROFILE_OUTCOME_APPLICABILITY.indexOf(oa[i]) < 0) {
        pushFinding(
          findings,
          'unknown_catalog_key',
          'error',
          path + '.outcomeApplicability',
          oa[i]
        );
      }
    }
    out.outcomeApplicability = oa;
  }
  if (isNonEmptyString(o.supersedesProfileId)) {
    out.supersedesProfileId = String(o.supersedesProfileId).trim();
  }
  if (isNonEmptyString(o.lastReviewed)) {
    out.lastReviewed = String(o.lastReviewed).trim();
  }
  const expectedFp = buildReviewedClimateProfileCompactFingerprint(out, canonicalKey);
  if (out.profileFingerprint !== expectedFp) {
    pushFinding(
      findings,
      'profile_fingerprint_mismatch',
      'error',
      path + '.profileFingerprint',
      'stored_mismatch'
    );
  }
  return out;
}

function normalizeIdentityBinding(raw, recordKey, findings, path) {
  const o = asObject(raw);
  if (!o) {
    pushFinding(findings, 'canonical_identity_mismatch', 'error', path, 'missing');
    return null;
  }
  const unknown = unknownKeys(o, SR_REVIEWED_CLIMATE_PROFILE_IDENTITY_BINDING_KEYS);
  if (unknown.length) {
    pushFinding(
      findings,
      'unknown_catalog_key',
      'error',
      path,
      'unknown_keys:' + unknown.join(',')
    );
  }
  if (!CANONICAL_KEY_RE.test(String(o.canonicalKey || ''))) {
    pushFinding(findings, 'canonical_identity_mismatch', 'error', path + '.canonicalKey', 'pattern');
  }
  if (String(o.canonicalKey || '') !== recordKey) {
    pushFinding(
      findings,
      'canonical_identity_mismatch',
      'error',
      path + '.canonicalKey',
      'record_key_mismatch'
    );
  }
  if (!isNonEmptyString(o.acceptedScientificName)) {
    pushFinding(
      findings,
      'canonical_identity_mismatch',
      'error',
      path + '.acceptedScientificName',
      'empty'
    );
  }
  if (String(o.identityRegistryVersion || '') !== SR_REVIEWED_CLIMATE_PROFILE_IDENTITY_REGISTRY_VERSION) {
    pushFinding(
      findings,
      'canonical_identity_mismatch',
      'error',
      path + '.identityRegistryVersion',
      String(o.identityRegistryVersion)
    );
  }
  if (typeof o.needsReviewAtImport !== 'boolean' || typeof o.identityConflictAtImport !== 'boolean') {
    pushFinding(findings, 'canonical_identity_mismatch', 'error', path, 'boolean_flags_required');
  }
  const expected = buildReviewedClimateProfileIdentityBindingFingerprint(o);
  if (String(o.identityBindingFingerprint || '') !== expected) {
    pushFinding(
      findings,
      'canonical_identity_mismatch',
      'error',
      path + '.identityBindingFingerprint',
      'fingerprint_mismatch'
    );
  }
  if (o.identityConflictAtImport === true) {
    pushFinding(findings, 'identity_conflict_active', 'error', path, 'hard_bind_block');
  }
  if (o.needsReviewAtImport === true) {
    pushFinding(findings, 'needs_review_active', 'warning', path, 'adapter_blocked');
  }
  return {
    canonicalKey: String(o.canonicalKey || ''),
    acceptedScientificName: String(o.acceptedScientificName || '').trim(),
    identityRegistryVersion: String(o.identityRegistryVersion || ''),
    identityBindingFingerprint: expected,
    needsReviewAtImport: !!o.needsReviewAtImport,
    identityConflictAtImport: !!o.identityConflictAtImport
  };
}

function normalizeIntegration(raw, recordKey, findings, path) {
  const o = asObject(raw);
  if (!o) {
    pushFinding(findings, 'unknown_catalog_key', 'error', path, 'missing_reviewedClimateProfile');
    return null;
  }
  const unknown = unknownKeys(o, SR_REVIEWED_CLIMATE_PROFILE_INTEGRATION_KEYS);
  if (unknown.length) {
    pushFinding(
      findings,
      'unknown_catalog_key',
      'error',
      path,
      'unknown_keys:' + unknown.join(',')
    );
  }
  if (o.integrationContractVersion !== SR_CATALOG_REVIEWED_CLIMATE_PROFILE_INTEGRATION_CONTRACT_VERSION) {
    pushFinding(
      findings,
      'unsupported_overlay_contract',
      'error',
      path + '.integrationContractVersion',
      String(o.integrationContractVersion)
    );
  }
  if (SR_REVIEWED_CLIMATE_PROFILE_INTEGRATION_STATUSES.indexOf(o.integrationStatus) < 0) {
    pushFinding(
      findings,
      'stale_profile_snapshot',
      'error',
      path + '.integrationStatus',
      String(o.integrationStatus)
    );
  }
  if (o.integrationStatus === 'stale') {
    pushFinding(findings, 'stale_profile_snapshot', 'error', path + '.integrationStatus', 'stale');
  }
  const authorityMap = [
    ['productAuthority', 'product_authority_attempt'],
    ['eligibilityAuthority', 'eligibility_authority_attempt'],
    ['scalarAuthority', 'scalar_authority_attempt'],
    ['runtimeRecommendationAuthority', 'runtime_recommendation_authority_attempt'],
    ['GOSOutcomeAuthority', 'GOS_authority_attempt']
  ];
  for (let i = 0; i < authorityMap.length; i++) {
    const key = authorityMap[i][0];
    const code = authorityMap[i][1];
    if (o[key] !== false) {
      pushFinding(findings, code, 'error', path + '.' + key, String(o[key]));
    }
  }
  const identityBinding = normalizeIdentityBinding(
    o.identityBinding,
    recordKey,
    findings,
    path + '.identityBinding'
  );
  const fieldsObj = asObject(o.fields);
  if (!fieldsObj || !Object.keys(fieldsObj).length) {
    pushFinding(findings, 'unknown_catalog_key', 'error', path + '.fields', 'minProperties');
    return null;
  }
  const fieldUnknown = unknownKeys(fieldsObj, SR_REVIEWED_CLIMATE_PROFILE_FIELDS);
  if (fieldUnknown.length) {
    pushFinding(
      findings,
      'unknown_catalog_key',
      'error',
      path + '.fields',
      'unknown_field_keys:' + fieldUnknown.join(',')
    );
  }
  const fields = {};
  const ordered = SR_REVIEWED_CLIMATE_PROFILE_FIELDS.filter(function (f) {
    return Object.prototype.hasOwnProperty.call(fieldsObj, f);
  });
  for (let i = 0; i < ordered.length; i++) {
    const fk = ordered[i];
    fields[fk] = normalizeFieldSnapshot(
      fieldsObj[fk],
      fk,
      recordKey,
      findings,
      path + '.fields.' + fk
    );
  }
  if (
    identityBinding &&
    (identityBinding.needsReviewAtImport || identityBinding.identityConflictAtImport) &&
    o.integrationStatus === 'inert_imported'
  ) {
    pushFinding(
      findings,
      'stale_profile_snapshot',
      'error',
      path + '.integrationStatus',
      'blocked_flags_require_inert_blocked'
    );
  }
  return {
    integrationContractVersion: SR_CATALOG_REVIEWED_CLIMATE_PROFILE_INTEGRATION_CONTRACT_VERSION,
    integrationStatus: String(o.integrationStatus || ''),
    productAuthority: false,
    eligibilityAuthority: false,
    scalarAuthority: false,
    runtimeRecommendationAuthority: false,
    GOSOutcomeAuthority: false,
    identityBinding: identityBinding,
    fields: fields
  };
}

export function normalizeReviewedClimateProfileOverlay(overlay) {
  const findings = [];
  const input = asObject(overlay);
  if (!input) {
    pushFinding(findings, 'unsupported_overlay_contract', 'error', '', 'overlay_not_object');
    return freezeDeep({ ok: false, normalized: null, findings: findings });
  }
  const unknown = unknownKeys(input, SR_REVIEWED_CLIMATE_PROFILE_OVERLAY_TOP_LEVEL_KEYS);
  if (unknown.length) {
    pushFinding(findings, 'unknown_overlay_key', 'error', '', unknown.join(','));
  }
  if (input.overlayContractVersion !== SR_REVIEWED_CLIMATE_PROFILE_CATALOG_OVERLAY_VERSION) {
    pushFinding(
      findings,
      'unsupported_overlay_contract',
      'error',
      'overlayContractVersion',
      String(input.overlayContractVersion)
    );
  }
  if (
    input.integrationContractVersion !== SR_CATALOG_REVIEWED_CLIMATE_PROFILE_INTEGRATION_CONTRACT_VERSION
  ) {
    pushFinding(
      findings,
      'unsupported_overlay_contract',
      'error',
      'integrationContractVersion',
      String(input.integrationContractVersion)
    );
  }
  if (input.catalogSchemaVersion !== SR_REVIEWED_CLIMATE_PROFILE_CATALOG_SCHEMA_VERSION) {
    pushFinding(
      findings,
      'unsupported_overlay_contract',
      'error',
      'catalogSchemaVersion',
      String(input.catalogSchemaVersion)
    );
  }
  if (input.identityRegistryVersion !== SR_REVIEWED_CLIMATE_PROFILE_IDENTITY_REGISTRY_VERSION) {
    pushFinding(
      findings,
      'canonical_identity_mismatch',
      'error',
      'identityRegistryVersion',
      String(input.identityRegistryVersion)
    );
  }
  if (input.generatedFrom !== 'synthetic_fixture') {
    pushFinding(
      findings,
      'unsupported_overlay_contract',
      'error',
      'generatedFrom',
      String(input.generatedFrom)
    );
  }
  const recordsIn = asObject(input.records);
  if (!recordsIn) {
    pushFinding(findings, 'unknown_record_key', 'error', 'records', 'not_object');
    return freezeDeep({ ok: false, normalized: null, findings: findings });
  }
  const recordKeys = Object.keys(recordsIn).sort();
  const records = {};
  for (let i = 0; i < recordKeys.length; i++) {
    const key = recordKeys[i];
    if (!CANONICAL_KEY_RE.test(key)) {
      pushFinding(findings, 'unknown_record_key', 'error', 'records.' + key, 'invalid_key');
      continue;
    }
    const rec = asObject(recordsIn[key]);
    if (!rec) {
      pushFinding(findings, 'unknown_record_key', 'error', 'records.' + key, 'not_object');
      continue;
    }
    const recUnknown = unknownKeys(rec, ['reviewedClimateProfile']);
    if (recUnknown.length) {
      pushFinding(
        findings,
        'unknown_record_key',
        'error',
        'records.' + key,
        recUnknown.join(',')
      );
    }
    records[key] = {
      reviewedClimateProfile: normalizeIntegration(
        rec.reviewedClimateProfile,
        key,
        findings,
        'records.' + key + '.reviewedClimateProfile'
      )
    };
  }
  const hard = findings.filter(function (f) {
    return f.severity === 'error';
  });
  const normalized = {
    overlayContractVersion: SR_REVIEWED_CLIMATE_PROFILE_CATALOG_OVERLAY_VERSION,
    integrationContractVersion: SR_CATALOG_REVIEWED_CLIMATE_PROFILE_INTEGRATION_CONTRACT_VERSION,
    catalogSchemaVersion: SR_REVIEWED_CLIMATE_PROFILE_CATALOG_SCHEMA_VERSION,
    identityRegistryVersion: SR_REVIEWED_CLIMATE_PROFILE_IDENTITY_REGISTRY_VERSION,
    generatedFrom: 'synthetic_fixture',
    records: records
  };
  return freezeDeep({
    ok: hard.length === 0,
    normalized: hard.length === 0 ? normalized : null,
    findings: findings
  });
}

function climateTraitValue(traits, field) {
  const t = asObject(traits);
  if (!t) return null;
  if (field === 'sun') return t.sunNeeds == null ? null : String(t.sunNeeds);
  if (field === 'water') return t.waterNeeds == null ? null : String(t.waterNeeds);
  return null;
}

function compareClimateTraits(plant, integration, findings, path) {
  const traits = asObject(plant && plant.climateTraits);
  const fields = asObject(integration && integration.fields) || {};
  Object.keys(fields).forEach(function (field) {
    const snap = fields[field];
    if (!snap || snap.reviewedValue == null) return;
    const traitVal = climateTraitValue(traits, field);
    if (traitVal != null && traitVal !== snap.reviewedValue) {
      pushFinding(
        findings,
        'climate_traits_value_conflict',
        'warning',
        path + '.fields.' + field,
        traitVal + '!=' + snap.reviewedValue
      );
    }
  });
}

export function validateProofCatalogItemShape(item) {
  const findings = [];
  const o = asObject(item);
  if (!o) {
    pushFinding(findings, 'unknown_catalog_key', 'error', '', 'item_not_object');
    return freezeDeep({ ok: false, findings: findings });
  }
  const unknown = unknownKeys(o, PLANT_CATALOG_ITEM_KNOWN_KEYS);
  if (unknown.length) {
    pushFinding(findings, 'unknown_catalog_key', 'error', '', unknown.join(','));
  }
  if (o.schemaVersion !== 1) {
    pushFinding(findings, 'unsupported_overlay_contract', 'error', 'schemaVersion', String(o.schemaVersion));
  }
  if (!isNonEmptyString(o.slug) || !asObject(o.names)) {
    pushFinding(findings, 'unknown_catalog_key', 'error', '', 'missing_required_catalog_fields');
  }
  if (o.reviewedClimateProfile !== undefined) {
    const nested = [];
    normalizeIntegration(o.reviewedClimateProfile, o.slug, nested, 'reviewedClimateProfile');
    for (let i = 0; i < nested.length; i++) findings.push(nested[i]);
  }
  const hard = findings.filter(function (f) {
    return f.severity === 'error';
  });
  return freezeDeep({ ok: hard.length === 0, findings: findings });
}

export function validateReviewedClimateProfileOverlay(overlay, context) {
  const ctx = asObject(context) || {};
  if (ctx.runtimeImport === true) {
    return freezeDeep({
      ok: false,
      normalized: null,
      findings: [
        {
          code: 'runtime_import_attempt',
          severity: 'error',
          path: 'context.runtimeImport',
          detail: 'true'
        }
      ],
      warnings: [],
      hardErrors: ['runtime_import_attempt'],
      reportFingerprint: 'runtime_import_attempt'
    });
  }
  const inputSnapshot = stableSerialize(overlay);
  const norm = normalizeReviewedClimateProfileOverlay(overlay);
  const findings = (norm.findings || []).slice();
  if (stableSerialize(overlay) !== inputSnapshot) {
    pushFinding(findings, 'mutation_detected', 'error', '', 'overlay_mutated');
  }
  const plants = Array.isArray(ctx.plants) ? ctx.plants : [];
  const plantBySlug = Object.create(null);
  for (let i = 0; i < plants.length; i++) {
    const p = asObject(plants[i]);
    if (p && isNonEmptyString(p.slug)) plantBySlug[p.slug] = p;
  }
  if (norm.normalized) {
    Object.keys(norm.normalized.records).forEach(function (key) {
      const integration = norm.normalized.records[key].reviewedClimateProfile;
      const plant = plantBySlug[key];
      if (plant) {
        compareClimateTraits(
          plant,
          integration,
          findings,
          'records.' + key + '.reviewedClimateProfile'
        );
      }
    });
  }
  const hardErrors = findings
    .filter(function (f) {
      return f.severity === 'error';
    })
    .map(function (f) {
      return f.code;
    })
    .sort();
  const warnings = findings
    .filter(function (f) {
      return f.severity === 'warning';
    })
    .map(function (f) {
      return f.code;
    })
    .sort();
  const report = {
    ok: hardErrors.length === 0 && !!norm.normalized,
    normalized: hardErrors.length === 0 ? norm.normalized : null,
    findings: findings,
    warnings: warnings,
    hardErrors: hardErrors,
    overlayRecordCount: norm.normalized ? Object.keys(norm.normalized.records).length : 0,
    reportFingerprint: [
      SR_REVIEWED_CLIMATE_PROFILE_CATALOG_OVERLAY_VERSION,
      hardErrors.join(','),
      warnings.join(','),
      norm.normalized ? Object.keys(norm.normalized.records).sort().join(',') : ''
    ].join('|')
  };
  return freezeDeep(report);
}

export function mergeReviewedClimateProfileOverlayForProof(input) {
  const o = asObject(input) || {};
  const plantsIn = Array.isArray(o.plants) ? o.plants : [];
  const plantsSnapshot = stableSerialize(plantsIn);
  const overlaySnapshot = stableSerialize(o.overlay);
  const findings = [];
  if (o.runtimeImport === true) {
    pushFinding(findings, 'runtime_import_attempt', 'error', 'runtimeImport', 'true');
  }
  const validation = validateReviewedClimateProfileOverlay(o.overlay, {
    plants: plantsIn,
    identityHints: o.identityHints,
    runtimeImport: o.runtimeImport === true
  });
  for (let i = 0; i < (validation.findings || []).length; i++) {
    findings.push(validation.findings[i]);
  }
  const plants = cloneJson(plantsIn);
  const bySlug = Object.create(null);
  for (let i = 0; i < plants.length; i++) {
    if (plants[i] && plants[i].slug) bySlug[plants[i].slug] = plants[i];
  }
  let mergedCount = 0;
  if (validation.normalized) {
    Object.keys(validation.normalized.records)
      .sort()
      .forEach(function (key) {
        const integration = cloneJson(validation.normalized.records[key].reviewedClimateProfile);
        const plant = bySlug[key];
        if (!plant) {
          pushFinding(findings, 'unknown_record_key', 'error', 'records.' + key, 'missing_proof_plant');
          return;
        }
        const traitsBefore = stableSerialize(plant.climateTraits || null);
        plant.reviewedClimateProfile = integration;
        const shape = validateProofCatalogItemShape(plant);
        for (let j = 0; j < shape.findings.length; j++) findings.push(shape.findings[j]);
        if (stableSerialize(plant.climateTraits || null) !== traitsBefore) {
          pushFinding(findings, 'mutation_detected', 'error', key + '.climateTraits', 'changed');
        }
        mergedCount++;
      });
  }
  if (stableSerialize(plantsIn) !== plantsSnapshot) {
    pushFinding(findings, 'mutation_detected', 'error', 'plants', 'input_mutated');
  }
  if (stableSerialize(o.overlay) !== overlaySnapshot) {
    pushFinding(findings, 'mutation_detected', 'error', 'overlay', 'input_mutated');
  }
  const hardErrors = findings
    .filter(function (f) {
      return f.severity === 'error';
    })
    .map(function (f) {
      return f.code;
    })
    .sort();
  const warnings = findings
    .filter(function (f) {
      return f.severity === 'warning';
    })
    .map(function (f) {
      return f.code;
    })
    .sort();
  const ok = hardErrors.length === 0 && !!validation.normalized && mergedCount > 0;
  return freezeDeep({
    ok: ok,
    plants: ok ? plants : null,
    findings: findings,
    hardErrors: hardErrors,
    warnings: warnings,
    mergedProofRecordCount: ok ? mergedCount : 0,
    overlayRecordCount: validation.overlayRecordCount || 0,
    climateTraitsUnchanged: !hasFinding(findings, 'mutation_detected'),
    reportFingerprint: [
      SR_REVIEWED_CLIMATE_PROFILE_CATALOG_OVERLAY_VERSION,
      hardErrors.join(','),
      warnings.join(','),
      String(mergedCount)
    ].join('|')
  });
}

export function detectDuplicateFieldAttempt(fieldsArray) {
  const seen = Object.create(null);
  const dups = [];
  (fieldsArray || []).forEach(function (f) {
    const key = String(f || '');
    if (seen[key]) dups.push(key);
    seen[key] = true;
  });
  return freezeDeep({
    ok: dups.length === 0,
    duplicates: dups,
    finding: dups.length
      ? { code: 'profile_field_duplicate', severity: 'error', path: 'fields', detail: dups.join(',') }
      : null
  });
}

export function getSmartRecDeveloperReviewedClimateProfileCatalogOverlayDescriptor() {
  return freezeDeep({
    version: SR_REVIEWED_CLIMATE_PROFILE_CATALOG_OVERLAY_VERSION,
    capability: SR_REVIEWED_CLIMATE_PROFILE_CATALOG_OVERLAY_CAPABILITY,
    integrationContractVersion: SR_CATALOG_REVIEWED_CLIMATE_PROFILE_INTEGRATION_CONTRACT_VERSION,
    developerOnly: true,
    authoritative: false,
    productConsumer: false,
    runtimeEligibilityAuthority: false,
    scalarAuthority: false,
    runtimeRecommendationAuthority: false,
    GOSOutcomeAuthority: false,
    network: false,
    externalApi: false,
    persistence: false,
    filesystemWrite: false,
    automaticExecution: false,
    activation: 'explicit_developer_call_only',
    indexHtmlImport: false,
    runtimeImport: false,
    inputMutation: false
  });
}
