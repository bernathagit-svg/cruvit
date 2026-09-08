/**
 * Batch 3 source-policy dry evaluation (read-only).
 * Writes report artifact only — does not ingest or mutate packets/catalog.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateBatch3PacketsSourcePolicyDry } from '../modules/personal-domain/catalog-source-policy-v1.js';

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

const dry = evaluateBatch3PacketsSourcePolicyDry(packets);
const summary = {
  policyRef: dry.policyRef,
  dryRun: true,
  ingested: false,
  generatedAt: new Date().toISOString(),
  parentCommit: 'f9b347ead8559220fe21e6f670885f95f8db8d17',
  totals: dry.totals,
  unsupportedSourceTypeLabels: dry.unsupportedSourceTypeLabels,
  sampleViolations: dry.packetReports
    .flatMap((p) => p.violations.map((v) => ({ slug: p.slug, ...v })))
    .slice(0, 40),
  note: dry.note
};

fs.mkdirSync(outDir, { recursive: true });
const summaryPath = path.join(outDir, 'batch3-source-policy-dry-summary-v1.json');
const fullPath = path.join(outDir, 'batch3-source-policy-dry-v1.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
fs.writeFileSync(
  fullPath,
  JSON.stringify(
    {
      ...dry,
      generatedAt: summary.generatedAt,
      parentCommit: summary.parentCommit,
      // Keep full packet rows but omit huge duplication in console
      packetReports: dry.packetReports.map((p) => ({
        packetId: p.packetId,
        slug: p.slug,
        scientific: p.scientific,
        claimCount: p.claimCount,
        counts: p.counts,
        unsupportedSourceTypeLabels: p.unsupportedSourceTypeLabels,
        violations: p.violations,
        // compact row stats only
        eligibleFields: p.rows.filter((r) => r.mayBeSourceSupported).map((r) => r.field),
        holdFields: p.rows.filter((r) => r.hold).map((r) => r.field)
      }))
    },
    null,
    2
  )
);

console.log(
  JSON.stringify(
    {
      ok: true,
      summaryPath,
      fullPath,
      totals: dry.totals,
      unsupportedSourceTypeLabels: dry.unsupportedSourceTypeLabels,
      violationCount: summary.sampleViolations.length
    },
    null,
    2
  )
);
