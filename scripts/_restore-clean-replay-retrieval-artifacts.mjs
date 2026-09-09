/**
 * Restore clean-replay retrieval artifacts ONLY (non-mutating).
 * No plant writes, no queue writes, no real worker apply, no network if cache hit.
 *
 * Usage: node scripts/_restore-clean-replay-retrieval-artifacts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runSourceRetrieverPilot } from '../modules/personal-domain/source-retriever-pilot-v1.js';
import {
  WORKER_PILOT_PLANT_SPECS,
  loadCatalogPlants,
  loadCurrentQueue
} from '../modules/personal-domain/auto-enrichment-worker-v1.js';
import {
  hashFile,
  bootstrapSafeMigrationPaths
} from '../modules/personal-domain/catalog-enrichment-apply-writer-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED = Object.freeze({
  lemon: 'ff1ba2b8b3cd554eed80c46ed24ea497fef9fe93a6897a04d35e50c2b75d37c1',
  olive: '448ba341b75fffd09373587d1f76f31bf6fdccd9ba5b7831e4d162fc0ecfb10c',
  avocado: '98e88d01c0526030bf28f4960d25ec01991734a3636fd30de36cbd21840467b7'
});
const BATCH_FP = '490176274cd6939156eb291633724c8dc94a752cb41204cbea1803adab08536e';
const DURABLE = path.join(ROOT, 'data', 'catalog', 'enrichment-retrieval');
const CACHE = path.join(DURABLE, 'cache');

function shaFile(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function snapshot() {
  const triad = bootstrapSafeMigrationPaths(ROOT);
  return {
    json: hashFile(triad.json),
    js: hashFile(triad.js),
    browser: hashFile(triad.browser),
    queue: shaFile(path.join(ROOT, 'data/catalog/enrichment-queue/current-catalog-enrichment-queue-v1.json')),
    summary: shaFile(path.join(ROOT, 'data/catalog/enrichment-queue/current-catalog-enrichment-summary-v1.json'))
  };
}

const before = snapshot();
const plants = loadCatalogPlants(ROOT);
const queue = loadCurrentQueue(ROOT);

const fetchImpl = async (url) => {
  throw new Error('NETWORK_FORBIDDEN_RESTORE:' + url);
};

let externalRequests = 0;
let cacheHits = 0;
const rows = [];

for (const spec of WORKER_PILOT_PLANT_SPECS) {
  const r = await runSourceRetrieverPilot({
    repoRoot: ROOT,
    queueDoc: queue,
    plantsBySlug: plants,
    plantSpecs: [spec],
    cacheDir: CACHE,
    artifactRoot: DURABLE,
    fetchImpl,
    writeSharedSummary: false
  });
  externalRequests += r.externalRequests || 0;
  cacheHits += r.cacheStats?.hits || 0;

  const packetPath = path.join(DURABLE, 'candidate-packets', `${spec.slug}.candidate-packet-v1.json`);
  const evidencePath = path.join(DURABLE, 'evidence-records', `${spec.slug}.evidence-records-v1.json`);
  const summaryPath = path.join(DURABLE, `source-retriever-pilot-v1-summary-${spec.slug}.json`);
  const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

  // Stamp clean-replay batch reference (non-fingerprint field)
  packet.cleanReplayBatchFingerprint = BATCH_FP;
  packet.cleanReplayRestoredAt = new Date().toISOString();
  packet.fingerprint = packet.fingerprint; // already set; do not hand-edit
  // Recompute to ensure stamp fields outside fingerprint stable set
  fs.writeFileSync(packetPath, JSON.stringify(packet, null, 2));
  // Verify stamp did not change fingerprint computation input — re-read fp from file
  const packet2 = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
  const { candidatePacketFingerprint } = await import(
    '../modules/personal-domain/source-retriever-pilot-v1.js'
  );
  const recomputed = candidatePacketFingerprint(packet2);
  if (recomputed !== EXPECTED[spec.slug] || packet2.fingerprint !== EXPECTED[spec.slug]) {
    console.error('FINGERPRINT_MISMATCH_AFTER_STAMP', {
      slug: spec.slug,
      stored: packet2.fingerprint,
      recomputed,
      expected: EXPECTED[spec.slug]
    });
    process.exit(1);
  }

  const cold = packet2.fieldPackets.find((f) => f.targetField === 'coldTolerance');
  const frost = packet2.fieldPackets.find((f) => f.targetField === 'frostSensitivity');
  rows.push({
    plant: spec.slug,
    expected: EXPECTED[spec.slug],
    actual: packet2.fingerprint,
    match: packet2.fingerprint === EXPECTED[spec.slug] ? 'YES' : 'NO',
    cold: `${cold?.applyStatus}:${cold?.proposedValue}`,
    frost: frost?.applyStatus,
    evidenceRecords: evidence.records?.length,
    summaryFp: summary.results?.[0]?.fingerprint,
    packetPath,
    evidencePath,
    summaryPath
  });
}

const after = snapshot();
const plantWriteCount =
  before.json === after.json && before.js === after.js && before.browser === after.browser ? 0 : 1;
const queueWriteCount = before.queue === after.queue && before.summary === after.summary ? 0 : 1;

const allMatch = rows.every((r) => r.match === 'YES');
const out = {
  phase: 'restore_clean_replay_retrieval_artifacts',
  SHARED_RETRIEVER_SUMMARY_REQUIRED: 'NO',
  PLANT_WRITE_COUNT: plantWriteCount,
  QUEUE_WRITE_COUNT: queueWriteCount,
  externalRequests,
  cacheHits,
  batchFingerprint: BATCH_FP,
  rows,
  verdict: allMatch && plantWriteCount === 0 && queueWriteCount === 0 && externalRequests === 0
    ? 'AUTO_ENRICHMENT_WORKER_CLEAN_ARTIFACTS_RESTORED'
    : 'AUTO_ENRICHMENT_WORKER_CLEAN_ARTIFACTS_RESTORE_FAILED'
};

fs.writeFileSync(
  path.join(ROOT, 'data/catalog/enrichment-worker/clean-replay/retrieval-artifact-restore-report.json'),
  JSON.stringify(out, null, 2)
);
console.log(JSON.stringify(out, null, 2));
if (out.verdict !== 'AUTO_ENRICHMENT_WORKER_CLEAN_ARTIFACTS_RESTORED') process.exit(1);
