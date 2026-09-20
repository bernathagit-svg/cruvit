/**
 * Batch-2 Mango native-detail root-cause audit. Records owner QA.
 * Does not regenerate, call OpenAI, resize, or modify candidate PNGs.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { BATCH_2_SPEND_GATE } from './visual-state-calibration-batch-2-prep-v1.js';
import { DEFAULT_GENERATION_SETTINGS } from './prompt-factory-v1.js';
import {
  PAID_IMAGE_MODEL,
  PAID_IMAGE_SIZE,
  PAID_IMAGE_QUALITY
} from '../../runtime-guards/paid-image-spend-gate-v1.js';
import { writeVisualStateCalibrationBatch2Review } from './visual-state-calibration-batch-2-review-v1.js';
import { PROMPT_TEMPLATE_VERSION_VISUAL_STATE_FAMILY } from './prompt-factory-visual-state-family-v1.js';

export const MANGO_ASSET_DETAIL_ROOT_CAUSE_VERSION = 'mango-asset-detail-root-cause-v1';

export const MANGO_OWNER_DETAIL_VERDICT = Object.freeze({
  family: 'mango',
  ASSET_DETAIL_SOFT: true,
  OWNER_VISUAL_QA: 'NEEDS_IMPROVEMENT',
  issue: 'ASSET_DETAIL_SOFT',
  approvalStatus: 'candidate',
  productionApproved: false
});

export const MANGO_DETAIL_JOBS = Object.freeze([
  {
    rank: 1,
    jobId: 'mango__mature__tree__vegetative__v1',
    label: 'mango TREE MATURE VEGETATIVE',
    file: 'modules/garden-design/assets/plants/batch-2-candidates/visual-state-calibration-batch-2/mango__mature__tree__vegetative__v1.png',
    bytes: 2592518,
    sha256: '1f1d10bcd8d3ec3f917b899e3166095df050b86d6a81764d6abf6373b1857dd3',
    pixelDimensions: '1024x1536',
    colorMode: 'RGBA',
    bitDepth: 8,
    colorType: 6,
    alphaPresent: true,
    interlace: 0,
    providerOutputDimensions: '1024x1536',
    dimensionsMatchProviderRequest: true,
    generationTimeBytes: 2592518,
    committedBytesMatchGenerationRecord: true,
    providerFingerprintChunk: 'caBX',
    originalCommit: 'ac52805552c44ee9d97d3479d38f6de10816c399'
  },
  {
    rank: 2,
    jobId: 'mango__young__tree__vegetative__v1',
    label: 'mango TREE YOUNG VEGETATIVE',
    file: 'modules/garden-design/assets/plants/batch-2-candidates/visual-state-calibration-batch-2/mango__young__tree__vegetative__v1.png',
    bytes: 1983976,
    sha256: '5fb8aefd48787a609470c8751d3ad32a7a1e55a2df488d02c4cd70a4102c360c',
    pixelDimensions: '1024x1536',
    colorMode: 'RGBA',
    bitDepth: 8,
    colorType: 6,
    alphaPresent: true,
    interlace: 0,
    providerOutputDimensions: '1024x1536',
    dimensionsMatchProviderRequest: true,
    generationTimeBytes: 1983976,
    committedBytesMatchGenerationRecord: true,
    providerFingerprintChunk: 'caBX',
    originalCommit: 'ac52805552c44ee9d97d3479d38f6de10816c399'
  },
  {
    rank: 3,
    jobId: 'mango__mature__tree__fruiting__v1',
    label: 'mango TREE MATURE FRUITING',
    file: 'modules/garden-design/assets/plants/batch-2-candidates/visual-state-calibration-batch-2/mango__mature__tree__fruiting__v1.png',
    bytes: 2799408,
    sha256: 'da3496bdcbc2df398a1180f2bf7c534025674f78561ee491cad26dc8c4f14615',
    pixelDimensions: '1024x1536',
    colorMode: 'RGBA',
    bitDepth: 8,
    colorType: 6,
    alphaPresent: true,
    interlace: 0,
    providerOutputDimensions: '1024x1536',
    dimensionsMatchProviderRequest: true,
    generationTimeBytes: 2799408,
    committedBytesMatchGenerationRecord: true,
    providerFingerprintChunk: 'caBX',
    originalCommit: 'ac52805552c44ee9d97d3479d38f6de10816c399'
  }
]);

export const MANGO_GENERATION_SETTINGS_USED = Object.freeze({
  model: PAID_IMAGE_MODEL,
  requestedImageSize: PAID_IMAGE_SIZE,
  quality: PAID_IMAGE_QUALITY,
  background: DEFAULT_GENERATION_SETTINGS.background,
  outputFormat: DEFAULT_GENERATION_SETTINGS.outputFormat,
  n: 1,
  compressionParameter: null,
  familyPromptVersion: PROMPT_TEMPLATE_VERSION_VISUAL_STATE_FAMILY
});

export const MANGO_POSTPROCESS_AUDIT = Object.freeze({
  decodeReencodeStep: false,
  resizeStep: false,
  canvasDrawImageStep: false,
  pngOptimizationCompressionStep: false,
  conversionAfterApiResponse: 'base64-decode-only',
  note: 'Execute writes Buffer.from(b64_json) with fs.writeFileSync. Technical QA decodes in memory only. Review writes HTML only. caBX C2PA chunk retained — typical re-encoders strip it.'
});

export const MANGO_ROOT_CAUSE = 'PROVIDER_OUTPUT_ALREADY_SOFT';

export const MANGO_FAMILY_STATE_QA_SEPARATE = Object.freeze({
  IDENTITY_CONTINUITY: 'OWNER_REVIEW_PENDING',
  YOUNG_STATE: 'OWNER_REVIEW_PENDING',
  FRUITING_STATE: 'OWNER_REVIEW_PENDING',
  FAMILY_CONSISTENCY: 'OWNER_REVIEW_PENDING',
  notScoredFromSoftness: true
});

export const MANGO_PROMPT_DETAIL_GAPS = Object.freeze([
  'individually legible natural leaves at normal viewing scale — ABSENT',
  'realistic fine botanical texture — ABSENT as a positive requirement',
  'crisp photographic foliage detail — only generic “natural photographic outdoor sharpness”',
  'natural branch/leaf separation — ABSENT',
  'no painterly foliage — ABSENT',
  'no soft-focus treatment — ABSENT',
  'no depth-of-field blur across the specimen — ABSENT',
  'no excessive micro-detail that becomes synthetic — PARTIAL (anti-CGI line exists, may suppress real leaf edges)'
]);

export const MANGO_PROPOSED_ZERO_SPEND_CORRECTIONS = Object.freeze([
  'Keep candidate binaries unchanged. Do not bake sharpen, crop, or resize.',
  'Do not call OpenAI. Do not retry. Spend gate stays DENIED.',
  'Next prompt revision (not applied now): require individually legible natural leaflets, realistic fine botanical texture, crisp photographic foliage, natural branch/leaf separation; forbid painterly clumps, soft-focus, and specimen-wide DOF blur.',
  'Next prompt revision (not applied now): keep forbidding oversharpened cutout edges, HDR look, crunchy synthetic foliage, and studio-isolate appearance.',
  'Next prompt revision (not applied now): split “avoid hyper-detailed studio-render microtexture” so it does not suppress real leaf-edge acuity.',
  'Future spend-approved run may consider quality=high; quality=medium was used. Do not change or execute that now.'
]);

const RESULTS_REL = path.join('data', 'garden-design', 'visual-state-calibration-batch-2', 'results.json');
const OVERLAY_REL = path.join(
  'data',
  'garden-design',
  'visual-state-calibration-batch-2',
  'mango-asset-detail-root-cause-v1.json'
);

function mangoJobIds() {
  return new Set(MANGO_DETAIL_JOBS.map((job) => job.jobId));
}

export function applyMangoOwnerVisualQaToJobs(jobs = []) {
  const ids = mangoJobIds();
  return (jobs || []).map((job) => {
    if (!job || !ids.has(job.jobId)) return job;
    return {
      ...job,
      OWNER_VISUAL_QA: MANGO_OWNER_DETAIL_VERDICT.OWNER_VISUAL_QA,
      OWNER_VISUAL_QA_ISSUE: MANGO_OWNER_DETAIL_VERDICT.issue,
      ASSET_DETAIL_SOFT: true,
      approvalStatus: 'candidate',
      outputStatus: 'CALIBRATION_CANDIDATE',
      approvalEligible: false,
      autoApproved: false
    };
  });
}

export function buildMangoAssetDetailRootCauseReport() {
  return {
    contract: MANGO_ASSET_DETAIL_ROOT_CAUSE_VERSION,
    verdict: 'MANGO_ASSET_DETAIL_ROOT_CAUSE_READY',
    ownerDetailVerdict: MANGO_OWNER_DETAIL_VERDICT,
    jobs: MANGO_DETAIL_JOBS,
    generationSettings: MANGO_GENERATION_SETTINGS_USED,
    postprocessAudit: MANGO_POSTPROCESS_AUDIT,
    rootCause: MANGO_ROOT_CAUSE,
    promptDetailGaps: MANGO_PROMPT_DETAIL_GAPS,
    proposedZeroSpendCorrections: MANGO_PROPOSED_ZERO_SPEND_CORRECTIONS,
    familyStateQaSeparate: MANGO_FAMILY_STATE_QA_SEPARATE,
    regenerationRequired: true,
    regenerationExecuted: false,
    retriesExecuted: 0,
    openaiCalls: 0,
    imageGeneration: 0,
    additionalSpendUsd: 0,
    spendGate: BATCH_2_SPEND_GATE.state,
    candidateBinariesModified: false,
    productionRegistryChanged: false
  };
}

export function assertMangoCandidatesUnmodified(root) {
  for (const job of MANGO_DETAIL_JOBS) {
    const abs = path.join(root, job.file);
    const buf = fs.readFileSync(abs);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (buf.length !== job.bytes || sha !== job.sha256) {
      const err = new Error('MANGO_CANDIDATE_BINARY_CHANGED');
      err.code = 'MANGO_CANDIDATE_BINARY_CHANGED';
      err.jobId = job.jobId;
      throw err;
    }
  }
  return { candidateBinariesModified: false, jobs: MANGO_DETAIL_JOBS.length };
}

export function writeMangoAssetDetailRootCause(root) {
  assertMangoCandidatesUnmodified(root);
  const report = buildMangoAssetDetailRootCauseReport();
  const overlayPath = path.join(root, OVERLAY_REL);
  fs.mkdirSync(path.dirname(overlayPath), { recursive: true });
  fs.writeFileSync(overlayPath, `${JSON.stringify(report, null, 2)}\n`);
  const resultsPath = path.join(root, RESULTS_REL);
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  results.jobs = applyMangoOwnerVisualQaToJobs(results.jobs);
  results.mangoOwnerVisualQa = {
    recorded: true,
    OWNER_VISUAL_QA: MANGO_OWNER_DETAIL_VERDICT.OWNER_VISUAL_QA,
    issue: MANGO_OWNER_DETAIL_VERDICT.issue,
    ASSET_DETAIL_SOFT: true,
    jobs: MANGO_DETAIL_JOBS.map((job) => job.jobId)
  };
  fs.writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`);
  writeVisualStateCalibrationBatch2Review(root);
  return {
    overlayPath,
    resultsPath,
    rootCause: MANGO_ROOT_CAUSE,
    candidateBinariesModified: false,
    openaiCalls: 0,
    additionalSpendUsd: 0
  };
}
