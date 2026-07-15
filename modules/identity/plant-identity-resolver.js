/**
 * Cruvit — Shared Plant Identity Resolver Foundation (standalone, read-only)
 * ---------------------------------------------------------------------------
 * Translates plant-identity inputs (plantId, canonical slug, alias slug,
 * module keys, scientific name, or an object with hints) into canonical
 * identity data read from data/plant-identity.registry.json.
 *
 * DESIGN CONTRACT
 *  - Pure resolution: createPlantIdentityResolver(registryData).resolve(input)
 *    has no side effects and never mutates its input or the registry.
 *  - Read-only: this module NEVER writes files, never persists anything, never
 *    allocates or fabricates a plantId, and is NOT imported by any runtime
 *    consumer (index.html / modules) in this foundation task.
 *  - Conservative matching only: exact plantId / slug / alias / module key /
 *    normalized scientific name / normalized common-name token. No substring
 *    or fuzzy matching. A pending duplicate-conflict slug is quarantined and
 *    returned as `pending_conflict` before any scientific/common-name fallback.
 *  - Does not depend on PLANT_LIBRARY array order or any index.html global.
 *
 * PUBLIC API
 *  - createPlantIdentityResolver(registryData) -> { resolve, getRegistryVersion, getStats }
 *  - resolvePlantIdentity(input, options?)      // uses the module singleton (or options.resolver)
 *  - loadIdentityRegistry(options?)             // promise-guarded fetch + build
 *  - getIdentityResolverStatus()               // { status, registryVersion, error, url, stats }
 *
 * RESULT SHAPE (frozen)
 *  { status, plantId, canonicalSlug, matchedBy, inputValue, inputNamespace,
 *    needsReview, conflict, confidence, warnings, registryVersion }
 *
 * STATUSES: resolved_id | resolved_canonical | pending_conflict | ambiguous
 *           | provisional | unresolved
 */

export const PLANT_ID_PATTERN = /^plt_[a-z0-9]{16}$/;

const DEFAULT_REGISTRY_URL = (() => {
  try {
    return new URL('../../data/plant-identity.registry.json', import.meta.url).href;
  } catch (_e) {
    return 'data/plant-identity.registry.json';
  }
})();

/* ─────────────────────────── pure helpers ─────────────────────────── */

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Normalize a scientific / free-text value for exact comparison. */
function normalizeText(v) {
  return String(v == null ? '' : v)
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Derive a kebab slug token from free text (for exact common-name matching). */
function toSlugToken(v) {
  return String(v == null ? '' : v)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  }
  return obj;
}

function clone(v) {
  if (v == null) return v;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(v); } catch (_e) { /* fall through */ }
  }
  return JSON.parse(JSON.stringify(v));
}

/**
 * Build an immutable resolver result. `inputValue` intentionally keeps the
 * caller's original reference (never mutated, never deep-frozen — the caller
 * owns it); everything derived from registry data is cloned + frozen.
 */
function makeResult(fields) {
  const r = {
    status: 'unresolved',
    plantId: null,
    canonicalSlug: null,
    matchedBy: null,
    inputValue: undefined,
    inputNamespace: null,
    needsReview: false,
    conflict: null,
    confidence: 'low',
    warnings: [],
    registryVersion: null,
    ...fields
  };
  r.warnings = Object.freeze(Array.isArray(r.warnings) ? r.warnings.slice() : []);
  if (r.conflict) r.conflict = deepFreeze(clone(r.conflict));
  return Object.freeze(r);
}

/* ───────────────────── registry validation + maps ───────────────────── */

export function validateRegistryData(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['registry root is not an object'] };
  }
  if (data.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!isNonEmptyString(data.registryVersion)) errors.push('registryVersion missing');
  if (!Array.isArray(data.canonicalIdentities)) errors.push('canonicalIdentities must be an array');
  if (!Array.isArray(data.duplicateConflicts)) errors.push('duplicateConflicts must be an array');
  return { valid: errors.length === 0, errors };
}

