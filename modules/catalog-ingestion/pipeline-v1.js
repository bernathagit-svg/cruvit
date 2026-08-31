/**
 * Orchestrator for Scalable Catalog Ingestion V1 (local / dry-run).
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildBatchManifest,
  sealHandoffBytes,
  estimateDbExecutionCalls,
  CATALOG_INGESTION_CONTRACT_VERSION,
  SCALABLE_INGESTION_SEQUENCE,
  CHUNKING_STRATEGY_V1
} from './catalog-ingestion-v1-contract.js';
import { resolveIngestionMode } from './ingestion-modes-v1.js';
import { runBulkPreflight } from './preflight-v1.js';
import { emitAtomicBulkSql } from './sql-emit-v1.js';
import {
  createSimulatedCatalog,
  simulateAtomicBulkApply
} from './simulate-v1.js';

/**
 * Run full local pipeline: manifest → seal → preflight → SQL emit → optional simulate.
 */
export function runScalableIngestPipeline({
  mode,
  plants,
  batchId,
  liveBaseline = null,
  updateAuthorized = false,
  expectedEvidenceInventory = null,
  expectedKnowledgeInventory = null,
  chunkSize,
  simulate = true,
  injectFailure = null,
  outDir = null,
  generatedAt = '2026-08-31T20:00:00.000Z'
} = {}) {
  const started = performance.now();
  const modeRes = resolveIngestionMode(mode);
  if (!modeRes.ok) {
    return { ok: false, verdict: 'CRUVIT_SCALABLE_CATALOG_INGESTION_V1: FAIL', errors: [modeRes.error] };
  }

  const tManifest = performance.now();
  const manifest = buildBatchManifest({
    batchId,
    mode,
    generatedAt,
    plantCount: plants.length,
    expectedSlugs: plants.map((p) => p.slug),
    expectedEvidenceInventory,
    expectedKnowledgeInventory,
    chunkSize,
    updateAuthorized,
    contractVersions: { catalogIngestion: CATALOG_INGESTION_CONTRACT_VERSION }
  });
  const manifestMs = performance.now() - tManifest;

  const tSeal = performance.now();
  const sealed = sealHandoffBytes(manifest, plants);
  const sealMs = performance.now() - tSeal;

  const tSql = performance.now();
  const sql = emitAtomicBulkSql({
    manifest: sealed.document.manifest,
    plants,
    contentSha256: sealed.contentSha256,
    chunkSize: manifest.chunkSize
  });
  const sqlMs = performance.now() - tSql;

  const tPre = performance.now();
  const preflight = runBulkPreflight({
    manifest: sealed.document.manifest,
    plants,
    liveBaseline,
    handoff: { document: sealed.document, contentSha256: sealed.contentSha256 },
    sqlText: sql.upsertSql
  });
  const preflightMs = performance.now() - tPre;

  let simulation = null;
  if (simulate) {
    const catalog = createSimulatedCatalog(
      liveBaseline?.rows ||
        (liveBaseline?.slugs
          ? [...liveBaseline.slugs].map((slug) => ({
              slug,
              scientific_name: `Baseline ${slug}`,
              climate_traits: {},
              media_status: 'IMAGE_PENDING'
            }))
          : [])
    );
    // If baseline rows provided with full objects:
    if (Array.isArray(liveBaseline?.rows)) {
      // already loaded
    }
    simulation = simulateAtomicBulkApply({
      catalog,
      manifest: sealed.document.manifest,
      plants,
      preflightOk: preflight.ok,
      injectFailure,
      chunkSize: manifest.chunkSize
    });
  }

  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'handoff.json'), sealed.fileRaw);
    fs.writeFileSync(
      path.join(outDir, 'handoff.sha256'),
      `${sealed.fileSha256}  handoff.json\n`
    );
    fs.writeFileSync(path.join(outDir, 'upsert.sql'), sql.upsertSql);
    fs.writeFileSync(path.join(outDir, 'verify.sql'), sql.verifySql);
  }

  const ok = preflight.ok && (!simulate || simulation?.ok);
  return {
    ok,
    verdict: ok
      ? 'CRUVIT_SCALABLE_CATALOG_INGESTION_V1: PASS'
      : 'CRUVIT_SCALABLE_CATALOG_INGESTION_V1: FAIL',
    contractVersion: CATALOG_INGESTION_CONTRACT_VERSION,
    sequence: SCALABLE_INGESTION_SEQUENCE,
    chunkingStrategy: CHUNKING_STRATEGY_V1,
    manifest: sealed.document.manifest,
    contentSha256: sealed.contentSha256,
    fileSha256: sealed.fileSha256,
    preflight,
    sql: {
      chunkCount: sql.chunkCount,
      payloadBytes: sql.payloadBytes,
      dbExecutionCalls: sql.dbExecutionCalls,
      upsertBytes: Buffer.byteLength(sql.upsertSql, 'utf8'),
      verifyBytes: Buffer.byteLength(sql.verifySql, 'utf8')
    },
    simulation,
    timingsMs: {
      manifest: round(manifestMs),
      seal: round(sealMs),
      validationPreflight: round(preflightMs),
      sqlGeneration: round(sqlMs),
      total: round(performance.now() - started)
    },
    estimateDbExecutionCalls: estimateDbExecutionCalls(plants.length, manifest.chunkSize)
  };
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}
