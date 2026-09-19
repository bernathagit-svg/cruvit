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
  applyRound1Class,
  botanicalIdentityQaForCalibrationCandidate,
  assetQaForCalibrationCandidate,
  isCalibrationReviewOnlyPath,
  OWNER_VISUAL_QA_STORAGE_KEY,
  buildOwnerFeedbackSummary,
  buildRound1FinalSnapshot,
  derivePromptFactoryV2Learning,
  exportCalibrationRound1Learning,
  loadOwnerVisualQa,
  reconcileOwnerFeedbackIntegrity,
  inGardenQaForSession
} from '../modules/garden-design/asset-factory-v1/calibration-review-candidates-v1.js';
import { buildCalibrationReviewHtml } from '../modules/garden-design/asset-factory-v1/calibration-review-v1.js';
import { isUsableDesignVariant } from '../modules/garden-design/garden-design-asset-registry-v1.js';
import { RUNTIME_BLEND_V1 } from '../modules/garden-design/asset-factory-v1/in-garden-qa-v1.js';
import {
  buildPromptRecordV2,
  PROMPT_TEMPLATE_VERSION_V2,
  PROMPT_FACTORY_V2_LEARNING_STATUS,
  PROMPT_FACTORY_V2_TREE_RULES_STATUS
} from '../modules/garden-design/asset-factory-v1/prompt-factory-v2.js';

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
  assert.match(review, /download-round-1-final/);
  assert.match(review, /owner-feedback-integrity/);
  assert.match(review, /data-blend-scale="medium"/);
  assert.match(review, /raw-blend-pair/);
  assert.match(review, /owner-feedback-table-body/);
  assert.match(review, /RAW vs BLEND V1 vs BLEND V2/);
  assert.match(review, /data-composition-v2-class="RUNTIME_SOLVABLE"/);
  assert.match(review, /data-composition-v2-class="REGEN_REQUIRED"/);
  assert.match(review, /TREE_SCALE_MODEL/);
  assert.match(review, /composition-calibration-v2-runtime\.js/);
  assert.match(review, /Does this now look like a plant actually standing in the garden/);
  assert.match(review, /data-learning-class="REGEN_REQUIRED"/);
  assert.match(review, /cutout medium blend-v1/);
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
  assert.equal(summary.jobs[0].candidateAssetId, 'mango-mature-vegetative-v1');
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

test('round 1 learning export preserves session jobs and does not approve', () => {
  const mem = {
    mango: {
      canonicalSlug: 'mango',
      OWNER_VISUAL_QA: 'NEEDS_BLEND',
      fields: { STICKER_LOOK: true, SILHOUETTE: true, GROUND_CONTACT: true, HALO: true, COLOR_TONAL_MATCH: true }
    }
  };
  const learning = exportCalibrationRound1Learning(mem, { uiStatus: 'NO_ACTIVE_GARDEN' });
  assert.equal(learning.contract, 'calibration-round-1-learning-v1');
  assert.equal(learning.approvedAssets, 0);
  assert.equal(learning.regenerate, false);
  assert.equal(learning.jobs[0].candidateAssetId, 'mango-mature-vegetative-v1');
  assert.equal(learning.jobs[0].IN_GARDEN_QA, 'INVALID_FOR_THIS_SESSION');
  assert.equal(learning.IN_GARDEN_QA_ALIAS, 'NOT_RUN');
  assert.equal(learning.integrity, 'OWNER_FEEDBACK_INTEGRITY_FAILED');
  assert.equal(learning.frequencies.STICKER_LOOK, '1/8');
  assert.equal(learning.promptFactoryV2Finalized, false);
  const disk = JSON.parse(read('data/garden-design/calibration-batch-1/owner-learning-v1.json'));
  assert.equal(disk.approvedAssets, 0);
  assert.equal(disk.integrity, 'OWNER_FEEDBACK_INTEGRITY_FAILED');
  assert.equal(disk.authoritative, false);
  assert.equal(disk.productionRegistryChanged, undefined);
  assert.equal(disk.jobs.length, 8);
});

