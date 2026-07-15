/**
 * Cruvit — Plant Identity Shadow Adapter (startup-only, non-authoritative)
 * ---------------------------------------------------------------------------
 * First runtime adoption of the Shared Plant Identity Resolver in SHADOW mode:
 * it loads the central identity registry at startup and exposes a single frozen,
 * guarded global (window.CruvitIdentityShadow) for advisory / developer
 * inspection ONLY.
 *
 * NON-AUTHORITATIVE CONTRACT
 *  - Zero runtime consumers: no existing function calls this adapter.
 *  - Advisory only: it never changes a legacy resolver result, never persists
 *    plantId/canonicalSlug, never migrates saved plants, never mutates input,
 *    never writes storage, never touches the DOM, never emits UI warnings,
 *    never sends telemetry, and never blocks application startup.
 *  - Read-only network: the only request is the resolver foundation's single
 *    same-origin GET of data/plant-identity.registry.json (fire-and-forget).
 *  - Reversible: delete this file and remove its one <script type="module">
 *    line from index.html.
 *
 * GLOBAL API (frozen)
 *  window.CruvitIdentityShadow = { get(input), status(), version() }
 */

import {
  loadIdentityRegistry,
  resolvePlantIdentity,
  getIdentityResolverStatus
} from './plant-identity-resolver.js';

/** Safe, primitive-only snapshot of the loader status (no internal refs). */
function safeStatus() {
  try {
    const s = getIdentityResolverStatus() || {};
    return Object.freeze({
      status: typeof s.status === 'string' ? s.status : 'idle',
      registryVersion: s.registryVersion != null ? String(s.registryVersion) : null,
      error: s.error != null ? String(s.error) : null
    });
  } catch (_e) {
    return Object.freeze({ status: 'error', registryVersion: null, error: 'status-unavailable' });
  }
}

/** Advisory resolve: null unless the registry is ready; never throws. */
function get(input) {
  try {
    if (safeStatus().status !== 'ready') return null;
    return resolvePlantIdentity(input);
  } catch (_e) {
    return null;
  }
}

/** registryVersion when ready, else null; never throws. */
function version() {
  try {
    const s = safeStatus();
    return s.status === 'ready' ? s.registryVersion : null;
  } catch (_e) {
    return null;
  }
}

const adapter = Object.freeze({
  get,
  status: safeStatus,
  version
});

// Install the guarded global immediately (before load completes), once.
try {
  if (typeof window !== 'undefined' && !window.CruvitIdentityShadow) {
    Object.defineProperty(window, 'CruvitIdentityShadow', {
      value: adapter,
      writable: false,
      configurable: false,
      enumerable: true
    });
  }
} catch (_e) {
  // Never let adapter installation affect application startup.
}

// Fire-and-forget registry load. The resolver foundation is promise-guarded and
// resolves its own promise even on failure, so this catch is defensive only.
try {
  Promise.resolve(loadIdentityRegistry()).catch(() => {});
} catch (_e) {
  // Swallow: startup must proceed exactly as before.
}

/* ─────────────── developer-only advisory comparison controller ───────────────
 * window.CruvitIdentityShadowDebug — non-persisted, OFF on every fresh load.
 * Enable ONLY via an explicit console call: CruvitIdentityShadowDebug.enable().
 * No URL-query / localStorage / sessionStorage / cookie activation. It records a
 * bounded (max 50), deduplicated, in-memory comparison between the legacy plant
 * resolver result and the advisory shadow resolver result — purely for
 * development inspection. It never persists, never touches the DOM, never logs
 * by default, never mutates input or the legacy result, and never throws.
 */
const DEBUG_BUFFER_MAX = 50;
const _debug = {
  enabled: false,
  entries: [], // [{ key, rec }] — rec is frozen; key never exposed
  seen: new Set()
};

function _isStr(v) { return typeof v === 'string' && v.trim().length > 0; }

