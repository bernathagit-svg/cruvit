/**
 * Production Retry / Fairness Policy V1
 *
 * Preserves SAFE P1 queue ordering authority while temporarily making jobs that
 * recently returned NO_PROGRESS ineligible for immediate cross-run retry.
 *
 * Scheduling eligibility state only — not botanical truth, not queue job meaning,
 * not productGate / HOLD override.
 *
 * Storage: separate durable control file (not plant triad, not enrichment queue).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CATALOG_SOURCE_POLICY_REF } from './catalog-source-policy-v1.js';
import { SOURCE_RETRIEVER_PILOT_REF } from './source-retriever-pilot-v1.js';
import { HARDINESS_EVIDENCE_CLAIMS_REF } from './hardiness-evidence-claims-v1.js';

/** Keep worker ref as string to avoid circular import with auto-enrichment-worker-v1. */
const WORKER_REF_FOR_FINGERPRINT = 'auto-enrichment-worker-v1@1.2.0';

export const PRODUCTION_RETRY_FAIRNESS_ID = 'production-retry-fairness-policy-v1';
export const PRODUCTION_RETRY_FAIRNESS_VERSION = '1.0.0';
export const PRODUCTION_RETRY_FAIRNESS_REF = `${PRODUCTION_RETRY_FAIRNESS_ID}@${PRODUCTION_RETRY_FAIRNESS_VERSION}`;

export const RETRY_STATE_STORAGE_MODEL = Object.freeze({
  path: 'data/catalog/enrichment-control/production-retry-fairness-state-v1.json',
  kind: 'PRODUCTION_SCHEDULING_STATE',
  botanicalFacts: false,
  queueJobTruth: false,
  justification:
    'Keep cross-run cooldown / attempt fingerprints in a dedicated enrichment-control ' +
    'document so scheduling state cannot be confused with plant climateTraits provenance ' +
    'or authoritative enrichment-queue gap/priority truth.'
});

export const ATTEMPT_OUTCOME = Object.freeze({
  PROGRESSED: 'PROGRESSED',
  NO_PROGRESS: 'NO_PROGRESS',
  HARD_STOP: 'HARD_STOP',
  HOLD: 'HOLD'
});

/** Exact v1 cooldown table after consecutive NO_PROGRESS counts. */
export const COOLDOWN_TABLE_V1 = Object.freeze([
  Object.freeze({ consecutiveNoProgressCount: 1, cooldownMs: 24 * 60 * 60 * 1000, label: '24h' }),
  Object.freeze({ consecutiveNoProgressCount: 2, cooldownMs: 72 * 60 * 60 * 1000, label: '72h' }),
  Object.freeze({
    consecutiveNoProgressCount: 3,
    cooldownMs: 7 * 24 * 60 * 60 * 1000,
    label: '7d',
    appliesToCountAtLeast: 3
  })
]);

export const EARLY_RETRY_TRIGGER_SET = Object.freeze([
  'gapCodes_change',
  'plantContentHash_change',
  'retrieverRef_change',
  'sourcePolicyRef_change',
  'transformClaimsRef_change',
  'workerRef_change',
  'opportunityFingerprint_change'
]);

export const FAIRNESS_CAN_OVERRIDE_HOLD = 'NO';
export const OWNER_REVIEW_REQUIRED_FOR_ROUTINE_COOLDOWN = 'NO';
export const QUEUE_PRIORITY_PRESERVED_WITH_FAIRNESS = 'YES';

const MS_DAY = 24 * 60 * 60 * 1000;

export function cooldownMsForNoProgressCount(count) {
  const n = Number(count) || 0;
  if (n <= 0) return 0;
  if (n === 1) return 1 * MS_DAY;
  if (n === 2) return 3 * MS_DAY;
  return 7 * MS_DAY;
}

export function defaultRetryStateDoc(nowIso = new Date().toISOString()) {
  return {
    stateId: 'production-retry-fairness-state-v1',
    policyRef: PRODUCTION_RETRY_FAIRNESS_REF,
    generatedAt: nowIso,
    note:
      'Production scheduling eligibility only. Not plant truth. Not enrichment-queue authority.',
    jobs: {}
  };
}

