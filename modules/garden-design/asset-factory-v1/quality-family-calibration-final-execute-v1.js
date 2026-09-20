/**
 * Owner-approved quality-family final calibration. This-run-only. 7 medium calls. 0 retries.
 * Does not write production registry. Does not auto-approve. Does not start mass generation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QUALITY_FAMILY_CALIBRATION_FINAL_RUN_ID,
  QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE,
  buildQualityFamilyCalibrationFinalJobs,
  executeQualityFamilyCalibrationFinal
} from './quality-family-calibration-final-prep-v1.js';
import { PROMPT_TEMPLATE_VERSION_VISUAL_STATE_DETAIL_V2 } from './prompt-factory-visual-state-detail-v2.js';
import { DETAIL_CLASS } from './design-asset-quality-policy-v1.js';
import { parseSpendEnvelope, classifyProviderKey } from './spend-envelope-v1.js';
import { actualSpendUsdFromUsage } from './total-api-cost-v1.js';
import { inspectTechnicalQa } from './technical-qa-v1.js';
import { assessIdentityQa } from './identity-qa-v1.js';
import { assessInGardenQa, composeApprovalVerdict, IN_GARDEN_REVIEW_FIELDS } from './in-garden-qa-v1.js';
import { classifyProviderFailFast } from './provider-fail-fast-v1.js';
import { OPENAI_IMAGES_GENERATIONS_URL, postOpenAiImagesJson } from './openai-images-http-v1.js';
import { inspectOpenAiKeyPresenceOnly } from './calibration-paid-preflight-v1.js';
import { writeQualityFamilyCalibrationFinalReview } from './quality-family-calibration-final-review-v1.js';
import { DESIGN_ASSET_FACTORY } from './design-asset-factory-v1.js';
import { PAID_IMAGE_QUALITY } from '../../runtime-guards/paid-image-spend-gate-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..', '..');
const CANDIDATE_REL = path.join(
  'modules',
  'garden-design',
  'assets',
  'plants',
  'quality-family-calibration-final-1'
);
const RESULTS_REL = path.join('data', 'garden-design', 'quality-family-calibration-final-1');
const PREP_MANIFEST_REL = path.join(
  'data',
  'garden-design',
  'quality-family-calibration-final-prep-v1',
  'final-job-manifest.json'
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
  'woody-foliage-detail-ab-1'
]);

export const QUALITY_FAMILY_CALIBRATION_FINAL_HARD_CAP_USD = 0.15;
export const QUALITY_FAMILY_CALIBRATION_FINAL_OBSERVED_MEDIUM_USD = 0.013175;
export const QUALITY_FAMILY_CALIBRATION_FINAL_NEXT_CALL_BUFFER = 1.1;
export const QUALITY_FAMILY_CALIBRATION_FINAL_CACHE_BUST = '20260920b';
export const OWNER_APPROVED_QUALITY_FAMILY_FINAL_MODEL = 'gpt-image-2.5-flare-2026-09-08';
export const OWNER_APPROVED_QUALITY_FAMILY_FINAL_SIZE = '1024x1536';

export const APPROVED_FINAL_IDENTITY = Object.freeze([
  'avocado:mature:tree:vegetative',
  'apple:mature:tree:dormant',
  'lavender:mature:shrub:vegetative',
  'lavender:mature:shrub:flowering',
  'banana:mature:default:fruiting',
  'pineapple:mature:default:vegetative',
  'aloe-vera:mature:default:vegetative'
]);

export const OWNER_APPROVED_QUALITY_FAMILY_FINAL = Object.freeze({
  runId: QUALITY_FAMILY_CALIBRATION_FINAL_RUN_ID,
  provider: 'openai-images-api',
  model: OWNER_APPROVED_QUALITY_FAMILY_FINAL_MODEL,
  maxJobs: 7,
  maxCalls: 7,
  maxRetries: 0,
  maxSpendUsd: QUALITY_FAMILY_CALIBRATION_FINAL_HARD_CAP_USD,
  quality: 'medium',
  size: OWNER_APPROVED_QUALITY_FAMILY_FINAL_SIZE,
  background: 'transparent',
  outputFormat: 'png',
  promptTemplateVersion: PROMPT_TEMPLATE_VERSION_VISUAL_STATE_DETAIL_V2,
  highJobs: 0
});

export const OWNER_APPROVED_QUALITY_FAMILY_FINAL_COMMAND = Object.freeze([
  `--run-id=${OWNER_APPROVED_QUALITY_FAMILY_FINAL.runId}`,
  `--approve-envelope=${OWNER_APPROVED_QUALITY_FAMILY_FINAL.runId}`,
  `--owner-approve-run=${OWNER_APPROVED_QUALITY_FAMILY_FINAL.runId}`,
  `--provider=${OWNER_APPROVED_QUALITY_FAMILY_FINAL.provider}`,
  `--model=${OWNER_APPROVED_QUALITY_FAMILY_FINAL.model}`,
  '--max-jobs=7',
  '--max-calls=7',
  '--max-retries=0',
  '--max-spend-usd=0.15',
  '--allow-paid-calls=7',
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

export function jobIdentityKey(job = {}) {
  return [
    job.canonicalSlug,
    job.growthStage,
    job.architectureMode,
    job.phenologyState || job.phenology
  ].join(':');
}

export function manifestMatchesApproved(jobs = []) {
  const keys = (jobs || []).map(jobIdentityKey);
  return keys.length === 7 && keys.join('|') === APPROVED_FINAL_IDENTITY.join('|');
}

export function parseOwnerApprovedQualityFamilyFinal(argv = []) {
  const args = Array.isArray(argv) ? argv.map((a) => String(a)) : [];
  const parsed = parseSpendEnvelope(args);
  const spec = OWNER_APPROVED_QUALITY_FAMILY_FINAL;
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

export function projectNextCallUsd(actualUsage = []) {
  const observed = (actualUsage || [])
    .map((row) => Number(row.spendUsd))
    .filter((n) => Number.isFinite(n) && n > 0);
  const baseline = QUALITY_FAMILY_CALIBRATION_FINAL_OBSERVED_MEDIUM_USD;
  if (observed.length) {
    const mean = observed.reduce((a, b) => a + b, 0) / observed.length;
    const last = observed[observed.length - 1];
    return +((Math.max(mean, last, baseline) * QUALITY_FAMILY_CALIBRATION_FINAL_NEXT_CALL_BUFFER).toFixed(6));
  }
  return +(baseline * QUALITY_FAMILY_CALIBRATION_FINAL_NEXT_CALL_BUFFER).toFixed(6);
}

export function wouldViolateHardCap(spentUsd, projectedNext, maxSpendUsd = QUALITY_FAMILY_CALIBRATION_FINAL_HARD_CAP_USD) {
  return Number(spentUsd || 0) + Number(projectedNext || 0) > Number(maxSpendUsd) + 1e-9;
}

function preflightJobs(jobs) {
  const reasons = [];
  if (!Array.isArray(jobs) || jobs.length !== 7) reasons.push('jobs_not_7');
  if (!manifestMatchesApproved(jobs)) reasons.push('manifest_mismatch');
  if ((jobs || []).some((job) => job.quality !== 'medium')) reasons.push('quality_not_medium');
  if ((jobs || []).some((job) => job.promptTemplateVersion !== PROMPT_TEMPLATE_VERSION_VISUAL_STATE_DETAIL_V2)) {
    reasons.push('prompt_not_v2');
  }
  if ((jobs || []).some((job) => !String(job.prompt || '').includes('individually legible natural foliage'))) {
    reasons.push('v2_prompt_missing');
  }
  const avocado = (jobs || []).find((job) => job.canonicalSlug === 'avocado');
  if (!avocado || !(avocado.qualityFamilies || []).includes(DETAIL_CLASS.WOODY_OPEN_OR_LARGE_LEAF)) {
    reasons.push('avocado_open_leaf_missing');
  }
  if ((jobs || []).some((job) => job.inheritMangoHighPolicy === true)) reasons.push('mango_high_inherit');
  if (QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE.highJobs !== 0) reasons.push('high_jobs_authorized');
  if (DESIGN_ASSET_FACTORY.generateOnRender !== false) reasons.push('generate_on_render');
  if (DESIGN_ASSET_FACTORY.autonomousGeneration !== false) reasons.push('autonomous_generation');
  if (PAID_IMAGE_QUALITY !== 'medium') reasons.push('factory_quality_not_medium');
  return { ok: reasons.length === 0, reasons };
}

function emptyJobResult(job, extras = {}) {
  return {
    rank: job.rank,
    jobId: job.jobId,
    canonicalSlug: job.canonicalSlug,
    visualForm: job.visualForm,
    architectureMode: job.architectureMode,
    growthStage: job.growthStage,
    phenologyState: job.phenologyState,
    qualityFamilies: job.qualityFamilies,
    quality: 'medium',
    generated: false,
    status: extras.status || 'FAILED',
    httpStatus: null,
    error: null,
    file: null,
    bytes: 0,
    TECHNICAL_QA: 'UNKNOWN',
    BOTANICAL_IDENTITY_QA: 'UNKNOWN',
    DETAIL_QA: 'UNKNOWN',
    STATE_QA: 'UNKNOWN',
    IN_GARDEN_QA: 'BLOCKED',
    OWNER_VISUAL_QA: 'UNKNOWN',
    familyPolicy: null,
    approvalStatus: 'candidate',
    outputStatus: 'CALIBRATION_CANDIDATE',
    autoApproved: false,
    retries: 0,
    ...extras
  };
}

function loadLockedJobs(root) {
  const packPath = path.join(root, PREP_MANIFEST_REL);
  const pack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  const jobs = Array.isArray(pack.jobs) ? pack.jobs : [];
  const built = buildQualityFamilyCalibrationFinalJobs();
  if (!manifestMatchesApproved(jobs) || jobs.length !== 7) {
    const err = new Error('FINAL_MANIFEST_MISMATCH');
    err.code = 'FINAL_MANIFEST_MISMATCH';
    throw err;
  }
  if (!manifestMatchesApproved(built)) {
    const err = new Error('FINAL_LOCKED_JOBS_MISMATCH');
    err.code = 'FINAL_LOCKED_JOBS_MISMATCH';
    throw err;
  }
  return built;
}

export async function executeQualityFamilyCalibrationFinalPaid(argv = [], options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const command = parseOwnerApprovedQualityFamilyFinal(argv);
  const keyPresence = inspectOpenAiKeyPresenceOnly(options.apiKeyRaw ?? readKeyRaw(root));
  const registryBefore = fs.readFileSync(path.join(root, REGISTRY_REL));
  const oliveBefore = fs.existsSync(path.join(root, OLIVE_REL))
    ? fs.readFileSync(path.join(root, OLIVE_REL))
    : Buffer.alloc(0);
  const projectedSeven = +(7 * QUALITY_FAMILY_CALIBRATION_FINAL_OBSERVED_MEDIUM_USD).toFixed(6);

  const blocked = (reason, extra = {}) => ({
    blocked: true,
    executed: false,
    reason,
    runId: QUALITY_FAMILY_CALIBRATION_FINAL_RUN_ID,
    model: OWNER_APPROVED_QUALITY_FAMILY_FINAL_MODEL,
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
    familyPolicyAutoChanged: false,
    keyPresence: keyPresence.openaiApiKey,
    denyStub: executeQualityFamilyCalibrationFinal(),
    ...extra
  });

  if (command.ownerApprovedThisRunOnly !== true || command.allowNetwork !== true) {
    return blocked('PAID_SPEND_DENIED');
  }
  if (command.model !== OWNER_APPROVED_QUALITY_FAMILY_FINAL_MODEL) return blocked('PAID_SPEND_MODEL_DENIED');
  if (command.quality !== 'medium') return blocked('PAID_SPEND_QUALITY_DENIED');
  if (keyPresence.openaiApiKey !== 'PRESENT') return blocked('PAID_SPEND_KEY_NOT_READY');
  if (command.maxRetries !== 0) return blocked('PAID_SPEND_RETRY_LIMIT');
  if (QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE.maxRetries !== 0) return blocked('PAID_SPEND_RETRY_LIMIT');
  if (projectedSeven > QUALITY_FAMILY_CALIBRATION_FINAL_HARD_CAP_USD) {
    return blocked('PAID_SPEND_PROJECTED_OVER_CAP', { projectedSevenUsd: projectedSeven });
  }

  let jobs;
  try {
    jobs = loadLockedJobs(root);
  } catch (err) {
    return blocked(err.code || 'FINAL_MANIFEST_MISMATCH');
  }
  const jobCheck = preflightJobs(jobs);
  if (!jobCheck.ok) return blocked('PAID_SPEND_JOB_PREFLIGHT', { preflightReasons: jobCheck.reasons });

  const keyRaw = options.apiKeyRaw !== undefined ? options.apiKeyRaw : readKeyRaw(root);
  const keyStatus = classifyProviderKey(
    { provider: 'openai-images-api', model: OWNER_APPROVED_QUALITY_FAMILY_FINAL_MODEL },
    keyRaw
  );
  if (keyStatus.billingKeyReadiness === 'NOT_READY') return blocked('PAID_SPEND_KEY_NOT_READY');

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
  let highCalls = 0;

  for (const job of jobs) {
    if (attemptedCalls >= 7) {
      stopReason = 'PAID_SPEND_CALL_LIMIT';
      results.push(emptyJobResult(job, { error: stopReason, status: 'FAILED' }));
      continue;
    }
    if (job.quality !== 'medium') {
      stopReason = 'PAID_SPEND_QUALITY_FORBIDDEN';
      results.push(emptyJobResult(job, { error: stopReason, status: 'FAILED' }));
      break;
    }
    const projectedNext = projectNextCallUsd(actualUsage);
    if (wouldViolateHardCap(spentUsd, projectedNext)) {
      stopReason = 'PAID_SPEND_USD_LIMIT';
      results.push(
        emptyJobResult(job, {
          error: stopReason,
          status: 'FAILED',
          projectedNextUsd: projectedNext,
          spentUsdBeforeCall: spentUsd
        })
      );
      break;
    }

    attemptedCalls += 1;
    let res;
    try {
      res = await post(OPENAI_IMAGES_GENERATIONS_URL, keyRaw, {
        model: OWNER_APPROVED_QUALITY_FAMILY_FINAL_MODEL,
        prompt: job.prompt,
        size: OWNER_APPROVED_QUALITY_FAMILY_FINAL_SIZE,
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
      results.push(emptyJobResult(job, { error: failFast.sanitizedError, failFast: true, status: 'FAILED' }));
      break;
    }

    const b64 = res.body?.data?.[0]?.b64_json || null;
    const ok = res.status >= 200 && res.status < 300 && Boolean(b64);
    const usage = res.body?.usage || null;
    const usageSpend = actualSpendUsdFromUsage(usage);
    const callSpend =
      usageSpend == null ? (ok ? Number(projectNextCallUsd(actualUsage)) : 0) : usageSpend;
    spentUsd = +(spentUsd + callSpend).toFixed(6);
    actualUsage.push({
      rank: job.rank,
      jobId: job.jobId,
      canonicalSlug: job.canonicalSlug,
      quality: 'medium',
      usage: usage || null,
      spendUsd: callSpend,
      spendSource: usageSpend == null ? (ok ? 'projected_fallback' : 'none') : 'provider_usage'
    });
    process.stderr.write(
      `quality-family-final job ${job.rank}/7 ${job.jobId} ${ok ? 'GENERATED' : 'FAILED'} spend=${spentUsd} calls=${attemptedCalls}\n`
    );

    const classified = classifyProviderFailFast(res.status, res.body?.error?.message || res.body?.error);
    if (classified.failFast) {
      failFast = classified;
      stopReason = classified.code;
      results.push(
        emptyJobResult(job, {
          httpStatus: res.status,
          error: classified.sanitizedError,
          failFast: true,
          status: 'FAILED'
        })
      );
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
    const filename = `${job.jobId}.png`;
    const relFile = path.join(CANDIDATE_REL, filename).replace(/\\/g, '/');
    if (PROTECTED_MARKERS.some((marker) => relFile.includes(marker))) {
      stopReason = 'PROTECTED_ASSET_WRITE_FORBIDDEN';
      results.push(emptyJobResult(job, { error: stopReason, status: 'FAILED' }));
      break;
    }
    if (writeFiles) fs.writeFileSync(path.join(candidateDir, filename), bytes);

    let technical;
    try {
      technical = inspectTechnicalQa(bytes);
    } catch (err) {
      technical = {
        result: 'FAIL',
        reasons: [err && err.code ? err.code : 'technical_inspect_failed'],
        metrics: {}
      };
    }
    const identity = assessIdentityQa(job, { canonicalSlug: job.canonicalSlug, scientific: job.scientific });
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
      canonicalSlug: job.canonicalSlug,
      scientific: job.scientific,
      visualForm: job.visualForm,
      architectureMode: job.architectureMode,
      growthStage: job.growthStage,
      phenologyState: job.phenologyState,
      qualityFamilies: job.qualityFamilies,
      quality: 'medium',
      generated: true,
      status: 'GENERATED',
      httpStatus: res.status,
      error: null,
      file: relFile,
      bytes: bytes.length,
      TECHNICAL_QA: technical.result || 'UNKNOWN',
      technicalQa: { result: technical.result, reasons: technical.reasons, metrics: technical.metrics },
      BOTANICAL_IDENTITY_QA: identity.result || 'UNKNOWN',
      DETAIL_QA: 'UNKNOWN',
      STATE_QA: 'UNKNOWN',
      IN_GARDEN_QA: verdict.IN_GARDEN_QA,
      OWNER_VISUAL_QA: 'UNKNOWN',
      inGardenReviewFields: IN_GARDEN_REVIEW_FIELDS.slice(),
      familyPolicy: null,
      approvalStatus: 'candidate',
      outputStatus: 'CALIBRATION_CANDIDATE',
      approvalEligible: false,
      autoApproved: false,
      retries: 0,
      actualModel: OWNER_APPROVED_QUALITY_FAMILY_FINAL_MODEL,
      actualQuality: 'medium',
      actualSpendUsd: callSpend,
      promptTemplateVersion: job.promptTemplateVersion
    });
  }

  const registryAfter = fs.readFileSync(path.join(root, REGISTRY_REL));
  const oliveAfter = fs.existsSync(path.join(root, OLIVE_REL))
    ? fs.readFileSync(path.join(root, OLIVE_REL))
    : Buffer.alloc(0);

  if (writeFiles) {
    writeQualityFamilyCalibrationFinalReview(root, {
      jobs: buildQualityFamilyCalibrationFinalJobs(),
      generatedJobs: results,
      generatedCount: results.filter((row) => row.generated).length
    });
  }

  const summary = {
    blocked: false,
    executed: true,
    reason: stopReason,
    failFast,
    runId: QUALITY_FAMILY_CALIBRATION_FINAL_RUN_ID,
    model: OWNER_APPROVED_QUALITY_FAMILY_FINAL_MODEL,
    ownerApprovedThisRunOnly: true,
    approvalState: 'APPROVED_THIS_RUN_ONLY_EXHAUSTED',
    spendGateFinal: 'DENIED',
    attemptedCalls,
    successfulCalls: results.filter((row) => row.generated).length,
    failedCalls: results.filter((row) => !row.generated).length,
    retries: 0,
    maxCalls: 7,
    maxRetries: 0,
    maxSpendUsd: QUALITY_FAMILY_CALIBRATION_FINAL_HARD_CAP_USD,
    actualSpendUsd: spentUsd,
    actualUsage,
    jobs: results,
    imagesGenerated: results.filter((row) => row.generated).length,
    extraJobs: Math.max(0, results.length - 7),
    autoApprovedAssets: 0,
    highCalls,
    allQualitiesMedium: results.every((row) => row.quality === 'medium'),
    productionRegistryChanged: !registryBefore.equals(registryAfter),
    oliveAssetChanged: !oliveBefore.equals(oliveAfter),
    massGenerationStarted: false,
    familyPolicyAutoChanged: false,
    candidateDir: CANDIDATE_REL.replace(/\\/g, '/'),
    liveReviewHash: '#design-asset-quality-family-calibration-final-1',
    keyPresence: keyPresence.openaiApiKey,
    preflight: {
      openaiApiKey: keyPresence.openaiApiKey,
      runId: QUALITY_FAMILY_CALIBRATION_FINAL_RUN_ID,
      jobs: 7,
      maxCalls: 7,
      retries: 0,
      model: OWNER_APPROVED_QUALITY_FAMILY_FINAL_MODEL,
      prompt: PROMPT_TEMPLATE_VERSION_VISUAL_STATE_DETAIL_V2,
      quality: 'medium',
      highJobs: 0,
      size: OWNER_APPROVED_QUALITY_FAMILY_FINAL_SIZE,
      transparentPng: true,
      productionRegistryWrites: false,
      autoApproval: false,
      generateOnRender: false,
      massGeneration: false,
      hardCapUsd: QUALITY_FAMILY_CALIBRATION_FINAL_HARD_CAP_USD,
      projectedSevenUsd: projectedSeven
    }
  };

  if (writeFiles) {
    const outDir = path.join(root, RESULTS_REL);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'results.json'), `${JSON.stringify(summary, null, 2)}\n`);
    fs.writeFileSync(
      path.join(root, 'data', 'garden-design', 'quality-family-calibration-final-prep-v1', 'final-spend-gate.json'),
      `${JSON.stringify(
        {
          contract: 'quality-family-calibration-final-prep-v1',
          gate: { ...QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE, state: 'DENIED', execute: false },
          executeResult: executeQualityFamilyCalibrationFinal(),
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