test('RAW vs BLEND V1 is runtime CSS only and cannot claim to fix architecture', () => {
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
  assert.match(html, /RAW vs BLEND V1 vs BLEND V2/);
  assert.match(html, /data-composition-v2-class="RUNTIME_SOLVABLE" disabled/);
  assert.match(html, /TREE_SCALE_MODEL/);
  assert.match(html, /ground-shadow/);
  assert.match(html, /data-blend-scale="medium"/);
  assert.match(html, /raw-blend-pair/);
  assert.match(html, /data-learning-class="BLEND_SOLVABLE" disabled/);
  assert.match(html, /data-learning-class="BLEND_SOLVABLE"/);
  assert.match(html, /data-learning-class="REGEN_REQUIRED"/);
  assert.match(html, /data-learning-class="REJECT_IDENTITY"/);
  assert.match(html, new RegExp(`blur\\(${RUNTIME_BLEND_V1.aids.edgeSofteningPx}px\\)`));
  assert.doesNotMatch(html, /api\.openai\.com/);
  assert.doesNotMatch(html, /images\/generations/);
  assert.equal(RUNTIME_BLEND_V1.canAddress.includes('STICKER_LOOK'), true);
  assert.equal(RUNTIME_BLEND_V1.cannotAddress.includes('PERSPECTIVE'), true);
  assert.equal(RUNTIME_BLEND_V1.cannotAddress.includes('SILHOUETTE'), true);
  assert.equal(RUNTIME_BLEND_V1.cannotAddress.includes('SCALE_REALISM'), true);
  assert.equal(RUNTIME_BLEND_V1.usesAiOrInpainting, false);
  assert.equal(RUNTIME_BLEND_V1.altersGardenPhoto, false);
});

test('Prompt Factory V2 is generic and does not spend', () => {
  const record = buildPromptRecordV2({
    canonicalSlug: 'mango',
    scientific: 'Mangifera indica',
    visualForm: 'tree',
    growthStage: 'mature',
    phenology: 'vegetative'
  });
  assert.equal(record.promptTemplateVersion, PROMPT_TEMPLATE_VERSION_V2);
  assert.equal(record.regenerate, false);
  assert.equal(PROMPT_FACTORY_V2_LEARNING_STATUS, 'NOT_FINALIZED_PENDING_OWNER_CLASSIFICATION');
  assert.match(record.prompt, /ground-level three-quarter/);
  assert.match(record.prompt, /forbid catalog elevation/);
  assert.match(record.prompt, /irregular organic/);
  assert.match(record.prompt, /Do not miniaturize/);
  assert.match(record.prompt, /runtime integration/);
  assert.match(record.prompt, /naturally grown garden specimen/);
  assert.equal(PROMPT_FACTORY_V2_TREE_RULES_STATUS, 'PREPARED_NOT_EXECUTED');
  assert.doesNotMatch(record.prompt, /Mangifera indica must/);
  const src = read('modules/garden-design/asset-factory-v1/prompt-factory-v2.js');
  assert.doesNotMatch(src, /api\.openai\.com/);
  const app = read('app.html');
  assert.match(app, /getCruvitTrustedGardenLocation/);
  assert.match(app, /const loc=ensureGardenLocation\(\);/);
});

function eightNeedsBlend(extraFieldsBySlug = {}) {
  const state = {};
  for (const row of CALIBRATION_BATCH_1_CANDIDATES) {
    const extra = extraFieldsBySlug[row.canonicalSlug] || {};
    state[row.canonicalSlug] = {
      canonicalSlug: row.canonicalSlug,
      OWNER_VISUAL_QA: 'NEEDS_BLEND',
      fields: {
        PERSPECTIVE: extra.PERSPECTIVE === true,
        GROUND_CONTACT: extra.GROUND_CONTACT === true,
        STICKER_LOOK: extra.STICKER_LOOK !== false,
        HALO: extra.HALO === true,
        SHARPNESS_MATCH: extra.SHARPNESS_MATCH === true,
        COLOR_TONAL_MATCH: extra.COLOR_TONAL_MATCH === true,
        SCALE_REALISM: extra.SCALE_REALISM === true,
        SILHOUETTE: extra.SILHOUETTE !== false
      }
    };
  }
  return state;
}

