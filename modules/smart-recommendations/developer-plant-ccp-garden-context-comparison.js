/**
 * Cruvit — Smart Recommendations developer Plant↔CCP↔Garden Context comparison
 * ---------------------------------------------------------------------------
 * Pure, developer-only, synthetic-only three-way comparison of plant SCP-like
 * inputs against Coordinate Climate Profile and Garden Context validation
 * reports.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Accepts already-built synthetic plant refs + CCP + Garden Context reports.
 *  - Does not import GOS, v1b, product runtime, overlay, or live weather.
 *  - Does not activate Smart Recommendations or Product Authority.
 *  - Does not recommend plants, grant eligibility, or plant suitability.
 *  - Garden Context may enable sun/water axis comparison; never soft_fit alone.
 *  - CCP hard climate blocks are never overridden by Garden Context.
 */

export const SR_PLANT_CCP_GARDEN_CONTEXT_COMPARISON_VERSION =
  '0.1.0-sr-plant-ccp-garden-context-comparison';

export const SR_PLANT_CCP_GARDEN_CONTEXT_COMPARISON_CAPABILITY =
  'explicit_developer_plant_ccp_garden_context_comparison';

export const SR_PLANT_CCP_GARDEN_CONTEXT_COMPARISON_STATUSES = Object.freeze([
  'not_run',
  'blocked',
  'untrusted',
  'insufficient',
  'not_comparable',
  'partial',
  'comparable'
]);

export const SR_PLANT_CCP_GARDEN_CONTEXT_COMPARISON_RESULTS = Object.freeze([
  'hard_block',
  'untrusted_context',
  'insufficient_data',
  'missing_microclimate',
  'missing_garden_context',
  'axis_comparable',
  'cautious_axis_alignment',
  'preference_mismatch_warning',
  'unknown'
]);

