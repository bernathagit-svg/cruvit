/**
 * Garden OS Spine V1 — pure contracts (no DOM / network / Supabase calls).
 *
 * Durable history = garden_events (append-oriented).
 * Current plant health snapshot = garden_plants.status + mark only.
 * Tasks = existing garden_tasks (+ optional source_module / task_type).
 *
 * Causal learning chain (optional links):
 *   observe → diagnose/recommend → accept/reject → action/task
 *   → completion → outcome → health change → follow-up / adapt (later)
 *
 * Hard rules:
 *   task_completed ≠ treatment success
 *   recommendation_generated ≠ accepted ≠ rejected ≠ task_created
 *   Never infer one lifecycle state from another.
 *
 * Learning safety (Spine V1): garden/plant evidence only —
 * no global catalog / cross-user / automatic global learning.
 *
 * Events MUST NOT be emitted for hydrate / reload / render / reconciliation /
 * generic sync loops. Only explicit mutations. Retries reuse client_event_id.
 */

export const GARDEN_OS_SPINE_VERSION = '1.0.2-draft-final-moat';

/** Current payload/contract generation written by Spine V1 writers. */
export const GARDEN_EVENT_SCHEMA_VERSION = 1;

/** Supported readable schema_version values (app contract; not a migration framework). */
export const GARDEN_EVENT_SCHEMA_VERSIONS_SUPPORTED = Object.freeze([1]);

/** Closed V1 event types (TEXT in SQL; validated here). */
export const GARDEN_EVENT_TYPES = Object.freeze({
  PLANT_ADDED: 'plant_added',
  PLANT_ARCHIVED: 'plant_archived',
  PLANT_REMOVED: 'plant_removed',
  SUITABILITY_CHECKED: 'suitability_checked',
  DOCTOR_DIAGNOSIS: 'doctor_diagnosis',
  PLANT_HEALTH_CHANGED: 'plant_health_changed',
  TASK_CREATED: 'task_created',
  TASK_COMPLETED: 'task_completed',
  TASK_OUTCOME_REPORTED: 'task_outcome_reported',
  FOLLOWUP_REQUESTED: 'followup_requested',
  IDENTIFIER_SAVED: 'identifier_saved',
  RECOMMENDATION_GENERATED: 'recommendation_generated',
  RECOMMENDATION_ACCEPTED: 'recommendation_accepted',
  RECOMMENDATION_REJECTED: 'recommendation_rejected'
});

/** Reserved for later Design integration — rejected by V1 writers. */
export const GARDEN_EVENT_TYPES_RESERVED = Object.freeze({
  DESIGN_PLANT_ADDED: 'design_plant_added'
});

export const GARDEN_SOURCE_MODULES = Object.freeze({
  MY_GARDEN: 'my_garden',
  PLANT_DOCTOR: 'plant_doctor',
  PLANT_IDENTIFIER: 'plant_identifier',
  SMART_RECOMMENDATIONS: 'smart_recommendations',
  GARDEN_DESIGN: 'garden_design',
  SYSTEM: 'system'
});

export const GARDEN_TASK_TYPES = Object.freeze({
  CARE: 'care',
  DOCTOR: 'doctor',
  WEATHER: 'weather',
  SEASONAL: 'seasonal',
  SUITABILITY: 'suitability',
  IDENTIFIER: 'identifier',
  RECOMMENDATION: 'recommendation',
  OTHER: 'other'
});

/**
 * User-reported intervention outcome (NOT task completion).
 * helped→better, helped a little→slightly_better, no difference→no_change,
 * worse→worse, unclear→unsure
 */
export const GARDEN_OUTCOME_VALUES = Object.freeze({
  BETTER: 'better',
  SLIGHTLY_BETTER: 'slightly_better',
  NO_CHANGE: 'no_change',
  WORSE: 'worse',
  UNSURE: 'unsure'
});

export const GARDEN_FOLLOWUP_REASONS = Object.freeze({
  OUTCOME_UNKNOWN: 'outcome_unknown',
  NO_IMPROVEMENT: 'no_improvement',
  WORSENING: 'worsening',
  NEW_EVIDENCE_NEEDED: 'new_evidence_needed',
  RE_DIAGNOSIS_REQUESTED: 're_diagnosis_requested'
});

/**
 * Recommendation lifecycle — never infer one from another.
 */
