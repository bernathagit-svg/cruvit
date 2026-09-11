/**
 * Plant Doctor → My Garden Care Loop V1 — pure contract helpers.
 * No DOM / network. Maps Doctor diagnosis JSON onto existing plant/task fields only.
 */

export const PLANT_DOCTOR_CARE_LOOP_VERSION = '1.0.0';
export const PLANT_DOCTOR_RESULT_MESSAGE_TYPE = 'cruvit:plant-doctor-result';
export const PLANT_DOCTOR_CONTEXT_MESSAGE_TYPE = 'cruvit:plant-doctor-context';
export const PLANT_DOCTOR_SOURCE = 'plant_doctor';

export const PLANT_DOCTOR_ACTIONS = Object.freeze({
  APPLY_STATE: 'apply_state',
  CREATE_TASK: 'create_task',
  APPLY_AND_TASK: 'apply_and_task'
});

const SEVERITIES = new Set(['low', 'medium', 'high']);

export function normalizeDoctorSeverity(value) {
  const s = String(value || '').trim().toLowerCase();
  return SEVERITIES.has(s) ? s : null;
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
    diagnosis: {
      plant_name: diagnosis.plant_name || null,
      problem_name: diagnosis.problem_name || null,
      severity: normalizeDoctorSeverity(diagnosis.severity),
      diagnosis: diagnosis.diagnosis || null,
      products: Array.isArray(diagnosis.products) ? diagnosis.products : [],
      biological: Array.isArray(diagnosis.biological) ? diagnosis.biological : [],
      home_remedy: Array.isArray(diagnosis.home_remedy) ? diagnosis.home_remedy : [],
      // Doctor schema has severity only — do not invent confidence.
      confidence: null
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
