/**
 * Closed-loop care outcome V1 — pure contracts (no DOM / network / paid AI).
 *
 * task_completed ≠ treatment success.
 * Outcomes are Garden/Plant evidence only — never global catalog truth.
 */
import {
  GARDEN_EVENT_TYPES,
  GARDEN_FOLLOWUP_REASONS,
  GARDEN_OUTCOME_VALUES,
  GARDEN_SOURCE_MODULES,
  buildGardenClientEventId,
  buildFollowupRequestedEventInsert,
  buildTaskOutcomeEventInsert,
  isGardenOutcomeValue
} from './garden-os-spine-v1-contract.js';
import { isDoctorTask, isOutcomeFollowUpTask } from './garden-task-budget-v1-contract.js';
import {
  buildFollowupRequestedMemoryInput,
  buildTaskOutcomeReportedMemoryInput
} from './garden-memory-writer-v1.js';

export const GARDEN_CARE_OUTCOME_VERSION = '1.0.0';

/** Conservative V1 fallback when diagnosis does not specify a check window (days). */
export const CARE_OUTCOME_FALLBACK_DAYS = 3;

export const CARE_OUTCOME_CHOICES = Object.freeze([
  GARDEN_OUTCOME_VALUES.BETTER,
  GARDEN_OUTCOME_VALUES.SLIGHTLY_BETTER,
  GARDEN_OUTCOME_VALUES.NO_CHANGE,
  GARDEN_OUTCOME_VALUES.WORSE,
  GARDEN_OUTCOME_VALUES.UNSURE
]);

/**
 * Which completed tasks should later ask “Did it help?”
 * Doctor / intervention tasks yes; ordinary routine watering/fertilize/prune no.
 */
export function isOutcomeEligibleCareTask(task, meta = {}) {
  if (!task) return false;
  if (isOutcomeFollowUpTask(task)) return false;
  if (meta.forceEligible === true) return true;
  if (isDoctorTask(task)) return true;
  const typ = String(task.task_type || task.taskType || '').toLowerCase();
  const src = String(task.source_module || task.sourceModule || '').toLowerCase();
  if (typ === 'doctor' || src === 'plant_doctor') return true;
  const title = String(task[1] || task.title || '').toLowerCase();
  if (/inspect:|treat|pest|disease|sooty|mold|intervention|after plant doctor/.test(title)) {
    return true;
  }
  // Routine watering / fertilize / prune / monthly leaf check — no automatic outcome.
  if (/^water |fertiliz|prun|check .+ leaves|soil moisture|deep water|extra water/.test(title)) {
    return false;
  }
  return false;
}

export function resolveOutcomeFollowUpDays(task, meta = {}) {
  if (Number.isFinite(meta.days) && meta.days >= 1) return Math.min(14, Math.floor(meta.days));
  const title = String(task?.[1] || task?.title || '').toLowerCase();
  if (/pest|disease|mold|fungus|rot/.test(title)) return 5;
  if (/water|moisture|irrigat/.test(title)) return 2;
  return CARE_OUTCOME_FALLBACK_DAYS;
}