export const GARDEN_RECOMMENDATION_LIFECYCLE = Object.freeze({
  GENERATED_MEANS: 'cruvit_produced_a_recommendation',
  ACCEPTED_MEANS: 'user_explicitly_accepted_it',
  REJECTED_MEANS: 'user_explicitly_rejected_or_dismissed_it',
  TASK_CREATED_MEANS: 'an_actual_action_task_was_created',
  INFER_ACCEPTED_FROM_GENERATED: false,
  INFER_TASK_FROM_ACCEPTED: false,
  INFER_OUTCOME_FROM_COMPLETION: false
});

export const GARDEN_LEARNING_SAFETY = Object.freeze({
  SCOPE: 'garden_plant_evidence_only',
  GLOBAL_CATALOG_MUTATION: false,
  CROSS_USER_TRANSFER: false,
  AUTOMATIC_GLOBAL_LEARNING: false,
  RECOMMENDATION_ADAPTATION: 'deferred'
});

export const GARDEN_COMPLETION_VS_OUTCOME = Object.freeze({
  TASK_COMPLETED_MEANS: 'user_performed_the_action',
  TASK_OUTCOME_REPORTED_MEANS: 'user_reported_what_happened_afterward',
  INFER_SUCCESS_FROM_COMPLETION: false
});

/** Event types that may carry compact decision_context in payload. */
export const GARDEN_DECISION_CONTEXT_EVENT_TYPES = Object.freeze([
  GARDEN_EVENT_TYPES.SUITABILITY_CHECKED,
  GARDEN_EVENT_TYPES.DOCTOR_DIAGNOSIS,
  GARDEN_EVENT_TYPES.RECOMMENDATION_GENERATED
]);

const EVENT_TYPE_SET = new Set(Object.values(GARDEN_EVENT_TYPES));
const SOURCE_MODULE_SET = new Set(Object.values(GARDEN_SOURCE_MODULES));
const TASK_TYPE_SET = new Set(Object.values(GARDEN_TASK_TYPES));
const OUTCOME_SET = new Set(Object.values(GARDEN_OUTCOME_VALUES));
const FOLLOWUP_REASON_SET = new Set(Object.values(GARDEN_FOLLOWUP_REASONS));
const SCHEMA_VERSION_SET = new Set(GARDEN_EVENT_SCHEMA_VERSIONS_SUPPORTED);
const DECISION_CONTEXT_EVENT_SET = new Set(GARDEN_DECISION_CONTEXT_EVENT_TYPES);

const PROVENANCE_ALLOWED_KEYS = new Set([
  'contract_version',
  'engine_version',
  'confidence',
  'evidence_state',
  'model_provider',
  'model_version'
]);

const PROVENANCE_FORBIDDEN_KEYS = new Set([
  'prompt',
  'raw_prompt',
  'system_prompt',
  'api_key',
  'secret',
  'token',
  'authorization',
  'password'
]);

const DECISION_CONTEXT_ALLOWED_KEYS = new Set([
  'plant_slug',
  'plant_identity',
  'garden_location_ref',
  'area_ref',
  'climate_state',
  'plant_health_snapshot',
  'confidence',
  'evidence_state'
]);

const MAX_PROVENANCE_STRING = 80;
const MAX_CONTEXT_STRING = 120;
const MAX_CONTEXT_KEYS = 12;
const MAX_CORRELATION_ID = 120;

export const GARDEN_EVENT_NON_MUTATION_REASONS = Object.freeze([
  'hydrate',
  'reload',
  'render',
  'server_reconciliation',
  'reconciliation',
  'sync_loop',
  'generic_upsert',
  'retry_without_mutation'
]);

const NON_MUTATION_SET = new Set(GARDEN_EVENT_NON_MUTATION_REASONS);

export function normalizeSpineToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function isGardenEventType(value) {
  return EVENT_TYPE_SET.has(normalizeSpineToken(value));
}

export function isGardenSourceModule(value) {
  return SOURCE_MODULE_SET.has(normalizeSpineToken(value));
}

export function isGardenTaskType(value) {
  const s = normalizeSpineToken(value);
  if (!s) return true;
  return TASK_TYPE_SET.has(s);
}

export function isGardenOutcomeValue(value) {
  return OUTCOME_SET.has(normalizeSpineToken(value));
}

export function isGardenFollowupReason(value) {
  return FOLLOWUP_REASON_SET.has(normalizeSpineToken(value));
}

