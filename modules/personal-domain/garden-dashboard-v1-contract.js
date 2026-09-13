/**
 * Functional Garden Dashboard V1 — pure read-model (no DOM / network / mutations).
 *
 * Composes existing authorities. Does NOT create a new source of truth.
 * Dashboard render must never generate tasks or garden_events.
 */
import {
  GARDEN_EVENT_TYPES,
  GARDEN_OUTCOME_VALUES
} from './garden-os-spine-v1-contract.js';
import {
  GARDEN_TODAY_FOCUS_MAX,
  selectGardenFocusActions,
  isOutcomeFollowUpTask,
  isDoctorTask,
  classifyTaskRole,
  TASK_ROLE
} from './garden-task-budget-v1-contract.js';

export const GARDEN_DASHBOARD_V1_VERSION = '1.0.0';
export const GARDEN_DASHBOARD_RECENT_EVENTS_LIMIT = 20;
export const GARDEN_DASHBOARD_LEARNING_LIMIT = 8;

export const DASHBOARD_FIELD_AUTHORITY = Object.freeze({
  authenticated_user: 'SERVER_AUTHORITATIVE',
  active_garden_id_selection: 'LOCAL_ONLY',
  owned_garden_row: 'SERVER_AUTHORITATIVE',
  garden_location: 'SERVER_AUTHORITATIVE',
  structural_climate: 'SERVER_AUTHORITATIVE',
  weather: 'LOCAL_ONLY',
  owned_plants: 'SERVER_AUTHORITATIVE',
  plant_health_status_mark: 'SERVER_AUTHORITATIVE',
  open_completed_tasks: 'SERVER_AUTHORITATIVE',
  garden_events: 'SERVER_AUTHORITATIVE',
  care_outcomes: 'SERVER_AUTHORITATIVE',
  followup_requested: 'SERVER_AUTHORITATIVE',
  diagnoses: 'SERVER_AUTHORITATIVE',
  recommendation_events: 'NOT_YET_AVAILABLE',
  garden_mood: 'DERIVED_FROM_SERVER_STATE',
  today_focus_actions: 'DERIVED_FROM_SERVER_STATE',
  learning_signals: 'DERIVED_FROM_SERVER_STATE'
});

const ATTENTION_STATUS_RE =
  /need|attention|pest|disease|yellow|wilt|sick|monitor|uncertain|watch|problem|mold|rot/i;

/**
 * Classify plant health bucket from status/mark only — never from task completion.
 */
export function classifyPlantHealthBucket(plant = {}) {
  if (!plant || plant.archived === true) return null;
  const mark = String(plant.mark || '').trim();
  const status = String(plant.status || '').trim();
  if (mark === '!') return 'needs_attention';
  if (ATTENTION_STATUS_RE.test(status) && !/^healthy$/i.test(status)) {
    if (/monitor|uncertain|watch|unclear/i.test(status)) return 'monitoring';
    return 'needs_attention';
  }
  if (/^healthy$/i.test(status) || mark === '✓') return 'healthy';
  if (!status) return 'unknown';
  return 'unknown';
}

