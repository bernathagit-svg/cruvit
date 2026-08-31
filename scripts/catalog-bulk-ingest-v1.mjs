#!/usr/bin/env node
/**
 * CRUVIT Scalable Catalog Ingestion V1 — local dry-run / benchmark.
 * NO live Supabase write. NO Batch 3. NO commit.
 *
 * Usage:
 *   node scripts/catalog-bulk-ingest-v1.mjs
 *   node scripts/catalog-bulk-ingest-v1.mjs --benchmark
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runScalableIngestPipeline } from '../modules/catalog-ingestion/pipeline-v1.js';
import {
  buildSyntheticNewPlants,
  buildSyntheticBaseline,
  buildSyntheticKnowledgeEnrichment,
  FAILURE_MUTATORS
} from '../modules/catalog-ingestion/fixtures-v1.js';
import { runBulkPreflight } from '../modules/catalog-ingestion/preflight-v1.js';
import { buildBatchManifest, sealHandoffBytes } from '../modules/catalog-ingestion/catalog-ingestion-v1-contract.js';
import { emitAtomicBulkSql } from '../modules/catalog-ingestion/sql-emit-v1.js';
import { isMaterialEvidenceField } from './catalog-batch2-shared.mjs';
import { MODE_DEFINITIONS } from '../modules/catalog-ingestion/ingestion-modes-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'data/catalog-ingestion/v1/handoff');
const FIXTURE_DIR = path.join(ROOT, 'data/catalog-ingestion/v1/fixtures');
const REPORT_PATH = path.join(ROOT, 'tests/_catalog-scalable-ingestion-v1-report.json');

const BATCH1_HANDOFF = path.join(
  ROOT,
  'data/catalog-expansion/batches/bulk-batch-1-v1/handoff/catalog_plants_enrichment_handoff.json'
);
const BATCH2_HANDOFF = path.join(
  ROOT,
  'data/catalog-expansion/batches/bulk-batch-2-v1/handoff/catalog_plants_batch2_handoff.json'
);
const PK60_HANDOFF = path.join(
  ROOT,
  'data/catalog-expansion/plant-knowledge-v1/enrichment-60/handoff/plant_knowledge_warnings_60_handoff.json'
);

function materialInventory(rows, ctKey) {
  const counts = { SOURCE_SUPPORTED: 0, HEURISTIC_ASSERTION: 0, UNKNOWN: 0 };
  for (const r of rows) {
    const map = (r[ctKey] || r.climateTraits || r.climate_traits)?.traitEvidenceClasses || {};
    for (const [f, c] of Object.entries(map)) {
      if (isMaterialEvidenceField(f) && counts[c] != null) counts[c] += 1;
    }
  }
  return counts;
}

function knowledgeInventoryFromPk60(doc) {
  const counts = { SOURCE_SUPPORTED: 0, HEURISTIC_ASSERTION: 0, UNKNOWN: 0 };
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) return obj.forEach(walk);
    if (obj.evidenceClass && Array.isArray(obj.sourceIds)) {
      if (counts[obj.evidenceClass] != null) counts[obj.evidenceClass] += 1;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'sources') continue;
      if (k === 'warnings') {
        for (const w of v || []) {
          if (counts[w.evidenceClass] != null) counts[w.evidenceClass] += 1;
        }
        continue;
      }
      walk(v);
    }
  };
  for (const p of doc.plants || []) walk(p.plantKnowledge);
  return counts;
}

function runBenchmark(n, chunkSize = 75) {
  const plants = buildSyntheticNewPlants(n, { prefix: `synthetic-bench${n}` });
  return runScalableIngestPipeline({
    mode: 'NEW_PLANT_BATCH',
    plants,
    batchId: `synthetic-benchmark-${n}-v1`,
    liveBaseline: { slugs: new Set(), scientificNames: new Set(), checksum: null, rows: [] },
    chunkSize,
    simulate: true,
    outDir: path.join(OUT_DIR, `bench-${n}`)
  });
}

function runFailureCases() {
  const base = buildSyntheticNewPlants(5, { prefix: 'synthetic-fail' });
  const cases = [];

  const runCase = (name, plants, baselineExtra = {}) => {
    const manifest = buildBatchManifest({
      batchId: `fail-${name}`,
      mode: 'NEW_PLANT_BATCH',
      plantCount: plants.length,
      expectedSlugs: plants.map((p) => p.slug),
      generatedAt: '2026-08-31T20:00:00.000Z'
    });
    // For missing/extra plant, expectedSlugs from mutated plants may match count —
    // intentionally mismatch manifest for missingPlant/extraPlant:
    let man = manifest;
    if (name === 'missingPlant') {
      man = buildBatchManifest({
        batchId: `fail-${name}`,
        mode: 'NEW_PLANT_BATCH',
        plantCount: base.length,
        expectedSlugs: base.map((p) => p.slug),
        generatedAt: '2026-08-31T20:00:00.000Z'
      });
    }
    if (name === 'extraPlant') {
      man = buildBatchManifest({
        batchId: `fail-${name}`,
        mode: 'NEW_PLANT_BATCH',
        plantCount: base.length,
        expectedSlugs: base.map((p) => p.slug),
        generatedAt: '2026-08-31T20:00:00.000Z'
      });
    }
    const sealed = sealHandoffBytes(man, plants);
    let sqlText = null;
    try {
      sqlText = emitAtomicBulkSql({
        manifest: sealed.document.manifest,
        plants,
        contentSha256: sealed.contentSha256
      }).upsertSql;
    } catch {
      sqlText = null;
    }
    if (name === 'sqlTargetTampering') {
      sqlText = 'BEGIN;\nUPDATE public.users SET role = \'admin\';\nCOMMIT;\n';
    }
    const baseline = {
      slugs: new Set(baselineExtra.slugs || []),
      scientificNames: new Set(baselineExtra.scientificNames || []),
      checksum: null,
      recorded: true,
      rows: baselineExtra.rows || []
    };
    const preflight = runBulkPreflight({
      manifest: sealed.document.manifest,
      plants,
      liveBaseline: baseline,
      handoff: name === 'staleSha'
        ? { document: sealed.document, contentSha256: '0'.repeat(64) }
        : { document: sealed.document, contentSha256: sealed.contentSha256 },
      sqlText
    });
    cases.push({
      name,
      ok: preflight.ok,
      expectedFail: true,
      passed: preflight.ok === false,
      errors: preflight.errors.slice(0, 5)
    });
  };

  runCase('duplicateSlug', FAILURE_MUTATORS.duplicateSlug(base));
  runCase('duplicateScientific', FAILURE_MUTATORS.duplicateScientific(base));
  runCase('missingPlant', FAILURE_MUTATORS.missingPlant(base));
  runCase('extraPlant', FAILURE_MUTATORS.extraPlant(base));
  runCase('invalidEvidenceClass', FAILURE_MUTATORS.invalidEvidenceClass(base));
  runCase('missingProvenance', FAILURE_MUTATORS.missingProvenance(base));
  runCase('invalidPlantKnowledge', FAILURE_MUTATORS.invalidPlantKnowledge(base));
  runCase('unsafeWarningHeuristicConfirmed', FAILURE_MUTATORS.unsafeWarningHeuristicConfirmed(base));
  runCase('unsafeUnknownActiveWarning', FAILURE_MUTATORS.unsafeUnknownActiveWarning(base));
  runCase('existingCollision', base, { slugs: [base[0].slug], scientificNames: [base[0].scientific_name] });
  runCase('sqlTargetTampering', base);
  runCase('staleSha', base);
  runCase(
    'oneMalformedInLargeBatch',
    FAILURE_MUTATORS.oneMalformedInLargeBatch(
      buildSyntheticNewPlants(100, { prefix: 'synthetic-malformed' })
    )
  );

  // Atomic rollback: one malformed mid-batch during simulate
  const large = buildSyntheticNewPlants(100, { prefix: 'synthetic-rollback' });
  const pipeline = runScalableIngestPipeline({
    mode: 'NEW_PLANT_BATCH',
    plants: large,
    batchId: 'synthetic-rollback-100',
    liveBaseline: { slugs: new Set(), scientificNames: new Set(), rows: [], recorded: true },
    simulate: true,
    injectFailure: `plant:${large[50].slug}`
  });
  cases.push({
    name: 'atomicRollbackOnMidBatchFailure',
    ok: pipeline.simulation?.ok,
    expectedFail: true,
    passed: pipeline.simulation?.ok === false && pipeline.simulation?.rolledBack === true,
    errors: [pipeline.simulation?.reason].filter(Boolean)
  });

  return cases;
}

function existing60Regression() {
  const b1 = JSON.parse(fs.readFileSync(BATCH1_HANDOFF, 'utf8'));
  const b2 = JSON.parse(fs.readFileSync(BATCH2_HANDOFF, 'utf8'));
  const pk = JSON.parse(fs.readFileSync(PK60_HANDOFF, 'utf8'));
  const b1Inv = materialInventory(b1.rows || [], 'climateTraits');
  const b2Inv = materialInventory(b2.plants || b2.rows || [], 'climate_traits');
  const pkInv = knowledgeInventoryFromPk60(pk);
  const expectedB1 = { SOURCE_SUPPORTED: 189, HEURISTIC_ASSERTION: 125, UNKNOWN: 11 };
  const expectedB2 = { SOURCE_SUPPORTED: 248, HEURISTIC_ASSERTION: 71, UNKNOWN: 25 };
  const expectedPk = { SOURCE_SUPPORTED: 100, HEURISTIC_ASSERTION: 136, UNKNOWN: 405 };

  const climate = spawnSync(
    process.execPath,
    [path.join(ROOT, 'scripts/plant-climate-v2-integration-gate.mjs')],
    { encoding: 'utf8', cwd: ROOT }
  );
  let climateJson = null;
  try {
    const t = (climate.stdout || '').trim();
    climateJson = JSON.parse(t.slice(t.lastIndexOf('{')));
  } catch {
    climateJson = null;
  }

  const eq = (a, b) =>
    a.SOURCE_SUPPORTED === b.SOURCE_SUPPORTED &&
    a.HEURISTIC_ASSERTION === b.HEURISTIC_ASSERTION &&
    a.UNKNOWN === b.UNKNOWN;

  return {
    batch1: { actual: b1Inv, expected: expectedB1, pass: eq(b1Inv, expectedB1) },
    batch2: { actual: b2Inv, expected: expectedB2, pass: eq(b2Inv, expectedB2) },
    plantKnowledge: { actual: pkInv, expected: expectedPk, pass: eq(pkInv, expectedPk) },
    plantClimateV2: {
      materialFp: climateJson?.materialFp ?? null,
      materialFn: climateJson?.materialFn ?? null,
      heuristicDependentConfident:
        climateJson?.heuristicDependentConfident ??
        climateJson?.confidentHeuristicDeps ??
        (climateJson?.confidentHeuristicExamples || []).length,
      verdict: climateJson?.hardeningVerdict || climateJson?.integrationVerdict || null,
      pass:
        climateJson?.materialFp === 0 &&
        climateJson?.materialFn === 0
    }
  };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });

  const bench30 = runBenchmark(30);
  const bench100 = runBenchmark(100);
  const bench300 = runBenchmark(300);

  // Knowledge enrichment path on synthetic baseline
  const baseline = buildSyntheticBaseline(30, { prefix: 'synthetic-know-base' });
  const enrichPlants = buildSyntheticKnowledgeEnrichment(baseline);
  const knowledgeRun = runScalableIngestPipeline({
    mode: 'KNOWLEDGE_ENRICHMENT',
    plants: enrichPlants,
    batchId: 'synthetic-knowledge-enrich-30',
    liveBaseline: {
      slugs: new Set(baseline.map((p) => p.slug)),
      scientificNames: new Set(baseline.map((p) => p.scientific_name)),
      rows: baseline,
      recorded: true
    },
    simulate: true,
    outDir: path.join(OUT_DIR, 'knowledge-enrich-30')
  });

  fs.writeFileSync(
    path.join(FIXTURE_DIR, 'synthetic-new-30.json'),
    JSON.stringify(buildSyntheticNewPlants(30), null, 2) + '\n'
  );

  const failures = runFailureCases();
  const failurePass = failures.every((f) => f.passed);
  const regression = existing60Regression();

  const blockers = [];
  if (!bench30.ok) blockers.push('30-plant benchmark failed');
  if (!bench100.ok) blockers.push('100-plant benchmark failed');
  if (!bench300.ok) blockers.push('300-plant benchmark failed');
  if (!knowledgeRun.ok) blockers.push('knowledge enrichment simulation failed');
  if (!failurePass) blockers.push('one or more failure cases did not fail safely');
  if (!regression.batch1.pass) blockers.push('Batch 1 evidence regression');
  if (!regression.batch2.pass) blockers.push('Batch 2 evidence regression');
  if (!regression.plantKnowledge.pass) blockers.push('Plant Knowledge 60 inventory regression');
  if (!regression.plantClimateV2.pass) blockers.push('Plant Climate V2 regression');

  const report = {
    generatedAt: new Date().toISOString(),
    contractVersion: '1.0.0',
    liveWrite: false,
    batch3Started: false,
    architecture: {
      sequence: bench30.sequence,
      chunkingStrategy: bench30.chunkingStrategy,
      modes: Object.keys(MODE_DEFINITIONS),
      atomicity: 'SINGLE_TRANSACTION_MULTI_CHUNK — ALL succeed or ROLLBACK',
      collisionDefault: 'NEW_PLANT_BATCH blocks existing slug/scientific',
      dbCallModel: 'O(chunks) statements per batch, one transaction'
    },
    benchmarks: {
      plants30: summarizeBench(bench30, 30),
      plants100: summarizeBench(bench100, 100),
      plants300: summarizeBench(bench300, 300)
    },
    knowledgeEnrichmentSimulation: {
      ok: knowledgeRun.ok,
      preflight: knowledgeRun.preflight?.verdict,
      simulationRolledBack: knowledgeRun.simulation?.rolledBack,
      checksumPreserved:
        knowledgeRun.simulation?.preChecksum ===
        knowledgeRun.simulation?.postChecksumExcludingKnowledge
    },
    safetyFailureTests: failures,
    safetyFailureAllBlocked: failurePass,
    existing60Regression: regression,
    remainingScalabilityLimits: [
      'Owner still applies SQL handoff manually (no live agent write)',
      'Chunk size tunable; very large JSONB rows may hit Postgres parameter/packet limits — reduce chunkSize',
      'Multi-region / concurrent writers not in V1',
      'Strategy B (chunk compensation across connections) not implemented — V1 uses Strategy A only',
      'Synthetic fixtures are non-production and must not be upserted live'
    ],
    readyForBatch3: blockers.length === 0,
    readyForBatch3Note:
      blockers.length === 0
        ? 'Architecture ready for Batch 3 to consume this pipeline; Batch 3 plant research/content not started.'
        : 'Not ready until blockers cleared.',
    filesChanged: [
      'modules/catalog-ingestion/catalog-ingestion-v1-contract.js',
      'modules/catalog-ingestion/ingestion-modes-v1.js',
      'modules/catalog-ingestion/preflight-v1.js',
      'modules/catalog-ingestion/sql-emit-v1.js',
      'modules/catalog-ingestion/simulate-v1.js',
      'modules/catalog-ingestion/fixtures-v1.js',
      'modules/catalog-ingestion/pipeline-v1.js',
      'scripts/catalog-bulk-ingest-v1.mjs',
      'tests/catalog-scalable-ingestion-v1.test.mjs',
      'tests/_catalog-scalable-ingestion-v1-report.json',
      'data/catalog-ingestion/v1/fixtures/',
      'data/catalog-ingestion/v1/handoff/'
    ],
    blockers,
    verdict:
      blockers.length === 0
        ? 'CRUVIT_SCALABLE_CATALOG_INGESTION_V1: PASS'
        : 'CRUVIT_SCALABLE_CATALOG_INGESTION_V1: FAIL'
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        benchmarks: report.benchmarks,
        safetyFailureAllBlocked: report.safetyFailureAllBlocked,
        existing60Regression: report.existing60Regression,
        readyForBatch3: report.readyForBatch3,
        blockers: report.blockers
      },
      null,
      2
    )
  );
  process.exit(blockers.length === 0 ? 0 : 1);
}

function summarizeBench(result, n) {
  return {
    plantCount: n,
    ok: result.ok,
    preflight: result.preflight?.verdict,
    timingsMs: result.timingsMs,
    payloadBytes: result.sql?.payloadBytes,
    upsertBytes: result.sql?.upsertBytes,
    chunkCount: result.sql?.chunkCount,
    dbExecutionCalls: result.estimateDbExecutionCalls,
    contentSha256: result.contentSha256
  };
}

main();
