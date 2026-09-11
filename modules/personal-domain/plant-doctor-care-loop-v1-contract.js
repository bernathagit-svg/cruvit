/**
 * Plant Doctor → My Garden Care Loop V1 — pure contract helpers.
 * Diagnostic Safety V1: identity + confidence + structured fields in ONE provider call.
 * No DOM / network. No invented certainty. No chemical product authority.
 */

export const PLANT_DOCTOR_CARE_LOOP_VERSION = '1.2.0';
export const PLANT_DOCTOR_RESULT_MESSAGE_TYPE = 'cruvit:plant-doctor-result';
export const PLANT_DOCTOR_CONTEXT_MESSAGE_TYPE = 'cruvit:plant-doctor-context';
export const PLANT_DOCTOR_SOURCE = 'plant_doctor';

/** Real production diagnosis = identity + diagnosis in ONE provider call. */
export const PLANT_DOCTOR_PROVIDER_CALLS_PER_DIAGNOSIS = 1;

/** Doctor writeback may create at most this many new garden_tasks. */
export const PLANT_DOCTOR_MAX_NEW_TASKS_PER_WRITEBACK = 1;

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

export const PLANT_DOCTOR_CONFIDENCE = Object.freeze({
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
});

const SEVERITIES = new Set(['low', 'medium', 'high', 'unknown']);
const IDENTITY_VALUES = new Set(Object.values(PLANT_DOCTOR_IDENTITY));
const CONFIDENCE_VALUES = new Set(Object.values(PLANT_DOCTOR_CONFIDENCE));

function asStringList(value, limit = 8) {
  if (!Array.isArray(value)) {
    if (typeof value === 'string' && value.trim()) return [value.trim().slice(0, 200)];
    return [];
  }
  return value
    .map((x) => {
      if (typeof x === 'string') return x.trim();
      if (x && typeof x === 'object') {
        return String(x.name || x.label || x.desc || x.text || '').trim();
      }
      return '';
    })
    .filter(Boolean)
    .map((s) => s.slice(0, 200))
    .slice(0, limit);
}

