import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const planPath=path.join(ROOT,'data/garden-design/plant-visual-model-qa-plans/plant-visual-wave-001-model-qa-2026-09-22-v1.json');
const executorPath=path.join(ROOT,'netlify/functions/plant-visual-model-qa-job.mjs');
const statusPath=path.join(ROOT,'netlify/functions/plant-visual-model-qa-status.mjs');

test('Wave 1 model QA plan is bounded and excludes known generation exceptions',()=>{
  const plan=JSON.parse(fs.readFileSync(planPath,'utf8'));
  assert.equal(plan.contract,'plant-visual-model-qa-plan-v1');
  assert.equal(plan.jobCount,21);
  assert.equal(plan.executionPolicy.ownerSpendApprovalRequired,true);
  assert.equal(plan.executionPolicy.maxRetries,0);
  assert.equal(plan.executionPolicy.productionWritesAllowed,false);
  assert.equal(plan.executionPolicy.registryWritesAllowed,false);
  assert.ok(plan.jobs.every(j=>j.canonicalSlug!=='bougainvillea'));
  assert.ok(plan.jobs.every(j=>j.jobId!=='apple__mature__tree__vegetative__v1'));
});

test('model QA executor requires explicit spend approval and candidate integrity',()=>{
  const source=fs.readFileSync(executorPath,'utf8');
  assert.match(source,/plant-visual-model-qa-spend-approval-v1/);
  assert.match(source,/MODEL_QA_SPEND_OWNER_APPROVAL_REQUIRED/);
  assert.match(source,/MODEL_QA_SPEND_CAP_REACHED/);
  assert.match(source,/CANDIDATE_INTEGRITY_MISMATCH/);
  assert.match(source,/perCallReserveUsd/);
  assert.match(source,/max_output_tokens:400/);
  assert.match(source,/gpt-5\.6-luna|plan\.model/);
  assert.doesNotMatch(source,/PLANT_VISUAL_R2_PRODUCTION_BUCKET/);
  assert.doesNotMatch(source,/design-asset-registry-v1\.json/);
});

test('model QA status endpoint is read-only and non-production',()=>{
  const source=fs.readFileSync(statusPath,'utf8');
  assert.match(source,/GetObjectCommand/);
  assert.doesNotMatch(source,/PutObjectCommand/);
  assert.match(source,/productionWrites:0/);
  assert.match(source,/registryWrites:0/);
  assert.doesNotMatch(source,/PLANT_VISUAL_R2_PRODUCTION_BUCKET/);
});
