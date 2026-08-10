/**
 * Cruvit — Smart Recommendations developer Owner Review Queue
 * ------------------------------------------------------------
 * Pure, developer-only, synthetic-only queue-item builder over an
 * already built Developer Candidate Review Packet.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Accepts already-built synthetic candidate review packets only.
 *  - Does not import GOS, v1b, product runtime, overlay, or live weather.
 *  - Does not import the packet module (fixtures embed synthetic packets).
 *  - Does not activate Smart Recommendations or Product Authority.
 *  - Does not recommend plants, grant eligibility, or plant suitability.
 *  - Does not implement Owner Review Queue UI.
 *  - Does not automatically produce approved_later or rejected_later.
 *  - candidateReviewOnly remains true — developer/owner review organization only.
 */

export const SR_DEVELOPER_OWNER_REVIEW_QUEUE_VERSION =
  '0.1.0-sr-owner-review-queue';

export const SR_DEVELOPER_OWNER_REVIEW_QUEUE_CAPABILITY =
  'explicit_developer_owner_review_queue';

export const SR_DEVELOPER_OWNER_REVIEW_QUEUE_STATUSES = Object.freeze([
  'queued',
  'not_reviewed',
  'needs_more_data',
  'blocked',
  'archived_later'
]);

export const SR_DEVELOPER_OWNER_REVIEW_QUEUE_OWNER_DECISIONS = Object.freeze([
  'not_reviewed',
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
    if (n[k] === false) base[k] = false;
  }
  return base;
}

function cloneList(list) {
  return Array.isArray(list) ? list.slice() : [];
}

function clonePlain(v) {
  if (v === null || typeof v !== 'object') return v;
  return JSON.parse(JSON.stringify(v));
}

function hasCode(list, code) {
  return (list || []).some(function (x) {
    return x && x.code === code;
  });
}

