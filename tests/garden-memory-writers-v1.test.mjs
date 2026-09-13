/**
 * Garden Memory Writers V1 — zero-paid contract + idempotency tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GARDEN_EVENT_TYPES,
  GARDEN_SOURCE_MODULES,
  buildDoctorDiagnosisMemoryInput,
  buildDoctorEpisodeIds,
  buildDoctorHealthChangedMemoryInput,
  buildDoctorTaskCreatedMemoryInput,
  buildPlantAddedMemoryInput,
  buildTaskCompletedMemoryInput,
  mayEmitGardenEvent,
  writeGardenMemoryEvent
} from '../modules/personal-domain/garden-memory-writer-v1.js';
import { buildDoctorCareTaskRow } from '../modules/personal-domain/plant-doctor-care-loop-v1-contract.js';
import {
  applyDoctorCareLoopResult,
  persistDoctorGardenMemoryEpisode
} from '../modules/personal-domain/plant-doctor-care-loop-v1-host.js';
import {
  PLANT_DOCTOR_ACTIONS,
  PLANT_DOCTOR_RESULT_MESSAGE_TYPE,
  PLANT_DOCTOR_SOURCE
} from '../modules/personal-domain/plant-doctor-care-loop-v1-contract.js';
import {
  FIXTURE_MATCH_HIGH,
  FIXTURE_PROVIDER_CALLS
} from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import { buildDoctorResultBridgeMessage } from '../modules/personal-domain/plant-doctor-care-loop-v1-contract.js';

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

const MATCH_DIAGNOSIS = FIXTURE_MATCH_HIGH;

test('N: paid AI automated tests remain OFF; fixtures use zero provider calls', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
});

test('A: explicit plant add → exactly one plant_added event', async () => {
  const sb = makeMemoryStore();
  const plantRow = {
    id: 'sp1',
    garden_profile_id: 'g1',
    client_instance_id: 'plant_abc',
    name: 'Mango',
    scientific: 'Mangifera indica',
    profile_slug: 'mango',
    source: 'My Garden'
  };
  const input = buildPlantAddedMemoryInput(plantRow);
  const a = await writeGardenMemoryEvent(sb, input);
  assert.equal(a.ok, true);
  assert.equal(a.idempotent, false);
  assert.equal(sb.rows.length, 1);
  assert.equal(sb.rows[0].event_type, 'plant_added');
  assert.equal(sb.rows[0].source_module, 'my_garden');
  assert.equal(sb.rows[0].garden_plant_id, 'sp1');
});

test('B: duplicate retry of same plant mutation event → still exactly one durable event', async () => {
  const sb = makeMemoryStore();
  const input = buildPlantAddedMemoryInput({
    id: 'sp1',
    garden_profile_id: 'g1',
    client_instance_id: 'plant_abc',
    name: 'Mango'
  });
  const a = await writeGardenMemoryEvent(sb, input);
  const b = await writeGardenMemoryEvent(sb, input);
  assert.equal(sb.rows.length, 1);
  assert.equal(a.eventId, b.eventId);
  assert.equal(b.idempotent, true);
});

test('C: reload/hydrate/render → zero new events', async () => {
  for (const reason of ['hydrate', 'reload', 'render', 'sync_loop', 'server_reconciliation']) {
    assert.equal(mayEmitGardenEvent({ reason }), false);
  }
  const sb = makeMemoryStore();
  await assert.rejects(
    () =>
      writeGardenMemoryEvent(sb, {
        reason: 'hydrate',
        explicitMutation: false,
        gardenProfileId: 'g1',
        eventType: GARDEN_EVENT_TYPES.PLANT_ADDED,
        sourceModule: GARDEN_SOURCE_MODULES.MY_GARDEN,
        stableKey: 'x',
        gardenPlantId: 'p1'
      }),
    /garden_event_emit_forbidden/
  );
  assert.equal(sb.rows.length, 0);
});

test('D: task false→true → exactly one task_completed event', async () => {
  const sb = makeMemoryStore();
  const input = buildTaskCompletedMemoryInput({
    id: 'st1',
    garden_profile_id: 'g1',
    client_instance_id: 'task_xyz',
    title: 'Water plant',
    garden_plant_id: 'sp1',
    done: true
  });
  const w = await writeGardenMemoryEvent(sb, input);
  assert.equal(w.ok, true);
  assert.equal(sb.rows[0].event_type, 'task_completed');
  assert.equal(sb.rows[0].payload.previous_done, false);
  assert.equal(sb.rows[0].payload.done, true);
  assert.equal(sb.rows[0].payload.helped, undefined);
});

test('E: repeated render of completed task → zero additional events (idempotent id)', async () => {
  const sb = makeMemoryStore();
  const input = buildTaskCompletedMemoryInput({
    id: 'st1',
    garden_profile_id: 'g1',
    client_instance_id: 'task_xyz',
    title: 'Water plant'
  });
  await writeGardenMemoryEvent(sb, input);
  await writeGardenMemoryEvent(sb, input);
  await writeGardenMemoryEvent(sb, input);
  assert.equal(sb.rows.length, 1);
});

test('F/G/H: Doctor fixture diagnosis + health + task causal episode', async () => {
  const events = [];
  const plants = [];
  const tasks = [];
  const pd = {
    getActiveGardenId: () => 'g1',
    async upsertPlantOnActiveGarden(plant) {
      const row = {
        id: 'sp_mango',
        garden_profile_id: 'g1',
        client_instance_id: plant.id,
        name: plant.name,
        mark: plant.mark,
        status: plant.status
      };
      plants.push(row);
      return row;
    },
    async upsertTaskOnActiveGarden(task) {
      const row = {
        id: 'st_pd1',
        garden_profile_id: 'g1',
        client_instance_id: task[8] || task.id,
        title: task[1],
        source_module: task.source_module,
        task_type: task.task_type,
        garden_plant_id: 'sp_mango'
      };
      tasks.push(row);
      return row;
    },
    async recordGardenMemoryEvent(input) {
      assert.equal(input.gardenProfileId, 'g1');
      if (input.causedByEventId) {
        assert.equal(input.causedByEventGardenProfileId || 'g1', 'g1');
      }
      const id = `evt_${events.length + 1}`;
      events.push({ id, ...input });
      return { ok: true, eventId: id, event: { id, ...input } };
    }
  };

  const data = {
    plants: [
      {
        id: 'plant_mango',
        serverId: null,
        name: 'Mango',
        mark: '✓',
        status: 'Healthy',
        profileSlug: 'mango'
      }
    ],
    tasks: [],
    events: [],
    plantDoctorResults: []
  };

  const msg = buildDoctorResultBridgeMessage({
    action: PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK,
    gardenProfileId: 'g1',
    gardenPlantClientId: 'plant_mango',
    plantDisplayName: 'Mango',
    diagnosis: MATCH_DIAGNOSIS
  });
  msg.timestamp = '2026-09-13T12:00:00.000Z';

  const host = {
    getData: () => data,
    saveData: () => {},
    finalizePlantHealthStateChange: () => {},
    finalizeTaskListChange: () => {},
    render: () => {},
    personalDomain: pd
  };

  const result = applyDoctorCareLoopResult(msg, host);
  assert.equal(result.ok, true);
  assert.equal(result.plantUpdated, true);
  assert.equal(result.taskCreated, true);
  assert.equal(result.newTaskCount, 1);

  const mem = await persistDoctorGardenMemoryEpisode(msg, result, host);
  assert.equal(mem.ok, true);
  assert.equal(events.length, 3);
  assert.equal(events[0].eventType, 'doctor_diagnosis');
  assert.equal(events[1].eventType, 'plant_health_changed');
  assert.equal(events[1].causedByEventId, events[0].id);
  assert.equal(events[2].eventType, 'task_created');
  assert.equal(events[2].causedByEventId, events[0].id);
  assert.equal(events[0].correlationId, events[1].correlationId);
  assert.equal(events[1].correlationId, events[2].correlationId);
  assert.equal(tasks[0].source_module, 'plant_doctor');
  assert.equal(tasks[0].task_type, 'doctor');
});

test('I: Doctor status-only → zero task_created events', async () => {
  const events = [];
  const pd = {
    getActiveGardenId: () => 'g1',
    async upsertPlantOnActiveGarden() {
      return { id: 'sp1', garden_profile_id: 'g1', client_instance_id: 'plant_mango' };
    },
    async upsertTaskOnActiveGarden() {
      throw new Error('should not upsert task');
    },
    async recordGardenMemoryEvent(input) {
      const id = `evt_${events.length + 1}`;
      events.push({ id, ...input });
      return { ok: true, eventId: id };
    }
  };
  const data = {
    plants: [{ id: 'plant_mango', name: 'Mango', mark: '✓', status: 'Healthy' }],
    tasks: [],
    events: [],
    plantDoctorResults: []
  };
  const msg = buildDoctorResultBridgeMessage({
    action: PLANT_DOCTOR_ACTIONS.APPLY_STATE,
    gardenProfileId: 'g1',
    gardenPlantClientId: 'plant_mango',
    plantDisplayName: 'Mango',
    diagnosis: MATCH_DIAGNOSIS
  });
  msg.timestamp = '2026-09-13T12:00:00.000Z';
  const result = applyDoctorCareLoopResult(msg, {
    getData: () => data,
    saveData: () => {},
    finalizePlantHealthStateChange: () => {},
    finalizeTaskListChange: () => {
      throw new Error('no task finalize');
    },
    render: () => {},
    personalDomain: pd
  });
  assert.equal(result.taskCreated, false);
  await persistDoctorGardenMemoryEpisode(msg, result, {
    getData: () => data,
    personalDomain: pd
  });
  assert.equal(events.some((e) => e.eventType === 'task_created'), false);
  assert.equal(events.filter((e) => e.eventType === 'doctor_diagnosis').length, 1);
  assert.equal(events.filter((e) => e.eventType === 'plant_health_changed').length, 1);
});

test('J: Doctor explicit task → max one task_created event', async () => {
  const row = buildDoctorCareTaskRow(MATCH_DIAGNOSIS, {
    gardenPlantClientId: 'plant_mango',
    plantDisplayName: 'Mango'
  });
  assert.equal(row.source_module, 'plant_doctor');
  assert.equal(row.task_type, 'doctor');
  const ids = buildDoctorEpisodeIds({
    gardenPlantClientId: 'plant_mango',
    problemName: 'Sooty mold',
    severity: 'high',
    confidence: 'high',
    timestamp: '2026-09-13T12:00:00.000Z'
  });
  const input = buildDoctorTaskCreatedMemoryInput({
    gardenProfileId: 'g1',
    gardenPlantId: 'sp1',
    gardenTaskId: 'st1',
    causedByEventId: 'evt_diag',
    taskClientId: row[8],
    title: row[1],
    ...ids,
    problemName: 'Sooty mold',
    severity: 'high',
    confidence: 'high',
    gardenPlantClientId: 'plant_mango',
    timestamp: '2026-09-13T12:00:00.000Z'
  });
  assert.equal(input.eventType, 'task_created');
  const sb = makeMemoryStore();
  await writeGardenMemoryEvent(sb, input);
  await writeGardenMemoryEvent(sb, input);
  assert.equal(sb.rows.filter((r) => r.event_type === 'task_created').length, 1);
});

test('L: cross-garden causal links rejected', async () => {
  const input = buildDoctorHealthChangedMemoryInput({
    gardenProfileId: 'g1',
    gardenPlantId: 'sp1',
    causedByEventId: 'evt_x',
    gardenPlantClientId: 'p1',
    problemName: 'x',
    severity: 'high',
    confidence: 'high',
    timestamp: '2026-09-13'
  });
  input.causedByEventGardenProfileId = 'g2';
  await assert.rejects(() => writeGardenMemoryEvent(makeMemoryStore(), input), /causal_garden_mismatch/);
});

test('M: event writer failure does not repeat primary mutation', async () => {
  let plantUpserts = 0;
  const data = {
    plants: [{ id: 'plant_mango', name: 'Mango', mark: '✓', status: 'Healthy' }],
    tasks: [],
    events: [],
    plantDoctorResults: []
  };
  const msg = buildDoctorResultBridgeMessage({
    action: PLANT_DOCTOR_ACTIONS.APPLY_STATE,
    gardenProfileId: 'g1',
    gardenPlantClientId: 'plant_mango',
    plantDisplayName: 'Mango',
    diagnosis: MATCH_DIAGNOSIS
  });
  msg.timestamp = '2026-09-13T12:00:00.000Z';
  const result = applyDoctorCareLoopResult(msg, {
    getData: () => data,
    saveData: () => {},
    finalizePlantHealthStateChange: () => {
      plantUpserts += 1;
    },
    finalizeTaskListChange: () => {},
    render: () => {}
  });
  assert.equal(result.plantUpdated, true);
  assert.equal(data.plants[0].mark, '!');
  const beforeMark = data.plants[0].mark;
  const beforeStatus = data.plants[0].status;

  const pd = {
    getActiveGardenId: () => 'g1',
    async upsertPlantOnActiveGarden() {
      return { id: 'sp1', garden_profile_id: 'g1', client_instance_id: 'plant_mango' };
    },
    async recordGardenMemoryEvent() {
      throw new Error('memory_down');
    }
  };
  const mem = await persistDoctorGardenMemoryEpisode(msg, result, {
    getData: () => data,
    personalDomain: pd
  });
  assert.equal(mem.ok, false);
  assert.equal(data.plants[0].mark, beforeMark);
  assert.equal(data.plants[0].status, beforeStatus);
  // Primary apply already happened once; memory failure must not re-apply Doctor.
  assert.equal(plantUpserts, 1);
});

test('Doctor diagnosis payload excludes prompts/secrets', () => {
  const input = buildDoctorDiagnosisMemoryInput({
    gardenProfileId: 'g1',
    gardenPlantId: 'sp1',
    gardenPlantClientId: 'plant_mango',
    problemName: 'Sooty mold',
    severity: 'high',
    confidence: 'high',
    timestamp: '2026-09-13T12:00:00.000Z',
    diagnosis: MATCH_DIAGNOSIS,
    identityAssessment: 'match'
  });
  assert.equal(input.payload.raw_prompt, undefined);
  assert.equal(input.provenance?.api_key, undefined);
  assert.ok(input.correlationId.startsWith('ep_pd_'));
});
