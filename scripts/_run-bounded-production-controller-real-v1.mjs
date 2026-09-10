/**
 * Bounded Production Controller v1 — FIRST REAL multi-batch production run.
 *
 * Caps: 3 batches / 3 jobs / 9 total / 18 external requests.
 * Flow per batch: fresh queue → select → lock → dry → real → contract/queue →
 * regression → idempotence → fresh queue for next batch.
 *
 * No manual species selection. No second controller run. No stage/commit/push/deploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  createRun,
  executeRun,
  writeRunSummary,
  peekNextSelection,
  BOUNDED_PRODUCTION_CONTROLLER_REF,
  CONTROLLER_MAX_BATCHES,
  CONTROLLER_MAX_JOBS_PER_BATCH,
  CONTROLLER_MAX_TOTAL_JOBS,
  CONTROLLER_MAX_TOTAL_EXTERNAL_REQUESTS_PER_RUN,
  CONTROLLER_REAL_PROGRESSION_MECHANISM
} from '../modules/personal-domain/bounded-production-controller-v1.js';
import {
  AUTO_ENRICHMENT_WORKER_REF,
  loadCurrentQueue,
  loadCatalogPlants,
  loadSafeWriterSlugSet,
  isJobEligibleForWorker,
  selectEligibleJobs
} from '../modules/personal-domain/auto-enrichment-worker-v1.js';
import { classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import {
  hashFile,
  bootstrapSafeMigrationPaths,
  loadBootstrapSafeMigrationPayload
} from '../modules/personal-domain/catalog-enrichment-apply-writer-v1.js';
import { plantContentHash } from '../modules/personal-domain/catalog-enrichment-apply-gate-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARENT = '8a55e685f86da18118bd6262de5ed13005cd4754';
const ARTIFACT = 'bounded-production-controller-real-v1';
const outDir = path.join(root, 'data/catalog/enrichment-worker', ARTIFACT);
const artifactRoot = path.join(outDir, 'artifacts');
const cacheDir = path.join(outDir, 'cache');

function triad() {
  const p = bootstrapSafeMigrationPaths(root);
  return { json: hashFile(p.json), js: hashFile(p.js), browser: hashFile(p.browser) };
}

function queueFileHashes() {
  return {
    queue: hashFile(
      path.join(root, 'data/catalog/enrichment-queue/current-catalog-enrichment-queue-v1.json')
    ),
    summary: hashFile(
      path.join(root, 'data/catalog/enrichment-queue/current-catalog-enrichment-summary-v1.json')
    )
  };
}

function catalogCounts() {
  const index = loadCatalogPlants(root);
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const p of Object.values(index)) {
    counts[classifyPlantDataReadiness(p).readinessShort]++;
  }
  return { total: Object.keys(index).length, counts };
}

function fieldSnap(slug) {
  const { payload } = loadBootstrapSafeMigrationPayload(root);
  const plantPayload = payload.plants[slug];
  if (!plantPayload) {
    return { missing: true, slug };
  }
  const ct = plantPayload.climateTraits || {};
  const plant = loadCatalogPlants(root)[slug];
  const r = plant ? classifyPlantDataReadiness(plant) : null;
  return {
    coldTolerance: {
      value: ct.coldTolerance ?? null,
      evidence: ct.traitEvidenceClasses?.coldTolerance ?? null,
      origin: ct.fieldOrigins?.coldTolerance ?? null,
      provenance: ct.enrichmentProvenance?.coldTolerance || null
    },
    frostSensitivity: {
      value: ct.frostSensitivity ?? null,
      evidence: ct.traitEvidenceClasses?.frostSensitivity ?? null,
      origin: ct.fieldOrigins?.frostSensitivity ?? null,
      provenance: ct.enrichmentProvenance?.frostSensitivity || null
    },
    readiness: r?.readinessShort ?? null,
    productGate: r?.gate ?? null,
    plantHash: plant ? plantContentHash(plant) : null
  };
}

function buildEligiblePool() {
  const queue = loadCurrentQueue(root);
  const safeSlugs = loadSafeWriterSlugSet(root);
  const plants = loadCatalogPlants(root);
  const eligible = [];
  let rank = 0;
  for (const job of queue.jobs || []) {
    rank += 1;
    if (!safeSlugs.has(job.canonicalSlug) || job.priority !== 'P1') continue;
    const el = isJobEligibleForWorker(job, {
      safeSlugs,
      requireWorkerSpec: false,
      repoRoot: root
    });
    if (!el.ok) continue;
    const plant = plants[job.canonicalSlug];
    const r = plant ? classifyPlantDataReadiness(plant) : null;
    eligible.push({
      queueRank: rank,
      jobId: job.jobId,
      slug: job.canonicalSlug,
      gapCodes: job.gapCodes,
      enrichmentExecution: job.enrichmentExecution,
      productGate: job.productGate || r?.gate || null,
      readiness: r?.readinessShort || null
    });
  }
  return eligible;
}

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(artifactRoot, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

const preRunEligible = buildEligiblePool();
const prePeek = peekNextSelection(
  createRun({
    repoRoot: root,
    parentCommit: PARENT,
    dryControlMode: false,
    realExecutionAllowed: true,
    reportSubdir: null,
    artifactRoot: null,
    cacheDir
  })
);

const beforeGlobal = {
  catalog: catalogCounts(),
  queue: (() => {
    const q = loadCurrentQueue(root);
    return {
      totalJobs: q.summary?.totalJobs ?? (q.jobs || []).length,
      auto: q.summary?.AUTO_JOB_COUNT ?? (q.jobs || []).filter((j) => j.enrichmentExecution === 'AUTO').length,
      hold:
        q.summary?.OWNER_REVIEW_JOB_COUNT ??
        (q.jobs || []).filter((j) => j.enrichmentExecution === 'HOLD_FOR_REVIEW').length
    };
  })(),
  triad: triad(),
  queueFiles: queueFileHashes(),
  eligiblePoolCount: preRunEligible.length,
  eligibleTop: preRunEligible.slice(0, 12),
  peekSelected: prePeek.selectedSlugs,
  peekFingerprint: prePeek.batchFingerprint,
  requestBudgetRemaining: CONTROLLER_MAX_TOTAL_EXTERNAL_REQUESTS_PER_RUN
};

const baselineJson = JSON.parse(
  execFileSync('git', ['show', `${PARENT}:data/catalog/bootstrap-safe-climate-traits-migration-v1.json`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 80e6
  })
);
const baselineQueue = JSON.parse(
  execFileSync(
    'git',
    ['show', `${PARENT}:data/catalog/enrichment-queue/current-catalog-enrichment-queue-v1.json`],
    { cwd: root, encoding: 'utf8', maxBuffer: 80e6 }
  )
);

function snapFromPayloadPlant(slug, plantPayload, livePlant) {
  const ct = plantPayload?.climateTraits || {};
  const r = livePlant ? classifyPlantDataReadiness(livePlant) : null;
  return {
    coldTolerance: {
      value: ct.coldTolerance ?? null,
      evidence: ct.traitEvidenceClasses?.coldTolerance ?? null,
      origin: ct.fieldOrigins?.coldTolerance ?? null,
      provenance: ct.enrichmentProvenance?.coldTolerance || null
    },
    frostSensitivity: {
      value: ct.frostSensitivity ?? null,
      evidence: ct.traitEvidenceClasses?.frostSensitivity ?? null,
      origin: ct.fieldOrigins?.frostSensitivity ?? null,
      provenance: ct.enrichmentProvenance?.frostSensitivity || null
    },
    readiness: r?.readinessShort ?? null,
    productGate: r?.gate ?? null
  };
}

const beforePlants = {};
const liveBefore = loadCatalogPlants(root);
for (const slug of Object.keys(baselineJson.plants || {})) {
  beforePlants[slug] = snapFromPayloadPlant(slug, baselineJson.plants[slug], liveBefore[slug]);
}

fs.writeFileSync(path.join(outDir, 'pre-run-snapshot.json'), JSON.stringify(beforeGlobal, null, 2));
fs.writeFileSync(path.join(outDir, 'pre-run-plant-fields.json'), JSON.stringify(beforePlants, null, 2));

const run = createRun({
  repoRoot: root,
  parentCommit: PARENT,
  maxBatches: CONTROLLER_MAX_BATCHES,
  maxJobsPerBatch: CONTROLLER_MAX_JOBS_PER_BATCH,
  maxTotalJobs: CONTROLLER_MAX_TOTAL_JOBS,
  maxTotalExternalRequests: CONTROLLER_MAX_TOTAL_EXTERNAL_REQUESTS_PER_RUN,
  dryControlMode: false,
  realExecutionAllowed: true,
  artifactRoot,
  cacheDir,
  reportSubdir: ARTIFACT
});

fs.writeFileSync(
  path.join(outDir, 'controller-run-config.json'),
  JSON.stringify(
    {
      controllerRef: BOUNDED_PRODUCTION_CONTROLLER_REF,
      workerRef: AUTO_ENRICHMENT_WORKER_REF,
      parentCommit: PARENT,
      DRY_CONTROL_MODE: false,
      REAL_EXECUTION_ALLOWED: true,
      REAL_EXECUTION_AUTHORIZED_FOR_ONE_RUN: true,
      progression: CONTROLLER_REAL_PROGRESSION_MECHANISM,
      DRY_PROCESSED_SET_CAN_OVERRIDE_REAL_QUEUE: 'NO',
      REAL_MODE_NEXT_BATCH_REQUIRES_FRESH_QUEUE_READ: 'YES',
      CONTROLLER_SELECTS_SPECIES: 'NO',
      caps: run.caps,
      starting: run.starting,
      preRunEligibleTop: preRunEligible.slice(0, 12)
    },
    null,
    2
  )
);

console.log(
  JSON.stringify(
    {
      phase: 'pre-run',
      parentCommit: PARENT,
      catalog: beforeGlobal.catalog,
      queue: beforeGlobal.queue,
      eligiblePoolCount: beforeGlobal.eligiblePoolCount,
      BATCH_1_PREVIEW_SLUGS: prePeek.selectedSlugs,
      requestBudgetRemaining: 18
    },
    null,
    2
  )
);

const summary = await executeRun(run);
const summaryPath = writeRunSummary(root, summary, ARTIFACT);

const allSelected = [...new Set(summary.uniqueJobSlugs || [])];
const selectedSet = new Set(allSelected);
const afterLive = loadCatalogPlants(root);
const { payload: afterPayload } = loadBootstrapSafeMigrationPayload(root);
const afterPlants = {};
for (const slug of Object.keys(afterPayload.plants || {})) {
  afterPlants[slug] = snapFromPayloadPlant(slug, afterPayload.plants[slug], afterLive[slug]);
}

const changedPlantSlugs = [];
const fieldWriteDetails = [];
let nonSelectedPlantFactChangeCount = 0;
const nonSelectedChanged = [];

for (const slug of Object.keys(afterPlants)) {
  const before = beforePlants[slug];
  const after = afterPlants[slug];
  if (!before) continue;
  let plantChanged = false;
  for (const field of ['coldTolerance', 'frostSensitivity']) {
    const bv = JSON.stringify(before[field]);
    const av = JSON.stringify(after[field]);
    if (bv === av) continue;
    plantChanged = true;
    const detail = {
      slug,
      field,
      before: before[field],
      after: after[field],
      readinessBefore: before.readiness,
      readinessAfter: after.readiness,
      productGateBefore: before.productGate,
      productGateAfter: after.productGate
    };
    if (selectedSet.has(slug)) {
      fieldWriteDetails.push(detail);
    } else {
      nonSelectedPlantFactChangeCount += 1;
      nonSelectedChanged.push(detail);
    }
  }
  if (plantChanged && selectedSet.has(slug) && !changedPlantSlugs.includes(slug)) {
    changedPlantSlugs.push(slug);
  }
}

const afterCatalog = catalogCounts();
const afterQueueDoc = loadCurrentQueue(root);
const afterQueue = {
  totalJobs: afterQueueDoc.summary?.totalJobs ?? (afterQueueDoc.jobs || []).length,
  auto:
    afterQueueDoc.summary?.AUTO_JOB_COUNT ??
    (afterQueueDoc.jobs || []).filter((j) => j.enrichmentExecution === 'AUTO').length,
  hold:
    afterQueueDoc.summary?.OWNER_REVIEW_JOB_COUNT ??
    (afterQueueDoc.jobs || []).filter((j) => j.enrichmentExecution === 'HOLD_FOR_REVIEW').length
};

const beforeJobs = new Map((baselineQueue.jobs || []).map((j) => [j.jobId, j]));
const afterJobs = new Map((afterQueueDoc.jobs || []).map((j) => [j.jobId, j]));
let nonSelectedQueueJobChangeCount = 0;
const nonSelectedQueueChanges = [];
for (const [jobId, beforeJob] of beforeJobs) {
  if (selectedSet.has(beforeJob.canonicalSlug)) continue;
  const afterJob = afterJobs.get(jobId);
  if (!afterJob) {
    nonSelectedQueueJobChangeCount += 1;
    nonSelectedQueueChanges.push({ jobId, slug: beforeJob.canonicalSlug, change: 'REMOVED' });
    continue;
  }
  const beforeKey = JSON.stringify({
    gapCodes: beforeJob.gapCodes,
    enrichmentExecution: beforeJob.enrichmentExecution,
    productGate: beforeJob.productGate,
    priority: beforeJob.priority
  });
  const afterKey = JSON.stringify({
    gapCodes: afterJob.gapCodes,
    enrichmentExecution: afterJob.enrichmentExecution,
    productGate: afterJob.productGate,
    priority: afterJob.priority
  });
  if (beforeKey !== afterKey) {
    nonSelectedQueueJobChangeCount += 1;
    nonSelectedQueueChanges.push({
      jobId,
      slug: beforeJob.canonicalSlug,
      change: 'MUTATED',
      before: {
        gapCodes: beforeJob.gapCodes,
        enrichmentExecution: beforeJob.enrichmentExecution,
        productGate: beforeJob.productGate
      },
      after: {
        gapCodes: afterJob.gapCodes,
        enrichmentExecution: afterJob.enrichmentExecution,
        productGate: afterJob.productGate
      }
    });
  }
}
for (const [jobId, afterJob] of afterJobs) {
  if (beforeJobs.has(jobId)) continue;
  if (selectedSet.has(afterJob.canonicalSlug)) continue;
  nonSelectedQueueJobChangeCount += 1;
  nonSelectedQueueChanges.push({ jobId, slug: afterJob.canonicalSlug, change: 'ADDED' });
}

const ssWrites = fieldWriteDetails.filter((d) => d.after?.evidence === 'SOURCE_SUPPORTED');
const coldSs = ssWrites.filter((d) => d.field === 'coldTolerance').length;
const frostSs = ssWrites.filter((d) => d.field === 'frostSensitivity').length;

const readinessMovements = allSelected.map((slug) => {
  const before = beforePlants[slug];
  const after = afterPlants[slug];
  return {
    slug,
    before: before ? { readiness: before.readiness, productGate: before.productGate } : null,
    after: after ? { readiness: after.readiness, productGate: after.productGate } : null
  };
});

const bToA = readinessMovements.filter(
  (r) => r.before?.readiness === 'B' && r.after?.readiness === 'A'
);
const bToB = fieldWriteDetails.filter(
  (d) =>
    d.readinessBefore === 'B' &&
    d.readinessAfter === 'B' &&
    JSON.stringify(d.before) !== JSON.stringify(d.after)
);

const batchFreshFlags = (summary.batches || []).map((b) => b.BATCH_QUEUE_WAS_FRESHLY_READ);
const allFresh = batchFreshFlags.length === 0 || batchFreshFlags.every((f) => f === 'YES');

const anyNonIdempotent = (summary.batches || []).some(
  (b) => b.idempotence?.SECOND_WORKER_RUN_WOULD_MUTATE === 'YES'
);

const FINAL_CONTROLLER_STATE_STABLE = anyNonIdempotent ? 'NO' : 'YES';

const multiBatchOrAuthoritativeStop =
  summary.batchesCompleted > 1 ||
  [
    'NO_PROGRESS',
    'NO_ELIGIBLE_WORK',
    'REQUEST_CAP_EXCEEDED',
    'HARD_STOP',
    'MAX_BATCHES_REACHED',
    'MAX_TOTAL_JOBS_REACHED',
    'BATCH_INCOMPLETE'
  ].includes(summary.stopReason);

const AUTONOMOUS_BOUNDED_PRODUCTION_PROVEN =
  summary.REAL_EXECUTION_PERFORMED === 'YES' &&
  summary.batchesCompleted >= 1 &&
  multiBatchOrAuthoritativeStop &&
  allFresh &&
  summary.MANUALLY_SELECTED_ANY_BATCH === 'NO' &&
  summary.CONTROLLER_SELECTS_SPECIES === 'NO' &&
  summary.batchesAttempted <= CONTROLLER_MAX_BATCHES &&
  summary.totalJobsProcessed <= CONTROLLER_MAX_TOTAL_JOBS &&
  summary.totalExternalRequests <= CONTROLLER_MAX_TOTAL_EXTERNAL_REQUESTS_PER_RUN &&
  nonSelectedPlantFactChangeCount === 0 &&
  nonSelectedQueueJobChangeCount === 0 &&
  FINAL_CONTROLLER_STATE_STABLE === 'YES'
    ? 'YES'
    : 'NO';

const SAFE_TO_SCHEDULE_RECURRING_BOUNDED_PRODUCTION = 'NO';
const RECURRING_TOP_JOB_STARVATION_RISK = 'YES';
const SAFE_TO_SCHEDULE_REASON =
  'Top-ranked eligible jobs can return ALREADY_EQUIVALENT/NEEDS_MORE with no gap progress; ' +
  'without a retry/fairness policy, every future run may reselect the same jobs and starve lower-ranked work. ' +
  'Per-run NO_PROGRESS is not sufficient for recurring production.';

const appliedFieldCount = fieldWriteDetails.length;
const requestsPerAppliedField =
  appliedFieldCount > 0
    ? Number((summary.totalExternalRequests / appliedFieldCount).toFixed(3))
    : null;

const final = {
  ...summary,
  preRun: beforeGlobal,
  postRun: {
    catalog: afterCatalog,
    queue: afterQueue,
    triad: triad(),
    queueFiles: queueFileHashes()
  },
  CHANGED_PLANT_SLUGS: changedPlantSlugs,
  FIELD_WRITE_DETAILS: fieldWriteDetails,
  NON_SELECTED_PLANT_FACT_CHANGE_COUNT: nonSelectedPlantFactChangeCount,
  NON_SELECTED_CHANGED: nonSelectedChanged,
  NON_SELECTED_QUEUE_JOB_CHANGE_COUNT: nonSelectedQueueJobChangeCount,
  NON_SELECTED_QUEUE_CHANGES: nonSelectedQueueChanges,
  SOURCE_SUPPORTED_FIELD_WRITES: ssWrites.length,
  COLD_SS_WRITES: coldSs,
  FROST_SS_WRITES: frostSs,
  B_TO_A: bToA.length,
  B_TO_B_IMPROVEMENTS: bToB.length,
  readinessMovements,
  FINAL_CONTROLLER_STATE_STABLE,
  AUTONOMOUS_BOUNDED_PRODUCTION_PROVEN,
  SAFE_TO_SCHEDULE_RECURRING_BOUNDED_PRODUCTION,
  RECURRING_TOP_JOB_STARVATION_RISK,
  SAFE_TO_SCHEDULE_REASON,
  BATCH_3_INGESTED: 'NO',
  DEPLOYED: 'NO',
  metrics: {
    batchesAttempted: summary.batchesAttempted,
    batchesCompleted: summary.batchesCompleted,
    jobsSelected: summary.totalJobsProcessed,
    uniquePlantsSelected: summary.uniqueJobsProcessed,
    plantsMutated: (summary.plantsMutated || []).length,
    sourceSupportedFieldWrites: ssWrites.length,
    coldSsWrites: coldSs,
    frostSsWrites: frostSs,
    bToA: bToA.length,
    bToBImprovements: bToB.length,
    needsMoreOutcomes: summary.needsMoreFields,
    hardStops: summary.stopReason === 'HARD_STOP' ? 1 : 0,
    externalRequests: summary.totalExternalRequests,
    cacheHits: summary.totalCacheHits,
    requestsPerSelectedJob: summary.requestsPerJob,
    requestsPerAppliedField,
    ownerReviewCount: summary.OWNER_REVIEW_COUNT
  },
  reports: {
    runSummary: summaryPath,
    outDir
  }
};

fs.writeFileSync(
  path.join(outDir, 'bounded-production-controller-real-v1-final.json'),
  JSON.stringify(final, null, 2)
);
fs.writeFileSync(
  path.join(outDir, 'post-run-plant-fields.json'),
  JSON.stringify(
    Object.fromEntries(allSelected.map((s) => [s, afterPlants[s]])),
    null,
    2
  )
);

console.log(
  JSON.stringify(
    {
      controllerRef: BOUNDED_PRODUCTION_CONTROLLER_REF,
      stopReason: summary.stopReason,
      hardStopDetail: summary.hardStopDetail,
      batchesCompleted: summary.batchesCompleted,
      batchesAttempted: summary.batchesAttempted,
      BATCH_1_SELECTED_SLUGS: summary.BATCH_1_SELECTED_SLUGS,
      BATCH_2_SELECTED_SLUGS: summary.BATCH_2_SELECTED_SLUGS,
      BATCH_3_SELECTED_SLUGS: summary.BATCH_3_SELECTED_SLUGS,
      BATCH_1_QUEUE_WAS_FRESHLY_READ: summary.BATCH_1_QUEUE_WAS_FRESHLY_READ,
      BATCH_2_QUEUE_WAS_FRESHLY_READ: summary.BATCH_2_QUEUE_WAS_FRESHLY_READ,
      BATCH_3_QUEUE_WAS_FRESHLY_READ: summary.BATCH_3_QUEUE_WAS_FRESHLY_READ,
      totalExternalRequests: summary.totalExternalRequests,
      totalCacheHits: summary.totalCacheHits,
      plantsMutated: summary.plantsMutated,
      OWNER_REVIEW_COUNT: summary.OWNER_REVIEW_COUNT,
      REAL_EXECUTION_PERFORMED: summary.REAL_EXECUTION_PERFORMED,
      NON_SELECTED_PLANT_FACT_CHANGE_COUNT: nonSelectedPlantFactChangeCount,
      NON_SELECTED_QUEUE_JOB_CHANGE_COUNT: nonSelectedQueueJobChangeCount,
      FINAL_CONTROLLER_STATE_STABLE,
      AUTONOMOUS_BOUNDED_PRODUCTION_PROVEN,
      SAFE_TO_SCHEDULE_RECURRING_BOUNDED_PRODUCTION,
      RECURRING_TOP_JOB_STARVATION_RISK,
      CHANGED_PLANT_SLUGS: changedPlantSlugs,
      summaryPath
    },
    null,
    2
  )
);
