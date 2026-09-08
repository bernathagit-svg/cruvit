/**
 * Batch 3 contradiction-gate dry run (read-only).
 * Writes audit artifacts only — does not ingest or mutate packets/catalog.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateBatch3ContradictionDry } from '../modules/personal-domain/catalog-contradiction-gate-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packetDir = path.join(
  root,
  'data',
  'catalog-expansion',
  'batches',
  'bulk-batch-3-v1',
  'packets'
);
const outDir = path.join(root, 'data', 'catalog', 'enrichment-queue');
const packets = fs
  .readdirSync(packetDir)
  .filter((f) => f.endsWith('.packet.json'))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(packetDir, f), 'utf8')));

const dry = evaluateBatch3ContradictionDry(packets);
const summary = {
  gateRef: dry.gateRef,
  sourcePolicyRef: dry.sourcePolicyRef,
  dryRun: true,
  ingested: false,
  generatedAt: new Date().toISOString(),
  parentCommit: '7d64e0d33c823e9bf8db355d76fd2bcf53d3a260',
  totals: dry.totals,
  fieldsMostOftenConflicting: dry.fieldsMostOftenConflicting,
  packetsNeedingHold: dry.packetsNeedingHold,
  packetsSafeForAutoNormalizationCount: dry.packetsSafeForAutoNormalization.length,
  note: dry.note
};

fs.mkdirSync(outDir, { recursive: true });
const summaryPath = path.join(outDir, 'batch3-contradiction-gate-dry-summary-v1.json');
const fullPath = path.join(outDir, 'batch3-contradiction-gate-dry-v1.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
fs.writeFileSync(
  fullPath,
  JSON.stringify({ ...dry, generatedAt: summary.generatedAt, parentCommit: summary.parentCommit }, null, 2)
);

console.log(JSON.stringify({ ok: true, summaryPath, fullPath, totals: dry.totals, fieldsMostOftenConflicting: dry.fieldsMostOftenConflicting.slice(0, 10) }, null, 2));
