/**
 * Garden composition calibration V2.
 * Separates (A) asset structural proportion, (B) scene scale/perspective,
 * (C) visual integration. Calibration-only. No generation. No spend.
 * PNG pixel size is never botanical size.
 */

export const SIZE_EVIDENCE_UNKNOWN = 'SIZE_EVIDENCE_UNKNOWN';
export const COMPOSITION_V2_CLASSES = Object.freeze(['RUNTIME_SOLVABLE', 'REGEN_REQUIRED']);
export const COMPOSITION_PROBLEMS = Object.freeze({
  A_ASSET_STRUCTURAL_PROPORTION: 'A_ASSET_STRUCTURAL_PROPORTION',
  B_SCENE_SCALE_PERSPECTIVE: 'B_SCENE_SCALE_PERSPECTIVE',
  C_VISUAL_INTEGRATION: 'C_VISUAL_INTEGRATION'
});

/** Relative visual-aid factors by declared form. Not meters. Not invented physical size. */
export const FORM_RELATIVE_SCALE = Object.freeze({
  tree: 1,
  palm: 0.92,
  'herbaceous-clump': 0.78,
  climber: 0.58,
  shrub: 0.42,
  subshrub: 0.36,
  rosette: 0.32,
  'succulent-form': 0.28
});

/** Near-camera tree fills most of a garden photo. Visual aid only. */
export const NEAR_TREE_BASE_HEIGHT_PCT = 82;

export const FIXED_SCALE_HEIGHT_PCT = Object.freeze({
  small: 34,
  medium: 54,
  large: 78
});

export const SCENE_DEPTHS = Object.freeze({
  near: Object.freeze({
    id: 'near',
    yBottomPct: 6,
    depthFactor: 1,
    shadowSoftness: 0.85,
    label: 'near-ground'
  }),
  middle: Object.freeze({
    id: 'middle',
    yBottomPct: 20,
    depthFactor: 0.76,
    shadowSoftness: 1.15,
    label: 'middle depth'
  }),
  far: Object.freeze({
    id: 'far',
    yBottomPct: 36,
    depthFactor: 0.58,
    shadowSoftness: 1.45,
    label: 'far depth'
  })
});

export const OWNER_SCALE_RANGE = Object.freeze({ min: 0.5, max: 1.6, default: 1 });

export const LOCAL_SCENE_MATCH_BOUNDS = Object.freeze({
  brightness: Object.freeze({ min: 0.88, max: 1.08 }),
  contrast: Object.freeze({ min: 0.88, max: 1.06 }),
  saturate: Object.freeze({ min: 0.82, max: 1.05 }),
  blurPx: Object.freeze({ min: 0.2, max: 0.7 }),
  opacity: Object.freeze({ min: 0.94, max: 1 }),
  hueRotateDeg: Object.freeze({ min: 0, max: 0 })
});

export const RUNTIME_BLEND_V2 = Object.freeze({
  version: 'blend-v2',
  implementedPermanently: false,
  altersGardenPhoto: false,
  usesAiOrInpainting: false,
  bakesIntoPng: false,
  canAddress: Object.freeze([
    'STICKER_LOOK',
    'SHARPNESS_MATCH',
    'COLOR_TONAL_MATCH',
    'GROUND_CONTACT',
    'HALO',
    'SCENE_SCALE'
  ]),
  cannotAddress: Object.freeze([
    'PERSPECTIVE_INHERENT_IN_ASSET',
    'SILHOUETTE',
    'CROWN_TRUNK_RATIO',
    'BOTANICAL_ARCHITECTURE'
  ]),
  localSceneMatching: true,
  hueRotateAllowed: false,
  contactShadow: Object.freeze({
    type: 'ground-ellipse',
    tiedToGroundAnchor: true,
    notGenericSilhouetteDropShadow: true
  }),
  defaults: Object.freeze({
    brightness: 0.94,
    contrast: 0.92,
    saturate: 0.9,
    blurPx: 0.4,
    opacity: 0.98,
    hueRotateDeg: 0
  }),
  bounds: LOCAL_SCENE_MATCH_BOUNDS
});

