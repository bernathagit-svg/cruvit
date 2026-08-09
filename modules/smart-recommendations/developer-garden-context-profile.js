/**
 * Cruvit — Smart Recommendations developer Garden Context Profile
 * ---------------------------------------------------------------------------
 * Pure, developer-only, synthetic-only validation of Garden / Microclimate
 * Context Profile object shape and trust/unknown rules.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Accepts already-built objects / synthetic fixtures only.
 *  - Does not import GOS, v1b, product runtime, overlay, CCP, or plant SCP.
 *  - Does not call live weather/API or invent meteorological truth.
 *  - Does not activate Smart Recommendations or Product Authority.
 *  - Does not grant plant suitability or override hard CCP climate blocks.
 */

export const SR_GARDEN_CONTEXT_PROFILE_VERSION =
  '0.1.0-sr-garden-context-profile';

export const SR_GARDEN_CONTEXT_PROFILE_CAPABILITY =
  'explicit_developer_garden_context_profile_validation';

export const SR_GCP_PROFILE_STATUSES = Object.freeze([
  'ready',
  'partial',
  'insufficient',
  'untrusted',
  'blocked'
]);

export const SR_GCP_SCOPES = Object.freeze(['wholeGarden', 'zone']);

export const SR_GCP_SOURCES = Object.freeze([
  'user_input',
  'device_photo',
  'inferred_from_photo',
  'owner_review',
  'default_unknown'
]);

export const SR_GCP_CONFIRMATION_STATUSES = Object.freeze([
  'unconfirmed',
  'user_confirmed',
  'owner_reviewed'
]);

export const SR_GCP_CONFIDENCE = Object.freeze([
  'none',
  'low',
  'medium',
  'high'
]);

export const SR_GCP_PRECISION_LEVELS = Object.freeze([
  'whole_garden',
  'zone',
  'exact_spot',
  'container'
]);

export const SR_GCP_PLANTING_MODES = Object.freeze([
  'ground',
  'raised_bed',
  'container',
  'balcony',
  'indoor',
  'unknown'
]);

export const SR_GCP_SUN_EXPOSURES = Object.freeze([
  'full_sun',
  'part_sun',
  'part_shade',
  'full_shade',
  'unknown'
]);

export const SR_GCP_DRAINAGE = Object.freeze([
  'well_drained',
  'moderate',
  'poor',
  'unknown'
]);

export const SR_GCP_IRRIGATION_TYPES = Object.freeze([
  'none',
  'manual',
  'drip',
  'sprinkler',
  'automatic',
  'unknown'
]);

export const SR_GCP_IRRIGATION_RELIABILITY = Object.freeze([
  'none',
  'low',
  'medium',
  'high',
  'unknown'
]);

const FORBIDDEN_LIVE_KEYS = Object.freeze([
  'apiKey',
  'weatherApiKey',
  'providerPayload',
  'liveWeather',
  'forecast',
  'networkUrl',
  'fetchUrl',
  'authorization',
  'secret',
  'token',
  'bearerToken',
  'providerResponse'
]);

const PHOTO_SOURCES = Object.freeze({
  device_photo: true,
  inferred_from_photo: true
});

const TRUSTED_CONFIRMATIONS = Object.freeze({
  user_confirmed: true,
  owner_reviewed: true
});

const TRUSTED_CONFIDENCE = Object.freeze({
  medium: true,
  high: true
});

const CONTEXT_FIELDS_NEEDING_UNKNOWN_REASON = Object.freeze([
  'sunExposure',
  'drainage',
  'irrigationType',
  'irrigationReliability',
  'plantingMode'
]);

function freezeDeep(value, seen) {
  if (value === null || typeof value !== 'object') return value;
  seen = seen || new WeakSet();
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) freezeDeep(value[i], seen);
  } else {
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) freezeDeep(value[keys[i]], seen);
  }
  return Object.freeze(value);
}

function asObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function inVocab(v, list) {
  return typeof v === 'string' && list.indexOf(v) >= 0;
}

function stableSerialize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableSerialize).join(',') + ']';
  }
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

function pushFinding(findings, code, severity, detail, path) {
  findings.push({
    code: code,
    severity: severity || 'error',
    detail: detail || '',
    path: path || ''
  });
}