function buildMaps(registry) {
  const bySlug = new Map();          // canonicalSlug -> entry
  const byAlias = new Map();         // aliasSlug -> canonicalSlug
  const byModuleKey = new Map();     // moduleKey -> { canonicalSlug, namespace }
  const byPlantId = new Map();       // plantId -> canonicalSlug
  const byScientific = new Map();    // normalized acceptedScientificName -> canonicalSlug
  const ambiguousScientific = new Set();
  const conflictBySlug = new Map();      // slug -> conflict entry
  const conflictByScientific = new Map();// normalized scientific -> conflict slug

  for (const entry of registry.canonicalIdentities) {
    if (!entry || !isNonEmptyString(entry.canonicalSlug)) continue;
    const slug = entry.canonicalSlug;
    bySlug.set(slug, entry);
    if (isNonEmptyString(entry.plantId)) byPlantId.set(entry.plantId, slug);
    if (Array.isArray(entry.aliasSlugs)) {
      for (const a of entry.aliasSlugs) if (isNonEmptyString(a)) byAlias.set(a, slug);
    }
    if (entry.moduleKeys && typeof entry.moduleKeys === 'object') {
      for (const ns of Object.keys(entry.moduleKeys)) {
        const keys = entry.moduleKeys[ns];
        if (!Array.isArray(keys)) continue;
        for (const k of keys) if (isNonEmptyString(k)) byModuleKey.set(k, { canonicalSlug: slug, namespace: ns });
      }
    }
    if (isNonEmptyString(entry.acceptedScientificName)) {
      const key = normalizeText(entry.acceptedScientificName);
      if (byScientific.has(key) && byScientific.get(key) !== slug) ambiguousScientific.add(key);
      else byScientific.set(key, slug);
    }
  }

  for (const conflict of registry.duplicateConflicts) {
    if (!conflict || !isNonEmptyString(conflict.slug)) continue;
    conflictBySlug.set(conflict.slug, conflict);
    const sciNames = [];
    if (Array.isArray(conflict.observedRecords)) {
      for (const rec of conflict.observedRecords) if (rec && isNonEmptyString(rec.scientificName)) sciNames.push(rec.scientificName);
    }
    if (isNonEmptyString(conflict.recommendedCanonicalScientificName)) sciNames.push(conflict.recommendedCanonicalScientificName);
    if (isNonEmptyString(conflict.conflictingScientificNamePresent)) sciNames.push(conflict.conflictingScientificNamePresent);
    for (const s of sciNames) conflictByScientific.set(normalizeText(s), conflict.slug);
  }

  return { bySlug, byAlias, byModuleKey, byPlantId, byScientific, ambiguousScientific, conflictBySlug, conflictByScientific };
}

/* ───────────────────────── resolver factory ───────────────────────── */

