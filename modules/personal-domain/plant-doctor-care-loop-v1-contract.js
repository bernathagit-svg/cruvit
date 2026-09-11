/**
 * Plant Doctor → My Garden Care Loop V1 — pure contract helpers.
 * No DOM / network. Maps Doctor diagnosis JSON onto existing plant/task fields only.
 */

export const PLANT_DOCTOR_CARE_LOOP_VERSION = '1.1.0';
export const PLANT_DOCTOR_RESULT_MESSAGE_TYPE = 'cruvit:plant-doctor-result';
export const PLANT_DOCTOR_CONTEXT_MESSAGE_TYPE = 'cruvit:plant-doctor-context';
export const PLANT_DOCTOR_SOURCE = 'plant_doctor';

/** Real production diagnosis = identity + diagnosis in ONE provider call. */
export const PLANT_DOCTOR_PROVIDER_CALLS_PER_DIAGNOSIS = 1;

export const PLANT_DOCTOR_ACTIONS = Object.freeze({
  APPLY_STATE: 'apply_state',
  CREATE_TASK: 'create_task',
  APPLY_AND_TASK: 'apply_and_task'
});

export const PLANT_DOCTOR_IDENTITY = Object.freeze({
  MATCH: 'match',
  MISMATCH: 'mismatch',
  UNCERTAIN: 'uncertain'
});

const SEVERITIES = new Set(['low', 'medium', 'high']);
const IDENTITY_VALUES = new Set(Object.values(PLANT_DOCTOR_IDENTITY));

export function normalizeDoctorSeverity(value) {
  const s = String(value || '').trim().toLowerCase();
  return SEVERITIES.has(s) ? s : null;
}

/**
 * Normalize identity assessment. Missing/invalid → null (caller decides default).
 * Does not invent MATCH.
 */
export function normalizeIdentityAssessment(value) {
  const s = String(value || '')
    .trim()
    .toLowerCase();
  if (IDENTITY_VALUES.has(s)) return s;
  if (s === 'matched' || s === 'same' || s === 'consistent') return PLANT_DOCTOR_IDENTITY.MATCH;
  if (s === 'mismatched' || s === 'different' || s === 'inconsistent') {
    return PLANT_DOCTOR_IDENTITY.MISMATCH;
  }
  if (s === 'unsure' || s === 'unknown' || s === 'unclear') {
    return PLANT_DOCTOR_IDENTITY.UNCERTAIN;
  }
  return null;
}

/**
 * Owned-plant identity gate from a single Doctor diagnosis payload.
 * Unmatched path → not applicable.
 * Owned + missing assessment → UNCERTAIN (block persistent mutation).
 */
export function resolveOwnedPlantIdentityGate(input = {}) {
  const unmatched = input.unmatched === true || !input.gardenPlantClientId;
  if (unmatched) {
    return {
      applicable: false,
      assessment: null,
      reason: null,
      mayMutateOwnedPlant: false,
      mayCreateOwnedCareTask: false,
      mayHookOwnedMood: false
    };
  }
  const fromMsg = input.identity && typeof input.identity === 'object' ? input.identity : null;
  const fromDiag =
    input.diagnosis && typeof input.diagnosis === 'object' ? input.diagnosis : null;
  const raw =
    fromMsg?.assessment ||
    fromMsg?.identity_assessment ||
    fromDiag?.identity_assessment ||
    fromDiag?.identityAssessment ||
    null;
  let assessment = normalizeIdentityAssessment(raw);
  // Missing identity fields: allow writeback (legacy Doctor responses before Identity Safety Gate).
  // Explicit mismatch / uncertain still block owned-plant mutation.
  if (!assessment) {
    return {
      applicable: true,
      assessment: null,
      reason: null,
      mayMutateOwnedPlant: true,
      mayCreateOwnedCareTask: true,
      mayHookOwnedMood: true
    };
  }
  const reason =
    String(
      fromMsg?.reason ||
        fromMsg?.identity_reason ||
        fromDiag?.identity_reason ||
        fromDiag?.identityReason ||
        ''
    ).trim() || null;
  const may = assessment === PLANT_DOCTOR_IDENTITY.MATCH;
  return {
    applicable: true,
    assessment,
    reason,
    mayMutateOwnedPlant: may,
    mayCreateOwnedCareTask: may,
    mayHookOwnedMood: may
  };
}

