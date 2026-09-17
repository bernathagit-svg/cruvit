/**
 * Garden Design server persistence wiring V1.
 * Zero paid AI. No live Supabase. No asset generation.
 *
 * Run: node --test tests/garden-design-server-persistence-v1.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EMPTY_SERVER_DESIGN,
  MULTIPLE_DESIGNS_REQUIRE_SELECTION,
  LOCAL_DESIGN_RESTORE_AVAILABLE,
  IDENTITY_INCONSISTENT,
  classifyLegacyLocalSnapshotImport,
  collapseAutosaveOps,
  shouldWriteOnPointerPhase,
  mapServerPlacementToLayer,
  createDesignClientInstanceId,
  GD_AUTOSAVE_DEBOUNCE_MS,
  GD_DESIGN_TO_HOST,
  GD_HOST_TO_DESIGN,
  designPaidAiForAction
} from '../modules/garden-design/garden-design-owned-garden-v1.js';
import {
  iframeMustNotCreateSupabaseClient,
  createGardenDesignMemorySupabase,
  createGardenDesignHostPersistence
} from '../modules/garden-design/garden-design-server-persistence-v1.js';
import {
  indexDesignAssetRegistry,
  resolveDesignAsset,
  DESIGN_ASSET_FALLBACK
} from '../modules/garden-design/garden-design-asset-registry-v1.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import { FIXTURE_PROVIDER_CALLS } from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const USER = 'user-office';
const GARDEN = 'garden-mojstrana';
const PATIO = 'area-sunny-patio';
const MANGO = 'gp-mango';
const OLIVE = 'gp-olive';
const LAVENDER = 'gp-lavender';

function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function jpegFile(name = 'garden.jpg', size = 1600) {
  const header = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const body = new Uint8Array(Math.max(0, size - header.length));
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header, 0);
  bytes.set(body, header.length);
  return new File([bytes], name, { type: 'image/jpeg' });
}

function seedPlants() {
  return [
    {
      id: MANGO,
      garden_profile_id: GARDEN,
      profile_slug: 'mango',
      garden_area_id: PATIO,
      name: 'Mango',
      scientific: 'Mangifera indica'
    },
    {
      id: OLIVE,
      garden_profile_id: GARDEN,
      profile_slug: 'olive',
      garden_area_id: PATIO,
      name: 'Olive',
      scientific: 'Olea europaea'
    },
    {
      id: LAVENDER,
      garden_profile_id: GARDEN,
      profile_slug: 'lavender',
      garden_area_id: PATIO,
      name: 'Lavender',
      scientific: 'Lavandula'
    }
  ];
}

function ownedFromSeed(plants) {
  return plants.map((p) => ({
    gardenPlantId: p.id,
    canonicalSlug: p.profile_slug,
    gardenAreaId: p.garden_area_id,
    gardenProfileId: p.garden_profile_id,
    name: p.name,
    scientific: p.scientific
  }));
}

function makeHost(extra = {}) {
  const plants = extra.plants || seedPlants();
  const mem = createGardenDesignMemorySupabase({
    garden_plants: plants,
    garden_designs: extra.garden_designs || [],
    garden_design_placements: extra.garden_design_placements || [],
    garden_media: extra.garden_media || [],
    fail: extra.fail || {}
  });
  const host = createGardenDesignHostPersistence({
    supabase: mem,
    getSupabase: () => mem,
    sessionUserId: extra.sessionUserId || USER,
    activeGardenId: extra.activeGardenId || GARDEN,
    ownedPlants: extra.ownedPlants || ownedFromSeed(plants),
    createSourceMedia: extra.createSourceMedia,
    getSignedUrl: extra.getSignedUrl
  });
  return { mem, host, plants };
}

test('Z: paid AI automated calls remain 0', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
  assert.equal(designPaidAiForAction('save-placement').paidAiCalls, 0);
  assert.equal(designPaidAiForAction('load-design').allowed, false);
});

test('A: iframe contains no direct Supabase write path', () => {
  const gd = src('modules/garden-design/index.html');
  const owned = src('modules/garden-design/garden-design-owned-garden-v1.js');
  const app = src('app.html');
  assert.equal(iframeMustNotCreateSupabaseClient(gd), true);
  assert.equal(iframeMustNotCreateSupabaseClient(owned), true);
  assert.doesNotMatch(gd, /createClient\s*\(/);
  assert.doesNotMatch(gd, /supabase\.from\s*\(/);
  assert.doesNotMatch(gd, /garden-design-server-persistence-v1/);
  assert.match(app, /garden-design-server-persistence-v1\.js/);
  assert.match(app, /handleGardenDesignPersistenceRequest/);
  assert.match(gd, /cruvit:garden-design-load-design/);
  assert.match(gd, /cruvit:garden-design-save-placement/);
  assert.equal(GD_DESIGN_TO_HOST.LOAD_DESIGN, 'cruvit:garden-design-load-design');
  assert.equal(GD_HOST_TO_DESIGN.LOAD_RESULT, 'cruvit:garden-design-load-result');
});

test('B: opening with 0 server designs does not create an empty row', async () => {
  const { mem, host } = makeHost();
  const loaded = await host.loadDesign({ gardenAreaId: null });
  assert.equal(loaded.code, EMPTY_SERVER_DESIGN);
  assert.equal(loaded.created, false);
  assert.equal(mem.db.garden_designs.length, 0);
  assert.equal(mem.db.garden_design_placements.length, 0);
  assert.equal(mem.writes.filter((w) => w.table === 'garden_designs' && String(w.op).includes('insert')).length, 0);
});

test('C: first real placement creates one design + one placement', async () => {
  const { mem, host } = makeHost();
  const clientInstanceId = 'pl_mango_1';
  const designClientInstanceId = createDesignClientInstanceId();
  const saved = await host.savePlacement({
    designClientInstanceId,
    gardenAreaId: null,
    placement: {
      clientInstanceId,
      kind: 'owned',
      gardenPlantId: MANGO,
      canonicalSlug: 'iframe-must-be-ignored',
      gardenAreaId: 'wrong-area',
      x: 0.4,
      y: 0.8,
      scale: 1.1,
      rotation: 0,
      zOrder: 1,
      label: 'Mango',
      scientific: 'Mangifera indica'
    }
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.createdDesign, true);
  assert.equal(mem.db.garden_designs.length, 1);
  assert.equal(mem.db.garden_design_placements.length, 1);
  assert.equal(saved.gardenPlantId, MANGO);
  assert.equal(saved.canonicalSlug, 'mango');
  assert.equal(saved.gardenAreaId, PATIO);
  assert.ok(Number.isFinite(saved.revision));
});

test('D/E: retry creates no duplicate design or placement', async () => {
  const { mem, host } = makeHost();
  const designClientInstanceId = 'gd_d_stable_retry';
  const clientInstanceId = 'pl_stable_1';
  const payload = {
    designClientInstanceId,
    placement: {
      clientInstanceId,
      kind: 'owned',
      gardenPlantId: MANGO,
      x: 0.3,
      y: 0.7,
      scale: 1
    }
  };
  const first = await host.savePlacement(payload);
  const retry = await host.savePlacement(Object.assign({}, payload, {
    placement: Object.assign({}, payload.placement, { x: 0.31 })
  }));
  assert.equal(first.ok, true);
  assert.equal(retry.ok, true);
  assert.equal(mem.db.garden_designs.length, 1);
  assert.equal(mem.db.garden_design_placements.length, 1);
  assert.equal(mem.db.garden_designs[0].client_instance_id, designClientInstanceId);
  assert.equal(mem.db.garden_design_placements[0].client_instance_id, clientInstanceId);
  assert.equal(retry.placement.id, first.placement.id);
});

test('F/G/H: owned Mango save keeps gardenPlantId, does not create garden_plants, keeps Sunny Patio', async () => {
  const { mem, host, plants } = makeHost();
  assert.equal(plants.length, 3);
  const saved = await host.savePlacement({
    designClientInstanceId: 'gd_d_mango',
    placement: {
      clientInstanceId: 'pl_mango_owned',
      kind: 'owned',
      gardenPlantId: MANGO,
      canonicalSlug: 'not-mango',
      x: 0.5,
      y: 0.8,
      scale: 1.2
    }
  });
  assert.equal(saved.gardenPlantId, MANGO);
  assert.equal(saved.createsGardenPlant, false);
  assert.equal(mem.db.garden_plants.length, 3);
  assert.equal(saved.gardenAreaId, PATIO);
  assert.equal(mem.db.garden_design_placements[0].garden_area_id, PATIO);
  assert.equal(mem.writes.some((w) => w.table === 'garden_plants' && String(w.op).includes('insert')), false);
});

test('I/J/K: drag END and scale END persist; pointermove does not write', async () => {
  const { mem, host } = makeHost();
  const designClientInstanceId = 'gd_d_transform';
  const clientInstanceId = 'pl_drag';
  await host.savePlacement({
    designClientInstanceId,
    placement: { clientInstanceId, kind: 'owned', gardenPlantId: MANGO, x: 0.2, y: 0.8, scale: 1 }
  });
  const writesBeforeMove = mem.writes.length;
  assert.equal(shouldWriteOnPointerPhase('pointermove'), false);
  const collapsed = collapseAutosaveOps([
    { action: 'update', clientInstanceId, phase: 'pointermove', placement: { x: 0.21 } },
    { action: 'update', clientInstanceId, phase: 'pointermove', placement: { x: 0.22 } },
    { action: 'update', clientInstanceId, phase: 'pointerup', placement: { x: 0.55, y: 0.72 } }
  ]);
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0].phase, 'pointerup');
  const dragged = await host.savePlacement({
    designClientInstanceId,
    placement: { clientInstanceId, kind: 'owned', gardenPlantId: MANGO, x: 0.55, y: 0.72, scale: 1 }
  });
  assert.equal(dragged.placement.x, 0.55);
  assert.equal(dragged.placement.y, 0.72);
  const scaled = await host.savePlacement({
    designClientInstanceId,
    placement: { clientInstanceId, kind: 'owned', gardenPlantId: MANGO, x: 0.55, y: 0.72, scale: 1.8 }
  });
  assert.equal(scaled.placement.scale, 1.8);
  assert.ok(Number.isFinite(scaled.revision));
  const gd = src('modules/garden-design/index.html');
  const moveFn = gd.slice(gd.indexOf('function onPlantLayerPointerMove'), gd.indexOf('function onPlantLayerPointerUp'));
  assert.doesNotMatch(moveFn, /gdPersistDesignSnapshot/);
  assert.doesNotMatch(moveFn, /garden-design-save-placement/);
  assert.doesNotMatch(moveFn, /garden-design-update-placement/);
  assert.match(gd, /oninput="gdPreviewPlantLayerScale/);
  assert.match(gd, /onchange="setPlantLayerScale/);
  assert.match(gd, /gdPersistDebounceMs = 600/);
  assert.equal(GD_AUTOSAVE_DEBOUNCE_MS, 600);
  assert.ok(mem.writes.length > writesBeforeMove);
});

test('L: delete placement removes only the placement', async () => {
  const { mem, host } = makeHost();
  await host.savePlacement({
    designClientInstanceId: 'gd_d_del',
    placement: { clientInstanceId: 'pl_del', kind: 'owned', gardenPlantId: MANGO, x: 0.4, y: 0.8, scale: 1 }
  });
  const del = await host.deletePlacement({
    designClientInstanceId: 'gd_d_del',
    clientInstanceId: 'pl_del'
  });
  assert.equal(del.ok, true);
  assert.equal(del.deletedGardenPlant, false);
  assert.equal(mem.db.garden_design_placements.length, 0);
  assert.equal(mem.db.garden_plants.length, 3);
  assert.equal(mem.db.garden_designs.length, 1);
  assert.ok(Number.isFinite(del.revision));
});

test('M: server reload reconstructs the same placement after refresh', async () => {
  const { host } = makeHost();
  const designClientInstanceId = 'gd_d_reload';
  const clientInstanceId = 'pl_reload';
  const saved = await host.savePlacement({
    designClientInstanceId,
    placement: {
      clientInstanceId,
      kind: 'owned',
      gardenPlantId: MANGO,
      x: 0.41,
      y: 0.79,
      scale: 1.25,
      label: 'Mango'
    }
  });
  const loaded = await host.loadDesign({ cachedDesignId: saved.designId });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.durableDatabase, true);
  assert.equal(loaded.placements.length, 1);
  assert.equal(loaded.placements[0].clientInstanceId, clientInstanceId);
  assert.equal(loaded.placements[0].gardenPlantId, MANGO);
  const layer = mapServerPlacementToLayer(loaded.placements[0], ownedFromSeed(seedPlants()));
  assert.equal(layer.ok, true);
  assert.equal(layer.layer.id, clientInstanceId);
  assert.equal(layer.layer.gardenPlantId, MANGO);
  assert.equal(layer.layer.createsGardenPlant, false);
});

test('N/O: mango stays honest placeholder; olive still resolves approved Design Asset', () => {
  const registry = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'modules/garden-design/assets/plants/design-asset-registry-v1.json'), 'utf8')
  );
  const index = indexDesignAssetRegistry(registry);
  const mango = resolveDesignAsset({ canonicalSlug: 'mango', growthStage: 'mature' }, index);
  assert.equal(mango.visualReady, false);
  assert.equal(mango.fallback, DESIGN_ASSET_FALLBACK.HONEST_PLACEHOLDER);
  const olive = resolveDesignAsset({ canonicalSlug: 'olive', growthStage: 'mature' }, index);
  assert.equal(olive.visualReady, true);
  assert.ok(olive.url);
});

test('P: proposed placement does not create ownership', async () => {
  const { mem, host } = makeHost();
  const saved = await host.savePlacement({
    designClientInstanceId: 'gd_d_prop',
    placement: {
      clientInstanceId: 'pl_prop',
      kind: 'proposed',
      gardenPlantId: null,
      canonicalSlug: 'basil',
      x: 0.3,
      y: 0.7,
      scale: 1,
      label: 'Basil'
    }
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.placement.kind, 'proposed');
  assert.equal(saved.placement.gardenPlantId, null);
  assert.equal(mem.db.garden_plants.length, 3);
});

test('Q: explicit proposal commit updates the same placement to owned', async () => {
  const { mem, host } = makeHost();
  const clientInstanceId = 'pl_commit_same';
  await host.savePlacement({
    designClientInstanceId: 'gd_d_commit',
    placement: {
      clientInstanceId,
      kind: 'proposed',
      canonicalSlug: 'mango',
      x: 0.4,
      y: 0.75,
      scale: 1
    }
  });
  const committed = await host.savePlacement({
    designClientInstanceId: 'gd_d_commit',
    placement: {
      clientInstanceId,
      kind: 'owned',
      gardenPlantId: MANGO,
      x: 0.4,
      y: 0.75,
      scale: 1
    }
  });
  assert.equal(committed.ok, true);
  assert.equal(mem.db.garden_design_placements.length, 1);
  assert.equal(mem.db.garden_design_placements[0].kind, 'owned');
  assert.equal(mem.db.garden_design_placements[0].garden_plant_id, MANGO);
  assert.equal(mem.db.garden_design_placements[0].client_instance_id, clientInstanceId);
});

test('R: server revision is returned after successful mutation', async () => {
  const { host } = makeHost();
  const saved = await host.savePlacement({
    designClientInstanceId: 'gd_d_rev',
    placement: { clientInstanceId: 'pl_rev', kind: 'owned', gardenPlantId: MANGO, x: 0.4, y: 0.8, scale: 1 }
  });
  assert.ok(Number(saved.revision) >= 1);
  const moved = await host.savePlacement({
    designClientInstanceId: 'gd_d_rev',
    placement: { clientInstanceId: 'pl_rev', kind: 'owned', gardenPlantId: MANGO, x: 0.6, y: 0.8, scale: 1 }
  });
  assert.ok(Number(moved.revision) >= Number(saved.revision));
});

test('S: offline failure keeps local canvas / cache', async () => {
  const { host } = makeHost({ fail: { garden_designs: 'upsert' } });
  const result = await host.savePlacement({
    designClientInstanceId: 'gd_d_offline',
    placement: { clientInstanceId: 'pl_off', kind: 'owned', gardenPlantId: MANGO, x: 0.4, y: 0.8, scale: 1 }
  });
  assert.equal(result.ok, false);
  assert.equal(result.keepLocalCanvas, true);
});

test('T/U: anonymous and mismatched garden snapshots are not auto-imported', async () => {
  const { host } = makeHost();
  const anon = classifyLegacyLocalSnapshotImport(
    { userId: 'anon', gardenProfileId: GARDEN, placements: [{ id: 'x' }] },
    { userId: USER, gardenProfileId: GARDEN }
  );
  assert.equal(anon.autoImport, false);
  assert.equal(anon.code, 'ANONYMOUS_SNAPSHOT_BLOCKED');
  const mismatch = classifyLegacyLocalSnapshotImport(
    { userId: USER, gardenProfileId: 'other-garden', placements: [{ id: 'x' }] },
    { userId: USER, gardenProfileId: GARDEN }
  );
  assert.equal(mismatch.autoImport, false);
  assert.equal(mismatch.code, 'GARDEN_MISMATCH');
  const loaded = await host.loadDesign({
    localSnapshot: { userId: USER, gardenProfileId: GARDEN, placements: [{ id: 'local-only' }] }
  });
  assert.equal(loaded.code, EMPTY_SERVER_DESIGN);
  assert.equal(loaded.localRestore.autoImport, false);
  assert.equal(loaded.localRestore.code, LOCAL_DESIGN_RESTORE_AVAILABLE);
  assert.equal(loaded.created, false);
});

test('V: >1 matching server designs does not silently select one', async () => {
  const { host } = makeHost({
    garden_designs: [
      { id: 'd1', garden_profile_id: GARDEN, user_id: USER, client_instance_id: 'c1', garden_area_id: null, status: 'active', revision: 1 },
      { id: 'd2', garden_profile_id: GARDEN, user_id: USER, client_instance_id: 'c2', garden_area_id: null, status: 'active', revision: 4 }
    ]
  });
  const loaded = await host.loadDesign({});
  assert.equal(loaded.code, MULTIPLE_DESIGNS_REQUIRE_SELECTION);
  assert.equal(loaded.silentLatestForbidden, true);
  assert.equal(loaded.ok, false);
  assert.deepEqual(loaded.designIds.sort(), ['d1', 'd2']);
});

test('W/X: source image is stored through garden_media, reload uses signed URL', async () => {
  const { mem, host } = makeHost({
    createSourceMedia: async ({ file, purpose, sourceModule, gardenProfileId }) => {
      assert.equal(typeof file === 'string' && String(file).startsWith('data:'), false);
      assert.equal(purpose, 'design_source');
      assert.equal(sourceModule, 'garden_design');
      const row = {
        id: 'media-source-1',
        garden_profile_id: gardenProfileId,
        storage_path: `${USER}/${GARDEN}/media-source-1/garden.jpg`,
        storage_bucket: 'user-garden-media',
        purpose,
        source_module: sourceModule,
        metadata: {},
        validation_state: 'validated'
      };
      mem.db.garden_media.push(row);
      return { row };
    },
    getSignedUrl: async ({ storagePath }) => ({ signedUrl: 'https://signed.example/user-garden-media/' + storagePath })
  });
  const attached = await host.saveSourceMedia({
    designClientInstanceId: 'gd_d_photo',
    file: jpegFile()
  });
  assert.equal(attached.ok, true);
  assert.equal(attached.storedAsDataUrl, false);
  assert.equal(attached.purpose, 'design_source');
  assert.ok(attached.storagePath);
  assert.equal(looksLikePostgresDataUrl(mem.db.garden_designs[0]), false);
  assert.equal(mem.db.garden_designs[0].source_media_id, 'media-source-1');
  const loaded = await host.loadDesign({ cachedDesignId: attached.designId });
  assert.match(loaded.editorBaseMediaUrl, /^https:\/\/signed\.example\//);
  assert.equal(loaded.sourceMediaId, 'media-source-1');
  assert.equal(loaded.derivedBaseMediaId, null);
});

test('Y: Catalog/Card image path remains separate and unchanged', () => {
  const app = src('app.html');
  const gd = src('modules/garden-design/index.html');
  const persist = src('modules/garden-design/garden-design-server-persistence-v1.js');
  assert.match(app, /licensed-catalog-media-runtime-v1/);
  assert.match(gd, /async function loadPlantImages/);
  assert.match(gd, /function fetchPlantImg/);
  assert.doesNotMatch(persist, /replace card images/i);
  assert.doesNotMatch(gd, /DESIGN_ASSET_FALLBACK.*imgUrl/);
  assert.match(gd, /function resolvePlantLayerAsset/);
});

test('host ignores iframe user_id and never writes garden_plants', async () => {
  const { mem, host } = makeHost();
  await host.handle('cruvit:garden-design-save-placement', {
    userId: 'attacker',
    user_id: 'attacker',
    designClientInstanceId: 'gd_d_auth',
    placement: {
      clientInstanceId: 'pl_auth',
      kind: 'owned',
      gardenPlantId: MANGO,
      x: 0.4,
      y: 0.8,
      scale: 1
    }
  });
  assert.equal(mem.db.garden_designs[0].user_id, USER);
  assert.equal(mem.db.garden_plants.length, 3);
});

test('owned identity inconsistency fails visibly', async () => {
  const { host } = makeHost();
  const saved = await host.savePlacement({
    designClientInstanceId: 'gd_d_bad',
    placement: {
      clientInstanceId: 'pl_bad',
      kind: 'owned',
      gardenPlantId: 'missing-plant',
      x: 0.4,
      y: 0.8,
      scale: 1
    }
  });
  assert.equal(saved.ok, false);
  assert.equal(saved.code, IDENTITY_INCONSISTENT);
  assert.equal(saved.createsGardenPlant, false);
});

test('no schema/migration/asset-generation drift in this wiring', () => {
  const persist = src('modules/garden-design/garden-design-server-persistence-v1.js');
  const app = src('app.html');
  assert.doesNotMatch(persist, /alter table|create table/i);
  assert.doesNotMatch(app, /GARDEN_DESIGN_PERSISTENCE_MIGRATION applied/i);
  assert.doesNotMatch(persist, /stability|openai|replicate|claude/i);
});

function mutationWrites(writes) {
  return (writes || []).filter((w) => (
    (w.table === 'garden_designs' || w.table === 'garden_design_placements') &&
    /insert|upsert|update|delete/.test(String(w.op)) &&
    w.op !== 'select'
  ));
}

test('AA: first placement create succeeds, placement fails → no unintended empty design', async () => {
  const { mem, host } = makeHost({ fail: { once: 'garden_design_placements.upsert' } });
  const designClientInstanceId = 'gd_d_first_fail';
  const failed = await host.savePlacement({
    designClientInstanceId,
    placement: {
      clientInstanceId: 'pl_first_fail',
      kind: 'owned',
      gardenPlantId: MANGO,
      x: 0.4,
      y: 0.8,
      scale: 1
    }
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.keepLocalCanvas, true);
  assert.equal(failed.compensatedEmptyDesign, true);
  assert.equal(failed.leftoverEmptyDesign, false);
  assert.equal(failed.designClientInstanceId, designClientInstanceId);
  assert.equal(mem.db.garden_designs.length, 0);
  assert.equal(mem.db.garden_design_placements.length, 0);
});

test('AB: retry after AA reuses clientInstanceId and creates exactly one design + placement', async () => {
  const { mem, host } = makeHost({ fail: { once: 'garden_design_placements.upsert' } });
  const designClientInstanceId = 'gd_d_retry_same';
  const clientInstanceId = 'pl_retry_same';
  const payload = {
    designClientInstanceId,
    placement: {
      clientInstanceId,
      kind: 'owned',
      gardenPlantId: MANGO,
      x: 0.42,
      y: 0.81,
      scale: 1.1
    }
  };
  const failed = await host.savePlacement(payload);
  assert.equal(failed.ok, false);
  assert.equal(failed.compensatedEmptyDesign, true);
  assert.equal(mem.db.garden_designs.length, 0);
  const retried = await host.savePlacement(payload);
  assert.equal(retried.ok, true);
  assert.equal(mem.db.garden_designs.length, 1);
  assert.equal(mem.db.garden_design_placements.length, 1);
  assert.equal(mem.db.garden_designs[0].client_instance_id, designClientInstanceId);
  assert.equal(mem.db.garden_design_placements[0].client_instance_id, clientInstanceId);
});

test('AC: pre-existing empty/valid design is never deleted by compensation', async () => {
  const preexisting = {
    id: 'design-preexisting',
    garden_profile_id: GARDEN,
    user_id: USER,
    client_instance_id: 'gd_d_preexisting',
    garden_area_id: null,
    status: 'active',
    title: 'Garden Design',
    revision: 1
  };
  const { mem, host } = makeHost({
    garden_designs: [preexisting],
    fail: { once: 'garden_design_placements.upsert' }
  });
  const failedNew = await host.savePlacement({
    designClientInstanceId: 'gd_d_other_new',
    placement: {
      clientInstanceId: 'pl_other_new',
      kind: 'owned',
      gardenPlantId: MANGO,
      x: 0.4,
      y: 0.8,
      scale: 1
    }
  });
  assert.equal(failedNew.compensatedEmptyDesign, true);
  assert.equal(mem.db.garden_designs.length, 1);
  assert.equal(mem.db.garden_designs[0].id, 'design-preexisting');

  mem.fail.once = 'garden_design_placements.upsert';
  const failedExisting = await host.savePlacement({
    designClientInstanceId: 'gd_d_preexisting',
    placement: {
      clientInstanceId: 'pl_onto_preexisting',
      kind: 'owned',
      gardenPlantId: MANGO,
      x: 0.5,
      y: 0.8,
      scale: 1
    }
  });
  assert.equal(failedExisting.ok, false);
  assert.equal(failedExisting.createdDesign, false);
  assert.equal(failedExisting.compensatedEmptyDesign, false);
  assert.equal(mem.db.garden_designs.length, 1);
  assert.equal(mem.db.garden_designs[0].id, 'design-preexisting');
});

test('AD: source-photo attachment failure does not corrupt media lifecycle', async () => {
  const { mem, host } = makeHost({
    fail: { once: 'garden_designs.update' },
    createSourceMedia: async ({ file, purpose, sourceModule, gardenProfileId }) => {
      assert.equal(typeof file === 'string' && String(file).startsWith('data:'), false);
      const row = {
        id: 'media-orphan-safe',
        garden_profile_id: gardenProfileId,
        storage_path: `${USER}/${GARDEN}/media-orphan-safe/garden.jpg`,
        storage_bucket: 'user-garden-media',
        purpose,
        source_module: sourceModule,
        metadata: {},
        validation_state: 'validated'
      };
      mem.db.garden_media.push(row);
      return { row };
    }
  });
  const result = await host.saveSourceMedia({
    designClientInstanceId: 'gd_d_photo_fail',
    file: jpegFile()
  });
  assert.equal(result.ok, false);
  assert.equal(result.mediaDeleted, false);
  assert.equal(result.mediaKept, true);
  assert.equal(result.mediaValidationState, 'validated');
  assert.equal(result.designAuthority, false);
  assert.equal(result.compensatedEmptyDesign, true);
  assert.equal(mem.db.garden_media.length, 1);
  assert.equal(mem.db.garden_media[0].validation_state, 'validated');
  assert.equal(mem.db.garden_media[0].id, 'media-orphan-safe');
  assert.equal(mem.db.garden_designs.length, 0);
  assert.equal(mem.db.garden_designs.some((d) => d.source_media_id === 'media-orphan-safe'), false);
});

test('AE: pointermove network writes = 0', () => {
  const { mem } = makeHost();
  assert.equal(shouldWriteOnPointerPhase('pointermove'), false);
  const collapsed = collapseAutosaveOps([
    { action: 'update', clientInstanceId: 'pl_1', phase: 'pointermove' },
    { action: 'update', clientInstanceId: 'pl_1', phase: 'pointermove' }
  ]);
  assert.equal(collapsed.length, 0);
  assert.equal(mutationWrites(mem.writes).length, 0);
  const gd = src('modules/garden-design/index.html');
  const moveFn = gd.slice(gd.indexOf('function onPlantLayerPointerMove'), gd.indexOf('function onPlantLayerPointerUp'));
  assert.doesNotMatch(moveFn, /gdPersistDesignSnapshot/);
  assert.doesNotMatch(moveFn, /gdPostToHost/);
  assert.doesNotMatch(moveFn, /garden-design-save-placement/);
  assert.doesNotMatch(moveFn, /garden-design-update-placement/);
  assert.match(gd, /phase === 'pointermove'/);
});

function looksLikePostgresDataUrl(row) {
  const blob = JSON.stringify(row || {});
  return blob.includes('data:image') || blob.includes('data:application');
}
