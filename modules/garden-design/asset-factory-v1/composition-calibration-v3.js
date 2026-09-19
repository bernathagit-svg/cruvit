/**
 * Tree scale calibration V3.
 * Trees do not share the V2 shrub/rosette/herb scene-scale curve.
 * Visual aid only. No meters invented. No generation. No spend.
 */
import {
  SIZE_EVIDENCE_UNKNOWN,
  FORM_RELATIVE_SCALE,
  FIXED_SCALE_HEIGHT_PCT,
  computeSceneVisualScale,
  groundAnchorFromBbox
} from './composition-calibration-v2.js';

export const TREE_SCALE_MODEL_VERSION = 'tree-scale-v3';
export const TREE_SCALE_MULTIPLIER_RANGE = Object.freeze({ min: 0.8, max: 1.7, step: 0.02, proposedDefault: 1 });
export const TREE_SCALE_MULTIPLIER_STORAGE_KEY = 'cruvit:calibration-batch-1-tree-scale-multiplier';

/** Separate depth falloff for trees. Less aggressive than V2 1.00 / 0.76 / 0.58. */
export const TREE_SCENE_DEPTHS = Object.freeze({
  near: Object.freeze({
    id: 'near',
    yBottomPct: 3,
    depthFactor: 1,
    shadowSoftness: 0.8,
    label: 'near-ground'
  }),
  middle: Object.freeze({
    id: 'middle',
    yBottomPct: 12,
    depthFactor: 0.88,
    shadowSoftness: 1.05,
    label: 'middle depth'
  }),
  far: Object.freeze({
    id: 'far',
    yBottomPct: 24,
    depthFactor: 0.74,
    shadowSoftness: 1.28,
    label: 'far depth'
  })
});

/** Target visible specimen height as % of the scene, after bbox compensation. Not meters. */
export const TREE_VISIBLE_HEIGHT_PCT_BY_STAGE = Object.freeze({
  mature: Object.freeze({ near: 92, middle: 80, far: 66 }),
  young: Object.freeze({ near: 70, middle: 58, far: 46 })
});

export const COMPOSITION_V3_CLASSES = Object.freeze([
  'RUNTIME_SCALE_SOLVABLE',
  'RUNTIME_SOLVABLE',
  'REGEN_REQUIRED'
]);

