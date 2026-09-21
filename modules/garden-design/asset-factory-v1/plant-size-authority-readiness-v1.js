/**
 * Plant Size Authority Readiness V1
 *
 * Produces an explicit, capability-specific size-authority state for a canonical
 * plant/state. Morphology fallback is never promoted to botanical truth.
 */

export const PLANT_SIZE_AUTHORITY_READINESS_VERSION = 'plant-size-authority-readiness-v1';

export const SIZE_AUTHORITY_STATE = Object.freeze({
  READY: 'SIZE_AUTHORITY_READY',
  PARTIAL: 'SIZE_AUTHORITY_PARTIAL',
  CONTEXT_REQUIRED: 'SIZE_AUTHORITY_CONTEXT_REQUIRED',
  CONFLICT_HOLD: 'SIZE_AUTHORITY_CONFLICT_HOLD',
  EVIDENCE_GAP: 'SIZE_AUTHORITY_EVIDENCE_GAP',
  ESTIMATED: 'SIZE_AUTHORITY_ESTIMATED',
  NOT_EVALUATED: 'SIZE_AUTHORITY_NOT_EVALUATED'
});

function text(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function authorityRecord(registry, canonicalSlug) {
  if (!registry || !canonicalSlug) return null;
  const slug = text(canonicalSlug);
  const taxonId = registry.slugToBotanicalTaxonId?.[slug];
  if (!taxonId) return null;
  return (registry.records || []).find((row) => row?.botanicalTaxonId === taxonId) || null;
}

export function resolvePlantSizeAuthorityReadiness(registry, input = {}, options = {}) {
  const canonicalSlug = text(input.canonicalSlug || input.slug);
  const growthStage = text(input.growthStage || 'unspecified') || 'unspecified';
  const visualForm = text(input.visualForm || 'unknown') || 'unknown';

  if (!registry) {
    return Object.freeze({
      version: PLANT_SIZE_AUTHORITY_READINESS_VERSION,
      canonicalSlug,
      growthStage,
      visualForm,
      state: SIZE_AUTHORITY_STATE.NOT_EVALUATED,
      authoritativeMetersAvailable: false,
      explicitEstimateOnly: true,
      morphologyFallbackIsAuthority: false,
      ownerReviewRequired: false,
      reasonCodes: ['SIZE_AUTHORITY_REGISTRY_NOT_PROVIDED']
    });
  }

  const record = authorityRecord(registry, canonicalSlug);
  if (!record) {
    return Object.freeze({
      version: PLANT_SIZE_AUTHORITY_READINESS_VERSION,
      canonicalSlug,
      growthStage,
      visualForm,
      state: SIZE_AUTHORITY_STATE.EVIDENCE_GAP,
      authoritativeMetersAvailable: false,
      explicitEstimateOnly: true,
      morphologyFallbackIsAuthority: false,
      ownerReviewRequired: true,
      reasonCodes: ['CANONICAL_SIZE_RECORD_NOT_FOUND']
    });
  }

  const runtime = String(record.runtimeAuthority || '').trim();
  const stageSupported =
    !record.growthStage
    || text(record.growthStage) === growthStage
    || growthStage === 'unspecified';

  let state = SIZE_AUTHORITY_STATE.EVIDENCE_GAP;
  let authoritativeMetersAvailable = false;
  let explicitEstimateOnly = true;
  let ownerReviewRequired = false;
  const reasonCodes = [];

  if (!stageSupported) {
    state = SIZE_AUTHORITY_STATE.PARTIAL;
    reasonCodes.push('GROWTH_STAGE_AUTHORITY_NOT_SUPPORTED');
  } else if (runtime === 'RUNTIME_AUTHORITY_READY') {
    state = SIZE_AUTHORITY_STATE.READY;
    authoritativeMetersAvailable = true;
    explicitEstimateOnly = false;
  } else if (runtime === 'RUNTIME_AUTHORITY_PARTIAL') {
    state = SIZE_AUTHORITY_STATE.PARTIAL;
    authoritativeMetersAvailable = Boolean(record.HEIGHT_SCALE_READY);
    explicitEstimateOnly = !authoritativeMetersAvailable;
    reasonCodes.push('PARTIAL_DIMENSION_AUTHORITY');
  } else if (runtime === 'RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED') {
    state = SIZE_AUTHORITY_STATE.CONTEXT_REQUIRED;
    ownerReviewRequired = options.contextResolved !== true;
    reasonCodes.push('CULTIVAR_ROOTSTOCK_OR_MAINTAINED_CONTEXT_REQUIRED');
  } else if (runtime === 'RUNTIME_AUTHORITY_CONFLICT_HOLD') {
    state = SIZE_AUTHORITY_STATE.CONFLICT_HOLD;
    ownerReviewRequired = true;
    reasonCodes.push('CONFLICTING_SIZE_EVIDENCE_HOLD');
  } else {
    state = SIZE_AUTHORITY_STATE.EVIDENCE_GAP;
    ownerReviewRequired = true;
    reasonCodes.push('SIZE_EVIDENCE_GAP');
  }

  return Object.freeze({
    version: PLANT_SIZE_AUTHORITY_READINESS_VERSION,
    canonicalSlug,
    botanicalTaxonId: record.botanicalTaxonId || null,
    scientificName: record.scientificName || null,
    growthStage,
    visualForm,
    state,
    runtimeAuthority: runtime || null,
    authoritativeMetersAvailable,
    heightScaleReady: record.HEIGHT_SCALE_READY === true,
    spreadScaleReady: record.SPREAD_SCALE_READY === true,
    normalizedRange: record.normalizedRange || null,
    sensitivity: record.sensitivity || null,
    explicitEstimateOnly,
    morphologyFallbackIsAuthority: false,
    ownerReviewRequired,
    gardenDesignMayUseExplicitEstimate:
      state !== SIZE_AUTHORITY_STATE.READY,
    meterAccuracyClaimAllowed:
      state === SIZE_AUTHORITY_STATE.READY && authoritativeMetersAvailable === true,
    reasonCodes
  });
}

export const PLANT_SIZE_AUTHORITY_GOVERNANCE = Object.freeze({
  visualFormDefinesAbsoluteSize: false,
  crossCanonicalScaleCopyForbidden: true,
  morphologyFallbackIsAuthority: false,
  unknownAllowed: true,
  silentGuessingForbidden: true,
  heightAndSpreadSeparate: true,
  independentXYStretchForbidden: true,
  phenologyAloneChangesScale: false,
  savedPlacementIsBotanicalTruth: false,
  nonTreeFormsMustUseSameAuthorityModel: true
});