export function mayEmitGardenEvent(input = {}) {
  const reason = normalizeSpineToken(input.reason || input.cause || '');
  if (!reason) return false;
  if (NON_MUTATION_SET.has(reason)) return false;
  if (input.explicitMutation === true) return true;
  return (
    reason === 'explicit_mutation' ||
    reason === 'user_action' ||
    reason === 'module_write' ||
    reason.startsWith('mutate_')
  );
}

export function isTaskCompletionEventType(eventType) {
  return normalizeSpineToken(eventType) === GARDEN_EVENT_TYPES.TASK_COMPLETED;
}

export function isTaskOutcomeEventType(eventType) {
  return normalizeSpineToken(eventType) === GARDEN_EVENT_TYPES.TASK_OUTCOME_REPORTED;
}

export function isRecommendationLifecycleEventType(eventType) {
  const t = normalizeSpineToken(eventType);
  return (
    t === GARDEN_EVENT_TYPES.RECOMMENDATION_GENERATED ||
    t === GARDEN_EVENT_TYPES.RECOMMENDATION_ACCEPTED ||
    t === GARDEN_EVENT_TYPES.RECOMMENDATION_REJECTED
  );
}

export function assertCompletionIsNotOutcome(eventType) {
  if (isTaskCompletionEventType(eventType) && GARDEN_COMPLETION_VS_OUTCOME.INFER_SUCCESS_FROM_COMPLETION) {
    throw new Error('completion_must_not_infer_outcome');
  }
  return true;
}

export function assertLearningSafetyForOutcome(input = {}) {
  if (input.modifyGlobalCatalog === true) {
    throw new Error('learning_safety_global_catalog_forbidden');
  }
  if (input.affectOtherUsers === true) {
    throw new Error('learning_safety_cross_user_forbidden');
  }
  if (input.automaticGlobalLearning === true) {
    throw new Error('learning_safety_automatic_global_forbidden');
  }
  return {
    scope: GARDEN_LEARNING_SAFETY.SCOPE,
    globalCatalogMutation: false,
    crossUserTransfer: false,
    automaticGlobalLearning: false
  };
}

/**
 * Validate schema_version for write/read. V1 supports only version 1.
 */
export function assertSupportedSchemaVersion(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`invalid_schema_version:${value}`);
  }
  if (!SCHEMA_VERSION_SET.has(n)) {
    throw new Error(`unsupported_schema_version:${n}`);
  }
  return n;
}

/**
 * caused_by_event_id must reference an event in the SAME garden.
 * Pure check: callers supply parent garden id when known (DB trigger enforces at insert).
 */
export function assertCausalParentSameGarden(input = {}) {
  const childGarden = String(input.gardenProfileId || input.garden_profile_id || '').trim();
  const parentGarden = String(
    input.causedByEventGardenProfileId ||
      input.caused_by_event_garden_profile_id ||
      input.parentGardenProfileId ||
      input.parent_garden_profile_id ||
      ''
  ).trim();
  const causedBy = optionalUuidField(input.causedByEventId, input.caused_by_event_id);
  if (!causedBy) return true;
  if (!childGarden) throw new Error('garden_profile_id is required');
  if (!parentGarden) {
    // Parent garden unknown at pure-build time — SQL trigger still enforces.
    return true;
  }
  if (parentGarden !== childGarden) {
    throw new Error('garden_event_causal_garden_mismatch');
  }
  return true;
}

export function normalizeCorrelationId(value) {
  if (value == null || value === '') return null;
  const id = String(value).trim();
  if (!id) return null;
  if (id.length > MAX_CORRELATION_ID) throw new Error('correlation_id too long');
  return id;
}

function boundString(value, max) {
  const s = String(value).trim();
  if (!s) return undefined;
  if (s.length > max) throw new Error('payload_field_too_long');
  return s;
}

/**
 * Optional decision provenance (payload.provenance). No secrets / raw prompts.
 */
