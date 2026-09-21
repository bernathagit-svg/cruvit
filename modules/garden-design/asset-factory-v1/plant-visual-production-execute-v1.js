/**
 * Generic owner-approved paid executor for Plant Visual Production Pipeline V1.
 *
 * Default deny. It may generate candidate PNGs only when the current run has an
 * explicit matching owner approval envelope. It never writes the live registry.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseSpendEnvelope } from './spend-envelope-v1.js';
import { actualSpendUsdFromUsage } from './total-api-cost-v1.js';
import { postOpenAiImagesJson, OPENAI_IMAGES_GENERATIONS_URL } from './openai-images-http-v1.js';
import { inspectTechnicalQa } from './technical-qa-v1.js';
import { assessIdentityQa } from './identity-qa-v1.js';
import { assessInGardenQa } from './in-garden-qa-v1.js';
import { assessProductionFramingQa } from './production-framing-qa-v1.js';
import {
  buildPlantVisualProductionPlan,
  evaluatePlantVisualCandidate,
  summarizePlantVisualPipeline
} from './plant-visual-production-pipeline-v1.js';

export const PLANT_VISUAL_PRODUCTION_EXECUTOR_VERSION = 'plant-visual-production-execute-v1';
export const PLANT_VISUAL_CANDIDATE_DIR = 'modules/garden-design/assets/plants/candidates/plant-visual-production-v1';

function strFlag(args, name) {
  for (const arg of args || []) {
    const match = new RegExp(`^--${name}=(.+)$`).exec(String(arg));
    if (match) return String(match[1]);
  }
  return '';
}

function listFlag(args, name) {
  const raw = strFlag(args, name);
  if (!raw) return [];
  return [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))];
}

function safeSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'run';
}

export function parsePlantVisualProductionApproval(argv = []) {
  const envelope = parseSpendEnvelope(argv);
  const ownerApproveRun = strFlag(argv, 'owner-approve-run');
  const approveEnvelope = strFlag(argv, 'approve-envelope');
  const executeProductionRun = strFlag(argv, 'execute-production-run');
  const jobIds = listFlag(argv, 'job-ids');
  const matched =
    envelope.defaultDeny === false &&
    envelope.dryRun !== true &&
    Boolean(envelope.runId) &&
    ownerApproveRun === envelope.runId &&
    approveEnvelope === envelope.runId &&
    executeProductionRun === envelope.runId;
  return {
    ...envelope,
    ownerApproveRun,
    approveEnvelope,
    executeProductionRun,
    jobIds,
    ownerApprovedThisRunOnly: matched,
    allowNetwork: matched,
    carryForward: false,
    previousApprovalReuse: false,
    approvalState: matched ? 'APPROVED_THIS_RUN_ONLY' : 'DENIED'
  };
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function projectedCallUsd(command, quality) {
  const base = Number(command.usdPerCallTotal || command.usdPerCall || 0.02);
  return quality === 'high' ? base * 4 : base;
}

function candidateRelPath(runId, jobId) {
  return `${PLANT_VISUAL_CANDIDATE_DIR}/${safeSegment(runId)}/${safeSegment(jobId)}.png`;
}

function blockedResult(command, plan, reason, extra = {}) {
  return {
    version: PLANT_VISUAL_PRODUCTION_EXECUTOR_VERSION,
    blocked: true,
    executed: false,
    reason,
    runId: command.runId || null,
    ownerApprovedThisRunOnly: command.ownerApprovedThisRunOnly === true,
    attemptedCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    actualSpendUsd: 0,
    imagesGenerated: 0,
    productionRegistryChanged: false,
    candidates: [],
    plan,
    ...extra
  };
}

export async function executePlantVisualProductionRun(argv = [], options = {}) {
  const command = parsePlantVisualProductionApproval(argv);
  const plants = options.plants || [];
  const registry = options.registry || { sets: [] };
  const signals = options.signals || {};
  const plan = buildPlantVisualProductionPlan(plants, registry, signals, {
    autoApprovalEnabled: false
  });

  if (!command.ownerApprovedThisRunOnly || !command.allowNetwork) {
    return blockedResult(command, plan, 'PAID_SPEND_DENIED');
  }
  if (command.provider !== 'openai-images-api') {
    return blockedResult(command, plan, 'PROVIDER_NOT_IMPLEMENTED');
  }

  const apiKeyRaw = String(options.apiKeyRaw || '').trim();
  if (!apiKeyRaw) return blockedResult(command, plan, 'PAID_SPEND_KEY_NOT_READY');

  const selectedJobIds = Array.isArray(command.jobIds) ? command.jobIds : [];
  const requested = new Set(selectedJobIds);
  const selectedJobs = selectedJobIds.length
    ? plan.jobs.filter((job) => requested.has(job.jobId))
    : plan.jobs;
  if (selectedJobIds.length) {
    const found = new Set(selectedJobs.map((job) => job.jobId));
    const missingJobIds = selectedJobIds.filter((jobId) => !found.has(jobId));
    if (missingJobIds.length) {
      return blockedResult(command, plan, 'REQUESTED_JOB_NOT_IN_PLAN', { missingJobIds });
    }
    if (selectedJobs.length > command.maxJobs) {
      return blockedResult(command, plan, 'REQUESTED_JOB_COUNT_OVER_MAX_JOBS', {
        requestedJobCount: selectedJobs.length
      });
    }
  }
  const jobs = selectedJobs.slice(0, command.maxJobs);
  const projected = jobs.reduce(
    (sum, job) => sum + projectedCallUsd(command, job.qualityPlan?.quality || 'medium'),
    0
  );
  if (projected > Number(command.maxSpendUsd || 0) + 1e-9) {
    return blockedResult(command, plan, 'PAID_SPEND_PROJECTED_OVER_CAP', {
      projectedSpendUsd: +projected.toFixed(6)
    });
  }

  const root = options.root || process.cwd();
  const post = options.postJson || postOpenAiImagesJson;
  const writeFiles = options.writeFiles !== false;
  const results = [];
  let attemptedCalls = 0;
  let spentUsd = 0;
  let stopReason = null;

  for (const job of jobs) {
    if (attemptedCalls >= command.maxCalls) {
      stopReason = 'PAID_SPEND_CALL_LIMIT';
      break;
    }
    const quality = job.qualityPlan?.quality || 'medium';
    const nextProjected = projectedCallUsd(command, quality);
    if (spentUsd + nextProjected > Number(command.maxSpendUsd || 0) + 1e-9) {
      stopReason = 'PAID_SPEND_USD_LIMIT';
      break;
    }

    attemptedCalls += 1;
    let res;
    try {
      res = await post(OPENAI_IMAGES_GENERATIONS_URL, apiKeyRaw, {
        model: command.model,
        prompt: job.promptRecord?.prompt,
        size: '1024x1536',
        quality,
        background: 'transparent',
        output_format: 'png',
        n: 1
      });
    } catch (err) {
      results.push({
        jobId: job.jobId,
        canonicalSlug: job.canonicalSlug,
        generated: false,
        error: 'provider-request-failed',
        providerErrorCode: err?.code || null
      });
      stopReason = 'PROVIDER_REQUEST_FAILURE';
      break;
    }

    const b64 = res?.body?.data?.[0]?.b64_json || null;
    const ok = Number(res?.status || 0) >= 200 && Number(res?.status || 0) < 300 && Boolean(b64);
    const usage = res?.body?.usage || null;
    const usageSpend = actualSpendUsdFromUsage(usage);
    const callSpend = usageSpend == null ? (ok ? nextProjected : 0) : usageSpend;
    spentUsd = +(spentUsd + Number(callSpend || 0)).toFixed(6);

    if (!ok) {
      results.push({
        jobId: job.jobId,
        canonicalSlug: job.canonicalSlug,
        generated: false,
        httpStatus: res?.status || null,
        error: 'generation-failed',
        actualSpendUsd: callSpend
      });
      continue;
    }

    const bytes = Buffer.from(b64, 'base64');
    const technicalQa = inspectTechnicalQa(bytes);
    const framingQa = assessProductionFramingQa(technicalQa);
    const identityQa = assessIdentityQa(job, {
      canonicalSlug: job.canonicalSlug,
      scientific: job.scientific,
      identityScope: job.identityScope
    });
    const inGardenQa = options.inGardenQaByJobId?.[job.jobId] || assessInGardenQa({
      generated: true,
      bytes,
      realSavedGardenPhotoReady: options.realSavedGardenPhotoReady === true,
      assetQa: technicalQa
    });

    const file = candidateRelPath(command.runId, job.jobId);
    if (writeFiles) {
      const abs = path.join(root, file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, bytes);
    }

    const candidate = {
      assetId: job.jobId,
      job,
      runId: command.runId,
      generationRunId: command.runId,
      provider: command.provider,
      model: command.model,
      quality,
      promptRecord: job.promptRecord,
      promptTemplateVersion: job.promptRecord?.promptTemplateVersion,
      generated: true,
      file,
      bytes: bytes.length,
      sha256: sha256(bytes),
      technicalQa,
      framingQa,
      botanicalIdentityQa: identityQa,
      architectureQa: { result: 'UNKNOWN' },
      growthStageQa: { result: 'UNKNOWN' },
      phenologyStateQa: { result: 'UNKNOWN' },
      inGardenQa,
      ownerVisualQa: { result: 'UNKNOWN' }
    };

    const evaluation = evaluatePlantVisualCandidate(candidate, { autoApprovalEnabled: false });
    results.push({ ...candidate, evaluation, actualSpendUsd: callSpend, usage });
  }

  return {
    version: PLANT_VISUAL_PRODUCTION_EXECUTOR_VERSION,
    blocked: false,
    executed: true,
    reason: stopReason,
    runId: command.runId,
    ownerApprovedThisRunOnly: true,
    attemptedCalls,
    successfulCalls: results.filter((r) => r.generated).length,
    failedCalls: results.filter((r) => r.generated === false).length,
    actualSpendUsd: spentUsd,
    imagesGenerated: results.filter((r) => r.generated).length,
    productionRegistryChanged: false,
    candidates: results,
    summary: summarizePlantVisualPipeline(plan, results.map((r) => r.evaluation || {})),
    plan
  };
}
