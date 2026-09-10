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

/** Durable control-document schema version (integer). */
export const RETRY_STATE_SCHEMA_VERSION = 1;
export const RETRY_STATE_STATE_ID = 'production-retry-fairness-state-v1';

/**
 * Fail-safe control stop — Owner Review required. Do not silently reset.
 */
export const CONTROL_STATE_CORRUPTION = 'CONTROL_STATE_CORRUPTION';
export const CONTROL_STATE_STALE_WRITE = 'CONTROL_STATE_STALE_WRITE';
export const OWNER_REVIEW_REQUIRED_FOR_CONTROL_STATE_CORRUPTION = 'YES';

const MS_DAY = 24 * 60 * 60 * 1000;
const ALLOWED_OUTCOMES = new Set(Object.values(ATTEMPT_OUTCOME));

export class RetryStatePersistenceError extends Error {
  constructor(code, message, detail = null) {
    super(message || code);
    this.name = 'RetryStatePersistenceError';
    this.code = code;
    this.detail = detail;
    this.OWNER_REVIEW_REQUIRED = code === CONTROL_STATE_CORRUPTION ? 'YES' : 'NO';
  }
}

export function cooldownMsForNoProgressCount(count) {
  const n = Number(count) || 0;
  if (n <= 0) return 0;
  if (n === 1) return 1 * MS_DAY;
  if (n === 2) return 3 * MS_DAY;
  return 7 * MS_DAY;
}

