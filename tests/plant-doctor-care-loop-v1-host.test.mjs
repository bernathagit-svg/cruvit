/**
 * Plant Doctor care-loop host apply — unit tests for writeback / identity / dedupe.
 * ZERO paid AI calls — fixtures / mocks only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANT_DOCTOR_ACTIONS,
  PLANT_DOCTOR_PROVIDER_CALLS_PER_DIAGNOSIS,
  buildDoctorResultBridgeMessage,
  tryParseDoctorDiagnosisJson
} from '../modules/personal-domain/plant-doctor-care-loop-v1-contract.js';
import { applyDoctorCareLoopResult } from '../modules/personal-domain/plant-doctor-care-loop-v1-host.js';
import {
  FIXTURE_MALFORMED_RESPONSE,
  FIXTURE_MATCH_DIAGNOSIS,
  FIXTURE_MISMATCH,
  FIXTURE_PROVIDER_CALLS,
  FIXTURE_PROVIDER_FAILURE,
  FIXTURE_UNCERTAIN
} from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';

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
        // Simulate seasonal plan side effect if Doctor ever called this.
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

const matchDiagnosis = {
  ...FIXTURE_MATCH_DIAGNOSIS,
  plant_name: 'Banana',
  problem_name: 'Possible fungal leaf spot',
  diagnosis: 'Possible fungal spotting on leaves.',
  home_remedy: ['Inspect affected leaves'],
  identity_assessment: 'match',
  identity_reason: 'Consistent with banana foliage'
};

test('cost control: this suite uses fixtures only (zero paid AI)', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
  assert.equal(PLANT_DOCTOR_PROVIDER_CALLS_PER_DIAGNOSIS, 1);
});

test('A: MATCH + Update plant + care task — health only, one pd_care, no seasonal explosion', () => {
  const data = {
    plants: [
      { id: 'p_mango', name: 'Mango', mark: '✓', status: 'Healthy', serverId: 'srv_m' },
      { id: 'p_banana', name: 'Banana', mark: '✓', status: 'Healthy', serverId: 'srv_b' },
      { id: 'p_pine', name: 'Pineapple', mark: '✓', status: 'Healthy', serverId: 'srv_p' }
    ],
    tasks: [['🌿', 'Existing', 'Today', 'Low', '2026-09-11', false, '', false, 'existing']],
    events: [],
    plantDoctorResults: []
  };
  const { host, counts } = makeHost(data);
  const msg = buildDoctorResultBridgeMessage({
    action: PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK,
    gardenPlantClientId: 'p_mango',
    gardenPlantServerId: 'srv_m',
    plantDisplayName: 'Mango',
    diagnosis: {
      ...FIXTURE_MATCH_DIAGNOSIS,
      problem_name: 'Sooty Mold',
      identity_assessment: 'match'
    }
  });
  const r = applyDoctorCareLoopResult(msg, host);
  assert.equal(r.ok, true);
  assert.equal(r.identityBlocked, false);
  assert.equal(r.plantUpdated, true);
  assert.equal(r.taskCreated, true);
  assert.equal(data.plants[0].mark, '!');
  assert.match(data.plants[0].status, /Sooty Mold/i);
  assert.equal(data.tasks.length, 2, 'existing + exactly one Doctor care task');
  assert.match(String(data.tasks[0][8] || data.tasks[0].id || ''), /^pd_care_/);
  assert.equal(counts().plantListFinalized, 0, 'must not call finalizePlantListChange');
  assert.equal(counts().plantHealthFinalized, 1);
  assert.equal(counts().taskFinalized, 1);
  // D: unrelated plants unchanged
  assert.equal(data.plants[1].mark, '✓');
  assert.equal(data.plants[1].status, 'Healthy');
  assert.equal(data.plants[2].mark, '✓');
  assert.equal(data.plants[2].status, 'Healthy');
  assert.equal(
    data.tasks.filter((t) => String(t[1] || '').startsWith('Water')).length,
    0
  );
});

test('B: MISMATCH — zero plant mutation, zero tasks, zero owned mood', () => {
  const data = {
    plants: [{ id: 'p_mango', name: 'Mango', mark: '✓', status: 'Healthy', serverId: 'srv_m' }],
    tasks: [],
    events: [],
    plantDoctorResults: []
  };
  const { host, counts } = makeHost(data);
  const msg = buildDoctorResultBridgeMessage({
    action: PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK,
    gardenPlantClientId: 'p_mango',
    gardenPlantServerId: 'srv_m',
    plantDisplayName: 'Mango',
    diagnosis: FIXTURE_MISMATCH
  });
  const r = applyDoctorCareLoopResult(msg, host);
  assert.equal(r.ok, true);
  assert.equal(r.identityBlocked, true);
  assert.equal(r.identityAssessment, 'mismatch');
  assert.match(r.userMessage || '', /This photo may not be your Mango/);
  assert.equal(r.plantUpdated, false);
  assert.equal(r.taskCreated, false);
  assert.equal(data.plants[0].mark, '✓');
  assert.equal(data.plants[0].status, 'Healthy');
  assert.equal(data.tasks.length, 0);
  assert.equal(data.plantDoctorResults.length, 0);
  assert.equal(counts().plantHealthFinalized, 0);
  assert.equal(counts().plantListFinalized, 0);
  assert.equal(counts().taskFinalized, 0);
});

test('C: UNCERTAIN — zero persistent plant mutation, zero tasks', () => {
  const data = {
    plants: [{ id: 'p_mango', name: 'Mango', mark: '✓', status: 'Healthy', serverId: 'srv_m' }],
    tasks: [],
    events: [],
    plantDoctorResults: []
  };
  const { host, counts } = makeHost(data);
  const msg = buildDoctorResultBridgeMessage({
    action: PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK,
    gardenPlantClientId: 'p_mango',
    gardenPlantServerId: 'srv_m',
    plantDisplayName: 'Mango',
    diagnosis: FIXTURE_UNCERTAIN
  });
  const r = applyDoctorCareLoopResult(msg, host);
  assert.equal(r.identityBlocked, true);
  assert.equal(r.identityAssessment, 'uncertain');
  assert.match(r.userMessage || '', /clearer photo|could not confirm/i);
  assert.equal(data.plants[0].mark, '✓');
  assert.equal(data.plants[0].status, 'Healthy');
  assert.equal(data.tasks.length, 0);
  assert.equal(data.plantDoctorResults.length, 0);
  assert.equal(counts().plantHealthFinalized, 0);
  assert.equal(counts().taskFinalized, 0);
});

test('missing identity on owned plant defaults to UNCERTAIN (never invent MATCH)', () => {
  const data = {
    plants: [{ id: 'p_mango', name: 'Mango', mark: '✓', status: 'Healthy' }],
    tasks: [],
    plantDoctorResults: []
  };
  const { host, counts } = makeHost(data);
  const msg = buildDoctorResultBridgeMessage({
    action: PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK,
    gardenPlantClientId: 'p_mango',
    plantDisplayName: 'Mango',
    diagnosis: {
      plant_name: 'Mango',
      problem_name: 'Leaf spot',
      severity: 'medium',
      diagnosis: 'Possible spotting.'
      // no identity_assessment
    }
  });
  const r = applyDoctorCareLoopResult(msg, host);
  assert.equal(r.identityBlocked, true);
  assert.equal(r.identityAssessment, 'uncertain');
  assert.equal(data.plants[0].status, 'Healthy');
  assert.equal(data.tasks.length, 0);
  assert.equal(counts().plantHealthFinalized, 0);
});

test('E: repeated Doctor result — care task dedupe preserved', () => {
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
    diagnosis: matchDiagnosis
  });
  applyDoctorCareLoopResult(msg, host);
  const r2 = applyDoctorCareLoopResult(msg, host);
  assert.equal(r2.taskCreated, false);
  assert.equal(r2.taskDeduped, true);
  assert.equal(data.tasks.length, 1);
});

test('F: legitimate add-plant flow still may call finalizePlantListChange (seasonal plan allowed)', () => {
  const data = {
    plants: [{ id: 'p_new', name: 'New Plant', mark: '✓', status: 'Healthy' }],
    tasks: []
  };
  const { host, counts } = makeHost(data);
  // Simulate add-plant / plant-list mutation intent (not Doctor health writeback).
  host.finalizePlantListChange();
  assert.equal(counts().plantListFinalized, 1);
  assert.ok(data.tasks.length >= 40, 'seasonal plan generation remains available for add-plant');
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
    diagnosis: matchDiagnosis
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

test('H: missing diagnosis / provider failure fixtures do not mutate garden truth', () => {
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
  assert.equal(FIXTURE_PROVIDER_FAILURE.error, true);
});

test('malformed provider response fixture does not parse to diagnosis', () => {
  assert.equal(tryParseDoctorDiagnosisJson(FIXTURE_MALFORMED_RESPONSE.rawText), null);
  assert.equal(tryParseDoctorDiagnosisJson(JSON.stringify(FIXTURE_MATCH_DIAGNOSIS))?.identity_assessment, 'match');
});
