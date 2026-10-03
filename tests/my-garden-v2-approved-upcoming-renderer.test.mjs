import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUpcomingListScreenViewModel,
  buildUpcomingCalendarScreenViewModel,
  assertUpcomingListCalendarTotalsMatch,
} from '../modules/my-garden-v2/task-screen-view-models.js';

import {
  renderUpcomingListScreen,
  renderUpcomingCalendarScreen,
  UPCOMING_APPROVED_VISUAL,
} from '../modules/my-garden-v2/approved-upcoming-renderer.js';

const plants = [
  { id: 'lemon', name: 'Lemon', archived: false },
  { id: 'lavender', name: 'Lavender', archived: false },
  { id: 'agave', name: 'Agave', archived: false },
  { id: 'hydrangea', name: 'Hydrangea', archived: false },
  { id: 'rosemary', name: 'Rosemary', archived: false },
  { id: 'olive', name: 'Olive', archived: false },
  { id: 'rose', name: 'Rose', archived: false },
  { id: 'basil', name: 'Basil', archived: false },
  { id: 'mango', name: 'Mango', archived: false },
];

const tasks = [
  { id: 't-water', garden_plant_id: 'lemon', title: 'Water', task_type: 'watering', due_on: '2026-10-02', done: false },
  { id: 't-prune', garden_plant_id: 'lavender', title: 'Prune', task_type: 'pruning', due_on: '2026-10-03', done: false },
  { id: 't-feed', garden_plant_id: 'agave', title: 'Fertilize', task_type: 'fertilizing', due_on: '2026-10-05', done: false },
  { id: 't-pests', garden_plant_id: 'hydrangea', title: 'Check for pests', task_type: 'inspect', due_on: '2026-10-07', done: false },
  { id: 't-harvest', garden_plant_id: 'rosemary', title: 'Harvest', task_type: 'harvest', due_on: '2026-10-08', done: false },
  { id: 't-done-1', garden_plant_id: 'olive', title: 'Water', task_type: 'watering', due_on: '2026-10-01', done: true },
  { id: 't-done-2', garden_plant_id: 'rose', title: 'Deadhead', task_type: 'pruning', due_on: '2026-09-30', done: true },
];

test('new Upcoming visual references are fingerprint locked', () => {
  assert.equal(
    UPCOMING_APPROVED_VISUAL.list.sha256,
    '03cca6920c02e4ec191f9dc1d8cfa197a4c1913a6da9b31af9e1a3b2385d7430'
  );
  assert.equal(
    UPCOMING_APPROVED_VISUAL.calendar.sha256,
    '322b3ef6c07203be8c5547930bd0a95ce2e79fb8824d01f7b1319f012212b4db'
  );
});

test('Upcoming List renderer uses derived task rows and derived counts', () => {
  const vm = buildUpcomingListScreenViewModel({
    plants,
    tasks,
    filter: 'to_do',
  });

  assert.deepEqual(vm.counts, { toDo: 5, completed: 2, cancelled: 0, all: 7 });

  const html = renderUpcomingListScreen(vm, {
    activePlantCount: plants.length,
    selectedDate: '2026-10-02',
  });

  assert.match(html, /To do <b>5<\/b>/);
  assert.match(html, /Completed <b>2<\/b>/);
  assert.match(html, /All <b>7<\/b>/);
  assert.match(html, /data-upcoming-action="filters"/);
  assert.doesNotMatch(html, /All active plants/);
  assert.match(html, /data-task-id="t-water"/);
  assert.match(html, /data-task-id="t-harvest"/);
  assert.doesNotMatch(html, /data-task-id="t-done-1"/);
});

test('Upcoming Calendar renderer uses the same totals and exact selected-day task identities', () => {
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

  assert.equal(assertUpcomingListCalendarTotalsMatch({ list, calendar }), true);
  assert.deepEqual(calendar.selectedDayRows.map((row) => row.id), ['t-water']);

  const html = renderUpcomingCalendarScreen(calendar, {
    activePlantCount: plants.length,
  });

  assert.match(html, /October 2026/);
  assert.doesNotMatch(html, /upcoming-status-filters/);
  assert.doesNotMatch(html, /All active plants/);
  assert.match(html, /data-upcoming-action="back"/);
  assert.match(html, /data-upcoming-date="2026-10-02"/);
  assert.match(html, /data-task-id="t-water"/);
});

test('renderer keeps bottom navigation visual-only and does not invent write behavior', () => {
  const vm = buildUpcomingListScreenViewModel({ plants, tasks, filter: 'to_do' });
  const html = renderUpcomingListScreen(vm);
  assert.match(html, /class="upcoming-bottom-nav"/);
  assert.doesNotMatch(html, /onclick=/);
  assert.doesNotMatch(html, /fetch\(/);
  assert.doesNotMatch(html, /supabase/i);
});
