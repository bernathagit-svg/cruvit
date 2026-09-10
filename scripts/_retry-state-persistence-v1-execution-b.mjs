/**
 * Retry-state persistence — Execution B (separate process).
 * Loads live retry state from disk only; no shared memory with Execution A.
 *
 * Usage: node scripts/_retry-state-persistence-v1-execution-b.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  RETRY_STATE_STORAGE_MODEL,
  loadRetryState,
  isRetryCooldownActive,
  computeNoProgressFingerprint,
  emptyOpportunityVersions
} from '../modules/personal-domain/production-retry-fairness-policy-v1.js';
import {
  processBatch,
  selectEligibleJobs,
  loadCurrentQueue,
  loadCatalogPlants,
  loadSafeWriterSlugSet
} from '../modules/personal-domain/auto-enrichment-worker-v1.js';
import { plantContentHash } from '../modules/personal-domain/catalog-enrichment-apply-gate-v1.js';
import {
  hashFile,
  bootstrapSafeMigrationPaths
} from '../modules/personal-domain/catalog-enrichment-apply-writer-v1.js';
import {
  createRun,
  peekNextSelection
} from '../modules/personal-domain/bounded-production-controller-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(
  ROOT,
  'data/catalog/enrichment-worker/retry-state-persistence-v1'
);
const RESULT_A = path.join(OUT_DIR, 'execution-a-result.json');
const RESULT_PATH = path.join(OUT_DIR, 'execution-b-result.json');
const NOW = new Date('2026-09-10T14:05:00.000Z');
const EXECUTION_B_ID = `retry-persist-exec-b-${NOW.toISOString()}`;

function mockFetch(fetchedUrls) {
  return async (url) => {
    fetchedUrls.push(String(url || ''));
    const u = String(url || '');
    let html =
      '<html><body>Hardiness Zone: 10a, 11a USDA hardiness zones 10-11.</body></html>';
    if (u.includes('litchi') || u.includes('lychee')) {
      html = '<html><body>Hardiness Zone: 10a, 11a USDA hardiness zones 10-11.</body></html>';
    } else if (u.includes('reticulata') || u.includes('mandarin')) {
      html = '<html><body>Hardiness Zone: 9a, 10a, 11a USDA hardiness zones 9-11.</body></html>';
    } else if (u.includes('olea')) {
      html = '<html><body>Hardiness Zone: 7a, 8a, 9a, 10a USDA hardiness zones 7-10.</body></html>';
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

if (!fs.existsSync(RESULT_A)) {
  console.error('Execution A result missing — run Execution A in a separate process first');
  process.exit(1);
}
const execA = JSON.parse(fs.readFileSync(RESULT_A, 'utf8'));

const surfacesBefore = surfaceHashes();
const loaded = loadRetryState(ROOT);
if (!loaded.existed) {
  console.error('Execution B expected persisted live retry state on disk');
  process.exit(1);
}

const queue = loadCurrentQueue(ROOT);
const plants = loadCatalogPlants(ROOT);
const safeSlugs = loadSafeWriterSlugSet(ROOT);
const queueOrder = (queue.jobs || []).map((j) => ({
  slug: j.canonicalSlug,
  priority: j.priority,
  jobId: j.jobId
}));

const cooledFromA = execA.selectedSlugs || [];
const cooledJobReports = [];
for (const slug of cooledFromA) {
  const job = queue.jobs.find((j) => j.canonicalSlug === slug);
  const entry =
    loaded.doc.jobs[job?.jobId] ||
    Object.values(loaded.doc.jobs).find((e) => e.canonicalSlug === slug);
  const plant = plants[slug];
  const fp = computeNoProgressFingerprint({
    jobId: job?.jobId,
    canonicalSlug: slug,
    gapCodes: job?.gapCodes,
    plantContentHash: plant ? plantContentHash(plant) : null,
    productGate: job?.productGate,
    enrichmentExecution: job?.enrichmentExecution,
    priority: job?.priority,
    ...emptyOpportunityVersions()
  });
  const cool = isRetryCooldownActive(entry, { now: NOW, opportunityFingerprint: fp });
  cooledJobReports.push({
    jobId: job?.jobId || null,
    slug,
    cooldownActive: cool.active ? 'YES' : 'NO',
    retryStateSource: 'persisted_disk_state',
    nextEligibleAt: entry?.nextEligibleAt || null,
    consecutiveNoProgressCount: entry?.consecutiveNoProgressCount ?? null
  });
}

const run = createRun({
  repoRoot: ROOT,
  dryControlMode: true,
  realExecutionAllowed: false,
  reportSubdir: null,
  applyRetryFairness: true,
  persistRetryFairness: false,
  retryStatePath: null,
  now: NOW,
  artifactRoot: path.join(OUT_DIR, '_tmp-exec-b-artifacts')
});
// Prove no shared processed set
if (run.state.processedSlugs.length !== 0) {
  console.error('Execution B must start with empty processedSlugs');
  process.exit(1);
}
const peek = peekNextSelection(run);
const selectedSlugs = peek.selectedSlugs;

const fetchedUrls = [];
const cacheDir = path.join(OUT_DIR, '_tmp-exec-b-cache');
fs.mkdirSync(cacheDir, { recursive: true });
const batch = await processBatch({
  repoRoot: ROOT,
  dryRun: true,
  maxJobs: 3,
  realExecutionAllowed: false,
  applyRetryFairness: true,
  persistRetryFairness: false,
  retryStatePath: null,
  now: NOW,
  cacheDir,
  artifactRoot: path.join(OUT_DIR, '_tmp-exec-b-batch-artifacts'),
  fetchImpl: mockFetch(fetchedUrls)
});

const cooledRetrievalHits = fetchedUrls.filter((u) =>
  /apricot|armeniaca|avocado|persea|guava|psidium/i.test(u)
);
const surfacesAfter = surfaceHashes();

const CROSS_PROCESS_SELECTION_ADVANCED =
  selectedSlugs.length > 0 &&
  JSON.stringify([...selectedSlugs].sort()) !==
    JSON.stringify([...(execA.selectedSlugs || [])].sort()) &&
  cooledFromA.every((s) => !selectedSlugs.includes(s))
    ? 'YES'
    : 'NO';

const result = {
  EXECUTION_B_ID,
  pid: process.pid,
  EXECUTION_A_PID_FROM_RESULT: execA.pid,
  PIDS_DIFFERENT: process.pid !== execA.pid,
  EXECUTION_B_LOADED_STATE_FROM_DISK: loaded.existed ? 'YES' : 'NO',
  loadedContentHash: loaded.contentHash,
  expectedHashFromA: execA.stateHashAfter,
  hashMatchesExecutionAPersist: loaded.contentHash === execA.stateHashAfter,
  controllerLocalProcessedSet: run.state.processedSlugs,
  excludeSlugsApplied: peek.excludeSlugsApplied,
  EXECUTION_B_SELECTED_SLUGS: selectedSlugs,
  batchLockedSlugs: batch.lockedSlugs,
  cooledJobReports,
  COOLED_JOB_EXTERNAL_REQUESTS: cooledRetrievalHits.length,
  cooledRetrievalUrls: cooledRetrievalHits,
  totalFetchUrls: fetchedUrls.length,
  CROSS_PROCESS_SELECTION_ADVANCED,
  QUEUE_PRIORITY_PRESERVED_ACROSS_EXECUTIONS:
    crypto.createHash('sha256').update(JSON.stringify(queueOrder)).digest('hex') ===
    execA.queueOrderFingerprintBefore
      ? 'YES'
      : 'NO',
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
  selectionAuthority: peek.selectionAuthority,
  retryFairness: peek.locked?.selectionSkipped
    ? selectEligibleJobs(queue, {
        maxJobs: 3,
        dryRun: true,
        repoRoot: ROOT,
        safeSlugs,
        now: NOW,
        realExecutionAllowed: false,
        plantsBySlug: plants
      }).retryFairness
    : null
};

fs.writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2));

try {
  fs.rmSync(cacheDir, { recursive: true, force: true });
  fs.rmSync(path.join(OUT_DIR, '_tmp-exec-b-artifacts'), { recursive: true, force: true });
  fs.rmSync(path.join(OUT_DIR, '_tmp-exec-b-batch-artifacts'), { recursive: true, force: true });
} catch {
  /* ignore */
}

if (result.EXECUTION_B_LOADED_STATE_FROM_DISK !== 'YES') process.exit(1);
if (result.COOLED_JOB_EXTERNAL_REQUESTS !== 0) process.exit(1);
if (result.CROSS_PROCESS_SELECTION_ADVANCED !== 'YES') process.exit(1);
if (result.PLANT_WRITE_COUNT !== 0 || result.LOGICAL_QUEUE_JOB_CHANGE_COUNT !== 0) process.exit(1);

console.log(
  JSON.stringify(
    {
      ok: true,
      EXECUTION_B_ID,
      selectedSlugs,
      COOLED_JOB_EXTERNAL_REQUESTS: 0,
      CROSS_PROCESS_SELECTION_ADVANCED
    },
    null,
    2
  )
);
