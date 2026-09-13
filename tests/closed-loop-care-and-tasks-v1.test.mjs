/**
 * Closed Loop Care & Tasks V1 — zero-paid contract + scale tests.
 * Covers task budget, JIT, focus max 3, outcome loop, causality, Doctor guardrail.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GARDEN_TODAY_FOCUS_MAX,
  selectGardenFocusTaskIndexes,
  findDuplicateRoutineIndexes,
  findRoutineSuppressedByUrgentIndexes,
  nextRoutineCareSuggestion,
  estimateLegacySeasonalTaskCount,
  classifyTaskRole,
  TASK_ROLE,
  isRoutineCareTask,
  semanticActionKey
} from '../modules/personal-domain/garden-task-budget-v1-contract.js';
import {
  CARE_OUTCOME_FALLBACK_DAYS,
  isOutcomeEligibleCareTask,
  resolveOutcomeFollowUpDays,
  buildOutcomeFollowUpTaskRow,
  decideCareOutcomeFollowUp,
  buildClosedLoopOutcomeMemoryBundle
} from '../modules/personal-domain/garden-care-outcome-v1-contract.js';
import {
  GARDEN_EVENT_TYPES,
  GARDEN_OUTCOME_VALUES,
  GARDEN_FOLLOWUP_REASONS,
  GARDEN_SOURCE_MODULES,
  GARDEN_COMPLETION_VS_OUTCOME,
  GARDEN_LEARNING_SAFETY,
  buildCausalEventChain,
  assertLearningSafetyForOutcome
} from '../modules/personal-domain/garden-os-spine-v1-contract.js';
import {
  buildTaskCompletedMemoryInput,
  buildTaskOutcomeReportedMemoryInput,
  buildFollowupRequestedMemoryInput,
  writeGardenMemoryEvent,
  buildDoctorDiagnosisMemoryInput,
  buildDoctorTaskCreatedMemoryInput
} from '../modules/personal-domain/garden-memory-writer-v1.js';
import { buildDoctorCareTaskRow } from '../modules/personal-domain/plant-doctor-care-loop-v1-contract.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import { FIXTURE_PROVIDER_CALLS } from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';

const TODAY = '2026-09-13';
let paidAiCalls = 0;

function makeMemoryStore() {
  const rows = [];
  return {
    rows,
    from(table) {
      assert.equal(table, 'garden_events');
      const api = {
        _filters: {},
        _pendingInsert: null,
        insert(row) {
          this._pendingInsert = row;
          return this;
        },
        select() {
          return this;
        },
        eq(col, val) {
          this._filters[col] = val;
          return this;
        },
        async single() {
          if (this._pendingInsert) {
            const row = this._pendingInsert;
            this._pendingInsert = null;
            const dup = rows.find(
              (r) =>
                r.garden_profile_id === row.garden_profile_id &&
                r.client_event_id === row.client_event_id
            );
            if (dup) {
              return { data: null, error: { code: '23505', message: 'duplicate key' } };
            }
            const saved = { id: `evt_${rows.length + 1}`, ...row };
            rows.push(saved);
            return { data: saved, error: null };
          }
          return { data: null, error: { message: 'no insert' } };
        },
        async maybeSingle() {
          const hit = rows.find(
            (r) =>
              r.garden_profile_id === this._filters.garden_profile_id &&
              r.client_event_id === this._filters.client_event_id
          );
          return { data: hit || null, error: null };
        }
      };
      return api;
    }
  };
}

function task(icon, title, when, pri, iso, auto, plant, done, id, extra = {}) {
  const row = [icon, title, when, pri, iso, auto, plant, done, id];
  Object.assign(row, extra);
  return row;
}

test('21: paid AI automated tests OFF; fixture provider calls = 0', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
  assert.equal(paidAiCalls, 0);
});

test('1+7: 30 plants must not create hundreds of routine tasks (JIT vs legacy estimate)', () => {
  const legacy = estimateLegacySeasonalTaskCount(30, { horizonDays: 180, waterEvery: 7 });
  assert.ok(legacy > 200, `legacy explosion baseline expected >200, got ${legacy}`);

  let created = 0;
  for (let i = 0; i < 30; i++) {
    const plant = { name: `Plant${i}`, water: 'moderate' };
    const open = [];
    const suggestion = nextRoutineCareSuggestion(plant, open, { maxOffsetDays: 14 });
    if (suggestion) {
      created += 1;
      open.push(task('💧', suggestion.title, 'soon', 'Low', '2026-09-16', true, plant.name, false, `t_${i}`));
      // Second call must not invent another routine while one is open
      assert.equal(nextRoutineCareSuggestion(plant, open), null);
    }
  }
  assert.ok(created <= 30, `JIT created ${created} — must be ≤1 per plant`);
  assert.ok(created < 100, 'no hundreds of active routine tasks');
});

test('2: Today Focus never shows more than 3 actions', () => {
  assert.equal(GARDEN_TODAY_FOCUS_MAX, 3);
  const tasks = [];
  for (let i = 0; i < 20; i++) {
    tasks.push(
      task('💧', `Water P${i}`, 'Today', 'High', TODAY, true, `P${i}`, false, `w_${i}`)
    );
  }
  const focus = selectGardenFocusTaskIndexes(tasks, { todayIso: TODAY, max: 3 });
  assert.equal(focus.length, 3);
});

test('3: Garden with zero useful actions shows zero focus items', () => {
  const tasks = [
    task('💧', 'Water Future', 'Later', 'Low', '2026-12-01', true, 'Oak', false, 'far1')
  ];
  const focus = selectGardenFocusTaskIndexes(tasks, { todayIso: TODAY, max: 3, horizonDays: 7 });
  assert.equal(focus.length, 0);
});

test('4: per-plant routine concurrency suppressed when urgent exists', () => {
  const tasks = [
    task('🩺', 'Inspect: sooty mold on Mango', 'Today', 'High', TODAY, false, 'Mango', false, 'pd_care_mango_1', {
      sourceModule: 'plant_doctor',
      taskType: 'doctor'
    }),
    task('💧', 'Water Mango', 'Today', 'Low', TODAY, true, 'Mango', false, 'water_m')
  ];
  const suppressed = findRoutineSuppressedByUrgentIndexes(tasks);
  assert.ok(suppressed.includes(1));
  const focus = selectGardenFocusTaskIndexes(tasks, { todayIso: TODAY, max: 3 });
  assert.ok(focus.includes(0));
  assert.ok(!focus.includes(1));
});

test('5: urgent health outranks routine', () => {
  const tasks = [
    task('💧', 'Water Rosemary', 'Today', 'High', TODAY, true, 'Rosemary', false, 'r1'),
    task('🩺', 'Inspect: pest on Lemon', 'Today', 'Medium', TODAY, false, 'Lemon', false, 'pd_care_lemon_x', {
      sourceModule: 'plant_doctor',
      taskType: 'doctor'
    })
  ];
  const focus = selectGardenFocusTaskIndexes(tasks, { todayIso: TODAY, max: 3 });
  assert.equal(focus[0], 1);
  assert.equal(classifyTaskRole(tasks[1]), TASK_ROLE.URGENT_HEALTH);
  assert.equal(classifyTaskRole(tasks[0]), TASK_ROLE.ROUTINE);
});

test('6: recurring missed tasks collapse to one current action (dedupe)', () => {
  const tasks = [
    task('💧', 'Water Mango', 'Overdue', 'Low', '2026-08-01', true, 'Mango', false, 'w1'),
    task('💧', 'Water Mango', 'Overdue', 'Low', '2026-08-08', true, 'Mango', false, 'w2'),
    task('💧', 'Water Mango Tree', 'Overdue', 'Low', '2026-08-15', true, 'Mango Tree', false, 'w3'),
    task('💧', 'Weekly watering check for Mango', 'Today', 'Low', TODAY, true, 'Mango', false, 'w4')
  ];
  assert.equal(semanticActionKey(tasks[0]), semanticActionKey(tasks[2]));
  assert.equal(semanticActionKey(tasks[0]), semanticActionKey(tasks[3]));
  const dups = findDuplicateRoutineIndexes(tasks, { todayIso: TODAY });
  assert.equal(dups.length, 3);
  const focus = selectGardenFocusTaskIndexes(tasks, { todayIso: TODAY, max: 3 });
  assert.equal(focus.length, 1);
});

test('8: semantic duplicate current task suppressed', () => {
  const tasks = [
    task('💧', 'Water Basil', 'Today', 'Low', TODAY, true, 'Basil', false, 'a'),
    task('💧', 'Water Basil', 'Today', 'Low', TODAY, true, 'Basil', false, 'b')
  ];
  const focus = selectGardenFocusTaskIndexes(tasks, { todayIso: TODAY, max: 3 });
  assert.equal(focus.length, 1);
});

test('9+11: task completion memory ≠ outcome; no outcome fields', () => {
  assert.equal(GARDEN_COMPLETION_VS_OUTCOME.INFER_SUCCESS_FROM_COMPLETION, false);
  const input = buildTaskCompletedMemoryInput(
    {
      id: '11111111-1111-1111-1111-111111111111',
      garden_profile_id: '22222222-2222-2222-2222-222222222222',
      client_instance_id: 'pd_care_mango_1',
      title: 'Inspect: mold',
      task_type: 'doctor',
      garden_plant_id: '33333333-3333-3333-3333-333333333333'
    },
    { title: 'Inspect: mold' }
  );
  assert.equal(input.eventType, GARDEN_EVENT_TYPES.TASK_COMPLETED);
  assert.equal(input.payload.done, true);
  assert.equal(input.payload.outcome, undefined);
  assert.equal(input.payload.helped, undefined);
});

test('10: outcome-eligible Doctor task schedules follow-up; routine does not', () => {
  const doctor = task(
    '🩺',
    'Inspect: sooty mold on Mango',
    'Today',
    'High',
    TODAY,
    false,
    'Mango',
    false,
    'pd_care_mango_abc',
    { sourceModule: 'plant_doctor', taskType: 'doctor' }
  );
  const water = task('💧', 'Water Mango', 'Today', 'Low', TODAY, true, 'Mango', false, 'water_1');
  assert.equal(isOutcomeEligibleCareTask(doctor), true);
  assert.equal(isOutcomeEligibleCareTask(water), false);
  const days = resolveOutcomeFollowUpDays(doctor);
  assert.ok(days >= 1 && days <= 14);
  assert.equal(CARE_OUTCOME_FALLBACK_DAYS, 3);
  const fu = buildOutcomeFollowUpTaskRow({
    plantName: 'Mango',
    completedTaskClientId: 'pd_care_mango_abc',
    completedTask: doctor,
    days,
    dueIso: '2026-09-18'
  });
  assert.ok(String(fu[8]).startsWith('outcome_fu_'));
  assert.equal(fu.outcomeFollowUp, true);
});

test('12+13: user outcome → exactly one task_outcome_reported; retry idempotent', async () => {
  const sb = makeMemoryStore();
  const gardenTaskId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const gardenProfileId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const memory = buildTaskOutcomeReportedMemoryInput({
    gardenProfileId,
    gardenTaskId,
    gardenPlantId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    outcome: GARDEN_OUTCOME_VALUES.BETTER,
    sourceModule: GARDEN_SOURCE_MODULES.PLANT_DOCTOR
  });
  const a = await writeGardenMemoryEvent(sb, memory);
  const b = await writeGardenMemoryEvent(sb, memory);
  assert.equal(a.eventId, b.eventId);
  assert.equal(b.idempotent, true);
  assert.equal(sb.rows.filter((r) => r.event_type === GARDEN_EVENT_TYPES.TASK_OUTCOME_REPORTED).length, 1);
});

test('14: better → no unnecessary escalation / followup', () => {
  const d = decideCareOutcomeFollowUp('better');
  assert.equal(d.followupRequested, false);
  assert.equal(d.autoAi, false);
});

test('15: no_change → followup_requested', () => {
  const d = decideCareOutcomeFollowUp('no_change');
  assert.equal(d.followupRequested, true);
  assert.equal(d.followupReason, GARDEN_FOLLOWUP_REASONS.NO_IMPROVEMENT);
  assert.equal(d.autoAi, false);
});

test('16: worse → higher-priority followup_requested', () => {
  const d = decideCareOutcomeFollowUp('worse');
  assert.equal(d.followupRequested, true);
  assert.equal(d.priority, 'High');
  assert.equal(d.followupReason, GARDEN_FOLLOWUP_REASONS.WORSENING);
  assert.equal(d.autoAi, false);
});

test('17: unsure preserves uncertainty', () => {
  const d = decideCareOutcomeFollowUp('unsure');
  assert.equal(d.followupRequested, true);
  assert.equal(d.followupReason, GARDEN_FOLLOWUP_REASONS.OUTCOME_UNKNOWN);
  assert.equal(d.escalate, false);
});

test('18: outcome never auto-runs paid AI', () => {
  for (const o of Object.values(GARDEN_OUTCOME_VALUES)) {
    const d = decideCareOutcomeFollowUp(o);
    assert.equal(d.autoAi, false);
  }
  const bundle = buildClosedLoopOutcomeMemoryBundle({
    gardenProfileId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    gardenTaskId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    outcome: 'no_change'
  });
  assert.equal(bundle.autoAi, false);
  assert.equal(bundle.outcomeMemory.payload.auto_ai, false);
  assert.equal(bundle.followupMemory.payload.auto_ai, false);
  assert.equal(paidAiCalls, 0);
});

test('B8 learning safety: personal outcome must not mutate global catalog', () => {
  assert.equal(GARDEN_LEARNING_SAFETY.GLOBAL_CATALOG_MUTATION, false);
  assert.throws(() => assertLearningSafetyForOutcome({ modifyGlobalCatalog: true }));
  assert.doesNotThrow(() => assertLearningSafetyForOutcome({}));
});

test('D: causal chain reconstructible via ids (not titles)', () => {
  const gardenProfileId = '11111111-1111-1111-1111-111111111111';
  const gardenPlantId = '22222222-2222-2222-2222-222222222222';
  const gardenTaskId = '33333333-3333-3333-3333-333333333333';
  const chain = buildCausalEventChain(
    [
      {
        eventType: GARDEN_EVENT_TYPES.DOCTOR_DIAGNOSIS,
        stableKey: 'diag1',
        gardenPlantId,
        payload: { likely_diagnosis: 'mold' }
      },
      {
        eventType: GARDEN_EVENT_TYPES.TASK_CREATED,
        stableKey: 'task1',
        gardenPlantId,
        gardenTaskId,
        payload: { title: 'care' }
      },
      {
        eventType: GARDEN_EVENT_TYPES.TASK_COMPLETED,
        stableKey: 'done1',
        gardenPlantId,
        gardenTaskId,
        payload: { done: true }
      },
      {
        eventType: GARDEN_EVENT_TYPES.TASK_OUTCOME_REPORTED,
        stableKey: 'out1',
        gardenPlantId,
        gardenTaskId,
        payload: { outcome: 'no_change' }
      },
      {
        eventType: GARDEN_EVENT_TYPES.FOLLOWUP_REQUESTED,
        stableKey: 'fu1',
        gardenPlantId,
        gardenTaskId,
        payload: { followup_reason: 'no_improvement' }
      }
    ],
    {
      gardenProfileId,
      gardenPlantId,
      sourceModule: GARDEN_SOURCE_MODULES.PLANT_DOCTOR,
      correlationId: 'ep_pd_mango_mold_2026-09-13'
    }
  );
  assert.equal(chain.events.length, 5);
  assert.equal(chain.correlation_id, 'ep_pd_mango_mold_2026-09-13');
  for (let i = 1; i < chain.events.length; i++) {
    assert.equal(chain.events[i].caused_by_event_id, chain.events[i - 1].id);
    assert.equal(chain.events[i].garden_profile_id, gardenProfileId);
    assert.equal(chain.events[i].correlation_id, chain.correlation_id);
  }
  assert.equal(chain.events[2].garden_task_id, gardenTaskId);
  assert.equal(chain.events[3].event_type, GARDEN_EVENT_TYPES.TASK_OUTCOME_REPORTED);
  assert.equal(chain.events[4].event_type, GARDEN_EVENT_TYPES.FOLLOWUP_REQUESTED);
});

test('19: Doctor max-one-task client id remains stable guardrail', () => {
  const row = buildDoctorCareTaskRow(
    {
      problem_name: 'Sooty mold',
      severity: 'moderate',
      primary_action: 'Wipe leaves and improve airflow'
    },
    {
      plantDisplayName: 'Mango',
      gardenPlantClientId: 'plant_mango_1',
      dayKey: TODAY
    }
  );
  assert.ok(String(row[8] || row.id).startsWith('pd_care_'));
  const row2 = buildDoctorCareTaskRow(
    {
      problem_name: 'Sooty mold',
      severity: 'moderate',
      primary_action: 'Wipe leaves and improve airflow'
    },
    {
      plantDisplayName: 'Mango',
      gardenPlantClientId: 'plant_mango_1',
      dayKey: TODAY
    }
  );
  assert.equal(row[8] || row.id, row2[8] || row2.id);
});

test('20: no seasonal task explosion in JIT suggestion path', () => {
  const plant = { name: 'Tomato', water: 'high', season: 'summer fertilize prune' };
  const open = [];
  const first = nextRoutineCareSuggestion(plant, open);
  assert.ok(first);
  open.push(task('💧', first.title, 'soon', 'Low', TODAY, true, 'Tomato', false, 't1'));
  assert.equal(nextRoutineCareSuggestion(plant, open), null);
  // Must never return a 6-month batch
  assert.ok(!Array.isArray(first));
  assert.ok(first.offsetDays <= 14);
});

test('followup memory builder marks auto_ai false', () => {
  const m = buildFollowupRequestedMemoryInput({
    gardenProfileId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    gardenTaskId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    followupReason: GARDEN_FOLLOWUP_REASONS.WORSENING,
    priority: 'High',
    outcome: 'worse'
  });
  assert.equal(m.eventType, GARDEN_EVENT_TYPES.FOLLOWUP_REQUESTED);
  assert.equal(m.payload.auto_ai, false);
});

test('isRoutineCareTask true for water/fertilize; false for doctor', () => {
  assert.equal(isRoutineCareTask(task('💧', 'Water Oak', 't', 'L', TODAY, true, 'Oak', false, 'x')), true);
  assert.equal(
    isRoutineCareTask(
      task('🩺', 'Inspect: rot', 't', 'H', TODAY, false, 'Oak', false, 'pd_care_x', {
        sourceModule: 'plant_doctor'
      })
    ),
    false
  );
});
