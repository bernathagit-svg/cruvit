const TASK_STATES = new Set(['pending', 'completed', 'cancelled']);

function requireId(row, label) {
  const id = row?.id;
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error(`${label}_id_required`);
  }
  return id;
}

function uniqueRows(rows, label) {
  const seen = new Set();
  return (rows || []).map((row) => {
    const id = requireId(row, label);
    if (seen.has(id)) throw new Error(`duplicate_${label}_id:${id}`);
    seen.add(id);
    return row;
  });
}

export function taskState(task) {
  requireId(task, 'task');
  const explicit = task.status ?? task.state ?? null;
  const hasDone = task.done === true;
  const hasCancelled = Boolean(task.cancelled_at || task.cancelledAt || task.cancellation);

  if (explicit != null) {
    if (!TASK_STATES.has(explicit)) throw new Error(`invalid_task_state:${explicit}`);
    if (explicit === 'pending' && (hasDone || hasCancelled)) throw new Error(`contradictory_task_state:${task.id}`);
    if (explicit === 'completed' && hasCancelled) throw new Error(`contradictory_task_state:${task.id}`);
    if (explicit === 'cancelled' && hasDone) throw new Error(`contradictory_task_state:${task.id}`);
    return explicit;
  }
  if (hasCancelled) return 'cancelled';
  if (hasDone) return 'completed';
  return 'pending';
}

export function activePlants(plants) {
  return uniqueRows(plants, 'plant').filter((p) => p.archived !== true);
}

export function plantTasks(tasks, plantId, { includeCompleted = true, includeCancelled = true } = {}) {
  if (typeof plantId !== 'string' || !plantId.trim()) throw new Error('plant_id_required');
  return uniqueRows(tasks, 'task').filter((t) => {
    if (t.garden_plant_id !== plantId && t.plant_instance_id !== plantId) return false;
    const state = taskState(t);
    if (!includeCompleted && state === 'completed') return false;
    if (!includeCancelled && state === 'cancelled') return false;
    return true;
  });
}

export function gardenTasks(tasks, plants, { includeCompleted = true, includeCancelled = true } = {}) {
  const activePlantIds = new Set(activePlants(plants).map((p) => p.id));
  return uniqueRows(tasks, 'task').filter((t) => {
    const plantId = t.garden_plant_id ?? t.plant_instance_id ?? null;
    if (plantId && !activePlantIds.has(plantId)) return false;
    const state = taskState(t);
    if (!includeCompleted && state === 'completed') return false;
    if (!includeCancelled && state === 'cancelled') return false;
    return true;
  });
}

export function pendingGardenTasks(tasks, plants) {
  return gardenTasks(tasks, plants, { includeCompleted: false, includeCancelled: false })
    .filter((t) => taskState(t) === 'pending');
}

function dateOnly(value) {
  if (value == null) return null;
  const s = String(value);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (!m) throw new Error(`invalid_date:${s}`);
  return m[1];
}

export function attentionTasks(tasks, plants, today) {
  const day = dateOnly(today);
  if (!day) throw new Error('today_required');
  return pendingGardenTasks(tasks, plants)
    .filter((t) => {
      const due = dateOnly(t.due_on ?? t.due_at ?? t.dueOn);
      return due !== null && due <= day;
    })
    .sort((a, b) => {
      const ad = dateOnly(a.due_on ?? a.due_at ?? a.dueOn) || '9999-12-31';
      const bd = dateOnly(b.due_on ?? b.due_at ?? b.dueOn) || '9999-12-31';
      return ad.localeCompare(bd) || a.id.localeCompare(b.id);
    });
}

export function homeSummary({ plants = [], tasks = [], today, attentionAlerts = [] } = {}) {
  const active = activePlants(plants);
  const pending = pendingGardenTasks(tasks, plants);
  const taskAttention = attentionTasks(tasks, plants, today);
  const alerts = uniqueRows(attentionAlerts, 'alert');
  return Object.freeze({
    plantCount: active.length,
    upcomingCount: pending.length,
    attentionCount: taskAttention.length + alerts.length,
    attentionTasks: taskAttention,
    attentionAlerts: alerts,
  });
}

export function plantHistory(events, plantId) {
  if (typeof plantId !== 'string' || !plantId.trim()) throw new Error('plant_id_required');
  return uniqueRows(events, 'event')
    .filter((e) => (e.garden_plant_id ?? e.plant_instance_id) === plantId)
    .sort((a, b) => String(b.occurred_at ?? b.occurredAt ?? b.created_at ?? '').localeCompare(String(a.occurred_at ?? a.occurredAt ?? a.created_at ?? '')));
}

export function gardenJournal(events, { plantId = null, eventType = null } = {}) {
  return uniqueRows(events, 'event')
    .filter((e) => !plantId || (e.garden_plant_id ?? e.plant_instance_id) === plantId)
    .filter((e) => !eventType || e.event_type === eventType)
    .sort((a, b) => String(b.occurred_at ?? b.occurredAt ?? b.created_at ?? '').localeCompare(String(a.occurred_at ?? a.occurredAt ?? a.created_at ?? '')));
}

export function assertSameTaskIdentity(rowsByView) {
  const canonical = new Map();
  for (const [view, rows] of Object.entries(rowsByView || {})) {
    for (const row of uniqueRows(rows, `task_${view}`)) {
      const id = row.id;
      const fingerprint = JSON.stringify({
        id,
        plant: row.garden_plant_id ?? row.plant_instance_id ?? null,
        title: row.title ?? null,
        due: row.due_on ?? row.due_at ?? row.dueOn ?? null,
        state: taskState(row),
      });
      if (!canonical.has(id)) canonical.set(id, { fingerprint, view });
      else if (canonical.get(id).fingerprint !== fingerprint) {
        throw new Error(`task_projection_conflict:${id}:${canonical.get(id).view}:${view}`);
      }
    }
  }
  return true;
}