export function resolveRetryStatePath(repoRoot, statePath = null) {
  if (statePath) return path.isAbsolute(statePath) ? statePath : path.join(repoRoot, statePath);
  return path.join(repoRoot, RETRY_STATE_STORAGE_MODEL.path);
}

export function loadRetryState(repoRoot, { statePath = null } = {}) {
  const p = resolveRetryStatePath(repoRoot, statePath);
  if (!fs.existsSync(p)) return { path: p, doc: defaultRetryStateDoc(), existed: false };
  const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!doc.jobs || typeof doc.jobs !== 'object') doc.jobs = {};
  return { path: p, doc, existed: true };
}

export function saveRetryState(repoRoot, doc, { statePath = null } = {}) {
  const p = resolveRetryStatePath(repoRoot, statePath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const out = {
    ...doc,
    stateId: 'production-retry-fairness-state-v1',
    policyRef: PRODUCTION_RETRY_FAIRNESS_REF,
    generatedAt: new Date().toISOString()
  };
  fs.writeFileSync(p, JSON.stringify(out, null, 2));
  return { path: p, doc: out };
}

/**
 * Stable opportunity fingerprint — ignores volatile timestamps / generatedAt.
 */
export function computeNoProgressFingerprint({
  jobId,
  canonicalSlug,
  gapCodes = [],
  plantContentHash = null,
  productGate = null,
  enrichmentExecution = null,
  priority = null,
  retrieverRef = SOURCE_RETRIEVER_PILOT_REF,
  sourcePolicyRef = CATALOG_SOURCE_POLICY_REF,
  transformClaimsRef = HARDINESS_EVIDENCE_CLAIMS_REF,
  workerRef = WORKER_REF_FOR_FINGERPRINT
} = {}) {
  const payload = {
    jobId: jobId || null,
    canonicalSlug: canonicalSlug || null,
    gapCodes: [...(gapCodes || [])].map(String).sort(),
    plantContentHash: plantContentHash || null,
    productGate: productGate || null,
    enrichmentExecution: enrichmentExecution || null,
    priority: priority || null,
    retrieverRef,
    sourcePolicyRef,
    transformClaimsRef,
    workerRef,
    policyRef: PRODUCTION_RETRY_FAIRNESS_REF
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}

export function fingerprintsSemanticallyEqual(a, b) {
  return String(a || '') === String(b || '');
}

/**
 * Classify a worker/controller attempt for fairness bookkeeping.
 * Ordinary NEEDS_MORE / ALREADY_EQUIVALENT / PARTIAL_NO_APPLY are not Owner Review.
 */
export function classifyAttemptOutcome({
  status = null,
  hardStop = null,
  appliedFields = [],
  plantsChanged = false,
  gapCodesBefore = null,
  gapCodesAfter = null,
  enrichmentExecution = null,
  productGate = null
} = {}) {
  if (hardStop) return ATTEMPT_OUTCOME.HARD_STOP;
  if (
    productGate === 'HOLD' ||
    enrichmentExecution === 'HOLD_FOR_REVIEW' ||
    status === 'HOLD' ||
    status === 'HOLD_FOR_REVIEW'
  ) {
    return ATTEMPT_OUTCOME.HOLD;
  }
  const applied = Array.isArray(appliedFields) ? appliedFields.length : 0;
  if (plantsChanged || applied > 0 || status === 'APPLIED') {
    return ATTEMPT_OUTCOME.PROGRESSED;
  }
  if (gapCodesBefore && gapCodesAfter) {
    const before = JSON.stringify([...(gapCodesBefore || [])].map(String).sort());
    const after = JSON.stringify([...(gapCodesAfter || [])].map(String).sort());
    if (before !== after) return ATTEMPT_OUTCOME.PROGRESSED;
  }
  // ALREADY_EQUIVALENT / PARTIAL_NO_APPLY / NEEDS_MORE / dry apply-allowed without write
  return ATTEMPT_OUTCOME.NO_PROGRESS;
}

export function nextEligibleAtIso(nowMs, consecutiveNoProgressCount) {
  const ms = cooldownMsForNoProgressCount(consecutiveNoProgressCount);
  return new Date(nowMs + ms).toISOString();
}

/**
 * Record one job attempt into durable retry state (mutates doc.jobs).
 */
export function recordJobAttempt(
  doc,
  {
    jobId,
    canonicalSlug,
    outcome,
    opportunityFingerprint,
    now = new Date(),
    evidenceVersion = null
  }
) {
  if (!doc.jobs) doc.jobs = {};
  const key = jobId || `slug:${canonicalSlug}`;
  const prev = doc.jobs[key] || {
    jobId: jobId || null,
    canonicalSlug: canonicalSlug || null,
    consecutiveNoProgressCount: 0,
    lastAttemptAt: null,
    lastAttemptFingerprint: null,
    lastOutcome: null,
    nextEligibleAt: null,
    lastProgressAt: null,
    evidenceVersion: null
  };
  const nowIso = now instanceof Date ? now.toISOString() : String(now);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now));

  if (outcome === ATTEMPT_OUTCOME.PROGRESSED) {
    doc.jobs[key] = {
      ...prev,
      jobId: jobId || prev.jobId,
      canonicalSlug: canonicalSlug || prev.canonicalSlug,
      consecutiveNoProgressCount: 0,
      lastAttemptAt: nowIso,
      lastAttemptFingerprint: opportunityFingerprint || prev.lastAttemptFingerprint,
      lastOutcome: outcome,
      nextEligibleAt: null,
      lastProgressAt: nowIso,
      evidenceVersion: evidenceVersion ?? prev.evidenceVersion
    };
    return doc.jobs[key];
  }

  if (outcome === ATTEMPT_OUTCOME.HOLD || outcome === ATTEMPT_OUTCOME.HARD_STOP) {
    // Record attempt but do not invent botanical eligibility; HOLD remains HOLD via queue/gates.
    doc.jobs[key] = {
      ...prev,
      jobId: jobId || prev.jobId,
      canonicalSlug: canonicalSlug || prev.canonicalSlug,
      lastAttemptAt: nowIso,
      lastAttemptFingerprint: opportunityFingerprint || prev.lastAttemptFingerprint,
      lastOutcome: outcome,
      evidenceVersion: evidenceVersion ?? prev.evidenceVersion
    };
    return doc.jobs[key];
  }

  // NO_PROGRESS
  const sameOpportunity = fingerprintsSemanticallyEqual(
    opportunityFingerprint,
    prev.lastAttemptFingerprint
  );
  const nextCount = sameOpportunity
    ? (prev.consecutiveNoProgressCount || 0) + 1
    : 1;
  doc.jobs[key] = {
    ...prev,
    jobId: jobId || prev.jobId,
    canonicalSlug: canonicalSlug || prev.canonicalSlug,
    consecutiveNoProgressCount: nextCount,
    lastAttemptAt: nowIso,
    lastAttemptFingerprint: opportunityFingerprint || prev.lastAttemptFingerprint,
    lastOutcome: ATTEMPT_OUTCOME.NO_PROGRESS,
    nextEligibleAt: nextEligibleAtIso(nowMs, nextCount),
    evidenceVersion: evidenceVersion ?? prev.evidenceVersion
  };
  return doc.jobs[key];
}