export function normalizeDecisionProvenance(raw) {
  if (raw == null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('provenance must be a plain object');
  }
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = normalizeSpineToken(k).replace(/\s+/g, '_');
    if (PROVENANCE_FORBIDDEN_KEYS.has(key) || key.includes('prompt') || key.includes('secret')) {
      throw new Error(`provenance_forbidden_key:${key}`);
    }
    if (!PROVENANCE_ALLOWED_KEYS.has(key)) continue; // drop unknown — keep compact
    if (v === undefined || v === null) continue;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new Error('provenance_invalid_number');
      out[key] = v;
      continue;
    }
    const s = boundString(v, MAX_PROVENANCE_STRING);
    if (s !== undefined) out[key] = s;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Compact decision context for suitability / diagnosis / recommendation_generated.
 * No full garden dump, no media blobs, no Areas implementation.
 */
export function normalizeDecisionContext(raw) {
  if (raw == null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('decision_context must be a plain object');
  }
  const keys = Object.keys(raw);
  if (keys.length > MAX_CONTEXT_KEYS) throw new Error('decision_context_too_large');

  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = normalizeSpineToken(k).replace(/\s+/g, '_');
    if (!DECISION_CONTEXT_ALLOWED_KEYS.has(key)) continue;
    if (v === undefined || v === null) continue;

    if (key === 'plant_health_snapshot' || key === 'climate_state') {
      if (typeof v !== 'object' || Array.isArray(v)) {
        throw new Error(`${key}_must_be_object`);
      }
      const nested = {};
      let n = 0;
      for (const [nk, nv] of Object.entries(v)) {
        if (nv === undefined) continue;
        if (++n > 8) throw new Error(`${key}_too_large`);
        if (typeof nv === 'number' && Number.isFinite(nv)) {
          nested[String(nk).slice(0, 40)] = nv;
        } else if (typeof nv === 'boolean') {
          nested[String(nk).slice(0, 40)] = nv;
        } else {
          const s = boundString(nv, 60);
          if (s !== undefined) nested[String(nk).slice(0, 40)] = s;
        }
      }
      if (Object.keys(nested).length) out[key] = nested;
      continue;
    }

    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new Error('decision_context_invalid_number');
      out[key] = v;
      continue;
    }
    const s = boundString(v, MAX_CONTEXT_STRING);
    if (s !== undefined) out[key] = s;
  }
  return Object.keys(out).length ? out : undefined;
}

export function buildGardenClientEventId(input = {}) {
  const source = normalizeSpineToken(input.sourceModule || input.source_module || 'system')
    .replace(/[^a-z0-9_]+/g, '_')
    .slice(0, 32);
  const type = normalizeSpineToken(input.eventType || input.event_type || 'event')
    .replace(/[^a-z0-9_]+/g, '_')
    .slice(0, 40);
  const key = String(input.stableKey || input.stable_key || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64);
  if (!key) throw new Error('stableKey is required for client_event_id');
  return `gev_${source || 'system'}_${type || 'event'}_${key}`;
}

export function assertValidClientEventId(value) {
  const id = String(value || '').trim();
  if (!id) throw new Error('client_event_id is required');
  if (id.length > 200) throw new Error('client_event_id too long');
  return id;
}

export function normalizeGardenEventPayload(raw) {
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('payload must be a plain object');
  }
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function optionalUuidField(primary, snake) {
  if (primary == null && snake == null) return null;
  const s = String(primary ?? snake ?? '').trim();
  return s || null;
}

/**
 * Compose payload with optional provenance + decision_context (bounded).
 */
export function composeGardenEventPayload(input = {}, eventType) {
  const base = normalizeGardenEventPayload(input.payload);
  const provenance = normalizeDecisionProvenance(input.provenance ?? base.provenance);
  const wantsContext =
    input.decisionContext != null ||
    input.decision_context != null ||
    base.decision_context != null;
  let decision_context;
  if (wantsContext) {
    if (eventType && !DECISION_CONTEXT_EVENT_SET.has(eventType)) {
      // Allow attach but do not require — still normalize if provided.
    }
    decision_context = normalizeDecisionContext(
      input.decisionContext ?? input.decision_context ?? base.decision_context
    );
  }

  const { provenance: _p, decision_context: _c, ...rest } = base;
  const out = { ...rest };
  if (provenance) out.provenance = provenance;
  if (decision_context) out.decision_context = decision_context;
  return out;
}

/**
 * Build a server insert row for garden_events, or throw.
 */