/** Conservative primitive input key; never JSON.stringifies plant objects. */
function debugInputKey(input) {
  try {
    if (typeof input === 'string') return input;
    if (input && typeof input === 'object') {
      const meta = (input.meta && typeof input.meta === 'object') ? input.meta : null;
      const cands = [input.plantId, input.canonicalSlug, input.profileSlug, input.slug,
        meta ? meta.slug : null, input.scientificName, input.scientific, input.name];
      for (const c of cands) if (_isStr(c)) return c.trim();
      return '[object-input]';
    }
    if (input == null) return '[null-input]';
    return '[' + (typeof input) + '-input]';
  } catch (_e) { return '[input-error]'; }
}

/** Read-only slug extraction from the legacy result (never mutates it). */
function legacySlugOf(legacyResult) {
  try {
    if (!legacyResult || typeof legacyResult !== 'object') return null;
    if (_isStr(legacyResult.slug)) return legacyResult.slug.trim();
    if (_isStr(legacyResult.canonicalSlug)) return legacyResult.canonicalSlug.trim();
    if (_isStr(legacyResult.profileSlug)) return legacyResult.profileSlug.trim();
    if (legacyResult.meta && typeof legacyResult.meta === 'object' && _isStr(legacyResult.meta.slug)) {
      return legacyResult.meta.slug.trim();
    }
    return null;
  } catch (_e) { return null; }
}

/** Read-only scientific-name extraction from the legacy result. */
function legacyScientificOf(legacyResult) {
  try {
    if (!legacyResult || typeof legacyResult !== 'object') return null;
    if (_isStr(legacyResult.acceptedScientificName)) return legacyResult.acceptedScientificName.trim();
    if (_isStr(legacyResult.scientificName)) return legacyResult.scientificName.trim();
    if (_isStr(legacyResult.scientific)) return legacyResult.scientific.trim();
    if (_isStr(legacyResult.latin)) return legacyResult.latin.trim();
    return null;
  } catch (_e) { return null; }
}

/** Small, safe copy of conflict fields only (no live refs). */
function conflictSnapshot(conflict) {
  try {
    if (!conflict || typeof conflict !== 'object') return null;
    return Object.freeze({
      slug: _isStr(conflict.slug) ? conflict.slug : null,
      conflictType: _isStr(conflict.conflictType) ? conflict.conflictType : null,
      resolutionStatus: _isStr(conflict.resolutionStatus) ? conflict.resolutionStatus : null
    });
  } catch (_e) { return null; }
}

function computeAgreement(identityStatus, matchedBy, inputKey, legacySlug, canonicalSlug) {
  try {
    if (identityStatus === 'pending_conflict') return false;
    if (identityStatus !== 'resolved_id' && identityStatus !== 'resolved_canonical') return null;
    if (!_isStr(canonicalSlug) || !_isStr(legacySlug)) return null;
    if (canonicalSlug === legacySlug) return true;
    if ((matchedBy === 'aliasSlug' || matchedBy === 'moduleKey') && inputKey === legacySlug) return true;
    return false;
  } catch (_e) { return null; }
}

