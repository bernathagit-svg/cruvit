/**
 * Cruvit — Smart Recommendations developer Plant↔CCP comparison
 * ---------------------------------------------------------------------------
 * Pure, developer-only, synthetic-only comparison of plant SCP-like inputs
 * against Coordinate Climate Profile validation reports.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Accepts already-built synthetic plant refs + CCP reports only.
 *  - Does not import GOS, v1b, product runtime, overlay, or live weather.
 *  - Does not activate Smart Recommendations or Product Authority.
 *  - Does not recommend plants or grant eligibility.
 *  - Current sun/water vs ambient CCP mostly returns not_comparable.
 */

export const SR_PLANT_CCP_COMPARISON_VERSION = '0.1.0-sr-plant-ccp-comparison';

export const SR_PLANT_CCP_COMPARISON_CAPABILITY =
  'explicit_developer_plant_ccp_comparison';

export const SR_PLANT_CCP_COMPARISON_STATUSES = Object.freeze([
  'not_run',
  'insufficient',
  'untrusted',
  'partial',
  'comparable',
  'blocked'
]);

export const SR_PLANT_CCP_COMPARISON_RESULTS = Object.freeze([
  'not_comparable',
  'insufficient_data',
  'preference_mismatch_warning',
  'soft_fit',
  'hard_block',
  'unknown'
]);

