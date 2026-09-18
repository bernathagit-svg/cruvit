/**
 * Durable Design Asset job model. Idempotent on canonicalSlug + variantKey + version.
 * Does not generate. Does not write the live registry.
 */
import { FACTORY_JOB_STATES } from './design-asset-factory-v1.js';
import { jobIdentity } from './variant-demand-v1.js';

const TERMINAL = new Set([
  FACTORY_JOB_STATES.CANDIDATE,
  FACTORY_JOB_STATES.APPROVED,
  FACTORY_JOB_STATES.REJECTED,
  FACTORY_JOB_STATES.BLOCKED
]);

const ALLOWED = Object.freeze({
  [FACTORY_JOB_STATES.NEEDED]: [FACTORY_JOB_STATES.QUEUED, FACTORY_JOB_STATES.BLOCKED],
  [FACTORY_JOB_STATES.QUEUED]: [
    FACTORY_JOB_STATES.APPROVED_FOR_SPEND,
    FACTORY_JOB_STATES.BLOCKED
  ],
  [FACTORY_JOB_STATES.APPROVED_FOR_SPEND]: [
    FACTORY_JOB_STATES.GENERATING,
    FACTORY_JOB_STATES.BLOCKED
  ],
  [FACTORY_JOB_STATES.GENERATING]: [
    FACTORY_JOB_STATES.GENERATED,
    FACTORY_JOB_STATES.QA_FAILED,
    FACTORY_JOB_STATES.BLOCKED
  ],
  [FACTORY_JOB_STATES.GENERATED]: [FACTORY_JOB_STATES.QA_PENDING],
  [FACTORY_JOB_STATES.QA_PENDING]: [
    FACTORY_JOB_STATES.CANDIDATE,
    FACTORY_JOB_STATES.QA_FAILED,
    FACTORY_JOB_STATES.REJECTED
  ],
  [FACTORY_JOB_STATES.QA_FAILED]: [
    FACTORY_JOB_STATES.RETRY_APPROVED,
    FACTORY_JOB_STATES.REJECTED,
    FACTORY_JOB_STATES.BLOCKED
  ],
  [FACTORY_JOB_STATES.RETRY_APPROVED]: [
    FACTORY_JOB_STATES.GENERATING,
    FACTORY_JOB_STATES.BLOCKED
  ],
  [FACTORY_JOB_STATES.CANDIDATE]: [FACTORY_JOB_STATES.APPROVED, FACTORY_JOB_STATES.REJECTED],
  [FACTORY_JOB_STATES.APPROVED]: [],
  [FACTORY_JOB_STATES.REJECTED]: [],
  [FACTORY_JOB_STATES.BLOCKED]: []
});

export const RETRYABLE_QA_REASONS = Object.freeze([
  'crop',
  'background-artifact',
  'composition',
  'halo',
  'opaque-rectangular-background',
  'edge-contact',
  'alpha-coverage'
]);

export const NON_RETRYABLE_REASONS = Object.freeze([
  'wrong-canonical-identity-ambiguous-metadata',
  'unresolved-genus-species',
  'missing-morphology-authority'
]);

export function createJobStore() {
  return { byId: new Map() };
}

export function upsertNeededJob(store, gapJob, now = new Date().toISOString()) {
  const identity = jobIdentity(gapJob.canonicalSlug, gapJob, gapJob.assetVersion);
  const existing = store.byId.get(identity.jobId);
  if (existing) {
    if (TERMINAL.has(existing.state) || existing.state === FACTORY_JOB_STATES.GENERATED) {
      return { job: existing, created: false, duplicatePrevented: true };
    }
    return { job: existing, created: false, duplicatePrevented: true };
  }
  const job = {
    jobId: identity.jobId,
    canonicalSlug: identity.canonicalSlug,
    variantKey: identity.variantKey,
    assetVersion: identity.assetVersion,
    visualForm: gapJob.visualForm || null,
    growthStage: gapJob.growthStage,
    phenology: gapJob.phenology,
    season: gapJob.season,
    formView: gapJob.formView || null,
    required: gapJob.required !== false,
    reason: gapJob.reason || 'missing-required-design-variant',
    priority: Number(gapJob.priority || 0),
    priorityBand: gapJob.priorityBand || null,
    state: FACTORY_JOB_STATES.NEEDED,
    retryCount: 0,
    retryReasons: [],
    attemptedCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    exception: null,
    createdAt: now,
    updatedAt: now
  };
  store.byId.set(job.jobId, job);
  return { job, created: true, duplicatePrevented: false };
}

export function transitionJob(store, jobId, nextState, patch = {}, now = new Date().toISOString()) {
  const job = store.byId.get(jobId);
  if (!job) {
    const err = new Error('JOB_NOT_FOUND');
    err.code = 'JOB_NOT_FOUND';
    throw err;
  }
  const allowed = ALLOWED[job.state] || [];
  if (!allowed.includes(nextState)) {
    const err = new Error('JOB_TRANSITION_FORBIDDEN');
    err.code = 'JOB_TRANSITION_FORBIDDEN';
    err.from = job.state;
    err.to = nextState;
    throw err;
  }
  const updated = { ...job, ...patch, state: nextState, updatedAt: now };
  store.byId.set(jobId, updated);
  return updated;
}

export function isRetryableFailure(reasons = []) {
  const list = Array.isArray(reasons) ? reasons : [reasons];
  if (list.some((r) => NON_RETRYABLE_REASONS.includes(r))) return false;
  return list.some((r) => RETRYABLE_QA_REASONS.includes(r));
}

export function mayRetryJob(job, envelope) {
  const maxRetry = Number(envelope?.maxRetries || 0);
  if (maxRetry <= 0) return { ok: false, reason: 'retries-not-in-envelope' };
  if (Number(job.retryCount || 0) >= maxRetry) return { ok: false, reason: 'job-retry-cap' };
  if (!isRetryableFailure(job.qaReasons || job.retryReasons)) {
    return { ok: false, reason: 'failure-not-retryable' };
  }
  return { ok: true };
}

export function classifyException(job = {}, extras = {}) {
  const reasons = [];
  if (extras.identityUncertain) reasons.push('identity-uncertain');
  if (extras.qaConflict) reasons.push('qa-conflict');
  if (Number(job.retryCount || 0) >= 2) reasons.push('repeated-failure');
  if (extras.costAnomaly) reasons.push('cost-anomaly');
  if (extras.variantAmbiguity) reasons.push('variant-ambiguity');
  if (extras.providerDisagreement) reasons.push('provider-disagreement');
  if (!reasons.length) return null;
  return {
    jobId: job.jobId,
    canonicalSlug: job.canonicalSlug,
    variantKey: job.variantKey,
    reasons,
    ownerReviewRequired: true
  };
}

export function exceptionQueue(store) {
  return [...store.byId.values()]
    .map((job) => job.exception)
    .filter(Boolean);
}
