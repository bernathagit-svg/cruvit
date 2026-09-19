/**
 * Tree size authority production activation V1. Zero spend.
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
import { writeTreeSizeAuthorityProductionActivationReports } from '../modules/garden-design/asset-factory-v1/tree-size-authority-production-activation-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADAPTER = path.join(ROOT, 'modules', 'garden-design', 'asset-factory-v1', 'garden-design-size-authority-adapter-v1.js');
const GD = path.join(ROOT, 'modules', 'garden-design', 'index.html');
const REGISTRY = path.join(ROOT, 'data', 'catalog', 'botanical-size-authority-v1.json');

test('production activation uses the existing adapter without mutating registry', () => {
  const registryBefore = fs.readFileSync(REGISTRY, 'utf8');
  const written = writeTreeSizeAuthorityProductionActivationReports(ROOT);
  const summary = JSON.parse(fs.readFileSync(written.summaryPath, 'utf8'));
  const smoke = JSON.parse(fs.readFileSync(written.smokePath, 'utf8'));
  assert.equal(written.verdict, 'TREE_SIZE_AUTHORITY_PRODUCTION_ACTIVATED');
  assert.equal(written.treePhysicalScaleV1, 'TREE_PHYSICAL_SCALE_V1_PRODUCTION_VALIDATED');
  assert.equal(summary.globalAuthorityRuntimeEnabled, true);
  assert.equal(summary.productionAuthorityPathActive, true);
  assert.equal(summary.gardenDesignBlocked, false);
  assert.equal(summary.botanicalRegistryChangedDuringActivation, false);
  assert.equal(fs.readFileSync(REGISTRY, 'utf8'), registryBefore);
  assert.equal(productionGardenSizeAuthorityEnabled(), true);
  assert.equal(GARDEN_SIZE_AUTHORITY_ACTIVATION.globalAuthorityRuntimeEnabled, true);

  const registry = loadBotanicalSizeAuthority(ROOT);
  const mango = resolveGardenSizeAuthority(registry, { canonicalSlug: 'mango', growthStage: 'mature' });
  const olive = resolveGardenSizeAuthority(registry, { canonicalSlug: 'olive', growthStage: 'mature' });
  assert.equal(mango.applied, true);
  assert.equal(mango.runtimeAuthorityState, 'RUNTIME_AUTHORITY_READY');
  assert.equal(olive.botanicalTaxonId, 'taxon:olea-europaea');
  assert.notEqual(olive.heightRangeM.max, mango.heightRangeM.max);
  assert.equal(smoke.lemon.personalContextNeeded, true);
  assert.equal(smoke.cypress.conflictHold, true);
  assert.equal(smoke.breadfruit.evidenceGap, true);
  assert.equal(smoke.blueGum.spreadAuthority, 'ESTIMATED');

  const adapterSrc = fs.readFileSync(ADAPTER, 'utf8');
  const gdSrc = fs.readFileSync(GD, 'utf8');
  assert.equal(adapterSrc.includes('tree-size-evidence-wave-v1-records'), false);
  assert.match(gdSrc, /function onPlantLayerPointerDown/);
  assert.match(gdSrc, /function setPlantLayerScale/);
  assert.match(gdSrc, /function deleteSelectedPlantLayer/);
  assert.match(gdSrc, /gdApplyTreeSizeAuthorityVisual/);
  assert.doesNotMatch(gdSrc, /deleteGardenPlant|archivePlant\(/);
});
