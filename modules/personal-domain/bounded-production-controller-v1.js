/**
 * Bounded Production Controller v1 — multi-batch orchestration ABOVE the worker.
 *
 * Does NOT duplicate queue selection / retrieval / source policy / transforms /
 * contradiction / Apply Gate / writer / Plant Data Contract / scanner / hard stops.
 *
 * The worker remains authoritative for one batch. This controller only decides:
 *   batch → result → continue/stop → next batch
 *
 * Dry multi-batch progression uses a NON-AUTHORITATIVE processed-job exclusion set
 * so the same top-3 is not re-selected forever without pretending queue mutations.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  AUTO_ENRICHMENT_WORKER_REF,
  WORKER_MAX_JOBS,
  WORKER_MAX_EXTERNAL_REQUESTS_TOTAL,
  WORKER_MAX_EXTERNAL_REQUESTS_PER_PLANT,
  WORKER_STOP_REASON,
  loadCurrentQueue,
  loadSafeWriterSlugSet,
  loadCatalogPlants,
  selectEligibleJobs,
  lockBatch,
  processBatch,
  writeWorkerReports,
  createDryValidationToken
} from './auto-enrichment-worker-v1.js';
import { classifyPlantDataReadiness } from './plant-data-contract-v1.js';
import {
  hashFile,
  bootstrapSafeMigrationPaths
} from './catalog-enrichment-apply-writer-v1.js';

export const BOUNDED_PRODUCTION_CONTROLLER_ID = 'bounded-production-controller-v1';
export const BOUNDED_PRODUCTION_CONTROLLER_VERSION = '1.0.0';
export const BOUNDED_PRODUCTION_CONTROLLER_REF = `${BOUNDED_PRODUCTION_CONTROLLER_ID}@${BOUNDED_PRODUCTION_CONTROLLER_VERSION}`;

/** Default run caps — orchestration only; worker still enforces per-batch maxJobs=3. */
export const CONTROLLER_MAX_BATCHES = 3;
export const CONTROLLER_MAX_JOBS_PER_BATCH = WORKER_MAX_JOBS; // 3
export const CONTROLLER_MAX_TOTAL_JOBS = 9;
/** 3 batches × 3 jobs × ~2 requests/job */
export const CONTROLLER_MAX_TOTAL_EXTERNAL_REQUESTS_PER_RUN = 18;

/**
 * Dry multi-batch progression mechanism (NON-AUTHORITATIVE).
 * C = processed-job exclusion set passed as excludeSlugs into worker selection.
 */
export const CONTROLLER_PROGRESSION_MECHANISM = Object.freeze({
  code: 'C',
  name: 'PROCESSED_JOB_EXCLUSION_SET',
  authoritative: false,
  description:
    'After each dry batch, selected slugs are added to a run-local excludeSlugs set. ' +
    'Next batch still reads the CURRENT authoritative queue, then applies selectEligibleJobs ' +
    'with those exclusions. Does NOT mutate the real queue or invent simulated queue docs.'
});

/**
 * Real multi-batch progression: every batch re-reads the authoritative queue from disk.
 * Dry processed-exclusion set is NEVER used as real queue authority.
 */
export const CONTROLLER_REAL_PROGRESSION_MECHANISM = Object.freeze({
  code: 'FRESH_QUEUE_READ',
  name: 'FRESH_AUTHORITATIVE_QUEUE_READ',
  authoritative: true,
  description:
    'Before each real batch, loadCurrentQueue(repoRoot) and selectEligibleJobs with no ' +
    'processed-job exclusion. Queue refresh after prior real applies is the sole progression signal.'
});

export const CONTROLLER_STOP_REASON = Object.freeze({
  MAX_BATCHES_REACHED: 'MAX_BATCHES_REACHED',
  MAX_TOTAL_JOBS_REACHED: 'MAX_TOTAL_JOBS_REACHED',
  NO_ELIGIBLE_WORK: 'NO_ELIGIBLE_WORK',
  NO_PROGRESS: 'NO_PROGRESS',
  REQUEST_CAP_EXCEEDED: 'REQUEST_CAP_EXCEEDED',
  HARD_STOP: 'HARD_STOP',
  REAL_EXECUTION_BLOCKED: 'REAL_EXECUTION_BLOCKED',
  BATCH_INCOMPLETE: 'BATCH_INCOMPLETE',
  RUN_COMPLETE: 'RUN_COMPLETE'
});

export const CONTROLLER_HARD_STOPS = Object.freeze(Object.values(WORKER_STOP_REASON));

function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function queueFingerprint(queueDoc) {
  const jobs = (queueDoc?.jobs || []).map((j) => ({
    jobId: j.jobId,
    slug: j.canonicalSlug,
    priority: j.priority,
    enrichmentExecution: j.enrichmentExecution,
    productGate: j.productGate,
    gapCodes: [...(j.gapCodes || [])]
  }));
  return sha256Json({
    totalJobs: queueDoc?.summary?.totalJobs ?? jobs.length,
    auto: queueDoc?.summary?.AUTO_JOB_COUNT ?? null,
    hold: queueDoc?.summary?.OWNER_REVIEW_JOB_COUNT ?? null,
    jobs
  });
}

function catalogCounts(repoRoot) {
  const index = loadCatalogPlants(repoRoot);
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const p of Object.values(index)) {
    counts[classifyPlantDataReadiness(p).readinessShort]++;
  }
  return { total: Object.keys(index).length, counts };
}

