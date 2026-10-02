import test from 'node:test';
import assert from 'node:assert/strict';
import { createMyPlantsDataAdapter } from '../modules/my-garden-v2/my-plants-data-adapter.js';

function queryResult(data) {
  return {
    select(){ return this; },
    eq(){ return this; },
    order(){ return this; },
    async maybeSingle(){ return { data, error: null }; },
    then(resolve){ return Promise.resolve({ data, error: null }).then(resolve); },
  };
}

function fakeSupabase(fixtures) {
  return {
    from(table) {
      const data = fixtures[table];
      if (table === 'garden_profiles') return queryResult(data);
      return queryResult(data || []);
    },
  };
}

test('My Plants adapter returns exact Plant Instance cards from one snapshot', async () => {
  const gardenId = 'g1';
  const supabase = fakeSupabase({
    garden_profiles: { id: gardenId, user_id: 'u1', name: 'My Garden' },
    garden_plants: [
      {
        id: 'p1',
        garden_profile_id: gardenId,
        name: 'Lemon tree',
        scientific: 'Citrus limon',
        status: 'Growing well',
        archived: false,
        garden_area_id: 'a1',
        cover_media_id: 'm1',
      },
      {
        id: 'p2',
        garden_profile_id: gardenId,
        name: 'Rose',
        scientific: 'Rosa',
        status: 'Needs a check',
        archived: false,
        garden_area_id: 'a2',
      },
    ],
    garden_areas: [
      { id: 'a1', garden_profile_id: gardenId, name: 'Backyard' },
      { id: 'a2', garden_profile_id: gardenId, name: 'Front garden' },
    ],
    garden_tasks: [],
    garden_events: [],
    garden_media: [
      {
        id: 'm1',
        garden_profile_id: gardenId,
        garden_plant_id: 'p1',
        purpose: 'plant_profile',
        validation_state: 'validated',
        storage_bucket: 'user-garden-media',
        storage_path: 'u/g/m1/lemon.jpg',
        mime_type: 'image/jpeg',
      },
    ],
  });

  const adapter = createMyPlantsDataAdapter(supabase);
  const result = await adapter.loadMyPlants(gardenId);

  assert.equal(result.garden.id, gardenId);
  assert.deepEqual(result.viewModel.cards.map((x) => x.id), ['p1', 'p2']);
  assert.equal(result.viewModel.cards[0].cover.kind, 'personal');
  assert.equal(result.viewModel.cards[0].area.areaName, 'Backyard');
  assert.equal(result.viewModel.cards[0].cameraAction.plantId, 'p1');
  assert.equal(result.viewModel.cards[1].cover.kind, 'system');
});