export function buildGardenEventInsert(input = {}) {
  if (!mayEmitGardenEvent(input.emit || { reason: input.reason, explicitMutation: input.explicitMutation })) {
    throw new Error('garden_event_emit_forbidden');
  }

  const eventType = normalizeSpineToken(input.eventType || input.event_type);
  if (!isGardenEventType(eventType)) {
    throw new Error(`invalid_event_type:${eventType || 'empty'}`);
  }
  assertCompletionIsNotOutcome(eventType);

  const sourceModule = normalizeSpineToken(input.sourceModule || input.source_module);
  if (!isGardenSourceModule(sourceModule)) {
    throw new Error(`invalid_source_module:${sourceModule || 'empty'}`);
  }

  const gardenProfileId = String(input.gardenProfileId || input.garden_profile_id || '').trim();
  if (!gardenProfileId) throw new Error('garden_profile_id is required');

  const gardenPlantId = optionalUuidField(input.gardenPlantId, input.garden_plant_id);
  const gardenTaskId = optionalUuidField(input.gardenTaskId, input.garden_task_id);
  const causedByEventId = optionalUuidField(input.causedByEventId, input.caused_by_event_id);
  const correlationId = normalizeCorrelationId(input.correlationId ?? input.correlation_id);

  assertCausalParentSameGarden({
    gardenProfileId,
    causedByEventId,
    causedByEventGardenProfileId:
      input.causedByEventGardenProfileId ||
      input.caused_by_event_garden_profile_id ||
      input.parentGardenProfileId ||
      input.parent_garden_profile_id
  });

  const schemaVersion = assertSupportedSchemaVersion(
    input.schemaVersion ?? input.schema_version ?? GARDEN_EVENT_SCHEMA_VERSION
  );

  const clientEventId = assertValidClientEventId(
    input.clientEventId ||
      input.client_event_id ||
      buildGardenClientEventId({
        sourceModule,
        eventType,
        stableKey: input.stableKey || input.stable_key
      })
  );

  const payload = composeGardenEventPayload(input, eventType);
  const occurredAt = input.occurredAt || input.occurred_at || new Date().toISOString();

  return {
    garden_profile_id: gardenProfileId,
    garden_plant_id: gardenPlantId,
    garden_task_id: gardenTaskId,
    caused_by_event_id: causedByEventId,
    correlation_id: correlationId,
    schema_version: schemaVersion,
    event_type: eventType,
    source_module: sourceModule,
    client_event_id: clientEventId,
    payload,
    occurred_at: occurredAt
  };
}

export function buildIdempotentGardenEventInsert(input = {}) {
  const stableKey = input.stableKey || input.stable_key;
  if (!stableKey) throw new Error('stableKey is required for idempotent event');
  const pinned = {
    ...input,
    occurredAt: input.occurredAt || input.occurred_at || '1970-01-01T00:00:00.000Z'
  };
  return buildGardenEventInsert(pinned);
}

/**
 * Build a linked causal chain of inserts (pure; no DB). Each step may set
 * causedByEventId to the previous step's synthetic id for chain tests.
 */
export function buildCausalEventChain(steps = [], base = {}) {
  if (!Array.isArray(steps) || !steps.length) throw new Error('causal_chain_empty');
  const correlationId =
    normalizeCorrelationId(base.correlationId || base.correlation_id) ||
    `ep_${String(base.stableKey || 'chain').slice(0, 40)}`;
  const gardenProfileId = String(base.gardenProfileId || base.garden_profile_id || '').trim();
  if (!gardenProfileId) throw new Error('garden_profile_id is required');

  const rows = [];
  let prevSyntheticId = null;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] || {};
    const syntheticId = String(step.id || `evt_${i + 1}_${step.eventType || step.event_type || 'x'}`);
    const row = buildGardenEventInsert({
      reason: base.reason || 'explicit_mutation',
      explicitMutation: true,
      gardenProfileId,
      gardenPlantId: step.gardenPlantId ?? base.gardenPlantId ?? null,
      gardenTaskId: step.gardenTaskId ?? null,
      causedByEventId: step.causedByEventId ?? prevSyntheticId,
      causedByEventGardenProfileId: gardenProfileId,
      correlationId,
      schemaVersion: base.schemaVersion || GARDEN_EVENT_SCHEMA_VERSION,
      eventType: step.eventType || step.event_type,
      sourceModule: step.sourceModule || base.sourceModule || GARDEN_SOURCE_MODULES.SYSTEM,
      stableKey: step.stableKey || `${correlationId}_${i}_${step.eventType || 'evt'}`,
      occurredAt: step.occurredAt || base.occurredAt || '2026-09-11T12:00:00.000Z',
      payload: step.payload || {},
      provenance: step.provenance,
      decisionContext: step.decisionContext || step.decision_context
    });
    rows.push({ ...row, id: syntheticId });
    prevSyntheticId = syntheticId;
  }
  return { correlation_id: correlationId, events: rows };
}

