/**
 * Garden Memory Writers V1 — durable garden_events writer (browser + tests).
 *
 * Emits ONLY after explicit successful mutations (never hydrate/render/sync).
 * Idempotent on (garden_profile_id, client_event_id).
 */
import {
  GARDEN_EVENT_SCHEMA_VERSION,
  GARDEN_EVENT_TYPES,
  GARDEN_SOURCE_MODULES,
  GARDEN_TASK_TYPES,
  assertCausalParentSameGarden,
  buildGardenClientEventId,
  buildGardenEventInsert,
  mayEmitGardenEvent,
  normalizeSpineToken
} from './garden-os-spine-v1-contract.js';

export const GARDEN_MEMORY_WRITERS_VERSION = '1.0.0';

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error) {
  const code = String(error?.code || error?.details || '');
  const msg = String(error?.message || error?.error_description || '').toLowerCase();
  return (
    code === UNIQUE_VIOLATION ||
    msg.includes('duplicate key') ||
    msg.includes('garden_events_garden_client_uidx') ||
    msg.includes('unique constraint')
  );
}

function compactToken(value, max = 48) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, max);
}

/**
 * Write one garden_events row. Retries with same client_event_id resolve existing.
 * Does not mutate plants/tasks/AI — memory only.
 */
export async function writeGardenMemoryEvent(supabase, input = {}) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('garden_memory_supabase_required');
  }
  if (
    !mayEmitGardenEvent({
      reason: input.reason || 'explicit_mutation',
      explicitMutation: input.explicitMutation !== false
    })
  ) {
    throw new Error('garden_event_emit_forbidden');
  }

  const gardenProfileId = String(input.gardenProfileId || input.garden_profile_id || '').trim();
  if (!gardenProfileId) throw new Error('garden_profile_id is required');

  assertCausalParentSameGarden({
    gardenProfileId,
    causedByEventId: input.causedByEventId || input.caused_by_event_id,
    causedByEventGardenProfileId:
      input.causedByEventGardenProfileId ||
      input.caused_by_event_garden_profile_id ||
      gardenProfileId
  });

  const row = buildGardenEventInsert({
    reason: input.reason || 'explicit_mutation',
    explicitMutation: true,
    gardenProfileId,
    gardenPlantId: input.gardenPlantId ?? input.garden_plant_id ?? null,
    gardenTaskId: input.gardenTaskId ?? input.garden_task_id ?? null,
    causedByEventId: input.causedByEventId ?? input.caused_by_event_id ?? null,
    causedByEventGardenProfileId: gardenProfileId,
    correlationId: input.correlationId ?? input.correlation_id ?? null,
    schemaVersion: input.schemaVersion ?? input.schema_version ?? GARDEN_EVENT_SCHEMA_VERSION,
    eventType: input.eventType || input.event_type,
    sourceModule: input.sourceModule || input.source_module,
    stableKey: input.stableKey || input.stable_key,
    clientEventId: input.clientEventId || input.client_event_id,
    payload: input.payload || {},
    provenance: input.provenance,
    decisionContext: input.decisionContext || input.decision_context,
    occurredAt: input.occurredAt || input.occurred_at || new Date().toISOString()
  });

  // user_id is set by ownership trigger from garden_profiles.
  const insertRow = { ...row };
  delete insertRow.user_id;

  const { data, error } = await supabase
    .from('garden_events')
    .insert(insertRow)
    .select('id, garden_profile_id, garden_plant_id, garden_task_id, event_type, source_module, client_event_id, caused_by_event_id, correlation_id, schema_version, payload, occurred_at')
    .single();

  if (!error && data) {
    return { ok: true, idempotent: false, event: data, eventId: data.id };
  }

  if (error && isUniqueViolation(error)) {
    const { data: existing, error: selErr } = await supabase
      .from('garden_events')
      .select(
        'id, garden_profile_id, garden_plant_id, garden_task_id, event_type, source_module, client_event_id, caused_by_event_id, correlation_id, schema_version, payload, occurred_at'
      )
      .eq('garden_profile_id', gardenProfileId)
      .eq('client_event_id', row.client_event_id)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!existing?.id) throw error;
    return { ok: true, idempotent: true, event: existing, eventId: existing.id };
  }

  throw error || new Error('garden_memory_write_failed');
}

