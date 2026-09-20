/**
 * BRANCH_STRUCTURE paid execute. Mocked provider unless owner flags. Zero live spend in tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION_COMMAND,
  executeBranchStructureCalibrationPaid,
  parseOwnerApprovedBranchStructureCalibration,
  projectNextCallUsd,
  wouldViolateHardCap
} from '../modules/garden-design/asset-factory-v1/branch-structure-calibration-execute-v1.js';
import { executeBranchStructureCalibration } from '../modules/garden-design/asset-factory-v1/branch-structure-calibration-prep-v1.js';

test('branch-structure execute stays DENIED without owner flags and makes zero provider calls', async () => {
  assert.equal(executeBranchStructureCalibration().executed, false);
  const denied = parseOwnerApprovedBranchStructureCalibration([]);
  assert.equal(denied.ownerApprovedThisRunOnly, false);
  let posts = 0;
  const result = await executeBranchStructureCalibrationPaid([], {
    apiKeyRaw: 'sk-test-not-used',
    postJson: async () => {
      posts += 1;
      return { status: 200, body: { data: [{ b64_json: 'aaaa' }] } };
    },
    writeFiles: false
  });
  assert.equal(result.blocked, true);
  assert.equal(result.attemptedCalls, 0);
  assert.equal(posts, 0);
  assert.equal(result.spendGateFinal, 'DENIED');
});

test('owner envelope matches exact 1-call medium lock and rejects HIGH', () => {
  const approved = parseOwnerApprovedBranchStructureCalibration(
    OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION_COMMAND.slice()
  );
  assert.equal(approved.ownerApprovedThisRunOnly, true);
  assert.equal(approved.quality, 'medium');
  assert.equal(approved.maxJobs, 1);
  assert.equal(approved.maxCalls, 1);
  assert.equal(approved.maxRetries, 0);
  assert.equal(approved.maxSpendUsd, 0.03);
  const bad = parseOwnerApprovedBranchStructureCalibration([
    ...OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION_COMMAND,
    '--quality=high'
  ]);
  assert.equal(bad.ownerApprovedThisRunOnly, false);
  assert.equal(wouldViolateHardCap(0, 0.0143), false);
  assert.equal(wouldViolateHardCap(0, 0.04), true);
  assert.ok(projectNextCallUsd() <= 0.03);
});

test('mocked 1 medium call stays under cap, retry 0, no registry write', async () => {
  let posts = 0;
  const result = await executeBranchStructureCalibrationPaid(
    OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION_COMMAND.slice(),
    {
      apiKeyRaw: 'sk-test-not-used-abcdefghijklmnopqrstuvwxyz',
      postJson: async (_url, _key, body) => {
        posts += 1;
        assert.equal(body.model, 'gpt-image-2.5-flare-2026-09-08');
        assert.equal(body.quality, 'medium');
        assert.equal(body.size, '1024x1536');
        assert.equal(body.background, 'transparent');
        assert.equal(body.output_format, 'png');
        assert.notEqual(body.quality, 'high');
        return {
          status: 200,
          body: {
            data: [{ b64_json: Buffer.from('fake-png').toString('base64') }],
            usage: {
              input_tokens_details: { text_tokens: 700, image_tokens: 0 },
              output_tokens: 343
            }
          }
        };
      },
      writeFiles: false
    }
  );
  assert.equal(result.blocked, false);
  assert.equal(result.executed, true);
  assert.equal(posts, 1);
  assert.equal(result.attemptedCalls, 1);
  assert.equal(result.retries, 0);
  assert.equal(result.highCalls, 0);
  assert.ok(result.actualSpendUsd <= 0.03);
  assert.equal(result.autoApprovedAssets, 0);
  assert.equal(result.productionRegistryChanged, false);
  assert.equal(result.controlChanged, false);
  assert.equal(result.spendGateFinal, 'DENIED');
  assert.equal(result.jobs[0].outputStatus, 'CALIBRATION_CANDIDATE');
});
