import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const planPath=path.join(ROOT,'data/garden-design/plant-visual-in-garden-vision-qa-plans/plant-visual-wave-001-in-garden-vision-qa-2026-09-22-v1.json');
const executorPath=path.join(ROOT,'netlify/functions/plant-visual-in-garden-vision-qa-job.mjs');
const statusPath=path.join(ROOT,'netlify/functions/plant-visual-in-garden-vision-qa-status.mjs');

test('in-garden vision plan contains only geometry-pass jobs',()=>{
  const plan=JSON.parse(fs.readFileSync(planPath,'utf8'));
  assert.equal(plan.contract,'plant-visual-in-garden-vision-qa-plan-v1');
  assert.equal(plan.jobCount,7);
  assert.equal(plan.executionPolicy.maxCalls,7);
  assert.equal(plan.executionPolicy.maxRetries,0);
  assert.equal(plan.executionPolicy.productionWritesAllowed,false);
  assert.equal(plan.executionPolicy.registryWritesAllowed,false);
  assert.ok(plan.jobs.every(j=>j.captureObjectKey&&j.captureSha256));
});

test('in-garden vision executor is approval-gated and integrity-bound',()=>{
  const source=fs.readFileSync(executorPath,'utf8');
  assert.match(source,/plant-visual-in-garden-vision-qa-spend-approval-v1/);
  assert.match(source,/IN_GARDEN_VISION_SPEND_OWNER_APPROVAL_REQUIRED/);
  assert.match(source,/IN_GARDEN_VISION_SPEND_CAP_REACHED/);
  assert.match(source,/IN_GARDEN_CAPTURE_INTEGRITY_MISMATCH/);
  assert.match(source,/perCallReserveUsd/);
  assert.doesNotMatch(source,/PLANT_VISUAL_R2_PRODUCTION_BUCKET/);
  assert.doesNotMatch(source,/design-asset-registry-v1\.json/);
});

test('in-garden vision status is read-only',()=>{
  const source=fs.readFileSync(statusPath,'utf8');
  assert.match(source,/GetObjectCommand/);
  assert.doesNotMatch(source,/PutObjectCommand/);
  assert.match(source,/productionWrites:0/);
  assert.match(source,/registryWrites:0/);
});
