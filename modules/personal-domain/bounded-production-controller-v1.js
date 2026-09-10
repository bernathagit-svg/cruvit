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
  writeWorkerReports
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
  reportSubdir = 'bounded-production-controller-v1'
} = {}) {
  if (!repoRoot) throw new Error('createRun requires repoRoot');
  if (maxJobsPerBatch > WORKER_MAX_JOBS) {
    throw new Error(`maxJobsPerBatch cannot exceed worker WORKER_MAX_JOBS=${WORKER_MAX_JOBS}`);
  }
  if (realExecutionAllowed === true && dryControlMode !== false) {
    // Explicit guard for this checkpoint: dry validation must keep real off.
    throw new Error('createRun: dryControlMode=true requires realExecutionAllowed=false');
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
    DRY_CONTROL_MODE: dryControlMode !== false,
    REAL_EXECUTION_ALLOWED: realExecutionAllowed === true,
    progression: CONTROLLER_PROGRESSION_MECHANISM,
    CONTROLLER_SELECTS_SPECIES: 'NO',
    SPECS_GATE_SELECTION: 'NO',
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
      batchRecords: []
    },
    options: {
      repoRoot,
      artifactRoot,
      cacheDir,
      fetchImpl,
      reportSubdir
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

  // Peek next selection with exclusion set — NON-AUTHORITATIVE progression only.
  const peek = peekNextSelection(run);
  if (!peek.selectedSlugs.length) {
    return {
      continue: false,
      stopReason: CONTROLLER_STOP_REASON.NO_ELIGIBLE_WORK,
      note: 'No remaining execution-eligible jobs after processed-job exclusion'
    };
  }

  if (state.seenBatchFingerprints.includes(peek.batchFingerprint)) {
    return {
      continue: false,
      stopReason: CONTROLLER_STOP_REASON.NO_PROGRESS,
      note: 'Next batch fingerprint already seen — no-progress loop prevented'
    };
  }

  const nextKey = peek.selectedSlugs.slice().sort().join(',');
  const priorKeys = state.batchRecords.map((b) =>
    (b.selectedSlugs || []).slice().sort().join(',')
  );
  if (priorKeys.includes(nextKey)) {
    return {
      continue: false,
      stopReason: CONTROLLER_STOP_REASON.NO_PROGRESS,
      note: 'Next selected slug set already processed — no-progress loop prevented'
    };
  }

  // Remaining request budget: if less than 1, cannot start; if less than worker total cap,
  // still allow worker to run under its own budget (worker enforces per-batch).
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
    remainingRequestBudget: remaining
  };
}

export function peekNextSelection(run) {
  const { repoRoot } = run.options;
  const queue = loadCurrentQueue(repoRoot);
  const safeSlugs = loadSafeWriterSlugSet(repoRoot);
  const selection = selectEligibleJobs(queue, {
    maxJobs: run.caps.maxJobsPerBatch,
    dryRun: true,
    repoRoot,
    safeSlugs,
    excludeSlugs: [...run.state.processedSlugs],
    realExecutionAllowed: false
  });
  const locked = lockBatch(selection);
  return {
    queueFingerprint: queueFingerprint(queue),
    queueSummary: queueSummary(queue),
    selectedSlugs: [...(locked.lockedSlugs || [])],
    selectedJobIds: [...(locked.lockedJobIds || [])],
    batchFingerprint: locked.batchFingerprint,
    selectionAuthority: locked.selectionAuthority,
    locked
  };
}

/**
 * Execute the next dry batch via the existing worker.
 * REAL writes are refused in dry-control mode.
 */
