/**
 * Owner-approved woody foliage detail A/B. This-run-only. 2 calls. 0 retries.
 * Does not write production registry or factory prompt/quality.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTROL_JOB,
  WOODY_FOLIAGE_DETAIL_AB_FORBIDDEN_QUALITY,
  WOODY_FOLIAGE_DETAIL_AB_HARD_CAP_USD,
  WOODY_FOLIAGE_DETAIL_AB_RUN_ID,
  WOODY_FOLIAGE_DETAIL_AB_SPEND_GATE,
  buildWoodyFoliageDetailAbJobs,
  costPreflightWoodyFoliageDetailAb,
  executeWoodyFoliageDetailAb
} from './woody-foliage-detail-ab-prep-v1.js';
import { parseSpendEnvelope, classifyProviderKey } from './spend-envelope-v1.js';
import { actualSpendUsdFromUsage } from './total-api-cost-v1.js';
import { inspectTechnicalQa } from './technical-qa-v1.js';
import { classifyProviderFailFast } from './provider-fail-fast-v1.js';
import { OPENAI_IMAGES_GENERATIONS_URL, postOpenAiImagesJson } from './openai-images-http-v1.js';
import { inspectOpenAiKeyPresenceOnly } from './calibration-paid-preflight-v1.js';
import { writeWoodyFoliageDetailAbReview } from './woody-foliage-detail-ab-review-v1.js';
import {
  PAID_IMAGE_QUALITY,
  PAID_IMAGE_SIZE
} from '../../runtime-guards/paid-image-spend-gate-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..', '..');
const CANDIDATE_REL = path.join(
  'modules',
  'garden-design',
  'assets',
  'plants',
  'woody-foliage-detail-ab-1'
);
const RESULTS_REL = path.join('data', 'garden-design', 'woody-foliage-detail-ab-1');
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

export const OWNER_APPROVED_WOODY_FOLIAGE_DETAIL_AB = Object.freeze({
  runId: WOODY_FOLIAGE_DETAIL_AB_RUN_ID,
  provider: 'openai-images-api',
  model: 'gpt-image-2.5-flare-2026-09-08',
  maxJobs: 2,
  maxCalls: 2,
  maxRetries: 0,
  maxSpendUsd: WOODY_FOLIAGE_DETAIL_AB_HARD_CAP_USD,
  qualityA: 'medium',
  qualityB: 'high',
  size: PAID_IMAGE_SIZE,
  background: 'transparent',
  outputFormat: 'png'
});

export const OWNER_APPROVED_WOODY_FOLIAGE_DETAIL_AB_COMMAND = Object.freeze([
  `--run-id=${OWNER_APPROVED_WOODY_FOLIAGE_DETAIL_AB.runId}`,
  `--approve-envelope=${OWNER_APPROVED_WOODY_FOLIAGE_DETAIL_AB.runId}`,
  `--owner-approve-run=${OWNER_APPROVED_WOODY_FOLIAGE_DETAIL_AB.runId}`,
  `--provider=${OWNER_APPROVED_WOODY_FOLIAGE_DETAIL_AB.provider}`,
  `--model=${OWNER_APPROVED_WOODY_FOLIAGE_DETAIL_AB.model}`,
  '--max-jobs=2',
  '--max-calls=2',
  '--max-retries=0',
  '--max-spend-usd=0.30',
  '--allow-paid-calls=2',
  '--quality-a=medium',
  '--quality-b=high'
]);

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

export function parseOwnerApprovedWoodyFoliageDetailAb(argv = []) {
  const args = Array.isArray(argv) ? argv.map((a) => String(a)) : [];
  const parsed = parseSpendEnvelope(args);
  const spec = OWNER_APPROVED_WOODY_FOLIAGE_DETAIL_AB;
  const ownerApproveRun = strFlag(args, 'owner-approve-run');
  const approveEnvelope = strFlag(args, 'approve-envelope');
  const qualityA = strFlag(args, 'quality-a') || spec.qualityA;
  const qualityB = strFlag(args, 'quality-b') || spec.qualityB;
  const forbiddenHit = WOODY_FOLIAGE_DETAIL_AB_FORBIDDEN_QUALITY.some(
    (q) => qualityA === q || qualityB === q || parsed.model.includes(q)
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
    qualityA === 'medium' &&
    qualityB === 'high' &&
    forbiddenHit !== true &&
    parsed.dryRun !== true;
  return {
    ...parsed,
    qualityA,
    qualityB,
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

function preflightJobs() {
  const jobs = buildWoodyFoliageDetailAbJobs();
  const reasons = [];
  if (jobs.length !== 2) reasons.push('jobs_not_2');
  if (jobs[0].quality !== 'medium') reasons.push('a_quality_not_medium');
  if (jobs[1].quality !== 'high') reasons.push('b_quality_not_high');
  if (jobs[0].prompt !== jobs[1].prompt) reasons.push('prompt_mismatch');
  if (jobs[0].canonicalSlug !== 'mango' || jobs[1].canonicalSlug !== 'mango') reasons.push('slug');
  if (jobs[0].architectureMode !== 'tree' || jobs[1].architectureMode !== 'tree') reasons.push('architecture');
  if (jobs[0].growthStage !== 'mature' || jobs[1].growthStage !== 'mature') reasons.push('stage');
  if (jobs[0].phenologyState !== 'vegetative' || jobs[1].phenologyState !== 'vegetative') {
    reasons.push('phenology');
  }
  if (!jobs[0].prompt.includes('individually legible natural mango leaves')) reasons.push('v2_prompt');
  return { jobs, ok: reasons.length === 0, reasons };
}

export async function executeWoodyFoliageDetailAbPaid(argv = [], options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const command = parseOwnerApprovedWoodyFoliageDetailAb(argv);
  const keyPresence = inspectOpenAiKeyPresenceOnly(options.apiKeyRaw ?? readKeyRaw(root));
  const registryBefore = fs.readFileSync(path.join(root, REGISTRY_REL));
  const oliveBefore = fs.existsSync(path.join(root, OLIVE_REL))
    ? fs.readFileSync(path.join(root, OLIVE_REL))
    : Buffer.alloc(0);
  const controlBefore = fs.readFileSync(path.join(root, CONTROL_JOB.file));
  const factoryQualityBefore = PAID_IMAGE_QUALITY;
  const cost = costPreflightWoodyFoliageDetailAb();
  const jobCheck = preflightJobs();

  const blocked = (reason, extra = {}) => ({
    blocked: true,
    executed: false,
    reason,
    runId: WOODY_FOLIAGE_DETAIL_AB_RUN_ID,
    model: OWNER_APPROVED_WOODY_FOLIAGE_DETAIL_AB.model,
    ownerApprovedThisRunOnly: command.ownerApprovedThisRunOnly === true,
    spendGateFinal: 'DENIED',
    attemptedCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    retries: 0,
    actualSpendUsd: 0,
    imagesGenerated: 0,
    autoApprovedAssets: 0,
    productionRegistryChanged: false,
    productionFactoryPromptChanged: false,
    productionFactoryQualityChanged: false,
    keyPresence: keyPresence.openaiApiKey,
    denyStub: executeWoodyFoliageDetailAb(),
    ...extra
  });

  if (command.ownerApprovedThisRunOnly !== true || command.allowNetwork !== true) {
    return blocked('PAID_SPEND_DENIED');
  }
  if (command.model !== OWNER_APPROVED_WOODY_FOLIAGE_DETAIL_AB.model) return blocked('PAID_SPEND_MODEL_DENIED');
  if (keyPresence.openaiApiKey !== 'PRESENT') return blocked('PAID_SPEND_KEY_NOT_READY');
  if (command.maxRetries !== 0) return blocked('PAID_SPEND_RETRY_LIMIT');
  if (!jobCheck.ok) return blocked('PAID_SPEND_JOB_PREFLIGHT', { preflightReasons: jobCheck.reasons });
  if (cost.projectedTotalUsd > WOODY_FOLIAGE_DETAIL_AB_HARD_CAP_USD) {
    return blocked('PAID_SPEND_PROJECTED_OVER_CAP');
  }

  const keyRaw = options.apiKeyRaw !== undefined ? options.apiKeyRaw : readKeyRaw(root);
  const keyStatus = classifyProviderKey(
    { provider: 'openai-images-api', model: OWNER_APPROVED_WOODY_FOLIAGE_DETAIL_AB.model },
    keyRaw
  );
  if (keyStatus.billingKeyReadiness === 'NOT_READY') return blocked('PAID_SPEND_KEY_NOT_READY');

  const jobs = jobCheck.jobs;
  const post = options.postJson || postOpenAiImagesJson;
  const writeFiles = options.writeFiles !== false;
  const candidateDir = path.join(root, CANDIDATE_REL);
  if (writeFiles) fs.mkdirSync(candidateDir, { recursive: true });

  const results = [];
  const actualUsage = [];
  let spentUsd = 0;
  let attemptedCalls = 0;
  let stopReason = null;
  let failFast = null;

  const runOne = async (job) => {
    if (attemptedCalls >= 2) {
      stopReason = 'PAID_SPEND_CALL_LIMIT';
      return null;
    }
    const quality = job.quality;
    if (quality !== 'medium' && quality !== 'high') {
      stopReason = 'PAID_SPEND_QUALITY_FORBIDDEN';
      return null;
    }
    if (WOODY_FOLIAGE_DETAIL_AB_FORBIDDEN_QUALITY.includes(quality)) {
      stopReason = 'PAID_SPEND_QUALITY_FORBIDDEN';
      return null;
    }
    attemptedCalls += 1;
    const res = await post(OPENAI_IMAGES_GENERATIONS_URL, keyRaw, {
      model: OWNER_APPROVED_WOODY_FOLIAGE_DETAIL_AB.model,
      prompt: job.prompt,
      size: PAID_IMAGE_SIZE,
      quality,
      background: 'transparent',
      output_format: 'png',
      n: 1
    });
    const b64 = res.body?.data?.[0]?.b64_json || null;
    const ok = res.status >= 200 && res.status < 300 && Boolean(b64);
    const usage = res.body?.usage || null;
    const usageSpend = actualSpendUsdFromUsage(usage);
    const callSpend =
      usageSpend == null
        ? ok
          ? Number(quality === 'high' ? cost.highArm.projectedUsd : cost.mediumArm.projectedUsd)
          : 0
        : usageSpend;
    spentUsd = +(spentUsd + callSpend).toFixed(6);
    actualUsage.push({
      arm: job.arm,
      jobId: job.jobId,
      quality,
      usage: usage || null,
      spendUsd: callSpend,
      spendSource: usageSpend == null ? (ok ? 'projected_fallback' : 'none') : 'provider_usage'
    });
    process.stderr.write(
      `woody-foliage-ab ${job.arm} ${job.jobId} ${ok ? 'GENERATED' : 'FAILED'} spend=${spentUsd} calls=${attemptedCalls}\n`
    );
    const classified = classifyProviderFailFast(res.status, res.body?.error?.message || res.body?.error);
    if (classified.failFast) {
      failFast = classified;
      stopReason = classified.code;
      results.push({
        ...job,
        generated: false,
        status: 'FAILED',
        httpStatus: res.status,
        error: classified.sanitizedError,
        failFast: true,
        retries: 0,
        approvalStatus: 'candidate',
        outputStatus: 'CALIBRATION_CANDIDATE',
        autoApproved: false,
        OWNER_VISUAL_QA: 'UNKNOWN'
      });
      return null;
    }
    if (!ok) {
      results.push({
        ...job,
        generated: false,
        status: 'FAILED',
        httpStatus: res.status,
        error: classified.sanitizedError || 'generation_failed',
        retries: 0,
        approvalStatus: 'candidate',
        outputStatus: 'CALIBRATION_CANDIDATE',
        autoApproved: false,
        OWNER_VISUAL_QA: 'UNKNOWN'
      });
      return null;
    }
    const bytes = Buffer.from(b64, 'base64');
    const filename = `${job.jobId}.png`;
    const absFile = path.join(candidateDir, filename);
    const relFile = path.join(CANDIDATE_REL, filename).replace(/\\/g, '/');
    if (relFile.includes('batch-2-candidates') || relFile.includes('olive-tree')) {
      stopReason = 'PROTECTED_ASSET_WRITE_FORBIDDEN';
      return null;
    }
    if (writeFiles) fs.writeFileSync(absFile, bytes);
    const technical = inspectTechnicalQa(bytes);
    const row = {
      ...job,
      generated: true,
      status: 'GENERATED',
      httpStatus: res.status,
      error: null,
      file: relFile,
      bytes: bytes.length,
      TECHNICAL_QA: technical.result || 'UNKNOWN',
      technicalQa: { result: technical.result, reasons: technical.reasons, metrics: technical.metrics },
      actualModel: OWNER_APPROVED_WOODY_FOLIAGE_DETAIL_AB.model,
      actualQuality: quality,
      actualSpendUsd: callSpend,
      OWNER_VISUAL_QA: 'UNKNOWN',
      approvalStatus: 'candidate',
      outputStatus: 'CALIBRATION_CANDIDATE',
      autoApproved: false,
      approvalEligible: false,
      retries: 0
    };
    results.push(row);
    return row;
  };

  try {
    const a = await runOne(jobs[0]);
    if (a && !stopReason) {
      const projectedB = Number(cost.highArm.projectedUsd);
      if (spentUsd + projectedB > WOODY_FOLIAGE_DETAIL_AB_HARD_CAP_USD + 1e-9) {
        stopReason = 'PAID_SPEND_USD_LIMIT_BEFORE_B';
      } else {
        await runOne(jobs[1]);
      }
    }
  } catch (err) {
    const classified = classifyProviderFailFast(0, err && err.message);
    failFast = {
      ...classified,
      failFast: true,
      sanitizedError: classified.sanitizedError || 'provider_error'
    };
    stopReason = failFast.code || 'PROVIDER_REQUEST_FAILURE';
  }

  const registryAfter = fs.readFileSync(path.join(root, REGISTRY_REL));
  const oliveAfter = fs.existsSync(path.join(root, OLIVE_REL))
    ? fs.readFileSync(path.join(root, OLIVE_REL))
    : Buffer.alloc(0);
  const controlAfter = fs.readFileSync(path.join(root, CONTROL_JOB.file));

  const aRow = results.find((r) => r.arm === 'A') || null;
  const bRow = results.find((r) => r.arm === 'B') || null;
  if (writeFiles) {
    writeWoodyFoliageDetailAbReview(root, {
      aFile: aRow && aRow.file,
      bFile: bRow && bRow.file,
      aMetrics: aRow && aRow.technicalQa && aRow.technicalQa.metrics,
      bMetrics: bRow && bRow.technicalQa && bRow.technicalQa.metrics
    });
  }

  const summary = {
    blocked: false,
    executed: true,
    reason: stopReason,
    failFast,
    runId: WOODY_FOLIAGE_DETAIL_AB_RUN_ID,
    model: OWNER_APPROVED_WOODY_FOLIAGE_DETAIL_AB.model,
    ownerApprovedThisRunOnly: true,
    approvalState: 'APPROVED_THIS_RUN_ONLY_EXHAUSTED',
    spendGateFinal: 'DENIED',
    attemptedCalls,
    successfulCalls: results.filter((r) => r.generated).length,
    failedCalls: results.filter((r) => !r.generated).length,
    retries: 0,
    maxCalls: 2,
    maxRetries: 0,
    maxSpendUsd: WOODY_FOLIAGE_DETAIL_AB_HARD_CAP_USD,
    actualSpendUsd: spentUsd,
    actualUsage,
    jobs: results,
    imagesGenerated: results.filter((r) => r.generated).length,
    extraJobs: Math.max(0, results.length - 2),
    autoApprovedAssets: 0,
    productionRegistryChanged: !registryBefore.equals(registryAfter),
    oliveAssetChanged: !oliveBefore.equals(oliveAfter),
    controlChanged: !controlBefore.equals(controlAfter),
    productionFactoryQualityChanged: factoryQualityBefore !== PAID_IMAGE_QUALITY,
    productionFactoryPromptChanged: false,
    candidateDir: CANDIDATE_REL.replace(/\\/g, '/'),
    liveReviewHash: '#design-asset-woody-foliage-detail-ab-1',
    keyPresence: keyPresence.openaiApiKey
  };

  if (writeFiles) {
    const outDir = path.join(root, RESULTS_REL);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'results.json'), `${JSON.stringify(summary, null, 2)}\n`);
    fs.writeFileSync(
      path.join(root, 'data', 'garden-design', 'woody-foliage-detail-ab-prep-v1', 'ab-spend-gate.json'),
      `${JSON.stringify(
        {
          contract: 'woody-foliage-detail-ab-prep-v1',
          gate: { ...WOODY_FOLIAGE_DETAIL_AB_SPEND_GATE, state: 'DENIED', execute: false },
          executeResult: executeWoodyFoliageDetailAb(),
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