export function buildOutcomeFollowUpClientId(completedTaskClientId) {
  const id = String(completedTaskClientId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .slice(0, 80);
  if (!id) throw new Error('completed task client id required');
  return `outcome_fu_${id}`;
}

export function buildOutcomeFollowUpTaskRow(input = {}) {
  const plantName = String(input.plantName || '').trim() || 'Plant';
  const completedId = String(input.completedTaskClientId || '').trim();
  const days = resolveOutcomeFollowUpDays(input.completedTask, { days: input.days });
  const iso = String(input.dueIso || '').trim();
  if (!iso) throw new Error('dueIso required');
  const clientId = buildOutcomeFollowUpClientId(completedId);
  const row = [
    '📋',
    `How is ${plantName} after this care?`,
    `Outcome check · in ${days} day${days === 1 ? '' : 's'}`,
    input.priority || 'Medium',
    iso,
    false,
    plantName,
    false,
    clientId
  ];
  row.id = clientId;
  row.outcomeFollowUp = true;
  // Stay within Spine GARDEN_TASK_TYPES; detect via client id + flag.
  row.task_type = 'other';
  row.taskType = 'other';
  row.source_module = input.sourceModule || GARDEN_SOURCE_MODULES.SYSTEM;
  row.sourceModule = row.source_module;
  row.relatedTaskClientId = completedId;
  row.related_task_client_id = completedId;
  row.correlation_id = input.correlationId || null;
  row.caused_by_event_id = input.causedByEventId || null;
  row.gardenPlantId = input.gardenPlantId || null;
  row.garden_plant_id = input.gardenPlantId || null;
  row.completed_task_server_id = input.completedTaskServerId || null;
  return row;
}

/**
 * Decision after user reports outcome. Never triggers paid AI.
 */
export function decideCareOutcomeFollowUp(outcome) {
  const o = String(outcome || '')
    .trim()
    .toLowerCase();
  if (!isGardenOutcomeValue(o)) throw new Error(`invalid_outcome:${o || 'empty'}`);
  if (o === GARDEN_OUTCOME_VALUES.BETTER) {
    return {
      outcome: o,
      escalate: false,
      followupRequested: false,
      priority: null,
      followupReason: null,
      message: 'Recorded as helpful for this plant.',
      autoAi: false
    };
  }
  if (o === GARDEN_OUTCOME_VALUES.SLIGHTLY_BETTER) {
    return {
      outcome: o,
      escalate: false,
      followupRequested: false,
      priority: null,
      followupReason: null,
      message: 'Recorded — continue monitoring.',
      autoAi: false
    };
  }
  if (o === GARDEN_OUTCOME_VALUES.NO_CHANGE) {
    return {
      outcome: o,
      escalate: true,
      followupRequested: true,
      priority: 'Medium',
      followupReason: GARDEN_FOLLOWUP_REASONS.NO_IMPROVEMENT,
      message: 'No improvement recorded. Follow-up recommended when you are ready.',
      autoAi: false
    };
  }
  if (o === GARDEN_OUTCOME_VALUES.WORSE) {
    return {
      outcome: o,
      escalate: true,
      followupRequested: true,
      priority: 'High',
      followupReason: GARDEN_FOLLOWUP_REASONS.WORSENING,
      message:
        'Worsening recorded. Higher-priority follow-up recommended — do not repeat the same action blindly.',
      autoAi: false
    };
  }
  return {
    outcome: o,
    escalate: false,
    followupRequested: true,
    priority: 'Low',
    followupReason: GARDEN_FOLLOWUP_REASONS.OUTCOME_UNKNOWN,
    message: 'Uncertainty preserved. Follow-up when clearer evidence is available.',
    autoAi: false
  };
}

export function buildClosedLoopOutcomeMemoryBundle(input = {}) {
  const decision = decideCareOutcomeFollowUp(input.outcome);
  const outcomeMemory = buildTaskOutcomeReportedMemoryInput({
    ...input,
    outcome: decision.outcome
  });
  const followupMemory = decision.followupRequested
    ? buildFollowupRequestedMemoryInput({
        ...input,
        followupReason: decision.followupReason,
        priority: decision.priority,
        outcome: decision.outcome,
        // causedBy set by caller to outcome event id after write when available
        causedByEventId: input.outcomeEventId || input.causedByEventId || null
      })
    : null;
  return { decision, outcomeMemory, followupMemory, autoAi: false };
}

export {
  GARDEN_EVENT_TYPES,
  GARDEN_OUTCOME_VALUES,
  GARDEN_FOLLOWUP_REASONS,
  buildTaskOutcomeEventInsert,
  buildFollowupRequestedEventInsert,
  buildGardenClientEventId,
  buildTaskOutcomeReportedMemoryInput,
  buildFollowupRequestedMemoryInput,
  isGardenOutcomeValue
};