export const CALIBRATION_V2_RECOMMENDATIONS = Object.freeze({
  mango: Object.freeze({
    class: 'REGEN_REQUIRED',
    problem: 'A_ASSET_STRUCTURAL_PROPORTION',
    note: 'Tree crown/trunk architecture and inherent perspective are not runtime-solvable. Scene scale experiment can only address B.'
  }),
  'areca-palm': Object.freeze({
    class: 'REGEN_REQUIRED',
    problem: 'A_ASSET_STRUCTURAL_PROPORTION',
    note: 'Palm vertical architecture and specimen form are not runtime-solvable.'
  }),
  banana: Object.freeze({
    class: 'REGEN_REQUIRED',
    problem: 'A_ASSET_STRUCTURAL_PROPORTION',
    note: 'Large herbaceous-clump architecture is treated like a tree-scale specimen; runtime cannot repair silhouette.'
  }),
  lavender: Object.freeze({
    class: 'RUNTIME_SOLVABLE',
    problem: 'C_VISUAL_INTEGRATION',
    note: 'Remaining issues treated as sticker look, minor tone/sharpness, ground contact, and scene scale.'
  }),
  pineapple: Object.freeze({
    class: 'RUNTIME_SOLVABLE',
    problem: 'C_VISUAL_INTEGRATION',
    note: 'Remaining issues treated as sticker look, minor tone/sharpness, ground contact, and scene scale.'
  }),
  bougainvillea: Object.freeze({
    class: 'RUNTIME_SOLVABLE',
    problem: 'B_SCENE_SCALE_PERSPECTIVE',
    note: 'Climber remaining issues treated as scene scale plus sticker/tone integration.'
  }),
  'aloe-vera': Object.freeze({
    class: 'RUNTIME_SOLVABLE',
    problem: 'C_VISUAL_INTEGRATION',
    note: 'Remaining issues treated as sticker look, minor tone/sharpness, ground contact, and scene scale.'
  }),
  eggplant: Object.freeze({
    class: 'RUNTIME_SOLVABLE',
    problem: 'C_VISUAL_INTEGRATION',
    note: 'Remaining issues treated as sticker look, minor tone/sharpness, ground contact, and scene scale.'
  })
});

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

function spacingOf(plant = {}) {
  const garden = plant.gardenCompatibility && typeof plant.gardenCompatibility === 'object'
    ? plant.gardenCompatibility
    : {};
  return garden.spacing && typeof garden.spacing === 'object' ? garden.spacing : {};
}

function evidenceClassForSize(plant = {}) {
  const traits = plant.climateTraits && typeof plant.climateTraits === 'object' ? plant.climateTraits : {};
  const classes = traits.traitEvidenceClasses && typeof traits.traitEvidenceClasses === 'object'
    ? traits.traitEvidenceClasses
    : {};
  return asText(classes.matureHeightM || classes.matureSpreadM || classes.matureSize || classes.size);
}

function hasPacketSourceSupport(plant = {}) {
  const source = plant.source && typeof plant.source === 'object' ? plant.source : {};
  const provenance = Array.isArray(source.provenance) ? source.provenance : [];
  const supportsSize = provenance.some((row) => {
    const fields = Array.isArray(row && row.supportsFields) ? row.supportsFields : [];
    return fields.some((field) => /matureSize|matureHeight|matureSpread|spacing/i.test(String(field || '')));
  });
  const sourceIds = provenance.some((row) => asText(row && row.sourceId));
  return source.provider === 'catalog-expansion-v1' && sourceIds && supportsSize;
}

