/**
 * Cruvit — Growth Outcome Suitability developer consumer adapter (GOS-5C)
 * ---------------------------------------------------------------------------
 * Stopped, synthetic-only, explicit-call-only request-readiness adapter.
 * Validates a synthetic normalized consumer snapshot and deterministically
 * constructs a developer API request object.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Import defines immutable exports only — no evaluation, globals, or I/O.
 *  - Does NOT import developer API, evaluator, identity, location, or product.
 *  - Does NOT invoke GOS, developer API, or evaluator.
 *  - Does NOT produce biological output.
 *  - Does NOT load pilot JSON, map locationClimate, or read My Garden.
 */

export const GOS_DEVELOPER_CONSUMER_ADAPTER_VERSION = '0.1.0-gos5c';

/** Anti-accident capability token — not authentication. Distinct from API capability. */
export const GOS_DEVELOPER_CONSUMER_ADAPTER_CAPABILITY = 'explicit_synthetic_consumer_adaptation';

/** Local frozen copy of developer API capability for request construction only (no API import). */
const DEVELOPER_API_CAPABILITY_TOKEN = 'explicit_developer_evaluation';

const SNAPSHOT_VERSION = '0.1.0';
const SUPPORTED_CONSUMER = 'my_garden_synthetic_diagnostic';
const LOCATION_CLIMATE_MAPPING_VERSION = '0.1.0-synthetic-fixture';
const LOCATION_CLIMATE_SUPPLIED_BY = 'synthetic_fixture';

/** Exact native GOS goal vocabulary (local frozen copy; no evaluator import). */
const NATIVE_USER_GOALS = Object.freeze([
  'ornamentalFoliage',
  'floweringDisplay',
  'edibleHarvest',
  'reliableHouseholdYield',
  'experimentalGrowing',
  'protectedGrowing',
  'lowMaintenance',
  'containerGrowing'
]);

const SUPPORTED_MODES = Object.freeze(['biology', 'suitability']);

export const GOS_DEVELOPER_CONSUMER_ADAPTER_REASONS = Object.freeze([
  'adapter_capability_required',
  'invalid_snapshot',
  'unsupported_consumer',
  'unresolved_identity',
  'pending_identity',
  'identity_not_authoritative',
  'guessed_required_field',
  'profile_unavailable',
  'profile_version_missing',
  'evidence_unavailable',
  'evidence_version_mismatch',
  'untrusted_location',
  'location_climate_missing',
  'location_climate_mapping_unapproved',
  'mode_missing',
  'invalid_mode',
  'explicit_user_goal_required',
  'invalid_user_goal'
]);

const REASON_RANK = (function () {
  const m = Object.create(null);
  for (let i = 0; i < GOS_DEVELOPER_CONSUMER_ADAPTER_REASONS.length; i++) {
    m[GOS_DEVELOPER_CONSUMER_ADAPTER_REASONS[i]] = i;
  }
  return Object.freeze(m);
})();

const FORBIDDEN_TOP_LEVEL = Object.freeze([
  'outcomes',
  'evaluationStatus',
  'goalFit',
  'recommendedUse',
  'overallConclusion',
  'score',
  'suitabilityScore',
  'v1b',
  'climateSuitability',
  'recommendation',
  'careTasks',
  'purchase',
  'sidecar'
]);

const REQUIRED_TOP_LEVEL = Object.freeze([
  'snapshotVersion',
  'sourceConsumer',
  'sourceRecordId',
  'identity',
  'profileAvailability',
  'evidenceAvailability',
  'location',
  'locationClimate',
  'invocation',
  'provenance'
]);

const PLANT_CONTEXT_KEYS = Object.freeze([
  'ageClass',
  'maturity',
  'cultivar',
  'propagation',
  'phenology',
  'observations',
  'contextTags'
]);

const GARDEN_CONTEXT_KEYS = Object.freeze([
  'growingSystem',
  'containerOrGround',
  'protectedEnvironment',
  'protectedOutdoor',
  'sunExposure',
  'drainage',
  'irrigation',
  'pollinizerAvailable',
  'microclimateKnown',
  'contextTags'
]);

