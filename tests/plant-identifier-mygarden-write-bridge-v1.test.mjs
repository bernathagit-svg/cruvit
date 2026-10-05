import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIdentifierAddIntent,
  persistConfirmedIdentifierPlant,
} from '../modules/plant-identifier/plant-identifier-mygarden-write-bridge-v1.js';

const result = {
  common_name: 'Monstera',
  scientific_name: 'Monstera deliciosa',
};

function fakeRpcSupabase({
  created = true,
  status = 'unassessed',
  mark = 'unknown',
  slug = 'monstera-deliciosa',
  error = null,
} = {}) {
  const calls = [];
  return {
    calls,
    client: {
      async rpc(name, args) {
        calls.push({ name, args });
        if (error) return { data: null, error };
        return {
          data: {
            ok: true,
            created,
            historyCreated: created,
            plant: {
              id: 'p1',
              garden_profile_id: 'g1',
              user_id: 'u1',
              client_instance_id: 'identifier:pi-save-1',
              name: 'Monstera',
              status,
              mark,
              source: 'Scan & Identify',
              profile_slug: slug,
              scientific: 'Monstera deliciosa',
            },
            history: {
              id: 'e1',
              garden_plant_id: 'p1',
              event_type: 'plant_added',
              source_module: 'plant_identifier',
              client_event_id: 'gev_plant_identifier_plant_added_plant_p1_added',
            },
          },
          error: null,
        };
      },
    },
  };
}

test('bridge builds confirmed scan intent with stable identifier client id', () => {
  const intent = buildIdentifierAddIntent({
    result,
    canonicalSlug: 'monstera-deliciosa',
    gardenProfileId: 'g1',
    commitToken: 'pi-save-1',
  });
  assert.equal(intent.mode, 'scan');
  assert.equal(intent.clientInstanceId, 'identifier:pi-save-1');
  assert.equal(intent.identity.identitySource, 'identifier_confirmed');
  assert.equal(intent.initialHealth.status, 'unassessed');
  assert.equal(intent.initialHealth.mark, 'unknown');
});

test('bridge fails closed without auth or active garden', async () => {
  const noAuth = await persistConfirmedIdentifierPlant({
    result,
    canonicalSlug: 'monstera-deliciosa',
    commitToken: 'pi-save-1',
    personalDomain: {
      getSession: () => null,
    },
  });
  assert.equal(noAuth.ok, false);
  assert.equal(noAuth.reason, 'auth-required');

  const noGarden = await persistConfirmedIdentifierPlant({
    result,
    canonicalSlug: 'monstera-deliciosa',
    commitToken: 'pi-save-1',
    personalDomain: {
      getSession: () => ({ user: { id: 'u1' } }),
      getActiveGardenId: () => null,
    },
  });
  assert.equal(noGarden.ok, false);
  assert.equal(noGarden.reason, 'active-garden-required');
});

test('bridge executes one atomic RPC then hydrates My Garden', async () => {
  const fake = fakeRpcSupabase();
  let hydrated = 0;

  const out = await persistConfirmedIdentifierPlant({
    result,
    canonicalSlug: 'monstera-deliciosa',
    commitToken: 'pi-save-1',
    personalDomain: {
      getSession: () => ({ user: { id: 'u1' } }),
      getActiveGardenId: () => 'g1',
      getSupabaseClient: () => fake.client,
      hydrateActiveGardenPlants: async () => { hydrated += 1; },
    },
  });

  assert.equal(out.ok, true);
  assert.equal(out.created, true);
  assert.equal(out.duplicate, false);
  assert.equal(out.plant.id, 'p1');
  assert.equal(out.history.garden_plant_id, 'p1');
  assert.equal(hydrated, 1);
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].name, 'add_garden_plant_once_v1');
});

test('bridge retry returns authoritative existing Plant without health reset', async () => {
  const fake = fakeRpcSupabase({
    created: false,
    status: 'Needs attention',
    mark: '!',
  });

  const out = await persistConfirmedIdentifierPlant({
    result,
    canonicalSlug: 'monstera-deliciosa',
    commitToken: 'pi-save-1',
    personalDomain: {
      getSession: () => ({ user: { id: 'u1' } }),
      getActiveGardenId: () => 'g1',
      getSupabaseClient: () => fake.client,
      hydrateActiveGardenPlants: async () => true,
    },
  });

  assert.equal(out.ok, true);
  assert.equal(out.duplicate, true);
  assert.equal(out.created, false);
  assert.equal(out.plant.status, 'Needs attention');
  assert.equal(out.plant.mark, '!');
});

test('bridge surfaces canonical idempotency mismatch', async () => {
  const fake = fakeRpcSupabase({
    error: {
      code: '22023',
      message: 'idempotency_payload_mismatch',
    },
  });

  const out = await persistConfirmedIdentifierPlant({
    result,
    canonicalSlug: 'monstera-deliciosa',
    commitToken: 'pi-save-1',
    personalDomain: {
      getSession: () => ({ user: { id: 'u1' } }),
      getActiveGardenId: () => 'g1',
      getSupabaseClient: () => fake.client,
    },
  });

  assert.equal(out.ok, false);
  assert.equal(out.reason, 'idempotency_payload_mismatch');
});
