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

  const alertItems = attentionAlerts.map((alert) => Object.freeze({
    type: 'alert',
    id: alert.id,
    title: alert.title ?? alert.label ?? 'Needs attention',
    detail: alert.detail ?? alert.message ?? '',
    displayText: alert.displayText ?? alert.display_text ?? null,
  }));

  const taskItems = attention.map((task) => {
    const plant = plantsById.get(taskPlantId(task));
    return Object.freeze({
      type: 'task',
      id: task.id,
      taskId: task.id,
      plantId: taskPlantId(task),
      plantName: plantLabel(plant),
      title: task.title ?? 'Task',
      dueOn: dueDate(task),
      displayText: task.displayText ?? task.display_text ?? null,
    });
  });

  const attentionItems = Object.freeze([...alertItems, ...taskItems]);
  const attentionPreview = attentionItems[0] ?? null;

  return Object.freeze({
    counts: Object.freeze({
      plants: summary.plantCount,
      upcoming: summary.upcomingCount,
      attention: summary.attentionCount,
    }),
    attentionPreview,
    attentionItems,
    activePlantIds: Object.freeze(active.map((p) => p.id)),
    pendingTaskIds: Object.freeze(pending.map((t) => t.id)),
    attentionTaskIds: Object.freeze(attention.map((t) => t.id)),
  });
}

export function assertHomeViewModelConsistency(viewModel) {
  if (!viewModel || typeof viewModel !== 'object') throw new Error('home_view_model_required');
  const { counts, activePlantIds, pendingTaskIds, attentionTaskIds, attentionItems } = viewModel;
  if (counts.plants !== activePlantIds.length) throw new Error('home_plant_count_mismatch');
  if (counts.upcoming !== pendingTaskIds.length) throw new Error('home_upcoming_count_mismatch');
  if (counts.attention < attentionTaskIds.length) throw new Error('home_attention_count_mismatch');
  if (!Array.isArray(attentionItems) || attentionItems.length !== counts.attention) throw new Error('home_attention_items_mismatch');
  return true;
}
