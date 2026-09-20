/**
 * Quality planning integrity. Zero spend. No generation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  QUALITY_PLANNING_STATE,
  VARIANT_DETAIL_DEMAND,
  CURRENT_AUDIT_LIMITATION,
  NEXT_QUALITY_CALIBRATION_SET,
  planVariantQuality,
  writeQualityPlanningIntegrityReports,
  executeQualityPlanningIntegrity
} from '../modules/garden-design/asset-factory-v1/design-asset-quality-planning-integrity-v1.js';
import { DETAIL_CLASS } from '../modules/garden-design/asset-factory-v1/design-asset-quality-policy-v1.js';
import { DESIGN_ASSET_FACTORY } from '../modules/garden-design/asset-factory-v1/design-asset-factory-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'modules/garden-design/assets/plants/design-asset-registry-v1.json');

test('quality planning integrity is state-specific and does not spend', () => {
  const registryBefore = crypto.createHash('sha256').update(fs.readFileSync(REGISTRY)).digest('hex');

  const appleVeg = planVariantQuality({
    canonicalSlug: 'apple',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'vegetative'
  });
  assert.equal(appleVeg.baseDetailClass, DETAIL_CLASS.WOODY_DENSE_SMALL_LEAF);
  assert.equal(appleVeg.variantDetailDemand, VARIANT_DETAIL_DEMAND.FOLIAGE_DENSE);
  assert.equal(appleVeg.qualityPlanningState, QUALITY_PLANNING_STATE.HIGH_EVIDENCE_SUPPORTED);
  assert.equal(appleVeg.plannedQuality, 'high');

  const appleDormant = planVariantQuality({
    canonicalSlug: 'apple',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'dormant'
  });
  assert.equal(appleDormant.variantDetailDemand, VARIANT_DETAIL_DEMAND.BRANCH_STRUCTURE);
  assert.equal(appleDormant.plannedQuality, 'medium');
  assert.equal(appleDormant.qualityPlanningState, QUALITY_PLANNING_STATE.QUALITY_CALIBRATION_REQUIRED);
  assert.notEqual(appleDormant.plannedQuality, 'high');

  const mangoFruit = planVariantQuality({
    canonicalSlug: 'mango',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'fruiting'
  });
  assert.equal(mangoFruit.variantDetailDemand, VARIANT_DETAIL_DEMAND.FRUIT_VISIBLE_DETAIL);
  assert.equal(mangoFruit.plannedQuality, 'medium');

  const banana = planVariantQuality({
    canonicalSlug: 'banana',
    visualForm: 'herbaceous-clump',
    architectureMode: 'default',
    growthStage: 'mature',
    phenologyState: 'vegetative'
  });
  assert.equal(banana.qualityPlanningState, QUALITY_PLANNING_STATE.MEDIUM_EVIDENCE_SUPPORTED);
  assert.equal(banana.plannedQuality, 'medium');

  const unknownForm = planVariantQuality({
    canonicalSlug: 'agapanthus',
    visualForm: 'unknown',
    architectureMode: 'default',
    growthStage: 'mature',
    phenologyState: 'vegetative',
    identityBlockers: ['VISUAL_FORM_UNKNOWN']
  });
  assert.equal(unknownForm.qualityPlanningState, QUALITY_PLANNING_STATE.UNKNOWN_BLOCKED);

  assert.equal(CURRENT_AUDIT_LIMITATION.label, 'FALLBACK_MEDIUM_PROJECTION_ONLY');
  assert.equal(CURRENT_AUDIT_LIMITATION.not, 'PRODUCTION_BUDGET');
  assert.equal(NEXT_QUALITY_CALIBRATION_SET.execute, false);
  assert.equal(NEXT_QUALITY_CALIBRATION_SET.superseded, true);
  assert.equal(NEXT_QUALITY_CALIBRATION_SET.supersededBy, 'design-asset-quality-family-calibration-final-1');
  assert.equal(NEXT_QUALITY_CALIBRATION_SET.jobs.length, 6);
  assert.ok(NEXT_QUALITY_CALIBRATION_SET.jobs.every((job) => job.generateNow === false));
  assert.ok(!NEXT_QUALITY_CALIBRATION_SET.jobs.some((job) => job.canonicalSlug === 'mango'));

  const written = writeQualityPlanningIntegrityReports(ROOT);
  assert.equal(written.verdict, 'DESIGN_ASSET_QUALITY_PLANNING_INTEGRITY_V1_READY');
  assert.equal(written.massReady, 'NO');
  assert.equal(written.spend.openaiCalls, 0);
  assert.equal(written.spend.imageGeneration, 0);
  assert.equal(executeQualityPlanningIntegrity().additionalSpendUsd, 0);
  assert.equal(DESIGN_ASSET_FACTORY.generateOnRender, false);

  const audit = JSON.parse(fs.readFileSync(written.variantsPath, 'utf8'));
  assert.equal(audit.requiredVariantsTotal, 273);
  assert.equal(audit.forcedClassification, false);
  assert.ok(audit.unknownBaseDetailClass < 251);
  assert.ok(audit.planningStates.HIGH_EVIDENCE_SUPPORTED < 11 || audit.plannedQuality.high < 11);

  const costs = JSON.parse(fs.readFileSync(written.costsPath, 'utf8'));
  assert.equal(costs.fallbackProjection.notAFinalProductionBudget, true);
  assert.equal(costs.fallbackProjection.label, 'FALLBACK_MEDIUM_PROJECTION_ONLY');

  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(REGISTRY)).digest('hex'), registryBefore);
});
