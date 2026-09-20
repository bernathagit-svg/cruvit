/**
 * Owner-approved BRANCH_STRUCTURE calibration. This-run-only. 1 medium call. 0 retries.
 * Does not write production registry. Does not auto-approve. Does not start mass generation.
 * Does not modify the historical Apple dormant control PNG.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BRANCH_STRUCTURE_CALIBRATION_RUN_ID,
  BRANCH_STRUCTURE_CALIBRATION_SPEND_GATE,
  BRANCH_STRUCTURE_CALIBRATION_HARD_CAP_USD,
  BRANCH_STRUCTURE_CALIBRATION_MODEL,
  buildBranchStructureCalibrationJob,
  costPreflightBranchStructureCalibration,
  executeBranchStructureCalibration
} from './branch-structure-calibration-prep-v1.js';
import { PROMPT_TEMPLATE_VERSION_BRANCH_STRUCTURE_V2_EXPERIMENT } from './prompt-factory-branch-structure-v2-experiment-v1.js';
import { parseSpendEnvelope, classifyProviderKey } from './spend-envelope-v1.js';
import { actualSpendUsdFromUsage } from './total-api-cost-v1.js';
import { inspectTechnicalQa } from './technical-qa-v1.js';
import { classifyProviderFailFast } from './provider-fail-fast-v1.js';
import { OPENAI_IMAGES_GENERATIONS_URL, postOpenAiImagesJson } from './openai-images-http-v1.js';
import { inspectOpenAiKeyPresenceOnly } from './calibration-paid-preflight-v1.js';
import { APPLE_DORMANT_CANDIDATE, assertAppleDormantUnmodified } from './apple-dormant-root-cause-v1.js';
import {
  candidateBranchStructureDiagnostics,
  controlBranchStructureDiagnostics
} from './branch-structure-alpha-diagnostics-v1.js';
import { writeBranchStructureCalibrationReview } from './branch-structure-calibration-review-v1.js';
import { DESIGN_ASSET_FACTORY } from './design-asset-factory-v1.js';
import { PAID_IMAGE_QUALITY } from '../../runtime-guards/paid-image-spend-gate-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..', '..');
const CANDIDATE_REL = path.join(
  'modules',
  'garden-design',
  'assets',
  'plants',
  'branch-structure-calibration-1'
);
const RESULTS_REL = path.join('data', 'garden-design', 'branch-structure-calibration-1');
const PREP_GATE_REL = path.join(
  'data',
  'garden-design',
  'branch-structure-calibration-prep-v1',
  'spend-gate.json'
);
const REGISTRY_REL = path.join(
  'modules',
  'garden-design',
  'assets',
  'plants',
  'design-asset-registry-v1.json'
);
const OLIVE_REL = path.join(
  'modules',
  'garden-design',
  'assets',
  'plants',
  'olive-tree',
  'variants',
  'summer-mature.png'
);
const PROTECTED_MARKERS = Object.freeze([
  'batch-1-candidates',
  'batch-2-candidates',
  'olive-tree',
  'woody-foliage-detail-ab-1',
  'quality-family-calibration-final-1'
]);

export const OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION_MODEL = 'gpt-image-2.5-flare-2026-09-08';
export const OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION_SIZE = '1024x1536';
export const BRANCH_STRUCTURE_OBSERVED_MEDIUM_USD = 0.013;
export const BRANCH_STRUCTURE_NEXT_CALL_BUFFER = 1.1;

export const OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION = Object.freeze({
  runId: BRANCH_STRUCTURE_CALIBRATION_RUN_ID,
  provider: 'openai-images-api',
  model: OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION_MODEL,
  maxJobs: 1,
  maxCalls: 1,
  maxRetries: 0,
  maxSpendUsd: BRANCH_STRUCTURE_CALIBRATION_HARD_CAP_USD,
  quality: 'medium',
  size: OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION_SIZE,
  background: 'transparent',
  outputFormat: 'png',
  promptTemplateVersion: PROMPT_TEMPLATE_VERSION_BRANCH_STRUCTURE_V2_EXPERIMENT,
  highJobs: 0
});

export const OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION_COMMAND = Object.freeze([
  `--run-id=${OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION.runId}`,
  `--approve-envelope=${OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION.runId}`,
  `--owner-approve-run=${OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION.runId}`,
  `--provider=${OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION.provider}`,
  `--model=${OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION.model}`,
  '--max-jobs=1',
  '--max-calls=1',
  '--max-retries=0',
  '--max-spend-usd=0.03',
  '--allow-paid-calls=1',
  '--quality=medium'
]);

const FORBIDDEN_QUALITY = Object.freeze(['high', 'xhigh', 'max', 'auto']);

function strFlag(args, name) {
  let found = '';
  for (const arg of args) {
    const match = new RegExp(`^--${name}=(.+)$`).exec(String(arg));
    if (match) found = String(match[1]);
  }
  return found;
}

function readKeyRaw(root) {
  const fromEnv = String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
  if (fromEnv) return fromEnv;
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return '';
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (name === 'OPENAI_API_KEY' || name === 'OPENAI_KEY') return value;
  }
  return '';
}

export function parseOwnerApprovedBranchStructureCalibration(argv = []) {
  const args = Array.isArray(argv) ? argv.map((a) => String(a)) : [];
  const parsed = parseSpendEnvelope(args);
  const spec = OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION;
  const ownerApproveRun = strFlag(args, 'owner-approve-run');
  const approveEnvelope = strFlag(args, 'approve-envelope');
  const quality = strFlag(args, 'quality') || spec.quality;
  const forbiddenHit = FORBIDDEN_QUALITY.some(
    (q) => quality === q || String(parsed.model || '').includes(q)
  );
  const envelopeMatched =
    ownerApproveRun === spec.runId &&
    parsed.runId === spec.runId &&
    approveEnvelope === spec.runId &&
    parsed.provider === spec.provider &&
    parsed.model === spec.model &&
    Number(parsed.maxJobs) === spec.maxJobs &&
    Number(parsed.maxCalls) === spec.maxCalls &&
    Number(parsed.maxRetries) === spec.maxRetries &&
    Math.abs(Number(parsed.maxSpendUsd) - spec.maxSpendUsd) < 1e-9 &&
    quality === 'medium' &&
    forbiddenHit !== true &&
    parsed.dryRun !== true;
  return {
    ...parsed,
    quality,
    approveEnvelope,
    ownerApproveRun,
    ownerApprovedThisRunOnly: envelopeMatched === true,
    carryForward: false,
    previousApprovalReuse: false,
    automaticTopUp: false,
    approvalState: envelopeMatched ? 'APPROVED_THIS_RUN_ONLY' : 'DENIED',
    defaultDeny: envelopeMatched ? false : true,
    allowNetwork: envelopeMatched === true
  };
}

export function projectNextCallUsd() {
  return +(BRANCH_STRUCTURE_OBSERVED_MEDIUM_USD * BRANCH_STRUCTURE_NEXT_CALL_BUFFER).toFixed(6);
}

export function wouldViolateHardCap(spentUsd, projectedNext, maxSpendUsd = BRANCH_STRUCTURE_CALIBRATION_HARD_CAP_USD) {
  return Number(spentUsd) + Number(projectedNext) > Number(maxSpendUsd) + 1e-9;
}

export function preflightBranchStructureJob(job) {
  const reasons = [];
  if (!job) reasons.push('job_missing');
  if (job?.canonicalSlug !== 'apple') reasons.push('slug');
  if (job?.architectureMode !== 'tree') reasons.push('architecture');
  if (job?.growthStage !== 'mature') reasons.push('stage');
  if (job?.phenologyState !== 'dormant') reasons.push('phenology');
  if (job?.quality !== 'medium' || job?.highQuality === true) reasons.push('quality');
  if (job?.promptTemplateVersion !== PROMPT_TEMPLATE_VERSION_BRANCH_STRUCTURE_V2_EXPERIMENT) {
    reasons.push('prompt_version');
  }
  if (job?.model !== BRANCH_STRUCTURE_CALIBRATION_MODEL) reasons.push('model');
  if (job?.size !== '1024x1536') reasons.push('size');
  if (job?.background !== 'transparent') reasons.push('background');
  if (job?.outputFormat !== 'png') reasons.push('output');
  if (job?.retries !== 0) reasons.push('retries');
  if (!String(job?.prompt || '').includes('ALPHA / TRANSPARENCY CONTRACT')) reasons.push('alpha_contract');
  if (String(job?.prompt || '').includes('individually legible natural foliage')) reasons.push('foliage_inheritance');
  if (job?.generateNow === true) reasons.push('generate_now');
  return { ok: reasons.length === 0, reasons };
}

function emptyJobResult(job, extra = {}) {
  return {
    ...job,
    generated: false,
    status: extra.status || 'FAILED',
    error: extra.error || null,
    retries: 0,
    approvalStatus: 'candidate',
    outputStatus: 'CALIBRATION_CANDIDATE',
    autoApproved: false,
    OWNER_VISUAL_QA: 'UNKNOWN',
    ...extra
  };
}

function writeSpendClosed(root, lastRun) {
  const payload = {
    contract: 'branch-structure-calibration-prep-v1',
    gate: { ...BRANCH_STRUCTURE_CALIBRATION_SPEND_GATE, state: 'DENIED', execute: false },
    executeResult: executeBranchStructureCalibration(),
    lastRun: {
      runId: lastRun.runId,
      attemptedCalls: lastRun.attemptedCalls,
      actualSpendUsd: lastRun.actualSpendUsd,
      spendGateFinal: 'DENIED',
      approvalExhausted: true
    },
    authorizedNow: false
  };
  fs.mkdirSync(path.dirname(path.join(root, PREP_GATE_REL)), { recursive: true });
  fs.writeFileSync(path.join(root, PREP_GATE_REL), `${JSON.stringify(payload, null, 2)}\n`);
}

export async function executeBranchStructureCalibrationPaid(argv = [], options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const command = parseOwnerApprovedBranchStructureCalibration(argv);
  const keyPresence = inspectOpenAiKeyPresenceOnly(options.apiKeyRaw ?? readKeyRaw(root));
  const registryBefore = fs.readFileSync(path.join(root, REGISTRY_REL));
  const oliveBefore = fs.existsSync(path.join(root, OLIVE_REL))
    ? fs.readFileSync(path.join(root, OLIVE_REL))
    : Buffer.alloc(0);
  const controlBefore = fs.readFileSync(path.join(root, APPLE_DORMANT_CANDIDATE.file));
  const cost = costPreflightBranchStructureCalibration();
  const projected = Number(cost.projectedUsd);

  const blocked = (reason, extra = {}) => {
    const result = {
      blocked: true,
      executed: false,
      reason,
      runId: BRANCH_STRUCTURE_CALIBRATION_RUN_ID,
      model: OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION_MODEL,
      ownerApprovedThisRunOnly: command.ownerApprovedThisRunOnly === true,
      spendGateFinal: 'DENIED',
      attemptedCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      retries: 0,
      actualSpendUsd: 0,
      actualUsage: [],
      jobs: extra.jobs || [],
      imagesGenerated: 0,
      extraJobs: 0,
      autoApprovedAssets: 0,
      highCalls: 0,
      productionRegistryChanged: false,
      massGenerationStarted: false,
      controlChanged: false,
      keyPresence: keyPresence.openaiApiKey,
      denyStub: executeBranchStructureCalibration(),
      ...extra
    };
    if (options.writeFiles !== false) writeSpendClosed(root, result);
    return result;
  };

  if (command.ownerApprovedThisRunOnly !== true || command.allowNetwork !== true) {
    return blocked('PAID_SPEND_DENIED');
  }
  if (command.model !== OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION_MODEL) {
    return blocked('PAID_SPEND_MODEL_DENIED');
  }
  if (command.quality !== 'medium') return blocked('PAID_SPEND_QUALITY_DENIED');
  if (keyPresence.openaiApiKey !== 'PRESENT') return blocked('PAID_SPEND_KEY_NOT_READY');
  if (command.maxRetries !== 0) return blocked('PAID_SPEND_RETRY_LIMIT');
  if (BRANCH_STRUCTURE_CALIBRATION_SPEND_GATE.maxRetries !== 0) return blocked('PAID_SPEND_RETRY_LIMIT');
  if (BRANCH_STRUCTURE_CALIBRATION_SPEND_GATE.highJobs !== 0) return blocked('PAID_SPEND_HIGH_FORBIDDEN');
  if (DESIGN_ASSET_FACTORY.generateOnRender === true) return blocked('PAID_SPEND_GENERATE_ON_RENDER');
  if (PAID_IMAGE_QUALITY !== 'medium') return blocked('PAID_SPEND_FACTORY_QUALITY');
  if (projected > BRANCH_STRUCTURE_CALIBRATION_HARD_CAP_USD) {
    return blocked('PAID_SPEND_PROJECTED_OVER_CAP', { projectedUsd: projected });
  }
  if (wouldViolateHardCap(0, projectNextCallUsd())) {
    return blocked('PAID_SPEND_USD_LIMIT', { projectedNextUsd: projectNextCallUsd() });
  }

  const job = buildBranchStructureCalibrationJob();
  const jobCheck = preflightBranchStructureJob(job);
  if (!jobCheck.ok) return blocked('PAID_SPEND_JOB_PREFLIGHT', { preflightReasons: jobCheck.reasons });

  try {
    assertAppleDormantUnmodified(root);
  } catch {
    return blocked('CONTROL_PNG_CHANGED');
  }

  const keyRaw = options.apiKeyRaw !== undefined ? options.apiKeyRaw : readKeyRaw(root);
  const keyStatus = classifyProviderKey(
    { provider: 'openai-images-api', model: OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION_MODEL },
    keyRaw
  );
  if (keyStatus.billingKeyReadiness === 'NOT_READY') return blocked('PAID_SPEND_KEY_NOT_READY');

  const post = options.postJson || postOpenAiImagesJson;
  const writeFiles = options.writeFiles !== false;
  const candidateDir = path.join(root, CANDIDATE_REL);
  if (writeFiles) fs.mkdirSync(candidateDir, { recursive: true });

  let spentUsd = 0;
  let attemptedCalls = 0;
  let stopReason = null;
  let failFast = null;
  let resultRow = emptyJobResult(job, { status: 'FAILED', error: 'not_attempted' });

  attemptedCalls += 1;
  let res;
  try {
    res = await post(OPENAI_IMAGES_GENERATIONS_URL, keyRaw, {
      model: OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION_MODEL,
      prompt: job.prompt,
      size: OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION_SIZE,
      quality: 'medium',
      background: 'transparent',
      output_format: 'png',
      n: 1
    });
  } catch (err) {
    const classified = classifyProviderFailFast(0, err && err.message);
    failFast = {
      ...classified,
      failFast: true,
      sanitizedError: classified.sanitizedError || 'provider_error'
    };
    stopReason = failFast.code || 'PROVIDER_REQUEST_FAILURE';
    resultRow = emptyJobResult(job, { error: failFast.sanitizedError, failFast: true, status: 'FAILED' });
    res = null;
  }

  const actualUsage = [];
  if (res) {
    const b64 = res.body?.data?.[0]?.b64_json || null;
    const ok = res.status >= 200 && res.status < 300 && Boolean(b64);
    const usage = res.body?.usage || null;
    const usageSpend = actualSpendUsdFromUsage(usage);
    const callSpend = usageSpend == null ? (ok ? Number(projectNextCallUsd()) : 0) : usageSpend;
    spentUsd = +(spentUsd + callSpend).toFixed(6);
    actualUsage.push({
      rank: 1,
      jobId: job.jobId,
      canonicalSlug: 'apple',
      quality: 'medium',
      usage: usage || null,
      spendUsd: callSpend,
      spendSource: usageSpend == null ? (ok ? 'projected_fallback' : 'none') : 'provider_usage'
    });
    const classified = classifyProviderFailFast(res.status, res.body?.error?.message || res.body?.error);
    if (classified.failFast) {
      failFast = classified;
      stopReason = classified.code;
      resultRow = emptyJobResult(job, {
        httpStatus: res.status,
        error: classified.sanitizedError,
        failFast: true,
        status: 'FAILED'
      });
    } else if (!ok) {
      stopReason = 'GENERATION_FAILED';
      resultRow = emptyJobResult(job, {
        httpStatus: res.status,
        error: classified.sanitizedError || 'generation_failed',
        status: 'FAILED'
      });
    } else {
      const bytes = Buffer.from(b64, 'base64');
      const filename = `${job.jobId}.png`;
      const absFile = path.join(candidateDir, filename);
      const relFile = path.join(CANDIDATE_REL, filename).replace(/\\/g, '/');
      if (PROTECTED_MARKERS.some((marker) => relFile.includes(marker))) {
        stopReason = 'PROTECTED_ASSET_WRITE_FORBIDDEN';
        resultRow = emptyJobResult(job, { error: stopReason, status: 'FAILED' });
      } else {
        if (writeFiles) fs.writeFileSync(absFile, bytes);
        let technical;
        try {
          technical = inspectTechnicalQa(bytes);
        } catch {
          technical = { result: 'UNKNOWN', reasons: ['inspect_failed'], metrics: {} };
        }
        resultRow = {
          ...job,
          generated: true,
          status: 'GENERATED',
          httpStatus: res.status,
          error: null,
          file: relFile,
          bytes: bytes.length,
          TECHNICAL_QA: technical.result || 'UNKNOWN',
          technicalQa: { result: technical.result, reasons: technical.reasons, metrics: technical.metrics },
          BOTANICAL_IDENTITY_QA: 'UNKNOWN',
          DETAIL_QA: 'UNKNOWN',
          STATE_QA: 'UNKNOWN',
          OWNER_VISUAL_QA: 'UNKNOWN',
          familyPolicy: null,
          approvalStatus: 'candidate',
          outputStatus: 'CALIBRATION_CANDIDATE',
          approvalEligible: false,
          autoApproved: false,
          retries: 0,
          actualModel: OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION_MODEL,
          actualQuality: 'medium',
          actualSpendUsd: callSpend
        };
      }
    }
  }

  const registryAfter = fs.readFileSync(path.join(root, REGISTRY_REL));
  const oliveAfter = fs.existsSync(path.join(root, OLIVE_REL))
    ? fs.readFileSync(path.join(root, OLIVE_REL))
    : Buffer.alloc(0);
  const controlAfter = fs.readFileSync(path.join(root, APPLE_DORMANT_CANDIDATE.file));
  let controlDiag = null;
  let candidateDiag = { arm: 'NEW', generated: false };
  if (writeFiles) {
    controlDiag = controlBranchStructureDiagnostics(root);
    candidateDiag = candidateBranchStructureDiagnostics(root, job.candidateFile);
    writeBranchStructureCalibrationReview(root, { ...job, generated: resultRow.generated === true }, controlDiag, candidateDiag);
  }

  const summary = {
    blocked: false,
    executed: true,
    reason: stopReason,
    failFast,
    runId: BRANCH_STRUCTURE_CALIBRATION_RUN_ID,
    model: OWNER_APPROVED_BRANCH_STRUCTURE_CALIBRATION_MODEL,
    ownerApprovedThisRunOnly: true,
    approvalState: 'APPROVED_THIS_RUN_ONLY_EXHAUSTED',
    spendGateFinal: 'DENIED',
    attemptedCalls,
    successfulCalls: resultRow.generated ? 1 : 0,
    failedCalls: resultRow.generated ? 0 : 1,
    retries: 0,
    maxCalls: 1,
    maxRetries: 0,
    maxSpendUsd: BRANCH_STRUCTURE_CALIBRATION_HARD_CAP_USD,
    actualSpendUsd: spentUsd,
    actualUsage,
    jobs: [resultRow],
    imagesGenerated: resultRow.generated ? 1 : 0,
    extraJobs: 0,
    autoApprovedAssets: 0,
    highCalls: 0,
    productionRegistryChanged: !registryBefore.equals(registryAfter),
    oliveAssetChanged: !oliveBefore.equals(oliveAfter),
    controlChanged: !controlBefore.equals(controlAfter),
    massGenerationStarted: false,
    familyPolicyAutoChanged: false,
    candidateDir: CANDIDATE_REL.replace(/\\/g, '/'),
    liveReviewHash: '#design-asset-branch-structure-calibration-1',
    alphaComparison: {
      CONTROL: controlDiag,
      NEW: candidateDiag,
      universalMagicThreshold: null,
      ownerVisualReviewAuthoritative: true
    },
    branchStructureStatus: 'OWNER_REVIEW_REQUIRED',
    keyPresence: keyPresence.openaiApiKey
  };

  if (writeFiles) {
    const outDir = path.join(root, RESULTS_REL);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'results.json'), `${JSON.stringify(summary, null, 2)}\n`);
    writeSpendClosed(root, summary);
    fs.writeFileSync(
      path.join(root, 'data', 'garden-design', 'branch-structure-calibration-prep-v1', 'technical-comparison-metrics.json'),
      `${JSON.stringify(
        {
          contract: 'branch-structure-calibration-prep-v1',
          CONTROL: controlDiag,
          NEW: candidateDiag,
          universalMagicThreshold: null
        },
        null,
        2
      )}\n`
    );
  }

  return summary;
}