export const SR_PLANT_CCP_GARDEN_CONTEXT_COMPARISON_CONFIDENCE = Object.freeze([
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

const SUPPORTED_PLANT_FIELDS = Object.freeze(['sun', 'water']);

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
    comparisonVersion: SR_PLANT_CCP_GARDEN_CONTEXT_COMPARISON_VERSION,
    capability: SR_PLANT_CCP_GARDEN_CONTEXT_COMPARISON_CAPABILITY,
    developerOnly: true,
    syntheticOnly: true,
    productAuthority: false,
    runtimeEligibilityAuthority: false,
    recommendationAuthority: false,
    overlayAuthority: false,
    liveWeather: false,
    gosConsumer: false,
    network: false,
    automaticExecution: false,
    writesArtifacts: false,
    plantSuitabilityAuthority: false,
    activation: 'explicit_call_only',
    doesNotOverrideHardCcpClimateBlocks: true,
    doesNotGrantPlantSuitabilityAlone: true,
    noSoftFitFromGardenContextAlone: true
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperPlantCcpGardenContextComparisonDescriptor() {
  return DESCRIPTOR;
}

function buildSummaryFingerprint(report) {
  return [
    SR_PLANT_CCP_GARDEN_CONTEXT_COMPARISON_VERSION,
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
      (report.missingGardenContextFields &&
        report.missingGardenContextFields.length) ||
        0
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
    gosConsumer: false,
    plantSuitabilityAuthority: false
  };
}

function baseReport(partial) {
  const report = {
    comparisonVersion: SR_PLANT_CCP_GARDEN_CONTEXT_COMPARISON_VERSION,
    capability: SR_PLANT_CCP_GARDEN_CONTEXT_COMPARISON_CAPABILITY,
    developerOnly: true,
    syntheticOnly: true,
    activation: 'explicit_call_only',
    plantRef: partial.plantRef || null,
    ccpRef: partial.ccpRef || null,
    gardenContextRef: partial.gardenContextRef || null,
    status: partial.status || 'insufficient',
    result: partial.result || 'insufficient_data',
    confidence: partial.confidence || 'none',
    axisResults: partial.axisResults || [],
    missingPlantFields: partial.missingPlantFields || [],
    missingCoordinateFields: partial.missingCoordinateFields || [],
    missingGardenContextFields: partial.missingGardenContextFields || [],
    warnings: partial.warnings || [],
    blockingReasons: partial.blockingReasons || [],
    notAuthority: emptyNotAuthority(),
    doesNotOverrideHardCcpClimateBlocks: true,
    doesNotGrantPlantSuitabilityAlone: true,
    plantSuitabilityAuthority: false,
    recommendationAuthority: false,
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
    contextScope: plant.contextScope || null,
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

function gardenNormalized(gc) {
  if (!gc) return null;
  return asObject(gc.normalized) || gc;
}

function normalizeGardenEcho(gc) {
  if (!gc) return null;
  const n = gardenNormalized(gc);
  return {
    valid: gc.valid === true,
    trusted: gc.trusted === true,
    profileStatus: gc.profileStatus || null,
    contextId: (n && n.contextId) || gc.contextId || null,
    userGardenId: (n && n.userGardenId) || gc.userGardenId || null,
    scope: (n && n.scope) || gc.scope || null,
    plantingMode: (n && n.plantingMode) || gc.plantingMode || null,
    sunExposure: (n && n.sunExposure) || gc.sunExposure || null,
    confidence: (n && n.confidence) || gc.confidence || null
  };
}

function gardenField(gc, key) {
  const n = gardenNormalized(gc);
  if (n && n[key] != null) return n[key];
  if (gc && gc[key] != null) return gc[key];
  return null;
}

function mapConfidence(raw) {
  if (raw === 'high' || raw === 'medium' || raw === 'low' || raw === 'none') {
    return raw;
  }
  return 'none';
}

function compareSunAxis(plant, gc) {
  const plantSun = String(plant.reviewedValue || '').trim();
  const gardenSun = String(gardenField(gc, 'sunExposure') || '').trim();
  const directHours = gardenField(gc, 'directSunHoursRange');
  const shade = gardenField(gc, 'shadePattern');
  const aspect = gardenField(gc, 'aspect');

  if (!gardenSun || gardenSun === 'unknown') {
    return {
      status: 'not_comparable',
      result: 'missing_microclimate',
      confidence: 'none',
      axisResults: [
        {
          axis: 'sun',
          plantField: 'sun',
          gardenField: 'sunExposure',
          outcome: 'not_comparable',
          code: 'missing_microclimate',
          detail: 'garden_sun_exposure_unknown_or_missing'
        }
      ],
      missingGardenContextFields: ['sunExposure'],
      warnings: [
        {
          code: 'missing_microclimate',
          detail: 'sun_preference_requires_known_garden_sun_exposure'
        }
      ],
      blockingReasons: [
        {
          code: 'missing_microclimate',
          detail: 'sun_vs_unknown_garden_context'
        }
      ]
    };
  }

  const aligned = plantSun === gardenSun;
  const conf = mapConfidence(gardenField(gc, 'confidence'));
  const supporting = [];
  if (directHours != null) supporting.push('directSunHoursRange');
  if (shade != null) supporting.push('shadePattern');
  if (aspect != null) supporting.push('aspect');

  if (aligned) {
    return {
      status: 'comparable',
      result: 'cautious_axis_alignment',
      confidence: conf === 'none' ? 'low' : conf,
      axisResults: [
        {
          axis: 'sun',
          plantField: 'sun',
          gardenField: 'sunExposure',
          plantValue: plantSun,
          gardenValue: gardenSun,
          outcome: 'cautious_axis_alignment',
          code: 'axis_comparable',
          detail: 'sun_preference_aligns_with_garden_sun_exposure',
          supportingGardenFields: supporting
        }
      ],
      warnings: [
        {
          code: 'no_plant_suitability',
          detail: 'axis_alignment_does_not_grant_plant_suitability'
        }
      ],
      blockingReasons: []
    };
  }

  return {
    status: 'partial',
    result: 'preference_mismatch_warning',
    confidence: conf === 'high' ? 'medium' : conf === 'none' ? 'low' : conf,
    axisResults: [
      {
        axis: 'sun',
        plantField: 'sun',
        gardenField: 'sunExposure',
        plantValue: plantSun,
        gardenValue: gardenSun,
        outcome: 'preference_mismatch_warning',
        code: 'preference_mismatch_warning',
        detail: 'sun_preference_does_not_match_garden_sun_exposure'
      }
    ],
    warnings: [
      {
        code: 'preference_mismatch_warning',
        detail: 'sun_axis_mismatch_warning_only_not_hard_block'
      },
      {
        code: 'no_plant_suitability',
        detail: 'mismatch_does_not_grant_or_deny_full_suitability'
      }
    ],
    blockingReasons: []
  };
}

function compareWaterAxis(plant, gc) {
  const plantWater = String(plant.reviewedValue || '').trim();
  const drainage = String(gardenField(gc, 'drainage') || '').trim();
  const irrigationType = String(gardenField(gc, 'irrigationType') || '').trim();
  const irrigationReliability = String(
    gardenField(gc, 'irrigationReliability') || ''
  ).trim();
  const soilTexture = gardenField(gc, 'soilTexture');
  const moisture = gardenField(gc, 'soilMoistureTendency');
  const plantingMode = String(gardenField(gc, 'plantingMode') || '').trim();
  const containerSize = gardenField(gc, 'containerSize');

  const missing = [];
  if (!drainage || drainage === 'unknown') missing.push('drainage');
  if (!irrigationType || irrigationType === 'unknown') {
    missing.push('irrigationType');
  }
  if (!irrigationReliability || irrigationReliability === 'unknown') {
    missing.push('irrigationReliability');
  }
  if (!plantingMode || plantingMode === 'unknown') missing.push('plantingMode');

  if (missing.length) {
    return {
      status: 'not_comparable',
      result: 'missing_garden_context',
      confidence: 'none',
      axisResults: [
        {
          axis: 'water',
          plantField: 'water',
          gardenField: null,
          outcome: 'not_comparable',
          code: 'missing_garden_context',
          detail: 'garden_water_context_incomplete'
        }
      ],
      missingGardenContextFields: missing,
      warnings: [
        {
          code: 'missing_garden_context',
          detail: 'water_preference_requires_irrigation_drainage_planting_mode'
        }
      ],
      blockingReasons: [
        {
          code: 'missing_garden_context',
          detail: 'water_vs_incomplete_garden_context'
        }
      ]
    };
  }

  const conf = mapConfidence(gardenField(gc, 'confidence'));
  const supporting = [
    'drainage',
    'irrigationType',
    'irrigationReliability',
    'plantingMode'
  ];
  if (soilTexture != null) supporting.push('soilTexture');
  if (moisture != null) supporting.push('soilMoistureTendency');
  if (containerSize != null) supporting.push('containerSize');

  // Low-water preference is cautiously compatible with well-drained sites that
  // have known irrigation context. This is axis alignment only — never soft_fit
  // or full plant suitability.
  const lowWaterCompatible =
    plantWater === 'low' &&
    drainage === 'well_drained' &&
    (irrigationReliability === 'medium' || irrigationReliability === 'high') &&
    (moisture == null ||
      moisture === 'dry' ||
      moisture === 'moderate' ||
      moisture === 'well_drained');

  if (lowWaterCompatible) {
    return {
      status: 'comparable',
      result: 'cautious_axis_alignment',
      confidence: conf === 'none' ? 'low' : conf,
      axisResults: [
        {
          axis: 'water',
          plantField: 'water',
          gardenField: 'irrigationType',
          plantValue: plantWater,
          gardenValue: {
            drainage: drainage,
            irrigationType: irrigationType,
            irrigationReliability: irrigationReliability,
            plantingMode: plantingMode,
            soilMoistureTendency: moisture
          },
          outcome: 'cautious_axis_alignment',
          code: 'axis_comparable',
          detail: 'low_water_preference_aligns_with_well_drained_irrigated_context',
          supportingGardenFields: supporting
        }
      ],
      warnings: [
        {
          code: 'no_plant_suitability',
          detail: 'axis_alignment_does_not_grant_plant_suitability'
        },
        {
          code: 'no_ccp_rainfall_inference',
          detail: 'water_axis_not_inferred_from_ccp_rainfall_humidity_seasonality'
        }
      ],
      blockingReasons: []
    };
  }

  return {
    status: 'partial',
    result: 'preference_mismatch_warning',
    confidence: conf === 'high' ? 'medium' : conf === 'none' ? 'low' : conf,
    axisResults: [
      {
        axis: 'water',
        plantField: 'water',
        gardenField: 'irrigationType',
        plantValue: plantWater,
        gardenValue: {
          drainage: drainage,
          irrigationType: irrigationType,
          irrigationReliability: irrigationReliability,
          plantingMode: plantingMode
        },
        outcome: 'preference_mismatch_warning',
        code: 'preference_mismatch_warning',
        detail: 'water_preference_not_cautiously_aligned_with_garden_context'
      }
    ],
    warnings: [
      {
        code: 'preference_mismatch_warning',
        detail: 'water_axis_mismatch_warning_only_not_hard_block'
      },
      {
        code: 'no_plant_suitability',
        detail: 'mismatch_does_not_grant_or_deny_full_suitability'
      }
    ],
    blockingReasons: []
  };
}

/**
 * Compare plant SCP-like input against CCP + Garden Context validation reports.
 * @param {object|null} plantRef
 * @param {object|null} ccpReport
 * @param {object|null} gardenContextReport
 * @returns {object} frozen comparison report
 */
export function comparePlantCcpGardenContext(
  plantRef,
  ccpReport,
  gardenContextReport
) {
  const plant = asObject(plantRef);
  const ccp = asObject(ccpReport);
  const gc = asObject(gardenContextReport);

  const forbidden = [];
  if (plant) collectForbiddenKeys(plant, 'plantRef', forbidden);
  if (ccp) collectForbiddenKeys(ccp, 'ccpRef', forbidden);
  if (gc) collectForbiddenKeys(gc, 'gardenContextRef', forbidden);
  if (forbidden.length) {
    return baseReport({
      plantRef: normalizePlantEcho(plant),
      ccpRef: normalizeCcpEcho(ccp),
      gardenContextRef: normalizeGardenEcho(gc),
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

  if (!plant) {
    return baseReport({
      plantRef: null,
      ccpRef: normalizeCcpEcho(ccp),
      gardenContextRef: normalizeGardenEcho(gc),
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

  if (!ccp) {
    return baseReport({
      plantRef: normalizePlantEcho(plant),
      ccpRef: null,
      gardenContextRef: normalizeGardenEcho(gc),
      status: 'blocked',
      result: 'hard_block',
      confidence: 'none',
      missingCoordinateFields: ['ccpReport'],
      blockingReasons: [{ code: 'blocked', detail: 'ccp_report_required' }]
    });
  }

  // CCP hard block wins over ready Garden Context.
  if (ccp.valid === false || ccp.profileStatus === 'blocked') {
    return baseReport({
      plantRef: normalizePlantEcho(plant),
      ccpRef: normalizeCcpEcho(ccp),
      gardenContextRef: normalizeGardenEcho(gc),
      status: 'blocked',
      result: 'hard_block',
      confidence: 'none',
      blockingReasons: [
        {
          code: 'blocked',
          detail:
            ccp.valid === false ? 'ccp_invalid' : 'ccp_profile_status_blocked'
        },
        {
          code: 'ccp_hard_block_wins',
          detail: 'garden_context_cannot_override_hard_ccp_climate_blocks'
        }
      ]
    });
  }

  if (ccp.trusted !== true || ccp.profileStatus === 'untrusted') {
    return baseReport({
      plantRef: normalizePlantEcho(plant),
      ccpRef: normalizeCcpEcho(ccp),
      gardenContextRef: normalizeGardenEcho(gc),
      status: 'untrusted',
      result: 'untrusted_context',
      confidence: 'none',
      blockingReasons: [
        { code: 'untrusted_context', detail: 'ccp_not_trusted' }
      ],
      warnings: [
        {
          code: 'untrusted_context',
          detail: 'ambient_climate_not_trusted_cannot_support_recommendation'
        }
      ]
    });
  }

  if (!gc) {
    const fieldHint = isNonEmptyString(plant.field)
      ? String(plant.field).trim()
      : '';
    const code =
      fieldHint === 'sun' ? 'missing_microclimate' : 'missing_garden_context';
    return baseReport({
      plantRef: normalizePlantEcho(plant),
      ccpRef: normalizeCcpEcho(ccp),
      gardenContextRef: null,
      status: 'not_comparable',
      result: code,
      confidence: 'none',
      missingGardenContextFields: ['gardenContextReport'],
      axisResults: [
        {
          axis: fieldHint || 'unknown',
          plantField: fieldHint || null,
          gardenField: null,
          outcome: 'not_comparable',
          code: code,
          detail: 'garden_context_report_required'
        }
      ],
      blockingReasons: [{ code: code, detail: 'garden_context_report_required' }]
    });
  }

  if (gc.valid === false || gc.profileStatus === 'blocked') {
    return baseReport({
      plantRef: normalizePlantEcho(plant),
      ccpRef: normalizeCcpEcho(ccp),
      gardenContextRef: normalizeGardenEcho(gc),
      status: 'blocked',
      result: 'hard_block',
      confidence: 'none',
      blockingReasons: [
        {
          code: 'blocked',
          detail:
            gc.valid === false
              ? 'garden_context_invalid'
              : 'garden_context_profile_status_blocked'
        }
      ]
    });
  }

  if (gc.profileStatus === 'insufficient') {
    return baseReport({
      plantRef: normalizePlantEcho(plant),
      ccpRef: normalizeCcpEcho(ccp),
      gardenContextRef: normalizeGardenEcho(gc),
      status: 'insufficient',
      result: 'insufficient_data',
      confidence: 'none',
      missingGardenContextFields: ['sufficient_confirmed_garden_context'],
      blockingReasons: [
        {
          code: 'insufficient_data',
          detail: 'garden_context_insufficient'
        }
      ]
    });
  }

  if (gc.trusted !== true || gc.profileStatus === 'untrusted') {
    return baseReport({
      plantRef: normalizePlantEcho(plant),
      ccpRef: normalizeCcpEcho(ccp),
      gardenContextRef: normalizeGardenEcho(gc),
      status: 'untrusted',
      result: 'untrusted_context',
      confidence: 'none',
      blockingReasons: [
        {
          code: 'untrusted_context',
          detail: 'garden_context_not_trusted'
        }
      ],
      warnings: [
        {
          code: 'untrusted_context',
          detail: 'untrusted_garden_context_cannot_support_recommendation'
        }
      ]
    });
  }

  if (plant.profileStatus !== 'reviewed_supported') {
    return baseReport({
      plantRef: normalizePlantEcho(plant),
      ccpRef: normalizeCcpEcho(ccp),
      gardenContextRef: normalizeGardenEcho(gc),
      status: 'insufficient',
      result: 'insufficient_data',
      confidence: 'none',
      missingPlantFields: plant.profileStatus ? [] : ['profileStatus'],
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
      gardenContextRef: normalizeGardenEcho(gc),
      status: 'insufficient',
      result: 'insufficient_data',
      confidence: 'none',
      missingPlantFields: missingPlant,
      blockingReasons: [
        { code: 'insufficient_data', detail: 'plant_fields_incomplete' }
      ]
    });
  }

  if (SUPPORTED_PLANT_FIELDS.indexOf(field) < 0) {
    return baseReport({
      plantRef: normalizePlantEcho(plant),
      ccpRef: normalizeCcpEcho(ccp),
      gardenContextRef: normalizeGardenEcho(gc),
      status: 'not_comparable',
      result: 'insufficient_data',
      confidence: 'none',
      missingPlantFields: ['supported_reviewed_field_for_' + field],
      axisResults: [
        {
          axis: field,
          plantField: field,
          gardenField: null,
          outcome: 'not_comparable',
          code: 'unsupported_plant_field',
          detail: 'v1_supports_sun_and_water_axes_only'
        }
      ],
      blockingReasons: [
        {
          code: 'insufficient_data',
          detail: 'unsupported_plant_field'
        }
      ]
    });
  }

  let axisOutcome;
  if (field === 'sun') {
    axisOutcome = compareSunAxis(plant, gc);
  } else {
    axisOutcome = compareWaterAxis(plant, gc);
  }

  const gardenConfidence = mapConfidence(gardenField(gc, 'confidence'));
  const warnings = (axisOutcome.warnings || []).slice();
  let status = axisOutcome.status;
  let result = axisOutcome.result;
  let confidence = axisOutcome.confidence;

  // Low-confidence Garden Context demotes to partial/warning; never grants
  // suitability even when axis values appear aligned.
  if (
    gardenConfidence === 'low' &&
    (status === 'comparable' || result === 'cautious_axis_alignment')
  ) {
    status = 'partial';
    confidence = 'low';
    warnings.push({
      code: 'low_confidence_garden_context',
      detail: 'low_confidence_demotes_alignment_does_not_grant_suitability'
    });
  }

  return baseReport({
    plantRef: normalizePlantEcho(plant),
    ccpRef: normalizeCcpEcho(ccp),
    gardenContextRef: normalizeGardenEcho(gc),
    status: status,
    result: result,
    confidence: confidence,
    axisResults: axisOutcome.axisResults || [],
    missingPlantFields: axisOutcome.missingPlantFields || [],
    missingCoordinateFields: axisOutcome.missingCoordinateFields || [],
    missingGardenContextFields: axisOutcome.missingGardenContextFields || [],
    warnings: warnings,
    blockingReasons: axisOutcome.blockingReasons || []
  });
}

/** Embedded synthetic fixtures for harness / Node proof. */
export function getSmartRecDeveloperPlantCcpGardenContextComparisonSyntheticFixtures() {
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
        rainfallDrySeason: {
          status: 'unknown',
          value: null,
          unknownReason: 'no_normals_coverage'
        },
        humidity: {
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

  const readyGarden = {
    valid: true,
    trusted: true,
    profileStatus: 'ready',
    profileVersion: '0.1.0-sr-garden-context-profile',
    capability: 'explicit_developer_garden_context_profile_validation',
    developerOnly: true,
    syntheticOnly: true,
    contextId: 'gcp-synthetic-exact-spot-a',
    userGardenId: 'garden-synthetic-001',
    normalized: {
      contextId: 'gcp-synthetic-exact-spot-a',
      userGardenId: 'garden-synthetic-001',
      scope: 'zone',
      source: 'user_input',
      confirmationStatus: 'user_confirmed',
      confidence: 'high',
      precisionLevel: 'exact_spot',
      plantingMode: 'ground',
      sunExposure: 'full_sun',
      directSunHoursRange: { min: 6, max: 8 },
      shadePattern: 'open',
      aspect: 'south',
      drainage: 'well_drained',
      soilTexture: 'sandy_loam',
      soilMoistureTendency: 'dry',
      irrigationType: 'drip',
      irrigationReliability: 'high',
      containerSize: null,
      unknownReasons: {},
      profileStatus: 'ready',
      trusted: true,
      syntheticOnly: true
    },
    findings: []
  };

  const untrustedGarden = {
    valid: true,
    trusted: false,
    profileStatus: 'untrusted',
    profileVersion: '0.1.0-sr-garden-context-profile',
    capability: 'explicit_developer_garden_context_profile_validation',
    developerOnly: true,
    syntheticOnly: true,
    contextId: 'gcp-synthetic-default-unknown-b',
    userGardenId: 'garden-synthetic-001',
    normalized: {
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
        sunExposure: 'default_unknown_context',
        drainage: 'default_unknown_context'
      },
      profileStatus: 'untrusted',
      trusted: false,
      syntheticOnly: true
    },
    findings: []
  };

  const lowConfidenceGarden = {
    valid: true,
    trusted: true,
    profileStatus: 'ready',
    profileVersion: '0.1.0-sr-garden-context-profile',
    capability: 'explicit_developer_garden_context_profile_validation',
    developerOnly: true,
    syntheticOnly: true,
    contextId: 'gcp-synthetic-low-confidence-g',
    userGardenId: 'garden-synthetic-001',
    normalized: {
      contextId: 'gcp-synthetic-low-confidence-g',
      userGardenId: 'garden-synthetic-001',
      scope: 'zone',
      source: 'inferred_from_photo',
      confirmationStatus: 'user_confirmed',
      confidence: 'low',
      precisionLevel: 'zone',
      plantingMode: 'ground',
      sunExposure: 'full_sun',
      directSunHoursRange: { min: 6, max: 8 },
      shadePattern: 'open',
      aspect: 'south',
      drainage: 'well_drained',
      soilTexture: 'sandy_loam',
      soilMoistureTendency: 'dry',
      irrigationType: 'drip',
      irrigationReliability: 'high',
      containerSize: null,
      unknownReasons: {},
      profileStatus: 'ready',
      trusted: true,
      syntheticOnly: true
    },
    findings: []
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

  const plantUnsupported = {
    profileId: 'scp-synthetic-lavender-cold-unsupported-v1',
    canonicalKey: 'lavender',
    field: 'cold',
    reviewedClaimType: 'preference',
    reviewedValue: 'hardy',
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
    A: { plant: plantSun, ccp: trustedCcp, garden: readyGarden },
    B: { plant: plantWater, ccp: trustedCcp, garden: readyGarden },
    C: { plant: plantSun, ccp: trustedCcp, garden: untrustedGarden },
    D: { plant: plantSun, ccp: blockedCcp, garden: readyGarden },
    E: { plant: null, ccp: trustedCcp, garden: readyGarden },
    F: { plant: plantUnsupported, ccp: trustedCcp, garden: readyGarden },
    G: { plant: plantSun, ccp: trustedCcp, garden: lowConfidenceGarden },
    H: {
      plant: Object.assign({}, plantSun, { liveWeather: true }),
      ccp: trustedCcp,
      garden: readyGarden
    }
  });
}