export function buildIdentityBlockedUserMessage(plantDisplayName, assessment, reason) {
  const name = String(plantDisplayName || 'selected plant').trim() || 'selected plant';
  if (assessment === PLANT_DOCTOR_IDENTITY.MISMATCH) {
    return `This photo may not be your ${name}. Please upload a photo of the selected plant or choose a different plant.${
      reason ? ` (${reason})` : ''
    }`;
  }
  return `We could not confirm this photo is your ${name}. Garden status and care tasks were not changed. Upload a clearer photo of the selected plant, or choose a different plant.${
    reason ? ` (${reason})` : ''
  }`;
}

/**
 * Stable task client_instance_id for dedupe across repeated UI events.
 * Uses owned plant client id + problem name when available.
 */
export function buildDoctorCareTaskClientId(input = {}) {
  const plantKey = String(
    input.gardenPlantClientId || input.unmatchedKey || 'unmatched'
  )
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .slice(0, 48);
  const problem = String(input.problemName || 'care')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return `pd_care_${plantKey || 'plant'}_${problem || 'care'}`;
}

/**
 * Map diagnosis severity onto existing garden plant mark/status fields only.
 * Does not invent confidence. Does not store full diagnosis text on the plant row.
 */
export function mapDiagnosisToPlantStatePatch(diagnosis = {}, options = {}) {
  const severity = normalizeDoctorSeverity(diagnosis.severity);
  const problem = String(diagnosis.problem_name || '').trim();
  const displayName = String(options.plantDisplayName || diagnosis.plant_name || 'Plant').trim();
  const uncertain =
    !severity ||
    !problem ||
    /unknown|uncertain|unclear|possible|maybe|suspect/i.test(
      `${problem} ${diagnosis.diagnosis || ''}`
    );

  let mark = options.currentMark === '!' ? '!' : '✓';
  if (severity === 'medium' || severity === 'high') mark = '!';
  else if (severity === 'low' && uncertain) mark = '!';

  let status = String(options.currentStatus || 'Healthy').trim() || 'Healthy';
  if (problem) {
    const prefix = uncertain ? 'Needs check' : 'Needs attention';
    status = `${prefix}: ${problem}`.slice(0, 120);
  } else if (uncertain) {
    status = 'Needs check: diagnosis uncertain';
  }

  return {
    mark,
    status,
    severity,
    uncertain,
    displayName,
    problemName: problem || null
  };
}

/**
 * Build one recommended care task row (My Garden array shape) from diagnosis.
 * Preferred action text: first home_remedy step, else inspect problem.
 */
export function buildDoctorCareTaskRow(diagnosis = {}, options = {}) {
  const patch = mapDiagnosisToPlantStatePatch(diagnosis, options);
  const remedies = Array.isArray(diagnosis.home_remedy) ? diagnosis.home_remedy : [];
  const firstRemedy = remedies
    .map((x) => (typeof x === 'string' ? x : x?.name || x?.desc || ''))
    .map((s) => String(s || '').trim())
    .find(Boolean);
  const title = firstRemedy
    ? String(firstRemedy).slice(0, 120)
    : patch.problemName
      ? `Inspect: ${patch.problemName}`.slice(0, 120)
      : 'Inspect plant after diagnosis';
  const priority =
    patch.severity === 'high' ? 'High' : patch.severity === 'medium' ? 'Medium' : 'Low';
  const clientId = buildDoctorCareTaskClientId({
    gardenPlantClientId: options.gardenPlantClientId,
    unmatchedKey: options.unmatched ? 'unmatched' : '',
    problemName: patch.problemName || title
  });
  const plantName = String(options.plantDisplayName || '').trim() || null;
  const iso = new Date().toISOString().slice(0, 10);
  const row = [
    '🔎',
    title,
    'Today · after Plant Doctor',
    priority,
    iso,
    false,
    plantName || '',
    false,
    clientId
  ];
  row.id = clientId;
  if (options.gardenPlantServerId) {
    row.gardenPlantId = String(options.gardenPlantServerId);
    row.garden_plant_id = String(options.gardenPlantServerId);
  }
  return row;
}

