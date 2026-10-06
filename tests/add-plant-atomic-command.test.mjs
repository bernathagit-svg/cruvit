import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareAddPlantIntent } from '../modules/my-garden-v2/add-plant-contract.js';
import { createAtomicAddPlantCommand } from '../modules/my-garden-v2/add-plant-write-repository.js';

function fakeSupabase(response) {
  const calls = [];
  return {
    calls,
    client: {
      async rpc(name, args) {
        calls.push({ name, args });
        return response;
      },
    },
  };
}

function intent() {
  return prepareAddPlantIntent({
    mode: 'scan',
    gardenProfileId: 'g1',
    clientInstanceId: 'identifier:scan-1',
    displayName: 'Monstera',
    identityConfirmed: true,
    canonicalSlug: 'monstera-deliciosa',
    scientificName: 'Monstera deliciosa',
  });
}

test('atomic command calls one RPC and no table write API', async () => {
  const fake = fakeSupabase({
    data: {
      ok: true,
      created: true,
      historyCreated: true,
      plant: {
        id: 'p1',
        garden_profile_id: 'g1',
        client_instance_id: 'identifier:scan-1',
        name: 'Monstera',
        status: 'unassessed',
        mark: 'unknown',
        profile_slug: 'monstera-deliciosa',
        scientific: 'Monstera deliciosa',
      },
      history: {
        id: 'e1',
        garden_plant_id: 'p1',
        event_type: 'plant_added',
        source_module: 'plant_identifier',
      },
    },
    error: null,
  });

  const command = createAtomicAddPlantCommand(fake.client);
  const out = await command.execute(intent());

  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].name, 'add_garden_plant_once_v1');
  assert.deepEqual(fake.calls[0].args, {
    p_garden_profile_id: 'g1',
    p_client_instance_id: 'identifier:scan-1',
    p_display_name: 'Monstera',
    p_mode: 'scan',
    p_profile_slug: 'monstera-deliciosa',
    p_scientific: 'Monstera deliciosa',
    p_garden_area_id: null,
  });
  assert.equal(out.created, true);
  assert.equal(out.historyCreated, true);
  assert.equal(out.plant.id, 'p1');
});

test('atomic command accepts retry response without requiring unassessed health', async () => {
  const fake = fakeSupabase({
    data: {
      ok: true,
      created: false,
      historyCreated: false,
      plant: {
        id: 'p1',
        garden_profile_id: 'g1',
        client_instance_id: 'identifier:scan-1',
        name: 'Renamed later',
        status: 'Needs attention',
        mark: '!',
        profile_slug: 'monstera-deliciosa',
        scientific: 'Monstera deliciosa',
      },
      history: {
        id: 'e1',
        garden_plant_id: 'p1',
        event_type: 'plant_added',
        source_module: 'plant_identifier',
      },
    },
    error: null,
  });

  const out = await createAtomicAddPlantCommand(fake.client).execute(intent());
  assert.equal(out.created, false);
  assert.equal(out.plant.status, 'Needs attention');
  assert.equal(out.plant.mark, '!');
});

test('atomic command surfaces RPC idempotency mismatch explicitly', async () => {
  const fake = fakeSupabase({
    data: null,
    error: {
      code: '22023',
      message: 'idempotency_payload_mismatch',
    },
  });

  await assert.rejects(
    () => createAtomicAddPlantCommand(fake.client).execute(intent()),
    /idempotency_payload_mismatch/
  );
});
