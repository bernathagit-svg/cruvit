import {
  plantHistory,
  gardenJournal,
} from './read-model.js';
import { indexUniqueById } from './plant-instance-projection.js';

function objectPayload(value, eventId) {
  if (value == null) return Object.freeze({});
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_event_payload:' + eventId);
  }
  return Object.freeze({ ...value });
}

function canonicalEventRow(event, plantsById) {
  const plantId = event.garden_plant_id ?? event.plant_instance_id ?? null;
  const plant = plantId ? plantsById.get(plantId) ?? null : null;
  const payload = objectPayload(event.payload, event.id);

  return Object.freeze({
    id: event.id,
    plantId,
    plantName: plant?.name ?? payload.plant_name ?? null,
    taskId: event.garden_task_id ?? payload.task_id ?? null,
    eventType: event.event_type ?? null,
    sourceModule: event.source_module ?? null,
    occurredAt: event.occurred_at ?? event.occurredAt ?? event.created_at ?? null,
    createdAt: event.created_at ?? null,
    // UI text must come from explicit event payload or the event type itself.
    // Never infer that a generic event means "Watered", "Fertilized", etc.
    title: payload.title ?? payload.label ?? event.event_type ?? null,
    note: payload.note ?? payload.user_note ?? payload.text ?? null,
    mediaId: payload.media_id ?? payload.garden_media_id ?? null,
    payload,
    raw: event,
  });
}

function projectEvents(events, plants) {
  const plantsById = indexUniqueById(plants, 'plant');
  return events.map((event) => canonicalEventRow(event, plantsById));
}

export function buildPlantHistoryProjection({
  plantId,
  plants = [],
  events = [],
} = {}) {
  const rows = projectEvents(plantHistory(events, plantId), plants);
  return Object.freeze({
    plantId,
    rows: Object.freeze(rows),
  });
}

export function buildGardenJournalProjection({
  plants = [],
  events = [],
  plantId = null,
  eventType = null,
} = {}) {
  const rows = projectEvents(
    gardenJournal(events, { plantId, eventType }),
    plants
  );

  return Object.freeze({
    plantId,
    eventType,
    rows: Object.freeze(rows),
  });
}

export function assertEventViewsConsistent({
  plantId,
  plants = [],
  events = [],
} = {}) {
  const history = buildPlantHistoryProjection({ plantId, plants, events });
  const journal = buildGardenJournalProjection({ plants, events, plantId });

  const journalById = new Map(journal.rows.map((row) => [row.id, row]));

  for (const historyRow of history.rows) {
    const journalRow = journalById.get(historyRow.id);
    if (!journalRow) throw new Error('history_event_missing_from_journal:' + historyRow.id);

    const a = JSON.stringify({
      id: historyRow.id,
      plantId: historyRow.plantId,
      taskId: historyRow.taskId,
      eventType: historyRow.eventType,
      occurredAt: historyRow.occurredAt,
      mediaId: historyRow.mediaId,
    });
    const b = JSON.stringify({
      id: journalRow.id,
      plantId: journalRow.plantId,
      taskId: journalRow.taskId,
      eventType: journalRow.eventType,
      occurredAt: journalRow.occurredAt,
      mediaId: journalRow.mediaId,
    });

    if (a !== b) throw new Error('event_projection_conflict:' + historyRow.id);
  }

  return true;
}
