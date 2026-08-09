/**
 * Cruvit — Smart Recommendations developer Recommendation Readiness Report
 * -----------------------------------------------------------------------
 * Pure, developer-only, synthetic-only readiness summarizer over an already
 * built Plant↔CCP↔Garden Context comparator report.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Accepts already-built synthetic comparator reports only.
 *  - Does not import GOS, v1b, product runtime, overlay, or live weather.
 *  - Does not import the comparator module (fixtures embed synthetic reports).
 *  - Does not activate Smart Recommendations or Product Authority.
 *  - Does not recommend plants, grant eligibility, or plant suitability.
 *  - candidate_review_ready is developer/owner review only — never user-facing.
 */

export const SR_RECOMMENDATION_READINESS_REPORT_VERSION =
  '0.1.0-sr-recommendation-readiness-report';

export const SR_RECOMMENDATION_READINESS_REPORT_CAPABILITY =
  'explicit_developer_recommendation_readiness_report';

export const SR_RECOMMENDATION_READINESS_STATUSES = Object.freeze([
  'not_ready',
  'blocked',
  'untrusted',
  'insufficient',
  'axis_partial',
  'axis_ready',
  'candidate_review_ready'
]);

export const SR_RECOMMENDATION_READINESS_CONFIDENCE = Object.freeze([
  'none',
  'low',
  'medium',
  'high'
]);

