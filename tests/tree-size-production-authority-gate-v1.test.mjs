/**
 * Tree size production authority gate V1. Overlay only. No new sourcing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { selectSameSourceStructuredDimensionsRecord } from '../modules/garden-design/asset-factory-v1/tree-size-source-precedence-v1.js';
import {
  CONFLICT_REVIEW_FROM_EXISTING_EVIDENCE,
  RUNTIME_AUTHORITY,
  buildAuthorityGateSummary,
  buildRuntimeAuthorityRecords,
  slugToBotanicalTaxonId,
  writeTreeSizeProductionAuthorityGateReports
} from '../modules/garden-design/asset-factory-v1/tree-size-production-authority-gate-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('runtime authority buckets are exclusive for 41 taxa and full-size does not override conflict', () => {
  const written = writeTreeSizeProductionAuthorityGateReports(ROOT);
  const summary = JSON.parse(fs.readFileSync(written.summaryPath, 'utf8'));
  const records = buildRuntimeAuthorityRecords();
  assert.equal(summary.verdict, 'TREE_SIZE_PRODUCTION_AUTHORITY_GATE_V1_PASS');
  assert.equal(records.length, 41);
  assert.equal(new Set(records.map((row) => row.botanicalTaxonId)).size, 41);
  const counts = Object.values(RUNTIME_AUTHORITY).map((code) => records.filter((row) => row.runtimeAuthority === code).length);
  assert.equal(counts.reduce((sum, n) => sum + n, 0), 41);
  const cypress = records.find((row) => row.canonicalSlug === 'cypress');
  const magnolia = records.find((row) => row.canonicalSlug === 'southern-magnolia');
  assert.equal(cypress.FULL_SIZE_READY, true);
  assert.equal(cypress.runtimeAuthority, RUNTIME_AUTHORITY.CONFLICT_HOLD);
  assert.equal(magnolia.FULL_SIZE_READY, true);
  assert.equal(magnolia.runtimeAuthority, RUNTIME_AUTHORITY.READY);
  assert.equal(magnolia.conflictReviewOutcome, 'STRUCTURED_DIMENSIONS_PRECEDENCE');
  assert.equal(summary.structuredSameSourcePrecedenceApplied, true);
  const map = slugToBotanicalTaxonId();
  assert.equal(map.orange, 'taxon:citrus-sinensis');
  assert.equal(map['sweet-orange'], 'taxon:citrus-sinensis');
  assert.equal(records.filter((row) => row.botanicalTaxonId === 'taxon:citrus-sinensis').length, 1);
  assert.equal(summary.RUNTIME_AUTHORITY_EVIDENCE_GAP.count, 7);
  assert.equal(summary.newBotanicalSourcing, 0);
  assert.equal(summary.productionRuntimeChanged, false);
  assert.equal(summary.productionCatalogChanged, false);
  assert.equal(summary.writeAuthorityRegistryNow, false);
  assert.ok(CONFLICT_REVIEW_FROM_EXISTING_EVIDENCE.every((row) => row.newSourcing === 0 && row.averaged === false));
  assert.equal(buildAuthorityGateSummary().spend.imageGeneration, 0);
});


test('same-source structured Dimensions outrank prose only under strict matching conditions', () => {
  const structured={
    evidenceClass:'SOURCE_SUPPORTED_RANGE',
    sourceUrl:'https://example.edu/tree',
    sourceIdentifier:'same',
    heightMinM:18.288,heightMaxM:24.384,
    spreadMinM:9.144,spreadMaxM:15.24,
    originalSourceWording:'Dimensions: Height: 60 ft. 0 in. - 80 ft. 0 in. Width: 30 ft. 0 in. - 50 ft. 0 in.'
  };
  const prose={
    ...structured,
    spreadMinM:6.096,spreadMaxM:12.192,
    originalSourceWording:'It typically grows to 60 to 80 feet tall with a spread of 20 to 40 feet wide.'
  };
  assert.equal(selectSameSourceStructuredDimensionsRecord([structured,prose]),structured);

  const otherSource={...prose,sourceUrl:'https://other.edu/tree',sourceIdentifier:'other'};
  assert.equal(selectSameSourceStructuredDimensionsRecord([structured,otherSource]),null);

  const differentHeight={...prose,heightMinM:15,heightMaxM:22};
  assert.equal(selectSameSourceStructuredDimensionsRecord([structured,differentHeight]),null);
});
