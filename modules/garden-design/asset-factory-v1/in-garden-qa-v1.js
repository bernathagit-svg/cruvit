/**
 * In-garden composition QA. Isolation transparency is not sufficient for approval.
 * No AI/inpainting. Does not alter the user's garden photo.
 */
export const IN_GARDEN_QA_VERSION = '1.0.0';

export const IN_GARDEN_REASON_CODES = Object.freeze([
  'FLOATING',
  'PERSPECTIVE_MISMATCH',
  'STICKER_LOOK',
  'HALO',
  'LIGHTING_MISMATCH',
  'OVER_SHARP',
  'OVER_SATURATED',
  'GROUND_CONTACT_BAD',
  'SCALE_IMPLAUSIBLE',
  'CROP_VISIBLE_IN_CONTEXT',
  'SAVED_GARDEN_PHOTO_UNAVAILABLE'
]);

export const IN_GARDEN_REVIEW_FIELDS = Object.freeze([
  'PERSPECTIVE',
  'GROUND_CONTACT',
  'STICKER_LOOK',
  'HALO',
  'SHARPNESS_MATCH',
  'COLOR_TONAL_MATCH',
  'SCALE_REALISM',
  'SILHOUETTE'
]);

export const IN_GARDEN_REVIEW_CHECKS = IN_GARDEN_REVIEW_FIELDS;

export const CUTOUT_INTEGRATION_VERDICT = Object.freeze({
  RAW_PASS: 'RAW_PASS',
  RUNTIME_BLEND_REQUIRED: 'RUNTIME_BLEND_REQUIRED',
  FAIL: 'FAIL'
});

export const IN_GARDEN_SCALES = Object.freeze(['small', 'medium', 'large']);

/** Non-destructive presentation aids. Not botanical identity. Not baked into binaries. */
export const RUNTIME_BLEND_EXPERIMENT = Object.freeze({
  implementedPermanently: false,
  altersGardenPhoto: false,
  usesAiOrInpainting: false,
  aids: Object.freeze({
    contactShadow: { opacity: 0.2, blurPx: 14, offsetYPx: 10 },
    brightness: 0.96,
    contrast: 0.94,
    saturation: 0.9,
    edgeSofteningPx: 0.35
  })
});

/** Non-destructive Blend V1 for existing calibration candidates. Does not bake binaries. */
export const RUNTIME_BLEND_V1 = Object.freeze({
  version: 'blend-v1',
  implementedPermanently: false,
  altersGardenPhoto: false,
  usesAiOrInpainting: false,
  canAddress: Object.freeze(['STICKER_LOOK', 'SHARPNESS_MATCH', 'COLOR_TONAL_MATCH', 'GROUND_CONTACT', 'HALO']),
  cannotAddress: Object.freeze(['PERSPECTIVE', 'SILHOUETTE', 'SCALE_REALISM']),
  aids: Object.freeze({
    contactShadow: { opacity: 0.32, blurPx: 18, offsetYPx: 12 },
    brightness: 0.93,
    contrast: 0.9,
    saturation: 0.86,
    edgeSofteningPx: 0.55
  })
});

const ASSET_TO_IN_GARDEN = Object.freeze({
  halo: 'HALO',
  'background-artifact': 'HALO',
  crop: 'CROP_VISIBLE_IN_CONTEXT',
  'edge-contact': 'CROP_VISIBLE_IN_CONTEXT',
  'opaque-rectangular-background': 'GROUND_CONTACT_BAD',
  'corners-not-transparent': 'GROUND_CONTACT_BAD',
  'plant-bounding-box-missing': 'GROUND_CONTACT_BAD',
  'alpha-coverage': 'STICKER_LOOK'
});

export function mapAssetQaToInGardenReasons(assetQa = {}) {
  const reasons = [];
  for (const code of assetQa.reasons || []) {
    const mapped = ASSET_TO_IN_GARDEN[code];
    if (mapped && !reasons.includes(mapped)) reasons.push(mapped);
  }
  return reasons;
}

