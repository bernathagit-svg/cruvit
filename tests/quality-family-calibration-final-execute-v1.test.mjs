/**
 * Quality-family final paid execute. Mocked provider unless owner flags. Zero live spend in tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OWNER_APPROVED_QUALITY_FAMILY_FINAL_COMMAND,
  executeQualityFamilyCalibrationFinalPaid,
  parseOwnerApprovedQualityFamilyFinal,
  projectNextCallUsd,
  wouldViolateHardCap
} from '../modules/garden-design/asset-factory-v1/quality-family-calibration-final-execute-v1.js';
import { executeQualityFamilyCalibrationFinal } from '../modules/garden-design/asset-factory-v1/quality-family-calibration-final-prep-v1.js';

test('quality-family final stays DENIED without owner flags and makes zero provider calls', async () => {
  assert.equal(executeQualityFamilyCalibrationFinal().executed, false);
  const denied = parseOwnerApprovedQualityFamilyFinal([]);
  assert.equal(denied.ownerApprovedThisRunOnly, false);
  let posts = 0;
  const result = await executeQualityFamilyCalibrationFinalPaid([], {
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

test('owner envelope matches exact 7-call medium lock and rejects HIGH', () => {
  const approved = parseOwnerApprovedQualityFamilyFinal(
    OWNER_APPROVED_QUALITY_FAMILY_FINAL_COMMAND.slice()
  );
  assert.equal(approved.ownerApprovedThisRunOnly, true);
  assert.equal(approved.quality, 'medium');
  assert.equal(approved.maxJobs, 7);
  assert.equal(approved.maxCalls, 7);
  assert.equal(approved.maxRetries, 0);
  assert.equal(approved.maxSpendUsd, 0.15);
  const bad = parseOwnerApprovedQualityFamilyFinal([
    ...OWNER_APPROVED_QUALITY_FAMILY_FINAL_COMMAND,
    '--quality=high'
  ]);
  assert.equal(bad.ownerApprovedThisRunOnly, false);
});

test('mocked 7 medium calls stay under cap, retry 0, no registry write', async () => {
  let posts = 0;
  const result = await executeQualityFamilyCalibrationFinalPaid(
    OWNER_APPROVED_QUALITY_FAMILY_FINAL_COMMAND.slice(),
    {
      apiKeyRaw: 'sk-test-not-used-abcdefghijklmnopqrstuvwxyz',
      postJson: async (_url, _key, body) => {
        posts += 1;
        assert.equal(body.model, 'gpt-image-2.5-flare-2026-09-08');
        assert.equal(body.quality, 'medium');
        assert.equal(body.size, '1024x1536');
        assert.equal(body.background, 'transparent');
        assert.equal(body.output_format, 'png');
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
  assert.equal(posts, 7);
  assert.equal(result.attemptedCalls, 7);
  assert.equal(result.successfulCalls, 7);
  assert.equal(result.retries, 0);
  assert.equal(result.highCalls, 0);
  assert.equal(result.autoApprovedAssets, 0);
  assert.equal(result.productionRegistryChanged, false);
  assert.equal(result.massGenerationStarted, false);
  assert.equal(result.spendGateFinal, 'DENIED');
  assert.ok(result.actualSpendUsd <= 0.15);
  assert.ok(result.jobs.every((job) => job.quality === 'medium'));
  assert.ok(result.jobs.every((job) => job.OWNER_VISUAL_QA === 'UNKNOWN'));
  assert.ok(result.jobs.every((job) => job.familyPolicy === null));
});

test('hard cap projection stops before a violating next call', () => {
  const next = projectNextCallUsd([{ spendUsd: 0.04 }]);
  assert.equal(wouldViolateHardCap(0.12, next, 0.15), true);
  assert.equal(wouldViolateHardCap(0, projectNextCallUsd([]), 0.15), false);
});
