/**
 * Garden Design physical-scale foundation V1.
 * Generic across visualForm. No species hard-coding. No invented meters.
 * Photo calibration is OPTIONAL and never blocks Garden Design.
 * Estimate only. Not a survey. No generation. No spend.
 */
import { computeSceneVisualScale } from './composition-calibration-v2.js';
import { computeTreeSceneScaleV3 } from './composition-calibration-v3.js';

export const PHYSICAL_SCALE_MODEL_VERSION = 'physical-scale-foundation-v1';

export const DIMENSION_EVIDENCE = Object.freeze({
  SOURCE_SUPPORTED_RANGE: 'SOURCE_SUPPORTED_RANGE',
  USER_CONFIRMED: 'USER_CONFIRMED',
  HEURISTIC_RANGE: 'HEURISTIC_RANGE',
  UNKNOWN: 'UNKNOWN'
});

export const PHYSICAL_PREVIEW_DRIVE_CLASSES = Object.freeze([
  DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
  DIMENSION_EVIDENCE.USER_CONFIRMED
]);

export const REFERENCE_KINDS = Object.freeze([
  'door_height',
  'fence_height',
  'wall_height',
  'path_width',
  'planter_width',
  'known_garden_dimension',
  'custom'
]);

export const PHOTO_SCALE_STORAGE_KEY = 'cruvit:garden-photo-scale-calibration-v1';
export const PHOTO_SCALE_CHOICE_STORAGE_KEY = 'cruvit:garden-photo-scale-choice-v1';
export const USER_CONFIRMED_SIZE_STORAGE_KEY = 'cruvit:physical-scale-user-confirmed-v1';
export const USER_SCALE_OVERRIDE_STORAGE_KEY = 'cruvit:physical-scale-user-override-v1';

export const PHOTO_SCALE_STATE = Object.freeze({
  NOT_CALIBRATED: 'NOT_CALIBRATED',
  CALIBRATED: 'CALIBRATED'
});

export const PHOTO_SCALE_MODE = Object.freeze({
  ESTIMATED: 'ESTIMATED',
  CALIBRATED: 'CALIBRATED'
});

export const PHOTO_SCALE_PRODUCT_CONTRACT = Object.freeze({
  calibrationMandatory: false,
  gardenDesignBlockedWithoutCalibration: false,
  calibrationRepeatedPerPlant: false,
  calibrationRepeatedPerPlacement: false,
  accountWideUniversalCalibration: false,
  scope: 'specific-garden-source-photo',
  modes: Object.freeze([PHOTO_SCALE_MODE.ESTIMATED, PHOTO_SCALE_MODE.CALIBRATED]),
  estimatedLabels: Object.freeze(['Estimated size', 'Estimated mature size']),
  calibratedLabel: 'Calibrated suggested size',
  surveyingAccuracy: false
});

export const PHYSICAL_SCALE_ACCURACY = 'garden-visualization-estimate-not-survey';
export const ARCHITECTURE_CLASSES = Object.freeze({
  ARCHITECTURE_COMPATIBLE: 'ARCHITECTURE_COMPATIBLE',
  REGEN_REQUIRED_ARCHITECTURE: 'REGEN_REQUIRED_ARCHITECTURE',
  UNKNOWN: 'UNKNOWN'
});

/** Ground-plane placement. ny 0 = top (farther), ny 1 = bottom (nearer). Not a survey. */
export const PHYSICAL_PLACEMENT = Object.freeze({
  near: Object.freeze({ id: 'near', ny: 0.88, yBottomPct: 6, label: 'near-ground' }),
  middle: Object.freeze({ id: 'middle', ny: 0.72, yBottomPct: 20, label: 'middle depth' }),
  far: Object.freeze({ id: 'far', ny: 0.55, yBottomPct: 36, label: 'far depth' })
});

export function placementNyForDepth(depthId) {
  const row = PHYSICAL_PLACEMENT[depthId] || PHYSICAL_PLACEMENT.middle;
  return row.ny;
}

function asText(value) {
  return String(value == null ? '' : value).trim();
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function bboxFillRatio(bbox = {}, canvasHeight = 1536) {
  const minY = Number(bbox.minY);
  const maxY = Number(bbox.maxY);
  const height = Number(canvasHeight) || 1536;
  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY <= minY || height <= 0) return 1;
  return clamp((maxY - minY) / height, 0.35, 1);
}