function queueSummary(queueDoc) {
  return {
    totalJobs: queueDoc?.summary?.totalJobs ?? (queueDoc?.jobs || []).length,
    auto: queueDoc?.summary?.AUTO_JOB_COUNT ?? null,
    hold: queueDoc?.summary?.OWNER_REVIEW_JOB_COUNT ?? null
  };
}

function hashCanonicalSurfaces(repoRoot) {
  const triad = bootstrapSafeMigrationPaths(repoRoot);
  const queuePath = path.join(
    repoRoot,
    'data',
    'catalog',
    'enrichment-queue',
    'current-catalog-enrichment-queue-v1.json'
  );
  const summaryPath = path.join(
    repoRoot,
    'data',
    'catalog',
    'enrichment-queue',
    'current-catalog-enrichment-summary-v1.json'
  );
  return {
    json: hashFile(triad.json),
    js: hashFile(triad.js),
    browser: hashFile(triad.browser),
    queue: hashFile(queuePath),
    summary: hashFile(summaryPath)
  };
}

function summarizeWorkerBatch(batch) {
  const audits = batch?.audits || [];
  let applyAllowedFields = 0;
  let needsMoreFields = 0;
  let holdOrConflict = 0;
  for (const a of audits) {
    for (const fr of a.applyGate?.fieldResults || []) {
      if (fr.decision === 'APPLY_ALLOWED') applyAllowedFields += 1;
      else if (fr.decision === 'NEEDS_MORE_EVIDENCE') needsMoreFields += 1;
      else if (String(fr.decision || '').includes('HOLD') || String(fr.decision || '').includes('CONFLICT')) {
        holdOrConflict += 1;
      }
    }
    if (a.hardStop) holdOrConflict += 1;
    if (a.ownerDecisionRequired) holdOrConflict += 1;
  }
  return {
    status: batch?.status || null,
    batchStopReason: batch?.batchStopReason || null,
    externalRequests: batch?.externalRequests || 0,
    cacheHits: batch?.cacheHits || 0,
    ownerReviewRequiredCount: batch?.ownerReviewRequiredCount || 0,
    applyAllowedFields,
    needsMoreFields,
    holdOrConflict,
    plantsChanged: [...(batch?.plantsChanged || [])],
    REAL_EXECUTION_ALLOWED: batch?.REAL_EXECUTION_ALLOWED === true
  };
}

/**
 * Create a bounded multi-batch run (dry control by default).
 */
export function createRun({
  repoRoot,
  parentCommit,
  maxBatches = CONTROLLER_MAX_BATCHES,
  maxJobsPerBatch = CONTROLLER_MAX_JOBS_PER_BATCH,
  maxTotalJobs = CONTROLLER_MAX_TOTAL_JOBS,
  maxTotalExternalRequests = CONTROLLER_MAX_TOTAL_EXTERNAL_REQUESTS_PER_RUN,
  dryControlMode = true,
  realExecutionAllowed = false,
  artifactRoot = null,
  cacheDir = null,
  fetchImpl = null,
  reportSubdir = 'bounded-production-controller-v1',
  applyRetryFairness = true,
  persistRetryFairness = null,
  retryStatePath = null,
  now = null
} = {}) {
  if (!repoRoot) throw new Error('createRun requires repoRoot');
  if (maxJobsPerBatch > WORKER_MAX_JOBS) {
    throw new Error(`maxJobsPerBatch cannot exceed worker WORKER_MAX_JOBS=${WORKER_MAX_JOBS}`);
  }
  const dryMode = dryControlMode !== false;
  const realMode = realExecutionAllowed === true;
  if (dryMode && realMode) {
    throw new Error('createRun: dryControlMode=true requires realExecutionAllowed=false');
  }
  if (!dryMode && !realMode) {
    throw new Error('createRun: set dryControlMode=true or realExecutionAllowed=true');
  }

  const queue = loadCurrentQueue(repoRoot);
  const hashesBefore = hashCanonicalSurfaces(repoRoot);
  const startedAt = new Date().toISOString();

  return {
    controllerRef: BOUNDED_PRODUCTION_CONTROLLER_REF,
    workerRef: AUTO_ENRICHMENT_WORKER_REF,
    parentCommit: parentCommit || null,
    startedAt,
    caps: Object.freeze({
      maxBatches,
      maxJobsPerBatch,
      maxTotalJobs,
      maxTotalExternalRequests,
      workerMaxExternalRequestsPerBatch: WORKER_MAX_EXTERNAL_REQUESTS_TOTAL,
      workerMaxExternalRequestsPerPlant: WORKER_MAX_EXTERNAL_REQUESTS_PER_PLANT
    }),
    DRY_CONTROL_MODE: dryMode,
    REAL_EXECUTION_ALLOWED: realMode,
    progression: dryMode
      ? CONTROLLER_PROGRESSION_MECHANISM
      : CONTROLLER_REAL_PROGRESSION_MECHANISM,
    CONTROLLER_SELECTS_SPECIES: 'NO',
    SPECS_GATE_SELECTION: 'NO',
    DRY_PROCESSED_SET_CAN_OVERRIDE_REAL_QUEUE: 'NO',
    REAL_MODE_NEXT_BATCH_REQUIRES_FRESH_QUEUE_READ: 'YES',
    starting: {
      catalog: catalogCounts(repoRoot),
      queue: queueSummary(queue),
      queueFingerprint: queueFingerprint(queue),
      hashes: hashesBefore
    },
    state: {
      status: 'RUNNING',
      stopReason: null,
      hardStopDetail: null,
      batchesCompleted: 0,
      batchesAttempted: 0,
      totalJobsProcessed: 0,
      totalExternalRequests: 0,
      totalCacheHits: 0,
      ownerReviewCount: 0,
      processedSlugs: [],
      processedJobIds: [],
      seenBatchFingerprints: [],
      plantsMutated: [],
      fieldsChanged: {},
      batchRecords: []
    },
    options: {
      repoRoot,
      artifactRoot,
      cacheDir,
      fetchImpl,
      reportSubdir,
      applyRetryFairness,
      persistRetryFairness,
      retryStatePath,
      now
    }
  };
}

