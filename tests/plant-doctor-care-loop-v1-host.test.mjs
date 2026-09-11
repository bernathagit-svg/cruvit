/**
 * Plant Doctor care-loop host — Diagnostic Safety V1 + task-explosion regression.
 * ZERO paid AI calls — fixtures / mocks only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANT_DOCTOR_ACTIONS,
  PLANT_DOCTOR_PROVIDER_CALLS_PER_DIAGNOSIS,
  buildDoctorResultBridgeMessage,
  normalizeDoctorDiagnosticPayload,
  tryParseDoctorDiagnosisJson
} from '../modules/personal-domain/plant-doctor-care-loop-v1-contract.js';
import { applyDoctorCareLoopResult } from '../modules/personal-domain/plant-doctor-care-loop-v1-host.js';
import {
  FIXTURE_MALFORMED_RESPONSE,
  FIXTURE_MATCH_HIGH,
  FIXTURE_MATCH_LOW,
  FIXTURE_MATCH_MEDIUM,
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

test('cost control: this suite uses fixtures only (zero paid AI)', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
  assert.equal(PLANT_DOCTOR_PROVIDER_CALLS_PER_DIAGNOSIS, 1);
});

test('MATCH HIGH + explicit care task: health update, one pd_care, no seasonal explosion', () => {
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
    diagnosis: FIXTURE_MATCH_HIGH
  });
  const r = applyDoctorCareLoopResult(msg, host);
  assert.equal(r.ok, true);
  assert.equal(r.identityBlocked, false);
  assert.equal(r.confidenceBlocked, false);
  assert.equal(r.plantUpdated, true);
  assert.equal(r.taskCreated, true);
  assert.equal(data.plants[0].mark, '!');
  assert.match(data.plants[0].status, /Sooty mold/i);
  assert.equal(data.tasks.length, 2);
  assert.match(String(data.tasks[0][8] || data.tasks[0].id || ''), /^pd_care_/);
  assert.equal(counts().plantListFinalized, 0);
  assert.equal(counts().plantHealthFinalized, 1);
  assert.equal(counts().taskFinalized, 1);
  assert.equal(data.plants[1].mark, '✓');
  assert.equal(data.plants[2].status, 'Healthy');
  assert.equal(data.tasks.filter((t) => String(t[1] || '').startsWith('Water')).length, 0);
  assert.equal(msg.diagnosis.products.length, 0, 'chemical products gated');
  assert.equal(msg.diagnosis.products_gated, true);
});

test('MATCH MEDIUM + needsMoreEvidence blocks mutation and tasks', () => {
  const data = {
    plants: [{ id: 'p_mango', name: 'Mango', mark: '✓', status: 'Healthy', serverId: 'srv_m' }],
    tasks: [],
    plantDoctorResults: []
  };
  const { host, counts } = makeHost(data);
  const msg = buildDoctorResultBridgeMessage({
    action: PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK,
    gardenPlantClientId: 'p_mango',
    plantDisplayName: 'Mango',
    diagnosis: FIXTURE_MATCH_MEDIUM
  });
  const r = applyDoctorCareLoopResult(msg, host);
  assert.equal(r.confidenceBlocked, true);
  assert.equal(r.plantUpdated, false);
  assert.equal(r.taskCreated, false);
  assert.equal(data.plants[0].status, 'Healthy');
  assert.equal(data.tasks.length, 0);
  assert.equal(counts().plantHealthFinalized, 0);
});

test('MATCH LOW blocks mutation and treatment tasks', () => {
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
    diagnosis: FIXTURE_MATCH_LOW
  });
  const r = applyDoctorCareLoopResult(msg, host);
  assert.equal(r.confidenceBlocked, true);
  assert.equal(r.diagnosticConfidence, 'low');
  assert.equal(data.plants[0].mark, '✓');
  assert.equal(data.tasks.length, 0);
  assert.equal(data.plantDoctorResults.length, 0);
  assert.equal(counts().plantHealthFinalized, 0);
});

test('MISMATCH blocks mutation, tasks, and owned mood', () => {
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
    diagnosis: FIXTURE_MISMATCH
  });
  const r = applyDoctorCareLoopResult(msg, host);
  assert.equal(r.identityBlocked, true);
  assert.match(r.userMessage || '', /selected plant/i);
  assert.equal(data.plants[0].status, 'Healthy');
  assert.equal(data.tasks.length, 0);
  assert.equal(data.plantDoctorResults.length, 0);
  assert.equal(counts().plantHealthFinalized, 0);
});

test('UNCERTAIN blocks persistent plant mutation and tasks', () => {
  const data = {
    plants: [{ id: 'p_mango', name: 'Mango', mark: '✓', status: 'Healthy' }],
    tasks: [],
    plantDoctorResults: []
  };
  const { host } = makeHost(data);
  const msg = buildDoctorResultBridgeMessage({
    action: PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK,
    gardenPlantClientId: 'p_mango',
    plantDisplayName: 'Mango',
    diagnosis: FIXTURE_UNCERTAIN
  });
  const r = applyDoctorCareLoopResult(msg, host);
  assert.equal(r.identityBlocked, true);
  assert.equal(data.plants[0].status, 'Healthy');
  assert.equal(data.tasks.length, 0);
});

test('repeated Doctor result — care task dedupe preserved', () => {
  const data = {
    plants: [{ id: 'p_mango', name: 'Mango', mark: '✓', status: 'Healthy', serverId: 'srv1' }],
    tasks: [],
    events: [],
    plantDoctorResults: []
  };
  const { host } = makeHost(data);
  const msg = buildDoctorResultBridgeMessage({
    action: PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK,
    gardenPlantClientId: 'p_mango',
    gardenPlantServerId: 'srv1',
    plantDisplayName: 'Mango',
    diagnosis: FIXTURE_MATCH_HIGH
  });
  applyDoctorCareLoopResult(msg, host);
  const r2 = applyDoctorCareLoopResult(msg, host);
  assert.equal(r2.taskCreated, false);
  assert.equal(r2.taskDeduped, true);
  assert.equal(data.tasks.length, 1);
});

test('legitimate add-plant flow still may call finalizePlantListChange', () => {
  const data = {
    plants: [{ id: 'p_new', name: 'New Plant', mark: '✓', status: 'Healthy' }],
    tasks: []
  };
  const { host, counts } = makeHost(data);
  host.finalizePlantListChange();
  assert.equal(counts().plantListFinalized, 1);
  assert.ok(data.tasks.length >= 40);
});

test('unmatched does not mutate owned plants', () => {
  const data = {
    plants: [
      { id: 'p_banana', name: 'Banana', mark: '✓', status: 'Healthy' },
      { id: 'p_mango', name: 'Mango', mark: '✓', status: 'Healthy' }
    ],
    tasks: [],
    plantDoctorResults: []
  };
  const { host, counts } = makeHost(data);
  const msg = buildDoctorResultBridgeMessage({
    unmatched: true,
    action: PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK,
    diagnosis: FIXTURE_MATCH_HIGH
  });
  const r = applyDoctorCareLoopResult(msg, host);
  assert.equal(r.plantUpdated, false);
  assert.equal(data.plants[0].mark, '✓');
  assert.equal(r.taskCreated, true);
  assert.equal(counts().plantHealthFinalized, 0);
  assert.equal(counts().plantListFinalized, 0);
});

test('provider failure / malformed fixtures do not mutate garden truth', () => {
  const data = {
    plants: [{ id: 'p1', name: 'X', mark: '✓', status: 'Healthy' }],
    tasks: []
  };
  const { host, counts } = makeHost(data);
  const r = applyDoctorCareLoopResult(
    { type: 'cruvit:plant-doctor-result', source: 'plant_doctor', action: 'apply_and_task' },
    host
  );
  assert.equal(r.ok, false);
  assert.equal(data.tasks.length, 0);
  assert.equal(counts().plantHealthFinalized, 0);
  assert.equal(FIXTURE_PROVIDER_FAILURE.error, true);
  assert.equal(tryParseDoctorDiagnosisJson(FIXTURE_MALFORMED_RESPONSE.rawText), null);
});

test('normalize strips chemical products and preserves differentials', () => {
  const n = normalizeDoctorDiagnosticPayload(FIXTURE_MATCH_HIGH, { unmatched: false });
  assert.equal(n.products.length, 0);
  assert.equal(n.products_gated, true);
  assert.ok(n.differential_diagnoses.length >= 2);
  assert.equal(n.diagnostic_confidence, 'high');
  assert.equal(n.severity, 'medium');
});
