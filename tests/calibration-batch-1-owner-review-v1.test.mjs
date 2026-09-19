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
  isCalibrationReviewOnlyPath,
  OWNER_VISUAL_QA_STORAGE_KEY,
  buildOwnerFeedbackSummary,
  loadOwnerVisualQa,
  inGardenQaForSession
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
  assert.match(review, /Copy review summary/);
  assert.match(review, /owner-feedback-table-body/);
  assert.equal(OWNER_VISUAL_QA_STORAGE_KEY, 'cruvit:calibration-batch-1-owner-visual-qa');
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

test('owner feedback summary reads session state and does not fabricate or approve', () => {
  const mem = {
    mango: {
      canonicalSlug: 'mango',
      OWNER_VISUAL_QA: 'NEEDS_BLEND',
      fields: { PERSPECTIVE: true, STICKER_LOOK: true, GROUND_CONTACT: false }
    },
    lavender: {
      canonicalSlug: 'lavender',
      OWNER_VISUAL_QA: 'REJECT',
      fields: { SCALE_REALISM: true }
    }
  };
  const summary = buildOwnerFeedbackSummary(mem, { uiStatus: 'NO_ACTIVE_GARDEN' });
  assert.equal(summary.storageKey, OWNER_VISUAL_QA_STORAGE_KEY);
  assert.equal(summary.jobs.length, 8);
  assert.equal(summary.jobs[0].OWNER_VISUAL_QA, 'NEEDS_BLEND');
  assert.deepEqual(summary.jobs[0].checkedFields, ['PERSPECTIVE', 'STICKER_LOOK']);
  assert.equal(summary.jobs[1].OWNER_VISUAL_QA, 'REJECT');
  assert.equal(summary.jobs[2].OWNER_VISUAL_QA, 'UNREVIEWED');
  assert.equal(summary.IN_GARDEN_QA, 'INVALID_FOR_THIS_SESSION');
  assert.equal(inGardenQaForSession('NO_ACTIVE_GARDEN'), 'INVALID_FOR_THIS_SESSION');
  assert.equal(inGardenQaForSession('REAL_GARDEN_SOURCE_LOADED'), 'UNKNOWN');
  assert.equal(summary.BOTANICAL_IDENTITY_QA, 'UNKNOWN');
  assert.equal(summary.ASSET_QA, 'UNKNOWN');
  assert.equal(summary.writeProductionRegistry, false);
  assert.equal(summary.promptCorrectionMap.regenerate, false);
  assert.ok(summary.promptCorrectionMap.byField.PERSPECTIVE);
  assert.ok(summary.promptCorrectionMap.byField.SCALE_REALISM);
  assert.equal(summary.promptCorrectionMap.byField.HALO, undefined);

  const disk = JSON.parse(read('data/garden-design/calibration-batch-1/owner-feedback-v1.json'));
  assert.equal(disk.buildTimeFabrication, false);
  assert.deepEqual(disk.jobs, []);
  assert.equal(disk.IN_GARDEN_QA, 'INVALID_FOR_THIS_SESSION');

  let writes = 0;
  const store = {
    getItem(key) {
      assert.equal(key, OWNER_VISUAL_QA_STORAGE_KEY);
      return JSON.stringify(mem);
    },
    setItem() {
      writes += 1;
    }
  };
  const loaded = loadOwnerVisualQa(store);
  assert.equal(loaded.mango.OWNER_VISUAL_QA, 'NEEDS_BLEND');
  assert.equal(writes, 0);
});
