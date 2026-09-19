/**
 * Garden Design physical-scale foundation V1.
 * Generic across visualForm. No species hard-coding. No invented meters.
 * Photo calibration + botanical evidence + depth → suggested render size.
 * Estimate only. Not a survey. No generation. No spend.
 */

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
export const USER_CONFIRMED_SIZE_STORAGE_KEY = 'cruvit:physical-scale-user-confirmed-v1';
export const USER_SCALE_OVERRIDE_STORAGE_KEY = 'cruvit:physical-scale-user-override-v1';

export const PHYSICAL_SCALE_ACCURACY = 'garden-visualization-estimate-not-survey';

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

export function mayDrivePhysicalMeterPreview(evidenceClass) {
  return PHYSICAL_PREVIEW_DRIVE_CLASSES.includes(evidenceClass);
}

export function emptyPhotoScaleCalibration() {
  return {
    contract: 'garden-photo-scale-calibration-v1',
    model: PHYSICAL_SCALE_MODEL_VERSION,
    references: [],
    captureWidthPx: null,
    captureHeightPx: null,
    pixelsPerMeterNear: null,
    pixelsPerMeterFar: null,
    accuracy: PHYSICAL_SCALE_ACCURACY,
    surveyingAccuracy: false
  };
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
  const catalog = input.catalogEvidence && input.catalogEvidence.growthStage === stage ? input.catalogEvidence : null;
  const user = input.userConfirmed && input.userConfirmed.growthStage === stage ? input.userConfirmed : null;
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

export function suggestedHeightMFromRange(range) {
  if (!range || !finitePositive(range.min) || !finitePositive(range.max)) return null;
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
  const override = input.userOverride && typeof input.userOverride === 'object' ? input.userOverride : { kind: 'none' };
  let displayHeightM = null;
  let label = 'Suggested mature size';
  let displaySource = 'none';
  if (stageDims.mayDrivePhysicalMeterPreview) {
    displayHeightM = suggestedHeightMFromRange(stageDims.heightM);
    displaySource = 'suggested-from-evidence';
    label = stageDims.growthStage === 'young' ? 'Suggested young size' : 'Suggested mature size';
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
  const reasons = [];
  if (!displayHeightM) reasons.push('BOTANICAL_METERS_UNKNOWN');
  if (!ppm.pixelsPerMeter) reasons.push('PHOTO_SCALE_UNCALIBRATED');
  if (reasons.length) {
    return {
      status: 'PHYSICAL_SCALE_BLOCKED',
      model: PHYSICAL_SCALE_MODEL_VERSION,
      reasons,
      label: 'Physical size unavailable',
      botanicalEvidenceClass: stageDims.evidenceClass,
      photoScaleMode: ppm.mode,
      displayHeightM: null,
      exact: false,
      mangoHardCoded: false,
      usedInventedMeters: false,
      accuracy: PHYSICAL_SCALE_ACCURACY,
      note: reasons.includes('BOTANICAL_METERS_UNKNOWN')
        ? 'UNKNOWN botanical meters. Do not pretend to know plant height. Enter USER_CONFIRMED range or a manual override in meters.'
        : 'Photo has no known reference dimension yet.'
    };
  }
  const visibleHeightPx = displayHeightM * ppm.pixelsPerMeter;
  const imgHeightPx = visibleHeightPx / fill;
  return {
    status: 'PHYSICAL_SCALE_READY',
    model: PHYSICAL_SCALE_MODEL_VERSION,
    reasons: [],
    label,
    exact: false,
    displaySource,
    botanicalEvidenceClass: stageDims.evidenceClass,
    suggestedHeightM: suggestedHeightMFromRange(stageDims.heightM),
    displayHeightM,
    heightRangeM: stageDims.heightM,
    visibleHeightPx,
    imgHeightPx,
    imgHeightPct: (imgHeightPx / sceneHeightPx) * 100,
    visibleHeightPct: (visibleHeightPx / sceneHeightPx) * 100,
    bboxFillRatio: fill,
    pixelsPerMeter: ppm.pixelsPerMeter,
    photoScaleMode: ppm.mode,
    placementNy,
    yBottomPct: depth ? depth.yBottomPct : PHYSICAL_PLACEMENT.middle.yBottomPct,
    visualForm: asText(input.visualForm) || stageDims.visualForm || null,
    growthStage: stageDims.growthStage,
    mangoHardCoded: false,
    usedInventedMeters: false,
    userOverrideSeparateFromBotanicalTruth: displaySource === 'USER_OVERRIDE',
    accuracy: PHYSICAL_SCALE_ACCURACY,
    note: `${label}. Visualization estimate, not an exact mature size and not a survey.`
  };
}

export const PHYSICAL_SCALE_PERSISTENCE_PROPOSAL = Object.freeze({
  applyMigrationNow: false,
  note: 'Schema proposal only. Existing garden_design_placements.growth_stage and scale stay. Do not overload scale as botanical truth. garden_designs.metadata may hold a session-shaped photo_scale_calibration without a new column, or add an explicit jsonb later.',
  tables: Object.freeze([
    Object.freeze({
      table: 'garden_designs',
      column: 'photo_scale_calibration',
      type: 'jsonb',
      optionalInterim: 'garden_designs.metadata.photo_scale_calibration',
      note: 'Known reference dimensions on the saved Garden photo: points, knownMeters, near/far band. Not applied in this task.'
    }),
    Object.freeze({
      table: 'garden_design_placements',
      columns: Object.freeze([
        'growth_stage',
        'botanical_target_height_m_min',
        'botanical_target_height_m_max',
        'botanical_height_evidence_class',
        'suggested_scale',
        'user_scale_override'
      ]),
      note: 'Keep user_scale_override separate from botanical source truth. growth_stage already exists. Not applied in this task.'
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
    photoCalibration: emptyPhotoScaleCalibration(),
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
