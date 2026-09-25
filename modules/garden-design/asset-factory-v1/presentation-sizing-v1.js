/**
 * Neutral presentation-size calibration for Garden Design cutouts.
 * Uses alpha bounds + visual form, never canonical plant-name switches.
 * Physical-size authority may override this at runtime when trusted evidence exists.
 */
export const PRESENTATION_SIZING_VERSION = 'presentation-sizing-v1.1';
export const PRESENTATION_REFERENCE_SCENE_WIDTH_PX = 1200;

export const PRESENTATION_SIZE_PROFILES = Object.freeze({
  tree: Object.freeze({ targetVisibleWidthRatio: 0.38, minBaseWidthPx: 260, maxBaseWidthPx: 560 }),
  'herbaceous-clump': Object.freeze({ targetVisibleWidthRatio: 0.32, minBaseWidthPx: 220, maxBaseWidthPx: 460 }),
  shrub: Object.freeze({ targetVisibleWidthRatio: 0.23, minBaseWidthPx: 160, maxBaseWidthPx: 360 }),
  subshrub: Object.freeze({ targetVisibleWidthRatio: 0.18, minBaseWidthPx: 130, maxBaseWidthPx: 300 }),
  'herbaceous-upright': Object.freeze({ targetVisibleWidthRatio: 0.14, minBaseWidthPx: 100, maxBaseWidthPx: 240 }),
  'herbaceous-clump': Object.freeze({ targetVisibleWidthRatio: 0.20, minBaseWidthPx: 140, maxBaseWidthPx: 320 }),
  rosette: Object.freeze({ targetVisibleWidthRatio: 0.15, minBaseWidthPx: 110, maxBaseWidthPx: 260 }),
  flower: Object.freeze({ targetVisibleWidthRatio: 0.12, minBaseWidthPx: 90, maxBaseWidthPx: 220 }),
  herb: Object.freeze({ targetVisibleWidthRatio: 0.12, minBaseWidthPx: 90, maxBaseWidthPx: 220 }),
  groundcover: Object.freeze({ targetVisibleWidthRatio: 0.16, minBaseWidthPx: 110, maxBaseWidthPx: 260 }),
  'grass-like': Object.freeze({ targetVisibleWidthRatio: 0.15, minBaseWidthPx: 100, maxBaseWidthPx: 240 }),
  default: Object.freeze({ targetVisibleWidthRatio: 0.18, minBaseWidthPx: 130, maxBaseWidthPx: 320 })
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeForm(value) {
  const v = String(value || '').trim().toLowerCase();
  if (PRESENTATION_SIZE_PROFILES[v]) return v;
  if (v === 'succulent-form') return 'rosette';
  return 'default';
}

export function resolvePresentationForm(input = {}) {
  const architecture = String(input.architectureMode || '').trim().toLowerCase();
  if (
    architecture
    && architecture !== 'default'
    && PRESENTATION_SIZE_PROFILES[architecture]
  ) return architecture;
  return normalizeForm(input.visualForm || input.architectureMode);
}

export function derivePresentationSizing(input = {}, options = {}) {
  const form = resolvePresentationForm(input);
  const profile = PRESENTATION_SIZE_PROFILES[form] || PRESENTATION_SIZE_PROFILES.default;
  const sceneWidth = Number(options.referenceSceneWidthPx || PRESENTATION_REFERENCE_SCENE_WIDTH_PX);
  const width = Number(input.width || input.metrics?.width || 0);
  const height = Number(input.height || input.metrics?.height || 0);
  const bbox = input.alphaBBox || input.bbox || input.metrics?.bbox || null;
  if (!width || !height || !bbox || bbox.exists === false) {
    return {
      version: PRESENTATION_SIZING_VERSION,
      status: 'CALIBRATION_BLOCKED',
      reason: 'alpha-bbox-required',
      baseWidthPx: null,
      visualForm: form,
      physicalScaleAuthorityMayOverride: true
    };
  }
  const bboxWidth = Math.max(1, Number(bbox.maxX) - Number(bbox.minX) + 1);
  const bboxHeight = Math.max(1, Number(bbox.maxY) - Number(bbox.minY) + 1);
  const visibleWidthRatio = bboxWidth / width;
  const visibleHeightRatio = bboxHeight / height;
  const targetVisibleWidthPx = sceneWidth * profile.targetVisibleWidthRatio;
  const rawBaseWidthPx = targetVisibleWidthPx / Math.max(0.01, visibleWidthRatio);
  const relativeScaleFactor = Number(options.relativeScaleFactor || 1);
  const safeRelativeScaleFactor =
    Number.isFinite(relativeScaleFactor) && relativeScaleFactor > 0
      ? relativeScaleFactor
      : 1;
  const evidenceAdjustedBaseWidthPx = rawBaseWidthPx * safeRelativeScaleFactor;
  const baseWidthPx = Math.round(
    clamp(evidenceAdjustedBaseWidthPx, profile.minBaseWidthPx, profile.maxBaseWidthPx)
  );
  const renderedHeightPx = Math.round(baseWidthPx * (height / width));
  const visibleRenderedHeightPx = Math.round(renderedHeightPx * visibleHeightRatio);
  return {
    version: PRESENTATION_SIZING_VERSION,
    status: 'CALIBRATED_BASELINE',
    visualForm: form,
    referenceSceneWidthPx: sceneWidth,
    targetVisibleWidthRatio: profile.targetVisibleWidthRatio,
    visibleWidthRatio,
    visibleHeightRatio,
    baseWidthPx,
    relativeScaleFactor:safeRelativeScaleFactor,
    rawBaseWidthPx,
    evidenceAdjustedBaseWidthPx,
    renderedHeightPx,
    visibleRenderedHeightPx,
    algorithm: 'visual-form-target-width-divided-by-alpha-visible-width',
    canonicalSlugIndependent: true,
    sourceResolutionPreserved: true,
    physicalScaleAuthorityMayOverride: true,
    ownerManualPerPlantSizingRequired: false
  };
}
