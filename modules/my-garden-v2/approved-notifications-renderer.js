const NOTIFICATIONS_REFERENCE_SHA =
  '36110c332c519ad959a173bd5fe6c1175308c847ff491ff5d02064549edf32d7';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));
}

function notificationRow(row, today) {
  if (!row?.id) throw new Error('notification_task_id_required');
  const state = row.dueOn === today ? 'today' : 'overdue';
  return Object.freeze({
    taskId: row.id,
    plantId: row.plantId ?? null,
    plantName: row.plantName ?? 'Plant',
    title: row.title ?? 'Task',
    dueOn: row.dueOn ?? null,
    state,
    priority: row.priority ?? null,
    taskType: row.taskType ?? null,
    actions: Object.freeze({
      markDone: Object.freeze({ action:'complete_task', taskId:row.id }),
      openPlant: row.plantId
        ? Object.freeze({ action:'open_plant', plantId:row.plantId })
        : null,
    }),
  });
}

export function buildApprovedNotificationsRenderModel(viewModel) {
  if (!viewModel?.counts || !Array.isArray(viewModel.rows)) {
    throw new Error('notifications_view_model_required');
  }

  const seen = new Set();
  const rows = viewModel.rows.map((row) => {
    if (seen.has(row.id)) throw new Error('duplicate_notification_task:' + row.id);
    seen.add(row.id);
    return notificationRow(row, viewModel.today);
  });

  const overdue = rows.filter((row) => row.state === 'overdue');
  const dueToday = rows.filter((row) => row.state === 'today');
  const plantCount = new Set(rows.map((row) => row.plantId).filter(Boolean)).size;

  if (viewModel.counts.attention !== rows.length) {
    throw new Error('notification_attention_count_mismatch');
  }
  if (viewModel.counts.today !== dueToday.length) {
    throw new Error('notification_today_count_mismatch');
  }
  if (viewModel.counts.overdue !== overdue.length) {
    throw new Error('notification_overdue_count_mismatch');
  }

  return Object.freeze({
    today:viewModel.today,
    filter:viewModel.filter,
    plantId:viewModel.plantId ?? null,
    counts:Object.freeze({
      attention:rows.length,
      today:dueToday.length,
      overdue:overdue.length,
      plants:plantCount,
    }),
    rows:Object.freeze(rows),
    overdue:Object.freeze(overdue),
    dueToday:Object.freeze(dueToday),
    actions:Object.freeze({
      openUpcoming:Object.freeze({ action:'open_upcoming' }),
      openCalendar:Object.freeze({ action:'open_upcoming_calendar' }),
      filterAttention:Object.freeze({ action:'filter_notifications', filter:'attention' }),
      filterToday:Object.freeze({ action:'filter_notifications', filter:'today' }),
      filterOverdue:Object.freeze({ action:'filter_notifications', filter:'overdue' }),
    }),
    visualReference:Object.freeze({
      id:'notifications',
      locked:true,
      sha256:NOTIFICATIONS_REFERENCE_SHA,
    }),
  });
}

export function renderNotificationsInteractionLayer(renderModel) {
  if (renderModel?.visualReference?.sha256 !== NOTIFICATIONS_REFERENCE_SHA) {
    throw new Error('notifications_visual_reference_mismatch');
  }

  const cards = renderModel.rows.map((row) =>
    '<article class="notifications-runtime-hit" data-task-id="' + esc(row.taskId) + '" ' +
      (row.plantId ? 'data-plant-id="' + esc(row.plantId) + '" ' : '') +
      'data-state="' + esc(row.state) + '">' +
      '<button type="button" data-action="complete_task" data-task-id="' + esc(row.taskId) + '" aria-label="Mark ' + esc(row.title) + ' as done"></button>' +
      (row.plantId ? '<button type="button" data-action="open_plant" data-plant-id="' + esc(row.plantId) + '" aria-label="Open ' + esc(row.plantName) + '"></button>' : '') +
    '</article>'
  ).join('');

  return '<div class="notifications-runtime-layer" data-attention-count="' +
    esc(renderModel.counts.attention) + '">' + cards + '</div>';
}

export function assertNotificationsVisualAcceptanceReady(renderModel) {
  if (renderModel?.visualReference?.locked !== true) {
    throw new Error('notifications_visual_reference_not_locked');
  }
  if (renderModel.visualReference.sha256 !== NOTIFICATIONS_REFERENCE_SHA) {
    throw new Error('notifications_visual_reference_fingerprint_mismatch');
  }
  return true;
}

export const NOTIFICATIONS_APPROVED_VISUAL = Object.freeze({
  fileName:'CRUVIT-Notifications-UI-2.10-PROPOSAL-v1.html',
  sha256:NOTIFICATIONS_REFERENCE_SHA,
});
