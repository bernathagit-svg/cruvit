/**
 * Design Asset Quality Policy V1. Zero spend. No generation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  DETAIL_CLASS,
  DEFAULT_QUALITY,
  HIGH_DETAIL_CLASSES,
  WOODY_FOLIAGE_DETAIL_AB_OWNER_RESULT,
  executeDesignAssetQualityPolicyV1,
  mayAutoEscalateQuality,
  planDesignAssetGeneration,
  qualityForDetailClass,
  resolveDetailClass,
  writeDesignAssetQualityPolicyReports
} from '../modules/garden-design/asset-factory-v1/design-asset-quality-policy-v1.js';
import { FACTORY_PIPELINE_STEPS, FACTORY_PLANNING_PATH_QUALITY_V1 } from '../modules/garden-design/asset-factory-v1/design-asset-factory-v1.js';
import { familyLockLines } from '../modules/garden-design/asset-factory-v1/prompt-factory-visual-state-family-v1.js';
import { familyLockLinesVisualStateDetailV2 } from '../modules/garden-design/asset-factory-v1/prompt-factory-visual-state-detail-v2.js';
import { DEFAULT_GENERATION_SETTINGS } from '../modules/garden-design/asset-factory-v1/prompt-factory-v1.js';
import { PAID_IMAGE_QUALITY } from '../modules/runtime-guards/paid-image-spend-gate-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'modules/garden-design/assets/plants/design-asset-registry-v1.json');
const CONTROL = path.join(
  ROOT,
  'modules/garden-design/assets/plants/batch-2-candidates/visual-state-calibration-batch-2/mango__mature__tree__vegetative__v1.png'
);

test('quality policy is morphology-aware, default medium, and does not spend', () => {
  const registryBefore = crypto.createHash('sha256').update(fs.readFileSync(REGISTRY)).digest('hex');
  const controlBefore = crypto.createHash('sha256').update(fs.readFileSync(CONTROL)).digest('hex');

  assert.equal(DEFAULT_QUALITY, 'medium');
  assert.equal(PAID_IMAGE_QUALITY, 'medium');
  assert.equal(DEFAULT_GENERATION_SETTINGS.quality, 'medium');
  assert.deepEqual(HIGH_DETAIL_CLASSES, ['WOODY_DENSE_SMALL_LEAF']);
  assert.equal(qualityForDetailClass(DETAIL_CLASS.UNKNOWN), 'medium');
  assert.equal(qualityForDetailClass(DETAIL_CLASS.LARGE_LEAF_HERBACEOUS), 'medium');
  assert.equal(qualityForDetailClass(DETAIL_CLASS.ROSETTE), 'medium');
  assert.equal(qualityForDetailClass(DETAIL_CLASS.WOODY_DENSE_SMALL_LEAF), 'high');

  const treeWithoutClass = resolveDetailClass({ canonicalSlug: 'blue-gum', visualForm: 'tree', architectureMode: 'tree' });
  assert.equal(treeWithoutClass.detailClass, DETAIL_CLASS.UNKNOWN);
  assert.equal(planDesignAssetGeneration(treeWithoutClass).quality, 'medium');

  const mango = planDesignAssetGeneration({
    canonicalSlug: 'mango',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'vegetative'
  });
  assert.equal(mango.detailClass, DETAIL_CLASS.WOODY_DENSE_SMALL_LEAF);
  assert.equal(mango.quality, 'high');
  assert.equal(mango.generateNow, false);
  assert.match(mango.promptRecord.prompt, /individually legible natural foliage/);
  assert.doesNotMatch(mango.promptRecord.prompt, /individually legible natural mango leaves/);

  const appleDormantPlan = planDesignAssetGeneration({
    canonicalSlug: 'apple',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'dormant'
  });
  assert.equal(appleDormantPlan.quality, 'medium');

  const avocadoPlan = planDesignAssetGeneration({
    canonicalSlug: 'avocado',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'vegetative'
  });
  assert.equal(avocadoPlan.detailClass, DETAIL_CLASS.WOODY_OPEN_OR_LARGE_LEAF);
  assert.equal(avocadoPlan.quality, 'medium');

  const banana = planDesignAssetGeneration({
    canonicalSlug: 'banana',
    visualForm: 'herbaceous-clump',
    architectureMode: 'default'
  });
  assert.equal(banana.detailClass, DETAIL_CLASS.LARGE_LEAF_HERBACEOUS);
  assert.equal(banana.quality, 'medium');

  assert.equal(mayAutoEscalateQuality().ok, false);
  assert.equal(mayAutoEscalateQuality().automaticMediumThenHighRetry, false);
  assert.equal(FACTORY_PLANNING_PATH_QUALITY_V1[3], 'detailClass');
  assert.equal(FACTORY_PLANNING_PATH_QUALITY_V1[4], 'generation-quality');
  assert.equal(FACTORY_PIPELINE_STEPS[1], 'visual-state-requirements');

  const historical = familyLockLines({ canonicalSlug: 'mango', visualForm: 'tree' }).join(' ');
  assert.match(historical, /Avoid hyper-detailed studio-render microtexture/);
  const next = familyLockLinesVisualStateDetailV2({ canonicalSlug: 'mango', visualForm: 'tree' }).join(' ');
  assert.match(next, /individually legible natural foliage/);
  assert.match(next, /painterly foliage masses/);

  assert.equal(WOODY_FOLIAGE_DETAIL_AB_OWNER_RESULT.PROMPT_V2_VALIDATED, true);
  assert.equal(WOODY_FOLIAGE_DETAIL_AB_OWNER_RESULT.HIGH_UNIVERSAL, false);
  assert.equal(WOODY_FOLIAGE_DETAIL_AB_OWNER_RESULT.A.owner, 'ACCEPTABLE');
  assert.equal(WOODY_FOLIAGE_DETAIL_AB_OWNER_RESULT.B.owner, 'PREFERRED');
  assert.equal(WOODY_FOLIAGE_DETAIL_AB_OWNER_RESULT.mangoCandidatesRemainCalibrationOnly, true);

  const written = writeDesignAssetQualityPolicyReports(ROOT);
  assert.equal(written.verdict, 'DESIGN_ASSET_QUALITY_POLICY_V1_READY');
  assert.equal(written.spend.openaiCalls, 0);
  assert.equal(written.spend.imageGeneration, 0);
  assert.equal(written.spend.additionalSpendUsd, 0);
  assert.equal(executeDesignAssetQualityPolicyV1().executed, false);

  const audit = JSON.parse(fs.readFileSync(written.auditPath, 'utf8'));
  assert.equal(audit.requiredVariantsTotal, 273);
  assert.equal(audit.execute273, false);
  assert.ok(audit.mediumCount > audit.highCount);
  assert.equal(audit.mediumCount + audit.highCount, 273);

  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(REGISTRY)).digest('hex'), registryBefore);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(CONTROL)).digest('hex'), controlBefore);
});
