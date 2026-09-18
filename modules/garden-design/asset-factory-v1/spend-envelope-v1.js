/**
 * Factory spend envelope on top of paid-image-spend-gate-v1.
 * Default DENY. No carry-forward. No billing/key mutation. No secret printing.
 */
import {
  parsePaidSpendFlags,
  classifyOpenAiKeyPresence,
  assertMaySpend,
  createCallCounter,
  recordAttempt,
  PAID_IMAGE_OUTPUT_USD_MEDIUM_1024x1536
} from '../../runtime-guards/paid-image-spend-gate-v1.js';

export const FACTORY_SPEND_ENVELOPE_VERSION = '1.0.0';

function numFlag(args, name, fallback = 0) {
  for (const arg of args) {
    const match = new RegExp(`^--${name}=(.+)$`).exec(String(arg));
    if (!match) continue;
    const n = Number(match[1]);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function strFlag(args, name, fallback = '') {
  for (const arg of args) {
    const match = new RegExp(`^--${name}=(.+)$`).exec(String(arg));
    if (match) return String(match[1]);
  }
  return fallback;
}

export function parseSpendEnvelope(argv = []) {
  const args = Array.isArray(argv) ? argv.map((a) => String(a)) : [];
  const flags = parsePaidSpendFlags(args);
  const maxCalls = Math.max(0, Math.floor(numFlag(args, 'max-calls', flags.allowPaidCalls)));
  const maxJobs = Math.max(0, Math.floor(numFlag(args, 'max-jobs', 0)));
  const maxRetries = Math.max(0, Math.floor(numFlag(args, 'max-retries', flags.retriesApproved || 0)));
  const maxSpendUsd = Math.max(0, Number(numFlag(args, 'max-spend-usd', 0)));
  const runId = strFlag(args, 'run-id', '');
  const provider = strFlag(args, 'provider', 'openai-images-api');
  const model = strFlag(args, 'model', 'gpt-image-2');
  const dryRun = flags.dryRun === true;
  const approved =
    !dryRun &&
    Boolean(runId) &&
    maxJobs > 0 &&
    maxCalls > 0 &&
    maxSpendUsd > 0;
  return {
    runId,
    provider,
    model,
    maxJobs,
    maxCalls,
    maxRetries,
    maxSpendUsd,
    usdPerCall: PAID_IMAGE_OUTPUT_USD_MEDIUM_1024x1536,
    dryRun,
    defaultDeny: !approved,
    allowPaidCalls: flags.allowPaidCalls
  };
}

export function classifyProviderKey(envelope, rawKey) {
  if (!envelope || envelope.provider === 'openai-images-api') {
    return classifyOpenAiKeyPresence(rawKey);
  }
  const value = String(rawKey == null ? '' : rawKey).trim();
  if (!value) {
    return { apiKey: 'absent', billingKeyReadiness: 'NOT_READY', networkValidation: 'not-performed' };
  }
  return {
    apiKey: 'present',
    billingKeyReadiness: 'UNKNOWN',
    networkValidation: 'not-performed',
    note: 'Live key validity cannot be confirmed without a generation request. No probe is made.'
  };
}

export function buildEnvelopePreflight(envelope, keyStatus = {}, plannedJobs = 0) {
  const maxCalls = envelope.dryRun || envelope.defaultDeny ? 0 : Number(envelope.maxCalls || 0);
  const maxJobs = envelope.dryRun || envelope.defaultDeny ? 0 : Number(envelope.maxJobs || 0);
  const usd = Number(envelope.usdPerCall || PAID_IMAGE_OUTPUT_USD_MEDIUM_1024x1536);
  const approvedCalls = Math.min(maxCalls, Math.max(0, Number(plannedJobs || 0)));
  return {
    runId: envelope.runId || '',
    provider: envelope.provider,
    model: envelope.model,
    numberOfApprovedCalls: approvedCalls,
    estimatedImageOutputCostUsd: +(approvedCalls * usd).toFixed(3),
    maximumApprovedCalls: maxCalls,
    maximumApprovedJobs: maxJobs,
    maximumRetries: envelope.dryRun || envelope.defaultDeny ? 0 : Number(envelope.maxRetries || 0),
    maximumEstimatedSpendUsd: +(maxCalls * usd).toFixed(3),
    envelopeMaxSpendUsd: Number(envelope.maxSpendUsd || 0),
    billingKeyReadiness: keyStatus.billingKeyReadiness || 'UNKNOWN',
    openaiApiKey: keyStatus.openaiApiKey || keyStatus.apiKey || 'unknown',
    networkValidation: keyStatus.networkValidation || 'not-performed',
    defaultDeny: envelope.defaultDeny === true,
    dryRun: envelope.dryRun === true
  };
}

export function formatEnvelopePreflight(preflight) {
  return [
    'DESIGN ASSET FACTORY SPEND PREFLIGHT',
    `runId: ${preflight.runId || '(none)'}`,
    `provider: ${preflight.provider}`,
    `model: ${preflight.model}`,
    `number of approved calls: ${preflight.numberOfApprovedCalls}`,
    `estimated image-output cost: $${preflight.estimatedImageOutputCostUsd}`,
    `maximum approved calls: ${preflight.maximumApprovedCalls}`,
    `maximum approved jobs: ${preflight.maximumApprovedJobs}`,
    `maximum retries: ${preflight.maximumRetries}`,
    `maximum estimated spend: $${preflight.maximumEstimatedSpendUsd}`,
    `envelope max spend usd: $${preflight.envelopeMaxSpendUsd}`,
    `billing/key readiness: ${preflight.billingKeyReadiness}`,
    `OPENAI_API_KEY: ${preflight.openaiApiKey}`,
    `dry-run: ${preflight.dryRun}`,
    `default deny: ${preflight.defaultDeny}`
  ].join('\n');
}

export function assertSpendEnvelope(envelope, counters = {}) {
  const preflight = {
    dryRun: envelope?.dryRun === true,
    defaultDeny: envelope?.defaultDeny !== false,
    maximumApprovedCalls: Number(envelope?.maxCalls || 0),
    billingKeyReadiness: counters.billingKeyReadiness || envelope?.billingKeyReadiness || 'UNKNOWN'
  };
  if (preflight.dryRun || envelope?.defaultDeny === true || !envelope?.runId) {
    const err = new Error('PAID_SPEND_DENIED');
    err.code = 'PAID_SPEND_DENIED';
    throw err;
  }
  assertMaySpend(
    {
      dryRun: false,
      defaultDeny: false,
      maximumApprovedCalls: Number(envelope.maxCalls || 0),
      billingKeyReadiness: preflight.billingKeyReadiness
    },
    { attemptedCalls: Number(counters.attemptedCalls || 0) }
  );
  const jobsStarted = Number(counters.jobsStarted || 0);
  if (jobsStarted >= Number(envelope.maxJobs || 0)) {
    const err = new Error('PAID_SPEND_JOB_LIMIT');
    err.code = 'PAID_SPEND_JOB_LIMIT';
    throw err;
  }
  const retriesUsed = Number(counters.retriesUsed || 0);
  if (Number(envelope.maxRetries || 0) >= 0 && retriesUsed > Number(envelope.maxRetries || 0)) {
    const err = new Error('PAID_SPEND_RETRY_LIMIT');
    err.code = 'PAID_SPEND_RETRY_LIMIT';
    throw err;
  }
  const nextCost = Number(envelope.usdPerCall || PAID_IMAGE_OUTPUT_USD_MEDIUM_1024x1536);
  const spent = Number(counters.spentUsd || 0);
  if (spent + nextCost > Number(envelope.maxSpendUsd || 0) + 1e-9) {
    const err = new Error('PAID_SPEND_USD_LIMIT');
    err.code = 'PAID_SPEND_USD_LIMIT';
    throw err;
  }
  return true;
}

export function createEnvelopeCounters(envelope) {
  return {
    ...createCallCounter(envelope?.maxCalls || 0),
    jobsStarted: 0,
    retriesUsed: 0,
    spentUsd: 0,
    maxJobs: Number(envelope?.maxJobs || 0),
    maxRetries: Number(envelope?.maxRetries || 0),
    maxSpendUsd: Number(envelope?.maxSpendUsd || 0)
  };
}

export { recordAttempt, createCallCounter };