/**
 * Decide whether another batch may start after the latest result.
 */
export function evaluateBatchResult(run, batchRecord) {
  const caps = run.caps;
  const state = run.state;

  if (batchRecord?.hardStop || batchRecord?.workerSummary?.batchStopReason) {
    const reason =
      batchRecord.hardStop ||
      batchRecord.workerSummary.batchStopReason ||
      CONTROLLER_STOP_REASON.HARD_STOP;
    return {
      continue: false,
      stopReason: CONTROLLER_STOP_REASON.HARD_STOP,
      hardStopDetail: reason,
      note: 'Worker hard stop — no next batch; no substitution'
    };
  }

  if (batchRecord?.workerSummary?.status !== 'BATCH_COMPLETE') {
    return {
      continue: false,
      stopReason: CONTROLLER_STOP_REASON.BATCH_INCOMPLETE,
      note: `Worker status=${batchRecord?.workerSummary?.status}`
    };
  }

  if (state.batchesCompleted >= caps.maxBatches) {
    return {
      continue: false,
      stopReason: CONTROLLER_STOP_REASON.MAX_BATCHES_REACHED,
      note: 'MAX_BATCHES reached after successful batch'
    };
  }

  if (state.totalJobsProcessed >= caps.maxTotalJobs) {
    return {
      continue: false,
      stopReason: CONTROLLER_STOP_REASON.MAX_TOTAL_JOBS_REACHED,
      note: 'MAX_TOTAL_JOBS reached after successful batch'
    };
  }

  // Remaining run-level request budget must cover at least one worker batch floor (1 req)
  // but prefer preventing start when remaining < worker maxTotal would still allow a batch
  // with leftover; hard rule: if used already hit cap, stop; if remaining is 0, stop.
  if (state.totalExternalRequests >= caps.maxTotalExternalRequests) {
    return {
      continue: false,
      stopReason: CONTROLLER_STOP_REASON.REQUEST_CAP_EXCEEDED,
      note: 'Run-level external request cap already consumed'
    };
  }

  // Peek next selection — dry uses exclusion set; real uses fresh queue only.
  const peek = peekNextSelection(run);
  if (!peek.selectedSlugs.length) {
    return {
      continue: false,
      stopReason: CONTROLLER_STOP_REASON.NO_ELIGIBLE_WORK,
      note: run.DRY_CONTROL_MODE
        ? 'No remaining execution-eligible jobs after processed-job exclusion'
        : 'No remaining execution-eligible jobs on fresh authoritative queue'
    };
  }

  if (state.seenBatchFingerprints.includes(peek.batchFingerprint)) {
    return {
      continue: false,
      stopReason: CONTROLLER_STOP_REASON.NO_PROGRESS,
      note: 'Next batch fingerprint already seen — no-progress loop prevented',
      nextSelectedSlugs: peek.selectedSlugs,
      nextBatchFingerprint: peek.batchFingerprint,
      BATCH_QUEUE_WAS_FRESHLY_READ: 'YES'
    };
  }

  const nextKey = peek.selectedSlugs.slice().sort().join(',');
  const priorKeys = state.batchRecords.map((b) =>
    (b.selectedSlugs || []).slice().sort().join(',')
  );
  if (run.DRY_CONTROL_MODE && priorKeys.includes(nextKey)) {
    return {
      continue: false,
      stopReason: CONTROLLER_STOP_REASON.NO_PROGRESS,
      note: 'Next selected slug set already processed — no-progress loop prevented',
      nextSelectedSlugs: peek.selectedSlugs,
      nextBatchFingerprint: peek.batchFingerprint,
      BATCH_QUEUE_WAS_FRESHLY_READ: 'YES'
    };
  }

  // Real mode: same slug set as last batch with zero mutations / identical fingerprint ⇒ no progress
  if (!run.DRY_CONTROL_MODE && state.batchRecords.length) {
    const last = state.batchRecords[state.batchRecords.length - 1];
    const lastKey = (last.selectedSlugs || []).slice().sort().join(',');
    const lastMutated = (last.plantsChanged || []).length > 0;
    if (lastKey === nextKey && !lastMutated) {
      return {
        continue: false,
        stopReason: CONTROLLER_STOP_REASON.NO_PROGRESS,
        note: 'Same slug set as prior real batch with no mutations — no-progress',
        nextSelectedSlugs: peek.selectedSlugs,
        nextBatchFingerprint: peek.batchFingerprint,
        BATCH_QUEUE_WAS_FRESHLY_READ: 'YES'
      };
    }
  }

  // Remaining request budget: if less than 1, cannot start.
  const remaining = caps.maxTotalExternalRequests - state.totalExternalRequests;
  if (remaining < 1) {
    return {
      continue: false,
      stopReason: CONTROLLER_STOP_REASON.REQUEST_CAP_EXCEEDED,
      note: 'Insufficient remaining run-level request budget'
    };
  }

  return {
    continue: true,
    stopReason: null,
    nextSelectedSlugs: peek.selectedSlugs,
    nextBatchFingerprint: peek.batchFingerprint,
    remainingRequestBudget: remaining,
    BATCH_QUEUE_WAS_FRESHLY_READ: 'YES'
  };
}

