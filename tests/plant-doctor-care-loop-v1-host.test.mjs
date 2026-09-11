/**
 * Plant Doctor care-loop host apply — unit tests for writeback / dedupe / unmatched / failure.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANT_DOCTOR_ACTIONS,
  buildDoctorResultBridgeMessage
} from '../modules/personal-domain/plant-doctor-care-loop-v1-contract.js';
import { applyDoctorCareLoopResult } from '../modules/personal-domain/plant-doctor-care-loop-v1-host.js';

function makeHost(data) {
  let plantFinalized = 0;
  let taskFinalized = 0;
  let saved = 0;
  return {
    host: {
      getData: () => data,
      saveData: () => {
        saved += 1;
      },
      finalizePlantListChange: () => {
        plantFinalized += 1;
      },
      finalizeTaskListChange: () => {
        taskFinalized += 1;
      },
      render: () => {}
    },
    counts: () => ({ plantFinalized, taskFinalized, saved })
  };
}

const diagnosis = {
  plant_name: 'Musa',
  problem_name: 'Possible fungal leaf spot',
  severity: 'medium',
  diagnosis: 'Possible fungal spotting on leaves.',
  home_remedy: ['Inspect affected leaves']
};

test('C/D: owned diagnosis updates plant and creates one care task', () => {
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
  assert.equal(data.tasks.length, 1);
  assert.equal(data.plantDoctorResults.length, 1);
  assert.equal(counts().plantFinalized, 1);
  assert.equal(counts().taskFinalized, 1);
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
  assert.equal(counts().plantFinalized, 0);
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
  assert.equal(counts().plantFinalized, 0);
  assert.equal(counts().taskFinalized, 0);
});
