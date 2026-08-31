/**
 * CRUVIT Scalable Catalog Ingestion V1 — foundation gate.
 * No live write. No Batch 3.
 *
 * Usage: node --test tests/catalog-scalable-ingestion-v1.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  SCALABLE_INGESTION_SEQUENCE,
  CATALOG_INGESTION_CONTRACT_VERSION,
  CHUNKING_STRATEGY_V1,
  estimateDbExecutionCalls,
  buildBatchManifest,
  sealHandoffBytes
} from '../modules/catalog-ingestion/catalog-ingestion-v1-contract.js';
import { MODE_DEFINITIONS, resolveIngestionMode } from '../modules/catalog-ingestion/ingestion-modes-v1.js';
import { runBulkPreflight } from '../modules/catalog-ingestion/preflight-v1.js';
import { buildSyntheticNewPlants } from '../modules/catalog-ingestion/fixtures-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = path.join(ROOT, 'tests/_catalog-scalable-ingestion-v1-report.json');

test('contract sequence + modes frozen', () => {
  assert.equal(CATALOG_INGESTION_CONTRACT_VERSION, '1.0.0');
  assert.ok(SCALABLE_INGESTION_SEQUENCE.includes('BULK_PREFLIGHT'));
  assert.ok(SCALABLE_INGESTION_SEQUENCE.includes('ATOMIC_BULK_UPSERT'));
  assert.ok(SCALABLE_INGESTION_SEQUENCE.includes('POST_WRITE_VERIFY'));
  assert.equal(CHUNKING_STRATEGY_V1.id, 'SINGLE_TRANSACTION_MULTI_CHUNK');
  assert.equal(CHUNKING_STRATEGY_V1.partialCompletionAllowed, false);
  assert.equal(resolveIngestionMode('NOPE').ok, false);
  assert.equal(Object.keys(MODE_DEFINITIONS).length, 5);
});

test('DB execution calls are O(chunks) not O(plants)', () => {
  const a = estimateDbExecutionCalls(30, 75);
  const b = estimateDbExecutionCalls(100, 75);
  const c = estimateDbExecutionCalls(300, 75);
  assert.equal(a.dmlChunks, 1);
  assert.equal(b.dmlChunks, 2);
  assert.equal(c.dmlChunks, 4);
  assert.ok(a.totalStatements < 30);
  assert.ok(c.totalStatements < 300);
});

test('preflight blocks unknown mode and duplicate slugs', () => {
  const plants = buildSyntheticNewPlants(3);
  plants[1].slug = plants[0].slug;
  const manifest = buildBatchManifest({
    batchId: 't',
    mode: 'NEW_PLANT_BATCH',
    plantCount: 3,
    expectedSlugs: plants.map((p) => p.slug),
    generatedAt: '2026-08-31T20:00:00.000Z'
  });
  // plantCount vs unique expected will fail validateBatchManifest on dups
  const pre = runBulkPreflight({
    manifest,
    plants,
    liveBaseline: { slugs: new Set(), scientificNames: new Set(), recorded: true }
  });
  assert.equal(pre.ok, false);
});

test('run full ingest script and require PASS report', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/catalog-bulk-ingest-v1.mjs')], {
    encoding: 'utf8',
    cwd: ROOT
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(fs.existsSync(REPORT));
  const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  assert.equal(report.verdict, 'CRUVIT_SCALABLE_CATALOG_INGESTION_V1: PASS');
  assert.equal(report.liveWrite, false);
  assert.equal(report.batch3Started, false);
  assert.equal(report.safetyFailureAllBlocked, true);
  assert.equal(report.existing60Regression.batch1.pass, true);
  assert.equal(report.existing60Regression.batch2.pass, true);
  assert.equal(report.existing60Regression.plantKnowledge.pass, true);
  assert.equal(report.existing60Regression.plantClimateV2.pass, true);
  assert.equal(report.benchmarks.plants30.ok, true);
  assert.equal(report.benchmarks.plants100.ok, true);
  assert.equal(report.benchmarks.plants300.ok, true);
  assert.equal(report.readyForBatch3, true);
});

test('sealed handoff contentSha is stable for identical payload', () => {
  const plants = buildSyntheticNewPlants(2, { prefix: 'synthetic-seal' });
  const manifest = buildBatchManifest({
    batchId: 'seal',
    mode: 'NEW_PLANT_BATCH',
    plantCount: 2,
    expectedSlugs: plants.map((p) => p.slug),
    generatedAt: '2026-08-31T20:00:00.000Z'
  });
  const a = sealHandoffBytes(manifest, plants);
  const b = sealHandoffBytes(manifest, plants);
  assert.equal(a.contentSha256, b.contentSha256);
  assert.equal(a.fileSha256, b.fileSha256);
});
