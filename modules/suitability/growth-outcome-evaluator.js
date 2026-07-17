/**
 * Cruvit — Growth Outcome Suitability pure evaluator (GOS-3A)
 * ---------------------------------------------------------------------------
 * Pure, fixture-driven biological evaluation + separate goal interpretation.
 *
 * NON-CONSUMER CONTRACT
 *  - No DOM, window globals, storage, fetch, timers, or application state.
 *  - No module-level mutable cache.
 *  - Caller supplies profile, evidence, climate, garden, plant, and goal.
 *  - Does not load pilot JSON or know DEFAULT_GARDEN_LOCATION.
 *  - userGoal never alters biological outcome calculations.
 */

export const GROWTH_OUTCOME_ENGINE_VERSION = '0.1.0-gos3a';

export const GROWTH_OUTCOME_NAMES = Object.freeze([
  'survival',
  'vegetativeGrowth',
  'flowering',
  'fruitSet',
  'fruitRipeningOrYield',
  'longTermReliability'
]);

export const GROWTH_OUTCOME_LEVELS = Object.freeze([
  'excellent',
  'good',
  'possible',
  'risky',
  'notRecommended',
  'unknown'
]);

export const GROWTH_OUTCOME_GOALS = Object.freeze([
  'ornamentalFoliage',
  'floweringDisplay',
  'edibleHarvest',
  'reliableHouseholdYield',
  'experimentalGrowing',
  'protectedGrowing',
  'lowMaintenance',
  'containerGrowing'
]);

const CONF_RANK = Object.freeze({ none: 0, low: 1, medium: 2, high: 3 });
const LEVEL_RANK = Object.freeze({
  unknown: 0,
  notRecommended: 1,
  risky: 2,
  possible: 3,
  good: 4,
  excellent: 5
});

const TEMP_UNITS = Object.freeze({
  fahrenheit: 'fahrenheit',
  f: 'fahrenheit',
  '°f': 'fahrenheit',
  celsius: 'celsius',
  c: 'celsius',
  '°c': 'celsius'
});

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

function freezeResult(value) {
  return deepFreeze(value, new WeakSet());
}

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function normToken(v) {
  return String(v == null ? '' : v)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-');
}

function uniqStrings(list) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const s = String(list[i] == null ? '' : list[i]).trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function minConfidence(a, b) {
  const ra = CONF_RANK[a] == null ? 0 : CONF_RANK[a];
  const rb = CONF_RANK[b] == null ? 0 : CONF_RANK[b];
  const r = Math.min(ra, rb);
  return r <= 0 ? 'none' : r === 1 ? 'low' : r === 2 ? 'medium' : 'high';
}