/** Build one frozen, primitive-only comparison record. Never throws. */
function buildDebugRecord(input, legacyResult) {
  const inputKey = debugInputKey(input);
  const legacyResolvedSlug = legacySlugOf(legacyResult);
  const legacyScientificName = legacyScientificOf(legacyResult);
  let identityStatus = 'unavailable';
  let loaderStatus = 'unavailable';
  let plantId = null, canonicalSlug = null, matchedBy = null, conflict = null;
  let warnings = [];

  try {
    const A = (typeof window !== 'undefined') ? window.CruvitIdentityShadow : null;
    if (!A || typeof A.get !== 'function') {
      identityStatus = 'unavailable';
    } else {
      try { const s = A.status && A.status(); loaderStatus = (s && _isStr(s.status)) ? s.status : 'unavailable'; }
      catch (_e) { loaderStatus = 'unavailable'; }

      if (loaderStatus === 'idle' || loaderStatus === 'loading') {
        identityStatus = 'not-ready';
      } else if (loaderStatus !== 'ready') {
        identityStatus = 'unavailable';
      } else {
        let r; let threw = false;
        try { r = A.get(input); } catch (_e) { threw = true; }
        if (threw) {
          identityStatus = 'unavailable';
        } else if (!r || typeof r !== 'object' || !_isStr(r.status)) {
          identityStatus = 'invalid-result';
        } else {
          identityStatus = r.status;
          if (Array.isArray(r.warnings)) warnings = r.warnings.filter(w => typeof w === 'string').slice(0, 8);
          switch (r.status) {
            case 'resolved_id':
              plantId = _isStr(r.plantId) ? r.plantId : null;
              canonicalSlug = _isStr(r.canonicalSlug) ? r.canonicalSlug : null;
              matchedBy = _isStr(r.matchedBy) ? r.matchedBy : null;
              break;
            case 'resolved_canonical':
              plantId = null;
              canonicalSlug = _isStr(r.canonicalSlug) ? r.canonicalSlug : null;
              matchedBy = _isStr(r.matchedBy) ? r.matchedBy : null;
              break;
            case 'pending_conflict':
              plantId = null;
              canonicalSlug = null;
              conflict = conflictSnapshot(r.conflict);
              matchedBy = _isStr(r.matchedBy) ? r.matchedBy : null;
              break;
            case 'ambiguous':
            case 'provisional':
            case 'unresolved':
              matchedBy = _isStr(r.matchedBy) ? r.matchedBy : null;
              break;
            default:
              identityStatus = 'invalid-result';
          }
        }
      }
    }
  } catch (_e) {
    identityStatus = 'unavailable';
  }

  const agreesWithLegacy = computeAgreement(identityStatus, matchedBy, inputKey, legacyResolvedSlug, canonicalSlug);

  return Object.freeze({
    inputKey,
    legacyResolvedSlug,
    legacyScientificName,
    identityStatus,
    loaderStatus,
    plantId,
    canonicalSlug,
    matchedBy,
    agreesWithLegacy,
    conflict,
    warnings: Object.freeze(warnings)
  });
}

function debugDedupeKey(rec) {
  return [rec.inputKey, rec.identityStatus, rec.canonicalSlug || '', rec.plantId || '', rec.legacyResolvedSlug || ''].join('|');
}

const debugController = Object.freeze({
  enable() { try { _debug.enabled = true; } catch (_e) {} },
  disable() { try { _debug.enabled = false; } catch (_e) {} },
  isEnabled() { try { return _debug.enabled === true; } catch (_e) { return false; } },
  record(input, legacyResult) {
    try {
      if (_debug.enabled !== true) return null;
      const rec = buildDebugRecord(input, legacyResult);
      const key = debugDedupeKey(rec);
      if (_debug.seen.has(key)) return rec; // dedupe: do not grow the buffer
      _debug.seen.add(key);
      _debug.entries.push({ key, rec });
      while (_debug.entries.length > DEBUG_BUFFER_MAX) {
        const old = _debug.entries.shift();
        if (old) _debug.seen.delete(old.key);
      }
      return rec;
    } catch (_e) { return null; }
  },
  latest() {
    try { return _debug.entries.length ? _debug.entries[_debug.entries.length - 1].rec : null; }
    catch (_e) { return null; }
  },
  snapshot() {
    try { return Object.freeze(_debug.entries.map(e => e.rec)); }
    catch (_e) { return Object.freeze([]); }
  },
  clear() {
    try { _debug.entries = []; _debug.seen.clear(); } catch (_e) {}
  }
});

try {
  if (typeof window !== 'undefined' && !window.CruvitIdentityShadowDebug) {
    Object.defineProperty(window, 'CruvitIdentityShadowDebug', {
      value: debugController,
      writable: false,
      configurable: false,
      enumerable: true
    });
  }
} catch (_e) {
  // Never let debug-controller installation affect application startup.
}

export default adapter;
