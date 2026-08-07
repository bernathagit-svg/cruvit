/**
 * Cruvit — Smart Recommendations developer Coordinate Climate Profile (CCP)
 * ---------------------------------------------------------------------------
 * Pure, developer-only, synthetic-only validation of Coordinate Climate
 * Profile object shape and trust/unknown rules.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Accepts already-built objects / synthetic fixtures only.
 *  - Does not import GOS, v1b, product runtime, overlay, or plant SCP.
 *  - Does not call live weather/API or invent meteorological truth.
 *  - Does not activate Smart Recommendations or Product Authority.
 */

export const SR_COORDINATE_CLIMATE_PROFILE_VERSION =
  '0.1.0-sr-coordinate-climate-profile';

export const SR_COORDINATE_CLIMATE_PROFILE_CONTRACT_VERSION =
  '0.1.0-sr-coordinate-climate-profile-contract';

export const SR_COORDINATE_CLIMATE_PROFILE_CAPABILITY =
  'explicit_developer_coordinate_climate_profile_validation';

export const SR_CCP_PROFILE_STATUSES = Object.freeze([
  'ready',
  'insufficient',
  'untrusted',
  'blocked'
]);

export const SR_CCP_LOCATION_SOURCES = Object.freeze([
  'user_confirmed_pin',
  'device_geolocation',
  'address_geocode',
  'manual_entry',
  'imported',
  'synthetic'
]);

export const SR_CCP_CONFIRMATION_STATUSES = Object.freeze([
  'unconfirmed',
  'user_confirmed',
  'stale',
  'rejected'
]);

export const SR_CCP_CONFIDENCE = Object.freeze([
  'none',
  'low',
  'medium',
  'high'
]);

export const SR_CCP_PRECISION_LEVELS = Object.freeze([
  'exact_point',
  'neighborhood',
  'city',
  'region',
  'country'
]);

export const SR_CCP_FIELD_KEYS = Object.freeze([
  'temperatureRange',
  'extremeHeat',
  'frostRisk',
  'minimumWinterTemperature',
  'rainfallDrySeason',
  'humidity',
  'seasonalityHemisphere',
  'hardinessZone'
]);

export const SR_CCP_SLOT_STATUSES = Object.freeze([
  'known',
  'estimated',
  'unknown',
  'conflicting',
  'not_applicable'
]);

export const SR_CCP_SOURCE_CLASSES = Object.freeze([
  'derived_normals',
  'regional_lookup',
  'user_asserted',
  'unavailable'
]);

export const SR_CCP_UNKNOWN_REASONS = Object.freeze([
  'no_normals_coverage',
  'precision_too_coarse',
  'source_unavailable',
  'untrusted_location',
  'hemisphere_policy_unresolved',
  'hardiness_system_unavailable'
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

const TRUSTED_CONFIRMATIONS = Object.freeze({ user_confirmed: true });
const TRUSTED_CONFIDENCE = Object.freeze({ medium: true, high: true });
const TRUSTED_PRECISION = Object.freeze({
  exact_point: true,
  neighborhood: true,
  city: true
});

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
    if (FORBIDDEN_LIVE_KEYS.indexOf(k) >= 0) {
      out.push(p);
    }
    const v = obj[k];
    if (v && typeof v === 'object') collectForbiddenKeys(v, p, out);
  }
}

