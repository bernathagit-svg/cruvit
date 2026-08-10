/**
 * Cruvit — Smart Recommendations developer Explicit Owner Decision
 * ----------------------------------------------------------------
 * Pure, developer-only, synthetic-only explicit decision recorder
 * over an already built Owner Review Queue item.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Accepts already-built synthetic Owner Review Queue items only.
 *  - Does not import GOS, v1b, product runtime, overlay, or live weather.
 *  - Does not import the queue module (fixtures embed synthetic queue items).
 *  - Does not activate Smart Recommendations or Product Authority.
 *  - Does not recommend plants, grant eligibility, or plant suitability.
 *  - Does not implement Owner Review Queue UI.
 *  - Does not apply decisions to catalog/recommendations/products.
 *  - approved_later / rejected_later only from explicit manual input.
 *  - Decision records remain evidence/audit data only.
 */

export const SR_DEVELOPER_EXPLICIT_OWNER_DECISION_VERSION =
  '0.1.0-sr-explicit-owner-decision';

export const SR_DEVELOPER_EXPLICIT_OWNER_DECISION_CAPABILITY =
  'explicit_developer_owner_decision';

export const SR_DEVELOPER_EXPLICIT_OWNER_DECISION_VALUES = Object.freeze([
  'approved_later',
  'rejected_later',
  'needs_more_data'
]);

export const SR_DEVELOPER_EXPLICIT_OWNER_DECISION_SOURCES = Object.freeze([
  'owner_manual',
  'developer_manual'
]);

