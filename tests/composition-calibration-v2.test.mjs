/**
 * Garden composition calibration V2. Zero spend. No generation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SIZE_EVIDENCE_UNKNOWN,
  auditBotanicalSizeEvidence,
  buildDesignAssetScaleContract,
  computeSceneVisualScale,
  evaluateTreeScaleModel,
  extractPlantLibraryCopy,
  recommendCompositionV2Class,
  adaptFromLocalScene,
  LOCAL_SCENE_MATCH_BOUNDS,
  RUNTIME_BLEND_V2,
  FORM_RELATIVE_SCALE
} from '../modules/garden-design/asset-factory-v1/composition-calibration-v2.js';
import { applyCompositionV2Class } from '../modules/garden-design/asset-factory-v1/calibration-review-candidates-v1.js';
import {
  buildPromptRecordV2,
  PROMPT_FACTORY_V2_TREE_RULES_STATUS
} from '../modules/garden-design/asset-factory-v1/prompt-factory-v2.js';
import { isUsableDesignVariant } from '../modules/garden-design/garden-design-asset-registry-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('size metadata audit does not invent meters', () => {
  const appHtml = read('app.html');
  const mangoCopy = extractPlantLibraryCopy(appHtml, 'mango');
  const mango = auditBotanicalSizeEvidence({}, mangoCopy);
  assert.equal(mango.status, SIZE_EVIDENCE_UNKNOWN);
  assert.equal(mango.matureHeightM, SIZE_EVIDENCE_UNKNOWN);
  assert.equal(mango.matureSpreadM, SIZE_EVIDENCE_UNKNOWN);
  assert.equal(mango.usedForPhysicalScale, false);
  const numeric = auditBotanicalSizeEvidence({
    matureHeightM: 10,
    gardenCompatibility: { spacing: { matureHeightM: 10, matureSpreadM: 8 } },
    climateTraits: { traitEvidenceClasses: { matureHeightM: 'SOURCE_SUPPORTED' } }
  });
  assert.equal(numeric.status, 'SOURCE_SUPPORTED');
  assert.equal(numeric.matureHeightM, 10);
  const seedQualitative = auditBotanicalSizeEvidence({
    gardenCompatibility: { spacing: { matureSize: 'Rosette; ~1 m spread in ground or large pot' } },
    source: { provider: 'cruvit-seed-v1b' }
  });
  assert.equal(seedQualitative.status, SIZE_EVIDENCE_UNKNOWN);
  assert.equal(seedQualitative.matureHeightM, SIZE_EVIDENCE_UNKNOWN);
});

test('design asset scale contract does not treat PNG pixels as botanical size', () => {
  const contract = buildDesignAssetScaleContract({
    canonicalSlug: 'mango',
    visualForm: 'tree',
    growthStage: 'mature',
    technicalQa: {
      metrics: {
        width: 1024,
        height: 1536,
        bbox: { exists: true, minX: 33, minY: 148, maxX: 1008, maxY: 1422 }
      }
    }
  });
  assert.equal(contract.pngDimensionsAreBotanicalSize, false);
  assert.equal(contract.canvasWidth, 1024);
  assert.ok(contract.groundAnchor.ny > 0.8);
  assert.match(contract.note, /not physical plant height/);
});

test('scene scale model keeps far trees larger than fixed small and larger than far shrubs', () => {
  const treeFar = computeSceneVisualScale({ visualForm: 'tree', depthId: 'far', ownerScale: 1 });
  const shrubFar = computeSceneVisualScale({ visualForm: 'shrub', depthId: 'far', ownerScale: 1 });
  const treeNear = computeSceneVisualScale({ visualForm: 'tree', depthId: 'near', ownerScale: 1 });
  assert.equal(treeFar.usedInventedMeters, false);
  assert.equal(treeFar.usedPngPixelHeightAsBotanicalSize, false);
  assert.equal(treeFar.accuracy, 'visual-aid-not-centimeter');
  assert.ok(treeFar.heightPct > 34);
  assert.ok(treeFar.heightPct >= treeNear.heightPct * 0.55);
  assert.ok(treeFar.heightPct > shrubFar.heightPct);
  assert.equal(FORM_RELATIVE_SCALE.tree, 1);
  const result = evaluateTreeScaleModel();
  assert.equal(result.result, 'TREE_SCALE_MODEL_PASS');
  assert.equal(result.regeneratedMango, false);
  assert.equal(result.centimeterAccuracy, false);
});

test('Blend V2 local matching stays inside recorded bounds and never hue-rotates', () => {
  const dark = adaptFromLocalScene({ available: true, luminance: 0.2, contrast: 0.05, saturation: 0.05 });
  const bright = adaptFromLocalScene({ available: true, luminance: 0.9, contrast: 0.4, saturation: 0.6 });
  const missing = adaptFromLocalScene({ available: false, reason: 'LOCAL_SCENE_SAMPLE_UNAVAILABLE' });
  for (const row of [dark, bright, missing]) {
    assert.ok(row.brightness >= LOCAL_SCENE_MATCH_BOUNDS.brightness.min);
    assert.ok(row.brightness <= LOCAL_SCENE_MATCH_BOUNDS.brightness.max);
    assert.ok(row.saturate >= LOCAL_SCENE_MATCH_BOUNDS.saturate.min);
    assert.ok(row.saturate <= LOCAL_SCENE_MATCH_BOUNDS.saturate.max);
    assert.equal(row.hueRotateDeg, 0);
  }
  assert.equal(RUNTIME_BLEND_V2.altersGardenPhoto, false);
  assert.equal(RUNTIME_BLEND_V2.bakesIntoPng, false);
  assert.equal(RUNTIME_BLEND_V2.usesAiOrInpainting, false);
  assert.equal(RUNTIME_BLEND_V2.hueRotateAllowed, false);
});

test('composition V2 recommendations do not approve or consume production registry', () => {
  assert.equal(recommendCompositionV2Class('mango').class, 'REGEN_REQUIRED');
  assert.equal(recommendCompositionV2Class('lavender').class, 'RUNTIME_SOLVABLE');
  const next = applyCompositionV2Class({}, 'mango', 'REGEN_REQUIRED');
  assert.equal(next.mango.COMPOSITION_V2_CLASS, 'REGEN_REQUIRED');
  assert.equal(next.mango.approvalStatus, 'candidate');
  assert.equal(
    isUsableDesignVariant({
      approvalStatus: 'candidate',
      file: 'batch-1-candidates/calibration-batch-1/mango-mature-vegetative-v1.png'
    }),
    false
  );
});

test('Prompt Factory V2 tree rules are prepared and not executed', () => {
  const tree = buildPromptRecordV2({
    canonicalSlug: 'mango',
    scientific: 'Mangifera indica',
    visualForm: 'tree',
    growthStage: 'mature'
  });
  const shrub = buildPromptRecordV2({
    canonicalSlug: 'lavender',
    scientific: 'Lavandula angustifolia',
    visualForm: 'shrub',
    growthStage: 'mature'
  });
  assert.equal(tree.regenerate, false);
  assert.equal(PROMPT_FACTORY_V2_TREE_RULES_STATUS, 'PREPARED_NOT_EXECUTED');
  assert.match(tree.prompt, /naturally grown garden specimen/);
  assert.match(tree.prompt, /Irregular asymmetrical branching/);
  assert.match(tree.prompt, /Realistic trunk taper/);
  assert.match(tree.prompt, /three-quarter garden perspective/);
  assert.match(tree.prompt, /crown-to-trunk ratio/);
  assert.doesNotMatch(shrub.prompt, /Realistic trunk taper/);
  const src = read('modules/garden-design/asset-factory-v1/prompt-factory-v2.js');
  assert.doesNotMatch(src, /api\.openai\.com/);
  assert.doesNotMatch(src, /images\/generations/);
});