function buildDescriptor() {
  return freezeDeep({
    profileVersion: SR_COORDINATE_CLIMATE_PROFILE_VERSION,
    contractVersion: SR_COORDINATE_CLIMATE_PROFILE_CONTRACT_VERSION,
    capability: SR_COORDINATE_CLIMATE_PROFILE_CAPABILITY,
    developerOnly: true,
    authoritative: false,
    productConsumer: false,
    runtimeEligibilityAuthority: false,
    network: false,
    automaticExecution: false,
    writesArtifacts: false,
    activation: 'explicit_call_only',
    liveWeather: false,
    gosConsumer: false,
    productAuthority: false,
    overlayAuthority: false,
    syntheticOnly: true,
    plantSuitabilityAuthority: false,
    horticulturalAuthority: false
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperCoordinateClimateProfileDescriptor() {
  return DESCRIPTOR;
}

function unknownSlot(reason) {
  return {
    status: 'unknown',
    value: null,
    unit: null,
    confidence: 'none',
    precisionApplicable: false,
    sourceClass: 'unavailable',
    unknownReason: reason
  };
}

function knownSlot(value, unit, confidence, sourceClass) {
  return {
    status: 'known',
    value: value,
    unit: unit,
    confidence: confidence,
    precisionApplicable: true,
    sourceClass: sourceClass,
    unknownReason: null
  };
}

function buildFieldsSparse(unknownReason) {
  const fields = {};
  for (let i = 0; i < SR_CCP_FIELD_KEYS.length; i++) {
    fields[SR_CCP_FIELD_KEYS[i]] = unknownSlot(unknownReason);
  }
  return fields;
}

function roundCoord(n) {
  return Math.round(Number(n) * 1e6) / 1e6;
}

function buildCoordinateFingerprint(parts) {
  return [
    'ccp',
    String(roundCoord(parts.latitude)),
    String(roundCoord(parts.longitude)),
    String(parts.precisionLevel || ''),
    String(parts.locationSource || ''),
    String(parts.confirmationStatus || '')
  ].join('|');
}

function buildSummaryFingerprint(report) {
  return [
    SR_COORDINATE_CLIMATE_PROFILE_VERSION,
    report.valid ? '1' : '0',
    report.trusted ? '1' : '0',
    String(report.profileStatus || ''),
    String(report.findings.length),
    String((report.normalized && report.normalized.coordinateFingerprint) || ''),
    stableSerialize(
      (report.findings || []).map(function (f) {
        return { code: f.code, path: f.path };
      })
    )
  ].join('|');
}

/**
 * Compute whether trust rules pass for a candidate profile input.
 */
export function evaluateCoordinateClimateProfileTrust(input) {
  const src = asObject(input) || {};
  const lat = src.latitude;
  const lon = src.longitude;
  const coordsValid =
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    isFinite(lat) &&
    isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180;
  const confirmationOk = TRUSTED_CONFIRMATIONS[src.confirmationStatus] === true;
  const confidenceOk = TRUSTED_CONFIDENCE[src.locationConfidence] === true;
  const precisionOk = TRUSTED_PRECISION[src.precisionLevel] === true;
  const trusted =
    coordsValid && confirmationOk && confidenceOk && precisionOk;
  return freezeDeep({
    coordsValid: coordsValid,
    confirmationOk: confirmationOk,
    confidenceOk: confidenceOk,
    precisionOk: precisionOk,
    trusted: trusted
  });
}

/**
 * Validate a Coordinate Climate Profile candidate.
 * @param {object} input
 * @returns {object} frozen report
 */
export function validateCoordinateClimateProfile(input) {
  const findings = [];
  const src = asObject(input);

  if (!src) {
    const empty = {
      valid: false,
      trusted: false,
      profileStatus: 'blocked',
      profileVersion: SR_COORDINATE_CLIMATE_PROFILE_VERSION,
      contractVersion: SR_COORDINATE_CLIMATE_PROFILE_CONTRACT_VERSION,
      capability: SR_COORDINATE_CLIMATE_PROFILE_CAPABILITY,
      developerOnly: true,
      syntheticOnly: false,
      normalized: null,
      findings: [
        {
          code: 'invalid_input',
          severity: 'error',
          detail: 'object_required',
          path: ''
        }
      ],
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

  const contractVersion = isNonEmptyString(src.contractVersion)
    ? String(src.contractVersion).trim()
    : '';
  if (contractVersion !== SR_COORDINATE_CLIMATE_PROFILE_CONTRACT_VERSION) {
    pushFinding(
      findings,
      'unsupported_contract_version',
      'error',
      contractVersion || 'missing',
      'contractVersion'
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

  const lat = src.latitude;
  const lon = src.longitude;
  const coordsValid =
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    isFinite(lat) &&
    isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180;
  if (typeof lat !== 'number' || !isFinite(lat) || lat < -90 || lat > 90) {
    pushFinding(
      findings,
      'invalid_latitude',
      'error',
      String(lat),
      'latitude'
    );
  }
  if (typeof lon !== 'number' || !isFinite(lon) || lon < -180 || lon > 180) {
    pushFinding(
      findings,
      'invalid_longitude',
      'error',
      lon == null ? 'missing' : String(lon),
      'longitude'
    );
  }

  const locationSource = isNonEmptyString(src.locationSource)
    ? String(src.locationSource).trim()
    : '';
  if (!inVocab(locationSource, SR_CCP_LOCATION_SOURCES)) {
    pushFinding(
      findings,
      'invalid_location_source',
      'error',
      locationSource || 'missing',
      'locationSource'
    );
  }

  const confirmationStatus = isNonEmptyString(src.confirmationStatus)
    ? String(src.confirmationStatus).trim()
    : '';
  if (!inVocab(confirmationStatus, SR_CCP_CONFIRMATION_STATUSES)) {
    pushFinding(
      findings,
      'invalid_confirmation_status',
      'error',
      confirmationStatus || 'missing',
      'confirmationStatus'
    );
  }

  const locationConfidence = isNonEmptyString(src.locationConfidence)
    ? String(src.locationConfidence).trim()
    : '';
  if (!inVocab(locationConfidence, SR_CCP_CONFIDENCE)) {
    pushFinding(
      findings,
      'invalid_location_confidence',
      'error',
      locationConfidence || 'missing',
      'locationConfidence'
    );
  }

  const precisionLevel = isNonEmptyString(src.precisionLevel)
    ? String(src.precisionLevel).trim()
    : '';
  if (!inVocab(precisionLevel, SR_CCP_PRECISION_LEVELS)) {
    pushFinding(
      findings,
      'invalid_precision_level',
      'error',
      precisionLevel || 'missing',
      'precisionLevel'
    );
  }

  const trustEval = evaluateCoordinateClimateProfileTrust({
    latitude: lat,
    longitude: lon,
    confirmationStatus: confirmationStatus,
    locationConfidence: locationConfidence,
    precisionLevel: precisionLevel
  });

  if (src.trusted === true && !trustEval.trusted) {
    pushFinding(
      findings,
      'trusted_true_without_trust_rules',
      'error',
      'trusted_claim_rejected',
      'trusted'
    );
  }

  const fieldsIn = asObject(src.fields);
  if (!fieldsIn) {
    pushFinding(findings, 'missing_fields', 'error', 'fields_required', 'fields');
  } else {
    for (let i = 0; i < SR_CCP_FIELD_KEYS.length; i++) {
      const key = SR_CCP_FIELD_KEYS[i];
      const slot = asObject(fieldsIn[key]);
      const path = 'fields.' + key;
      if (!slot) {
        pushFinding(findings, 'missing_climate_slot', 'error', 'slot_required', path);
        continue;
      }
      const status = isNonEmptyString(slot.status)
        ? String(slot.status).trim()
        : '';
      if (!inVocab(status, SR_CCP_SLOT_STATUSES)) {
        pushFinding(
          findings,
          'invalid_slot_status',
          'error',
          status || 'missing',
          path + '.status'
        );
      }
      const confidence = isNonEmptyString(slot.confidence)
        ? String(slot.confidence).trim()
        : '';
      if (!inVocab(confidence, SR_CCP_CONFIDENCE)) {
        pushFinding(
          findings,
          'invalid_slot_confidence',
          'error',
          confidence || 'missing',
          path + '.confidence'
        );
      }
      const sourceClass = isNonEmptyString(slot.sourceClass)
        ? String(slot.sourceClass).trim()
        : '';
      if (!inVocab(sourceClass, SR_CCP_SOURCE_CLASSES)) {
        pushFinding(
          findings,
          'invalid_source_class',
          'error',
          sourceClass || 'missing',
          path + '.sourceClass'
        );
      }
      if (
        (status === 'unknown' || status === 'not_applicable') &&
        slot.value !== null
      ) {
        pushFinding(
          findings,
          'non_null_value_for_unknown_or_na',
          'error',
          String(slot.value),
          path + '.value'
        );
      }
      if (status === 'known' && slot.value === null) {
        pushFinding(
          findings,
          'known_slot_null_value',
          'error',
          'value_required',
          path + '.value'
        );
      }
      if (status === 'unknown') {
        const reason = isNonEmptyString(slot.unknownReason)
          ? String(slot.unknownReason).trim()
          : '';
        if (!reason) {
          pushFinding(
            findings,
            'unknown_reason_required',
            'error',
            'missing',
            path + '.unknownReason'
          );
        } else if (!inVocab(reason, SR_CCP_UNKNOWN_REASONS)) {
          pushFinding(
            findings,
            'invalid_unknown_reason',
            'error',
            reason,
            path + '.unknownReason'
          );
        }
      }
      // Untrusted / non-trustworthy coords must not claim known derived_normals.
      if (
        !trustEval.trusted &&
        status === 'known' &&
        sourceClass === 'derived_normals'
      ) {
        pushFinding(
          findings,
          'untrusted_known_derived_normals',
          'error',
          key,
          path
        );
      }
    }
  }

  let profileStatus = isNonEmptyString(src.profileStatus)
    ? String(src.profileStatus).trim()
    : '';
  if (profileStatus && !inVocab(profileStatus, SR_CCP_PROFILE_STATUSES)) {
    pushFinding(
      findings,
      'invalid_profile_status',
      'error',
      profileStatus,
      'profileStatus'
    );
  }

  // Derive expected profileStatus when structural coords/trust known.
  let derivedStatus = 'insufficient';
  if (!coordsValid) {
    derivedStatus = 'blocked';
  } else if (!trustEval.trusted) {
    derivedStatus = 'untrusted';
  } else {
    derivedStatus = 'ready';
  }

  if (!profileStatus) {
    profileStatus = derivedStatus;
  } else if (
    coordsValid &&
    trustEval.trusted &&
    profileStatus === 'untrusted'
  ) {
    pushFinding(
      findings,
      'profile_status_trust_mismatch',
      'error',
      profileStatus,
      'profileStatus'
    );
  } else if (
    coordsValid &&
    !trustEval.trusted &&
    profileStatus === 'ready' &&
    src.trusted === true
  ) {
    pushFinding(
      findings,
      'profile_status_trust_mismatch',
      'error',
      profileStatus,
      'profileStatus'
    );
  }

  const climateConfidence = isNonEmptyString(src.climateConfidence)
    ? String(src.climateConfidence).trim()
    : 'none';
  if (!inVocab(climateConfidence, SR_CCP_CONFIDENCE)) {
    pushFinding(
      findings,
      'invalid_climate_confidence',
      'error',
      climateConfidence,
      'climateConfidence'
    );
  }

  const valid = !findings.some(function (f) {
    return f.severity === 'error';
  });

  // Trusted only when trust rules pass, caller did not force false, and report is valid.
  const trustedFinal =
    valid && trustEval.trusted && src.trusted !== false;

  let statusFinal;
  if (!coordsValid) {
    statusFinal = 'blocked';
  } else if (!valid) {
    statusFinal = inVocab(profileStatus, SR_CCP_PROFILE_STATUSES)
      ? profileStatus
      : 'insufficient';
  } else if (!trustedFinal) {
    statusFinal =
      profileStatus === 'insufficient' ? 'insufficient' : 'untrusted';
  } else {
    statusFinal = 'ready';
  }

  const fingerprint = coordsValid
    ? buildCoordinateFingerprint({
        latitude: lat,
        longitude: lon,
        precisionLevel: precisionLevel,
        locationSource: locationSource,
        confirmationStatus: confirmationStatus
      })
    : '';

  const normalized = valid
    ? {
        contractVersion: SR_COORDINATE_CLIMATE_PROFILE_CONTRACT_VERSION,
        profileStatus: statusFinal,
        trusted: trustedFinal,
        coordinateFingerprint: fingerprint,
        ccpId: isNonEmptyString(src.ccpId)
          ? String(src.ccpId).trim()
          : fingerprint,
        latitude: lat,
        longitude: lon,
        locationSource: locationSource,
        confirmationStatus: confirmationStatus,
        locationConfidence: locationConfidence,
        precisionLevel: precisionLevel,
        country: src.country == null ? null : src.country,
        subdivision: src.subdivision == null ? null : src.subdivision,
        elevation: src.elevation == null ? null : src.elevation,
        timezone: src.timezone == null ? null : src.timezone,
        climateConfidence: climateConfidence,
        fields: fieldsIn,
        syntheticOnly: true,
        provenance: asObject(src.provenance) || { synthetic: true }
      }
    : null;

  const report = {
    valid: valid,
    trusted: valid ? trustedFinal : false,
    profileStatus: statusFinal,
    profileVersion: SR_COORDINATE_CLIMATE_PROFILE_VERSION,
    contractVersion: SR_COORDINATE_CLIMATE_PROFILE_CONTRACT_VERSION,
    capability: SR_COORDINATE_CLIMATE_PROFILE_CAPABILITY,
    developerOnly: true,
    syntheticOnly: src.syntheticOnly === true,
    normalized: normalized,
    findings: findings,
    summaryFingerprint: ''
  };
  report.summaryFingerprint = buildSummaryFingerprint(report);
  return freezeDeep(report);
}

/** Embedded synthetic fixtures for harness / Node proof. */
export function getSmartRecDeveloperCoordinateClimateProfileSyntheticFixtures() {
  const fixtureA = {
    contractVersion: SR_COORDINATE_CLIMATE_PROFILE_CONTRACT_VERSION,
    profileStatus: 'ready',
    trusted: true,
    latitude: 45.5017,
    longitude: -73.5673,
    locationSource: 'user_confirmed_pin',
    confirmationStatus: 'user_confirmed',
    locationConfidence: 'high',
    precisionLevel: 'city',
    climateConfidence: 'none',
    fields: (function () {
      const f = buildFieldsSparse('no_normals_coverage');
      f.seasonalityHemisphere = knownSlot(
        'northern',
        'hemisphere',
        'high',
        'regional_lookup'
      );
      return f;
    })(),
    syntheticOnly: true,
    provenance: { synthetic: true, fixtureId: 'A_trusted_ready_sparse' }
  };

  const fixtureB = {
    contractVersion: SR_COORDINATE_CLIMATE_PROFILE_CONTRACT_VERSION,
    profileStatus: 'untrusted',
    trusted: false,
    latitude: 45.5017,
    longitude: -73.5673,
    locationSource: 'device_geolocation',
    confirmationStatus: 'unconfirmed',
    locationConfidence: 'low',
    precisionLevel: 'exact_point',
    climateConfidence: 'none',
    fields: buildFieldsSparse('untrusted_location'),
    syntheticOnly: true,
    provenance: { synthetic: true, fixtureId: 'B_untrusted_coordinates' }
  };

  const fixtureC = {
    contractVersion: SR_COORDINATE_CLIMATE_PROFILE_CONTRACT_VERSION,
    profileStatus: 'blocked',
    trusted: false,
    latitude: 120,
    longitude: -73.5673,
    locationSource: 'synthetic',
    confirmationStatus: 'unconfirmed',
    locationConfidence: 'none',
    precisionLevel: 'city',
    climateConfidence: 'none',
    fields: buildFieldsSparse('source_unavailable'),
    syntheticOnly: true,
    provenance: { synthetic: true, fixtureId: 'C_invalid_latitude' }
  };

  return freezeDeep({
    A: fixtureA,
    B: fixtureB,
    C: fixtureC
  });
}
