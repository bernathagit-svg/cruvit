/**
 * Paid image spend gate V1.
 *
 * Default: DENY. No network. Owner approval is a run-level flag, not a sticky grant.
 * Does not validate API keys over the network. Does not print secret values.
 */

export const PAID_IMAGE_SPEND_GATE_VERSION = '1.0.0';

export const PAID_IMAGE_PROVIDER = 'openai-images-api';
export const PAID_IMAGE_MODEL = 'gpt-image-2';
export const PAID_IMAGE_SIZE = '1024x1536';
export const PAID_IMAGE_QUALITY = 'medium';
export const PAID_IMAGE_OUTPUT_USD_MEDIUM_1024x1536 = 0.041;

const UNUSABLE_KEY_SHAPE =
  /^(no value|not found|undefined|null|your.?key|changeme|placeholder|example)/i;

export function parsePaidSpendFlags(argv = []) {
  const args = Array.isArray(argv) ? argv.map((a) => String(a)) : [];
  const dryRun = args.includes('--dry-run');
  let allowPaidCalls = 0;
  for (const arg of args) {
    const match = /^--allow-paid-calls=(\d+)$/.exec(arg);
    if (match) allowPaidCalls = Number(match[1]);
  }
  if (!Number.isInteger(allowPaidCalls) || allowPaidCalls < 0) allowPaidCalls = 0;
  return {
    dryRun,
    allowPaidCalls,
    retriesApproved: 0,
    defaultDeny: allowPaidCalls <= 0 || dryRun
  };
}

export function classifyOpenAiKeyPresence(raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value) {
    return { openaiApiKey: 'absent', billingKeyReadiness: 'NOT_READY', networkValidation: 'not-performed' };
  }
  if (value.length < 24 || UNUSABLE_KEY_SHAPE.test(value) || !value.startsWith('sk-')) {
    return { openaiApiKey: 'unusable', billingKeyReadiness: 'NOT_READY', networkValidation: 'not-performed' };
  }
  return {
    openaiApiKey: 'present',
    billingKeyReadiness: 'UNKNOWN',
    networkValidation: 'not-performed',
    note: 'Live key validity cannot be confirmed without a generation request. No probe is made.'
  };
}

export function buildPreflight(input = {}) {
  const flags = input.flags || parsePaidSpendFlags([]);
  const key = input.keyStatus || classifyOpenAiKeyPresence('');
  const assetCount = Number(input.assetCount || 0);
  const usdPerCall = Number(input.usdPerImageOutput ?? PAID_IMAGE_OUTPUT_USD_MEDIUM_1024x1536);
  const maxApprovedCalls = flags.dryRun ? 0 : flags.allowPaidCalls;
  const plannedCalls = Math.min(assetCount, maxApprovedCalls);
  const estimatedImageOutputCost = +(plannedCalls * usdPerCall).toFixed(3);
  const maximumEstimatedSpend = +(maxApprovedCalls * usdPerCall).toFixed(3);
  return {
    provider: PAID_IMAGE_PROVIDER,
    model: PAID_IMAGE_MODEL,
    size: PAID_IMAGE_SIZE,
    quality: PAID_IMAGE_QUALITY,
    numberOfApprovedCalls: plannedCalls,
    estimatedImageOutputCostUsd: estimatedImageOutputCost,
    maximumApprovedCalls: maxApprovedCalls,
    maximumEstimatedSpendUsd: maximumEstimatedSpend,
    retriesApproved: 0,
    billingKeyReadiness: key.billingKeyReadiness,
    openaiApiKey: key.openaiApiKey,
    networkValidation: key.networkValidation,
    defaultDeny: flags.defaultDeny === true,
    dryRun: flags.dryRun === true
  };
}

export function formatPreflight(preflight) {
  return [
    'PAID IMAGE SPEND PREFLIGHT',
    `provider: ${preflight.provider}`,
    `model: ${preflight.model}`,
    `number of approved calls: ${preflight.numberOfApprovedCalls}`,
    `estimated image-output cost: $${preflight.estimatedImageOutputCostUsd}`,
    `maximum approved calls: ${preflight.maximumApprovedCalls}`,
    `maximum estimated spend: $${preflight.maximumEstimatedSpendUsd}`,
    `billing/key readiness: ${preflight.billingKeyReadiness}`,
    `OPENAI_API_KEY: ${preflight.openaiApiKey}`,
    `retries approved: ${preflight.retriesApproved}`,
    `dry-run: ${preflight.dryRun}`,
    `default deny: ${preflight.defaultDeny}`
  ].join('\n');
}

export function assertMaySpend(preflight, counters = {}) {
  const attempted = Number(counters.attemptedCalls || 0);
  const max = Number(preflight.maximumApprovedCalls || 0);
  if (preflight.dryRun || preflight.defaultDeny || max <= 0) {
    const err = new Error('PAID_SPEND_DENIED');
    err.code = 'PAID_SPEND_DENIED';
    throw err;
  }
  if (preflight.billingKeyReadiness === 'NOT_READY') {
    const err = new Error('PAID_SPEND_KEY_NOT_READY');
    err.code = 'PAID_SPEND_KEY_NOT_READY';
    throw err;
  }
  if (attempted >= max) {
    const err = new Error('PAID_SPEND_CALL_LIMIT');
    err.code = 'PAID_SPEND_CALL_LIMIT';
    throw err;
  }
  return true;
}

export function sanitizeProviderError(message) {
  const text = String(message == null ? '' : message);
  if (/incorrect api key|invalid api key|unauthorized/i.test(text)) return 'incorrect_api_key';
  if (/rate limit/i.test(text)) return 'rate_limit';
  if (!text) return 'provider_error';
  return text.replace(/sk-[A-Za-z0-9_\-]+/g, '[redacted]').slice(0, 180);
}

export function createCallCounter(maxApprovedCalls) {
  return {
    attemptedCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    maxApprovedCalls: Number(maxApprovedCalls || 0)
  };
}

export function recordAttempt(counter, ok) {
  if (counter.attemptedCalls >= counter.maxApprovedCalls) {
    const err = new Error('PAID_SPEND_CALL_LIMIT');
    err.code = 'PAID_SPEND_CALL_LIMIT';
    throw err;
  }
  counter.attemptedCalls += 1;
  if (ok) counter.successfulCalls += 1;
  else counter.failedCalls += 1;
  return counter;
}
