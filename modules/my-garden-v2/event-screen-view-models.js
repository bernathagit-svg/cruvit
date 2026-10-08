import {
  buildPlantHistoryProjection,
  buildGardenJournalProjection,
  assertEventViewsConsistent,
} from './event-projection.js';
import { buildPlantDetailBaseViewModel } from './plant-detail-base-view-model.js';

function normalizeQuery(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

function searchRows(rows, query) {
  const q = normalizeQuery(query);
  if (!q) return [...rows];

  return rows.filter((row) => {
    const haystack = [
      row.title,
      row.note,
      row.plantName,
      row.eventType,
      row.occurredAt,
    ].filter(Boolean).join(' ').toLocaleLowerCase();
    return haystack.includes(q);
  });
}

function filterEventType(rows, eventType) {
  if (!eventType || eventType === 'all') return [...rows];
  return rows.filter((row) => row.eventType === eventType);
}

function groupByMonth(rows) {
  const groups = new Map();

  for (const row of rows) {
    const month = row.occurredAt && /^\d{4}-\d{2}/.test(row.occurredAt)
      ? row.occurredAt.slice(0, 7)
      : 'unknown';

    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(row);
  }

  return Object.freeze(
    [...groups.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, items]) => Object.freeze({
        month: month === 'unknown' ? null : month,
        rows: Object.freeze(items),
      }))
  );
}

export function buildPlantHistoryScreenViewModel({
  plantId,
  plants = [],
  areas = [],
  media = [],
  events = [],
  query = '',
  eventType = 'all',
} = {}) {
  const base = buildPlantDetailBaseViewModel({
    plantId,
    plants,
    areas,
    media,
    activeTab: 'history',
  });

  const projection = buildPlantHistoryProjection({
    plantId,
    plants,
    events,
  });

  let rows = filterEventType(projection.rows, eventType);
  rows = searchRows(rows, query);

  return Object.freeze({
    ...base,
    query: String(query ?? ''),
    eventType,
    rows: Object.freeze(rows),
    groups: groupByMonth(rows),
    eventIds: Object.freeze(rows.map((row) => row.id)),
  });
}

export function buildGardenJournalScreenViewModel({
  plants = [],
  events = [],
  query = '',
  plantId = null,
  eventType = 'all',
  scope = 'all',
} = {}) {
  if (!['all', 'active', 'archived'].includes(scope)) {
    throw new Error('invalid_journal_scope:' + scope);
  }

  const allowedPlantIds = new Set(
    plants
      .filter((plant) =>
        scope === 'all' ||
        (scope === 'archived' ? plant.archived === true : plant.archived !== true)
      )
      .map((plant) => plant.id)
  );

  const projection = buildGardenJournalProjection({
    plants,
    events,
    plantId,
    eventType: eventType === 'all' ? null : eventType,
  });

  let rows = projection.rows.filter((row) =>
    row.plantId == null || allowedPlantIds.has(row.plantId)
  );
  rows = searchRows(rows, query);

  return Object.freeze({
    query: String(query ?? ''),
    plantId,
    eventType,
    scope,
    rows: Object.freeze(rows),
    groups: groupByMonth(rows),
    eventIds: Object.freeze(rows.map((row) => row.id)),
  });
}

export function assertHistoryJournalIdentity({
  plantId,
  plants = [],
  events = [],
} = {}) {
  return assertEventViewsConsistent({ plantId, plants, events });
}
