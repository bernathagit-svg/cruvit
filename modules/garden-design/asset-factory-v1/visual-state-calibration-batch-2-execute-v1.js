/**
 * Owner-approved Visual State Calibration Batch 2 execution.
 * This-run-only. Candidates only. No production registry writes. Retries = 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BATCH_2_JOBS,
  BATCH_2_SPEND_GATE,
  VISUAL_STATE_CALIBRATION_BATCH_2_RUN_ID,
  attachCatalogIdentity,
  executeVisualStateCalibrationBatch2
} from './visual-state-calibration-batch-2-prep-v1.js';
import { buildVisualStateFamilyPromptRecord } from './prompt-factory-visual-state-family-v1.js';
import { DEFAULT_GENERATION_SETTINGS } from './prompt-factory-v1.js';
import {
  parseSpendEnvelope,
  classifyProviderKey,
  createEnvelopeCounters,
  recordAttempt
} from './spend-envelope-v1.js';
import { actualSpendUsdFromUsage } from './total-api-cost-v1.js';
import { inspectTechnicalQa } from './technical-qa-v1.js';
import { assessIdentityQa } from './identity-qa-v1.js';
import { assessInGardenQa, composeApprovalVerdict, IN_GARDEN_REVIEW_FIELDS } from './in-garden-qa-v1.js';
import { classifyProviderFailFast } from './provider-fail-fast-v1.js';
import { OPENAI_IMAGES_GENERATIONS_URL, postOpenAiImagesJson } from './openai-images-http-v1.js';
import { loadCanonicalCatalog } from './catalog-source-v1.js';
import { inspectOpenAiKeyPresenceOnly } from './calibration-paid-preflight-v1.js';
import { writeVisualStateCalibrationBatch2Review } from './visual-state-calibration-batch-2-review-v1.js';
import {
  PAID_IMAGE_MODEL,
  PAID_IMAGE_SIZE,
  PAID_IMAGE_QUALITY
} from '../../runtime-guards/paid-image-spend-gate-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..', '..');
const CANDIDATE_REL = path.join(
  'modules',
  'garden-design',
  'assets',
  'plants',
  'batch-2-candidates',
  'visual-state-calibration-batch-2'
);
const RESULTS_REL = path.join('data', 'garden-design', 'visual-state-calibration-batch-2');
const PREP_MANIFEST_REL = path.join(
  'data',
  'garden-design',
  'visual-state-calibration-batch-2-prep-v1',
  'batch-2-job-manifest.json'
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
const BATCH_1_CANDIDATE_MARKER = 'batch-1-candidates';

export const BATCH_2_CANDIDATE_DIR = CANDIDATE_REL.replace(/\\/g, '/');
export const BATCH_2_HARD_SPEND_USD = 0.2;
export const BATCH_1_OBSERVED_MEDIUM_IMAGE_OUTPUT_TOKENS = 343;
export const NEXT_CALL_BUFFER = 1.1;

export const OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2 = Object.freeze({
  runId: VISUAL_STATE_CALIBRATION_BATCH_2_RUN_ID,
  provider: 'openai-images-api',
  model: PAID_IMAGE_MODEL,
  maxJobs: 11,
  maxCalls: 11,
  maxRetries: 0,
  maxSpendUsd: BATCH_2_HARD_SPEND_USD,
  carryForward: false,
  previousApprovalReuse: false
});

export const OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2_COMMAND = Object.freeze([
  `--run-id=${OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2.runId}`,
  `--approve-envelope=${OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2.runId}`,
  `--owner-approve-run=${OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2.runId}`,
  `--provider=${OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2.provider}`,
  `--model=${OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2.model}`,
  '--max-jobs=11',
  '--max-calls=11',
  '--max-retries=0',
  '--max-spend-usd=0.20',
  '--allow-paid-calls=11'
]);

export const APPROVED_BATCH_2_IDENTITY = Object.freeze([
  'mango:mature:tree:vegetative',
  'mango:young:tree:vegetative',
  'mango:mature:tree:fruiting',
  'banana:mature:default:vegetative',
  'banana:young:default:vegetative',
  'apple:mature:tree:vegetative',
  'apple:mature:tree:dormant',
  'pomegranate:mature:tree:vegetative',
  'pomegranate:mature:shrub:vegetative',
  'lavender:mature:shrub:vegetative',
  'lavender:mature:shrub:flowering'
]);

function strFlag(args, name) {
  for (const arg of args) {
    const match = new RegExp(`^--${name}=(.+)$`).exec(String(arg));
    if (match) return String(match[1]);
  }
  return '';
}

export function jobIdentityKey(job = {}) {
  return [
    job.canonicalSlug,
    job.growthStage,
    job.architectureMode,
    job.phenologyState || job.phenology
  ].join(':');
}

export function lockedBatch2IdentityKeys(jobs = BATCH_2_JOBS) {
  return (jobs || []).map(jobIdentityKey);
}

export function manifestMatchesApproved(jobs = BATCH_2_JOBS) {
  const keys = lockedBatch2IdentityKeys(jobs);
  return (
    keys.length === 11 &&
    keys.join('|') === APPROVED_BATCH_2_IDENTITY.join('|') &&
    keys.every((key) => !key.startsWith('eggplant:'))
  );
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

export function parseOwnerApprovedVisualStateCalibrationBatch2(argv = []) {
  const args = Array.isArray(argv) ? argv.map((a) => String(a)) : [];
  const parsed = parseSpendEnvelope(args);
  const spec = OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2;
  const ownerApproveRun = strFlag(args, 'owner-approve-run');
  const approveEnvelope = strFlag(args, 'approve-envelope');
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
    parsed.dryRun !== true;
  return {
    ...parsed,
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

export function estimateCallUsdFromPrompt(prompt) {
  const textTokens = Math.max(1, Math.ceil(String(prompt || '').length / 4));
  return actualSpendUsdFromUsage({
    input_tokens_details: { text_tokens: textTokens, image_tokens: 0 },
    output_tokens: BATCH_1_OBSERVED_MEDIUM_IMAGE_OUTPUT_TOKENS
  });
}

export function projectNextCallUsd(actualUsage = [], prompt = '') {
  const observed = (actualUsage || [])
    .map((row) => Number(row.spendUsd))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (observed.length) {
    const mean = observed.reduce((a, b) => a + b, 0) / observed.length;
    const last = observed[observed.length - 1];
    return +((Math.max(mean, last) * NEXT_CALL_BUFFER).toFixed(6));
  }
  const estimated = estimateCallUsdFromPrompt(prompt);
  return +(Number(estimated || 0) * NEXT_CALL_BUFFER).toFixed(6);
}

export function wouldViolateHardCap(spentUsd, projectedNext, maxSpendUsd = BATCH_2_HARD_SPEND_USD) {
  return Number(spentUsd || 0) + Number(projectedNext || 0) > Number(maxSpendUsd) + 1e-9;
}

function candidateFilename(job) {
  return `${job.jobId}.png`;
}

function emptyJobResult(job, extras = {}) {
  return {
    rank: job.rank,
    jobId: job.jobId,
    family: job.family,
    familyId: job.familyId,
    canonicalSlug: job.canonicalSlug,
    visualForm: job.visualForm,
    architectureMode: job.architectureMode,
    growthStage: job.growthStage,
    phenologyState: job.phenologyState || job.phenology,
    variantKey: job.variantKey,
    generated: false,
    status: extras.status || 'FAILED',
    httpStatus: null,
    error: null,
    file: null,
    bytes: 0,
    TECHNICAL_QA: 'UNKNOWN',
    BOTANICAL_IDENTITY_QA: 'UNKNOWN',
    STATE_QA: 'UNKNOWN',
    FAMILY_CONSISTENCY_QA: 'UNKNOWN',
    IN_GARDEN_QA: 'BLOCKED',
    OWNER_VISUAL_QA: 'UNKNOWN',
    approvalStatus: 'candidate',
    outputStatus: 'CALIBRATION_CANDIDATE',
    retries: 0,
    ...extras
  };
}

function loadLockedJobs(root) {
  const packPath = path.join(root, PREP_MANIFEST_REL);
  const pack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  const jobs = Array.isArray(pack.jobs) ? pack.jobs : [];
  if (!manifestMatchesApproved(jobs) || jobs.length !== 11) {
    const err = new Error('BATCH_2_MANIFEST_MISMATCH');
    err.code = 'BATCH_2_MANIFEST_MISMATCH';
    throw err;
  }
  if (!manifestMatchesApproved(BATCH_2_JOBS)) {
    const err = new Error('BATCH_2_LOCKED_JOBS_MISMATCH');
    err.code = 'BATCH_2_LOCKED_JOBS_MISMATCH';
    throw err;
  }
  return jobs.slice(0, 11);
}

export async function executeVisualStateCalibrationBatch2Paid(argv = [], options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const command = parseOwnerApprovedVisualStateCalibrationBatch2(argv);
  const keyPresence = inspectOpenAiKeyPresenceOnly(options.apiKeyRaw ?? readKeyRaw(root));
  const registryBefore = fs.readFileSync(path.join(root, REGISTRY_REL));
  const oliveBefore = fs.existsSync(path.join(root, OLIVE_REL))
    ? fs.readFileSync(path.join(root, OLIVE_REL))
    : Buffer.alloc(0);

  const blocked = (reason, extra = {}) => ({
    blocked: true,
    executed: false,
    reason,
    runId: OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2.runId,
    model: PAID_IMAGE_MODEL,
    ownerApprovedThisRunOnly: command.ownerApprovedThisRunOnly === true,
    carryForward: false,
    previousApprovalReuse: false,
    approvalState: command.approvalState,
    spendGateFinal: BATCH_2_SPEND_GATE.state,
    attemptedCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    retries: 0,
    actualSpendUsd: 0,
    actualUsage: [],
    jobs: extra.jobs || [],
    networkRequests: 0,
    paidCalls: 0,
    imagesGenerated: 0,
    approvedAssetsAdded: 0,
    autoApprovedAssets: 0,
    extraJobs: 0,
    productionRegistryChanged: false,
    productionDeploy: false,
    keyPresence: keyPresence.openaiApiKey,
    denyStub: executeVisualStateCalibrationBatch2(),
    ...extra
  });

  if (command.ownerApprovedThisRunOnly !== true || command.allowNetwork !== true) {
    return blocked('PAID_SPEND_DENIED');
  }
  if (command.model !== PAID_IMAGE_MODEL) {
    return blocked('PAID_SPEND_MODEL_DENIED');
  }
  if (keyPresence.openaiApiKey !== 'PRESENT') {
    return blocked('PAID_SPEND_KEY_NOT_READY');
  }
  if (BATCH_2_SPEND_GATE.maxRetries !== 0 || command.maxRetries !== 0) {
    return blocked('PAID_SPEND_RETRY_LIMIT');
  }

  let jobs;
  try {
    jobs = loadLockedJobs(root);
  } catch (err) {
    return blocked(err.code || 'BATCH_2_MANIFEST_MISMATCH');
  }

  const keyRaw = options.apiKeyRaw !== undefined ? options.apiKeyRaw : readKeyRaw(root);
  const envelope = {
    ...command,
    defaultDeny: false,
    dryRun: false,
    model: PAID_IMAGE_MODEL,
    runId: OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2.runId,
    maxJobs: 11,
    maxCalls: 11,
    maxRetries: 0,
    maxSpendUsd: BATCH_2_HARD_SPEND_USD
  };
  const keyStatus = classifyProviderKey(envelope, keyRaw);
  envelope.billingKeyReadiness = keyStatus.billingKeyReadiness;
  const counters = createEnvelopeCounters(envelope);
  counters.billingKeyReadiness = keyStatus.billingKeyReadiness;
  if (keyStatus.billingKeyReadiness === 'NOT_READY') {
    return blocked('PAID_SPEND_KEY_NOT_READY');
  }

  const catalog = options.plants
    ? { plants: options.plants }
    : loadCanonicalCatalog(root);
  const plantsBySlug = new Map(
    (catalog.plants || []).map((p) => [p.canonicalSlug || p.slug, p])
  );
  const post = options.postJson || postOpenAiImagesJson;
  const writeFiles = options.writeFiles !== false;
  const candidateDir = path.join(root, CANDIDATE_REL);
  if (writeFiles) fs.mkdirSync(candidateDir, { recursive: true });

  const results = [];
  const actualUsage = [];
  let stopReason = null;
  let failFast = null;

  for (const rawJob of jobs) {
    const plant = plantsBySlug.get(rawJob.canonicalSlug) || { canonicalSlug: rawJob.canonicalSlug };
    const job = attachCatalogIdentity(rawJob, plant);
    const promptRecord = buildVisualStateFamilyPromptRecord(job, {
      provider: envelope.provider,
      model: envelope.model,
      settings: DEFAULT_GENERATION_SETTINGS
    });

    if (counters.attemptedCalls >= envelope.maxCalls) {
      stopReason = 'PAID_SPEND_CALL_LIMIT';
      results.push(emptyJobResult(job, { error: stopReason, status: 'FAILED' }));
      continue;
    }
    if (counters.retriesUsed > 0 || envelope.maxRetries !== 0) {
      stopReason = 'PAID_SPEND_RETRY_LIMIT';
      results.push(emptyJobResult(job, { error: stopReason, status: 'FAILED' }));
      break;
    }

    const projectedNext = projectNextCallUsd(actualUsage, promptRecord.prompt);
    if (wouldViolateHardCap(counters.spentUsd, projectedNext, envelope.maxSpendUsd)) {
      stopReason = 'PAID_SPEND_USD_LIMIT';
      results.push(
        emptyJobResult(job, {
          error: stopReason,
          status: 'FAILED',
          projectedNextUsd: projectedNext,
          spentUsdBeforeCall: counters.spentUsd
        })
      );
      break;
    }

    let res;
    try {
      res = await post(OPENAI_IMAGES_GENERATIONS_URL, keyRaw, {
        model: PAID_IMAGE_MODEL,
        prompt: promptRecord.prompt,
        size: PAID_IMAGE_SIZE,
        quality: PAID_IMAGE_QUALITY,
        background: DEFAULT_GENERATION_SETTINGS.background,
        output_format: DEFAULT_GENERATION_SETTINGS.outputFormat,
        n: 1
      });
    } catch (err) {
      recordAttempt(counters, false);
      const classified = classifyProviderFailFast(0, err && err.message);
      failFast = {
        ...classified,
        failFast: true,
        code: 'PROVIDER_AUTH_FAIL_FAST',
        reason: classified.reason || 'provider_request_failure',
        sanitizedError: classified.sanitizedError || 'provider_error'
      };
      results.push(
        emptyJobResult(job, {
          error: failFast.sanitizedError,
          failFast: true,
          status: 'FAILED'
        })
      );
      stopReason = failFast.code;
      break;
    }

    const b64 = res.body?.data?.[0]?.b64_json || null;
    const ok = res.status >= 200 && res.status < 300 && Boolean(b64);
    recordAttempt(counters, ok);
    counters.jobsStarted += 1;
    const usage = res.body?.usage || null;
    const usageSpend = actualSpendUsdFromUsage(usage);
    const callSpend = usageSpend == null ? (ok ? Number(projectNextCallUsd(actualUsage, promptRecord.prompt)) : 0) : usageSpend;
    counters.spentUsd = +(Number(counters.spentUsd) + callSpend).toFixed(6);
    actualUsage.push({
      rank: job.rank,
      jobId: job.jobId,
      canonicalSlug: job.canonicalSlug,
      usage: usage || null,
      spendUsd: callSpend,
      spendSource: usageSpend == null ? (ok ? 'projected_fallback' : 'none') : 'provider_usage'
    });
    process.stderr.write(
      `batch-2 job ${job.rank}/11 ${job.jobId} ${ok ? 'GENERATED' : 'FAILED'} spend=${counters.spentUsd} calls=${counters.attemptedCalls}\n`
    );

    const classified = classifyProviderFailFast(res.status, res.body?.error?.message || res.body?.error);
    if (classified.failFast) {
      failFast = classified;
      results.push(
        emptyJobResult(job, {
          httpStatus: res.status,
          error: classified.sanitizedError,
          failFast: true,
          failFastReason: classified.reason,
          status: 'FAILED'
        })
      );
      stopReason = classified.code;
      break;
    }

    if (!ok) {
      results.push(
        emptyJobResult(job, {
          httpStatus: res.status,
          error: classified.sanitizedError || 'generation_failed',
          TECHNICAL_QA: 'FAIL',
          status: 'FAILED'
        })
      );
      continue;
    }

    const bytes = Buffer.from(b64, 'base64');
    const filename = candidateFilename(job);
    const absFile = path.join(candidateDir, filename);
    const relFile = path.join(CANDIDATE_REL, filename).replace(/\\/g, '/');
    if (relFile.includes(BATCH_1_CANDIDATE_MARKER)) {
      results.push(emptyJobResult(job, { error: 'BATCH_1_OVERWRITE_FORBIDDEN', status: 'FAILED' }));
      stopReason = 'BATCH_1_OVERWRITE_FORBIDDEN';
      break;
    }
    if (writeFiles) fs.writeFileSync(absFile, bytes);

    const technical = inspectTechnicalQa(bytes);
    const identity = assessIdentityQa(job, plant);
    const inGarden = assessInGardenQa({
      generated: true,
      bytes,
      realSavedGardenPhotoReady: false,
      assetQa: technical
    });
    const verdict = composeApprovalVerdict(
      technical.result === 'FAIL' || identity.result === 'FAIL' ? 'FAIL' : 'UNKNOWN',
      inGarden.result,
      { realSavedGardenPhotoUsed: false }
    );

    results.push({
      rank: job.rank,
      jobId: job.jobId,
      family: job.family,
      familyId: job.familyId,
      canonicalSlug: job.canonicalSlug,
      scientific: job.scientific || null,
      visualForm: job.visualForm,
      architectureMode: job.architectureMode,
      growthStage: job.growthStage,
      phenologyState: job.phenologyState || job.phenology,
      identityPrecision: job.identityPrecision,
      variantKey: job.variantKey,
      generated: true,
      status: 'GENERATED',
      httpStatus: res.status,
      error: null,
      file: relFile,
      bytes: bytes.length,
      TECHNICAL_QA: technical.result || 'UNKNOWN',
      technicalQa: { result: technical.result, reasons: technical.reasons, metrics: technical.metrics },
      BOTANICAL_IDENTITY_QA: identity.result || 'UNKNOWN',
      identityQa: { result: identity.result, reasons: identity.reasons, confidence: identity.confidence },
      STATE_QA: 'UNKNOWN',
      FAMILY_CONSISTENCY_QA: 'UNKNOWN',
      IN_GARDEN_QA: verdict.IN_GARDEN_QA,
      OWNER_VISUAL_QA: 'UNKNOWN',
      inGardenReviewFields: IN_GARDEN_REVIEW_FIELDS.slice(),
      approvalStatus: 'candidate',
      outputStatus: 'CALIBRATION_CANDIDATE',
      approvalEligible: false,
      autoApproved: false,
      retries: 0,
      promptTemplateVersion: promptRecord.promptTemplateVersion,
      round1LearningInherited: promptRecord.round1LearningInherited,
      model: PAID_IMAGE_MODEL
    });
  }

  const seen = new Set(results.map((r) => r.jobId));
  for (const job of jobs) {
    if (!seen.has(job.jobId)) {
      results.push(emptyJobResult(job, { error: stopReason || 'not_attempted', status: 'FAILED' }));
    }
  }
  results.sort((a, b) => Number(a.rank) - Number(b.rank));

  const registryAfter = fs.readFileSync(path.join(root, REGISTRY_REL));
  const oliveAfter = fs.existsSync(path.join(root, OLIVE_REL))
    ? fs.readFileSync(path.join(root, OLIVE_REL))
    : Buffer.alloc(0);
  const productionRegistryChanged = !registryBefore.equals(registryAfter);
  const oliveChanged = !oliveBefore.equals(oliveAfter);

  const review = writeFiles
    ? writeVisualStateCalibrationBatch2Review(root, { generatedJobs: results })
    : { htmlPath: null, liveRel: null };

  const summary = {
    blocked: false,
    executed: true,
    reason: stopReason,
    failFast,
    runId: OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2.runId,
    provider: OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2.provider,
    model: PAID_IMAGE_MODEL,
    ownerApprovedThisRunOnly: true,
    carryForward: false,
    previousApprovalReuse: false,
    automaticTopUp: false,
    approvalState: 'APPROVED_THIS_RUN_ONLY_EXHAUSTED',
    spendGateFinal: 'DENIED',
    attemptedCalls: counters.attemptedCalls,
    successfulCalls: counters.successfulCalls,
    failedCalls: counters.failedCalls,
    retries: 0,
    maxCalls: envelope.maxCalls,
    maxRetries: 0,
    maxSpendUsd: envelope.maxSpendUsd,
    actualSpendUsd: counters.spentUsd,
    actualUsage,
    jobs: results,
    networkRequests: counters.attemptedCalls,
    paidCalls: counters.attemptedCalls,
    imagesGenerated: results.filter((r) => r.generated).length,
    successCount: results.filter((r) => r.generated).length,
    failureCount: results.filter((r) => !r.generated).length,
    extraJobs: Math.max(0, results.length - 11),
    approvedAssetsAdded: 0,
    autoApprovedAssets: 0,
    productionRegistryChanged,
    oliveAssetChanged: oliveChanged,
    productionDeploy: false,
    candidateDir: BATCH_2_CANDIDATE_DIR,
    ownerReviewPage: review.htmlPath
      ? path.relative(root, review.htmlPath).replace(/\\/g, '/')
      : null,
    liveReviewHash: '#design-asset-visual-state-calibration-batch-2',
    keyPresence: keyPresence.openaiApiKey
  };

  if (writeFiles) {
    const outDir = path.join(root, RESULTS_REL);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'results.json'), `${JSON.stringify(summary, null, 2)}\n`);
    fs.writeFileSync(
      path.join(outDir, 'usage.json'),
      `${JSON.stringify(
        {
          runId: summary.runId,
          model: summary.model,
          attemptedCalls: summary.attemptedCalls,
          successfulCalls: summary.successfulCalls,
          failedCalls: summary.failedCalls,
          retries: 0,
          actualSpendUsd: summary.actualSpendUsd,
          maxSpendUsd: BATCH_2_HARD_SPEND_USD,
          actualUsage: summary.actualUsage,
          failFast: summary.failFast,
          spendGateFinal: 'DENIED'
        },
        null,
        2
      )}\n`
    );
    fs.writeFileSync(
      path.join(root, 'data', 'garden-design', 'visual-state-calibration-batch-2-prep-v1', 'batch-2-spend-gate.json'),
      `${JSON.stringify(
        {
          contract: 'visual-state-calibration-batch-2-prep-v1',
          gate: BATCH_2_SPEND_GATE,
          executeResult: executeVisualStateCalibrationBatch2(),
          lastRun: {
            runId: summary.runId,
            attemptedCalls: summary.attemptedCalls,
            actualSpendUsd: summary.actualSpendUsd,
            spendGateFinal: 'DENIED',
            approvalExhausted: true
          },
          authorizedNow: false
        },
        null,
        2
      )}\n`
    );
  }

  return summary;
}