export function extractPlantLibraryCopy(appHtml, slug) {
  const needle = `{slug:'${slug}'`;
  const html = String(appHtml || '');
  const start = html.indexOf(needle);
  if (start < 0) return { size: '', growth: '' };
  const end = html.indexOf('\n', start);
  const line = end > start ? html.slice(start, end) : html.slice(start, start + 8000);
  const size = ((line.match(/,size:'((?:\\'|[^'])*)'/) || [])[1] || '').replace(/\\'/g, "'");
  const growth = ((line.match(/,growth:'((?:\\'|[^'])*)'/) || [])[1] || '').replace(/\\'/g, "'");
  return { size, growth };
}

export function auditBotanicalSizeEvidence(plant = {}, libraryCopy = {}) {
  const spacing = spacingOf(plant);
  const height = finitePositive(spacing.matureHeightM ?? plant.matureHeightM);
  const spread = finitePositive(spacing.matureSpreadM ?? plant.matureSpreadM);
  const sizeClass = evidenceClassForSize(plant);
  const growthForm = asText(
    plant.growthForm || plant.growthHabit || plant.habit || libraryCopy.growth || plant.care?.growth
  );
  const growthStage = asText(plant.growthStage);
  const qualitative = asText(spacing.matureSize);
  const unprovenanced = asText(libraryCopy.size || plant.care?.size || plant.size);

  if (height && spread && sizeClass === 'SOURCE_SUPPORTED') {
    return {
      status: 'SOURCE_SUPPORTED',
      matureHeightM: height,
      matureSpreadM: spread,
      growthForm: growthForm || null,
      growthStage: growthStage || null,
      qualitativeText: qualitative || null,
      sourcePath: 'gardenCompatibility.spacing.matureHeightM/matureSpreadM',
      usedForPhysicalScale: true
    };
  }

  if (qualitative && hasPacketSourceSupport(plant)) {
    return {
      status: 'SOURCE_SUPPORTED_QUALITATIVE',
      matureHeightM: SIZE_EVIDENCE_UNKNOWN,
      matureSpreadM: SIZE_EVIDENCE_UNKNOWN,
      growthForm: growthForm || null,
      growthStage: growthStage || null,
      qualitativeText: qualitative,
      sourcePath: 'gardenCompatibility.spacing.matureSize',
      usedForPhysicalScale: false,
      note: 'Qualitative source-supported size copy only. No numeric meters assigned.'
    };
  }

  return {
    status: SIZE_EVIDENCE_UNKNOWN,
    matureHeightM: SIZE_EVIDENCE_UNKNOWN,
    matureSpreadM: SIZE_EVIDENCE_UNKNOWN,
    growthForm: growthForm || null,
    growthStage: growthStage || null,
    qualitativeText: qualitative || null,
    unprovenancedCatalogCopy: unprovenanced || null,
    sourcePath: null,
    usedForPhysicalScale: false,
    note: 'No source-supported mature height/spread. Do not invent 2m / 5m / 10m. Scene scale uses visualForm relative factor only.'
  };
}

export function groundAnchorFromBbox(bbox = {}, canvas = {}) {
  const width = finitePositive(canvas.width) || 1024;
  const height = finitePositive(canvas.height) || 1536;
  if (!bbox || bbox.exists === false) {
    return { nx: 0.5, ny: 0.92, source: 'fallback-not-measured' };
  }
  const minX = Number(bbox.minX);
  const maxX = Number(bbox.maxX);
  const maxY = Number(bbox.maxY);
  if (![minX, maxX, maxY].every(Number.isFinite)) {
    return { nx: 0.5, ny: 0.92, source: 'fallback-not-measured' };
  }
  return {
    nx: clamp((minX + maxX) / 2 / width, 0, 1),
    ny: clamp(maxY / height, 0, 1),
    source: 'alpha-bbox-base-center'
  };
}

export function buildDesignAssetScaleContract(job = {}, sizeEvidence = null) {
  const metrics = (job.technicalQa && job.technicalQa.metrics) || {};
  const bbox = metrics.bbox || job.intrinsicBoundingBox || {};
  const width = finitePositive(metrics.width) || finitePositive(job.canvasWidth) || 1024;
  const height = finitePositive(metrics.height) || finitePositive(job.canvasHeight) || 1536;
  const evidence = sizeEvidence || {
    status: SIZE_EVIDENCE_UNKNOWN,
    matureHeightM: SIZE_EVIDENCE_UNKNOWN,
    matureSpreadM: SIZE_EVIDENCE_UNKNOWN,
    usedForPhysicalScale: false
  };
  return {
    canonicalSlug: job.canonicalSlug || null,
    visualForm: job.visualForm || null,
    nominalGrowthStage: job.growthStage || null,
    canvasWidth: width,
    canvasHeight: height,
    intrinsicBoundingBox: bbox.exists
      ? {
          minX: bbox.minX,
          minY: bbox.minY,
          maxX: bbox.maxX,
          maxY: bbox.maxY,
          opaque: bbox.opaque
        }
      : null,
    groundAnchor: groundAnchorFromBbox(bbox, { width, height }),
    sizeEvidence: evidence,
    pngDimensionsAreBotanicalSize: false,
    note: `${width}×${height} is the cutout canvas, not physical plant height or spread.`
  };
}

export function computeSceneVisualScale(input = {}) {
  const form = asText(input.visualForm) || 'unknown';
  const formFactor = FORM_RELATIVE_SCALE[form];
  const depth = SCENE_DEPTHS[input.depthId] || SCENE_DEPTHS.middle;
  const ownerScale = clamp(input.ownerScale, OWNER_SCALE_RANGE.min, OWNER_SCALE_RANGE.max);
  const evidenceStatus = (input.sizeEvidence && input.sizeEvidence.status) || SIZE_EVIDENCE_UNKNOWN;
  const heightPct = clamp(
    NEAR_TREE_BASE_HEIGHT_PCT * (formFactor || 0.4) * depth.depthFactor * ownerScale,
    18,
    92
  );
  return {
    visualForm: form,
    depthId: depth.id,
    yBottomPct: depth.yBottomPct,
    formFactor: formFactor || 0.4,
    depthFactor: depth.depthFactor,
    ownerScale,
    heightPct,
    sizeEvidenceStatus: evidenceStatus,
    usedInventedMeters: false,
    usedPngPixelHeightAsBotanicalSize: false,
    accuracy: 'visual-aid-not-centimeter',
    note: 'Single-photo visual aid. Not a camera-calibrated physical measurement. Owner may still resize manually.'
  };
}

export function evaluateTreeScaleModel(options = {}) {
  const mangoForm = options.mangoVisualForm || 'tree';
  const shrubForm = options.shrubVisualForm || 'shrub';
  const mangoNear = computeSceneVisualScale({ visualForm: mangoForm, depthId: 'near', ownerScale: 1 });
  const mangoMiddle = computeSceneVisualScale({ visualForm: mangoForm, depthId: 'middle', ownerScale: 1 });
  const mangoFar = computeSceneVisualScale({ visualForm: mangoForm, depthId: 'far', ownerScale: 1 });
  const shrubFar = computeSceneVisualScale({ visualForm: shrubForm, depthId: 'far', ownerScale: 1 });
  const fixedFarAsSmall = FIXED_SCALE_HEIGHT_PCT.small;
  const farVsNear = mangoFar.heightPct / mangoNear.heightPct;
  const notMiniaturized = farVsNear >= 0.55;
  const largerThanFixedSmall = mangoFar.heightPct > fixedFarAsSmall;
  const largerThanShrubAtSameDepth = mangoFar.heightPct >= shrubFar.heightPct * 1.35;
  const sameCanvasDoesNotImplySameSize = mangoNear.heightPct > shrubFar.heightPct;
  const pass =
    notMiniaturized &&
    largerThanFixedSmall &&
    largerThanShrubAtSameDepth &&
    sameCanvasDoesNotImplySameSize &&
    mangoNear.yBottomPct < mangoMiddle.yBottomPct &&
    mangoMiddle.yBottomPct < mangoFar.yBottomPct;
  return {
    result: pass ? 'TREE_SCALE_MODEL_PASS' : 'TREE_SCALE_MODEL_FAIL',
    mangoNear,
    mangoMiddle,
    mangoFar,
    shrubFar,
    farVsNear,
    fixedSmallHeightPct: fixedFarAsSmall,
    regeneratedMango: false,
    centimeterAccuracy: false
  };
}

export function recommendCompositionV2Class(slug) {
  return CALIBRATION_V2_RECOMMENDATIONS[slug] || {
    class: 'REGEN_REQUIRED',
    problem: 'A_ASSET_STRUCTURAL_PROPORTION',
    note: 'No V2 recommendation row; default to REGEN_REQUIRED. Not an approval.'
  };
}

export function clampAdaptation(values = {}) {
  const bounds = LOCAL_SCENE_MATCH_BOUNDS;
  return {
    brightness: clamp(values.brightness, bounds.brightness.min, bounds.brightness.max),
    contrast: clamp(values.contrast, bounds.contrast.min, bounds.contrast.max),
    saturate: clamp(values.saturate, bounds.saturate.min, bounds.saturate.max),
    blurPx: clamp(values.blurPx, bounds.blurPx.min, bounds.blurPx.max),
    opacity: clamp(values.opacity, bounds.opacity.min, bounds.opacity.max),
    hueRotateDeg: 0
  };
}

export function adaptFromLocalScene(sample = {}) {
  if (!sample || sample.available !== true) {
    return {
      ...RUNTIME_BLEND_V2.defaults,
      source: sample && sample.reason ? sample.reason : 'LOCAL_SCENE_SAMPLE_UNAVAILABLE',
      bounds: LOCAL_SCENE_MATCH_BOUNDS
    };
  }
  const luma = clamp(sample.luminance, 0, 1);
  const contrast = clamp(sample.contrast, 0, 1);
  const sat = clamp(sample.saturation, 0, 1);
  return {
    ...clampAdaptation({
      brightness: 1 + (luma - 0.48) * 0.22,
      contrast: 1 + (contrast - 0.18) * 0.35,
      saturate: 1 + (sat - 0.22) * 0.28,
      blurPx: 0.35 + (1 - contrast) * 0.2,
      opacity: 0.97 + (1 - luma) * 0.02
    }),
    source: 'local-scene-sample',
    bounds: LOCAL_SCENE_MATCH_BOUNDS
  };
}

export function contactShadowForScale(input = {}) {
  const heightPct = clamp(input.heightPct, 18, 92);
  const depth = SCENE_DEPTHS[input.depthId] || SCENE_DEPTHS.middle;
  const scale = heightPct / NEAR_TREE_BASE_HEIGHT_PCT;
  return {
    type: 'ground-ellipse',
    opacity: clamp(0.26 * scale * (1.35 - depth.depthFactor * 0.25), 0.12, 0.32),
    blurPx: clamp(7 * depth.shadowSoftness * Math.max(scale, 0.45), 6, 18),
    widthPct: 55,
    heightPx: clamp(7 * scale, 4, 12),
    origin: 'groundAnchor'
  };
}

export function blendV2FilterCss(adaptation = RUNTIME_BLEND_V2.defaults) {
  const a = clampAdaptation(adaptation);
  return `brightness(${a.brightness}) contrast(${a.contrast}) saturate(${a.saturate}) blur(${a.blurPx}px)`;
}

export function sampleLocalSceneFromRgba(rgba, width, height, region = {}) {
  if (!rgba || !width || !height) {
    return { available: false, reason: 'LOCAL_SCENE_SAMPLE_UNAVAILABLE' };
  }
  const x0 = clamp(Math.floor(region.x || 0), 0, width - 1);
  const y0 = clamp(Math.floor(region.y || 0), 0, height - 1);
  const rw = clamp(Math.floor(region.width || 48), 1, width - x0);
  const rh = clamp(Math.floor(region.height || 28), 1, height - y0);
  let sumY = 0;
  let sumSat = 0;
  let count = 0;
  const lumas = [];
  for (let y = y0; y < y0 + rh; y += 1) {
    for (let x = x0; x < x0 + rw; x += 1) {
      const i = (y * width + x) * 4;
      const r = rgba[i] / 255;
      const g = rgba[i + 1] / 255;
      const b = rgba[i + 2] / 255;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max > 0 ? (max - min) / max : 0;
      sumY += luma;
      sumSat += sat;
      lumas.push(luma);
      count += 1;
    }
  }
  if (!count) return { available: false, reason: 'LOCAL_SCENE_SAMPLE_UNAVAILABLE' };
  const mean = sumY / count;
  const variance = lumas.reduce((acc, y) => acc + (y - mean) ** 2, 0) / count;
  return {
    available: true,
    luminance: mean,
    contrast: Math.sqrt(variance),
    saturation: sumSat / count,
    sampleWidth: rw,
    sampleHeight: rh
  };
}

export function treePromptV2Lines() {
  return [
    'Tree form: naturally grown garden specimen, not a nursery catalog isolate.',
    'Irregular asymmetrical branching. Realistic trunk taper. Crown width appropriate to mature form.',
    'Avoid perfect stock-photo symmetry and isolated catalog specimen aesthetic.',
    'Planted-bed eye-level camera. Natural three-quarter garden perspective.',
    'Realistic crown-to-trunk ratio. Full specimen with useful transparent margin.'
  ];
}

export function buildCompositionV2Report(jobs = [], options = {}) {
  const plantsBySlug = options.plantsBySlug || {};
  const libraryCopyBySlug = options.libraryCopyBySlug || {};
  const treeScale = evaluateTreeScaleModel();
  const assets = (Array.isArray(jobs) ? jobs : []).map((job) => {
    const slug = job.canonicalSlug;
    const plant = plantsBySlug[slug] || {};
    const sizeEvidence = auditBotanicalSizeEvidence(plant, libraryCopyBySlug[slug] || {});
    const contract = buildDesignAssetScaleContract(job, sizeEvidence);
    const recommendation = recommendCompositionV2Class(slug);
    return {
      canonicalSlug: slug,
      visualForm: job.visualForm || null,
      problems: {
        A_ASSET_STRUCTURAL_PROPORTION: recommendation.problem === 'A_ASSET_STRUCTURAL_PROPORTION',
        B_SCENE_SCALE_PERSPECTIVE: true,
        C_VISUAL_INTEGRATION: true
      },
      sizeEvidence,
      scaleContract: contract,
      recommendedClass: recommendation.class,
      recommendedNote: recommendation.note,
      approvalStatus: 'candidate',
      autoApproved: false
    };
  });
  return {
    contract: 'garden-composition-calibration-v2',
    spend: { openaiCalls: 0, imageGeneration: 0, additionalSpendUsd: 0 },
    approvedAssets: 0,
    productionRegistryChanged: false,
    regenerate: false,
    treeScale,
    blendV2: {
      version: RUNTIME_BLEND_V2.version,
      bounds: LOCAL_SCENE_MATCH_BOUNDS,
      altersGardenPhoto: false,
      bakesIntoPng: false,
      usesAiOrInpainting: false
    },
    assets
  };
}
