/**
 * Cruvit — Smart Recommendations developer Recommendation Policy
 * --------------------------------------------------------------
 * Pure, developer-only, synthetic-only explicit Recommendation Policy
 * gate over already-built Recommendation Authority output.
 *
 * NON-AUTHORITY / NON-ACTIVATION CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Accepts already-built synthetic Recommendation Authority output
 *    only (fixtures embed authority records; no module import).
 *  - Does not import GOS, v1b, product runtime, overlay, or live weather.
 *  - Does not activate Smart Recommendations or Product Authority.
 *  - Does not recommend plants, grant eligibility, or plant suitability.
 *  - Does not implement Owner Review Queue UI.
 *  - Does not apply decisions to catalog/recommendations/products.
 *  - developer_policy_candidate is not runtime/UI/user-facing activation.
 *  - rejected_later is blocked while preserving evidence/audit.
 *  - needs_more_data becomes not_ready (or blocked) and never approval.
 */

export const SR_DEVELOPER_RECOMMENDATION_POLICY_VERSION =
  '0.1.0-sr-recommendation-policy';

export const SR_DEVELOPER_RECOMMENDATION_POLICY_CAPABILITY =
  'explicit_developer_recommendation_policy';

export const SR_DEVELOPER_RECOMMENDATION_POLICY_SOURCE_VERSION =
  '0.1.0-sr-recommendation-authority';

export const SR_DEVELOPER_RECOMMENDATION_POLICY_SOURCE_CAPABILITY =
  'explicit_developer_recommendation_authority';

export const SR_DEVELOPER_RECOMMENDATION_POLICY_STATUSES = Object.freeze([
  'blocked',
  'not_ready',
  'developer_policy_candidate'
]);

export const SR_DEVELOPER_RECOMMENDATION_POLICY_INPUT_GATES = Object.freeze([
  'recommendation_policy_contract'
]);

