/**
 * CRUVIT Plant Knowledge & Warnings V1 — 60-plant enrichment gate.
 * No live write. No UI.
 *
 * Usage: node --test tests/plant-knowledge-warnings-60-enrichment.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = path.join(ROOT, 'tests/_plant-knowledge-warnings-60-enrichment-report.json');
const HANDOFF_DIR = path.join(
  ROOT,
  'data/catalog-expansion/plant-knowledge-v1/enrichment-60/handoff'
);

test('60 enrichment artifacts exist and report PASS', () => {
  for (const name of [
    'plant_knowledge_warnings_60_handoff.json',
    'plant_knowledge_warnings_60_handoff.sha256',
    'plant_knowledge_warnings_60_upsert.sql',
    'plant_knowledge_warnings_60_verify.sql'
  ]) {
    assert.ok(fs.existsSync(path.join(HANDOFF_DIR, name)), name);
  }
  assert.ok(fs.existsSync(REPORT), 'report');
  const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  assert.equal(report.verdict, 'CRUVIT_PLANT_KNOWLEDGE_WARNINGS_60_ENRICHMENT: PASS');
  assert.equal(report.plantCount, 60);
  assert.equal(report.knowledgeEvidenceTotals.SOURCE_SUPPORTED, 100);
  assert.equal(report.knowledgeEvidenceTotals.HEURISTIC_ASSERTION, 136);
  assert.equal(report.knowledgeEvidenceTotals.UNKNOWN, 405);
  assert.equal(
    report.ownerAcceptedLiveHandoffSha,
    '92ed280eddd65c50af59b443d5d7f14f40c10b15a455f778d7e2a39e178f56de'
  );
  assert.equal(report.runtimeExternalCalls, 0);
  assert.equal(report.paidApiCostUsd, 0);
  assert.equal(report.aiApiCostUsd, 0);
  assert.equal(report.batch1EvidenceRegression.pass, true);
  assert.equal(report.batch2EvidenceRegression.pass, true);
  assert.equal(report.safetyGates.confirmedSafetyClaimsFromHeuristic, 0);
  assert.equal(report.safetyGates.falseSafeFromMissingData, 0);
  assert.equal(report.safetyGates.regionalInvasiveToGlobalErrors, 0);
  assert.equal(report.nonDestructiveClimateTruthProof.ok, true);
});

test('upsert SQL is non-destructive merge', () => {
  const sql = fs.readFileSync(
    path.join(HANDOFF_DIR, 'plant_knowledge_warnings_60_upsert.sql'),
    'utf8'
  );
  assert.match(sql, /jsonb_build_object\('plantKnowledge'/);
  assert.match(sql, /COALESCE\(c\.climate_traits/);
  assert.doesNotMatch(sql, /climate_traits\s*=\s*v\.climate_traits\s*,/);
});
