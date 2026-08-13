/**
 * Cruvit — Smart Recommendations developer Recommendation Authority
 * ------------------------------------------------------------------
 * Pure, developer-only, synthetic-only explicit Recommendation Authority
 * gate over already-built Explicit Owner Decision Consumption output.
 *
 * NON-AUTHORITY / NON-ACTIVATION CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Accepts already-built synthetic Explicit Owner Decision Consumption
 *    output only (fixtures embed consumption records; no module import).
 *  - Does not import GOS, v1b, product runtime, overlay, or live weather.
 *  - Does not activate Smart Recommendations or Product Authority.
 *  - Does not recommend plants, grant eligibility, or plant suitability.
 *  - Does not implement Owner Review Queue UI.
 *  - Does not apply decisions to catalog/recommendations/products.
 *  - developer_authority_candidate is not runtime/UI/user-facing activation.
 *  - rejected_later is blocked while preserving evidence/audit.
 *  - needs_more_data becomes not_ready (or blocked) and never approval.
 */

export const SR_DEVELOPER_RECOMMENDATION_AUTHORITY_VERSION =
  '0.1.0-sr-recommendation-authority';

export const SR_DEVELOPER_RECOMMENDATION_AUTHORITY_CAPABILITY =
  'explicit_developer_recommendation_authority';

export const SR_DEVELOPER_RECOMMENDATION_AUTHORITY_SOURCE_VERSION =
  '0.1.0-sr-explicit-owner-decision-consumption';

export const SR_DEVELOPER_RECOMMENDATION_AUTHORITY_SOURCE_CAPABILITY =
  'explicit_developer_owner_decision_consumption';

export const SR_DEVELOPER_RECOMMENDATION_AUTHORITY_STATUSES = Object.freeze([
  'blocked',
  'not_ready',
  'developer_authority_candidate'
]);

export const SR_DEVELOPER_RECOMMENDATION_AUTHORITY_INPUT_GATES = Object.freeze([
  'recommendation_authority_contract'
]);

