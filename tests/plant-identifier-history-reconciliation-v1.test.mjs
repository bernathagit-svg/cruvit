import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileIdentifierPlantAddedHistory,
} from '../modules/plant-identifier/plant-identifier-history-reconciliation-v1.js';

function makeFake({ plants = [], events = [], failEventInsert = false } = {}) {
  const tables = {
    garden_plants: plants.map((x) => ({ ...x })),
    garden_events: events.map((x) => ({ ...x })),
  };
  let seq = 1;

  function query(table) {
    let filters = [];
    let pendingInsert = null;
    const chain = {
      select() { return chain; },
      eq(key, value) { filters.push([key, value]); return chain; },
      insert(row) { pendingInsert = { ...row }; return chain; },
      async single() {
        if (!pendingInsert) return { data: null, error: null };
        if (failEventInsert && table === 'garden_events') {
          return { data: null, error: new Error('simulated_history_failure') };
        }
        const out = { id: 'evt-' + seq++, ...pendingInsert };
        tables[table].push(out);
        return { data: out, error: null };
      },
      then(resolve) {
        let rows = tables[table].filter((row) =>
          filters.every(([k,v]) => row[k] === v)
        );
        resolve({ data: rows.map((x) => ({ ...x })), error: null });
      },
    };
    return chain;
  }

  return {
    tables,
    client: { from: query },
  };
}

const plant = {
  id: 'p1',
  garden_profile_id: 'g1',
  client_instance_id: 'identifier:scan-1',
  name: 'Monstera',
  scientific: 'Monstera deliciosa',
  profile_slug: 'monstera-deliciosa',
  source: 'Scan & Identify',
  added_at: '2026-10-05T12:00:00.000Z',
};

test('reconciliation creates missing Plant Added history from durable plant row', async () => {
  const fake = makeFake({ plants: [plant] });
  const out = await reconcileIdentifierPlantAddedHistory({
    supabase: fake.client,
    gardenProfileId: 'g1',
  });

  assert.equal(out.ok, true);
  assert.equal(out.missing, 1);
  assert.equal(out.repaired, 1);
  assert.equal(out.pending, 0);
  assert.equal(fake.tables.garden_events.length, 1);
  assert.equal(fake.tables.garden_events[0].garden_plant_id, 'p1');
  assert.equal(fake.tables.garden_events[0].event_type, 'plant_added');
  assert.equal(fake.tables.garden_events[0].source_module, 'plant_identifier');
});

test('reconciliation is idempotent when history already exists', async () => {
  const fake = makeFake({
    plants: [plant],
    events: [{
      id: 'e1',
      garden_profile_id: 'g1',
      garden_plant_id: 'p1',
      event_type: 'plant_added',
      source_module: 'plant_identifier',
      client_event_id: 'existing',
    }],
  });
  const out = await reconcileIdentifierPlantAddedHistory({
    supabase: fake.client,
    gardenProfileId: 'g1',
  });

  assert.equal(out.missing, 0);
  assert.equal(out.repaired, 0);
  assert.equal(fake.tables.garden_events.length, 1);
});

test('reconciliation reports pending history instead of swallowing failure', async () => {
  const fake = makeFake({ plants: [plant], failEventInsert: true });
  const out = await reconcileIdentifierPlantAddedHistory({
    supabase: fake.client,
    gardenProfileId: 'g1',
  });

  assert.equal(out.ok, false);
  assert.equal(out.pending, 1);
  assert.match(out.failures[0].error, /simulated_history_failure/);
});