export function buildPlantAddedMemoryInput(plantRow, meta = {}) {
  const clientId = String(plantRow?.client_instance_id || meta.clientInstanceId || '').trim();
  const gardenPlantId = String(plantRow?.id || meta.gardenPlantId || '').trim();
  const gardenProfileId = String(plantRow?.garden_profile_id || meta.gardenProfileId || '').trim();
  if (!clientId || !gardenPlantId || !gardenProfileId) {
    throw new Error('plant_added_requires_server_plant');
  }
  const sourceModule = meta.sourceModule || GARDEN_SOURCE_MODULES.MY_GARDEN;
  const stableKey = `plant_${clientId}_added`;
  return {
    reason: 'explicit_mutation',
    explicitMutation: true,
    gardenProfileId,
    gardenPlantId,
    eventType: GARDEN_EVENT_TYPES.PLANT_ADDED,
    sourceModule,
    stableKey,
    clientEventId: buildGardenClientEventId({
      sourceModule,
      eventType: GARDEN_EVENT_TYPES.PLANT_ADDED,
      stableKey
    }),
    payload: {
      name: String(plantRow.name || meta.name || '').trim() || undefined,
      scientific: plantRow.scientific || meta.scientific || undefined,
      profile_slug: plantRow.profile_slug || meta.profileSlug || undefined,
      origin_source: plantRow.source || meta.originSource || undefined,
      client_instance_id: clientId
    },
    occurredAt: meta.occurredAt || plantRow.added_at || new Date().toISOString()
  };
}

export function buildPlantArchivedMemoryInput(plantRow, meta = {}) {
  const clientId = String(plantRow?.client_instance_id || meta.clientInstanceId || '').trim();
  const gardenPlantId = String(plantRow?.id || meta.gardenPlantId || '').trim();
  const gardenProfileId = String(plantRow?.garden_profile_id || meta.gardenProfileId || '').trim();
  if (!clientId || !gardenPlantId || !gardenProfileId) {
    throw new Error('plant_archived_requires_server_plant');
  }
  const sourceModule = GARDEN_SOURCE_MODULES.MY_GARDEN;
  const stableKey = `plant_${clientId}_archived`;
  return {
    reason: 'explicit_mutation',
    explicitMutation: true,
    gardenProfileId,
    gardenPlantId,
    eventType: GARDEN_EVENT_TYPES.PLANT_ARCHIVED,
    sourceModule,
    stableKey,
    clientEventId: buildGardenClientEventId({
      sourceModule,
      eventType: GARDEN_EVENT_TYPES.PLANT_ARCHIVED,
      stableKey
    }),
    payload: {
      name: String(plantRow.name || '').trim() || undefined,
      client_instance_id: clientId,
      archived: true
    },
    occurredAt: meta.occurredAt || new Date().toISOString()
  };
}

export function buildTaskCompletedMemoryInput(taskRow, meta = {}) {
  const clientId = String(taskRow?.client_instance_id || meta.clientInstanceId || '').trim();
  const gardenTaskId = String(taskRow?.id || meta.gardenTaskId || '').trim();
  const gardenProfileId = String(taskRow?.garden_profile_id || meta.gardenProfileId || '').trim();
  if (!clientId || !gardenTaskId || !gardenProfileId) {
    throw new Error('task_completed_requires_server_task');
  }
  const sourceModule = meta.sourceModule || GARDEN_SOURCE_MODULES.MY_GARDEN;
  const stableKey = `task_${clientId}_completed`;
  return {
    reason: 'explicit_mutation',
    explicitMutation: true,
    gardenProfileId,
    gardenPlantId: taskRow.garden_plant_id || meta.gardenPlantId || null,
    gardenTaskId,
    eventType: GARDEN_EVENT_TYPES.TASK_COMPLETED,
    sourceModule,
    stableKey,
    clientEventId: buildGardenClientEventId({
      sourceModule,
      eventType: GARDEN_EVENT_TYPES.TASK_COMPLETED,
      stableKey
    }),
    payload: {
      title: String(taskRow.title || meta.title || '').trim() || undefined,
      task_type: taskRow.task_type || meta.taskType || undefined,
      client_instance_id: clientId,
      previous_done: false,
      done: true
      // Intentionally no "helped" / outcome fields
    },
    occurredAt: meta.occurredAt || new Date().toISOString()
  };
}

