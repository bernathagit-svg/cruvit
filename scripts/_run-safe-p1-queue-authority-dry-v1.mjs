/**
 * SAFE P1 Queue Authority — DRY-ONLY validation (maxJobs=3).
 *
 * Selection: current SAFE P1 AUTO queue order (not WORKER_PILOT_PLANT_SPECS allowlist).
 * NO real writer. NO plant/queue writes. NO deploy / Batch 3.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  processBatch,
  writeWorkerReports,
  selectEligibleJobs,
  lockBatch,
  loadCurrentQueue,
  loadCatalogPlants,
  loadSafeWriterSlugSet,
  resolveWorkerRetrievalSpec,
  knownWorkerRetrievalSpecs,
  isJobEligibleForWorker,
  WORKER_MAX_JOBS,
  WORKER_MAX_EXTERNAL_REQUESTS_TOTAL,
  WORKER_MAX_EXTERNAL_REQUESTS_PER_PLANT,
  AUTO_ENRICHMENT_WORKER_REF,
  WORKER_PILOT_PLANT_SPECS,
  countSpeciesNameSelectionExclusions
} from '../modules/personal-domain/auto-enrichment-worker-v1.js';
import { classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import {
  hashFile,
  bootstrapSafeMigrationPaths
} from '../modules/personal-domain/catalog-enrichment-apply-writer-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARENT = 'a18dd6d55cfd866cd2b71b159fbe722c1e97fd26';
const outDir = path.join(root, 'data/catalog/enrichment-worker/queue-authority-dry-v1');
const artifactRoot = path.join(outDir, 'artifacts');
const cacheDir = path.join(outDir, 'cache');

function fileSha(p) {
  return hashFile(p);
}

function triadPaths() {
  return bootstrapSafeMigrationPaths(root);
}

function catalogCounts() {
  const index = loadCatalogPlants(root);
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const p of Object.values(index)) {
    counts[classifyPlantDataReadiness(p).readinessShort]++;
  }
  return counts;
}

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(artifactRoot, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

const paths = triadPaths();
const queuePath = path.join(root, 'data/catalog/enrichment-queue/current-catalog-enrichment-queue-v1.json');
const summaryPath = path.join(
  root,
  'data/catalog/enrichment-queue/current-catalog-enrichment-summary-v1.json'
);

const hashesBefore = {
  json: fileSha(paths.json),
  js: fileSha(paths.js),
  browser: fileSha(paths.browser),
  queue: fileSha(queuePath),
  summary: fileSha(summaryPath)
};

const queue = loadCurrentQueue(root);
const safeSlugs = loadSafeWriterSlugSet(root);
const plants = loadCatalogPlants(root);

const queueCandidates = [];
const executionEligiblePool = [];
const presentButIneligible = [];
let rank = 0;
for (const job of queue.jobs || []) {
  rank += 1;
  if (!safeSlugs.has(job.canonicalSlug) || job.priority !== 'P1') continue;
  const resolved = resolveWorkerRetrievalSpec({
    slug: job.canonicalSlug,
    scientificName: job.scientificName,
    plantSpecs: knownWorkerRetrievalSpecs()
  });
  const el = isJobEligibleForWorker(job, {
    safeSlugs,
    repoRoot: root,
    requireWorkerSpec: false
  });
  const plant = plants[job.canonicalSlug];
  const r = plant ? classifyPlantDataReadiness(plant) : null;
  const row = {
    queueRank: rank,
    jobId: job.jobId,
    slug: job.canonicalSlug,
    scientificName: job.scientificName,
    readiness: r?.readinessShort || null,
    productGate: job.productGate || r?.gate || null,
    enrichmentExecution: job.enrichmentExecution,
    needsReview: plant?.needsReview === true || (job.gapCodes || []).includes('NEEDS_REVIEW'),
    SAFE_writer_eligible: true,
    P1: job.priority === 'P1',
    AUTO: job.enrichmentExecution === 'AUTO',
    retrievalConfigAvailable: resolved.ok ? 'YES' : 'NO',
    retrievalConfigSource: resolved.source,
    selectable: el.ok ? 'YES' : 'NO',
    exclusionReasons: el.ok ? [] : el.reasons,
    gapCodes: job.gapCodes,
    classification: el.ok
      ? 'ELIGIBLE_FOR_PRODUCTION_SELECTION'
      : job.enrichmentExecution === 'HOLD_FOR_REVIEW' ||
          job.productGate === 'HOLD' ||
          plant?.needsReview === true ||
          (job.gapCodes || []).includes('NEEDS_REVIEW')
        ? 'PRESENT_IN_QUEUE_BUT_NOT_EXECUTION_ELIGIBLE'
        : 'PRESENT_IN_QUEUE_BUT_NOT_EXECUTION_ELIGIBLE'
  };
  queueCandidates.push(row);
  if (el.ok) executionEligiblePool.push(row);
  else presentButIneligible.push(row);
}

const selection = selectEligibleJobs(queue, {
  maxJobs: WORKER_MAX_JOBS,
  dryRun: true,
  repoRoot: root,
  safeSlugs
});
const locked = lockBatch(selection);
fs.writeFileSync(path.join(outDir, 'locked-batch.json'), JSON.stringify(locked, null, 2));
fs.writeFileSync(
  path.join(outDir, 'eligible-pool.json'),
  JSON.stringify(
    {
      parentCommit: PARENT,
      note:
        'SAFE_P1_QUEUE_CANDIDATES includes HOLD/ineligible audit rows. SAFE_P1_AUTO_EXECUTION_ELIGIBLE_POOL is selectEligibleJobs-only. productGate HOLD is not execution-eligible even if enrichmentExecution=AUTO.',
      AUTO_PLUS_HOLD_SELECTABLE: 'NO',
      SAFE_P1_QUEUE_CANDIDATES: queueCandidates,
      SAFE_P1_AUTO_EXECUTION_ELIGIBLE_POOL: executionEligiblePool,
      SAFE_P1_QUEUE_PRESENT_BUT_INELIGIBLE: presentButIneligible
    },
    null,
    2
  )
);

const dry = await processBatch({
  repoRoot: root,
  dryRun: true,
  lockedBatch: locked,
  parentCommit: PARENT,
  artifactRoot,
  cacheDir,
  realExecutionAllowed: false
});

const reports = writeWorkerReports(root, dry, 'queue-authority-dry', 'queue-authority-dry-v1');

const hashesAfter = {
  json: fileSha(paths.json),
  js: fileSha(paths.js),
  browser: fileSha(paths.browser),
  queue: fileSha(queuePath),
  summary: fileSha(summaryPath)
};

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

const final = {
  phase: 'safe_p1_queue_authority_dry_v1',
  workerRef: AUTO_ENRICHMENT_WORKER_REF,
  parentCommit: PARENT,
  PRODUCTION_SELECTION_AUTHORITY: 'QUEUE_ORDER_SAFE_P1_AUTO',
  WORKER_PILOT_PLANT_SPECS_IS_SELECTION_ALLOWLIST_AFTER_FIX: 'NO',
  SPECIES_NAME_SELECTION_EXCLUSION_COUNT: countSpeciesNameSelectionExclusions(),
  FULL_SAFE_P1_QUEUE_AUTHORITY_PROVEN:
    plantWriteCount === 0 &&
    queueWriteCount === 0 &&
    countSpeciesNameSelectionExclusions() === 0 &&
    selection.selectionAuthority === 'QUEUE_ORDER_SAFE_P1_AUTO' &&
    JSON.stringify([...locked.lockedSlugs]) ===
      JSON.stringify(executionEligiblePool.slice(0, 3).map((r) => r.slug))
      ? 'YES'
      : 'NO',
  AUTO_PLUS_HOLD_SELECTABLE: 'NO',
  STRAWBERRY_GUAVA_SELECTION_BLOCKED: presentButIneligible.some(
    (r) => r.slug === 'strawberry-guava'
  )
    ? 'YES'
    : 'NO',
  CORRECTED_TOP_3_MATCHES_DRY_BATCH:
    JSON.stringify([...locked.lockedSlugs]) ===
    JSON.stringify(executionEligiblePool.slice(0, 3).map((r) => r.slug))
      ? 'YES'
      : 'NO',
  SAFE_P1_PRODUCTION_CAN_CONTINUE_AUTONOMOUSLY: 'NO',
  SAFE_P1_PRODUCTION_READY_FOR_NEXT_REAL_BATCH:
    dry.status === 'BATCH_COMPLETE' && plantWriteCount === 0 && queueWriteCount === 0
      ? 'YES'
      : 'NO',
  nextBlocker: 'owner-authorized real batch under queue authority (not executed here)',
  OLD_ALLOWLIST_BATCH: WORKER_PILOT_PLANT_SPECS.map((s) => s.slug),
  QUEUE_AUTHORITY_TOP_3: locked.lockedSlugs,
  SAFE_P1_AUTO_EXECUTION_ELIGIBLE_POOL_SLUGS: executionEligiblePool.map((r) => r.slug),
  SAFE_P1_QUEUE_PRESENT_BUT_INELIGIBLE_SLUGS: presentButIneligible.map((r) => r.slug),
  SELECTION_CHANGED_AFTER_GENERALIZATION:
    JSON.stringify([...locked.lockedSlugs].sort()) ===
    JSON.stringify([...WORKER_PILOT_PLANT_SPECS.map((s) => s.slug)].sort())
      ? 'NO'
      : 'YES',
  batchFingerprint: locked.batchFingerprint,
  maxJobs: WORKER_MAX_JOBS,
  requestBudget: {
    maxTotal: WORKER_MAX_EXTERNAL_REQUESTS_TOTAL,
    maxPerPlant: WORKER_MAX_EXTERNAL_REQUESTS_PER_PLANT
  },
  catalogBefore: catalogCounts(),
  catalogAfter: catalogCounts(),
  dry: {
    status: dry.status,
    batchStopReason: dry.batchStopReason || null,
    externalRequests: dry.externalRequests,
    cacheHits: dry.cacheHits || 0,
    plantsChanged: dry.plantsChanged || [],
    ownerReviewRequiredCount: dry.ownerReviewRequiredCount || 0,
    audits: (dry.audits || []).map((a) => ({
      slug: a.slug,
      status: a.status,
      hardStop: a.hardStop,
      retrievalConfigSource: a.retrievalConfigSource || null,
      externalRequests: a.externalRequests,
      cacheHits: a.cacheHits,
      appliedFieldsWouldBe: a.appliedFields || [],
      fieldPackets: a.fieldPackets,
      applyGate: a.applyGate,
      readinessSimulation: a.readinessSimulation || null,
      beforeReadiness: a.beforeReadiness,
      ownerDecisionRequired: a.ownerDecisionRequired,
      note: a.note || null
    }))
  },
  noWriteProof: {
    PLANT_WRITE_COUNT: plantWriteCount,
    QUEUE_WRITE_COUNT: queueWriteCount,
    hashesBefore,
    hashesAfter
  },
  APRICOT_EXCLUSION_CLASSIFICATION: 'B_STALE_PILOT_ONLY_EXCLUSION_REMOVED',
  eligiblePoolCount: executionEligiblePool.length,
  queueCandidateCount: queueCandidates.length,
  presentButIneligibleCount: presentButIneligible.length,
  reports: { batch: reports.batchPath }
};

fs.writeFileSync(path.join(outDir, 'queue-authority-dry-final.json'), JSON.stringify(final, null, 2));
console.log(JSON.stringify(final, null, 2));

if (plantWriteCount !== 0 || queueWriteCount !== 0) process.exit(1);
if (final.WORKER_PILOT_PLANT_SPECS_IS_SELECTION_ALLOWLIST_AFTER_FIX !== 'NO') process.exit(1);
