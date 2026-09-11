/**
 * Plant Doctor care-loop host apply — unit tests for writeback / dedupe / unmatched / failure.
 * ZERO paid AI calls — fixtures / mocks only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANT_DOCTOR_ACTIONS,
  buildDoctorResultBridgeMessage
} from '../modules/personal-domain/plant-doctor-care-loop-v1-contract.js';
import { applyDoctorCareLoopResult } from '../modules/personal-domain/plant-doctor-care-loop-v1-host.js';
import { FIXTURE_MATCH_DIAGNOSIS } from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';

function makeHost(data) {
  let plantListFinalized = 0;
  let plantHealthFinalized = 0;
  let taskFinalized = 0;
  let saved = 0;
  let healthPlant = null;
  return {
    host: {
      getData: () => data,
      saveData: () => {
        saved += 1;
      },
      finalizePlantListChange: () => {
        plantListFinalized += 1;
        // Simulate the dangerous side effect if Doctor ever called this.
        for (let i = 0; i < 40; i++) {
          data.tasks.push([
            '💧',
            `Water Bananax${i}`,
            '6-month plan',
            'Low',
            '2026-10-01',
            true,
            'Banana',
            false,
            `boom_${i}`
          ]);
        }
      },
      finalizePlantHealthStateChange: (plant) => {
        plantHealthFinalized += 1;
        healthPlant = plant;
      },
      finalizeTaskListChange: () => {
        taskFinalized += 1;
      },
      render: () => {}
    },
    counts: () => ({
      plantListFinalized,
      plantHealthFinalized,
      taskFinalized,
      saved,
      healthPlant
    })
  };
}

const diagnosis = {
  ...FIXTURE_MATCH_DIAGNOSIS,
  plant_name: 'Banana',
  problem_name: 'Possible fungal leaf spot',
  diagnosis: 'Possible fungal spotting on leaves.',
  home_remedy: ['Inspect affected leaves'],
  identity_assessment: 'match',
  identity_reason: 'Consistent with banana foliage'
};

test('owned MATCH diagnosis updates plant + one care task without care-plan explosion', () => {
  const data = {
    plants: [{ id: 'p_banana', name: 'Banana', mark: '✓', status: 'Healthy', serverId: 'srv1' }],
    tasks: [],
    events: [],
    plantDoctorResults: null
  };
  const { host, counts } = makeHost(data);
  const msg = buildDoctorResultBridgeMessage({
    action: PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK,
    gardenPlantClientId: 'p_banana',
    gardenPlantServerId: 'srv1',
    plantDisplayName: 'Banana',
    diagnosis
  });
  const r = applyDoctorCareLoopResult(msg, host);
  assert.equal(r.ok, true);
  assert.equal(r.plantUpdated, true);
  assert.equal(r.taskCreated, true);
  assert.equal(data.plants[0].mark, '!');
  assert.match(data.plants[0].status, /fungal leaf spot/i);
  assert.equal(data.tasks.length, 1, 'exactly one Doctor care task');
  assert.equal(counts().plantListFinalized, 0, 'must not call finalizePlantListChange');
  assert.equal(counts().plantHealthFinalized, 1);
  assert.equal(counts().healthPlant?.id, 'p_banana');
  assert.equal(counts().taskFinalized, 1);
});

test('Doctor writeback never triggers seasonal plan bulk create', () => {
  const data = {
    plants: [
      { id: 'p_mango', name: 'Mango Tree', mark: '✓', status: 'Healthy', serverId: 'srv_m' },
      { id: 'p_banana', name: 'Banana', mark: '✓', status: 'Healthy', serverId: 'srv_b' },
      { id: 'p_pine', name: 'Pineapple', mark: '✓', status: 'Healthy', serverId: 'srv_p' }
    ],
    tasks: [{ id: 'existing', 0: '🌿', 1: 'Existing', 8: 'existing' }],
    events: [],
    plantDoctorResults: []
  };
  // Normalize existing as array task row shape
  data.tasks = [['🌿', 'Existing', 'Today', 'Low', '2026-09-11', false, '', false, 'existing']];
  const { host, counts } = makeHost(data);
  const msg = buildDoctorResultBridgeMessage({
    action: PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK,
    gardenPlantClientId: 'p_mango',
    gardenPlantServerId: 'srv_m',
    plantDisplayName: 'Mango Tree',
    diagnosis: {
      ...diagnosis,
      plant_name: 'Mango',
      problem_name: 'Sooty Mold',
      identity_assessment: 'match'
    }
  });
  applyDoctorCareLoopResult(msg, host);
  assert.equal(data.tasks.length, 2, 'existing + one Doctor task only');
  assert.equal(counts().plantListFinalized, 0);
  assert.equal(
    data.tasks.filter((t) => String(t[1] || '').startsWith('Water')).length,
    0
  );
  assert.equal(data.plants[1].mark, '✓');
  assert.equal(data.plants[2].status, 'Healthy');
});

test('F: repeated apply does not duplicate care task', () => {
  const data = {
    plants: [{ id: 'p_banana', name: 'Banana', mark: '✓', status: 'Healthy', serverId: 'srv1' }],
    tasks: [],
    events: [],
    plantDoctorResults: []
  };
  const { host } = makeHost(data);
  const msg = buildDoctorResultBridgeMessage({
    action: PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK,
    gardenPlantClientId: 'p_banana',
    gardenPlantServerId: 'srv1',
    plantDisplayName: 'Banana',
    diagnosis
  });
  applyDoctorCareLoopResult(msg, host);
  const r2 = applyDoctorCareLoopResult(msg, host);
  assert.equal(r2.taskCreated, false);
  assert.equal(r2.taskDeduped, true);
  assert.equal(data.tasks.length, 1);
});

test('G: unmatched does not mutate owned plants', () => {
  const data = {
    plants: [
      { id: 'p_banana', name: 'Banana', mark: '✓', status: 'Healthy' },
      { id: 'p_mango', name: 'Mango', mark: '✓', status: 'Healthy' }
    ],
    tasks: [],
    events: [],
    plantDoctorResults: []
  };
  const { host, counts } = makeHost(data);
  const msg = buildDoctorResultBridgeMessage({
    unmatched: true,
    action: PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK,
    diagnosis
  });
  const r = applyDoctorCareLoopResult(msg, host);
  assert.equal(r.plantUpdated, false);
  assert.equal(data.plants[0].mark, '✓');
  assert.equal(data.plants[1].status, 'Healthy');
  assert.equal(r.taskCreated, true);
  assert.equal(data.tasks[0][6], '');
  assert.equal(counts().plantHealthFinalized, 0);
  assert.equal(counts().plantListFinalized, 0);
});

test('H: missing diagnosis does not mutate garden truth', () => {
  const data = {
    plants: [{ id: 'p1', name: 'X', mark: '✓', status: 'Healthy' }],
    tasks: [],
    plantDoctorResults: []
  };
  const { host, counts } = makeHost(data);
  const r = applyDoctorCareLoopResult(
    { type: 'cruvit:plant-doctor-result', source: 'plant_doctor', action: 'apply_and_task' },
    host
  );
  assert.equal(r.ok, false);
  assert.equal(data.plants[0].mark, '✓');
  assert.equal(data.tasks.length, 0);
  assert.equal(counts().plantHealthFinalized, 0);
  assert.equal(counts().taskFinalized, 0);
});