function collectForbiddenKeys(obj, path, out) {
  if (!obj || typeof obj !== 'object') return;
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const p = path ? path + '.' + k : k;
    if (FORBIDDEN_LIVE_KEYS.indexOf(k) >= 0) out.push(p);
    const v = obj[k];
    if (v && typeof v === 'object') collectForbiddenKeys(v, p, out);
  }
}

function hasUnknownReason(unknownReasons, field) {
  if (!unknownReasons) return false;
  const v = unknownReasons[field];
  return isNonEmptyString(v);
}

function buildDescriptor() {
  return freezeDeep({
    profileVersion: SR_GARDEN_CONTEXT_PROFILE_VERSION,
    capability: SR_GARDEN_CONTEXT_PROFILE_CAPABILITY,
    developerOnly: true,
    syntheticOnly: true,
    authoritative: false,
    productAuthority: false,
    runtimeEligibilityAuthority: false,
    recommendationAuthority: false,
    overlayAuthority: false,
    liveWeather: false,
    gosConsumer: false,
    network: false,
    automaticExecution: false,
    writesArtifacts: false,
    activation: 'explicit_call_only',
    productConsumer: false,
    plantSuitabilityAuthority: false,
    doesNotOverrideHardCcpClimateBlocks: true,
    doesNotGrantPlantSuitabilityAlone: true
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperGardenContextProfileDescriptor() {
  return DESCRIPTOR;
}

function buildSummaryFingerprint(report) {
  return [
    SR_GARDEN_CONTEXT_PROFILE_VERSION,
    report.valid ? '1' : '0',
    report.trusted ? '1' : '0',
    String(report.profileStatus || ''),
    String((report.findings && report.findings.length) || 0),
    String((report.normalized && report.normalized.contextId) || ''),
    stableSerialize(
      (report.findings || []).map(function (f) {
        return { code: f.code, path: f.path };
      })
    )
  ].join('|');
}

function evaluateTrust(parts) {
  const confirmationOk =
    TRUSTED_CONFIRMATIONS[parts.confirmationStatus] === true;
  const sourceTrusted = parts.source !== 'default_unknown';
  const confidenceOk = TRUSTED_CONFIDENCE[parts.confidence] === true;
  const photoSource = PHOTO_SOURCES[parts.source] === true;
  // Photo-inferred may be trusted only when confirmed/reviewed and confidence ok
  // (photo sources normally require low unless confirmed — checked separately).
  const trusted =
    confirmationOk &&
    sourceTrusted &&
    confidenceOk &&
    !(photoSource && !confirmationOk);
  return {
    confirmationOk: confirmationOk,
    sourceTrusted: sourceTrusted,
    confidenceOk: confidenceOk,
    photoSource: photoSource,
    trusted: trusted
  };
}

function countKnownContext(fields) {
  let known = 0;
  let unknown = 0;
  const keys = [
    'sunExposure',
    'drainage',
    'irrigationType',
    'irrigationReliability',
    'plantingMode'
  ];
  for (let i = 0; i < keys.length; i++) {
    const v = fields[keys[i]];
    if (v === 'unknown') unknown++;
    else if (isNonEmptyString(v)) known++;
  }
  return { known: known, unknown: unknown };
}

/**
 * Validate a Garden / Microclimate Context Profile candidate.
 * @param {object|null} input
 * @returns {object} frozen report
 */
export function validateGardenContextProfile(input) {
  const findings = [];
  const src = asObject(input);

  if (!src) {
    const empty = {
      valid: false,
      trusted: false,
      profileStatus: 'blocked',
      profileVersion: SR_GARDEN_CONTEXT_PROFILE_VERSION,
      capability: SR_GARDEN_CONTEXT_PROFILE_CAPABILITY,
      developerOnly: true,
      syntheticOnly: false,
      activation: 'explicit_call_only',
      normalized: null,
      findings: [
        {
          code: 'invalid_input',
          severity: 'error',
          detail: 'object_required',
          path: ''
        }
      ],
      notAuthority: {
        productAuthority: false,
        runtimeEligibilityAuthority: false,
        recommendationAuthority: false,
        overlayAuthority: false,
        liveWeather: false,
        gosConsumer: false,
        plantSuitabilityAuthority: false
      },
      doesNotOverrideHardCcpClimateBlocks: true,
      doesNotGrantPlantSuitabilityAlone: true,
      summaryFingerprint: ''
    };
    empty.summaryFingerprint = buildSummaryFingerprint(empty);
    return freezeDeep(empty);
  }

  const forbidden = [];
  collectForbiddenKeys(src, '', forbidden);
  if (forbidden.length) {
    pushFinding(
      findings,
      'forbidden_live_or_provider_keys',
      'error',
      forbidden.sort().join(','),
      forbidden[0]
    );
  }

  if (src.syntheticOnly !== true) {
    pushFinding(
      findings,
      'synthetic_only_required',
      'error',
      'syntheticOnly_must_be_true',
      'syntheticOnly'
    );
  }

  const contextId = isNonEmptyString(src.contextId)
    ? String(src.contextId).trim()
    : '';
  if (!contextId) {
    pushFinding(findings, 'missing_context_id', 'error', 'required', 'contextId');
  }

  const userGardenId = isNonEmptyString(src.userGardenId)
    ? String(src.userGardenId).trim()
    : '';
  if (!userGardenId) {
    pushFinding(
      findings,
      'missing_user_garden_id',
      'error',
      'required',
      'userGardenId'
    );
  }

  const scope = isNonEmptyString(src.scope) ? String(src.scope).trim() : '';
  if (!inVocab(scope, SR_GCP_SCOPES)) {
    pushFinding(
      findings,
      'invalid_scope',
      'error',
      scope || 'missing',
      'scope'
    );
  }

  const source = isNonEmptyString(src.source) ? String(src.source).trim() : '';
  if (!inVocab(source, SR_GCP_SOURCES)) {
    pushFinding(
      findings,
      'invalid_source',
      'error',
      source || 'missing',
      'source'
    );
  }

  const confirmationStatus = isNonEmptyString(src.confirmationStatus)
    ? String(src.confirmationStatus).trim()
    : '';
  if (!inVocab(confirmationStatus, SR_GCP_CONFIRMATION_STATUSES)) {
    pushFinding(
      findings,
      'invalid_confirmation_status',
      'error',
      confirmationStatus || 'missing',
      'confirmationStatus'
    );
  }

  const confidence = isNonEmptyString(src.confidence)
    ? String(src.confidence).trim()
    : '';
  if (!inVocab(confidence, SR_GCP_CONFIDENCE)) {
    pushFinding(
      findings,
      'invalid_confidence',
      'error',
      confidence || 'missing',
      'confidence'
    );
  }

  const precisionLevel = isNonEmptyString(src.precisionLevel)
    ? String(src.precisionLevel).trim()
    : '';
  if (!inVocab(precisionLevel, SR_GCP_PRECISION_LEVELS)) {
    pushFinding(
      findings,
      'invalid_precision_level',
      'error',
      precisionLevel || 'missing',
      'precisionLevel'
    );
  }

  const plantingMode = isNonEmptyString(src.plantingMode)
    ? String(src.plantingMode).trim()
    : '';
  if (!inVocab(plantingMode, SR_GCP_PLANTING_MODES)) {
    pushFinding(
      findings,
      'invalid_planting_mode',
      'error',
      plantingMode || 'missing',
      'plantingMode'
    );
  }

  const sunExposure = isNonEmptyString(src.sunExposure)
    ? String(src.sunExposure).trim()
    : '';
  if (!inVocab(sunExposure, SR_GCP_SUN_EXPOSURES)) {
    pushFinding(
      findings,
      'invalid_sun_exposure',
      'error',
      sunExposure || 'missing',
      'sunExposure'
    );
  }

  const drainage = isNonEmptyString(src.drainage)
    ? String(src.drainage).trim()
    : '';
  if (!inVocab(drainage, SR_GCP_DRAINAGE)) {
    pushFinding(
      findings,
      'invalid_drainage',
      'error',
      drainage || 'missing',
      'drainage'
    );
  }

  const irrigationType = isNonEmptyString(src.irrigationType)
    ? String(src.irrigationType).trim()
    : '';
  if (!inVocab(irrigationType, SR_GCP_IRRIGATION_TYPES)) {
    pushFinding(
      findings,
      'invalid_irrigation_type',
      'error',
      irrigationType || 'missing',
      'irrigationType'
    );
  }

  const irrigationReliability = isNonEmptyString(src.irrigationReliability)
    ? String(src.irrigationReliability).trim()
    : '';
  if (!inVocab(irrigationReliability, SR_GCP_IRRIGATION_RELIABILITY)) {
    pushFinding(
      findings,
      'invalid_irrigation_reliability',
      'error',
      irrigationReliability || 'missing',
      'irrigationReliability'
    );
  }

  const unknownReasons = asObject(src.unknownReasons);
  if (!unknownReasons) {
    pushFinding(
      findings,
      'missing_unknown_reasons',
      'error',
      'object_required',
      'unknownReasons'
    );
  }

  // Unknown values require unknownReasons entries.
  const fieldValues = {
    sunExposure: sunExposure,
    drainage: drainage,
    irrigationType: irrigationType,
    irrigationReliability: irrigationReliability,
    plantingMode: plantingMode
  };
  for (let i = 0; i < CONTEXT_FIELDS_NEEDING_UNKNOWN_REASON.length; i++) {
    const key = CONTEXT_FIELDS_NEEDING_UNKNOWN_REASON[i];
    if (fieldValues[key] === 'unknown' && !hasUnknownReason(unknownReasons, key)) {
      pushFinding(
        findings,
        'unknown_reason_required',
        'error',
        key + '_unknown_requires_reason',
        'unknownReasons.' + key
      );
    }
  }

  // Container requires containerSize or unknownReason.
  if (plantingMode === 'container') {
    const hasSize =
      src.containerSize != null &&
      (typeof src.containerSize === 'number'
        ? isFinite(src.containerSize)
        : isNonEmptyString(src.containerSize));
    const hasSizeReason = hasUnknownReason(unknownReasons, 'containerSize');
    if (!hasSize && !hasSizeReason) {
      pushFinding(
        findings,
        'container_size_or_unknown_reason_required',
        'error',
        'container_requires_containerSize_or_unknownReason',
        'containerSize'
      );
    }
  }

  // Photo-inferred values require low confidence unless confirmed/reviewed.
  if (PHOTO_SOURCES[source] === true) {
    const confirmed = TRUSTED_CONFIRMATIONS[confirmationStatus] === true;
    if (!confirmed && confidence !== 'low' && confidence !== 'none') {
      pushFinding(
        findings,
        'photo_inferred_requires_low_confidence',
        'error',
        'photo_source_without_confirmation_must_be_low_or_none',
        'confidence'
      );
    }
  }

  // Claimed ready without enough confirmed context / trust is contradictory.
  let claimedStatus = isNonEmptyString(src.profileStatus)
    ? String(src.profileStatus).trim()
    : '';
  if (claimedStatus && !inVocab(claimedStatus, SR_GCP_PROFILE_STATUSES)) {
    pushFinding(
      findings,
      'invalid_profile_status',
      'error',
      claimedStatus,
      'profileStatus'
    );
    claimedStatus = '';
  }

  const trustEval = evaluateTrust({
    confirmationStatus: confirmationStatus,
    source: source,
    confidence: confidence
  });

  // Unconfirmed / default_unknown cannot be trusted recommendation context.
  if (src.trusted === true && !trustEval.trusted) {
    pushFinding(
      findings,
      'trusted_true_without_trust_rules',
      'error',
      'trusted_claim_rejected',
      'trusted'
    );
  }

  const counts = countKnownContext(fieldValues);
  const keyIdsPresent = !!contextId && !!userGardenId && !!scope;
  const coreEnumsOk =
    inVocab(source, SR_GCP_SOURCES) &&
    inVocab(confirmationStatus, SR_GCP_CONFIRMATION_STATUSES) &&
    inVocab(confidence, SR_GCP_CONFIDENCE) &&
    inVocab(precisionLevel, SR_GCP_PRECISION_LEVELS) &&
    inVocab(plantingMode, SR_GCP_PLANTING_MODES) &&
    inVocab(sunExposure, SR_GCP_SUN_EXPOSURES) &&
    inVocab(drainage, SR_GCP_DRAINAGE) &&
    inVocab(irrigationType, SR_GCP_IRRIGATION_TYPES) &&
    inVocab(irrigationReliability, SR_GCP_IRRIGATION_RELIABILITY);

  const hasContainerDefect = findings.some(function (f) {
    return f.code === 'container_size_or_unknown_reason_required';
  });
  const hasForbidden = findings.some(function (f) {
    return f.code === 'forbidden_live_or_provider_keys';
  });
  const hasMalformedEnum = findings.some(function (f) {
    return (
      String(f.code).indexOf('invalid_') === 0 ||
      f.code === 'missing_unknown_reasons' ||
      f.code === 'synthetic_only_required'
    );
  });

  // Derive expected status.
  let derivedStatus = 'insufficient';
  if (hasForbidden || hasMalformedEnum) {
    derivedStatus = 'blocked';
  } else if (hasContainerDefect || !keyIdsPresent) {
    derivedStatus = 'insufficient';
  } else if (!trustEval.trusted) {
    derivedStatus = 'untrusted';
  } else if (counts.known === 0) {
    derivedStatus = 'insufficient';
  } else if (counts.unknown > 0) {
    derivedStatus = 'partial';
  } else if (
    trustEval.trusted &&
    counts.known >= 5 &&
    sunExposure !== 'unknown' &&
    drainage !== 'unknown' &&
    irrigationType !== 'unknown' &&
    irrigationReliability !== 'unknown' &&
    plantingMode !== 'unknown'
  ) {
    derivedStatus = 'ready';
  } else {
    derivedStatus = 'partial';
  }

  if (
    claimedStatus === 'ready' &&
    (derivedStatus !== 'ready' || !trustEval.trusted)
  ) {
    pushFinding(
      findings,
      'profile_status_ready_without_confirmed_context',
      'error',
      'ready_requires_enough_confirmed_context',
      'profileStatus'
    );
  }

  const valid = !findings.some(function (f) {
    return f.severity === 'error';
  });

  let statusFinal;
  if (!valid) {
    if (hasForbidden || hasMalformedEnum) {
      statusFinal = 'blocked';
    } else if (hasContainerDefect) {
      statusFinal = 'insufficient';
    } else if (claimedStatus && inVocab(claimedStatus, SR_GCP_PROFILE_STATUSES)) {
      statusFinal = claimedStatus;
    } else {
      statusFinal = derivedStatus === 'ready' ? 'insufficient' : derivedStatus;
    }
  } else if (!trustEval.trusted) {
    statusFinal = 'untrusted';
  } else {
    statusFinal = derivedStatus;
  }

  // Prefer claimed status when valid and consistent.
  if (
    valid &&
    claimedStatus &&
    claimedStatus === derivedStatus
  ) {
    statusFinal = claimedStatus;
  }

  const trustedFinal = valid && trustEval.trusted && src.trusted !== false;

  const normalized = valid
    ? {
        contextId: contextId,
        userGardenId: userGardenId,
        scope: scope,
        source: source,
        confirmationStatus: confirmationStatus,
        confidence: confidence,
        precisionLevel: precisionLevel,
        plantingMode: plantingMode,
        sunExposure: sunExposure,
        drainage: drainage,
        irrigationType: irrigationType,
        irrigationReliability: irrigationReliability,
        containerSize:
          src.containerSize == null ? null : src.containerSize,
        unknownReasons: unknownReasons || {},
        profileStatus: statusFinal,
        trusted: trustedFinal,
        syntheticOnly: true,
        doesNotOverrideHardCcpClimateBlocks: true,
        doesNotGrantPlantSuitabilityAlone: true
      }
    : null;

  const report = {
    valid: valid,
    trusted: valid ? trustedFinal : false,
    profileStatus: statusFinal,
    profileVersion: SR_GARDEN_CONTEXT_PROFILE_VERSION,
    capability: SR_GARDEN_CONTEXT_PROFILE_CAPABILITY,
    developerOnly: true,
    syntheticOnly: src.syntheticOnly === true,
    activation: 'explicit_call_only',
    normalized: normalized,
    findings: findings,
    notAuthority: {
      productAuthority: false,
      runtimeEligibilityAuthority: false,
      recommendationAuthority: false,
      overlayAuthority: false,
      liveWeather: false,
      gosConsumer: false,
      plantSuitabilityAuthority: false
    },
    doesNotOverrideHardCcpClimateBlocks: true,
    doesNotGrantPlantSuitabilityAlone: true,
    summaryFingerprint: ''
  };
  report.summaryFingerprint = buildSummaryFingerprint(report);
  return freezeDeep(report);
}

/** Embedded synthetic fixtures for harness / Node proof. */
export function getSmartRecDeveloperGardenContextProfileSyntheticFixtures() {
  const fixtureA = {
    contextId: 'gcp-synthetic-exact-spot-a',
    userGardenId: 'garden-synthetic-001',
    scope: 'zone',
    source: 'user_input',
    confirmationStatus: 'user_confirmed',
    confidence: 'high',
    precisionLevel: 'exact_spot',
    plantingMode: 'ground',
    sunExposure: 'full_sun',
    drainage: 'well_drained',
    irrigationType: 'drip',
    irrigationReliability: 'high',
    unknownReasons: {},
    profileStatus: 'ready',
    trusted: true,
    syntheticOnly: true,
    provenance: { synthetic: true, fixtureId: 'A_confirmed_ready_exact_spot' }
  };

  const fixtureB = {
    contextId: 'gcp-synthetic-default-unknown-b',
    userGardenId: 'garden-synthetic-001',
    scope: 'wholeGarden',
    source: 'default_unknown',
    confirmationStatus: 'unconfirmed',
    confidence: 'none',
    precisionLevel: 'whole_garden',
    plantingMode: 'unknown',
    sunExposure: 'unknown',
    drainage: 'unknown',
    irrigationType: 'unknown',
    irrigationReliability: 'unknown',
    unknownReasons: {
      plantingMode: 'default_unknown_context',
      sunExposure: 'default_unknown_context',
      drainage: 'default_unknown_context',
      irrigationType: 'default_unknown_context',
      irrigationReliability: 'default_unknown_context'
    },
    profileStatus: 'untrusted',
    trusted: false,
    syntheticOnly: true,
    provenance: { synthetic: true, fixtureId: 'B_unconfirmed_default_unknown' }
  };

  const fixtureC = {
    contextId: 'gcp-synthetic-container-missing-size-c',
    userGardenId: 'garden-synthetic-001',
    scope: 'zone',
    source: 'user_input',
    confirmationStatus: 'user_confirmed',
    confidence: 'medium',
    precisionLevel: 'container',
    plantingMode: 'container',
    sunExposure: 'full_sun',
    drainage: 'moderate',
    irrigationType: 'manual',
    irrigationReliability: 'medium',
    // Missing containerSize and no unknownReasons.containerSize
    unknownReasons: {},
    profileStatus: 'insufficient',
    trusted: true,
    syntheticOnly: true,
    provenance: {
      synthetic: true,
      fixtureId: 'C_container_missing_size_no_reason'
    }
  };

  const fixtureD = {
    contextId: 'gcp-synthetic-partial-d',
    userGardenId: 'garden-synthetic-001',
    scope: 'zone',
    source: 'user_input',
    confirmationStatus: 'user_confirmed',
    confidence: 'medium',
    precisionLevel: 'zone',
    plantingMode: 'ground',
    sunExposure: 'part_sun',
    drainage: 'unknown',
    irrigationType: 'unknown',
    irrigationReliability: 'unknown',
    unknownReasons: {
      drainage: 'not_observed_by_user',
      irrigationType: 'user_not_provided',
      irrigationReliability: 'user_not_provided'
    },
    profileStatus: 'partial',
    trusted: true,
    syntheticOnly: true,
    provenance: {
      synthetic: true,
      fixtureId: 'D_partial_sun_known_water_unknown'
    }
  };

  // Fixture E is exercised as null input in the harness (malformed / null).
  const fixtureE = null;

  return freezeDeep({
    A: fixtureA,
    B: fixtureB,
    C: fixtureC,
    D: fixtureD,
    E: fixtureE
  });
}
