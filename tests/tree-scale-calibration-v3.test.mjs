/**
 * Tree scale calibration V3. Zero spend. No generation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { computeSceneVisualScale } from '../modules/garden-design/asset-factory-v1/composition-calibration-v2.js';
import {
  TREE_SCALE_MODEL_VERSION,
  TREE_SCENE_DEPTHS,
  computeTreeSceneScaleV3,
  evaluateMatureTreeAntiMiniatureInvariant,
  compareMangoV2VsV3,
  recommendCompositionV3Class
} from '../modules/garden-design/asset-factory-v1/composition-calibration-v3.js';
import { recommendCompositionV2Class } from '../modules/garden-design/asset-factory-v1/composition-calibration-v2.js';
import { isUsableDesignVariant } from '../modules/garden-design/garden-design-asset-registry-v1.js';

const MANGO_BBOX = { exists: true, minX: 33, minY: 148, maxX: 1008, maxY: 1422 };

test('trees do not share the V2 shrub/rosette/herb depth curve', () => {
  const v2Far = computeSceneVisualScale({ visualForm: 'tree', depthId: 'far', ownerScale: 1 });
  const v3Far = computeTreeSceneScaleV3({
    visualForm: 'tree',
    growthStage: 'mature',
    depthId: 'far',
    bbox: MANGO_BBOX,
    canvasHeight: 1536
  });
  assert.equal(v3Far.model, TREE_SCALE_MODEL_VERSION);
  assert.equal(v3Far.usesSharedShrubScaleCurve, false);
  assert.equal(v3Far.usedInventedMeters, false);
  assert.equal(v3Far.usedPngPixelHeightAsBotanicalSize, false);
  assert.ok(v3Far.visibleHeightPct > v2Far.heightPct);
  assert.ok(TREE_SCENE_DEPTHS.far.depthFactor > 0.58);
  assert.ok(TREE_SCENE_DEPTHS.middle.depthFactor > 0.76);
});

test('mature tree anti-miniature invariant dominates shrub/rosette/clump at every depth', () => {
  const result = evaluateMatureTreeAntiMiniatureInvariant({ bbox: MANGO_BBOX });
  assert.equal(result.result, 'TREE_SCALE_V3_ANTI_MINIATURE_PASS');
  assert.equal(result.regeneratedMango, false);
  assert.equal(result.usedInventedMeters, false);
  for (const row of result.rows) {
    assert.equal(row.dominatesShrub, true, row.depthId);
    assert.equal(row.dominatesRosette, true, row.depthId);
    assert.equal(row.dominatesClump, true, row.depthId);
    assert.equal(row.largerThanV2, true, row.depthId);
  }
  assert.equal(result.notMiniatureFar, true);
});

test('mango V3 is RUNTIME_SCALE_SOLVABLE and does not regenerate or approve', () => {
  const v3 = recommendCompositionV3Class('mango');
  const v2 = recommendCompositionV2Class('mango');
  assert.equal(v3.class, 'RUNTIME_SCALE_SOLVABLE');
  assert.equal(v2.class, 'REGEN_REQUIRED');
  assert.equal(
    isUsableDesignVariant({
      approvalStatus: 'candidate',
      file: 'batch-1-candidates/calibration-batch-1/mango-mature-vegetative-v1.png'
    }),
    false
  );
  const pair = compareMangoV2VsV3({ bbox: MANGO_BBOX });
  assert.equal(pair.length, 3);
  assert.ok(pair.every((row) => row.v3.visibleHeightPct > row.v2.heightPct));
});

test('transparent PNG margin is compensated so canvas pixels are not botanical size', () => {
  const v3 = computeTreeSceneScaleV3({
    visualForm: 'tree',
    growthStage: 'mature',
    depthId: 'middle',
    bbox: MANGO_BBOX,
    canvasWidth: 1024,
    canvasHeight: 1536
  });
  assert.ok(v3.bboxFillRatio < 1);
  assert.ok(v3.imgHeightPct > v3.visibleHeightPct);
  assert.match(v3.note, /not the 1024/);
});
