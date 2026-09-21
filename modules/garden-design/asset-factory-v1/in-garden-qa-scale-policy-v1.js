/**
 * In-Garden QA scale policy V1.
 *
 * Purpose: choose a bounded visual-review scale for candidate cutouts on a real
 * saved Garden photo. This is NOT botanical meter truth and does not control
 * production Garden Design physical scale.
 *
 * Precedence:
 * 1) explicit owner calibration for the exact job/state
 * 2) visualForm + growthStage baseline
 * 3) optional trusted stature hint may shift one band
 * 4) unknown morphology => MEDIUM + owner review required
 *
 * Phenology does not choose scale by itself.
 */

export const IN_GARDEN_QA_SCALE_POLICY_VERSION = 'in-garden-qa-scale-policy-v1';

export const QA_SCALE_BANDS = Object.freeze({
  SMALL: Object.freeze({ id: 'small', maxHeightPct: 34, maxWidthPct: 80 }),
  MEDIUM: Object.freeze({ id: 'medium', maxHeightPct: 54, maxWidthPct: 80 }),
  LARGE: Object.freeze({ id: 'large', maxHeightPct: 78, maxWidthPct: 80 }),
  XL: Object.freeze({ id: 'xl', maxHeightPct: 88, maxWidthPct: 90 }),
  XXL: Object.freeze({ id: 'xxl', maxHeightPct: 94, maxWidthPct: 96 })
});

const BAND_ORDER = Object.freeze(['small', 'medium', 'large', 'xl', 'xxl']);

export const QA_STATURE_HINT = Object.freeze({
  COMPACT: 'compact',
  TYPICAL: 'typical',
  TALL: 'tall',
  UNKNOWN: 'unknown'
});

export const FORM_STAGE_BASELINE = Object.freeze({
  tree: Object.freeze({
    young: 'large',
    intermediate: 'xl',
    mature: 'xxl'
  }),
  palm: Object.freeze({
    young: 'large',
    intermediate: 'xl',
    mature: 'xxl'
  }),
  shrub: Object.freeze({
    young: 'medium',
    intermediate: 'large',
    mature: 'large'
  }),
  subshrub: Object.freeze({
    young: 'medium',
    intermediate: 'medium',
    mature: 'large'
  }),
  'herbaceous-upright': Object.freeze({
    young: 'medium',
    intermediate: 'large',
    mature: 'large'
  }),
  'herbaceous-clump': Object.freeze({
    young: 'large',
    intermediate: 'large',
    mature: 'large'
  }),
  rosette: Object.freeze({
    young: 'small',
    intermediate: 'medium',
    mature: 'medium'
  }),
  climber: Object.freeze({
    young: 'medium',
    intermediate: 'large',
    mature: 'large'
  }),
  'grass-like': Object.freeze({
    young: 'medium',
    intermediate: 'large',
    mature: 'large'
  }),
  groundcover: Object.freeze({
    young: 'small',
    intermediate: 'medium',
    mature: 'medium'
  }),
  'succulent-form': Object.freeze({
    young: 'small',
    intermediate: 'medium',
    mature: 'medium'
  }),
  unknown: Object.freeze({
    young: 'medium',
    intermediate: 'medium',
    mature: 'medium'
  })
});