export function buildDoctorEpisodeIds(input = {}) {
  const plantClientId = compactToken(input.gardenPlantClientId || 'unknown', 40);
  const problem = compactToken(
    input.problemName || input.likelyDiagnosis || input.diagnosis?.problem_name || 'diagnosis',
    40
  );
  const day = String(input.dayKey || (input.timestamp || '').slice(0, 10) || new Date().toISOString().slice(0, 10));
  const correlationId = `ep_pd_${plantClientId}_${problem}_${day}`.slice(0, 120);
  const diagStable = `diag_${plantClientId}_${problem}_${compactToken(input.severity || 'unk', 12)}_${compactToken(input.confidence || 'unk', 12)}`;
  return {
    correlationId,
    diagnosisStableKey: diagStable,
    healthStableKey: `health_${plantClientId}_${diagStable}`,
    taskStableKey: (taskClientId) => `task_${compactToken(taskClientId, 48)}_created_${diagStable}`
  };
}

export function buildDoctorDiagnosisMemoryInput(input = {}) {
  const gardenProfileId = String(input.gardenProfileId || '').trim();
  const gardenPlantId = String(input.gardenPlantId || '').trim();
  if (!gardenProfileId || !gardenPlantId) {
    throw new Error('doctor_diagnosis_requires_owned_plant');
  }
  const ids = buildDoctorEpisodeIds(input);
  const diagnosis = input.diagnosis || {};
  const sourceModule = GARDEN_SOURCE_MODULES.PLANT_DOCTOR;
  return {
    reason: 'explicit_mutation',
    explicitMutation: true,
    gardenProfileId,
    gardenPlantId,
    correlationId: ids.correlationId,
    eventType: GARDEN_EVENT_TYPES.DOCTOR_DIAGNOSIS,
    sourceModule,
    stableKey: ids.diagnosisStableKey,
    clientEventId: buildGardenClientEventId({
      sourceModule,
      eventType: GARDEN_EVENT_TYPES.DOCTOR_DIAGNOSIS,
      stableKey: ids.diagnosisStableKey
    }),
    payload: {
      likely_diagnosis:
        diagnosis.problem_name || diagnosis.likely_diagnosis || diagnosis.diagnosis || undefined,
      severity: diagnosis.severity || undefined,
      diagnostic_confidence: diagnosis.diagnostic_confidence || input.diagnosticConfidence || undefined,
      identity_assessment: input.identityAssessment || undefined,
      symptom_summary: String(diagnosis.symptoms_summary || diagnosis.observed_symptoms || '')
        .trim()
        .slice(0, 240) || undefined,
      differentials: Array.isArray(diagnosis.differential_diagnoses)
        ? diagnosis.differential_diagnoses.slice(0, 5).map((d) => String(d).slice(0, 80))
        : undefined,
      needs_more_evidence: diagnosis.needs_more_evidence === true,
      client_instance_id: input.gardenPlantClientId || undefined
    },
    provenance: {
      contract_version: input.contractVersion || 'plant-doctor-care-loop-v1',
      engine_version: input.engineVersion || '1.0.0',
      confidence: diagnosis.diagnostic_confidence || input.diagnosticConfidence || undefined,
      evidence_state: diagnosis.needs_more_evidence ? 'needs_more_evidence' : 'sufficient'
    },
    decisionContext: {
      plant_slug: input.profileSlug || undefined,
      plant_identity: input.scientific || input.plantDisplayName || undefined,
      plant_health_snapshot: input.previousHealth || undefined,
      confidence: diagnosis.diagnostic_confidence || undefined,
      evidence_state: diagnosis.needs_more_evidence ? 'needs_more_evidence' : 'sufficient'
    },
    occurredAt: input.occurredAt || input.timestamp || new Date().toISOString()
  };
}

