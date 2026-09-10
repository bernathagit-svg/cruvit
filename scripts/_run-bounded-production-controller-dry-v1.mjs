/**
 * Bounded Production Controller v1 — DRY CONTROL validation only.
 *
 * Multi-batch orchestration above the existing worker.
 * NO real writes. NO queue mutations. NO deploy / Batch 3 / Retrieval v3.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createRun,
  executeRun,
  writeRunSummary,
  BOUNDED_PRODUCTION_CONTROLLER_REF,
  CONTROLLER_MAX_BATCHES,
  CONTROLLER_MAX_JOBS_PER_BATCH,
  CONTROLLER_MAX_TOTAL_JOBS,
  CONTROLLER_MAX_TOTAL_EXTERNAL_REQUESTS_PER_RUN,
  CONTROLLER_PROGRESSION_MECHANISM
} from '../modules/personal-domain/bounded-production-controller-v1.js';
import { AUTO_ENRICHMENT_WORKER_REF } from '../modules/personal-domain/auto-enrichment-worker-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARENT = 'c5c041e5bbda8034aabccd330d1568ccdcc287be';
const outDir = path.join(root, 'data/catalog/enrichment-worker/bounded-production-controller-v1');
const artifactRoot = path.join(outDir, 'artifacts');
const cacheDir = path.join(outDir, 'cache');

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(artifactRoot, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

const run = createRun({
  repoRoot: root,
  parentCommit: PARENT,
  maxBatches: CONTROLLER_MAX_BATCHES,
  maxJobsPerBatch: CONTROLLER_MAX_JOBS_PER_BATCH,
  maxTotalJobs: CONTROLLER_MAX_TOTAL_JOBS,
  maxTotalExternalRequests: CONTROLLER_MAX_TOTAL_EXTERNAL_REQUESTS_PER_RUN,
  dryControlMode: true,
  realExecutionAllowed: false,
  artifactRoot,
  cacheDir,
  reportSubdir: 'bounded-production-controller-v1'
});

fs.writeFileSync(
  path.join(outDir, 'controller-run-config.json'),
  JSON.stringify(
    {
      controllerRef: BOUNDED_PRODUCTION_CONTROLLER_REF,
      workerRef: AUTO_ENRICHMENT_WORKER_REF,
      parentCommit: PARENT,
      DRY_CONTROL_MODE: true,
      REAL_EXECUTION_ALLOWED: false,
      progression: CONTROLLER_PROGRESSION_MECHANISM,
      caps: run.caps,
      starting: run.starting
    },
    null,
    2
  )
);

const summary = await executeRun(run);
const summaryPath = writeRunSummary(root, summary, 'bounded-production-controller-v1');

const readiness = {
  BOUNDED_PRODUCTION_CONTROLLER_READY_FOR_REAL_RUN:
    summary.PLANT_WRITE_COUNT === 0 &&
    summary.QUEUE_WRITE_COUNT === 0 &&
    summary.REAL_EXECUTION_PERFORMED === 'NO' &&
    summary.MANUALLY_SELECTED_ANY_BATCH === 'NO' &&
    summary.batchesCompleted >= 1 &&
    summary.OWNER_REVIEW_COUNT === 0 &&
    summary.CONTROLLER_SELECTS_SPECIES === 'NO'
      ? 'YES'
      : 'NO',
  note: 'Recommendation only — do not execute real multi-batch production in this checkpoint.'
};

const final = {
  ...summary,
  readiness,
  reports: {
    runSummary: summaryPath,
    outDir
  }
};

fs.writeFileSync(
  path.join(outDir, 'bounded-production-controller-v1-final.json'),
  JSON.stringify(final, null, 2)
);

console.log(
  JSON.stringify(
    {
      controllerRef: BOUNDED_PRODUCTION_CONTROLLER_REF,
      stopReason: summary.stopReason,
      batchesCompleted: summary.batchesCompleted,
      batchesAttempted: summary.batchesAttempted,
      BATCH_1_SELECTED_SLUGS: summary.BATCH_1_SELECTED_SLUGS,
      BATCH_2_SELECTED_SLUGS: summary.BATCH_2_SELECTED_SLUGS,
      BATCH_3_SELECTED_SLUGS: summary.BATCH_3_SELECTED_SLUGS,
      totalExternalRequests: summary.totalExternalRequests,
      totalCacheHits: summary.totalCacheHits,
      OWNER_REVIEW_COUNT: summary.OWNER_REVIEW_COUNT,
      PLANT_WRITE_COUNT: summary.PLANT_WRITE_COUNT,
      QUEUE_WRITE_COUNT: summary.QUEUE_WRITE_COUNT,
      NO_PROGRESS_STOP: summary.NO_PROGRESS_STOP,
      BOUNDED_PRODUCTION_CONTROLLER_READY_FOR_REAL_RUN:
        readiness.BOUNDED_PRODUCTION_CONTROLLER_READY_FOR_REAL_RUN,
      summaryPath
    },
    null,
    2
  )
);
