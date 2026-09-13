/**
 * Garden Task Budget V1 — pure contracts (no DOM / network).
 *
 * CARE SCHEDULE KNOWLEDGE ≠ MATERIALIZED TASKS.
 * Today Focus = max 3 Garden-wide Next Best Actions.
 */
export const GARDEN_TASK_BUDGET_VERSION = '1.0.0';
export const GARDEN_TODAY_FOCUS_MAX = 3;
/** Just-in-time horizon for routine materialization (days). Not a 6-month calendar. */
export const GARDEN_ROUTINE_JIT_HORIZON_DAYS = 14;
/** Companion surface hides routine tasks beyond this. */
export const GARDEN_COMPANION_HORIZON_DAYS = 7;

export const TASK_ROLE = Object.freeze({
  URGENT_HEALTH: 'urgent_health',
  WEATHER: 'weather',
  TREATMENT_FOLLOWUP: 'treatment_followup',
  OUTCOME_CHECK: 'outcome_check',
  TIME_SENSITIVE_CARE: 'time_sensitive_care',
  ROUTINE: 'routine',
  OTHER: 'other'
});

const ROUTINE_RE =
  /^(water|fertiliz|feed|prun|check .+ leaves|check soil moisture)/i;
const URGENT_RE =
  /pest|disease|yellow|wilting|urgent|attention|protect|frost|heat|treat|inspect:|sooty|mold|rot/i;
const WEATHER_LINK_RE = /^__weather:/i;

export function normalizeTaskTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizePlantKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/\s+tree$/, '')
    .replace(/\s+/g, ' ');
}

export function isWeatherLinkedTask(task) {
  const link = String(task?.[6] || task?.plantName || task?.link || '');
  return WEATHER_LINK_RE.test(link) || !!(task?.__weather || task?.weatherType);
}

export function isDoctorTask(task) {
  const id = String(task?.[8] || task?.id || task?.client_instance_id || '');
  const src = String(task?.source_module || task?.sourceModule || '').toLowerCase();
  const typ = String(task?.task_type || task?.taskType || '').toLowerCase();
  return id.startsWith('pd_care_') || src === 'plant_doctor' || typ === 'doctor';
}

export function isOutcomeFollowUpTask(task) {
  const id = String(task?.[8] || task?.id || '');
  return id.startsWith('outcome_fu_') || task?.outcomeFollowUp === true;
}

export function isRoutineCareTask(task) {
  if (!task || isWeatherLinkedTask(task) || isDoctorTask(task) || isOutcomeFollowUpTask(task)) {
    return false;
  }
  const title = normalizeTaskTitle(task[1] || task.title || '');
  if (URGENT_RE.test(title) && !ROUTINE_RE.test(title)) return false;
  return ROUTINE_RE.test(title) || /water|fertiliz|prun|check .+ leaves|moisture/i.test(title);
}

export function classifyTaskRole(task) {
  if (!task) return TASK_ROLE.OTHER;
  if (isOutcomeFollowUpTask(task)) return TASK_ROLE.OUTCOME_CHECK;
  if (isWeatherLinkedTask(task)) return TASK_ROLE.WEATHER;
  if (isDoctorTask(task)) return TASK_ROLE.URGENT_HEALTH;
  const title = normalizeTaskTitle(task[1] || task.title || '');
  if (URGENT_RE.test(title)) return TASK_ROLE.URGENT_HEALTH;
  if (/follow.?up|after care|how is /i.test(title)) return TASK_ROLE.TREATMENT_FOLLOWUP;
  if (isRoutineCareTask(task)) return TASK_ROLE.ROUTINE;
  return TASK_ROLE.TIME_SENSITIVE_CARE;
}

