/**
 * BRANCH_STRUCTURE calibration prep. One Apple dormant medium job. Zero spend.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  BRANCH_STRUCTURE_CALIBRATION_RUN_ID,
  BRANCH_STRUCTURE_CALIBRATION_SPEND_GATE,
  BRANCH_STRUCTURE_CALIBRATION_MODEL,
  BRANCH_STRUCTURE_DECISION_RULE,
  buildBranchStructureCalibrationJob,
  costPreflightBranchStructureCalibration,
  executeBranchStructureCalibration,
  writeBranchStructureCalibrationReports
} from '../modules/garden-design/asset-factory-v1/branch-structure-calibration-prep-v1.js';
import { PROMPT_TEMPLATE_VERSION_BRANCH_STRUCTURE_V2_EXPERIMENT } from '../modules/garden-design/asset-factory-v1/prompt-factory-branch-structure-v2-experiment-v1.js';
import { DESIGN_ASSET_FACTORY } from '../modules/garden-design/asset-factory-v1/design-asset-factory-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTROL = path.join(
  ROOT,
  'modules/garden-design/assets/plants/quality-family-calibration-final-1/apple__mature__tree__dormant__detail-v2__medium.png'
);
const REGISTRY = path.join(ROOT, 'modules/garden-design/assets/plants/design-asset-registry-v1.json');

test('branch-structure calibration prep is one medium Apple dormant job and does not spend', () => {
  const controlBefore = crypto.createHash('sha256').update(fs.readFileSync(CONTROL)).digest('hex');
  const registryBefore = crypto.createHash('sha256').update(fs.readFileSync(REGISTRY)).digest('hex');

  const job = buildBranchStructureCalibrationJob();
  assert.equal(BRANCH_STRUCTURE_CALIBRATION_RUN_ID, 'design-asset-branch-structure-calibration-1');
  assert.equal(job.canonicalSlug, 'apple');
  assert.equal(job.architectureMode, 'tree');
  assert.equal(job.growthStage, 'mature');
  assert.equal(job.phenologyState, 'dormant');
  assert.equal(job.quality, 'medium');
  assert.equal(job.highQuality, false);
  assert.equal(job.model, BRANCH_STRUCTURE_CALIBRATION_MODEL);
  assert.equal(job.model, 'gpt-image-2.5-flare-2026-09-08');
  assert.equal(job.size, '1024x1536');
  assert.equal(job.background, 'transparent');
  assert.equal(job.outputFormat, 'png');
  assert.equal(job.retries, 0);
  assert.equal(job.generateNow, false);
  assert.equal(job.promptTemplateVersion, PROMPT_TEMPLATE_VERSION_BRANCH_STRUCTURE_V2_EXPERIMENT);
  assert.match(job.prompt, /completely leafless/i);
  assert.match(job.prompt, /opaque realistic wood/i);
  assert.match(job.prompt, /transparent negative space/i);
  assert.match(job.prompt, /translucent brown clouds/i);
  assert.match(job.prompt, /ALPHA \/ TRANSPARENCY CONTRACT/);
  assert.doesNotMatch(job.prompt, /individually legible natural foliage/);
  assert.doesNotMatch(job.prompt, /clear leaf and leaflet boundaries/);
  assert.doesNotMatch(job.prompt, /DETAIL REQUIREMENTS:.*foliage/);
  assert.equal(job.historicalControl.approved, false);
  assert.equal(job.historicalControl.modify, false);

  assert.equal(BRANCH_STRUCTURE_CALIBRATION_SPEND_GATE.state, 'DENIED');
  assert.equal(BRANCH_STRUCTURE_CALIBRATION_SPEND_GATE.maxJobs, 1);
  assert.equal(BRANCH_STRUCTURE_CALIBRATION_SPEND_GATE.maxCalls, 1);
  assert.equal(BRANCH_STRUCTURE_CALIBRATION_SPEND_GATE.maxRetries, 0);
  assert.equal(BRANCH_STRUCTURE_CALIBRATION_SPEND_GATE.highJobs, 0);
  assert.equal(BRANCH_STRUCTURE_CALIBRATION_SPEND_GATE.massGeneration, false);
  assert.equal(BRANCH_STRUCTURE_CALIBRATION_SPEND_GATE.automaticHighEscalation, false);
  assert.equal(BRANCH_STRUCTURE_DECISION_RULE.automaticHigh, false);

  const cost = costPreflightBranchStructureCalibration();
  assert.equal(cost.paidProbe, false);
  assert.equal(cost.highJobs, 0);
  assert.equal(cost.conservativeHardCapUsd, 0.03);
  assert.equal(cost.notSpendAuthorization, true);

  const written = writeBranchStructureCalibrationReports(ROOT);
  assert.equal(written.verdict, 'BRANCH_STRUCTURE_CALIBRATION_V1_PREPARED');
  const spend = executeBranchStructureCalibration();
  assert.equal(spend.openaiCalls, 0);
  assert.equal(spend.imageGeneration, 0);
  assert.equal(spend.jobsPrepared, 1);
  assert.equal(spend.highJobs, 0);
  assert.equal(spend.additionalSpendUsd, 0);
  assert.equal(DESIGN_ASSET_FACTORY.generateOnRender, false);

  const summary = JSON.parse(fs.readFileSync(written.summaryPath, 'utf8'));
  assert.equal(summary.jobs.length, 1);
  assert.equal(summary.technicalComparison.CONTROL.opaqueAlpha255, 0);
  assert.equal(summary.technicalComparison.NEW.generated, false);
  assert.equal(summary.massGeneration.QUALITY_POLICY_MASS_GENERATION_READY, 'NO');

  const html = fs.readFileSync(path.join(ROOT, 'modules/garden-design/branch-structure-calibration-1.html'), 'utf8');
  assert.match(html, /ASSET NOT GENERATED/);
  assert.match(html, /HISTORICAL CONTROL/);
  assert.match(html, /filter:none/);

  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(CONTROL)).digest('hex'), controlBefore);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(REGISTRY)).digest('hex'), registryBefore);
});