export function createPlantIdentityResolver(registryData) {
  const check = validateRegistryData(registryData);

  if (!check.valid) {
    const warning = 'invalid-registry: ' + check.errors.join('; ');
    return Object.freeze({
      valid: false,
      getRegistryVersion() { return null; },
      getStats() {
        return Object.freeze({ valid: false, errors: check.errors.slice(), canonicalCount: 0, conflictCount: 0, plantIdCount: 0, aliasCount: 0, moduleKeyCount: 0, scientificCount: 0 });
      },
      resolve(input) {
        return makeResult({ status: 'unresolved', inputValue: input, warnings: [warning], registryVersion: null });
      }
    });
  }

  const registry = deepFreeze(clone(registryData));
  const registryVersion = registry.registryVersion;
  const maps = buildMaps(registry);

  function resolvedFromEntry(entry, matchedBy, inputNamespace, confidence, input) {
    const hasId = isNonEmptyString(entry.plantId);
    return makeResult({
      status: hasId ? 'resolved_id' : 'resolved_canonical',
      plantId: hasId ? entry.plantId : null,
      canonicalSlug: entry.canonicalSlug,
      matchedBy,
      inputNamespace,
      needsReview: entry.needsReview === true,
      confidence,
      inputValue: input,
      registryVersion
    });
  }

  function conflictResult(conflict, matchedBy, inputNamespace, input) {
    return makeResult({
      status: 'pending_conflict',
      plantId: null,
      canonicalSlug: null,
      matchedBy,
      inputNamespace,
      needsReview: conflict.needsReview === true,
      conflict,
      confidence: 'exact',
      inputValue: input,
      registryVersion
    });
  }

  function resolve(input) {
    // 1. Extract signals from string or object; anything else -> unresolved.
    let plantIdSig = null;
    const exactKeys = [];          // slug/alias/module candidates, in precedence order
    let scientificSig = null;
    let nameSig = null;
    let hadSignal = false;

    const pushKey = (v) => { if (isNonEmptyString(v)) { exactKeys.push(v.trim()); hadSignal = true; } };

    if (typeof input === 'string') {
      const s = input.trim();
      if (!s) return makeResult({ status: 'unresolved', inputValue: input, warnings: ['empty-input'], registryVersion });
      hadSignal = true;
      if (PLANT_ID_PATTERN.test(s)) plantIdSig = s;
      exactKeys.push(s);
      scientificSig = s;   // a bare string may also be a scientific name
      nameSig = s;         // ...or a common name
    } else if (input && typeof input === 'object') {
      if (isNonEmptyString(input.plantId)) { plantIdSig = input.plantId.trim(); hadSignal = true; }
      pushKey(input.canonicalSlug);
      pushKey(input.profileSlug);
      pushKey(input.slug);
      if (input.meta && typeof input.meta === 'object') pushKey(input.meta.slug);
      if (isNonEmptyString(input.scientific)) { scientificSig = input.scientific; hadSignal = true; }
      else if (isNonEmptyString(input.scientificName)) { scientificSig = input.scientificName; hadSignal = true; }
      if (isNonEmptyString(input.name)) { nameSig = input.name; hadSignal = true; }
    } else {
      return makeResult({ status: 'unresolved', inputValue: input, warnings: ['unsupported-input-type'], registryVersion });
    }

    if (!hadSignal) return makeResult({ status: 'unresolved', inputValue: input, warnings: ['no-usable-signal'], registryVersion });

    // A. exact plantId
    if (plantIdSig && maps.byPlantId.has(plantIdSig)) {
      return resolvedFromEntry(maps.bySlug.get(maps.byPlantId.get(plantIdSig)), 'plantId', 'plantId', 'exact', input);
    }

    // B. exact canonicalSlug (conflict slug short-circuits to pending_conflict)
    for (const key of exactKeys) {
      if (maps.conflictBySlug.has(key)) return conflictResult(maps.conflictBySlug.get(key), 'canonicalSlug', 'canonicalSlug', input);
      if (maps.bySlug.has(key)) return resolvedFromEntry(maps.bySlug.get(key), 'canonicalSlug', 'canonicalSlug', 'exact', input);
    }
    // C. exact registered aliasSlug
    for (const key of exactKeys) {
      if (maps.byAlias.has(key)) return resolvedFromEntry(maps.bySlug.get(maps.byAlias.get(key)), 'aliasSlug', 'aliasSlug', 'exact', input);
    }
    // D. exact registered module key (namespace preserved)
    for (const key of exactKeys) {
      if (maps.byModuleKey.has(key)) {
        const { canonicalSlug, namespace } = maps.byModuleKey.get(key);
        return resolvedFromEntry(maps.bySlug.get(canonicalSlug), 'moduleKey', namespace, 'exact', input);
      }
    }

    // E. exact normalized acceptedScientificName (conflict scientific short-circuits)
    if (isNonEmptyString(scientificSig)) {
      const sci = normalizeText(scientificSig);
      if (maps.conflictByScientific.has(sci)) {
        return conflictResult(maps.conflictBySlug.get(maps.conflictByScientific.get(sci)), 'scientificName', 'scientificName', input);
      }
      if (maps.ambiguousScientific.has(sci)) {
        return makeResult({ status: 'ambiguous', matchedBy: 'scientificName', inputNamespace: 'scientificName', confidence: 'low', inputValue: input, warnings: ['ambiguous-scientific-name'], registryVersion });
      }
      if (maps.byScientific.has(sci)) {
        return resolvedFromEntry(maps.bySlug.get(maps.byScientific.get(sci)), 'scientificName', 'scientificName', 'high', input);
      }
    }

    // F. conservative exact common-name token (normalized to a slug token)
    if (isNonEmptyString(nameSig)) {
      const token = toSlugToken(nameSig);
      if (token) {
        if (maps.conflictBySlug.has(token)) return conflictResult(maps.conflictBySlug.get(token), 'commonName', 'commonName', input);
        if (maps.bySlug.has(token)) return resolvedFromEntry(maps.bySlug.get(token), 'commonName', 'commonName', 'medium', input);
        if (maps.byAlias.has(token)) return resolvedFromEntry(maps.bySlug.get(maps.byAlias.get(token)), 'commonName', 'commonName', 'medium', input);
      }
    }

    // No match: well-formed plant-like input is provisional; otherwise unresolved.
    return makeResult({ status: 'provisional', inputValue: input, confidence: 'low', warnings: ['not-in-registry'], registryVersion });
  }

  return Object.freeze({
    valid: true,
    resolve,
    getRegistryVersion() { return registryVersion; },
    getStats() {
      return Object.freeze({
        valid: true,
        canonicalCount: maps.bySlug.size,
        conflictCount: maps.conflictBySlug.size,
        plantIdCount: maps.byPlantId.size,
        aliasCount: maps.byAlias.size,
        moduleKeyCount: maps.byModuleKey.size,
        scientificCount: maps.byScientific.size
      });
    }
  });
}

