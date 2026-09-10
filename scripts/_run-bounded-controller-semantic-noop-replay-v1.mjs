/**
 * Semantic no-op hardening proof — same authoritative batch only.
 * Restores nothing (caller restores queue to HEAD first).
 * Does not select different plants. Does not schedule recurring production.
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
  CONTROLLER_MAX_TOTAL_EXTERNAL_REQUESTS_PER_RUN
} from '../modules/personal-domain/bounded-production-controller-v1.js';
import { AUTO_ENRICHMENT_WORKER_REF } from '../modules/personal-domain/auto-enrichment-worker-v1.js';
import {
  hashFile,
  bootstrapSafeMigrationPaths
} from '../modules/personal-domain/catalog-enrichment-apply-writer-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARENT = '8a55e685f86da18118bd6262de5ed13005cd4754';
const ARTIFACT = 'bounded-production-controller-real-v1/semantic-noop-hardening';
const outDir = path.join(root, 'data/catalog/enrichment-worker', ARTIFACT);

function surfaceHashes() {
  const p = bootstrapSafeMigrationPaths(root);
  return {
    json: hashFile(p.json),
    js: hashFile(p.js),
    browser: hashFile(p.browser),
    queue: hashFile(
      path.join(root, 'data/catalog/enrichment-queue/current-catalog-enrichment-queue-v1.json')
    ),
    summary: hashFile(
      path.join(root, 'data/catalog/enrichment-queue/current-catalog-enrichment-summary-v1.json')
    )
  };
}

fs.mkdirSync(outDir, { recursive: true });
const before = surfaceHashes();

const run = createRun({
  repoRoot: root,
  parentCommit: PARENT,
  maxBatches: CONTROLLER_MAX_BATCHES,
  maxJobsPerBatch: CONTROLLER_MAX_JOBS_PER_BATCH,
  maxTotalJobs: CONTROLLER_MAX_TOTAL_JOBS,
  maxTotalExternalRequests: CONTROLLER_MAX_TOTAL_EXTERNAL_REQUESTS_PER_RUN,
  dryControlMode: false,
  realExecutionAllowed: true,
  artifactRoot: path.join(outDir, 'artifacts'),
  cacheDir: path.join(outDir, 'cache'),
  reportSubdir: ARTIFACT
});

const summary = await executeRun(run);
writeRunSummary(root, summary, ARTIFACT);
const after = surfaceHashes();

const proof = {
  phase: 'semantic_noop_hardening_replay',
  controllerRef: BOUNDED_PRODUCTION_CONTROLLER_REF,
  workerRef: AUTO_ENRICHMENT_WORKER_REF,
  parentCommit: PARENT,
  BATCH_1_SELECTED_SLUGS: summary.BATCH_1_SELECTED_SLUGS,
  BATCH_2_SELECTED_SLUGS: summary.BATCH_2_SELECTED_SLUGS,
  stopReason: summary.stopReason,
  NO_PROGRESS_STOP: summary.NO_PROGRESS_STOP,
  REAL_EXECUTION_PERFORMED: summary.REAL_EXECUTION_PERFORMED,
  plantsMutated: summary.plantsMutated,
  PLANT_WRITE_COUNT: summary.PLANT_WRITE_COUNT,
  CANONICAL_PLANT_WRITE_COUNT: before.json === after.json && before.js === after.js && before.browser === after.browser ? 0 : 1,
  QUEUE_FILES_UNCHANGED: before.queue === after.queue && before.summary === after.summary ? 'YES' : 'NO',
  SEMANTIC_NOOP_QUEUE_PERSISTENCE_PREVENTED:
    before.queue === after.queue && before.summary === after.summary ? 'YES' : 'NO',
  BATCH_1_QUEUE_WAS_FRESHLY_READ: summary.BATCH_1_QUEUE_WAS_FRESHLY_READ,
  BATCH_2_QUEUE_WAS_FRESHLY_READ: summary.BATCH_2_QUEUE_WAS_FRESHLY_READ,
  hashesBefore: before,
  hashesAfter: after,
  totalExternalRequests: summary.totalExternalRequests,
  totalCacheHits: summary.totalCacheHits,
  OWNER_REVIEW_COUNT: summary.OWNER_REVIEW_COUNT,
  SAFE_TO_SCHEDULE_RECURRING_BOUNDED_PRODUCTION: 'NO',
  RECURRING_TOP_JOB_STARVATION_RISK: 'YES',
  MANUALLY_SELECTED_ANY_BATCH: summary.MANUALLY_SELECTED_ANY_BATCH,
  CONTROLLER_SELECTS_SPECIES: summary.CONTROLLER_SELECTS_SPECIES,
  batches: summary.batches
};

fs.writeFileSync(path.join(outDir, 'semantic-noop-hardening-proof.json'), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));

if (proof.CANONICAL_PLANT_WRITE_COUNT !== 0) process.exitCode = 2;
if (proof.QUEUE_FILES_UNCHANGED !== 'YES') process.exitCode = 3;
if (proof.stopReason !== 'NO_PROGRESS') process.exitCode = 4;
if (proof.SAFE_TO_SCHEDULE_RECURRING_BOUNDED_PRODUCTION !== 'NO') process.exitCode = 5;