function visibleWidthOverHeight(bbox = {}) {
  const minX = Number(bbox.minX);
  const maxX = Number(bbox.maxX);
  const minY = Number(bbox.minY);
  const maxY = Number(bbox.maxY);
  if (![minX, maxX, minY, maxY].every(Number.isFinite) || maxX <= minX || maxY <= minY) return null;
  return (maxX - minX) / (maxY - minY);
}

export function mayDrivePhysicalMeterPreview(evidenceClass) {
  return PHYSICAL_PREVIEW_DRIVE_CLASSES.includes(evidenceClass);
}

export function emptyPhotoScaleCalibration() {
  return {
    contract: 'garden-photo-scale-calibration-v1',
    model: PHYSICAL_SCALE_MODEL_VERSION,
    photoKey: null,
    scope: 'specific-garden-source-photo',
    references: [],
    captureWidthPx: null,
    captureHeightPx: null,
    pixelsPerMeterNear: null,
    pixelsPerMeterFar: null,
    accuracy: PHYSICAL_SCALE_ACCURACY,
    surveyingAccuracy: false
  };
}

export function photoScaleStateFromCalibration(calibration) {
  const cal = recomputePhotoScale(calibration || emptyPhotoScaleCalibration());
  const hasRef = (cal.references || []).some(
    (row) => Number.isFinite(Number(row.knownMeters)) && Number(row.knownMeters) > 0
  );
  return hasRef ? PHOTO_SCALE_STATE.CALIBRATED : PHOTO_SCALE_STATE.NOT_CALIBRATED;
}

export function emptyPhotoScaleChoice(photoKey = null) {
  return {
    photoKey: photoKey || null,
    photoScaleState: PHOTO_SCALE_STATE.NOT_CALIBRATED,
    calibrationDismissedForNow: false,
    intent: null,
    showCalibratePrompt: true,
    scope: 'specific-garden-source-photo',
    gardenDesignBlocked: false
  };
}

export function resolvePhotoScaleChoice(store, photoKey, calibration) {
  const key = photoKey || 'unspecified-garden-photo';
  const row =
    store && typeof store === 'object' && store[key] && typeof store[key] === 'object'
      ? store[key]
      : emptyPhotoScaleChoice(key);
  const state = photoScaleStateFromCalibration(calibration);
  if (state === PHOTO_SCALE_STATE.CALIBRATED) {
    return {
      ...row,
      photoKey: key,
      photoScaleState: PHOTO_SCALE_STATE.CALIBRATED,
      calibrationDismissedForNow: false,
      intent: 'calibrate',
      showCalibratePrompt: false,
      gardenDesignBlocked: false
    };
  }
  if (row.calibrationDismissedForNow) {
    return {
      ...row,
      photoKey: key,
      photoScaleState: PHOTO_SCALE_STATE.NOT_CALIBRATED,
      showCalibratePrompt: false,
      gardenDesignBlocked: false
    };
  }
  return {
    ...row,
    photoKey: key,
    photoScaleState: PHOTO_SCALE_STATE.NOT_CALIBRATED,
    showCalibratePrompt: row.intent !== 'calibrate',
    gardenDesignBlocked: false
  };
}

function estimatedFormRelativeScale(input = {}) {
  const visualForm = asText(input.visualForm) || 'unknown';
  if (visualForm === 'tree') {
    return computeTreeSceneScaleV3({
      visualForm,
      growthStage: input.growthStage || 'mature',
      depthId: input.depthId || 'middle',
      ownerScale: input.ownerScale,
      bbox: input.bbox,
      canvasWidth: input.canvasWidth,
      canvasHeight: input.canvasHeight
    });
  }
  return computeSceneVisualScale({
    visualForm,
    depthId: input.depthId || 'middle',
    ownerScale: input.ownerScale,
    sizeEvidence: input.sizeEvidence
  });
}

export function pixelsPerMeterFromReference(ref, sceneWidthPx, sceneHeightPx) {
  const meters = finitePositive(ref && ref.knownMeters);
  if (!meters) return null;
  const px = pixelDistanceNormalized(ref.pointA, ref.pointB, sceneWidthPx, sceneHeightPx);
  return px > 0 ? px / meters : null;
}

