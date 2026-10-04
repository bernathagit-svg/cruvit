import {
  buildPlantScheduleProjection,
  buildUpcomingProjection,
  buildCalendarProjection,
  buildNotificationsProjection,
} from './task-projection.js';
import { buildPlantDetailBaseViewModel } from './plant-detail-base-view-model.js';

const TASK_FILTERS = new Set(['to_do', 'completed', 'cancelled', 'all']);

function dateOnly(value, code = 'date_required') {
  if (typeof value !== 'string') throw new Error(code);
  const match = /^(\d{4}-\d{2}-\d{2})$/.exec(value);
  if (!match) throw new Error(code);
  return match[1];
}

function monthOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) {
    throw new Error('month_required');
  }
  return value;
}

function filterRows(rows, filter) {
  if (!TASK_FILTERS.has(filter)) throw new Error('invalid_task_filter:' + filter);
  if (filter === 'all') return [...rows];
  if (filter === 'to_do') return rows.filter((row) => row.state === 'pending');
  return rows.filter((row) => row.state === filter);
}

function scopePlant(rows, plantId) {
  if (!plantId) return [...rows];
  return rows.filter((row) => row.plantId === plantId);
}

function groupByDueDate(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.dueOn ?? 'undated';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Object.freeze(
    [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => Object.freeze({
        date: date === 'undated' ? null : date,
        rows: Object.freeze(items),
      }))
  );
}

export function buildPlantScheduleScreenViewModel({
  plantId,
  plants = [],
  areas = [],
  media = [],
  tasks = [],
  selectedDate,
  selectedMonth,
  filter = 'all',
} = {}) {
  const base = buildPlantDetailBaseViewModel({
    plantId,
    plants,
    areas,
    media,
    activeTab: 'schedule',
  });
  const projection = buildPlantScheduleProjection({ plantId, plants, tasks });

  const day = selectedDate ? dateOnly(selectedDate, 'selected_date_required') : null;
  const month = selectedMonth
    ? monthOnly(selectedMonth)
    : day
      ? day.slice(0, 7)
      : null;

  const filtered = filterRows(projection.rows, filter);
  const monthRows = month
    ? filtered.filter((row) => row.dueOn?.slice(0, 7) === month)
    : filtered;

  const selectedDayRows = day
    ? monthRows.filter((row) => row.dueOn === day)
    : [];

  const upcoming = day
    ? filtered.filter((row) =>
        row.state === 'pending' &&
        row.dueOn != null &&
        row.dueOn > day
      )
    : filtered.filter((row) => row.state === 'pending');

  return Object.freeze({
    ...base,
    filter,
    selectedDate: day,
    selectedMonth: month,
    rows: Object.freeze(filtered),
    monthRows: Object.freeze(monthRows),
    selectedDayRows: Object.freeze(selectedDayRows),
    upcomingRows: Object.freeze(upcoming),
    taskIds: Object.freeze(filtered.map((row) => row.id)),
  });
}

export function buildUpcomingListScreenViewModel({
  plants = [],
  tasks = [],
  filter = 'to_do',
  plantId = null,
} = {}) {
  const projection = buildUpcomingProjection({ plants, tasks });
  let rows = filterRows(projection.rows, filter);
  rows = scopePlant(rows, plantId);

  return Object.freeze({
    filter,
    plantId,
    rows: Object.freeze(rows),
    groups: groupByDueDate(rows),
    counts: Object.freeze({
      toDo: scopePlant(projection.pending, plantId).length,
      completed: scopePlant(projection.completed, plantId).length,
      cancelled: scopePlant(projection.cancelled, plantId).length,
      all: scopePlant(projection.rows, plantId).length,
    }),
  });
}

export function buildUpcomingCalendarScreenViewModel({
  plants = [],
  tasks = [],
  selectedMonth,
  selectedDate,
  filter = 'to_do',
  plantId = null,
} = {}) {
  const month = monthOnly(selectedMonth);
  const day = dateOnly(selectedDate, 'selected_date_required');

  if (day.slice(0, 7) !== month) {
    throw new Error('selected_date_outside_month');
  }

  const calendar = buildCalendarProjection({ plants, tasks });
  const allScopedRows = scopePlant(calendar.rows, plantId);
  const statusCounts = Object.freeze({
    toDo: allScopedRows.filter((row) => row.state === 'pending').length,
    completed: allScopedRows.filter((row) => row.state === 'completed').length,
    cancelled: allScopedRows.filter((row) => row.state === 'cancelled').length,
    all: allScopedRows.length,
  });

  let rows = filterRows(allScopedRows, filter);
  rows = rows.filter((row) => row.dueOn?.slice(0, 7) === month);

  const byDate = new Map();
  for (const row of rows) {
    if (!row.dueOn) continue;
    if (!byDate.has(row.dueOn)) byDate.set(row.dueOn, []);
    byDate.get(row.dueOn).push(row);
  }

  return Object.freeze({
    filter,
    plantId,
    selectedMonth: month,
    selectedDate: day,
    rows: Object.freeze(rows),
    byDate,
    selectedDayRows: Object.freeze([...(byDate.get(day) || [])]),
    counts: statusCounts,
  });
}

export function buildNotificationsScreenViewModel({
  plants = [],
  tasks = [],
  today,
  plantId = null,
  filter = 'attention',
} = {}) {
  const day = dateOnly(today, 'today_required');
  if (!['attention', 'today', 'overdue'].includes(filter)) {
    throw new Error('invalid_notification_filter:' + filter);
  }

  const projection = buildNotificationsProjection({ plants, tasks, today: day });

  const scoped = (rows) => scopePlant(rows, plantId);
  const all = scoped(projection.rows);
  const overdue = scoped(projection.overdue);
  const dueToday = scoped(projection.dueToday);

  const rows =
    filter === 'overdue' ? overdue
    : filter === 'today' ? dueToday
    : all;

  return Object.freeze({
    today: day,
    plantId,
    filter,
    rows: Object.freeze(rows),
    counts: Object.freeze({
      attention: all.length,
      today: dueToday.length,
      overdue: overdue.length,
    }),
  });
}

export function assertTaskScreenIdentity({
  schedule,
  upcoming,
  calendar,
  notifications,
} = {}) {
  const canonical = new Map();

  for (const [view, rows] of Object.entries({
    schedule: schedule?.rows || [],
    upcoming: upcoming?.rows || [],
    calendar: calendar?.rows || [],
    notifications: notifications?.rows || [],
  })) {
    for (const row of rows) {
      const fingerprint = JSON.stringify({
        plantId: row.plantId,
        title: row.title,
        dueOn: row.dueOn,
        state: row.state,
      });

      if (!canonical.has(row.id)) canonical.set(row.id, { view, fingerprint });
      else if (canonical.get(row.id).fingerprint !== fingerprint) {
        throw new Error(
          'task_screen_identity_conflict:' +
          row.id + ':' +
          canonical.get(row.id).view + ':' +
          view
        );
      }
    }
  }

  return true;
}


export function assertUpcomingListCalendarTotalsMatch({
  list,
  calendar,
} = {}) {
  if (!list?.counts || !calendar?.counts) {
    throw new Error('upcoming_counts_required');
  }

  const keys = ['toDo','completed','cancelled','all'];
  for (const key of keys) {
    if (list.counts[key] !== calendar.counts[key]) {
      throw new Error(
        'upcoming_list_calendar_count_mismatch:' +
        key + ':' + list.counts[key] + ':' + calendar.counts[key]
      );
    }
  }
  return true;
}