export const SR_PLANT_CCP_COMPARISON_CONFIDENCE = Object.freeze([
  'none',
  'low',
  'medium',
  'high'
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

function buildDescriptor() {
  return freezeDeep({
    comparisonVersion: SR_PLANT_CCP_COMPARISON_VERSION,
    capability: SR_PLANT_CCP_COMPARISON_CAPABILITY,
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
    productConsumer: false
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperPlantCcpComparisonDescriptor() {
  return DESCRIPTOR;
}

function buildSummaryFingerprint(report) {
  return [
    SR_PLANT_CCP_COMPARISON_VERSION,
    String(report.status || ''),
    String(report.result || ''),
    String(report.confidence || ''),
    String((report.axisResults && report.axisResults.length) || 0),
    String((report.missingPlantFields && report.missingPlantFields.length) || 0),
    String(
      (report.missingCoordinateFields && report.missingCoordinateFields.length) ||
        0
    ),
    String(
      (report.missingContextFields && report.missingContextFields.length) || 0
    ),
    String((report.warnings && report.warnings.length) || 0),
    String((report.blockingReasons && report.blockingReasons.length) || 0),
    stableSerialize(
      (report.axisResults || []).map(function (a) {
        return { axis: a.axis, outcome: a.outcome, code: a.code };
      })
    )
  ].join('|');
}

function emptyNotAuthority() {
  return {
    productAuthority: false,
    runtimeEligibilityAuthority: false,
    recommendationAuthority: false,
    overlayAuthority: false,
    liveWeather: false,
    gosConsumer: false
  };
}

function baseReport(partial) {
  const report = {
    comparisonVersion: SR_PLANT_CCP_COMPARISON_VERSION,
    capability: SR_PLANT_CCP_COMPARISON_CAPABILITY,
    developerOnly: true,
    syntheticOnly: true,
    activation: 'explicit_call_only',
    plantRef: partial.plantRef || null,
    ccpRef: partial.ccpRef || null,
    status: partial.status || 'insufficient',
    result: partial.result || 'insufficient_data',
    confidence: partial.confidence || 'none',
    axisResults: partial.axisResults || [],
    missingPlantFields: partial.missingPlantFields || [],
    missingCoordinateFields: partial.missingCoordinateFields || [],
    missingContextFields: partial.missingContextFields || [],
    warnings: partial.warnings || [],
    blockingReasons: partial.blockingReasons || [],
    notAuthority: emptyNotAuthority(),
    summaryFingerprint: ''
  };
  report.summaryFingerprint = buildSummaryFingerprint(report);
  return freezeDeep(report);
}

function normalizePlantEcho(plant) {
  if (!plant) return null;
  return {
    canonicalKey: plant.canonicalKey || null,
    field: plant.field || null,
    reviewedClaimType: plant.reviewedClaimType || null,
    reviewedValue: plant.reviewedValue || null,
    profileStatus: plant.profileStatus || null,
    profileId: plant.profileId || null,
    syntheticOnly: plant.syntheticOnly === true
  };
}

function normalizeCcpEcho(ccp) {
  if (!ccp) return null;
  const n = asObject(ccp.normalized);
  return {
    valid: ccp.valid === true,
    trusted: ccp.trusted === true,
    profileStatus: ccp.profileStatus || null,
    coordinateFingerprint:
      (n && n.coordinateFingerprint) || ccp.coordinateFingerprint || null,
    ccpId: (n && n.ccpId) || ccp.ccpId || null
  };
}

/**
 * Compare a plant SCP-like input against a CCP validation report.
 * @param {object|null} plantRef
 * @param {object|null} ccpReport
 * @returns {object} frozen comparison report
 */
export function comparePlantToCoordinateClimateProfile(plantRef, ccpReport) {
  const plant = asObject(plantRef);
  const ccp = asObject(ccpReport);

  const forbidden = [];
  if (plant) collectForbiddenKeys(plant, 'plantRef', forbidden);
  if (ccp) collectForbiddenKeys(ccp, 'ccpRef', forbidden);
  if (forbidden.length) {
    return baseReport({
      plantRef: normalizePlantEcho(plant),
      ccpRef: normalizeCcpEcho(ccp),
      status: 'blocked',
      result: 'hard_block',
      confidence: 'none',
      blockingReasons: [
        {
          code: 'forbidden_live_or_provider_keys',
          detail: forbidden.sort().join(',')
        }
      ]
    });
  }

  // Missing / null plant
  if (!plant) {
    return baseReport({
      plantRef: null,
      ccpRef: normalizeCcpEcho(ccp),
      status: 'insufficient',
      result: 'insufficient_data',
      confidence: 'none',
      missingPlantFields: [
        'canonicalKey',
        'field',
        'reviewedClaimType',
        'reviewedValue',
        'profileStatus'
      ],
      blockingReasons: [
        { code: 'insufficient_data', detail: 'plant_ref_required' }
      ]
    });
  }

  // Missing CCP report
  if (!ccp) {
    return baseReport({
      plantRef: normalizePlantEcho(plant),
      ccpRef: null,
      status: 'blocked',
      result: 'hard_block',
      confidence: 'none',
      missingCoordinateFields: ['ccpReport'],
      blockingReasons: [
        { code: 'blocked', detail: 'ccp_report_required' }
      ]
    });
  }

  // Invalid / blocked CCP
  if (ccp.valid === false || ccp.profileStatus === 'blocked') {
    return baseReport({
      plantRef: normalizePlantEcho(plant),
      ccpRef: normalizeCcpEcho(ccp),
      status: 'blocked',
      result: 'hard_block',
      confidence: 'none',
      blockingReasons: [
        {
          code: 'blocked',
          detail:
            ccp.valid === false ? 'ccp_invalid' : 'ccp_profile_status_blocked'
        }
      ]
    });
  }

  // Untrusted CCP
  if (ccp.trusted !== true || ccp.profileStatus === 'untrusted') {
    return baseReport({
      plantRef: normalizePlantEcho(plant),
      ccpRef: normalizeCcpEcho(ccp),
      status: 'untrusted',
      result: 'not_comparable',
      confidence: 'none',
      blockingReasons: [
        { code: 'untrusted_location', detail: 'ccp_not_trusted' }
      ],
      warnings: [
        { code: 'untrusted_location', detail: 'ambient_climate_not_trusted' }
      ]
    });
  }

  // Plant must be reviewed_supported
  if (plant.profileStatus !== 'reviewed_supported') {
    return baseReport({
      plantRef: normalizePlantEcho(plant),
      ccpRef: normalizeCcpEcho(ccp),
      status: 'insufficient',
      result: 'insufficient_data',
      confidence: 'none',
      missingPlantFields: plant.profileStatus
        ? []
        : ['profileStatus'],
      blockingReasons: [
        {
          code: 'insufficient_data',
          detail: 'plant_profile_status_not_reviewed_supported'
        }
      ]
    });
  }

  const field = isNonEmptyString(plant.field)
    ? String(plant.field).trim()
    : '';
  const claimType = isNonEmptyString(plant.reviewedClaimType)
    ? String(plant.reviewedClaimType).trim()
    : '';
  const reviewedValue = isNonEmptyString(plant.reviewedValue)
    ? String(plant.reviewedValue).trim()
    : '';
  const canonicalKey = isNonEmptyString(plant.canonicalKey)
    ? String(plant.canonicalKey).trim()
    : '';

  const missingPlant = [];
  if (!canonicalKey) missingPlant.push('canonicalKey');
  if (!field) missingPlant.push('field');
  if (!claimType) missingPlant.push('reviewedClaimType');
  if (!reviewedValue) missingPlant.push('reviewedValue');
  if (missingPlant.length) {
    return baseReport({
      plantRef: normalizePlantEcho(plant),
      ccpRef: normalizeCcpEcho(ccp),
      status: 'insufficient',
      result: 'insufficient_data',
      confidence: 'none',
      missingPlantFields: missingPlant,
      blockingReasons: [
        { code: 'insufficient_data', detail: 'plant_fields_incomplete' }
      ]
    });
  }

  // Sun preference vs ambient CCP — not honestly comparable without microclimate.
  if (field === 'sun') {
    return baseReport({
      plantRef: normalizePlantEcho(plant),
      ccpRef: normalizeCcpEcho(ccp),
      status: 'insufficient',
      result: 'not_comparable',
      confidence: 'none',
      missingContextFields: [
        'site_sun_exposure',
        'shade',
        'aspect',
        'microclimate'
      ],
      axisResults: [
        {
          axis: 'sun',
          plantField: 'sun',
          ccpField: null,
          outcome: 'not_comparable',
          code: 'missing_microclimate',
          detail:
            'ambient_ccp_cannot_determine_garden_sun_exposure_shade_or_aspect'
        }
      ],
      warnings: [
        {
          code: 'missing_microclimate',
          detail: 'sun_preference_requires_garden_or_microclimate_context'
        }
      ],
      blockingReasons: [
        {
          code: 'missing_microclimate',
          detail: 'sun_vs_ambient_ccp_not_comparable'
        }
      ]
    });
  }

  // Water preference vs ambient CCP — needs garden irrigation/drainage context.
  if (field === 'water') {
    return baseReport({
      plantRef: normalizePlantEcho(plant),
      ccpRef: normalizeCcpEcho(ccp),
      status: 'insufficient',
      result: 'not_comparable',
      confidence: 'none',
      missingContextFields: [
        'irrigation',
        'drainage',
        'soil',
        'container_vs_ground',
        'garden_context'
      ],
      axisResults: [
        {
          axis: 'water',
          plantField: 'water',
          ccpField: null,
          outcome: 'not_comparable',
          code: 'missing_garden_context',
          detail:
            'ambient_ccp_cannot_determine_irrigation_drainage_soil_or_container'
        }
      ],
      warnings: [
        {
          code: 'missing_garden_context',
          detail: 'water_preference_requires_garden_context'
        }
      ],
      blockingReasons: [
        {
          code: 'missing_garden_context',
          detail: 'water_vs_ambient_ccp_not_comparable'
        }
      ]
    });
  }

  // Other plant fields: no ambient mapping in v1 — insufficient / not comparable.
  return baseReport({
    plantRef: normalizePlantEcho(plant),
    ccpRef: normalizeCcpEcho(ccp),
    status: 'insufficient',
    result: 'not_comparable',
    confidence: 'none',
    missingCoordinateFields: ['aligned_ccp_axis_for_' + field],
    axisResults: [
      {
        axis: field,
        plantField: field,
        ccpField: null,
        outcome: 'not_comparable',
        code: 'no_aligned_ccp_axis',
        detail: 'v1_does_not_map_this_plant_field_to_ambient_ccp'
      }
    ],
    blockingReasons: [
      {
        code: 'insufficient_data',
        detail: 'no_aligned_ambient_ccp_axis'
      }
    ]
  });
}

/** Embedded synthetic fixtures for harness / Node proof. */
export function getSmartRecDeveloperPlantCcpComparisonSyntheticFixtures() {
  const trustedCcp = {
    valid: true,
    trusted: true,
    profileStatus: 'ready',
    profileVersion: '0.1.0-sr-coordinate-climate-profile',
    contractVersion: '0.1.0-sr-coordinate-climate-profile-contract',
    developerOnly: true,
    syntheticOnly: true,
    normalized: {
      profileStatus: 'ready',
      trusted: true,
      coordinateFingerprint:
        'ccp|45.5017|-73.5673|city|user_confirmed_pin|user_confirmed',
      ccpId: 'ccp|45.5017|-73.5673|city|user_confirmed_pin|user_confirmed',
      latitude: 45.5017,
      longitude: -73.5673,
      locationConfidence: 'high',
      precisionLevel: 'city',
      climateConfidence: 'none',
      fields: {
        temperatureRange: {
          status: 'unknown',
          value: null,
          unknownReason: 'no_normals_coverage'
        },
        seasonalityHemisphere: {
          status: 'known',
          value: 'northern',
          confidence: 'high'
        }
      },
      syntheticOnly: true
    },
    findings: []
  };

  const untrustedCcp = {
    valid: true,
    trusted: false,
    profileStatus: 'untrusted',
    profileVersion: '0.1.0-sr-coordinate-climate-profile',
    contractVersion: '0.1.0-sr-coordinate-climate-profile-contract',
    developerOnly: true,
    syntheticOnly: true,
    normalized: {
      profileStatus: 'untrusted',
      trusted: false,
      coordinateFingerprint:
        'ccp|45.5017|-73.5673|exact_point|device_geolocation|unconfirmed',
      ccpId: 'ccp|45.5017|-73.5673|exact_point|device_geolocation|unconfirmed',
      latitude: 45.5017,
      longitude: -73.5673,
      locationConfidence: 'low',
      precisionLevel: 'exact_point',
      climateConfidence: 'none',
      fields: {},
      syntheticOnly: true
    },
    findings: []
  };

  const blockedCcp = {
    valid: false,
    trusted: false,
    profileStatus: 'blocked',
    profileVersion: '0.1.0-sr-coordinate-climate-profile',
    contractVersion: '0.1.0-sr-coordinate-climate-profile-contract',
    developerOnly: true,
    syntheticOnly: true,
    normalized: null,
    findings: [
      {
        code: 'invalid_latitude',
        severity: 'error',
        detail: '120',
        path: 'latitude'
      }
    ]
  };

  const plantSun = {
    profileId: 'scp-synthetic-lavender-sun-preference-v1',
    canonicalKey: 'lavender',
    field: 'sun',
    reviewedClaimType: 'preference',
    reviewedValue: 'full_sun',
    profileStatus: 'reviewed_supported',
    contextScope: {
      setting: 'outdoor',
      planting: 'ground',
      maturity: 'mature',
      objective: 'general'
    },
    syntheticOnly: true
  };

  const plantWater = {
    profileId: 'scp-synthetic-lavender-water-preference-v1',
    canonicalKey: 'lavender',
    field: 'water',
    reviewedClaimType: 'preference',
    reviewedValue: 'low',
    profileStatus: 'reviewed_supported',
    contextScope: {
      setting: 'outdoor',
      planting: 'ground',
      maturity: 'mature',
      objective: 'general'
    },
    syntheticOnly: true
  };

  return freezeDeep({
    A: { plant: plantSun, ccp: trustedCcp },
    B: { plant: plantWater, ccp: trustedCcp },
    C: { plant: plantSun, ccp: untrustedCcp },
    D: { plant: plantSun, ccp: blockedCcp },
    E: { plant: null, ccp: trustedCcp }
  });
}