export function buildTaskOutcomeEventInsert(input = {}) {
  assertLearningSafetyForOutcome(input.learning || input);

  const outcome = normalizeSpineToken(input.outcome);
  if (!isGardenOutcomeValue(outcome)) {
    throw new Error(`invalid_outcome:${outcome || 'empty'}`);
  }

  const gardenTaskId = optionalUuidField(input.gardenTaskId, input.garden_task_id);
  if (!gardenTaskId) throw new Error('garden_task_id is required for task_outcome_reported');

  const note =
    input.userNote != null || input.user_note != null
      ? String(input.userNote ?? input.user_note ?? '').trim()
      : '';

  const payload = normalizeGardenEventPayload({
    outcome,
    ...(note ? { user_note: note } : {}),
    ...(input.daysSinceAction != null || input.days_since_action != null
      ? { days_since_action: input.daysSinceAction ?? input.days_since_action }
      : {}),
    ...(input.beforeSeverity != null || input.before_severity != null
      ? { before_severity: input.beforeSeverity ?? input.before_severity }
      : {}),
    ...(input.afterSeverity != null || input.after_severity != null
      ? { after_severity: input.afterSeverity ?? input.after_severity }
      : {}),
    ...(input.mediaRef != null || input.media_ref != null
      ? { media_ref: input.mediaRef ?? input.media_ref }
      : {}),
    ...(input.payload && typeof input.payload === 'object' ? input.payload : {})
  });

  const stableKey =
    input.stableKey || input.stable_key || `outcome_${gardenTaskId}_${outcome}`;

  return buildIdempotentGardenEventInsert({
    ...input,
    eventType: GARDEN_EVENT_TYPES.TASK_OUTCOME_REPORTED,
    gardenTaskId,
    stableKey,
    payload
  });
}

export function buildFollowupRequestedEventInsert(input = {}) {
  const followupReason = normalizeSpineToken(
    input.followupReason || input.followup_reason || input.reasonCode || input.reason_code
  );
  if (!isGardenFollowupReason(followupReason)) {
    throw new Error(`invalid_followup_reason:${followupReason || 'empty'}`);
  }

  const gardenTaskId = optionalUuidField(input.gardenTaskId, input.garden_task_id);
  const payload = normalizeGardenEventPayload({
    followup_reason: followupReason,
    ...(input.userNote != null || input.user_note != null
      ? { user_note: String(input.userNote ?? input.user_note ?? '').trim() }
      : {}),
    ...(input.payload && typeof input.payload === 'object' ? input.payload : {})
  });

  const stableKey =
    input.stableKey ||
    input.stable_key ||
    `followup_${gardenTaskId || 'garden'}_${followupReason}`;

  return buildIdempotentGardenEventInsert({
    ...input,
    reason: input.emitReason || input.emit_reason || 'user_action',
    explicitMutation: input.explicitMutation !== false,
    eventType: GARDEN_EVENT_TYPES.FOLLOWUP_REQUESTED,
    gardenTaskId,
    stableKey,
    payload
  });
}

export function simulateGardenEventAfterTaskDelete(eventRow = {}) {
  return {
    ...eventRow,
    garden_task_id: null,
    payload: eventRow.payload && typeof eventRow.payload === 'object' ? { ...eventRow.payload } : {}
  };
}

export function normalizeTaskProvenance(input = {}) {
  const rawSource = input.sourceModule ?? input.source_module ?? null;
  const rawType = input.taskType ?? input.task_type ?? null;
  let source_module = null;
  let task_type = null;
  if (rawSource != null && String(rawSource).trim()) {
    const s = normalizeSpineToken(rawSource);
    if (!isGardenSourceModule(s)) throw new Error(`invalid_source_module:${s}`);
    source_module = s;
  }
  if (rawType != null && String(rawType).trim()) {
    const t = normalizeSpineToken(rawType);
    if (!isGardenTaskType(t)) throw new Error(`invalid_task_type:${t}`);
    task_type = t;
  }
  return { source_module, task_type };
}