export function assessInGardenQa(input = {}) {
  const realPhotoReady = input.realSavedGardenPhotoReady === true;
  if (!realPhotoReady) {
    return {
      result: 'BLOCKED',
      reasonCodes: ['SAVED_GARDEN_PHOTO_UNAVAILABLE'],
      autoApproveEligible: false,
      note: 'In-garden QA is BLOCKED until the real saved Garden Design source photo is loaded via a temporary signed URL. Local stand-ins are supplementary only.',
      scales: IN_GARDEN_SCALES,
      checks: IN_GARDEN_REVIEW_CHECKS,
      runtimeBlend: 'NOT_EVALUATED'
    };
  }
  const generated = input.generated === true && input.bytes;
  if (!generated) {
    return {
      result: 'UNKNOWN',
      reasonCodes: [],
      autoApproveEligible: false,
      note: 'In-garden QA cannot PASS until a generated candidate is composited on the real garden photo at small, medium, and large scales. Owner visual review is required.',
      scales: IN_GARDEN_SCALES,
      checks: IN_GARDEN_REVIEW_CHECKS,
      runtimeBlend: 'NOT_EVALUATED'
    };
  }
  const fromAsset = mapAssetQaToInGardenReasons(input.assetQa || {});
  if (fromAsset.length) {
    return {
      result: 'FAIL',
      reasonCodes: fromAsset,
      autoApproveEligible: false,
      runtimeBlend: 'NOT_EVALUATED',
      scales: IN_GARDEN_SCALES,
      checks: IN_GARDEN_REVIEW_CHECKS
    };
  }
  return {
    result: 'UNKNOWN',
    reasonCodes: [],
    autoApproveEligible: false,
    note: 'Automated checks can FAIL halo/crop/ground-plate issues. Perspective, sticker-look, lighting, and scale still require owner in-garden review on the real garden photo.',
    scales: IN_GARDEN_SCALES,
    checks: IN_GARDEN_REVIEW_CHECKS,
    runtimeBlend: 'NOT_EVALUATED'
  };
}

export function composeApprovalVerdict(assetQaResult, inGardenQaResult, options = {}) {
  const asset = String(assetQaResult || 'UNKNOWN');
  let garden = String(inGardenQaResult || 'UNKNOWN');
  if (garden === 'PASS' && options.realSavedGardenPhotoUsed !== true) {
    garden = 'BLOCKED';
  }
  const approved = asset === 'PASS' && garden === 'PASS';
  return {
    ASSET_QA: asset,
    IN_GARDEN_QA: garden,
    approvalEligible: approved,
    note: approved
      ? 'Both gates passed.'
      : 'An asset cannot become APPROVED unless ASSET_QA=PASS and IN_GARDEN_QA=PASS. IN_GARDEN_QA may be PASS only when the real persisted Garden photo was used. UNKNOWN never auto-approves.'
  };
}

export function classifyCutoutIntegration(verdict = {}) {
  if (verdict.ASSET_QA !== 'PASS') return CUTOUT_INTEGRATION_VERDICT.FAIL;
  if (verdict.IN_GARDEN_QA === 'PASS') return CUTOUT_INTEGRATION_VERDICT.RAW_PASS;
  const reasons = verdict.reasonCodes || [];
  const blendOnly = reasons.length > 0 && reasons.every((c) =>
    ['STICKER_LOOK', 'LIGHTING_MISMATCH', 'OVER_SHARP', 'OVER_SATURATED'].includes(c)
  );
  if (verdict.IN_GARDEN_QA === 'FAIL' && blendOnly) {
    return CUTOUT_INTEGRATION_VERDICT.RUNTIME_BLEND_REQUIRED;
  }
  if (verdict.IN_GARDEN_QA === 'FAIL') return CUTOUT_INTEGRATION_VERDICT.FAIL;
  return CUTOUT_INTEGRATION_VERDICT.FAIL;
}
