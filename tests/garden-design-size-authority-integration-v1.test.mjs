/**
 * Garden Design size authority integration V1 canary. Zero spend.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadBotanicalSizeAuthority } from '../modules/garden-design/asset-factory-v1/botanical-size-authority-v1.js';
import {
  GARDEN_SIZE_AUTHORITY_ACTIVATION,
  resolveGardenSizeAuthority
} from '../modules/garden-design/asset-factory-v1/garden-design-size-authority-adapter-v1.js';
import { writeGardenDesignSizeAuthorityIntegrationReports } from '../modules/garden-design/asset-factory-v1/garden-design-size-authority-integration-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADAPTER = path.join(ROOT, 'modules', 'garden-design', 'asset-factory-v1', 'garden-design-size-authority-adapter-v1.js');

test('size authority canary covers six states without global activation', () => {
  const written = writeGardenDesignSizeAuthorityIntegrationReports(ROOT);
  const summary = JSON.parse(fs.readFileSync(written.summaryPath, 'utf8'));
  const canary = JSON.parse(fs.readFileSync(written.canaryPath, 'utf8'));
  assert.equal(written.verdict, 'GARDEN_DESIGN_SIZE_AUTHORITY_CANARY_PASS');
  assert.equal(summary.globalAuthorityRuntimeEnabled, true);
  assert.equal(summary.canaryAuthorityRuntimeEnabled, true);
  assert.equal(summary.applyInProductionGardenDesign, true);
  assert.equal(summary.gardenDesignBlocked, false);
  assert.equal(summary.photoCalibrationMandatory, false);
  const registry = loadBotanicalSizeAuthority(ROOT);
  const before = JSON.stringify(registry);
  resolveGardenSizeAuthority(registry, {
    canonicalSlug: 'mango',
    canaryContext: true,
    ownerPreferredRangePosition: 'LOW',
    userScaleOverride: { kind: 'multiplier', value: 1.2 }
  });
  assert.equal(JSON.stringify(loadBotanicalSizeAuthority(ROOT)), before);
  assert.equal(JSON.stringify(registry).includes('ownerPreferredRangePosition'), false);
  const adapterSrc = fs.readFileSync(ADAPTER, 'utf8');
  assert.equal(adapterSrc.includes('tree-size-evidence-wave-v1-records'), false);
  assert.equal(adapterSrc.includes('evidence-records.json'), false);
  assert.equal(canary.cases.mango.previewScenario, 'LANDSCAPE_MATURE');
  assert.equal(canary.cases.olive.previewScenario, 'LANDSCAPE_MATURE');
  assert.notEqual(canary.cases.olive.heightRangeM.max, canary.cases.mango.heightRangeM.max);
  assert.equal(canary.cases.blueGum.spreadAuthority, 'ESTIMATED');
  assert.equal(canary.cases.lemon.fallbackReason, 'PERSONAL_CONTEXT_REQUIRED');
  assert.equal(canary.cases.cypress.conflictHold, true);
  assert.equal(canary.cases.breadfruit.evidenceGap, true);
  assert.equal(GARDEN_SIZE_AUTHORITY_ACTIVATION.globalAuthorityRuntimeEnabled, true);
  const cedar = resolveGardenSizeAuthority(registry, { canonicalSlug: 'cedar', canaryContext: true });
  assert.equal(cedar.applied, true);
  assert.equal(cedar.runtimeAuthorityState, 'RUNTIME_AUTHORITY_READY');
  const cedarProd = resolveGardenSizeAuthority(registry, { canonicalSlug: 'cedar' });
  assert.equal(cedarProd.applied, true);
});
