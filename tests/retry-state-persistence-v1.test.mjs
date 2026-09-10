/**
 * Retry-state persistence v1 — atomic writes, fail-closed corruption, expiry, early retry.
 * Uses isolated temp paths only (does not mutate live control state).
 *
 * Run: node --test tests/retry-state-persistence-v1.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RETRY_STATE_SCHEMA_VERSION,
  CONTROL_STATE_CORRUPTION,
  CONTROL_STATE_STALE_WRITE,
  OWNER_REVIEW_REQUIRED_FOR_CONTROL_STATE_CORRUPTION,
  defaultRetryStateDoc,
  saveRetryState,
  loadRetryState,
  tryLoadRetryState,
  validateRetryStateDoc,
  hashRetryStateBytes,
  isRetryCooldownActive,
  computeNoProgressFingerprint,
  recordJobAttempt,
  ATTEMPT_OUTCOME,
  emptyOpportunityVersions,
  PRODUCTION_RETRY_FAIRNESS_REF
} from '../modules/personal-domain/production-retry-fairness-policy-v1.js';
import {
  WORKER_STOP_REASON,
  selectEligibleJobs,
  loadCurrentQueue,
  loadSafeWriterSlugSet
} from '../modules/personal-domain/auto-enrichment-worker-v1.js';
import { classifyProductionArtifactPath } from '../modules/personal-domain/production-artifact-retention-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MS_DAY = 24 * 60 * 60 * 1000;

function tempStatePath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cruvit-rsp-')), 'state.json');
}

test('1. missing retry-state file yields empty default (no invent write)', () => {
  const p = path.join(os.tmpdir(), `cruvit-missing-${Date.now()}.json`);
  assert.equal(fs.existsSync(p), false);
  const loaded = loadRetryState(ROOT, { statePath: p });
  assert.equal(loaded.existed, false);
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.doc.jobs, {});
  assert.equal(fs.existsSync(p), false);
});

test('2. valid empty retry state loads', () => {
  const p = tempStatePath();
  const saved = saveRetryState(ROOT, defaultRetryStateDoc(), { statePath: p });
  assert.equal(saved.atomic, true);
  const loaded = loadRetryState(ROOT, { statePath: p });
  assert.equal(loaded.existed, true);
  assert.equal(loaded.doc.schemaVersion, RETRY_STATE_SCHEMA_VERSION);
  assert.deepEqual(loaded.doc.jobs, {});
});

test('3. corrupt JSON fails closed', () => {
  const p = tempStatePath();
  fs.writeFileSync(p, '{broken');
  const r = tryLoadRetryState(ROOT, { statePath: p });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, CONTROL_STATE_CORRUPTION);
  assert.equal(OWNER_REVIEW_REQUIRED_FOR_CONTROL_STATE_CORRUPTION, 'YES');
});

test('4. wrong schema/version fails closed', () => {
  const p = tempStatePath();
  fs.writeFileSync(
    p,
    JSON.stringify({
      stateId: 'production-retry-fairness-state-v1',
      schemaVersion: 999,
      policyRef: PRODUCTION_RETRY_FAIRNESS_REF,
      jobs: {}
    })
  );
  const r = tryLoadRetryState(ROOT, { statePath: p });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, CONTROL_STATE_CORRUPTION);
});

test('5. truncated state file fails closed', () => {
  const p = tempStatePath();
  fs.writeFileSync(p, '');
  const r = tryLoadRetryState(ROOT, { statePath: p });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, CONTROL_STATE_CORRUPTION);
});

test('6. stale write attempt rejected', () => {
  const p = tempStatePath();
  saveRetryState(ROOT, defaultRetryStateDoc(), { statePath: p });
  assert.throws(
    () =>
      saveRetryState(ROOT, defaultRetryStateDoc(), {
        statePath: p,
        expectedContentHash: '0'.repeat(64)
      }),
    (err) => err.code === CONTROL_STATE_STALE_WRITE
  );
});

test('7. atomic replacement leaves valid JSON', () => {
  const p = tempStatePath();
  const a = saveRetryState(ROOT, defaultRetryStateDoc('t1'), { statePath: p, now: new Date('2026-01-01T00:00:00.000Z') });
  const doc = { ...a.doc, jobs: { 'enrich-v1:x': { jobId: 'enrich-v1:x', canonicalSlug: 'x', consecutiveNoProgressCount: 1, lastOutcome: 'NO_PROGRESS', nextEligibleAt: '2026-01-02T00:00:00.000Z', lastAttemptAt: '2026-01-01T00:00:00.000Z', lastAttemptFingerprint: 'f', lastProgressAt: null, evidenceVersion: null } } };
  const b = saveRetryState(ROOT, doc, {
    statePath: p,
    expectedContentHash: a.contentHash,
    now: new Date('2026-01-01T01:00:00.000Z')
  });
  assert.equal(b.atomic, true);
  const raw = fs.readFileSync(p, 'utf8');
  JSON.parse(raw);
  assert.equal(hashRetryStateBytes(raw), b.contentHash);
  validateRetryStateDoc(JSON.parse(raw));
});

test('8–10. Execution B semantics: disk cooldown filters selection; zero cooled retrieval via skip', () => {
  const p = tempStatePath();
  const now = new Date('2026-09-10T14:00:00.000Z');
  const queue = loadCurrentQueue(ROOT);
  const safeSlugs = loadSafeWriterSlugSet(ROOT);
  let doc = defaultRetryStateDoc(now.toISOString());
  for (const slug of ['apricot', 'avocado', 'guava']) {
    const job = queue.jobs.find((j) => j.canonicalSlug === slug);
    const fp = computeNoProgressFingerprint({
      jobId: job.jobId,
      canonicalSlug: slug,
      gapCodes: job.gapCodes,
      productGate: job.productGate,
      enrichmentExecution: job.enrichmentExecution,
      priority: job.priority,
      ...emptyOpportunityVersions()
    });
    recordJobAttempt(doc, {
      jobId: job.jobId,
      canonicalSlug: slug,
      outcome: ATTEMPT_OUTCOME.NO_PROGRESS,
      opportunityFingerprint: fp,
      now
    });
  }
  saveRetryState(ROOT, doc, { statePath: p, now });
  const sel = selectEligibleJobs(queue, {
    maxJobs: 3,
    dryRun: true,
    repoRoot: ROOT,
    safeSlugs,
    retryStatePath: p,
    now,
    realExecutionAllowed: false,
    skipPlantHashForFairness: true
  });
  assert.deepEqual(
    sel.selected.map((j) => j.canonicalSlug),
    ['lychee', 'mandarin', 'olive']
  );
  assert.equal(sel.retryFairness.loadedFromDisk, 'YES');
  assert.equal(sel.QUEUE_PRIORITY_PRESERVED_WITH_FAIRNESS, 'YES');
  assert.ok(
    queue.jobs.findIndex((j) => j.canonicalSlug === 'apricot') <
      queue.jobs.findIndex((j) => j.canonicalSlug === 'lychee')
  );
});

test('11. cooldown expiry works with injectable clock', () => {
  const now = new Date('2026-09-10T14:00:00.000Z');
  const doc = defaultRetryStateDoc();
  const fp = 'fingerprint-stable';
  const entry = recordJobAttempt(doc, {
    jobId: 'enrich-v1:z',
    canonicalSlug: 'z',
    outcome: ATTEMPT_OUTCOME.NO_PROGRESS,
    opportunityFingerprint: fp,
    now
  });
  assert.equal(
    isRetryCooldownActive(entry, {
      now: new Date(now.getTime() + MS_DAY - 1),
      opportunityFingerprint: fp
    }).active,
    true
  );
  assert.equal(
    isRetryCooldownActive(entry, {
      now: new Date(now.getTime() + MS_DAY),
      opportunityFingerprint: fp
    }).active,
    false
  );
});

test('12–13. early meaningful trigger works; metadata-only does not bypass', () => {
  const now = new Date('2026-09-10T14:00:00.000Z');
  const doc = defaultRetryStateDoc();
  const fp1 = computeNoProgressFingerprint({
    jobId: 'enrich-v1:z',
    canonicalSlug: 'z',
    gapCodes: ['A'],
    plantContentHash: 'h1',
    ...emptyOpportunityVersions()
  });
  const entry = recordJobAttempt(doc, {
    jobId: 'enrich-v1:z',
    canonicalSlug: 'z',
    outcome: ATTEMPT_OUTCOME.NO_PROGRESS,
    opportunityFingerprint: fp1,
    now
  });
  const early = isRetryCooldownActive(entry, {
    now,
    opportunityFingerprint: computeNoProgressFingerprint({
      jobId: 'enrich-v1:z',
      canonicalSlug: 'z',
      gapCodes: ['A', 'B'],
      plantContentHash: 'h1',
      ...emptyOpportunityVersions()
    })
  });
  assert.equal(early.active, false);
  assert.equal(early.EARLY_RETRY, 'YES');
  const a = computeNoProgressFingerprint({
    jobId: 'j',
    canonicalSlug: 's',
    gapCodes: ['G'],
    plantContentHash: 'h',
    generatedAt: 't1',
    ...emptyOpportunityVersions()
  });
  const b = computeNoProgressFingerprint({
    jobId: 'j',
    canonicalSlug: 's',
    gapCodes: ['G'],
    plantContentHash: 'h',
    generatedAt: 't2',
    ...emptyOpportunityVersions()
  });
  assert.equal(a, b);
});

test('worker stop reasons include control-state corruption', () => {
  assert.equal(WORKER_STOP_REASON.CONTROL_STATE_CORRUPTION, CONTROL_STATE_CORRUPTION);
  assert.equal(WORKER_STOP_REASON.CONTROL_STATE_STALE_WRITE, CONTROL_STATE_STALE_WRITE);
});

test('retention: persistence proof paths are commit-class B', () => {
  assert.equal(
    classifyProductionArtifactPath(
      'data/catalog/enrichment-worker/retry-state-persistence-v1/persistence-proof.json'
    ).commit,
    true
  );
  assert.equal(
    classifyProductionArtifactPath(
      'scripts/_validate-retry-state-persistence-v1.mjs'
    ).commit,
    true
  );
});
