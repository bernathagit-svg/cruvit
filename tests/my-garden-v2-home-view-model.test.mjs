import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMyGardenHomeViewModel,
  assertHomeViewModelConsistency,
} from '../modules/my-garden-v2/home-view-model.js';

const plants = [
  { id: 'p1', name: 'Lemon tree', archived: false },
  { id: 'p2', name: 'Rose', archived: false },
  { id: 'p3', name: 'Old basil', archived: true },
];

const tasks = [
  { id: 't1', garden_plant_id: 'p1', title: 'Fertilize', due_on: '2026-10-02', done: false },
  { id: 't2', garden_plant_id: 'p2', title: 'Check leaves', due_on: '2026-10-03', done: false },
  { id: 't3', garden_plant_id: 'p1', title: 'Watered', due_on: '2026-10-01', done: true },
  { id: 't4', garden_plant_id: 'p3', title: 'Archived task', due_on: '2026-10-01', done: false },
];

test('Home counts derive from active plants and canonical tasks', () => {
  const vm = buildMyGardenHomeViewModel({
    plants,
    tasks,
    today: '2026-10-02',
  });
  assert.deepEqual(vm.counts, {
    plants: 2,
    upcoming: 2,
    attention: 1,
  });
  assert.deepEqual(vm.activePlantIds, ['p1', 'p2']);
  assert.deepEqual(vm.pendingTaskIds, ['t1', 't2']);
  assert.deepEqual(vm.attentionTaskIds, ['t1']);
  assert.equal(assertHomeViewModelConsistency(vm), true);
});

test('Home attention preview points to exact plant/task identity', () => {
  const vm = buildMyGardenHomeViewModel({
    plants,
    tasks,
    today: '2026-10-02',
  });
  assert.deepEqual(vm.attentionPreview, {
    type: 'task',
    id: 't1',
    taskId: 't1',
    plantId: 'p1',
    plantName: 'Lemon tree',
    title: 'Fertilize',
    dueOn: '2026-10-02',
  });
});

test('archived plant tasks never inflate Home counts', () => {
  const vm = buildMyGardenHomeViewModel({
    plants,
    tasks,
    today: '2026-10-03',
  });
  assert.equal(vm.counts.plants, 2);
  assert.equal(vm.counts.upcoming, 2);
  assert.equal(vm.attentionTaskIds.includes('t4'), false);
});

test('external attention alerts are additive but do not duplicate task identity', () => {
  const vm = buildMyGardenHomeViewModel({
    plants,
    tasks,
    today: '2026-10-02',
    attentionAlerts: [
      { id: 'a1', title: 'Storm warning', detail: 'Protect sensitive plants' },
    ],
  });
  assert.equal(vm.counts.attention, 2);
  assert.equal(vm.attentionPreview.type, 'alert');
  assert.equal(assertHomeViewModelConsistency(vm), true);
});
