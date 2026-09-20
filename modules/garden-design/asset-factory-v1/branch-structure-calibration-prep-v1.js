/**
 * BRANCH_STRUCTURE calibration prep. Exactly 1 Apple dormant medium job.
 * Preparation only. Spend DENIED. Do not execute. HIGH jobs = 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAID_IMAGE_QUALITY, PAID_IMAGE_SIZE } from '../../runtime-guards/paid-image-spend-gate-v1.js';
import { DEFAULT_GENERATION_SETTINGS } from './prompt-factory-v1.js';
import { APPLE_DORMANT_CANDIDATE, assertAppleDormantUnmodified } from './apple-dormant-root-cause-v1.js';
import {
  PROMPT_TEMPLATE_VERSION_BRANCH_STRUCTURE_V2_EXPERIMENT,
  BRANCH_STRUCTURE_ALPHA_CONTRACT,
  buildBranchStructureV2ExperimentPromptRecord
} from './prompt-factory-branch-structure-v2-experiment-v1.js';
import {
  candidateBranchStructureDiagnostics,
  controlBranchStructureDiagnostics
} from './branch-structure-alpha-diagnostics-v1.js';
import { writeBranchStructureCalibrationReview } from './branch-structure-calibration-review-v1.js';
import { DESIGN_ASSET_FACTORY } from './design-asset-factory-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..', '..');

export const BRANCH_STRUCTURE_CALIBRATION_VERSION = 'branch-structure-calibration-prep-v1';
export const BRANCH_STRUCTURE_CALIBRATION_RUN_ID = 'design-asset-branch-structure-calibration-1';
export const BRANCH_STRUCTURE_CALIBRATION_CACHE_BUST = '20260920d';
export const BRANCH_STRUCTURE_CALIBRATION_MODEL = 'gpt-image-2.5-flare-2026-09-08';
export const BRANCH_STRUCTURE_CALIBRATION_HARD_CAP_USD = 0.03;

const CONTROL_REL = APPLE_DORMANT_CANDIDATE.file;
const CANDIDATE_REL =
  'modules/garden-design/assets/plants/branch-structure-calibration-1/apple__mature__tree__dormant__branch-structure-v2__medium.png';

export const BRANCH_STRUCTURE_CALIBRATION_SPEND_GATE = Object.freeze({
  state: 'DENIED',
  execute: false,
  previousApprovalCarryForward: false,
  qualityFamilyApprovalCarryForward: false,
  woodyFoliageAbApprovalCarryForward: false,
  batch2ApprovalCarryForward: false,
  retriesAuthorized: 0,
  maxJobs: 1,
  maxCalls: 1,
  maxRetries: 0,
  maxSpendUsd: BRANCH_STRUCTURE_CALIBRATION_HARD_CAP_USD,
  quality: 'medium',
  highJobs: 0,
  automaticHighEscalation: false,
  promptTemplateVersion: PROMPT_TEMPLATE_VERSION_BRANCH_STRUCTURE_V2_EXPERIMENT,
  model: BRANCH_STRUCTURE_CALIBRATION_MODEL,
  provider: 'openai-images-api',
  size: PAID_IMAGE_SIZE,
  background: 'transparent',
  outputFormat: 'png',
  forbiddenQuality: Object.freeze(['high', 'xhigh', 'max', 'auto']),
  generateThe18Dormant: false,
  generateThe3YoungWoody: false,
  generate273: false,
  massGeneration: false,
  productionRegistryWrite: false,
  note: 'Owner must explicitly approve this exact runId and $0.03 hard cap. Previous run approvals do not apply. HIGH is not assumed to fix alpha/ghosting.'
});

export const BRANCH_STRUCTURE_OWNER_MARKS = Object.freeze([
  'DETAIL_OK',
  'BRANCH_STRUCTURE_OK',
  'BROWN_HAZE',
  'GHOST_BRANCHES',
  'ALPHA_FAILURE',
  'TOO_DENSE',
  'TOO_SPARSE',
  'DEAD_APPEARANCE',
  'OTHER'
]);

export const BRANCH_STRUCTURE_OWNER_QUESTIONS = Object.freeze([
  'Does this look like a clean dormant apple tree?',
  'Are main and secondary branches clearly readable?',
  'Is negative space truly transparent?',
  'Is the brown haze gone?',
  'Are there ghost branches?',
  'Does the tree look dormant rather than dead?',
  'Is medium quality sufficient for BRANCH_STRUCTURE?'
]);

export const BRANCH_STRUCTURE_DECISION_RULE = Object.freeze({
  appliedNow: false,
  automaticHigh: false,
  ifMediumCleanReadableAndAlphaFixed: 'BRANCH_STRUCTURE → MEDIUM_POLICY_VALIDATED. Do NOT require HIGH.',
  ifMediumStillHasHazeOrAlphaFailure: 'STOP. Return BRANCH_ALPHA_PROBLEM_PERSISTS. Do NOT automatically run HIGH. Prepare a separate solution analysis.',
  persistFailureCode: 'BRANCH_ALPHA_PROBLEM_PERSISTS'
});

export function buildBranchStructureCalibrationJob() {
  const jobId = 'apple__mature__tree__dormant__branch-structure-v2__medium';
  const promptRecord = buildBranchStructureV2ExperimentPromptRecord(
    {
      canonicalSlug: 'apple',
      scientific: 'Malus domestica',
      visualForm: 'tree',
      architectureMode: 'tree',
      growthStage: 'mature',
      phenologyState: 'dormant',
      jobId
    },
    {
      provider: BRANCH_STRUCTURE_CALIBRATION_SPEND_GATE.provider,
      model: BRANCH_STRUCTURE_CALIBRATION_MODEL,
      settings: {
        ...DEFAULT_GENERATION_SETTINGS,
        quality: 'medium',
        size: PAID_IMAGE_SIZE,
        background: 'transparent',
        outputFormat: 'png'
      }
    }
  );
  return Object.freeze({
    rank: 1,
    jobId,
    runId: BRANCH_STRUCTURE_CALIBRATION_RUN_ID,
    canonicalSlug: 'apple',
    scientific: 'Malus domestica',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'dormant',
    family: 'BRANCH_STRUCTURE',
    quality: 'medium',
    highQuality: false,
    model: BRANCH_STRUCTURE_CALIBRATION_MODEL,
    size: PAID_IMAGE_SIZE,
    background: 'transparent',
    outputFormat: 'png',
    retries: 0,
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION_BRANCH_STRUCTURE_V2_EXPERIMENT,
    prompt: promptRecord.prompt,
    alphaContract: BRANCH_STRUCTURE_ALPHA_CONTRACT,
    inheritFoliageDetailV2: false,
    generateNow: false,
    generated: false,
    approvalStatus: 'candidate',
    historicalControl: Object.freeze({
      arm: 'CONTROL',
      label: 'HISTORICAL CONTROL — NOT APPROVED',
      file: CONTROL_REL,
      prompt: 'design-cutout-visual-state-detail-v2',
      quality: 'medium',
      failure: 'brown ghosting / fully opaque pixels = 0',
      approved: false,
      modify: false,
      reencode: false
    }),
    candidateFile: CANDIDATE_REL,
    factoryDefaultQuality: PAID_IMAGE_QUALITY
  });
}

export function costPreflightBranchStructureCalibration() {
  const observedMediumUsd = 0.013;
  const observedAppleDormantUsd = 0.013295;
  return {
    status: 'BRANCH_STRUCTURE_CALIBRATION_COST_PREFLIGHT_READY',
    paidProbe: false,
    openaiCalls: 0,
    jobs: 1,
    quality: 'medium',
    highJobs: 0,
    observedMediumUsd,
    observedAppleDormantUsd,
    expectedOrderOfMagnitudeUsd: observedMediumUsd,
    projectedUsd: observedMediumUsd,
    conservativeHardCapUsd: BRANCH_STRUCTURE_CALIBRATION_HARD_CAP_USD,
    hardCapIsSafetyCeilingNotTarget: true,
    notSpendAuthorization: true,
    note: 'Uses recent observed medium-call costs (~$0.013). Conservative one-call ceiling $0.03. Do not execute.'
  };
}

export function executeBranchStructureCalibration() {
  return {
    executed: false,
    openaiCalls: 0,
    imageGeneration: 0,
    retries: 0,
    additionalSpendUsd: 0,
    spendGate: 'DENIED',
    reason: 'PREPARATION_ONLY_OWNER_MUST_APPROVE_THIS_EXACT_RUN',
    runId: BRANCH_STRUCTURE_CALIBRATION_RUN_ID,
    jobsPrepared: 1,
    highJobs: 0,
    productionRegistryChanged: false,
    massGenerationStarted: false
  };
}

export function writeBranchStructureCalibrationReports(root = DEFAULT_ROOT) {
  assertAppleDormantUnmodified(root);
  const job = buildBranchStructureCalibrationJob();
  if (job.quality !== 'medium') throw new Error('BRANCH_STRUCTURE_NOT_MEDIUM');
  if (job.highQuality) throw new Error('BRANCH_STRUCTURE_HIGH_NOT_ALLOWED');
  if (job.generateNow) throw new Error('BRANCH_STRUCTURE_GENERATE_NOW');
  const foliageNeedles = [
    'individually legible natural foliage',
    'clear leaf and leaflet boundaries',
    'DETAIL REQUIREMENTS:'
  ];
  if (foliageNeedles.some((needle) => job.prompt.includes(needle))) {
    throw new Error('BRANCH_STRUCTURE_FOLIAGE_INHERITANCE');
  }
  const dir = path.join(root, 'data', 'garden-design', 'branch-structure-calibration-prep-v1');
  fs.mkdirSync(dir, { recursive: true });
  const execute = executeBranchStructureCalibration();
  const cost = costPreflightBranchStructureCalibration();
  const controlDiag = controlBranchStructureDiagnostics(root);
  const candidateDiag = candidateBranchStructureDiagnostics(root, job.candidateFile);
  const summary = {
    contract: BRANCH_STRUCTURE_CALIBRATION_VERSION,
    verdict: 'BRANCH_STRUCTURE_CALIBRATION_V1_PREPARED',
    runId: BRANCH_STRUCTURE_CALIBRATION_RUN_ID,
    rootCause: 'MIXED',
    rootCauseNote:
      'Failed Apple dormant V2+medium is not primarily sharpness. Provider PNG has 0 fully opaque pixels and brown semi-transparent crown fill. Prompt V2 still requested foliage detail on a leafless job. HIGH is not assumed to fix this.',
    jobs: [job],
    spendGate: BRANCH_STRUCTURE_CALIBRATION_SPEND_GATE,
    alphaContract: BRANCH_STRUCTURE_ALPHA_CONTRACT,
    historicalControl: job.historicalControl,
    technicalComparison: {
      universalMagicThreshold: null,
      ownerVisualReviewAuthoritative: true,
      CONTROL: controlDiag,
      NEW: candidateDiag
    },
    ownerReview: {
      questions: BRANCH_STRUCTURE_OWNER_QUESTIONS,
      marks: BRANCH_STRUCTURE_OWNER_MARKS
    },
    decisionRule: BRANCH_STRUCTURE_DECISION_RULE,
    cost,
    massGeneration: {
      QUALITY_POLICY_MASS_GENERATION_READY: 'NO',
      generateNow: false,
      dormant18: false,
      youngWoody3: false,
      variants273: false
    },
    execute,
    factoryGenerateOnRender: DESIGN_ASSET_FACTORY.generateOnRender,
    confirms: {
      jobsPrepared: 1,
      quality: 'medium',
      highJobs: 0,
      imageGeneration: 0,
      openaiCalls: 0,
      retriesAuthorized: 0,
      productionRegistryChanged: 'NO',
      massGenerationStarted: 'NO',
      spendGate: 'DENIED',
      additionalSpendUsd: 0
    }
  };
  const files = {
    summaryPath: path.join(dir, 'prep-summary.json'),
    manifestPath: path.join(dir, 'job-manifest.json'),
    spendPath: path.join(dir, 'spend-gate.json'),
    costPath: path.join(dir, 'cost-preflight.json'),
    diagnosticsPath: path.join(dir, 'technical-comparison-metrics.json')
  };
  fs.writeFileSync(files.summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(
    files.manifestPath,
    `${JSON.stringify({ contract: BRANCH_STRUCTURE_CALIBRATION_VERSION, runId: BRANCH_STRUCTURE_CALIBRATION_RUN_ID, jobs: [job] }, null, 2)}\n`
  );
  fs.writeFileSync(
    files.spendPath,
    `${JSON.stringify({ contract: BRANCH_STRUCTURE_CALIBRATION_VERSION, gate: BRANCH_STRUCTURE_CALIBRATION_SPEND_GATE, execute }, null, 2)}\n`
  );
  fs.writeFileSync(files.costPath, `${JSON.stringify({ contract: BRANCH_STRUCTURE_CALIBRATION_VERSION, ...cost }, null, 2)}\n`);
  fs.writeFileSync(
    files.diagnosticsPath,
    `${JSON.stringify(
      {
        contract: BRANCH_STRUCTURE_CALIBRATION_VERSION,
        CONTROL: controlDiag,
        NEW: candidateDiag,
        universalMagicThreshold: null
      },
      null,
      2
    )}\n`
  );
  writeBranchStructureCalibrationReview(root, job, controlDiag);
  return { ...files, verdict: summary.verdict, spend: execute, job };
}