/**
 * Structured host bridge payload from Doctor iframe → app host.
 */
export function buildDoctorResultBridgeMessage(input = {}) {
  const diagnosis = input.diagnosis && typeof input.diagnosis === 'object' ? input.diagnosis : null;
  if (!diagnosis) throw new Error('diagnosis is required');
  const unmatched = input.unmatched === true || !input.gardenPlantClientId;
  const allowed = new Set(Object.values(PLANT_DOCTOR_ACTIONS));
  const action = allowed.has(input.action)
    ? input.action
    : PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK;

  const identityGate = resolveOwnedPlantIdentityGate({
    unmatched,
    gardenPlantClientId: input.gardenPlantClientId,
    identity: input.identity,
    diagnosis
  });

  return {
    type: PLANT_DOCTOR_RESULT_MESSAGE_TYPE,
    source: PLANT_DOCTOR_SOURCE,
    version: PLANT_DOCTOR_CARE_LOOP_VERSION,
    timestamp: input.timestamp || new Date().toISOString(),
    action,
    unmatched,
    gardenProfileId: input.gardenProfileId ? String(input.gardenProfileId) : null,
    gardenPlantClientId: input.gardenPlantClientId
      ? String(input.gardenPlantClientId)
      : null,
    gardenPlantServerId: input.gardenPlantServerId
      ? String(input.gardenPlantServerId)
      : null,
    plantDisplayName: input.plantDisplayName ? String(input.plantDisplayName) : null,
    scientific: input.scientific ? String(input.scientific) : null,
    profileSlug: input.profileSlug ? String(input.profileSlug) : null,
    identity: identityGate.applicable
      ? {
          assessment: identityGate.assessment,
          reason: identityGate.reason
        }
      : null,
    diagnosis: {
      plant_name: diagnosis.plant_name || null,
      problem_name: diagnosis.problem_name || null,
      severity: normalizeDoctorSeverity(diagnosis.severity),
      diagnosis: diagnosis.diagnosis || null,
      products: Array.isArray(diagnosis.products) ? diagnosis.products : [],
      biological: Array.isArray(diagnosis.biological) ? diagnosis.biological : [],
      home_remedy: Array.isArray(diagnosis.home_remedy) ? diagnosis.home_remedy : [],
      // Doctor schema has severity only — do not invent confidence.
      confidence: null,
      identity_assessment: identityGate.applicable ? identityGate.assessment : null,
      identity_reason: identityGate.applicable ? identityGate.reason : null
    }
  };
}

export function parseDoctorContextFromSearch(search) {
  const q = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const unmatched = q.get('unmatched') === '1' || q.get('unmatched') === 'true';
  const gardenPlantClientId = String(q.get('plantClientId') || '').trim() || null;
  return {
    type: PLANT_DOCTOR_CONTEXT_MESSAGE_TYPE,
    source: PLANT_DOCTOR_SOURCE,
    unmatched: unmatched || !gardenPlantClientId,
    gardenProfileId: String(q.get('gardenId') || '').trim() || null,
    gardenPlantClientId,
    gardenPlantServerId: String(q.get('plantServerId') || '').trim() || null,
    plantDisplayName: String(q.get('plantName') || '').trim() || null,
    scientific: String(q.get('scientific') || '').trim() || null,
    profileSlug: String(q.get('slug') || '').trim() || null
  };
}

export function taskClientIdAlreadyPresent(tasks, clientInstanceId) {
  const id = String(clientInstanceId || '').trim();
  if (!id) return false;
  return (Array.isArray(tasks) ? tasks : []).some((t) => {
    if (!t) return false;
    if (Array.isArray(t)) return String(t[8] || t.id || '').trim() === id;
    return String(t.id || t.client_instance_id || '').trim() === id;
  });
}
