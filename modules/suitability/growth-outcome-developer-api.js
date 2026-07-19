/**
 * Cruvit — Growth Outcome Suitability developer API (GOS-3D)
 * ---------------------------------------------------------------------------
 * Stopped, developer/test-only, non-authoritative thin envelope over the
 * pure GOS evaluator. Explicit-call-only; no mutable activation state.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Import defines immutable exports only — no evaluation, globals, or I/O.
 *  - Each call is independently capability-gated; success does not "start" the API.
 *  - No DOM, window registration, storage, fetch, timers, or persistence.
 *  - Does not load pilot JSON, catalog, Climate Suitability v1b, or Sidecar.
 *  - Returns native evaluator results without remapping, merging, or scoring.
 */

import {
  evaluateBiologicalGrowthOutcomes,
  evaluateGrowthOutcomeSuitability,
  GROWTH_OUTCOME_ENGINE_VERSION,
  GROWTH_OUTCOME_GOALS,
  GROWTH_OUTCOME_NAMES
} from './growth-outcome-evaluator.js';

export const GOS_DEVELOPER_API_VERSION = '0.1.0-gos3d';

/** Anti-accident capability token — not authentication. */
export const GOS_DEVELOPER_CAPABILITY = 'explicit_developer_evaluation';

export const GOS_DEVELOPER_MODES = Object.freeze(['biology', 'suitability']);

export const GOS_DEVELOPER_API_REASONS = Object.freeze([
  'developer_capability_required',
  'unsupported_mode',
  'profile_required',
  'invalid_profile',
  'evidence_bundle_required',
  'referenced_evidence_missing',
  'trusted_location_required',
  'valid_user_goal_required',
  'user_goal_not_allowed_in_biology_mode',
  'ok'
]);

function deepFreeze(value, seen) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) deepFreeze(value[i], seen);
  } else {
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) deepFreeze(value[keys[i]], seen);
  }
  return Object.freeze(value);
}

function freezeDeep(value) {
  return deepFreeze(value, new WeakSet());
}

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function buildDescriptor() {
  return freezeDeep({
    apiVersion: GOS_DEVELOPER_API_VERSION,
    engineVersion: GROWTH_OUTCOME_ENGINE_VERSION,
    capability: GOS_DEVELOPER_CAPABILITY,
    activation: 'explicit_call_only',
    authoritative: false,
    runtimeWired: false,
    persistence: false,
    productConsumers: 'none',
    modes: GOS_DEVELOPER_MODES.slice(),
    reasons: GOS_DEVELOPER_API_REASONS.slice()
  });
}

const DESCRIPTOR = buildDescriptor();

/**
 * Immutable descriptor. Safe to call any number of times; never mutates.
 */
export function getGrowthOutcomeDeveloperApiDescriptor() {
  return DESCRIPTOR;
}

function failEnvelope(reason, mode) {
  return freezeDeep({
    ok: false,
    apiStatus: 'blocked',
    reason: reason,
    apiVersion: GOS_DEVELOPER_API_VERSION,
    engineVersion: GROWTH_OUTCOME_ENGINE_VERSION,
    mode: mode == null ? null : mode,
    result: null
  });
}

function successEnvelope(mode, nativeResult) {
  return freezeDeep({
    ok: true,
    apiStatus: 'ok',
    reason: 'ok',
    apiVersion: GOS_DEVELOPER_API_VERSION,
    engineVersion: GROWTH_OUTCOME_ENGINE_VERSION,
    mode: mode,
    result: nativeResult
  });
}

/**
 * Collect evidence IDs referenced by repository-native profile fields only.
 * Does not apply age/region/cultivar applicability — completeness of the
 * supplied bundle only.
 */
function collectReferencedEvidenceIds(profile) {
  const ids = [];
  const seen = new Set();
  function add(id) {
    if (id == null || id === '') return;
    const s = String(id);
    if (seen.has(s)) return;
    seen.add(s);
    ids.push(s);
  }
  function walkRefs(list) {
    asArray(list).forEach(add);
  }

  const outcomes = asObject(profile.outcomes) || {};
  for (let i = 0; i < GROWTH_OUTCOME_NAMES.length; i++) {
    const block = asObject(outcomes[GROWTH_OUTCOME_NAMES[i]]);
    if (!block) continue;
    walkRefs(block.evidenceRefs);
    walkRefs(block.conflictEvidenceRefs);
    const requirements = asArray(block.requirements);
    for (let r = 0; r < requirements.length; r++) {
      const rule = asObject(requirements[r]);
      if (rule) walkRefs(rule.evidenceRefs);
    }
  }
  return ids;
}