const ROLE_PRIORITY = Object.freeze({
  [TASK_ROLE.URGENT_HEALTH]: 100,
  [TASK_ROLE.WEATHER]: 90,
  [TASK_ROLE.TREATMENT_FOLLOWUP]: 85,
  [TASK_ROLE.OUTCOME_CHECK]: 80,
  [TASK_ROLE.TIME_SENSITIVE_CARE]: 60,
  [TASK_ROLE.ROUTINE]: 40,
  [TASK_ROLE.OTHER]: 20
});

export function rolePriorityScore(role) {
  return ROLE_PRIORITY[role] || 0;
}

export function semanticActionKey(task) {
  const title = normalizeTaskTitle(task?.[1] || task?.title || '');
  const plant = normalizePlantKey(task?.[6] || task?.plantName || '');
  let action = 'other';
  if (/water|moisture|irrigation/.test(title)) action = 'water';
  else if (/fertiliz|feed/.test(title)) action = 'fertilize';
  else if (/prun|trim/.test(title)) action = 'prune';
  else if (/check|inspect|leaves/.test(title)) action = 'inspect';
  else if (/protect|frost|cold|heat|drain/.test(title)) action = 'protect';
  else if (isDoctorTask(task)) action = 'doctor_care';
  else if (isOutcomeFollowUpTask(task)) action = 'outcome_check';
  return `${plant || '_garden'}::${action}`;
}

/**
 * Collapse open tasks that share the same semantic action for a plant.
 * Keeps the highest-priority / soonest-due instance. Does not mutate inputs.
 * Returns indexes to suppress (duplicates), not delete from storage.
 */
export function findDuplicateRoutineIndexes(tasks = [], options = {}) {
  const today = String(options.todayIso || new Date().toISOString().slice(0, 10));
  const open = [];
  (tasks || []).forEach((t, i) => {
    if (!t) return;
    const done = t[7] === true || t.done === true;
    if (done) return;
    if (!isRoutineCareTask(t) && !isDoctorTask(t)) return;
    open.push({ t, i, key: semanticActionKey(t), iso: String(t[4] || t.iso || '') });
  });
  const byKey = new Map();
  for (const row of open) {
    if (!byKey.has(row.key)) byKey.set(row.key, []);
    byKey.get(row.key).push(row);
  }
  const suppress = new Set();
  for (const group of byKey.values()) {
    if (group.length <= 1) continue;
    group.sort((a, b) => {
      const aOver = a.iso && a.iso < today ? 0 : 1;
      const bOver = b.iso && b.iso < today ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      return String(a.iso || '9999').localeCompare(String(b.iso || '9999'));
    });
    for (let k = 1; k < group.length; k++) suppress.add(group[k].i);
  }
  return [...suppress];
}

/**
 * Per-plant: if an urgent/doctor task is open, suppress routine tasks for that plant in focus.
 */
export function findRoutineSuppressedByUrgentIndexes(tasks = []) {
  const byPlant = new Map();
  (tasks || []).forEach((t, i) => {
    if (!t || t[7] === true || t.done === true) return;
    const plant = normalizePlantKey(t[6] || '');
    if (!plant) return;
    if (!byPlant.has(plant)) byPlant.set(plant, { urgent: [], routine: [] });
    const role = classifyTaskRole(t);
    if (role === TASK_ROLE.URGENT_HEALTH || role === TASK_ROLE.TREATMENT_FOLLOWUP) {
      byPlant.get(plant).urgent.push(i);
    } else if (role === TASK_ROLE.ROUTINE) {
      byPlant.get(plant).routine.push(i);
    }
  });
  const suppress = [];
  for (const g of byPlant.values()) {
    if (g.urgent.length && g.routine.length) suppress.push(...g.routine);
  }
  return suppress;
}

/**
 * Rank open tasks for Garden Today Focus (max GARDEN_TODAY_FOCUS_MAX).
 */
