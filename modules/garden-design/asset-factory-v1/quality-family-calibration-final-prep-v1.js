/**
 * Quality-family final calibration prep. Exactly 7 jobs. Medium only.
 * Preparation only. Spend DENIED. Do not execute.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAID_IMAGE_MODEL, PAID_IMAGE_QUALITY } from '../../runtime-guards/paid-image-spend-gate-v1.js';
import { DETAIL_CLASS } from './design-asset-quality-policy-v1.js';
import { VARIANT_DETAIL_DEMAND } from './design-asset-quality-planning-integrity-v1.js';
import {
  PROMPT_TEMPLATE_VERSION_VISUAL_STATE_DETAIL_V2,
  buildVisualStateDetailV2PromptRecord
} from './prompt-factory-visual-state-detail-v2.js';
import { writeQualityFamilyCalibrationFinalReview } from './quality-family-calibration-final-review-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..', '..');

export const QUALITY_FAMILY_CALIBRATION_FINAL_VERSION = 'quality-family-calibration-final-prep-v1';
export const QUALITY_FAMILY_CALIBRATION_FINAL_RUN_ID = 'design-asset-quality-family-calibration-final-1';
export const QUALITY_FAMILY_CALIBRATION_FINAL_CACHE_BUST = '20260920a';

const BATCH_2 = 'modules/garden-design/assets/plants/batch-2-candidates/visual-state-calibration-batch-2';
const BATCH_1 = 'modules/garden-design/assets/plants/batch-1-candidates/calibration-batch-1';

export const QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE = Object.freeze({
  state: 'DENIED',
  execute: false,
  previousApprovalCarryForward: false,
  batch2ApprovalCarryForward: false,
  woodyFoliageAbApprovalCarryForward: false,
  sixJobProposalCarryForward: false,
  retriesAuthorized: 0,
  maxJobs: 7,
  maxCalls: 7,
  maxRetries: 0,
  quality: 'medium',
  highJobs: 0,
  promptTemplateVersion: PROMPT_TEMPLATE_VERSION_VISUAL_STATE_DETAIL_V2,
  model: PAID_IMAGE_MODEL,
  provider: 'openai-images-api',
  size: '1024x1536',
  background: 'transparent',
  outputFormat: 'png',
  forbiddenQuality: Object.freeze(['high', 'xhigh', 'max', 'auto']),
  unknownBlockedGeneration: false,
  generateThe82Individually: false,
  massGeneration: false,
  note: 'Owner must explicitly approve this exact runId. Previous run approvals do not apply.'
});

export const FAMILY_PASS_RULES = Object.freeze({
  outcomes: Object.freeze(['MEDIUM_POLICY_VALIDATED', 'QUALITY_ESCALATION_REVIEW_REQUIRED', 'PROMPT_FAILURE']),
  automaticHighEscalation: false,
  oneSampleDoesNotMarkAllUnknown: true,
  ifMediumFails: 'record why; separate owner-approved A/B required before any new HIGH policy'
});

export const OWNER_DETAIL_MARKS = Object.freeze([
  'DETAIL_OK',
  'DETAIL_SOFT',
  'PAINTERLY',
  'HALO',
  'OVER_SHARP',
  'CGI_TEXTURE',
  'STATE_DETAIL_WEAK',
  'OTHER'
]);

const JOB_SPECS = Object.freeze([
  {
    rank: 1,
    canonicalSlug: 'avocado',
    scientific: 'Persea americana',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'vegetative',
    qualityFamilies: Object.freeze([DETAIL_CLASS.WOODY_OPEN_OR_LARGE_LEAF]),
    inheritMangoHighPolicy: false,
    purpose: 'validate V2 + MEDIUM for a woody specimen with larger/open foliage',
    historicalControl: null
  },
  {
    rank: 2,
    canonicalSlug: 'apple',
    scientific: 'Malus domestica',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'dormant',
    qualityFamilies: Object.freeze([VARIANT_DETAIL_DEMAND.BRANCH_STRUCTURE]),
    inheritMangoHighPolicy: false,
    purpose: 'validate fine branch/twig rendering without foliage',
    historicalControl: {
      file: `${BATCH_2}/apple__mature__tree__dormant__v1.png`,
      source: 'batch-2',
      approved: false,
      note: 'Historical control only. Architecture/quality limitations remain visible.'
    }
  },
  {
    rank: 3,
    canonicalSlug: 'lavender',
    scientific: 'Lavandula angustifolia',
    visualForm: 'shrub',
    architectureMode: 'shrub',
    growthStage: 'mature',
    phenologyState: 'vegetative',
    qualityFamilies: Object.freeze([DETAIL_CLASS.SHRUB_FINE_FOLIAGE]),
    inheritMangoHighPolicy: false,
    purpose: 'validate fine shrub foliage under Prompt V2',
    historicalControl: {
      file: `${BATCH_2}/lavender__mature__shrub__vegetative__v1.png`,
      source: 'batch-2',
      approved: false,
      note: 'Historical control only. Not a production-approved asset.'
    }
  },
  {
    rank: 4,
    canonicalSlug: 'lavender',
    scientific: 'Lavandula angustifolia',
    visualForm: 'shrub',
    architectureMode: 'shrub',
    growthStage: 'mature',
    phenologyState: 'flowering',
    qualityFamilies: Object.freeze([VARIANT_DETAIL_DEMAND.FLOWER_FINE_DETAIL]),
    inheritMangoHighPolicy: false,
    purpose: 'validate flowers + fine foliage under Prompt V2',
    historicalControl: {
      file: `${BATCH_2}/lavender__mature__shrub__flowering__v1.png`,
      source: 'batch-2',
      approved: false,
      note: 'Historical control only. Not a production-approved asset.'
    }
  },
  {
    rank: 5,
    canonicalSlug: 'banana',
    scientific: 'Musa spp.',
    visualForm: 'herbaceous-clump',
    architectureMode: 'default',
    growthStage: 'mature',
    phenologyState: 'fruiting',
    qualityFamilies: Object.freeze([DETAIL_CLASS.LARGE_LEAF_HERBACEOUS, VARIANT_DETAIL_DEMAND.FRUIT_VISIBLE_DETAIL]),
    inheritMangoHighPolicy: false,
    purpose: 'validate large-leaf detail and visible fruit in one job',
    historicalControl: {
      file: `${BATCH_2}/banana__mature__default__vegetative__v1.png`,
      source: 'batch-2',
      approved: false,
      note: 'Family anchor only (mature vegetative). Not a production-approved asset.'
    }
  },
  {
    rank: 6,
    canonicalSlug: 'pineapple',
    scientific: 'Ananas comosus',
    visualForm: 'rosette',
    architectureMode: 'default',
    growthStage: 'mature',
    phenologyState: 'vegetative',
    qualityFamilies: Object.freeze([DETAIL_CLASS.ROSETTE]),
    inheritMangoHighPolicy: false,
    purpose: 'validate rosette leaf-edge/detail quality with V2 + MEDIUM',
    historicalControl: {
      file: `${BATCH_1}/pineapple-mature-vegetative-v1.png`,
      source: 'batch-1',
      approved: false,
      note: 'Historical comparison only. Not a production-approved anchor.'
    }
  },
  {
    rank: 7,
    canonicalSlug: 'aloe-vera',
    scientific: 'Aloe vera',
    visualForm: 'succulent-form',
    architectureMode: 'default',
    growthStage: 'mature',
    phenologyState: 'vegetative',
    qualityFamilies: Object.freeze([DETAIL_CLASS.SUCCULENT]),
    inheritMangoHighPolicy: false,
    purpose: 'validate succulent surface/edge detail with V2 + MEDIUM',
    historicalControl: {
      file: `${BATCH_1}/aloe-vera-mature-vegetative-v1.png`,
      source: 'batch-1',
      approved: false,
      note: 'Historical comparison only. Not a production-approved anchor.'
    }
  }
]);

export function buildQualityFamilyCalibrationFinalJobs() {
  return JOB_SPECS.map((spec) => {
    const jobId = `${spec.canonicalSlug}__${spec.growthStage}__${spec.architectureMode}__${spec.phenologyState}__detail-v2__medium`;
    const promptRecord = buildVisualStateDetailV2PromptRecord(
      {
        canonicalSlug: spec.canonicalSlug,
        scientific: spec.scientific,
        visualForm: spec.visualForm,
        architectureMode: spec.architectureMode,
        growthStage: spec.growthStage,
        phenologyState: spec.phenologyState,
        jobId
      },
      {
        provider: QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE.provider,
        model: PAID_IMAGE_MODEL,
        settings: { quality: 'medium' }
      }
    );
    return Object.freeze({
      ...spec,
      jobId,
      quality: 'medium',
      promptTemplateVersion: PROMPT_TEMPLATE_VERSION_VISUAL_STATE_DETAIL_V2,
      prompt: promptRecord.prompt,
      encodePhysicalMeters: false,
      generateNow: false,
      generated: false,
      approvalStatus: 'candidate',
      OWNER_VISUAL_QA: 'UNKNOWN',
      primaryQuestion: 'Is medium quality with Prompt V2 sufficient for production-level native asset detail for this detail family?'
    });
  });
}

export function executeQualityFamilyCalibrationFinal() {
  return {
    executed: false,
    openaiCalls: 0,
    imageGeneration: 0,
    retries: 0,
    additionalSpendUsd: 0,
    spendGate: 'DENIED',
    reason: 'PREPARATION_ONLY_OWNER_MUST_APPROVE_THIS_EXACT_RUN',
    runId: QUALITY_FAMILY_CALIBRATION_FINAL_RUN_ID,
    jobsPrepared: 7,
    highJobs: 0,
    productionRegistryChanged: false,
    massGenerationStarted: false
  };
}

export function writeQualityFamilyCalibrationFinalReports(root = DEFAULT_ROOT) {
  const jobs = buildQualityFamilyCalibrationFinalJobs();
  if (jobs.length !== 7) throw new Error('QUALITY_FAMILY_FINAL_JOB_COUNT');
  if (jobs.some((job) => job.quality !== 'medium')) throw new Error('QUALITY_FAMILY_FINAL_NOT_MEDIUM');
  if (!jobs.some((job) => job.canonicalSlug === 'avocado' && job.qualityFamilies.includes(DETAIL_CLASS.WOODY_OPEN_OR_LARGE_LEAF))) {
    throw new Error('QUALITY_FAMILY_FINAL_AVOCADO_MISSING');
  }
  const dir = path.join(root, 'data', 'garden-design', 'quality-family-calibration-final-prep-v1');
  fs.mkdirSync(dir, { recursive: true });
  const execute = executeQualityFamilyCalibrationFinal();
  const summary = {
    contract: QUALITY_FAMILY_CALIBRATION_FINAL_VERSION,
    verdict: 'DESIGN_ASSET_QUALITY_FINAL_CALIBRATION_PREPARED',
    runId: QUALITY_FAMILY_CALIBRATION_FINAL_RUN_ID,
    supersededSixJobSet: true,
    jobsPrepared: 7,
    highJobs: 0,
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION_VISUAL_STATE_DETAIL_V2,
    factoryDefaultQuality: PAID_IMAGE_QUALITY,
    unknownBlockedStatus: {
      count: 26,
      generate: false,
      note: 'Remain outside production demand until identity/architecture/state blockers are resolved.'
    },
    qualityCalibrationRequiredStatus: {
      count: 82,
      generateIndividually: false,
      note: 'After owner review of this 7-job set, re-run the 273-variant audit. Promote to MEDIUM_EVIDENCE_SUPPORTED only where the calibrated family rule genuinely applies.'
    },
    familyPassRules: FAMILY_PASS_RULES,
    spendGate: QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE,
    massGeneration: 'BLOCKED',
    executeResult: execute,
    proposedFutureCommand: [
      `--run-id=${QUALITY_FAMILY_CALIBRATION_FINAL_RUN_ID}`,
      `--approve-envelope=${QUALITY_FAMILY_CALIBRATION_FINAL_RUN_ID}`,
      `--owner-approve-run=${QUALITY_FAMILY_CALIBRATION_FINAL_RUN_ID}`,
      `--provider=openai-images-api`,
      `--model=${PAID_IMAGE_MODEL}`,
      '--max-jobs=7',
      '--max-calls=7',
      '--max-retries=0',
      '--quality=medium'
    ],
    liveReviewHash: '#design-asset-quality-family-calibration-final-1'
  };
  const files = {
    summaryPath: path.join(dir, 'final-prep-summary.json'),
    jobsPath: path.join(dir, 'final-job-manifest.json'),
    spendPath: path.join(dir, 'final-spend-gate.json')
  };
  fs.writeFileSync(files.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(files.jobsPath, `${JSON.stringify({ contract: QUALITY_FAMILY_CALIBRATION_FINAL_VERSION, jobs }, null, 2)}\n`);
  fs.writeFileSync(
    files.spendPath,
    `${JSON.stringify(
      {
        contract: QUALITY_FAMILY_CALIBRATION_FINAL_VERSION,
        gate: QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE,
        executeResult: execute,
        authorizedNow: false
      },
      null,
      2
    )}\n`
  );
  const review = writeQualityFamilyCalibrationFinalReview(root, { jobs });
  return { ...files, reviewHtml: review.htmlPath, verdict: summary.verdict, spend: execute };
}