const FORBIDDEN_AUTHORITY_FLAGS = Object.freeze([
  'productAuthority',
  'runtimeEligibilityAuthority',
  'recommendationAuthority',
  'overlayAuthority',
  'liveWeather',
  'gosConsumer',
  'network',
  'automaticExecution',
  'writesArtifacts',
  'plantSuitabilityAuthority',
  'commerceAuthority'
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

const ALIGNED_OUTCOMES = Object.freeze([
  'cautious_axis_alignment',
  'axis_comparable'
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

function isTruthyForbiddenLiveValue(v) {
  if (v === true) return true;
  if (typeof v === 'string' && v.trim().length > 0) return true;
  if (v !== null && typeof v === 'object') return true;
  return false;
}

function collectForbiddenLiveKeys(obj, path, out) {
  if (!obj || typeof obj !== 'object') return;
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const p = path ? path + '.' + k : k;
    const v = obj[k];
    // Explicit false/null/empty on isolation flags is allowed; truthy live
    // payloads / keys are fail-closed.
    if (
      FORBIDDEN_LIVE_KEYS.indexOf(k) >= 0 &&
      isTruthyForbiddenLiveValue(v)
    ) {
      out.push(p);
    }
    if (v && typeof v === 'object') collectForbiddenLiveKeys(v, p, out);
  }
}

function emptyNotAuthority() {
  return {
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
    commerceAuthority: false
  };
}

function buildDescriptor() {
  return freezeDeep({
    reportVersion: SR_RECOMMENDATION_READINESS_REPORT_VERSION,
    capability: SR_RECOMMENDATION_READINESS_REPORT_CAPABILITY,
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
    commerceAuthority: false,
    activation: 'explicit_call_only',
    candidateReviewOnly: true,
    doesNotGrantUserFacingReadiness: true,
    doesNotGrantPlantSuitability: true,
    doesNotActivateSmartRecommendations: true
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperRecommendationReadinessReportDescriptor() {
  return DESCRIPTOR;
}

function buildSummaryFingerprint(report) {
  return [
    SR_RECOMMENDATION_READINESS_REPORT_VERSION,
    String(report.readinessStatus || ''),
    String(report.confidence || ''),
    String((report.coveredAxes && report.coveredAxes.length) || 0),
    String((report.insufficientAxes && report.insufficientAxes.length) || 0),
    String((report.untrustedAxes && report.untrustedAxes.length) || 0),
    String((report.blockedAxes && report.blockedAxes.length) || 0),
    String((report.readinessReasons && report.readinessReasons.length) || 0),
    String((report.blockingReasons && report.blockingReasons.length) || 0),
    String((report.warnings && report.warnings.length) || 0),
    String(report.candidateReviewOnly === true),
    stableSerialize(report.coveredAxes || []),
    stableSerialize(report.insufficientAxes || []),
    stableSerialize(report.untrustedAxes || []),
    stableSerialize(report.blockedAxes || [])
  ].join('|');
}

function baseReport(partial) {
  const report = {
    reportVersion: SR_RECOMMENDATION_READINESS_REPORT_VERSION,
    capability: SR_RECOMMENDATION_READINESS_REPORT_CAPABILITY,
    developerOnly: true,
    syntheticOnly: true,
    activation: 'explicit_call_only',
    canonicalKey: partial.canonicalKey || null,
    readinessStatus: partial.readinessStatus || 'not_ready',
    readinessReasons: partial.readinessReasons || [],
    blockingReasons: partial.blockingReasons || [],
    missingRequirements: partial.missingRequirements || [],
    warnings: partial.warnings || [],
    confidence: partial.confidence || 'none',
    coveredAxes: partial.coveredAxes || [],
    insufficientAxes: partial.insufficientAxes || [],
    untrustedAxes: partial.untrustedAxes || [],
    blockedAxes: partial.blockedAxes || [],
    candidateReviewOnly: true,
    notAuthority: emptyNotAuthority(),
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
    commerceAuthority: false,
    summaryFingerprint: ''
  };
  report.summaryFingerprint = buildSummaryFingerprint(report);
  return freezeDeep(report);
}

function mapConfidence(raw) {
  if (raw === 'high' || raw === 'medium' || raw === 'low' || raw === 'none') {
    return raw;
  }
  return 'none';
}

function collectForbiddenAuthorityFlags(obj, path, out) {
  if (!obj || typeof obj !== 'object') return;
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const p = path ? path + '.' + k : k;
    if (FORBIDDEN_AUTHORITY_FLAGS.indexOf(k) >= 0 && obj[k] === true) {
      out.push(p);
    }
    // notAuthority.* must remain false; true inside notAuthority is also forbidden
    if (k === 'notAuthority' && obj[k] && typeof obj[k] === 'object') {
      collectForbiddenAuthorityFlags(obj[k], p, out);
    }
  }
}

function coveredFieldsFromSummary(coverage) {
  const c = asObject(coverage);
  if (!c) return null;
  if (Array.isArray(c.coveredFields)) {
    return c.coveredFields
      .filter(isNonEmptyString)
      .map(function (f) {
        return String(f).trim();
      });
  }
  if (Array.isArray(c.fields)) {
    return c.fields
      .filter(isNonEmptyString)
      .map(function (f) {
        return String(f).trim();
      });
  }
  const fields = [];
  const keys = Object.keys(c);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k === 'summary' || k === 'syntheticOnly' || k === 'notes') continue;
    if (c[k] === true) fields.push(k);
  }
  return fields;
}

function isAlignedAxis(axis) {
  if (!axis || typeof axis !== 'object') return false;
  const outcome = String(axis.outcome || '');
  const code = String(axis.code || '');
  return (
    ALIGNED_OUTCOMES.indexOf(outcome) >= 0 ||
    ALIGNED_OUTCOMES.indexOf(code) >= 0
  );
}

function classifyAxes(axisResults) {
  const covered = [];
  const insufficient = [];
  const untrusted = [];
  const blocked = [];

  const list = Array.isArray(axisResults) ? axisResults : [];
  for (let i = 0; i < list.length; i++) {
    const axis = list[i];
    const name = isNonEmptyString(axis && axis.axis)
      ? String(axis.axis).trim()
      : 'unknown';
    const outcome = String((axis && axis.outcome) || '');
    const code = String((axis && axis.code) || '');

    if (
      outcome === 'hard_block' ||
      code === 'hard_block' ||
      code === 'ccp_hard_block_wins' ||
      code === 'forbidden_live_or_provider_keys'
    ) {
      if (blocked.indexOf(name) < 0) blocked.push(name);
      continue;
    }
    if (
      outcome === 'untrusted_context' ||
      code === 'untrusted_context' ||
      outcome === 'untrusted'
    ) {
      if (untrusted.indexOf(name) < 0) untrusted.push(name);
      continue;
    }
    if (
      outcome === 'not_comparable' ||
      outcome === 'insufficient_data' ||
      code === 'insufficient_data' ||
      code === 'missing_microclimate' ||
      code === 'missing_garden_context' ||
      code === 'unsupported_plant_field'
    ) {
      if (insufficient.indexOf(name) < 0) insufficient.push(name);
      continue;
    }
    if (isAlignedAxis(axis)) {
      if (covered.indexOf(name) < 0) covered.push(name);
      continue;
    }
    if (insufficient.indexOf(name) < 0) insufficient.push(name);
  }

  return {
    coveredAxes: covered,
    insufficientAxes: insufficient,
    untrustedAxes: untrusted,
    blockedAxes: blocked
  };
}

function hasBlockingCode(list, code) {
  return (list || []).some(function (x) {
    return x && x.code === code;
  });
}

/**
 * Build a developer-only Recommendation Readiness Report from a comparator
 * report and reviewed field coverage summary.
 * @param {object|null} input
 * @returns {object} frozen readiness report
 */
export function buildRecommendationReadinessReport(input) {
  const src = asObject(input) || {};
  const comparator = asObject(src.comparatorReport);
  const canonicalKey = isNonEmptyString(src.canonicalKey)
    ? String(src.canonicalKey).trim()
    : comparator &&
        comparator.plantRef &&
        isNonEmptyString(comparator.plantRef.canonicalKey)
      ? String(comparator.plantRef.canonicalKey).trim()
      : null;

  const forbiddenLive = [];
  collectForbiddenLiveKeys(src, 'input', forbiddenLive);
  if (forbiddenLive.length) {
    return baseReport({
      canonicalKey: canonicalKey,
      readinessStatus: 'blocked',
      readinessReasons: [
        {
          code: 'forbidden_live_or_provider_keys',
          detail: forbiddenLive.sort().join(',')
        }
      ],
      blockingReasons: [
        {
          code: 'forbidden_live_or_provider_keys',
          detail: forbiddenLive.sort().join(',')
        }
      ],
      confidence: 'none'
    });
  }

  const forbiddenAuth = [];
  collectForbiddenAuthorityFlags(src, 'input', forbiddenAuth);
  if (comparator) {
    collectForbiddenAuthorityFlags(comparator, 'comparatorReport', forbiddenAuth);
  }
  if (forbiddenAuth.length) {
    return baseReport({
      canonicalKey: canonicalKey,
      readinessStatus: 'blocked',
      readinessReasons: [
        {
          code: 'forbidden_authority_flag',
          detail: forbiddenAuth.sort().join(',')
        }
      ],
      blockingReasons: [
        {
          code: 'forbidden_authority_flag',
          detail: forbiddenAuth.sort().join(',')
        }
      ],
      confidence: 'none'
    });
  }

  if (!comparator) {
    return baseReport({
      canonicalKey: canonicalKey,
      readinessStatus: 'not_ready',
      readinessReasons: [
        {
          code: 'missing_comparator_report',
          detail: 'comparator_report_required'
        }
      ],
      blockingReasons: [
        {
          code: 'missing_comparator_report',
          detail: 'comparator_report_required'
        }
      ],
      missingRequirements: ['comparatorReport'],
      confidence: 'none'
    });
  }

  const cmpStatus = String(comparator.status || '');
  const cmpResult = String(comparator.result || '');
  const cmpConfidence = mapConfidence(comparator.confidence);
  const axisResults = Array.isArray(src.axisResults)
    ? src.axisResults
    : Array.isArray(comparator.axisResults)
      ? comparator.axisResults
      : [];
  const blockingReasons = Array.isArray(src.blockingReasons)
    ? src.blockingReasons.slice()
    : Array.isArray(comparator.blockingReasons)
      ? comparator.blockingReasons.slice()
      : [];
  const warnings = Array.isArray(src.warnings)
    ? src.warnings.slice()
    : Array.isArray(comparator.warnings)
      ? comparator.warnings.slice()
      : [];

  const axes = classifyAxes(axisResults);

  if (
    cmpStatus === 'blocked' ||
    cmpResult === 'hard_block' ||
    hasBlockingCode(blockingReasons, 'hard_block') ||
    hasBlockingCode(blockingReasons, 'ccp_hard_block_wins') ||
    hasBlockingCode(blockingReasons, 'forbidden_live_or_provider_keys') ||
    axes.blockedAxes.length > 0
  ) {
    return baseReport({
      canonicalKey: canonicalKey,
      readinessStatus: 'blocked',
      readinessReasons: [
        {
          code: 'comparator_hard_block',
          detail: 'hard_block_in_comparator'
        }
      ],
      blockingReasons: blockingReasons.length
        ? blockingReasons
        : [
            {
              code: 'hard_block',
              detail: 'comparator_hard_block'
            }
          ],
      warnings: warnings,
      confidence: 'none',
      coveredAxes: axes.coveredAxes,
      insufficientAxes: axes.insufficientAxes,
      untrustedAxes: axes.untrustedAxes,
      blockedAxes: axes.blockedAxes.length
        ? axes.blockedAxes
        : ['comparator']
    });
  }

  if (
    cmpStatus === 'untrusted' ||
    cmpResult === 'untrusted_context' ||
    hasBlockingCode(blockingReasons, 'untrusted_context') ||
    axes.untrustedAxes.length > 0
  ) {
    return baseReport({
      canonicalKey: canonicalKey,
      readinessStatus: 'untrusted',
      readinessReasons: [
        {
          code: 'untrusted_context',
          detail: 'comparator_untrusted_context'
        }
      ],
      blockingReasons: blockingReasons.length
        ? blockingReasons
        : [
            {
              code: 'untrusted_context',
              detail: 'comparator_untrusted_context'
            }
          ],
      warnings: warnings,
      confidence: 'none',
      coveredAxes: axes.coveredAxes,
      insufficientAxes: axes.insufficientAxes,
      untrustedAxes: axes.untrustedAxes.length
        ? axes.untrustedAxes
        : ['comparator'],
      blockedAxes: axes.blockedAxes
    });
  }

  if (
    cmpStatus === 'insufficient' ||
    cmpResult === 'insufficient_data' ||
    hasBlockingCode(blockingReasons, 'insufficient_data')
  ) {
    return baseReport({
      canonicalKey: canonicalKey,
      readinessStatus: 'insufficient',
      readinessReasons: [
        {
          code: 'insufficient_data',
          detail: 'comparator_insufficient_data'
        }
      ],
      blockingReasons: blockingReasons.length
        ? blockingReasons
        : [
            {
              code: 'insufficient_data',
              detail: 'comparator_insufficient_data'
            }
          ],
      missingRequirements: ['sufficient_comparator_data'],
      warnings: warnings,
      confidence: 'none',
      coveredAxes: axes.coveredAxes,
      insufficientAxes: axes.insufficientAxes.length
        ? axes.insufficientAxes
        : ['comparator'],
      untrustedAxes: axes.untrustedAxes,
      blockedAxes: axes.blockedAxes
    });
  }

  const coveredFields = coveredFieldsFromSummary(src.reviewedFieldCoverage);
  if (!coveredFields || coveredFields.length === 0) {
    return baseReport({
      canonicalKey: canonicalKey,
      readinessStatus: 'insufficient',
      readinessReasons: [
        {
          code: 'missing_reviewed_field_coverage',
          detail: 'reviewed_field_coverage_required'
        }
      ],
      blockingReasons: [
        {
          code: 'missing_reviewed_field_coverage',
          detail: 'reviewed_field_coverage_required'
        }
      ],
      missingRequirements: ['reviewedFieldCoverage'],
      warnings: warnings,
      confidence: 'none',
      coveredAxes: axes.coveredAxes,
      insufficientAxes: axes.insufficientAxes,
      untrustedAxes: axes.untrustedAxes,
      blockedAxes: axes.blockedAxes
    });
  }

  if (
    cmpStatus === 'not_comparable' ||
    (axes.coveredAxes.length === 0 && axes.insufficientAxes.length > 0)
  ) {
    const unsupported = hasBlockingCode(axisResults, 'unsupported_plant_field');
    return baseReport({
      canonicalKey: canonicalKey,
      readinessStatus: unsupported ? 'insufficient' : 'not_ready',
      readinessReasons: [
        {
          code: unsupported
            ? 'unsupported_fields'
            : 'missing_axis_context',
          detail: unsupported
            ? 'unsupported_plant_field'
            : 'not_comparable_or_missing_axis_context'
        }
      ],
      blockingReasons: blockingReasons.length
        ? blockingReasons
        : [
            {
              code: unsupported
                ? 'unsupported_fields'
                : 'missing_axis_context',
              detail: 'axis_not_ready'
            }
          ],
      missingRequirements: axes.insufficientAxes.slice(),
      warnings: warnings,
      confidence: 'none',
      coveredAxes: axes.coveredAxes,
      insufficientAxes: axes.insufficientAxes,
      untrustedAxes: axes.untrustedAxes,
      blockedAxes: axes.blockedAxes
    });
  }

  // Require reviewed coverage for every covered aligned axis.
  const missingCoverage = [];
  for (let i = 0; i < axes.coveredAxes.length; i++) {
    const axisName = axes.coveredAxes[i];
    if (coveredFields.indexOf(axisName) < 0) missingCoverage.push(axisName);
  }
  if (missingCoverage.length) {
    return baseReport({
      canonicalKey: canonicalKey,
      readinessStatus: 'insufficient',
      readinessReasons: [
        {
          code: 'missing_reviewed_field_coverage',
          detail: missingCoverage.join(',')
        }
      ],
      blockingReasons: [
        {
          code: 'missing_reviewed_field_coverage',
          detail: missingCoverage.join(',')
        }
      ],
      missingRequirements: missingCoverage.map(function (a) {
        return 'reviewedFieldCoverage.' + a;
      }),
      warnings: warnings,
      confidence: 'none',
      coveredAxes: axes.coveredAxes,
      insufficientAxes: axes.insufficientAxes.concat(missingCoverage),
      untrustedAxes: axes.untrustedAxes,
      blockedAxes: axes.blockedAxes
    });
  }

  if (axes.coveredAxes.length === 0) {
    return baseReport({
      canonicalKey: canonicalKey,
      readinessStatus: 'not_ready',
      readinessReasons: [
        {
          code: 'no_aligned_axes',
          detail: 'no_trusted_aligned_axis_coverage'
        }
      ],
      blockingReasons: [
        {
          code: 'no_aligned_axes',
          detail: 'no_trusted_aligned_axis_coverage'
        }
      ],
      missingRequirements: ['aligned_axis'],
      warnings: warnings,
      confidence: cmpConfidence,
      coveredAxes: [],
      insufficientAxes: axes.insufficientAxes,
      untrustedAxes: axes.untrustedAxes,
      blockedAxes: axes.blockedAxes
    });
  }

  const outWarnings = warnings.slice();
  outWarnings.push({
    code: 'no_recommendation_authority',
    detail: 'readiness_does_not_grant_recommendation_authority'
  });
  outWarnings.push({
    code: 'no_plant_suitability',
    detail: 'readiness_does_not_grant_plant_suitability'
  });
  outWarnings.push({
    code: 'candidate_review_only',
    detail: 'developer_owner_review_only_not_user_facing'
  });

  // Low confidence demotes to axis_partial even with aligned axes.
  if (
    cmpConfidence === 'low' ||
    cmpStatus === 'partial' ||
    hasBlockingCode(warnings, 'low_confidence_garden_context')
  ) {
    if (!hasBlockingCode(outWarnings, 'low_confidence_demotion')) {
      outWarnings.push({
        code: 'low_confidence_demotion',
        detail: 'low_confidence_or_partial_comparator_demotes_readiness'
      });
    }
    return baseReport({
      canonicalKey: canonicalKey,
      readinessStatus: 'axis_partial',
      readinessReasons: [
        {
          code: 'axis_partial',
          detail: 'aligned_axes_present_but_confidence_or_coverage_partial'
        }
      ],
      blockingReasons: [],
      warnings: outWarnings,
      confidence: 'low',
      coveredAxes: axes.coveredAxes,
      insufficientAxes: axes.insufficientAxes,
      untrustedAxes: axes.untrustedAxes,
      blockedAxes: axes.blockedAxes
    });
  }

  const hasSun = axes.coveredAxes.indexOf('sun') >= 0;
  const hasWater = axes.coveredAxes.indexOf('water') >= 0;
  const trustedMultiAxis =
    hasSun &&
    hasWater &&
    (cmpConfidence === 'medium' || cmpConfidence === 'high');

  if (trustedMultiAxis) {
    return baseReport({
      canonicalKey: canonicalKey,
      readinessStatus: 'candidate_review_ready',
      readinessReasons: [
        {
          code: 'candidate_review_ready',
          detail:
            'trusted_sun_and_water_axis_coverage_for_developer_owner_review_only'
        }
      ],
      blockingReasons: [],
      warnings: outWarnings,
      confidence: cmpConfidence,
      coveredAxes: axes.coveredAxes,
      insufficientAxes: axes.insufficientAxes,
      untrustedAxes: axes.untrustedAxes,
      blockedAxes: axes.blockedAxes
    });
  }

  // One aligned axis at most → axis_ready (never candidate recommendation).
  return baseReport({
    canonicalKey: canonicalKey,
    readinessStatus: 'axis_ready',
    readinessReasons: [
      {
        code: 'axis_ready',
        detail:
          'single_or_incomplete_trusted_aligned_axis_not_candidate_recommendation'
      }
    ],
    blockingReasons: [],
    warnings: outWarnings,
    confidence: cmpConfidence === 'none' ? 'low' : cmpConfidence,
    coveredAxes: axes.coveredAxes,
    insufficientAxes: axes.insufficientAxes,
    untrustedAxes: axes.untrustedAxes,
    blockedAxes: axes.blockedAxes
  });
}

function syntheticComparatorBase(partial) {
  return {
    comparisonVersion: '0.1.0-sr-plant-ccp-garden-context-comparison',
    capability: 'explicit_developer_plant_ccp_garden_context_comparison',
    developerOnly: true,
    syntheticOnly: true,
    activation: 'explicit_call_only',
    plantRef: partial.plantRef || {
      canonicalKey: 'lavender',
      field: 'sun',
      reviewedClaimType: 'preference',
      reviewedValue: 'full_sun',
      profileStatus: 'reviewed_supported',
      syntheticOnly: true
    },
    status: partial.status,
    result: partial.result,
    confidence: partial.confidence || 'none',
    axisResults: partial.axisResults || [],
    warnings: partial.warnings || [],
    blockingReasons: partial.blockingReasons || [],
    notAuthority: emptyNotAuthority(),
    plantSuitabilityAuthority: false,
    recommendationAuthority: false,
    productAuthority: false,
    runtimeEligibilityAuthority: false,
    overlayAuthority: false,
    liveWeather: false,
    gosConsumer: false,
    network: false,
    automaticExecution: false,
    writesArtifacts: false,
    commerceAuthority: false
  };
}

/** Embedded synthetic fixtures for harness / Node proof. */
export function getSmartRecDeveloperRecommendationReadinessReportSyntheticFixtures() {
  const coverageSun = {
    coveredFields: ['sun'],
    summary: 'sun_reviewed_supported',
    syntheticOnly: true
  };
  const coverageSunWater = {
    coveredFields: ['sun', 'water'],
    summary: 'sun_water_reviewed_supported',
    syntheticOnly: true
  };

  return freezeDeep({
    A: {
      canonicalKey: 'lavender',
      reviewedFieldCoverage: coverageSun,
      comparatorReport: syntheticComparatorBase({
        status: 'comparable',
        result: 'cautious_axis_alignment',
        confidence: 'high',
        plantRef: {
          canonicalKey: 'lavender',
          field: 'sun',
          reviewedClaimType: 'preference',
          reviewedValue: 'full_sun',
          profileStatus: 'reviewed_supported',
          syntheticOnly: true
        },
        axisResults: [
          {
            axis: 'sun',
            plantField: 'sun',
            gardenField: 'sunExposure',
            plantValue: 'full_sun',
            gardenValue: 'full_sun',
            outcome: 'cautious_axis_alignment',
            code: 'axis_comparable',
            detail: 'sun_preference_aligns_with_garden_sun_exposure'
          }
        ],
        warnings: [
          {
            code: 'no_plant_suitability',
            detail: 'axis_alignment_does_not_grant_plant_suitability'
          }
        ],
        blockingReasons: []
      }),
      syntheticOnly: true
    },
    B: {
      canonicalKey: 'lavender',
      reviewedFieldCoverage: coverageSunWater,
      comparatorReport: syntheticComparatorBase({
        status: 'comparable',
        result: 'cautious_axis_alignment',
        confidence: 'high',
        plantRef: {
          canonicalKey: 'lavender',
          field: 'sun',
          reviewedClaimType: 'preference',
          reviewedValue: 'full_sun',
          profileStatus: 'reviewed_supported',
          syntheticOnly: true
        },
        axisResults: [
          {
            axis: 'sun',
            plantField: 'sun',
            gardenField: 'sunExposure',
            plantValue: 'full_sun',
            gardenValue: 'full_sun',
            outcome: 'cautious_axis_alignment',
            code: 'axis_comparable',
            detail: 'sun_preference_aligns_with_garden_sun_exposure'
          },
          {
            axis: 'water',
            plantField: 'water',
            gardenField: 'irrigationType',
            plantValue: 'low',
            gardenValue: {
              drainage: 'well_drained',
              irrigationType: 'drip',
              irrigationReliability: 'high',
              plantingMode: 'ground'
            },
            outcome: 'cautious_axis_alignment',
            code: 'axis_comparable',
            detail:
              'low_water_preference_aligns_with_well_drained_irrigated_context'
          }
        ],
        warnings: [
          {
            code: 'no_plant_suitability',
            detail: 'axis_alignment_does_not_grant_plant_suitability'
          }
        ],
        blockingReasons: []
      }),
      syntheticOnly: true
    },
    C: {
      canonicalKey: 'lavender',
      reviewedFieldCoverage: coverageSun,
      comparatorReport: syntheticComparatorBase({
        status: 'blocked',
        result: 'hard_block',
        confidence: 'none',
        axisResults: [],
        warnings: [],
        blockingReasons: [
          {
            code: 'ccp_hard_block_wins',
            detail: 'blocked_ccp_not_overridden_by_garden_context'
          }
        ]
      }),
      syntheticOnly: true
    },
    D: {
      canonicalKey: 'lavender',
      reviewedFieldCoverage: coverageSun,
      comparatorReport: syntheticComparatorBase({
        status: 'untrusted',
        result: 'untrusted_context',
        confidence: 'none',
        axisResults: [
          {
            axis: 'sun',
            outcome: 'untrusted_context',
            code: 'untrusted_context',
            detail: 'garden_context_untrusted'
          }
        ],
        warnings: [],
        blockingReasons: [
          {
            code: 'untrusted_context',
            detail: 'garden_context_untrusted'
          }
        ]
      }),
      syntheticOnly: true
    },
    E: {
      canonicalKey: 'lavender',
      reviewedFieldCoverage: coverageSun,
      comparatorReport: syntheticComparatorBase({
        status: 'insufficient',
        result: 'insufficient_data',
        confidence: 'none',
        plantRef: null,
        axisResults: [],
        warnings: [],
        blockingReasons: [
          {
            code: 'insufficient_data',
            detail: 'plant_ref_required'
          }
        ]
      }),
      syntheticOnly: true
    },
    F: {
      canonicalKey: 'lavender',
      reviewedFieldCoverage: coverageSun,
      comparatorReport: syntheticComparatorBase({
        status: 'partial',
        result: 'cautious_axis_alignment',
        confidence: 'low',
        axisResults: [
          {
            axis: 'sun',
            plantField: 'sun',
            gardenField: 'sunExposure',
            plantValue: 'full_sun',
            gardenValue: 'full_sun',
            outcome: 'cautious_axis_alignment',
            code: 'axis_comparable',
            detail: 'sun_preference_aligns_with_low_confidence_garden_context'
          }
        ],
        warnings: [
          {
            code: 'low_confidence_garden_context',
            detail: 'garden_context_confidence_low'
          },
          {
            code: 'no_plant_suitability',
            detail: 'axis_alignment_does_not_grant_plant_suitability'
          }
        ],
        blockingReasons: []
      }),
      syntheticOnly: true
    },
    G: {
      canonicalKey: 'lavender',
      reviewedFieldCoverage: coverageSun,
      comparatorReport: null,
      syntheticOnly: true
    },
    H: {
      canonicalKey: 'lavender',
      reviewedFieldCoverage: coverageSun,
      comparatorReport: (function () {
        const report = syntheticComparatorBase({
          status: 'comparable',
          result: 'cautious_axis_alignment',
          confidence: 'high',
          axisResults: [
            {
              axis: 'sun',
              outcome: 'cautious_axis_alignment',
              code: 'axis_comparable',
              detail: 'sun_aligned'
            }
          ],
          warnings: [],
          blockingReasons: []
        });
        report.recommendationAuthority = true;
        return report;
      })(),
      syntheticOnly: true
    }
  });
}
