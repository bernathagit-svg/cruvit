// Read-only, live-host handoff. Like Garden Design, only the bound same-origin
// child may request context/evaluation. No context store, scoring, or I/O here.
export const CORE_PI_ROUTE = '/core-v1/plant-identification/';
const REQUEST = 'cruvit:core-pi-suitability-request';
const RESPONSE = 'cruvit:core-pi-suitability-response';
const CLOSED = 'cruvit:core-pi-suitability-closed';
const unavailable = reason => ({ok: false, reason, context: null, evaluation: null});
const copy = value => value == null ? null : structuredClone(value);
const select = (value, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(value || {}, key))
  .map(key => [key, copy(value[key])]));
const locationKeys = ['status', 'askForLocation', 'useForSuitability', 'lat', 'lon', 'reason',
  'gardenProfileId', 'climateAuthority', 'locationConfidence', 'confirmationStatus', 'source', 'label', 'engine'];
const readinessKeys = ['status', 'authenticated', 'gardenProfileId', 'gardenCount', 'profilesHydrated'];

export function createPiSuitabilityHost({window, getReadiness, getLocationContext, hasTrustedLocation,
  getClimateProfile, getSiteContext, resolveCanonicalPlant, evaluateSuitability, reviewObserver = null}) {
  let frame = null, disposed = false;
  const origin = window.location.origin;
  function target() {
    if (disposed || !frame?.isConnected) return null;
    try {
      const src = new URL(frame.src, origin);
      if (src.origin !== origin || src.pathname !== CORE_PI_ROUTE || src.search || src.hash) return null;
      // A frame navigation must not inherit the previous route's capability.
      const actual = new URL(frame.contentWindow.location.href);
      return actual.origin === origin && actual.pathname === CORE_PI_ROUTE
        && !actual.search && !actual.hash ? frame.contentWindow : null;
    } catch { return null; }
  }
  function context() {
    return {
      readiness: select(getReadiness(), readinessKeys),
      location: select(getLocationContext(), locationKeys),
      trusted: hasTrustedLocation() === true,
      climateProfile: copy(getClimateProfile()),
      siteContext: copy(getSiteContext())
    };
  }
  const currentSelection = value => JSON.stringify({readiness: value.readiness,
    location: value.location, trusted: value.trusted, siteContext: value.siteContext});
  // Host-only observer. It cannot change child-facing replies or their validation.
  const observe = (method, value) => { try { reviewObserver?.[method]?.(value); } catch {} };
  function receive(event) {
    const child = target(), request = event.data;
    if (origin === 'null' || !child || event.source !== child || event.origin !== origin || request?.type !== REQUEST
        || !['context', 'evaluate'].includes(request.operation)
        || typeof request.requestId !== 'string' || request.requestId.length > 100) return;
    if (request.operation === 'evaluate') observe('pending', {child, operationId: request.requestId});
    let result;
    try {
      const current = context();
      if (request.operation === 'context') result = {ok: true, context: current, evaluation: null};
      else if (current.readiness.status !== 'READY' || current.readiness.authenticated !== true
          || !current.readiness.gardenProfileId || !current.trusted || current.location.useForSuitability !== true
          || current.location.gardenProfileId !== current.readiness.gardenProfileId) {
        result = {...unavailable('HOST_CONTEXT_NOT_READY'), context: current};
      } else {
        const input = request.identity;
        const plant = typeof input?.canonicalSlug === 'string' && typeof input.scientific === 'string'
          && typeof input.actionId === 'string' && input.actionId.length > 0 && input.actionId.length <= 100
          ? resolveCanonicalPlant({slug: input.canonicalSlug, scientific: input.scientific}) : null;
        if (!plant || plant.slug !== input.canonicalSlug || plant.scientific !== input.scientific) {
          result = {...unavailable('HOST_CANONICAL_IDENTITY_UNAVAILABLE'), context: current};
        } else {
          // The existing host path owns plant lookup, climate, evidence and scoring.
          const evaluation = evaluateSuitability(plant.slug);
          if (!evaluation || evaluation.then || evaluation.engine !== 'smartRecEvaluateSuitability'
              || evaluation.paidAiCalls !== 0) result = unavailable('HOST_EVALUATOR_UNAVAILABLE');
          // Host evaluation is synchronous. Check selection continuity, not elapsed
          // weatherAgeMs in the host's computed climate profile.
          else if (currentSelection(context()) !== currentSelection(current)) result = unavailable('HOST_CONTEXT_CHANGED');
          else result = {ok: true, context: current,
            identity: select(input, ['canonicalSlug', 'scientific', 'actionId']), evaluation: copy(evaluation)};
        }
      }
    } catch { result = unavailable('HOST_AUTHORITY_UNAVAILABLE'); }
    if (request.operation === 'evaluate') {
      if (result.ok === true && target() === child) {
        const selected = currentSelection(result.context);
        observe('validated', {child, operationId: request.requestId, result: copy(result),
          isCurrent: () => target() === child && currentSelection(context()) === selected});
      } else observe('invalidate', 'EVALUATION_REJECTED');
    }
    if (target() === child) child.postMessage({type: RESPONSE, requestId: request.requestId,
      operation: request.operation, result}, origin);
  }
  function unbind() {
    observe('invalidate', 'HOST_UNBOUND');
    const child = target(); frame = null;
    child?.postMessage({type: CLOSED}, origin);
  }
  function dispose() {
    unbind(); disposed = true;
    window.removeEventListener('message', receive);
    window.removeEventListener('pagehide', dispose);
  }
  window.addEventListener('message', receive);
  window.addEventListener('pagehide', dispose);
  return Object.freeze({
    bind(nextFrame) {
      unbind();
      if (disposed) return false;
      const src = new URL(nextFrame?.src || '', origin);
      if (src.origin !== origin || src.pathname !== CORE_PI_ROUTE || src.search || src.hash) return false;
      frame = nextFrame; return true;
    }, unbind, dispose
  });
}

