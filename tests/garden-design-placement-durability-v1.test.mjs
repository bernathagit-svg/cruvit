/**
 * Garden Design placement durability: Saved must mean server rows exist.
 * Zero spend. No generation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  DESIGN_PERSIST_SYNC,
  classifyDesignPersistSync,
  collapseAutosaveOps,
  persistablePlacementGrowthStage
} from '../modules/garden-design/garden-design-owned-garden-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN_ID = 'a1a34009-a0b6-4e4a-a141-8926dd60334e';
const GARDEN = 'fab7eec4-86b7-4b8a-838d-8aa4bba61657';

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('LOCAL_AHEAD_OF_SERVER when local has 3 placements and server has 0', () => {
  const sync = classifyDesignPersistSync({
    designId: DESIGN_ID,
    gardenProfileId: GARDEN,
    serverPlacements: [],
    localSnapshot: {
      designId: DESIGN_ID,
      gardenProfileId: GARDEN,
      durableDatabase: false,
      placements: [
        { id: 'pl_mango', canonicalSlug: 'mango', gardenPlantId: '5fdd5d4c-adbf-4451-a784-2e2a7d271662' },
        { id: 'pl_banana', canonicalSlug: 'banana', gardenPlantId: '923905b9-798c-416f-a11d-c5e215f92811' },
        { id: 'pl_pineapple', canonicalSlug: 'pineapple', gardenPlantId: '4d107793-bf41-42fc-91ee-538deb7541c0' }
      ]
    }
  });
  assert.equal(sync.state, DESIGN_PERSIST_SYNC.LOCAL_AHEAD_OF_SERVER);
  assert.equal(sync.savedLabelForbidden, true);
  assert.equal(sync.autoImport, false);
  assert.equal(sync.shouldKeepLocalLayers, true);
  assert.equal(sync.shouldPersistVisibleLayers, true);
  assert.equal(sync.shouldOverwriteLocalCacheDurable, false);
  assert.equal(sync.localCount, 3);
  assert.equal(sync.serverCount, 0);
});

test('saveDesign noop while dirty must not be classified SERVER_SAVED', () => {
  const sync = classifyDesignPersistSync({ noop: true, localDirty: true, serverPlacements: [], localSnapshot: { placements: [{}] } });
  assert.equal(sync.savedLabelForbidden, true);
  assert.notEqual(sync.state, DESIGN_PERSIST_SYNC.SERVER_SAVED);
});

test('double create ops collapse to one write per layer id', () => {
  const ops = collapseAutosaveOps([
    { action: 'create', clientInstanceId: 'pl_mango', phase: 'create' },
    { action: 'create', clientInstanceId: 'pl_mango', phase: 'create' }
  ]);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].action, 'create');
  assert.equal(ops[0].clientInstanceId, 'pl_mango');
});

test('unspecified owned stage is not a persistable DB growth_stage', () => {
  assert.equal(persistablePlacementGrowthStage('unspecified'), null);
  assert.equal(persistablePlacementGrowthStage('unknown'), null);
  assert.equal(persistablePlacementGrowthStage('mature'), 'mature');
});

test('iframe no longer claims Saved on hydrate when local is ahead, and create flushes immediately', () => {
  const gd = read('modules/garden-design/index.html');
  const app = read('app.html');
  const hydrate = gd.slice(gd.indexOf('function gdHydrateServerDesign'), gd.indexOf('function gdOnLoadResult'));
  assert.match(hydrate, /classifyDesignPersistSync/);
  assert.match(hydrate, /reconcileOwnedLocalPlacementIdentity/);
  assert.match(hydrate, /LOCAL_AHEAD_OF_SERVER/);
  assert.match(hydrate, /Not saved — retry/);
  assert.match(hydrate, /gdPersistAllVisiblePlacements/);
  assert.match(hydrate, /gdSetPersistStatus\('saved'\)/);
  assert.match(hydrate, /shouldKeepLocalLayers/);
  const persistAll = gd.slice(gd.indexOf('function gdPersistAllVisiblePlacements'), gd.indexOf('function gdScheduleHostPersist'));
  assert.match(persistAll, /gdPendingHostOps\.push/);
  assert.match(persistAll, /gdFlushHostPersist\(\)/);
  assert.match(persistAll, /gdPlacementWriteHadFailure = false/);
  const flush = gd.slice(gd.indexOf('function gdFlushHostPersist'), gd.indexOf('function gdPersistAllVisiblePlacements'));
  assert.match(flush, /gdHydratingFromServer/);
  assert.match(flush, /gdPendingHostOps = ops\.concat/);
  assert.doesNotMatch(flush, /if \(!ops\.length \|\| gdHydratingFromServer\) return;/);
  const schedule = gd.slice(gd.indexOf('function gdScheduleHostPersist'), gd.indexOf('function gdPersistDesignSnapshot'));
  assert.match(schedule, /op\.action === 'create'/);
  const persistResult = gd.slice(gd.indexOf('function gdOnPersistResult'), gd.indexOf('function gdRerenderPlantLayersAfterRegistryArrival'));
  assert.match(persistResult, /msg\.noop === true/);
  assert.match(app, /index\.html\?v=20260920lazyreg1/);
  assert.match(app, /garden-design-server-persistence-v1\.js\?v=20260920id1/);
  assert.match(gd, /gardenProfileId: \(gdOwnedGardenContext && gdOwnedGardenContext.gardenProfileId\)/);
  assert.match(gd, /cachedDesignId: designId/);
  assert.doesNotMatch(gd.slice(gd.indexOf('function placeOwnedGardenPlant'), gd.indexOf('function requestCommitProposedLayer')), /gdPersistDesignSnapshot\(\{\s*clientInstanceId: plantLayers/);
});
