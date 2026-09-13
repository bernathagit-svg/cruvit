/**
 * Browser bootstrap — expose Garden Task Budget + Care Outcome contracts on window.
 */
import * as budget from './garden-task-budget-v1-contract.js';
import * as outcome from './garden-care-outcome-v1-contract.js';

window.cruvitGardenTaskBudgetV1 = Object.freeze({
  version: budget.GARDEN_TASK_BUDGET_VERSION,
  GARDEN_TODAY_FOCUS_MAX: budget.GARDEN_TODAY_FOCUS_MAX,
  selectGardenFocusTaskIndexes: budget.selectGardenFocusTaskIndexes,
  findDuplicateRoutineIndexes: budget.findDuplicateRoutineIndexes,
  findRoutineSuppressedByUrgentIndexes: budget.findRoutineSuppressedByUrgentIndexes,
  classifyTaskRole: budget.classifyTaskRole,
  isRoutineCareTask: budget.isRoutineCareTask,
  isDoctorTask: budget.isDoctorTask,
  isOutcomeFollowUpTask: budget.isOutcomeFollowUpTask,
  nextRoutineCareSuggestion: budget.nextRoutineCareSuggestion,
  semanticActionKey: budget.semanticActionKey,
  estimateLegacySeasonalTaskCount: budget.estimateLegacySeasonalTaskCount
});

window.cruvitGardenCareOutcomeV1 = Object.freeze({
  version: outcome.GARDEN_CARE_OUTCOME_VERSION,
  CARE_OUTCOME_FALLBACK_DAYS: outcome.CARE_OUTCOME_FALLBACK_DAYS,
  CARE_OUTCOME_CHOICES: outcome.CARE_OUTCOME_CHOICES,
  isOutcomeEligibleCareTask: outcome.isOutcomeEligibleCareTask,
  resolveOutcomeFollowUpDays: outcome.resolveOutcomeFollowUpDays,
  buildOutcomeFollowUpTaskRow: outcome.buildOutcomeFollowUpTaskRow,
  buildOutcomeFollowUpClientId: outcome.buildOutcomeFollowUpClientId,
  decideCareOutcomeFollowUp: outcome.decideCareOutcomeFollowUp,
  buildClosedLoopOutcomeMemoryBundle: outcome.buildClosedLoopOutcomeMemoryBundle
});