export function normalizeDoctorSeverity(value) {
  const s = String(value || '').trim().toLowerCase();
  if (SEVERITIES.has(s)) return s;
  return null;
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
 * Normalize diagnostic confidence. Missing/invalid → null (never invent HIGH).
 */
export function normalizeDiagnosticConfidence(value) {
  const s = String(value || '')
    .trim()
    .toLowerCase();
  if (CONFIDENCE_VALUES.has(s)) return s;
  if (s === 'med') return PLANT_DOCTOR_CONFIDENCE.MEDIUM;
  return null;
}

/**
 * Owned-plant identity gate from a single Doctor diagnosis payload.
 * Unmatched path → not applicable (general Doctor; no owned-plant mutation).
 * Owned + missing/invalid assessment → UNCERTAIN (never invent MATCH).
 * Only MATCH may mutate owned plant / create owned care task / hook owned mood.
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
  // Do not silently convert missing identity to MATCH.
  if (!assessment) assessment = PLANT_DOCTOR_IDENTITY.UNCERTAIN;
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

/**
 * Combined identity + diagnostic-confidence writeback gate (owned plant).
 * LOW confidence always blocks persistent mutation/task.
 * MEDIUM + needsMoreEvidence blocks persistent treatment/state writeback.
 * HIGH (or MEDIUM without needing more evidence) may proceed after explicit user action.
 */
export function resolveDiagnosticWritebackGate(input = {}) {
  const unmatched = input.unmatched === true || !input.gardenPlantClientId;
  const identityGate = resolveOwnedPlantIdentityGate(input);
  const diagnosis =
    input.diagnosis && typeof input.diagnosis === 'object' ? input.diagnosis : {};
  let confidence = normalizeDiagnosticConfidence(
    diagnosis.diagnostic_confidence ||
      diagnosis.diagnosticConfidence ||
      // legacy numeric/string "confidence" must never invent HIGH — only accept enum-like
      (typeof diagnosis.confidence === 'string' ? diagnosis.confidence : null)
  );
  const needsMoreEvidence =
    diagnosis.needs_more_evidence === true || diagnosis.needsMoreEvidence === true;

  if (unmatched) {
    return {
      applicable: false,
      identityGate,
      confidence: confidence || null,
      needsMoreEvidence,
      mayMutateOwnedPlant: false,
      mayCreateCareTask: true,
      mayHookOwnedMood: true,
      blockedReason: null,
      userMessage: null
    };
  }

  // Owned + missing confidence → treat as LOW (never invent HIGH/MEDIUM).
  if (!confidence) confidence = PLANT_DOCTOR_CONFIDENCE.LOW;

  if (!identityGate.mayMutateOwnedPlant) {
    return {
      applicable: true,
      identityGate,
      confidence,
      needsMoreEvidence,
      mayMutateOwnedPlant: false,
      mayCreateCareTask: false,
      mayHookOwnedMood: false,
      blockedReason: `identity_${identityGate.assessment}`,
      userMessage: buildIdentityBlockedUserMessage(
        input.plantDisplayName,
        identityGate.assessment,
        identityGate.reason
      )
    };
  }

  if (confidence === PLANT_DOCTOR_CONFIDENCE.LOW) {
    return {
      applicable: true,
      identityGate,
      confidence,
      needsMoreEvidence: true,
      mayMutateOwnedPlant: false,
      mayCreateCareTask: false,
      mayHookOwnedMood: false,
      blockedReason: 'confidence_low',
      userMessage:
        'Confidence is low. No definitive diagnosis was applied. Please provide additional evidence (clearer photo or details) before updating this plant.'
    };
  }

  if (confidence === PLANT_DOCTOR_CONFIDENCE.MEDIUM && needsMoreEvidence) {
    return {
      applicable: true,
      identityGate,
      confidence,
      needsMoreEvidence: true,
      mayMutateOwnedPlant: false,
      mayCreateCareTask: false,
      mayHookOwnedMood: false,
      blockedReason: 'confidence_medium_needs_evidence',
      userMessage:
        'This is a likely cause, but more evidence could change treatment. Please add the requested evidence before updating garden status or creating a care task.'
    };
  }

  return {
    applicable: true,
    identityGate,
    confidence,
    needsMoreEvidence: false,
    mayMutateOwnedPlant: true,
    mayCreateCareTask: true,
    mayHookOwnedMood: true,
    blockedReason: null,
    userMessage: null
  };
}

export function buildIdentityBlockedUserMessage(plantDisplayName, assessment, reason) {
  if (assessment === PLANT_DOCTOR_IDENTITY.MISMATCH) {
    return 'This photo may not be your selected plant. Please upload a photo of the correct plant or choose another plant.';
  }
  const name = String(plantDisplayName || 'selected plant').trim() || 'selected plant';
  const base = `We could not confirm this photo is your ${name}. Garden status and care tasks were not changed. Please confirm or retry with a clearer photo of the selected plant.`;
  return reason ? `${base} (${reason})` : base;
}

/**
 * Parse Doctor provider JSON text without network.
 * Returns null for malformed / non-object payloads (fixtures / unit tests).
 */
export function tryParseDoctorDiagnosisJson(text) {
  let s = String(text || '')
    .replace(/```json|```/gi, '')
    .trim();
  if (!s) return null;
  try {
    const parsed = JSON.parse(s);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    /* fall through */
  }
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const parsed = JSON.parse(s.slice(a, b + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

/**
 * Normalize one Doctor diagnosis payload into the Diagnostic Safety V1 shape.
 * Chemical/product recommendations are gated empty (no regulatory layer yet).
 */
export function normalizeDoctorDiagnosticPayload(raw = {}, options = {}) {
  const unmatched = options.unmatched === true;
  const observed_symptoms = asStringList(
    raw.observed_symptoms || raw.observedSymptoms
  );
  const differential_diagnoses = asStringList(
    raw.differential_diagnoses || raw.differentialDiagnoses
  );
  const requested_evidence = asStringList(
    raw.requested_evidence || raw.requestedEvidence
  );
  const safe_immediate_actions = asStringList(
    raw.safe_immediate_actions || raw.safeImmediateActions || raw.home_remedy
  );
  const likely_diagnosis =
    String(raw.likely_diagnosis || raw.likelyDiagnosis || raw.problem_name || '').trim() ||
    null;
  const recommended_next_action =
    String(
      raw.recommended_next_action ||
        raw.recommendedNextAction ||
        safe_immediate_actions[0] ||
        ''
    ).trim() || null;
  const needs_more_evidence =
    raw.needs_more_evidence === true ||
    raw.needsMoreEvidence === true ||
    normalizeDiagnosticConfidence(
      raw.diagnostic_confidence || raw.diagnosticConfidence
    ) === PLANT_DOCTOR_CONFIDENCE.LOW;

  let identity_assessment = normalizeIdentityAssessment(
    raw.identity_assessment || raw.identityAssessment
  );
  if (!unmatched && !identity_assessment) {
    identity_assessment = PLANT_DOCTOR_IDENTITY.UNCERTAIN;
  }
  if (unmatched) identity_assessment = identity_assessment || null;

  let diagnostic_confidence = normalizeDiagnosticConfidence(
    raw.diagnostic_confidence || raw.diagnosticConfidence
  );
  // Never invent HIGH. Missing owned confidence → LOW.
  if (!unmatched && !diagnostic_confidence) {
    diagnostic_confidence = PLANT_DOCTOR_CONFIDENCE.LOW;
  }

  const severity = normalizeDoctorSeverity(raw.severity);

  return {
    plant_name: raw.plant_name || raw.plantName || null,
    problem_name: likely_diagnosis,
    likely_diagnosis,
    observed_symptoms,
    differential_diagnoses,
    diagnostic_confidence,
    severity,
    recommended_next_action,
    needs_more_evidence: !!needs_more_evidence,
    requested_evidence,
    safe_immediate_actions,
    diagnosis: raw.diagnosis || null,
    // Treatment safety V1: do not surface specific chemical products as primary advice.
    products: [],
    products_gated: true,
    biological: [],
    home_remedy: safe_immediate_actions.length
      ? safe_immediate_actions
      : asStringList(raw.home_remedy),
    // Never invent numeric confidence.
    confidence: null,
    identity_assessment,
    identity_reason:
      String(raw.identity_reason || raw.identityReason || '').trim() || null
  };
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
 * Wording strength tracks diagnosticConfidence when present.
 */
export function mapDiagnosisToPlantStatePatch(diagnosis = {}, options = {}) {
  const severity = normalizeDoctorSeverity(diagnosis.severity);
  const conf =
    normalizeDiagnosticConfidence(
      diagnosis.diagnostic_confidence || diagnosis.diagnosticConfidence
    ) || null;
  const problem = String(
    diagnosis.likely_diagnosis || diagnosis.likelyDiagnosis || diagnosis.problem_name || ''
  ).trim();
  const displayName = String(options.plantDisplayName || diagnosis.plant_name || 'Plant').trim();
  const uncertain =
    conf === PLANT_DOCTOR_CONFIDENCE.LOW ||
    conf === PLANT_DOCTOR_CONFIDENCE.MEDIUM ||
    !severity ||
    severity === 'unknown' ||
    !problem ||
    /unknown|uncertain|unclear|possible|maybe|suspect|likely/i.test(
      `${problem} ${diagnosis.diagnosis || ''}`
    );

  let mark = options.currentMark === '!' ? '!' : '✓';
  if (severity === 'medium' || severity === 'high') mark = '!';
  else if ((severity === 'low' || severity === 'unknown') && uncertain) mark = '!';

  let status = String(options.currentStatus || 'Healthy').trim() || 'Healthy';
  if (problem) {
    let prefix = 'Needs attention';
    if (conf === PLANT_DOCTOR_CONFIDENCE.MEDIUM || /likely|possible/i.test(problem)) {
      prefix = 'Likely';
    } else if (uncertain) {
      prefix = 'Needs check';
    }
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
    problemName: problem || null,
    diagnosticConfidence: conf
  };
}

/**
 * Build one recommended care task row (My Garden array shape) from diagnosis.
 * Prefers safeImmediateActions / recommendedNextAction (non-chemical).
 */
export function buildDoctorCareTaskRow(diagnosis = {}, options = {}) {
  const patch = mapDiagnosisToPlantStatePatch(diagnosis, options);
  const safe = asStringList(
    diagnosis.safe_immediate_actions || diagnosis.safeImmediateActions || diagnosis.home_remedy
  );
  const next = String(
    diagnosis.recommended_next_action || diagnosis.recommendedNextAction || ''
  ).trim();
  const title = (safe[0] || next
    ? String(safe[0] || next)
    : patch.problemName
      ? `Inspect: ${patch.problemName}`
      : 'Inspect plant after diagnosis'
  ).slice(0, 120);
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
  const diagnosisIn = input.diagnosis && typeof input.diagnosis === 'object' ? input.diagnosis : null;
  if (!diagnosisIn) throw new Error('diagnosis is required');
  const unmatched = input.unmatched === true || !input.gardenPlantClientId;
  const allowed = new Set(Object.values(PLANT_DOCTOR_ACTIONS));
  const action = allowed.has(input.action)
    ? input.action
    : PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK;

  const diagnosis = normalizeDoctorDiagnosticPayload(diagnosisIn, { unmatched });
  if (input.identity && typeof input.identity === 'object') {
    const fromId = normalizeIdentityAssessment(input.identity.assessment);
    if (fromId) diagnosis.identity_assessment = fromId;
    if (input.identity.reason) {
      diagnosis.identity_reason = String(input.identity.reason).trim() || diagnosis.identity_reason;
    }
  }

  const identityGate = resolveOwnedPlantIdentityGate({
    unmatched,
    gardenPlantClientId: input.gardenPlantClientId,
    identity: input.identity,
    diagnosis
  });
  const writebackGate = resolveDiagnosticWritebackGate({
    unmatched,
    gardenPlantClientId: input.gardenPlantClientId,
    plantDisplayName: input.plantDisplayName,
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
    writeback: {
      mayMutateOwnedPlant: writebackGate.mayMutateOwnedPlant,
      mayCreateCareTask: writebackGate.mayCreateCareTask,
      blockedReason: writebackGate.blockedReason
    },
    diagnosis: {
      ...diagnosis,
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

function taskClientId(task) {
  if (!task) return '';
  if (Array.isArray(task)) return String(task[8] || task.id || '').trim();
  return String(task.id || task.client_instance_id || '').trim();
}

/**
 * Defensive invariant: Doctor writeback must never create more than maxNewTasks
 * new garden_tasks (0 for status-only, 1 for explicit Doctor care task).
 * Does not touch add-plant / seasonal plan paths.
 */
export function enforceDoctorTaskSafetyGuardrail(input = {}) {
  const before = Array.isArray(input.tasksBefore) ? input.tasksBefore.slice() : [];
  const after = Array.isArray(input.tasksAfter) ? input.tasksAfter : [];
  const maxNew = Math.max(
    0,
    Math.min(
      PLANT_DOCTOR_MAX_NEW_TASKS_PER_WRITEBACK,
      Number.isFinite(Number(input.maxNewTasks)) ? Number(input.maxNewTasks) : 0
    )
  );
  const delta = after.length - before.length;
  if (delta <= maxNew) {
    return {
      ok: true,
      newTaskCount: Math.max(0, delta),
      restoredTasks: after,
      abortedExtra: 0,
      reason: null
    };
  }

  const beforeIds = new Set(before.map(taskClientId).filter(Boolean));
  const beforeRefs = new Set(before);
  const extras = after.filter((t) => !beforeRefs.has(t));
  const restored = before.slice();
  let kept = 0;
  if (maxNew > 0) {
    const preferredId = String(input.preferredClientId || '').trim();
    let pick =
      (preferredId &&
        extras.find((t) => taskClientId(t) === preferredId)) ||
      extras.find((t) => {
        const id = taskClientId(t);
        return id.startsWith('pd_care_') && !beforeIds.has(id);
      }) ||
      extras[0] ||
      null;
    if (pick) {
      restored.unshift(pick);
      kept = 1;
    }
  }

  return {
    ok: false,
    newTaskCount: kept,
    restoredTasks: restored,
    abortedExtra: Math.max(0, delta - kept),
    reason: 'doctor_task_safety_guardrail_blocked_multi_create'
  };
}
