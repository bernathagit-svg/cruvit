import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIdentifierAddIntent,
  persistConfirmedIdentifierPlant,
} from '../modules/plant-identifier/plant-identifier-mygarden-write-bridge-v1.js';

function fakeSupabase(row) {
  const calls = [];
  const chain = {
    upsert(payload, options) {
      calls.push({ op: 'upsert', payload, options });
      return chain;
    },
    select() { return chain; },
    async single() { return { data: row, error: null }; },
  };
  return {
    calls,
    client: {
      from(table) {
        calls.push({ op: 'from', table });
        return chain;
      },
    },
  };
}

const result = {
  common_name: 'Monstera',
  scientific_name: 'Monstera deliciosa',
};

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
    commitToken: 'x',
    personalDomain: {
      getSession: () => null,
    },
  });
  assert.equal(noAuth.ok, false);
  assert.equal(noAuth.reason, 'auth-required');

  const noGarden = await persistConfirmedIdentifierPlant({
    result,
    canonicalSlug: 'monstera-deliciosa',
    commitToken: 'x',
    personalDomain: {
      getSession: () => ({ user: { id: 'u1' } }),
      getActiveGardenId: () => null,
    },
  });
  assert.equal(noGarden.reason, 'active-garden-required');
});

test('bridge remains blocked until schema capability is enabled', async () => {
  const fake = fakeSupabase({});
  const out = await persistConfirmedIdentifierPlant({
    result,
    canonicalSlug: 'monstera-deliciosa',
    commitToken: 'x',
    supportsUnassessedHealth: false,
    personalDomain: {
      getSession: () => ({ user: { id: 'u1' } }),
      getActiveGardenId: () => 'g1',
      getSupabaseClient: () => fake.client,
    },
  });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'schema-capability-required');
  assert.equal(fake.calls.length, 0);
});

test('bridge persists exact canonical plant and hydrates active garden', async () => {
  const row = {
    id: 'p1',
    garden_profile_id: 'g1',
    user_id: 'u1',
    client_instance_id: 'identifier:pi-save-1',
    name: 'Monstera',
    status: 'unassessed',
    mark: 'unknown',
    source: 'Scan & Identify',
    profile_slug: 'monstera-deliciosa',
    scientific: 'Monstera deliciosa',
  };
  const fake = fakeSupabase(row);
  let hydrated = 0;
  const out = await persistConfirmedIdentifierPlant({
    result,
    canonicalSlug: 'monstera-deliciosa',
    commitToken: 'pi-save-1',
    supportsUnassessedHealth: true,
    personalDomain: {
      getSession: () => ({ user: { id: 'u1' } }),
      getActiveGardenId: () => 'g1',
      getSupabaseClient: () => fake.client,
      hydrateActiveGardenPlants: async () => { hydrated += 1; },
    },
  });

  assert.equal(out.ok, true);
  assert.equal(out.plant.id, 'p1');
  assert.equal(hydrated, 1);
  const write = fake.calls.find((c) => c.op === 'upsert');
  assert.equal(write.payload.profile_slug, 'monstera-deliciosa');
  assert.equal(write.payload.status, 'unassessed');
  assert.equal(write.payload.mark, 'unknown');
});
