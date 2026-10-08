import { buildPlantDetailBaseViewModel } from './plant-detail-base-view-model.js';
import { buildPlantScheduleProjection } from './task-projection.js';

export const CARE_SECTION_IDS = Object.freeze([
  'watering',
  'light',
  'soil',
  'fertilizing',
  'pruning',
  'temperature_climate',
  'flowering_fruiting',
  'growth_planting',
  'warnings_safety',
]);

const LOCATION_RELIABLE = new Set(['confirmed', 'trusted']);

function normalizeSection(id, raw, taskById) {
  if (!raw) {
    return Object.freeze({
      id,
      summary: null,
      source: null,
      adaptedToGarden: false,
      linkedTaskId: null,
      linkedTask: null,
      unknown: true,
    });
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('invalid_care_section:' + id);
  }

  if (
    raw.dueOn != null ||
    raw.due_on != null ||
    raw.nextReviewDate != null ||
    raw.next_review_date != null
  ) {
    throw new Error('care_section_must_not_own_task_date:' + id);
  }

  const summary = raw.summary == null ? null : String(raw.summary).trim();
  const source = raw.source ?? raw.sourceRef ?? raw.source_ref ?? null;

  if (summary && !source) {
    throw new Error('care_guidance_source_required:' + id);
  }

  const linkedTaskId = raw.linkedTaskId ?? raw.linked_task_id ?? null;
  const linkedTask = linkedTaskId ? taskById.get(linkedTaskId) ?? null : null;

  if (linkedTaskId && !linkedTask) {
    throw new Error('care_linked_task_not_found:' + id + ':' + linkedTaskId);
  }

  return Object.freeze({
    id,
    summary: summary || null,
    source,
    adaptedToGarden: raw.adaptedToGarden === true || raw.adapted_to_garden === true,
    linkedTaskId,
    linkedTask,
    unknown: !summary,
  });
}

export function buildPlantCareViewModel({
  plantId,
  plants = [],
  areas = [],
  media = [],
  tasks = [],
  careGuidance = null,
  locationReliability = 'unknown',
} = {}) {
  const base = buildPlantDetailBaseViewModel({
    plantId,
    plants,
    areas,
    media,
    activeTab: 'care',
  });

  const schedule = buildPlantScheduleProjection({
    plantId,
    plants,
    tasks,
  });
  const taskById = new Map(schedule.rows.map((row) => [row.id, row]));

  const rawSections = careGuidance?.sections ?? {};
  if (rawSections && (typeof rawSections !== 'object' || Array.isArray(rawSections))) {
    throw new Error('invalid_care_sections');
  }

  const sections = CARE_SECTION_IDS.map((id) =>
    normalizeSection(id, rawSections[id] ?? null, taskById)
  );

  const climate = sections.find((section) => section.id === 'temperature_climate');
  if (
    climate?.adaptedToGarden &&
    !LOCATION_RELIABLE.has(String(locationReliability))
  ) {
    throw new Error('care_climate_adaptation_requires_confirmed_location');
  }

  const warnings = sections.find((section) => section.id === 'warnings_safety');

  return Object.freeze({
    ...base,
    sections: Object.freeze(sections),
    locationReliability,
    warningsKnown: warnings?.summary != null,
    taskIds: Object.freeze(schedule.rows.map((row) => row.id)),
  });
}

export function assertCareScheduleBoundary(viewModel) {
  if (!viewModel?.plant?.id) throw new Error('plant_care_identity_required');

  const taskIds = new Set(viewModel.taskIds || []);
  for (const section of viewModel.sections || []) {
    if (section.linkedTaskId && !taskIds.has(section.linkedTaskId)) {
      throw new Error('care_task_identity_mismatch:' + section.linkedTaskId);
    }

    if (section.summary && !section.source) {
      throw new Error('care_guidance_source_required:' + section.id);
    }
  }

  return true;
}