export async function executeNextBatch(run, { fetchImpl = null } = {}) {
  if (run.state.status !== 'RUNNING') {
    return {
      ok: false,
      skipped: true,
      reason: run.state.stopReason || 'RUN_NOT_RUNNING'
    };
  }

  if (run.REAL_EXECUTION_ALLOWED === true) {
    run.state.status = 'STOPPED';
    run.state.stopReason = CONTROLLER_STOP_REASON.REAL_EXECUTION_BLOCKED;
    return {
      ok: false,
      skipped: true,
      reason: CONTROLLER_STOP_REASON.REAL_EXECUTION_BLOCKED,
      note: 'This controller checkpoint is dry-control only'
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

  const peek = peekNextSelection(run);
  if (!peek.selectedSlugs.length) {
    run.state.status = 'STOPPED';
    run.state.stopReason = CONTROLLER_STOP_REASON.NO_ELIGIBLE_WORK;
    return { ok: false, skipped: true, reason: CONTROLLER_STOP_REASON.NO_ELIGIBLE_WORK };
  }

  if (
    run.state.seenBatchFingerprints.includes(peek.batchFingerprint) ||
    run.state.batchRecords.some(
      (b) =>
        (b.selectedSlugs || []).slice().sort().join(',') ===
        peek.selectedSlugs.slice().sort().join(',')
    )
  ) {
    run.state.status = 'STOPPED';
    run.state.stopReason = CONTROLLER_STOP_REASON.NO_PROGRESS;
    return {
      ok: false,
      skipped: true,
      reason: CONTROLLER_STOP_REASON.NO_PROGRESS,
      selectedSlugs: peek.selectedSlugs
    };
  }

  run.state.batchesAttempted += 1;
  const batchIndex = run.state.batchesAttempted;
  const { repoRoot, artifactRoot, cacheDir, reportSubdir } = run.options;
  const batchArtifactRoot = artifactRoot
    ? path.join(artifactRoot, `batch-${batchIndex}`)
    : null;
  if (batchArtifactRoot) fs.mkdirSync(batchArtifactRoot, { recursive: true });

  const workerBatchCap = Math.min(
    WORKER_MAX_EXTERNAL_REQUESTS_TOTAL,
    remainingBudget
  );

  const worker = await processBatch({
    repoRoot,
    dryRun: true,
    lockedBatch: peek.locked,
    parentCommit: run.parentCommit,
    artifactRoot: batchArtifactRoot,
    cacheDir,
    realExecutionAllowed: false,
    maxJobs: run.caps.maxJobsPerBatch,
    maxExternalRequestsTotal: workerBatchCap,
    maxExternalRequestsPerPlant: WORKER_MAX_EXTERNAL_REQUESTS_PER_PLANT,
    fetchImpl: fetchImpl || run.options.fetchImpl || globalThis.fetch
  });

  let reports = null;
  if (reportSubdir) {
    reports = writeWorkerReports(
      repoRoot,
      worker,
      `controller-dry-batch-${batchIndex}`,
      path.join(reportSubdir, `batch-${batchIndex}`)
    );
  }

  const workerSummary = summarizeWorkerBatch(worker);
  const hardStop =
    worker.batchStopReason && CONTROLLER_HARD_STOPS.includes(worker.batchStopReason)
      ? worker.batchStopReason
      : worker.batchStopReason || null;

  const batchRecord = {
    batchIndex,
    MANUALLY_SELECTED: 'NO',
    selectionAuthority: peek.selectionAuthority,
    progressionMechanism: CONTROLLER_PROGRESSION_MECHANISM.code,
    progressionNonAuthoritative: true,
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
    excludeSlugsBefore: [...run.state.processedSlugs],
    workerSummary,
    hardStop,
    reports,
    controllerDecision: null
  };

  // Update run accounting before evaluate (batch consumed).
  run.state.totalExternalRequests += workerSummary.externalRequests;
  run.state.totalCacheHits += workerSummary.cacheHits;
  run.state.ownerReviewCount += workerSummary.ownerReviewRequiredCount;
  run.state.totalJobsProcessed += peek.selectedSlugs.length;
  run.state.seenBatchFingerprints.push(peek.batchFingerprint);
  run.state.processedSlugs.push(...peek.selectedSlugs);
  run.state.processedJobIds.push(...peek.selectedJobIds);

  if (worker.status === 'BATCH_COMPLETE' && !hardStop) {
    run.state.batchesCompleted += 1;
  }

  const decision = evaluateBatchResult(run, batchRecord);
  batchRecord.controllerDecision = decision;
  run.state.batchRecords.push(batchRecord);

  if (!decision.continue) {
    run.state.status = 'STOPPED';
    run.state.stopReason = decision.stopReason;
    run.state.hardStopDetail = decision.hardStopDetail || null;
  }

  return { ok: true, batchRecord, decision, worker };
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
    REAL_EXECUTION_PERFORMED: 'NO',
    CONTROLLER_SELECTS_SPECIES: 'NO',
    SPECS_GATE_SELECTION: 'NO',
    MANUALLY_SELECTED_ANY_BATCH: 'NO',
    progression: CONTROLLER_PROGRESSION_MECHANISM,
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
    batches: run.state.batchRecords.map((b) => ({
      batchIndex: b.batchIndex,
      selectedSlugs: b.selectedSlugs,
      selectionRanks: b.selectionRanks,
      batchFingerprint: b.batchFingerprint,
      queueFingerprint: b.queueFingerprint,
      MANUALLY_SELECTED: b.MANUALLY_SELECTED,
      externalRequests: b.workerSummary?.externalRequests ?? 0,
      cacheHits: b.workerSummary?.cacheHits ?? 0,
      applyAllowedFields: b.workerSummary?.applyAllowedFields ?? 0,
      needsMoreFields: b.workerSummary?.needsMoreFields ?? 0,
      holdOrConflict: b.workerSummary?.holdOrConflict ?? 0,
      status: b.workerSummary?.status ?? null,
      hardStop: b.hardStop,
      controllerDecision: b.controllerDecision
    })),
    BATCH_1_SELECTED_SLUGS: run.state.batchRecords[0]?.selectedSlugs || [],
    BATCH_2_SELECTED_SLUGS: run.state.batchRecords[1]?.selectedSlugs || [],
    BATCH_3_SELECTED_SLUGS: run.state.batchRecords[2]?.selectedSlugs || [],
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
    ZERO_WRITE_PROOF: {
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
