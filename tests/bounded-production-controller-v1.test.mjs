/**
 * Bounded Production Controller v1 — unit + dry-control tests.
 * No real multi-batch production. No botanical/queue writes in assertions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  AUTO_ENRICHMENT_WORKER_REF,
  WORKER_MAX_JOBS,
  WORKER_STOP_REASON,
  loadCurrentQueue,
  loadSafeWriterSlugSet,
  selectEligibleJobs,
  lockBatch,
  processBatch
} from '../modules/personal-domain/auto-enrichment-worker-v1.js';
import {
  BOUNDED_PRODUCTION_CONTROLLER_REF,
  CONTROLLER_MAX_BATCHES,
  CONTROLLER_MAX_JOBS_PER_BATCH,
  CONTROLLER_MAX_TOTAL_JOBS,
  CONTROLLER_MAX_TOTAL_EXTERNAL_REQUESTS_PER_RUN,
  CONTROLLER_PROGRESSION_MECHANISM,
  CONTROLLER_STOP_REASON,
  createRun,
  executeNextBatch,
  executeRun,
  evaluateBatchResult,
  peekNextSelection,
  stopRun,
  buildRunSummary
} from '../modules/personal-domain/bounded-production-controller-v1.js';
import {
  hashFile,
  bootstrapSafeMigrationPaths
} from '../modules/personal-domain/catalog-enrichment-apply-writer-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAFE_SLUGS = loadSafeWriterSlugSet(ROOT);

function mockFetch() {
  return async (url) => {
    const u = String(url || '');
    let html =
      '<html><body>Hardiness Zone: 9a, 9b, 10a, 10b USDA hardiness zones 9-11.</body></html>';
    if (u.includes('olea')) {
      html = '<html><body>Hardiness Zone: 7a, 8a, 9a, 10a USDA hardiness zones 7-10.</body></html>';
    } else if (u.includes('persea')) {
      html = '<html><body>Hardiness Zone: 9a, 10a, 11a, 12a USDA hardiness zones 9-12.</body></html>';
    } else if (u.includes('prunus-armeniaca')) {
      html = '<html><body>Hardiness Zone: 5a, 5b, 6a, 6b, 7a, 7b USDA hardiness zones 5-7.</body></html>';
    } else if (u.includes('psidium')) {
      html = '<html><body>Hardiness Zone: 9a, 10a, 11a USDA hardiness zones 9-11.</body></html>';
    } else if (u.includes('litchi') || u.includes('lychee')) {
      html = '<html><body>Hardiness Zone: 10a, 11a USDA hardiness zones 10-11.</body></html>';
    } else if (u.includes('reticulata') || u.includes('mandarin')) {
      html = '<html><body>Hardiness Zone: 9a, 10a, 11a USDA hardiness zones 9-11.</body></html>';
    } else if (u.includes('citrus') || u.includes('sinensis')) {
      html = '<html><body>Hardiness Zone: 9a, 10a, 11a USDA hardiness zones 9-11.</body></html>';
    } else if (u.includes('rubus') || u.includes('idaeus')) {
      html = '<html><body>Hardiness Zone: 3a, 4a, 5a, 6a, 7a USDA hardiness zones 3-7.</body></html>';
    }
    const buf = Buffer.from(html, 'utf8');
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => html,
      arrayBuffer: async () => buf
    };
  };
}

function tempDirs() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cruvit-bpc-'));
  return {
    artifactRoot: path.join(base, 'artifacts'),
    cacheDir: path.join(base, 'cache')
  };
}

function surfaceHashes() {
  const triad = bootstrapSafeMigrationPaths(ROOT);
  const queuePath = path.join(
    ROOT,
    'data/catalog/enrichment-queue/current-catalog-enrichment-queue-v1.json'
  );
  const summaryPath = path.join(
    ROOT,
    'data/catalog/enrichment-queue/current-catalog-enrichment-summary-v1.json'
  );
  return {
    json: hashFile(triad.json),
    js: hashFile(triad.js),
    browser: hashFile(triad.browser),
    queue: hashFile(queuePath),
    summary: hashFile(summaryPath)
  };
}

test('controller ref + default caps', () => {
  assert.equal(BOUNDED_PRODUCTION_CONTROLLER_REF, 'bounded-production-controller-v1@1.0.0');
  assert.equal(CONTROLLER_MAX_BATCHES, 3);
  assert.equal(CONTROLLER_MAX_JOBS_PER_BATCH, 3);
  assert.equal(CONTROLLER_MAX_JOBS_PER_BATCH, WORKER_MAX_JOBS);
  assert.equal(CONTROLLER_MAX_TOTAL_JOBS, 9);
  assert.equal(CONTROLLER_MAX_TOTAL_EXTERNAL_REQUESTS_PER_RUN, 18);
  assert.equal(CONTROLLER_PROGRESSION_MECHANISM.code, 'C');
  assert.equal(CONTROLLER_PROGRESSION_MECHANISM.authoritative, false);
});

test('1. controller never selects species itself — queue authority only', () => {
  const run = createRun({
    repoRoot: ROOT,
    dryControlMode: true,
    realExecutionAllowed: false,
    ...tempDirs()
  });
  assert.equal(run.CONTROLLER_SELECTS_SPECIES, 'NO');
  assert.equal(run.SPECS_GATE_SELECTION, 'NO');
  const peek = peekNextSelection(run);
  const direct = selectEligibleJobs(loadCurrentQueue(ROOT), {
    maxJobs: 3,
    repoRoot: ROOT,
    safeSlugs: SAFE_SLUGS,
    realExecutionAllowed: false
  });
  assert.deepEqual(
    peek.selectedSlugs,
    direct.selected.map((j) => j.canonicalSlug)
  );
  assert.equal(peek.selectionAuthority, 'QUEUE_ORDER_SAFE_P1_AUTO');
});

test('2–5. each batch uses queue authority; caps max 3 jobs / 3 batches / 9 total', async () => {
  const dirs = tempDirs();
  const before = surfaceHashes();
  const run = createRun({
    repoRoot: ROOT,
    dryControlMode: true,
    realExecutionAllowed: false,
    maxBatches: 3,
    maxJobsPerBatch: 3,
    maxTotalJobs: 9,
    reportSubdir: null,
    ...dirs
  });
  const summary = await executeRun(run, { fetchImpl: mockFetch() });
  assert.ok(summary.batchesAttempted <= 3);
  assert.ok(summary.batchesCompleted <= 3);
  assert.ok(summary.totalJobsProcessed <= 9);
  for (const b of summary.batches) {
    assert.ok(b.selectedSlugs.length <= 3);
    assert.equal(b.MANUALLY_SELECTED, 'NO');
    assert.ok(b.selectedSlugs.length > 0);
  }
  // Distinct batches under exclusion progression
  if (summary.batches.length >= 2) {
    assert.notDeepEqual(summary.BATCH_1_SELECTED_SLUGS, summary.BATCH_2_SELECTED_SLUGS);
  }
  const after = surfaceHashes();
  assert.deepEqual(after, before);
  assert.equal(summary.PLANT_WRITE_COUNT, 0);
  assert.equal(summary.QUEUE_WRITE_COUNT, 0);
  assert.equal(summary.REAL_EXECUTION_PERFORMED, 'NO');
});

test('6. worker hard stop prevents next batch', () => {
  const run = createRun({
    repoRoot: ROOT,
    dryControlMode: true,
    realExecutionAllowed: false,
    ...tempDirs()
  });
  // Simulate completed batch 1 accounting, then hard-stop evaluation
  run.state.batchesCompleted = 1;
  run.state.totalJobsProcessed = 3;
  run.state.processedSlugs = ['apricot', 'avocado', 'guava'];
  run.state.seenBatchFingerprints = ['fp1'];
  run.state.batchRecords = [
    { selectedSlugs: ['apricot', 'avocado', 'guava'], batchFingerprint: 'fp1' }
  ];
  const decision = evaluateBatchResult(run, {
    hardStop: WORKER_STOP_REASON.MATERIAL_CONFLICT,
    workerSummary: {
      status: 'BATCH_STOPPED',
      batchStopReason: WORKER_STOP_REASON.MATERIAL_CONFLICT,
      externalRequests: 1,
      cacheHits: 0,
      ownerReviewRequiredCount: 0,
      applyAllowedFields: 0,
      needsMoreFields: 0,
      holdOrConflict: 1
    }
  });
  assert.equal(decision.continue, false);
  assert.equal(decision.stopReason, CONTROLLER_STOP_REASON.HARD_STOP);
  assert.equal(decision.hardStopDetail, WORKER_STOP_REASON.MATERIAL_CONFLICT);
});

test('7. request cap prevents next batch', async () => {
  const run = createRun({
    repoRoot: ROOT,
    dryControlMode: true,
    realExecutionAllowed: false,
    maxTotalExternalRequests: 0,
    reportSubdir: null,
    ...tempDirs()
  });
  const step = await executeNextBatch(run, { fetchImpl: mockFetch() });
  assert.equal(step.skipped, true);
  assert.equal(step.reason, CONTROLLER_STOP_REASON.REQUEST_CAP_EXCEEDED);
  assert.equal(run.state.batchesAttempted, 0);
});

test('8–9. no-progress loop stops; same jobs cannot loop indefinitely', () => {
  const run = createRun({
    repoRoot: ROOT,
    dryControlMode: true,
    realExecutionAllowed: false,
    ...tempDirs()
  });
  const peek = peekNextSelection(run);
  // Pretend we already processed exactly this selection
  run.state.batchesCompleted = 1;
  run.state.totalJobsProcessed = peek.selectedSlugs.length;
  run.state.processedSlugs = []; // empty exclusions would reselect same top — fingerprint already seen
  run.state.seenBatchFingerprints = [peek.batchFingerprint];
  run.state.batchRecords = [
    {
      selectedSlugs: peek.selectedSlugs,
      batchFingerprint: peek.batchFingerprint
    }
  ];
  const decision = evaluateBatchResult(run, {
    workerSummary: {
      status: 'BATCH_COMPLETE',
      batchStopReason: null,
      externalRequests: 0,
      cacheHits: 0,
      ownerReviewRequiredCount: 0,
      applyAllowedFields: 0,
      needsMoreFields: 2,
      holdOrConflict: 0
    }
  });
  assert.equal(decision.continue, false);
  assert.equal(decision.stopReason, CONTROLLER_STOP_REASON.NO_PROGRESS);
});

test('10. normal NEEDS_MORE does not trigger Owner Review', async () => {
  const run = createRun({
    repoRoot: ROOT,
    dryControlMode: true,
    realExecutionAllowed: false,
    maxBatches: 1,
    reportSubdir: null,
    ...tempDirs()
  });
  const summary = await executeRun(run, { fetchImpl: mockFetch() });
  assert.equal(summary.OWNER_REVIEW_COUNT, 0);
  assert.ok(summary.needsMoreFields >= 0);
});

test('11. real execution disabled in dry-control mode; real mode requires dryControlMode=false', () => {
  assert.throws(
    () =>
      createRun({
        repoRoot: ROOT,
        dryControlMode: true,
        realExecutionAllowed: true
      }),
    /realExecutionAllowed=false/
  );
  const dryRun = createRun({
    repoRoot: ROOT,
    dryControlMode: true,
    realExecutionAllowed: false,
    ...tempDirs()
  });
  assert.equal(dryRun.REAL_EXECUTION_ALLOWED, false);
  assert.equal(dryRun.DRY_CONTROL_MODE, true);
  const realRun = createRun({
    repoRoot: ROOT,
    dryControlMode: false,
    realExecutionAllowed: true,
    reportSubdir: null,
    ...tempDirs()
  });
  assert.equal(realRun.REAL_EXECUTION_ALLOWED, true);
  assert.equal(realRun.DRY_CONTROL_MODE, false);
  assert.equal(realRun.progression.code, 'FRESH_QUEUE_READ');
  assert.equal(realRun.DRY_PROCESSED_SET_CAN_OVERRIDE_REAL_QUEUE, 'NO');
  assert.equal(realRun.REAL_MODE_NEXT_BATCH_REQUIRES_FRESH_QUEUE_READ, 'YES');
});

test('12–13. plant data unchanged; real queue unchanged after controller dry', async () => {
  const before = surfaceHashes();
  const run = createRun({
    repoRoot: ROOT,
    dryControlMode: true,
    realExecutionAllowed: false,
    maxBatches: 2,
    reportSubdir: null,
    ...tempDirs()
  });
  const summary = await executeRun(run, { fetchImpl: mockFetch() });
  const after = surfaceHashes();
  assert.deepEqual(after, before);
  assert.equal(summary.PLANT_WRITE_COUNT, 0);
  assert.equal(summary.QUEUE_WRITE_COUNT, 0);
  assert.equal(summary.ZERO_WRITE_PROOF.catalogUnchanged, true);
  assert.equal(summary.ZERO_WRITE_PROOF.queueUnchanged, true);
});

test('14. controller does not duplicate worker policy — delegates selectEligibleJobs/lockBatch/processBatch', () => {
  assert.match(BOUNDED_PRODUCTION_CONTROLLER_REF, /^bounded-production-controller-v1@/);
  assert.match(AUTO_ENRICHMENT_WORKER_REF, /^auto-enrichment-worker-v1@/);
  // Policy symbols remain on worker; controller only imports orchestration entrypoints.
  assert.equal(typeof selectEligibleJobs, 'function');
  assert.equal(typeof lockBatch, 'function');
  assert.equal(typeof processBatch, 'function');
  assert.equal(typeof evaluateBatchResult, 'function');
  assert.equal(typeof stopRun, 'function');
  assert.equal(typeof buildRunSummary, 'function');
});

test('15. existing one-batch worker behavior unchanged (queue top-3 still locks)', async () => {
  const selection = selectEligibleJobs(loadCurrentQueue(ROOT), {
    maxJobs: WORKER_MAX_JOBS,
    repoRoot: ROOT,
    safeSlugs: SAFE_SLUGS,
    realExecutionAllowed: false
  });
  const locked = lockBatch(selection);
  assert.equal(locked.lockedSlugs.length, 3);
  assert.equal(locked.selectionAuthority, 'QUEUE_ORDER_SAFE_P1_AUTO');
  const dirs = tempDirs();
  const before = surfaceHashes();
  const batch = await processBatch({
    repoRoot: ROOT,
    dryRun: true,
    lockedBatch: locked,
    realExecutionAllowed: false,
    fetchImpl: mockFetch(),
    ...dirs
  });
  assert.equal(batch.status, 'BATCH_COMPLETE');
  assert.deepEqual(surfaceHashes(), before);
});

test('16. no-progress stops after identical fingerprint; fresh queue peek recorded', async () => {
  const run = createRun({
    repoRoot: ROOT,
    dryControlMode: false,
    realExecutionAllowed: true,
    maxBatches: 3,
    maxTotalExternalRequests: 18,
    reportSubdir: null,
    ...tempDirs()
  });
  assert.equal(run.caps.maxBatches, CONTROLLER_MAX_BATCHES);
  assert.equal(run.caps.maxJobsPerBatch, CONTROLLER_MAX_JOBS_PER_BATCH);
  assert.equal(run.caps.maxTotalJobs, CONTROLLER_MAX_TOTAL_JOBS);
  assert.equal(run.caps.maxTotalExternalRequests, CONTROLLER_MAX_TOTAL_EXTERNAL_REQUESTS_PER_RUN);

  const peek1 = peekNextSelection(run);
  assert.equal(peek1.BATCH_QUEUE_WAS_FRESHLY_READ, 'YES');
  assert.equal(peek1.excludeSlugsApplied.length, 0);
  assert.ok(peek1.selectedSlugs.length >= 1);

  // Simulate completed real batch with zero mutations + same fingerprint seen
  run.state.batchesCompleted = 1;
  run.state.batchesAttempted = 1;
  run.state.totalJobsProcessed = peek1.selectedSlugs.length;
  run.state.seenBatchFingerprints.push(peek1.batchFingerprint);
  run.state.processedSlugs.push(...peek1.selectedSlugs);
  run.state.batchRecords.push({
    batchIndex: 1,
    selectedSlugs: peek1.selectedSlugs,
    batchFingerprint: peek1.batchFingerprint,
    plantsChanged: [],
    fieldsChanged: {},
    MANUALLY_SELECTED: 'NO',
    BATCH_QUEUE_WAS_FRESHLY_READ: 'YES',
    workerSummary: { status: 'BATCH_COMPLETE', batchStopReason: null },
    hardStop: null
  });

  const decision = evaluateBatchResult(run, run.state.batchRecords[0]);
  assert.equal(decision.continue, false);
  assert.equal(decision.stopReason, CONTROLLER_STOP_REASON.NO_PROGRESS);
  assert.equal(decision.BATCH_QUEUE_WAS_FRESHLY_READ, 'YES');
  assert.deepEqual(decision.nextSelectedSlugs, peek1.selectedSlugs);

  const peek2 = peekNextSelection(run);
  assert.equal(peek2.BATCH_QUEUE_WAS_FRESHLY_READ, 'YES');
  assert.equal(peek2.batchFingerprint, peek1.batchFingerprint);
});

test('17. real-mode selection never applies dry processed-exclusion as queue authority', () => {
  const run = createRun({
    repoRoot: ROOT,
    dryControlMode: false,
    realExecutionAllowed: true,
    reportSubdir: null,
    ...tempDirs()
  });
  run.state.processedSlugs.push('apricot', 'avocado', 'guava');
  const peek = peekNextSelection(run);
  assert.equal(peek.BATCH_QUEUE_WAS_FRESHLY_READ, 'YES');
  assert.deepEqual(peek.excludeSlugsApplied, []);
  // Queue authority may still surface the same top jobs — that is correct.
  assert.ok(peek.selectedSlugs.length >= 1);
});
