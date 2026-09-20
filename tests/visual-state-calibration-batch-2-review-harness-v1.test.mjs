/**
 * Batch 2 review harness correction. Zero spend. Does not mutate candidate PNGs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeVisualStateCalibrationBatch2Review } from '../modules/garden-design/asset-factory-v1/visual-state-calibration-batch-2-review-v1.js';
import { BATCH_2_SPEND_GATE } from '../modules/garden-design/asset-factory-v1/visual-state-calibration-batch-2-prep-v1.js';
import { MANGO_GARDEN_DESIGN_PREFERENCE } from '../modules/garden-design/asset-factory-v1/generic-tree-physical-scale-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PNG_DIR = path.join(
  ROOT,
  'modules/garden-design/assets/plants/batch-2-candidates/visual-state-calibration-batch-2'
);

test('batch-2 review harness uses production scale and dual modes without mutating PNGs', () => {
  const pngBefore = fs.readdirSync(PNG_DIR).map((name) => {
    const buf = fs.readFileSync(path.join(PNG_DIR, name));
    return { name, bytes: buf.length, sha8: buf.subarray(0, 16).toString('hex') };
  });
  const written = writeVisualStateCalibrationBatch2Review(ROOT);
  const html = fs.readFileSync(written.htmlPath, 'utf8');
  const pngAfter = fs.readdirSync(PNG_DIR).map((name) => {
    const buf = fs.readFileSync(path.join(PNG_DIR, name));
    return { name, bytes: buf.length, sha8: buf.subarray(0, 16).toString('hex') };
  });
  assert.deepEqual(pngAfter, pngBefore);
  assert.equal(written.usesProductionPhysicalScale, true);
  assert.equal(written.mangoOwnerPreferredRangePosition, 'LOW');
  assert.equal(MANGO_GARDEN_DESIGN_PREFERENCE.ownerPreferredRangePosition, 'LOW');
  assert.equal(BATCH_2_SPEND_GATE.state, 'DENIED');
  assert.match(html, /ASSET INSPECTION/);
  assert.match(html, /IN-GARDEN REVIEW/);
  assert.match(html, /data-lock-range-band="LOW"/);
  assert.match(html, /data-canonical-slug="mango"/);
  assert.match(html, /data-growth-stage="young"/);
  assert.match(html, /STAGE_AUTHORITY_UNKNOWN/);
  assert.match(html, /data-visual-form="herbaceous-clump"/);
  assert.match(html, /data-visual-form="shrub"/);
  assert.match(html, /physical-v1-scene/);
  assert.match(html, /visual-state-calibration-batch-2-review-runtime\.js/);
  assert.match(html, /checkerboard/);
  assert.doesNotMatch(html, /max-height: 82%/);
  assert.equal((html.match(/data-lock-range-band="LOW"/g) || []).length, 2);
  assert.ok(!html.includes('data:image'));
  const app = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
  assert.match(app, /visual-state-calibration-batch-2\.html\?v=20260919u/);
});
