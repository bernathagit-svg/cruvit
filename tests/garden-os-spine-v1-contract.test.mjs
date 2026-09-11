/**
 * Garden OS Spine V1 — final moat/causality contract tests (zero paid AI).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  GARDEN_COMPLETION_VS_OUTCOME,
  GARDEN_EVENT_SCHEMA_VERSION,
  GARDEN_EVENT_TYPES,
  GARDEN_LEARNING_SAFETY,
  GARDEN_OUTCOME_VALUES,
  GARDEN_RECOMMENDATION_LIFECYCLE,
  GARDEN_SOURCE_MODULES,
  assertCausalParentSameGarden,
  assertSupportedSchemaVersion,
  buildCausalEventChain,
  buildGardenClientEventId,
  buildGardenEventInsert,
  buildIdempotentGardenEventInsert,
  buildTaskOutcomeEventInsert,
  isGardenEventType,
  isRecommendationLifecycleEventType,
  isTaskCompletionEventType,
  isTaskOutcomeEventType,
  mayEmitGardenEvent,
  normalizeDecisionContext,
  normalizeDecisionProvenance
} from '../modules/personal-domain/garden-os-spine-v1-contract.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import { FIXTURE_PROVIDER_CALLS } from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';

const MIGRATION_SQL = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../supabase/migrations/20260911180000_garden_os_spine_v1.sql'),
  'utf8'
);

test('K: paid AI automated tests remain OFF; fixtures use zero provider calls', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
});

test('A: valid causal event chain', () => {
  const { correlation_id, events } = buildCausalEventChain(
    [
      {
        eventType: GARDEN_EVENT_TYPES.DOCTOR_DIAGNOSIS,
        sourceModule: GARDEN_SOURCE_MODULES.PLANT_DOCTOR,
        decisionContext: {
          plant_slug: 'mango',
          confidence: 0.9,
          evidence_state: 'high',
          plant_health_snapshot: { mark: '!', status: 'Needs attention' }
        },
        provenance: {
          contract_version: 'doctor-v1',
          engine_version: '1.0.0',
          model_provider: 'fixture',
          model_version: 'test'
        }
      },
      { eventType: GARDEN_EVENT_TYPES.RECOMMENDATION_GENERATED, sourceModule: GARDEN_SOURCE_MODULES.PLANT_DOCTOR },
      {
        eventType: GARDEN_EVENT_TYPES.TASK_CREATED,
        sourceModule: GARDEN_SOURCE_MODULES.PLANT_DOCTOR,
        gardenTaskId: 't1'
      },
      {
        eventType: GARDEN_EVENT_TYPES.TASK_COMPLETED,
        sourceModule: GARDEN_SOURCE_MODULES.MY_GARDEN,
        gardenTaskId: 't1'
      },
      {
        eventType: GARDEN_EVENT_TYPES.TASK_OUTCOME_REPORTED,
        sourceModule: GARDEN_SOURCE_MODULES.MY_GARDEN,
        gardenTaskId: 't1',
        payload: { outcome: 'better' }
      },
      { eventType: GARDEN_EVENT_TYPES.PLANT_HEALTH_CHANGED, sourceModule: GARDEN_SOURCE_MODULES.MY_GARDEN },
      { eventType: GARDEN_EVENT_TYPES.FOLLOWUP_REQUESTED, sourceModule: GARDEN_SOURCE_MODULES.PLANT_DOCTOR, payload: { followup_reason: 'no_improvement' } }
    ],
    {
      gardenProfileId: 'g1',
      gardenPlantId: 'p1',
      correlationId: 'ep_mango_doctor_1',
      occurredAt: '2026-09-11T12:00:00.000Z'
    }
  );

  assert.equal(correlation_id, 'ep_mango_doctor_1');
  assert.equal(events.length, 7);
  assert.equal(events[0].caused_by_event_id, null);
  assert.equal(events[1].caused_by_event_id, events[0].id);
  assert.equal(events[6].caused_by_event_id, events[5].id);
  for (const e of events) {
    assert.equal(e.garden_profile_id, 'g1');
    assert.equal(e.correlation_id, 'ep_mango_doctor_1');
    assert.equal(e.schema_version, GARDEN_EVENT_SCHEMA_VERSION);
  }
  assert.equal(events[0].payload.decision_context.plant_slug, 'mango');
  assert.equal(events[0].payload.provenance.model_provider, 'fixture');
});

test('B: cross-garden causal parent rejected', () => {
  assert.throws(
    () =>
      assertCausalParentSameGarden({
        gardenProfileId: 'g1',
        causedByEventId: 'evt_other',
        causedByEventGardenProfileId: 'g_other'
      }),
    /garden_event_causal_garden_mismatch/
  );
  assert.throws(
    () =>
      buildGardenEventInsert({
        reason: 'explicit_mutation',
        explicitMutation: true,
        gardenProfileId: 'g1',
        causedByEventId: 'evt_other',
        causedByEventGardenProfileId: 'g2',
        eventType: GARDEN_EVENT_TYPES.TASK_CREATED,
        sourceModule: GARDEN_SOURCE_MODULES.MY_GARDEN,
        stableKey: 'cross_garden_bad'
      }),
    /garden_event_causal_garden_mismatch/
  );
  assert.match(MIGRATION_SQL, /garden_event_causal_garden_mismatch/);
  assert.match(
    MIGRATION_SQL,
    /caused_by_event_id uuid references public\.garden_events \(id\) on delete set null/i
  );
});

test('C: correlation_id preserved', () => {
  const row = buildGardenEventInsert({
    reason: 'user_action',
    explicitMutation: true,
    gardenProfileId: 'g1',
    correlationId: 'ep_shared_42',
    eventType: GARDEN_EVENT_TYPES.RECOMMENDATION_ACCEPTED,
    sourceModule: GARDEN_SOURCE_MODULES.SMART_RECOMMENDATIONS,
    stableKey: 'rec_accept_1',
    occurredAt: '2026-09-11T12:00:00.000Z'
  });
  assert.equal(row.correlation_id, 'ep_shared_42');
  assert.match(MIGRATION_SQL, /garden_events_garden_correlation_idx/);
});

test('D: recommendation generated / accepted / rejected remain distinct', () => {
  assert.equal(GARDEN_EVENT_TYPES.RECOMMENDATION_GENERATED, 'recommendation_generated');
  assert.equal(GARDEN_EVENT_TYPES.RECOMMENDATION_ACCEPTED, 'recommendation_accepted');
  assert.equal(GARDEN_EVENT_TYPES.RECOMMENDATION_REJECTED, 'recommendation_rejected');
  assert.equal(GARDEN_RECOMMENDATION_LIFECYCLE.INFER_ACCEPTED_FROM_GENERATED, false);
  assert.equal(GARDEN_RECOMMENDATION_LIFECYCLE.INFER_TASK_FROM_ACCEPTED, false);

  const types = [
    GARDEN_EVENT_TYPES.RECOMMENDATION_GENERATED,
    GARDEN_EVENT_TYPES.RECOMMENDATION_ACCEPTED,
    GARDEN_EVENT_TYPES.RECOMMENDATION_REJECTED,
    GARDEN_EVENT_TYPES.TASK_CREATED
  ];
  const ids = new Set(types);
  assert.equal(ids.size, 4);
  for (const t of types.slice(0, 3)) {
    assert.equal(isRecommendationLifecycleEventType(t), true);
    assert.equal(isGardenEventType(t), true);
  }

  const gen = buildGardenEventInsert({
    reason: 'module_write',
    explicitMutation: true,
    gardenProfileId: 'g1',
    eventType: GARDEN_EVENT_TYPES.RECOMMENDATION_GENERATED,
    sourceModule: GARDEN_SOURCE_MODULES.SMART_RECOMMENDATIONS,
    stableKey: 'rec_gen_1',
    occurredAt: '2026-09-11T12:00:00.000Z',
    decisionContext: { plant_slug: 'basil', confidence: 0.7 }
  });
  const rej = buildGardenEventInsert({
    reason: 'user_action',
    explicitMutation: true,
    gardenProfileId: 'g1',
    eventType: GARDEN_EVENT_TYPES.RECOMMENDATION_REJECTED,
    sourceModule: GARDEN_SOURCE_MODULES.SMART_RECOMMENDATIONS,
    stableKey: 'rec_rej_1',
    occurredAt: '2026-09-11T12:00:00.000Z'
  });
  assert.equal(gen.event_type, 'recommendation_generated');
  assert.equal(rej.event_type, 'recommendation_rejected');
  assert.notEqual(gen.client_event_id, rej.client_event_id);
});

test('E: task completed != outcome', () => {
  assert.notEqual(GARDEN_EVENT_TYPES.TASK_COMPLETED, GARDEN_EVENT_TYPES.TASK_OUTCOME_REPORTED);
  assert.equal(GARDEN_COMPLETION_VS_OUTCOME.INFER_SUCCESS_FROM_COMPLETION, false);
  assert.equal(isTaskCompletionEventType('task_completed'), true);
  assert.equal(isTaskOutcomeEventType('task_completed'), false);

  const done = buildGardenEventInsert({
    reason: 'user_action',
    explicitMutation: true,
    gardenProfileId: 'g1',
    gardenTaskId: 't1',
    eventType: GARDEN_EVENT_TYPES.TASK_COMPLETED,
    sourceModule: GARDEN_SOURCE_MODULES.MY_GARDEN,
    stableKey: 't1_done',
    occurredAt: '2026-09-11T12:00:00.000Z'
  });
  const outcome = buildTaskOutcomeEventInsert({
    reason: 'user_action',
    explicitMutation: true,
    gardenProfileId: 'g1',
    gardenTaskId: 't1',
    sourceModule: GARDEN_SOURCE_MODULES.MY_GARDEN,
    outcome: GARDEN_OUTCOME_VALUES.NO_CHANGE,
    occurredAt: '2026-09-11T18:00:00.000Z'
  });
  assert.equal(done.event_type, 'task_completed');
  assert.equal(outcome.event_type, 'task_outcome_reported');
  assert.equal(outcome.payload.outcome, 'no_change');
});

test('F: schema_version validated', () => {
  assert.equal(assertSupportedSchemaVersion(1), 1);
  assert.throws(() => assertSupportedSchemaVersion(0), /invalid_schema_version/);
  assert.throws(() => assertSupportedSchemaVersion(99), /unsupported_schema_version/);
  assert.throws(
    () =>
      buildGardenEventInsert({
        reason: 'explicit_mutation',
        explicitMutation: true,
        gardenProfileId: 'g1',
        schemaVersion: 2,
        eventType: GARDEN_EVENT_TYPES.PLANT_ADDED,
        sourceModule: GARDEN_SOURCE_MODULES.MY_GARDEN,
        stableKey: 'bad_ver'
      }),
    /unsupported_schema_version/
  );
  const row = buildGardenEventInsert({
    reason: 'explicit_mutation',
    explicitMutation: true,
    gardenProfileId: 'g1',
    eventType: GARDEN_EVENT_TYPES.PLANT_ADDED,
    sourceModule: GARDEN_SOURCE_MODULES.MY_GARDEN,
    stableKey: 'ok_ver',
    occurredAt: '2026-09-11T12:00:00.000Z'
  });
  assert.equal(row.schema_version, 1);
  assert.match(MIGRATION_SQL, /schema_version smallint not null default 1/i);
});

test('G: provenance/context payload accepted and bounded', () => {
  const provenance = normalizeDecisionProvenance({
    contract_version: 'spine-v1',
    engine_version: '1.0.2',
    confidence: 'high',
    evidence_state: 'sufficient',
    model_provider: 'fixture',
    model_version: '0',
    ignored_extra: 'drop_me'
  });
  assert.equal(provenance.contract_version, 'spine-v1');
  assert.equal(provenance.ignored_extra, undefined);

  assert.throws(
    () => normalizeDecisionProvenance({ raw_prompt: 'SECRET DO NOT STORE' }),
    /provenance_forbidden_key/
  );
  assert.throws(
    () => normalizeDecisionProvenance({ api_key: 'x' }),
    /provenance_forbidden_key/
  );

  const ctx = normalizeDecisionContext({
    plant_slug: 'tomato',
    garden_location_ref: 'loc_athens',
    area_ref: 'future_area_id',
    climate_state: { season: 'summer', heat: 'high' },
    plant_health_snapshot: { mark: 'OK', status: 'Healthy' },
    confidence: 0.8,
    evidence_state: 'medium'
  });
  assert.equal(ctx.plant_slug, 'tomato');
  assert.equal(ctx.climate_state.season, 'summer');

  assert.throws(() => normalizeDecisionContext({ plant_health_snapshot: 'dump' }), /must_be_object/);

  const row = buildGardenEventInsert({
    reason: 'module_write',
    explicitMutation: true,
    gardenProfileId: 'g1',
    eventType: GARDEN_EVENT_TYPES.SUITABILITY_CHECKED,
    sourceModule: GARDEN_SOURCE_MODULES.SMART_RECOMMENDATIONS,
    stableKey: 'suit_1',
    occurredAt: '2026-09-11T12:00:00.000Z',
    provenance: { engine_version: '1.0.2', confidence: 'medium' },
    decisionContext: { plant_slug: 'olive', garden_location_ref: 'loc_1' }
  });
  assert.equal(row.payload.provenance.engine_version, '1.0.2');
  assert.equal(row.payload.decision_context.plant_slug, 'olive');
  assert.equal(GARDEN_LEARNING_SAFETY.GLOBAL_CATALOG_MUTATION, false);
});

test('H: duplicate retry idempotent', () => {
  const input = {
    reason: 'user_action',
    explicitMutation: true,
    gardenProfileId: 'g1',
    gardenPlantId: 'p1',
    causedByEventId: 'evt_parent',
    causedByEventGardenProfileId: 'g1',
    correlationId: 'ep_retry',
    eventType: GARDEN_EVENT_TYPES.RECOMMENDATION_ACCEPTED,
    sourceModule: GARDEN_SOURCE_MODULES.SMART_RECOMMENDATIONS,
    stableKey: 'rec_accept_retry',
    occurredAt: '2026-09-11T12:00:00.000Z',
    provenance: { contract_version: 'v1' }
  };
  const a = buildIdempotentGardenEventInsert(input);
  const b = buildIdempotentGardenEventInsert(input);
  assert.deepEqual(a, b);
  assert.equal(
    a.client_event_id,
    buildGardenClientEventId({
      sourceModule: 'smart_recommendations',
      eventType: 'recommendation_accepted',
      stableKey: 'rec_accept_retry'
    })
  );
});

test('I: hydrate/render emits nothing', () => {
  for (const reason of ['hydrate', 'reload', 'render', 'server_reconciliation', 'sync_loop']) {
    assert.equal(mayEmitGardenEvent({ reason }), false, reason);
    assert.throws(
      () =>
        buildGardenEventInsert({
          reason,
          gardenProfileId: 'g1',
          eventType: GARDEN_EVENT_TYPES.RECOMMENDATION_GENERATED,
          sourceModule: GARDEN_SOURCE_MODULES.SMART_RECOMMENDATIONS,
          stableKey: 'x'
        }),
      /garden_event_emit_forbidden/
    );
  }
});

test('migration indexes for causal/history reads present', () => {
  assert.match(MIGRATION_SQL, /garden_events_caused_by_idx/);
  assert.match(MIGRATION_SQL, /garden_events_garden_correlation_idx/);
  assert.match(MIGRATION_SQL, /garden_events_task_occurred_idx/);
});