function capConfidence(base, ...caps) {
  let c = base || 'none';
  for (let i = 0; i < caps.length; i++) {
    if (caps[i] != null) c = minConfidence(c, caps[i]);
  }
  return c;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

function simpleHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

function getEvidenceMap(evidenceById) {
  if (!evidenceById) return new Map();
  if (evidenceById instanceof Map) return evidenceById;
  const m = new Map();
  const keys = Object.keys(evidenceById);
  for (let i = 0; i < keys.length; i++) m.set(keys[i], evidenceById[keys[i]]);
  return m;
}

function scopeTokens(scope) {
  const s = asObject(scope);
  if (!s || s.status !== 'specified') return { status: s && s.status ? s.status : 'unknown', tokens: [] };
  return { status: 'specified', tokens: asArray(s.values).map(normToken).filter(Boolean) };
}

function tokenizeList(list) {
  return asArray(list).map(normToken).filter(Boolean);
}

function hasAnyToken(haystack, needles) {
  if (!needles.length) return false;
  const set = new Set(haystack);
  for (let i = 0; i < needles.length; i++) if (set.has(needles[i])) return true;
  return false;
}

function normalizeUnit(unit) {
  if (unit == null || unit === '') return null;
  const n = String(unit).trim().toLowerCase();
  return TEMP_UNITS[n] || n;
}

function toCelsius(value, unit) {
  const u = normalizeUnit(unit);
  if (u === 'celsius') return Number(value);
  if (u === 'fahrenheit') return ((Number(value) - 32) * 5) / 9;
  return null;
}

function readClimateNumber(values, keys) {
  const v = asObject(values) || {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (v[key] == null || v[key] === '') continue;
    const n = Number(v[key]);
    if (Number.isFinite(n)) return { key, value: n };
  }
  return null;
}

function resolveComparableClimateValue(rule, locationClimate) {
  const values = asObject(locationClimate && locationClimate.values) || {};
  const unit = normalizeUnit(rule.unit);
  const category = String(rule.factorCategory || '');
  const factorKey = String(rule.factorKey || '');

  if (unit === 'fahrenheit' || unit === 'celsius' ||
      category === 'minimum_temperature' || category === 'frost_exposure' ||
      category === 'flowering_temperature' || /temp|frost|freeze|cold/i.test(factorKey)) {
    const f = readClimateNumber(values, ['minimumTemperatureF', 'minTemperatureF']);
    if (f) return { value: f.value, unit: 'fahrenheit', sourceKey: f.key, ok: true };
    const c = readClimateNumber(values, ['minimumTemperatureC', 'minTemperatureC']);
    if (c) {
      if (unit === 'fahrenheit') {
        return { value: (c.value * 9) / 5 + 32, unit: 'fahrenheit', sourceKey: c.key, ok: true, converted: true };
      }
      return { value: c.value, unit: 'celsius', sourceKey: c.key, ok: true };
    }
    if (unit === 'celsius' || unit === 'fahrenheit') {
      return { ok: false, missing: 'minimumTemperatureC|minimumTemperatureF', unit };
    }
  }

  if (unit === 'chill_hours' || category === 'winter_chill' || /chill/i.test(factorKey)) {
    const chill = readClimateNumber(values, ['chillHours']);
    if (chill) return { value: chill.value, unit: 'chill_hours', sourceKey: chill.key, ok: true };
    return { ok: false, missing: 'chillHours', unit: unit || 'chill_hours' };
  }

  if (unit === 'days' || category === 'growing_season_length' || /season|days|gdd/i.test(factorKey)) {
    if (/gdd|degree/i.test(factorKey) || unit === 'growing_degree_days') {
      const gdd = readClimateNumber(values, ['growingDegreeDays']);
      if (gdd) return { value: gdd.value, unit: 'growing_degree_days', sourceKey: gdd.key, ok: true };
      return { ok: false, missing: 'growingDegreeDays', unit: unit || 'growing_degree_days' };
    }
    const days = readClimateNumber(values, ['frostFreeSeasonDays']);
    if (days) return { value: days.value, unit: 'days', sourceKey: days.key, ok: true };
    return { ok: false, missing: 'frostFreeSeasonDays', unit: unit || 'days' };
  }

  if (category === 'humidity' || /humidity/i.test(factorKey)) {
    const h = readClimateNumber(values, ['floweringPeriodHumidity']);
    if (h) return { value: h.value, unit: unit || 'relative_humidity', sourceKey: h.key, ok: true };
    return { ok: false, missing: 'floweringPeriodHumidity', unit };
  }

  if (category === 'rain_or_wind_during_flowering' || /rain/i.test(factorKey)) {
    const r = readClimateNumber(values, ['floweringPeriodRainfall']);
    if (r) return { value: r.value, unit: unit || 'mm', sourceKey: r.key, ok: true };
    return { ok: false, missing: 'floweringPeriodRainfall', unit };
  }

  if (rule.operator === 'exists' || rule.operator === 'not_exists' || rule.operator === 'in' || rule.operator === 'unknown') {
    return { ok: true, qualitative: true };
  }

  if (unit && !TEMP_UNITS[String(rule.unit || '').trim().toLowerCase()]) {
    return { ok: false, unsupportedUnit: true, unit };
  }

  return { ok: false, missing: 'compatible_climate_value', unit };
}

function compareOperator(operator, observed, rule) {
  const op = String(operator || '');
  if (op === 'unknown') return { matched: false, informational: true };
  if (op === 'exists') return { matched: true };
  if (op === 'not_exists') return { matched: false };

  if (op === 'in') {
    const opts = asArray(rule.value).map(normToken);
    return { matched: opts.indexOf(normToken(observed)) >= 0 };
  }

  const n = Number(observed);
  if (!Number.isFinite(n)) return { matched: false, error: 'non_numeric_observed' };

  if (op === 'eq') return { matched: n === Number(rule.value) };
  if (op === 'neq') return { matched: n !== Number(rule.value) };
  if (op === 'lt') return { matched: n < Number(rule.value) };
  if (op === 'lte') return { matched: n <= Number(rule.value) };
  if (op === 'gt') return { matched: n > Number(rule.value) };
  if (op === 'gte') return { matched: n >= Number(rule.value) };
  if (op === 'between') {
    const min = Number(rule.range && rule.range.min);
    const max = Number(rule.range && rule.range.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { matched: false, error: 'invalid_range' };
    // Inclusive band; for frost "between 29-30" treat observed in band as matching exposure condition.
    return { matched: n >= min && n <= max };
  }
  return { matched: false, error: 'unsupported_operator' };
}

function frostDurationRequired(rule, evidence) {
  const notes = [
    rule && rule.notes,
    evidence && evidence.notes,
    evidence && evidence.qualitativeClaim && evidence.qualitativeClaim.statement
  ].filter(Boolean).join(' ').toLowerCase();
  return /hour|hours|duration|several hours|few hours/.test(notes);
}

function ageTokensFromPlant(plantContext) {
  const age = normToken(plantContext && plantContext.ageClass);
  if (age === 'young') return ['young', 'young-tree', 'juvenile'];
  if (age === 'mature') return ['mature', 'mature-tree', 'adult'];
  return [];
}

function environmentTokensFromGarden(gardenContext) {
  const sys = normToken(gardenContext && gardenContext.growingSystem);
  const out = [];
  if (sys === 'ground' || sys === 'unknown') out.push('outdoor', 'home-landscape', 'ground');
  if (sys === 'container') out.push('container', 'outdoor', 'home-landscape');
  if (sys === 'indoor') out.push('indoor');
  if (sys === 'greenhouse') out.push('greenhouse', 'protected', 'protected-outdoor');
  if (sys === 'protectedoutdoor' || sys === 'protected-outdoor') out.push('protected-outdoor', 'protected', 'outdoor', 'home-landscape');
  if (gardenContext && gardenContext.protectedOutdoor === true) out.push('protected-outdoor', 'protected');
  asArray(gardenContext && gardenContext.contextTags).forEach((t) => out.push(normToken(t)));
  return uniqStrings(out.map(normToken));
}

function matchScope(scope, availableTokens, dimension) {
  const parsed = scopeTokens(scope);
  if (parsed.status === 'unknown' || parsed.status === 'not_applicable' || !parsed.tokens.length) {
    return { ok: true, status: parsed.status || 'unknown', partial: parsed.status === 'unknown' };
  }
  if (!availableTokens.length) {
    return { ok: false, reason: 'insufficient_' + dimension + '_context', status: 'insufficient_context' };
  }
  if (hasAnyToken(availableTokens, parsed.tokens)) {
    return { ok: true, status: 'matched' };
  }
  return { ok: false, reason: dimension + '_mismatch', status: 'mismatched' };
}

function classifyEvidenceApplicability(claim, ctx) {
  const excluded = [];
  const assumptions = [];
  let applicabilityStatus = 'matched';

  if (!claim || typeof claim !== 'object') {
    return { applicable: false, reason: 'missing_evidence', applicabilityStatus: 'insufficient_context', excluded, assumptions };
  }
  if (claim.outcome !== ctx.outcomeName) {
    return { applicable: false, reason: 'outcome_mismatch', applicabilityStatus: 'mismatched', excluded, assumptions };
  }

  const regionTags = tokenizeList(ctx.locationClimate.regionTags).concat(tokenizeList(ctx.locationClimate.climateTags));
  const regionMatch = matchScope(claim.regionApplicability, regionTags, 'region');
  if (!regionMatch.ok) {
    excluded.push({ evidenceId: claim.evidenceId, reason: regionMatch.reason });
    return { applicable: false, reason: regionMatch.reason, applicabilityStatus: regionMatch.status, excluded, assumptions };
  }
  if (regionMatch.partial) assumptions.push('region_applicability_unknown_on_evidence');

  const hemi = tokenizeList([ctx.locationClimate.hemisphere]);
  const hemiMatch = matchScope(claim.hemisphereApplicability, hemi, 'hemisphere');
  if (!hemiMatch.ok) {
    excluded.push({ evidenceId: claim.evidenceId, reason: hemiMatch.reason });
    return { applicable: false, reason: hemiMatch.reason, applicabilityStatus: hemiMatch.status, excluded, assumptions };
  }

  const envTokens = environmentTokensFromGarden(ctx.gardenContext);
  const envMatch = matchScope(claim.environmentApplicability, envTokens, 'environment');
  if (!envMatch.ok) {
    excluded.push({ evidenceId: claim.evidenceId, reason: envMatch.reason });
    return { applicable: false, reason: envMatch.reason, applicabilityStatus: envMatch.status, excluded, assumptions };
  }

  const cultScope = scopeTokens(claim.cultivarApplicability);
  const cultivar = normToken(ctx.plantContext && ctx.plantContext.cultivar);
  if (cultScope.status === 'specified' && cultScope.tokens.length) {
    if (!cultivar || cultivar === 'unknown') {
      excluded.push({ evidenceId: claim.evidenceId, reason: 'insufficient_cultivar_context' });
      return { applicable: false, reason: 'insufficient_cultivar_context', applicabilityStatus: 'insufficient_context', excluded, assumptions };
    }
    if (!hasAnyToken([cultivar], cultScope.tokens)) {
      excluded.push({ evidenceId: claim.evidenceId, reason: 'cultivar_mismatch' });
      return { applicable: false, reason: 'cultivar_mismatch', applicabilityStatus: 'mismatched', excluded, assumptions };
    }
  } else if (cultScope.status === 'unknown') {
    assumptions.push('cultivar_unspecified_on_evidence');
  }

  return { applicable: true, reason: null, applicabilityStatus, excluded, assumptions, cultivarSpecific: cultScope.status === 'specified' && cultScope.tokens.length > 0 };
}

function classifyRuleApplicability(rule, claim, ctx) {
  const assumptions = [];
  const missingInputs = [];
  const app = asObject(rule.applicability) || { status: 'unknown' };
  const parsed = scopeTokens(app);
  const ageTokens = ageTokensFromPlant(ctx.plantContext);
  const regionTags = tokenizeList(ctx.locationClimate.regionTags).concat(tokenizeList(ctx.locationClimate.climateTags));
  const envTokens = environmentTokensFromGarden(ctx.gardenContext);
  const cult = normToken(ctx.plantContext && ctx.plantContext.cultivar);
  const stageTags = tokenizeList(ctx.plantContext && ctx.plantContext.contextTags)
    .concat(tokenizeList(ctx.gardenContext && ctx.gardenContext.contextTags));

  if (parsed.status === 'specified' && parsed.tokens.length) {
    const ageNeedles = parsed.tokens.filter((t) => /young|mature|juvenile|adult/.test(t));
    const regionNeedles = parsed.tokens.filter((t) => !/young|mature|juvenile|adult|bloom|fruit|tommy|cultivar|graft/.test(t) &&
      (t === 'florida' || t.indexOf('florida') >= 0 || t.indexOf('zone') >= 0 || t.indexOf('subtropical') >= 0 || t.indexOf('mediterranean') >= 0 || t.indexOf('warm') >= 0));
    const envNeedles = parsed.tokens.filter((t) => /outdoor|indoor|container|greenhouse|protected|home-landscape|ground/.test(t));
    const cultivarNeedles = parsed.tokens.filter((t) => /tommy|atkins|cultivar|ascolano|manzanillo/.test(t) || (claim && scopeTokens(claim.cultivarApplicability).tokens.indexOf(t) >= 0));
    const stageNeedles = parsed.tokens.filter((t) => /bloom|flower|fruit|small-fruit|ripen/.test(t));

    if (ageNeedles.length) {
      if (!ageTokens.length) {
        return { ok: false, mode: 'insufficient', reason: 'missing_plant_age', missingInputs: ['plantContext.ageClass'], assumptions };
      }
      if (!hasAnyToken(ageTokens, ageNeedles)) {
        return { ok: false, mode: 'mismatch', reason: 'age_mismatch', missingInputs, assumptions };
      }
    }
    if (regionNeedles.length && !hasAnyToken(regionTags, regionNeedles)) {
      if (!regionTags.length) return { ok: false, mode: 'insufficient', reason: 'insufficient_region_context', missingInputs: ['locationClimate.regionTags'], assumptions };
      return { ok: false, mode: 'mismatch', reason: 'region_mismatch', missingInputs, assumptions };
    }
    if (envNeedles.length && !hasAnyToken(envTokens, envNeedles)) {
      return { ok: false, mode: 'mismatch', reason: 'environment_mismatch', missingInputs, assumptions };
    }
    if (cultivarNeedles.length) {
      if (!cult || cult === 'unknown') {
        return { ok: false, mode: 'insufficient', reason: 'insufficient_cultivar_context', missingInputs: ['plantContext.cultivar'], assumptions };
      }
      if (!hasAnyToken([cult], cultivarNeedles)) {
        return { ok: false, mode: 'mismatch', reason: 'cultivar_mismatch', missingInputs, assumptions };
      }
    }
    if (stageNeedles.length && stageNeedles.some((t) => /bloom|small-fruit|fruit-set/.test(t))) {
      if (!hasAnyToken(stageTags, stageNeedles)) {
        return {
          ok: false,
          mode: 'insufficient',
          reason: 'insufficient_reproductive_stage_context',
          missingInputs: ['plantContext.contextTags(stage)'],
          assumptions
        };
      }
    }
  }

  if (rule.effect === 'hard_blocker' && frostDurationRequired(rule, claim)) {
    const hours = readClimateNumber(asObject(ctx.locationClimate.values) || {}, ['frostExposureHours']);
    if (!hours) {
      return { ok: false, mode: 'insufficient', reason: 'missing_frost_duration', missingInputs: ['locationClimate.values.frostExposureHours'], assumptions };
    }
  }

  return { ok: true, mode: 'matched', missingInputs, assumptions };
}

function emptyOutcome(name, extras) {
  const base = {
    outcome: name,
    level: 'unknown',
    internalScore: null,
    confidence: 'none',
    dataStatus: 'unknown',
    applicabilityStatus: 'insufficient_context',
    blockers: [],
    limitingFactors: [],
    favorableFactors: [],
    assumptions: [],
    explicitUnknowns: [],
    missingInputs: [],
    evidenceRefsUsed: [],
    evidenceRefsExcluded: [],
    sourceCoverage: { applicableCount: 0, excludedCount: 0, conflicting: false },
    regionApplicability: null,
    cultivarApplicability: null,
    environmentApplicability: null,
    dependencyCaps: [],
    explanationFacts: []
  };
  if (extras) Object.keys(extras).forEach((k) => { base[k] = extras[k]; });
  return base;
}

function evaluateOutcome(outcomeName, profile, evidenceMap, locationClimate, gardenContext, plantContext) {
  const block = asObject(profile.outcomes && profile.outcomes[outcomeName]) || null;
  const out = emptyOutcome(outcomeName);
  if (!block) {
    out.explicitUnknowns.push('missing_outcome_block');
    out.explanationFacts.push({ type: 'missing_block', outcome: outcomeName });
    return out;
  }

  out.dataStatus = block.dataStatus || 'unknown';
  out.confidence = block.confidence || 'none';
  out.regionApplicability = block.applicabilityNotes || null;
  out.cultivarApplicability = null;
  out.environmentApplicability = null;
  out.explicitUnknowns = uniqStrings(asArray(block.explicitUnknowns).slice());
  out.assumptions = uniqStrings(asArray(block.assumptions).slice());

  const climateConf = locationClimate.climateConfidence || 'none';
  const locConf = locationClimate.locationConfidence || 'none';
  out.confidence = capConfidence(out.confidence, climateConf, locConf === 'default' ? 'low' : locConf);

  const ctx = { outcomeName, locationClimate, gardenContext, plantContext };
  const refs = asArray(block.evidenceRefs);
  const applicableClaims = [];
  const excluded = [];

  for (let i = 0; i < refs.length; i++) {
    const id = refs[i];
    const claim = evidenceMap.get(id);
    if (!claim) {
      excluded.push({ evidenceId: id, reason: 'evidence_not_supplied' });
      out.missingInputs.push('evidenceById.' + id);
      continue;
    }
    const app = classifyEvidenceApplicability(claim, ctx);
    excluded.push.apply(excluded, app.excluded);
    out.assumptions.push.apply(out.assumptions, app.assumptions || []);
    if (!app.applicable) continue;
    applicableClaims.push({ claim, cultivarSpecific: !!app.cultivarSpecific });
    if (claim.needsReview) out.confidence = capConfidence(out.confidence, 'low');
    out.confidence = capConfidence(out.confidence, claim.confidence || 'none');
  }

  out.evidenceRefsUsed = applicableClaims.map((c) => c.claim.evidenceId);
  out.evidenceRefsExcluded = excluded.slice();
  out.sourceCoverage = {
    applicableCount: applicableClaims.length,
    excludedCount: excluded.length,
    conflicting: out.dataStatus === 'conflicting' || asArray(block.conflictEvidenceRefs).length > 0 || !!block.conflictReason
  };

  if (out.dataStatus === 'unknown') {
    out.level = 'unknown';
    out.internalScore = null;
    out.applicabilityStatus = applicableClaims.length ? 'matched' : 'insufficient_context';
    if (!out.explicitUnknowns.length) out.explicitUnknowns.push('profile_dataStatus_unknown');
    out.explanationFacts.push({ type: 'profile_unknown', outcome: outcomeName });
    return finalizeLists(out);
  }

  if (out.dataStatus === 'conflicting' || block.conflictReason) {
    const conflictRefs = uniqStrings(asArray(block.conflictEvidenceRefs).concat(out.evidenceRefsUsed));
    out.level = 'unknown';
    out.confidence = capConfidence(out.confidence, 'low');
    out.applicabilityStatus = 'matched';
    out.sourceCoverage.conflicting = true;
    out.explanationFacts.push({
      type: 'unresolved_conflict',
      outcome: outcomeName,
      conflictReason: block.conflictReason || null,
      conflictEvidenceRefs: conflictRefs
    });
    if (!conflictRefs.length && block.conflictReason) {
      out.explanationFacts.push({ type: 'conflict_reason_without_pair', outcome: outcomeName });
    }
    return finalizeLists(out);
  }

  // Explicit conflictsWith links among applicable claims → unresolved conflict (never average).
  // Age/cultivar-differentiated thresholds on the same factor are NOT automatic conflicts.
  let quantitativeConflict = false;
  const applicableIds = new Set(applicableClaims.map((c) => c.claim.evidenceId));
  for (let i = 0; i < applicableClaims.length; i++) {
    const a = applicableClaims[i].claim;
    const links = asArray(a.conflictsWith).filter((id) => applicableIds.has(id));
    if (links.length) {
      quantitativeConflict = true;
      out.explanationFacts.push({
        type: 'conflicting_thresholds',
        factorKey: a.factorKey,
        evidenceRefs: uniqStrings([a.evidenceId].concat(links))
      });
    }
  }
  if (quantitativeConflict) {
    out.level = 'unknown';
    out.confidence = capConfidence(out.confidence, 'low');
    out.sourceCoverage.conflicting = true;
    out.applicabilityStatus = 'matched';
    return finalizeLists(out);
  }

  if (!applicableClaims.length && !asArray(block.requirements).length) {
    out.level = 'unknown';
    out.applicabilityStatus = 'insufficient_context';
    out.explicitUnknowns.push('no_applicable_evidence');
    return finalizeLists(out);
  }

  let hardBlockTriggered = false;
  let hardBlockDeferred = false;
  let limitingObserved = false;
  let limitingApplicable = false;
  let favorableMatched = false;
  let anyRuleEvaluated = false;
  const rules = asArray(block.requirements);

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const ruleEvidenceId = asArray(rule.evidenceRefs)[0] || null;
    const claim = ruleEvidenceId ? evidenceMap.get(ruleEvidenceId) : null;

    // Rule evidence must be applicable when present.
    if (ruleEvidenceId) {
      if (!claim) {
        out.missingInputs.push('evidenceById.' + ruleEvidenceId);
        out.evidenceRefsExcluded.push({ evidenceId: ruleEvidenceId, reason: 'evidence_not_supplied' });
        continue;
      }
      const claimApp = classifyEvidenceApplicability(claim, ctx);
      if (!claimApp.applicable) {
        out.evidenceRefsExcluded.push({ evidenceId: claim.evidenceId, reason: claimApp.reason, ruleId: rule.ruleId });
        continue;
      }
    }

    const ruleApp = classifyRuleApplicability(rule, claim, ctx);
    out.missingInputs.push.apply(out.missingInputs, ruleApp.missingInputs || []);
    out.assumptions.push.apply(out.assumptions, ruleApp.assumptions || []);
    if (!ruleApp.ok) {
      out.evidenceRefsExcluded.push({
        evidenceId: ruleEvidenceId,
        reason: ruleApp.reason,
        ruleId: rule.ruleId,
        mode: ruleApp.mode
      });
      if (rule.effect === 'hard_blocker' && ruleApp.mode === 'insufficient') {
        hardBlockDeferred = true;
        out.explanationFacts.push({ type: 'hard_blocker_deferred', ruleId: rule.ruleId, reason: ruleApp.reason });
      }
      continue;
    }

    if (rule.operator === 'unknown' || rule.effect === 'informational') {
      out.explanationFacts.push({ type: 'informational_rule', ruleId: rule.ruleId, effect: rule.effect });
      continue;
    }

    const resolved = resolveComparableClimateValue(rule, locationClimate);
    if (!resolved.ok) {
      if (resolved.unsupportedUnit) {
        out.missingInputs.push('unsupported_unit:' + String(resolved.unit || rule.unit || ''));
        out.explanationFacts.push({ type: 'unsupported_unit', ruleId: rule.ruleId, unit: rule.unit || null });
      } else {
        out.missingInputs.push(resolved.missing || 'climate_value');
        out.explanationFacts.push({ type: 'missing_climate_value', ruleId: rule.ruleId, missing: resolved.missing || null });
      }
      if (rule.effect === 'hard_blocker') {
        hardBlockDeferred = true;
        out.explanationFacts.push({ type: 'hard_blocker_deferred', ruleId: rule.ruleId, reason: 'missing_required_value' });
      } else if (rule.effect === 'limiting') {
        limitingApplicable = true;
      }
      continue;
    }

    if (resolved.qualitative) {
      if (rule.effect === 'favorable') favorableMatched = true;
      if (rule.effect === 'limiting') {
        limitingApplicable = true;
        // exists-limiting without numeric observation stays possible/risky via applicability only.
      }
      out.explanationFacts.push({ type: 'qualitative_rule', ruleId: rule.ruleId, effect: rule.effect });
      anyRuleEvaluated = true;
      continue;
    }

    // For temperature frost rules using eq on a threshold, "exposure at/near threshold" uses observed min temp.
    let observed = resolved.value;
    const cmp = compareOperator(rule.operator, observed, rule);
    anyRuleEvaluated = true;
    out.explanationFacts.push({
      type: 'rule_comparison',
      ruleId: rule.ruleId,
      effect: rule.effect,
      operator: rule.operator,
      observed,
      unit: resolved.unit,
      matched: !!cmp.matched,
      sourceKey: resolved.sourceKey || null
    });

    if (cmp.error) {
      out.missingInputs.push(cmp.error);
      continue;
    }

    if (rule.effect === 'hard_blocker') {
      if (cmp.matched) {
        hardBlockTriggered = true;
        out.blockers.push(rule.ruleId);
      }
    } else if (rule.effect === 'limiting') {
      limitingApplicable = true;
      if (cmp.matched) {
        limitingObserved = true;
        out.limitingFactors.push(rule.ruleId);
      }
    } else if (rule.effect === 'favorable') {
      if (cmp.matched) {
        favorableMatched = true;
        out.favorableFactors.push(rule.ruleId);
      }
    }
  }

  // Copy descriptive factor labels as informational facts only (no upgrades).
  asArray(block.hardBlockers).forEach((x) => out.explanationFacts.push({ type: 'profile_hardBlocker_label', value: x }));
  asArray(block.limitingFactors).forEach((x) => {
    out.explanationFacts.push({ type: 'profile_limiting_label', value: x });
  });
  asArray(block.favorableFactors).forEach((x) => {
    out.explanationFacts.push({ type: 'profile_favorable_label', value: x });
  });

  if (gardenContext && gardenContext.protectedOutdoor === true) {
    out.assumptions.push('protectedOutdoor_explicit_caller_input');
    out.explanationFacts.push({ type: 'protected_context', scope: 'survival_interpretation_only' });
  }

  out.applicabilityStatus = applicableClaims.length || anyRuleEvaluated ? 'matched' : 'insufficient_context';
  out.missingInputs = uniqStrings(out.missingInputs);
  out.assumptions = uniqStrings(out.assumptions);

  if (hardBlockTriggered) {
    out.level = 'notRecommended';
    out.internalScore = null;
    out.confidence = capConfidence(out.confidence, 'medium');
    return finalizeLists(out);
  }

  if (hardBlockDeferred) {
    out.level = 'risky';
    out.confidence = capConfidence(out.confidence, 'low');
    out.explanationFacts.push({ type: 'deferred_blocker_cap', level: 'risky' });
    return finalizeLists(out);
  }

  if (!applicableClaims.length && !anyRuleEvaluated) {
    out.level = 'unknown';
    out.explicitUnknowns.push('no_evaluable_applicable_evidence');
    return finalizeLists(out);
  }

  if (limitingObserved) {
    out.level = 'risky';
    return finalizeLists(out);
  }

  if (limitingApplicable && out.missingInputs.length) {
    out.level = 'possible';
    out.confidence = capConfidence(out.confidence, 'low');
    out.explanationFacts.push({ type: 'limiting_not_fully_observable', level: 'possible' });
    return finalizeLists(out);
  }

  if (favorableMatched && !limitingObserved && !hardBlockTriggered) {
    out.level = 'possible';
    return finalizeLists(out);
  }

  if (out.dataStatus === 'supported' || out.dataStatus === 'partial') {
    // Evidence applicable but no decisive numeric comparison — conservative possible/unknown.
    if (applicableClaims.length && !anyRuleEvaluated) {
      out.level = 'possible';
      out.confidence = capConfidence(out.confidence, 'low');
      out.explanationFacts.push({ type: 'applicable_evidence_without_numeric_eval', level: 'possible' });
      return finalizeLists(out);
    }
    if (anyRuleEvaluated) {
      out.level = 'possible';
      return finalizeLists(out);
    }
  }

  out.level = 'unknown';
  out.internalScore = null;
  return finalizeLists(out);
}

function finalizeLists(out) {
  out.blockers = uniqStrings(out.blockers);
  out.limitingFactors = uniqStrings(out.limitingFactors);
  out.favorableFactors = uniqStrings(out.favorableFactors);
  out.assumptions = uniqStrings(out.assumptions);
  out.explicitUnknowns = uniqStrings(out.explicitUnknowns);
  out.missingInputs = uniqStrings(out.missingInputs);
  out.dependencyCaps = uniqStrings(out.dependencyCaps);
  out.internalScore = null;
  // GOS-3A: never emit excellent/good
  if (out.level === 'excellent' || out.level === 'good') out.level = 'possible';
  return out;
}

function applyDependencyCaps(outcomes) {
  const order = GROWTH_OUTCOME_NAMES;
  function capAtMost(name, maxLevel, reason) {
    const o = outcomes[name];
    if (!o) return;
    if ((LEVEL_RANK[o.level] || 0) > (LEVEL_RANK[maxLevel] || 0)) {
      o.level = maxLevel;
      o.dependencyCaps.push(reason);
      o.explanationFacts.push({ type: 'dependency_cap', maxLevel, reason });
    }
  }

  if (outcomes.survival && outcomes.survival.level === 'notRecommended') {
    for (let i = 1; i < order.length; i++) capAtMost(order[i], 'risky', 'capped_by_survival_notRecommended');
  }
  if (outcomes.vegetativeGrowth && outcomes.vegetativeGrowth.level === 'notRecommended') {
    for (let i = 2; i < order.length; i++) capAtMost(order[i], 'risky', 'capped_by_vegetativeGrowth_notRecommended');
  }
  if (outcomes.flowering && outcomes.flowering.level === 'notRecommended') {
    capAtMost('fruitSet', 'risky', 'capped_by_flowering_notRecommended');
    capAtMost('fruitRipeningOrYield', 'risky', 'capped_by_flowering_notRecommended');
  }
  if (outcomes.fruitSet && outcomes.fruitSet.level === 'notRecommended') {
    capAtMost('fruitRipeningOrYield', 'risky', 'capped_by_fruitSet_notRecommended');
  }
}

function buildUnknownOutcomes(reason) {
  const outcomes = {};
  for (let i = 0; i < GROWTH_OUTCOME_NAMES.length; i++) {
    const name = GROWTH_OUTCOME_NAMES[i];
    outcomes[name] = emptyOutcome(name, {
      explicitUnknowns: [reason],
      explanationFacts: [{ type: reason, outcome: name }],
      applicabilityStatus: 'insufficient_context'
    });
  }
  return outcomes;
}

function climateFingerprintOf(locationClimate) {
  const lc = asObject(locationClimate) || {};
  return simpleHash(stableStringify({
    trusted: !!lc.trusted,
    regionTags: tokenizeList(lc.regionTags).sort(),
    climateTags: tokenizeList(lc.climateTags).sort(),
    hemisphere: normToken(lc.hemisphere),
    locationConfidence: lc.locationConfidence || null,
    climateConfidence: lc.climateConfidence || null,
    structuralFreezingRisk: lc.structuralFreezingRisk || null,
    isFrostFreeGrowingClimate: !!lc.isFrostFreeGrowingClimate,
    values: asObject(lc.values) || {}
  }));
}

function contextFingerprintOf(gardenContext, plantContext) {
  return simpleHash(stableStringify({
    garden: asObject(gardenContext) || {},
    plant: asObject(plantContext) || {}
  }));
}

/**
 * Biological evaluation only — must not accept or read userGoal.
 */
export function evaluateBiologicalGrowthOutcomes(input) {
  const args = asObject(input) || {};
  const profile = asObject(args.profile);
  const evidenceMap = getEvidenceMap(args.evidenceById);
  const locationClimate = asObject(args.locationClimate) || {};
  const gardenContext = asObject(args.gardenContext) || { growingSystem: 'unknown', protectedOutdoor: 'unknown' };
  const plantContext = asObject(args.plantContext) || { ageClass: 'unknown', propagation: 'unknown' };
  const options = asObject(args.options) || {};

  const identityStatus = profile && profile.canonicalSlug
    ? (profile.plantId ? 'profile_with_plantId' : 'profile_canonical')
    : 'missing_profile';

  const trusted = locationClimate.trusted === true;
  const locationStatus = !locationClimate || locationClimate.trusted == null
    ? 'missing'
    : (trusted ? 'trusted' : 'untrusted');

  if (!profile) {
    const outcomes = buildUnknownOutcomes('missing_profile');
    return freezeResult({
      identityStatus: 'missing_profile',
      locationStatus,
      evaluationStatus: 'insufficient_profile',
      outcomes,
      warnings: ['missing_profile'],
      unknowns: GROWTH_OUTCOME_NAMES.slice(),
      missingInputs: ['profile'],
      engineVersion: options.engineVersion || GROWTH_OUTCOME_ENGINE_VERSION,
      profileVersion: null,
      evidenceDataVersion: null,
      climateFingerprint: climateFingerprintOf(locationClimate),
      contextFingerprint: contextFingerprintOf(gardenContext, plantContext),
      biologicalOnly: true
    });
  }

  if (!trusted) {
    const outcomes = buildUnknownOutcomes('blocked_untrusted_location');
    return freezeResult({
      identityStatus,
      locationStatus,
      evaluationStatus: 'blocked_untrusted_location',
      outcomes,
      warnings: ['untrusted_location_blocks_evaluation'],
      unknowns: GROWTH_OUTCOME_NAMES.slice(),
      missingInputs: locationStatus === 'missing' ? ['locationClimate.trusted'] : [],
      engineVersion: options.engineVersion || GROWTH_OUTCOME_ENGINE_VERSION,
      profileVersion: profile.profileVersion || null,
      evidenceDataVersion: null,
      climateFingerprint: climateFingerprintOf(locationClimate),
      contextFingerprint: contextFingerprintOf(gardenContext, plantContext),
      biologicalOnly: true
    });
  }

  const outcomes = {};
  for (let i = 0; i < GROWTH_OUTCOME_NAMES.length; i++) {
    const name = GROWTH_OUTCOME_NAMES[i];
    outcomes[name] = evaluateOutcome(name, profile, evidenceMap, locationClimate, gardenContext, plantContext);
  }
  applyDependencyCaps(outcomes);

  // Pollinizer soft rule for fruitSet when edible context asks — missing keeps unknown/risky, does not invent.
  if (gardenContext.pollinizerAvailable === false || gardenContext.pollinizerAvailable == null) {
    const fs = outcomes.fruitSet;
    if (fs && fs.level !== 'notRecommended' && (fs.dataStatus === 'partial' || fs.dataStatus === 'supported' || fs.dataStatus === 'unknown')) {
      if (gardenContext.pollinizerAvailable == null && /apple|malus/i.test(String(profile.canonicalSlug || profile.scientificName || ''))) {
        fs.missingInputs = uniqStrings(fs.missingInputs.concat(['gardenContext.pollinizerAvailable']));
        if (fs.level === 'possible') fs.level = 'unknown';
        fs.explanationFacts.push({ type: 'missing_pollinizer_context' });
      }
    }
  }

  const unknowns = GROWTH_OUTCOME_NAMES.filter((n) => outcomes[n].level === 'unknown');
  const missingInputs = uniqStrings([].concat.apply([], GROWTH_OUTCOME_NAMES.map((n) => outcomes[n].missingInputs)));

  return freezeResult({
    identityStatus,
    locationStatus,
    evaluationStatus: 'ok',
    outcomes,
    warnings: [],
    unknowns,
    missingInputs,
    engineVersion: options.engineVersion || GROWTH_OUTCOME_ENGINE_VERSION,
    profileVersion: profile.profileVersion || null,
    evidenceDataVersion: null,
    climateFingerprint: climateFingerprintOf(locationClimate),
    contextFingerprint: contextFingerprintOf(gardenContext, plantContext),
    biologicalOnly: true
  });
}

/**
 * Goal interpretation only — must not alter biological outcome fields.
 */
export function interpretGrowthOutcomesForGoal(biologicalResult, userGoal) {
  const bio = asObject(biologicalResult) || {};
  const outcomes = asObject(bio.outcomes) || {};
  const goal = GROWTH_OUTCOME_GOALS.indexOf(userGoal) >= 0 ? userGoal : null;

  const goalFit = {
    goal: goal,
    status: goal ? 'interpreted' : 'missing_or_invalid_goal',
    notes: []
  };
  const recommendedUse = [];
  const warnings = asArray(bio.warnings).slice();
  let overallConclusion = 'biological_evaluation_only';

  const o = (name) => outcomes[name] || emptyOutcome(name);

  if (!goal) {
    goalFit.notes.push('no_valid_userGoal');
  } else if (goal === 'ornamentalFoliage') {
    recommendedUse.push('foliage_display');
    if (o('survival').level === 'notRecommended') warnings.push('survival_limits_ornamental_use');
    if (o('fruitSet').level !== 'unknown') goalFit.notes.push('fruit_outcomes_not_required_for_ornamental_goal');
    overallConclusion = 'interpret_for_ornamental_foliage';
  } else if (goal === 'floweringDisplay') {
    recommendedUse.push('flowering_display');
    if (o('flowering').level === 'unknown') warnings.push('flowering_unknown_for_display_goal');
    if (o('flowering').level === 'notRecommended' || o('flowering').level === 'risky') warnings.push('flowering_limited_for_display_goal');
    overallConclusion = 'interpret_for_flowering_display';
  } else if (goal === 'edibleHarvest') {
    recommendedUse.push('edible_harvest_attempt');
    if (o('fruitSet').level === 'unknown' || o('fruitRipeningOrYield').level === 'unknown') {
      warnings.push('harvest_outcomes_unknown');
    }
    overallConclusion = 'interpret_for_edible_harvest';
  } else if (goal === 'reliableHouseholdYield') {
    recommendedUse.push('household_yield_only_if_reliability_supported');
    if (o('longTermReliability').level === 'unknown' || o('fruitRipeningOrYield').level === 'unknown') {
      warnings.push('reliable_yield_not_supported_by_evidence');
    }
    if (o('longTermReliability').level === 'risky' || o('fruitRipeningOrYield').level === 'risky') {
      warnings.push('yield_reliability_limited');
    }
    overallConclusion = 'interpret_for_reliable_household_yield';
  } else if (goal === 'experimentalGrowing') {
    recommendedUse.push('experimental_growing');
    overallConclusion = 'interpret_for_experimental_growing';
  } else if (goal === 'protectedGrowing') {
    recommendedUse.push('protected_growing_context');
    goalFit.notes.push('protection_does_not_guarantee_yield');
    overallConclusion = 'interpret_for_protected_growing';
  } else if (goal === 'lowMaintenance') {
    recommendedUse.push('low_maintenance_preference');
    if (o('longTermReliability').level === 'unknown') warnings.push('reliability_unknown_for_low_maintenance_goal');
    overallConclusion = 'interpret_for_low_maintenance';
  } else if (goal === 'containerGrowing') {
    recommendedUse.push('container_growing');
    overallConclusion = 'interpret_for_container_growing';
  }

  // Re-assemble result with identical biological outcomes object graph cloned immutably.
  const clonedOutcomes = {};
  for (let i = 0; i < GROWTH_OUTCOME_NAMES.length; i++) {
    const name = GROWTH_OUTCOME_NAMES[i];
    clonedOutcomes[name] = outcomes[name] ? JSON.parse(JSON.stringify(outcomes[name])) : emptyOutcome(name);
  }

  return freezeResult({
    identityStatus: bio.identityStatus,
    locationStatus: bio.locationStatus,
    evaluationStatus: bio.evaluationStatus,
    outcomes: clonedOutcomes,
    goalFit,
    recommendedUse: uniqStrings(recommendedUse),
    overallConclusion,
    warnings: uniqStrings(warnings),
    unknowns: asArray(bio.unknowns).slice(),
    missingInputs: asArray(bio.missingInputs).slice(),
    engineVersion: bio.engineVersion || GROWTH_OUTCOME_ENGINE_VERSION,
    profileVersion: bio.profileVersion || null,
    evidenceDataVersion: bio.evidenceDataVersion || null,
    climateFingerprint: bio.climateFingerprint || null,
    contextFingerprint: bio.contextFingerprint || null
  });
}

/**
 * Full evaluation: biology then goal interpretation.
 */
export function evaluateGrowthOutcomeSuitability(input) {
  const args = asObject(input) || {};
  const biological = evaluateBiologicalGrowthOutcomes({
    profile: args.profile,
    evidenceById: args.evidenceById,
    locationClimate: args.locationClimate,
    gardenContext: args.gardenContext,
    plantContext: args.plantContext,
    options: args.options
  });
  // Strip biologicalOnly marker before interpretation surface.
  const forGoal = interpretGrowthOutcomesForGoal(biological, args.userGoal);
  return forGoal;
}
