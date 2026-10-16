// Separate host-only observer. No evaluator, garden store, persistence, or Save API.
const ROUTE = '/core-v1/plant-identification/';
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function createPiAcceptedReviewPublication({window, onPublish = () => {}}) {
  const origin = window.location.origin;
  let frame = null, candidate = null, surface = null, unsubscribe = null, accepted = null, baseline = null;
  let record = Object.freeze({valid: false, reason: 'NO_ACCEPTED_REVIEW'});
  function target() {
    try {
      const src = new URL(frame?.src, origin), actual = new URL(frame.contentWindow.location.href);
      return frame.isConnected && [src, actual].every(u => u.origin === origin && u.pathname === ROUTE && !u.search && !u.hash)
        ? frame.contentWindow : null;
    } catch { return null; }
  }
  function invalidate(reason = 'REVIEW_INVALIDATED') {
    candidate = null; accepted = null; baseline = null;
    record = Object.freeze({...record, valid: false, reason});
  }
  function inspect() {
    try {
      if (!candidate || target() !== candidate.child || !candidate.isCurrent()) return invalidate('HOST_CONTEXT_CHANGED');
      const value = surface?.read();
      if (accepted) { if (value !== accepted) invalidate('PI_REVIEW_INVALIDATED'); return; }
      if (!value || value === candidate.baseline) return;
      // Identities/context are taken from the validated HOST result, never a child claim.
      if (!Object.isFrozen(value) || !equal(value, candidate.result)) return invalidate('REVIEW_MISMATCH');
      const r = candidate.result, id = r.identity, garden = r.context?.readiness?.gardenProfileId;
      if (!r.ok || !id?.canonicalSlug || !id.scientific || !id.actionId || !garden
          || r.context.location?.gardenProfileId !== garden || r.evaluation?.gardenProfileId !== garden) return invalidate('INVALID_HOST_REVIEW');
      accepted = value; candidate.result = null;
      record = Object.freeze({valid: true, canonicalSlug: id.canonicalSlug, scientific: id.scientific,
        actionId: id.actionId, reviewedGardenProfileId: garden, operationId: candidate.operationId});
      try { onPublish(record); } catch {}
    } catch { invalidate('HOST_CONTEXT_UNAVAILABLE'); }
  }
  function attach() {
    unsubscribe?.(); unsubscribe = null; surface = null;
    try {
      const child = target(), descriptor = child && Object.getOwnPropertyDescriptor(child, 'cruvitCorePiReviewSurface');
      if (!descriptor || descriptor.writable || descriptor.configurable || !Object.isFrozen(descriptor.value)) return;
      const value = descriptor.value;
      if (Object.keys(value).sort().join(',') !== 'read,subscribe' || typeof value.read !== 'function' || typeof value.subscribe !== 'function') return;
      surface = value; unsubscribe = surface.subscribe(inspect); inspect();
    } catch { invalidate('PI_SURFACE_UNAVAILABLE'); }
  }
  const changed = () => invalidate('HOST_CONTEXT_CHANGED');
  const events = ['cruvit:garden-context-ready', 'cruvit:auth-session-changed'];
  for (const name of events) window.addEventListener(name, changed);
  function unbind() {
    frame?.removeEventListener('load', attach); unsubscribe?.(); unsubscribe = null;
    surface = null; frame = null; invalidate('HOST_UNBOUND');
  }
  function dispose() {
    unbind(); for (const name of events) window.removeEventListener(name, changed);
    window.removeEventListener('pagehide', dispose);
  }
  window.addEventListener('pagehide', dispose);
  // This observer object is injected directly by host composition, never exposed to child.
  const observer = Object.freeze({
    pending({child}) { if (target() === child) { const previous = surface?.read(); invalidate('EVALUATION_PENDING'); baseline = previous; } },
    validated(value) {
      if (target() !== value.child || typeof value.isCurrent !== 'function') return;
      candidate = {...value, baseline}; inspect();
    }, invalidate
  });
  return Object.freeze({observer,
    bind(next) {
      unbind();
      try {
        const src = new URL(next?.src, origin);
        if (src.origin !== origin || src.pathname !== ROUTE || src.search || src.hash || !next.isConnected) return false;
        frame = next; frame.addEventListener('load', attach); attach(); return true;
      } catch { unbind(); return false; }
    },
    unbind, dispose,
    read() { if (candidate) inspect(); return Object.freeze({...record}); }
  });
}
