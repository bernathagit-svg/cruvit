/**
 * Garden Design size authority adapter V1.
 * Single lookup path: placement slug → botanicalTaxonId → authority → scale behavior.
 * Browser-safe. Does not import research overlays or Node fs.
 * Activation flags keep production Garden Design off this path until an explicit canary context.
 */
import {
  DIMENSION_EVIDENCE,
  PHOTO_SCALE_PRODUCT_CONTRACT,
  PHOTO_SCALE_STATE,
  computePhysicalSceneScale
} from './physical-scale-foundation-v1.js';
import { RANGE_BANDS } from './physical-scale-evidence-v1.js';
import { mangoDimensionLeak } from './generic-tree-physical-scale-v1.js';

export const GARDEN_DESIGN_SIZE_AUTHORITY_INTEGRATION_VERSION = 'garden-design-size-authority-integration-v1';
export const BOTANICAL_SIZE_AUTHORITY_FETCH_PATH = 'data/catalog/botanical-size-authority-v1.json';

export const GARDEN_SIZE_AUTHORITY_ACTIVATION = Object.freeze({
  globalAuthorityRuntimeEnabled: false,
  canaryAuthorityRuntimeEnabled: true,
  applyInProductionGardenDesign: false,
  gardenDesignBlocked: false
});

export const SIZE_AUTHORITY_CANARY_SLUGS = Object.freeze([
  'mango',
  'olive',
  'blue-gum',
  'lemon',
  'cypress',
  'breadfruit'
]);

export const HEIGHT_SPREAD_AUTHORITY = Object.freeze({
  SOURCE_SUPPORTED: 'SOURCE_SUPPORTED',
  ESTIMATED: 'ESTIMATED',
  UNKNOWN: 'UNKNOWN',
  HOLD: 'HOLD'
});

export const RUNTIME_SCALE_BEHAVIOR = Object.freeze({
  AUTHORITY_PHYSICAL_SCALE: 'AUTHORITY_PHYSICAL_SCALE',
  HEIGHT_ANCHORED_ESTIMATE: 'HEIGHT_ANCHORED_ESTIMATE',
  ESTIMATED_HEURISTIC: 'ESTIMATED_HEURISTIC',
  INACTIVE: 'INACTIVE'
});

function asText(value) {
  return String(value == null ? '' : value).trim();
}

function slugOf(value) {
  return asText(value).toLowerCase();
}

export function getAuthorityRecordBySlug(registry, canonicalSlug) {
  const slug = slugOf(canonicalSlug);
  if (!registry || !slug) return null;
  const taxonId = registry.slugToBotanicalTaxonId?.[slug];
  if (!taxonId) return null;
  return (registry.records || []).find((row) => row.botanicalTaxonId === taxonId) || null;
}

export function authorityRuntimeActive(input = {}) {
  const slug = slugOf(input.canonicalSlug);
  if (GARDEN_SIZE_AUTHORITY_ACTIVATION.applyInProductionGardenDesign && GARDEN_SIZE_AUTHORITY_ACTIVATION.globalAuthorityRuntimeEnabled) {
    return true;
  }
  return Boolean(
    input.canaryContext === true
      && GARDEN_SIZE_AUTHORITY_ACTIVATION.canaryAuthorityRuntimeEnabled
      && SIZE_AUTHORITY_CANARY_SLUGS.includes(slug)
  );
}

function finiteRange(range) {
  if (!range) return null;
  const min = Number(range.min);
  const max = Number(range.max);
  if (!Number.isFinite(min) && !Number.isFinite(max)) return null;
  return { min: Number.isFinite(min) ? min : null, max: Number.isFinite(max) ? max : null };
}

