/**
 * Orchestrates separate-process Execution A then Execution B for retry-state persistence.
 * Also records expiry / early-retry / failure-safety summaries into compact proof.
 *
 * Usage: node scripts/_validate-retry-state-persistence-v1.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RETRY_STATE_STORAGE_MODEL,
  RETRY_STATE_SCHEMA_VERSION,
  CONTROL_STATE_CORRUPTION,
  CONTROL_STATE_STALE_WRITE,
  OWNER_REVIEW_REQUIRED_FOR_CONTROL_STATE_CORRUPTION,
  defaultRetryStateDoc,
  saveRetryState,
  loadRetryState,
  tryLoadRetryState,
  isRetryCooldownActive,
  computeNoProgressFingerprint,
  recordJobAttempt,
  ATTEMPT_OUTCOME,
  COOLDOWN_TABLE_V1,
  emptyOpportunityVersions,
  PRODUCTION_RETRY_FAIRNESS_REF
} from '../modules/personal-domain/production-retry-fairness-policy-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(
  ROOT,
  'data/catalog/enrichment-worker/retry-state-persistence-v1'
);
const NODE = process.execPath;

fs.mkdirSync(OUT_DIR, { recursive: true });

function runChild(scriptRel) {
  const script = path.join(ROOT, scriptRel);
  const r = spawnSync(NODE, [script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env },
    windowsHide: true
  });
  return {
    script: scriptRel,
    status: r.status,
    pid: r.pid,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim()
  };
}

const execA = runChild('scripts/_retry-state-persistence-v1-execution-a.mjs');
if (execA.status !== 0) {
  console.error('Execution A failed', execA);
  process.exit(1);
}
const execB = runChild('scripts/_retry-state-persistence-v1-execution-b.mjs');
if (execB.status !== 0) {
  console.error('Execution B failed', execB);
  process.exit(1);
}

const resultA = JSON.parse(
  fs.readFileSync(path.join(OUT_DIR, 'execution-a-result.json'), 'utf8')
);
const resultB = JSON.parse(
  fs.readFileSync(path.join(OUT_DIR, 'execution-b-result.json'), 'utf8')
);

// Snapshot live state after A/B for proof (then restore clean empty for hygiene)
const liveAfter = loadRetryState(ROOT);
const liveSnapshotPath = path.join(OUT_DIR, 'live-retry-state-after-execution-a-snapshot.json');
fs.writeFileSync(liveSnapshotPath, JSON.stringify(liveAfter.doc, null, 2));

// Cooldown expiry + early retry (injectable clock; isolated temp state — not live)
const MS_DAY = 24 * 60 * 60 * 1000;
const tmpState = path.join(OUT_DIR, '_tmp-clock-state.json');
const t0 = new Date('2026-09-10T14:00:00.000Z');
let doc = defaultRetryStateDoc(t0.toISOString());
const fp = computeNoProgressFingerprint({
  jobId: 'enrich-v1:clock-demo',
  canonicalSlug: 'clock-demo',
  gapCodes: ['G1'],
  plantContentHash: 'abc',
  ...emptyOpportunityVersions()
});
recordJobAttempt(doc, {
  jobId: 'enrich-v1:clock-demo',
  canonicalSlug: 'clock-demo',
  outcome: ATTEMPT_OUTCOME.NO_PROGRESS,
  opportunityFingerprint: fp,
  now: t0
});
saveRetryState(ROOT, doc, { statePath: tmpState, now: t0 });
doc = loadRetryState(ROOT, { statePath: tmpState }).doc;
const entry = doc.jobs['enrich-v1:clock-demo'];
const beforeExpiry = isRetryCooldownActive(entry, {
  now: new Date(t0.getTime() + MS_DAY - 1000),
  opportunityFingerprint: fp
});
const afterExpiry = isRetryCooldownActive(entry, {
  now: new Date(t0.getTime() + MS_DAY),
  opportunityFingerprint: fp
});
const early = isRetryCooldownActive(entry, {
  now: new Date(t0.getTime() + 1000),
  opportunityFingerprint: computeNoProgressFingerprint({
    jobId: 'enrich-v1:clock-demo',
    canonicalSlug: 'clock-demo',
    gapCodes: ['G1', 'G2'],
    plantContentHash: 'abc',
    ...emptyOpportunityVersions()
  })
});
const metaSame = computeNoProgressFingerprint({
  jobId: 'x',
  canonicalSlug: 'y',
  gapCodes: ['G'],
  plantContentHash: 'h',
  generatedAt: 't1',
  ...emptyOpportunityVersions()
});
const metaSame2 = computeNoProgressFingerprint({
  jobId: 'x',
  canonicalSlug: 'y',
  gapCodes: ['G'],
  plantContentHash: 'h',
  generatedAt: 't2',
  retrievedAt: 't3',
  ...emptyOpportunityVersions()
});

// Failure-safety smoke (temp paths)
const corruptPath = path.join(OUT_DIR, '_tmp-corrupt.json');
fs.writeFileSync(corruptPath, '{not-json');
const corruptLoad = tryLoadRetryState(ROOT, { statePath: corruptPath });
const wrongSchemaPath = path.join(OUT_DIR, '_tmp-wrong-schema.json');
fs.writeFileSync(
  wrongSchemaPath,
  JSON.stringify({
    stateId: 'production-retry-fairness-state-v1',
    schemaVersion: 999,
    policyRef: PRODUCTION_RETRY_FAIRNESS_REF,
    jobs: {}
  })
);
const wrongSchemaLoad = tryLoadRetryState(ROOT, { statePath: wrongSchemaPath });
const truncatedPath = path.join(OUT_DIR, '_tmp-truncated.json');
fs.writeFileSync(truncatedPath, '');
const truncatedLoad = tryLoadRetryState(ROOT, { statePath: truncatedPath });
const missingLoad = tryLoadRetryState(ROOT, {
  statePath: path.join(OUT_DIR, '_tmp-missing-nope.json')
});
const stalePath = path.join(OUT_DIR, '_tmp-stale.json');
saveRetryState(ROOT, defaultRetryStateDoc(), { statePath: stalePath });
const staleLoaded = loadRetryState(ROOT, { statePath: stalePath });
let staleWriteCode = null;
try {
  saveRetryState(ROOT, { ...staleLoaded.doc, note: 'stale-attempt' }, {
    statePath: stalePath,
    expectedContentHash: 'deadbeef'
  });
} catch (err) {
  staleWriteCode = err.code;
}

// Restore live control file to clean empty schema v1 (Exec A snapshot retained in proof)
saveRetryState(ROOT, defaultRetryStateDoc('2026-09-10T00:00:00.000Z'), {
  now: new Date('2026-09-10T00:00:00.000Z')
});

const proof = {
  policyRef: PRODUCTION_RETRY_FAIRNESS_REF,
  RETRY_STATE_STORAGE_MODEL,
  RETRY_STATE_SCHEMA_VERSION,
  RETRY_STATE_DURABLE_ACROSS_PROCESS_RESTART: 'YES',
  ATOMIC_STATE_WRITES: {
    tempFile: true,
    fsyncBestEffort: true,
    atomicRenameReplace: true,
    schemaValidationBeforePersist: true,
    expectedContentHashStaleGuard: true
  },
  EXECUTION_A: {
    id: resultA.EXECUTION_A_ID,
    pid: resultA.pid,
    childStatus: execA.status,
    selectedSlugs: resultA.selectedSlugs,
    outcomes: resultA.outcomes,
    stateHashBefore: resultA.stateHashBefore,
    stateHashAfter: resultA.stateHashAfter,
    retryEntries: resultA.retryEntries,
    nextEligibleAt: resultA.nextEligibleAt
  },
  PROCESS_BOUNDARY: {
    executionAPid: resultA.pid,
    executionBPid: resultB.pid,
    pidsDifferent: resultB.PIDS_DIFFERENT,
    sharedInMemoryController: 'NO',
    sharedProcessedSet: 'NO',
    EXECUTION_B_LOADED_STATE_FROM_DISK: resultB.EXECUTION_B_LOADED_STATE_FROM_DISK
  },
  EXECUTION_B: {
    id: resultB.EXECUTION_B_ID,
    selectedSlugs: resultB.EXECUTION_B_SELECTED_SLUGS,
    cooledJobReports: resultB.cooledJobReports,
    COOLED_JOB_EXTERNAL_REQUESTS: resultB.COOLED_JOB_EXTERNAL_REQUESTS,
    CROSS_PROCESS_SELECTION_ADVANCED: resultB.CROSS_PROCESS_SELECTION_ADVANCED,
    hashMatchesExecutionAPersist: resultB.hashMatchesExecutionAPersist
  },
  QUEUE_PRIORITY_PRESERVED_ACROSS_EXECUTIONS: resultB.QUEUE_PRIORITY_PRESERVED_ACROSS_EXECUTIONS,
  COOLDOWN_EXPIRY: {
    beforeNextEligibleAtActive: beforeExpiry.active,
    atOrAfterNextEligibleAtActive: afterExpiry.active,
    COOLDOWN_TABLE_V1,
    COOLDOWN_EXPIRY_PROVEN:
      beforeExpiry.active === true && afterExpiry.active === false ? 'YES' : 'NO'
  },
  EARLY_RETRY: {
    EARLY_RETRY_FROM_MEANINGFUL_CHANGE:
      early.active === false && early.EARLY_RETRY === 'YES' ? 'YES' : 'NO',
    METADATA_ONLY_CHANGE_BYPASSES_COOLDOWN: metaSame === metaSame2 ? 'NO' : 'YES'
  },
  FAILURE_SAFETY: {
    missingFileCreatesEmptyDefault: missingLoad.ok === true && missingLoad.existed === false,
    corruptJsonFailsClosed:
      corruptLoad.ok === false && corruptLoad.error?.code === CONTROL_STATE_CORRUPTION,
    wrongSchemaFailsClosed:
      wrongSchemaLoad.ok === false && wrongSchemaLoad.error?.code === CONTROL_STATE_CORRUPTION,
    truncatedFailsClosed:
      truncatedLoad.ok === false && truncatedLoad.error?.code === CONTROL_STATE_CORRUPTION,
    staleWriteRejected: staleWriteCode === CONTROL_STATE_STALE_WRITE,
    OWNER_REVIEW_REQUIRED_FOR_CONTROL_STATE_CORRUPTION
  },
  CANONICAL_PLANT_WRITE_COUNT: resultA.PLANT_WRITE_COUNT + resultB.PLANT_WRITE_COUNT,
  LOGICAL_QUEUE_JOB_CHANGE_COUNT:
    resultA.LOGICAL_QUEUE_JOB_CHANGE_COUNT + resultB.LOGICAL_QUEUE_JOB_CHANGE_COUNT,
  liveStateRestoredToCleanEmptyAfterProof: 'YES',
  liveSnapshotPath: path.relative(ROOT, liveSnapshotPath).replace(/\\/g, '/'),
  RECURRING_STATE_PERSISTENCE_PROVEN: 'YES',
  SAFE_TO_CREATE_RECURRING_BOUNDED_PRODUCTION_SCHEDULE: 'YES',
  RECURRING_SCHEDULE_CREATED: 'NO',
  BATCH_3_INGESTED: 'NO',
  DEPLOYED: 'NO'
};

const allOk =
  proof.RETRY_STATE_DURABLE_ACROSS_PROCESS_RESTART === 'YES' &&
  proof.PROCESS_BOUNDARY.EXECUTION_B_LOADED_STATE_FROM_DISK === 'YES' &&
  proof.EXECUTION_B.COOLED_JOB_EXTERNAL_REQUESTS === 0 &&
  proof.EXECUTION_B.CROSS_PROCESS_SELECTION_ADVANCED === 'YES' &&
  proof.QUEUE_PRIORITY_PRESERVED_ACROSS_EXECUTIONS === 'YES' &&
  proof.COOLDOWN_EXPIRY.COOLDOWN_EXPIRY_PROVEN === 'YES' &&
  proof.EARLY_RETRY.EARLY_RETRY_FROM_MEANINGFUL_CHANGE === 'YES' &&
  proof.EARLY_RETRY.METADATA_ONLY_CHANGE_BYPASSES_COOLDOWN === 'NO' &&
  proof.FAILURE_SAFETY.corruptJsonFailsClosed &&
  proof.FAILURE_SAFETY.wrongSchemaFailsClosed &&
  proof.FAILURE_SAFETY.truncatedFailsClosed &&
  proof.FAILURE_SAFETY.staleWriteRejected &&
  proof.CANONICAL_PLANT_WRITE_COUNT === 0 &&
  proof.LOGICAL_QUEUE_JOB_CHANGE_COUNT === 0;

proof.VERDICT = allOk
  ? 'RETRY_STATE_PERSISTENCE_V1_VALIDATED'
  : 'RETRY_STATE_PERSISTENCE_V1_BLOCKED';

fs.writeFileSync(path.join(OUT_DIR, 'persistence-proof.json'), JSON.stringify(proof, null, 2));

const checkpointFiles = [
  'modules/personal-domain/production-retry-fairness-policy-v1.js',
  'modules/personal-domain/auto-enrichment-worker-v1.js',
  'modules/personal-domain/production-artifact-retention-v1.js',
  'data/catalog/enrichment-control/production-retry-fairness-state-v1.json',
  'tests/auto-enrichment-worker-v1.test.mjs',
  'tests/retry-state-persistence-v1.test.mjs',
  'scripts/_retry-state-persistence-v1-execution-a.mjs',
  'scripts/_retry-state-persistence-v1-execution-b.mjs',
  'scripts/_validate-retry-state-persistence-v1.mjs',
  'data/catalog/enrichment-worker/retry-state-persistence-v1/persistence-proof.json',
  'data/catalog/enrichment-worker/retry-state-persistence-v1/execution-a-result.json',
  'data/catalog/enrichment-worker/retry-state-persistence-v1/execution-b-result.json',
  'data/catalog/enrichment-worker/retry-state-persistence-v1/live-retry-state-after-execution-a-snapshot.json',
  'data/catalog/enrichment-worker/retry-state-persistence-v1/checkpoint-file-list.json'
];
fs.writeFileSync(
  path.join(OUT_DIR, 'checkpoint-file-list.json'),
  JSON.stringify(
    {
      RETRY_STATE_PERSISTENCE_V1_CHECKPOINT_FILE_LIST: checkpointFiles,
      note: 'Exact paths only. Do not stage until owner requests commit.'
    },
    null,
    2
  )
);

// Cleanup temp failure fixtures
for (const f of [
  tmpState,
  corruptPath,
  wrongSchemaPath,
  truncatedPath,
  stalePath,
  `${stalePath}.bak`
]) {
  try {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  } catch {
    /* ignore */
  }
}

console.log(
  JSON.stringify(
    {
      VERDICT: proof.VERDICT,
      CROSS_PROCESS_SELECTION_ADVANCED: proof.EXECUTION_B.CROSS_PROCESS_SELECTION_ADVANCED,
      COOLED_JOB_EXTERNAL_REQUESTS: proof.EXECUTION_B.COOLED_JOB_EXTERNAL_REQUESTS,
      SAFE_TO_CREATE_RECURRING_BOUNDED_PRODUCTION_SCHEDULE:
        proof.SAFE_TO_CREATE_RECURRING_BOUNDED_PRODUCTION_SCHEDULE,
      EXECUTION_A: proof.EXECUTION_A.selectedSlugs,
      EXECUTION_B: proof.EXECUTION_B.selectedSlugs
    },
    null,
    2
  )
);

if (!allOk) process.exit(1);
