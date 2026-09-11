/**
 * Plant Doctor → My Garden Care Loop V1 — contract unit tests (A–H bounded).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANT_DOCTOR_ACTIONS,
  PLANT_DOCTOR_IDENTITY,
  PLANT_DOCTOR_PROVIDER_CALLS_PER_DIAGNOSIS,
  PLANT_DOCTOR_RESULT_MESSAGE_TYPE,
  PLANT_DOCTOR_SOURCE,
  buildDoctorCareTaskClientId,
  buildDoctorCareTaskRow,
  buildDoctorResultBridgeMessage,
  buildIdentityBlockedUserMessage,
  mapDiagnosisToPlantStatePatch,
  parseDoctorContextFromSearch,
  resolveOwnedPlantIdentityGate,
  taskClientIdAlreadyPresent,
  tryParseDoctorDiagnosisJson
} from '../modules/personal-domain/plant-doctor-care-loop-v1-contract.js';
import {
  FIXTURE_MALFORMED_RESPONSE,
  FIXTURE_MATCH_DIAGNOSIS,
  FIXTURE_MISMATCH,
  FIXTURE_PROVIDER_CALLS,
  FIXTURE_UNCERTAIN
} from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';

const sampleDiagnosis = {
  plant_name: 'Musa acuminata',
  problem_name: 'Possible fungal leaf spot',
  severity: 'medium',
  diagnosis: 'Leaf spotting consistent with fungal leaf spot. Certainty is limited from one photo.',
  products: [{ emoji: '🧴', name: 'Copper fungicide', desc: 'Labeled use' }],
  biological: [],
  home_remedy: ['Inspect affected leaves', 'Improve airflow', 'Avoid overhead watering']
};

test('A: owned plant context parses from Doctor search params', () => {
  const ctx = parseDoctorContextFromSearch(
    '?gardenId=g1&plantClientId=p_banana&plantServerId=srv1&plantName=Banana&scientific=Musa%20acuminata&slug=banana'
  );
  assert.equal(ctx.unmatched, false);
  assert.equal(ctx.gardenProfileId, 'g1');
  assert.equal(ctx.gardenPlantClientId, 'p_banana');
  assert.equal(ctx.gardenPlantServerId, 'srv1');
  assert.equal(ctx.plantDisplayName, 'Banana');
  assert.equal(ctx.scientific, 'Musa acuminata');
  assert.equal(ctx.profileSlug, 'banana');
});

test('A2: unmatched path when no plantClientId', () => {
  const ctx = parseDoctorContextFromSearch('?unmatched=1&gardenId=g1');
  assert.equal(ctx.unmatched, true);
  assert.equal(ctx.gardenPlantClientId, null);
});

test('B: diagnosis builds structured host bridge message', () => {
  const msg = buildDoctorResultBridgeMessage({
    action: PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK,
    gardenProfileId: 'g1',
    gardenPlantClientId: 'p_banana',
    gardenPlantServerId: 'srv1',
    plantDisplayName: 'Banana',
    scientific: 'Musa acuminata',
    profileSlug: 'banana',
    diagnosis: sampleDiagnosis,
    timestamp: '2026-09-11T10:00:00.000Z'
  });
  assert.equal(msg.type, PLANT_DOCTOR_RESULT_MESSAGE_TYPE);
  assert.equal(msg.source, PLANT_DOCTOR_SOURCE);
  assert.equal(msg.gardenPlantClientId, 'p_banana');
  assert.equal(msg.diagnosis.problem_name, 'Possible fungal leaf spot');
  assert.equal(msg.diagnosis.severity, 'medium');
  assert.equal(msg.diagnosis.confidence, null);
  assert.equal(msg.action, PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK);
  assert.equal(msg.unmatched, false);
});

test('C: severity maps onto mark/status without inventing certainty', () => {
  const patch = mapDiagnosisToPlantStatePatch(sampleDiagnosis, {
    plantDisplayName: 'Banana',
    currentMark: '✓',
    currentStatus: 'Healthy'
  });
  assert.equal(patch.mark, '!');
  assert.match(patch.status, /Possible fungal leaf spot/);
  assert.equal(patch.uncertain, true);
  assert.match(patch.status, /Needs check/);
});

test('C2: high severity attention status when not uncertain wording', () => {
  const patch = mapDiagnosisToPlantStatePatch(
    {
      problem_name: 'Aphid infestation',
      severity: 'high',
      diagnosis: 'Clear aphid colonies on new growth.'
    },
    { currentMark: '✓', currentStatus: 'Healthy' }
  );
  assert.equal(patch.mark, '!');
  assert.equal(patch.uncertain, false);
  assert.match(patch.status, /^Needs attention:/);
});

test('D: care task row uses stable client id and plant link fields', () => {
  const row = buildDoctorCareTaskRow(sampleDiagnosis, {
    gardenPlantClientId: 'p_banana',
    gardenPlantServerId: 'srv-banana',
    plantDisplayName: 'Banana'
  });
  assert.equal(row[0], '🔎');
  assert.match(row[1], /Inspect affected leaves/);
  assert.equal(row[6], 'Banana');
  assert.equal(row[7], false);
  assert.equal(row.id, row[8]);
  assert.equal(row.gardenPlantId, 'srv-banana');
  assert.equal(
    row[8],
    buildDoctorCareTaskClientId({
      gardenPlantClientId: 'p_banana',
      problemName: 'Possible fungal leaf spot'
    })
  );
});

test('F: duplicate task client id is detected', () => {
  const id = buildDoctorCareTaskClientId({
    gardenPlantClientId: 'p_banana',
    problemName: 'Possible fungal leaf spot'
  });
  const existing = [['🔎', 'Inspect', 'Today', 'Medium', '2026-09-11', false, 'Banana', false, id]];
  existing[0].id = id;
  assert.equal(taskClientIdAlreadyPresent(existing, id), true);
  assert.equal(taskClientIdAlreadyPresent([], id), false);
});

test('G: unmatched bridge message does not carry owned plant id', () => {
  const msg = buildDoctorResultBridgeMessage({
    unmatched: true,
    gardenProfileId: 'g1',
    diagnosis: sampleDiagnosis,
    action: PLANT_DOCTOR_ACTIONS.APPLY_STATE
  });
  assert.equal(msg.unmatched, true);
  assert.equal(msg.gardenPlantClientId, null);
});

test('H: bridge requires diagnosis (AI failure must not fabricate)', () => {
  assert.throws(() => buildDoctorResultBridgeMessage({ gardenPlantClientId: 'p1' }), /diagnosis/);
});

test('confidence is never invented on bridge', () => {
  const msg = buildDoctorResultBridgeMessage({
    gardenPlantClientId: 'p1',
    diagnosis: { ...sampleDiagnosis, confidence: 0.99, identity_assessment: 'match' }
  });
  assert.equal(msg.diagnosis.confidence, null);
});

test('identity gate: provider budget is exactly one; fixtures use zero paid calls', () => {
  assert.equal(PLANT_DOCTOR_PROVIDER_CALLS_PER_DIAGNOSIS, 1);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
});

test('identity gate: MATCH allows owned mutation', () => {
  const g = resolveOwnedPlantIdentityGate({
    gardenPlantClientId: 'p_mango',
    diagnosis: FIXTURE_MATCH_DIAGNOSIS
  });
  assert.equal(g.applicable, true);
  assert.equal(g.assessment, PLANT_DOCTOR_IDENTITY.MATCH);
  assert.equal(g.mayMutateOwnedPlant, true);
  assert.equal(g.mayCreateOwnedCareTask, true);
});

test('identity gate: MISMATCH / UNCERTAIN / missing block owned mutation', () => {
  const mismatch = resolveOwnedPlantIdentityGate({
    gardenPlantClientId: 'p_mango',
    diagnosis: FIXTURE_MISMATCH
  });
  assert.equal(mismatch.assessment, PLANT_DOCTOR_IDENTITY.MISMATCH);
  assert.equal(mismatch.mayMutateOwnedPlant, false);

  const uncertain = resolveOwnedPlantIdentityGate({
    gardenPlantClientId: 'p_mango',
    diagnosis: FIXTURE_UNCERTAIN
  });
  assert.equal(uncertain.assessment, PLANT_DOCTOR_IDENTITY.UNCERTAIN);
  assert.equal(uncertain.mayMutateOwnedPlant, false);

  const missing = resolveOwnedPlantIdentityGate({
    gardenPlantClientId: 'p_mango',
    diagnosis: { problem_name: 'X', severity: 'low' }
  });
  assert.equal(missing.assessment, PLANT_DOCTOR_IDENTITY.UNCERTAIN);
  assert.equal(missing.mayMutateOwnedPlant, false);
});

test('identity gate: unmatched is not applicable (general Doctor)', () => {
  const g = resolveOwnedPlantIdentityGate({
    unmatched: true,
    diagnosis: FIXTURE_MATCH_DIAGNOSIS
  });
  assert.equal(g.applicable, false);
  assert.equal(g.mayMutateOwnedPlant, false);
});

test('identity blocked user message for MISMATCH matches product copy', () => {
  assert.equal(
    buildIdentityBlockedUserMessage('Mango', PLANT_DOCTOR_IDENTITY.MISMATCH),
    'This photo may not be your Mango. Please upload a photo of the selected plant or choose a different plant.'
  );
});

test('malformed fixture does not parse; MATCH fixture does', () => {
  assert.equal(tryParseDoctorDiagnosisJson(FIXTURE_MALFORMED_RESPONSE.rawText), null);
  assert.equal(
    tryParseDoctorDiagnosisJson(JSON.stringify(FIXTURE_MATCH_DIAGNOSIS)).identity_assessment,
    'match'
  );
});