/* ───────────────── module singleton loader (browser fetch) ───────────────── */

const _state = {
  status: 'idle',      // idle | loading | ready | error
  resolver: null,
  registryVersion: null,
  error: null,
  url: DEFAULT_REGISTRY_URL,
  loadPromise: null
};

function statusSnapshot() {
  return {
    status: _state.status,
    registryVersion: _state.registryVersion,
    error: _state.error,
    url: _state.url,
    stats: _state.resolver ? _state.resolver.getStats() : null
  };
}

export function getIdentityResolverStatus() {
  return statusSnapshot();
}

/**
 * Fetch + build the registry once. Promise-guarded: concurrent callers share
 * one in-flight request; a prior error allows a fresh retry. Never blocks app
 * startup and never writes anything.
 * options: { url?, fetchImpl? }
 */
export function loadIdentityRegistry(options = {}) {
  const url = isNonEmptyString(options.url) ? options.url : _state.url;
  const fetchImpl = typeof options.fetchImpl === 'function'
    ? options.fetchImpl
    : (typeof fetch === 'function' ? fetch.bind(globalThis) : null);

  if (_state.status === 'ready' && _state.resolver) {
    return Promise.resolve(statusSnapshot());
  }
  if (_state.status === 'loading' && _state.loadPromise) {
    return _state.loadPromise;
  }

  _state.status = 'loading';
  _state.error = null;
  _state.url = url;

  _state.loadPromise = (async () => {
    try {
      if (!fetchImpl) throw new Error('no fetch implementation available');
      const res = await fetchImpl(url);
      if (!res || !res.ok) throw new Error('registry fetch failed: HTTP ' + (res ? res.status : 'no-response'));
      const json = await res.json();
      const check = validateRegistryData(json);
      if (!check.valid) throw new Error('invalid registry: ' + check.errors.join('; '));
      const resolver = createPlantIdentityResolver(json);
      _state.resolver = resolver;
      _state.registryVersion = resolver.getRegistryVersion();
      _state.status = 'ready';
      _state.error = null;
      return statusSnapshot();
    } catch (err) {
      _state.status = 'error';
      _state.resolver = null;            // never keep a stale/negative resolver
      _state.registryVersion = null;
      _state.error = String(err && (err.message || err) || 'registry load failed');
      return statusSnapshot();
    } finally {
      _state.loadPromise = null;
    }
  })();

  return _state.loadPromise;
}

/**
 * Resolve using an explicit resolver (options.resolver) or the module
 * singleton. If no ready resolver exists, returns `unresolved` with a warning
 * so no runtime behavior is affected while the module is unwired.
 */
export function resolvePlantIdentity(input, options = {}) {
  const resolver = options.resolver || _state.resolver;
  if (!resolver) {
    return makeResult({ status: 'unresolved', inputValue: input, warnings: ['registry-not-loaded'], registryVersion: _state.registryVersion });
  }
  return resolver.resolve(input);
}

export default {
  PLANT_ID_PATTERN,
  validateRegistryData,
  createPlantIdentityResolver,
  loadIdentityRegistry,
  resolvePlantIdentity,
  getIdentityResolverStatus
};
