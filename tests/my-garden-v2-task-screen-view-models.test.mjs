import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlantScheduleScreenViewModel,
  buildUpcomingListScreenViewModel,
  buildUpcomingCalendarScreenViewModel,
  buildNotificationsScreenViewModel,
  assertTaskScreenIdentity,
  assertUpcomingListCalendarTotalsMatch,
} from '../modules/my-garden-v2/task-screen-view-models.js';

const plants = [
  { id: 'p1', name: 'Lemon tree', archived: false },
  { id: 'p2', name: 'Rose', archived: false },
];

const tasks = [
  { id: 't1', garden_plant_id: 'p1', title: 'Water', due_on: '2026-10-02', done: false },
  { id: 't2', garden_plant_id: 'p1', title: 'Feed', due_on: '2026-10-05', done: false },
  { id: 't3', garden_plant_id: 'p2', title: 'Check leaves', due_on: '2026-10-02', done: false },
  { id: 't4', garden_plant_id: 'p1', title: 'Old pruning', due_on: '2026-09-20', done: true },
];

test('Plant Schedule selected day uses the same task IDs as Upcoming', () => {
  const schedule = buildPlantScheduleScreenViewModel({
    plantId: 'p1',
    plants,
    tasks,
    selectedDate: '2026-10-02',
    selectedMonth: '2026-10',
  });

  const upcoming = buildUpcomingListScreenViewModel({
    plants,
    tasks,
    filter: 'all',
  });

  assert.deepEqual(schedule.selectedDayRows.map((x) => x.id), ['t1']);
  assert.equal(upcoming.rows.find((x) => x.id === 't1').dueOn, '2026-10-02');
  assert.equal(assertTaskScreenIdentity({ schedule, upcoming }), true);
});

test('Upcoming list counts are derived, not separately authored', () => {
  const vm = buildUpcomingListScreenViewModel({ plants, tasks });
  assert.deepEqual(vm.counts, {
    toDo: 3,
    completed: 1,
    cancelled: 0,
    all: 4,
  });
});

test('Calendar selected-day tasks are the same task rows', () => {
  const vm = buildUpcomingCalendarScreenViewModel({
    plants,
    tasks,
    selectedMonth: '2026-10',
    selectedDate: '2026-10-02',
    filter: 'to_do',
  });

  assert.deepEqual(vm.selectedDayRows.map((x) => x.id), ['t1', 't3']);
  assert.equal(vm.byDate.get('2026-10-02')[0], vm.selectedDayRows[0]);
  assert.deepEqual(vm.counts, {
    toDo: 3,
    completed: 1,
    cancelled: 0,
    all: 4,
  });
});

test('Notifications are the due subset of the same task identities', () => {
  const vm = buildNotificationsScreenViewModel({
    plants,
    tasks,
    today: '2026-10-02',
  });

  assert.deepEqual(vm.rows.map((x) => x.id), ['t1', 't3']);
  assert.deepEqual(vm.counts, {
    attention: 2,
    today: 2,
    overdue: 0,
  });
});

test('plant filter changes view only, never task ownership', () => {
  const vm = buildUpcomingListScreenViewModel({
    plants,
    tasks,
    filter: 'all',
    plantId: 'p1',
  });

  assert.equal(vm.rows.every((x) => x.plantId === 'p1'), true);
  assert.deepEqual(vm.rows.map((x) => x.id), ['t1', 't2', 't4']);
});

test('invalid selected month/date relationship fails loudly', () => {
  assert.throws(
    () => buildUpcomingCalendarScreenViewModel({
      plants,
      tasks,
      selectedMonth: '2026-10',
      selectedDate: '2026-11-01',
    }),
    /selected_date_outside_month/
  );
});


test('List and Calendar status totals are identical for the same garden scope', () => {
  const list = buildUpcomingListScreenViewModel({
    plants,
    tasks,
    filter: 'to_do',
  });
  const calendar = buildUpcomingCalendarScreenViewModel({
    plants,
    tasks,
    selectedMonth: '2026-10',
    selectedDate: '2026-10-02',
    filter: 'to_do',
  });

  assert.deepEqual(calendar.counts, list.counts);
  assert.equal(assertUpcomingListCalendarTotalsMatch({ list, calendar }), true);
});

test('List and Calendar status totals stay identical under the same plant filter', () => {
  const list = buildUpcomingListScreenViewModel({
    plants,
    tasks,
    filter: 'all',
    plantId: 'p1',
  });
  const calendar = buildUpcomingCalendarScreenViewModel({
    plants,
    tasks,
    selectedMonth: '2026-10',
    selectedDate: '2026-10-02',
    filter: 'all',
    plantId: 'p1',
  });

  assert.deepEqual(calendar.counts, list.counts);
  assert.equal(assertUpcomingListCalendarTotalsMatch({ list, calendar }), true);
});
