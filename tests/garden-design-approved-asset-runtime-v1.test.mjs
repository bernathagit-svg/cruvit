/**
 * Approved asset placeholder runtime: registry cache, arrival race, unspecified stage.
 * Zero spend. No generation. Does not rewrite owned botanical state.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GARDEN_DESIGN_ASSET_REGISTRY_CACHE_TOKEN,
  DESIGN_ASSET_FALLBACK,
  applyDesignAssetRegistryArrival,
  indexDesignAssetRegistry,
  renderLayersFromDesignAssetIndex,
  resolveDesignAsset,
  resolveOwnedLayerPresentation
} from '../modules/garden-design/garden-design-asset-registry-v1.js';
import { resolveDesignCanonicalIdentity } from '../modules/garden-design/garden-design-owned-garden-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_REL = 'modules/garden-design/assets/plants/design-asset-registry-v1.json';

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function currentRegistry() {
  return JSON.parse(read(REGISTRY_REL));
}

function oliveOnlyRegistry() {
  const registry = currentRegistry();
  return {
    ...registry,
    sets: (registry.sets || []).filter((set) => set.canonicalSlug === 'olive')
  };
}

function ownedLayers(growthStage) {
  return [
    {
      id: 'pl_mango',
      name: 'Mango Tree',
      canonicalSlug: 'mango',
      gardenPlantId: 'gp-mango-owned',
      growthStage,
      phenology: 'vegetative',
      x: 0.22,
      y: 0.74,
      scale: 1,
      areaId: 'b394f661-0edd-4740-a04b-8bcc420590c9'
    },
    {
      id: 'pl_banana',
      name: 'Banana',
      canonicalSlug: 'banana',
      gardenPlantId: 'gp-banana-owned',
      growthStage,
      phenology: 'vegetative',
      x: 0.48,
      y: 0.78,
      scale: 1,
      areaId: 'area-banana'
    },
    {
      id: 'pl_pineapple',
      name: 'Pineapple',
      canonicalSlug: 'pineapple',
      gardenPlantId: 'gp-pineapple-owned',
      growthStage,
      phenology: 'vegetative',
      x: 0.71,
      y: 0.81,
      scale: 1,
      areaId: 'area-pineapple'
    }
  ];
}

function assertApprovedCutouts(rendered) {
  const bySlug = Object.fromEntries(rendered.map((row) => [row.canonicalSlug, row]));
  assert.equal(bySlug.mango.assetId, 'mango__mature__tree__vegetative__detail-v2__high');
  assert.equal(bySlug.mango.architectureMode, 'tree');
  assert.match(bySlug.mango.url, /woody-foliage-detail-ab-1\/mango__mature__tree__vegetative__detail-v2__high\.png$/);
  assert.equal(bySlug.banana.assetId, 'banana__mature__default__vegetative__v1');
  assert.equal(bySlug.banana.visualForm, 'herbaceous-clump');
  assert.match(bySlug.banana.url, /batch-2-candidates\/visual-state-calibration-batch-2\/banana__mature__default__vegetative__v1\.png$/);
  assert.equal(bySlug.pineapple.assetId, 'pineapple__mature__default__vegetative__detail-v2__medium');
  assert.equal(bySlug.pineapple.visualForm, 'rosette');
  assert.match(bySlug.pineapple.url, /quality-family-calibration-final-1\/pineapple__mature__default__vegetative__detail-v2__medium\.png$/);
  assert.equal(rendered.every((row) => row.visualReady && row.placeholder === false), true);
  assert.equal(rendered.filter((row) => row.placeholder).length, 0);
}

test('A: registry arrives BEFORE layers → approved assets render', () => {
  const arrival = applyDesignAssetRegistryArrival(currentRegistry(), {
    overlayPlacementActive: true,
    plantLayers: []
  });
  assert.equal(arrival.shouldRenderPlantLayers, false);
  assert.equal(arrival.persistWrites, 0);
  const rendered = renderLayersFromDesignAssetIndex(ownedLayers('unspecified'), arrival.index);
  assertApprovedCutouts(rendered);
  assert.deepEqual(rendered.map((row) => row.id), ['pl_mango', 'pl_banana', 'pl_pineapple']);
});

test('B: registry arrives AFTER layers → existing placeholders re-render to approved assets', () => {
  const layers = ownedLayers('unspecified');
  const before = renderLayersFromDesignAssetIndex(layers, indexDesignAssetRegistry({ sets: [] }));
  assert.equal(before.every((row) => row.placeholder === true), true);
  const arrival = applyDesignAssetRegistryArrival(currentRegistry(), {
    overlayPlacementActive: true,
    plantLayers: layers
  });
  assert.equal(arrival.shouldRenderPlantLayers, true);
  assert.equal(arrival.duplicatePlacements, false);
  assert.equal(arrival.placementRowsCreated, 0);
  const after = renderLayersFromDesignAssetIndex(layers, arrival.index);
  assertApprovedCutouts(after);
  assert.deepEqual(
    after.map((row) => ({ id: row.id, gardenPlantId: row.gardenPlantId, x: row.x, y: row.y, scale: row.scale, areaId: row.areaId })),
    layers.map((row) => ({ id: row.id, gardenPlantId: row.gardenPlantId, x: row.x, y: row.y, scale: row.scale, areaId: row.areaId }))
  );
});

test('C: stale/empty registry first, current registry later → current wins and re-renders', () => {
  const layers = ownedLayers('unspecified');
  const stale = applyDesignAssetRegistryArrival(oliveOnlyRegistry(), {
    overlayPlacementActive: true,
    plantLayers: layers
  });
  const staleRender = renderLayersFromDesignAssetIndex(layers, stale.index);
  assert.equal(staleRender.filter((row) => row.canonicalSlug !== 'olive').every((row) => row.placeholder === true), true);
  const current = applyDesignAssetRegistryArrival(currentRegistry(), {
    overlayPlacementActive: true,
    plantLayers: layers
  });
  const currentRender = renderLayersFromDesignAssetIndex(layers, current.index);
  assertApprovedCutouts(currentRender);
  assert.equal(current.index.bySlug.has('mango'), true);
  assert.equal(current.index.bySlug.has('banana'), true);
  assert.equal(current.index.bySlug.has('pineapple'), true);
});

test('D: registry re-render → no persistence call', () => {
  const gd = read('modules/garden-design/index.html');
  const rerender = gd.slice(
    gd.indexOf('function gdRerenderPlantLayersAfterRegistryArrival'),
    gd.indexOf('function gdIndexDesignAssetRegistry')
  );
  const indexer = gd.slice(
    gd.indexOf('function gdIndexDesignAssetRegistry'),
    gd.indexOf('function gdApplyOwnedGardenContext')
  );
  assert.match(indexer, /applyDesignAssetRegistryArrival/);
  assert.match(indexer, /gdRerenderPlantLayersAfterRegistryArrival\(\)/);
  assert.match(rerender, /renderPlantLayers\(\)/);
  assert.doesNotMatch(rerender, /gdPersistDesignSnapshot/);
  assert.doesNotMatch(rerender, /gdFlushHostPersist/);
  assert.doesNotMatch(indexer, /gdPersistDesignSnapshot/);
  const arrival = applyDesignAssetRegistryArrival(currentRegistry(), {
    overlayPlacementActive: true,
    plantLayers: ownedLayers('unspecified')
  });
  assert.equal(arrival.persistWrites, 0);
  assert.equal(arrival.gardenPlantsWrites, 0);
  assert.equal(arrival.placementRowsCreated, 0);
});

test('E: owned stage unspecified → approved baseline may render without changing owned plant biological state', () => {
  const layer = ownedLayers('unspecified')[0];
  const originalStage = layer.growthStage;
  const presentation = resolveOwnedLayerPresentation(layer, indexDesignAssetRegistry(currentRegistry()));
  assert.equal(layer.growthStage, originalStage);
  assert.equal(presentation.ownedGrowthStage, 'unspecified');
  assert.equal(presentation.ownedGrowthStageUnchanged, true);
  assert.equal(presentation.presentationDidNotMutateOwnedStage, true);
  assert.equal(presentation.visualReady, true);
  assert.equal(presentation.assetId, 'mango__mature__tree__vegetative__detail-v2__high');
  assert.ok(
    presentation.fallback === DESIGN_ASSET_FALLBACK.CLOSEST_APPROVED ||
      presentation.fallback === DESIGN_ASSET_FALLBACK.NEUTRAL_CANONICAL
  );
  const resolved = resolveDesignAsset(
    { canonicalSlug: 'mango', growthStage: 'unspecified', phenology: 'vegetative' },
    indexDesignAssetRegistry(currentRegistry())
  );
  assert.equal(resolved.visualReady, true);
  assert.equal(resolved.growthStage, 'mature');
  assert.equal(layer.growthStage, 'unspecified');
});

test('canonicalSlug mango wins over display name Mango Tree; no cross-species fallback', () => {
  const ident = resolveDesignCanonicalIdentity(
    { name: 'Mango Tree', canonicalSlug: 'mango' },
    { catalog: [{ slug: 'olive', name: 'Olive' }, { slug: 'mango', name: 'Mango Tree' }], aliasMaps: { 'mango-tree': 'mango' } }
  );
  assert.equal(ident.canonicalSlug, 'mango');
  const banana = resolveDesignCanonicalIdentity(
    { name: 'Banana', canonicalSlug: 'banana' },
    { catalog: [{ slug: 'banana', name: 'Banana' }], aliasMaps: {} }
  );
  const pineapple = resolveDesignCanonicalIdentity(
    { name: 'Pineapple', canonicalSlug: 'pineapple' },
    { catalog: [{ slug: 'pineapple', name: 'Pineapple' }], aliasMaps: {} }
  );
  assert.equal(banana.canonicalSlug, 'banana');
  assert.equal(pineapple.canonicalSlug, 'pineapple');
});

test('asset resolver rebuilds its runtime index from current Garden Design context on every lookup', () => {
  const gd = read('modules/garden-design/index.html');
  const resolver = gd.slice(
    gd.indexOf('function resolvePlantLayerAsset'),
    gd.indexOf('function gdBuildSpriteSvgHtml')
  );
  assert.match(resolver, /requestedRegistrySlug/);
  assert.match(resolver, /contextRegistry/);
  assert.match(resolver, /gdDesignAssetIndex = registryApi\.indexDesignAssetRegistry\(contextRegistry\)/);
  assert.doesNotMatch(resolver, /indexMissingRequestedSlug/);
});

test('asset resolver self-heals missing runtime index from Garden Design context registry', () => {
  const gd = read('modules/garden-design/index.html');
  const resolver = gd.slice(
    gd.indexOf('function resolvePlantLayerAsset'),
    gd.indexOf('function gdBuildSpriteSvgHtml')
  );
  assert.match(resolver, /!gdDesignAssetIndex/);
  assert.match(resolver, /gdOwnedGardenContext\.designAssetRegistry/);
  assert.match(resolver, /indexDesignAssetRegistry/);
  assert.match(resolver, /gdDesignAssetIndex = registryApi\.indexDesignAssetRegistry/);
});

test('Add plants modal uses approved Design Asset Registry thumbnails and no Wikipedia runtime image fetch', () => {
  const gd = read('modules/garden-design/index.html');
  const helper = gd.slice(
    gd.indexOf('function gdApmRegistryThumbHtml'),
    gd.indexOf('function gdRetryOwnedPlants')
  );
  const owned = gd.slice(
    gd.indexOf('function showApmOwned'),
    gd.indexOf('function gdAreaLabel')
  );
  const list = gd.slice(
    gd.indexOf('function showApmList'),
    gd.indexOf('function showApmWrite')
  );
  assert.match(helper, /resolvePlantLayerAsset/);
  assert.match(helper, /visualReady/);
  assert.match(helper, /data-asset-id/);
  assert.match(owned, /gdApmRegistryThumbHtml\(p\)/);
  assert.match(list, /gdApmRegistryThumbHtml/);
  assert.doesNotMatch(list, /fetchPlantImg/);
  assert.doesNotMatch(list, /wikipedia/i);
});

test('Garden Design registry bootstrap uses dynamic import with visible failure state', () => {
  const gd = read('modules/garden-design/index.html');
  const bootStart = gd.indexOf("window.__gdRegistryBootstrap = 'starting'");
  const moduleStart = gd.indexOf("<script type=\"module\">", bootStart);
  const bootstrap = gd.slice(Math.max(0, bootStart - 120), moduleStart);
  assert.match(bootstrap, /import\('\.\/garden-design-asset-registry-v1\.js\?v=20260921reg6'\)/);
  assert.match(bootstrap, /window\.CruvitGardenDesignAssetRegistry = api/);
  assert.match(bootstrap, /registry-module-api-invalid/);
  assert.match(bootstrap, /window\.__gdRegistryBootstrap = 'error:' \+/);
  assert.match(bootstrap, /gdIndexDesignAssetRegistry\(registry\)/);
  assert.doesNotMatch(bootstrap, /garden-design-size-authority-adapter|garden-design-owned-garden-v1/);
});

test('Garden Design exposes visible asset runtime diagnostics without persistence writes', () => {
  const gd = read('modules/garden-design/index.html');
  const diag = gd.slice(gd.indexOf('function gdAssetDiagSnapshot'), gd.indexOf('function gdRerenderPlantLayersAfterRegistryArrival'));
  assert.match(gd, /id="gdAssetDiag"/);
  assert.match(diag, /registrySets/);
  assert.match(diag, /indexHasMango/);
  assert.match(diag, /resolvedAssetId/);
  assert.match(diag, /resolvedUrl/);
  assert.match(diag, /imageNaturalWidth/);
  assert.doesNotMatch(diag, /gdPersistDesignSnapshot|gdFlushHostPersist|garden_plants/);
});

test('Garden Design iframe self-loads the same authoritative registry without host dependency', () => {
  const gd = read('modules/garden-design/index.html');
  const bootStart = gd.indexOf("window.__gdRegistryBootstrap = 'starting'");
  const moduleStart = gd.indexOf('<script type="module">', bootStart);
  const bootstrap = gd.slice(Math.max(0, bootStart - 120), moduleStart);
  assert.match(bootstrap, /fetch\('\.\/assets\/plants\/design-asset-registry-v1\.json\?v=20260921reg6', \{ cache: 'no-store' \}\)/);
  assert.match(bootstrap, /gdOwnedGardenContext\.designAssetRegistry = registry/);
  assert.match(bootstrap, /gdIndexDesignAssetRegistry\(registry\)/);
  assert.doesNotMatch(bootstrap, /openai|replicate|stability/i);
});

test('production host/iframe load the versioned registry and re-index both arrival paths', () => {
  const app = read('app.html');
  const gd = read('modules/garden-design/index.html');
  assert.equal(GARDEN_DESIGN_ASSET_REGISTRY_CACHE_TOKEN, '20260921reg6');
  assert.match(app, /design-asset-registry-v1\.json\?v=' \+ token/);
  assert.match(app, /const token='20260921reg6'/);
  assert.match(app, /fetch\(href,\{cache:'no-store'\}\)/);
  assert.match(app, /index\.html\?v=20260921ownedboot1/);
  assert.match(app, /garden-design-asset-registry-v1\.js\?v=20260921reg6/);
  assert.match(app, /garden-design-server-persistence-v1\.js\?v=20260920id1/);
  assert.match(gd, /garden-design-asset-registry-v1\.js\?v=20260921reg6/);
  assert.match(gd, /if \(ctx\.designAssetRegistry\) gdIndexDesignAssetRegistry\(ctx\.designAssetRegistry\)/);
  assert.match(gd, /if \(d\.type === 'cruvit:garden-design-asset-registry'\) gdIndexDesignAssetRegistry\(d\.designAssetRegistry\)/);
  assert.match(gd, /canonicalSlug: p\.canonicalSlug \|\| ident\.canonicalSlug/);
  assert.match(gd, /growthStage: p\.growthStage \|\| 'unspecified'/);
  const loadFn = app.slice(app.indexOf('function loadGardenDesignAssetRegistry'), app.indexOf('function buildGardenDesignContextPayload'));
  assert.doesNotMatch(loadFn, /openai/i);
  assert.doesNotMatch(gd.slice(gd.indexOf('function gdIndexDesignAssetRegistry'), gd.indexOf('function gdApplyOwnedGardenContext')), /fetch\(['"]https:\/\/api\.openai/);
});
