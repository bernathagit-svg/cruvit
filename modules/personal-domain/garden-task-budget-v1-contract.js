/**
 * Garden Task Budget V1 — pure contracts (no DOM / network).
 *
 * CARE SCHEDULE KNOWLEDGE ≠ MATERIALIZED TASKS.
 * Today Focus = max 3 Garden-wide Next Best Actions.
 * Garden-level consolidation = derived read-model only (no new task schema).
 */
export const GARDEN_TASK_BUDGET_VERSION = '1.1.0';
export const GARDEN_TODAY_FOCUS_MAX = 3;
/** Minimum member count before collapsing into a Garden-level action. */
export const GARDEN_ROUTINE_GROUP_MIN = 2;
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

export function routineActionFamily(task) {
  if (!isRoutineCareTask(task)) return null;
  const title = normalizeTaskTitle(task?.[1] || task?.title || '');
  if (/check soil moisture|soil moisture/.test(title)) return 'moisture_check';
  if (/water|irrigation/.test(title)) return 'water';
  if (/fertiliz|feed/.test(title)) return 'fertilize';
  if (/prun|trim/.test(title)) return 'prune';
  if (/check .+ leaves|check leaves/.test(title)) return 'leaf_check';
  return null;
}

/**
 * Compatible watering/care class — used so drought plants are not grouped with moisture-lovers.
 * Prefer plant.water meta when provided; else infer from task title.
 */
export function wateringCompatibilityClass(task, plantMeta = null) {
  const water = String(
    plantMeta?.water || plantMeta?.meta?.water || task?.plantWater || ''
  ).toLowerCase();
  const title = normalizeTaskTitle(task?.[1] || task?.title || '');
  if (/low|dry|succulent|cactus|infrequent|drought|sparing/.test(water) || /soil moisture/.test(title)) {
    return 'low';
  }
  if (/high|moist|constant|daily|often|wet/.test(water)) return 'high';
  return 'moderate';
}

export function dueWindowBucket(iso, todayIso) {
  const today = String(todayIso || new Date().toISOString().slice(0, 10));
  const due = String(iso || '');
  if (!due) return 'undated';
  if (due < today) return 'overdue_or_today';
  if (due === today) return 'overdue_or_today';
  if (due <= addDaysIso(today, 2)) return 'near';
  if (due <= addDaysIso(today, 7)) return 'week';
  return 'later';
}

/**
 * True only when a routine task may join a Garden-level group.
 * Doctor / urgent / outcome / weather never group.
 */
export function isGardenRoutineGroupEligible(task, options = {}) {
  if (!task || task[7] === true || task.done === true) return false;
  if (isDoctorTask(task) || isOutcomeFollowUpTask(task) || isWeatherLinkedTask(task)) return false;
  if (classifyTaskRole(task) !== TASK_ROLE.ROUTINE) return false;
  const family = routineActionFamily(task);
  if (!family) return false;
  // Plant-specific attention / condition checks stay ungrouped.
  const title = normalizeTaskTitle(task[1] || task.title || '');
  if (/condition|attention|needs/.test(title)) return false;
  const plantName = String(task[6] || task.plantName || '').trim();
  if (!plantName) return false;
  const plantKey = normalizePlantKey(plantName);
  const plants = options.plantsByKey || options.plantsByName || null;
  const plantMeta = plants ? plants.get?.(plantKey) || plants[plantKey] || plants[plantName] : null;
  if (plantMeta?.mark === '!' || /need|pest|disease/i.test(String(plantMeta?.status || ''))) {
    return false;
  }
  return true;
}

/**
 * Group key for operationally equivalent routine actions across plants.
 * Includes action family + watering class + due window — not plant identity.
 */