export const SR_DEVELOPER_RECOMMENDATION_AUTHORITY_NEXT_GATES = Object.freeze([
  'recommendation_authority_static_verification',
  'recommendation_policy_contract',
  'plant_suitability_authority_contract',
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

function nextGateIncludesRecommendationAuthorityContract(value) {
  if (Array.isArray(value)) {
    return value.some(function (g) {
      return String(g).trim() === 'recommendation_authority_contract';
    });
  }
  if (isNonEmptyString(value)) {
    return String(value).trim() === 'recommendation_authority_contract';
  }
  return false;
}

function buildDescriptor() {
  return freezeDeep({
    recommendationAuthorityVersion:
      SR_DEVELOPER_RECOMMENDATION_AUTHORITY_VERSION,
    capability: SR_DEVELOPER_RECOMMENDATION_AUTHORITY_CAPABILITY,
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
    noRuntimeActivation: true,
    noUserFacingRecommendation: true,
    noPlantSuitabilityAuthority: true,
    noProductAuthority: true,
    noProductEligibility: true,
    noCatalogMutation: true,
    doesNotActivateSmartRecommendations: true,
    doesNotImplementOwnerReviewQueueUi: true,
    doesNotApplyDecisionsToCatalogOrProducts: true,
    doesNotConvertNeedsMoreDataToApproval: true,
    doesNotDeleteOnRejectedLater: true,
    developerAuthorityCandidateIsNotActivation: true,
    requiresNextGateEvenAfterDeveloperAuthorityCandidate: true
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperRecommendationAuthorityDescriptor() {
  return DESCRIPTOR;
}

function buildAuthorityFingerprint(item) {
  return [
    SR_DEVELOPER_RECOMMENDATION_AUTHORITY_VERSION,
    String(item.recommendationAuthorityStatus || ''),
    String(item.nextGateRequired || ''),
    String(item.noRuntimeActivation === true),
    String(item.noAutomaticApproval === true),
    String(item.explicitOwnerActionRequired === true),
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

function resolveOutputNextGate(src) {
  if (isNonEmptyString(src && src.nextGateRequiredOverride)) {
    const g = String(src.nextGateRequiredOverride).trim();
    if (SR_DEVELOPER_RECOMMENDATION_AUTHORITY_NEXT_GATES.indexOf(g) >= 0) {
      return g;
    }
  }
  return 'recommendation_authority_static_verification';
}

function sourceRefsFrom(consumption, input) {
  const c = asObject(consumption) || {};
  const src = asObject(input) || {};
  const refs = asObject(c.sourceRefs) || {};
  return {
    decisionId: isNonEmptyString(refs.decisionId)
      ? String(refs.decisionId).trim()
      : isNonEmptyString(src.decisionId)
        ? String(src.decisionId).trim()
        : null,
    queueItemRef: clonePlain(refs.queueItemRef) ||
      clonePlain(src.queueItemRef) ||
      null,
    sourcePacketRef: clonePlain(refs.sourcePacketRef) ||
      clonePlain(src.sourcePacketRef) ||
      null,
    plantRef: clonePlain(refs.plantRef) || clonePlain(src.plantRef) || null
  };
}

function baseAuthority(partial) {
  const item = {
    recommendationAuthorityVersion:
      SR_DEVELOPER_RECOMMENDATION_AUTHORITY_VERSION,
    capability: SR_DEVELOPER_RECOMMENDATION_AUTHORITY_CAPABILITY,
    developerOnly: true,
    syntheticOnly: true,
    activation: 'explicit_call_only',
    recommendationAuthorityStatus:
      partial.recommendationAuthorityStatus || 'blocked',
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
    noRuntimeActivation: true,
    noUserFacingRecommendation: true,
    noPlantSuitabilityAuthority: true,
    noProductAuthority: true,
    noProductEligibility: true,
    noCatalogMutation: true,
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
    item.recommendationAuthorityStatus === 'developer_authority_candidate' &&
    !isNonEmptyString(item.nextGateRequired)
  ) {
    item.nextGateRequired = 'recommendation_authority_static_verification';
  }

  item.summaryFingerprint = buildAuthorityFingerprint(item);
  return freezeDeep(item);
}

function blockedAuthority(partial) {
  return baseAuthority(
    Object.assign({}, partial, {
      recommendationAuthorityStatus: 'blocked',
      noRuntimeActivation: true,
      noUserFacingRecommendation: true,
      noPlantSuitabilityAuthority: true,
      noProductAuthority: true,
      noProductEligibility: true,
      noCatalogMutation: true,
      noAutomaticApproval: true,
      explicitOwnerActionRequired: true,
      nextGateRequired: partial.nextGateRequired || null
    })
  );
}

function notReadyAuthority(partial) {
  return baseAuthority(
    Object.assign({}, partial, {
      recommendationAuthorityStatus: 'not_ready',
      noRuntimeActivation: true,
      noUserFacingRecommendation: true,
      noPlantSuitabilityAuthority: true,
      noProductAuthority: true,
      noProductEligibility: true,
      noCatalogMutation: true,
      noAutomaticApproval: true,
      explicitOwnerActionRequired: true,
      nextGateRequired: partial.nextGateRequired || 'owner_review_followup'
    })
  );
}

/**
 * Build a developer-only Recommendation Authority result from synthetic
 * Explicit Owner Decision Consumption output.
 * @param {object|null} input
 * @returns {object} frozen recommendation authority result
 */
export function buildDeveloperRecommendationAuthority(input) {
  const src = asObject(input) || {};
  const consumption =
    asObject(src.consumptionOutput) ||
    asObject(src.explicitOwnerDecisionConsumption) ||
    asObject(src.consumption);

  const forbiddenLive = [];
  collectForbiddenLiveKeys(src, 'input', forbiddenLive);
  if (forbiddenLive.length) {
    return blockedAuthority({
      sourceRefs: sourceRefsFrom(consumption, src),
      preservedWarnings: consumption
        ? cloneList(consumption.preservedWarnings)
        : [],
      preservedMissingRequirements: consumption
        ? cloneList(consumption.preservedMissingRequirements)
        : [],
      preservedBlockingReasons: consumption
        ? cloneList(consumption.preservedBlockingReasons)
        : [],
      preservedAuditTrail: consumption
        ? cloneList(consumption.preservedAuditTrail)
        : [],
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
  if (consumption) {
    collectForbiddenAuthorityFlags(
      consumption,
      'consumptionOutput',
      forbiddenAuth
    );
  }
  if (forbiddenAuth.length) {
    return blockedAuthority({
      sourceRefs: sourceRefsFrom(consumption, src),
      preservedWarnings: consumption
        ? cloneList(consumption.preservedWarnings)
        : [],
      preservedMissingRequirements: consumption
        ? cloneList(consumption.preservedMissingRequirements)
        : [],
      preservedBlockingReasons: consumption
        ? cloneList(consumption.preservedBlockingReasons)
        : [],
      preservedAuditTrail: consumption
        ? cloneList(consumption.preservedAuditTrail)
        : [],
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
    src.treatDeveloperAuthorityCandidateAsActivation === true ||
    src.requestRuntimeActivation === true ||
    src.requestUserFacingRecommendation === true ||
    src.skipNextGate === true
  ) {
    return blockedAuthority({
      sourceRefs: sourceRefsFrom(consumption, src),
      preservedWarnings: consumption
        ? cloneList(consumption.preservedWarnings)
        : [],
      preservedMissingRequirements: consumption
        ? cloneList(consumption.preservedMissingRequirements)
        : [],
      preservedBlockingReasons: consumption
        ? cloneList(consumption.preservedBlockingReasons)
        : [],
      preservedAuditTrail: consumption
        ? cloneList(consumption.preservedAuditTrail)
        : [],
      blockingReasons: [
        {
          code: 'activation_or_user_facing_request_forbidden',
          detail:
            'developer_authority_candidate_cannot_become_runtime_ui_or_user_facing_activation'
        }
      ],
      nextGateRequired: 'recommendation_authority_static_verification',
      notAuthority: emptyNotAuthority()
    });
  }

  if (
    src.requestProductAuthority === true ||
    src.requestPlantSuitabilityAuthority === true ||
    src.requestProductEligibility === true ||
    src.grantProductAuthority === true ||
    src.grantPlantSuitabilityAuthority === true ||
    src.grantProductEligibility === true
  ) {
    return blockedAuthority({
      sourceRefs: sourceRefsFrom(consumption, src),
      preservedWarnings: consumption
        ? cloneList(consumption.preservedWarnings)
        : [],
      preservedMissingRequirements: consumption
        ? cloneList(consumption.preservedMissingRequirements)
        : [],
      preservedBlockingReasons: consumption
        ? cloneList(consumption.preservedBlockingReasons)
        : [],
      preservedAuditTrail: consumption
        ? cloneList(consumption.preservedAuditTrail)
        : [],
      blockingReasons: [
        {
          code: 'product_or_suitability_authority_request_forbidden',
          detail:
            'recommendation_authority_cannot_grant_product_plant_suitability_or_eligibility'
        }
      ],
      nextGateRequired: 'recommendation_authority_static_verification',
      notAuthority: emptyNotAuthority()
    });
  }

  if (!consumption) {
    return blockedAuthority({
      sourceRefs: {
        decisionId: null,
        queueItemRef: clonePlain(src.queueItemRef) || null,
        sourcePacketRef: clonePlain(src.sourcePacketRef) || null,
        plantRef: clonePlain(src.plantRef) || null
      },
      blockingReasons: [
        {
          code: 'missing_consumption_output',
          detail: 'explicit_owner_decision_consumption_required'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (
    src.markStale === true ||
    src.markSuperseded === true ||
    src.markMalformed === true ||
    src.markDetached === true ||
    consumption.superseded === true ||
    consumption.stale === true ||
    consumption.malformed === true ||
    consumption.detached === true
  ) {
    return blockedAuthority({
      sourceRefs: sourceRefsFrom(consumption, src),
      preservedWarnings: cloneList(consumption.preservedWarnings),
      preservedMissingRequirements: cloneList(
        consumption.preservedMissingRequirements
      ),
      preservedBlockingReasons: cloneList(consumption.preservedBlockingReasons),
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'source_stale_superseded_malformed_detached_or_blocked',
          detail: src.markDetached
            ? 'detached'
            : src.markMalformed
              ? 'malformed'
              : src.markSuperseded || consumption.superseded === true
                ? 'superseded'
                : 'stale'
        }
      ],
      notAuthority: strengthenNotAuthority(consumption.notAuthority)
    });
  }

  if (
    consumption.consumptionVersion !==
    SR_DEVELOPER_RECOMMENDATION_AUTHORITY_SOURCE_VERSION
  ) {
    return blockedAuthority({
      sourceRefs: sourceRefsFrom(consumption, src),
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'unsupported_consumption_version',
          detail: String(consumption.consumptionVersion || '')
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (
    consumption.capability !==
    SR_DEVELOPER_RECOMMENDATION_AUTHORITY_SOURCE_CAPABILITY
  ) {
    return blockedAuthority({
      sourceRefs: sourceRefsFrom(consumption, src),
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'unsupported_capability',
          detail: String(consumption.capability || '')
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  const refs = sourceRefsFrom(consumption, src);
  if (!isNonEmptyString(refs.decisionId)) {
    return blockedAuthority({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        { code: 'missing_source_ref', detail: 'decisionId_required' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }
  if (!asObject(refs.queueItemRef)) {
    return blockedAuthority({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        { code: 'missing_source_ref', detail: 'queueItemRef_required' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }
  if (!asObject(refs.sourcePacketRef)) {
    return blockedAuthority({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        { code: 'missing_source_ref', detail: 'sourcePacketRef_required' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }
  if (!asObject(refs.plantRef)) {
    return blockedAuthority({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        { code: 'missing_source_ref', detail: 'plantRef_required' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!isNonEmptyString(consumption.summaryFingerprint)) {
    return blockedAuthority({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'missing_or_mismatched_summary_fingerprint',
          detail: 'consumption_summaryFingerprint_missing'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!isNonEmptyString(src.expectedSummaryFingerprint)) {
    return blockedAuthority({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
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
    String(consumption.summaryFingerprint).trim()
  ) {
    return blockedAuthority({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'missing_or_mismatched_summary_fingerprint',
          detail: 'fingerprint_mismatch'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (consumption.noActivation !== true) {
    return blockedAuthority({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'no_activation_required',
          detail: 'noActivation_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (consumption.developerOnly !== true) {
    return blockedAuthority({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'developer_only_required',
          detail: 'developerOnly_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (consumption.reversible !== true) {
    return blockedAuthority({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        { code: 'reversible_required', detail: 'reversible_must_be_true' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (consumption.noAutomaticApproval !== true) {
    return blockedAuthority({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'no_automatic_approval_required',
          detail: 'noAutomaticApproval_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (consumption.explicitOwnerActionRequired !== true) {
    return blockedAuthority({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'explicit_owner_action_required',
          detail: 'explicitOwnerActionRequired_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (
    !Array.isArray(consumption.preservedAuditTrail) ||
    consumption.preservedAuditTrail.length === 0
  ) {
    return blockedAuthority({
      sourceRefs: refs,
      blockingReasons: [
        {
          code: 'missing_audit_trail',
          detail: 'preservedAuditTrail_required'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!Array.isArray(consumption.preservedWarnings)) {
    return blockedAuthority({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'missing_preserved_warnings',
          detail: 'preservedWarnings_required'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!Array.isArray(consumption.preservedMissingRequirements)) {
    return blockedAuthority({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'missing_preserved_missing_requirements',
          detail: 'preservedMissingRequirements_required'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!Array.isArray(consumption.preservedBlockingReasons)) {
    return blockedAuthority({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'missing_preserved_blocking_reasons',
          detail: 'preservedBlockingReasons_required'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  const expectedHardBlocks = Array.isArray(src.expectedHardBlocks)
    ? src.expectedHardBlocks
    : [];
  if (expectedHardBlocks.length) {
    const preserved = cloneList(consumption.preservedBlockingReasons);
    const missing = [];
    for (let i = 0; i < expectedHardBlocks.length; i++) {
      const code = expectedHardBlocks[i];
      const found = preserved.some(function (x) {
        return x && x.code === code;
      });
      if (!found) missing.push(code);
    }
    if (missing.length) {
      return blockedAuthority({
        sourceRefs: refs,
        preservedWarnings: cloneList(consumption.preservedWarnings),
        preservedMissingRequirements: cloneList(
          consumption.preservedMissingRequirements
        ),
        preservedBlockingReasons: preserved,
        preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
        blockingReasons: [
          {
            code: 'hard_block_not_preserved',
            detail: missing.sort().join(',')
          }
        ],
        notAuthority: strengthenNotAuthority(consumption.notAuthority)
      });
    }
  }

  const consumptionStatus = isNonEmptyString(consumption.consumptionStatus)
    ? String(consumption.consumptionStatus).trim()
    : null;
  const ownerDecisionEcho = isNonEmptyString(consumption.ownerDecisionEcho)
    ? String(consumption.ownerDecisionEcho).trim()
    : null;

  const preservedWarnings = cloneList(consumption.preservedWarnings);
  const preservedMissingRequirements = cloneList(
    consumption.preservedMissingRequirements
  );
  const preservedBlockingReasons = cloneList(
    consumption.preservedBlockingReasons
  );
  const requiredFollowUp = Array.isArray(consumption.requiredFollowUp)
    ? consumption.requiredFollowUp.slice()
    : Array.isArray(src.requiredFollowUp)
      ? src.requiredFollowUp.slice()
      : [];

  if (
    ownerDecisionEcho === 'rejected_later' ||
    consumptionStatus === 'rejected_path'
  ) {
    const preservedAuditTrail = cloneList(
      consumption.preservedAuditTrail
    ).concat([
      {
        event: 'recommendation_authority_blocked_rejected_later',
        ownerDecisionEcho: 'rejected_later',
        recommendationAuthorityStatus: 'blocked',
        noRuntimeActivation: true,
        automaticApproval: false,
        evidencePreserved: true,
        noDeletion: true
      }
    ]);
    return blockedAuthority({
      sourceRefs: refs,
      preservedWarnings: preservedWarnings,
      preservedMissingRequirements: preservedMissingRequirements,
      preservedBlockingReasons: preservedBlockingReasons,
      preservedAuditTrail: preservedAuditTrail,
      requiredFollowUp: requiredFollowUp,
      blockingReasons: [
        {
          code: 'rejected_later_source',
          detail: 'rejected_later_is_blocked_evidence_preserved_no_deletion'
        }
      ],
      nextGateRequired: 'owner_review_followup',
      notAuthority: strengthenNotAuthority(consumption.notAuthority)
    });
  }

  if (
    ownerDecisionEcho === 'needs_more_data' ||
    consumptionStatus === 'needs_more_data'
  ) {
    const preservedAuditTrail = cloneList(
      consumption.preservedAuditTrail
    ).concat([
      {
        event: 'recommendation_authority_not_ready_needs_more_data',
        ownerDecisionEcho: 'needs_more_data',
        recommendationAuthorityStatus: 'not_ready',
        noRuntimeActivation: true,
        automaticApproval: false,
        notConvertedToApproval: true
      }
    ]);
    return notReadyAuthority({
      sourceRefs: refs,
      preservedWarnings: preservedWarnings,
      preservedMissingRequirements: preservedMissingRequirements,
      preservedBlockingReasons: preservedBlockingReasons,
      preservedAuditTrail: preservedAuditTrail,
      requiredFollowUp: requiredFollowUp,
      blockingReasons: [
        {
          code: 'needs_more_data_source',
          detail: 'needs_more_data_never_converted_to_approval'
        }
      ],
      nextGateRequired: 'owner_review_followup',
      notAuthority: strengthenNotAuthority(consumption.notAuthority)
    });
  }

  if (consumptionStatus !== 'developer_consumable') {
    return blockedAuthority({
      sourceRefs: refs,
      preservedWarnings: preservedWarnings,
      preservedMissingRequirements: preservedMissingRequirements,
      preservedBlockingReasons: preservedBlockingReasons,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      requiredFollowUp: requiredFollowUp,
      blockingReasons: [
        {
          code: 'consumption_status_not_developer_consumable',
          detail: String(consumptionStatus || '')
        }
      ],
      notAuthority: strengthenNotAuthority(consumption.notAuthority)
    });
  }

  if (ownerDecisionEcho !== 'approved_later') {
    return blockedAuthority({
      sourceRefs: refs,
      preservedWarnings: preservedWarnings,
      preservedMissingRequirements: preservedMissingRequirements,
      preservedBlockingReasons: preservedBlockingReasons,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      requiredFollowUp: requiredFollowUp,
      blockingReasons: [
        {
          code: 'owner_decision_echo_not_approved_later',
          detail: String(ownerDecisionEcho || '')
        }
      ],
      notAuthority: strengthenNotAuthority(consumption.notAuthority)
    });
  }

  if (
    consumption.nextGateRequired == null ||
    (Array.isArray(consumption.nextGateRequired) &&
      consumption.nextGateRequired.length === 0) ||
    (typeof consumption.nextGateRequired === 'string' &&
      !isNonEmptyString(consumption.nextGateRequired))
  ) {
    return blockedAuthority({
      sourceRefs: refs,
      preservedWarnings: preservedWarnings,
      preservedMissingRequirements: preservedMissingRequirements,
      preservedBlockingReasons: preservedBlockingReasons,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'next_gate_required_missing_or_wrong',
          detail: 'nextGateRequired_missing'
        }
      ],
      notAuthority: strengthenNotAuthority(consumption.notAuthority)
    });
  }

  if (
    !nextGateIncludesRecommendationAuthorityContract(
      consumption.nextGateRequired
    )
  ) {
    return blockedAuthority({
      sourceRefs: refs,
      preservedWarnings: preservedWarnings,
      preservedMissingRequirements: preservedMissingRequirements,
      preservedBlockingReasons: preservedBlockingReasons,
      preservedAuditTrail: cloneList(consumption.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'next_gate_required_missing_or_wrong',
          detail:
            'nextGateRequired_must_include_recommendation_authority_contract'
        }
      ],
      notAuthority: strengthenNotAuthority(consumption.notAuthority)
    });
  }

  const outputNextGate = resolveOutputNextGate(src);
  const preservedAuditTrail = cloneList(
    consumption.preservedAuditTrail
  ).concat([
    {
      event: 'recommendation_authority_developer_authority_candidate',
      ownerDecisionEcho: 'approved_later',
      recommendationAuthorityStatus: 'developer_authority_candidate',
      noRuntimeActivation: true,
      noUserFacingRecommendation: true,
      noPlantSuitabilityAuthority: true,
      noProductAuthority: true,
      noProductEligibility: true,
      noCatalogMutation: true,
      automaticApproval: false,
      nextGateRequired: outputNextGate
    }
  ]);

  return baseAuthority({
    recommendationAuthorityStatus: 'developer_authority_candidate',
    sourceRefs: refs,
    preservedWarnings: preservedWarnings,
    preservedMissingRequirements: preservedMissingRequirements,
    preservedBlockingReasons: preservedBlockingReasons,
    preservedAuditTrail: preservedAuditTrail,
    requiredFollowUp: requiredFollowUp,
    nextGateRequired: outputNextGate,
    notAuthority: strengthenNotAuthority(consumption.notAuthority)
  });
}

function syntheticConsumptionBase(partial) {
  const ownerDecisionEcho = partial.ownerDecisionEcho || 'approved_later';
  const plantKey =
    (partial.plantRef && partial.plantRef.canonicalKey) || 'lavender';
  const decisionId =
    partial.decisionId ||
    ['eod', plantKey, ownerDecisionEcho, 'recorded'].join('-');
  const consumptionStatus =
    partial.consumptionStatus ||
    (ownerDecisionEcho === 'approved_later'
      ? 'developer_consumable'
      : ownerDecisionEcho === 'rejected_later'
        ? 'rejected_path'
        : 'needs_more_data');
  const fingerprint =
    partial.summaryFingerprint ||
    [
      'synthetic-eodc-fp',
      plantKey,
      ownerDecisionEcho,
      consumptionStatus,
      decisionId
    ].join('|');

  return {
    consumptionVersion: SR_DEVELOPER_RECOMMENDATION_AUTHORITY_SOURCE_VERSION,
    capability: SR_DEVELOPER_RECOMMENDATION_AUTHORITY_SOURCE_CAPABILITY,
    developerOnly: true,
    syntheticOnly: true,
    activation: 'explicit_call_only',
    consumptionStatus: consumptionStatus,
    ownerDecisionEcho: ownerDecisionEcho,
    sourceRefs: {
      decisionId: decisionId,
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
      }
    },
    preservedWarnings: partial.preservedWarnings || [
      {
        code: 'candidate_review_only',
        detail: 'developer_owner_review_only_not_user_facing'
      }
    ],
    preservedMissingRequirements: partial.preservedMissingRequirements || [
      'additional_trusted_axis'
    ],
    preservedBlockingReasons: partial.preservedBlockingReasons || [],
    preservedAuditTrail: partial.preservedAuditTrail || [
      {
        event: 'explicit_owner_decision_consumed',
        ownerDecision: ownerDecisionEcho,
        consumptionStatus: consumptionStatus,
        noActivation: true,
        automaticApproval: false,
        reversible: true
      }
    ],
    requiredFollowUp: partial.requiredFollowUp || [],
    notAuthority: strengthenNotAuthority(
      partial.notAuthority || emptyNotAuthority()
    ),
    noActivation: Object.prototype.hasOwnProperty.call(partial, 'noActivation')
      ? partial.noActivation
      : true,
    reversible: Object.prototype.hasOwnProperty.call(partial, 'reversible')
      ? partial.reversible
      : true,
    nextGateRequired: Object.prototype.hasOwnProperty.call(
      partial,
      'nextGateRequired'
    )
      ? partial.nextGateRequired
      : ownerDecisionEcho === 'approved_later'
        ? 'recommendation_authority_contract'
        : 'owner_review_followup',
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
    productEligibilityAuthority: partial.productEligibilityAuthority === true,
    summaryFingerprint: fingerprint
  };
}

/** Embedded synthetic fixtures for harness / Node proof. */
export function getSmartRecDeveloperRecommendationAuthoritySyntheticFixtures() {
  const approved = syntheticConsumptionBase({
    ownerDecisionEcho: 'approved_later',
    consumptionStatus: 'developer_consumable',
    decisionId: 'eod-lavender-approved_later-recorded',
    nextGateRequired: 'recommendation_authority_contract',
    summaryFingerprint: 'synthetic-eodc-fp|lavender|approved_later|A'
  });

  const rejected = syntheticConsumptionBase({
    ownerDecisionEcho: 'rejected_later',
    consumptionStatus: 'rejected_path',
    decisionId: 'eod-lavender-rejected_later-recorded',
    nextGateRequired: 'owner_review_followup',
    summaryFingerprint: 'synthetic-eodc-fp|lavender|rejected_later|B',
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
    ],
    preservedAuditTrail: [
      {
        event: 'explicit_owner_decision_consumed',
        ownerDecision: 'rejected_later',
        consumptionStatus: 'rejected_path',
        noActivation: true,
        automaticApproval: false,
        reversible: true,
        evidencePreserved: true
      }
    ]
  });

  const needsMore = syntheticConsumptionBase({
    ownerDecisionEcho: 'needs_more_data',
    consumptionStatus: 'needs_more_data',
    decisionId: 'eod-lavender-needs_more_data-recorded',
    nextGateRequired: 'owner_review_followup',
    requiredFollowUp: ['additional_trusted_axis'],
    summaryFingerprint: 'synthetic-eodc-fp|lavender|needs_more_data|C',
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
      consumptionOutput: approved,
      expectedSummaryFingerprint: approved.summaryFingerprint,
      syntheticOnly: true
    },
    B: {
      consumptionOutput: rejected,
      expectedSummaryFingerprint: rejected.summaryFingerprint,
      syntheticOnly: true
    },
    C: {
      consumptionOutput: needsMore,
      expectedSummaryFingerprint: needsMore.summaryFingerprint,
      syntheticOnly: true
    },
    D: {
      // missing consumption output
      expectedSummaryFingerprint: 'unused',
      syntheticOnly: true
    },
    E: {
      consumptionOutput: syntheticConsumptionBase({
        ownerDecisionEcho: 'approved_later',
        consumptionStatus: 'developer_consumable',
        decisionId: 'eod-lavender-approved_later-wrong-gate',
        nextGateRequired: 'consumer_static_verification',
        summaryFingerprint: 'synthetic-eodc-fp|lavender|approved_later|E'
      }),
      expectedSummaryFingerprint: 'synthetic-eodc-fp|lavender|approved_later|E',
      syntheticOnly: true
    },
    F: {
      consumptionOutput: approved,
      expectedSummaryFingerprint: 'mismatched-fingerprint-value',
      syntheticOnly: true
    },
    G: {
      consumptionOutput: syntheticConsumptionBase({
        ownerDecisionEcho: 'approved_later',
        consumptionStatus: 'developer_consumable',
        decisionId: 'eod-lavender-approved_later-auth',
        nextGateRequired: 'recommendation_authority_contract',
        summaryFingerprint: 'synthetic-eodc-fp|lavender|approved_later|G',
        recommendationAuthority: true
      }),
      expectedSummaryFingerprint: 'synthetic-eodc-fp|lavender|approved_later|G',
      syntheticOnly: true
    },
    H: {
      consumptionOutput: approved,
      expectedSummaryFingerprint: approved.summaryFingerprint,
      treatDeveloperAuthorityCandidateAsActivation: true,
      requestRuntimeActivation: true,
      requestUserFacingRecommendation: true,
      skipNextGate: true,
      syntheticOnly: true
    },
    I: {
      consumptionOutput: approved,
      expectedSummaryFingerprint: approved.summaryFingerprint,
      requestProductAuthority: true,
      requestPlantSuitabilityAuthority: true,
      requestProductEligibility: true,
      syntheticOnly: true
    }
  });
}