export function pixelDistanceNormalized(pointA, pointB, sceneWidthPx, sceneHeightPx) {
  const w = finitePositive(sceneWidthPx) || 0;
  const h = finitePositive(sceneHeightPx) || 0;
  const dx = (Number(pointB.nx) - Number(pointA.nx)) * w;
  const dy = (Number(pointB.ny) - Number(pointA.ny)) * h;
  const dist = Math.hypot(dx, dy);
  return Number.isFinite(dist) ? dist : 0;
}

export function addKnownReference(calibration, input = {}) {
  const next = {
    ...(calibration || emptyPhotoScaleCalibration()),
    references: [...((calibration && calibration.references) || [])]
  };
  const knownMeters = finitePositive(input.knownMeters);
  const sceneWidthPx = finitePositive(input.sceneWidthPx);
  const sceneHeightPx = finitePositive(input.sceneHeightPx);
  const pointA = input.pointA || null;
  const pointB = input.pointB || null;
  if (!knownMeters || !sceneWidthPx || !sceneHeightPx || !pointA || !pointB) {
    return { ok: false, code: 'REFERENCE_INCOMPLETE', calibration: next };
  }
  const px = pixelDistanceNormalized(pointA, pointB, sceneWidthPx, sceneHeightPx);
  if (px < 4) return { ok: false, code: 'REFERENCE_TOO_SHORT', calibration: next };
  const depthBand = input.depthBand === 'far' || input.depthBand === 'near' ? input.depthBand : 'unspecified';
  const kind = REFERENCE_KINDS.includes(input.kind) ? input.kind : 'custom';
  const ref = {
    id: input.id || `ref-${next.references.length + 1}`,
    kind,
    pointA: { nx: clamp(pointA.nx, 0, 1), ny: clamp(pointA.ny, 0, 1) },
    pointB: { nx: clamp(pointB.nx, 0, 1), ny: clamp(pointB.ny, 0, 1) },
    knownMeters,
    depthBand,
    pixels: px,
    pixelsPerMeter: px / knownMeters,
    midNy: (clamp(pointA.ny, 0, 1) + clamp(pointB.ny, 0, 1)) / 2
  };
  next.references.push(ref);
  next.captureWidthPx = sceneWidthPx;
  next.captureHeightPx = sceneHeightPx;
  return { ok: true, code: 'REFERENCE_ADDED', calibration: recomputePhotoScale(next, sceneWidthPx, sceneHeightPx) };
}

export function removeKnownReference(calibration, id) {
  const next = {
    ...(calibration || emptyPhotoScaleCalibration()),
    references: ((calibration && calibration.references) || []).filter((row) => row.id !== id)
  };
  return recomputePhotoScale(next, next.captureWidthPx, next.captureHeightPx);
}

export function recomputePhotoScale(calibration, sceneWidthPx, sceneHeightPx) {
  const next = { ...(calibration || emptyPhotoScaleCalibration()) };
  const w = finitePositive(sceneWidthPx) || finitePositive(next.captureWidthPx);
  const h = finitePositive(sceneHeightPx) || finitePositive(next.captureHeightPx);
  const refs = (Array.isArray(next.references) ? next.references : []).map((row) => {
    const ppm = w && h ? pixelsPerMeterFromReference(row, w, h) : finitePositive(row.pixelsPerMeter);
    return { ...row, pixelsPerMeter: ppm, pixels: ppm && row.knownMeters ? ppm * row.knownMeters : row.pixels };
  });
  next.references = refs;
  if (w) next.captureWidthPx = w;
  if (h) next.captureHeightPx = h;
  const near = refs.filter((row) => row.depthBand === 'near' && Number.isFinite(row.pixelsPerMeter));
  const far = refs.filter((row) => row.depthBand === 'far' && Number.isFinite(row.pixelsPerMeter));
  const any = refs.filter((row) => Number.isFinite(row.pixelsPerMeter));
  const avg = (rows) =>
    rows.length ? rows.reduce((sum, row) => sum + row.pixelsPerMeter, 0) / rows.length : null;
  next.pixelsPerMeterNear = avg(near.length ? near : any);
  next.pixelsPerMeterFar = avg(far.length ? far : any);
  next.nearAnchorNy = near.length ? avgNy(near) : any.length ? avgNy(any) : null;
  next.farAnchorNy = far.length ? avgNy(far) : any.length ? avgNy(any) : null;
  next.hasPerspectivePair = near.length > 0 && far.length > 0;
  next.accuracy = PHYSICAL_SCALE_ACCURACY;
  next.surveyingAccuracy = false;
  return next;
}