export function peekNextSelection(run) {
  const { repoRoot } = run.options;
  const queue = loadCurrentQueue(repoRoot);
  const safeSlugs = loadSafeWriterSlugSet(repoRoot);
  // Real mode: never apply dry processed-job exclusion as queue authority.
  const excludeSlugs = run.DRY_CONTROL_MODE ? [...run.state.processedSlugs] : [];
  const selection = selectEligibleJobs(queue, {
    maxJobs: run.caps.maxJobsPerBatch,
    dryRun: true,
    repoRoot,
    safeSlugs,
    excludeSlugs,
    realExecutionAllowed: run.REAL_EXECUTION_ALLOWED ? true : false,
    applyRetryFairness: run.options.applyRetryFairness !== false,
    retryStatePath: run.options.retryStatePath || null,
    now: run.options.now || new Date()
  });
  const locked = lockBatch(selection);
  return {
    queueFingerprint: queueFingerprint(queue),
    queueSummary: queueSummary(queue),
    selectedSlugs: [...(locked.lockedSlugs || [])],
    selectedJobIds: [...(locked.lockedJobIds || [])],
    batchFingerprint: locked.batchFingerprint,
    selectionAuthority: locked.selectionAuthority,
    BATCH_QUEUE_WAS_FRESHLY_READ: 'YES',
    excludeSlugsApplied: excludeSlugs,
    locked
  };
}

/**
 * Execute the next batch via the existing worker.
 * Dry-control: dry processBatch only + exclusion progression.
 * Real mode: fresh queue → lock → dry → real (same fingerprint) → optional idempotence.
 */
