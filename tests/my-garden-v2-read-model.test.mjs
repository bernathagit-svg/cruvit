import test from 'node:test';
import assert from 'node:assert/strict';
import {
  taskState,
  activePlants,
  plantTasks,
  pendingGardenTasks,
  attentionTasks,
  homeSummary,
  plantHistory,
  gardenJournal,
  assertSameTaskIdentity,
} from '../modules/my-garden-v2/read-model.js';

const plants = [
  { id: 'p1', name: 'Lemon', archived: false },
  { id: 'p2', name: 'Rose', archived: false },
  { id: 'p3', name: 'Old Olive', archived: true },
];

const tasks = [
  { id: 't1', garden_plant_id: 'p1', title: 'Water', due_on: '2026-10-02', done: false },
  { id: 't2', garden_plant_id: 'p2', title: 'Check leaves', due_on: '2026-10-01', status: 'pending' },
  { id: 't3', garden_plant_id: 'p1', title: 'Feed', due_on: '2026-10-10', done: true },
  { id: 't4', garden_plant_id: 'p3', title: 'Archived task', due_on: '2026-10-01', done: false },
  { id: 't5', garden_plant_id: 'p2', title: 'Cancelled', due_on: '2026-10-01', cancelled_at: '2026-09-30T10:00:00Z' },
];

const events = [
  { id: 'e1', garden_plant_id: 'p1', event_type: 'note_added', occurred_at: '2026-10-01T10:00:00Z' },
  { id: 'e2', garden_plant_id: 'p2', event_type: 'care_logged', occurred_at: '2026-10-02T08:00:00Z' },
  { id: 'e3', garden_plant_id: 'p1', event_type: 'photo_added', occurred_at: '2026-10-02T09:00:00Z' },
];

test('legacy done maps to completed, cancellation wins only when non-contradictory', () => {
  assert.equal(taskState(tasks[0]), 'pending');
  assert.equal(taskState(tasks[2]), 'completed');
  assert.equal(taskState(tasks[4]), 'cancelled');
});

test('active plants excludes archived without copying identity', () => {
  assert.deepEqual(activePlants(plants).map(p => p.id), ['p1', 'p2']);
});

test('plant schedule and garden upcoming use same task IDs', () => {
  assert.deepEqual(plantTasks(tasks, 'p1').map(t => t.id), ['t1', 't3']);
  assert.deepEqual(pendingGardenTasks(tasks, plants).map(t => t.id), ['t1', 't2']);
});

test('attention is derived from pending due tasks only', () => {
  assert.deepEqual(attentionTasks(tasks, plants, '2026-10-02').map(t => t.id), ['t2', 't1']);
});

test('home summary derives counts rather than accepting hard-coded values', () => {
  const summary = homeSummary({ plants, tasks, today: '2026-10-02', attentionAlerts: [{ id: 'a1', kind: 'health' }] });
  assert.equal(summary.plantCount, 2);
  assert.equal(summary.upcomingCount, 2);
  assert.equal(summary.attentionCount, 3);
});

test('plant history and garden journal are two scopes of same event IDs', () => {
  assert.deepEqual(plantHistory(events, 'p1').map(e => e.id), ['e3', 'e1']);
  assert.deepEqual(gardenJournal(events).map(e => e.id), ['e3', 'e2', 'e1']);
});

test('duplicate record IDs fail loudly', () => {
  assert.throws(() => activePlants([{ id: 'p1' }, { id: 'p1' }]), /duplicate_plant_id/);
  assert.throws(() => gardenJournal([{ id: 'e1' }, { id: 'e1' }]), /duplicate_event_id/);
});

test('contradictory task lifecycle fails loudly', () => {
  assert.throws(() => taskState({ id: 'x', status: 'pending', done: true }), /contradictory_task_state/);
});

test('same task identity across projections is enforced', () => {
  const task = { id: 't1', garden_plant_id: 'p1', title: 'Water', due_on: '2026-10-02', done: false };
  assert.equal(assertSameTaskIdentity({ schedule: [task], upcoming: [{...task}], notifications: [{...task}] }), true);
  assert.throws(() => assertSameTaskIdentity({ schedule: [task], upcoming: [{...task, due_on:'2026-10-03'}] }), /task_projection_conflict/);
});