function avgNy(rows) {
  return rows.reduce((sum, row) => sum + Number(row.midNy || 0), 0) / rows.length;
}

export function interpolatePixelsPerMeter(calibration, placementNy, sceneSize = {}) {
  const cal = recomputePhotoScale(
    calibration || emptyPhotoScaleCalibration(),
    sceneSize.width,
    sceneSize.height
  );
  const near = finitePositive(cal.pixelsPerMeterNear);
  const far = finitePositive(cal.pixelsPerMeterFar);
  if (!near && !far) {
    return { pixelsPerMeter: null, mode: 'UNCALIBRATED', accuracy: PHYSICAL_SCALE_ACCURACY };
  }
  if (!cal.hasPerspectivePair || !near || !far || near === far) {
    return {
      pixelsPerMeter: near || far,
      mode: 'SINGLE_REFERENCE',
      accuracy: PHYSICAL_SCALE_ACCURACY,
      note: 'One global pixels-per-meter is a visualization estimate. Add near and far references for perspective interpolation.'
    };
  }
  const ny = clamp(placementNy, 0, 1);
  const nearNy = cal.nearAnchorNy == null ? 0.85 : cal.nearAnchorNy;
  const farNy = cal.farAnchorNy == null ? 0.35 : cal.farAnchorNy;
  const span = nearNy - farNy;
  const t = Math.abs(span) < 0.02 ? 0.5 : clamp((ny - farNy) / span, 0, 1);
  return {
    pixelsPerMeter: far + (near - far) * t,
    mode: 'NEAR_FAR_INTERPOLATED',
    t,
    accuracy: PHYSICAL_SCALE_ACCURACY
  };
}

export function classifyCatalogDimensionEvidence(plant = {}, options = {}) {
  const spacing =
    plant.gardenCompatibility && plant.gardenCompatibility.spacing && typeof plant.gardenCompatibility.spacing === 'object'
      ? plant.gardenCompatibility.spacing
      : {};
  const traits = plant.climateTraits && typeof plant.climateTraits === 'object' ? plant.climateTraits : {};
  const classes = traits.traitEvidenceClasses && typeof traits.traitEvidenceClasses === 'object'
    ? traits.traitEvidenceClasses
    : {};
  const classText = asText(
    classes.matureHeightM || classes.matureSpreadM || classes.matureSize || classes.size || options.evidenceClass
  );
  const min = finitePositive(spacing.matureHeightMMin ?? plant.matureHeightMMin ?? spacing.matureHeightM ?? plant.matureHeightM);
  const max = finitePositive(spacing.matureHeightMMax ?? plant.matureHeightMMax ?? spacing.matureHeightM ?? plant.matureHeightM);
  const spreadMin = finitePositive(spacing.matureSpreadMMin ?? plant.matureSpreadMMin ?? spacing.matureSpreadM ?? plant.matureSpreadM);
  const spreadMax = finitePositive(spacing.matureSpreadMMax ?? plant.matureSpreadMMax ?? spacing.matureSpreadM ?? plant.matureSpreadM);
  const unprovenanced = asText(options.librarySizeCopy || plant.care?.size || plant.size || spacing.matureSize);

  if (min && max && (classText === 'SOURCE_SUPPORTED' || classText === 'SOURCE_SUPPORTED_RANGE')) {
    return {
      evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
      growthStage: asText(options.growthStage || plant.growthStage) || 'mature',
      visualForm: asText(options.visualForm || plant.visualForm || plant.growthForm) || null,
      heightM: { min, max },
      spreadM: spreadMin && spreadMax ? { min: spreadMin, max: spreadMax } : null,
      mayDrivePhysicalMeterPreview: true,
      usedUnprovenancedCopy: false
    };
  }

  if (min && max && (classText === 'HEURISTIC_ASSERTION' || classText === 'LEGACY_ASSERTED_METADATA' || classText === 'HEURISTIC_RANGE')) {
    return {
      evidenceClass: DIMENSION_EVIDENCE.HEURISTIC_RANGE,
      growthStage: asText(options.growthStage || plant.growthStage) || 'mature',
      visualForm: asText(options.visualForm || plant.visualForm) || null,
      heightM: { min, max },
      spreadM: spreadMin && spreadMax ? { min: spreadMin, max: spreadMax } : null,
      mayDrivePhysicalMeterPreview: false,
      usedUnprovenancedCopy: false,
      note: 'Heuristic numeric range recorded but must not drive a physically labelled meter preview.'
    };
  }

  return {
    evidenceClass: DIMENSION_EVIDENCE.UNKNOWN,
    growthStage: asText(options.growthStage || plant.growthStage) || null,
    visualForm: asText(options.visualForm || plant.visualForm) || null,
    heightM: null,
    spreadM: null,
    mayDrivePhysicalMeterPreview: false,
    unprovenancedCatalogCopy: unprovenanced || null,
    usedUnprovenancedCopy: false,
    note: 'UNKNOWN must not pretend to know meters. Unprovenanced size copy is not numeric authority.'
  };
}

