/**
 * Cruvit — Growth Outcome Suitability developer locationClimate mapper (GOS-5G)
 * ---------------------------------------------------------------------------
 * Stopped, synthetic-only, explicit-call-only locationClimate mapper.
 * Validates synthetic mapping inputs + options-supplied synthetic tables and
 * constructs a complete locationClimate only when ready.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Import defines immutable exports only — no evaluation, globals, or I/O.
 *  - Does NOT import adapter, developer API, evaluator, identity, location, or product.
 *  - Does NOT invoke GOS, v1b, weather, or network.
 *  - Does NOT read product location or gardenLocation.
 *  - Does NOT persist output.
 */

export const GOS_DEVELOPER_LOCATION_CLIMATE_MAPPER_VERSION = '0.1.0-gos5g';

/** Anti-accident capability token — not authentication. */
export const GOS_DEVELOPER_LOCATION_CLIMATE_MAPPER_CAPABILITY =
  'explicit_synthetic_location_climate_mapping';

export const GOS_DEVELOPER_LOCATION_CLIMATE_MAPPER_REASONS = Object.freeze([
  'mapper_capability_required',
  'invalid_mapping_input',
  'invalid_mapping_table',
  'untrusted_location',
  'missing_coordinates',
  'invalid_coordinates',
  'equator_policy_unavailable',
  'mapping_version_unavailable',
  'source_version_mismatch',
  'country_unresolved',
  'unsupported_region',
  'region_mapping_unavailable',
  'ambiguous_region_mapping',
  'climate_mapping_unavailable',
  'ambiguous_climate_mapping',
  'conflicting_climate_signals',
  'stale_climate_source',
  'insufficient_product_location_data',
  'location_fingerprint_mismatch'
]);

const REASON_RANK = (function () {
  const m = Object.create(null);
  for (let i = 0; i < GOS_DEVELOPER_LOCATION_CLIMATE_MAPPER_REASONS.length; i++) {
    m[GOS_DEVELOPER_LOCATION_CLIMATE_MAPPER_REASONS[i]] = i;
  }
  return Object.freeze(m);
})();

const PREREQ_MAP = Object.freeze({
  mapper_capability_required: 'mapperCapability',
  invalid_mapping_input: 'mappingInput',
  invalid_mapping_table: 'mappingTables',
  untrusted_location: 'trustedLocation',
  missing_coordinates: 'coordinates',
  invalid_coordinates: 'validCoordinates',
  equator_policy_unavailable: 'hemispherePolicy',
  mapping_version_unavailable: 'mappingVersion',
  source_version_mismatch: 'sourceVersions',
  country_unresolved: 'countryCode',
  unsupported_region: 'supportedSyntheticRegion',
  region_mapping_unavailable: 'regionMapping',
  ambiguous_region_mapping: 'unambiguousRegionMapping',
  climate_mapping_unavailable: 'climateMapping',
  ambiguous_climate_mapping: 'unambiguousClimateMapping',
  conflicting_climate_signals: 'consistentClimateSignals',
  stale_climate_source: 'freshLongTermClimateSource',
  insufficient_product_location_data: 'sufficientLocationData',
  location_fingerprint_mismatch: 'validLocationFingerprint'
});

const SUPPORTED_INPUT_VERSION = '0.1.0';
const SUPPORTED_MAPPING_VERSION = '0.1.0-synthetic-map';
const SUPPORTED_REGION_TABLE_VERSION = '0.1.0-synthetic-region';
const SUPPORTED_CLIMATE_TABLE_VERSION = '0.1.0-synthetic-climate';
const SUPPORTED_NORMALS_VERSION = '0.1.0-synthetic-normals';
const SUPPLIED_BY = 'developer_synthetic_location_climate_mapper';

const CONFIDENCE_VOCAB = Object.freeze({
  default: true,
  low: true,
  medium: true,
  high: true
});

const INPUT_ALLOWED_KEYS = Object.freeze([
  'mappingInputVersion',
  'trusted',
  'latitude',
  'longitude',
  'source',
  'confirmationStatus',
  'locationConfidence',
  'climateConfidence',
  'countryCode',
  'subdivisionCode',
  'city',
  'inputToken',
  'climateNormalsClass',
  'locationFingerprint',
  'climateNormalsVersion',
  'weatherSnapshotVersion',
  'longTermSignals',
  'forecastSignals',
  'provenance'
]);