export function resolveGardenSizeAuthority(registry, input = {}) {
  const slug = slugOf(input.canonicalSlug);
  const growthStage = asText(input.growthStage) || 'mature';
  const base = {
    canonicalSlug: slug,
    botanicalTaxonId: null,
    runtimeAuthorityState: null,
    previewScenario: null,
    heightAuthority: HEIGHT_SPREAD_AUTHORITY.UNKNOWN,
    spreadAuthority: HEIGHT_SPREAD_AUTHORITY.UNKNOWN,
    personalContextNeeded: false,
    conflictHold: false,
    evidenceGap: false,
    provenanceVersion: registry?.authorityVersion || 'botanical-size-authority-v1',
    stageAuthority: growthStage === 'mature' ? 'MATURE' : 'UNKNOWN',
    selectedRuntimeBehavior: RUNTIME_SCALE_BEHAVIOR.INACTIVE,
    usedAuthoritativeMeters: false,
    gardenDesignBlocked: false,
    calibrationMandatory: PHOTO_SCALE_PRODUCT_CONTRACT.calibrationMandatory,
    photoScaleOptional: true,
    userScaleOverrideMutatesAuthority: false,
    mangoLowWrittenToAuthority: false,
    applied: false,
    designState: {
      ownerPreferredRangePosition: input.ownerPreferredRangePosition || null,
      userScaleOverride: input.userScaleOverride || null,
      photoScaleState: input.photoScaleState || PHOTO_SCALE_STATE.NOT_CALIBRATED
    }
  };

  if (!authorityRuntimeActive({ ...input, canonicalSlug: slug })) {
    return Object.freeze({
      ...base,
      fallbackReason: 'AUTHORITY_RUNTIME_INACTIVE',
      note: 'Production Garden Design remains on the prior scale path. Canary only.'
    });
  }

  const record = getAuthorityRecordBySlug(registry, slug);
  if (!record) {
    return Object.freeze({
      ...base,
      evidenceGap: true,
      selectedRuntimeBehavior: RUNTIME_SCALE_BEHAVIOR.ESTIMATED_HEURISTIC,
      fallbackReason: 'AUTHORITY_RECORD_MISSING',
      applied: true,
      note: 'No authority record. Estimated size + tree heuristic + manual resize.'
    });
  }

  const stageSupported = growthStage === 'mature' && (record.growthStage === 'mature' || !record.growthStage);
  const state = record.runtimeAuthority;
  let heightAuthority = HEIGHT_SPREAD_AUTHORITY.UNKNOWN;
  let spreadAuthority = HEIGHT_SPREAD_AUTHORITY.UNKNOWN;
  let behavior = RUNTIME_SCALE_BEHAVIOR.ESTIMATED_HEURISTIC;
  let usedAuthoritativeMeters = false;
  let fallbackReason = null;
  let note = '';

  if (!stageSupported) {
    behavior = RUNTIME_SCALE_BEHAVIOR.ESTIMATED_HEURISTIC;
    fallbackReason = 'GROWTH_STAGE_AUTHORITY_UNKNOWN';
    note = 'Do not derive young size as a percentage of mature evidence. Estimated mode.';
  } else if (state === 'RUNTIME_AUTHORITY_READY') {
    heightAuthority = HEIGHT_SPREAD_AUTHORITY.SOURCE_SUPPORTED;
    spreadAuthority = HEIGHT_SPREAD_AUTHORITY.SOURCE_SUPPORTED;
    behavior = RUNTIME_SCALE_BEHAVIOR.AUTHORITY_PHYSICAL_SCALE;
    usedAuthoritativeMeters = true;
    note = 'Source-supported height and spread. User resize and mango LOW remain design state.';
  } else if (state === 'RUNTIME_AUTHORITY_PARTIAL' && record.partialAnchor === 'HEIGHT_ANCHORED_ESTIMATE') {
    heightAuthority = HEIGHT_SPREAD_AUTHORITY.SOURCE_SUPPORTED;
    spreadAuthority = HEIGHT_SPREAD_AUTHORITY.ESTIMATED;
    behavior = RUNTIME_SCALE_BEHAVIOR.HEIGHT_ANCHORED_ESTIMATE;
    usedAuthoritativeMeters = true;
    note = 'Height is source-supported. Spread is estimated from visual architecture, not botanical truth.';
  } else if (state === 'RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED') {
    heightAuthority = HEIGHT_SPREAD_AUTHORITY.ESTIMATED;
    spreadAuthority = HEIGHT_SPREAD_AUTHORITY.ESTIMATED;
    behavior = RUNTIME_SCALE_BEHAVIOR.ESTIMATED_HEURISTIC;
    fallbackReason = 'PERSONAL_CONTEXT_REQUIRED';
    note = 'Species evidence is not an exact personal-garden physical size. Estimated size + tree heuristic + manual resize.';
  } else if (state === 'RUNTIME_AUTHORITY_CONFLICT_HOLD') {
    heightAuthority = HEIGHT_SPREAD_AUTHORITY.HOLD;
    spreadAuthority = HEIGHT_SPREAD_AUTHORITY.HOLD;
    behavior = RUNTIME_SCALE_BEHAVIOR.ESTIMATED_HEURISTIC;
    fallbackReason = 'CONFLICT_HOLD';
    note = 'Do not select or average conflicting sources. Estimated size + tree heuristic + manual resize.';
  } else {
    heightAuthority = HEIGHT_SPREAD_AUTHORITY.UNKNOWN;
    spreadAuthority = HEIGHT_SPREAD_AUTHORITY.UNKNOWN;
    behavior = RUNTIME_SCALE_BEHAVIOR.ESTIMATED_HEURISTIC;
    fallbackReason = 'EVIDENCE_GAP';
    note = 'No meters. Estimated size + tree heuristic + manual resize.';
  }

  const heightRange = stageSupported && usedAuthoritativeMeters ? finiteRange(record.normalizedRange?.heightM) : null;
  const spreadRange = stageSupported && state === 'RUNTIME_AUTHORITY_READY' ? finiteRange(record.normalizedRange?.spreadM) : null;

  return Object.freeze({
    ...base,
    botanicalTaxonId: record.botanicalTaxonId,
    runtimeAuthorityState: state,
    previewScenario: stageSupported && usedAuthoritativeMeters ? record.defaultPreviewScenario || null : null,
    heightAuthority,
    spreadAuthority,
    personalContextNeeded: state === 'RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED',
    conflictHold: state === 'RUNTIME_AUTHORITY_CONFLICT_HOLD',
    evidenceGap: state === 'RUNTIME_AUTHORITY_EVIDENCE_GAP' || fallbackReason === 'EVIDENCE_GAP',
    selectedRuntimeBehavior: behavior,
    usedAuthoritativeMeters: Boolean(usedAuthoritativeMeters && heightRange),
    heightRangeM: heightRange,
    spreadRangeM: spreadRange,
    spreadSourceSupported: state === 'RUNTIME_AUTHORITY_READY' ? true : false,
    applied: true,
    fallbackReason,
    note,
    stageAuthority: stageSupported ? 'MATURE' : 'UNKNOWN',
    scientificName: record.scientificName || null,
    architectureMode: record.architectureMode || 'tree'
  });
}