export function createPiSuitabilityClient({window, readCanonicalResult, timeoutMs = 2500}) {
  const origin = window.location.origin, host = window.parent !== window ? window.parent : null;
  const pending = new Map();
  let serial = 0, disposed = false;
  function finish(id, result) {
    const task = pending.get(id); if (!task) return;
    pending.delete(id); clearTimeout(task.timer);
    if (task.current && readCanonicalResult()?.state !== task.current.state) result = unavailable('PI_RESULT_CHANGED');
    task.resolve(result);
  }
  function receive(event) {
    if (!host || event.source !== host || event.origin !== origin) return;
    const message = event.data;
    if (message?.type === CLOSED) { dispose(); return; }
    const task = pending.get(message?.requestId);
    if (message?.type !== RESPONSE || !task || message.operation !== task.operation) return;
    finish(message.requestId, message.result || unavailable('HOST_AUTHORITY_UNAVAILABLE'));
  }
  function request(operation, current = null) {
    if (!host || disposed) return Promise.resolve(unavailable('HOST_UNAVAILABLE'));
    // Two bounded read operations, with no retries, polling or retained context.
    for (const task of pending.values()) if (task.operation === operation) return task.promise;
    const requestId = 'pi-suitability-' + (++serial) + '-' + window.crypto.randomUUID();
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    const timer = setTimeout(() => finish(requestId, unavailable('HOST_UNAVAILABLE')), timeoutMs);
    pending.set(requestId, {resolve, promise, timer, operation, current});
    try {
      const identity = current ? {canonicalSlug: current.canonicalSlug, scientific: current.scientific,
        actionId: current.actionId} : undefined;
      host.postMessage({type: REQUEST, requestId, operation, ...(identity ? {identity} : {})}, origin);
    } catch { finish(requestId, unavailable('HOST_UNAVAILABLE')); }
    return promise;
  }
  function dispose() {
    disposed = true;
    for (const id of [...pending.keys()]) finish(id, unavailable('HOST_UNAVAILABLE'));
    window.removeEventListener('message', receive);
    window.removeEventListener('pagehide', dispose);
  }
  window.addEventListener('message', receive);
  window.addEventListener('pagehide', dispose);
  return Object.freeze({
    readContext: () => request('context'),
    evaluateCurrent() {
      const current = readCanonicalResult();
      return current ? request('evaluate', current) : Promise.resolve(unavailable('PI_RESULT_NOT_READY'));
    }, dispose
  });
}
