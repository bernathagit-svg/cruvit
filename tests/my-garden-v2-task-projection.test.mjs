import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlantScheduleProjection,
  buildUpcomingProjection,
  buildCalendarProjection,
  buildNotificationsProjection,
  buildPendingTaskIds,
  assertTaskViewsConsistent,
} from '../modules/my-garden-v2/task-projection.js';

const plants = [
  { id: 'p1', name: 'Lemon tree', archived: false },
  { id: 'p2', name: 'Rose', archived: false },
  { id: 'p3', name: 'Archived olive', archived: true },
];

const tasks = [
  {
    id: 't1',
    garden_plant_id: 'p1',
    title: 'Fertilize',
    due_on: '2026-10-02',
    done: false,
    priority: 'Medium',
  },
  {
    id: 't2',
    garden_plant_id: 'p2',
    title: 'Check leaves',
    due_on: '2026-10-03',
    done: false,
  },
  {
    id: 't3',
    garden_plant_id: 'p1',
    title: 'Watered',
    due_on: '2026-10-01',
    done: true,
  },
  {
    id: 't4',
    garden_plant_id: 'p3',
    title: 'Archived task',
    due_on: '2026-10-01',
    done: false,
  },
];

test('same task ID has same projection in Schedule and Upcoming', () => {
  const schedule = buildPlantScheduleProjection({ plantId: 'p1', plants, tasks });
  const upcoming = buildUpcomingProjection({ plants, tasks });

  const a = schedule.rows.find((x) => x.id === 't1');
  const b = upcoming.rows.find((x) => x.id === 't1');

  assert.equal(a.id, b.id);
  assert.equal(a.plantId, b.plantId);
  assert.equal(a.title, b.title);
  assert.equal(a.dueOn, b.dueOn);
  assert.equal(a.state, b.state);
});

test('Calendar groups the exact same projected tasks by due date', () => {
  const calendar = buildCalendarProjection({ plants, tasks });
  assert.deepEqual(calendar.byDate.get('2026-10-02').map((x) => x.id), ['t1']);
  assert.deepEqual(calendar.byDate.get('2026-10-03').map((x) => x.id), ['t2']);
  assert.equal(calendar.rows.find((x) => x.id === 't1'), calendar.byDate.get('2026-10-02')[0]);
});

test('Notifications are derived from pending due tasks only', () => {
  const notifications = buildNotificationsProjection({
    plants,
    tasks,
    today: '2026-10-02',
  });

  assert.deepEqual(notifications.rows.map((x) => x.id), ['t1']);
  assert.deepEqual(notifications.dueToday.map((x) => x.id), ['t1']);
  assert.deepEqual(notifications.overdue.map((x) => x.id), []);
});

test('archived plant task never appears in garden-wide active projections', () => {
  const upcoming = buildUpcomingProjection({ plants, tasks });
  assert.equal(upcoming.rows.some((x) => x.id === 't4'), false);
  assert.equal(buildPendingTaskIds({ plants, tasks }).includes('t4'), false);
});

test('completed task stays historical but leaves pending and notifications', () => {
  const upcoming = buildUpcomingProjection({ plants, tasks });
  const notifications = buildNotificationsProjection({
    plants,
    tasks,
    today: '2026-10-05',
  });

  assert.equal(upcoming.completed.some((x) => x.id === 't3'), true);
  assert.equal(upcoming.pending.some((x) => x.id === 't3'), false);
  assert.equal(notifications.rows.some((x) => x.id === 't3'), false);
});

test('Schedule / Upcoming / Notifications pass shared identity consistency gate', () => {
  assert.equal(
    assertTaskViewsConsistent({
      plantId: 'p1',
      plants,
      tasks,
      today: '2026-10-02',
    }),
    true
  );
});
