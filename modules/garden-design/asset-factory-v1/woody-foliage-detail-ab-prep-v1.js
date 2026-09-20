/**
 * Woody foliage detail A/B prep. Exact 2-call experiment. Spend DENIED. Do not execute.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PAID_IMAGE_MODEL,
  PAID_IMAGE_QUALITY,
  PAID_IMAGE_SIZE,
  PAID_IMAGE_OUTPUT_USD_MEDIUM_1024x1536
} from '../../runtime-guards/paid-image-spend-gate-v1.js';
import { DEFAULT_GENERATION_SETTINGS } from './prompt-factory-v1.js';
import { PROMPT_TEMPLATE_VERSION_VISUAL_STATE_FAMILY } from './prompt-factory-visual-state-family-v1.js';
import {
  PROMPT_TEMPLATE_VERSION_WOODY_FOLIAGE_DETAIL_V2,
  buildWoodyFoliageDetailV2PromptRecord
} from './prompt-factory-woody-foliage-detail-v2-experiment-v1.js';
import { GPT_IMAGE_2_PUBLISHED_RATES, textInputAllowanceUsdPerCall } from './total-api-cost-v1.js';
import { writeWoodyFoliageDetailAbReview } from './woody-foliage-detail-ab-review-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..', '..');

export const WOODY_FOLIAGE_DETAIL_AB_VERSION = 'woody-foliage-detail-ab-prep-v1';
export const WOODY_FOLIAGE_DETAIL_AB_RUN_ID = 'design-asset-woody-foliage-detail-ab-1';
export const WOODY_FOLIAGE_DETAIL_AB_CACHE_BUST = '20260919x';

export const CONTROL_JOB = Object.freeze({
  arm: 'CONTROL',
  jobId: 'mango__mature__tree__vegetative__v1',
  canonicalSlug: 'mango',
  scientific: 'Mangifera indica',
  visualForm: 'tree',
  architectureMode: 'tree',
  growthStage: 'mature',
  phenologyState: 'vegetative',
  quality: 'medium',
  promptTemplateVersion: PROMPT_TEMPLATE_VERSION_VISUAL_STATE_FAMILY,
  file: 'modules/garden-design/assets/plants/batch-2-candidates/visual-state-calibration-batch-2/mango__mature__tree__vegetative__v1.png',
  regenerate: false,
  ASSET_DETAIL_SOFT: true,
  OWNER_VISUAL_QA: 'NEEDS_IMPROVEMENT'
});

const BASE_JOB = Object.freeze({
  canonicalSlug: 'mango',
  scientific: 'Mangifera indica',
  visualForm: 'tree',
  architectureMode: 'tree',
  growthStage: 'mature',
  phenologyState: 'vegetative',
  identityPrecision: 'SPECIES_SUPPORTED',
  variantKey: 'mature__tree__vegetative'
});

export const WOODY_FOLIAGE_DETAIL_AB_HARD_CAP_USD = 0.3;
export const PAID_IMAGE_OUTPUT_USD_HIGH_1024x1536 = 0.165;
export const WOODY_FOLIAGE_DETAIL_AB_FORBIDDEN_QUALITY = Object.freeze([
  'xhigh',
  'max',
  'auto'
]);

export const WOODY_FOLIAGE_DETAIL_AB_SPEND_GATE = Object.freeze({
  state: 'DENIED',
  execute: false,
  previousApprovalCarryForward: false,
  batch2ApprovalCarryForward: false,
  retriesAuthorized: 0,
  maxJobs: 2,
  maxCalls: 2,
  maxRetries: 0,
  maxSpendUsd: WOODY_FOLIAGE_DETAIL_AB_HARD_CAP_USD,
  model: PAID_IMAGE_MODEL,
  provider: 'openai-images-api',
  size: PAID_IMAGE_SIZE,
  candidateAQuality: 'medium',
  candidateBQuality: 'high',
  forbiddenQuality: WOODY_FOLIAGE_DETAIL_AB_FORBIDDEN_QUALITY,
  extraJobs: false,
  fallbackGeneration: false,
  modelChange: false,
  qualityEscalationBeyondHigh: false,
  background: DEFAULT_GENERATION_SETTINGS.background,
  outputFormat: DEFAULT_GENERATION_SETTINGS.outputFormat,
  note: 'Owner must explicitly approve this exact runId and $0.30 hard cap. Batch-2 approval does not apply. Do not globally switch quality to high.'
});

export const DECISION_RULES = Object.freeze({
  appliedToFactory: false,
  rules: [
    {
      when: 'CONTROL soft + A acceptable + B not materially better',
      futureCandidate: 'DETAIL_PROMPT_V2 + MEDIUM'
    },
    {
      when: 'CONTROL soft + A still soft + B acceptable',
      futureCandidate: 'HIGH may be justified for woody/dense foliage only'
    },
    {
      when: 'A acceptable + B visibly superior enough to matter',
      futureCandidate: 'owner decides whether quality gain justifies cost for affected morphology classes'
    },
    {
      when: 'A soft + B soft',
      futureCandidate: 'STOP. Do not scale generation. Quality alone does not solve the problem.'
    }
  ]
});

export const MORPHOLOGY_POLICY_STATUS = Object.freeze({
  formalized: true,
  status: 'FORMALIZED_IN_DESIGN_ASSET_QUALITY_POLICY_V1',
  bananaEvidence: 'CRISP_ENOUGH at medium; HIGH is not universally required',
  highOnlyFor: 'WOODY_DENSE_SMALL_LEAF',
  see: 'design-asset-quality-policy-v1'
});

export const OWNER_DETAIL_MARKS = Object.freeze([
  'DETAIL_OK',
  'DETAIL_SOFT',
  'PAINTERLY',
  'HALO',
  'OVER_SHARP',
  'CGI_TEXTURE',
  'OTHER'
]);

function mangoJob(overrides) {
  return {
    ...BASE_JOB,
    ...overrides
  };
}

export function buildWoodyFoliageDetailAbJobs() {
  const shared = buildWoodyFoliageDetailV2PromptRecord(mangoJob({ jobId: 'shared' }), {
    provider: WOODY_FOLIAGE_DETAIL_AB_SPEND_GATE.provider,
    model: PAID_IMAGE_MODEL,
    settings: {
      ...DEFAULT_GENERATION_SETTINGS,
      size: PAID_IMAGE_SIZE,
      background: 'transparent',
      outputFormat: 'png'
    }
  });
  const a = mangoJob({
    arm: 'A',
    rank: 1,
    jobId: 'mango__mature__tree__vegetative__detail-v2__medium',
    quality: 'medium',
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION_WOODY_FOLIAGE_DETAIL_V2,
    prompt: shared.prompt,
    generateNow: false
  });
  const b = mangoJob({
    arm: 'B',
    rank: 2,
    jobId: 'mango__mature__tree__vegetative__detail-v2__high',
    quality: 'high',
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION_WOODY_FOLIAGE_DETAIL_V2,
    prompt: shared.prompt,
    generateNow: false
  });
  return [a, b];
}

export function costPreflightWoodyFoliageDetailAb() {
  const jobs = buildWoodyFoliageDetailAbJobs();
  const promptChars = String(jobs[0].prompt || '').length;
  const estimatedTextTokens = Math.max(1, Math.ceil(promptChars / 4));
  const textUsd = textInputAllowanceUsdPerCall(estimatedTextTokens);
  const mediumImageOutputUsd = PAID_IMAGE_OUTPUT_USD_MEDIUM_1024x1536;
  const highImageOutputUsd = PAID_IMAGE_OUTPUT_USD_HIGH_1024x1536;
  const mediumProjected = +(mediumImageOutputUsd + textUsd).toFixed(6);
  const highProjected = +(highImageOutputUsd + textUsd).toFixed(6);
  const projectedTotal = +(mediumProjected + highProjected).toFixed(6);
  return {
    status: 'WOODY_FOLIAGE_DETAIL_AB_COST_PREFLIGHT_READY',
    model: PAID_IMAGE_MODEL,
    size: PAID_IMAGE_SIZE,
    paidProbe: false,
    officialPricingBasis: {
      textInputUsdPer1MTokens: GPT_IMAGE_2_PUBLISHED_RATES.textInputUsdPer1MTokens,
      imageOutputUsdPer1MTokens: GPT_IMAGE_2_PUBLISHED_RATES.imageOutputUsdPer1MTokens,
      comparableGptImageTokenSchedule1024x1536: {
        mediumOutputUsd: mediumImageOutputUsd,
        highOutputUsd: highImageOutputUsd
      },
      source: 'official-openai-token-rates-owner-confirmed-for-this-run'
    },
    mediumArm: {
      quality: 'medium',
      imageOutputUsd: mediumImageOutputUsd,
      estimatedTextTokens,
      estimatedTextUsd: textUsd,
      projectedUsd: mediumProjected
    },
    highArm: {
      quality: 'high',
      imageOutputUsd: highImageOutputUsd,
      estimatedTextTokens,
      estimatedTextUsd: textUsd,
      projectedUsd: highProjected
    },
    projectedTotalUsd: projectedTotal,
    projectedMaxSpend: projectedTotal,
    hardRunCapUsd: WOODY_FOLIAGE_DETAIL_AB_HARD_CAP_USD,
    costPreflight: 'READY',
    doNotExecute: true
  };
}

export function executeWoodyFoliageDetailAb() {
  return {
    executed: false,
    imageGeneration: 0,
    openaiCalls: 0,
    retries: 0,
    spendGate: 'DENIED',
    reason: 'PREPARATION_ONLY_OWNER_MUST_APPROVE_THIS_EXACT_RUN',
    runId: WOODY_FOLIAGE_DETAIL_AB_RUN_ID,
    jobsPrepared: 2,
    productionPromptChanged: false,
    productionRegistryChanged: false
  };
}

export function writeWoodyFoliageDetailAbReports(root = DEFAULT_ROOT) {
  const jobs = buildWoodyFoliageDetailAbJobs();
  if (jobs.length !== 2) throw new Error('WOODY_FOLIAGE_AB_JOB_COUNT');
  if (jobs[0].prompt !== jobs[1].prompt) throw new Error('WOODY_FOLIAGE_AB_PROMPT_MISMATCH');
  if (jobs[0].quality !== 'medium' || jobs[1].quality !== 'high') throw new Error('WOODY_FOLIAGE_AB_QUALITY_MISMATCH');
  const cost = costPreflightWoodyFoliageDetailAb();
  const dir = path.join(root, 'data', 'garden-design', 'woody-foliage-detail-ab-prep-v1');
  fs.mkdirSync(dir, { recursive: true });
  const summary = {
    contract: WOODY_FOLIAGE_DETAIL_AB_VERSION,
    verdict: 'WOODY_FOLIAGE_DETAIL_AB_COST_PREFLIGHT_READY',
    runId: WOODY_FOLIAGE_DETAIL_AB_RUN_ID,
    control: CONTROL_JOB,
    jobs,
    jobsPrepared: 2,
    apiCallsPrepared: 2,
    retriesAuthorized: 0,
    generateNow: false,
    executed: false,
    productionPromptChanged: false,
    productionFactoryQuality: PAID_IMAGE_QUALITY,
    productionRegistryChanged: false,
    visualStateContractReopened: false,
    globalQualitySwitchToHigh: false,
    decisionRules: DECISION_RULES,
    morphologyPolicy: MORPHOLOGY_POLICY_STATUS,
    costPreflight: cost,
    spendGate: WOODY_FOLIAGE_DETAIL_AB_SPEND_GATE,
    ownerMarks: OWNER_DETAIL_MARKS,
    questions: [
      'Q1: Does A materially improve detail over CONTROL? If YES, prompt correction has value.',
      'Q2: Does B materially improve detail over A? If YES, HIGH quality adds meaningful value.'
    ],
    proposedFutureCommand: [
      `--run-id=${WOODY_FOLIAGE_DETAIL_AB_RUN_ID}`,
      `--approve-envelope=${WOODY_FOLIAGE_DETAIL_AB_RUN_ID}`,
      `--owner-approve-run=${WOODY_FOLIAGE_DETAIL_AB_RUN_ID}`,
      `--provider=${WOODY_FOLIAGE_DETAIL_AB_SPEND_GATE.provider}`,
      `--model=${PAID_IMAGE_MODEL}`,
      '--max-jobs=2',
      '--max-calls=2',
      '--max-retries=0',
      '--max-spend-usd=0.30',
      '--quality-a=medium',
      '--quality-b=high'
    ],
    authorizedNow: false,
    spend: { openaiCalls: 0, imageGeneration: 0, additionalSpendUsd: 0 }
  };
  const files = {
    summaryPath: path.join(dir, 'ab-prep-summary.json'),
    jobsPath: path.join(dir, 'ab-job-manifest.json'),
    promptPath: path.join(dir, 'ab-detail-prompt-v2.json'),
    spendPath: path.join(dir, 'ab-spend-gate.json')
  };
  fs.writeFileSync(files.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(
    files.jobsPath,
    `${JSON.stringify({ contract: WOODY_FOLIAGE_DETAIL_AB_VERSION, control: CONTROL_JOB, jobs }, null, 2)}\n`
  );
  fs.writeFileSync(
    files.promptPath,
    `${JSON.stringify(
      {
        contract: WOODY_FOLIAGE_DETAIL_AB_VERSION,
        appliedToProductionFactory: false,
        promptTemplateVersion: PROMPT_TEMPLATE_VERSION_WOODY_FOLIAGE_DETAIL_V2,
        identicalForAandB: true,
        prompt: jobs[0].prompt
      },
      null,
      2
    )}\n`
  );
  let lastRun = null;
  if (fs.existsSync(files.spendPath)) {
    try {
      const prior = JSON.parse(fs.readFileSync(files.spendPath, 'utf8'));
      if (prior && prior.lastRun) lastRun = prior.lastRun;
    } catch {
      lastRun = null;
    }
  }
  fs.writeFileSync(
    files.spendPath,
    `${JSON.stringify(
      {
        contract: WOODY_FOLIAGE_DETAIL_AB_VERSION,
        gate: WOODY_FOLIAGE_DETAIL_AB_SPEND_GATE,
        executeResult: executeWoodyFoliageDetailAb(),
        costPreflight: cost,
        lastRun,
        authorizedNow: false
      },
      null,
      2
    )}\n`
  );
  const review = writeWoodyFoliageDetailAbReview(root, { jobs });
  return {
    ...files,
    reviewHtml: review.htmlPath,
    verdict: cost.status,
    jobsPrepared: 2,
    costPreflight: cost.costPreflight,
    projectedMaxSpend: cost.projectedMaxSpend,
    hardRunCapUsd: cost.hardRunCapUsd
  };
}
