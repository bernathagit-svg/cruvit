import test from 'node:test';
import assert from 'node:assert/strict';

import {
  persistConfirmedIdentifierPlant,
  reconcilePendingIdentifierHistory,
} from '../modules/plant-identifier/plant-identifier-mygarden-write-bridge-v1.js';
import {
  buildPlantAddedMemoryInput,
  writeGardenMemoryEvent,
} from '../modules/personal-domain/garden-memory-writer-v1.js';

const schemaVerifier = async () => ({
  ok: true,
  environment: 'e2e-test',
  statusDefault: 'unassessed',
  markDefault: 'unknown',
  allowedMarks: ['unknown', '✓', '!'],
});

function rlsError(message = 'new row violates row-level security policy') {
  const error = new Error(message);
  error.code = '42501';
  return error;
}

function uniqueError() {
  const error = new Error(
    'duplicate key value violates unique constraint garden_events_garden_client_uidx'
  );
  error.code = '23505';
  return error;
}

function createDb() {
  return {
    gardens: new Map([
      ['g1', 'u1'],
      ['g2', 'u2'],
    ]),
    plants: [],
    events: [],
    nextPlant: 1,
    nextEvent: 1,
    failEventWrites: false,
  };
}

function createClient(db, userId) {
  function ownsGarden(gardenId) {
    return db.gardens.get(String(gardenId)) === userId;
  }

  function rowsFor(table) {
    return table === 'garden_plants' ? db.plants : db.events;
  }

  function from(table) {
    const state = {
      table,
      filters: [],
      pending: null,
      upsertOptions: null,
      mode: null,
    };

    function filteredRows() {
      return rowsFor(table).filter((row) => {
        if (!ownsGarden(row.garden_profile_id)) return false;
        return state.filters.every(([key, value]) => row[key] === value);
      });
    }

    const chain = {
      select() {
        return chain;
      },
      eq(key, value) {
        state.filters.push([key, value]);
        return chain;
      },
      limit() {
        return chain;
      },
      order() {
        return chain;
      },
      insert(payload) {
        state.mode = 'insert';
        state.pending = { ...payload };
        return chain;
      },
      upsert(payload, options = {}) {
        state.mode = 'upsert';
        state.pending = { ...payload };
        state.upsertOptions = options;
        return chain;
      },
      async maybeSingle() {
        const rows = filteredRows();
        return { data: rows[0] || null, error: null };
      },
      async single() {
        if (!state.pending) {
          const rows = filteredRows();
          return { data: rows[0] || null, error: null };
        }

        const row = state.pending;
        const gardenId = row.garden_profile_id;
        if (!ownsGarden(gardenId)) {
          return { data: null, error: rlsError() };
        }

        if (table === 'garden_plants') {
          if (state.mode !== 'upsert') {
            return { data: null, error: new Error('expected_upsert') };
          }
          const existing = db.plants.find(
            (p) =>
              p.garden_profile_id === gardenId &&
              p.client_instance_id === row.client_instance_id
          );
          if (existing) {
            Object.assign(existing, row, { user_id: userId });
            return { data: { ...existing }, error: null };
          }
          const created = {
            id: 'p' + db.nextPlant++,
            user_id: userId,
            archived: false,
            prefs: { autoTasks: true, reminders: true, alerts: true },
            ...row,
          };
          db.plants.push(created);
          return { data: { ...created }, error: null };
        }

        if (table === 'garden_events') {
          if (db.failEventWrites) {
            return { data: null, error: new Error('simulated_event_store_outage') };
          }
          const duplicate = db.events.find(
            (e) =>
              e.garden_profile_id === gardenId &&
              e.client_event_id === row.client_event_id
          );
          if (duplicate) {
            return { data: null, error: uniqueError() };
          }
          const created = {
            id: 'e' + db.nextEvent++,
            user_id: userId,
            ...row,
          };
          db.events.push(created);
          return { data: { ...created }, error: null };
        }

        return { data: null, error: new Error('unknown_table') };
      },
      then(resolve) {
        resolve({ data: filteredRows().map((row) => ({ ...row })), error: null });
      },
    };

    return chain;
  }

  return { from };
}

function createDomain({
  db,
  userId,
  gardenId,
  failEmitter = false,
  hydrateCounter = null,
}) {
  const client = createClient(db, userId);
  return {
    getSession: () => ({ user: { id: userId }, access_token: 'test-token-' + userId }),
    getActiveGardenId: () => gardenId,
    getSupabaseClient: () => client,
    verifyGardenPlantsUnassessedHealthV2: schemaVerifier,
    emitPlantAddedMemory: async (plant) => {
      if (failEmitter) throw new Error('simulated_emitter_failure');
      const input = buildPlantAddedMemoryInput(plant, {
        sourceModule: 'plant_identifier',
      });
      return writeGardenMemoryEvent(client, input);
    },
    hydrateActiveGardenPlants: async () => {
      if (hydrateCounter) hydrateCounter.count += 1;
      return true;
    },
  };
}

