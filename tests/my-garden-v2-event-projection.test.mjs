import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlantHistoryProjection,
  buildGardenJournalProjection,
  assertEventViewsConsistent,
} from '../modules/my-garden-v2/event-projection.js';

const plants = [
  { id: 'p1', name: 'Lemon tree' },
  { id: 'p2', name: 'Rose' },
];

const events = [
  {
    id: 'e1',
    garden_plant_id: 'p1',
    event_type: 'note_added',
    source_module: 'my_garden',
    occurred_at: '2026-10-02T09:00:00Z',
    payload: { title: 'Note added', note: 'Beautiful blooms this season!' },
  },
  {
    id: 'e2',
    garden_plant_id: 'p1',
    event_type: 'photo_added',
    source_module: 'my_garden',
    occurred_at: '2026-10-01T08:00:00Z',
    payload: { title: 'Photo added', media_id: 'm1' },
  },
  {
    id: 'e3',
    garden_plant_id: 'p2',
    event_type: 'care_logged',
    source_module: 'my_garden',
    occurred_at: '2026-10-02T10:00:00Z',
    payload: { title: 'Watered', note: 'Soil was dry.' },
  },
];

test('Plant History is a one-plant view of canonical event IDs', () => {
  const history = buildPlantHistoryProjection({
    plantId: 'p1',
    plants,
    events,
  });
  assert.deepEqual(history.rows.map((x) => x.id), ['e1', 'e2']);
});

test('Garden Journal sees the same event IDs across the garden', () => {
  const journal = buildGardenJournalProjection({ plants, events });
  assert.deepEqual(journal.rows.map((x) => x.id), ['e3', 'e1', 'e2']);
});

test('same event renders consistently in History and Journal', () => {
  assert.equal(
    assertEventViewsConsistent({
      plantId: 'p1',
      plants,
      events,
    }),
    true
  );
});

test('photo event references same media ID instead of copying media', () => {
  const history = buildPlantHistoryProjection({
    plantId: 'p1',
    plants,
    events,
  });
  const photo = history.rows.find((x) => x.id === 'e2');
  assert.equal(photo.mediaId, 'm1');
});

test('UI title is not invented when event supplies no explicit title', () => {
  const projection = buildGardenJournalProjection({
    plants,
    events: [{
      id: 'e4',
      garden_plant_id: 'p1',
      event_type: 'future_event_type',
      occurred_at: '2026-10-03T00:00:00Z',
      payload: {},
    }],
  });
  assert.equal(projection.rows[0].title, 'future_event_type');
});

test('malformed payload fails loudly', () => {
  assert.throws(
    () => buildGardenJournalProjection({
      plants,
      events: [{
        id: 'e5',
        garden_plant_id: 'p1',
        event_type: 'note_added',
        occurred_at: '2026-10-03T00:00:00Z',
        payload: 'not-an-object',
      }],
    }),
    /invalid_event_payload/
  );
});
