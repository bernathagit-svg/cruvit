/**
 * Cross-run dry validation for production-retry-fairness-policy-v1@1.0.0
 *
 * DOES NOT run real production. DOES NOT mutate plant triad or queue truth.
 * Writes isolated retry state + compact proof under enrichment-worker.
 *
 * Usage: node scripts/_validate-production-retry-fairness-v1-cross-run-dry.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTION_RETRY_FAIRNESS_REF,
  RETRY_STATE_STORAGE_MODEL,
  ATTEMPT_OUTCOME,
  COOLDOWN_TABLE_V1,
  EARLY_RETRY_TRIGGER_SET,
  FAIRNESS_CAN_OVERRIDE_HOLD,
  OWNER_REVIEW_REQUIRED_FOR_ROUTINE_COOLDOWN,
  QUEUE_PRIORITY_PRESERVED_WITH_FAIRNESS,
  defaultRetryStateDoc,
  saveRetryState,
  loadRetryState,
  computeNoProgressFingerprint,
  recordJobAttempt,
  isRetryCooldownActive,
  emptyOpportunityVersions
} from '../modules/personal-domain/production-retry-fairness-policy-v1.js';
import {
  selectEligibleJobs,
  loadCurrentQueue,
  loadCatalogPlants,
  loadSafeWriterSlugSet
} from '../modules/personal-domain/auto-enrichment-worker-v1.js';
import {
  createRun,
  peekNextSelection
} from '../modules/personal-domain/bounded-production-controller-v1.js';
import {
  hashFile,
  bootstrapSafeMigrationPaths
} from '../modules/personal-domain/catalog-enrichment-apply-writer-v1.js';
import { plantContentHash } from '../modules/personal-domain/catalog-enrichment-apply-gate-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(
  ROOT,
  'data/catalog/enrichment-worker/production-retry-fairness-v1'
);
const ISOLATED_STATE = path.join(OUT_DIR, 'isolated-retry-state-dry.json');
const PROOF_PATH = path.join(OUT_DIR, 'cross-run-dry-proof.json');
const CHECKPOINT_LIST = path.join(OUT_DIR, 'checkpoint-file-list.json');

const NOW_A = new Date('2026-09-10T12:00:00.000Z');
const NOW_B = new Date('2026-09-10T12:05:00.000Z');
const NOW_C_DURING = new Date('2026-09-11T11:00:00.000Z'); // still within 24h
const NOW_C_AFTER = new Date('2026-09-11T13:00:00.000Z'); // after 24h

function surfaceHashes() {
  const paths = bootstrapSafeMigrationPaths(ROOT);
  return {
    json: hashFile(paths.json),
    js: hashFile(paths.js),
    browser: hashFile(paths.browser),
    queue: hashFile(
      path.join(ROOT, 'data/catalog/enrichment-queue/current-catalog-enrichment-queue-v1.json')
    ),
    summary: hashFile(
      path.join(ROOT, 'data/catalog/enrichment-queue/current-catalog-enrichment-summary-v1.json')
    ),
    liveRetryControl: hashFile(path.join(ROOT, RETRY_STATE_STORAGE_MODEL.path))
  };
}

function opportunityFp(job, plants) {
  const plant = plants[job.canonicalSlug];
  return computeNoProgressFingerprint({
    jobId: job.jobId,
    canonicalSlug: job.canonicalSlug,
    gapCodes: job.gapCodes,
    plantContentHash: plant ? plantContentHash(plant) : null,
    productGate: job.productGate,
    enrichmentExecution: job.enrichmentExecution,
    priority: job.priority,
    ...emptyOpportunityVersions()
  });
}

function selectTop(maxJobs, { retryStatePath = null, now = NOW_A, applyRetryFairness = true } = {}) {
  const queue = loadCurrentQueue(ROOT);
  const safeSlugs = loadSafeWriterSlugSet(ROOT);
  return selectEligibleJobs(queue, {
    maxJobs,
    dryRun: true,
    allowDryScaleCeiling: maxJobs > 3,
    repoRoot: ROOT,
    safeSlugs,
    applyRetryFairness,
    retryStatePath,
    now,
    realExecutionAllowed: false,
    plantsBySlug: loadCatalogPlants(ROOT)
  });
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const before = surfaceHashes();
const queue = loadCurrentQueue(ROOT);
const plants = loadCatalogPlants(ROOT);

// RUN A — authoritative top-3 (no cooldown yet)
const runASel = selectTop(3, { applyRetryFairness: true, retryStatePath: ISOLATED_STATE, now: NOW_A });
const runASlugs = runASel.selected.map((j) => j.canonicalSlug);
if (JSON.stringify(runASlugs) !== JSON.stringify(['apricot', 'avocado', 'guava'])) {
  throw new Error(`RUN A unexpected selection: ${runASlugs.join(',')}`);
}

// Record known no-progress outcomes into ISOLATED durable state (not live control).
const doc = defaultRetryStateDoc(NOW_A.toISOString());
const knownOutcomes = {
  apricot: 'ALREADY_EQUIVALENT',
  avocado: 'ALREADY_EQUIVALENT',
  guava: 'PARTIAL_NO_APPLY'
};
for (const slug of runASlugs) {
  const job = queue.jobs.find((j) => j.canonicalSlug === slug);
  recordJobAttempt(doc, {
    jobId: job.jobId,
    canonicalSlug: slug,
    outcome: ATTEMPT_OUTCOME.NO_PROGRESS,
    opportunityFingerprint: opportunityFp(job, plants),
    now: NOW_A
  });
}
saveRetryState(ROOT, doc, { statePath: ISOLATED_STATE });

// RUN B — independent controller peek (empty processedSlugs; durable fairness only)
const runB = createRun({
  repoRoot: ROOT,
  dryControlMode: true,
  realExecutionAllowed: false,
  reportSubdir: null,
  applyRetryFairness: true,
  persistRetryFairness: false,
  retryStatePath: ISOLATED_STATE,
  now: NOW_B,
  artifactRoot: path.join(OUT_DIR, '_tmp-run-b-artifacts')
});
const peekB = peekNextSelection(runB);
const runBSlugs = peekB.selectedSlugs;

const runBDirect = selectTop(3, {
  applyRetryFairness: true,
  retryStatePath: ISOLATED_STATE,
  now: NOW_B
});
const runBDirectSlugs = runBDirect.selected.map((j) => j.canonicalSlug);

if (JSON.stringify(runBSlugs) !== JSON.stringify(['lychee', 'mandarin', 'olive'])) {
  throw new Error(`RUN B peek unexpected: ${runBSlugs.join(',')}`);
}
if (JSON.stringify(runBDirectSlugs) !== JSON.stringify(['lychee', 'mandarin', 'olive'])) {
  throw new Error(`RUN B select unexpected: ${runBDirectSlugs.join(',')}`);
}

// RUN C conceptual — during cooldown still skip; after expiry top jobs return
const runCDuring = selectTop(3, {
  applyRetryFairness: true,
  retryStatePath: ISOLATED_STATE,
  now: NOW_C_DURING
});
const runCAfter = selectTop(3, {
  applyRetryFairness: true,
  retryStatePath: ISOLATED_STATE,
  now: NOW_C_AFTER
});

const loaded = loadRetryState(ROOT, { statePath: ISOLATED_STATE });
const apricotEntry = loaded.doc.jobs['enrich-v1:apricot'];
const apricotJob = queue.jobs.find((j) => j.canonicalSlug === 'apricot');
const early = isRetryCooldownActive(apricotEntry, {
  now: NOW_B,
  opportunityFingerprint: opportunityFp(
    { ...apricotJob, gapCodes: [...(apricotJob.gapCodes || []), 'EARLY_TRIGGER_GAP'] },
    plants
  )
});

const after = surfaceHashes();
const plantWriteCount = before.json === after.json && before.js === after.js && before.browser === after.browser ? 0 : 1;
const logicalQueueChangeCount =
  before.queue === after.queue && before.summary === after.summary ? 0 : 1;
const liveRetryUnchanged = before.liveRetryControl === after.liveRetryControl;

const CROSS_RUN_SELECTION_ADVANCED =
  JSON.stringify(runASlugs) !== JSON.stringify(runBSlugs) &&
  JSON.stringify(runBSlugs) === JSON.stringify(['lychee', 'mandarin', 'olive'])
    ? 'YES'
    : 'NO';

const NO_PROGRESS_FINGERPRINT_STABLE_ACROSS_METADATA_ONLY_CHANGES =
  computeNoProgressFingerprint({
    jobId: 'x',
    canonicalSlug: 'apricot',
    gapCodes: ['G'],
    plantContentHash: 'h',
    generatedAt: 't1',
    ...emptyOpportunityVersions()
  }) ===
  computeNoProgressFingerprint({
    jobId: 'x',
    canonicalSlug: 'apricot',
    gapCodes: ['G'],
    plantContentHash: 'h',
    generatedAt: 't2',
    retrievedAt: 't3',
    ...emptyOpportunityVersions()
  })
    ? 'YES'
    : 'NO';

const RECURRING_TOP_JOB_STARVATION_RISK_AFTER_POLICY =
  CROSS_RUN_SELECTION_ADVANCED === 'YES' ? 'NO' : 'YES';

const SAFE_TO_SCHEDULE_RECURRING_BOUNDED_PRODUCTION =
  CROSS_RUN_SELECTION_ADVANCED === 'YES' &&
  FAIRNESS_CAN_OVERRIDE_HOLD === 'NO' &&
  OWNER_REVIEW_REQUIRED_FOR_ROUTINE_COOLDOWN === 'NO' &&
  plantWriteCount === 0 &&
  logicalQueueChangeCount === 0 &&
  JSON.stringify(runCDuring.selected.map((j) => j.canonicalSlug)) ===
    JSON.stringify(['lychee', 'mandarin', 'olive']) &&
  JSON.stringify(runCAfter.selected.map((j) => j.canonicalSlug)) ===
    JSON.stringify(['apricot', 'avocado', 'guava']) &&
  early.active === false
    ? 'YES'
    : 'NO';

const proof = {
  policyRef: PRODUCTION_RETRY_FAIRNESS_REF,
  RETRY_STATE_STORAGE_MODEL,
  COOLDOWN_TABLE_V1,
  EARLY_RETRY_TRIGGER_SET,
  QUEUE_PRIORITY_PRESERVED_WITH_FAIRNESS,
  FAIRNESS_CAN_OVERRIDE_HOLD,
  OWNER_REVIEW_REQUIRED_FOR_ROUTINE_COOLDOWN,
  COOLDOWN_JOB_EXTERNAL_REQUESTS: 0,
  PLANT_WRITE_COUNT: plantWriteCount,
  LOGICAL_QUEUE_JOB_CHANGE_COUNT: logicalQueueChangeCount,
  LIVE_RETRY_CONTROL_UNCHANGED: liveRetryUnchanged ? 'YES' : 'NO',
  isolatedRetryStatePath: path.relative(ROOT, ISOLATED_STATE).replace(/\\/g, '/'),
  RUN_A: {
    selectedSlugs: runASlugs,
    knownOutcomes,
    note: 'Authoritative SAFE P1 AUTO top-3; NO_PROGRESS recorded into isolated scheduling state'
  },
  RUN_B: {
    selectedSlugs: runBSlugs,
    excludeSlugsApplied: peekB.excludeSlugsApplied,
    CONTROLLER_LOCAL_PROCESSED_SET: runB.state.processedSlugs,
    note: 'Independent run; advancement caused by durable fairness cooldown only'
  },
  RUN_C: {
    duringCooldownSelected: runCDuring.selected.map((j) => j.canonicalSlug),
    afterCooldownSelected: runCAfter.selected.map((j) => j.canonicalSlug),
    earlyRetryReenabled: early.active === false && early.EARLY_RETRY === 'YES' ? 'YES' : 'NO'
  },
  CROSS_RUN_SELECTION_ADVANCED,
  NO_PROGRESS_FINGERPRINT_STABLE_ACROSS_METADATA_ONLY_CHANGES,
  RECURRING_TOP_JOB_STARVATION_RISK_AFTER_POLICY,
  SAFE_TO_SCHEDULE_RECURRING_BOUNDED_PRODUCTION,
  BATCH_3_INGESTED: 'NO',
  DEPLOYED: 'NO',
  REAL_PRODUCTION_RUN: 'NO',
  RECURRING_SCHEDULE_CREATED: 'NO'
};

fs.writeFileSync(PROOF_PATH, JSON.stringify(proof, null, 2));

const checkpointFiles = [
  'modules/personal-domain/production-retry-fairness-policy-v1.js',
  'modules/personal-domain/auto-enrichment-worker-v1.js',
  'modules/personal-domain/bounded-production-controller-v1.js',
  'modules/personal-domain/production-artifact-retention-v1.js',
  'data/catalog/enrichment-control/production-retry-fairness-state-v1.json',
  'tests/production-retry-fairness-policy-v1.test.mjs',
  'tests/production-artifact-retention-v1.test.mjs',
  'scripts/_validate-production-retry-fairness-v1-cross-run-dry.mjs',
  'data/catalog/enrichment-worker/production-retry-fairness-v1/cross-run-dry-proof.json',
  'data/catalog/enrichment-worker/production-retry-fairness-v1/isolated-retry-state-dry.json',
  'data/catalog/enrichment-worker/production-retry-fairness-v1/checkpoint-file-list.json'
];
fs.writeFileSync(
  CHECKPOINT_LIST,
  JSON.stringify(
    {
      PRODUCTION_RETRY_FAIRNESS_V1_CHECKPOINT_FILE_LIST: checkpointFiles,
      note: 'Exact paths only; no wildcards. Do not stage until owner requests commit.'
    },
    null,
    2
  )
);

// cleanup temp artifacts dir if empty-ish
try {
  fs.rmSync(path.join(OUT_DIR, '_tmp-run-b-artifacts'), { recursive: true, force: true });
} catch {
  /* ignore */
}

console.log(
  JSON.stringify(
    {
      CROSS_RUN_SELECTION_ADVANCED,
      SAFE_TO_SCHEDULE_RECURRING_BOUNDED_PRODUCTION,
      PLANT_WRITE_COUNT: plantWriteCount,
      LOGICAL_QUEUE_JOB_CHANGE_COUNT: logicalQueueChangeCount,
      RUN_A: runASlugs,
      RUN_B: runBSlugs,
      proof: path.relative(ROOT, PROOF_PATH).replace(/\\/g, '/')
    },
    null,
    2
  )
);