export function scaleFromGardenSizeAuthority(authorityResult, sceneInput = {}) {
  const slug = slugOf(authorityResult?.canonicalSlug || sceneInput.canonicalSlug);
  const useMeters = Boolean(authorityResult?.usedAuthoritativeMeters && authorityResult.heightRangeM);
  const spreadOk = authorityResult?.runtimeAuthorityState === 'RUNTIME_AUTHORITY_READY' && authorityResult.spreadRangeM;
  const rangeBand = asText(sceneInput.rangeBand || authorityResult?.designState?.ownerPreferredRangePosition || RANGE_BANDS.MID).toUpperCase();
  const resolvedEvidence = useMeters
    ? {
      evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
      growthStage: sceneInput.growthStage || 'mature',
      visualForm: 'tree',
      heightM: authorityResult.heightRangeM,
      spreadM: spreadOk ? authorityResult.spreadRangeM : null,
      mayDrivePhysicalMeterPreview: true,
      sizeScenario: authorityResult.previewScenario || null
    }
    : {
      evidenceClass: DIMENSION_EVIDENCE.UNKNOWN,
      growthStage: sceneInput.growthStage || 'mature',
      visualForm: 'tree',
      heightM: null,
      spreadM: null,
      mayDrivePhysicalMeterPreview: false
    };
  if (mangoDimensionLeak(slug, resolvedEvidence)) {
    return {
      ok: false,
      code: 'MANGO_DIMENSION_LEAK',
      gardenDesignBlocked: false,
      note: 'Never copy Mango dimensions to another tree.'
    };
  }
  const scale = computePhysicalSceneScale({
    ...sceneInput,
    canonicalSlug: slug,
    visualForm: 'tree',
    resolvedEvidence,
    rangeBand,
    sizeScenario: authorityResult?.previewScenario || sceneInput.sizeScenario || null,
    userOverride: sceneInput.userScaleOverride || sceneInput.userOverride || authorityResult?.designState?.userScaleOverride
  });
  return {
    ok: true,
    code: useMeters ? authorityResult.selectedRuntimeBehavior : RUNTIME_SCALE_BEHAVIOR.ESTIMATED_HEURISTIC,
    impliedSpreadIsBotanicalTruth: false,
    spreadSourceSupported: Boolean(spreadOk),
    calibrationMandatory: false,
    gardenDesignBlocked: false,
    mangoLowCopied: slug !== 'mango' && rangeBand === 'LOW',
    scale
  };
}

export const GLOBAL_ACTIVATION_PROPOSAL = Object.freeze({
  globalAuthorityRuntimeEnabled: false,
  canaryAuthorityRuntimeEnabled: true,
  applyInProductionGardenDesign: false,
  next: 'GARDEN DESIGN SIZE AUTHORITY GLOBAL ACTIVATION GATE',
  doNotEnableAll41InThisTask: true,
  keepConflictHoldAndGapsOnHeuristic: true
});