const LOCATION_CLIMATE_REQUEST_KEYS = Object.freeze([
  'trusted',
  'latitude',
  'longitude',
  'regionTags',
  'climateTags',
  'hemisphere',
  'locationConfidence',
  'climateConfidence',
  'structuralFreezingRisk',
  'isFrostFreeGrowingClimate',
  'values',
  'mappingVersion',
  'suppliedBy'
]);

const EXCLUSIONS = Object.freeze([
  'no_product_runtime',
  'no_raw_my_garden_data',
  'no_real_user_data',
  'no_gos_invocation',
  'no_developer_api_invocation',
  'no_evaluator_invocation',
  'no_v1b',
  'no_persistence',
  'no_location_climate_mapping',
  'no_multi_consumer_support',
  'no_biological_output'
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

function asPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function normalizeSlug(v) {
  if (typeof v !== 'string') return '';
  return v.trim().toLowerCase();
}

function sortReasons(reasons) {
  const uniq = [];
  const seen = Object.create(null);
  for (let i = 0; i < reasons.length; i++) {
    const r = reasons[i];
    if (typeof r !== 'string' || !Object.prototype.hasOwnProperty.call(REASON_RANK, r)) continue;
    if (seen[r]) continue;
    seen[r] = true;
    uniq.push(r);
  }
  uniq.sort(function (a, b) {
    return REASON_RANK[a] - REASON_RANK[b];
  });
  return uniq;
}

function sortStrings(arr) {
  return arr.slice().sort();
}

function cloneJson(v) {
  return JSON.parse(JSON.stringify(v));
}

function emptyProvenance() {
  return {
    synthetic: true,
    fixtureId: '',
    authoritativeFields: [],
    unknownFields: []
  };
}

function extractProvenance(snapshot) {
  const p = asPlainObject(snapshot && snapshot.provenance);
  if (!p) return emptyProvenance();
  return {
    synthetic: p.synthetic === true,
    fixtureId: typeof p.fixtureId === 'string' ? p.fixtureId : '',
    authoritativeFields: Array.isArray(p.authoritativeFields) ? p.authoritativeFields.slice() : [],
    unknownFields: Array.isArray(p.unknownFields) ? p.unknownFields.slice() : []
  };
}

function blockedCapability(buildMode) {
  const base = {
    status: 'blocked',
    reasonCodes: ['adapter_capability_required'],
    missingPrerequisites: ['adapterCapability'],
    omittedOptionalInputs: [],
    provenance: null
  };
  if (buildMode) {
    base.request = null;
    base.warnings = [];
  }
  return freezeDeep(base);
}

function blockedInvalidOnly(buildMode) {
  const base = {
    status: 'blocked',
    reasonCodes: ['invalid_snapshot'],
    missingPrerequisites: ['snapshot'],
    omittedOptionalInputs: [],
    provenance: emptyProvenance()
  };
  if (buildMode) {
    base.request = null;
    base.warnings = [];
  }
  return freezeDeep(base);
}

function profileSlugFromAvailability(pa) {
  if (!pa) return '';
  if (isNonEmptyString(pa.canonicalSlug)) return normalizeSlug(pa.canonicalSlug);
  if (isNonEmptyString(pa.profileId)) return normalizeSlug(pa.profileId);
  return '';
}

function sourceImpliesDefaultWesternGalilee(source) {
  const s = String(source || '').trim().toLowerCase();
  if (!s) return true;
  if (s === 'default') return true;
  if (s.indexOf('western galilee') >= 0) return true;
  if (s.indexOf('western_galilee') >= 0) return true;
  if (s === 'default_garden_location') return true;
  return false;
}

function tagsValid(arr) {
  if (!Array.isArray(arr)) return false;
  for (let i = 0; i < arr.length; i++) {
    if (!isNonEmptyString(arr[i])) return false;
  }
  return true;
}

function collectOmittedOptional(snapshot) {
  const omitted = [];
  const pc = asPlainObject(snapshot.plantContext);
  for (let i = 0; i < PLANT_CONTEXT_KEYS.length; i++) {
    const k = PLANT_CONTEXT_KEYS[i];
    if (!pc || pc[k] === undefined || pc[k] === null) {
      omitted.push('plantContext.' + k);
    }
  }
  const gc = asPlainObject(snapshot.gardenContext);
  for (let j = 0; j < GARDEN_CONTEXT_KEYS.length; j++) {
    const gk = GARDEN_CONTEXT_KEYS[j];
    if (!gc || gc[gk] === undefined || gc[gk] === null) {
      omitted.push('gardenContext.' + gk);
    }
  }
  return sortStrings(omitted);
}

function hasUnknownKeys(obj, allowed) {
  if (!obj) return false;
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    if (allowed.indexOf(keys[i]) < 0) return true;
  }
  return false;
}

function copyAllowedContext(src, allowedKeys) {
  if (!src) return null;
  const out = {};
  let any = false;
  for (let i = 0; i < allowedKeys.length; i++) {
    const k = allowedKeys[i];
    if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
    const v = src[k];
    if (v === undefined || v === null) continue;
    out[k] = Array.isArray(v) ? v.slice() : (typeof v === 'object' ? cloneJson(v) : v);
    any = true;
  }
  return any ? out : null;
}

function copyLocationClimate(lc) {
  const out = {};
  for (let i = 0; i < LOCATION_CLIMATE_REQUEST_KEYS.length; i++) {
    const k = LOCATION_CLIMATE_REQUEST_KEYS[i];
    if (!Object.prototype.hasOwnProperty.call(lc, k)) continue;
    const v = lc[k];
    if (v === undefined) continue;
    if (Array.isArray(v)) out[k] = v.slice();
    else if (v && typeof v === 'object') out[k] = cloneJson(v);
    else out[k] = v;
  }
  return out;
}

function missingForReason(reason) {
  switch (reason) {
    case 'adapter_capability_required': return 'adapterCapability';
    case 'invalid_snapshot': return 'snapshot';
    case 'unsupported_consumer': return 'sourceConsumer';
    case 'unresolved_identity': return 'identity.canonicalSlug';
    case 'pending_identity': return 'identity.identityStatus';
    case 'identity_not_authoritative': return 'identity.sourceAuthority';
    case 'guessed_required_field': return 'explicitAuthority';
    case 'profile_unavailable': return 'profileAvailability';
    case 'profile_version_missing': return 'profileAvailability.profileVersion';
    case 'evidence_unavailable': return 'evidenceAvailability';
    case 'evidence_version_mismatch': return 'evidenceAvailability.evidenceDataVersion';
    case 'untrusted_location': return 'location.trusted';
    case 'location_climate_missing': return 'locationClimate';
    case 'location_climate_mapping_unapproved': return 'locationClimate.mappingVersion';
    case 'mode_missing': return 'invocation.mode';
    case 'invalid_mode': return 'invocation.mode';
    case 'explicit_user_goal_required': return 'invocation.userGoal';
    case 'invalid_user_goal': return 'invocation.userGoal';
    default: return reason;
  }
}

function validateSnapshotSemantics(snapshot) {
  const reasons = [];
  const snap = snapshot;

  for (let i = 0; i < FORBIDDEN_TOP_LEVEL.length; i++) {
    if (Object.prototype.hasOwnProperty.call(snap, FORBIDDEN_TOP_LEVEL[i])) {
      reasons.push('invalid_snapshot');
      break;
    }
  }

  for (let r = 0; r < REQUIRED_TOP_LEVEL.length; r++) {
    const key = REQUIRED_TOP_LEVEL[r];
    if (key === 'snapshotVersion' || key === 'sourceConsumer' || key === 'sourceRecordId') {
      if (!isNonEmptyString(snap[key])) reasons.push('invalid_snapshot');
      continue;
    }
    if (!asPlainObject(snap[key])) reasons.push('invalid_snapshot');
  }

  if (snap.snapshotVersion !== SNAPSHOT_VERSION) reasons.push('invalid_snapshot');
  if (snap.sourceConsumer !== SUPPORTED_CONSUMER) reasons.push('unsupported_consumer');
  if (!isNonEmptyString(snap.sourceRecordId)) reasons.push('invalid_snapshot');

  // Identity
  const id = asPlainObject(snap.identity);
  if (!id) {
    reasons.push('invalid_snapshot');
  } else {
    const slug = normalizeSlug(id.canonicalSlug);
    if (!slug) reasons.push('unresolved_identity');
    if (id.identityStatus === 'pending') reasons.push('pending_identity');
    else if (id.identityStatus !== 'resolved') reasons.push('unresolved_identity');
    if (id.sourceAuthority !== 'synthetic_fixture_authoritative') {
      reasons.push('identity_not_authoritative');
    }
    if (id.inferred === true || id.explicitlyProvided !== true) {
      reasons.push('guessed_required_field');
    }
  }

  // Profile availability
  const pa = asPlainObject(snap.profileAvailability);
  if (!pa) {
    reasons.push('invalid_snapshot');
  } else {
    if (pa.available !== true) reasons.push('profile_unavailable');
    if (!isNonEmptyString(pa.profileVersion)) reasons.push('profile_version_missing');
    if (pa.inferred === true || pa.explicitlyProvided !== true) {
      reasons.push('guessed_required_field');
    }
    if (!isNonEmptyString(pa.owner)) reasons.push('invalid_snapshot');
    const paSlug = profileSlugFromAvailability(pa);
    const idSlug = id ? normalizeSlug(id.canonicalSlug) : '';
    if (!paSlug) reasons.push('profile_unavailable');
    else if (idSlug && paSlug !== idSlug) reasons.push('invalid_snapshot');
  }

  // Evidence availability
  const ea = asPlainObject(snap.evidenceAvailability);
  if (!ea) {
    reasons.push('invalid_snapshot');
  } else {
    if (ea.available !== true) reasons.push('evidence_unavailable');
    if (!isNonEmptyString(ea.evidenceDataVersion)) reasons.push('evidence_unavailable');
    if (ea.inferred === true || ea.explicitlyProvided !== true) {
      reasons.push('guessed_required_field');
    }
    if (!isNonEmptyString(ea.owner)) reasons.push('invalid_snapshot');
  }

  // Location
  const loc = asPlainObject(snap.location);
  if (!loc) {
    reasons.push('invalid_snapshot');
  } else {
    if (loc.trusted !== true || loc.confirmationStatus !== 'confirmed') {
      reasons.push('untrusted_location');
    }
    if (!isNonEmptyString(loc.source) || sourceImpliesDefaultWesternGalilee(loc.source)) {
      reasons.push('untrusted_location');
    }
    if (loc.inferred === true || loc.explicitlyProvided !== true) {
      reasons.push('guessed_required_field');
    }
  }

  // locationClimate
  if (!Object.prototype.hasOwnProperty.call(snap, 'locationClimate') || snap.locationClimate == null) {
    reasons.push('location_climate_missing');
  } else {
    const lc = asPlainObject(snap.locationClimate);
    if (!lc) {
      reasons.push('invalid_snapshot');
    } else {
      if (lc.suppliedBy !== LOCATION_CLIMATE_SUPPLIED_BY ||
          lc.mappingVersion !== LOCATION_CLIMATE_MAPPING_VERSION) {
        reasons.push('location_climate_mapping_unapproved');
      }
      if (lc.trusted !== true) reasons.push('untrusted_location');
      const latOk = typeof lc.latitude === 'number' && Number.isFinite(lc.latitude);
      const lonOk = typeof lc.longitude === 'number' && Number.isFinite(lc.longitude);
      const hemiOk = lc.hemisphere === 'northern' || lc.hemisphere === 'southern';
      const tagsOk = tagsValid(lc.regionTags) && tagsValid(lc.climateTags);
      const confOk = isNonEmptyString(lc.locationConfidence) && isNonEmptyString(lc.climateConfidence);
      const valuesOk = asPlainObject(lc.values) !== null;
      if (!latOk || !lonOk || !hemiOk || !tagsOk || !confOk || !valuesOk) {
        reasons.push('invalid_snapshot');
      }
    }
  }

  // Invocation
  const inv = asPlainObject(snap.invocation);
  if (!inv) {
    reasons.push('invalid_snapshot');
  } else {
    if (inv.mode == null || inv.mode === '') reasons.push('mode_missing');
    else if (SUPPORTED_MODES.indexOf(inv.mode) < 0) reasons.push('invalid_mode');
    if (inv.inferred === true || inv.explicitlyProvided !== true) {
      reasons.push('guessed_required_field');
    }
    if (inv.mode === 'biology') {
      if (Object.prototype.hasOwnProperty.call(inv, 'userGoal') && inv.userGoal != null) {
        reasons.push('invalid_user_goal');
      }
    } else if (inv.mode === 'suitability') {
      if (inv.userGoal == null || inv.userGoal === '') {
        reasons.push('explicit_user_goal_required');
      } else if (NATIVE_USER_GOALS.indexOf(inv.userGoal) < 0) {
        reasons.push('invalid_user_goal');
      }
    }
  }

  // Provenance
  const prov = asPlainObject(snap.provenance);
  if (!prov) {
    reasons.push('invalid_snapshot');
  } else {
    if (prov.synthetic !== true) reasons.push('invalid_snapshot');
    if (!isNonEmptyString(prov.fixtureId)) reasons.push('invalid_snapshot');
    if (!Array.isArray(prov.authoritativeFields) || !Array.isArray(prov.unknownFields)) {
      reasons.push('invalid_snapshot');
    }
  }

  // Optional contexts
  if (Object.prototype.hasOwnProperty.call(snap, 'plantContext') && snap.plantContext != null) {
    const pc = asPlainObject(snap.plantContext);
    if (!pc || hasUnknownKeys(pc, PLANT_CONTEXT_KEYS)) reasons.push('invalid_snapshot');
  }
  if (Object.prototype.hasOwnProperty.call(snap, 'gardenContext') && snap.gardenContext != null) {
    const gc = asPlainObject(snap.gardenContext);
    if (!gc || hasUnknownKeys(gc, GARDEN_CONTEXT_KEYS)) reasons.push('invalid_snapshot');
  }

  return sortReasons(reasons);
}

function runValidation(snapshot, options, buildMode) {
  const opts = asPlainObject(options) || {};
  if (opts.capability !== GOS_DEVELOPER_CONSUMER_ADAPTER_CAPABILITY) {
    return blockedCapability(buildMode);
  }

  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return blockedInvalidOnly(buildMode);
  }

  const reasons = validateSnapshotSemantics(snapshot);
  const omitted = collectOmittedOptional(snapshot);
  const provenance = extractProvenance(snapshot);
  const missing = sortStrings(reasons.map(missingForReason));

  if (reasons.length) {
    const blocked = {
      status: 'blocked',
      reasonCodes: reasons,
      missingPrerequisites: missing,
      omittedOptionalInputs: omitted,
      provenance: provenance
    };
    if (buildMode) {
      blocked.request = null;
      blocked.warnings = [];
    }
    return freezeDeep(blocked);
  }

  const ready = {
    status: 'ready',
    reasonCodes: [],
    missingPrerequisites: [],
    omittedOptionalInputs: omitted,
    provenance: provenance
  };
  if (buildMode) {
    ready.warnings = [];
  }
  return freezeDeep(ready);
}