/**
 * Active cooldown? Early retry if opportunity fingerprint changed meaningfully.
 */
export function isRetryCooldownActive(entry, { now = new Date(), opportunityFingerprint = null } = {}) {
  if (!entry) return { active: false, reason: 'no_entry' };
  if (entry.lastOutcome === ATTEMPT_OUTCOME.PROGRESSED && !entry.nextEligibleAt) {
    return { active: false, reason: 'progressed_clear' };
  }
  if (!entry.nextEligibleAt) return { active: false, reason: 'no_cooldown' };

  if (
    opportunityFingerprint &&
    entry.lastAttemptFingerprint &&
    !fingerprintsSemanticallyEqual(opportunityFingerprint, entry.lastAttemptFingerprint)
  ) {
    return {
      active: false,
      reason: 'early_retry_opportunity_changed',
      EARLY_RETRY: 'YES'
    };
  }

  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now));
  const until = Date.parse(entry.nextEligibleAt);
  if (Number.isNaN(until) || nowMs >= until) {
    return { active: false, reason: 'cooldown_expired' };
  }
  return {
    active: true,
    reason: 'retry_fairness_cooldown',
    nextEligibleAt: entry.nextEligibleAt,
    consecutiveNoProgressCount: entry.consecutiveNoProgressCount || 0
  };
}

