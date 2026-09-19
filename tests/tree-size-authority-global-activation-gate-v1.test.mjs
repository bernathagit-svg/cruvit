/**
 * Tree size authority global activation gate V1. Zero spend. Global flag remains off.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadBotanicalSizeAuthority } from '../modules/garden-design/asset-factory-v1/botanical-size-authority-v1.js';
import {
  GARDEN_SIZE_AUTHORITY_ACTIVATION,
  productionGardenSizeAuthorityEnabled,
  resolveGardenSizeAuthority
} from '../modules/garden-design/asset-factory-v1/garden-design-size-authority-adapter-v1.js';
import { writeTreeSizeAuthorityGlobalActivationGateReports } from '../modules/garden-design/asset-factory-v1/tree-size-authority-global-activation-gate-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADAPTER = path.join(ROOT, 'modules', 'garden-design', 'asset-factory-v1', 'garden-design-size-authority-adapter-v1.js');
const GATE = path.join(ROOT, 'modules', 'garden-design', 'asset-factory-v1', 'tree-size-authority-global-activation-gate-v1.js');

test('all 41 taxa resolve through the adapter with global activation off', () => {
  const written = writeTreeSizeAuthorityGlobalActivationGateReports(ROOT);
  const summary = JSON.parse(fs.readFileSync(written.summaryPath, 'utf8'));
  const matrix = JSON.parse(fs.readFileSync(written.matrixPath, 'utf8'));
  assert.equal(written.verdict, 'TREE_SIZE_AUTHORITY_GLOBAL_ACTIVATION_READY');
  assert.equal(summary.GLOBAL_ACTIVATION_READY, true);
  assert.equal(summary.globalAuthorityRuntimeEnabled, true);
  assert.equal(summary.canaryAuthorityRuntimeEnabled, true);
  assert.equal(summary.applyInProductionGardenDesign, true);
  assert.equal(summary.uniqueTaxa, 41);
  assert.equal(summary.accounting.RUNTIME_AUTHORITY_READY, 9);
  assert.equal(summary.accounting.RUNTIME_AUTHORITY_PARTIAL, 9);
  assert.equal(summary.accounting.RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED, 13);
  assert.equal(summary.accounting.RUNTIME_AUTHORITY_CONFLICT_HOLD, 3);
  assert.equal(summary.accounting.RUNTIME_AUTHORITY_EVIDENCE_GAP, 7);
  assert.equal(matrix.taxa.length, 41);
  assert.equal(summary.orangeAlias.orange, 'taxon:citrus-sinensis');
  assert.equal(summary.orangeAlias.sweetOrange, 'taxon:citrus-sinensis');
  assert.equal(summary.orangeAlias.records, 1);

  const registry = loadBotanicalSizeAuthority(ROOT);
  const before = JSON.stringify(registry);
  resolveGardenSizeAuthority(registry, {
    canonicalSlug: 'olive',
    canaryContext: true,
    userScaleOverride: { kind: 'multiplier', value: 1.4 }
  });
  assert.equal(JSON.stringify(loadBotanicalSizeAuthority(ROOT)), before);
  assert.equal(productionGardenSizeAuthorityEnabled(), true);
  assert.equal(GARDEN_SIZE_AUTHORITY_ACTIVATION.globalAuthorityRuntimeEnabled, true);

  const cedarGate = resolveGardenSizeAuthority(registry, { canonicalSlug: 'cedar', activationGateContext: true });
  assert.equal(cedarGate.applied, true);
  assert.equal(cedarGate.runtimeAuthorityState, 'RUNTIME_AUTHORITY_READY');
  const cedarProd = resolveGardenSizeAuthority(registry, { canonicalSlug: 'cedar' });
  assert.equal(cedarProd.applied, true);

  const youngMango = resolveGardenSizeAuthority(registry, {
    canonicalSlug: 'mango',
    growthStage: 'young',
    canaryContext: true
  });
  assert.equal(youngMango.stageAuthority, 'STAGE_AUTHORITY_UNKNOWN');
  assert.equal(youngMango.usedAuthoritativeMeters, false);

  const adapterSrc = fs.readFileSync(ADAPTER, 'utf8');
  const gateSrc = fs.readFileSync(GATE, 'utf8');
  assert.equal(adapterSrc.includes('tree-size-evidence-wave-v1-records'), false);
  assert.equal(adapterSrc.includes('evidence-records.json'), false);
  assert.equal(gateSrc.includes('tree-size-evidence-wave-v1-records'), false);
  assert.equal(matrix.taxa.every((row) => row.rawResearchImportedByRuntime === 'NO'), true);
});