function evidenceBundleUsable(evidenceById) {
  if (!evidenceById) return false;
  if (typeof Map !== 'undefined' && evidenceById instanceof Map) return evidenceById.size > 0;
  if (Array.isArray(evidenceById)) return evidenceById.length > 0;
  return asPlainObject(evidenceById) !== null && Object.keys(evidenceById).length > 0;
}

function buildRequest(snapshot, options) {
  const validation = runValidation(snapshot, options, true);
  if (validation.status !== 'ready') return validation;

  const opts = asPlainObject(options) || {};
  const reasons = [];
  const profile = asPlainObject(opts.profile);
  const evidenceById = opts.evidenceById;
  const idSlug = normalizeSlug(snapshot.identity.canonicalSlug);
  const paVersion = String(snapshot.profileAvailability.profileVersion || '');
  const eaVersion = String(snapshot.evidenceAvailability.evidenceDataVersion || '');

  if (!profile) reasons.push('profile_unavailable');
  else {
    if (normalizeSlug(profile.canonicalSlug) !== idSlug) reasons.push('profile_unavailable');
    if (String(profile.profileVersion || '') !== paVersion) reasons.push('profile_version_missing');
  }

  if (!evidenceBundleUsable(evidenceById)) reasons.push('evidence_unavailable');
  const suppliedEvidenceVersion = isNonEmptyString(opts.evidenceDataVersion)
    ? String(opts.evidenceDataVersion)
    : null;
  if (suppliedEvidenceVersion != null && suppliedEvidenceVersion !== eaVersion) {
    reasons.push('evidence_version_mismatch');
  }
  if (suppliedEvidenceVersion == null) {
    // Require explicit evidenceDataVersion option for deterministic version check.
    reasons.push('evidence_version_mismatch');
  }

  if (reasons.length) {
    const sorted = sortReasons(reasons);
    return freezeDeep({
      status: 'blocked',
      request: null,
      reasonCodes: sorted,
      missingPrerequisites: sortStrings(sorted.map(missingForReason)),
      omittedOptionalInputs: collectOmittedOptional(snapshot),
      warnings: [],
      provenance: extractProvenance(snapshot)
    });
  }

  const request = {
    capability: DEVELOPER_API_CAPABILITY_TOKEN,
    mode: snapshot.invocation.mode,
    profile: profile,
    evidenceById: evidenceById,
    locationClimate: copyLocationClimate(snapshot.locationClimate)
  };

  const plantContext = copyAllowedContext(asPlainObject(snapshot.plantContext), PLANT_CONTEXT_KEYS);
  if (plantContext) request.plantContext = plantContext;
  const gardenContext = copyAllowedContext(asPlainObject(snapshot.gardenContext), GARDEN_CONTEXT_KEYS);
  if (gardenContext) request.gardenContext = gardenContext;

  if (snapshot.invocation.mode === 'suitability') {
    request.userGoal = snapshot.invocation.userGoal;
  }

  return freezeDeep({
    status: 'ready',
    request: request,
    warnings: [],
    omittedOptionalInputs: collectOmittedOptional(snapshot),
    provenance: extractProvenance(snapshot),
    reasonCodes: [],
    missingPrerequisites: []
  });
}

