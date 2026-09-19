/**
 * Calibration batch 1 owner visual review. Zero paid calls. Zero generation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CALIBRATION_BATCH_1_CANDIDATES,
  CALIBRATION_BATCH_1_CACHE_BUST,
  OWNER_VISUAL_VERDICTS,
  applyOwnerVisualVerdict,
  botanicalIdentityQaForCalibrationCandidate,
  assetQaForCalibrationCandidate,
  isCalibrationReviewOnlyPath
} from '../modules/garden-design/asset-factory-v1/calibration-review-candidates-v1.js';
import { buildCalibrationReviewHtml } from '../modules/garden-design/asset-factory-v1/calibration-review-v1.js';
import { isUsableDesignVariant } from '../modules/garden-design/garden-design-asset-registry-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('eight review-only candidate binaries exist and are marked candidate', () => {
  for (const row of CALIBRATION_BATCH_1_CANDIDATES) {
    const abs = path.join(
      ROOT,
      'modules/garden-design/assets/plants/batch-1-candidates/calibration-batch-1',
      row.file
    );
    assert.equal(fs.existsSync(abs), true, row.file);
    assert.ok(fs.statSync(abs).size > 1000);
    assert.equal(isCalibrationReviewOnlyPath(abs), true);
  }
  assert.equal(CALIBRATION_BATCH_1_CANDIDATES.length, 8);
  assert.deepEqual(OWNER_VISUAL_VERDICTS.slice(), ['GOOD', 'NEEDS_BLEND', 'REJECT']);
  assert.equal(botanicalIdentityQaForCalibrationCandidate(), 'UNKNOWN');
  assert.equal(assetQaForCalibrationCandidate(), 'UNKNOWN');
});

test('live calibration review wires actual cutouts, not placeholders', () => {
  const review = read('modules/garden-design/calibration-review.html');
  const app = read('app.html');
  assert.match(app, /#design-asset-calibration-review/);
  assert.match(app, new RegExp(`calibration-review\\.html\\?v=${CALIBRATION_BATCH_1_CACHE_BUST}`));
  assert.doesNotMatch(review, /generateAsset/);
  assert.doesNotMatch(review, /api\.openai\.com/);
  assert.doesNotMatch(review, /images\/generations/);
  assert.match(review, /OWNER_VISUAL_QA/);
  assert.match(review, /BOTANICAL_IDENTITY_QA/);
  assert.match(review, /ASSET_QA = UNKNOWN/);
  assert.match(review, /data-verdict="GOOD"/);
  assert.match(review, /data-verdict="NEEDS_BLEND"/);
  assert.match(review, /data-verdict="REJECT"/);
  assert.match(review, /data-field="PERSPECTIVE"/);
  assert.match(review, /data-field="SILHOUETTE"/);
  assert.match(review, /data-review-role="calibration-candidate"/);
  assert.match(review, /calibration-owner-visual-qa-v1\.js/);
  for (const row of CALIBRATION_BATCH_1_CANDIDATES) {
    assert.match(review, new RegExp(`id="job-${row.canonicalSlug}"`));
    assert.match(
      review,
      new RegExp(`assets/plants/batch-1-candidates/calibration-batch-1/${row.file.replace('.', '\\.')}`)
    );
  }
  assert.doesNotMatch(review, /<div class="ghost blocked">/);
});

test('Garden Design canvas and production registry do not consume calibration-batch-1', () => {
  const registry = read('modules/garden-design/assets/plants/design-asset-registry-v1.json');
  const canvas = read('modules/garden-design/index.html');
  const catalog = read('store/catalog.json');
  assert.doesNotMatch(registry, /calibration-batch-1/);
  assert.doesNotMatch(canvas, /calibration-batch-1/);
  assert.doesNotMatch(catalog, /calibration-batch-1/);
  assert.equal(
    isUsableDesignVariant({
      approvalStatus: 'candidate',
      file: 'batch-1-candidates/calibration-batch-1/mango-mature-vegetative-v1.png',
      transparencyReady: true
    }),
    false
  );
  const html = buildCalibrationReviewHtml([
    {
      rank: 1,
      canonicalSlug: 'mango',
      visualForm: 'tree',
      growthStage: 'mature',
      scientific: 'Mangifera indica',
      identityPrecision: 'SPECIES_SUPPORTED',
      variantKey: 'mature',
      priorityReason: 'owned-plants',
      whyUsefulForCalibration: 'tree',
      candidateRelPath: 'modules/garden-design/assets/plants/batch-1-candidates/calibration-batch-1/mango-mature-vegetative-v1.png'
    }
  ]);
  assert.match(html, /OWNER_VISUAL_QA/);
  assert.doesNotMatch(html, /data-in-garden-status="PASS"/);
  const next = applyOwnerVisualVerdict({}, 'mango', 'GOOD');
  assert.equal(next.mango.OWNER_VISUAL_QA, 'GOOD');
  assert.equal(next.mango.BOTANICAL_IDENTITY_QA, 'UNKNOWN');
  assert.equal(next.mango.ASSET_QA, 'UNKNOWN');
  assert.equal(next.mango.approvalStatus, 'candidate');
});