export function buildDoctorHealthChangedMemoryInput(input = {}) {
  const gardenProfileId = String(input.gardenProfileId || '').trim();
  const gardenPlantId = String(input.gardenPlantId || '').trim();
  const causedByEventId = String(input.causedByEventId || '').trim();
  if (!gardenProfileId || !gardenPlantId || !causedByEventId) {
    throw new Error('plant_health_changed_requires_diagnosis_parent');
  }
  const ids = buildDoctorEpisodeIds(input);
  const sourceModule = GARDEN_SOURCE_MODULES.PLANT_DOCTOR;
  return {
    reason: 'explicit_mutation',
    explicitMutation: true,
    gardenProfileId,
    gardenPlantId,
    causedByEventId,
    causedByEventGardenProfileId: gardenProfileId,
    correlationId: ids.correlationId,
    eventType: GARDEN_EVENT_TYPES.PLANT_HEALTH_CHANGED,
    sourceModule,
    stableKey: ids.healthStableKey,
    clientEventId: buildGardenClientEventId({
      sourceModule,
      eventType: GARDEN_EVENT_TYPES.PLANT_HEALTH_CHANGED,
      stableKey: ids.healthStableKey
    }),
    payload: {
      previous: input.previousHealth || undefined,
      next: input.nextHealth || undefined,
      uncertainty: input.uncertainty || undefined,
      source: 'plant_doctor'
    },
    provenance: {
      contract_version: 'plant-doctor-care-loop-v1',
      engine_version: '1.0.0'
    },
    occurredAt: input.occurredAt || new Date().toISOString()
  };
}

export function buildDoctorTaskCreatedMemoryInput(input = {}) {
  const gardenProfileId = String(input.gardenProfileId || '').trim();
  const gardenPlantId = String(input.gardenPlantId || '').trim() || null;
  const gardenTaskId = String(input.gardenTaskId || '').trim();
  const causedByEventId = String(input.causedByEventId || '').trim();
  const taskClientId = String(input.taskClientId || '').trim();
  if (!gardenProfileId || !gardenTaskId || !causedByEventId || !taskClientId) {
    throw new Error('task_created_requires_persisted_task_and_parent');
  }
  const ids = buildDoctorEpisodeIds(input);
  const sourceModule = GARDEN_SOURCE_MODULES.PLANT_DOCTOR;
  const stableKey = ids.taskStableKey(taskClientId);
  return {
    reason: 'explicit_mutation',
    explicitMutation: true,
    gardenProfileId,
    gardenPlantId,
    gardenTaskId,
    causedByEventId,
    causedByEventGardenProfileId: gardenProfileId,
    correlationId: ids.correlationId,
    eventType: GARDEN_EVENT_TYPES.TASK_CREATED,
    sourceModule,
    stableKey,
    clientEventId: buildGardenClientEventId({
      sourceModule,
      eventType: GARDEN_EVENT_TYPES.TASK_CREATED,
      stableKey
    }),
    payload: {
      title: input.title || undefined,
      task_type: GARDEN_TASK_TYPES.DOCTOR,
      source_module: sourceModule,
      client_instance_id: taskClientId
    },
    occurredAt: input.occurredAt || new Date().toISOString()
  };
}

export { GARDEN_EVENT_TYPES, GARDEN_SOURCE_MODULES, GARDEN_TASK_TYPES, mayEmitGardenEvent, normalizeSpineToken };