export function classifyUserConfirmedDimension(input = {}) {
  const min = finitePositive(input.heightMMin);
  const max = finitePositive(input.heightMMax == null ? input.heightMMin : input.heightMMax);
  const stage = asText(input.growthStage) || 'mature';
  if (!min || !max || max < min) {
    return {
      evidenceClass: DIMENSION_EVIDENCE.UNKNOWN,
      growthStage: stage,
      mayDrivePhysicalMeterPreview: false,
      note: 'USER_CONFIRMED requires a positive min/max range entered by the user.'
    };
  }
  return {
    evidenceClass: DIMENSION_EVIDENCE.USER_CONFIRMED,
    growthStage: stage,
    visualForm: asText(input.visualForm) || null,
    heightM: { min, max },
    spreadM:
      finitePositive(input.spreadMMin) && finitePositive(input.spreadMMax)
        ? { min: finitePositive(input.spreadMMin), max: finitePositive(input.spreadMMax) }
        : null,
    mayDrivePhysicalMeterPreview: true,
    source: 'owner-entered-not-catalog',
    note: 'User-confirmed range. Not catalog botanical truth. Not invented by CRUVIT.'
  };
}

export function resolveGrowthStageDimensions(input = {}) {
  const stage = asText(input.growthStage) === 'young' ? 'young' : 'mature';
  const scenario = asText(input.sizeScenario) || 'NATURAL_MATURE';
  if (
    input.resolvedEvidence &&
    input.resolvedEvidence.growthStage === stage &&
    typeof input.resolvedEvidence.mayDrivePhysicalMeterPreview === 'boolean'
  ) {
    return { ...input.resolvedEvidence, derivedFromOtherStage: false };
  }
  const catalog = input.catalogEvidence && input.catalogEvidence.growthStage === stage ? input.catalogEvidence : null;
  const user = input.userConfirmed && input.userConfirmed.growthStage === stage ? input.userConfirmed : null;
  if (scenario !== 'USER_OVERRIDE' && catalog && catalog.mayDrivePhysicalMeterPreview) {
    return { ...catalog, resolvedFrom: catalog.evidenceClass, derivedFromOtherStage: false };
  }
  if (user && user.mayDrivePhysicalMeterPreview) {
    return { ...user, resolvedFrom: 'USER_CONFIRMED', derivedFromOtherStage: false };
  }
  if (catalog && catalog.mayDrivePhysicalMeterPreview) {
    return { ...catalog, resolvedFrom: catalog.evidenceClass, derivedFromOtherStage: false };
  }
  const otherStageEvidence = [input.catalogEvidence, input.userConfirmed].filter(
    (row) => row && row.growthStage && row.growthStage !== stage && row.mayDrivePhysicalMeterPreview
  );
  return {
    evidenceClass: DIMENSION_EVIDENCE.UNKNOWN,
    growthStage: stage,
    visualForm: asText(input.visualForm) || null,
    heightM: null,
    mayDrivePhysicalMeterPreview: false,
    derivedFromOtherStage: false,
    otherStageEvidenceIgnored: otherStageEvidence.map((row) => row.growthStage),
    note: 'Do not derive this stage as a fixed percentage of another stage without evidence.'
  };
}

export function suggestedHeightMFromRange(range, band = 'MID') {
  if (!range || !finitePositive(range.min) || !finitePositive(range.max)) return null;
  const id = String(band || 'MID').toUpperCase();
  if (id === 'LOW') return range.min;
  if (id === 'HIGH') return range.max;
  return (range.min + range.max) / 2;
}