test('sessionStorage frequencies are sums of checked fields and do not invent plants', () => {
  const incomplete = {
    mango: {
      OWNER_VISUAL_QA: 'NEEDS_BLEND',
      fields: { STICKER_LOOK: true, SILHOUETTE: true, PERSPECTIVE: true }
    }
  };
  const failed = reconcileOwnerFeedbackIntegrity(incomplete);
  assert.equal(failed.code, 'OWNER_FEEDBACK_INTEGRITY_FAILED');
  assert.equal(failed.frequencies.STICKER_LOOK, '1/8');
  assert.equal(failed.frequencies.PERSPECTIVE, '1/8');
  assert.equal(derivePromptFactoryV2Learning(incomplete).code, 'OWNER_FEEDBACK_INTEGRITY_FAILED');
  assert.equal(derivePromptFactoryV2Learning(incomplete).finalized, false);

  const okState = eightNeedsBlend({
    mango: { PERSPECTIVE: true, SCALE_REALISM: true, SHARPNESS_MATCH: true, GROUND_CONTACT: true, HALO: true, COLOR_TONAL_MATCH: true },
    lavender: { PERSPECTIVE: true, SCALE_REALISM: true, SHARPNESS_MATCH: true },
    pineapple: { PERSPECTIVE: true, SCALE_REALISM: true, SHARPNESS_MATCH: true },
    banana: { PERSPECTIVE: true, SCALE_REALISM: true, SHARPNESS_MATCH: true },
    'areca-palm': { PERSPECTIVE: true, SCALE_REALISM: true, SHARPNESS_MATCH: true },
    bougainvillea: { PERSPECTIVE: true, SCALE_REALISM: true, SHARPNESS_MATCH: true },
    'aloe-vera': { PERSPECTIVE: true, SCALE_REALISM: true },
    eggplant: {}
  });
  const ok = reconcileOwnerFeedbackIntegrity(okState);
  assert.equal(ok.code, 'OWNER_FEEDBACK_INTEGRITY_OK');
  assert.equal(ok.frequencies.STICKER_LOOK, '8/8');
  assert.equal(ok.frequencies.SILHOUETTE, '8/8');
  assert.equal(ok.frequencies.PERSPECTIVE, '7/8');
  assert.equal(ok.frequencies.SCALE_REALISM, '7/8');
  assert.equal(ok.frequencies.SHARPNESS_MATCH, '6/8');
  assert.equal(ok.frequencies.GROUND_CONTACT, '1/8');
  assert.equal(ok.frequencies.HALO, '1/8');
  assert.equal(ok.frequencies.COLOR_TONAL_MATCH, '1/8');
  assert.deepEqual(ok.jobs.find((j) => j.canonicalSlug === 'eggplant').checkedFields, ['STICKER_LOOK', 'SILHOUETTE']);
  const classified = applyRound1Class(okState, 'mango', 'REGEN_REQUIRED');
  assert.equal(classified.mango.OWNER_VISUAL_QA, 'NEEDS_BLEND');
  assert.equal(classified.mango.ROUND_1_CLASS, 'REGEN_REQUIRED');
  assert.equal(classified.mango.fields.STICKER_LOOK, true);
  assert.equal(derivePromptFactoryV2Learning(classified).code, 'OWNER_CLASSIFICATION_PENDING');
  const snapshot = buildRound1FinalSnapshot(okState, { uiStatus: 'NO_ACTIVE_GARDEN', capturedAt: '2026-09-19T00:00:00.000Z' });
  assert.equal(snapshot.integrity, 'OWNER_FEEDBACK_INTEGRITY_OK');
  assert.equal(snapshot.jobs[0].assetId, 'mango-mature-vegetative-v1');
  assert.equal(snapshot.promptFactoryV2Finalized, false);
});