const identification = {
  common_name: 'Monstera',
  scientific_name: 'Monstera deliciosa',
  confidence: 96,
};

test('E2E: login -> active garden -> canonical save -> reload -> duplicate -> History -> RLS', async () => {
  const db = createDb();
  const hydrated = { count: 0 };
  const domainU1 = createDomain({
    db,
    userId: 'u1',
    gardenId: 'g1',
    hydrateCounter: hydrated,
  });

  // Login + active garden + canonical identification -> Save.
  const first = await persistConfirmedIdentifierPlant({
    result: identification,
    canonicalSlug: 'monstera-deliciosa',
    commitToken: 'scan-stable-1',
    personalDomain: domainU1,
  });

  assert.equal(first.ok, true);
  assert.equal(first.historyPending, false);
  assert.equal(first.plant.garden_profile_id, 'g1');
  assert.equal(first.plant.user_id, 'u1');
  assert.equal(first.plant.profile_slug, 'monstera-deliciosa');
  assert.equal(first.plant.status, 'unassessed');
  assert.equal(first.plant.mark, 'unknown');
  assert.equal(db.plants.length, 1);
  assert.equal(db.events.length, 1);
  assert.equal(db.events[0].event_type, 'plant_added');
  assert.equal(db.events[0].source_module, 'plant_identifier');
  assert.equal(db.events[0].garden_plant_id, first.plant.id);

  // Reload: new domain instance reads the same durable database and reconciliation is clean.
  const reloadedDomain = createDomain({ db, userId: 'u1', gardenId: 'g1' });
  const reloadReconcile = await reconcilePendingIdentifierHistory(reloadedDomain);
  assert.equal(reloadReconcile.ok, true);
  assert.equal(reloadReconcile.pending, 0);
  assert.equal(db.plants.length, 1);
  assert.equal(db.events.length, 1);

  // Duplicate Save with same stable commit token: upsert, not clone; History remains one event.
  const duplicate = await persistConfirmedIdentifierPlant({
    result: identification,
    canonicalSlug: 'monstera-deliciosa',
    commitToken: 'scan-stable-1',
    personalDomain: reloadedDomain,
  });
  assert.equal(duplicate.ok, true);
  assert.equal(db.plants.length, 1);
  assert.equal(db.events.length, 1);
  assert.equal(db.plants[0].id, first.plant.id);

  // Cross-user: u2 cannot save into u1's active garden even with a valid schema attestation.
  const crossUserDomain = createDomain({ db, userId: 'u2', gardenId: 'g1' });
  const cross = await persistConfirmedIdentifierPlant({
    result: identification,
    canonicalSlug: 'monstera-deliciosa',
    commitToken: 'cross-user-attempt',
    personalDomain: crossUserDomain,
  });
  assert.equal(cross.ok, false);
  assert.equal(cross.reason, 'persist-failed');
  assert.equal(db.plants.length, 1);
  assert.equal(db.events.length, 1);

  // User 2's own-garden client cannot read user 1 rows through RLS semantics.
  const u2 = createClient(db, 'u2');
  const visible = await u2
    .from('garden_plants')
    .select('*')
    .eq('garden_profile_id', 'g1');
  assert.deepEqual(visible.data, []);

  assert.ok(hydrated.count >= 1);
});

test('E2E: failed Plant Added history survives as pending and is repaired after reload', async () => {
  const db = createDb();
  db.failEventWrites = true;

  const domain = createDomain({
    db,
    userId: 'u1',
    gardenId: 'g1',
    failEmitter: true,
  });

  const saved = await persistConfirmedIdentifierPlant({
    result: identification,
    canonicalSlug: 'monstera-deliciosa',
    commitToken: 'scan-history-retry',
    personalDomain: domain,
  });

  assert.equal(saved.ok, true);
  assert.equal(saved.historyPending, true);
  assert.equal(db.plants.length, 1);
  assert.equal(db.events.length, 0);

  // Simulate service recovery + reload.
  db.failEventWrites = false;
  const afterReload = createDomain({ db, userId: 'u1', gardenId: 'g1' });
  const reconciled = await reconcilePendingIdentifierHistory(afterReload);

  assert.equal(reconciled.ok, true);
  assert.equal(reconciled.repaired, 1);
  assert.equal(reconciled.pending, 0);
  assert.equal(db.events.length, 1);
  assert.equal(db.events[0].garden_plant_id, db.plants[0].id);
});