export function computePhysicalSceneScale(input = {}) {
  const stageDims = resolveGrowthStageDimensions(input);
  const calibration = recomputePhotoScale(input.photoCalibration || emptyPhotoScaleCalibration());
  const sceneHeightPx = finitePositive(input.sceneHeightPx) || 300;
  const sceneWidthPx = finitePositive(input.sceneWidthPx) || sceneHeightPx * (4 / 3);
  const bbox = input.bbox || {};
  const canvasHeight = finitePositive(input.canvasHeight) || 1536;
  const fill = bboxFillRatio(bbox, canvasHeight);
  const depth = PHYSICAL_PLACEMENT[input.depthId] || null;
  const placementNy =
    input.placementNy == null ? (depth ? depth.ny : PHYSICAL_PLACEMENT.middle.ny) : clamp(input.placementNy, 0, 1);
  const ppm = interpolatePixelsPerMeter(calibration, placementNy, {
    width: sceneWidthPx,
    height: sceneHeightPx
  });
  const rangeBand = String(input.rangeBand || 'MID').toUpperCase();
  const sizeScenario = asText(input.sizeScenario || stageDims.sizeScenario) || 'NATURAL_MATURE';
  const override = input.userOverride && typeof input.userOverride === 'object' ? input.userOverride : { kind: 'none' };
  let displayHeightM = null;
  let label = 'Suggested mature size';
  let displaySource = 'none';
  if (stageDims.mayDrivePhysicalMeterPreview) {
    displayHeightM = suggestedHeightMFromRange(stageDims.heightM, rangeBand);
    displaySource = 'suggested-from-evidence';
    label =
      stageDims.growthStage === 'young'
        ? 'Calibrated suggested size'
        : rangeBand === 'MID'
          ? 'Calibrated suggested size — MID representative preview, not botanical truth'
          : `Calibrated suggested size — ${rangeBand} of supported range`;
  }
  if (override.kind === 'heightM' && finitePositive(override.value)) {
    displayHeightM = finitePositive(override.value);
    displaySource = 'USER_OVERRIDE';
    label = 'User override';
  } else if (
    override.kind === 'multiplier' &&
    finitePositive(override.value) &&
    displayHeightM &&
    Math.abs(finitePositive(override.value) - 1) > 0.001
  ) {
    displayHeightM = displayHeightM * finitePositive(override.value);
    displaySource = 'USER_OVERRIDE';
    label = 'User override';
  }
  const photoScaleState = ppm.pixelsPerMeter
    ? PHOTO_SCALE_STATE.CALIBRATED
    : PHOTO_SCALE_STATE.NOT_CALIBRATED;
  const lockScaleMode = asText(input.lockScaleMode || input.forceScaleMode).toUpperCase();
  const forceEstimated = lockScaleMode === PHOTO_SCALE_MODE.ESTIMATED;
  const canCalibrateMeters = !forceEstimated && Boolean(ppm.pixelsPerMeter && displayHeightM);
  if (!canCalibrateMeters) {
    const estimated = estimatedFormRelativeScale({
      visualForm: asText(input.visualForm) || stageDims.visualForm,
      growthStage: stageDims.growthStage,
      depthId: input.depthId,
      ownerScale: input.ownerScale,
      bbox,
      canvasWidth: finitePositive(input.canvasWidth) || 1024,
      canvasHeight,
      sizeEvidence: { status: stageDims.evidenceClass }
    });
    const imgPct = estimated.imgHeightPct != null ? estimated.imgHeightPct : estimated.heightPct;
    const visiblePct = estimated.visibleHeightPct != null ? estimated.visibleHeightPct : estimated.heightPct;
    const young = stageDims.growthStage === 'young';
    const estimatedLabel = displayHeightM && !young ? 'Estimated mature size' : 'Estimated size';
    return {
      status: 'PHYSICAL_SCALE_ESTIMATED',
      model: PHYSICAL_SCALE_MODEL_VERSION,
      scaleMode: PHOTO_SCALE_MODE.ESTIMATED,
      lockScaleMode: forceEstimated ? PHOTO_SCALE_MODE.ESTIMATED : null,
      photoScaleState,
      gardenDesignBlocked: false,
      calibrationMandatory: false,
      reasons: displayHeightM ? [] : ['BOTANICAL_METERS_UNKNOWN'],
      label: estimatedLabel,
      exact: false,
      meterAccuracy: false,
      displaySource: 'estimated-form-relative',
      botanicalEvidenceClass: stageDims.evidenceClass,
      botanicalHeightM: displayHeightM,
      displayHeightM: null,
      sizeScenario,
      rangeBand,
      imgHeightPct: imgPct,
      visibleHeightPct: visiblePct,
      imgHeightPx: (imgPct / 100) * sceneHeightPx,
      visibleHeightPx: (visiblePct / 100) * sceneHeightPx,
      yBottomPct: estimated.yBottomPct != null ? estimated.yBottomPct : PHYSICAL_PLACEMENT.middle.yBottomPct,
      visualForm: asText(input.visualForm) || stageDims.visualForm || null,
      growthStage: stageDims.growthStage,
      mangoHardCoded: false,
      usedInventedMeters: false,
      userOverrideSeparateFromBotanicalTruth: displaySource === 'USER_OVERRIDE',
      accuracy: 'visual-aid-not-centimeter',
      note: displayHeightM
        ? `${estimatedLabel}. Botanical range is known but this render is not a meter measurement until the photo is calibrated.`
        : `${estimatedLabel}. Botanical meters UNKNOWN. Do not invent meters. Garden Design stays usable. Manual resize always available.`
    };
  }
  const visibleHeightPx = displayHeightM * ppm.pixelsPerMeter;
  const imgHeightPx = visibleHeightPx / fill;
  const widthOverHeight = visibleWidthOverHeight(bbox);
  const impliedSpreadM = widthOverHeight && displayHeightM ? displayHeightM * widthOverHeight : null;
  const spreadRange = stageDims.spreadM || null;
  let architectureClass = ARCHITECTURE_CLASSES.UNKNOWN;
  let architectureNote = 'No supported spread range to compare against the PNG aspect.';
  if (impliedSpreadM && spreadRange && finitePositive(spreadRange.min) && finitePositive(spreadRange.max)) {
    const inside = impliedSpreadM >= spreadRange.min * 0.92 && impliedSpreadM <= spreadRange.max * 1.08;
    architectureClass = inside
      ? ARCHITECTURE_CLASSES.ARCHITECTURE_COMPATIBLE
      : ARCHITECTURE_CLASSES.REGEN_REQUIRED_ARCHITECTURE;
    architectureNote = inside
      ? 'Uniform scale from height. Implied canopy from PNG aspect sits inside the supported spread range. PNG was not stretched.'
      : 'Do not stretch the PNG independently in X/Y to fake botanical spread. REGEN_REQUIRED_ARCHITECTURE.';
  }
  const botanicalTruth = {
    evidenceClass: stageDims.evidenceClass,
    heightRangeM: stageDims.heightM || null,
    spreadRangeM: spreadRange,
    source: stageDims.source || null,
    immutable: true
  };
  return {
    status: 'PHYSICAL_SCALE_READY',
    model: PHYSICAL_SCALE_MODEL_VERSION,
    scaleMode: PHOTO_SCALE_MODE.CALIBRATED,
    lockScaleMode: lockScaleMode || PHOTO_SCALE_MODE.CALIBRATED,
    photoScaleState: PHOTO_SCALE_STATE.CALIBRATED,
    gardenDesignBlocked: false,
    calibrationMandatory: false,
    reasons: [],
    label,
    exact: false,
    displaySource,
    botanicalEvidenceClass: stageDims.evidenceClass,
    sizeScenario,
    rangeBand,
    suggestedHeightM: suggestedHeightMFromRange(stageDims.heightM, rangeBand),
    displayHeightM,
    heightRangeM: stageDims.heightM,
    spreadRangeM: spreadRange,
    impliedSpreadM,
    stretchedPng: false,
    architectureClass,
    architectureNote,
    botanicalTruth,
    designPreview: {
      rangeBand,
      displayHeightM,
      impliedSpreadM,
      representativePreview: rangeBand === 'MID',
      notBotanicalTruth: true
    },
    userOverrideSeparateFromBotanicalTruth: displaySource === 'USER_OVERRIDE',
    visibleHeightPx,
    imgHeightPx,
    imgHeightPct: (imgHeightPx / sceneHeightPx) * 100,
    visibleHeightPct: (visibleHeightPx / sceneHeightPx) * 100,
    bboxFillRatio: fill,
    assetWidthOverHeight: widthOverHeight,
    pixelsPerMeter: ppm.pixelsPerMeter,
    photoScaleMode: ppm.mode,
    placementNy,
    yBottomPct: depth ? depth.yBottomPct : PHYSICAL_PLACEMENT.middle.yBottomPct,
    visualForm: asText(input.visualForm) || stageDims.visualForm || null,
    growthStage: stageDims.growthStage,
    mangoHardCoded: false,
    usedInventedMeters: false,
    accuracy: PHYSICAL_SCALE_ACCURACY,
    note: `${label}. Visualization estimate, not an exact mature size and not a survey.`
  };
}

