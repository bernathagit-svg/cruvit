/**
 * Runtime external-call guard — architecture protection for ordinary user paths.
 * Tracks attempted enrichment so tests can assert ZERO external enrichment.
 */

export const EXTERNAL_CALL_GUARD_VERSION = '1.0.0';

const COUNTERS = {
  structuralClimateProvider: 0,
  catalogResearch: 0,
  imageSourceSearch: 0,
  imageReplacementSearch: 0,
  llmResearch: 0,
  catalogEnrichment: 0,
  designAssetGeneration: 0
};

export function resetExternalCallGuardCounters() {
  for (const k of Object.keys(COUNTERS)) COUNTERS[k] = 0;
}

export function getExternalCallGuardCounters() {
  return { ...COUNTERS };
}

export function noteExternalCallAttempt(kind) {
  const key = String(kind || '');
  if (Object.prototype.hasOwnProperty.call(COUNTERS, key)) {
    COUNTERS[key] += 1;
  }
  return COUNTERS[key] || 0;
}

/**
 * Ordinary Specific Plant / Smart Rec / catalog evaluation must refuse enrichment.
 */
export function assertOrdinaryRuntimeAllowsNoExternalEnrichment() {
  return {
    paidExternalApi: false,
    llmResearch: false,
    imageGeneration: false,
    webResearch: false,
    catalogEnrichment: false,
    imageDiscoverySearch: false,
    structuralClimatePerPlant: false,
    replacementImageSearch: false
  };
}

/**
 * Client-side gate for plant-knowledge enrichment (Add Plant live search).
 * Default OFF under Runtime Cost Guardrails V1.
 */
export function mayCallRuntimePlantKnowledgeEnrichment(options = {}) {
  if (options.explicitOwnerOverride === true) return true;
  if (options.forceEnable === true) return true;
  return false;
}

export function blockedPlantKnowledgeResponse(reason = 'runtime-cost-guardrails-v1') {
  return {
    profile: null,
    suggestions: [],
    raw: null,
    disabled: true,
    reason: String(reason)
  };
}
