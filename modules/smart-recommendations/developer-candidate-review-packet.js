/**
 * Cruvit — Smart Recommendations developer Candidate Review Packet
 * -----------------------------------------------------------------
 * Pure, developer-only, synthetic-only review-packet builder over an
 * already built Recommendation Readiness Report.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Accepts already-built synthetic readiness reports only.
 *  - Does not import GOS, v1b, product runtime, overlay, or live weather.
 *  - Does not import the readiness module (fixtures embed synthetic reports).
 *  - Does not activate Smart Recommendations or Product Authority.
 *  - Does not recommend plants, grant eligibility, or plant suitability.
 *  - Does not implement Owner Review Queue UI or automatic approval.
 *  - candidateReviewOnly remains true — developer/owner review preparation only.
 */

export const SR_DEVELOPER_CANDIDATE_REVIEW_PACKET_VERSION =
  '0.1.0-sr-developer-candidate-review-packet';

export const SR_DEVELOPER_CANDIDATE_REVIEW_PACKET_CAPABILITY =
  'explicit_developer_candidate_review_packet';

export const SR_DEVELOPER_CANDIDATE_REVIEW_PACKET_STATUSES = Object.freeze([
  'not_ready',
  'blocked',
  'untrusted',
  'insufficient',
  'reviewable',
  'needs_more_data'
]);

export const SR_DEVELOPER_CANDIDATE_REVIEW_OWNER_DECISIONS = Object.freeze([
  'not_reviewed',
  'approved_later',
  'rejected_later',
  'needs_more_data'
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
  'commerceAuthority',
  'ownerApprovalAuthority'
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
    if (
      FORBIDDEN_LIVE_KEYS.indexOf(k) >= 0 &&
      isTruthyForbiddenLiveValue(v)
    ) {
      out.push(p);
    }
    if (v && typeof v === 'object') collectForbiddenLiveKeys(v, p, out);
  }
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
    if (k === 'notAuthority' && obj[k] && typeof obj[k] === 'object') {
      collectForbiddenAuthorityFlags(obj[k], p, out);
    }
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
    commerceAuthority: false,
    ownerApprovalAuthority: false
  };
}

function strengthenNotAuthority(src) {
  const base = emptyNotAuthority();
  const n = asObject(src);
  if (!n) return base;
  const keys = Object.keys(base);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    // Preserve false; never weaken (true would already have been fail-closed).
    if (n[k] === false) base[k] = false;
  }
  return base;
}

function mapConfidence(raw) {
  if (raw === 'high' || raw === 'medium' || raw === 'low' || raw === 'none') {
    return raw;
  }
  return 'none';
}

function cloneList(list) {
  return Array.isArray(list) ? list.slice() : [];
}