function buildDescriptor() {
  return freezeDeep({
    queueVersion: SR_DEVELOPER_OWNER_REVIEW_QUEUE_VERSION,
    capability: SR_DEVELOPER_OWNER_REVIEW_QUEUE_CAPABILITY,
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
    doesNotActivateSmartRecommendations: true,
    doesNotProduceApprovedLaterAutomatically: true,
    doesNotProduceRejectedLaterAutomatically: true
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperOwnerReviewQueueDescriptor() {
  return DESCRIPTOR;
}

function buildSummaryFingerprint(item) {
  return [
    SR_DEVELOPER_OWNER_REVIEW_QUEUE_VERSION,
    String(item.queueStatus || ''),
    String(item.ownerDecision || ''),
    String(item.candidateReviewOnly === true),
    String(item.noAutomaticApproval === true),
    String((item.preservedWarnings && item.preservedWarnings.length) || 0),
    String(
      (item.preservedBlockingReasons && item.preservedBlockingReasons.length) ||
        0
    ),
    String(
      (item.preservedMissingRequirements &&
        item.preservedMissingRequirements.length) ||
        0
    ),
    stableSerialize((item.plantRef && item.plantRef.canonicalKey) || null),
    stableSerialize(
      (item.sourcePacketRef && item.sourcePacketRef.packetStatus) || null
    )
  ].join('|');
}

function makeQueueItemId(plantKey, packetStatus, queueStatus) {
  return [
    'orq',
    String(plantKey || 'unknown'),
    String(packetStatus || 'none'),
    String(queueStatus || 'none')
  ].join('-');
}

function baseItem(partial) {
  const item = {
    queueVersion: SR_DEVELOPER_OWNER_REVIEW_QUEUE_VERSION,
    capability: SR_DEVELOPER_OWNER_REVIEW_QUEUE_CAPABILITY,
    developerOnly: true,
    syntheticOnly: true,
    activation: 'explicit_call_only',
    candidateReviewOnly: true,
    queueItemId: partial.queueItemId || 'orq-unknown',
    queueStatus: partial.queueStatus || 'not_reviewed',
    sourcePacketRef: partial.sourcePacketRef || null,
    plantRef: partial.plantRef || null,
    preservedEvidenceSummary: partial.preservedEvidenceSummary || null,
    preservedRiskSummary: partial.preservedRiskSummary || {
      codes: [],
      lowConfidence: false,
      automaticApproval: false
    },
    preservedMissingRequirements: partial.preservedMissingRequirements || [],
    preservedWarnings: partial.preservedWarnings || [],
    preservedBlockingReasons: partial.preservedBlockingReasons || [],
    ownerDecision: 'not_reviewed',
    ownerDecisionReason: partial.ownerDecisionReason || null,
    requiredFollowUp: partial.requiredFollowUp || [],
    reviewer: null,
    reviewedAt: null,
    decisionVersion: '0',
    auditTrail: partial.auditTrail || [],
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

  // Inert implementation: only not_reviewed or needs_more_data are allowed.
  if (partial.ownerDecision === 'needs_more_data') {
    item.ownerDecision = 'needs_more_data';
  } else {
    item.ownerDecision = 'not_reviewed';
  }

  if (!Array.isArray(item.auditTrail) || item.auditTrail.length === 0) {
    item.auditTrail = [
      {
        event: 'queue_item_created',
        ownerDecision: item.ownerDecision,
        queueStatus: item.queueStatus,
        reversible: true,
        automaticApproval: false
      }
    ];
  }

  item.summaryFingerprint = buildSummaryFingerprint(item);
  return freezeDeep(item);
}

function normalizePlantRef(packet, input) {
  const fromPacket =
    packet && asObject(packet.plantRef) ? packet.plantRef : null;
  const key = isNonEmptyString(input && input.canonicalKey)
    ? String(input.canonicalKey).trim()
    : fromPacket && isNonEmptyString(fromPacket.canonicalKey)
      ? String(fromPacket.canonicalKey).trim()
      : packet && isNonEmptyString(packet.canonicalKey)
        ? String(packet.canonicalKey).trim()
        : null;
  return {
    canonicalKey: key,
    syntheticOnly: true
  };
}

function normalizeSourcePacketRef(packet) {
  if (!packet) return null;
  return {
    packetVersion: packet.packetVersion || null,
    capability: packet.capability || null,
    packetStatus: packet.packetStatus || null,
    candidateReviewOnly: packet.candidateReviewOnly === true,
    noAutomaticApproval: packet.noAutomaticApproval === true,
    ownerDecisionPlaceholder: packet.ownerDecisionPlaceholder || null,
    summaryFingerprint: packet.summaryFingerprint || null,
    syntheticOnly: packet.syntheticOnly === true
  };
}

function ensureNoAutoApprovalWarnings(warnings) {
  const out = cloneList(warnings);
  if (!hasCode(out, 'no_automatic_approval')) {
    out.push({
      code: 'no_automatic_approval',
      detail: 'queue_never_auto_approves'
    });
  }
  if (!hasCode(out, 'no_approved_later_automatic')) {
    out.push({
      code: 'no_approved_later_automatic',
      detail: 'approved_later_not_produced_by_inert_queue'
    });
  }
  if (!hasCode(out, 'no_rejected_later_automatic')) {
    out.push({
      code: 'no_rejected_later_automatic',
      detail: 'rejected_later_not_produced_by_inert_queue'
    });
  }
  if (!hasCode(out, 'candidate_review_only')) {
    out.push({
      code: 'candidate_review_only',
      detail: 'developer_owner_review_organization_only_not_user_facing'
    });
  }
  if (!hasCode(out, 'no_owner_review_queue_ui')) {
    out.push({
      code: 'no_owner_review_queue_ui',
      detail: 'inert_queue_item_only_no_ui'
    });
  }
  return out;
}

/**
 * Build a developer-only Owner Review Queue item from a candidate review packet.
 * @param {object|null} input
 * @returns {object} frozen queue item
 */
export function buildDeveloperOwnerReviewQueueItem(input) {
  const src = asObject(input) || {};
  const packet = asObject(src.candidateReviewPacket) || asObject(src.packet);

  const forbiddenLive = [];
  collectForbiddenLiveKeys(src, 'input', forbiddenLive);
  if (forbiddenLive.length) {
    const plantRef = normalizePlantRef(packet, src);
    return baseItem({
      queueItemId: makeQueueItemId(
        plantRef.canonicalKey,
        packet && packet.packetStatus,
        'blocked'
      ),
      queueStatus: 'blocked',
      plantRef: plantRef,
      sourcePacketRef: normalizeSourcePacketRef(packet),
      preservedBlockingReasons: [
        {
          code: 'forbidden_live_or_provider_keys',
          detail: forbiddenLive.sort().join(',')
        }
      ],
      preservedWarnings: ensureNoAutoApprovalWarnings([]),
      preservedRiskSummary: {
        codes: ['forbidden_live_or_provider_keys'],
        lowConfidence: false,
        automaticApproval: false
      },
      ownerDecision: 'not_reviewed',
      ownerDecisionReason: 'forbidden_live_or_provider_keys',
      notAuthority: emptyNotAuthority()
    });
  }

  const forbiddenAuth = [];
  collectForbiddenAuthorityFlags(src, 'input', forbiddenAuth);
  if (packet) {
    collectForbiddenAuthorityFlags(packet, 'candidateReviewPacket', forbiddenAuth);
  }
  if (forbiddenAuth.length) {
    const plantRef = normalizePlantRef(packet, src);
    return baseItem({
      queueItemId: makeQueueItemId(
        plantRef.canonicalKey,
        packet && packet.packetStatus,
        'blocked'
      ),
      queueStatus: 'blocked',
      plantRef: plantRef,
      sourcePacketRef: normalizeSourcePacketRef(packet),
      preservedBlockingReasons: [
        {
          code: 'forbidden_authority_flag',
          detail: forbiddenAuth.sort().join(',')
        }
      ],
      preservedWarnings: ensureNoAutoApprovalWarnings(
        packet ? cloneList(packet.warnings) : []
      ),
      preservedMissingRequirements: packet
        ? cloneList(packet.missingRequirements)
        : [],
      preservedRiskSummary: {
        codes: ['forbidden_authority_flag'],
        lowConfidence: false,
        automaticApproval: false
      },
      ownerDecision: 'not_reviewed',
      ownerDecisionReason: 'forbidden_authority_flag',
      notAuthority: emptyNotAuthority()
    });
  }

  if (!packet) {
    const plantRef = normalizePlantRef(null, src);
    return baseItem({
      queueItemId: makeQueueItemId(plantRef.canonicalKey, 'none', 'blocked'),
      queueStatus: 'blocked',
      plantRef: plantRef,
      sourcePacketRef: null,
      preservedMissingRequirements: ['candidateReviewPacket'],
      preservedBlockingReasons: [
        {
          code: 'missing_candidate_review_packet',
          detail: 'candidate_review_packet_required'
        }
      ],
      preservedWarnings: ensureNoAutoApprovalWarnings([]),
      preservedRiskSummary: {
        codes: ['missing_candidate_review_packet'],
        lowConfidence: false,
        automaticApproval: false
      },
      ownerDecision: 'not_reviewed',
      ownerDecisionReason: 'missing_candidate_review_packet',
      requiredFollowUp: ['provide_candidate_review_packet'],
      notAuthority: emptyNotAuthority()
    });
  }

  const packetStatus = isNonEmptyString(src.packetStatus)
    ? String(src.packetStatus).trim()
    : String(packet.packetStatus || '');
  const plantRef = normalizePlantRef(packet, src);
  const missingRequirements = Array.isArray(src.missingRequirements)
    ? src.missingRequirements.slice()
    : cloneList(packet.missingRequirements);
  const warnings = ensureNoAutoApprovalWarnings(
    Array.isArray(src.warnings) ? src.warnings.slice() : cloneList(packet.warnings)
  );
  const blockingReasons = Array.isArray(src.blockingReasons)
    ? src.blockingReasons.slice()
    : cloneList(packet.blockingReasons);
  const evidenceSummary =
    asObject(src.evidenceSummary) ||
    clonePlain(packet.evidenceSummary) ||
    null;
  const riskSummary =
    asObject(src.riskSummary) ||
    clonePlain(packet.riskSummary) || {
      codes: [],
      lowConfidence: false,
      automaticApproval: false
    };
  riskSummary.automaticApproval = false;

  const common = {
    plantRef: plantRef,
    sourcePacketRef: normalizeSourcePacketRef(packet),
    preservedEvidenceSummary: evidenceSummary,
    preservedRiskSummary: riskSummary,
    preservedMissingRequirements: missingRequirements,
    preservedWarnings: warnings,
    preservedBlockingReasons: blockingReasons,
    notAuthority: strengthenNotAuthority(packet.notAuthority)
  };

  if (packetStatus === 'blocked') {
    return baseItem(
      Object.assign({}, common, {
        queueItemId: makeQueueItemId(plantRef.canonicalKey, packetStatus, 'blocked'),
        queueStatus: 'blocked',
        ownerDecision: 'not_reviewed',
        ownerDecisionReason: 'packet_blocked',
        requiredFollowUp: ['resolve_packet_blocking_reasons']
      })
    );
  }

  if (packetStatus === 'untrusted') {
    return baseItem(
      Object.assign({}, common, {
        queueItemId: makeQueueItemId(
          plantRef.canonicalKey,
          packetStatus,
          'needs_more_data'
        ),
        queueStatus: 'needs_more_data',
        ownerDecision: 'needs_more_data',
        ownerDecisionReason: 'packet_untrusted',
        requiredFollowUp: ['replace_untrusted_evidence'],
        preservedMissingRequirements: missingRequirements.length
          ? missingRequirements
          : ['trusted_evidence']
      })
    );
  }

  if (packetStatus === 'insufficient') {
    return baseItem(
      Object.assign({}, common, {
        queueItemId: makeQueueItemId(
          plantRef.canonicalKey,
          packetStatus,
          'needs_more_data'
        ),
        queueStatus: 'needs_more_data',
        ownerDecision: 'needs_more_data',
        ownerDecisionReason: 'packet_insufficient',
        requiredFollowUp: ['supply_sufficient_evidence'],
        preservedMissingRequirements: missingRequirements.length
          ? missingRequirements
          : ['sufficient_evidence']
      })
    );
  }

  if (packetStatus === 'needs_more_data') {
    return baseItem(
      Object.assign({}, common, {
        queueItemId: makeQueueItemId(
          plantRef.canonicalKey,
          packetStatus,
          'needs_more_data'
        ),
        queueStatus: 'needs_more_data',
        ownerDecision: 'needs_more_data',
        ownerDecisionReason: 'packet_needs_more_data',
        requiredFollowUp: missingRequirements.length
          ? missingRequirements.slice()
          : ['additional_trusted_axis_or_evidence'],
        preservedMissingRequirements: missingRequirements
      })
    );
  }

  if (packetStatus === 'not_ready') {
    return baseItem(
      Object.assign({}, common, {
        queueItemId: makeQueueItemId(
          plantRef.canonicalKey,
          packetStatus,
          'not_reviewed'
        ),
        queueStatus: 'not_reviewed',
        ownerDecision: 'not_reviewed',
        ownerDecisionReason: 'packet_not_ready',
        requiredFollowUp: ['complete_readiness_and_packet']
      })
    );
  }

  if (packetStatus === 'reviewable') {
    return baseItem(
      Object.assign({}, common, {
        queueItemId: makeQueueItemId(plantRef.canonicalKey, packetStatus, 'queued'),
        queueStatus: 'queued',
        ownerDecision: 'not_reviewed',
        ownerDecisionReason: 'packet_reviewable_awaiting_owner_decision',
        requiredFollowUp: []
      })
    );
  }

  // Unknown / unsupported packet status → fail closed.
  return baseItem(
    Object.assign({}, common, {
      queueItemId: makeQueueItemId(
        plantRef.canonicalKey,
        packetStatus || 'unknown',
        'blocked'
      ),
      queueStatus: 'blocked',
      ownerDecision: 'not_reviewed',
      ownerDecisionReason: 'unsupported_packet_status',
      preservedBlockingReasons: blockingReasons.concat([
        {
          code: 'unsupported_packet_status',
          detail: packetStatus || 'missing'
        }
      ]),
      requiredFollowUp: ['provide_supported_packet_status']
    })
  );
}

function syntheticPacketBase(partial) {
  return {
    packetVersion: '0.1.0-sr-developer-candidate-review-packet',
    capability: 'explicit_developer_candidate_review_packet',
    developerOnly: true,
    syntheticOnly: true,
    activation: 'explicit_call_only',
    candidateReviewOnly: true,
    packetStatus: partial.packetStatus,
    plantRef: {
      canonicalKey: partial.canonicalKey || 'lavender',
      syntheticOnly: true
    },
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
    ownerApprovalAuthority: false,
    summaryFingerprint: partial.summaryFingerprint || 'synthetic-packet'
  };
}

/** Embedded synthetic fixtures for harness / Node proof. */
export function getSmartRecDeveloperOwnerReviewQueueSyntheticFixtures() {
  return freezeDeep({
    A: {
      candidateReviewPacket: syntheticPacketBase({
        packetStatus: 'reviewable',
        evidenceSummary: {
          readinessStatus: 'candidate_review_ready',
          confidence: 'high',
          reasonCount: 1
        },
        axisSummary: {
          coveredAxes: ['sun', 'water'],
          insufficientAxes: [],
          untrustedAxes: [],
          blockedAxes: []
        },
        riskSummary: {
          codes: ['candidate_review_ready_reviewable_only'],
          lowConfidence: false,
          automaticApproval: false
        },
        warnings: [
          {
            code: 'candidate_review_only',
            detail: 'developer_owner_review_only_not_user_facing'
          }
        ]
      }),
      syntheticOnly: true
    },
    B: {
      candidateReviewPacket: syntheticPacketBase({
        packetStatus: 'needs_more_data',
        evidenceSummary: {
          readinessStatus: 'axis_ready',
          confidence: 'high',
          reasonCount: 1
        },
        axisSummary: {
          coveredAxes: ['sun'],
          insufficientAxes: [],
          untrustedAxes: [],
          blockedAxes: []
        },
        missingRequirements: ['additional_trusted_axis'],
        warnings: [
          {
            code: 'single_axis_insufficient_for_approval',
            detail: 'axis_ready_is_not_recommendation_or_approval_ready'
          }
        ],
        riskSummary: {
          codes: ['axis_ready_needs_more_data'],
          lowConfidence: false,
          automaticApproval: false
        }
      }),
      syntheticOnly: true
    },
    C: {
      candidateReviewPacket: syntheticPacketBase({
        packetStatus: 'blocked',
        blockingReasons: [
          {
            code: 'comparator_hard_block',
            detail: 'hard_block_in_comparator'
          }
        ],
        riskSummary: {
          codes: ['readiness_blocked'],
          lowConfidence: false,
          automaticApproval: false
        }
      }),
      syntheticOnly: true
    },
    D: {
      candidateReviewPacket: syntheticPacketBase({
        packetStatus: 'untrusted',
        axisSummary: {
          coveredAxes: [],
          insufficientAxes: [],
          untrustedAxes: ['sun'],
          blockedAxes: []
        },
        blockingReasons: [
          {
            code: 'untrusted_context',
            detail: 'comparator_untrusted_context'
          }
        ],
        riskSummary: {
          codes: ['readiness_untrusted'],
          lowConfidence: false,
          automaticApproval: false
        }
      }),
      syntheticOnly: true
    },
    E: {
      candidateReviewPacket: syntheticPacketBase({
        packetStatus: 'insufficient',
        missingRequirements: ['sufficient_comparator_data'],
        blockingReasons: [
          {
            code: 'insufficient_data',
            detail: 'comparator_insufficient_data'
          }
        ],
        riskSummary: {
          codes: ['readiness_insufficient'],
          lowConfidence: false,
          automaticApproval: false
        }
      }),
      syntheticOnly: true
    },
    F: {
      candidateReviewPacket: syntheticPacketBase({
        packetStatus: 'needs_more_data',
        evidenceSummary: {
          readinessStatus: 'axis_partial',
          confidence: 'low',
          reasonCount: 1
        },
        missingRequirements: ['higher_confidence_or_coverage'],
        warnings: [
          {
            code: 'low_confidence_visible',
            detail: 'low_confidence_requires_more_data_before_review_approval'
          },
          {
            code: 'low_confidence_demotion',
            detail: 'low_confidence_or_partial_comparator_demotes_readiness'
          }
        ],
        riskSummary: {
          codes: ['low_confidence', 'needs_more_data'],
          lowConfidence: true,
          automaticApproval: false
        }
      }),
      syntheticOnly: true
    },
    G: {
      candidateReviewPacket: null,
      canonicalKey: 'lavender',
      syntheticOnly: true
    },
    H: {
      candidateReviewPacket: (function () {
        const packet = syntheticPacketBase({
          packetStatus: 'reviewable',
          evidenceSummary: {
            readinessStatus: 'candidate_review_ready',
            confidence: 'high',
            reasonCount: 1
          },
          axisSummary: {
            coveredAxes: ['sun', 'water'],
            insufficientAxes: [],
            untrustedAxes: [],
            blockedAxes: []
          }
        });
        packet.recommendationAuthority = true;
        return packet;
      })(),
      syntheticOnly: true
    }
  });
}