export const PHYSICAL_SCALE_PERSISTENCE_PROPOSAL = Object.freeze({
  applyMigrationNow: false,
  note: 'Schema proposal only. Photo scale belongs to a specific Garden source photo / design canvas, not each plant, not each placement, and not the whole account. Session-only until a later migration is approved.',
  tables: Object.freeze([
    Object.freeze({
      table: 'garden_designs',
      columns: Object.freeze([
        'photo_scale_state',
        'photo_scale_calibration',
        'calibration_dismissed_for_now'
      ]),
      type: 'jsonb-or-text',
      optionalInterim: 'garden_designs.metadata.photo_scale',
      keyedBy: 'source_media_id',
      note: 'NOT_CALIBRATED | CALIBRATED plus optional two-point references. Reused for all placements on this photo. Not applied in this task.'
    }),
    Object.freeze({
      table: 'garden_design_placements',
      columns: Object.freeze(['user_scale_override']),
      note: 'Do not store photo calibration on placements. Keep user_scale_override separate from botanical source truth. Not applied in this task.'
    })
  ])
});

export function buildPhysicalScaleFoundationReport(jobs = [], options = {}) {
  const plantsBySlug = options.plantsBySlug || {};
  const libraryCopyBySlug = options.libraryCopyBySlug || {};
  const assets = (Array.isArray(jobs) ? jobs : []).map((job) => {
    const plant = plantsBySlug[job.canonicalSlug] || {};
    const catalog = classifyCatalogDimensionEvidence(plant, {
      visualForm: job.visualForm,
      growthStage: job.growthStage,
      librarySizeCopy: (libraryCopyBySlug[job.canonicalSlug] || {}).size
    });
    const stage = resolveGrowthStageDimensions({
      growthStage: job.growthStage,
      visualForm: job.visualForm,
      catalogEvidence: catalog
    });
    return {
      canonicalSlug: job.canonicalSlug,
      visualForm: job.visualForm || null,
      growthStage: job.growthStage || null,
      catalogEvidenceClass: catalog.evidenceClass,
      stageEvidenceClass: stage.evidenceClass,
      mayDrivePhysicalMeterPreview: stage.mayDrivePhysicalMeterPreview,
      mangoHardCoded: false,
      inventedBotanicalMeters: false
    };
  });
  return {
    contract: PHYSICAL_SCALE_MODEL_VERSION,
    currentScaleFailure:
      'Tree Scale V3 remains a percentage-of-canvas heuristic. Owner judged a mature mango at roughly ~2 m in the real Garden photo. That is not a physically meaningful Garden Design scale.',
    mangoHardCodedMultiplier: false,
    inventedBotanicalMeters: false,
    physicalPreviewRule:
      'Only SOURCE_SUPPORTED_RANGE or USER_CONFIRMED may drive a physically labelled meter preview. UNKNOWN must not pretend to know meters. HEURISTIC_RANGE is recorded but not labelled as meters.',
    dimensionEvidenceStates: Object.values(DIMENSION_EVIDENCE),
    physicalPreviewDriveClasses: PHYSICAL_PREVIEW_DRIVE_CLASSES.slice(),
    photoScaleProductContract: PHOTO_SCALE_PRODUCT_CONTRACT,
    photoCalibrationOptional: true,
    gardenDesignBlockedWithoutCalibration: false,
    perspective: {
      nearReference: true,
      farReference: true,
      interpolationByPlacementY: true,
      surveyingAccuracy: false
    },
    growthStageRule: 'Do not derive young size as a fixed percentage of mature size without evidence.',
    assets,
    persistenceProposal: PHYSICAL_SCALE_PERSISTENCE_PROPOSAL,
    spend: { openaiCalls: 0, imageGeneration: 0, additionalSpendUsd: 0 },
    productionRegistryChanged: false,
    regenerate: false
  };
}