export function selectGardenFocusTaskIndexes(tasks = [], options = {}) {
  const max = Number.isFinite(options.max) ? options.max : GARDEN_TODAY_FOCUS_MAX;
  const today = String(options.todayIso || new Date().toISOString().slice(0, 10));
  const horizonDays = Number.isFinite(options.horizonDays)
    ? options.horizonDays
    : GARDEN_COMPANION_HORIZON_DAYS;
  const horizonIso = addDaysIso(today, horizonDays);
  const dup = new Set(findDuplicateRoutineIndexes(tasks, { todayIso: today }));
  const suppressed = new Set(findRoutineSuppressedByUrgentIndexes(tasks));

  const scored = [];
  (tasks || []).forEach((t, i) => {
    if (!t || t[7] === true || t.done === true) return;
    if (dup.has(i) || suppressed.has(i)) return;
    const iso = String(t[4] || '');
    if (iso && iso > horizonIso && classifyTaskRole(t) === TASK_ROLE.ROUTINE) return;
    const role = classifyTaskRole(t);
    let score = rolePriorityScore(role);
    if (iso && iso < today) score += 15;
    if (iso === today) score += 10;
    if (String(t[3] || '').toLowerCase() === 'high') score += 8;
    if (String(t[3] || '').toLowerCase() === 'medium') score += 3;
    scored.push({ i, score, role, iso });
  });
  scored.sort((a, b) => b.score - a.score || String(a.iso).localeCompare(String(b.iso)));
  return scored.slice(0, Math.max(0, max)).map((x) => x.i);
}

export function addDaysIso(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Decide whether to materialize the next routine water action for a plant.
 * Returns null if suppressed / already has open routine / urgent present.
 */
export function nextRoutineCareSuggestion(plant, openTasksForPlant = [], options = {}) {
  const plantName = String(plant?.name || '').trim();
  if (!plantName || plant?.prefs?.autoTasks === false) return null;
  const plantKey = normalizePlantKey(plantName);
  const open = (openTasksForPlant || []).filter((t) => !(t[7] === true || t.done === true));
  const hasUrgent = open.some((t) => {
    const role = classifyTaskRole(t);
    return role === TASK_ROLE.URGENT_HEALTH || role === TASK_ROLE.TREATMENT_FOLLOWUP;
  });
  if (hasUrgent) return null;
  const hasRoutine = open.some((t) => isRoutineCareTask(t));
  if (hasRoutine) return null;

  const water = String(plant.water || plant.meta?.water || '').toLowerCase();
  let offset = 3;
  let title = `Water ${plantName}`;
  let note = 'just-in-time routine care';
  let icon = '💧';
  if (plant.mark === '!' || /need/i.test(String(plant.status || ''))) {
    return {
      title: `Check ${plantName} condition`,
      offsetDays: 1,
      note: 'attention follow-up',
      icon: '🔎',
      taskType: 'care',
      sourceModule: 'my_garden'
    };
  }
  if (/high|moist|constant|daily|often/.test(water)) offset = 1;
  else if (/low|dry|succulent|cactus|infrequent|drought/.test(water)) {
    offset = 5;
    title = `Check soil moisture for ${plantName}`;
    icon = '🪴';
  }
  const maxOffset = options.maxOffsetDays ?? GARDEN_ROUTINE_JIT_HORIZON_DAYS;
  if (offset > maxOffset) offset = maxOffset;
  return {
    title,
    offsetDays: offset,
    note,
    icon,
    taskType: 'care',
    sourceModule: 'my_garden',
    plantKey
  };
}

/**
 * Count how many open routine tasks would exist under a naive 180-day materializer
 * (for tests / audit comparison). Does not create tasks.
 */
export function estimateLegacySeasonalTaskCount(plantCount, options = {}) {
  const waterEvery = options.waterEvery || 7;
  const horizon = options.horizonDays || 180;
  const water = Math.floor((horizon - 8) / waterEvery) + 1;
  const fertilize = Math.floor((horizon - 30) / 45) + 1;
  const prune = Math.floor((horizon - 90) / 90) + 1;
  const leaves = Math.floor((horizon - 30) / 30) + 1;
  return plantCount * (water + fertilize + prune + leaves);
}
