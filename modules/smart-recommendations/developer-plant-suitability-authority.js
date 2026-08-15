/**
 * Cruvit — Smart Recommendations developer Plant Suitability Authority
 * -------------------------------------------------------------------
 * Pure, developer-only, synthetic-only explicit Plant Suitability
 * Authority gate over already-built Recommendation Policy output.
 *
 * NON-AUTHORITY / NON-ACTIVATION CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Accepts already-built synthetic Recommendation Policy output
 *    only (fixtures embed policy records; no module import).
 *  - Does not import GOS, v1b, product runtime, overlay, or live weather.
 *  - Does not activate Smart Recommendations or Product Authority.
 *  - Does not recommend plants, grant eligibility, or score suitability.
 *  - Does not collapse outcome suitability into yes/no.
 *  - Does not implement Owner Review Queue UI.
 *  - Does not apply decisions to catalog/recommendations/products.
 *  - developer_suitability_candidate is not runtime/UI/user-facing
 *    activation and is not final plant suitability scoring.
 *  - rejected_later is blocked while preserving evidence/audit.
 *  - needs_more_data becomes not_ready (or blocked) and never approval.
 */

export const SR_DEVELOPER_PLANT_SUITABILITY_AUTHORITY_VERSION =
  '0.1.0-sr-plant-suitability-authority';

export const SR_DEVELOPER_PLANT_SUITABILITY_AUTHORITY_CAPABILITY =
  'explicit_developer_plant_suitability_authority';

export const SR_DEVELOPER_PLANT_SUITABILITY_AUTHORITY_SOURCE_VERSION =
  '0.1.0-sr-recommendation-policy';

export const SR_DEVELOPER_PLANT_SUITABILITY_AUTHORITY_SOURCE_CAPABILITY =
  'explicit_developer_recommendation_policy';

export const SR_DEVELOPER_PLANT_SUITABILITY_AUTHORITY_STATUSES =
  Object.freeze(['blocked', 'not_ready', 'developer_suitability_candidate']);

export const SR_DEVELOPER_PLANT_SUITABILITY_AUTHORITY_INPUT_GATES =
  Object.freeze(['plant_suitability_authority_contract']);

export const SR_DEVELOPER_PLANT_SUITABILITY_AUTHORITY_NEXT_GATES =
  Object.freeze([
    'plant_suitability_authority_static_verification',
    'plant_suitability_policy_contract',
    'runtime_activation_contract',
    'owner_review_followup',
    'recommendation_policy_followup'
  ]);

