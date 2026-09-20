/**
 * Mango native-detail root-cause recording. Zero spend. Candidate PNGs must stay identical.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  MANGO_DETAIL_JOBS,
  MANGO_GENERATION_SETTINGS_USED,
  MANGO_OWNER_DETAIL_VERDICT,
  MANGO_ROOT_CAUSE,
  assertMangoCandidatesUnmodified,
  writeMangoAssetDetailRootCause
} from '../modules/garden-design/asset-factory-v1/mango-asset-detail-root-cause-v1.js';
import { BATCH_2_SPEND_GATE } from '../modules/garden-design/asset-factory-v1/visual-state-calibration-batch-2-prep-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('mango owner detail QA is recorded without modifying binaries or spending', () => {
  const before = MANGO_DETAIL_JOBS.map((job) => {
    const buf = fs.readFileSync(path.join(ROOT, job.file));
    return { jobId: job.jobId, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
  });
  const written = writeMangoAssetDetailRootCause(ROOT);
  const after = MANGO_DETAIL_JOBS.map((job) => {
    const buf = fs.readFileSync(path.join(ROOT, job.file));
    return { jobId: job.jobId, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
  });
  assert.deepEqual(after, before);
  assert.equal(assertMangoCandidatesUnmodified(ROOT).candidateBinariesModified, false);
  assert.equal(written.openaiCalls, 0);
  assert.equal(written.additionalSpendUsd, 0);
  assert.equal(MANGO_ROOT_CAUSE, 'PROVIDER_OUTPUT_ALREADY_SOFT');
  assert.equal(MANGO_OWNER_DETAIL_VERDICT.OWNER_VISUAL_QA, 'NEEDS_IMPROVEMENT');
  assert.equal(MANGO_OWNER_DETAIL_VERDICT.issue, 'ASSET_DETAIL_SOFT');
  assert.equal(MANGO_GENERATION_SETTINGS_USED.quality, 'medium');
  assert.equal(MANGO_GENERATION_SETTINGS_USED.requestedImageSize, '1024x1536');
  assert.equal(BATCH_2_SPEND_GATE.state, 'DENIED');
  const results = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/garden-design/visual-state-calibration-batch-2/results.json'), 'utf8')
  );
  const mango = results.jobs.filter((job) => job.canonicalSlug === 'mango');
  assert.equal(mango.length, 3);
  for (const job of mango) {
    assert.equal(job.OWNER_VISUAL_QA, 'NEEDS_IMPROVEMENT');
    assert.equal(job.OWNER_VISUAL_QA_ISSUE, 'ASSET_DETAIL_SOFT');
    assert.equal(job.ASSET_DETAIL_SOFT, true);
    assert.equal(job.approvalStatus, 'candidate');
    assert.equal(job.STATE_QA, 'UNKNOWN');
    assert.equal(job.FAMILY_CONSISTENCY_QA, 'UNKNOWN');
  }
});
