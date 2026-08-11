/**
 * Cruvit — Smart Recommendations developer Explicit Owner Decision Consumption
 * ---------------------------------------------------------------------------
 * Pure, developer-only, synthetic-only explicit consumer of already-recorded
 * Explicit Owner Decision records.
 *
 * NON-CONSUMER / NON-AUTHORITY CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Accepts already-built synthetic Explicit Owner Decision records only.
 *  - Does not import GOS, v1b, product runtime, overlay, or live weather.
 *  - Does not import decision/queue modules (fixtures embed synthetic records).
 *  - Does not activate Smart Recommendations or Product Authority.
 *  - Does not recommend plants, grant eligibility, or plant suitability.
 *  - Does not implement Owner Review Queue UI.
 *  - Does not apply decisions to catalog/recommendations/products.
 *  - approved_later becomes developer_consumable + nextGateRequired only.
 *  - rejected_later preserves evidence; never deletes.
 *  - needs_more_data never converts to approval.
 */

export const SR_DEVELOPER_EXPLICIT_OWNER_DECISION_CONSUMPTION_VERSION =
  '0.1.0-sr-explicit-owner-decision-consumption';

export const SR_DEVELOPER_EXPLICIT_OWNER_DECISION_CONSUMPTION_CAPABILITY =
  'explicit_developer_owner_decision_consumption';

export const SR_DEVELOPER_EXPLICIT_OWNER_DECISION_SOURCE_VERSION =
  '0.1.0-sr-explicit-owner-decision';

export const SR_DEVELOPER_EXPLICIT_OWNER_DECISION_SOURCE_CAPABILITY =
  'explicit_developer_owner_decision';

export const SR_DEVELOPER_EXPLICIT_OWNER_DECISION_CONSUMPTION_STATUSES =
  Object.freeze([
    'blocked',
    'needs_more_data',
    'developer_consumable',
    'rejected_path'
  ]);

export const SR_DEVELOPER_EXPLICIT_OWNER_DECISION_VALUES = Object.freeze([
  'approved_later',
  'rejected_later',
  'needs_more_data'
]);

export const SR_DEVELOPER_EXPLICIT_OWNER_DECISION_SOURCES = Object.freeze([
  'owner_manual',
  'developer_manual'
]);