export const SR_DEVELOPER_PLANT_SUITABILITY_OUTCOME_DIMENSIONS =
  Object.freeze([
    'survival',
    'vegetativeGrowth',
    'flowering',
    'fruitOrYield',
    'longTermReliability'
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

function nextGateIncludesPlantSuitabilityAuthorityContract(value) {
  if (Array.isArray(value)) {
    return value.some(function (g) {
      return String(g).trim() === 'plant_suitability_authority_contract';
    });
  }
  if (isNonEmptyString(value)) {
    return String(value).trim() === 'plant_suitability_authority_contract';
  }
  return false;
}

function hasCode(list, code) {
  return Array.isArray(list) && list.some(function (x) {
    return x && x.code === code;
  });
}

function requiredOutcomeConstraint() {
  return { required: true, scored: false, constraintOnly: true };
}

function defaultOutcomeDimensions() {
  return {
    survival: requiredOutcomeConstraint(),
    vegetativeGrowth: requiredOutcomeConstraint(),
    flowering: requiredOutcomeConstraint(),
    fruitOrYield: requiredOutcomeConstraint(),
    longTermReliability: requiredOutcomeConstraint()
  };
}

function dimensionPresent(v) {
  if (v === true) return true;
  if (typeof v === 'string' && v.trim() === 'required') return true;
  const o = asObject(v);
  if (!o) return false;
  if (o.required === true || o.constraintOnly === true || o.constraint === true) {
    return true;
  }
  return false;
}

function missingOutcomeDimensionKeys(dims) {
  const o = asObject(dims);
  if (!o) {
    return SR_DEVELOPER_PLANT_SUITABILITY_OUTCOME_DIMENSIONS.slice();
  }
  const missing = [];
  for (let i = 0; i < SR_DEVELOPER_PLANT_SUITABILITY_OUTCOME_DIMENSIONS.length; i++) {
    const k = SR_DEVELOPER_PLANT_SUITABILITY_OUTCOME_DIMENSIONS[i];
    if (!dimensionPresent(o[k])) missing.push(k);
  }
  return missing;
}

function resolveOutcomeDimensions(policy, src) {
  return (
    asObject(src.outcomeDimensions) ||
    asObject(policy && policy.outcomeDimensions) ||
    null
  );
}

function requestsYesNoCollapse(src, dims) {
  if (
    src.collapseToYesNo === true ||
    src.collapseOutcomesIntoYesNo === true ||
    src.requestYesNoSuitability === true ||
    src.yesNoSuitability === true ||
    src.yesNoSuitability === false ||
    src.suitable === true ||
    src.suitable === false
  ) {
    return true;
  }
  const o = asObject(dims);
  if (!o) return false;
  if (
    o.overall === true ||
    o.overall === false ||
    o.yesNo === true ||
    o.yesNo === false ||
    o.suitable === true ||
    o.suitable === false
  ) {
    return true;
  }
  return false;
}

function buildDescriptor() {
  return freezeDeep({
    plantSuitabilityAuthorityVersion:
      SR_DEVELOPER_PLANT_SUITABILITY_AUTHORITY_VERSION,
    capability: SR_DEVELOPER_PLANT_SUITABILITY_AUTHORITY_CAPABILITY,
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
    outcomeSuitabilityRequired: true,
    outcomeDimensionsPreserved: true,
    noYesNoCollapse: true,
    noFinalPlantSuitabilityScoring: true,
    noRuntimeActivation: true,
    noUserFacingRecommendation: true,
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
    developerSuitabilityCandidateIsNotActivation: true,
    requiresNextGateEvenAfterDeveloperSuitabilityCandidate: true
  });
}

const DESCRIPTOR = buildDescriptor();

export function getSmartRecDeveloperPlantSuitabilityAuthorityDescriptor() {
  return DESCRIPTOR;
}

function buildPsaFingerprint(item) {
  return [
    SR_DEVELOPER_PLANT_SUITABILITY_AUTHORITY_VERSION,
    String(item.plantSuitabilityAuthorityStatus || ''),
    String(item.nextGateRequired || ''),
    String(item.noRuntimeActivation === true),
    String(item.noAutomaticApproval === true),
    String(item.explicitOwnerActionRequired === true),
    String(item.outcomeSuitabilityRequired === true),
    String(item.noYesNoCollapse === true),
    String((item.sourceRefs && item.sourceRefs.decisionId) || ''),
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
    if (SR_DEVELOPER_PLANT_SUITABILITY_AUTHORITY_NEXT_GATES.indexOf(g) >= 0) {
      return g;
    }
  }
  return 'plant_suitability_authority_static_verification';
}

function sourceRefsFrom(policy, input) {
  const a = asObject(policy) || {};
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

function basePsa(partial) {
  const item = {
    plantSuitabilityAuthorityVersion:
      SR_DEVELOPER_PLANT_SUITABILITY_AUTHORITY_VERSION,
    capability: SR_DEVELOPER_PLANT_SUITABILITY_AUTHORITY_CAPABILITY,
    developerOnly: true,
    syntheticOnly: true,
    activation: 'explicit_call_only',
    plantSuitabilityAuthorityStatus:
      partial.plantSuitabilityAuthorityStatus || 'blocked',
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
    outcomeSuitabilityRequired: true,
    outcomeDimensionsPreserved: partial.outcomeDimensionsPreserved !== false,
    noYesNoCollapse: true,
    noFinalPlantSuitabilityScoring: true,
    outcomeDimensions: clonePlain(partial.outcomeDimensions) || null,
    noRuntimeActivation: true,
    noUserFacingRecommendation: true,
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
    item.plantSuitabilityAuthorityStatus === 'developer_suitability_candidate' &&
    !isNonEmptyString(item.nextGateRequired)
  ) {
    item.nextGateRequired = 'plant_suitability_authority_static_verification';
  }

  item.summaryFingerprint = buildPsaFingerprint(item);
  return freezeDeep(item);
}

function blockedPsa(partial) {
  return basePsa(
    Object.assign({}, partial, {
      plantSuitabilityAuthorityStatus: 'blocked',
      noRuntimeActivation: true,
      noUserFacingRecommendation: true,
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

function notReadyPsa(partial) {
  return basePsa(
    Object.assign({}, partial, {
      plantSuitabilityAuthorityStatus: 'not_ready',
      noRuntimeActivation: true,
      noUserFacingRecommendation: true,
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

function preservedFrom(policy) {
  return {
    preservedWarnings: policy ? cloneList(policy.preservedWarnings) : [],
    preservedMissingRequirements: policy
      ? cloneList(policy.preservedMissingRequirements)
      : [],
    preservedBlockingReasons: policy
      ? cloneList(policy.preservedBlockingReasons)
      : [],
    preservedAuditTrail: policy ? cloneList(policy.preservedAuditTrail) : []
  };
}

/**
 * Build a developer-only Plant Suitability Authority result from synthetic
 * Recommendation Policy output.
 * @param {object|null} input
 * @returns {object} frozen plant suitability authority result
 */
export function buildDeveloperPlantSuitabilityAuthority(input) {
  const src = asObject(input) || {};
  const policy =
    asObject(src.recommendationPolicyOutput) ||
    asObject(src.policyOutput) ||
    asObject(src.policy);

  const forbiddenLive = [];
  collectForbiddenLiveKeys(src, 'input', forbiddenLive);
  if (forbiddenLive.length) {
    return blockedPsa(
      Object.assign({}, preservedFrom(policy), {
        sourceRefs: sourceRefsFrom(policy, src),
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
  if (policy) {
    collectForbiddenAuthorityFlags(
      policy,
      'recommendationPolicyOutput',
      forbiddenAuth
    );
  }
  if (forbiddenAuth.length) {
    return blockedPsa(
      Object.assign({}, preservedFrom(policy), {
        sourceRefs: sourceRefsFrom(policy, src),
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
    src.treatDeveloperSuitabilityCandidateAsActivation === true ||
    src.treatDeveloperPolicyCandidateAsActivation === true ||
    src.requestRuntimeActivation === true ||
    src.requestUserFacingRecommendation === true ||
    src.skipNextGate === true
  ) {
    return blockedPsa(
      Object.assign({}, preservedFrom(policy), {
        sourceRefs: sourceRefsFrom(policy, src),
        blockingReasons: [
          {
            code: 'activation_or_user_facing_request_forbidden',
            detail:
              'developer_suitability_candidate_cannot_become_runtime_ui_or_user_facing_activation'
          }
        ],
        nextGateRequired: 'plant_suitability_authority_static_verification',
        notAuthority: emptyNotAuthority()
      })
    );
  }

  if (
    src.requestProductAuthority === true ||
    src.requestProductEligibility === true ||
    src.grantProductAuthority === true ||
    src.grantProductEligibility === true ||
    src.grantPlantSuitabilityAuthority === true
  ) {
    return blockedPsa(
      Object.assign({}, preservedFrom(policy), {
        sourceRefs: sourceRefsFrom(policy, src),
        blockingReasons: [
          {
            code: 'product_or_eligibility_authority_request_forbidden',
            detail:
              'plant_suitability_authority_cannot_grant_product_authority_or_eligibility'
          }
        ],
        nextGateRequired: 'plant_suitability_authority_static_verification',
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
    return blockedPsa(
      Object.assign({}, preservedFrom(policy), {
        sourceRefs: sourceRefsFrom(policy, src),
        blockingReasons: [
          {
            code: 'catalog_recommendation_product_mutation_forbidden',
            detail:
              'plant_suitability_authority_cannot_mutate_catalog_recommendations_or_products'
          }
        ],
        nextGateRequired: 'plant_suitability_authority_static_verification',
        notAuthority: emptyNotAuthority()
      })
    );
  }

  const dimsEarly = resolveOutcomeDimensions(policy, src);
  if (requestsYesNoCollapse(src, dimsEarly)) {
    return blockedPsa(
      Object.assign({}, preservedFrom(policy), {
        sourceRefs: sourceRefsFrom(policy, src),
        outcomeDimensions: clonePlain(dimsEarly),
        outcomeDimensionsPreserved: false,
        blockingReasons: [
          {
            code: 'outcome_dimensions_collapsed_into_yes_no',
            detail: 'outcome_suitability_must_not_collapse_to_yes_no'
          }
        ],
        nextGateRequired: 'plant_suitability_authority_static_verification',
        notAuthority: emptyNotAuthority()
      })
    );
  }

  if (
    src.convertMissingDataToConfidence === true ||
    src.createConfidenceFromMissingData === true
  ) {
    return blockedPsa(
      Object.assign({}, preservedFrom(policy), {
        sourceRefs: sourceRefsFrom(policy, src),
        blockingReasons: [
          {
            code: 'missing_data_converted_into_confidence',
            detail: 'missing_outcome_data_must_not_become_confidence'
          }
        ],
        notAuthority: emptyNotAuthority()
      })
    );
  }

  if (!policy) {
    return blockedPsa({
      sourceRefs: {
        decisionId: null,
        queueItemRef: clonePlain(src.queueItemRef) || null,
        sourcePacketRef: clonePlain(src.sourcePacketRef) || null,
        plantRef: clonePlain(src.plantRef) || null
      },
      blockingReasons: [
        {
          code: 'missing_recommendation_policy_output',
          detail: 'recommendation_policy_output_required'
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
    policy.superseded === true ||
    policy.stale === true ||
    policy.malformed === true ||
    policy.detached === true
  ) {
    return blockedPsa(
      Object.assign({}, preservedFrom(policy), {
        sourceRefs: sourceRefsFrom(policy, src),
        blockingReasons: [
          {
            code: 'source_stale_superseded_malformed_detached_or_blocked',
            detail: src.markDetached
              ? 'detached'
              : src.markMalformed
                ? 'malformed'
                : src.markSuperseded || policy.superseded === true
                  ? 'superseded'
                  : 'stale'
          }
        ],
        notAuthority: strengthenNotAuthority(policy.notAuthority)
      })
    );
  }

  if (
    policy.recommendationPolicyVersion !==
    SR_DEVELOPER_PLANT_SUITABILITY_AUTHORITY_SOURCE_VERSION
  ) {
    return blockedPsa({
      sourceRefs: sourceRefsFrom(policy, src),
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'unsupported_policy_version',
          detail: String(policy.recommendationPolicyVersion || '')
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (
    policy.capability !==
    SR_DEVELOPER_PLANT_SUITABILITY_AUTHORITY_SOURCE_CAPABILITY
  ) {
    return blockedPsa({
      sourceRefs: sourceRefsFrom(policy, src),
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'unsupported_capability',
          detail: String(policy.capability || '')
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  const refs = sourceRefsFrom(policy, src);
  if (!isNonEmptyString(refs.decisionId)) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        { code: 'missing_source_ref', detail: 'decisionId_required' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }
  if (!asObject(refs.queueItemRef)) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        { code: 'missing_source_ref', detail: 'queueItemRef_required' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }
  if (!asObject(refs.sourcePacketRef)) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        { code: 'missing_source_ref', detail: 'sourcePacketRef_required' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }
  if (!asObject(refs.plantRef)) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        { code: 'missing_source_ref', detail: 'plantRef_required' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!isNonEmptyString(policy.summaryFingerprint)) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'missing_or_mismatched_summary_fingerprint',
          detail: 'policy_summaryFingerprint_missing'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!isNonEmptyString(src.expectedSummaryFingerprint)) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
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
    String(policy.summaryFingerprint).trim()
  ) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'missing_or_mismatched_summary_fingerprint',
          detail: 'fingerprint_mismatch'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (policy.noRuntimeActivation !== true) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'no_runtime_activation_required',
          detail: 'noRuntimeActivation_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (policy.noUserFacingRecommendation !== true) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'no_user_facing_recommendation_required',
          detail: 'noUserFacingRecommendation_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (policy.noProductAuthority !== true) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'no_product_authority_required',
          detail: 'noProductAuthority_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (policy.noProductEligibility !== true) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'no_product_eligibility_required',
          detail: 'noProductEligibility_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (policy.noCatalogMutation !== true) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'no_catalog_mutation_required',
          detail: 'noCatalogMutation_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (policy.noRecommendationMutation !== true) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'no_recommendation_mutation_required',
          detail: 'noRecommendationMutation_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (policy.noProductMutation !== true) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'no_product_mutation_required',
          detail: 'noProductMutation_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (policy.developerOnly !== true) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'developer_only_required',
          detail: 'developerOnly_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (policy.reversible !== true && src.reversible !== true) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        { code: 'reversible_required', detail: 'reversible_must_be_true' }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (policy.noAutomaticApproval !== true) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'no_automatic_approval_required',
          detail: 'noAutomaticApproval_must_be_true'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (policy.explicitOwnerActionRequired !== true) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
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
    !Array.isArray(policy.preservedAuditTrail) ||
    policy.preservedAuditTrail.length === 0
  ) {
    return blockedPsa({
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

  if (!Array.isArray(policy.preservedWarnings)) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'missing_preserved_warnings',
          detail: 'preservedWarnings_required'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!Array.isArray(policy.preservedMissingRequirements)) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'missing_preserved_missing_requirements',
          detail: 'preservedMissingRequirements_required'
        }
      ],
      notAuthority: emptyNotAuthority()
    });
  }

  if (!Array.isArray(policy.preservedBlockingReasons)) {
    return blockedPsa({
      sourceRefs: refs,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
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
    const preserved = cloneList(policy.preservedBlockingReasons);
    const missing = [];
    for (let i = 0; i < expectedHardBlocks.length; i++) {
      const code = expectedHardBlocks[i];
      const found = preserved.some(function (x) {
        return x && x.code === code;
      });
      if (!found) missing.push(code);
    }
    if (missing.length) {
      return blockedPsa({
        sourceRefs: refs,
        preservedWarnings: cloneList(policy.preservedWarnings),
        preservedMissingRequirements: cloneList(
          policy.preservedMissingRequirements
        ),
        preservedBlockingReasons: preserved,
        preservedAuditTrail: cloneList(policy.preservedAuditTrail),
        blockingReasons: [
          {
            code: 'hard_block_not_preserved',
            detail: missing.sort().join(',')
          }
        ],
        notAuthority: strengthenNotAuthority(policy.notAuthority)
      });
    }
  }

  const policyStatus = isNonEmptyString(policy.recommendationPolicyStatus)
    ? String(policy.recommendationPolicyStatus).trim()
    : null;
  const ownerDecisionEcho = isNonEmptyString(policy.ownerDecisionEcho)
    ? String(policy.ownerDecisionEcho).trim()
    : isNonEmptyString(src.ownerDecisionEcho)
      ? String(src.ownerDecisionEcho).trim()
      : null;

  const preservedWarnings = cloneList(policy.preservedWarnings);
  const preservedMissingRequirements = cloneList(
    policy.preservedMissingRequirements
  );
  const preservedBlockingReasons = cloneList(policy.preservedBlockingReasons);
  const requiredFollowUp = Array.isArray(policy.requiredFollowUp)
    ? policy.requiredFollowUp.slice()
    : Array.isArray(src.requiredFollowUp)
      ? src.requiredFollowUp.slice()
      : [];

  if (
    ownerDecisionEcho === 'rejected_later' ||
    hasCode(policy.blockingReasons, 'rejected_later_source')
  ) {
    const preservedAuditTrail = cloneList(policy.preservedAuditTrail).concat([
      {
        event: 'plant_suitability_authority_blocked_rejected_later',
        ownerDecisionEcho: 'rejected_later',
        plantSuitabilityAuthorityStatus: 'blocked',
        noRuntimeActivation: true,
        automaticApproval: false,
        evidencePreserved: true,
        noDeletion: true
      }
    ]);
    return blockedPsa({
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
      notAuthority: strengthenNotAuthority(policy.notAuthority)
    });
  }

  if (
    ownerDecisionEcho === 'needs_more_data' ||
    hasCode(policy.blockingReasons, 'needs_more_data_source')
  ) {
    const preservedAuditTrail = cloneList(policy.preservedAuditTrail).concat([
      {
        event: 'plant_suitability_authority_not_ready_needs_more_data',
        ownerDecisionEcho: 'needs_more_data',
        plantSuitabilityAuthorityStatus: 'not_ready',
        noRuntimeActivation: true,
        automaticApproval: false,
        notConvertedToApproval: true
      }
    ]);
    return notReadyPsa({
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
      notAuthority: strengthenNotAuthority(policy.notAuthority)
    });
  }

  if (policyStatus !== 'developer_policy_candidate') {
    return blockedPsa({
      sourceRefs: refs,
      preservedWarnings: preservedWarnings,
      preservedMissingRequirements: preservedMissingRequirements,
      preservedBlockingReasons: preservedBlockingReasons,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      requiredFollowUp: requiredFollowUp,
      blockingReasons: [
        {
          code: 'policy_status_not_developer_policy_candidate',
          detail: String(policyStatus || '')
        }
      ],
      notAuthority: strengthenNotAuthority(policy.notAuthority)
    });
  }

  if (
    policy.nextGateRequired == null ||
    (Array.isArray(policy.nextGateRequired) &&
      policy.nextGateRequired.length === 0) ||
    (typeof policy.nextGateRequired === 'string' &&
      !isNonEmptyString(policy.nextGateRequired))
  ) {
    return blockedPsa({
      sourceRefs: refs,
      preservedWarnings: preservedWarnings,
      preservedMissingRequirements: preservedMissingRequirements,
      preservedBlockingReasons: preservedBlockingReasons,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'next_gate_required_missing_or_wrong',
          detail: 'nextGateRequired_missing'
        }
      ],
      notAuthority: strengthenNotAuthority(policy.notAuthority)
    });
  }

  if (
    !nextGateIncludesPlantSuitabilityAuthorityContract(policy.nextGateRequired)
  ) {
    return blockedPsa({
      sourceRefs: refs,
      preservedWarnings: preservedWarnings,
      preservedMissingRequirements: preservedMissingRequirements,
      preservedBlockingReasons: preservedBlockingReasons,
      preservedAuditTrail: cloneList(policy.preservedAuditTrail),
      blockingReasons: [
        {
          code: 'next_gate_required_missing_or_wrong',
          detail:
            'nextGateRequired_must_include_plant_suitability_authority_contract'
        }
      ],
      notAuthority: strengthenNotAuthority(policy.notAuthority)
    });
  }

  const dims = resolveOutcomeDimensions(policy, src);
  const missingDims = missingOutcomeDimensionKeys(dims);
  if (missingDims.length) {
    const preservedAuditTrail = cloneList(policy.preservedAuditTrail).concat([
      {
        event: 'plant_suitability_authority_not_ready_missing_outcome_dimensions',
        plantSuitabilityAuthorityStatus: 'not_ready',
        missingOutcomeDimensions: missingDims.slice(),
        noConfidenceFromMissingData: true,
        automaticApproval: false
      }
    ]);
    return notReadyPsa({
      sourceRefs: refs,
      preservedWarnings: preservedWarnings,
      preservedMissingRequirements: preservedMissingRequirements.concat(
        missingDims
      ),
      preservedBlockingReasons: preservedBlockingReasons,
      preservedAuditTrail: preservedAuditTrail,
      requiredFollowUp: requiredFollowUp.concat(missingDims),
      outcomeDimensions: clonePlain(dims),
      outcomeDimensionsPreserved: false,
      blockingReasons: [
        {
          code: 'missing_outcome_dimensions',
          detail: missingDims.sort().join(',')
        }
      ],
      nextGateRequired: 'owner_review_followup',
      notAuthority: strengthenNotAuthority(policy.notAuthority)
    });
  }

  const outputNextGate = resolveOutputNextGate(src);
  const preservedAuditTrail = cloneList(policy.preservedAuditTrail).concat([
    {
      event: 'plant_suitability_authority_developer_suitability_candidate',
      recommendationPolicyStatus: 'developer_policy_candidate',
      plantSuitabilityAuthorityStatus: 'developer_suitability_candidate',
      outcomeSuitabilityRequired: true,
      outcomeDimensionsPreserved: true,
      noYesNoCollapse: true,
      noFinalPlantSuitabilityScoring: true,
      noRuntimeActivation: true,
      noUserFacingRecommendation: true,
      noProductAuthority: true,
      noProductEligibility: true,
      noCatalogMutation: true,
      noRecommendationMutation: true,
      noProductMutation: true,
      automaticApproval: false,
      nextGateRequired: outputNextGate
    }
  ]);

  return basePsa({
    plantSuitabilityAuthorityStatus: 'developer_suitability_candidate',
    sourceRefs: refs,
    preservedWarnings: preservedWarnings,
    preservedMissingRequirements: preservedMissingRequirements,
    preservedBlockingReasons: preservedBlockingReasons,
    preservedAuditTrail: preservedAuditTrail,
    requiredFollowUp: requiredFollowUp,
    outcomeDimensions: clonePlain(dims),
    outcomeDimensionsPreserved: true,
    nextGateRequired: outputNextGate,
    notAuthority: strengthenNotAuthority(policy.notAuthority)
  });
}

function syntheticPolicyBase(partial) {
  const status =
    partial.recommendationPolicyStatus || 'developer_policy_candidate';
  const plantKey =
    (partial.plantRef && partial.plantRef.canonicalKey) || 'lavender';
  const decisionId =
    partial.decisionId || ['eod', plantKey, status, 'recorded'].join('-');
  const fingerprint =
    partial.summaryFingerprint ||
    ['synthetic-rp-fp', plantKey, status, decisionId].join('|');

  const dims = Object.prototype.hasOwnProperty.call(
    partial,
    'outcomeDimensions'
  )
    ? partial.outcomeDimensions
    : defaultOutcomeDimensions();

  return {
    recommendationPolicyVersion:
      SR_DEVELOPER_PLANT_SUITABILITY_AUTHORITY_SOURCE_VERSION,
    capability: SR_DEVELOPER_PLANT_SUITABILITY_AUTHORITY_SOURCE_CAPABILITY,
    developerOnly: true,
    syntheticOnly: true,
    reversible: Object.prototype.hasOwnProperty.call(partial, 'reversible')
      ? partial.reversible
      : true,
    activation: 'explicit_call_only',
    recommendationPolicyStatus: status,
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
        event: 'recommendation_policy_developer_policy_candidate',
        recommendationPolicyStatus: status,
        noRuntimeActivation: true,
        automaticApproval: false
      }
    ],
    requiredFollowUp: partial.requiredFollowUp || [],
    blockingReasons: partial.blockingReasons || [],
    notAuthority: strengthenNotAuthority(
      partial.notAuthority || emptyNotAuthority()
    ),
    outcomeDimensions: dims,
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
    noRecommendationMutation: Object.prototype.hasOwnProperty.call(
      partial,
      'noRecommendationMutation'
    )
      ? partial.noRecommendationMutation
      : true,
    noProductMutation: Object.prototype.hasOwnProperty.call(
      partial,
      'noProductMutation'
    )
      ? partial.noProductMutation
      : true,
    nextGateRequired: Object.prototype.hasOwnProperty.call(
      partial,
      'nextGateRequired'
    )
      ? partial.nextGateRequired
      : status === 'developer_policy_candidate'
        ? 'plant_suitability_authority_contract'
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
export function getSmartRecDeveloperPlantSuitabilityAuthoritySyntheticFixtures() {
  const approved = syntheticPolicyBase({
    recommendationPolicyStatus: 'developer_policy_candidate',
    decisionId: 'eod-lavender-approved_later-recorded',
    nextGateRequired: 'plant_suitability_authority_contract',
    summaryFingerprint:
      'synthetic-rp-fp|lavender|developer_policy_candidate|A'
  });

  const rejected = syntheticPolicyBase({
    recommendationPolicyStatus: 'blocked',
    ownerDecisionEcho: 'rejected_later',
    decisionId: 'eod-lavender-rejected_later-recorded',
    nextGateRequired: 'owner_review_followup',
    summaryFingerprint: 'synthetic-rp-fp|lavender|rejected_later|B',
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
      { code: 'axis_gap', detail: 'preserve_on_reject' }
    ],
    preservedAuditTrail: [
      {
        event: 'recommendation_policy_blocked_rejected_later',
        ownerDecisionEcho: 'rejected_later',
        recommendationPolicyStatus: 'blocked',
        noRuntimeActivation: true,
        automaticApproval: false,
        evidencePreserved: true,
        noDeletion: true
      }
    ]
  });

  const needsMore = syntheticPolicyBase({
    recommendationPolicyStatus: 'not_ready',
    ownerDecisionEcho: 'needs_more_data',
    decisionId: 'eod-lavender-needs_more_data-recorded',
    nextGateRequired: 'owner_review_followup',
    requiredFollowUp: ['additional_trusted_axis'],
    summaryFingerprint: 'synthetic-rp-fp|lavender|needs_more_data|C',
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
      { code: 'axis_gap', detail: 'preserve_blocking' }
    ]
  });

  return freezeDeep({
    A: {
      recommendationPolicyOutput: approved,
      expectedSummaryFingerprint: approved.summaryFingerprint,
      reversible: true,
      syntheticOnly: true
    },
    B: {
      recommendationPolicyOutput: rejected,
      expectedSummaryFingerprint: rejected.summaryFingerprint,
      reversible: true,
      syntheticOnly: true
    },
    C: {
      recommendationPolicyOutput: needsMore,
      expectedSummaryFingerprint: needsMore.summaryFingerprint,
      reversible: true,
      syntheticOnly: true
    },
    D: {
      expectedSummaryFingerprint: 'unused',
      syntheticOnly: true
    },
    E: {
      recommendationPolicyOutput: syntheticPolicyBase({
        recommendationPolicyStatus: 'developer_policy_candidate',
        decisionId: 'eod-lavender-approved_later-wrong-gate',
        nextGateRequired: 'recommendation_policy_static_verification',
        summaryFingerprint:
          'synthetic-rp-fp|lavender|developer_policy_candidate|E'
      }),
      expectedSummaryFingerprint:
        'synthetic-rp-fp|lavender|developer_policy_candidate|E',
      reversible: true,
      syntheticOnly: true
    },
    F: {
      recommendationPolicyOutput: approved,
      expectedSummaryFingerprint: 'mismatched-fingerprint-value',
      reversible: true,
      syntheticOnly: true
    },
    G: {
      recommendationPolicyOutput: syntheticPolicyBase({
        recommendationPolicyStatus: 'developer_policy_candidate',
        decisionId: 'eod-lavender-approved_later-auth',
        nextGateRequired: 'plant_suitability_authority_contract',
        summaryFingerprint:
          'synthetic-rp-fp|lavender|developer_policy_candidate|G',
        plantSuitabilityAuthority: true
      }),
      expectedSummaryFingerprint:
        'synthetic-rp-fp|lavender|developer_policy_candidate|G',
      reversible: true,
      syntheticOnly: true
    },
    H: {
      recommendationPolicyOutput: syntheticPolicyBase({
        recommendationPolicyStatus: 'developer_policy_candidate',
        decisionId: 'eod-lavender-approved_later-missing-dims',
        nextGateRequired: 'plant_suitability_authority_contract',
        summaryFingerprint:
          'synthetic-rp-fp|lavender|developer_policy_candidate|H',
        outcomeDimensions: {
          survival: { required: true, scored: false, constraintOnly: true }
        }
      }),
      expectedSummaryFingerprint:
        'synthetic-rp-fp|lavender|developer_policy_candidate|H',
      reversible: true,
      syntheticOnly: true
    },
    I: {
      recommendationPolicyOutput: approved,
      expectedSummaryFingerprint: approved.summaryFingerprint,
      collapseOutcomesIntoYesNo: true,
      suitable: true,
      reversible: true,
      syntheticOnly: true
    },
    J: {
      recommendationPolicyOutput: approved,
      expectedSummaryFingerprint: approved.summaryFingerprint,
      treatDeveloperSuitabilityCandidateAsActivation: true,
      requestRuntimeActivation: true,
      requestUserFacingRecommendation: true,
      skipNextGate: true,
      reversible: true,
      syntheticOnly: true
    },
    K: {
      recommendationPolicyOutput: approved,
      expectedSummaryFingerprint: approved.summaryFingerprint,
      requestProductAuthority: true,
      requestProductEligibility: true,
      reversible: true,
      syntheticOnly: true
    },
    L: {
      recommendationPolicyOutput: approved,
      expectedSummaryFingerprint: approved.summaryFingerprint,
      mutateCatalog: true,
      mutateRecommendations: true,
      mutateProducts: true,
      reversible: true,
      syntheticOnly: true
    }
  });
}
