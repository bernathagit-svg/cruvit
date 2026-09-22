import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(
  ROOT,
  'data/garden-design/plant-visual-production-wave-execution-manifests/plant-visual-wave-001-2026-09-22-v1.json'
);
const generatorPath = path.join(ROOT, 'netlify/functions/plant-visual-generate-wave-job.mjs');
const statusPath = path.join(ROOT, 'netlify/functions/plant-visual-wave-status.mjs');

function read(rel) {
  return fs.readFileSync(rel, 'utf8');
}

test('Wave 1 execution manifest is bounded and remains pre-spend', () => {
  const manifest = JSON.parse(read(manifestPath));
  assert.equal(manifest.contract, 'plant-visual-production-wave-execution-manifest-v1');
  assert.equal(manifest.runId, 'plant-visual-wave-001-2026-09-22-v1');
  assert.equal(manifest.jobCount, 24);
  assert.equal(manifest.plantCount, 11);
  assert.equal(manifest.jobs.length, 24);
  assert.equal(new Set(manifest.jobs.map((row) => row.jobId)).size, 24);
  assert.equal(new Set(manifest.jobs.map((row) => row.canonicalSlug)).size, 11);
  assert.equal(manifest.executionPolicy.maxCalls, 24);
  assert.equal(manifest.executionPolicy.maxJobs, 24);
  assert.equal(manifest.executionPolicy.maxRetries, 0);
  assert.equal(manifest.executionPolicy.ownerSpendApprovalRequired, true);
  assert.equal(manifest.executionPolicy.productionWritesAllowed, false);
  assert.equal(manifest.executionPolicy.registryWritesAllowed, false);
  assert.equal(manifest.spendPreflight.mediumJobs, 23);
  assert.equal(manifest.spendPreflight.highJobs, 1);
  assert.equal(manifest.spendPreflight.projectedMaximumSpendUsd, 2.457);
});

test('Wave 1 generator is approval-gated and writes only candidate R2 plus evidence', () => {
  const source = read(generatorPath);
  assert.match(source, /plant-visual-production-wave-spend-approval-v1/);
  assert.match(source, /PAID_SPEND_OWNER_APPROVAL_REQUIRED/);
  assert.match(source, /PLANT_VISUAL_R2_CANDIDATES_BUCKET/);
  assert.match(source, /CANDIDATE_GENERATED_AND_R2_VERIFIED/);
  assert.match(source, /CANDIDATE_READBACK_INTEGRITY_MISMATCH/);
  assert.match(source, /IfNoneMatch:\s*['"]\*['"]/);
  assert.match(source, /maxRetries\)\s*!==\s*0/);
  assert.doesNotMatch(source, /PLANT_VISUAL_R2_PRODUCTION_BUCKET/);
  assert.doesNotMatch(source, /design-asset-registry-v1\.json/);
  assert.doesNotMatch(source, /productionReadbackVerified/);
});

test('Wave 1 status endpoint is read-only', () => {
  const source = read(statusPath);
  assert.match(source, /GetObjectCommand/);
  assert.match(source, /productionWrites:\s*0/);
  assert.match(source, /registryWrites:\s*0/);
  assert.doesNotMatch(source, /PutObjectCommand/);
  assert.doesNotMatch(source, /OPENAI_KEY|OPENAI_API_KEY/);
  assert.doesNotMatch(source, /PLANT_VISUAL_R2_PRODUCTION_BUCKET/);
});