function asText(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function normalizeStage(value) {
  const stage = asText(value);
  if (stage === 'young' || stage === 'intermediate' || stage === 'mature') return stage;
  return 'mature';
}

function normalizeForm(value) {
  const form = asText(value);
  return FORM_STAGE_BASELINE[form] ? form : 'unknown';
}

function shiftBand(band, delta) {
  const i = BAND_ORDER.indexOf(asText(band));
  if (i < 0) return 'medium';
  const j = Math.max(0, Math.min(BAND_ORDER.length - 1, i + delta));
  return BAND_ORDER[j];
}

function adjacentBands(band) {
  const i = BAND_ORDER.indexOf(asText(band));
  if (i < 0) return ['small', 'medium', 'large'];
  const out = [];
  if (i > 0) out.push(BAND_ORDER[i - 1]);
  out.push(BAND_ORDER[i]);
  if (i < BAND_ORDER.length - 1) out.push(BAND_ORDER[i + 1]);
  return out;
}

export function deriveInGardenQaScale(input = {}, options = {}) {
  const jobId = asText(input.jobId);
  const visualForm = normalizeForm(input.visualForm);
  const growthStage = normalizeStage(input.growthStage);
  const phenology = asText(input.phenology || input.phenologyState || 'vegetative') || 'vegetative';

  const owner = options.ownerCalibration && jobId
    ? options.ownerCalibration[jobId] || null
    : null;

  if (owner && owner.band && BAND_ORDER.includes(asText(owner.band))) {
    const band = asText(owner.band);
    return Object.freeze({
      policyVersion: IN_GARDEN_QA_SCALE_POLICY_VERSION,
      recommendedBand: band,
      reviewBands: [band],
      source: 'OWNER_EXACT_JOB_CALIBRATION',
      visualForm,
      growthStage,
      phenology,
      phenologyAffectsScale: false,
      ownerReviewRequired: false,
      meterAccuracyClaimed: false,
      clippingAllowed: false,
      reasonCodes: ['OWNER_EXACT_JOB_CALIBRATION']
    });
  }

  let band = FORM_STAGE_BASELINE[visualForm][growthStage];
  const reasonCodes = [
    'VISUAL_FORM_BASELINE',
    'GROWTH_STAGE_REFINEMENT'
  ];

  const stature = asText(options.statureHint || input.statureHint || QA_STATURE_HINT.UNKNOWN);
  if (stature === QA_STATURE_HINT.COMPACT) {
    band = shiftBand(band, -1);
    reasonCodes.push('TRUSTED_STATURE_COMPACT_SHIFT');
  } else if (stature === QA_STATURE_HINT.TALL) {
    band = shiftBand(band, 1);
    reasonCodes.push('TRUSTED_STATURE_TALL_SHIFT');
  }

  const morphologyUnknown = visualForm === 'unknown';
  const calibrationStatus = asText(options.calibrationStatus || 'unvalidated');

  return Object.freeze({
    policyVersion: IN_GARDEN_QA_SCALE_POLICY_VERSION,
    recommendedBand: band,
    reviewBands: calibrationStatus === 'validated' ? [band] : adjacentBands(band),
    source: morphologyUnknown ? 'UNKNOWN_MORPHOLOGY_FALLBACK' : 'FORM_STAGE_POLICY',
    visualForm,
    growthStage,
    phenology,
    phenologyAffectsScale: false,
    ownerReviewRequired: morphologyUnknown || calibrationStatus !== 'validated',
    meterAccuracyClaimed: false,
    clippingAllowed: false,
    supportContextRequired: visualForm === 'climber',
    reasonCodes: morphologyUnknown
      ? [...reasonCodes, 'MORPHOLOGY_UNKNOWN_OWNER_REVIEW_REQUIRED']
      : reasonCodes
  });
}

export function qaScaleBandSpec(band) {
  const id = asText(band).toUpperCase();
  return QA_SCALE_BANDS[id] || QA_SCALE_BANDS.MEDIUM;
}

export const QA_SCALE_POLICY_GOVERNANCE = Object.freeze({
  perSpeciesHardcodingForbidden: true,
  exactJobOwnerOverridesAllowed: true,
  exactJobOwnerOverridesMustComeFromData: true,
  promotePilotLearningToFormStageRuleOnlyAfterCrossTaxonValidation: true,
  arbitraryUniversalThresholdForbidden: true,
  phenologyAloneMayNotChooseScale: true,
  productionPhysicalScaleSeparate: true,
  note:
    'Owner pilot choices are calibration evidence. A form/stage baseline becomes trusted only after representative cross-taxon review shows the behavior generalizes without systematic exceptions.'
});


function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function visibleAspectFromBbox(bbox) {
  if (!bbox || bbox.exists === false) return null;
  const w = Number(bbox.maxX) - Number(bbox.minX);
  const h = Number(bbox.maxY) - Number(bbox.minY);
  if (!(w > 0 && h > 0)) return null;
  return w / h;
}

export function deriveSiblingStateScaleAnchor(source = {}, target = {}, options = {}) {
  const sameIdentity =
    asText(source.canonicalSlug) &&
    asText(source.canonicalSlug) === asText(target.canonicalSlug);
  const sameForm =
    normalizeForm(source.visualForm) === normalizeForm(target.visualForm);
  const sameArchitecture =
    asText(source.architectureMode || 'default') === asText(target.architectureMode || 'default');
  const sameStage =
    normalizeStage(source.growthStage) === normalizeStage(target.growthStage);

  if (!sameIdentity || !sameForm || !sameArchitecture || !sameStage) {
    return Object.freeze({
      ok: false,
      code: 'SIBLING_STATE_SCALE_NOT_COMPATIBLE',
      reasonCodes: [
        !sameIdentity ? 'IDENTITY_DIFFERS' : null,
        !sameForm ? 'VISUAL_FORM_DIFFERS' : null,
        !sameArchitecture ? 'ARCHITECTURE_DIFFERS' : null,
        !sameStage ? 'GROWTH_STAGE_DIFFERS' : null
      ].filter(Boolean)
    });
  }

  const baseWidthPx = finitePositive(source.baseWidthPx);
  const placementScale = finitePositive(options.savedPlacementScale ?? source.savedPlacementScale);
  if (!baseWidthPx || !placementScale) {
    return Object.freeze({
      ok: false,
      code: 'SIBLING_STATE_SCALE_ANCHOR_MISSING',
      reasonCodes: [
        !baseWidthPx ? 'BASE_WIDTH_MISSING' : null,
        !placementScale ? 'PLACEMENT_SCALE_MISSING' : null
      ].filter(Boolean)
    });
  }

  const sourceAspect = visibleAspectFromBbox(source.alphaBBox);
  const targetAspect = visibleAspectFromBbox(target.alphaBBox);
  const maxAspectDeltaRatio = finitePositive(options.maxAspectDeltaRatio) || 0.08;
  const aspectDeltaRatio =
    sourceAspect && targetAspect
      ? Math.abs(targetAspect / sourceAspect - 1)
      : null;
  const aspectCompatible =
    aspectDeltaRatio == null ? false : aspectDeltaRatio <= maxAspectDeltaRatio;

  if (!aspectCompatible) {
    return Object.freeze({
      ok: false,
      code: 'SIBLING_STATE_ASPECT_REVIEW_REQUIRED',
      sourceAspect,
      targetAspect,
      aspectDeltaRatio,
      maxAspectDeltaRatio,
      reasonCodes: ['VISIBLE_ASPECT_DELTA_TOO_LARGE']
    });
  }

  return Object.freeze({
    ok: true,
    code: 'SIBLING_STATE_SCALE_INHERITED',
    canonicalSlug: asText(target.canonicalSlug),
    visualForm: normalizeForm(target.visualForm),
    architectureMode: asText(target.architectureMode || 'default'),
    growthStage: normalizeStage(target.growthStage),
    sourcePhenology: asText(source.phenology || source.phenologyState || 'unknown'),
    targetPhenology: asText(target.phenology || target.phenologyState || 'unknown'),
    phenologyAffectsScale: false,
    baseWidthPx,
    placementScale,
    productionEquivalentBaseWidthPx: baseWidthPx * placementScale,
    sourceAspect,
    targetAspect,
    aspectDeltaRatio,
    maxAspectDeltaRatio,
    clippingAllowed: false,
    meterAccuracyClaimed: false,
    source: 'SAME_PLANT_SAME_FORM_STAGE_SAVED_PLACEMENT'
  });
}

export const SIBLING_STATE_SCALE_GOVERNANCE = Object.freeze({
  sameCanonicalSlugRequired: true,
  sameVisualFormRequired: true,
  sameArchitectureRequired: true,
  sameGrowthStageRequired: true,
  phenologyMayDiffer: true,
  visibleAspectCompatibilityRequired: true,
  defaultMaxAspectDeltaRatio: 0.08,
  savedPlacementScalePreferredOverQaBandLabel: true,
  note:
    'Reuse a trusted saved placement scale across phenology states only when plant identity, visual form, architecture, growth stage and visible asset aspect remain compatible.'
});
