/**
 * Tree size evidence wave V1. Zero spend. Overlay only. No production write.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HELD_GENUS, HELD_MULTI_FORM, WAVE_NEW_TAXA } from '../modules/garden-design/asset-factory-v1/tree-size-evidence-wave-v1-records.js';
import {
  buildWaveSummary,
  writeTreeSizeEvidenceWaveReports
} from '../modules/garden-design/asset-factory-v1/tree-size-evidence-wave-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

test('wave accounts for 41 unique taxa and researches orange once', () => {
  assert.equal(WAVE_NEW_TAXA.length, 34);
  assert.equal(WAVE_NEW_TAXA.includes('citrus-sinensis'), true);
  assert.equal(WAVE_NEW_TAXA.includes('orange'), false);
  assert.equal(WAVE_NEW_TAXA.includes('sweet-orange'), false);
  const written = writeTreeSizeEvidenceWaveReports(ROOT);
  const summary = JSON.parse(fs.readFileSync(written.summaryPath, 'utf8'));
  const evidence = JSON.parse(fs.readFileSync(written.evidencePath, 'utf8'));
  assert.equal(summary.verdict, 'TREE_SIZE_EVIDENCE_WAVE_V1_PASS');
  assert.equal(summary.accounting.TOTAL_UNIQUE_TREE_TAXA_DOMAIN, 41);
  assert.equal(summary.accounting.PILOT_TAXA_REUSED, 7);
  assert.equal(summary.accounting.NEW_TAXA_RESEARCHED, 34);
  assert.equal(summary.duplicateOrangeResearchedOnce, true);
  assert.equal(summary.productionCatalogWritten, false);
  assert.equal(summary.inventedBotanicalValues, false);
  assert.equal(summary.multiFormOrGenusHoldsEnriched, false);
  const citrus = evidence.records.filter((row) => row.botanicalTaxonId === 'taxon:citrus-sinensis' && row.evidenceClass === 'SOURCE_SUPPORTED_RANGE');
  assert.equal(citrus.length, 1);
  assert.deepEqual(citrus[0].canonicalAliases, ['orange', 'sweet-orange']);
  assert.ok(!evidence.records.some((row) => HELD_MULTI_FORM.includes(row.canonicalSlug)));
  assert.ok(!evidence.records.some((row) => HELD_GENUS.includes(row.canonicalSlug)));
  assert.equal(summary.spend.additionalSpendUsd, 0);
  assert.equal(buildWaveSummary().uniqueTaxaAccounted, 41);
});
