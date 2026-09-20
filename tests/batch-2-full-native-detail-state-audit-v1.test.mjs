/**
 * Batch-2 full native-detail + state audit. Zero spend. Does not mutate PNGs or factory prompts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  AUDITOR_JOB_DETAIL,
  BATCH_DETAIL_CLASSIFICATION,
  MANGO_DETAIL_AB_EXPERIMENT,
  PROMPT_V2_DETAIL_PROPOSAL,
  writeBatch2FullNativeDetailStateAudit
} from '../modules/garden-design/asset-factory-v1/batch-2-full-native-detail-state-audit-v1.js';
import { familyLockLines } from '../modules/garden-design/asset-factory-v1/prompt-factory-visual-state-family-v1.js';
import { DEFAULT_GENERATION_SETTINGS } from '../modules/garden-design/asset-factory-v1/prompt-factory-v1.js';
import { PAID_IMAGE_QUALITY } from '../modules/runtime-guards/paid-image-spend-gate-v1.js';
import { BATCH_2_SPEND_GATE } from '../modules/garden-design/asset-factory-v1/visual-state-calibration-batch-2-prep-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PNG_DIR = path.join(
  ROOT,
  'modules/garden-design/assets/plants/batch-2-candidates/visual-state-calibration-batch-2'
);

test('batch-2 full native audit records woody-foliage softness without spending or rewriting prompts', () => {
  const before = fs.readdirSync(PNG_DIR).map((name) => {
    const buf = fs.readFileSync(path.join(PNG_DIR, name));
    return { name, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
  });
  const written = writeBatch2FullNativeDetailStateAudit(ROOT);
  const after = fs.readdirSync(PNG_DIR).map((name) => {
    const buf = fs.readFileSync(path.join(PNG_DIR, name));
    return { name, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
  });
  assert.deepEqual(after, before);
  assert.equal(written.batchDetailClassification, 'WOODY_FOLIAGE_SOFTNESS');
  assert.equal(BATCH_DETAIL_CLASSIFICATION, 'WOODY_FOLIAGE_SOFTNESS');
  assert.equal(written.mangoOwnerFindingPreserved, true);
  assert.equal(written.openaiCalls, 0);
  assert.equal(PROMPT_V2_DETAIL_PROPOSAL.applied, false);
  assert.equal(MANGO_DETAIL_AB_EXPERIMENT.execute, false);
  assert.equal(MANGO_DETAIL_AB_EXPERIMENT.estimatedCalls, 2);
  assert.equal(PAID_IMAGE_QUALITY, 'medium');
  assert.equal(DEFAULT_GENERATION_SETTINGS.quality, 'medium');
  assert.equal(BATCH_2_SPEND_GATE.state, 'DENIED');
  const lock = familyLockLines({ canonicalSlug: 'mango', scientific: 'Mangifera indica', visualForm: 'tree' }).join(' ');
  assert.match(lock, /Avoid hyper-detailed studio-render microtexture/);
  assert.doesNotMatch(lock, /individually legible natural foliage/);
  const mango = AUDITOR_JOB_DETAIL.filter((j) => j.family === 'mango');
  assert.equal(mango.length, 3);
  assert.ok(mango.every((j) => j.ASSET_DETAIL === 'SOFT'));
  const banana = AUDITOR_JOB_DETAIL.filter((j) => j.family === 'banana');
  assert.ok(banana.every((j) => j.ASSET_DETAIL === 'CRISP_ENOUGH'));
  const overlay = JSON.parse(fs.readFileSync(written.overlayPath, 'utf8'));
  assert.equal(overlay.batchDetailClassificationCode, 'B');
  const html = fs.readFileSync(written.htmlPath, 'utf8');
  assert.match(html, /NATIVE ASSET INSPECTION/);
  assert.match(html, /STATE \/ FAMILY COMPARISON/);
  assert.match(html, /LOCKED owner finding: DETAIL_SOFT/);
  const results = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/garden-design/visual-state-calibration-batch-2/results.json'), 'utf8')
  );
  const mangoJobs = results.jobs.filter((j) => j.canonicalSlug === 'mango');
  assert.ok(mangoJobs.every((j) => j.OWNER_VISUAL_QA === 'NEEDS_IMPROVEMENT'));
  assert.ok(mangoJobs.every((j) => j.STATE_QA === 'UNKNOWN'));
  assert.ok(mangoJobs.every((j) => j.FAMILY_CONSISTENCY_QA === 'UNKNOWN'));
});