const OPTIONS_ALLOWED_KEYS = Object.freeze([
  'capability',
  'regionTable',
  'climateTable',
  'mappingVersion'
]);

const REGION_TABLE_KEYS = Object.freeze([
  'tableVersion',
  'syntheticOnly',
  'supportedInputTokens',
  'rules'
]);

const CLIMATE_TABLE_KEYS = Object.freeze([
  'tableVersion',
  'syntheticOnly',
  'rules'
]);

const REGION_RULE_KEYS = Object.freeze([
  'ruleId',
  'syntheticOnly',
  'match',
  'output',
  'provenance',
  'priority'
]);

const CLIMATE_RULE_KEYS = Object.freeze([
  'ruleId',
  'syntheticOnly',
  'match',
  'output',
  'provenance',
  'priority'
]);

const REGION_MATCH_KEYS = Object.freeze(['inputToken', 'countryCode', 'subdivisionCode']);
const REGION_OUTPUT_KEYS = Object.freeze(['regionTags']);
const CLIMATE_MATCH_KEYS = Object.freeze(['climateNormalsClass', 'longTermSignals']);
const CLIMATE_OUTPUT_KEYS = Object.freeze(['climateTags', 'values']);

const EXCLUSIONS = Object.freeze([
  'no_product_location',
  'no_real_regions',
  'no_gos',
  'no_v1b',
  'no_adapter',
  'no_product_consumer',
  'no_persistence',
  'no_network',
  'no_microclimate_inference',
  'no_partial_ready_output'
]);

const STATUSES = Object.freeze(['ready', 'blocked', 'insufficient']);

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

function trimStr(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function hasUnknownKeys(obj, allowed) {
  const keys = Object.keys(obj);
  const allow = Object.create(null);
  for (let i = 0; i < allowed.length; i++) allow[allowed[i]] = true;
  for (let i = 0; i < keys.length; i++) {
    if (!allow[keys[i]]) return true;
  }
  return false;
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

function missingForReasons(reasons) {
  const out = [];
  const seen = Object.create(null);
  for (let i = 0; i < reasons.length; i++) {
    const p = PREREQ_MAP[reasons[i]];
    if (!p || seen[p]) continue;
    seen[p] = true;
    out.push(p);
  }
  return out;
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function isAllowedSignalValue(v) {
  if (typeof v === 'string') return true;
  if (typeof v === 'boolean') return true;
  if (typeof v === 'number' && Number.isFinite(v)) return true;
  return false;
}

function validateLongTermSignals(signals) {
  const obj = asPlainObject(signals);
  if (!obj) return { ok: false };
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (!isNonEmptyString(k)) return { ok: false };
    if (!isAllowedSignalValue(obj[k])) return { ok: false };
  }
  return { ok: true, value: obj };
}

function canonicalValue(v) {
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '"__nonfinite__"';
    return String(v);
  }
  if (Array.isArray(v)) {
    const parts = [];
    for (let i = 0; i < v.length; i++) parts.push(canonicalValue(v[i]));
    return '[' + parts.join(',') + ']';
  }
  if (asPlainObject(v)) {
    const keys = Object.keys(v).sort();
    const parts = [];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (v[k] === undefined) continue;
      parts.push(JSON.stringify(k) + ':' + canonicalValue(v[k]));
    }
    return '{' + parts.join(',') + '}';
  }
  return '"__unsupported__"';
}

function canonicalString(v) {
  return canonicalValue(v);
}

function sortedTagCopy(tags) {
  return tags.slice().map(function (t) { return String(t); }).sort();
}

