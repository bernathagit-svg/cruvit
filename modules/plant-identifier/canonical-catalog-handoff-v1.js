// Read-only transport to the host's existing authenticated catalog client.
// No client construction, catalog store, identity resolver, or fallback lookup.
export const CATALOG_SELECT = 'slug,scientific_name,verification_state,needs_review,common_names,media_status,media,climate_traits';
const ROUTE = '/core-v1/plant-identification/';
const REQUEST = 'cruvit:core-pi-catalog-request';
const RESPONSE = 'cruvit:core-pi-catalog-response';
const CLOSED = 'cruvit:core-pi-catalog-closed';
const keys = (v, names) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const text = v => typeof v === 'string' && v.length > 0 && v.length <= 100 && v === v.trim();
const slug = v => text(v) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
const unavailable = () => ({ok: false, reason: 'HOST_CATALOG_UNAVAILABLE'});
const route = (href, origin) => {
  try { const u = new URL(href, origin); return u.origin === origin && u.pathname === ROUTE && !u.search && !u.hash; }
  catch { return false; }
};
const validResponse = r => keys(r, ['status', 'count', 'data']) && r.status === 200
  && Number.isInteger(r.count) && r.count >= 0 && Array.isArray(r.data) && r.data.length <= 2
  && r.data.every(row => row && typeof row === 'object' && !Array.isArray(row));

export function createPiCatalogHost({window, getPersonalDomain}) {
  const origin = window.location.origin, pending = new Map();
  let frame = null, generation = 0, disposed = false;
  function target() {
    if (disposed || origin === 'null' || !frame?.isConnected || !route(frame.src, origin)) return null;
    try { return route(frame.contentWindow.location.href, origin) ? frame.contentWindow : null; }
    catch { return null; }
  }
  function authority() {
    const pd = getPersonalDomain(), session = pd?.getSession?.(), client = pd?.getSupabaseClient?.();
    if (!text(session?.user?.id) || typeof client?.auth?.getUser !== 'function'
        || typeof client?.from !== 'function') throw Error('HOST_AUTHORITY_UNAVAILABLE');
    return {pd, session, client, ownerId: session.user.id};
  }
  const same = (a, b) => a.pd === b.pd && a.session === b.session && a.client === b.client && a.ownerId === b.ownerId;
  async function read(canonicalSlug, current, child, epoch) {
    const guard = () => {
      if (epoch !== generation || target() !== child || !same(current, authority())) throw Error('HOST_AUTHORITY_CHANGED');
    };
    guard();
    const auth = await current.client.auth.getUser();
    guard();
    if (auth?.error || auth?.data?.user?.role !== 'authenticated'
        || auth.data.user.id !== current.ownerId) throw Error('AUTHENTICATED_CATALOG_READ_REQUIRED');
    // Same exact catalog query as the existing authenticated PI read contract.
    const response = await current.client.from('catalog_plants').select(CATALOG_SELECT, {count: 'exact'})
      .eq('slug', canonicalSlug).limit(2);
    guard();
    if (response?.error) throw Error('CATALOG_READ_FAILED');
    const projected = {status: response?.status, count: response?.count,
      data: Array.isArray(response?.data) ? response.data.map(row => row && Object.fromEntries(
        CATALOG_SELECT.split(',').filter(k => Object.hasOwn(row, k)).map(k => [k, structuredClone(row[k])]))) : null};
    if (!validResponse(projected)) throw Error('CATALOG_READ_FAILED');
    return {ok: true, canonicalSlug, response: projected};
  }
  async function receive(event) {
    const child = target(), request = event.data, epoch = generation;
    if (!child || event.source !== child || event.origin !== origin || request?.type !== REQUEST
        || request.operation !== 'read' || !text(request.requestId)) return;
    let result, entry;
    try {
      if (!keys(request, ['type', 'operation', 'requestId', 'canonicalSlug']) || !slug(request.canonicalSlug)) throw Error('INVALID_REQUEST');
      const current = authority(), prior = pending.get(request.requestId);
      if (prior && (prior.slug !== request.canonicalSlug || !same(current, prior.authority))) throw Error('REQUEST_CONFLICT');
      if (!prior && pending.size >= 32) throw Error('READ_LIMIT');
      entry = prior || {slug: request.canonicalSlug, authority: current,
        promise: read(request.canonicalSlug, current, child, epoch).catch(unavailable)};
      pending.set(request.requestId, entry);
      result = await entry.promise;
      if (!same(current, authority())) result = unavailable();
    } catch { result = unavailable(); }
    finally { if (entry && pending.get(request.requestId) === entry) pending.delete(request.requestId); }
    if (epoch === generation && target() === child) child.postMessage({type: RESPONSE, operation: 'read',
      requestId: request.requestId, result}, origin);
  }
  function unbind() {
    const child = target(); generation++; frame = null; pending.clear();
    child?.postMessage({type: CLOSED}, origin);
  }
  function dispose() {
    unbind(); disposed = true; window.removeEventListener('message', receive);
    window.removeEventListener('pagehide', dispose);
  }
  window.addEventListener('message', receive); window.addEventListener('pagehide', dispose);
  return Object.freeze({bind(next) {
    if (next === frame) return true;
    unbind(); if (disposed || !route(next?.src, origin)) return false;
    frame = next; return true;
  }, unbind, dispose});
}

export function createPiCatalogClient({window, timeoutMs = 15000} = {}) {
  const origin = window?.location?.origin, host = window?.parent !== window ? window?.parent : null;
  const pending = new Map(); let disposed = false;
  function finish(id, result) {
    const task = pending.get(id); if (!task) return;
    pending.delete(id); clearTimeout(task.timer);
    if (!keys(result, ['ok', 'canonicalSlug', 'response']) || result.ok !== true
        || result.canonicalSlug !== task.slug || !validResponse(result.response)) task.reject(Error('HOST_CATALOG_UNAVAILABLE'));
    else task.resolve(structuredClone(result.response));
  }
  function receive(event) {
    if (event.source !== host || event.origin !== origin) return;
    const m = event.data;
    if (m?.type === CLOSED) { dispose(); return; }
    if (m?.type === RESPONSE && m.operation === 'read') finish(m.requestId, m.result);
  }
  function dispose() {
    disposed = true;
    for (const id of [...pending.keys()]) finish(id, unavailable());
    window?.removeEventListener('message', receive); window?.removeEventListener('pagehide', dispose);
  }
  window?.addEventListener('message', receive); window?.addEventListener('pagehide', dispose);
  return Object.freeze({readCanonicalRow(canonicalSlug) {
    if (!host || disposed || !origin || origin === 'null' || !slug(canonicalSlug) || pending.size >= 16) {
      return Promise.reject(Error('HOST_CATALOG_UNAVAILABLE'));
    }
    const requestId = 'pi-catalog-' + window.crypto.randomUUID();
    return new Promise((resolve, reject) => {
      pending.set(requestId, {slug: canonicalSlug, resolve, reject,
        timer: setTimeout(() => finish(requestId, unavailable()), timeoutMs)});
      try { host.postMessage({type: REQUEST, operation: 'read', requestId, canonicalSlug}, origin); }
      catch { finish(requestId, unavailable()); }
    });
  }, dispose});
}
