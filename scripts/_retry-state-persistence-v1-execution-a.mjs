/**
 * Retry-state persistence — Execution A (separate process).
 * Dry bounded controller batch with persistRetryFairness → live control file.
 * Terminates after writing result JSON (no Execution B in this process).
 *
 * Usage: node scripts/_retry-state-persistence-v1-execution-a.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  RETRY_STATE_STORAGE_MODEL,
  defaultRetryStateDoc,
  saveRetryState,
  loadRetryState,
  hashRetryStateBytes,
  RETRY_STATE_SCHEMA_VERSION
} from '../modules/personal-domain/production-retry-fairness-policy-v1.js';
import {
  processBatch,
  loadCurrentQueue
} from '../modules/personal-domain/auto-enrichment-worker-v1.js';
import {
  hashFile,
  bootstrapSafeMigrationPaths
} from '../modules/personal-domain/catalog-enrichment-apply-writer-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(
  ROOT,
  'data/catalog/enrichment-worker/retry-state-persistence-v1'
);
const RESULT_PATH = path.join(OUT_DIR, 'execution-a-result.json');
const LIVE_PATH = path.join(ROOT, RETRY_STATE_STORAGE_MODEL.path);
const NOW = new Date('2026-09-10T14:00:00.000Z');
const EXECUTION_A_ID = `retry-persist-exec-a-${NOW.toISOString()}`;

function mockFetch() {
  return async (url) => {
    const u = String(url || '');
    let html =
      '<html><body>Hardiness Zone: 9a, 9b, 10a, 10b USDA hardiness zones 9-11.</body></html>';
    if (u.includes('olea')) {
      html = '<html><body>Hardiness Zone: 7a, 8a, 9a, 10a USDA hardiness zones 7-10.</body></html>';
    } else if (u.includes('persea')) {
      html = '<html><body>Hardiness Zone: 9a, 10a, 11a, 12a USDA hardiness zones 9-12.</body></html>';
    } else if (u.includes('prunus-armeniaca') || u.includes('apricot')) {
      html = '<html><body>Hardiness Zone: 5a, 5b, 6a, 6b, 7a, 7b USDA hardiness zones 5-7.</body></html>';
    } else if (u.includes('psidium') || u.includes('guava')) {
      html = '<html><body>Hardiness Zone: 9a, 10a, 11a USDA hardiness zones 9-11.</body></html>';
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
    )
  };
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// Ensure clean live retry state before Execution A
saveRetryState(ROOT, defaultRetryStateDoc(NOW.toISOString()), {
  statePath: null,
  now: NOW
});

const stateBeforeRaw = fs.readFileSync(LIVE_PATH, 'utf8');
const stateHashBefore = hashRetryStateBytes(stateBeforeRaw);
const surfacesBefore = surfaceHashes();
const queueBefore = loadCurrentQueue(ROOT);
const queueOrderBefore = (queueBefore.jobs || []).map((j) => ({
  slug: j.canonicalSlug,
  priority: j.priority,
  jobId: j.jobId
}));

const cacheDir = path.join(OUT_DIR, '_tmp-exec-a-cache');
const artifactRoot = path.join(OUT_DIR, '_tmp-exec-a-artifacts');
fs.mkdirSync(cacheDir, { recursive: true });
fs.mkdirSync(artifactRoot, { recursive: true });

const batch = await processBatch({
  repoRoot: ROOT,
  dryRun: true,
  maxJobs: 3,
  realExecutionAllowed: false,
  applyRetryFairness: true,
  persistRetryFairness: true,
  // live path (null) — not a fixture injection path
  retryStatePath: null,
  now: NOW,
  cacheDir,
  artifactRoot,
  fetchImpl: mockFetch()
});

const stateAfterRaw = fs.readFileSync(LIVE_PATH, 'utf8');
const stateHashAfter = hashRetryStateBytes(stateAfterRaw);
const loaded = loadRetryState(ROOT);
const surfacesAfter = surfaceHashes();

const selectedSlugs = [...(batch.lockedSlugs || [])];
const outcomes = (batch.audits || []).map((a) => ({
  slug: a.slug,
  status: a.status,
  hardStop: a.hardStop || null,
  appliedFields: a.appliedFields || []
}));

const retryEntries = {};
for (const slug of selectedSlugs) {
  const jobId = `enrich-v1:${slug}`;
  const entry = loaded.doc.jobs[jobId] || Object.values(loaded.doc.jobs).find((e) => e.canonicalSlug === slug);
  if (entry) retryEntries[slug] = entry;
}

const result = {
  EXECUTION_A_ID,
  pid: process.pid,
  processBoundary: 'EXECUTION_A_ONLY',
  selectedSlugs,
  outcomes,
  batchStatus: batch.status,
  batchStopReason: batch.batchStopReason || null,
  retryFairness: batch.retryFairness || null,
  stateFile: RETRY_STATE_STORAGE_MODEL.path,
  stateHashBefore,
  stateHashAfter,
  stateChanged: stateHashBefore !== stateHashAfter,
  schemaVersion: loaded.doc.schemaVersion,
  retryEntries,
  nextEligibleAt: Object.fromEntries(
    Object.entries(retryEntries).map(([s, e]) => [s, e.nextEligibleAt])
  ),
  PLANT_WRITE_COUNT:
    surfacesBefore.json === surfacesAfter.json &&
    surfacesBefore.js === surfacesAfter.js &&
    surfacesBefore.browser === surfacesAfter.browser
      ? 0
      : 1,
  LOGICAL_QUEUE_JOB_CHANGE_COUNT:
    surfacesBefore.queue === surfacesAfter.queue &&
    surfacesBefore.summary === surfacesAfter.summary
      ? 0
      : 1,
  queueOrderFingerprintBefore: crypto
    .createHash('sha256')
    .update(JSON.stringify(queueOrderBefore))
    .digest('hex'),
  persistedAtomic: batch.retryFairness?.atomic === true,
  RETRY_STATE_SCHEMA_VERSION
};

fs.writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2));

// Cleanup temp retrieval trees (retention class C)
try {
  fs.rmSync(cacheDir, { recursive: true, force: true });
  fs.rmSync(artifactRoot, { recursive: true, force: true });
} catch {
  /* ignore */
}

if (!result.stateChanged || Object.keys(retryEntries).length < 1) {
  console.error(JSON.stringify({ ok: false, result }, null, 2));
  process.exit(1);
}
if (result.PLANT_WRITE_COUNT !== 0 || result.LOGICAL_QUEUE_JOB_CHANGE_COUNT !== 0) {
  console.error(JSON.stringify({ ok: false, reason: 'botanical_or_queue_mutation', result }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, EXECUTION_A_ID, selectedSlugs, stateHashAfter }, null, 2));
