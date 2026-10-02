import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlantHistoryScreenViewModel,
  buildGardenJournalScreenViewModel,
  assertHistoryJournalIdentity,
} from '../modules/my-garden-v2/event-screen-view-models.js';

const plants = [
  { id: 'p1', name: 'Lemon tree', archived: false },
  { id: 'p2', name: 'Rose', archived: false },
  { id: 'p3', name: 'Old olive', archived: true },
];

const events = [
  {
    id: 'e1',
    garden_plant_id: 'p1',
    event_type: 'note_added',
    occurred_at: '2026-10-02T09:00:00Z',
    payload: { title: 'Note added', note: 'Beautiful blooms this season!' },
  },
  {
    id: 'e2',
    garden_plant_id: 'p1',
    event_type: 'photo_added',
    occurred_at: '2026-09-20T09:00:00Z',
    payload: { title: 'Photo added', media_id: 'm1' },
  },
  {
    id: 'e3',
    garden_plant_id: 'p2',
    event_type: 'care_logged',
    occurred_at: '2026-10-01T09:00:00Z',
    payload: { title: 'Watered', note: 'Soil was dry' },
  },
  {
    id: 'e4',
    garden_plant_id: 'p3',
    event_type: 'plant_archived',
    occurred_at: '2026-08-01T09:00:00Z',
    payload: { title: 'Plant archived' },
  },
];

test('Plant History groups same plant events by month', () => {
  const vm = buildPlantHistoryScreenViewModel({
    plantId: 'p1',
    plants,
    events,
  });

  assert.deepEqual(vm.eventIds, ['e1', 'e2']);
  assert.deepEqual(vm.groups.map((x) => x.month), ['2026-10', '2026-09']);
});

test('Plant History search filters the read model without copying events', () => {
  const vm = buildPlantHistoryScreenViewModel({
    plantId: 'p1',
    plants,
    events,
    query: 'blooms',
  });

  assert.deepEqual(vm.eventIds, ['e1']);
});

test('Garden Journal active scope excludes archived plants but preserves event IDs', () => {
  const vm = buildGardenJournalScreenViewModel({
    plants,
    events,
    scope: 'active',
  });

  assert.deepEqual(vm.eventIds, ['e1', 'e3', 'e2']);
  assert.equal(vm.eventIds.includes('e4'), false);
});

test('Garden Journal archived scope returns same archived event, not a copy', () => {
  const vm = buildGardenJournalScreenViewModel({
    plants,
    events,
    scope: 'archived',
  });

  assert.deepEqual(vm.eventIds, ['e4']);
});

test('History and Journal consistency gate uses the same canonical event IDs', () => {
  assert.equal(
    assertHistoryJournalIdentity({
      plantId: 'p1',
      plants,
      events,
    }),
    true
  );
});

test('invalid Garden Journal scope fails loudly', () => {
  assert.throws(
    () => buildGardenJournalScreenViewModel({
      plants,
      events,
      scope: 'everything',
    }),
    /invalid_journal_scope/
  );
});
