/**
 * Visual State Calibration Batch 2 prep. Zero spend. No generation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCanonicalCatalog } from '../modules/garden-design/asset-factory-v1/catalog-source-v1.js';
import { FACTORY_GENERATION_RULE, REQUIREMENT_STATE } from '../modules/garden-design/asset-factory-v1/design-asset-visual-state-integrity-gate-v1.js';
import {
  BATCH_2_JOBS,
  BATCH_2_SPEND_GATE,
  EGGPLANT_DEFERRED,
  LAVENDER_BATCH1_HISTORICAL,
  VISUAL_STATE_CALIBRATION_BATCH_2_RUN_ID,
  executeVisualStateCalibrationBatch2,
  writeVisualStateCalibrationBatch2Reports
} from '../modules/garden-design/asset-factory-v1/visual-state-calibration-batch-2-prep-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'modules', 'garden-design', 'assets', 'plants', 'design-asset-registry-v1.json');

test('batch-2 prep locks 11 jobs, denies spend, and does not generate', () => {
  const catalog = loadCanonicalCatalog(ROOT);
  const registryBefore = fs.readFileSync(REGISTRY, 'utf8');
  const written = writeVisualStateCalibrationBatch2Reports(ROOT, catalog.plants);
  const summary = JSON.parse(fs.readFileSync(written.summaryPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(written.manifestPath, 'utf8'));
  const html = fs.readFileSync(written.reviewHtml, 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');

  assert.equal(written.verdict, 'VISUAL_STATE_CALIBRATION_BATCH_2_FINAL_PREP_READY');
  assert.equal(BATCH_2_JOBS.length, 11);
  assert.equal(manifest.jobs.length, 11);
  assert.equal(VISUAL_STATE_CALIBRATION_BATCH_2_RUN_ID, 'design-asset-visual-state-calibration-batch-2');
  assert.equal(BATCH_2_SPEND_GATE.state, 'DENIED');
  assert.equal(BATCH_2_SPEND_GATE.maxJobs, 11);
  assert.equal(BATCH_2_SPEND_GATE.maxCalls, 11);
  assert.equal(BATCH_2_SPEND_GATE.maxRetries, 0);
  assert.equal(BATCH_2_SPEND_GATE.previousPaidApprovalExhausted, true);
  assert.equal(FACTORY_GENERATION_RULE.generateRequired, true);
  assert.equal(FACTORY_GENERATION_RULE.generateOptional, false);
  assert.equal(FACTORY_GENERATION_RULE.generateUnknown, false);
  assert.equal(REQUIREMENT_STATE.REQUIRED, 'REQUIRED');
  assert.deepEqual(
    manifest.jobs.map((job) => `${job.canonicalSlug}:${job.growthStage}:${job.architectureMode}:${job.phenologyState}`),
    [
      'mango:mature:tree:vegetative',
      'mango:young:tree:vegetative',
      'mango:mature:tree:fruiting',
      'banana:mature:default:vegetative',
      'banana:young:default:vegetative',
      'apple:mature:tree:vegetative',
      'apple:mature:tree:dormant',
      'pomegranate:mature:tree:vegetative',
      'pomegranate:mature:shrub:vegetative',
      'lavender:mature:shrub:vegetative',
      'lavender:mature:shrub:flowering'
    ]
  );
  assert.equal(manifest.jobs.filter((job) => job.canonicalSlug === 'eggplant').length, 0);
  assert.equal(manifest.jobs.filter((job) => job.canonicalSlug === 'apple' && job.growthStage === 'young').length, 0);
  assert.equal(manifest.jobs.filter((job) => job.canonicalSlug === 'lavender').length, 2);
  assert.equal(EGGPLANT_DEFERRED.visualStateCalibration, 'DEFERRED_BASELINE_REQUIRED');
  assert.equal(EGGPLANT_DEFERRED.generatedInBatch2, false);
  assert.equal(LAVENDER_BATCH1_HISTORICAL.historicalEvidenceOnly, true);
  assert.equal(summary.everyTestedStateHasValidFamilyAnchor, true);
  assert.match(html, /lavender__mature__shrub__vegetative__v1/);
  assert.match(html, /DEFERRED_BASELINE_REQUIRED/);
  assert.doesNotMatch(html, /eggplant__mature__shrub__fruiting/);
  assert.match(html, /ASSET NOT GENERATED/);
  assert.match(html, /Do these clearly look like the same plant identity/);
  const prompts = JSON.parse(fs.readFileSync(written.promptsPath, 'utf8'));
  assert.ok(prompts.prompts.every((row) => Array.isArray(row.round1LearningInherited) && row.round1LearningInherited.length === 11));
  assert.match(prompts.prompts[0].prompt, /no baked scene shadow/);
  assert.match(app, /#design-asset-visual-state-calibration-batch-2/);
  const executed = executeVisualStateCalibrationBatch2();
  assert.equal(executed.executed, false);
  assert.equal(executed.imageGeneration, 0);
  assert.equal(executed.openaiCalls, 0);
  assert.equal(summary.spend.additionalSpendUsd, 0);
  assert.equal(summary.treePhysicalScaleReopened, false);
  assert.equal(fs.readFileSync(REGISTRY, 'utf8'), registryBefore);
  assert.ok(!html.includes('data:image'));
});
