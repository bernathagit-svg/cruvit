/**
 * Owner quality review consolidation. Zero spend. No generation.
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
  planVariantQuality
} from '../modules/garden-design/asset-factory-v1/design-asset-quality-planning-integrity-v1.js';
import { DETAIL_CLASS, planDesignAssetGeneration } from '../modules/garden-design/asset-factory-v1/design-asset-quality-policy-v1.js';
import {
  OWNER_QUALITY_REVIEW_RECORD,
  writeOwnerQualityReviewConsolidationReports,
  executeOwnerQualityReviewConsolidation,
  snapshotProtectedBinaries
} from '../modules/garden-design/asset-factory-v1/owner-quality-review-consolidation-v1.js';
import { APPLE_BRANCH_STRUCTURE_NEXT_EXPERIMENT } from '../modules/garden-design/asset-factory-v1/prompt-factory-branch-structure-v2-experiment-v1.js';
import { DESIGN_ASSET_FACTORY } from '../modules/garden-design/asset-factory-v1/design-asset-factory-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLE_PNG = path.join(
  ROOT,
  'modules/garden-design/assets/plants/quality-family-calibration-final-1/apple__mature__tree__dormant__detail-v2__medium.png'
);

test('owner quality review consolidation records findings and does not spend', () => {
  const before = snapshotProtectedBinaries(ROOT);
  const applePngBefore = crypto.createHash('sha256').update(fs.readFileSync(APPLE_PNG)).digest('hex');

  const avocado = planVariantQuality({
    canonicalSlug: 'avocado',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'vegetative'
  });
  assert.equal(avocado.baseDetailClass, DETAIL_CLASS.WOODY_OPEN_OR_LARGE_LEAF);
  assert.equal(avocado.qualityPlanningState, QUALITY_PLANNING_STATE.MEDIUM_EVIDENCE_SUPPORTED);
  assert.equal(avocado.plannedQuality, 'medium');
  assert.equal(avocado.assetProductionApproval, 'NO');

  const appleDormant = planVariantQuality({
    canonicalSlug: 'apple',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'dormant'
  });
  assert.equal(appleDormant.variantDetailDemand, VARIANT_DETAIL_DEMAND.BRANCH_STRUCTURE);
  assert.equal(appleDormant.qualityPlanningState, QUALITY_PLANNING_STATE.QUALITY_CALIBRATION_REQUIRED);
  assert.equal(appleDormant.plannedQuality, 'medium');
  assert.equal(
    planDesignAssetGeneration({
      canonicalSlug: 'apple',
      visualForm: 'tree',
      architectureMode: 'tree',
      growthStage: 'mature',
      phenologyState: 'dormant'
    }).quality,
    'medium'
  );

  const lavenderVeg = planVariantQuality({
    canonicalSlug: 'lavender',
    visualForm: 'shrub',
    architectureMode: 'shrub',
    growthStage: 'mature',
    phenologyState: 'vegetative'
  });
  assert.equal(lavenderVeg.qualityPlanningState, QUALITY_PLANNING_STATE.MEDIUM_EVIDENCE_SUPPORTED);
  assert.equal(lavenderVeg.botanicalIdentityBlocker, 'REVIEW_REQUIRED');
  assert.equal(OWNER_QUALITY_REVIEW_RECORD.families.SHRUB_FINE_FOLIAGE.DETAIL_POLICY, 'PASS');
  assert.equal(OWNER_QUALITY_REVIEW_RECORD.families.SHRUB_FINE_FOLIAGE.BOTANICAL_IDENTITY_QA, 'REVIEW_REQUIRED');

  const mangoFruit = planVariantQuality({
    canonicalSlug: 'mango',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'fruiting'
  });
  assert.equal(mangoFruit.plannedQuality, 'medium');
  assert.equal(mangoFruit.qualityPlanningState, QUALITY_PLANNING_STATE.MEDIUM_EVIDENCE_SUPPORTED);

  assert.equal(APPLE_BRANCH_STRUCTURE_NEXT_EXPERIMENT.execute, false);
  assert.equal(APPLE_BRANCH_STRUCTURE_NEXT_EXPERIMENT.generateNow, false);
  assert.equal(APPLE_BRANCH_STRUCTURE_NEXT_EXPERIMENT.jobs[0].quality, 'medium');
  assert.equal(APPLE_BRANCH_STRUCTURE_NEXT_EXPERIMENT.jobs[0].highQuality, false);

  const written = writeOwnerQualityReviewConsolidationReports(ROOT);
  assert.equal(written.verdict, 'OWNER_QUALITY_REVIEW_CONSOLIDATED_V1_READY');
  assert.equal(written.massReady, 'NO');
  assert.equal(written.appleRootCause, 'MIXED');
  const spend = executeOwnerQualityReviewConsolidation();
  assert.equal(spend.openaiCalls, 0);
  assert.equal(spend.imageGeneration, 0);
  assert.equal(spend.additionalSpendUsd, 0);
  assert.equal(spend.assetsAutoApproved, 0);
  assert.equal(spend.appleDormantAutoEscalatedToHigh, false);
  assert.equal(DESIGN_ASSET_FACTORY.generateOnRender, false);

  const summary = JSON.parse(fs.readFileSync(written.summaryPath, 'utf8'));
  assert.equal(summary.audit273.requiredVariantsTotal, 273);
  assert.ok(summary.audit273.planningStates.QUALITY_CALIBRATION_REQUIRED < 82);
  assert.equal(summary.massGeneration.QUALITY_POLICY_MASS_GENERATION_READY, 'NO');
  assert.equal(summary.confirms.universalHigh, 'NO');
  assert.equal(summary.costs.notSpendAuthorization, true);

  const results = JSON.parse(fs.readFileSync(written.resultsPath, 'utf8'));
  const appleJob = results.jobs.find((job) => job.jobId === 'apple__mature__tree__dormant__detail-v2__medium');
  assert.equal(appleJob.familyPolicy, 'QUALITY_POLICY_NOT_VALIDATED');
  assert.equal(appleJob.autoApproved, false);
  const lavenderJob = results.jobs.find((job) => job.jobId === 'lavender__mature__shrub__vegetative__detail-v2__medium');
  assert.equal(lavenderJob.BOTANICAL_IDENTITY_QA, 'REVIEW_REQUIRED');
  assert.equal(lavenderJob.DETAIL_QA, 'DETAIL_OK');

  const afterPng = crypto.createHash('sha256').update(fs.readFileSync(APPLE_PNG)).digest('hex');
  assert.equal(afterPng, applePngBefore);
  const after = snapshotProtectedBinaries(ROOT);
  assert.deepEqual(after, before);
});
