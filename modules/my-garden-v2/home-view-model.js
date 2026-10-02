import {
  homeSummary,
  attentionTasks,
  activePlants,
  pendingGardenTasks,
} from './read-model.js';

function plantLabel(row) {
  return row?.name || row?.plant_name || row?.scientific || 'Plant';
}

function taskPlantId(task) {
  return task?.garden_plant_id ?? task?.plant_instance_id ?? null;
}

function dueDate(task) {
  return task?.due_on ?? task?.due_at ?? task?.dueOn ?? null;
}

export function buildMyGardenHomeViewModel({
  plants = [],
  tasks = [],
  attentionAlerts = [],
  today,
} = {}) {
  const summary = homeSummary({ plants, tasks, attentionAlerts, today });
  const active = activePlants(plants);
  const pending = pendingGardenTasks(tasks, plants);
  const attention = attentionTasks(tasks, plants, today);
  const plantsById = new Map(active.map((p) => [p.id, p]));

  const firstTask = attention[0] ?? null;
  const firstAlert = attentionAlerts[0] ?? null;

  let attentionPreview = null;
  if (firstAlert) {
    attentionPreview = Object.freeze({
      type: 'alert',
      id: firstAlert.id,
      title: firstAlert.title ?? firstAlert.label ?? 'Needs attention',
      detail: firstAlert.detail ?? firstAlert.message ?? '',
    });
  } else if (firstTask) {
    const plant = plantsById.get(taskPlantId(firstTask));
    attentionPreview = Object.freeze({
      type: 'task',
      id: firstTask.id,
      taskId: firstTask.id,
      plantId: taskPlantId(firstTask),
      plantName: plantLabel(plant),
      title: firstTask.title ?? 'Task',
      dueOn: dueDate(firstTask),
    });
  }

  return Object.freeze({
    counts: Object.freeze({
      plants: summary.plantCount,
      upcoming: summary.upcomingCount,
      attention: summary.attentionCount,
    }),
    attentionPreview,
    activePlantIds: Object.freeze(active.map((p) => p.id)),
    pendingTaskIds: Object.freeze(pending.map((t) => t.id)),
    attentionTaskIds: Object.freeze(attention.map((t) => t.id)),
  });
}

export function assertHomeViewModelConsistency(viewModel) {
  if (!viewModel || typeof viewModel !== 'object') throw new Error('home_view_model_required');
  const { counts, activePlantIds, pendingTaskIds, attentionTaskIds } = viewModel;
  if (counts.plants !== activePlantIds.length) throw new Error('home_plant_count_mismatch');
  if (counts.upcoming !== pendingTaskIds.length) throw new Error('home_upcoming_count_mismatch');
  if (counts.attention < attentionTaskIds.length) throw new Error('home_attention_count_mismatch');
  return true;
}