export function gardenRoutineGroupKey(task, options = {}) {
  if (!isGardenRoutineGroupEligible(task, options)) return null;
  const family = routineActionFamily(task);
  const plantName = String(task[6] || task.plantName || '').trim();
  const plantKey = normalizePlantKey(plantName);
  const plants = options.plantsByKey || options.plantsByName || null;
  const plantMeta = plants ? plants.get?.(plantKey) || plants[plantKey] || plants[plantName] : null;
  const waterClass =
    family === 'water' || family === 'moisture_check'
      ? wateringCompatibilityClass(task, plantMeta)
      : 'n/a';
  // moisture_check stays in low class; do not merge with ordinary "Water".
  const today = String(options.todayIso || new Date().toISOString().slice(0, 10));
  const window = dueWindowBucket(task[4] || task.iso, today);
  if (window === 'later') return null;
  return `${family}::${waterClass}::${window}`;
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

const FAMILY_LABEL = Object.freeze({
  water: 'Water',
  moisture_check: 'Check soil moisture for',
  fertilize: 'Fertilize',
  prune: 'Prune',
  leaf_check: 'Check leaves on'
});

export function buildGroupedRoutineActionTitle(family, plantNames = [], windowBucket = 'overdue_or_today') {
  const n = plantNames.length;
  const verb = FAMILY_LABEL[family] || 'Care for';
  const when =
    windowBucket === 'overdue_or_today'
      ? 'today'
      : windowBucket === 'near'
        ? 'soon'
        : 'this week';
  if (family === 'moisture_check') {
    return `Check soil moisture for ${n} plant${n === 1 ? '' : 's'} that need attention ${when}`;
  }
  if (family === 'leaf_check') {
    return `Check leaves on ${n} plant${n === 1 ? '' : 's'} that need attention ${when}`;
  }
  return `${verb} ${n} plant${n === 1 ? '' : 's'} that need attention ${when}`;
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
 * Prefer selectGardenFocusActions for grouped read-model; this returns representative indexes.
 */
export function selectGardenFocusTaskIndexes(tasks = [], options = {}) {
  return selectGardenFocusActions(tasks, options)
    .map((a) => (a.kind === 'group' ? a.memberIndexes[0] : a.taskIndex))
    .filter((i) => Number.isInteger(i));
}

/**
 * Derived Garden Focus actions (read-model).
 * Groups operationally equivalent routine tasks across plants into one user action.
 * Does NOT invent persisted garden_tasks rows.
 */
export function selectGardenFocusActions(tasks = [], options = {}) {
  const max = Number.isFinite(options.max) ? options.max : GARDEN_TODAY_FOCUS_MAX;
  const today = String(options.todayIso || new Date().toISOString().slice(0, 10));
  const horizonDays = Number.isFinite(options.horizonDays)
    ? options.horizonDays
    : GARDEN_COMPANION_HORIZON_DAYS;
  const horizonIso = addDaysIso(today, horizonDays);
  const minGroup = Number.isFinite(options.minGroupSize)
    ? options.minGroupSize
    : GARDEN_ROUTINE_GROUP_MIN;
  const dup = new Set(findDuplicateRoutineIndexes(tasks, { todayIso: today }));
  const suppressed = new Set(findRoutineSuppressedByUrgentIndexes(tasks));
  const groupOpts = { ...options, todayIso: today };

  const candidates = [];
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
    candidates.push({ i, t, score, role, iso });
  });

  const groupBuckets = new Map();
  const singles = [];
  for (const c of candidates) {
    const gKey = gardenRoutineGroupKey(c.t, groupOpts);
    if (gKey) {
      if (!groupBuckets.has(gKey)) groupBuckets.set(gKey, []);
      groupBuckets.get(gKey).push(c);
    } else {
      singles.push({
        kind: 'single',
        taskIndex: c.i,
        memberIndexes: [c.i],
        score: c.score,
        role: c.role,
        iso: c.iso,
        title: String(c.t[1] || ''),
        plantNames: [String(c.t[6] || '').trim()].filter(Boolean),
        groupable: false,
        outcomeEligible: false
      });
    }
  }

  const actions = [...singles];
  for (const [gKey, members] of groupBuckets.entries()) {
    members.sort((a, b) => b.score - a.score || String(a.iso).localeCompare(String(b.iso)));
    if (members.length < minGroup) {
      for (const m of members) {
        actions.push({
          kind: 'single',
          taskIndex: m.i,
          memberIndexes: [m.i],
          score: m.score,
          role: m.role,
          iso: m.iso,
          title: String(m.t[1] || ''),
          plantNames: [String(m.t[6] || '').trim()].filter(Boolean),
          groupable: false,
          outcomeEligible: false
        });
      }
      continue;
    }
    const [family, waterClass, windowBucket] = gKey.split('::');
    const plantNames = [];
    const seenPlant = new Set();
    const memberIndexes = [];
    let score = 0;
    let iso = members[0].iso;
    for (const m of members) {
      memberIndexes.push(m.i);
      score = Math.max(score, m.score);
      if (m.iso && (!iso || m.iso < iso)) iso = m.iso;
      const name = String(m.t[6] || '').trim();
      const pk = normalizePlantKey(name);
      if (name && !seenPlant.has(pk)) {
        seenPlant.add(pk);
        plantNames.push(name);
      }
    }
    // Slight boost for consolidated workload reduction, still below urgent.
    score += Math.min(8, plantNames.length);
    actions.push({
      kind: 'group',
      groupKey: gKey,
      actionFamily: family,
      waterClass,
      windowBucket,
      memberIndexes,
      plantNames,
      taskIndex: memberIndexes[0],
      score,
      role: TASK_ROLE.ROUTINE,
      iso,
      title: buildGroupedRoutineActionTitle(family, plantNames, windowBucket),
      subtitle: plantNames.join(', '),
      icon: family === 'water' || family === 'moisture_check' ? '💧' : '🌿',
      groupable: true,
      outcomeEligible: false,
      // Completion applies to each underlying task; never implies treatment success.
      completionMeans: 'user_performed_grouped_routine_actions',
      inferOutcomeFromCompletion: false
    });
  }

  actions.sort((a, b) => b.score - a.score || String(a.iso || '').localeCompare(String(b.iso || '')));
  return actions.slice(0, Math.max(0, max));
}

/**
 * Expand focus actions to underlying task indexes (for bulk complete / memory).
 */
export function expandFocusActionMemberIndexes(actions = []) {
  const out = [];
  const seen = new Set();
  for (const a of actions || []) {
    for (const i of a.memberIndexes || (Number.isInteger(a.taskIndex) ? [a.taskIndex] : [])) {
      if (seen.has(i)) continue;
      seen.add(i);
      out.push(i);
    }
  }
  return out;
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
