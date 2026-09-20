/**
 * BRANCH_STRUCTURE Cleanup C lock. Zero spend. Originals immutable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  OWNER_CLEANUP_DECISION,
  executeBranchStructureAlphaCleanupV1,
  writeBranchStructureAlphaCleanupReports
} from '../modules/garden-design/asset-factory-v1/branch-structure-alpha-cleanup-v1.js';
import {
  BRANCH_STRUCTURE_ALPHA_CLEANUP_CONTRACT_V1,
  cleanupEligibleForVariant
} from '../modules/garden-design/asset-factory-v1/branch-structure-alpha-cleanup-contract-v1.js';
import { planVariantQuality, QUALITY_PLANNING_STATE } from '../modules/garden-design/asset-factory-v1/design-asset-quality-planning-integrity-v1.js';
import { NEW_APPLE_DORMANT_CANDIDATE } from '../modules/garden-design/asset-factory-v1/branch-alpha-salvage-feasibility-v1.js';
import { APPLE_DORMANT_CANDIDATE } from '../modules/garden-design/asset-factory-v1/apple-dormant-root-cause-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('owner Cleanup C lock does not spend or overwrite originals', () => {
  const originalPath = path.join(ROOT, NEW_APPLE_DORMANT_CANDIDATE.file);
  const controlPath = path.join(ROOT, APPLE_DORMANT_CANDIDATE.file);
  const registryPath = path.join(ROOT, 'modules/garden-design/assets/plants/design-asset-registry-v1.json');
  const originalBefore = crypto.createHash('sha256').update(fs.readFileSync(originalPath)).digest('hex');
  const controlBefore = crypto.createHash('sha256').update(fs.readFileSync(controlPath)).digest('hex');
  const registryBefore = crypto.createHash('sha256').update(fs.readFileSync(registryPath)).digest('hex');

  assert.equal(OWNER_CLEANUP_DECISION.ownerPreferredCleanup, 'C');
  assert.equal(OWNER_CLEANUP_DECISION.BRANCH_STRUCTURE_ALPHA_SALVAGE, 'PASS');
  assert.equal(OWNER_CLEANUP_DECISION.selectedCleanup, 'EDGE_PRESERVING_C');
  assert.equal(OWNER_CLEANUP_DECISION.highRequired, false);
  assert.equal(OWNER_CLEANUP_DECISION.ASSET_PRODUCTION_APPROVAL, 'NO');
  assert.equal(cleanupEligibleForVariant({ variantDetailDemand: 'BRANCH_STRUCTURE', phenologyState: 'dormant', visualForm: 'tree' }), true);
  assert.equal(cleanupEligibleForVariant({ variantDetailDemand: 'FOLIAGE_DENSE', phenologyState: 'vegetative', visualForm: 'tree' }), false);
  assert.equal(cleanupEligibleForVariant({ variantDetailDemand: 'BRANCH_STRUCTURE', phenologyState: 'dormant', visualForm: 'shrub' }), false);

  const spend = executeBranchStructureAlphaCleanupV1();
  assert.equal(spend.openaiCalls, 0);
  assert.equal(spend.imageGeneration, 0);
  assert.equal(spend.highExecuted, false);
  assert.equal(spend.additionalSpendUsd, 0);
  assert.equal(spend.spendGate, 'DENIED');
  assert.equal(spend.massGenerationStarted, false);

  const apple = planVariantQuality({
    canonicalSlug: 'apple',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'dormant'
  });
  assert.equal(apple.qualityPlanningState, QUALITY_PLANNING_STATE.MEDIUM_EVIDENCE_SUPPORTED);
  assert.equal(apple.plannedQuality, 'medium');
  assert.equal(apple.alphaCleanupRequired, true);
  assert.equal(apple.alphaCleanupContract, BRANCH_STRUCTURE_ALPHA_CLEANUP_CONTRACT_V1);
  assert.equal(apple.familyPolicy, 'MEDIUM_POLICY_VALIDATED_WITH_ALPHA_CLEANUP');
  assert.equal(apple.highRequired, false);
  assert.equal(apple.rawProviderPasses, false);
  assert.equal(apple.assetProductionApproval, 'NO');

  const mangoYoung = planVariantQuality({
    canonicalSlug: 'mango',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'young',
    phenologyState: 'vegetative'
  });
  assert.equal(mangoYoung.qualityPlanningState, QUALITY_PLANNING_STATE.QUALITY_CALIBRATION_REQUIRED);

  const written = writeBranchStructureAlphaCleanupReports(ROOT);
  assert.equal(written.verdict, 'BRANCH_STRUCTURE_ALPHA_CLEANUP_V1_READY');
  assert.equal(written.massReady, 'YES');
  assert.equal(written.audit273.requiredVariantsTotal, 273);
  assert.ok(written.audit273.BRANCH_CLEANUP_REQUIRED_VARIANTS >= 1);
  assert.ok(fs.existsSync(path.join(ROOT, written.derivedFile)));
  assert.notEqual(
    crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, written.derivedFile))).digest('hex'),
    originalBefore
  );

  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(originalPath)).digest('hex'), originalBefore);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(controlPath)).digest('hex'), controlBefore);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(registryPath)).digest('hex'), registryBefore);
  assert.equal(originalBefore, NEW_APPLE_DORMANT_CANDIDATE.sha256);
});