function buildDescriptor() {
  return freezeDeep({
    adapterVersion: GOS_DEVELOPER_CONSUMER_ADAPTER_VERSION,
    status: 'stopped',
    developerOnly: true,
    syntheticOnly: true,
    authoritative: false,
    persistence: false,
    productConsumer: false,
    invokesGOS: false,
    activation: 'explicit_call_only',
    supportedConsumer: SUPPORTED_CONSUMER,
    supportedModes: SUPPORTED_MODES.slice(),
    requiredCapability: GOS_DEVELOPER_CONSUMER_ADAPTER_CAPABILITY,
    snapshotVersion: SNAPSHOT_VERSION,
    reasons: GOS_DEVELOPER_CONSUMER_ADAPTER_REASONS.slice(),
    exclusions: EXCLUSIONS.slice(),
    developerApiCapabilityToken: DEVELOPER_API_CAPABILITY_TOKEN,
    nativeUserGoals: NATIVE_USER_GOALS.slice(),
    locationClimateMappingVersion: LOCATION_CLIMATE_MAPPING_VERSION,
    locationClimateSuppliedBy: LOCATION_CLIMATE_SUPPLIED_BY
  });
}

const DESCRIPTOR = buildDescriptor();

/**
 * Immutable descriptor. Safe to call any number of times; never mutates.
 */
export function describeGrowthOutcomeConsumerAdapter() {
  return DESCRIPTOR;
}

/**
 * Stage A — validate synthetic consumer snapshot. No GOS/API/evaluator invocation.
 */
export function validateSyntheticConsumerSnapshot(snapshot, options) {
  return runValidation(snapshot, options, false);
}

/**
 * Stage A + B — validate and construct developer API request. No GOS/API/evaluator invocation.
 */
export function buildGrowthOutcomeDeveloperRequestFromSyntheticSnapshot(snapshot, options) {
  return buildRequest(snapshot, options);
}