export function findRetryEntry(doc, { jobId = null, canonicalSlug = null } = {}) {
  if (!doc?.jobs) return null;
  if (jobId && doc.jobs[jobId]) return doc.jobs[jobId];
  if (jobId && doc.jobs[`slug:${canonicalSlug}`]) return doc.jobs[`slug:${canonicalSlug}`];
  if (canonicalSlug) {
    const hit = Object.values(doc.jobs).find((e) => e && e.canonicalSlug === canonicalSlug);
    if (hit) return hit;
  }
  return null;
}

/**
 * Slugs currently in active cooldown (must be filtered BEFORE retrieval).
 */
export function listCooldownSlugs(
  doc,
  jobs,
  {
    now = new Date(),
    opportunityByJobId = null,
    plantHashBySlug = null,
    versionBundle = null
  } = {}
) {
  const cooled = [];
  const details = [];
  for (const job of jobs || []) {
    const jobId = job.jobId;
    const slug = job.canonicalSlug || job.slug;
    const entry = findRetryEntry(doc, { jobId, canonicalSlug: slug });
    if (!entry) continue;
    const fp =
      (opportunityByJobId && opportunityByJobId[jobId]) ||
      computeNoProgressFingerprint({
        jobId,
        canonicalSlug: slug,
        gapCodes: job.gapCodes,
        plantContentHash: plantHashBySlug?.[slug] || null,
        productGate: job.productGate || job.currentGate,
        enrichmentExecution: job.enrichmentExecution,
        priority: job.priority,
        ...(versionBundle || {})
      });
    const cool = isRetryCooldownActive(entry, { now, opportunityFingerprint: fp });
    if (cool.active) {
      cooled.push(slug);
      details.push({
        jobId,
        slug,
        nextEligibleAt: cool.nextEligibleAt,
        consecutiveNoProgressCount: cool.consecutiveNoProgressCount
      });
    }
  }
  return { cooledSlugs: cooled, details };
}

/**
 * Record outcomes for a completed batch of audits (dry or real).
 */
export function recordBatchRetryOutcomes(
  doc,
  audits,
  {
    now = new Date(),
    jobsBySlug = null,
    plantHashBySlug = null,
    versionBundle = null
  } = {}
) {
  const recorded = [];
  for (const a of audits || []) {
    const slug = a.slug || a.canonicalSlug;
    const job = jobsBySlug?.[slug] || null;
    const outcome = classifyAttemptOutcome({
      status: a.status,
      hardStop: a.hardStop,
      appliedFields: a.appliedFields,
      plantsChanged: Array.isArray(a.appliedFields) && a.appliedFields.length > 0,
      gapCodesBefore: job?.gapCodes || a.gapCodesBefore || null,
      gapCodesAfter: a.queueAfter?.gapCodes || a.gapCodesAfter || job?.gapCodes || null,
      enrichmentExecution: job?.enrichmentExecution || null,
      productGate: job?.productGate || a.afterReadiness?.gate || null
    });
    const fp = computeNoProgressFingerprint({
      jobId: a.jobId || job?.jobId,
      canonicalSlug: slug,
      gapCodes: job?.gapCodes || [],
      plantContentHash: plantHashBySlug?.[slug] || a.beforePlantHash || null,
      productGate: job?.productGate || null,
      enrichmentExecution: job?.enrichmentExecution || null,
      priority: job?.priority || null,
      ...(versionBundle || {})
    });
    const entry = recordJobAttempt(doc, {
      jobId: a.jobId || job?.jobId,
      canonicalSlug: slug,
      outcome,
      opportunityFingerprint: fp,
      now
    });
    recorded.push({ slug, outcome, entry });
  }
  return recorded;
}

export function emptyOpportunityVersions() {
  return {
    retrieverRef: SOURCE_RETRIEVER_PILOT_REF,
    sourcePolicyRef: CATALOG_SOURCE_POLICY_REF,
    transformClaimsRef: HARDINESS_EVIDENCE_CLAIMS_REF,
    workerRef: WORKER_REF_FOR_FINGERPRINT
  };
}
