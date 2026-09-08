/**
 * Generate durable enrichment gap queue artifacts (read-only scan).
 * Does not mutate catalog, fetch sources, or ingest Batch 3.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyAllBootstrapStructuralClimateTraitsMigrations
} from '../modules/personal-domain/bootstrap-safe-climate-traits-migration-v1.js';
import {
  buildCurrentCatalogEnrichmentQueue,
  buildBatch3DryEnrichmentQueue,
  queueLogicalFingerprint
} from '../modules/personal-domain/enrichment-gap-scanner-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARENT = 'b6b4efa63533713c5d17988e0c0b6cf17ef6edc9';

function loadCurrentCatalogPlants() {
  const app = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  const libStart = app.indexOf('const PLANT_LIBRARY=[');
  const libEnd = app.indexOf('\n];', libStart);
  const block = app.slice(libStart, libEnd);
  const unique = [];
  const seen = new Set();
  for (const part of block.split(/\{slug:'/).slice(1)) {
    const chunk = "{slug:'" + part;
    const lineEnd = chunk.indexOf('\n');
    const one = lineEnd > 0 ? chunk.slice(0, lineEnd) : chunk;
    const slug = (one.match(/slug:'([^']+)'/) || [])[1];
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const name = ((one.match(/name:'((?:\\'|[^'])*)'/) || [])[1] || slug).replace(/\\'/g, "'");
    const scientific = ((one.match(/scientific:'((?:\\'|[^'])*)'/) || [])[1] || '').replace(
      /\\'/g,
      "'"
    );
    unique.push({ slug, name, scientific });
  }
  const index = Object.fromEntries(unique.map((p) => [p.slug, { ...p }]));
  applyAllBootstrapStructuralClimateTraitsMigrations(Object.values(index), index);
  const seedRaw = JSON.parse(
    fs.readFileSync(path.join(root, 'data', 'plants.seed.json'), 'utf8').replace(/^\uFEFF/, '')
  );
  const seed = Array.isArray(seedRaw) ? seedRaw : seedRaw.plants || [];
  const bySlug = new Map(Object.values(index).map((p) => [p.slug, p]));
  for (const p of seed) {
    const s = String(p.slug || '').toLowerCase();
    if (s && !bySlug.has(s)) bySlug.set(s, p);
  }
  return [...bySlug.values()];
}

function loadBatch3Packets() {
  const dir = path.join(
    root,
    'data',
    'catalog-expansion',
    'batches',
    'bulk-batch-3-v1',
    'packets'
  );
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.packet.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

const generatedAt = new Date().toISOString();
const plants = loadCurrentCatalogPlants();
const queue = buildCurrentCatalogEnrichmentQueue(plants, {
  generatedAt,
  parentCommit: PARENT
});

const outDir = path.join(root, 'data', 'catalog', 'enrichment-queue');
fs.mkdirSync(outDir, { recursive: true });
const queuePath = path.join(outDir, 'current-catalog-enrichment-queue-v1.json');
const summaryPath = path.join(outDir, 'current-catalog-enrichment-summary-v1.json');

const summaryDoc = {
  summaryId: 'current-catalog-enrichment-summary-v1',
  queueContractVersion: queue.queueContractVersion,
  scannerVersion: queue.scannerVersion,
  generatedAt,
  parentCommit: PARENT,
  catalogSnapshot: queue.catalogSnapshot,
  summary: queue.summary,
  note: queue.note
};

fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
fs.writeFileSync(summaryPath, JSON.stringify(summaryDoc, null, 2));

// Idempotence check (same catalog → same logical fingerprint)
const queue2 = buildCurrentCatalogEnrichmentQueue(plants, {
  generatedAt: '1970-01-01T00:00:00.000Z',
  parentCommit: PARENT
});
const fp1 = queueLogicalFingerprint(queue);
const fp2 = queueLogicalFingerprint(queue2);

const packets = loadBatch3Packets();
let batch3Path = null;
let batch3Summary = null;
if (packets.length) {
  const batch3 = buildBatch3DryEnrichmentQueue(packets, {
    generatedAt,
    parentCommit: PARENT
  });
  batch3Path = path.join(outDir, 'batch3-dry-enrichment-queue-v1.json');
  fs.writeFileSync(batch3Path, JSON.stringify(batch3, null, 2));
  batch3Summary = {
    packetCount: batch3.packetCount,
    counts: batch3.catalogSnapshot.counts,
    gates: batch3.catalogSnapshot.gates,
    summary: batch3.summary
  };
}

console.log(
  JSON.stringify(
    {
      ok: true,
      queuePath,
      summaryPath,
      batch3Path,
      jobCount: queue.jobs.length,
      catalog: queue.catalogSnapshot,
      summary: queue.summary,
      idempotent: fp1 === fp2,
      batch3Summary
    },
    null,
    2
  )
);
