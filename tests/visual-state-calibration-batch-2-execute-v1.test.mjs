/**
 * Batch 2 paid execute. Mocked provider. Zero live spend.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APPROVED_BATCH_2_IDENTITY,
  BATCH_2_HARD_SPEND_USD,
  OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2,
  OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2_COMMAND,
  executeVisualStateCalibrationBatch2Paid,
  jobIdentityKey,
  lockedBatch2IdentityKeys,
  manifestMatchesApproved,
  parseOwnerApprovedVisualStateCalibrationBatch2,
  projectNextCallUsd,
  wouldViolateHardCap
} from '../modules/garden-design/asset-factory-v1/visual-state-calibration-batch-2-execute-v1.js';
import {
  BATCH_2_JOBS,
  BATCH_2_SPEND_GATE,
  executeVisualStateCalibrationBatch2
} from '../modules/garden-design/asset-factory-v1/visual-state-calibration-batch-2-prep-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const REGISTRY = path.join(ROOT, 'modules/garden-design/assets/plants/design-asset-registry-v1.json');

test('default factory state stays DENIED and owner flags are this-run-only', () => {
  assert.equal(BATCH_2_SPEND_GATE.state, 'DENIED');
  assert.equal(executeVisualStateCalibrationBatch2().executed, false);
  const denied = parseOwnerApprovedVisualStateCalibrationBatch2([]);
  assert.equal(denied.ownerApprovedThisRunOnly, false);
  assert.equal(denied.allowNetwork, false);
  const approved = parseOwnerApprovedVisualStateCalibrationBatch2(
    OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2_COMMAND.slice()
  );
  assert.equal(approved.ownerApprovedThisRunOnly, true);
  assert.equal(approved.maxJobs, 11);
  assert.equal(approved.maxCalls, 11);
  assert.equal(approved.maxRetries, 0);
  assert.equal(approved.maxSpendUsd, BATCH_2_HARD_SPEND_USD);
  assert.equal(OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2.carryForward, false);
  assert.equal(manifestMatchesApproved(BATCH_2_JOBS), true);
  assert.deepEqual(lockedBatch2IdentityKeys(), APPROVED_BATCH_2_IDENTITY.slice());
  assert.equal(BATCH_2_JOBS.some((job) => job.canonicalSlug === 'eggplant'), false);
});

test('execute without owner flags makes zero provider calls', async () => {
  let posts = 0;
  const result = await executeVisualStateCalibrationBatch2Paid([], {
    root: ROOT,
    writeFiles: false,
    plants: [],
    apiKeyRaw: 'sk-' + 'x'.repeat(40),
    postJson: async () => {
      posts += 1;
      return { status: 200, body: {} };
    }
  });
  assert.equal(result.blocked, true);
  assert.equal(result.attemptedCalls, 0);
  assert.equal(posts, 0);
  assert.equal(result.productionRegistryChanged, false);
  assert.equal(result.spendGateFinal, 'DENIED');
});

test('401 fail-fast stops after one call and does not retry', async () => {
  let posts = 0;
  const before = fs.readFileSync(REGISTRY);
  const result = await executeVisualStateCalibrationBatch2Paid(
    OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2_COMMAND.slice(),
    {
      root: ROOT,
      writeFiles: false,
      plants: [],
      apiKeyRaw: 'sk-' + 'x'.repeat(40),
      postJson: async () => {
        posts += 1;
        return { status: 401, body: { error: { message: 'Incorrect API key provided: sk-abc' } } };
      }
    }
  );
  assert.equal(posts, 1);
  assert.equal(result.attemptedCalls, 1);
  assert.equal(result.retries, 0);
  assert.equal(result.failFast.failFast, true);
  assert.equal(result.jobs.length, 11);
  assert.equal(result.jobs.filter((job) => job.httpStatus === 401).length, 1);
  assert.deepEqual(result.jobs.map(jobIdentityKey), APPROVED_BATCH_2_IDENTITY.slice());
  assert.equal(fs.readFileSync(REGISTRY).equals(before), true);
  assert.equal(result.autoApprovedAssets, 0);
  assert.equal(result.productionRegistryChanged, false);
  assert.equal(result.spendGateFinal, 'DENIED');
});

test('hard cap projection stops before a violating next call', () => {
  assert.equal(wouldViolateHardCap(0.19, 0.015, 0.2), true);
  assert.equal(wouldViolateHardCap(0.1, 0.015, 0.2), false);
  const projected = projectNextCallUsd([{ spendUsd: 0.011 }], 'family prompt');
  assert.ok(projected > 0.011);
  assert.ok(projected < 0.03);
});