export async function executeNextBatch(run, { fetchImpl = null } = {}) {
  if (run.state.status !== 'RUNNING') {
    return {
      ok: false,
      skipped: true,
      reason: run.state.stopReason || 'RUN_NOT_RUNNING'
    };
  }

  if (run.state.batchesCompleted >= run.caps.maxBatches) {
    run.state.status = 'STOPPED';
    run.state.stopReason = CONTROLLER_STOP_REASON.MAX_BATCHES_REACHED;
    return { ok: false, skipped: true, reason: CONTROLLER_STOP_REASON.MAX_BATCHES_REACHED };
  }

  if (run.state.totalJobsProcessed >= run.caps.maxTotalJobs) {
    run.state.status = 'STOPPED';
    run.state.stopReason = CONTROLLER_STOP_REASON.MAX_TOTAL_JOBS_REACHED;
    return { ok: false, skipped: true, reason: CONTROLLER_STOP_REASON.MAX_TOTAL_JOBS_REACHED };
  }

  if (run.state.totalExternalRequests >= run.caps.maxTotalExternalRequests) {
    run.state.status = 'STOPPED';
    run.state.stopReason = CONTROLLER_STOP_REASON.REQUEST_CAP_EXCEEDED;
    return { ok: false, skipped: true, reason: CONTROLLER_STOP_REASON.REQUEST_CAP_EXCEEDED };
  }

  const remainingBudget = run.caps.maxTotalExternalRequests - run.state.totalExternalRequests;
  if (remainingBudget < 1) {
    run.state.status = 'STOPPED';
    run.state.stopReason = CONTROLLER_STOP_REASON.REQUEST_CAP_EXCEEDED;
    return { ok: false, skipped: true, reason: CONTROLLER_STOP_REASON.REQUEST_CAP_EXCEEDED };
  }

  // Real batches need budget for dry + real (and ideally idempotence). Require at least 1.
  // Projected floor: 1 request; worker enforces per-batch caps within remainingBudget.

  const peek = peekNextSelection(run);
  if (!peek.selectedSlugs.length) {
    run.state.status = 'STOPPED';
    run.state.stopReason = CONTROLLER_STOP_REASON.NO_ELIGIBLE_WORK;
    return { ok: false, skipped: true, reason: CONTROLLER_STOP_REASON.NO_ELIGIBLE_WORK };
  }

  const nextKey = peek.selectedSlugs.slice().sort().join(',');
  if (run.state.seenBatchFingerprints.includes(peek.batchFingerprint)) {
    run.state.status = 'STOPPED';
    run.state.stopReason = CONTROLLER_STOP_REASON.NO_PROGRESS;
    return {
      ok: false,
      skipped: true,
      reason: CONTROLLER_STOP_REASON.NO_PROGRESS,
      selectedSlugs: peek.selectedSlugs,
      BATCH_QUEUE_WAS_FRESHLY_READ: 'YES'
    };
  }

  if (run.DRY_CONTROL_MODE) {
    const priorKeys = run.state.batchRecords.map((b) =>
      (b.selectedSlugs || []).slice().sort().join(',')
    );
    if (priorKeys.includes(nextKey)) {
      run.state.status = 'STOPPED';
      run.state.stopReason = CONTROLLER_STOP_REASON.NO_PROGRESS;
      return {
        ok: false,
        skipped: true,
        reason: CONTROLLER_STOP_REASON.NO_PROGRESS,
        selectedSlugs: peek.selectedSlugs
      };
    }
  } else if (run.state.batchRecords.length) {
    const last = run.state.batchRecords[run.state.batchRecords.length - 1];
    const lastKey = (last.selectedSlugs || []).slice().sort().join(',');
    const lastMutated = (last.plantsChanged || []).length > 0;
    if (lastKey === nextKey && !lastMutated) {
      run.state.status = 'STOPPED';
      run.state.stopReason = CONTROLLER_STOP_REASON.NO_PROGRESS;
      return {
        ok: false,
        skipped: true,
        reason: CONTROLLER_STOP_REASON.NO_PROGRESS,
        selectedSlugs: peek.selectedSlugs,
        BATCH_QUEUE_WAS_FRESHLY_READ: 'YES',
        note: 'Same slug set as prior real batch with no mutations'
      };
    }
  }

  run.state.batchesAttempted += 1;
  const batchIndex = run.state.batchesAttempted;
  const { repoRoot, artifactRoot, cacheDir, reportSubdir } = run.options;
  const batchArtifactRoot = artifactRoot
    ? path.join(artifactRoot, `batch-${batchIndex}`)
    : null;
  if (batchArtifactRoot) fs.mkdirSync(batchArtifactRoot, { recursive: true });

  const hashesBeforeBatch = hashCanonicalSurfaces(repoRoot);
  const fetch = fetchImpl || run.options.fetchImpl || globalThis.fetch;
  const workerBatchCap = Math.min(WORKER_MAX_EXTERNAL_REQUESTS_TOTAL, remainingBudget);

  const fairnessOpts = {
    applyRetryFairness: run.options.applyRetryFairness !== false,
    persistRetryFairness: run.options.persistRetryFairness,
    retryStatePath: run.options.retryStatePath || null,
    now: run.options.now || null
  };

  const dry = await processBatch({
    repoRoot,
    dryRun: true,
    lockedBatch: peek.locked,
    parentCommit: run.parentCommit,
    artifactRoot: batchArtifactRoot ? path.join(batchArtifactRoot, 'dry') : null,
    cacheDir,
    realExecutionAllowed: false,
    maxJobs: run.caps.maxJobsPerBatch,
    maxExternalRequestsTotal: workerBatchCap,
    maxExternalRequestsPerPlant: WORKER_MAX_EXTERNAL_REQUESTS_PER_PLANT,
    fetchImpl: fetch,
    ...fairnessOpts
  });

  const hashesAfterDry = hashCanonicalSurfaces(repoRoot);
  const dryWrote =
    hashesAfterDry.json !== hashesBeforeBatch.json ||
    hashesAfterDry.js !== hashesBeforeBatch.js ||
    hashesAfterDry.browser !== hashesBeforeBatch.browser ||
    hashesAfterDry.queue !== hashesBeforeBatch.queue;
  const REAL_WRITE_COUNT_BEFORE_DRY_FINISH = dryWrote ? 1 : 0;

  let dryReports = null;
  if (reportSubdir) {
    const drySub =
      run.REAL_EXECUTION_ALLOWED
        ? path.join(reportSubdir, `batch-${batchIndex}`, 'dry')
        : path.join(reportSubdir, `batch-${batchIndex}`);
    dryReports = writeWorkerReports(
      repoRoot,
      dry,
      run.REAL_EXECUTION_ALLOWED
        ? `controller-real-dry-batch-${batchIndex}`
        : `controller-dry-batch-${batchIndex}`,
      drySub
    );
  }

  let batchExternal = dry.externalRequests || 0;
  let batchCache = dry.cacheHits || 0;
  let hardStop =
    dry.batchStopReason && CONTROLLER_HARD_STOPS.includes(dry.batchStopReason)
      ? dry.batchStopReason
      : dry.batchStopReason || null;

  let real = null;
  let idempotence = null;
  let realReports = null;
  let plantsChanged = [];
  let fieldsChanged = {};

  if (
    run.REAL_EXECUTION_ALLOWED &&
    !hardStop &&
    dry.status === 'BATCH_COMPLETE' &&
    REAL_WRITE_COUNT_BEFORE_DRY_FINISH === 0
  ) {
    const dryToken = createDryValidationToken(dry);
    if (!dryToken.dryBatchValidated) {
      hardStop = CONTROLLER_STOP_REASON.BATCH_INCOMPLETE;
    } else {
      const remainingAfterDry =
        run.caps.maxTotalExternalRequests - (run.state.totalExternalRequests + batchExternal);
      if (remainingAfterDry < 0) {
        hardStop = CONTROLLER_STOP_REASON.REQUEST_CAP_EXCEEDED;
      } else {
        const realCap = Math.min(WORKER_MAX_EXTERNAL_REQUESTS_TOTAL, Math.max(0, remainingAfterDry));
        real = await processBatch({
          repoRoot,
          dryRun: false,
          lockedBatch: peek.locked,
          dryValidation: dryToken,
          parentCommit: run.parentCommit,
          artifactRoot: batchArtifactRoot ? path.join(batchArtifactRoot, 'real') : null,
          cacheDir,
          realExecutionAllowed: true,
          maxJobs: run.caps.maxJobsPerBatch,
          maxExternalRequestsTotal: realCap,
          maxExternalRequestsPerPlant: WORKER_MAX_EXTERNAL_REQUESTS_PER_PLANT,
          fetchImpl: fetch,
          ...fairnessOpts
        });
        batchExternal += real.externalRequests || 0;
        batchCache += real.cacheHits || 0;
        plantsChanged = [...(real.plantsChanged || [])];
        fieldsChanged = { ...(real.fieldsChanged || {}) };
        if (real.batchStopReason && CONTROLLER_HARD_STOPS.includes(real.batchStopReason)) {
          hardStop = real.batchStopReason;
        } else if (real.batchStopReason) {
          hardStop = real.batchStopReason;
        }
        if (reportSubdir) {
          realReports = writeWorkerReports(
            repoRoot,
            real,
            `controller-real-batch-${batchIndex}`,
            path.join(reportSubdir, `batch-${batchIndex}`, 'real')
          );
        }

        // Idempotence verification (same lock) when real completed cleanly.
        if (!hardStop && real.status === 'BATCH_COMPLETE') {
          const remainingAfterReal =
            run.caps.maxTotalExternalRequests - (run.state.totalExternalRequests + batchExternal);
          if (remainingAfterReal >= 0) {
            const idempCap = Math.min(
              WORKER_MAX_EXTERNAL_REQUESTS_TOTAL,
              Math.max(0, remainingAfterReal)
            );
            const second = await processBatch({
              repoRoot,
              dryRun: false,
              lockedBatch: peek.locked,
              dryValidation: dryToken,
              parentCommit: run.parentCommit,
              artifactRoot: batchArtifactRoot ? path.join(batchArtifactRoot, 'idempotence') : null,
              cacheDir,
              realExecutionAllowed: true,
              maxJobs: run.caps.maxJobsPerBatch,
              maxExternalRequestsTotal: idempCap,
              maxExternalRequestsPerPlant: WORKER_MAX_EXTERNAL_REQUESTS_PER_PLANT,
              fetchImpl: fetch,
              // Idempotence must not double-count cooldown / rewrite fairness from second pass.
              applyRetryFairness: fairnessOpts.applyRetryFairness,
              persistRetryFairness: false,
              retryStatePath: fairnessOpts.retryStatePath,
              now: fairnessOpts.now
            });
            batchExternal += second.externalRequests || 0;
            batchCache += second.cacheHits || 0;
            const secondMutations = (second.audits || []).filter(
              (a) => a.status === 'APPLIED' && (a.appliedFields || []).length
            );
            idempotence = {
              status: second.status,
              SECOND_WORKER_RUN_WOULD_MUTATE: secondMutations.length === 0 ? 'NO' : 'YES',
              appliedCount: secondMutations.length,
              externalRequests: second.externalRequests || 0,
              cacheHits: second.cacheHits || 0
            };
            if (secondMutations.length > 0) {
              hardStop = WORKER_STOP_REASON.NON_IDEMPOTENT_SECOND_APPLY;
            }
          }
        }
      }
    }
  } else if (run.REAL_EXECUTION_ALLOWED && dry.status !== 'BATCH_COMPLETE' && !hardStop) {
    hardStop = CONTROLLER_STOP_REASON.BATCH_INCOMPLETE;
  } else if (run.REAL_EXECUTION_ALLOWED && REAL_WRITE_COUNT_BEFORE_DRY_FINISH !== 0) {
    hardStop = WORKER_STOP_REASON.WRITE_FAILURE;
  }

  const primaryWorker = real || dry;
  const workerSummary = {
    ...summarizeWorkerBatch(primaryWorker),
    dryStatus: dry.status,
    realStatus: real?.status || null,
    externalRequests: batchExternal,
    cacheHits: batchCache,
    ownerReviewRequiredCount:
      (dry.ownerReviewRequiredCount || 0) + (real?.ownerReviewRequiredCount || 0)
  };

  const batchRecord = {
    batchIndex,
    MANUALLY_SELECTED: 'NO',
    selectionAuthority: peek.selectionAuthority,
    progressionMechanism: run.progression.code,
    progressionNonAuthoritative: run.progression.authoritative === false,
    BATCH_QUEUE_WAS_FRESHLY_READ: 'YES',
    queueFingerprint: peek.queueFingerprint,
    queueSummary: peek.queueSummary,
    selectedSlugs: peek.selectedSlugs,
    selectedJobIds: peek.selectedJobIds,
    selectionRanks: peek.selectedSlugs.map((slug) => {
      const jobs = loadCurrentQueue(repoRoot).jobs || [];
      const idx = jobs.findIndex((j) => j.canonicalSlug === slug);
      return { slug, queueRank: idx >= 0 ? idx + 1 : null };
    }),
    batchFingerprint: peek.batchFingerprint,
    excludeSlugsBefore: run.DRY_CONTROL_MODE ? [...run.state.processedSlugs] : [],
    REAL_WRITE_COUNT_BEFORE_DRY_FINISH,
    dry: {
      status: dry.status,
      batchStopReason: dry.batchStopReason,
      externalRequests: dry.externalRequests || 0,
      cacheHits: dry.cacheHits || 0,
      audits: (dry.audits || []).map((a) => ({
        slug: a.slug,
        status: a.status,
        hardStop: a.hardStop,
        appliedFields: a.appliedFields,
        fieldPackets: a.fieldPackets,
        applyGate: a.applyGate
      }))
    },
    real: real
      ? {
          status: real.status,
          batchStopReason: real.batchStopReason,
          plantsChanged,
          fieldsChanged,
          externalRequests: real.externalRequests || 0,
          cacheHits: real.cacheHits || 0,
          audits: (real.audits || []).map((a) => ({
            slug: a.slug,
            status: a.status,
            hardStop: a.hardStop,
            appliedFields: a.appliedFields,
            afterReadiness: a.afterReadiness,
            queueAfter: a.queueAfter
          }))
        }
      : null,
    plantsChanged,
    fieldsChanged,
    idempotence,
    workerSummary,
    hardStop,
    dryReports,
    realReports,
    controllerDecision: null
  };

  run.state.totalExternalRequests += batchExternal;
  run.state.totalCacheHits += batchCache;
  run.state.ownerReviewCount += workerSummary.ownerReviewRequiredCount;
  run.state.totalJobsProcessed += peek.selectedSlugs.length;
  run.state.seenBatchFingerprints.push(peek.batchFingerprint);
  run.state.processedSlugs.push(...peek.selectedSlugs);
  run.state.processedJobIds.push(...peek.selectedJobIds);
  for (const slug of plantsChanged) {
    if (!run.state.plantsMutated.includes(slug)) run.state.plantsMutated.push(slug);
  }
  for (const [slug, fields] of Object.entries(fieldsChanged)) {
    run.state.fieldsChanged[slug] = [
      ...new Set([...(run.state.fieldsChanged[slug] || []), ...fields])
    ];
  }

  const batchOk =
    !hardStop &&
    (run.REAL_EXECUTION_ALLOWED
      ? real?.status === 'BATCH_COMPLETE'
      : dry.status === 'BATCH_COMPLETE');
  if (batchOk) {
    run.state.batchesCompleted += 1;
  }

  const decision = evaluateBatchResult(run, batchRecord);
  batchRecord.controllerDecision = decision;
  run.state.batchRecords.push(batchRecord);

  if (!decision.continue) {
    run.state.status = 'STOPPED';
    run.state.stopReason = decision.stopReason;
    run.state.hardStopDetail = decision.hardStopDetail || hardStop || null;
  }

  return { ok: true, batchRecord, decision, dry, real, idempotence };
}

