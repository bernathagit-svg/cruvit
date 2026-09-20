/**
 * Quality-family final calibration prep. Zero spend. 7 medium jobs. Do not execute.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  QUALITY_FAMILY_CALIBRATION_FINAL_RUN_ID,
  QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE,
  FAMILY_PASS_RULES,
  buildQualityFamilyCalibrationFinalJobs,
  executeQualityFamilyCalibrationFinal,
  writeQualityFamilyCalibrationFinalReports
} from '../modules/garden-design/asset-factory-v1/quality-family-calibration-final-prep-v1.js';
import { NEXT_QUALITY_CALIBRATION_SET } from '../modules/garden-design/asset-factory-v1/design-asset-quality-planning-integrity-v1.js';
import { DETAIL_CLASS, HIGH_DETAIL_CLASSES } from '../modules/garden-design/asset-factory-v1/design-asset-quality-policy-v1.js';
import { PROMPT_TEMPLATE_VERSION_VISUAL_STATE_DETAIL_V2 } from '../modules/garden-design/asset-factory-v1/prompt-factory-visual-state-detail-v2.js';
import { DEFAULT_GENERATION_SETTINGS } from '../modules/garden-design/asset-factory-v1/prompt-factory-v1.js';
import { PAID_IMAGE_QUALITY } from '../modules/runtime-guards/paid-image-spend-gate-v1.js';
import { DESIGN_ASSET_FACTORY } from '../modules/garden-design/asset-factory-v1/design-asset-factory-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CONTROL_FILES = [
  'modules/garden-design/assets/plants/batch-2-candidates/visual-state-calibration-batch-2/apple__mature__tree__dormant__v1.png',
  'modules/garden-design/assets/plants/batch-2-candidates/visual-state-calibration-batch-2/lavender__mature__shrub__vegetative__v1.png',
  'modules/garden-design/assets/plants/batch-2-candidates/visual-state-calibration-batch-2/lavender__mature__shrub__flowering__v1.png',
  'modules/garden-design/assets/plants/batch-2-candidates/visual-state-calibration-batch-2/banana__mature__default__vegetative__v1.png',
  'modules/garden-design/assets/plants/batch-1-candidates/calibration-batch-1/pineapple-mature-vegetative-v1.png',
  'modules/garden-design/assets/plants/batch-1-candidates/calibration-batch-1/aloe-vera-mature-vegetative-v1.png'
];

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
}

test('quality-family final prep is 7 medium jobs, avocado included, spend DENIED, no generation', () => {
  const before = CONTROL_FILES.map(sha);
  const jobs = buildQualityFamilyCalibrationFinalJobs();
  assert.equal(jobs.length, 7);
  assert.equal(QUALITY_FAMILY_CALIBRATION_FINAL_RUN_ID, 'design-asset-quality-family-calibration-final-1');
  assert.ok(jobs.every((job) => job.quality === 'medium'));
  assert.ok(jobs.every((job) => job.promptTemplateVersion === PROMPT_TEMPLATE_VERSION_VISUAL_STATE_DETAIL_V2));
  assert.ok(jobs.every((job) => job.generateNow === false));
  assert.ok(jobs.every((job) => job.inheritMangoHighPolicy === false));
  assert.ok(jobs.every((job) => job.encodePhysicalMeters === false));
  assert.equal(jobs.filter((job) => job.quality === 'high').length, 0);
  const avocado = jobs.find((job) => job.canonicalSlug === 'avocado');
  assert.ok(avocado);
  assert.deepEqual(avocado.qualityFamilies, [DETAIL_CLASS.WOODY_OPEN_OR_LARGE_LEAF]);
  assert.equal(avocado.architectureMode, 'tree');
  assert.equal(avocado.phenologyState, 'vegetative');
  assert.ok(!HIGH_DETAIL_CLASSES.includes(DETAIL_CLASS.WOODY_OPEN_OR_LARGE_LEAF));
  assert.match(avocado.prompt, /Do not encode physical meters/);
  assert.doesNotMatch(avocado.prompt, /9\.1|18\.3|30–60|UF\/IFAS/);
  assert.equal(jobs[1].canonicalSlug, 'apple');
  assert.equal(jobs[1].phenologyState, 'dormant');
  assert.equal(jobs[2].canonicalSlug, 'lavender');
  assert.equal(jobs[2].phenologyState, 'vegetative');
  assert.equal(jobs[3].canonicalSlug, 'lavender');
  assert.equal(jobs[3].phenologyState, 'flowering');
  assert.equal(jobs[4].canonicalSlug, 'banana');
  assert.equal(jobs[4].phenologyState, 'fruiting');
  assert.equal(jobs[5].canonicalSlug, 'pineapple');
  assert.equal(jobs[6].canonicalSlug, 'aloe-vera');
  assert.equal(NEXT_QUALITY_CALIBRATION_SET.superseded, true);
  assert.equal(NEXT_QUALITY_CALIBRATION_SET.supersededBy, QUALITY_FAMILY_CALIBRATION_FINAL_RUN_ID);
  assert.equal(NEXT_QUALITY_CALIBRATION_SET.execute, false);
  assert.equal(QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE.state, 'DENIED');
  assert.equal(QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE.maxJobs, 7);
  assert.equal(QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE.maxCalls, 7);
  assert.equal(QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE.maxRetries, 0);
  assert.equal(QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE.highJobs, 0);
  assert.equal(QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE.unknownBlockedGeneration, false);
  assert.equal(QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE.generateThe82Individually, false);
  assert.equal(QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE.massGeneration, false);
  assert.equal(FAMILY_PASS_RULES.automaticHighEscalation, false);
  assert.equal(PAID_IMAGE_QUALITY, 'medium');
  assert.equal(DEFAULT_GENERATION_SETTINGS.quality, 'medium');
  assert.equal(DESIGN_ASSET_FACTORY.generateOnRender, false);
  const written = writeQualityFamilyCalibrationFinalReports(ROOT);
  CONTROL_FILES.forEach((file, i) => assert.equal(sha(file), before[i]));
  const spend = executeQualityFamilyCalibrationFinal();
  assert.equal(spend.openaiCalls, 0);
  assert.equal(spend.imageGeneration, 0);
  assert.equal(spend.additionalSpendUsd, 0);
  assert.equal(spend.executed, false);
  assert.equal(spend.productionRegistryChanged, false);
  assert.equal(spend.massGenerationStarted, false);
  assert.equal(written.verdict, 'DESIGN_ASSET_QUALITY_FINAL_CALIBRATION_PREPARED');
  const html = fs.readFileSync(written.reviewHtml, 'utf8');
  assert.match(html, /WOODY_OPEN_OR_LARGE_LEAF/);
  assert.match(html, /avocado/);
  assert.match(html, /STATE_DETAIL_WEAK/);
  assert.match(html, /data-inspect-zoom="100"/);
  assert.match(html, /data-inspect-zoom="150"/);
  assert.match(html, /data-inspect-zoom="200"/);
  assert.match(html, /checkerboard/);
  assert.match(html, /filter:none/);
  assert.match(html, /HISTORICAL CONTROL — NOT APPROVED/);
  assert.doesNotMatch(html, /data:image/);
  const candidateDir = path.join(ROOT, 'modules/garden-design/assets/plants/quality-family-calibration-final-1');
  const generatedExists = fs.existsSync(candidateDir);
  if (generatedExists) {
    assert.match(html, /detail-v2__medium\.png/);
    assert.doesNotMatch(html, /ASSET NOT GENERATED/);
  } else {
    assert.match(html, /ASSET NOT GENERATED/);
    assert.match(html, /superseded because it omitted WOODY_OPEN_OR_LARGE_LEAF/);
    assert.match(html, /Not a production-approved/);
  }
});