function copyScalarObject(obj) {
  const out = {};
  const keys = Object.keys(obj).sort();
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const v = obj[k];
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function cloneProvenance(p) {
  const o = asPlainObject(p) || {};
  return copyScalarObject(o);
}

function statusForReasons(reasons) {
  if (!reasons.length) return 'ready';
  const insufficient = Object.create(null);
  insufficient.equator_policy_unavailable = true;
  insufficient.country_unresolved = true;
  insufficient.unsupported_region = true;
  insufficient.region_mapping_unavailable = true;
  insufficient.climate_mapping_unavailable = true;
  insufficient.insufficient_product_location_data = true;
  for (let i = 0; i < reasons.length; i++) {
    if (!insufficient[reasons[i]]) return 'blocked';
  }
  return 'insufficient';
}

function emptySourceVersions() {
  return {
    mappingInputVersion: null,
    mapperVersion: GOS_DEVELOPER_LOCATION_CLIMATE_MAPPER_VERSION,
    mappingVersion: null,
    regionTableVersion: null,
    climateTableVersion: null,
    climateNormalsVersion: null
  };
}

function buildCapabilityBlocked() {
  return freezeDeep({
    status: 'blocked',
    reasonCodes: ['mapper_capability_required'],
    missingPrerequisites: ['mapperCapability'],
    locationClimate: null,
    mappingVersion: null,
    inputFingerprint: null,
    sourceVersions: emptySourceVersions(),
    warnings: [],
    provenance: {}
  });
}

function buildInvalidInputOnly() {
  return freezeDeep({
    status: 'blocked',
    reasonCodes: ['invalid_mapping_input'],
    missingPrerequisites: ['mappingInput'],
    locationClimate: null,
    mappingVersion: null,
    inputFingerprint: null,
    sourceVersions: emptySourceVersions(),
    warnings: [],
    provenance: {}
  });
}

function computeBaseFingerprint(fields) {
  const payload = {
    mappingInputVersion: fields.mappingInputVersion,
    trusted: fields.trusted,
    latitude: fields.latitude,
    longitude: fields.longitude,
    source: fields.source,
    confirmationStatus: fields.confirmationStatus,
    locationConfidence: fields.locationConfidence,
    countryCode: fields.countryCode
  };
  if (fields.subdivisionCode != null && fields.subdivisionCode !== '') {
    payload.subdivisionCode = fields.subdivisionCode;
  }
  if (fields.city != null && fields.city !== '') {
    payload.city = fields.city;
  }
  return canonicalString(payload);
}

function computeFullFingerprint(fields, regionTableVersion, climateTableVersion, mappingVersion) {
  const payload = {
    mappingInputVersion: fields.mappingInputVersion,
    trusted: fields.trusted,
    latitude: fields.latitude,
    longitude: fields.longitude,
    source: fields.source,
    confirmationStatus: fields.confirmationStatus,
    locationConfidence: fields.locationConfidence,
    countryCode: fields.countryCode,
    inputToken: fields.inputToken,
    climateNormalsClass: fields.climateNormalsClass,
    climateNormalsVersion: fields.climateNormalsVersion,
    longTermSignals: copyScalarObject(fields.longTermSignals),
    regionTableVersion: regionTableVersion,
    climateTableVersion: climateTableVersion,
    mappingVersion: mappingVersion
  };
  if (fields.subdivisionCode != null && fields.subdivisionCode !== '') {
    payload.subdivisionCode = fields.subdivisionCode;
  }
  if (fields.city != null && fields.city !== '') {
    payload.city = fields.city;
  }
  if (fields.climateConfidence != null) {
    payload.climateConfidence = fields.climateConfidence;
  }
  return canonicalString(payload);
}

function validateRegionTable(table) {
  const t = asPlainObject(table);
  if (!t) return { ok: false, reason: 'invalid_mapping_table' };
  if (hasUnknownKeys(t, REGION_TABLE_KEYS)) return { ok: false, reason: 'invalid_mapping_table' };
  if (t.tableVersion !== SUPPORTED_REGION_TABLE_VERSION) {
    return { ok: false, reason: 'source_version_mismatch', versionIssue: true };
  }
  if (t.syntheticOnly !== true) return { ok: false, reason: 'invalid_mapping_table' };
  if (!Array.isArray(t.supportedInputTokens) || !t.supportedInputTokens.length) {
    return { ok: false, reason: 'invalid_mapping_table' };
  }
  const seenTok = Object.create(null);
  for (let i = 0; i < t.supportedInputTokens.length; i++) {
    const tok = t.supportedInputTokens[i];
    if (!isNonEmptyString(tok)) return { ok: false, reason: 'invalid_mapping_table' };
    const key = trimStr(tok);
    if (seenTok[key]) return { ok: false, reason: 'invalid_mapping_table' };
    seenTok[key] = true;
  }
  if (!Array.isArray(t.rules)) return { ok: false, reason: 'invalid_mapping_table' };
  for (let i = 0; i < t.rules.length; i++) {
    const rule = asPlainObject(t.rules[i]);
    if (!rule) return { ok: false, reason: 'invalid_mapping_table' };
    if (hasUnknownKeys(rule, REGION_RULE_KEYS)) return { ok: false, reason: 'invalid_mapping_table' };
    if (!isNonEmptyString(rule.ruleId)) return { ok: false, reason: 'invalid_mapping_table' };
    if (rule.syntheticOnly !== true) return { ok: false, reason: 'invalid_mapping_table' };
    const match = asPlainObject(rule.match);
    const output = asPlainObject(rule.output);
    if (!match || !output) return { ok: false, reason: 'invalid_mapping_table' };
    if (hasUnknownKeys(match, REGION_MATCH_KEYS)) return { ok: false, reason: 'invalid_mapping_table' };
    if (hasUnknownKeys(output, REGION_OUTPUT_KEYS)) return { ok: false, reason: 'invalid_mapping_table' };
    if (!isNonEmptyString(match.inputToken)) return { ok: false, reason: 'invalid_mapping_table' };
    if (match.countryCode != null && !isNonEmptyString(match.countryCode)) {
      return { ok: false, reason: 'invalid_mapping_table' };
    }
    if (match.subdivisionCode != null && !isNonEmptyString(match.subdivisionCode)) {
      return { ok: false, reason: 'invalid_mapping_table' };
    }
    if (!Array.isArray(output.regionTags) || !output.regionTags.length) {
      return { ok: false, reason: 'invalid_mapping_table' };
    }
    for (let j = 0; j < output.regionTags.length; j++) {
      if (!isNonEmptyString(output.regionTags[j])) return { ok: false, reason: 'invalid_mapping_table' };
    }
    if (rule.provenance != null && !asPlainObject(rule.provenance)) {
      return { ok: false, reason: 'invalid_mapping_table' };
    }
  }
  return {
    ok: true,
    table: t,
    supportedSet: seenTok,
    tableVersion: t.tableVersion
  };
}

function validateClimateTable(table) {
  const t = asPlainObject(table);
  if (!t) return { ok: false, reason: 'invalid_mapping_table' };
  if (hasUnknownKeys(t, CLIMATE_TABLE_KEYS)) return { ok: false, reason: 'invalid_mapping_table' };
  if (t.tableVersion !== SUPPORTED_CLIMATE_TABLE_VERSION) {
    return { ok: false, reason: 'source_version_mismatch', versionIssue: true };
  }
  if (t.syntheticOnly !== true) return { ok: false, reason: 'invalid_mapping_table' };
  if (!Array.isArray(t.rules)) return { ok: false, reason: 'invalid_mapping_table' };
  for (let i = 0; i < t.rules.length; i++) {
    const rule = asPlainObject(t.rules[i]);
    if (!rule) return { ok: false, reason: 'invalid_mapping_table' };
    if (hasUnknownKeys(rule, CLIMATE_RULE_KEYS)) return { ok: false, reason: 'invalid_mapping_table' };
    if (!isNonEmptyString(rule.ruleId)) return { ok: false, reason: 'invalid_mapping_table' };
    if (rule.syntheticOnly !== true) return { ok: false, reason: 'invalid_mapping_table' };
    const match = asPlainObject(rule.match);
    const output = asPlainObject(rule.output);
    if (!match || !output) return { ok: false, reason: 'invalid_mapping_table' };
    if (hasUnknownKeys(match, CLIMATE_MATCH_KEYS)) return { ok: false, reason: 'invalid_mapping_table' };
    if (hasUnknownKeys(output, CLIMATE_OUTPUT_KEYS)) return { ok: false, reason: 'invalid_mapping_table' };
    if (!isNonEmptyString(match.climateNormalsClass)) return { ok: false, reason: 'invalid_mapping_table' };
    if (match.longTermSignals != null) {
      const sig = asPlainObject(match.longTermSignals);
      if (!sig) return { ok: false, reason: 'invalid_mapping_table' };
      const sk = Object.keys(sig);
      for (let j = 0; j < sk.length; j++) {
        if (!isNonEmptyString(sk[j]) || !isAllowedSignalValue(sig[sk[j]])) {
          return { ok: false, reason: 'invalid_mapping_table' };
        }
      }
    }
    if (!Array.isArray(output.climateTags) || !output.climateTags.length) {
      return { ok: false, reason: 'invalid_mapping_table' };
    }
    for (let j = 0; j < output.climateTags.length; j++) {
      if (!isNonEmptyString(output.climateTags[j])) return { ok: false, reason: 'invalid_mapping_table' };
    }
    if (output.values != null) {
      const vals = asPlainObject(output.values);
      if (!vals) return { ok: false, reason: 'invalid_mapping_table' };
      const vk = Object.keys(vals);
      for (let j = 0; j < vk.length; j++) {
        if (!isNonEmptyString(vk[j]) || !isAllowedSignalValue(vals[vk[j]])) {
          return { ok: false, reason: 'invalid_mapping_table' };
        }
      }
    }
    if (rule.provenance != null && !asPlainObject(rule.provenance)) {
      return { ok: false, reason: 'invalid_mapping_table' };
    }
  }
  return { ok: true, table: t, tableVersion: t.tableVersion };
}

function matchRegionRules(table, fields) {
  const matches = [];
  for (let i = 0; i < table.rules.length; i++) {
    const rule = table.rules[i];
    const match = rule.match;
    if (trimStr(match.inputToken) !== fields.inputToken) continue;
    if (match.countryCode != null && trimStr(match.countryCode) !== fields.countryCode) continue;
    if (match.subdivisionCode != null) {
      if (fields.subdivisionCode == null || trimStr(match.subdivisionCode) !== fields.subdivisionCode) {
        continue;
      }
    }
    matches.push(rule);
  }
  return matches;
}

function matchClimateRules(table, fields) {
  const matches = [];
  for (let i = 0; i < table.rules.length; i++) {
    const rule = table.rules[i];
    const match = rule.match;
    if (trimStr(match.climateNormalsClass) !== fields.climateNormalsClass) continue;
    if (match.longTermSignals != null) {
      const need = match.longTermSignals;
      const keys = Object.keys(need);
      let ok = true;
      for (let j = 0; j < keys.length; j++) {
        const k = keys[j];
        if (!Object.prototype.hasOwnProperty.call(fields.longTermSignals, k)) {
          ok = false;
          break;
        }
        if (fields.longTermSignals[k] !== need[k]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
    }
    matches.push(rule);
  }
  return matches;
}

function climateOutputCanonical(output) {
  const tags = sortedTagCopy(output.climateTags);
  const payload = { climateTags: tags };
  if (output.values != null) payload.values = copyScalarObject(output.values);
  return canonicalString(payload);
}

function extractWarnings(fields) {
  const warnings = [];
  const forecast = asPlainObject(fields.forecastSignals);
  if (forecast && forecast.stale === true) {
    warnings.push('stale_forecast_ignored_for_tags');
  }
  return warnings;
}

function runMapping(input, options, buildMode) {
  const opts = asPlainObject(options) || {};
  if (opts.capability !== GOS_DEVELOPER_LOCATION_CLIMATE_MAPPER_CAPABILITY) {
    return buildCapabilityBlocked();
  }

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return buildInvalidInputOnly();
  }

  if (hasUnknownKeys(opts, OPTIONS_ALLOWED_KEYS)) {
    return freezeDeep({
      status: 'blocked',
      reasonCodes: ['invalid_mapping_input'],
      missingPrerequisites: ['mappingInput'],
      locationClimate: null,
      mappingVersion: null,
      inputFingerprint: null,
      sourceVersions: emptySourceVersions(),
      warnings: [],
      provenance: {}
    });
  }

  if (hasUnknownKeys(input, INPUT_ALLOWED_KEYS)) {
    return freezeDeep({
      status: 'blocked',
      reasonCodes: ['invalid_mapping_input'],
      missingPrerequisites: ['mappingInput'],
      locationClimate: null,
      mappingVersion: null,
      inputFingerprint: null,
      sourceVersions: emptySourceVersions(),
      warnings: [],
      provenance: cloneProvenance(input.provenance)
    });
  }

  const reasons = [];
  const sourceVersions = emptySourceVersions();

  // Required string/object presence
  const requiredStrings = [
    'mappingInputVersion',
    'source',
    'confirmationStatus',
    'locationConfidence',
    'countryCode',
    'inputToken',
    'climateNormalsClass',
    'locationFingerprint',
    'climateNormalsVersion'
  ];
  for (let i = 0; i < requiredStrings.length; i++) {
    if (!isNonEmptyString(input[requiredStrings[i]])) {
      reasons.push('invalid_mapping_input');
      break;
    }
  }
  if (!asPlainObject(input.provenance)) reasons.push('invalid_mapping_input');
  const signalsCheck = validateLongTermSignals(input.longTermSignals);
  if (!signalsCheck.ok) reasons.push('invalid_mapping_input');

  if (typeof input.trusted !== 'boolean') reasons.push('invalid_mapping_input');

  if (input.climateConfidence != null) {
    if (typeof input.climateConfidence !== 'string' || !CONFIDENCE_VOCAB[trimStr(input.climateConfidence)]) {
      reasons.push('invalid_mapping_input');
    }
  }
  if (input.locationConfidence != null && typeof input.locationConfidence === 'string') {
    if (!CONFIDENCE_VOCAB[trimStr(input.locationConfidence)]) {
      reasons.push('invalid_mapping_input');
    }
  }

  if (input.subdivisionCode != null && typeof input.subdivisionCode === 'string' &&
      input.subdivisionCode.length > 0 && !isNonEmptyString(input.subdivisionCode)) {
    reasons.push('invalid_mapping_input');
  }
  if (input.city != null && typeof input.city === 'string' &&
      input.city.length > 0 && !isNonEmptyString(input.city)) {
    reasons.push('invalid_mapping_input');
  }

  const mappingVersionRaw = opts.mappingVersion;
  if (mappingVersionRaw == null || mappingVersionRaw === '') {
    reasons.push('mapping_version_unavailable');
  } else if (typeof mappingVersionRaw !== 'string' || trimStr(mappingVersionRaw) !== SUPPORTED_MAPPING_VERSION) {
    reasons.push('mapping_version_unavailable');
  }

  const regionCheck = validateRegionTable(opts.regionTable);
  const climateCheck = validateClimateTable(opts.climateTable);
  if (!regionCheck.ok) {
    reasons.push(regionCheck.reason === 'source_version_mismatch'
      ? 'source_version_mismatch'
      : 'invalid_mapping_table');
  }
  if (!climateCheck.ok) {
    reasons.push(climateCheck.reason === 'source_version_mismatch'
      ? 'source_version_mismatch'
      : 'invalid_mapping_table');
  }

  // If tables malformed (not merely version), stop before semantic matching
  if ((regionCheck.ok === false && !regionCheck.versionIssue) ||
      (climateCheck.ok === false && !climateCheck.versionIssue) ||
      reasons.indexOf('invalid_mapping_input') >= 0) {
    const sortedEarly = sortReasons(reasons.length ? reasons : ['invalid_mapping_input']);
    return freezeDeep({
      status: statusForReasons(sortedEarly),
      reasonCodes: sortedEarly,
      missingPrerequisites: missingForReasons(sortedEarly),
      locationClimate: null,
      mappingVersion: typeof mappingVersionRaw === 'string' ? trimStr(mappingVersionRaw) || null : null,
      inputFingerprint: null,
      sourceVersions: sourceVersions,
      warnings: [],
      provenance: cloneProvenance(input.provenance)
    });
  }

  const fields = {
    mappingInputVersion: trimStr(input.mappingInputVersion),
    trusted: input.trusted === true,
    latitude: input.latitude,
    longitude: input.longitude,
    source: trimStr(input.source),
    confirmationStatus: trimStr(input.confirmationStatus),
    locationConfidence: trimStr(input.locationConfidence),
    climateConfidence: input.climateConfidence != null ? trimStr(input.climateConfidence) : null,
    countryCode: trimStr(input.countryCode),
    subdivisionCode: input.subdivisionCode != null && isNonEmptyString(input.subdivisionCode)
      ? trimStr(input.subdivisionCode)
      : null,
    city: input.city != null && isNonEmptyString(input.city) ? trimStr(input.city) : null,
    inputToken: trimStr(input.inputToken),
    climateNormalsClass: trimStr(input.climateNormalsClass),
    locationFingerprint: trimStr(input.locationFingerprint),
    climateNormalsVersion: trimStr(input.climateNormalsVersion),
    weatherSnapshotVersion: input.weatherSnapshotVersion != null && isNonEmptyString(input.weatherSnapshotVersion)
      ? trimStr(input.weatherSnapshotVersion)
      : null,
    longTermSignals: signalsCheck.ok ? signalsCheck.value : {},
    forecastSignals: asPlainObject(input.forecastSignals),
    provenance: asPlainObject(input.provenance) || {}
  };

  sourceVersions.mappingInputVersion = fields.mappingInputVersion;
  sourceVersions.mappingVersion = typeof mappingVersionRaw === 'string' ? trimStr(mappingVersionRaw) : null;
  sourceVersions.regionTableVersion = regionCheck.ok ? regionCheck.tableVersion : null;
  sourceVersions.climateTableVersion = climateCheck.ok ? climateCheck.tableVersion : null;
  sourceVersions.climateNormalsVersion = fields.climateNormalsVersion;

  if (fields.mappingInputVersion !== SUPPORTED_INPUT_VERSION) {
    reasons.push('source_version_mismatch');
  }
  if (fields.climateNormalsVersion !== SUPPORTED_NORMALS_VERSION) {
    reasons.push('source_version_mismatch');
  }

  // Trust
  if (fields.trusted !== true ||
      !fields.source ||
      fields.source === 'default' ||
      fields.confirmationStatus !== 'confirmed' ||
      fields.locationConfidence === 'default') {
    reasons.push('untrusted_location');
  }

  // Coordinates
  const latMissing = input.latitude == null || input.latitude === '';
  const lonMissing = input.longitude == null || input.longitude === '';
  if (latMissing || lonMissing) {
    reasons.push('missing_coordinates');
  } else if (!isFiniteNumber(input.latitude) || !isFiniteNumber(input.longitude)) {
    reasons.push('invalid_coordinates');
  } else if (input.latitude < -90 || input.latitude > 90 ||
             input.longitude < -180 || input.longitude > 180) {
    reasons.push('invalid_coordinates');
  } else {
    fields.latitude = input.latitude;
    fields.longitude = input.longitude;
  }

  let hemisphere = null;
  if (reasons.indexOf('missing_coordinates') < 0 && reasons.indexOf('invalid_coordinates') < 0) {
    if (fields.latitude === 0) {
      reasons.push('equator_policy_unavailable');
    } else if (fields.latitude > 0) {
      hemisphere = 'northern';
    } else {
      hemisphere = 'southern';
    }
  }

  // Base fingerprint when structurally possible
  let baseFp = null;
  const canBaseFp =
    reasons.indexOf('invalid_mapping_input') < 0 &&
    reasons.indexOf('missing_coordinates') < 0 &&
    reasons.indexOf('invalid_coordinates') < 0 &&
    isFiniteNumber(fields.latitude) &&
    isFiniteNumber(fields.longitude) &&
    fields.mappingInputVersion &&
    fields.source &&
    fields.confirmationStatus &&
    fields.locationConfidence &&
    fields.countryCode;

  if (canBaseFp) {
    baseFp = computeBaseFingerprint(fields);
    if (fields.locationFingerprint !== baseFp) {
      reasons.push('location_fingerprint_mismatch');
    }
  }

  // Semantic region/climate only if tables ok and coords/trust path not equator-blocked for mapping
  let regionTags = null;
  let climateTags = null;
  let climateValues = null;

  const tablesOk = regionCheck.ok && climateCheck.ok;
  const mappingVersionOk = sourceVersions.mappingVersion === SUPPORTED_MAPPING_VERSION;
  const canSemantic =
    tablesOk &&
    mappingVersionOk &&
    reasons.indexOf('invalid_mapping_input') < 0 &&
    reasons.indexOf('invalid_mapping_table') < 0 &&
    reasons.indexOf('source_version_mismatch') < 0 &&
    reasons.indexOf('mapping_version_unavailable') < 0 &&
    reasons.indexOf('missing_coordinates') < 0 &&
    reasons.indexOf('invalid_coordinates') < 0 &&
    reasons.indexOf('equator_policy_unavailable') < 0 &&
    reasons.indexOf('untrusted_location') < 0;

  if (canSemantic) {
    const token = fields.inputToken;
    if (!regionCheck.supportedSet[token]) {
      reasons.push('unsupported_region');
    } else {
      const regionMatches = matchRegionRules(regionCheck.table, fields);
      if (regionMatches.length === 0) {
        reasons.push('region_mapping_unavailable');
      } else if (regionMatches.length > 1) {
        reasons.push('ambiguous_region_mapping');
      } else {
        regionTags = sortedTagCopy(regionMatches[0].output.regionTags);

        const climateMatches = matchClimateRules(climateCheck.table, fields);
        if (climateMatches.length === 0) {
          reasons.push('climate_mapping_unavailable');
        } else if (climateMatches.length > 1) {
          const c0 = climateOutputCanonical(climateMatches[0].output);
          let identical = true;
          for (let i = 1; i < climateMatches.length; i++) {
            if (climateOutputCanonical(climateMatches[i].output) !== c0) {
              identical = false;
              break;
            }
          }
          reasons.push(identical ? 'ambiguous_climate_mapping' : 'conflicting_climate_signals');
        } else {
          climateTags = sortedTagCopy(climateMatches[0].output.climateTags);
          if (climateMatches[0].output.values != null) {
            climateValues = copyScalarObject(climateMatches[0].output.values);
          }
        }
      }
    }
  } else if (tablesOk && mappingVersionOk &&
             reasons.indexOf('untrusted_location') < 0 &&
             reasons.indexOf('missing_coordinates') < 0 &&
             reasons.indexOf('invalid_coordinates') < 0 &&
             reasons.indexOf('equator_policy_unavailable') < 0 &&
             reasons.indexOf('invalid_mapping_input') < 0) {
    // tables ok but blocked earlier — no semantic
  }

  const sorted = sortReasons(reasons);
  const status = statusForReasons(sorted);
  const warnings = status === 'ready' ? extractWarnings(fields) : [];

  let inputFingerprint = null;
  if (tablesOk && mappingVersionOk && canBaseFp &&
      reasons.indexOf('invalid_mapping_input') < 0) {
    inputFingerprint = computeFullFingerprint(
      fields,
      regionCheck.tableVersion,
      climateCheck.tableVersion,
      SUPPORTED_MAPPING_VERSION
    );
  }

  if (status !== 'ready') {
    return freezeDeep({
      status: status,
      reasonCodes: sorted,
      missingPrerequisites: missingForReasons(sorted),
      locationClimate: null,
      mappingVersion: sourceVersions.mappingVersion,
      inputFingerprint: inputFingerprint,
      sourceVersions: sourceVersions,
      warnings: warnings,
      provenance: cloneProvenance(fields.provenance)
    });
  }

  // Ready validation/build
  const readyBase = {
    status: 'ready',
    reasonCodes: [],
    missingPrerequisites: [],
    mappingVersion: SUPPORTED_MAPPING_VERSION,
    inputFingerprint: inputFingerprint,
    sourceVersions: sourceVersions,
    warnings: warnings,
    provenance: cloneProvenance(fields.provenance)
  };

  if (!buildMode) {
    readyBase.locationClimate = null;
    return freezeDeep(readyBase);
  }

  const locationClimate = {
    trusted: true,
    latitude: fields.latitude,
    longitude: fields.longitude,
    regionTags: regionTags,
    climateTags: climateTags,
    hemisphere: hemisphere,
    locationConfidence: fields.locationConfidence,
    mappingVersion: SUPPORTED_MAPPING_VERSION,
    suppliedBy: SUPPLIED_BY
  };
  if (fields.climateConfidence) {
    locationClimate.climateConfidence = fields.climateConfidence;
  }
  if (climateValues) {
    locationClimate.values = climateValues;
  }

  readyBase.locationClimate = locationClimate;
  return freezeDeep(readyBase);
}

function buildDescriptor() {
  return freezeDeep({
    mapperVersion: GOS_DEVELOPER_LOCATION_CLIMATE_MAPPER_VERSION,
    status: 'stopped',
    developerOnly: true,
    syntheticOnly: true,
    authoritative: false,
    persistence: false,
    productMapper: false,
    invokesGOS: false,
    invokesV1b: false,
    readsProductLocation: false,
    supportedCoverage: 'synthetic_mapping_tables_only',
    activation: 'explicit_call_only',
    requiredCapability: GOS_DEVELOPER_LOCATION_CLIMATE_MAPPER_CAPABILITY,
    supportedInputVersion: SUPPORTED_INPUT_VERSION,
    supportedStatuses: STATUSES.slice(),
    reasons: GOS_DEVELOPER_LOCATION_CLIMATE_MAPPER_REASONS.slice(),
    exclusions: EXCLUSIONS.slice()
  });
}

const DESCRIPTOR = buildDescriptor();

/**
 * Immutable descriptor. Safe to call any number of times; never mutates.
 */
export function describeGrowthOutcomeDeveloperLocationClimateMapper() {
  return DESCRIPTOR;
}

/**
 * Validate synthetic mapping input + tables. Never constructs locationClimate.
 */
export function validateSyntheticLocationMappingInput(input, options) {
  return runMapping(input, options, false);
}

/**
 * Validate and build synthetic locationClimate when ready.
 */
export function buildSyntheticProductLocationClimate(input, options) {
  return runMapping(input, options, true);
}
