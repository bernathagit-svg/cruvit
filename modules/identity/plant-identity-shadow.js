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

export default adapter;
