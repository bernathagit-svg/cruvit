import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareAddPlantIntent,
  gardenPlantInsertSchemaGate,
} from '../modules/my-garden-v2/add-plant-contract.js';
import {
  buildGardenPlantInsert,
  createAddPlantWriteRepository,
} from '../modules/my-garden-v2/add-plant-write-repository.js';

function makeSupabase(returnRow) {
  const calls = [];
  const chain = {
    insert(payload) {
      calls.push({ op: 'insert', payload });
      return chain;
    },
    select(columns) {
      calls.push({ op: 'select', columns });
      return chain;
    },
    async single() {
      calls.push({ op: 'single' });
      return { data: returnRow, error: null };
    },
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

const base = {
  gardenProfileId: 'g1',
  clientInstanceId: 'scan-1',
  displayName: 'Monstera',
  mode: 'scan',
  identityConfirmed: true,
  canonicalSlug: 'monstera-deliciosa',
  scientificName: 'Monstera deliciosa',
};

test('schema gate stays blocked until capability is explicitly enabled', () => {
  const intent = prepareAddPlantIntent(base);
  assert.equal(gardenPlantInsertSchemaGate(intent).blocked, true);
  assert.equal(
    gardenPlantInsertSchemaGate(intent, { supportsUnassessedHealth: true }).blocked,
    false
  );
});

test('insert payload preserves canonical identity and starts health unknown', () => {
  const intent = prepareAddPlantIntent(base);
  const payload = buildGardenPlantInsert(intent);
  assert.deepEqual(payload, {
    garden_profile_id: 'g1',
    client_instance_id: 'scan-1',
    name: 'Monstera',
    status: 'unassessed',
    mark: 'unknown',
    source: 'Scan & Identify',
    profile_slug: 'monstera-deliciosa',
    scientific: 'Monstera deliciosa',
    garden_area_id: null,
  });
});

test('repository refuses write before schema capability is enabled', async () => {
  const intent = prepareAddPlantIntent(base);
  const fake = makeSupabase({});
  const repo = createAddPlantWriteRepository(fake.client);

  await assert.rejects(
    () => repo.insert(intent),
    /GARDEN_PLANT_HEALTH_UNKNOWN_NOT_REPRESENTABLE/
  );
  assert.equal(fake.calls.length, 0);
});

test('repository writes one exact unassessed plant after capability enablement', async () => {
  const intent = prepareAddPlantIntent(base);
  const row = {
    id: 'p1',
    garden_profile_id: 'g1',
    user_id: 'u1',
    client_instance_id: 'scan-1',
    name: 'Monstera',
    status: 'unassessed',
    mark: 'unknown',
    source: 'Scan & Identify',
    profile_slug: 'monstera-deliciosa',
    scientific: 'Monstera deliciosa',
    garden_area_id: null,
  };
  const fake = makeSupabase(row);
  const repo = createAddPlantWriteRepository(fake.client, {
    supportsUnassessedHealth: true,
  });

  const saved = await repo.insert(intent);
  assert.equal(saved.id, 'p1');
  const write = fake.calls.find((c) => c.op === 'insert');
  assert.equal(write.payload.status, 'unassessed');
  assert.equal(write.payload.mark, 'unknown');
  assert.equal(write.payload.profile_slug, 'monstera-deliciosa');
});

test('unconfirmed scan still cannot persist canonical identity', () => {
  assert.throws(
    () => prepareAddPlantIntent({
      ...base,
      identityConfirmed: false,
    }),
    /unconfirmed_scan_must_not_assign_canonical_identity/
  );
});
