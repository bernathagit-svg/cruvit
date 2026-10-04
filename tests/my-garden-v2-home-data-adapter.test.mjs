import test from 'node:test';
import assert from 'node:assert/strict';
import { createMyGardenHomeDataAdapter } from '../modules/my-garden-v2/home-data-adapter.js';

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

test('Home adapter derives all summary state from one garden snapshot', async () => {
  const gardenId = 'g1';
  const supabase = fakeSupabase({
    garden_profiles: { id: gardenId, user_id: 'u1', name: 'My Garden' },
    garden_plants: [
      { id: 'p1', garden_profile_id: gardenId, name: 'Lemon', archived: false },
      { id: 'p2', garden_profile_id: gardenId, name: 'Rose', archived: false },
    ],
    garden_tasks: [
      { id: 't1', garden_profile_id: gardenId, garden_plant_id: 'p1', title: 'Water', due_on: '2026-10-02', done: false },
      { id: 't2', garden_profile_id: gardenId, garden_plant_id: 'p2', title: 'Prune', due_on: '2026-10-05', done: false },
    ],
    garden_events: [],
    garden_media: [],
  });

  const adapter = createMyGardenHomeDataAdapter(supabase);
  const result = await adapter.loadHome(gardenId, { today: '2026-10-02' });

  assert.equal(result.garden.id, gardenId);
  assert.deepEqual(result.viewModel.counts, {
    plants: 2,
    upcoming: 2,
    attention: 1,
  });
  assert.equal(result.viewModel.attentionPreview.taskId, 't1');
});

test('Home adapter rejects ambiguous/non-date-only today values', async () => {
  const adapter = createMyGardenHomeDataAdapter(fakeSupabase({}));
  await assert.rejects(
    () => adapter.loadHome('g1', { today: '2026-10-02T12:00:00Z' }),
    /today_date_only_required/
  );
});