export const SR_DEVELOPER_EXPLICIT_OWNER_DECISION_NEXT_GATES = Object.freeze([
  'consumer_static_verification',
  'recommendation_authority_contract',
  'product_authority_contract',
  'runtime_activation_contract',
  'owner_review_followup'
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
  'ownerApprovalAuthority',
  'userFacingRecommendation',
  'catalogMutationAuthority',
  'productEligibilityAuthority'
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
    ownerApprovalAuthority: false,
    userFacingRecommendation: false,
    catalogMutationAuthority: false,
    productEligibilityAuthority: false
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
    consumptionVersion: SR_DEVELOPER_EXPLICIT_OWNER_DECISION_CONSUMPTION_VERSION,
    capability: SR_DEVELOPER_EXPLICIT_OWNER_DECISION_CONSUMPTION_CAPABILITY,
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
    userFacingRecommendation: false,
    catalogMutationAuthority: false,
    productEligibilityAuthority: false,
    activation: 'explicit_call_only',
    noAutomaticApproval: true,
    explicitOwnerActionRequired: true,
    noActivation: true,
    doesNotGrantUserFacingRecommendation: true,
    doesNotImplementOwnerReviewQueueUi: true,
    doesNotActivateSmartRecommendations: true,
    doesNotApplyDecisionsToCatalogOrProducts: true,
    doesNotConvertNeedsMoreDataToApproval: true,
    doesNotDeleteOnRejectedLater: true,
    requiresNextGateEvenAfterApprovedLater: true
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperExplicitOwnerDecisionConsumptionDescriptor() {
  return DESCRIPTOR;
}

function buildConsumptionFingerprint(item) {
  return [
    SR_DEVELOPER_EXPLICIT_OWNER_DECISION_CONSUMPTION_VERSION,
    String(item.consumptionStatus || ''),
    String(item.ownerDecisionEcho || ''),
    String(item.nextGateRequired || ''),
    String(item.noActivation === true),
    String(item.noAutomaticApproval === true),
    String(item.explicitOwnerActionRequired === true),
    String(item.reversible === true),
    String(
      (item.sourceRefs && item.sourceRefs.decisionId) || ''
    ),
    String(
      (item.sourceRefs &&
        item.sourceRefs.plantRef &&
        item.sourceRefs.plantRef.canonicalKey) ||
        ''
    )
  ].join('|');
}

function resolveNextGate(src, ownerDecision) {
  if (isNonEmptyString(src && src.nextGateRequired)) {
    const g = String(src.nextGateRequired).trim();
    if (SR_DEVELOPER_EXPLICIT_OWNER_DECISION_NEXT_GATES.indexOf(g) >= 0) {
      return g;
    }
  }
  if (ownerDecision === 'approved_later') return 'consumer_static_verification';
  if (ownerDecision === 'needs_more_data') return 'owner_review_followup';
  if (ownerDecision === 'rejected_later') return 'owner_review_followup';
  return 'consumer_static_verification';
}

function baseConsumption(partial) {
  const item = {
    consumptionVersion: SR_DEVELOPER_EXPLICIT_OWNER_DECISION_CONSUMPTION_VERSION,
    capability: SR_DEVELOPER_EXPLICIT_OWNER_DECISION_CONSUMPTION_CAPABILITY,
    developerOnly: true,
    syntheticOnly: true,
    activation: 'explicit_call_only',
    consumptionStatus: partial.consumptionStatus || 'blocked',
    ownerDecisionEcho: partial.ownerDecisionEcho || null,
    sourceRefs: partial.sourceRefs || {
      decisionId: null,
      queueItemRef: null,
      sourcePacketRef: null,
      plantRef: null
    },
    preservedWarnings: partial.preservedWarnings || [],
    preservedMissingRequirements: partial.preservedMissingRequirements || [],
    preservedBlockingReasons: partial.preservedBlockingReasons || [],
    preservedAuditTrail: partial.preservedAuditTrail || [],
    requiredFollowUp: partial.requiredFollowUp || [],
    blockingReasons: partial.blockingReasons || [],
    notAuthority: strengthenNotAuthority(
      partial.notAuthority || emptyNotAuthority()
    ),
    noActivation: true,
    reversible: true,
    nextGateRequired: partial.nextGateRequired || null,
    noAutomaticApproval: true,
    explicitOwnerActionRequired: true,
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
    userFacingRecommendation: false,
    catalogMutationAuthority: false,
    productEligibilityAuthority: false,
    summaryFingerprint: ''
  };

  if (
    item.consumptionStatus === 'developer_consumable' &&
    !isNonEmptyString(item.nextGateRequired)
  ) {
    item.nextGateRequired = 'consumer_static_verification';
  }

  item.summaryFingerprint = buildConsumptionFingerprint(item);
  return freezeDeep(item);
}

function blockedConsumption(partial) {
  return baseConsumption(
    Object.assign({}, partial, {
      consumptionStatus: 'blocked',
      ownerDecisionEcho: null,
      noActivation: true,
      reversible: true,
      noAutomaticApproval: true,
      explicitOwnerActionRequired: true,
      nextGateRequired: partial.nextGateRequired || null
    })
  );
}

function sourceRefsFrom(decision, input) {
  const d = asObject(decision) || {};
  const src = asObject(input) || {};
  return {
    decisionId: isNonEmptyString(d.decisionId)
      ? String(d.decisionId).trim()
      : null,
    queueItemRef: clonePlain(d.queueItemRef) ||
      clonePlain(src.queueItemRef) ||
      null,
    sourcePacketRef: clonePlain(d.sourcePacketRef) ||
      clonePlain(src.sourcePacketRef) ||
      null,
    plantRef: clonePlain(d.plantRef) || clonePlain(src.plantRef) || null
  };
}

/**
 * Consume a synthetic Explicit Owner Decision record as developer-only evidence.
 * @param {object|null} input
 * @returns {object} frozen consumption result
 */
export function consumeDeveloperExplicitOwnerDecision(input) {
  const src = asObject(input) || {};
  const decision =
    asObject(src.explicitOwnerDecision) ||
    asObject(src.decisionRecord) ||
    asObject(src.decision);

  const forbiddenLive = [];
  collectForbiddenLiveKeys(src, 'input', forbiddenLive);
  if (forbiddenLive.length) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedWarnings: decision ? cloneList(decision.preservedWarnings) : [],
      preservedMissingRequirements: decision
        ? cloneList(decision.preservedMissingRequirements)
        : [],
      preservedBlockingReasons: decision
        ? cloneList(decision.preservedBlockingReasons)
        : [],
      preservedAuditTrail: decision ? cloneList(decision.auditTrail) : [],
      blockingReasons: [
        {
          code: 'forbidden_live_or_provider_keys',
          detail: forbiddenLive.sort().join(',')
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  const forbiddenAuth = [];
  collectForbiddenAuthorityFlags(src, 'input', forbiddenAuth);
  if (decision) {
    collectForbiddenAuthorityFlags(decision, 'explicitOwnerDecision', forbiddenAuth);
  }
  if (forbiddenAuth.length) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedWarnings: decision ? cloneList(decision.preservedWarnings) : [],
      preservedMissingRequirements: decision
        ? cloneList(decision.preservedMissingRequirements)
        : [],
      preservedBlockingReasons: decision
        ? cloneList(decision.preservedBlockingReasons)
        : [],
      preservedAuditTrail: decision ? cloneList(decision.auditTrail) : [],
      blockingReasons: [
        {
          code: 'forbidden_authority_flag',
          detail: forbiddenAuth.sort().join(',')
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (
    src.treatAsActivation === true ||
    src.requestRecommendationAuthority === true ||
    src.requestProductAuthority === true ||
    src.requestPlantSuitabilityAuthority === true ||
    src.requestRuntimeEligibility === true ||
    src.requestUserFacingRecommendation === true ||
    src.skipNextGate === true
  ) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedWarnings: decision ? cloneList(decision.preservedWarnings) : [],
      preservedMissingRequirements: decision
        ? cloneList(decision.preservedMissingRequirements)
        : [],
      preservedBlockingReasons: decision
        ? cloneList(decision.preservedBlockingReasons)
        : [],
      preservedAuditTrail: decision ? cloneList(decision.auditTrail) : [],
      blockingReasons: [
        {
          code: 'activation_or_authority_request_forbidden',
          detail:
            'approved_later_cannot_become_activation_recommendation_or_product_authority'
        }
      ],
      nextGateRequired: 'consumer_static_verification',
      notAuthority: emptyNotAuthority()
    });
  }

  if (!decision) {
    return blockedConsumption({
      sourceRefs: {
        decisionId: null,
        queueItemRef: clonePlain(src.queueItemRef) || null,
        sourcePacketRef: clonePlain(src.sourcePacketRef) || null,
        plantRef: clonePlain(src.plantRef) || null
      },
      blockingReasons: [
        {
          code: 'missing_decision_record',
          detail: 'explicit_owner_decision_required'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (decision.decisionStatus && decision.decisionStatus !== 'recorded') {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedWarnings: cloneList(decision.preservedWarnings),
      preservedMissingRequirements: cloneList(
        decision.preservedMissingRequirements
      ),
      preservedBlockingReasons: cloneList(decision.preservedBlockingReasons),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        {
          code: 'decision_not_recorded',
          detail: String(decision.decisionStatus)
        }
      ],
      notAuthority: strengthenNotAuthority(decision.notAuthority)
    });
  }

  if (decision.superseded === true || src.markSuperseded === true) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedWarnings: cloneList(decision.preservedWarnings),
      preservedMissingRequirements: cloneList(
        decision.preservedMissingRequirements
      ),
      preservedBlockingReasons: cloneList(decision.preservedBlockingReasons),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        {
          code: 'decision_superseded_or_stale',
          detail: 'supersedesDecisionId_rules_not_authorized_in_this_module'
        }
      ],
      notAuthority: strengthenNotAuthority(decision.notAuthority)
    });
  }

  if (src.markStale === true || src.markDetached === true || src.markMalformed === true) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedWarnings: cloneList(decision.preservedWarnings),
      preservedMissingRequirements: cloneList(
        decision.preservedMissingRequirements
      ),
      preservedBlockingReasons: cloneList(decision.preservedBlockingReasons),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        {
          code: 'decision_stale_superseded_malformed_or_detached',
          detail: src.markDetached
            ? 'detached'
            : src.markMalformed
              ? 'malformed'
              : 'stale'
        }
      ],
      notAuthority: strengthenNotAuthority(decision.notAuthority)
    });
  }

  if (
    decision.decisionVersion !== SR_DEVELOPER_EXPLICIT_OWNER_DECISION_SOURCE_VERSION
  ) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        {
          code: 'unsupported_decision_version',
          detail: String(decision.decisionVersion || '')
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (
    decision.capability !== SR_DEVELOPER_EXPLICIT_OWNER_DECISION_SOURCE_CAPABILITY
  ) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        {
          code: 'unsupported_capability',
          detail: String(decision.capability || '')
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!isNonEmptyString(decision.decisionId)) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      blockingReasons: [
        { code: 'missing_decision_id', detail: 'decisionId_required' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!asObject(decision.queueItemRef) && !asObject(src.queueItemRef)) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        {
          code: 'missing_queue_item_reference',
          detail: 'queueItemRef_required'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!asObject(decision.sourcePacketRef) && !asObject(src.sourcePacketRef)) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        {
          code: 'missing_source_packet_reference',
          detail: 'sourcePacketRef_required'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!asObject(decision.plantRef) && !asObject(src.plantRef)) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        { code: 'missing_plant_reference', detail: 'plantRef_required' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!isNonEmptyString(decision.summaryFingerprint)) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        {
          code: 'missing_or_mismatched_summary_fingerprint',
          detail: 'decision_summaryFingerprint_missing'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!isNonEmptyString(src.expectedSummaryFingerprint)) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        {
          code: 'missing_or_mismatched_summary_fingerprint',
          detail: 'expectedSummaryFingerprint_required'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (
    String(src.expectedSummaryFingerprint).trim() !==
    String(decision.summaryFingerprint).trim()
  ) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        {
          code: 'missing_or_mismatched_summary_fingerprint',
          detail: 'fingerprint_mismatch'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  const decisionSource = isNonEmptyString(decision.decisionSource)
    ? String(decision.decisionSource).trim()
    : null;
  if (
    SR_DEVELOPER_EXPLICIT_OWNER_DECISION_SOURCES.indexOf(decisionSource) < 0
  ) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        {
          code: 'invalid_decision_source',
          detail: String(decision.decisionSource || '')
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!isNonEmptyString(decision.reviewer)) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [{ code: 'missing_reviewer', detail: 'reviewer_required' }],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!isNonEmptyString(decision.reviewedAt)) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        { code: 'missing_reviewed_at', detail: 'reviewedAt_required' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  const ownerDecision = isNonEmptyString(decision.ownerDecision)
    ? String(decision.ownerDecision).trim()
    : null;
  if (
    !ownerDecision ||
    SR_DEVELOPER_EXPLICIT_OWNER_DECISION_VALUES.indexOf(ownerDecision) < 0
  ) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        {
          code: 'invalid_owner_decision',
          detail: String(decision.ownerDecision || '')
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (
    (ownerDecision === 'approved_later' ||
      ownerDecision === 'rejected_later') &&
    !isNonEmptyString(decision.ownerDecisionReason)
  ) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedWarnings: cloneList(decision.preservedWarnings),
      preservedMissingRequirements: cloneList(
        decision.preservedMissingRequirements
      ),
      preservedBlockingReasons: cloneList(decision.preservedBlockingReasons),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        {
          code: 'missing_owner_decision_reason',
          detail: 'ownerDecisionReason_required_for_' + ownerDecision
        }
      ],
      notAuthority: strengthenNotAuthority(decision.notAuthority)
    });
  }

  const requiredFollowUp = Array.isArray(decision.requiredFollowUp)
    ? decision.requiredFollowUp.slice()
    : Array.isArray(src.requiredFollowUp)
      ? src.requiredFollowUp.slice()
      : [];
  if (ownerDecision === 'needs_more_data' && requiredFollowUp.length === 0) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedWarnings: cloneList(decision.preservedWarnings),
      preservedMissingRequirements: cloneList(
        decision.preservedMissingRequirements
      ),
      preservedBlockingReasons: cloneList(decision.preservedBlockingReasons),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        {
          code: 'missing_required_follow_up',
          detail: 'requiredFollowUp_required_for_needs_more_data'
        }
      ],
      notAuthority: strengthenNotAuthority(decision.notAuthority)
    });
  }

  if (decision.noAutomaticApproval !== true) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        {
          code: 'no_automatic_approval_required',
          detail: 'noAutomaticApproval_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (decision.explicitOwnerActionRequired !== true) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        {
          code: 'explicit_owner_action_required',
          detail: 'explicitOwnerActionRequired_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!Array.isArray(decision.auditTrail) || decision.auditTrail.length === 0) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      blockingReasons: [
        { code: 'missing_audit_trail', detail: 'auditTrail_required' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (decision.reversible !== true) {
    return blockedConsumption({
      sourceRefs: sourceRefsFrom(decision, src),
      preservedAuditTrail: cloneList(decision.auditTrail),
      blockingReasons: [
        { code: 'reversible_required', detail: 'reversible_must_be_true' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  const expectedHardBlocks = Array.isArray(src.expectedHardBlocks)
    ? src.expectedHardBlocks
    : [];
  if (expectedHardBlocks.length) {
    const preserved = cloneList(decision.preservedBlockingReasons);
    const missing = [];
    for (let i = 0; i < expectedHardBlocks.length; i++) {
      const code = expectedHardBlocks[i];
      const found = preserved.some(function (x) {
        return x && x.code === code;
      });
      if (!found) missing.push(code);
    }
    if (missing.length) {
      return blockedConsumption({
        sourceRefs: sourceRefsFrom(decision, src),
        preservedWarnings: cloneList(decision.preservedWarnings),
        preservedMissingRequirements: cloneList(
          decision.preservedMissingRequirements
        ),
        preservedBlockingReasons: preserved,
        preservedAuditTrail: cloneList(decision.auditTrail),
        blockingReasons: [
          {
            code: 'hard_block_not_preserved',
            detail: missing.sort().join(',')
          }
        ],
        notAuthority: strengthenNotAuthority(decision.notAuthority)
      });
    }
  }

  const preservedWarnings = cloneList(
    Array.isArray(src.existingWarnings)
      ? src.existingWarnings
      : decision.preservedWarnings
  );
  const preservedMissingRequirements = cloneList(
    Array.isArray(src.existingMissingRequirements)
      ? src.existingMissingRequirements
      : decision.preservedMissingRequirements
  );
  const preservedBlockingReasons = cloneList(
    Array.isArray(src.existingBlockingReasons)
      ? src.existingBlockingReasons
      : decision.preservedBlockingReasons
  );
  const preservedAuditTrail = cloneList(
    Array.isArray(src.existingAuditTrail)
      ? src.existingAuditTrail
      : decision.auditTrail
  ).concat([
    {
      event: 'explicit_owner_decision_consumed',
      ownerDecision: ownerDecision,
      consumptionStatus:
        ownerDecision === 'approved_later'
          ? 'developer_consumable'
          : ownerDecision === 'rejected_later'
            ? 'rejected_path'
            : 'needs_more_data',
      noActivation: true,
      automaticApproval: false,
      reversible: true,
      nextGateRequired: resolveNextGate(src, ownerDecision)
    }
  ]);

  const refs = sourceRefsFrom(decision, src);
  const nextGate = resolveNextGate(src, ownerDecision);

  if (ownerDecision === 'approved_later') {
    return baseConsumption({
      consumptionStatus: 'developer_consumable',
      ownerDecisionEcho: 'approved_later',
      sourceRefs: refs,
      preservedWarnings: preservedWarnings,
      preservedMissingRequirements: preservedMissingRequirements,
      preservedBlockingReasons: preservedBlockingReasons,
      preservedAuditTrail: preservedAuditTrail,
      requiredFollowUp: requiredFollowUp,
      nextGateRequired: nextGate,
      notAuthority: strengthenNotAuthority(decision.notAuthority)
    });
  }

  if (ownerDecision === 'rejected_later') {
    return baseConsumption({
      consumptionStatus: 'rejected_path',
      ownerDecisionEcho: 'rejected_later',
      sourceRefs: refs,
      preservedWarnings: preservedWarnings,
      preservedMissingRequirements: preservedMissingRequirements,
      preservedBlockingReasons: preservedBlockingReasons,
      preservedAuditTrail: preservedAuditTrail,
      requiredFollowUp: requiredFollowUp,
      nextGateRequired: nextGate,
      notAuthority: strengthenNotAuthority(decision.notAuthority)
    });
  }

  // needs_more_data — never convertible to developer_consumable here
  return baseConsumption({
    consumptionStatus: 'needs_more_data',
    ownerDecisionEcho: 'needs_more_data',
    sourceRefs: refs,
    preservedWarnings: preservedWarnings,
    preservedMissingRequirements: preservedMissingRequirements,
    preservedBlockingReasons: preservedBlockingReasons,
    preservedAuditTrail: preservedAuditTrail,
    requiredFollowUp: requiredFollowUp,
    nextGateRequired: nextGate,
    notAuthority: strengthenNotAuthority(decision.notAuthority)
  });
}

function syntheticDecisionBase(partial) {
  const ownerDecision = partial.ownerDecision || 'approved_later';
  const plantKey = (partial.plantRef && partial.plantRef.canonicalKey) || 'lavender';
  const decisionId =
    partial.decisionId ||
    ['eod', plantKey, ownerDecision, 'recorded'].join('-');
  const fingerprint =
    partial.summaryFingerprint ||
    ['synthetic-eod-fp', plantKey, ownerDecision, decisionId].join('|');

  return {
    decisionVersion: SR_DEVELOPER_EXPLICIT_OWNER_DECISION_SOURCE_VERSION,
    capability: SR_DEVELOPER_EXPLICIT_OWNER_DECISION_SOURCE_CAPABILITY,
    developerOnly: true,
    syntheticOnly: true,
    activation: 'explicit_call_only',
    decisionId: decisionId,
    decisionStatus: partial.decisionStatus || 'recorded',
    queueItemRef: partial.queueItemRef || {
      queueItemId: 'orq-lavender-reviewable-queued',
      queueStatus: 'queued',
      candidateReviewOnly: true,
      noAutomaticApproval: true,
      syntheticOnly: true
    },
    sourcePacketRef: partial.sourcePacketRef || {
      sourcePacketId: 'synthetic-packet-reviewable',
      packetStatus: 'reviewable',
      summaryFingerprint: 'synthetic-packet-reviewable',
      syntheticOnly: true
    },
    plantRef: partial.plantRef || {
      canonicalKey: 'lavender',
      syntheticOnly: true
    },
    previousQueueStatus: partial.previousQueueStatus || 'queued',
    ownerDecision: ownerDecision,
    ownerDecisionReason: Object.prototype.hasOwnProperty.call(
      partial,
      'ownerDecisionReason'
    )
      ? partial.ownerDecisionReason
      : 'owner_accepts_candidate_for_later_consideration_only',
    requiredFollowUp: partial.requiredFollowUp || [],
    reviewer: Object.prototype.hasOwnProperty.call(partial, 'reviewer')
      ? partial.reviewer
      : 'owner-synthetic',
    reviewedAt: Object.prototype.hasOwnProperty.call(partial, 'reviewedAt')
      ? partial.reviewedAt
      : '2026-08-10T00:00:00.000Z',
    decisionSource: Object.prototype.hasOwnProperty.call(partial, 'decisionSource')
      ? partial.decisionSource
      : 'owner_manual',
    reversible: Object.prototype.hasOwnProperty.call(partial, 'reversible')
      ? partial.reversible
      : true,
    supersedesDecisionId: partial.supersedesDecisionId || null,
    superseded: partial.superseded === true,
    auditTrail: partial.auditTrail || [
      {
        event: 'explicit_owner_decision_recorded',
        ownerDecision: ownerDecision,
        reversible: true,
        automaticApproval: false,
        explicitOwnerActionRequired: true
      }
    ],
    preservedMissingRequirements: partial.preservedMissingRequirements || [
      'additional_trusted_axis'
    ],
    preservedWarnings: partial.preservedWarnings || [
      {
        code: 'candidate_review_only',
        detail: 'developer_owner_review_only_not_user_facing'
      }
    ],
    preservedBlockingReasons: partial.preservedBlockingReasons || [],
    noAutomaticApproval: Object.prototype.hasOwnProperty.call(
      partial,
      'noAutomaticApproval'
    )
      ? partial.noAutomaticApproval
      : true,
    explicitOwnerActionRequired: Object.prototype.hasOwnProperty.call(
      partial,
      'explicitOwnerActionRequired'
    )
      ? partial.explicitOwnerActionRequired
      : true,
    notAuthority: strengthenNotAuthority(
      partial.notAuthority || emptyNotAuthority()
    ),
    productAuthority: partial.productAuthority === true,
    runtimeEligibilityAuthority: partial.runtimeEligibilityAuthority === true,
    recommendationAuthority: partial.recommendationAuthority === true,
    overlayAuthority: false,
    liveWeather: false,
    gosConsumer: false,
    network: false,
    automaticExecution: false,
    writesArtifacts: false,
    plantSuitabilityAuthority: partial.plantSuitabilityAuthority === true,
    commerceAuthority: false,
    ownerApprovalAuthority: false,
    userFacingRecommendation: false,
    catalogMutationAuthority: false,
    productEligibilityAuthority: false,
    summaryFingerprint: fingerprint
  };
}

/** Embedded synthetic fixtures for harness / Node proof. */
export function getSmartRecDeveloperExplicitOwnerDecisionConsumptionSyntheticFixtures() {
  const approved = syntheticDecisionBase({
    ownerDecision: 'approved_later',
    ownerDecisionReason: 'owner_accepts_candidate_for_later_consideration_only',
    decisionId: 'eod-lavender-approved_later-recorded',
    summaryFingerprint: 'synthetic-eod-fp|lavender|approved_later|A'
  });

  const rejected = syntheticDecisionBase({
    ownerDecision: 'rejected_later',
    ownerDecisionReason: 'owner_rejects_candidate_for_later_revisit',
    decisionId: 'eod-lavender-rejected_later-recorded',
    reviewedAt: '2026-08-10T00:00:01.000Z',
    summaryFingerprint: 'synthetic-eod-fp|lavender|rejected_later|B',
    preservedWarnings: [
      {
        code: 'candidate_review_only',
        detail: 'developer_owner_review_only_not_user_facing'
      },
      {
        code: 'evidence_must_remain',
        detail: 'rejection_preserves_evidence'
      }
    ],
    preservedBlockingReasons: [
      {
        code: 'axis_gap',
        detail: 'preserve_on_reject'
      }
    ]
  });

  const needsMore = syntheticDecisionBase({
    ownerDecision: 'needs_more_data',
    ownerDecisionReason: 'owner_requests_more_trusted_evidence',
    decisionId: 'eod-lavender-needs_more_data-recorded',
    decisionSource: 'developer_manual',
    reviewer: 'developer-synthetic',
    reviewedAt: '2026-08-10T00:00:02.000Z',
    previousQueueStatus: 'needs_more_data',
    requiredFollowUp: ['additional_trusted_axis'],
    summaryFingerprint: 'synthetic-eod-fp|lavender|needs_more_data|C',
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
  });

  return freezeDeep({
    A: {
      explicitOwnerDecision: approved,
      expectedSummaryFingerprint: approved.summaryFingerprint,
      queueItemRef: approved.queueItemRef,
      sourcePacketRef: approved.sourcePacketRef,
      plantRef: approved.plantRef,
      syntheticOnly: true
    },
    B: {
      explicitOwnerDecision: rejected,
      expectedSummaryFingerprint: rejected.summaryFingerprint,
      queueItemRef: rejected.queueItemRef,
      sourcePacketRef: rejected.sourcePacketRef,
      plantRef: rejected.plantRef,
      syntheticOnly: true
    },
    C: {
      explicitOwnerDecision: needsMore,
      expectedSummaryFingerprint: needsMore.summaryFingerprint,
      queueItemRef: needsMore.queueItemRef,
      sourcePacketRef: needsMore.sourcePacketRef,
      plantRef: needsMore.plantRef,
      existingMissingRequirements: needsMore.preservedMissingRequirements,
      existingWarnings: needsMore.preservedWarnings,
      existingBlockingReasons: needsMore.preservedBlockingReasons,
      syntheticOnly: true
    },
    D: {
      // missing decision record
      expectedSummaryFingerprint: 'unused',
      queueItemRef: approved.queueItemRef,
      sourcePacketRef: approved.sourcePacketRef,
      plantRef: approved.plantRef,
      syntheticOnly: true
    },
    E: {
      explicitOwnerDecision: approved,
      expectedSummaryFingerprint: 'mismatched-fingerprint-value',
      queueItemRef: approved.queueItemRef,
      sourcePacketRef: approved.sourcePacketRef,
      plantRef: approved.plantRef,
      syntheticOnly: true
    },
    F: {
      explicitOwnerDecision: syntheticDecisionBase({
        ownerDecision: 'approved_later',
        ownerDecisionReason: null,
        decisionId: 'eod-lavender-approved_later-noreason',
        summaryFingerprint: 'synthetic-eod-fp|lavender|approved_later|F'
      }),
      expectedSummaryFingerprint: 'synthetic-eod-fp|lavender|approved_later|F',
      syntheticOnly: true
    },
    G: {
      explicitOwnerDecision: syntheticDecisionBase({
        ownerDecision: 'approved_later',
        decisionId: 'eod-lavender-approved_later-auth',
        summaryFingerprint: 'synthetic-eod-fp|lavender|approved_later|G',
        recommendationAuthority: true
      }),
      expectedSummaryFingerprint: 'synthetic-eod-fp|lavender|approved_later|G',
      syntheticOnly: true
    },
    H: {
      explicitOwnerDecision: syntheticDecisionBase({
        ownerDecision: 'approved_later',
        decisionId: 'eod-lavender-approved_later-flags',
        summaryFingerprint: 'synthetic-eod-fp|lavender|approved_later|H',
        noAutomaticApproval: false,
        explicitOwnerActionRequired: false
      }),
      expectedSummaryFingerprint: 'synthetic-eod-fp|lavender|approved_later|H',
      syntheticOnly: true
    },
    I: {
      explicitOwnerDecision: approved,
      expectedSummaryFingerprint: approved.summaryFingerprint,
      treatAsActivation: true,
      requestRecommendationAuthority: true,
      requestProductAuthority: true,
      skipNextGate: true,
      syntheticOnly: true
    }
  });
}
