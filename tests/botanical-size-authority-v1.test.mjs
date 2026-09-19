/**
 * Botanical size authority registry V1. File-backed. Runtime unwired.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXPECTED_AUTHORITY_ACCOUNTING,
  getAuthorityBySlug,
  loadBotanicalSizeAuthority,
  validateBotanicalSizeAuthority
} from '../modules/garden-design/asset-factory-v1/botanical-size-authority-v1.js';
import { writeBotanicalSizeAuthorityRegistry } from '../modules/garden-design/asset-factory-v1/botanical-size-authority-v1-build.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const READER = path.join(ROOT, 'modules', 'garden-design', 'asset-factory-v1', 'botanical-size-authority-v1.js');
const RUNTIME_FILES = [
  path.join(ROOT, 'modules', 'garden-design', 'asset-factory-v1', 'generic-tree-physical-scale-v1.js'),
  path.join(ROOT, 'modules', 'garden-design', 'asset-factory-v1', 'physical-scale-foundation-v1.js'),
  path.join(ROOT, 'modules', 'garden-design', 'asset-factory-v1', 'physical-scale-foundation-v1-runtime.js')
];

test('botanical size authority registry promotes 41 taxa without runtime wiring', () => {
  const written = writeBotanicalSizeAuthorityRegistry(ROOT);
  const registry = loadBotanicalSizeAuthority(ROOT);
  const validation = validateBotanicalSizeAuthority(registry);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.ok, true);
  assert.equal(written.runtimeWired, false);
  assert.equal(registry.runtimeWired, false);
  assert.equal(registry.records.length, 41);
  assert.equal(registry.universalDefaultPreviewScenario, null);
  assert.equal(new Set(registry.records.map((row) => row.botanicalTaxonId)).size, 41);
  assert.equal(registry.slugToBotanicalTaxonId.orange, 'taxon:citrus-sinensis');
  assert.equal(registry.slugToBotanicalTaxonId['sweet-orange'], 'taxon:citrus-sinensis');
  assert.equal(getAuthorityBySlug(registry, 'orange').botanicalTaxonId, getAuthorityBySlug(registry, 'sweet-orange').botanicalTaxonId);
  assert.equal(registry.records.filter((row) => row.botanicalTaxonId === 'taxon:citrus-sinensis').length, 1);
  assert.equal(registry.records.filter((row) => row.runtimeAuthority === 'RUNTIME_AUTHORITY_READY').length, EXPECTED_AUTHORITY_ACCOUNTING.RUNTIME_AUTHORITY_READY);
  assert.equal(registry.records.filter((row) => row.runtimeAuthority === 'RUNTIME_AUTHORITY_PARTIAL').length, EXPECTED_AUTHORITY_ACCOUNTING.RUNTIME_AUTHORITY_PARTIAL);
  assert.equal(registry.records.filter((row) => row.runtimeAuthority === 'RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED').length, EXPECTED_AUTHORITY_ACCOUNTING.RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED);
  assert.equal(registry.records.filter((row) => row.runtimeAuthority === 'RUNTIME_AUTHORITY_CONFLICT_HOLD').length, EXPECTED_AUTHORITY_ACCOUNTING.RUNTIME_AUTHORITY_CONFLICT_HOLD);
  assert.equal(registry.records.filter((row) => row.runtimeAuthority === 'RUNTIME_AUTHORITY_EVIDENCE_GAP').length, EXPECTED_AUTHORITY_ACCOUNTING.RUNTIME_AUTHORITY_EVIDENCE_GAP);
  for (const row of registry.records.filter((item) => item.runtimeAuthority === 'RUNTIME_AUTHORITY_READY' || item.runtimeAuthority === 'RUNTIME_AUTHORITY_PARTIAL')) {
    assert.ok(row.provenanceEvidenceIds.length >= 1, row.botanicalTaxonId);
  }
  for (const row of registry.records.filter((item) => item.runtimeAuthority === 'RUNTIME_AUTHORITY_EVIDENCE_GAP')) {
    const range = row.normalizedRange || {};
    assert.equal(range.heightM?.min ?? null, null);
    assert.equal(range.heightM?.max ?? null, null);
    assert.equal(range.spreadM?.min ?? null, null);
    assert.equal(range.spreadM?.max ?? null, null);
  }
  for (const row of registry.records.filter((item) => item.runtimeAuthority === 'RUNTIME_AUTHORITY_CONFLICT_HOLD')) {
    assert.equal(row.selectedSource, null);
    assert.equal(row.selectedHeightEvidenceRef, null);
    assert.equal(row.selectedSpreadEvidenceRef, null);
    assert.ok(row.conflictingEvidenceIds.length >= 2);
  }
  const mango = getAuthorityBySlug(registry, 'mango');
  assert.equal(JSON.stringify(mango).includes('ownerPreferredRangePosition'), false);
  assert.equal(JSON.stringify(registry).includes('ownerPreferredRangePosition'), false);
  const readerSource = fs.readFileSync(READER, 'utf8');
  assert.equal(readerSource.includes('tree-size-evidence-wave-v1-records'), false);
  assert.equal(readerSource.includes('evidence-records.json'), false);
  for (const filePath of RUNTIME_FILES) {
    const source = fs.readFileSync(filePath, 'utf8');
    assert.equal(source.includes('botanical-size-authority-v1.json'), false, path.basename(filePath));
    assert.equal(source.includes('tree-size-evidence-wave-v1/evidence-records.json'), false, path.basename(filePath));
  }
});
