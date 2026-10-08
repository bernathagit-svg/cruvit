import test from 'node:test';
import assert from 'node:assert/strict';
import {
  preparePlantLifecycleIntent,
  plantLifecycleWriteGate,
  assertLifecyclePreservesIdentity,
} from '../modules/my-garden-v2/plant-lifecycle-contract.js';

test('archive changes state on same Plant Instance without clone/delete', () => {
  const intent = preparePlantLifecycleIntent({
    gardenProfileId: 'g1',
    plant: { id: 'p1', garden_profile_id: 'g1', archived: false },
    action: 'archive',
  });

  assert.equal(intent.plantId, 'p1');
  assert.equal(intent.fromArchived, false);
  assert.equal(intent.toArchived, true);
  assert.equal(intent.eventType, 'plant_archived');
  assert.equal(assertLifecyclePreservesIdentity(intent), true);
});

test('restore changes state on same Plant Instance without clone/delete', () => {
  const intent = preparePlantLifecycleIntent({
    gardenProfileId: 'g1',
    plant: { id: 'p1', garden_profile_id: 'g1', archived: true },
    action: 'restore',
  });

  assert.equal(intent.plantId, 'p1');
  assert.equal(intent.fromArchived, true);
  assert.equal(intent.toArchived, false);
  assert.equal(intent.eventType, 'plant_restored');
  assert.equal(assertLifecyclePreservesIdentity(intent), true);
});

test('live archive/restore pair stays blocked until restore event is supported', () => {
  const intent = preparePlantLifecycleIntent({
    gardenProfileId: 'g1',
    plant: { id: 'p1', garden_profile_id: 'g1', archived: true },
    action: 'restore',
  });

  const gate = plantLifecycleWriteGate(intent);
  assert.equal(gate.blocked, true);
  assert.equal(gate.missingEventType, 'plant_restored');
});

test('cross-garden lifecycle mutation is rejected', () => {
  assert.throws(
    () => preparePlantLifecycleIntent({
      gardenProfileId: 'g1',
      plant: { id: 'p1', garden_profile_id: 'g2', archived: false },
      action: 'archive',
    }),
    /plant_garden_mismatch/
  );
});