function evidenceBundleHasId(evidenceById, evidenceId) {
  if (!evidenceById) return false;
  if (typeof Map !== 'undefined' && evidenceById instanceof Map) {
    return evidenceById.has(evidenceId);
  }
  if (Array.isArray(evidenceById)) {
    for (let i = 0; i < evidenceById.length; i++) {
      const row = evidenceById[i];
      if (row && String(row.evidenceId) === String(evidenceId)) return true;
    }
    return false;
  }
  if (typeof evidenceById === 'object') {
    return Object.prototype.hasOwnProperty.call(evidenceById, evidenceId) &&
      evidenceById[evidenceId] != null;
  }
  return false;
}

function isSupportedEvidenceBundle(evidenceById) {
  if (!evidenceById) return false;
  if (typeof Map !== 'undefined' && evidenceById instanceof Map) return true;
  if (Array.isArray(evidenceById)) return true;
  if (typeof evidenceById === 'object') return true;
  return false;
}

function profileStructurallyUsable(profile) {
  if (!asObject(profile)) return false;
  if (!profile.canonicalSlug || String(profile.canonicalSlug).trim() === '') return false;
  if (!profile.profileVersion || String(profile.profileVersion).trim() === '') return false;
  const outcomes = asObject(profile.outcomes);
  if (!outcomes) return false;
  for (let i = 0; i < GROWTH_OUTCOME_NAMES.length; i++) {
    if (!asObject(outcomes[GROWTH_OUTCOME_NAMES[i]])) return false;
  }
  return true;
}

/**
 * Explicit developer/test evaluation entry. Stateless — does not enable the API.
 *
 * Biology mode: rejects a supplied userGoal (deterministic anti-ambiguity rule).
 * Suitability mode: requires a valid GROWTH_OUTCOME_GOALS value.
 */
export function evaluateGrowthOutcomeForDeveloper(request) {
  const req = asObject(request) || {};

  if (req.capability !== GOS_DEVELOPER_CAPABILITY) {
    return failEnvelope('developer_capability_required', req.mode == null ? null : req.mode);
  }

  const mode = req.mode;
  if (mode !== 'biology' && mode !== 'suitability') {
    return failEnvelope('unsupported_mode', mode == null ? null : mode);
  }

  if (req.profile == null) {
    return failEnvelope('profile_required', mode);
  }
  if (!profileStructurallyUsable(req.profile)) {
    return failEnvelope('invalid_profile', mode);
  }

  if (!isSupportedEvidenceBundle(req.evidenceById)) {
    return failEnvelope('evidence_bundle_required', mode);
  }

  const referenced = collectReferencedEvidenceIds(req.profile);
  for (let i = 0; i < referenced.length; i++) {
    if (!evidenceBundleHasId(req.evidenceById, referenced[i])) {
      return failEnvelope('referenced_evidence_missing', mode);
    }
  }

  const locationClimate = asObject(req.locationClimate);
  if (!locationClimate || locationClimate.trusted !== true) {
    return failEnvelope('trusted_location_required', mode);
  }

  if (mode === 'biology') {
    if (Object.prototype.hasOwnProperty.call(req, 'userGoal') && req.userGoal != null) {
      return failEnvelope('user_goal_not_allowed_in_biology_mode', mode);
    }
  } else {
    if (GROWTH_OUTCOME_GOALS.indexOf(req.userGoal) < 0) {
      return failEnvelope('valid_user_goal_required', mode);
    }
  }

  // Pass through original object references — evaluator does not mutate inputs.
  if (mode === 'biology') {
    const native = evaluateBiologicalGrowthOutcomes({
      profile: req.profile,
      evidenceById: req.evidenceById,
      locationClimate: req.locationClimate,
      gardenContext: req.gardenContext,
      plantContext: req.plantContext
    });
    return successEnvelope(mode, native);
  }

  const native = evaluateGrowthOutcomeSuitability({
    profile: req.profile,
    evidenceById: req.evidenceById,
    locationClimate: req.locationClimate,
    gardenContext: req.gardenContext,
    plantContext: req.plantContext,
    userGoal: req.userGoal
  });
  return successEnvelope(mode, native);
}
