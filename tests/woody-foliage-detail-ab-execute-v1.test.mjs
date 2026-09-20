/**
 * Woody foliage A/B paid execute. Mocked provider unless owner flags. Zero live spend in tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OWNER_APPROVED_WOODY_FOLIAGE_DETAIL_AB_COMMAND,
  executeWoodyFoliageDetailAbPaid,
  parseOwnerApprovedWoodyFoliageDetailAb
} from '../modules/garden-design/asset-factory-v1/woody-foliage-detail-ab-execute-v1.js';
import { executeWoodyFoliageDetailAb } from '../modules/garden-design/asset-factory-v1/woody-foliage-detail-ab-prep-v1.js';

test('woody foliage A/B stays DENIED without owner flags and makes zero provider calls', async () => {
  assert.equal(executeWoodyFoliageDetailAb().executed, false);
  const denied = parseOwnerApprovedWoodyFoliageDetailAb([]);
  assert.equal(denied.ownerApprovedThisRunOnly, false);
  let posts = 0;
  const result = await executeWoodyFoliageDetailAbPaid([], {
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
});

test('owner envelope matches exact 2-call medium/high lock', () => {
  const approved = parseOwnerApprovedWoodyFoliageDetailAb(
    OWNER_APPROVED_WOODY_FOLIAGE_DETAIL_AB_COMMAND.slice()
  );
  assert.equal(approved.ownerApprovedThisRunOnly, true);
  assert.equal(approved.qualityA, 'medium');
  assert.equal(approved.qualityB, 'high');
  assert.equal(approved.maxRetries, 0);
  const bad = parseOwnerApprovedWoodyFoliageDetailAb([
    ...OWNER_APPROVED_WOODY_FOLIAGE_DETAIL_AB_COMMAND,
    '--quality-b=xhigh'
  ]);
  assert.equal(bad.ownerApprovedThisRunOnly, false);
});
