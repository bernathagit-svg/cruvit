/**
 * Production Retry / Fairness Policy v1 — unit + selection + cross-run dry tests.
 * Isolated retry-state paths only; does not mutate live control state, plants, or queue.
 *
 * Run: node --test tests/production-retry-fairness-policy-v1.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
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
  cooldownMsForNoProgressCount,
  defaultRetryStateDoc,
  loadRetryState,
  saveRetryState,
  computeNoProgressFingerprint,
  classifyAttemptOutcome,
  recordJobAttempt,
  isRetryCooldownActive,
  listCooldownSlugs,
  recordBatchRetryOutcomes,
  emptyOpportunityVersions
} from '../modules/personal-domain/production-retry-fairness-policy-v1.js';
import {
  WORKER_MAX_JOBS,
  WORKER_STOP_REASON,
  isJobEligibleForWorker,
  selectEligibleJobs,
  lockBatch,
  processBatch,
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
import { classifyProductionArtifactPath } from '../modules/personal-domain/production-artifact-retention-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAFE_SLUGS = loadSafeWriterSlugSet(ROOT);
const PLANTS = loadCatalogPlants(ROOT);
const MS_DAY = 24 * 60 * 60 * 1000;

function tempRetryPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cruvit-retry-'));
  return path.join(dir, 'production-retry-fairness-state-v1.json');
}

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
    liveRetry: hashFile(
      path.join(ROOT, RETRY_STATE_STORAGE_MODEL.path)
    )
  };
}

function jobFp(job, extra = {}) {
  const slug = job.canonicalSlug;
  const plant = PLANTS[slug];
  return computeNoProgressFingerprint({
    jobId: job.jobId,
    canonicalSlug: slug,
    gapCodes: job.gapCodes,
    plantContentHash: plant ? plantContentHash(plant) : null,
    productGate: job.productGate,
    enrichmentExecution: job.enrichmentExecution,
    priority: job.priority,
    ...emptyOpportunityVersions(),
    ...extra
  });
}

function recordNoProgressForSlugs(doc, slugs, { now, queue } = {}) {
  const jobs = (queue || loadCurrentQueue(ROOT)).jobs;
  const out = [];
  for (const slug of slugs) {
    const job = jobs.find((j) => j.canonicalSlug === slug);
    assert.ok(job, slug);
    const fp = jobFp(job);
    const entry = recordJobAttempt(doc, {
      jobId: job.jobId,
      canonicalSlug: slug,
      outcome: ATTEMPT_OUTCOME.NO_PROGRESS,
      opportunityFingerprint: fp,
      now
    });
    out.push(entry);
  }
  return out;
}

test('policy constants + storage model', () => {
  assert.match(PRODUCTION_RETRY_FAIRNESS_REF, /^production-retry-fairness-policy-v1@1\.0\.0$/);
  assert.equal(RETRY_STATE_STORAGE_MODEL.path, 'data/catalog/enrichment-control/production-retry-fairness-state-v1.json');
  assert.equal(RETRY_STATE_STORAGE_MODEL.botanicalFacts, false);
  assert.equal(RETRY_STATE_STORAGE_MODEL.queueJobTruth, false);
  assert.equal(FAIRNESS_CAN_OVERRIDE_HOLD, 'NO');
  assert.equal(OWNER_REVIEW_REQUIRED_FOR_ROUTINE_COOLDOWN, 'NO');
  assert.equal(QUEUE_PRIORITY_PRESERVED_WITH_FAIRNESS, 'YES');
  assert.ok(EARLY_RETRY_TRIGGER_SET.includes('opportunityFingerprint_change'));
  assert.equal(cooldownMsForNoProgressCount(1), 1 * MS_DAY);
  assert.equal(cooldownMsForNoProgressCount(2), 3 * MS_DAY);
  assert.equal(cooldownMsForNoProgressCount(3), 7 * MS_DAY);
  assert.equal(cooldownMsForNoProgressCount(99), 7 * MS_DAY);
  assert.equal(COOLDOWN_TABLE_V1[0].label, '24h');
});

test('1. first NO_PROGRESS creates retry state', () => {
  const statePath = tempRetryPath();
  const now = new Date('2026-09-10T12:00:00.000Z');
  const doc = defaultRetryStateDoc(now.toISOString());
  const queue = loadCurrentQueue(ROOT);
  const job = queue.jobs.find((j) => j.canonicalSlug === 'apricot');
  const fp = jobFp(job);
  const entry = recordJobAttempt(doc, {
    jobId: job.jobId,
    canonicalSlug: 'apricot',
    outcome: ATTEMPT_OUTCOME.NO_PROGRESS,
    opportunityFingerprint: fp,
    now
  });
  assert.equal(entry.consecutiveNoProgressCount, 1);
  assert.equal(entry.lastOutcome, ATTEMPT_OUTCOME.NO_PROGRESS);
  assert.ok(entry.nextEligibleAt);
  assert.equal(Date.parse(entry.nextEligibleAt) - now.getTime(), MS_DAY);
  saveRetryState(ROOT, doc, { statePath });
  const loaded = loadRetryState(ROOT, { statePath });
  assert.equal(loaded.doc.jobs[job.jobId].consecutiveNoProgressCount, 1);
});

test('2–5. active cooldown makes job ineligible; lower-ranked selectable; order preserved; priority unchanged', () => {
  const statePath = tempRetryPath();
  const now = new Date('2026-09-10T12:00:00.000Z');
  const queue = loadCurrentQueue(ROOT);
  const doc = defaultRetryStateDoc(now.toISOString());
  recordNoProgressForSlugs(doc, ['apricot', 'avocado', 'guava'], { now, queue });
  saveRetryState(ROOT, doc, { statePath });

  const baseline = selectEligibleJobs(queue, {
    maxJobs: 6,
    dryRun: true,
    allowDryScaleCeiling: true,
    repoRoot: ROOT,
    safeSlugs: SAFE_SLUGS,
    applyRetryFairness: false,
    realExecutionAllowed: false
  });
  assert.deepEqual(baseline.selected.map((j) => j.canonicalSlug).slice(0, 6), [
    'apricot',
    'avocado',
    'guava',
    'lychee',
    'mandarin',
    'olive'
  ]);

  const withFairness = selectEligibleJobs(queue, {
    maxJobs: 3,
    dryRun: true,
    repoRoot: ROOT,
    safeSlugs: SAFE_SLUGS,
    applyRetryFairness: true,
    retryStatePath: statePath,
    now,
    realExecutionAllowed: false,
    plantsBySlug: PLANTS
  });
  assert.deepEqual(
    withFairness.selected.map((j) => j.canonicalSlug),
    ['lychee', 'mandarin', 'olive']
  );
  assert.equal(withFairness.QUEUE_PRIORITY_PRESERVED_WITH_FAIRNESS, 'YES');
  for (const slug of ['apricot', 'avocado', 'guava']) {
    const skip = withFairness.skipped.find((s) => s.slug === slug);
    assert.ok(skip?.reasons.includes('retry_fairness_cooldown'), slug);
  }
  // Queue document order / priority fields unchanged
  assert.equal(queue.jobs.find((j) => j.canonicalSlug === 'apricot').priority, 'P1');
  assert.ok(
    queue.jobs.findIndex((j) => j.canonicalSlug === 'apricot') <
      queue.jobs.findIndex((j) => j.canonicalSlug === 'lychee')
  );
});

test('6. progress clears / resets cooldown', () => {
  const now = new Date('2026-09-10T12:00:00.000Z');
  const doc = defaultRetryStateDoc();
  const queue = loadCurrentQueue(ROOT);
  const job = queue.jobs.find((j) => j.canonicalSlug === 'apricot');
  const fp = jobFp(job);
  recordJobAttempt(doc, {
    jobId: job.jobId,
    canonicalSlug: 'apricot',
    outcome: ATTEMPT_OUTCOME.NO_PROGRESS,
    opportunityFingerprint: fp,
    now
  });
  assert.equal(doc.jobs[job.jobId].consecutiveNoProgressCount, 1);
  recordJobAttempt(doc, {
    jobId: job.jobId,
    canonicalSlug: 'apricot',
    outcome: ATTEMPT_OUTCOME.PROGRESSED,
    opportunityFingerprint: fp,
    now: new Date(now.getTime() + 1000)
  });
  assert.equal(doc.jobs[job.jobId].consecutiveNoProgressCount, 0);
  assert.equal(doc.jobs[job.jobId].nextEligibleAt, null);
  assert.ok(doc.jobs[job.jobId].lastProgressAt);
  const cool = isRetryCooldownActive(doc.jobs[job.jobId], { now: new Date(now.getTime() + 2000) });
  assert.equal(cool.active, false);
});

test('7. terminal job is not recreated by retry state', () => {
  const statePath = tempRetryPath();
  const now = new Date('2026-09-10T12:00:00.000Z');
  const doc = defaultRetryStateDoc();
  // Synthetic terminal Class A job no longer in queue
  recordJobAttempt(doc, {
    jobId: 'enrich-v1:ghost-terminal',
    canonicalSlug: 'ghost-terminal',
    outcome: ATTEMPT_OUTCOME.PROGRESSED,
    opportunityFingerprint: 'deadbeef',
    now
  });
  saveRetryState(ROOT, doc, { statePath });
  const sel = selectEligibleJobs(loadCurrentQueue(ROOT), {
    maxJobs: 3,
    dryRun: true,
    repoRoot: ROOT,
    safeSlugs: SAFE_SLUGS,
    retryStatePath: statePath,
    now,
    realExecutionAllowed: false,
    plantsBySlug: PLANTS
  });
  assert.ok(!sel.selected.some((j) => j.canonicalSlug === 'ghost-terminal'));
  assert.ok(!loadCurrentQueue(ROOT).jobs.some((j) => j.canonicalSlug === 'ghost-terminal'));
});

test('8. HOLD cannot be overridden by fairness', () => {
  assert.equal(FAIRNESS_CAN_OVERRIDE_HOLD, 'NO');
  const holdJob = {
    jobId: 'enrich-v1:hold-demo',
    canonicalSlug: 'hold-demo',
    priority: 'P1',
    enrichmentExecution: 'AUTO',
    productGate: 'HOLD',
    needsReview: false,
    gapCodes: ['MISSING_FROST'],
    sourceRetrievalRequired: true,
    identityStatus: 'CANONICAL_SPECIES'
  };
  const el = isJobEligibleForWorker(holdJob, {
    safeSlugs: new Set(['hold-demo']),
    applyRetryFairness: true,
    retryCooldownSlugs: [] // cooldown cleared
  });
  assert.equal(el.ok, false);
  assert.ok(el.reasons.includes('productGate_HOLD'));
});

test('9–10. repeated no-progress increases cooldown; cooldown eventually expires', () => {
  const now = new Date('2026-09-10T12:00:00.000Z');
  const doc = defaultRetryStateDoc();
  const queue = loadCurrentQueue(ROOT);
  const job = queue.jobs.find((j) => j.canonicalSlug === 'avocado');
  const fp = jobFp(job);
  let entry = recordJobAttempt(doc, {
    jobId: job.jobId,
    canonicalSlug: 'avocado',
    outcome: ATTEMPT_OUTCOME.NO_PROGRESS,
    opportunityFingerprint: fp,
    now
  });
  assert.equal(entry.consecutiveNoProgressCount, 1);
  assert.equal(Date.parse(entry.nextEligibleAt) - now.getTime(), 1 * MS_DAY);

  entry = recordJobAttempt(doc, {
    jobId: job.jobId,
    canonicalSlug: 'avocado',
    outcome: ATTEMPT_OUTCOME.NO_PROGRESS,
    opportunityFingerprint: fp,
    now: new Date(now.getTime() + 1000)
  });
  assert.equal(entry.consecutiveNoProgressCount, 2);
  assert.equal(Date.parse(entry.nextEligibleAt) - (now.getTime() + 1000), 3 * MS_DAY);

  entry = recordJobAttempt(doc, {
    jobId: job.jobId,
    canonicalSlug: 'avocado',
    outcome: ATTEMPT_OUTCOME.NO_PROGRESS,
    opportunityFingerprint: fp,
    now: new Date(now.getTime() + 2000)
  });
  assert.equal(entry.consecutiveNoProgressCount, 3);
  assert.equal(Date.parse(entry.nextEligibleAt) - (now.getTime() + 2000), 7 * MS_DAY);

  const stillCool = isRetryCooldownActive(entry, {
    now: new Date(now.getTime() + 2000 + 6 * MS_DAY),
    opportunityFingerprint: fp
  });
  assert.equal(stillCool.active, true);
  const expired = isRetryCooldownActive(entry, {
    now: new Date(now.getTime() + 2000 + 7 * MS_DAY),
    opportunityFingerprint: fp
  });
  assert.equal(expired.active, false);
  assert.equal(expired.reason, 'cooldown_expired');
});

test('11. early evidence/version trigger re-enables job', () => {
  const now = new Date('2026-09-10T12:00:00.000Z');
  const doc = defaultRetryStateDoc();
  const queue = loadCurrentQueue(ROOT);
  const job = queue.jobs.find((j) => j.canonicalSlug === 'guava');
  const fp1 = jobFp(job);
  const entry = recordJobAttempt(doc, {
    jobId: job.jobId,
    canonicalSlug: 'guava',
    outcome: ATTEMPT_OUTCOME.NO_PROGRESS,
    opportunityFingerprint: fp1,
    now
  });
  const early = isRetryCooldownActive(entry, {
    now,
    opportunityFingerprint: jobFp(job, { gapCodes: [...(job.gapCodes || []), 'NEW_GAP'] })
  });
  assert.equal(early.active, false);
  assert.equal(early.EARLY_RETRY, 'YES');
});

test('12. metadata-only change does not bypass cooldown', () => {
  const job = {
    jobId: 'enrich-v1:apricot',
    canonicalSlug: 'apricot',
    gapCodes: ['A', 'B'],
    productGate: 'PASS',
    enrichmentExecution: 'AUTO',
    priority: 'P1'
  };
  const fpA = computeNoProgressFingerprint({
    ...job,
    plantContentHash: 'hash1',
    generatedAt: '2020-01-01T00:00:00.000Z',
    ...emptyOpportunityVersions()
  });
  const fpB = computeNoProgressFingerprint({
    ...job,
    plantContentHash: 'hash1',
    generatedAt: '2099-12-31T23:59:59.000Z',
    retrievedAt: '2099-12-31T23:59:59.000Z',
    ...emptyOpportunityVersions()
  });
  assert.equal(fpA, fpB);
  assert.equal(
    'YES',
    fpA === fpB ? 'YES' : 'NO'
  );
});

test('13. cooled job causes zero external retrieval requests', async () => {
  const statePath = tempRetryPath();
  const now = new Date('2026-09-10T12:00:00.000Z');
  const queue = loadCurrentQueue(ROOT);
  const doc = defaultRetryStateDoc();
  recordNoProgressForSlugs(doc, ['apricot', 'avocado', 'guava'], { now, queue });
  saveRetryState(ROOT, doc, { statePath });

  const fetched = [];
  const batch = await processBatch({
    repoRoot: ROOT,
    dryRun: true,
    maxJobs: 3,
    realExecutionAllowed: false,
    applyRetryFairness: true,
    persistRetryFairness: false,
    retryStatePath: statePath,
    now,
    cacheDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cruvit-cache-')),
    artifactRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'cruvit-art-')),
    fetchImpl: async (url) => {
      fetched.push(String(url));
      const html = '<html><body>Hardiness Zone: 10a, 11a USDA hardiness zones 10-11.</body></html>';
      const buf = Buffer.from(html, 'utf8');
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
        text: async () => html,
        arrayBuffer: async () => buf
      };
    }
  });
  assert.deepEqual(batch.lockedSlugs, ['lychee', 'mandarin', 'olive']);
  for (const url of fetched) {
    assert.ok(!/apricot|armeniaca/i.test(url), url);
    assert.ok(!/avocado|persea/i.test(url), url);
    assert.ok(!/guava|psidium/i.test(url), url);
  }
  assert.equal(
    fetched.filter((u) => /apricot|avocado|guava|armeniaca|persea|psidium/i.test(u)).length,
    0
  );
});

test('14. separate controller run respects durable retry state', () => {
  const statePath = tempRetryPath();
  const now = new Date('2026-09-10T12:00:00.000Z');
  const queue = loadCurrentQueue(ROOT);
  const doc = defaultRetryStateDoc();
  recordNoProgressForSlugs(doc, ['apricot', 'avocado', 'guava'], { now, queue });
  saveRetryState(ROOT, doc, { statePath });

  const runA = createRun({
    repoRoot: ROOT,
    dryControlMode: true,
    realExecutionAllowed: false,
    reportSubdir: null,
    applyRetryFairness: true,
    retryStatePath: statePath,
    now,
    artifactRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'cruvit-bpc-a-'))
  });
  // Independent run B (no shared processedSlugs)
  const runB = createRun({
    repoRoot: ROOT,
    dryControlMode: true,
    realExecutionAllowed: false,
    reportSubdir: null,
    applyRetryFairness: true,
    retryStatePath: statePath,
    now,
    artifactRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'cruvit-bpc-b-'))
  });
  assert.deepEqual(runA.state.processedSlugs, []);
  assert.deepEqual(runB.state.processedSlugs, []);
  const peekB = peekNextSelection(runB);
  assert.deepEqual(peekB.selectedSlugs, ['lychee', 'mandarin', 'olive']);
  assert.deepEqual(peekB.excludeSlugsApplied, []);
});

test('15. existing worker hard-stop reason enum unchanged', () => {
  assert.ok(WORKER_STOP_REASON.MATERIAL_CONFLICT);
  assert.ok(WORKER_STOP_REASON.IDENTITY_CONFLICT);
  assert.ok(WORKER_STOP_REASON.SOURCE_POLICY_VIOLATION);
  assert.equal(WORKER_MAX_JOBS, 3);
});

test('16–17. canonical plant data + queue meaning unchanged by fairness dry ops', () => {
  const before = surfaceHashes();
  const statePath = tempRetryPath();
  const now = new Date('2026-09-10T12:00:00.000Z');
  const queue = loadCurrentQueue(ROOT);
  const doc = defaultRetryStateDoc();
  recordNoProgressForSlugs(doc, ['apricot', 'avocado', 'guava'], { now, queue });
  saveRetryState(ROOT, doc, { statePath });
  selectEligibleJobs(queue, {
    maxJobs: 3,
    dryRun: true,
    repoRoot: ROOT,
    safeSlugs: SAFE_SLUGS,
    retryStatePath: statePath,
    now,
    realExecutionAllowed: false,
    plantsBySlug: PLANTS
  });
  const after = surfaceHashes();
  assert.deepEqual(after, before);
});

test('classifyAttemptOutcome + recordBatchRetryOutcomes', () => {
  assert.equal(
    classifyAttemptOutcome({ status: 'ALREADY_EQUIVALENT' }),
    ATTEMPT_OUTCOME.NO_PROGRESS
  );
  assert.equal(
    classifyAttemptOutcome({ status: 'PARTIAL_NO_APPLY' }),
    ATTEMPT_OUTCOME.NO_PROGRESS
  );
  assert.equal(
    classifyAttemptOutcome({ status: 'APPLIED', appliedFields: ['coldTolerance'] }),
    ATTEMPT_OUTCOME.PROGRESSED
  );
  assert.equal(
    classifyAttemptOutcome({ hardStop: WORKER_STOP_REASON.MATERIAL_CONFLICT }),
    ATTEMPT_OUTCOME.HARD_STOP
  );
  assert.equal(
    classifyAttemptOutcome({ productGate: 'HOLD' }),
    ATTEMPT_OUTCOME.HOLD
  );

  const doc = defaultRetryStateDoc();
  const now = new Date('2026-09-10T12:00:00.000Z');
  recordBatchRetryOutcomes(
    doc,
    [
      { slug: 'apricot', jobId: 'enrich-v1:apricot', status: 'ALREADY_EQUIVALENT', appliedFields: [] },
      { slug: 'guava', jobId: 'enrich-v1:guava', status: 'PARTIAL_NO_APPLY', appliedFields: [] }
    ],
    {
      now,
      jobsBySlug: {
        apricot: { jobId: 'enrich-v1:apricot', gapCodes: ['X'], priority: 'P1' },
        guava: { jobId: 'enrich-v1:guava', gapCodes: ['Y'], priority: 'P1' }
      }
    }
  );
  assert.equal(doc.jobs['enrich-v1:apricot'].lastOutcome, ATTEMPT_OUTCOME.NO_PROGRESS);
  assert.equal(doc.jobs['enrich-v1:guava'].lastOutcome, ATTEMPT_OUTCOME.NO_PROGRESS);
});

test('listCooldownSlugs + retention class for fairness paths', () => {
  const now = new Date('2026-09-10T12:00:00.000Z');
  const doc = defaultRetryStateDoc();
  const queue = loadCurrentQueue(ROOT);
  recordNoProgressForSlugs(doc, ['apricot'], { now, queue });
  const plantHashBySlug = {};
  for (const job of queue.jobs) {
    const plant = PLANTS[job.canonicalSlug];
    if (plant) plantHashBySlug[job.canonicalSlug] = plantContentHash(plant);
  }
  const listed = listCooldownSlugs(doc, queue.jobs, {
    now,
    plantHashBySlug,
    versionBundle: emptyOpportunityVersions()
  });
  assert.ok(listed.cooledSlugs.includes('apricot'));
  assert.equal(
    classifyProductionArtifactPath(
      'modules/personal-domain/production-retry-fairness-policy-v1.js'
    ).commit,
    true
  );
  assert.equal(
    classifyProductionArtifactPath(
      'data/catalog/enrichment-control/production-retry-fairness-state-v1.json'
    ).commit,
    true
  );
  assert.equal(
    classifyProductionArtifactPath(
      'data/catalog/enrichment-worker/production-retry-fairness-v1/cross-run-dry-proof.json'
    ).commit,
    true
  );
});