function buildDescriptor() {
  return freezeDeep({
    packetVersion: SR_DEVELOPER_CANDIDATE_REVIEW_PACKET_VERSION,
    capability: SR_DEVELOPER_CANDIDATE_REVIEW_PACKET_CAPABILITY,
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
    ownerApprovalAuthority: false,
    activation: 'explicit_call_only',
    candidateReviewOnly: true,
    noAutomaticApproval: true,
    doesNotGrantUserFacingRecommendation: true,
    doesNotImplementOwnerReviewQueueUi: true,
    doesNotActivateSmartRecommendations: true
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperCandidateReviewPacketDescriptor() {
  return DESCRIPTOR;
}

function buildSummaryFingerprint(packet) {
  return [
    SR_DEVELOPER_CANDIDATE_REVIEW_PACKET_VERSION,
    String(packet.packetStatus || ''),
    String(packet.ownerDecisionPlaceholder || ''),
    String(packet.candidateReviewOnly === true),
    String((packet.warnings && packet.warnings.length) || 0),
    String((packet.blockingReasons && packet.blockingReasons.length) || 0),
    String(
      (packet.missingRequirements && packet.missingRequirements.length) || 0
    ),
    stableSerialize(
      (packet.axisSummary && packet.axisSummary.coveredAxes) || []
    ),
    stableSerialize(
      (packet.axisSummary && packet.axisSummary.insufficientAxes) || []
    ),
    stableSerialize(
      (packet.riskSummary && packet.riskSummary.codes) || []
    )
  ].join('|');
}

function basePacket(partial) {
  const packet = {
    packetVersion: SR_DEVELOPER_CANDIDATE_REVIEW_PACKET_VERSION,
    capability: SR_DEVELOPER_CANDIDATE_REVIEW_PACKET_CAPABILITY,
    developerOnly: true,
    syntheticOnly: true,
    activation: 'explicit_call_only',
    candidateReviewOnly: true,
    packetStatus: partial.packetStatus || 'not_ready',
    plantRef: partial.plantRef || null,
    readinessRef: partial.readinessRef || null,
    evidenceSummary: partial.evidenceSummary || {
      readinessStatus: null,
      confidence: 'none',
      reasonCount: 0
    },
    axisSummary: partial.axisSummary || {
      coveredAxes: [],
      insufficientAxes: [],
      untrustedAxes: [],
      blockedAxes: []
    },
    riskSummary: partial.riskSummary || {
      codes: [],
      lowConfidence: false,
      automaticApproval: false
    },
    missingRequirements: partial.missingRequirements || [],
    warnings: partial.warnings || [],
    blockingReasons: partial.blockingReasons || [],
    ownerDecisionPlaceholder: 'not_reviewed',
    noAutomaticApproval: true,
    notAuthority: strengthenNotAuthority(
      partial.notAuthority || emptyNotAuthority()
    ),
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
    ownerApprovalAuthority: false,
    summaryFingerprint: ''
  };
  packet.summaryFingerprint = buildSummaryFingerprint(packet);
  return freezeDeep(packet);
}

function normalizePlantRef(canonicalKey, readiness) {
  const key = isNonEmptyString(canonicalKey)
    ? String(canonicalKey).trim()
    : readiness && isNonEmptyString(readiness.canonicalKey)
      ? String(readiness.canonicalKey).trim()
      : null;
  return {
    canonicalKey: key,
    syntheticOnly: true
  };
}

function normalizeReadinessRef(readiness) {
  if (!readiness) return null;
  return {
    reportVersion: readiness.reportVersion || null,
    capability: readiness.capability || null,
    readinessStatus: readiness.readinessStatus || null,
    confidence: mapConfidence(readiness.confidence),
    candidateReviewOnly: readiness.candidateReviewOnly === true,
    summaryFingerprint: readiness.summaryFingerprint || null,
    syntheticOnly: readiness.syntheticOnly === true
  };
}

function hasCode(list, code) {
  return (list || []).some(function (x) {
    return x && x.code === code;
  });
}

/**
 * Build a developer-only Candidate Review Packet from a readiness report.
 * @param {object|null} input
 * @returns {object} frozen packet
 */
export function buildDeveloperCandidateReviewPacket(input) {
  const src = asObject(input) || {};
  const readiness = asObject(src.readinessReport);

  const forbiddenLive = [];
  collectForbiddenLiveKeys(src, 'input', forbiddenLive);
  if (forbiddenLive.length) {
    return basePacket({
      packetStatus: 'blocked',
      plantRef: normalizePlantRef(src.canonicalKey, readiness),
      readinessRef: normalizeReadinessRef(readiness),
      blockingReasons: [
        {
          code: 'forbidden_live_or_provider_keys',
          detail: forbiddenLive.sort().join(',')
        }
      ],
      riskSummary: {
        codes: ['forbidden_live_or_provider_keys'],
        lowConfidence: false,
        automaticApproval: false
      },
      warnings: [
        {
          code: 'no_automatic_approval',
          detail: 'packet_never_auto_approves'
        }
      ]
    });
  }

  const forbiddenAuth = [];
  collectForbiddenAuthorityFlags(src, 'input', forbiddenAuth);
  if (readiness) {
    collectForbiddenAuthorityFlags(readiness, 'readinessReport', forbiddenAuth);
  }
  if (forbiddenAuth.length) {
    return basePacket({
      packetStatus: 'blocked',
      plantRef: normalizePlantRef(src.canonicalKey, readiness),
      readinessRef: normalizeReadinessRef(readiness),
      blockingReasons: [
        {
          code: 'forbidden_authority_flag',
          detail: forbiddenAuth.sort().join(',')
        }
      ],
      riskSummary: {
        codes: ['forbidden_authority_flag'],
        lowConfidence: false,
        automaticApproval: false
      },
      warnings: [
        {
          code: 'no_automatic_approval',
          detail: 'packet_never_auto_approves'
        }
      ]
    });
  }

  if (!readiness) {
    return basePacket({
      packetStatus: 'not_ready',
      plantRef: normalizePlantRef(src.canonicalKey, null),
      readinessRef: null,
      missingRequirements: ['readinessReport'],
      blockingReasons: [
        {
          code: 'missing_readiness_report',
          detail: 'readiness_report_required'
        }
      ],
      riskSummary: {
        codes: ['missing_readiness_report'],
        lowConfidence: false,
        automaticApproval: false
      },
      warnings: [
        {
          code: 'no_automatic_approval',
          detail: 'packet_never_auto_approves'
        }
      ]
    });
  }

  const readinessStatus = isNonEmptyString(src.readinessStatus)
    ? String(src.readinessStatus).trim()
    : String(readiness.readinessStatus || '');
  const confidence = mapConfidence(
    src.confidence != null ? src.confidence : readiness.confidence
  );
  const coveredAxes = Array.isArray(src.coveredAxes)
    ? src.coveredAxes.slice()
    : cloneList(readiness.coveredAxes);
  const insufficientAxes = Array.isArray(src.insufficientAxes)
    ? src.insufficientAxes.slice()
    : cloneList(readiness.insufficientAxes);
  const untrustedAxes = Array.isArray(src.untrustedAxes)
    ? src.untrustedAxes.slice()
    : cloneList(readiness.untrustedAxes);
  const blockedAxes = Array.isArray(src.blockedAxes)
    ? src.blockedAxes.slice()
    : cloneList(readiness.blockedAxes);
  const warnings = Array.isArray(src.warnings)
    ? src.warnings.slice()
    : cloneList(readiness.warnings);
  const blockingReasons = Array.isArray(src.blockingReasons)
    ? src.blockingReasons.slice()
    : cloneList(readiness.blockingReasons);
  const missingRequirements = Array.isArray(src.missingRequirements)
    ? src.missingRequirements.slice()
    : cloneList(readiness.missingRequirements);
  const readinessReasons = Array.isArray(src.readinessReasons)
    ? src.readinessReasons.slice()
    : cloneList(readiness.readinessReasons);

  const axisSummary = {
    coveredAxes: coveredAxes,
    insufficientAxes: insufficientAxes,
    untrustedAxes: untrustedAxes,
    blockedAxes: blockedAxes,
    axisResults: Array.isArray(src.axisResults)
      ? src.axisResults
      : Array.isArray(src.axisSummary)
        ? src.axisSummary
        : Array.isArray(readiness.axisResults)
          ? readiness.axisResults
          : []
  };

  const evidenceSummary = {
    readinessStatus: readinessStatus || null,
    confidence: confidence,
    reasonCount: readinessReasons.length,
    readinessReasons: readinessReasons,
    comparatorSummary: asObject(src.comparatorSummary) || null
  };

  const outWarnings = warnings.slice();
  if (!hasCode(outWarnings, 'no_automatic_approval')) {
    outWarnings.push({
      code: 'no_automatic_approval',
      detail: 'packet_never_auto_approves'
    });
  }
  if (!hasCode(outWarnings, 'candidate_review_only')) {
    outWarnings.push({
      code: 'candidate_review_only',
      detail: 'developer_owner_review_preparation_only_not_user_facing'
    });
  }
  if (!hasCode(outWarnings, 'no_recommendation_authority')) {
    outWarnings.push({
      code: 'no_recommendation_authority',
      detail: 'packet_does_not_grant_recommendation_authority'
    });
  }
  if (!hasCode(outWarnings, 'no_plant_suitability')) {
    outWarnings.push({
      code: 'no_plant_suitability',
      detail: 'packet_does_not_grant_plant_suitability'
    });
  }

  const common = {
    plantRef: normalizePlantRef(src.canonicalKey, readiness),
    readinessRef: normalizeReadinessRef(readiness),
    evidenceSummary: evidenceSummary,
    axisSummary: axisSummary,
    missingRequirements: missingRequirements,
    warnings: outWarnings,
    blockingReasons: blockingReasons,
    notAuthority: strengthenNotAuthority(readiness.notAuthority)
  };

  if (readinessStatus === 'blocked') {
    return basePacket(
      Object.assign({}, common, {
        packetStatus: 'blocked',
        riskSummary: {
          codes: ['readiness_blocked'],
          lowConfidence: confidence === 'low',
          automaticApproval: false
        }
      })
    );
  }

  if (readinessStatus === 'untrusted') {
    return basePacket(
      Object.assign({}, common, {
        packetStatus: 'untrusted',
        riskSummary: {
          codes: ['readiness_untrusted'],
          lowConfidence: confidence === 'low',
          automaticApproval: false
        }
      })
    );
  }

  if (readinessStatus === 'insufficient') {
    return basePacket(
      Object.assign({}, common, {
        packetStatus: 'insufficient',
        riskSummary: {
          codes: ['readiness_insufficient'],
          lowConfidence: confidence === 'low',
          automaticApproval: false
        }
      })
    );
  }

  if (readinessStatus === 'not_ready') {
    return basePacket(
      Object.assign({}, common, {
        packetStatus: 'not_ready',
        riskSummary: {
          codes: ['readiness_not_ready'],
          lowConfidence: confidence === 'low',
          automaticApproval: false
        }
      })
    );
  }

  // Low confidence / axis_partial → needs_more_data with visible warning.
  if (
    confidence === 'low' ||
    readinessStatus === 'axis_partial' ||
    hasCode(warnings, 'low_confidence_demotion') ||
    hasCode(warnings, 'low_confidence_garden_context')
  ) {
    if (!hasCode(outWarnings, 'low_confidence_visible')) {
      outWarnings.push({
        code: 'low_confidence_visible',
        detail: 'low_confidence_requires_more_data_before_review_approval'
      });
    }
    return basePacket(
      Object.assign({}, common, {
        packetStatus: 'needs_more_data',
        warnings: outWarnings,
        riskSummary: {
          codes: ['low_confidence', 'needs_more_data'],
          lowConfidence: true,
          automaticApproval: false
        }
      })
    );
  }

  // One aligned axis (axis_ready) is insufficient for approval → needs_more_data.
  if (readinessStatus === 'axis_ready') {
    if (!hasCode(outWarnings, 'single_axis_insufficient_for_approval')) {
      outWarnings.push({
        code: 'single_axis_insufficient_for_approval',
        detail: 'axis_ready_is_not_recommendation_or_approval_ready'
      });
    }
    return basePacket(
      Object.assign({}, common, {
        packetStatus: 'needs_more_data',
        warnings: outWarnings,
        missingRequirements: missingRequirements.concat(['additional_trusted_axis']),
        riskSummary: {
          codes: ['axis_ready_needs_more_data'],
          lowConfidence: false,
          automaticApproval: false
        }
      })
    );
  }

  if (readinessStatus === 'candidate_review_ready') {
    return basePacket(
      Object.assign({}, common, {
        packetStatus: 'reviewable',
        warnings: outWarnings,
        riskSummary: {
          codes: ['candidate_review_ready_reviewable_only'],
          lowConfidence: false,
          automaticApproval: false
        }
      })
    );
  }

  // Unknown / unsupported readiness status → fail closed.
  return basePacket(
    Object.assign({}, common, {
      packetStatus: 'not_ready',
      blockingReasons: blockingReasons.concat([
        {
          code: 'unsupported_readiness_status',
          detail: readinessStatus || 'missing'
        }
      ]),
      riskSummary: {
        codes: ['unsupported_readiness_status'],
        lowConfidence: confidence === 'low',
        automaticApproval: false
      }
    })
  );
}

function syntheticReadinessBase(partial) {
  return {
    reportVersion: '0.1.0-sr-recommendation-readiness-report',
    capability: 'explicit_developer_recommendation_readiness_report',
    developerOnly: true,
    syntheticOnly: true,
    activation: 'explicit_call_only',
    canonicalKey: partial.canonicalKey || 'lavender',
    readinessStatus: partial.readinessStatus,
    readinessReasons: partial.readinessReasons || [],
    blockingReasons: partial.blockingReasons || [],
    missingRequirements: partial.missingRequirements || [],
    warnings: partial.warnings || [],
    confidence: partial.confidence || 'none',
    coveredAxes: partial.coveredAxes || [],
    insufficientAxes: partial.insufficientAxes || [],
    untrustedAxes: partial.untrustedAxes || [],
    blockedAxes: partial.blockedAxes || [],
    axisResults: partial.axisResults || [],
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
    ownerApprovalAuthority: false
  };
}

/** Embedded synthetic fixtures for harness / Node proof. */
export function getSmartRecDeveloperCandidateReviewPacketSyntheticFixtures() {
  return freezeDeep({
    A: {
      canonicalKey: 'lavender',
      readinessReport: syntheticReadinessBase({
        readinessStatus: 'candidate_review_ready',
        confidence: 'high',
        coveredAxes: ['sun', 'water'],
        readinessReasons: [
          {
            code: 'candidate_review_ready',
            detail:
              'trusted_sun_and_water_axis_coverage_for_developer_owner_review_only'
          }
        ],
        warnings: [
          {
            code: 'candidate_review_only',
            detail: 'developer_owner_review_only_not_user_facing'
          }
        ],
        axisResults: [
          {
            axis: 'sun',
            outcome: 'cautious_axis_alignment',
            code: 'axis_comparable'
          },
          {
            axis: 'water',
            outcome: 'cautious_axis_alignment',
            code: 'axis_comparable'
          }
        ]
      }),
      syntheticOnly: true
    },
    B: {
      canonicalKey: 'lavender',
      readinessReport: syntheticReadinessBase({
        readinessStatus: 'axis_ready',
        confidence: 'high',
        coveredAxes: ['sun'],
        readinessReasons: [
          {
            code: 'axis_ready',
            detail:
              'single_or_incomplete_trusted_aligned_axis_not_candidate_recommendation'
          }
        ],
        warnings: [
          {
            code: 'candidate_review_only',
            detail: 'developer_owner_review_only_not_user_facing'
          }
        ],
        axisResults: [
          {
            axis: 'sun',
            outcome: 'cautious_axis_alignment',
            code: 'axis_comparable'
          }
        ]
      }),
      syntheticOnly: true
    },
    C: {
      canonicalKey: 'lavender',
      readinessReport: syntheticReadinessBase({
        readinessStatus: 'blocked',
        confidence: 'none',
        blockedAxes: ['comparator'],
        blockingReasons: [
          {
            code: 'comparator_hard_block',
            detail: 'hard_block_in_comparator'
          }
        ]
      }),
      syntheticOnly: true
    },
    D: {
      canonicalKey: 'lavender',
      readinessReport: syntheticReadinessBase({
        readinessStatus: 'untrusted',
        confidence: 'none',
        untrustedAxes: ['sun'],
        blockingReasons: [
          {
            code: 'untrusted_context',
            detail: 'comparator_untrusted_context'
          }
        ]
      }),
      syntheticOnly: true
    },
    E: {
      canonicalKey: 'lavender',
      readinessReport: syntheticReadinessBase({
        readinessStatus: 'insufficient',
        confidence: 'none',
        insufficientAxes: ['comparator'],
        blockingReasons: [
          {
            code: 'insufficient_data',
            detail: 'comparator_insufficient_data'
          }
        ],
        missingRequirements: ['sufficient_comparator_data']
      }),
      syntheticOnly: true
    },
    F: {
      canonicalKey: 'lavender',
      readinessReport: syntheticReadinessBase({
        readinessStatus: 'axis_partial',
        confidence: 'low',
        coveredAxes: ['sun'],
        readinessReasons: [
          {
            code: 'axis_partial',
            detail: 'aligned_axes_present_but_confidence_or_coverage_partial'
          }
        ],
        warnings: [
          {
            code: 'low_confidence_demotion',
            detail: 'low_confidence_or_partial_comparator_demotes_readiness'
          }
        ],
        axisResults: [
          {
            axis: 'sun',
            outcome: 'cautious_axis_alignment',
            code: 'axis_comparable'
          }
        ]
      }),
      syntheticOnly: true
    },
    G: {
      canonicalKey: 'lavender',
      readinessReport: null,
      syntheticOnly: true
    },
    H: {
      canonicalKey: 'lavender',
      readinessReport: (function () {
        const report = syntheticReadinessBase({
          readinessStatus: 'candidate_review_ready',
          confidence: 'high',
          coveredAxes: ['sun', 'water']
        });
        report.recommendationAuthority = true;
        return report;
      })(),
      syntheticOnly: true
    }
  });
}