export const SR_DEVELOPER_RECOMMENDATION_POLICY_NEXT_GATES = Object.freeze([
  'recommendation_policy_static_verification',
  'plant_suitability_authority_contract',
  'runtime_activation_contract',
  'owner_review_followup',
  'recommendation_policy_followup'
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
  'recommendationMutationAuthority',
  'productMutationAuthority',
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
    recommendationMutationAuthority: false,
    productMutationAuthority: false,
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

function nextGateIncludesRecommendationPolicyContract(value) {
  if (Array.isArray(value)) {
    return value.some(function (g) {
      return String(g).trim() === 'recommendation_policy_contract';
    });
  }
  if (isNonEmptyString(value)) {
    return String(value).trim() === 'recommendation_policy_contract';
  }
  return false;
}

function hasCode(list, code) {
  return Array.isArray(list) && list.some(function (x) {
    return x && x.code === code;
  });
}

function buildDescriptor() {
  return freezeDeep({
    recommendationPolicyVersion: SR_DEVELOPER_RECOMMENDATION_POLICY_VERSION,
    capability: SR_DEVELOPER_RECOMMENDATION_POLICY_CAPABILITY,
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
    recommendationMutationAuthority: false,
    productMutationAuthority: false,
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
    noRecommendationMutation: true,
    noProductMutation: true,
    doesNotActivateSmartRecommendations: true,
    doesNotImplementOwnerReviewQueueUi: true,
    doesNotApplyDecisionsToCatalogOrProducts: true,
    doesNotConvertNeedsMoreDataToApproval: true,
    doesNotDeleteOnRejectedLater: true,
    developerPolicyCandidateIsNotActivation: true,
    requiresNextGateEvenAfterDeveloperPolicyCandidate: true
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperRecommendationPolicyDescriptor() {
  return DESCRIPTOR;
}

function buildPolicyFingerprint(item) {
  return [
    SR_DEVELOPER_RECOMMENDATION_POLICY_VERSION,
    String(item.recommendationPolicyStatus || ''),
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
    if (SR_DEVELOPER_RECOMMENDATION_POLICY_NEXT_GATES.indexOf(g) >= 0) {
      return g;
    }
  }
  return 'recommendation_policy_static_verification';
}

function sourceRefsFrom(authority, input) {
  const a = asObject(authority) || {};
  const src = asObject(input) || {};
  const refs = asObject(a.sourceRefs) || {};
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

function basePolicy(partial) {
  const item = {
    recommendationPolicyVersion: SR_DEVELOPER_RECOMMENDATION_POLICY_VERSION,
    capability: SR_DEVELOPER_RECOMMENDATION_POLICY_CAPABILITY,
    developerOnly: true,
    syntheticOnly: true,
    activation: 'explicit_call_only',
    recommendationPolicyStatus:
      partial.recommendationPolicyStatus || 'blocked',
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
    noRecommendationMutation: true,
    noProductMutation: true,
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
    recommendationMutationAuthority: false,
    productMutationAuthority: false,
    productEligibilityAuthority: false,
    summaryFingerprint: ''
  };

  if (
    item.recommendationPolicyStatus === 'developer_policy_candidate' &&
    !isNonEmptyString(item.nextGateRequired)
  ) {
    item.nextGateRequired = 'recommendation_policy_static_verification';
  }

  item.summaryFingerprint = buildPolicyFingerprint(item);
  return freezeDeep(item);
}

function blockedPolicy(partial) {
  return basePolicy(
    Object.assign({}, partial, {
      recommendationPolicyStatus: 'blocked',
      noRuntimeActivation: true,
      noUserFacingRecommendation: true,
      noPlantSuitabilityAuthority: true,
      noProductAuthority: true,
      noProductEligibility: true,
      noCatalogMutation: true,
      noRecommendationMutation: true,
      noProductMutation: true,
      noAutomaticApproval: true,
      explicitOwnerActionRequired: true,
      nextGateRequired: partial.nextGateRequired || null
    })
  );
}

function notReadyPolicy(partial) {
  return basePolicy(
    Object.assign({}, partial, {
      recommendationPolicyStatus: 'not_ready',
      noRuntimeActivation: true,
      noUserFacingRecommendation: true,
      noPlantSuitabilityAuthority: true,
      noProductAuthority: true,
      noProductEligibility: true,
      noCatalogMutation: true,
      noRecommendationMutation: true,
      noProductMutation: true,
      noAutomaticApproval: true,
      explicitOwnerActionRequired: true,
      nextGateRequired: partial.nextGateRequired || 'owner_review_followup'
    })
  );
}

function preservedFrom(authority) {
  return {
    preservedWarnings: authority
      ? cloneList(authority.preservedWarnings)
      : [],
    preservedMissingRequirements: authority
      ? cloneList(authority.preservedMissingRequirements)
      : [],
    preservedBlockingReasons: authority
      ? cloneList(authority.preservedBlockingReasons)
      : [],
    preservedAuditTrail: authority
      ? cloneList(authority.preservedAuditTrail)
      : []
  };
}

/**
 * Build a developer-only Recommendation Policy result from synthetic
 * Recommendation Authority output.
 * @param {object|null} input
 * @returns {object} frozen recommendation policy result
 */
export function buildDeveloperRecommendationPolicy(input) {
  const src = asObject(input) || {};
  const authority =
    asObject(src.recommendationAuthorityOutput) ||
    asObject(src.authorityOutput) ||
    asObject(src.authority);

  const forbiddenLive = [];
  collectForbiddenLiveKeys(src, 'input', forbiddenLive);
  if (forbiddenLive.length) {
    return blockedPolicy(
      Object.assign({}, preservedFrom(authority), {
        sourceRefs: sourceRefsFrom(authority, src),
        blockingReasons: [
          {
            code: 'forbidden_live_or_provider_keys',
            detail: forbiddenLive.sort().join(',')
          }
        ],
        notAuthority: emptyNotAuthority()
      })
    );
  }

  const forbiddenAuth = [];
  collectForbiddenAuthorityFlags(src, 'input', forbiddenAuth);
  if (authority) {
    collectForbiddenAuthorityFlags(
      authority,
      'recommendationAuthorityOutput',
      forbiddenAuth
    );
  }
  if (forbiddenAuth.length) {
    return blockedPolicy(
      Object.assign({}, preservedFrom(authority), {
        sourceRefs: sourceRefsFrom(authority, src),
        blockingReasons: [
          {
            code: 'forbidden_authority_flag',
            detail: forbiddenAuth.sort().join(',')
          }
        ],
        notAuthority: emptyNotAuthority()
      })
    );
  }

  if (
    src.treatAsActivation === true ||
    src.treatDeveloperPolicyCandidateAsActivation === true ||
    src.treatDeveloperAuthorityCandidateAsActivation === true ||
    src.requestRuntimeActivation === true ||
    src.requestUserFacingRecommendation === true ||
    src.skipNextGate === true
  ) {
    return blockedPolicy(
      Object.assign({}, preservedFrom(authority), {
        sourceRefs: sourceRefsFrom(authority, src),
        blockingReasons: [
          {
            code: 'activation_or_user_facing_request_forbidden',
            detail:
              'developer_policy_candidate_cannot_become_runtime_ui_or_user_facing_activation'
          }
        ],
        nextGateRequired: 'recommendation_policy_static_verification',
        notAuthority: emptyNotAuthority()
      })
    );
  }

  if (
    src.requestProductAuthority === true ||
    src.requestPlantSuitabilityAuthority === true ||
    src.requestProductEligibility === true ||
    src.grantProductAuthority === true ||
    src.grantPlantSuitabilityAuthority === true ||
    src.grantProductEligibility === true
  ) {
    return blockedPolicy(
      Object.assign({}, preservedFrom(authority), {
        sourceRefs: sourceRefsFrom(authority, src),
        blockingReasons: [
          {
            code: 'product_or_suitability_authority_request_forbidden',
            detail:
              'recommendation_policy_cannot_grant_product_plant_suitability_or_eligibility'
          }
        ],
        nextGateRequired: 'recommendation_policy_static_verification',
        notAuthority: emptyNotAuthority()
      })
    );
  }

  if (
    src.mutateCatalog === true ||
    src.mutateRecommendations === true ||
    src.mutateProducts === true ||
    src.requestCatalogMutation === true ||
    src.requestRecommendationMutation === true ||
    src.requestProductMutation === true
  ) {
    return blockedPolicy(
      Object.assign({}, preservedFrom(authority), {
        sourceRefs: sourceRefsFrom(authority, src),
        blockingReasons: [
          {
            code: 'catalog_recommendation_product_mutation_forbidden',
            detail:
              'recommendation_policy_cannot_mutate_catalog_recommendations_or_products'
          }
        ],
        nextGateRequired: 'recommendation_policy_static_verification',
        notAuthority: emptyNotAuthority()
      })
    );
  }

  if (!authority) {
    return blockedPolicy({
      sourceRefs: {
        decisionId: null,
        queueItemRef: clonePlain(src.queueItemRef) || null,
        sourcePacketRef: clonePlain(src.sourcePacketRef) || null,
        plantRef: clonePlain(src.plantRef) || null
      },
      blockingReasons: [
        {
          code: 'missing_recommendation_authority_output',
          detail: 'recommendation_authority_output_required'
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
    authority.superseded === true ||
    authority.stale === true ||
    authority.malformed === true ||
    authority.detached === true
  ) {
    return blockedPolicy(
      Object.assign({}, preservedFrom(authority), {
        sourceRefs: sourceRefsFrom(authority, src),
        blockingReasons: [
          {
            code: 'source_stale_superseded_malformed_detached_or_blocked',
            detail: src.markDetached
              ? 'detached'
              : src.markMalformed
                ? 'malformed'
                : src.markSuperseded || authority.superseded === true
                  ? 'superseded'
                  : 'stale'
          }
        ],
        notAuthority: strengthenNotAuthority(authority.notAuthority)
      })
    );
  }

  if (
    authority.recommendationAuthorityVersion !==
    SR_DEVELOPER_RECOMMENDATION_POLICY_SOURCE_VERSION
  ) {
    return blockedPolicy({
      sourceRefs: sourceRefsFrom(authority, src),
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'unsupported_authority_version',
          detail: String(authority.recommendationAuthorityVersion || '')
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (
    authority.capability !==
    SR_DEVELOPER_RECOMMENDATION_POLICY_SOURCE_CAPABILITY
  ) {
    return blockedPolicy({
      sourceRefs: sourceRefsFrom(authority, src),
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'unsupported_capability',
          detail: String(authority.capability || '')
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  const refs = sourceRefsFrom(authority, src);
  if (!isNonEmptyString(refs.decisionId)) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        { code: 'missing_source_ref', detail: 'decisionId_required' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }
  if (!asObject(refs.queueItemRef)) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        { code: 'missing_source_ref', detail: 'queueItemRef_required' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }
  if (!asObject(refs.sourcePacketRef)) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        { code: 'missing_source_ref', detail: 'sourcePacketRef_required' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }
  if (!asObject(refs.plantRef)) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        { code: 'missing_source_ref', detail: 'plantRef_required' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!isNonEmptyString(authority.summaryFingerprint)) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'missing_or_mismatched_summary_fingerprint',
          detail: 'authority_summaryFingerprint_missing'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!isNonEmptyString(src.expectedSummaryFingerprint)) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
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
    String(authority.summaryFingerprint).trim()
  ) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'missing_or_mismatched_summary_fingerprint',
          detail: 'fingerprint_mismatch'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (authority.noRuntimeActivation !== true) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'no_runtime_activation_required',
          detail: 'noRuntimeActivation_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (authority.noUserFacingRecommendation !== true) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'no_user_facing_recommendation_required',
          detail: 'noUserFacingRecommendation_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (authority.noPlantSuitabilityAuthority !== true) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'no_plant_suitability_authority_required',
          detail: 'noPlantSuitabilityAuthority_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (authority.noProductAuthority !== true) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'no_product_authority_required',
          detail: 'noProductAuthority_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (authority.noProductEligibility !== true) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'no_product_eligibility_required',
          detail: 'noProductEligibility_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (authority.noCatalogMutation !== true) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'no_catalog_mutation_required',
          detail: 'noCatalogMutation_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (authority.developerOnly !== true) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'developer_only_required',
          detail: 'developerOnly_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (authority.reversible !== true && src.reversible !== true) {
    if (authority.reversible !== true) {
      return blockedPolicy({
        sourceRefs: refs,
        preservedAuditTrail: cloneList(authority.preservedAuditTrail),
        blockingReasons: [
          { code: 'reversible_required', detail: 'reversible_must_be_true' }
        ],
        notAuthority: emptyNotAuthority()
      });
    }
  }

  if (authority.noAutomaticApproval !== true) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'no_automatic_approval_required',
          detail: 'noAutomaticApproval_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (authority.explicitOwnerActionRequired !== true) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
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
    !Array.isArray(authority.preservedAuditTrail) ||
    authority.preservedAuditTrail.length === 0
  ) {
    return blockedPolicy({
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

  if (!Array.isArray(authority.preservedWarnings)) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'missing_preserved_warnings',
          detail: 'preservedWarnings_required'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!Array.isArray(authority.preservedMissingRequirements)) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'missing_preserved_missing_requirements',
          detail: 'preservedMissingRequirements_required'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!Array.isArray(authority.preservedBlockingReasons)) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
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
    const preserved = cloneList(authority.preservedBlockingReasons);
    const missing = [];
    for (let i = 0; i < expectedHardBlocks.length; i++) {
      const code = expectedHardBlocks[i];
      const found = preserved.some(function (x) {
        return x && x.code === code;
      });
      if (!found) missing.push(code);
    }
    if (missing.length) {
      return blockedPolicy({
        sourceRefs: refs,
        preservedWarnings: cloneList(authority.preservedWarnings),
        preservedMissingRequirements: cloneList(
          authority.preservedMissingRequirements
        ),
        preservedBlockingReasons: preserved,
        preservedAuditTrail: cloneList(authority.preservedAuditTrail),
        blockingReasons: [
          {
            code: 'hard_block_not_preserved',
            detail: missing.sort().join(',')
          }
        ],
        notAuthority: strengthenNotAuthority(authority.notAuthority)
      });
    }
  }

  const authorityStatus = isNonEmptyString(
    authority.recommendationAuthorityStatus
  )
    ? String(authority.recommendationAuthorityStatus).trim()
    : null;
  const ownerDecisionEcho = isNonEmptyString(authority.ownerDecisionEcho)
    ? String(authority.ownerDecisionEcho).trim()
    : isNonEmptyString(src.ownerDecisionEcho)
      ? String(src.ownerDecisionEcho).trim()
      : null;

  const preservedWarnings = cloneList(authority.preservedWarnings);
  const preservedMissingRequirements = cloneList(
    authority.preservedMissingRequirements
  );
  const preservedBlockingReasons = cloneList(
    authority.preservedBlockingReasons
  );
  const requiredFollowUp = Array.isArray(authority.requiredFollowUp)
    ? authority.requiredFollowUp.slice()
    : Array.isArray(src.requiredFollowUp)
      ? src.requiredFollowUp.slice()
      : [];

  if (
    ownerDecisionEcho === 'rejected_later' ||
    hasCode(authority.blockingReasons, 'rejected_later_source')
  ) {
    const preservedAuditTrail = cloneList(
      authority.preservedAuditTrail
    ).concat([
      {
        event: 'recommendation_policy_blocked_rejected_later',
        ownerDecisionEcho: 'rejected_later',
        recommendationPolicyStatus: 'blocked',
        noRuntimeActivation: true,
        automaticApproval: false,
        evidencePreserved: true,
        noDeletion: true
      }
    ]);
    return blockedPolicy({
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
      notAuthority: strengthenNotAuthority(authority.notAuthority)
    });
  }

  if (
    ownerDecisionEcho === 'needs_more_data' ||
    hasCode(authority.blockingReasons, 'needs_more_data_source')
  ) {
    const preservedAuditTrail = cloneList(
      authority.preservedAuditTrail
    ).concat([
      {
        event: 'recommendation_policy_not_ready_needs_more_data',
        ownerDecisionEcho: 'needs_more_data',
        recommendationPolicyStatus: 'not_ready',
        noRuntimeActivation: true,
        automaticApproval: false,
        notConvertedToApproval: true
      }
    ]);
    return notReadyPolicy({
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
      notAuthority: strengthenNotAuthority(authority.notAuthority)
    });
  }

  if (authorityStatus !== 'developer_authority_candidate') {
    return blockedPolicy({
      sourceRefs: refs,
      preservedWarnings: preservedWarnings,
      preservedMissingRequirements: preservedMissingRequirements,
      preservedBlockingReasons: preservedBlockingReasons,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      requiredFollowUp: requiredFollowUp,
      blockingReasons: [
        {
          code: 'authority_status_not_developer_authority_candidate',
          detail: String(authorityStatus || '')
        }
      ],
      notAuthority: strengthenNotAuthority(authority.notAuthority)
    });
  }

  if (
    authority.nextGateRequired == null ||
    (Array.isArray(authority.nextGateRequired) &&
      authority.nextGateRequired.length === 0) ||
    (typeof authority.nextGateRequired === 'string' &&
      !isNonEmptyString(authority.nextGateRequired))
  ) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedWarnings: preservedWarnings,
      preservedMissingRequirements: preservedMissingRequirements,
      preservedBlockingReasons: preservedBlockingReasons,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'next_gate_required_missing_or_wrong',
          detail: 'nextGateRequired_missing'
        }
      ],
      notAuthority: strengthenNotAuthority(authority.notAuthority)
    });
  }

  if (
    !nextGateIncludesRecommendationPolicyContract(authority.nextGateRequired)
  ) {
    return blockedPolicy({
      sourceRefs: refs,
      preservedWarnings: preservedWarnings,
      preservedMissingRequirements: preservedMissingRequirements,
      preservedBlockingReasons: preservedBlockingReasons,
      preservedAuditTrail: cloneList(authority.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'next_gate_required_missing_or_wrong',
          detail: 'nextGateRequired_must_include_recommendation_policy_contract'
        }
      ],
      notAuthority: strengthenNotAuthority(authority.notAuthority)
    });
  }

  const outputNextGate = resolveOutputNextGate(src);
  const preservedAuditTrail = cloneList(
    authority.preservedAuditTrail
  ).concat([
    {
      event: 'recommendation_policy_developer_policy_candidate',
      recommendationAuthorityStatus: 'developer_authority_candidate',
      recommendationPolicyStatus: 'developer_policy_candidate',
      noRuntimeActivation: true,
      noUserFacingRecommendation: true,
      noPlantSuitabilityAuthority: true,
      noProductAuthority: true,
      noProductEligibility: true,
      noCatalogMutation: true,
      noRecommendationMutation: true,
      noProductMutation: true,
      automaticApproval: false,
      nextGateRequired: outputNextGate
    }
  ]);

  return basePolicy({
    recommendationPolicyStatus: 'developer_policy_candidate',
    sourceRefs: refs,
    preservedWarnings: preservedWarnings,
    preservedMissingRequirements: preservedMissingRequirements,
    preservedBlockingReasons: preservedBlockingReasons,
    preservedAuditTrail: preservedAuditTrail,
    requiredFollowUp: requiredFollowUp,
    nextGateRequired: outputNextGate,
    notAuthority: strengthenNotAuthority(authority.notAuthority)
  });
}

function syntheticAuthorityBase(partial) {
  const status =
    partial.recommendationAuthorityStatus || 'developer_authority_candidate';
  const plantKey =
    (partial.plantRef && partial.plantRef.canonicalKey) || 'lavender';
  const decisionId =
    partial.decisionId ||
    ['eod', plantKey, status, 'recorded'].join('-');
  const fingerprint =
    partial.summaryFingerprint ||
    ['synthetic-ra-fp', plantKey, status, decisionId].join('|');

  return {
    recommendationAuthorityVersion:
      SR_DEVELOPER_RECOMMENDATION_POLICY_SOURCE_VERSION,
    capability: SR_DEVELOPER_RECOMMENDATION_POLICY_SOURCE_CAPABILITY,
    developerOnly: true,
    syntheticOnly: true,
    reversible: Object.prototype.hasOwnProperty.call(partial, 'reversible')
      ? partial.reversible
      : true,
    activation: 'explicit_call_only',
    recommendationAuthorityStatus: status,
    ownerDecisionEcho: partial.ownerDecisionEcho || null,
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
        event: 'recommendation_authority_developer_authority_candidate',
        recommendationAuthorityStatus: status,
        noRuntimeActivation: true,
        automaticApproval: false
      }
    ],
    requiredFollowUp: partial.requiredFollowUp || [],
    blockingReasons: partial.blockingReasons || [],
    notAuthority: strengthenNotAuthority(
      partial.notAuthority || emptyNotAuthority()
    ),
    noRuntimeActivation: Object.prototype.hasOwnProperty.call(
      partial,
      'noRuntimeActivation'
    )
      ? partial.noRuntimeActivation
      : true,
    noUserFacingRecommendation: Object.prototype.hasOwnProperty.call(
      partial,
      'noUserFacingRecommendation'
    )
      ? partial.noUserFacingRecommendation
      : true,
    noPlantSuitabilityAuthority: Object.prototype.hasOwnProperty.call(
      partial,
      'noPlantSuitabilityAuthority'
    )
      ? partial.noPlantSuitabilityAuthority
      : true,
    noProductAuthority: Object.prototype.hasOwnProperty.call(
      partial,
      'noProductAuthority'
    )
      ? partial.noProductAuthority
      : true,
    noProductEligibility: Object.prototype.hasOwnProperty.call(
      partial,
      'noProductEligibility'
    )
      ? partial.noProductEligibility
      : true,
    noCatalogMutation: Object.prototype.hasOwnProperty.call(
      partial,
      'noCatalogMutation'
    )
      ? partial.noCatalogMutation
      : true,
    nextGateRequired: Object.prototype.hasOwnProperty.call(
      partial,
      'nextGateRequired'
    )
      ? partial.nextGateRequired
      : status === 'developer_authority_candidate'
        ? 'recommendation_policy_contract'
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
    catalogMutationAuthority: partial.catalogMutationAuthority === true,
    recommendationMutationAuthority:
      partial.recommendationMutationAuthority === true,
    productMutationAuthority: partial.productMutationAuthority === true,
    productEligibilityAuthority: partial.productEligibilityAuthority === true,
    summaryFingerprint: fingerprint
  };
}

/** Embedded synthetic fixtures for harness / Node proof. */
export function getSmartRecDeveloperRecommendationPolicySyntheticFixtures() {
  const approved = syntheticAuthorityBase({
    recommendationAuthorityStatus: 'developer_authority_candidate',
    decisionId: 'eod-lavender-approved_later-recorded',
    nextGateRequired: 'recommendation_policy_contract',
    summaryFingerprint: 'synthetic-ra-fp|lavender|developer_authority_candidate|A'
  });

  const rejected = syntheticAuthorityBase({
    recommendationAuthorityStatus: 'blocked',
    ownerDecisionEcho: 'rejected_later',
    decisionId: 'eod-lavender-rejected_later-recorded',
    nextGateRequired: 'owner_review_followup',
    summaryFingerprint: 'synthetic-ra-fp|lavender|rejected_later|B',
    blockingReasons: [
      {
        code: 'rejected_later_source',
        detail: 'rejected_later_is_blocked_evidence_preserved_no_deletion'
      }
    ],
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
        event: 'recommendation_authority_blocked_rejected_later',
        ownerDecisionEcho: 'rejected_later',
        recommendationAuthorityStatus: 'blocked',
        noRuntimeActivation: true,
        automaticApproval: false,
        evidencePreserved: true,
        noDeletion: true
      }
    ]
  });

  const needsMore = syntheticAuthorityBase({
    recommendationAuthorityStatus: 'not_ready',
    ownerDecisionEcho: 'needs_more_data',
    decisionId: 'eod-lavender-needs_more_data-recorded',
    nextGateRequired: 'owner_review_followup',
    requiredFollowUp: ['additional_trusted_axis'],
    summaryFingerprint: 'synthetic-ra-fp|lavender|needs_more_data|C',
    blockingReasons: [
      {
        code: 'needs_more_data_source',
        detail: 'needs_more_data_never_converted_to_approval'
      }
    ],
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
      recommendationAuthorityOutput: approved,
      expectedSummaryFingerprint: approved.summaryFingerprint,
      reversible: true,
      syntheticOnly: true
    },
    B: {
      recommendationAuthorityOutput: rejected,
      expectedSummaryFingerprint: rejected.summaryFingerprint,
      reversible: true,
      syntheticOnly: true
    },
    C: {
      recommendationAuthorityOutput: needsMore,
      expectedSummaryFingerprint: needsMore.summaryFingerprint,
      reversible: true,
      syntheticOnly: true
    },
    D: {
      expectedSummaryFingerprint: 'unused',
      syntheticOnly: true
    },
    E: {
      recommendationAuthorityOutput: syntheticAuthorityBase({
        recommendationAuthorityStatus: 'developer_authority_candidate',
        decisionId: 'eod-lavender-approved_later-wrong-gate',
        nextGateRequired: 'recommendation_authority_static_verification',
        summaryFingerprint: 'synthetic-ra-fp|lavender|developer_authority_candidate|E'
      }),
      expectedSummaryFingerprint:
        'synthetic-ra-fp|lavender|developer_authority_candidate|E',
      reversible: true,
      syntheticOnly: true
    },
    F: {
      recommendationAuthorityOutput: approved,
      expectedSummaryFingerprint: 'mismatched-fingerprint-value',
      reversible: true,
      syntheticOnly: true
    },
    G: {
      recommendationAuthorityOutput: syntheticAuthorityBase({
        recommendationAuthorityStatus: 'developer_authority_candidate',
        decisionId: 'eod-lavender-approved_later-auth',
        nextGateRequired: 'recommendation_policy_contract',
        summaryFingerprint: 'synthetic-ra-fp|lavender|developer_authority_candidate|G',
        recommendationAuthority: true
      }),
      expectedSummaryFingerprint:
        'synthetic-ra-fp|lavender|developer_authority_candidate|G',
      reversible: true,
      syntheticOnly: true
    },
    H: {
      recommendationAuthorityOutput: approved,
      expectedSummaryFingerprint: approved.summaryFingerprint,
      treatDeveloperPolicyCandidateAsActivation: true,
      requestRuntimeActivation: true,
      requestUserFacingRecommendation: true,
      skipNextGate: true,
      reversible: true,
      syntheticOnly: true
    },
    I: {
      recommendationAuthorityOutput: approved,
      expectedSummaryFingerprint: approved.summaryFingerprint,
      requestProductAuthority: true,
      requestPlantSuitabilityAuthority: true,
      requestProductEligibility: true,
      reversible: true,
      syntheticOnly: true
    },
    J: {
      recommendationAuthorityOutput: approved,
      expectedSummaryFingerprint: approved.summaryFingerprint,
      mutateCatalog: true,
      mutateRecommendations: true,
      mutateProducts: true,
      reversible: true,
      syntheticOnly: true
    }
  });
}