export const CALIBRATION_V3_RECOMMENDATIONS = Object.freeze({
  mango: Object.freeze({
    class: 'RUNTIME_SCALE_SOLVABLE',
    problem: 'B_SCENE_SCALE_PERSPECTIVE',
    note: 'Owner: Blend V2 improved integration. Remaining dominant issue is miniature scene scale, not a regeneration of the binary. Not an approval.'
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

function bboxFillRatio(bbox = {}, canvasHeight = 1536) {
  const minY = Number(bbox.minY);
  const maxY = Number(bbox.maxY);
  const height = Number(canvasHeight) || 1536;
  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY <= minY || height <= 0) return 1;
  return clamp((maxY - minY) / height, 0.35, 1);
}

export function parseTreeScaleMultiplier(value) {
  return clamp(value, TREE_SCALE_MULTIPLIER_RANGE.min, TREE_SCALE_MULTIPLIER_RANGE.max);
}

export function computeTreeSceneScaleV3(input = {}) {
  const form = asText(input.visualForm) || 'tree';
  const stage = asText(input.growthStage) === 'young' ? 'young' : 'mature';
  const depth = TREE_SCENE_DEPTHS[input.depthId] || TREE_SCENE_DEPTHS.middle;
  const ownerScale = clamp(input.ownerScale == null ? 1 : input.ownerScale, 0.5, 1.6);
  const multiplier = parseTreeScaleMultiplier(
    input.treeScaleMultiplier == null ? TREE_SCALE_MULTIPLIER_RANGE.proposedDefault : input.treeScaleMultiplier
  );
  const metrics = (input.technicalQa && input.technicalQa.metrics) || {};
  const bbox = input.bbox || metrics.bbox || {};
  const canvasHeight = Number(metrics.height || input.canvasHeight || 1536);
  const canvasWidth = Number(metrics.width || input.canvasWidth || 1024);
  const fill = bboxFillRatio(bbox, canvasHeight);
  const targets = TREE_VISIBLE_HEIGHT_PCT_BY_STAGE[stage];
  const targetVisiblePct = targets[depth.id] * ownerScale * multiplier;
  const imgHeightPct = clamp(targetVisiblePct / fill, 40, 125);
  const visibleHeightPct = imgHeightPct * fill;
  const anchor = input.groundAnchor || groundAnchorFromBbox(bbox, { width: canvasWidth, height: canvasHeight });
  return {
    model: TREE_SCALE_MODEL_VERSION,
    visualForm: form,
    growthStage: stage,
    depthId: depth.id,
    yBottomPct: depth.yBottomPct,
    depthFactor: depth.depthFactor,
    ownerScale,
    treeScaleMultiplier: multiplier,
    bboxFillRatio: fill,
    targetVisiblePct: clamp(targetVisiblePct, 28, 96),
    imgHeightPct,
    visibleHeightPct: clamp(visibleHeightPct, 28, 96),
    heightPct: clamp(visibleHeightPct, 28, 96),
    groundAnchor: anchor,
    sizeEvidenceStatus: (input.sizeEvidence && input.sizeEvidence.status) || SIZE_EVIDENCE_UNKNOWN,
    usedInventedMeters: false,
    usedPngPixelHeightAsBotanicalSize: false,
    usesSharedShrubScaleCurve: false,
    accuracy: 'visual-aid-not-centimeter',
    note: 'Tree-specific scene scale. Compensates transparent PNG margin so the visible specimen, not the 1024×1536 canvas, sets size. Not a physical meter claim.'
  };
}

export function evaluateMatureTreeAntiMiniatureInvariant(options = {}) {
  const multiplier = parseTreeScaleMultiplier(
    options.treeScaleMultiplier == null ? TREE_SCALE_MULTIPLIER_RANGE.proposedDefault : options.treeScaleMultiplier
  );
  const bbox = options.bbox || { exists: true, minX: 33, minY: 148, maxX: 1008, maxY: 1422 };
  const mango = {
    visualForm: 'tree',
    growthStage: 'mature',
    technicalQa: { metrics: { width: 1024, height: 1536, bbox } },
    treeScaleMultiplier: multiplier
  };
  const depths = ['near', 'middle', 'far'];
  const rows = depths.map((depthId) => {
    const tree = computeTreeSceneScaleV3({ ...mango, depthId });
    const shrub = computeSceneVisualScale({ visualForm: 'shrub', depthId, ownerScale: 1 });
    const rosette = computeSceneVisualScale({ visualForm: 'rosette', depthId, ownerScale: 1 });
    const clump = computeSceneVisualScale({ visualForm: 'herbaceous-clump', depthId, ownerScale: 1 });
    const v2Tree = computeSceneVisualScale({ visualForm: 'tree', depthId, ownerScale: 1 });
    return {
      depthId,
      treeVisiblePct: tree.visibleHeightPct,
      v2TreeHeightPct: v2Tree.heightPct,
      shrubHeightPct: shrub.heightPct,
      rosetteHeightPct: rosette.heightPct,
      clumpHeightPct: clump.heightPct,
      dominatesShrub: tree.visibleHeightPct >= shrub.heightPct * 2,
      dominatesRosette: tree.visibleHeightPct >= rosette.heightPct * 2.2,
      dominatesClump: tree.visibleHeightPct >= clump.heightPct * 1.35,
      largerThanV2: tree.visibleHeightPct > v2Tree.heightPct
    };
  });
  const pass = rows.every(
    (row) => row.dominatesShrub && row.dominatesRosette && row.dominatesClump && row.largerThanV2
  );
  const far = rows.find((row) => row.depthId === 'far');
  const near = rows.find((row) => row.depthId === 'near');
  return {
    result: pass ? 'TREE_SCALE_V3_ANTI_MINIATURE_PASS' : 'TREE_SCALE_V3_ANTI_MINIATURE_FAIL',
    model: TREE_SCALE_MODEL_VERSION,
    multiplier,
    farVsNear: far && near ? far.treeVisiblePct / near.treeVisiblePct : null,
    notMiniatureFar: far ? far.treeVisiblePct >= 58 : false,
    rows,
    usedInventedMeters: false,
    regeneratedMango: false,
    centimeterAccuracy: false
  };
}

export function compareMangoV2VsV3(options = {}) {
  const bbox = options.bbox || { exists: true, minX: 33, minY: 148, maxX: 1008, maxY: 1422 };
  const multiplier = parseTreeScaleMultiplier(
    options.treeScaleMultiplier == null ? TREE_SCALE_MULTIPLIER_RANGE.proposedDefault : options.treeScaleMultiplier
  );
  return ['near', 'middle', 'far'].map((depthId) => ({
    depthId,
    v2: computeSceneVisualScale({ visualForm: 'tree', depthId, ownerScale: 1 }),
    v3: computeTreeSceneScaleV3({
      visualForm: 'tree',
      growthStage: 'mature',
      depthId,
      treeScaleMultiplier: multiplier,
      technicalQa: { metrics: { width: 1024, height: 1536, bbox } }
    })
  }));
}

export function recommendCompositionV3Class(slug) {
  if (CALIBRATION_V3_RECOMMENDATIONS[slug]) return CALIBRATION_V3_RECOMMENDATIONS[slug];
  return null;
}

export function buildTreeScaleV3Report(options = {}) {
  const invariant = evaluateMatureTreeAntiMiniatureInvariant(options);
  const v2vsV3 = compareMangoV2VsV3(options);
  return {
    contract: 'tree-scale-calibration-v3',
    currentProblem:
      'V2 used the shared form×depth curve and sized the PNG canvas. Transparent margin made the visible mango read as a miniature tree.',
    model: TREE_SCALE_MODEL_VERSION,
    treeDepths: TREE_SCENE_DEPTHS,
    visibleTargets: TREE_VISIBLE_HEIGHT_PCT_BY_STAGE.mature,
    multiplierRange: TREE_SCALE_MULTIPLIER_RANGE,
    universalMultiplierLocked: false,
    formRelativeScale: {
      treeUsesSharedCurve: false,
      shrub: FORM_RELATIVE_SCALE.shrub,
      rosette: FORM_RELATIVE_SCALE.rosette,
      'herbaceous-clump': FORM_RELATIVE_SCALE['herbaceous-clump']
    },
    invariant,
    mangoV2VsV3: v2vsV3,
    mangoClass: CALIBRATION_V3_RECOMMENDATIONS.mango,
    spend: { openaiCalls: 0, imageGeneration: 0, additionalSpendUsd: 0 },
    approvedAssets: 0,
    productionRegistryChanged: false,
    regenerate: false,
    fixedSmallHeightPct: FIXED_SCALE_HEIGHT_PCT.small
  };
}