/**
 * Stop a run explicitly (preserves completed batch audits).
 */
export function stopRun(run, reason = CONTROLLER_STOP_REASON.RUN_COMPLETE, detail = null) {
  run.state.status = 'STOPPED';
  run.state.stopReason = reason;
  run.state.hardStopDetail = detail;
  run.finishedAt = new Date().toISOString();
  return run;
}

/**
 * Execute the full bounded dry run (up to caps).
 */
export async function executeRun(run, { fetchImpl = null } = {}) {
  while (run.state.status === 'RUNNING') {
    const step = await executeNextBatch(run, { fetchImpl });
    if (step.skipped) break;
    if (!step.decision?.continue) break;
    // Cap check before looping again is also inside executeNextBatch.
    if (run.state.batchesCompleted >= run.caps.maxBatches) {
      stopRun(run, CONTROLLER_STOP_REASON.MAX_BATCHES_REACHED);
      break;
    }
  }

  if (run.state.status === 'RUNNING') {
    stopRun(run, CONTROLLER_STOP_REASON.RUN_COMPLETE);
  } else if (!run.finishedAt) {
    run.finishedAt = new Date().toISOString();
  }

  return buildRunSummary(run);
}

/**
 * Finalize durable run summary + zero-write proof.
 */
export function buildRunSummary(run) {
  const hashesAfter = hashCanonicalSurfaces(run.options.repoRoot);
  const hashesBefore = run.starting.hashes;
  const plantWriteCount =
    hashesBefore.json === hashesAfter.json &&
    hashesBefore.js === hashesAfter.js &&
    hashesBefore.browser === hashesAfter.browser
      ? 0
      : 1;
  const queueWriteCount =
    hashesBefore.queue === hashesAfter.queue && hashesBefore.summary === hashesAfter.summary
      ? 0
      : 1;

  const uniqueJobs = [...new Set(run.state.processedSlugs)];
  const applyAllowed = run.state.batchRecords.reduce(
    (n, b) => n + (b.workerSummary?.applyAllowedFields || 0),
    0
  );
  const needsMore = run.state.batchRecords.reduce(
    (n, b) => n + (b.workerSummary?.needsMoreFields || 0),
    0
  );
  const conflicts = run.state.batchRecords.reduce(
    (n, b) => n + (b.workerSummary?.holdOrConflict || 0),
    0
  );

  const summary = {
    phase: 'bounded_production_controller_v1_run_summary',
    controllerRef: run.controllerRef,
    workerRef: run.workerRef,
    parentCommit: run.parentCommit,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt || new Date().toISOString(),
    DRY_CONTROL_MODE: run.DRY_CONTROL_MODE,
    REAL_EXECUTION_ALLOWED: run.REAL_EXECUTION_ALLOWED,
    REAL_EXECUTION_PERFORMED: run.REAL_EXECUTION_ALLOWED &&
      run.state.batchRecords.some((b) => b.real?.status)
      ? 'YES'
      : 'NO',
    CONTROLLER_SELECTS_SPECIES: 'NO',
    SPECS_GATE_SELECTION: 'NO',
    MANUALLY_SELECTED_ANY_BATCH: 'NO',
    DRY_PROCESSED_SET_CAN_OVERRIDE_REAL_QUEUE: 'NO',
    REAL_MODE_NEXT_BATCH_REQUIRES_FRESH_QUEUE_READ: 'YES',
    progression: run.progression,
    caps: run.caps,
    starting: run.starting,
    ending: {
      catalog: catalogCounts(run.options.repoRoot),
      queue: queueSummary(loadCurrentQueue(run.options.repoRoot)),
      hashes: hashesAfter
    },
    stopReason: run.state.stopReason,
    hardStopDetail: run.state.hardStopDetail,
    batchesAttempted: run.state.batchesAttempted,
    batchesCompleted: run.state.batchesCompleted,
    totalJobsProcessed: run.state.totalJobsProcessed,
    uniqueJobsProcessed: uniqueJobs.length,
    uniqueJobSlugs: uniqueJobs,
    plantsMutated: [...run.state.plantsMutated],
    fieldsChanged: run.state.fieldsChanged,
    batches: run.state.batchRecords.map((b) => ({
      batchIndex: b.batchIndex,
      selectedSlugs: b.selectedSlugs,
      selectionRanks: b.selectionRanks,
      batchFingerprint: b.batchFingerprint,
      queueFingerprint: b.queueFingerprint,
      BATCH_QUEUE_WAS_FRESHLY_READ: b.BATCH_QUEUE_WAS_FRESHLY_READ || 'YES',
      MANUALLY_SELECTED: b.MANUALLY_SELECTED,
      REAL_WRITE_COUNT_BEFORE_DRY_FINISH: b.REAL_WRITE_COUNT_BEFORE_DRY_FINISH ?? null,
      externalRequests: b.workerSummary?.externalRequests ?? 0,
      cacheHits: b.workerSummary?.cacheHits ?? 0,
      applyAllowedFields: b.workerSummary?.applyAllowedFields ?? 0,
      needsMoreFields: b.workerSummary?.needsMoreFields ?? 0,
      holdOrConflict: b.workerSummary?.holdOrConflict ?? 0,
      dryStatus: b.dry?.status ?? null,
      realStatus: b.real?.status ?? null,
      plantsChanged: b.plantsChanged || [],
      fieldsChanged: b.fieldsChanged || {},
      idempotence: b.idempotence || null,
      hardStop: b.hardStop,
      controllerDecision: b.controllerDecision
    })),
    BATCH_1_SELECTED_SLUGS: run.state.batchRecords[0]?.selectedSlugs || [],
    BATCH_2_SELECTED_SLUGS: run.state.batchRecords[1]?.selectedSlugs || [],
    BATCH_3_SELECTED_SLUGS: run.state.batchRecords[2]?.selectedSlugs || [],
    BATCH_1_QUEUE_WAS_FRESHLY_READ: run.state.batchRecords[0]
      ? run.state.batchRecords[0].BATCH_QUEUE_WAS_FRESHLY_READ || 'YES'
      : null,
    BATCH_2_QUEUE_WAS_FRESHLY_READ: run.state.batchRecords[1]
      ? run.state.batchRecords[1].BATCH_QUEUE_WAS_FRESHLY_READ || 'YES'
      : run.state.batchRecords[0]?.controllerDecision?.BATCH_QUEUE_WAS_FRESHLY_READ === 'YES'
        ? 'YES'
        : null,
    BATCH_3_QUEUE_WAS_FRESHLY_READ: run.state.batchRecords[2]
      ? run.state.batchRecords[2].BATCH_QUEUE_WAS_FRESHLY_READ || 'YES'
      : run.state.batchRecords[1]?.controllerDecision?.BATCH_QUEUE_WAS_FRESHLY_READ === 'YES'
        ? 'YES'
        : null,
    totalExternalRequests: run.state.totalExternalRequests,
    totalCacheHits: run.state.totalCacheHits,
    requestsPerJob:
      uniqueJobs.length > 0
        ? Number((run.state.totalExternalRequests / uniqueJobs.length).toFixed(3))
        : 0,
    applyAllowedFields: applyAllowed,
    needsMoreFields: needsMore,
    conflicts,
    OWNER_REVIEW_COUNT: run.state.ownerReviewCount,
    NO_PROGRESS_STOP: run.state.stopReason === CONTROLLER_STOP_REASON.NO_PROGRESS ? 'YES' : 'NO',
    PLANT_WRITE_COUNT: plantWriteCount,
    QUEUE_WRITE_COUNT: queueWriteCount,
    ZERO_WRITE_PROOF: run.DRY_CONTROL_MODE
      ? {
          plantWriteCount,
          queueWriteCount,
          hashesBefore,
          hashesAfter,
          catalogUnchanged:
            JSON.stringify(run.starting.catalog) ===
            JSON.stringify(catalogCounts(run.options.repoRoot)),
          queueUnchanged:
            JSON.stringify(run.starting.queue) ===
            JSON.stringify(queueSummary(loadCurrentQueue(run.options.repoRoot)))
        }
      : null
  };

  run.summary = summary;
  return summary;
}

export function writeRunSummary(repoRoot, summary, subdir = 'bounded-production-controller-v1') {
  const dir = path.join(repoRoot, 'data', 'catalog', 'enrichment-worker', subdir);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'bounded-production-controller-v1-run-summary.json');
  fs.writeFileSync(p, JSON.stringify(summary, null, 2));
  return p;
}