export function sortPlantsForHealthSummary(plants = []) {
  const rank = { needs_attention: 0, monitoring: 1, unknown: 2, healthy: 3 };
  return (plants || [])
    .filter((p) => p && p.archived !== true)
    .map((p) => ({
      ...p,
      healthBucket: classifyPlantHealthBucket(p)
    }))
    .sort((a, b) => {
      const ra = rank[a.healthBucket] ?? 9;
      const rb = rank[b.healthBucket] ?? 9;
      if (ra !== rb) return ra - rb;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

export function humanizeGardenEventType(eventType) {
  const t = String(eventType || '').trim();
  const map = {
    [GARDEN_EVENT_TYPES.PLANT_ADDED]: 'Plant added',
    [GARDEN_EVENT_TYPES.PLANT_ARCHIVED]: 'Plant archived',
    [GARDEN_EVENT_TYPES.PLANT_REMOVED]: 'Plant removed',
    [GARDEN_EVENT_TYPES.DOCTOR_DIAGNOSIS]: 'Plant diagnosis',
    [GARDEN_EVENT_TYPES.PLANT_HEALTH_CHANGED]: 'Plant health updated',
    [GARDEN_EVENT_TYPES.TASK_CREATED]: 'Care task created',
    [GARDEN_EVENT_TYPES.TASK_COMPLETED]: 'Care action completed',
    [GARDEN_EVENT_TYPES.TASK_OUTCOME_REPORTED]: 'Care outcome reported',
    [GARDEN_EVENT_TYPES.FOLLOWUP_REQUESTED]: 'Follow-up needed',
    [GARDEN_EVENT_TYPES.SUITABILITY_CHECKED]: 'Suitability checked',
    [GARDEN_EVENT_TYPES.IDENTIFIER_SAVED]: 'Plant identity saved',
    [GARDEN_EVENT_TYPES.RECOMMENDATION_GENERATED]: 'Recommendation prepared',
    [GARDEN_EVENT_TYPES.RECOMMENDATION_ACCEPTED]: 'Recommendation accepted',
    [GARDEN_EVENT_TYPES.RECOMMENDATION_REJECTED]: 'Recommendation declined'
  };
  return map[t] || 'Garden activity';
}

export function humanizeOutcomeLabel(outcome) {
  const o = String(outcome || '').toLowerCase();
  if (o === GARDEN_OUTCOME_VALUES.BETTER) return 'better';
  if (o === GARDEN_OUTCOME_VALUES.SLIGHTLY_BETTER) return 'slightly better';
  if (o === GARDEN_OUTCOME_VALUES.NO_CHANGE) return 'no change';
  if (o === GARDEN_OUTCOME_VALUES.WORSE) return 'worse';
  if (o === GARDEN_OUTCOME_VALUES.UNSURE) return 'unsure';
  return '';
}

/**
 * Build user-facing activity row. Strips internal ids / raw payload / schema.
 */
export function buildActivityItem(eventRow = {}, plantByServerId = new Map()) {
  const eventType = String(eventRow.event_type || eventRow.eventType || '').trim();
  const payload =
    eventRow.payload && typeof eventRow.payload === 'object' ? eventRow.payload : {};
  const plantId = eventRow.garden_plant_id || eventRow.gardenPlantId || null;
  const plant = plantId ? plantByServerId.get(String(plantId)) : null;
  const plantName =
    (plant && plant.name) ||
    String(payload.plant_name || payload.title || '').trim() ||
    null;
  const occurredAt = eventRow.occurred_at || eventRow.occurredAt || null;
  let detail = '';
  if (eventType === GARDEN_EVENT_TYPES.TASK_OUTCOME_REPORTED) {
    const label = humanizeOutcomeLabel(payload.outcome);
    detail = label
      ? `Reported as ${label}${plantName ? ` for ${plantName}` : ''}`
      : plantName
        ? `Outcome for ${plantName}`
        : 'Outcome recorded';
  } else if (eventType === GARDEN_EVENT_TYPES.FOLLOWUP_REQUESTED) {
    detail = plantName
      ? `Follow-up needed for ${plantName}`
      : 'A care follow-up is needed';
  } else if (eventType === GARDEN_EVENT_TYPES.DOCTOR_DIAGNOSIS) {
    const dx = String(payload.likely_diagnosis || '').trim();
    detail = dx
      ? `${dx}${plantName ? ` · ${plantName}` : ''}`
      : plantName || 'Diagnosis recorded';
  } else if (eventType === GARDEN_EVENT_TYPES.TASK_COMPLETED) {
    detail = String(payload.title || '').trim() || plantName || 'Action completed';
  } else if (eventType === GARDEN_EVENT_TYPES.PLANT_ADDED) {
    detail = plantName || String(payload.name || 'Plant').trim();
  } else if (eventType === GARDEN_EVENT_TYPES.PLANT_HEALTH_CHANGED) {
    detail = plantName || 'Health updated';
  } else {
    detail = plantName || String(payload.title || payload.name || '').trim() || '';
  }
  return {
    id: eventRow.id || null,
    label: humanizeGardenEventType(eventType),
    detail,
    plantName,
    occurredAt,
    eventType
  };
}

/**
 * Conservative learning signals from explicit outcome evidence only.
 */
export function buildLearningSignals(events = [], plantByServerId = new Map(), options = {}) {
  const limit = Number.isFinite(options.limit) ? options.limit : GARDEN_DASHBOARD_LEARNING_LIMIT;
  const outcomes = (events || [])
    .filter(
      (e) =>
        String(e.event_type || e.eventType || '') === GARDEN_EVENT_TYPES.TASK_OUTCOME_REPORTED
    )
    .sort((a, b) =>
      String(b.occurred_at || b.occurredAt || '').localeCompare(
        String(a.occurred_at || a.occurredAt || '')
      )
    );

  const signals = [];
  for (const e of outcomes) {
    if (signals.length >= limit) break;
    const payload = e.payload && typeof e.payload === 'object' ? e.payload : {};
    const outcome = String(payload.outcome || '').toLowerCase();
    const plantId = e.garden_plant_id || e.gardenPlantId;
    const plant = plantId ? plantByServerId.get(String(plantId)) : null;
    const plantName = (plant && plant.name) || 'this plant';
    let text = null;
    let tone = 'unknown';
    if (outcome === GARDEN_OUTCOME_VALUES.BETTER) {
      text = `A previous care action helped ${plantName}.`;
      tone = 'positive';
    } else if (outcome === GARDEN_OUTCOME_VALUES.SLIGHTLY_BETTER) {
      text = `${plantName} was reported slightly better after a care action.`;
      tone = 'positive';
    } else if (outcome === GARDEN_OUTCOME_VALUES.NO_CHANGE) {
      text = `No improvement was reported for ${plantName} after the previous intervention.`;
      tone = 'negative';
    } else if (outcome === GARDEN_OUTCOME_VALUES.WORSE) {
      text = `${plantName} was reported worse after the previous care action.`;
      tone = 'negative';
    } else if (outcome === GARDEN_OUTCOME_VALUES.UNSURE) {
      text = `We still don’t know whether the last treatment helped ${plantName}.`;
      tone = 'unknown';
    }
    if (!text) continue;
    signals.push({
      text,
      tone,
      plantName,
      outcome,
      occurredAt: e.occurred_at || e.occurredAt || null,
      // Never claim global learning
      scope: 'garden_plant_evidence_only',
      fabricated: false
    });
  }
  return signals;
}

/**
 * Follow-up queue: outcome-due tasks + followup_requested evidence.
 */
export function buildFollowUpQueue(input = {}) {
  const tasks = input.tasks || [];
  const events = input.events || [];
  const todayIso = String(input.todayIso || new Date().toISOString().slice(0, 10));
  const plantByServerId = input.plantByServerId || new Map();
  const items = [];

  (tasks || []).forEach((t, i) => {
    const done = Array.isArray(t) ? t[7] === true : t.done === true;
    if (done) return;
    const isFu = isOutcomeFollowUpTask(t);
    if (!isFu) return;
    const iso = String((Array.isArray(t) ? t[4] : t.due_on || t.iso) || '');
    if (iso && iso > todayIso) {
      items.push({
        kind: 'outcome_pending',
        urgency: 'scheduled',
        title: Array.isArray(t) ? t[1] : t.title,
        plantName: Array.isArray(t) ? t[6] : t.plant_name || t.plantName,
        taskIndex: i,
        dueOn: iso,
        cta: 'Tell CRUVIT how it went',
        autoAi: false
      });
      return;
    }
    items.push({
      kind: 'outcome_due',
      urgency: 'due',
      title: Array.isArray(t) ? t[1] : t.title,
      plantName: Array.isArray(t) ? t[6] : t.plant_name || t.plantName,
      taskIndex: i,
      dueOn: iso || todayIso,
      cta: 'Tell CRUVIT how it went',
      autoAi: false
    });
  });

  for (const e of events || []) {
    if (String(e.event_type || '') !== GARDEN_EVENT_TYPES.FOLLOWUP_REQUESTED) continue;
    const payload = e.payload && typeof e.payload === 'object' ? e.payload : {};
    const plant = e.garden_plant_id
      ? plantByServerId.get(String(e.garden_plant_id))
      : null;
    const plantName = (plant && plant.name) || null;
    const reason = String(payload.followup_reason || '').toLowerCase();
    let title = 'Care follow-up needed';
    if (reason === 'worsening') title = 'Plant may be worse — follow-up needed';
    else if (reason === 'no_improvement') title = 'No improvement reported — follow-up needed';
    else if (reason === 'outcome_unknown') title = 'Outcome still unclear — follow-up when ready';
    items.push({
      kind: 'followup_requested',
      urgency: reason === 'worsening' ? 'high' : 'medium',
      title,
      plantName,
      eventId: e.id || null,
      cta: 'Review when ready',
      autoAi: false,
      // Explicit: never auto-run Plant Doctor
      autoPlantDoctor: false
    });
  }

  const urgencyRank = { high: 0, due: 1, medium: 2, scheduled: 3 };
  items.sort((a, b) => (urgencyRank[a.urgency] ?? 9) - (urgencyRank[b.urgency] ?? 9));
  return items;
}

function toAppTaskRow(task) {
  if (Array.isArray(task)) return task;
  if (!task || typeof task !== 'object') return null;
  const row = [
    task.icon || '🌿',
    task.title || 'Garden care',
    task.when_label || task.when || 'This week',
    task.priority || 'Low',
    task.due_on || task.iso || '',
    task.auto_generated === true || task.auto === true,
    task.plant_name || task.plantName || '',
    task.done === true,
    task.client_instance_id || task.id || ''
  ];
  row.id = row[8];
  if (task.source_module || task.sourceModule) {
    row.sourceModule = task.source_module || task.sourceModule;
  }
  if (task.task_type || task.taskType) {
    row.taskType = task.task_type || task.taskType;
  }
  if (task.garden_plant_id || task.gardenPlantId) {
    row.gardenPlantId = task.garden_plant_id || task.gardenPlantId;
  }
  if (String(row[8] || '').startsWith('outcome_fu_')) row.outcomeFollowUp = true;
  return row;
}

/**
 * Compose Functional Garden Dashboard V1 read model.
 * Pure: no I/O, no mutations, no AI.
 */
export function buildGardenDashboardReadModel(input = {}) {
  const garden = input.garden || null;
  const plantsRaw = (input.plants || []).filter((p) => p && p.archived !== true);
  const taskRows = (input.tasks || []).map(toAppTaskRow).filter(Boolean);
  const events = Array.isArray(input.events) ? input.events.slice() : [];
  const todayIso = String(input.todayIso || new Date().toISOString().slice(0, 10));
  const weather = input.weather || null;
  const errors = input.errors && typeof input.errors === 'object' ? input.errors : {};

  const plantByServerId = new Map();
  for (const p of plantsRaw) {
    const sid = p.serverId || p.id;
    if (sid && String(sid).includes('-') && String(sid).length > 20) {
      plantByServerId.set(String(sid), p);
    }
    if (p.serverId) plantByServerId.set(String(p.serverId), p);
  }
  // Also index by uuid when list returns server rows directly
  for (const p of plantsRaw) {
    if (p.id && /^[0-9a-f-]{36}$/i.test(String(p.id))) {
      plantByServerId.set(String(p.id), p);
    }
  }

  const plantsByKey = new Map();
  for (const p of plantsRaw) {
    const key = String(p.name || '')
      .trim()
      .toLowerCase()
      .replace(/^the\s+/, '')
      .replace(/\s+tree$/, '')
      .replace(/\s+/g, ' ');
    if (key) plantsByKey.set(key, p);
  }

  const focusActions = selectGardenFocusActions(taskRows, {
    todayIso,
    max: GARDEN_TODAY_FOCUS_MAX,
    horizonDays: 7,
    plantsByKey
  });

  const sortedPlants = sortPlantsForHealthSummary(plantsRaw);
  const attentionCount = sortedPlants.filter((p) => p.healthBucket === 'needs_attention').length;
  const monitoringCount = sortedPlants.filter((p) => p.healthBucket === 'monitoring').length;
  const healthyCount = sortedPlants.filter((p) => p.healthBucket === 'healthy').length;
  const unknownCount = sortedPlants.filter((p) => p.healthBucket === 'unknown').length;

  const recentEvents = events
    .slice()
    .sort((a, b) =>
      String(b.occurred_at || b.occurredAt || '').localeCompare(
        String(a.occurred_at || a.occurredAt || '')
      )
    )
    .slice(0, GARDEN_DASHBOARD_RECENT_EVENTS_LIMIT);

  // Dedupe by event id
  const seenIds = new Set();
  const activity = [];
  for (const e of recentEvents) {
    const id = String(e.id || e.client_event_id || '');
    if (id && seenIds.has(id)) continue;
    if (id) seenIds.add(id);
    activity.push(buildActivityItem(e, plantByServerId));
  }

  const learning = buildLearningSignals(events, plantByServerId);
  const followUps = buildFollowUpQueue({
    tasks: taskRows,
    events,
    todayIso,
    plantByServerId
  });

  const locationLabel =
    (garden && (garden.location_label || garden.locationLabel)) ||
    input.locationLabel ||
    null;
  const climate =
    (garden &&
      (garden.location_climate ||
        garden.locationClimate ||
        (garden.location_structural_climate &&
          (garden.location_structural_climate.summary ||
            garden.location_structural_climate.label)))) ||
    null;
  const structuralStatus =
    (garden &&
      (garden.location_structural_climate_status || garden.locationStructuralClimateStatus)) ||
    null;

  return {
    version: GARDEN_DASHBOARD_V1_VERSION,
    authorityMap: DASHBOARD_FIELD_AUTHORITY,
    mutationsOnBuild: false,
    paidAiCalls: 0,
    gardenId: garden ? garden.id || garden.garden_profile_id || null : null,
    summary: {
      name: (garden && garden.name) || input.gardenName || 'Your garden',
      locationLabel,
      climate,
      structuralClimateStatus: structuralStatus,
      plantCount: plantsRaw.length,
      weatherSummary: weather
        ? {
            tempC: weather.tempC ?? weather.temp_c ?? null,
            summary: weather.summary || null,
            authority: 'LOCAL_ONLY'
          }
        : null
    },
    today: {
      actions: focusActions,
      max: GARDEN_TODAY_FOCUS_MAX,
      rest: focusActions.length === 0,
      restMessage: 'Your garden can rest today.'
    },
    plantHealth: {
      plants: sortedPlants.map((p) => ({
        name: p.name,
        status: p.status || '',
        mark: p.mark || '',
        healthBucket: p.healthBucket,
        id: p.id || null,
        serverId: p.serverId || null
      })),
      attentionCount,
      monitoringCount,
      healthyCount,
      unknownCount,
      empty: plantsRaw.length === 0
    },
    followUps: {
      items: followUps,
      empty: followUps.length === 0
    },
    recentActivity: {
      items: activity,
      empty: activity.length === 0
    },
    learning: {
      signals: learning,
      empty: learning.length === 0,
      emptyMessage: 'No care outcomes recorded yet for this garden.'
    },
    errors: {
      plants: errors.plants || null,
      tasks: errors.tasks || null,
      events: errors.events || null,
      garden: errors.garden || null
    },
    loading: input.loading === true
  };
}

export {
  GARDEN_TODAY_FOCUS_MAX,
  selectGardenFocusActions,
  isDoctorTask,
  isOutcomeFollowUpTask,
  classifyTaskRole,
  TASK_ROLE,
  GARDEN_EVENT_TYPES
};
