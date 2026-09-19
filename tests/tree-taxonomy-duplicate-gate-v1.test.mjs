/**
 * Tree taxonomy + duplicate identity gate V1. Zero spend. No catalog merge. No mass enrichment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TREE_SIZE_EVIDENCE_ELIGIBLE } from '../modules/garden-design/asset-factory-v1/multi-form-plant-architecture-v1.js';
import { PILOT_EVIDENCE_RECORDS } from '../modules/garden-design/asset-factory-v1/botanical-size-evidence-pilot-v1.js';
import {
  ORANGE_DUPLICATE_DECISION,
  SIZE_READINESS,
  TAXONOMY_ACTIONS,
  auditTreeTaxonomyDuplicates,
  classifySizeReadiness,
  normalizeScientificIdentity,
  writeTreeTaxonomyDuplicateGateReports
} from '../modules/garden-design/asset-factory-v1/tree-taxonomy-duplicate-gate-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

test('scientific normalization matches hybrid marker without rewriting production names', () => {
  const a = normalizeScientificIdentity('Citrus sinensis');
  const b = normalizeScientificIdentity('Citrus × sinensis');
  const c = normalizeScientificIdentity('Citrus x sinensis');
  assert.equal(a.matchingKey, b.matchingKey);
  assert.equal(b.matchingKey, c.matchingKey);
  assert.equal(a.authorFreeBinomial, 'Citrus sinensis');
  assert.equal(b.productionNameRewritten, false);
  assert.equal(b.hybridMarkerPresent, true);
});

test('blue-gum is height-ready only and not full-size ready', () => {
  const blue = PILOT_EVIDENCE_RECORDS.filter((row) => row.canonicalSlug === 'blue-gum');
  const ready = classifySizeReadiness(blue, { sizeScenario: 'NATURAL_MATURE' });
  assert.equal(ready.HEIGHT_SCALE_READY, true);
  assert.equal(ready.SPREAD_SCALE_READY, false);
  assert.equal(ready.FULL_SIZE_READY, false);
  assert.equal(ready.physicalScaleReadyBooleanForbidden, true);
  assert.ok(SIZE_READINESS.HEIGHT_SCALE_READY);
});

test('orange and sweet-orange are the same taxon and must not enrich twice', () => {
  const written = writeTreeTaxonomyDuplicateGateReports(ROOT);
  const report = auditTreeTaxonomyDuplicates(ROOT);
  assert.equal(ORANGE_DUPLICATE_DECISION.enrichIndependently, false);
  assert.equal(ORANGE_DUPLICATE_DECISION.mergedNow, false);
  assert.equal(ORANGE_DUPLICATE_DECISION.classes.includes('A'), true);
  const orange = report.records.find((row) => row.canonicalSlug === 'orange');
  const sweet = report.records.find((row) => row.canonicalSlug === 'sweet-orange');
  assert.equal(orange.normalizedScientificIdentity.matchingKey, sweet.normalizedScientificIdentity.matchingKey);
  assert.equal(orange.action, TAXONOMY_ACTIONS.MERGE_CANDIDATE);
  assert.equal(sweet.action, TAXONOMY_ACTIONS.MERGE_CANDIDATE);
  assert.equal(report.massEnrichmentEligibility.ALIAS_OR_DUPLICATE_HOLD.slugs.includes('orange'), true);
  assert.equal(report.massEnrichmentEligibility.UNIQUE_TREE_TAXA_READY_FOR_SIZE_ENRICHMENT.slugs.includes('orange'), false);
  assert.equal(report.massSizeEnrichmentStarted, false);
  assert.equal(report.productionCatalogMutated, false);
  assert.equal(report.records.length, TREE_SIZE_EVIDENCE_ELIGIBLE.length);
  assert.equal(JSON.parse(fs.readFileSync(written.orangePath, 'utf8')).enrichIndependently, false);
  assert.equal(written.spend.additionalSpendUsd, 0);
});

test('pilot conflicts are classified without averaging', () => {
  const report = auditTreeTaxonomyDuplicates(ROOT);
  const bySlug = Object.fromEntries(report.pilotConflictClassification.map((row) => [row.canonicalSlug, row]));
  assert.equal(bySlug['blue-gum'].classification, 'CONTEXT_EXPLAINED');
  assert.equal(bySlug.cypress.classification, 'TRUE_SOURCE_CONFLICT');
  assert.equal(bySlug.apple.classification, 'CONTEXT_EXPLAINED');
  assert.equal(bySlug['japanese-maple'].classification, 'CONTEXT_EXPLAINED');
  assert.equal(report.botanicalTaxonIdProposal.applyMigrationNow, false);
});
