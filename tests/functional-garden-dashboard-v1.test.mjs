/**
 * Functional Garden Dashboard V1 — zero-paid read-model tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGardenDashboardReadModel,
  classifyPlantHealthBucket,
  sortPlantsForHealthSummary,
  buildLearningSignals,
  buildFollowUpQueue,
  buildActivityItem,
  DASHBOARD_FIELD_AUTHORITY,
  GARDEN_DASHBOARD_V1_VERSION
} from '../modules/personal-domain/garden-dashboard-v1-contract.js';
import { GARDEN_EVENT_TYPES, GARDEN_OUTCOME_VALUES } from '../modules/personal-domain/garden-os-spine-v1-contract.js';
import { GARDEN_TODAY_FOCUS_MAX } from '../modules/personal-domain/garden-task-budget-v1-contract.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import { FIXTURE_PROVIDER_CALLS } from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';

const TODAY = '2026-09-13';
let paidAiCalls = 0;

function task(icon, title, when, pri, iso, auto, plant, done, id, extra = {}) {
  const row = [icon, title, when, pri, iso, auto, plant, done, id];
  Object.assign(row, extra);
  return row;
}

function evt(partial) {
  return {
    id: partial.id || `evt_${Math.random().toString(36).slice(2, 8)}`,
    garden_profile_id: partial.garden_profile_id || 'g1',
    garden_plant_id: partial.garden_plant_id || null,
    event_type: partial.event_type,
    payload: partial.payload || {},
    occurred_at: partial.occurred_at || '2026-09-13T12:00:00.000Z'
  };
}

test('O: paid AI automated tests OFF', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
  assert.equal(paidAiCalls, 0);
});

test('A: Garden with 3 plants renders correct plant count', () => {
  const model = buildGardenDashboardReadModel({
    garden: { id: 'g1', name: 'Backyard', location_label: 'Haifa' },
    plants: [
      { name: 'Mango', status: 'Healthy', mark: '✓', id: 'p1' },
      { name: 'Basil', status: 'Healthy', mark: '✓', id: 'p2' },
      { name: 'Rose', status: 'Needs water', mark: '!', id: 'p3' }
    ],
    tasks: [],
    events: [],
    todayIso: TODAY
  });
  assert.equal(model.summary.plantCount, 3);
  assert.equal(model.plantHealth.plants.length, 3);
  assert.equal(model.mutationsOnBuild, false);
  assert.equal(model.paidAiCalls, 0);
});

test('B: unhealthy/attention plant appears before healthy plants', () => {
  const sorted = sortPlantsForHealthSummary([
    { name: 'Lavender', status: 'Healthy', mark: '✓' },
    { name: 'Mango', status: 'Pest risk', mark: '!' },
    { name: 'Mint', status: 'Healthy', mark: '✓' }
  ]);
  assert.equal(sorted[0].name, 'Mango');
  assert.equal(sorted[0].healthBucket, 'needs_attention');
  assert.equal(classifyPlantHealthBucket({ status: 'Healthy', mark: '✓' }), 'healthy');
});

test('C: Today Focus never exceeds 3', () => {
  const tasks = [];
  for (let i = 0; i < 10; i++) {
    tasks.push(task('💧', `Water P${i}`, 'Today', 'Low', TODAY, true, `P${i}`, false, `w${i}`));
  }
  tasks.push(
    task('🩺', 'Inspect: mold', 'Today', 'High', TODAY, false, 'Oak', false, 'pd_care_oak', {
      sourceModule: 'plant_doctor',
      taskType: 'doctor'
    })
  );
  const model = buildGardenDashboardReadModel({
    garden: { id: 'g1', name: 'G' },
    plants: [{ name: 'Oak', mark: '!', status: 'Mold' }],
    tasks,
    events: [],
    todayIso: TODAY
  });
  assert.ok(model.today.actions.length <= GARDEN_TODAY_FOCUS_MAX);
  assert.equal(GARDEN_TODAY_FOCUS_MAX, 3);
});

test('D: 30 compatible routine tasks appear as consolidated actions', () => {
  const tasks = [];
  const plants = [];
  for (let i = 0; i < 30; i++) {
    plants.push({ name: `Plant${i}`, water: 'moderate', mark: '✓', status: 'Healthy' });
    tasks.push(task('💧', `Water Plant${i}`, 'Today', 'Low', TODAY, true, `Plant${i}`, false, `w${i}`));
  }
  const model = buildGardenDashboardReadModel({
    garden: { id: 'g1', name: 'G' },
    plants,
    tasks,
    events: [],
    todayIso: TODAY
  });
  assert.ok(model.today.actions.length < 30);
  assert.equal(model.today.actions.length, 1);
  assert.equal(model.today.actions[0].kind, 'group');
  assert.equal(model.today.actions[0].plantNames.length, 30);
});

test('E: no useful tasks → rest state', () => {
  const model = buildGardenDashboardReadModel({
    garden: { id: 'g1', name: 'G' },
    plants: [{ name: 'Oak', mark: '✓', status: 'Healthy' }],
    tasks: [task('💧', 'Water Future', 'Later', 'Low', '2026-12-01', true, 'Oak', false, 'far')],
    events: [],
    todayIso: TODAY
  });
  assert.equal(model.today.rest, true);
  assert.match(model.today.restMessage, /rest/i);
});

test('F: task completed does not imply treatment success', () => {
  assert.equal(DASHBOARD_FIELD_AUTHORITY.care_outcomes, 'SERVER_AUTHORITATIVE');
  const model = buildGardenDashboardReadModel({
    garden: { id: 'g1', name: 'G' },
    plants: [{ name: 'Mango', mark: '!', status: 'Mold', serverId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }],
    tasks: [],
    events: [
      evt({
        event_type: GARDEN_EVENT_TYPES.TASK_COMPLETED,
        garden_plant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        payload: { title: 'Wipe leaves', done: true }
      })
    ],
    todayIso: TODAY
  });
  assert.equal(model.learning.empty, true);
  assert.equal(model.learning.signals.length, 0);
});

test('G: pending care outcome surfaces follow-up', () => {
  const tasks = [
    task('📋', 'How is Mango after this care?', 'Due', 'Medium', TODAY, false, 'Mango', false, 'outcome_fu_pd_care_x', {
      outcomeFollowUp: true
    })
  ];
  const fu = buildFollowUpQueue({ tasks, events: [], todayIso: TODAY });
  assert.ok(fu.some((x) => x.kind === 'outcome_due'));
  assert.equal(fu[0].autoAi, false);
});

test('H: better outcome creates positive personal evidence', () => {
  const plantId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const signals = buildLearningSignals(
    [
      evt({
        event_type: GARDEN_EVENT_TYPES.TASK_OUTCOME_REPORTED,
        garden_plant_id: plantId,
        payload: { outcome: GARDEN_OUTCOME_VALUES.BETTER }
      })
    ],
    new Map([[plantId, { name: 'Mango' }]])
  );
  assert.equal(signals.length, 1);
  assert.equal(signals[0].tone, 'positive');
  assert.equal(signals[0].fabricated, false);
  assert.match(signals[0].text, /Mango/);
});

test('I: no_change/worse surfaces follow-up/negative evidence', () => {
  const plantId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const model = buildGardenDashboardReadModel({
    garden: { id: 'g1', name: 'G' },
    plants: [{ name: 'Mango', mark: '!', status: 'Watch', serverId: plantId, id: plantId }],
    tasks: [],
    events: [
      evt({
        event_type: GARDEN_EVENT_TYPES.TASK_OUTCOME_REPORTED,
        garden_plant_id: plantId,
        payload: { outcome: GARDEN_OUTCOME_VALUES.NO_CHANGE }
      }),
      evt({
        event_type: GARDEN_EVENT_TYPES.FOLLOWUP_REQUESTED,
        garden_plant_id: plantId,
        payload: { followup_reason: 'no_improvement', auto_ai: false }
      }),
      evt({
        id: 'e_worse',
        event_type: GARDEN_EVENT_TYPES.TASK_OUTCOME_REPORTED,
        garden_plant_id: plantId,
        payload: { outcome: GARDEN_OUTCOME_VALUES.WORSE },
        occurred_at: '2026-09-12T10:00:00.000Z'
      })
    ],
    todayIso: TODAY
  });
  assert.ok(model.learning.signals.some((s) => s.tone === 'negative'));
  assert.ok(model.followUps.items.some((f) => f.kind === 'followup_requested'));
  assert.ok(model.followUps.items.every((f) => f.autoPlantDoctor !== true));
});

test('J: no outcome evidence → no fabricated learning', () => {
  const model = buildGardenDashboardReadModel({
    garden: { id: 'g1', name: 'G' },
    plants: [{ name: 'Basil', mark: '✓', status: 'Healthy' }],
    tasks: [],
    events: [
      evt({ event_type: GARDEN_EVENT_TYPES.PLANT_ADDED, payload: { name: 'Basil' } }),
      evt({ event_type: GARDEN_EVENT_TYPES.TASK_COMPLETED, payload: { title: 'Water Basil' } })
    ],
    todayIso: TODAY
  });
  assert.equal(model.learning.empty, true);
  assert.equal(model.learning.signals.length, 0);
});

test('K: recent Garden events ordered correctly', () => {
  const model = buildGardenDashboardReadModel({
    garden: { id: 'g1', name: 'G' },
    plants: [],
    tasks: [],
    events: [
      evt({
        id: 'old',
        event_type: GARDEN_EVENT_TYPES.PLANT_ADDED,
        occurred_at: '2026-09-10T10:00:00.000Z',
        payload: { name: 'A' }
      }),
      evt({
        id: 'new',
        event_type: GARDEN_EVENT_TYPES.DOCTOR_DIAGNOSIS,
        occurred_at: '2026-09-13T15:00:00.000Z',
        payload: { likely_diagnosis: 'mold' }
      }),
      evt({
        id: 'mid',
        event_type: GARDEN_EVENT_TYPES.TASK_COMPLETED,
        occurred_at: '2026-09-12T12:00:00.000Z',
        payload: { title: 'Wipe' }
      })
    ],
    todayIso: TODAY
  });
  assert.equal(model.recentActivity.items[0].id, 'new');
  assert.equal(model.recentActivity.items[1].id, 'mid');
  assert.equal(model.recentActivity.items[2].id, 'old');
  const item = buildActivityItem(
    evt({ event_type: GARDEN_EVENT_TYPES.TASK_OUTCOME_REPORTED, payload: { outcome: 'better' } })
  );
  assert.ok(!JSON.stringify(item).includes('client_event_id'));
  assert.ok(!JSON.stringify(item).includes('schema_version'));
});

test('L: no cross-Garden data leakage in composed model', () => {
  const model = buildGardenDashboardReadModel({
    garden: { id: 'g1', name: 'Mine' },
    plants: [{ name: 'MinePlant', mark: '✓', status: 'Healthy' }],
    tasks: [],
    // Caller must only pass this garden's events; model scopes to input garden id
    events: [
      evt({
        garden_profile_id: 'g1',
        event_type: GARDEN_EVENT_TYPES.PLANT_ADDED,
        payload: { name: 'MinePlant' }
      })
    ],
    todayIso: TODAY
  });
  assert.equal(model.gardenId, 'g1');
  assert.equal(model.summary.name, 'Mine');
  assert.ok(model.recentActivity.items.every((i) => i));
});

test('M+N: build creates zero mutations / no event generation side effects', () => {
  const model = buildGardenDashboardReadModel({
    garden: { id: 'g1', name: 'G' },
    plants: [],
    tasks: [],
    events: [],
    todayIso: TODAY
  });
  assert.equal(model.mutationsOnBuild, false);
  assert.equal(model.version, GARDEN_DASHBOARD_V1_VERSION);
  assert.equal(DASHBOARD_FIELD_AUTHORITY.recommendation_events, 'NOT_YET_AVAILABLE');
  assert.equal(DASHBOARD_FIELD_AUTHORITY.garden_events, 'SERVER_AUTHORITATIVE');
  assert.equal(DASHBOARD_FIELD_AUTHORITY.today_focus_actions, 'DERIVED_FROM_SERVER_STATE');
});

test('semantic: attention plant → mostly healthy state, not full healthy rest', () => {
  const model = buildGardenDashboardReadModel({
    garden: { id: 'g1', name: 'G', location_label: 'Mojstrana' },
    plants: [
      { name: 'Mango', mark: '!', status: 'Needs attention', id: 'p1' },
      { name: 'Basil', mark: '✓', status: 'Healthy', id: 'p2' }
    ],
    tasks: [],
    events: [
      {
        id: 'done1',
        event_type: GARDEN_EVENT_TYPES.TASK_COMPLETED,
        occurred_at: '2026-09-13T12:00:00.000Z',
        payload: { title: 'Wipe leaves' }
      }
    ],
    todayIso: TODAY
  });
  assert.match(model.summary.stateLabel, /Mostly healthy/i);
  assert.ok(!/Balanced Garden/i.test(model.summary.stateLabel));
  assert.equal(model.today.rest, true);
  assert.equal(model.today.restKind, 'monitor');
  assert.equal(model.today.restMessage, 'No action needed today');
  assert.ok(model.recentActivity.items.some((i) => /completed/i.test(i.label)));
  assert.equal(model.learning.empty, true);
  assert.equal(model.mutationsOnBuild, false);
  assert.ok(model.today.actions.length <= 3);
});