export const SR_DEVELOPER_EXPLICIT_OWNER_DECISION_STATUSES = Object.freeze([
  'recorded',
  'blocked'
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

function buildDescriptor() {
  return freezeDeep({
    decisionVersion: SR_DEVELOPER_EXPLICIT_OWNER_DECISION_VERSION,
    capability: SR_DEVELOPER_EXPLICIT_OWNER_DECISION_CAPABILITY,
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
    noAutomaticApproval: true,
    explicitOwnerActionRequired: true,
    doesNotGrantUserFacingRecommendation: true,
    doesNotImplementOwnerReviewQueueUi: true,
    doesNotActivateSmartRecommendations: true,
    doesNotApplyDecisionsToCatalogOrProducts: true,
    doesNotProduceApprovedLaterAutomatically: true,
    doesNotProduceRejectedLaterAutomatically: true
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperExplicitOwnerDecisionDescriptor() {
  return DESCRIPTOR;
}

function buildSummaryFingerprint(item) {
  return [
    SR_DEVELOPER_EXPLICIT_OWNER_DECISION_VERSION,
    String(item.decisionStatus || ''),
    String(item.ownerDecision || ''),
    String(item.decisionSource || ''),
    String(item.explicitOwnerActionRequired === true),
    String(item.noAutomaticApproval === true),
    String(item.reversible === true),
    String((item.blockingReasons && item.blockingReasons.length) || 0),
    stableSerialize((item.plantRef && item.plantRef.canonicalKey) || null),
    stableSerialize(
      (item.queueItemRef && item.queueItemRef.queueItemId) || null
    )
  ].join('|');
}

function makeDecisionId(plantKey, decision, status) {
  return [
    'eod',
    String(plantKey || 'unknown'),
    String(decision || 'none'),
    String(status || 'none')
  ].join('-');
}

function normalizePlantRef(queueItem, input) {
  const fromQueue =
    queueItem && asObject(queueItem.plantRef) ? queueItem.plantRef : null;
  const key = isNonEmptyString(input && input.canonicalKey)
    ? String(input.canonicalKey).trim()
    : fromQueue && isNonEmptyString(fromQueue.canonicalKey)
      ? String(fromQueue.canonicalKey).trim()
      : null;
  return {
    canonicalKey: key,
    syntheticOnly: true
  };
}

function normalizeQueueItemRef(queueItem, input) {
  if (!queueItem && !isNonEmptyString(input && input.queueItemId)) return null;
  return {
    queueItemId: isNonEmptyString(input && input.queueItemId)
      ? String(input.queueItemId).trim()
      : queueItem && isNonEmptyString(queueItem.queueItemId)
        ? String(queueItem.queueItemId).trim()
        : null,
    queueStatus:
      (queueItem && queueItem.queueStatus) ||
      (input && input.previousQueueStatus) ||
      null,
    candidateReviewOnly:
      !queueItem || queueItem.candidateReviewOnly === true,
    noAutomaticApproval: true,
    syntheticOnly: true
  };
}

function normalizeSourcePacketRef(queueItem, input) {
  const fromQueue =
    queueItem && asObject(queueItem.sourcePacketRef)
      ? queueItem.sourcePacketRef
      : null;
  const id = isNonEmptyString(input && input.sourcePacketId)
    ? String(input.sourcePacketId).trim()
    : fromQueue && isNonEmptyString(fromQueue.summaryFingerprint)
      ? String(fromQueue.summaryFingerprint)
      : fromQueue && isNonEmptyString(fromQueue.packetStatus)
        ? 'packet-' + String(fromQueue.packetStatus)
        : null;
  if (!fromQueue && !id) return null;
  return {
    sourcePacketId: id,
    packetStatus: (fromQueue && fromQueue.packetStatus) || null,
    summaryFingerprint: (fromQueue && fromQueue.summaryFingerprint) || null,
    syntheticOnly: true
  };
}

function baseDecision(partial) {
  const item = {
    decisionVersion: SR_DEVELOPER_EXPLICIT_OWNER_DECISION_VERSION,
    capability: SR_DEVELOPER_EXPLICIT_OWNER_DECISION_CAPABILITY,
    developerOnly: true,
    syntheticOnly: true,
    activation: 'explicit_call_only',
    decisionId: partial.decisionId || 'eod-unknown',
    decisionStatus: partial.decisionStatus || 'blocked',
    queueItemRef: partial.queueItemRef || null,
    sourcePacketRef: partial.sourcePacketRef || null,
    plantRef: partial.plantRef || null,
    previousQueueStatus: partial.previousQueueStatus || null,
    ownerDecision: partial.ownerDecision || null,
    ownerDecisionReason: partial.ownerDecisionReason || null,
    requiredFollowUp: partial.requiredFollowUp || [],
    reviewer: partial.reviewer || null,
    reviewedAt: partial.reviewedAt || null,
    decisionSource: partial.decisionSource || null,
    reversible: true,
    supersedesDecisionId: partial.supersedesDecisionId || null,
    auditTrail: partial.auditTrail || [],
    preservedMissingRequirements: partial.preservedMissingRequirements || [],
    preservedWarnings: partial.preservedWarnings || [],
    preservedBlockingReasons: partial.preservedBlockingReasons || [],
    preservedEvidenceSummary: partial.preservedEvidenceSummary || null,
    blockingReasons: partial.blockingReasons || [],
    noAutomaticApproval: true,
    explicitOwnerActionRequired: true,
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

  if (!Array.isArray(item.auditTrail) || item.auditTrail.length === 0) {
    item.auditTrail = [
      {
        event:
          item.decisionStatus === 'recorded'
            ? 'explicit_owner_decision_recorded'
            : 'explicit_owner_decision_blocked',
        ownerDecision: item.ownerDecision,
        decisionStatus: item.decisionStatus,
        reversible: true,
        automaticApproval: false,
        explicitOwnerActionRequired: true
      }
    ];
  }

  item.summaryFingerprint = buildSummaryFingerprint(item);
  return freezeDeep(item);
}

function blockedDecision(partial) {
  return baseDecision(
    Object.assign({}, partial, {
      decisionStatus: 'blocked',
      ownerDecision: null,
      reversible: true,
      noAutomaticApproval: true,
      explicitOwnerActionRequired: true
    })
  );
}

/**
 * Record an explicit developer/owner decision for a synthetic queue item.
 * @param {object|null} input
 * @returns {object} frozen decision record
 */
export function buildDeveloperExplicitOwnerDecision(input) {
  const src = asObject(input) || {};
  const queueItem =
    asObject(src.ownerReviewQueueItem) ||
    asObject(src.queueItem) ||
    asObject(src.queue);

  const forbiddenLive = [];
  collectForbiddenLiveKeys(src, 'input', forbiddenLive);
  if (forbiddenLive.length) {
    const plantRef = normalizePlantRef(queueItem, src);
    return blockedDecision({
      decisionId: makeDecisionId(plantRef.canonicalKey, 'none', 'blocked'),
      plantRef: plantRef,
      queueItemRef: normalizeQueueItemRef(queueItem, src),
      sourcePacketRef: normalizeSourcePacketRef(queueItem, src),
      previousQueueStatus:
        (queueItem && queueItem.queueStatus) ||
        src.previousQueueStatus ||
        null,
      blockingReasons: [
        {
          code: 'forbidden_live_or_provider_keys',
          detail: forbiddenLive.sort().join(',')
        }
      ],
      ownerDecisionReason: 'forbidden_live_or_provider_keys',
      notAuthority: emptyNotAuthority()
    });
  }

  const forbiddenAuth = [];
  collectForbiddenAuthorityFlags(src, 'input', forbiddenAuth);
  if (queueItem) {
    collectForbiddenAuthorityFlags(queueItem, 'ownerReviewQueueItem', forbiddenAuth);
  }
  if (forbiddenAuth.length) {
    const plantRef = normalizePlantRef(queueItem, src);
    return blockedDecision({
      decisionId: makeDecisionId(plantRef.canonicalKey, 'none', 'blocked'),
      plantRef: plantRef,
      queueItemRef: normalizeQueueItemRef(queueItem, src),
      sourcePacketRef: normalizeSourcePacketRef(queueItem, src),
      previousQueueStatus:
        (queueItem && queueItem.queueStatus) ||
        src.previousQueueStatus ||
        null,
      preservedMissingRequirements: queueItem
        ? cloneList(queueItem.preservedMissingRequirements)
        : [],
      preservedWarnings: queueItem
        ? cloneList(queueItem.preservedWarnings)
        : [],
      preservedBlockingReasons: queueItem
        ? cloneList(queueItem.preservedBlockingReasons)
        : [],
      preservedEvidenceSummary: queueItem
        ? clonePlain(queueItem.preservedEvidenceSummary)
        : null,
      blockingReasons: [
        {
          code: 'forbidden_authority_flag',
          detail: forbiddenAuth.sort().join(',')
        }
      ],
      ownerDecisionReason: 'forbidden_authority_flag',
      notAuthority: emptyNotAuthority()
    });
  }

  if (!queueItem) {
    const plantRef = normalizePlantRef(null, src);
    return blockedDecision({
      decisionId: makeDecisionId(plantRef.canonicalKey, 'none', 'blocked'),
      plantRef: plantRef,
      queueItemRef: null,
      sourcePacketRef: null,
      previousQueueStatus: src.previousQueueStatus || null,
      blockingReasons: [
        {
          code: 'missing_owner_review_queue_item',
          detail: 'owner_review_queue_item_required'
        }
      ],
      ownerDecisionReason: 'missing_owner_review_queue_item',
      requiredFollowUp: ['provide_owner_review_queue_item'],
      notAuthority: emptyNotAuthority()
    });
  }

  const requestedDecision = isNonEmptyString(src.ownerDecision)
    ? String(src.ownerDecision).trim()
    : null;

  if (!requestedDecision) {
    const plantRef = normalizePlantRef(queueItem, src);
    return blockedDecision({
      decisionId: makeDecisionId(plantRef.canonicalKey, 'none', 'blocked'),
      plantRef: plantRef,
      queueItemRef: normalizeQueueItemRef(queueItem, src),
      sourcePacketRef: normalizeSourcePacketRef(queueItem, src),
      previousQueueStatus:
        queueItem.queueStatus || src.previousQueueStatus || null,
      preservedMissingRequirements: cloneList(
        queueItem.preservedMissingRequirements
      ),
      preservedWarnings: cloneList(queueItem.preservedWarnings),
      preservedBlockingReasons: cloneList(queueItem.preservedBlockingReasons),
      preservedEvidenceSummary: clonePlain(queueItem.preservedEvidenceSummary),
      blockingReasons: [
        {
          code: 'missing_explicit_owner_decision_request',
          detail: 'ownerDecision_required'
        }
      ],
      ownerDecisionReason: 'missing_explicit_owner_decision_request',
      notAuthority: strengthenNotAuthority(queueItem.notAuthority)
    });
  }

  if (
    SR_DEVELOPER_EXPLICIT_OWNER_DECISION_VALUES.indexOf(requestedDecision) < 0
  ) {
    const plantRef = normalizePlantRef(queueItem, src);
    return blockedDecision({
      decisionId: makeDecisionId(
        plantRef.canonicalKey,
        requestedDecision,
        'blocked'
      ),
      plantRef: plantRef,
      queueItemRef: normalizeQueueItemRef(queueItem, src),
      sourcePacketRef: normalizeSourcePacketRef(queueItem, src),
      previousQueueStatus:
        queueItem.queueStatus || src.previousQueueStatus || null,
      preservedMissingRequirements: cloneList(
        queueItem.preservedMissingRequirements
      ),
      preservedWarnings: cloneList(queueItem.preservedWarnings),
      preservedBlockingReasons: cloneList(queueItem.preservedBlockingReasons),
      preservedEvidenceSummary: clonePlain(queueItem.preservedEvidenceSummary),
      blockingReasons: [
        {
          code: 'invalid_owner_decision_value',
          detail: requestedDecision
        }
      ],
      ownerDecisionReason: 'invalid_owner_decision_value',
      notAuthority: strengthenNotAuthority(queueItem.notAuthority)
    });
  }

  const explicitOwnerActionRequired = src.explicitOwnerActionRequired === true;
  const decisionSource = isNonEmptyString(src.decisionSource)
    ? String(src.decisionSource).trim()
    : null;
  const manualSourceOk =
    decisionSource === 'owner_manual' || decisionSource === 'developer_manual';

  if (
    (requestedDecision === 'approved_later' ||
      requestedDecision === 'rejected_later') &&
    (!explicitOwnerActionRequired || !manualSourceOk)
  ) {
    const plantRef = normalizePlantRef(queueItem, src);
    return blockedDecision({
      decisionId: makeDecisionId(
        plantRef.canonicalKey,
        requestedDecision,
        'blocked'
      ),
      plantRef: plantRef,
      queueItemRef: normalizeQueueItemRef(queueItem, src),
      sourcePacketRef: normalizeSourcePacketRef(queueItem, src),
      previousQueueStatus:
        queueItem.queueStatus || src.previousQueueStatus || null,
      preservedMissingRequirements: cloneList(
        queueItem.preservedMissingRequirements
      ),
      preservedWarnings: cloneList(queueItem.preservedWarnings),
      preservedBlockingReasons: cloneList(queueItem.preservedBlockingReasons),
      preservedEvidenceSummary: clonePlain(queueItem.preservedEvidenceSummary),
      blockingReasons: [
        {
          code: 'explicit_owner_action_required',
          detail: !explicitOwnerActionRequired
            ? 'explicitOwnerActionRequired_must_be_true'
            : 'decisionSource_must_be_owner_manual_or_developer_manual'
        }
      ],
      ownerDecisionReason: 'explicit_owner_action_required',
      notAuthority: strengthenNotAuthority(queueItem.notAuthority)
    });
  }

  if (!isNonEmptyString(src.reviewer)) {
    const plantRef = normalizePlantRef(queueItem, src);
    return blockedDecision({
      decisionId: makeDecisionId(
        plantRef.canonicalKey,
        requestedDecision,
        'blocked'
      ),
      plantRef: plantRef,
      queueItemRef: normalizeQueueItemRef(queueItem, src),
      sourcePacketRef: normalizeSourcePacketRef(queueItem, src),
      previousQueueStatus:
        queueItem.queueStatus || src.previousQueueStatus || null,
      preservedMissingRequirements: cloneList(
        queueItem.preservedMissingRequirements
      ),
      preservedWarnings: cloneList(queueItem.preservedWarnings),
      preservedBlockingReasons: cloneList(queueItem.preservedBlockingReasons),
      preservedEvidenceSummary: clonePlain(queueItem.preservedEvidenceSummary),
      blockingReasons: [
        {
          code: 'missing_reviewer',
          detail: 'reviewer_required'
        }
      ],
      ownerDecisionReason: 'missing_reviewer',
      notAuthority: strengthenNotAuthority(queueItem.notAuthority)
    });
  }

  if (!isNonEmptyString(src.reviewedAt)) {
    const plantRef = normalizePlantRef(queueItem, src);
    return blockedDecision({
      decisionId: makeDecisionId(
        plantRef.canonicalKey,
        requestedDecision,
        'blocked'
      ),
      plantRef: plantRef,
      queueItemRef: normalizeQueueItemRef(queueItem, src),
      sourcePacketRef: normalizeSourcePacketRef(queueItem, src),
      previousQueueStatus:
        queueItem.queueStatus || src.previousQueueStatus || null,
      preservedMissingRequirements: cloneList(
        queueItem.preservedMissingRequirements
      ),
      preservedWarnings: cloneList(queueItem.preservedWarnings),
      preservedBlockingReasons: cloneList(queueItem.preservedBlockingReasons),
      preservedEvidenceSummary: clonePlain(queueItem.preservedEvidenceSummary),
      blockingReasons: [
        {
          code: 'missing_reviewed_at',
          detail: 'reviewedAt_required_explicit_synthetic_timestamp'
        }
      ],
      ownerDecisionReason: 'missing_reviewed_at',
      notAuthority: strengthenNotAuthority(queueItem.notAuthority)
    });
  }

  if (
    (requestedDecision === 'approved_later' ||
      requestedDecision === 'rejected_later') &&
    !isNonEmptyString(src.ownerDecisionReason)
  ) {
    const plantRef = normalizePlantRef(queueItem, src);
    return blockedDecision({
      decisionId: makeDecisionId(
        plantRef.canonicalKey,
        requestedDecision,
        'blocked'
      ),
      plantRef: plantRef,
      queueItemRef: normalizeQueueItemRef(queueItem, src),
      sourcePacketRef: normalizeSourcePacketRef(queueItem, src),
      previousQueueStatus:
        queueItem.queueStatus || src.previousQueueStatus || null,
      preservedMissingRequirements: cloneList(
        queueItem.preservedMissingRequirements
      ),
      preservedWarnings: cloneList(queueItem.preservedWarnings),
      preservedBlockingReasons: cloneList(queueItem.preservedBlockingReasons),
      preservedEvidenceSummary: clonePlain(queueItem.preservedEvidenceSummary),
      blockingReasons: [
        {
          code: 'missing_owner_decision_reason',
          detail: 'ownerDecisionReason_required_for_' + requestedDecision
        }
      ],
      ownerDecisionReason: 'missing_owner_decision_reason',
      notAuthority: strengthenNotAuthority(queueItem.notAuthority)
    });
  }

  const requiredFollowUp = Array.isArray(src.requiredFollowUp)
    ? src.requiredFollowUp.slice()
    : [];
  if (requestedDecision === 'needs_more_data' && requiredFollowUp.length === 0) {
    const plantRef = normalizePlantRef(queueItem, src);
    return blockedDecision({
      decisionId: makeDecisionId(
        plantRef.canonicalKey,
        requestedDecision,
        'blocked'
      ),
      plantRef: plantRef,
      queueItemRef: normalizeQueueItemRef(queueItem, src),
      sourcePacketRef: normalizeSourcePacketRef(queueItem, src),
      previousQueueStatus:
        queueItem.queueStatus || src.previousQueueStatus || null,
      preservedMissingRequirements: cloneList(
        queueItem.preservedMissingRequirements
      ),
      preservedWarnings: cloneList(queueItem.preservedWarnings),
      preservedBlockingReasons: cloneList(queueItem.preservedBlockingReasons),
      preservedEvidenceSummary: clonePlain(queueItem.preservedEvidenceSummary),
      blockingReasons: [
        {
          code: 'missing_required_follow_up',
          detail: 'requiredFollowUp_required_for_needs_more_data'
        }
      ],
      ownerDecisionReason: 'missing_required_follow_up',
      notAuthority: strengthenNotAuthority(queueItem.notAuthority)
    });
  }

  // needs_more_data also requires explicitOwnerActionRequired + manual source
  // when provided as an explicit decision request (not queue fail-closed alone).
  if (
    requestedDecision === 'needs_more_data' &&
    (!explicitOwnerActionRequired || !manualSourceOk)
  ) {
    const plantRef = normalizePlantRef(queueItem, src);
    return blockedDecision({
      decisionId: makeDecisionId(
        plantRef.canonicalKey,
        requestedDecision,
        'blocked'
      ),
      plantRef: plantRef,
      queueItemRef: normalizeQueueItemRef(queueItem, src),
      sourcePacketRef: normalizeSourcePacketRef(queueItem, src),
      previousQueueStatus:
        queueItem.queueStatus || src.previousQueueStatus || null,
      preservedMissingRequirements: cloneList(
        queueItem.preservedMissingRequirements
      ),
      preservedWarnings: cloneList(queueItem.preservedWarnings),
      preservedBlockingReasons: cloneList(queueItem.preservedBlockingReasons),
      preservedEvidenceSummary: clonePlain(queueItem.preservedEvidenceSummary),
      blockingReasons: [
        {
          code: 'explicit_owner_action_required',
          detail: 'needs_more_data_requires_explicit_manual_input'
        }
      ],
      ownerDecisionReason: 'explicit_owner_action_required',
      notAuthority: strengthenNotAuthority(queueItem.notAuthority)
    });
  }

  const plantRef = normalizePlantRef(queueItem, src);
  const previousQueueStatus =
    isNonEmptyString(src.previousQueueStatus)
      ? String(src.previousQueueStatus).trim()
      : queueItem.queueStatus || null;
  const existingAudit = Array.isArray(src.auditTrail)
    ? clonePlain(src.auditTrail)
    : clonePlain(queueItem.auditTrail) || [];
  const auditTrail = existingAudit.concat([
    {
      event: 'explicit_owner_decision_recorded',
      ownerDecision: requestedDecision,
      decisionSource: decisionSource,
      reviewer: String(src.reviewer).trim(),
      reviewedAt: String(src.reviewedAt).trim(),
      reversible: true,
      automaticApproval: false,
      explicitOwnerActionRequired: true
    }
  ]);

  return baseDecision({
    decisionId: makeDecisionId(
      plantRef.canonicalKey,
      requestedDecision,
      'recorded'
    ),
    decisionStatus: 'recorded',
    queueItemRef: normalizeQueueItemRef(queueItem, src),
    sourcePacketRef: normalizeSourcePacketRef(queueItem, src),
    plantRef: plantRef,
    previousQueueStatus: previousQueueStatus,
    ownerDecision: requestedDecision,
    ownerDecisionReason: isNonEmptyString(src.ownerDecisionReason)
      ? String(src.ownerDecisionReason).trim()
      : requestedDecision === 'needs_more_data'
        ? 'needs_more_data'
        : null,
    requiredFollowUp: requiredFollowUp,
    reviewer: String(src.reviewer).trim(),
    reviewedAt: String(src.reviewedAt).trim(),
    decisionSource: decisionSource,
    supersedesDecisionId: isNonEmptyString(src.supersedesDecisionId)
      ? String(src.supersedesDecisionId).trim()
      : null,
    auditTrail: auditTrail,
    preservedMissingRequirements: cloneList(
      queueItem.preservedMissingRequirements
    ),
    preservedWarnings: cloneList(queueItem.preservedWarnings),
    preservedBlockingReasons: cloneList(queueItem.preservedBlockingReasons),
    preservedEvidenceSummary: clonePlain(queueItem.preservedEvidenceSummary),
    blockingReasons: [],
    notAuthority: strengthenNotAuthority(queueItem.notAuthority)
  });
}

function syntheticQueueItemBase(partial) {
  return {
    queueVersion: '0.1.0-sr-owner-review-queue',
    capability: 'explicit_developer_owner_review_queue',
    developerOnly: true,
    syntheticOnly: true,
    activation: 'explicit_call_only',
    candidateReviewOnly: true,
    queueItemId: partial.queueItemId || 'orq-lavender-reviewable-queued',
    queueStatus: partial.queueStatus || 'queued',
    sourcePacketRef: partial.sourcePacketRef || {
      packetVersion: '0.1.0-sr-developer-candidate-review-packet',
      packetStatus: 'reviewable',
      summaryFingerprint: 'synthetic-packet-reviewable',
      candidateReviewOnly: true,
      noAutomaticApproval: true,
      syntheticOnly: true
    },
    plantRef: {
      canonicalKey: partial.canonicalKey || 'lavender',
      syntheticOnly: true
    },
    preservedEvidenceSummary: partial.preservedEvidenceSummary || {
      readinessStatus: 'candidate_review_ready',
      confidence: 'high',
      reasonCount: 1
    },
    preservedRiskSummary: {
      codes: [],
      lowConfidence: false,
      automaticApproval: false
    },
    preservedMissingRequirements: partial.preservedMissingRequirements || [],
    preservedWarnings: partial.preservedWarnings || [
      {
        code: 'candidate_review_only',
        detail: 'developer_owner_review_only_not_user_facing'
      }
    ],
    preservedBlockingReasons: partial.preservedBlockingReasons || [],
    ownerDecision: 'not_reviewed',
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
    auditTrail: [
      {
        event: 'queue_item_created',
        ownerDecision: 'not_reviewed',
        queueStatus: partial.queueStatus || 'queued',
        reversible: true,
        automaticApproval: false
      }
    ]
  };
}

/** Embedded synthetic fixtures for harness / Node proof. */
export function getSmartRecDeveloperExplicitOwnerDecisionSyntheticFixtures() {
  const queued = syntheticQueueItemBase({
    queueStatus: 'queued',
    preservedMissingRequirements: ['additional_trusted_axis']
  });

  return freezeDeep({
    A: {
      ownerReviewQueueItem: queued,
      ownerDecision: 'approved_later',
      ownerDecisionReason: 'owner_accepts_candidate_for_later_consideration_only',
      reviewer: 'owner-synthetic',
      reviewedAt: '2026-08-09T00:00:00.000Z',
      decisionSource: 'owner_manual',
      explicitOwnerActionRequired: true,
      syntheticOnly: true
    },
    B: {
      ownerReviewQueueItem: queued,
      ownerDecision: 'rejected_later',
      ownerDecisionReason: 'owner_rejects_candidate_for_later_revisit',
      reviewer: 'owner-synthetic',
      reviewedAt: '2026-08-09T00:00:01.000Z',
      decisionSource: 'owner_manual',
      explicitOwnerActionRequired: true,
      syntheticOnly: true
    },
    C: {
      ownerReviewQueueItem: syntheticQueueItemBase({
        queueStatus: 'needs_more_data',
        queueItemId: 'orq-lavender-needs_more_data-needs_more_data',
        preservedMissingRequirements: ['additional_trusted_axis'],
        preservedWarnings: [
          {
            code: 'low_confidence_visible',
            detail: 'preserve_low_confidence'
          }
        ],
        preservedBlockingReasons: [
          {
            code: 'axis_gap',
            detail: 'preserve_blocking'
          }
        ]
      }),
      ownerDecision: 'needs_more_data',
      ownerDecisionReason: 'owner_requests_more_trusted_evidence',
      requiredFollowUp: ['additional_trusted_axis'],
      reviewer: 'developer-synthetic',
      reviewedAt: '2026-08-09T00:00:02.000Z',
      decisionSource: 'developer_manual',
      explicitOwnerActionRequired: true,
      syntheticOnly: true
    },
    D: {
      ownerReviewQueueItem: queued,
      // missing ownerDecision
      reviewer: 'owner-synthetic',
      reviewedAt: '2026-08-09T00:00:03.000Z',
      decisionSource: 'owner_manual',
      explicitOwnerActionRequired: true,
      syntheticOnly: true
    },
    E: {
      ownerReviewQueueItem: queued,
      ownerDecision: 'auto_approve_now',
      ownerDecisionReason: 'invalid',
      reviewer: 'owner-synthetic',
      reviewedAt: '2026-08-09T00:00:04.000Z',
      decisionSource: 'owner_manual',
      explicitOwnerActionRequired: true,
      syntheticOnly: true
    },
    F: {
      ownerReviewQueueItem: queued,
      ownerDecision: 'approved_later',
      // missing ownerDecisionReason
      reviewer: 'owner-synthetic',
      reviewedAt: '2026-08-09T00:00:05.000Z',
      decisionSource: 'owner_manual',
      explicitOwnerActionRequired: true,
      syntheticOnly: true
    },
    G: {
      ownerReviewQueueItem: (function () {
        const q = syntheticQueueItemBase({ queueStatus: 'queued' });
        q.recommendationAuthority = true;
        return q;
      })(),
      ownerDecision: 'approved_later',
      ownerDecisionReason: 'should_block_on_authority_flag',
      reviewer: 'owner-synthetic',
      reviewedAt: '2026-08-09T00:00:06.000Z',
      decisionSource: 'owner_manual',
      explicitOwnerActionRequired: true,
      syntheticOnly: true
    },
    H: {
      ownerReviewQueueItem: queued,
      ownerDecision: 'approved_later',
      ownerDecisionReason: 'auto_approve_attempt_must_block',
      reviewer: 'system-auto',
      reviewedAt: '2026-08-09T00:00:07.000Z',
      decisionSource: 'owner_manual',
      explicitOwnerActionRequired: false,
      syntheticOnly: true
    }
  });
}
