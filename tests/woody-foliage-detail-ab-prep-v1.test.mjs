/**
 * Woody foliage detail A/B prep. Zero spend. Production prompt stays v1 / medium.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  CONTROL_JOB,
  WOODY_FOLIAGE_DETAIL_AB_RUN_ID,
  WOODY_FOLIAGE_DETAIL_AB_SPEND_GATE,
  buildWoodyFoliageDetailAbJobs,
  costPreflightWoodyFoliageDetailAb,
  executeWoodyFoliageDetailAb,
  writeWoodyFoliageDetailAbReports
} from '../modules/garden-design/asset-factory-v1/woody-foliage-detail-ab-prep-v1.js';
import { familyLockLines } from '../modules/garden-design/asset-factory-v1/prompt-factory-visual-state-family-v1.js';
import { DEFAULT_GENERATION_SETTINGS } from '../modules/garden-design/asset-factory-v1/prompt-factory-v1.js';
import { PAID_IMAGE_QUALITY } from '../modules/runtime-guards/paid-image-spend-gate-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('woody foliage A/B prep is two jobs, denied, and does not change production prompt or control PNG', () => {
  const controlPath = path.join(ROOT, CONTROL_JOB.file);
  const before = fs.readFileSync(controlPath);
  const shaBefore = crypto.createHash('sha256').update(before).digest('hex');
  const jobs = buildWoodyFoliageDetailAbJobs();
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].quality, 'medium');
  assert.equal(jobs[1].quality, 'high');
  assert.equal(jobs[0].prompt, jobs[1].prompt);
  assert.match(jobs[0].prompt, /individually legible natural mango leaves/);
  assert.match(jobs[0].prompt, /painterly foliage masses/);
  assert.match(jobs[0].prompt, /Do not request fake hyper-detail/);
  const written = writeWoodyFoliageDetailAbReports(ROOT);
  const after = fs.readFileSync(controlPath);
  assert.equal(crypto.createHash('sha256').update(after).digest('hex'), shaBefore);
  assert.equal(written.jobsPrepared, 2);
  assert.equal(written.costPreflight, 'READY');
  assert.equal(written.projectedMaxSpend, 0.21353);
  assert.equal(written.hardRunCapUsd, 0.3);
  assert.equal(executeWoodyFoliageDetailAb().openaiCalls, 0);
  assert.equal(executeWoodyFoliageDetailAb().executed, false);
  assert.equal(WOODY_FOLIAGE_DETAIL_AB_SPEND_GATE.state, 'DENIED');
  assert.equal(WOODY_FOLIAGE_DETAIL_AB_SPEND_GATE.maxCalls, 2);
  assert.equal(WOODY_FOLIAGE_DETAIL_AB_SPEND_GATE.maxRetries, 0);
  assert.equal(WOODY_FOLIAGE_DETAIL_AB_SPEND_GATE.maxSpendUsd, 0.3);
  assert.equal(WOODY_FOLIAGE_DETAIL_AB_RUN_ID, 'design-asset-woody-foliage-detail-ab-1');
  assert.equal(PAID_IMAGE_QUALITY, 'medium');
  assert.equal(DEFAULT_GENERATION_SETTINGS.quality, 'medium');
  const production = familyLockLines({
    canonicalSlug: 'mango',
    scientific: 'Mangifera indica',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'vegetative'
  }).join(' ');
  assert.match(production, /Avoid hyper-detailed studio-render microtexture/);
  assert.doesNotMatch(production, /individually legible natural mango leaves/);
  const html = fs.readFileSync(written.reviewHtml, 'utf8');
  assert.match(html, /CONTROL — old prompt \/ medium/);
  assert.match(html, /DETAIL_OK/);
  assert.match(html, /OVER_SHARP/);
  assert.doesNotMatch(html, /data:image/);
  const generatedA = fs.existsSync(
    path.join(
      ROOT,
      'modules/garden-design/assets/plants/woody-foliage-detail-ab-1/mango__mature__tree__vegetative__detail-v2__medium.png'
    )
  );
  if (generatedA) {
    assert.match(html, /detail-v2__medium\.png/);
    assert.match(html, /detail-v2__high\.png/);
    assert.doesNotMatch(html, /ASSET NOT GENERATED/);
  } else {
    assert.match(html, /ASSET NOT GENERATED/);
  }
  const cost = costPreflightWoodyFoliageDetailAb();
  assert.equal(cost.paidProbe, false);
  assert.equal(cost.highArm.imageOutputUsd, 0.165);
  assert.equal(cost.mediumArm.projectedUsd, 0.044765);
  assert.equal(cost.highArm.projectedUsd, 0.168765);
  assert.equal(cost.projectedTotalUsd, 0.21353);
  assert.equal(cost.hardRunCapUsd, 0.3);
  assert.equal(cost.status, 'WOODY_FOLIAGE_DETAIL_AB_COST_PREFLIGHT_READY');
});