export function defaultRetryStateDoc(nowIso = new Date().toISOString()) {
  return {
    stateId: RETRY_STATE_STATE_ID,
    schemaVersion: RETRY_STATE_SCHEMA_VERSION,
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

export function hashRetryStateBytes(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

export function hashRetryStateDoc(doc) {
  return hashRetryStateBytes(JSON.stringify(doc));
}

/**
 * Validate durable retry-state document. Throws RetryStatePersistenceError on corruption.
 */
export function validateRetryStateDoc(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new RetryStatePersistenceError(
      CONTROL_STATE_CORRUPTION,
      'retry state root must be an object',
      { kind: 'root_type' }
    );
  }
  if (doc.stateId !== RETRY_STATE_STATE_ID) {
    throw new RetryStatePersistenceError(
      CONTROL_STATE_CORRUPTION,
      `unexpected stateId=${doc.stateId}`,
      { kind: 'stateId' }
    );
  }
  const schemaVersion = doc.schemaVersion;
  if (schemaVersion !== RETRY_STATE_SCHEMA_VERSION) {
    // Accept legacy docs that omit schemaVersion only when otherwise clean empty/valid jobs
    // were written before schemaVersion existed — migrate in-memory, do not invent empty on disk.
    if (schemaVersion === undefined || schemaVersion === null) {
      // fall through after structural checks; caller may stamp schemaVersion on save
    } else {
      throw new RetryStatePersistenceError(
        CONTROL_STATE_CORRUPTION,
        `unsupported schemaVersion=${schemaVersion}`,
        { kind: 'schemaVersion', schemaVersion }
      );
    }
  }
  if (typeof doc.policyRef !== 'string' || !doc.policyRef.startsWith(PRODUCTION_RETRY_FAIRNESS_ID)) {
    throw new RetryStatePersistenceError(
      CONTROL_STATE_CORRUPTION,
      `unexpected policyRef=${doc.policyRef}`,
      { kind: 'policyRef' }
    );
  }
  if (!doc.jobs || typeof doc.jobs !== 'object' || Array.isArray(doc.jobs)) {
    throw new RetryStatePersistenceError(
      CONTROL_STATE_CORRUPTION,
      'jobs must be an object map',
      { kind: 'jobs_type' }
    );
  }
  for (const [key, entry] of Object.entries(doc.jobs)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new RetryStatePersistenceError(
        CONTROL_STATE_CORRUPTION,
        `job entry ${key} invalid`,
        { kind: 'job_entry', key }
      );
    }
    if (entry.lastOutcome != null && !ALLOWED_OUTCOMES.has(entry.lastOutcome)) {
      throw new RetryStatePersistenceError(
        CONTROL_STATE_CORRUPTION,
        `job ${key} lastOutcome invalid`,
        { kind: 'lastOutcome', key, lastOutcome: entry.lastOutcome }
      );
    }
    if (
      entry.consecutiveNoProgressCount != null &&
      (!Number.isFinite(entry.consecutiveNoProgressCount) || entry.consecutiveNoProgressCount < 0)
    ) {
      throw new RetryStatePersistenceError(
        CONTROL_STATE_CORRUPTION,
        `job ${key} consecutiveNoProgressCount invalid`,
        { kind: 'consecutiveNoProgressCount', key }
      );
    }
    // Reject botanical / evidence leakage fields
    for (const banned of [
      'climateTraits',
      'rawHtml',
      'evidenceBody',
      'candidatePacket',
      'secret',
      'manualExclude'
    ]) {
      if (Object.prototype.hasOwnProperty.call(entry, banned)) {
        throw new RetryStatePersistenceError(
          CONTROL_STATE_CORRUPTION,
          `job ${key} contains forbidden field ${banned}`,
          { kind: 'forbidden_field', key, banned }
        );
      }
    }
  }
  return true;
}

/**
 * Load durable retry state.
 * Missing file → empty default (existed:false), does not invent a write.
 * Corrupt / wrong schema → CONTROL_STATE_CORRUPTION (fail closed).
 */
export function loadRetryState(repoRoot, { statePath = null, allowMissing = true } = {}) {
  const p = resolveRetryStatePath(repoRoot, statePath);
  if (!fs.existsSync(p)) {
    if (!allowMissing) {
      throw new RetryStatePersistenceError(
        CONTROL_STATE_CORRUPTION,
        'retry state file missing',
        { kind: 'missing', path: p }
      );
    }
    const doc = defaultRetryStateDoc();
    return {
      path: p,
      doc,
      existed: false,
      contentHash: hashRetryStateDoc(doc),
      rawText: null,
      ok: true
    };
  }
  let rawText;
  try {
    rawText = fs.readFileSync(p, 'utf8');
  } catch (err) {
    throw new RetryStatePersistenceError(
      CONTROL_STATE_CORRUPTION,
      'retry state unreadable',
      { kind: 'read_error', path: p, message: String(err?.message || err) }
    );
  }
  if (!rawText || !String(rawText).trim()) {
    throw new RetryStatePersistenceError(
      CONTROL_STATE_CORRUPTION,
      'retry state truncated/empty',
      { kind: 'truncated', path: p }
    );
  }
  let doc;
  try {
    doc = JSON.parse(rawText);
  } catch (err) {
    throw new RetryStatePersistenceError(
      CONTROL_STATE_CORRUPTION,
      'retry state JSON corrupt',
      { kind: 'json_parse', path: p, message: String(err?.message || err) }
    );
  }
  try {
    validateRetryStateDoc(doc);
  } catch (err) {
    if (err instanceof RetryStatePersistenceError) throw err;
    throw new RetryStatePersistenceError(
      CONTROL_STATE_CORRUPTION,
      'retry state validation failed',
      { kind: 'validate', path: p, message: String(err?.message || err) }
    );
  }
  if (doc.schemaVersion == null) {
    doc = { ...doc, schemaVersion: RETRY_STATE_SCHEMA_VERSION };
  }
  return {
    path: p,
    doc,
    existed: true,
    contentHash: hashRetryStateBytes(rawText),
    rawText,
    ok: true
  };
}

/**
 * Atomic durable write: temp → fsync → rename/replace.
 * Optional expectedContentHash prevents stale overwrite of concurrent updates.
 */
export function saveRetryState(
  repoRoot,
  doc,
  { statePath = null, expectedContentHash = null, now = null } = {}
) {
  const p = resolveRetryStatePath(repoRoot, statePath);
  fs.mkdirSync(path.dirname(p), { recursive: true });

  if (fs.existsSync(p) && expectedContentHash != null) {
    const current = fs.readFileSync(p, 'utf8');
    const currentHash = hashRetryStateBytes(current);
    if (currentHash !== expectedContentHash) {
      throw new RetryStatePersistenceError(
        CONTROL_STATE_STALE_WRITE,
        'stale retry-state write rejected',
        { kind: 'stale_write', path: p, expectedContentHash, currentHash }
      );
    }
  }

  const nowIso =
    now instanceof Date
      ? now.toISOString()
      : now
        ? String(now)
        : new Date().toISOString();
  const out = {
    ...doc,
    stateId: RETRY_STATE_STATE_ID,
    schemaVersion: RETRY_STATE_SCHEMA_VERSION,
    policyRef: PRODUCTION_RETRY_FAIRNESS_REF,
    generatedAt: nowIso,
    jobs: doc.jobs && typeof doc.jobs === 'object' ? doc.jobs : {}
  };
  validateRetryStateDoc(out);

  const text = `${JSON.stringify(out, null, 2)}\n`;
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  const bak = `${p}.bak`;
  try {
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, text, 'utf8');
      try {
        fs.fsyncSync(fd);
      } catch {
        // fsync may be unsupported on some Windows volumes — best effort
      }
    } finally {
      fs.closeSync(fd);
    }
    try {
      fs.renameSync(tmp, p);
    } catch {
      // Windows cannot always rename over an existing file — swap via .bak
      try {
        if (fs.existsSync(bak)) fs.unlinkSync(bak);
      } catch {
        /* ignore */
      }
      if (fs.existsSync(p)) fs.renameSync(p, bak);
      fs.renameSync(tmp, p);
      try {
        if (fs.existsSync(bak)) fs.unlinkSync(bak);
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    if (err instanceof RetryStatePersistenceError) throw err;
    throw new RetryStatePersistenceError(
      CONTROL_STATE_CORRUPTION,
      'atomic retry-state write failed',
      { kind: 'atomic_write', path: p, message: String(err?.message || err) }
    );
  }

  // Re-read to confirm durable presence
  const rawText = fs.readFileSync(p, 'utf8');
  return {
    path: p,
    doc: out,
    contentHash: hashRetryStateBytes(rawText),
    atomic: true,
    ok: true
  };
}

/**
 * Safe helper for callers that must fail closed without try/catch sprawl.
 */
export function tryLoadRetryState(repoRoot, options = {}) {
  try {
    return loadRetryState(repoRoot, options);
  } catch (err) {
    if (err instanceof RetryStatePersistenceError) {
      return { ok: false, error: err, path: resolveRetryStatePath(repoRoot, options.statePath) };
    }
    return {
      ok: false,
      error: new RetryStatePersistenceError(
        CONTROL_STATE_CORRUPTION,
        'unexpected load failure',
        { message: String(err?.message || err) }
      ),
      path: resolveRetryStatePath(repoRoot, options.statePath)
    };
  }
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
      productGate: job?.productGate || job?.currentGate || null,
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
