// Transport/binding only. The preserved Atomic controller owns intent, RPC and readback.
import {createCanonicalIdentifierSaveController, assertIdentifierSaveReadback} from '../../core-v1/plant-identification/atomic/save-controller.mjs';
import {createIdentifierSaveDomain} from '../../core-v1/plant-identification/atomic/preview-domain.mjs';

const ROUTE = '/core-v1/plant-identification/';
const REQUEST = 'cruvit:core-pi-atomic-save-request';
const RESPONSE = 'cruvit:core-pi-atomic-save-response';
const CLOSED = 'cruvit:core-pi-atomic-save-closed';
const fail = reason => Object.freeze({ok: false, reason, receipt: null});
const text = v => typeof v === 'string' && v.length > 0 && v.length <= 200
  && v === v.trim() && !/[\u0000-\u001f\u007f]/.test(v);
const keys = (v, names) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const intentKeys = ['actionId', 'clientInstanceId', 'canonicalSlug', 'scientificName', 'displayName'];
const identityKeys = intentKeys.filter(key => key !== 'clientInstanceId');
const reviewIdentity = review => JSON.stringify(['canonicalSlug', 'scientific', 'actionId', 'reviewedGardenProfileId', 'operationId'].map(key => review[key]));
const fingerprint = intent => JSON.stringify(intentKeys.map(k => intent[k]));
const validIntent = v => keys(v, intentKeys) && intentKeys.every(k => text(v[k]));
const route = (url, origin) => {
  try { const u = new URL(url, origin); return u.origin === origin && u.pathname === ROUTE && !u.search && !u.hash; }
  catch { return false; }
};

export function createPiAtomicSaveHost({window, getPersonalDomain, getAcceptedReview = () => null,
  createController = createCanonicalIdentifierSaveController, createDomain = createIdentifierSaveDomain}) {
  const origin = window.location.origin, intents = new Map(), requests = new Map(), beginnings = new Map();
  let frame = null, generation = 0, disposed = false;
  function target() {
    if (disposed || origin === 'null' || !frame?.isConnected || !route(frame.src, origin)) return null;
    try { return route(frame.contentWindow.location.href, origin) ? frame.contentWindow : null; }
    catch { return null; }
  }
  function authority() {
    const pd = getPersonalDomain(), readiness = pd?.getGardenContextReadiness?.();
    const session = pd?.getSession?.(), client = pd?.getSupabaseClient?.(), gardenId = pd?.getActiveGardenId?.();
    if (readiness?.status !== 'READY' || readiness.authenticated !== true || readiness.profilesHydrated !== true
        || !text(gardenId) || readiness.gardenProfileId !== gardenId || !text(session?.user?.id)
        || !client || typeof pd?.hydrateActiveGardenPlants !== 'function') throw Error('HOST_NOT_READY');
    return {pd, session, client, gardenId, ownerId: session.user.id};
  }
  function reviewed(intent, current, entry = null) {
    const review = getAcceptedReview();
    if (review?.valid !== true || !text(review.operationId) || !text(review.reviewedGardenProfileId)) throw Error('REVIEW_REQUIRED');
    if (review.canonicalSlug !== intent.canonicalSlug || review.scientific !== intent.scientificName
        || review.actionId !== intent.actionId) throw Error('REVIEW_IDENTITY_MISMATCH');
    if (review.reviewedGardenProfileId !== current.gardenId) throw Error('TARGET_GARDEN_CHANGED');
    if (entry && (entry.reviewIdentity !== reviewIdentity(review) || entry.gardenId !== current.gardenId
        || entry.ownerId !== current.ownerId)) throw Error('REVIEW_CHANGED');
    return review;
  }
  function sameAuthority(a, b) {
    return a.pd === b.pd && a.client === b.client && a.session === b.session
      && a.gardenId === b.gardenId && a.ownerId === b.ownerId;
  }
  async function execute(intent, entry, current, child, epoch) {
    const guard = () => {
      if (generation !== epoch || target() !== child || !sameAuthority(current, authority())) throw Error('HOST_CONTEXT_CHANGED');
      reviewed(intent, current, entry);
    };
    const totals = {rpcCalls: 0, supabaseWrites: 0};
    // Meter/guard the existing authenticated client; never construct a second client.
    const client = {auth: current.client.auth,
      from(...args) { guard(); return current.client.from(...args); },
      rpc(name, args) {
        guard();
        if (name !== 'add_garden_plant_once_v1' || totals.rpcCalls) throw Error('UNEXPECTED_COMMAND');
        totals.rpcCalls++; totals.supabaseWrites++;
        return current.client.rpc(name, args);
      }};
    const domain = createDomain({client, metrics: () => ({...totals}),
      delta: before => Object.fromEntries(Object.keys(totals).map(k => [k, totals[k] - before[k]]))});
    const context = {gardenId: current.gardenId, ownerId: current.ownerId,
      clientInstanceId: intent.clientInstanceId, canonicalSlug: intent.canonicalSlug,
      scientificName: intent.scientificName, displayName: intent.displayName};
    guard();
    const controller = createController({context, domain,
      stateStore: {read: () => structuredClone(entry.attemptState), write: value => { entry.attemptState = structuredClone(value); }}});
    const receipt = await controller.save();
    guard();
    if (receipt?.hydration !== 'VERIFIED' || receipt.clientInstanceId !== intent.clientInstanceId
        || !text(receipt.plant?.id) || !text(receipt.history?.id)
        || receipt.counts?.rpcCalls !== 1 || receipt.counts.supabaseWrites !== 1) throw Error('UNVERIFIED_RECEIPT');
    // Reuse the authority's validator, not another readback implementation.
    assertIdentifierSaveReadback(receipt.readback, {gardenId: current.gardenId, ownerId: current.ownerId,
      clientInstanceId: intent.clientInstanceId, fixture: {profileSlug: intent.canonicalSlug,
        scientific: intent.scientificName, name: intent.displayName}},
    {plantId: receipt.plant.id, historyId: receipt.history.id});
    // The transported envelope must agree with the already-verified readback.
    if (['id', 'user_id', 'garden_profile_id', 'client_instance_id', 'profile_slug', 'scientific']
      .some(key => receipt.plant[key] !== receipt.readback.plant[key])
      || ['id', 'garden_plant_id', 'event_type', 'source_module']
        .some(key => receipt.history[key] !== receipt.readback.history[key])
      || ['user_id', 'garden_profile_id'].some(key => Object.hasOwn(receipt.history, key)
        && receipt.history[key] !== receipt.readback.history[key])) throw Error('RECEIPT_READBACK_MISMATCH');
    if (await current.pd.hydrateActiveGardenPlants() !== true) throw Error('HOST_REFRESH_UNCONFIRMED');
    guard();
    return Object.freeze({ok: true, receipt: Object.freeze({canonicalSlug: intent.canonicalSlug,
      clientInstanceId: intent.clientInstanceId, gardenId: current.gardenId,
      plantId: receipt.plant.id, historyId: receipt.history.id})});
  }
  async function receive(event) {
    const child = target(), request = event.data, epoch = generation;
    if (!child || event.source !== child || event.origin !== origin || request?.type !== REQUEST
        || !['begin', 'save'].includes(request.operation) || !text(request.requestId)) return;
    let result;
    try {
      if (request.operation === 'begin') {
        if (!keys(request, ['type', 'operation', 'requestId', 'identity']) || !keys(request.identity, identityKeys)
            || !identityKeys.every(key => text(request.identity[key]))) throw Error('INVALID_REQUEST');
        const current = authority(), review = reviewed(request.identity, current);
        const identity = JSON.stringify(identityKeys.map(key => request.identity[key]));
        const prior = beginnings.get(request.requestId);
        if (prior && (prior.identity !== identity || prior.reviewIdentity !== reviewIdentity(review)
            || !sameAuthority(prior.authority, current))) throw Error('REQUEST_IDENTITY_CONFLICT');
        if (prior) result = prior.result;
        else {
          if (intents.size >= 32 || beginnings.size >= 128) throw Error('HANDOFF_LIMIT');
          // Same existing per-action/random-instance intent mechanism; host-private target binding.
          const intent = Object.freeze({...request.identity,
            clientInstanceId: 'identifier:' + request.identity.actionId + ':' + window.crypto.randomUUID()});
          if (!validIntent(intent)) throw Error('INVALID_REQUEST');
          if (intents.has(intent.clientInstanceId)) throw Error('INTENT_IDENTITY_CONFLICT');
          const entry = {identity: fingerprint(intent), gardenId: current.gardenId, ownerId: current.ownerId,
            reviewIdentity: reviewIdentity(review), attemptState: {attempts: 0}, promise: null};
          intents.set(intent.clientInstanceId, entry);
          result = Object.freeze({ok: true, intent});
          beginnings.set(request.requestId, {identity, reviewIdentity: entry.reviewIdentity, authority: current, result});
        }
      } else {
      if (!keys(request, ['type', 'operation', 'requestId', 'intent']) || !validIntent(request.intent)) throw Error('INVALID_REQUEST');
      const intent = request.intent, identity = fingerprint(intent), current = authority();
      const bound = intents.get(intent.clientInstanceId);
      if (!bound || bound.identity !== identity) throw Error('INTENT_IDENTITY_CONFLICT');
      reviewed(intent, current, bound);
      const prior = requests.get(request.requestId);
      if (prior && (prior.identity !== identity || !sameAuthority(prior.authority, current))) throw Error('REQUEST_IDENTITY_CONFLICT');
      if (prior) result = await prior.promise;
      else {
        let entry = intents.get(intent.clientInstanceId);
        if (entry && (entry.identity !== identity || entry.gardenId !== current.gardenId || entry.ownerId !== current.ownerId)) {
          throw Error('INTENT_IDENTITY_CONFLICT');
        }
        if (requests.size >= 128 || !entry && intents.size >= 32) throw Error('HANDOFF_LIMIT');
        if (!entry.promise) entry.promise = execute(intent, entry, current, child, epoch)
          .catch(() => fail('SAVE_UNCONFIRMED')).finally(() => { entry.promise = null; });
        requests.set(request.requestId, {identity, authority: current, promise: entry.promise});
        result = await entry.promise;
      }
      if (!sameAuthority(current, authority())) result = fail('HOST_CONTEXT_CHANGED');
      reviewed(intent, current, bound);
      }
    } catch (error) { result = fail(['REVIEW_REQUIRED', 'REVIEW_IDENTITY_MISMATCH', 'TARGET_GARDEN_CHANGED', 'REVIEW_CHANGED', 'HOST_NOT_READY'].includes(error?.message) ? error.message : 'HOST_REQUEST_REJECTED'); }
    if (generation === epoch && target() === child) child.postMessage({type: RESPONSE, operation: request.operation,
      requestId: request.requestId, result}, origin);
  }
  function unbind() {
    const child = target(); generation++; frame = null; intents.clear(); requests.clear(); beginnings.clear();
    child?.postMessage({type: CLOSED}, origin);
  }
  function dispose() {
    unbind(); disposed = true;
    window.removeEventListener('message', receive); window.removeEventListener('pagehide', dispose);
  }
  window.addEventListener('message', receive); window.addEventListener('pagehide', dispose);
  return Object.freeze({bind(next) {
    if (next === frame) return true;
    unbind(); if (disposed || !route(next?.src, origin)) return false;
    frame = next; return true;
  }, unbind, dispose});
}

// Observe only the existing host-owned direct-child Core PI iframe. Its accepted
// open/close composition and the read-only suitability handoff stay byte-identical.
export function bindPiAtomicSaveHostFrame({window, document, host}) {
  let bound = null;
  const sync = () => {
    const frames = [...document.body.children].filter(el => el.tagName === 'IFRAME'
      && el.title === 'CRUVIT Plant Identification' && route(el.src, window.location.origin));
    const next = frames.length === 1 ? frames[0] : null;
    if (next === bound) return;
    host.unbind(); bound = next; if (bound) host.bind(bound);
  };
  const observer = new window.MutationObserver(sync);
  observer.observe(document.body, {childList: true, attributes: true, subtree: true, attributeFilter: ['src', 'title']});
  const dispose = () => { observer.disconnect(); host.dispose(); window.removeEventListener('pagehide', dispose); };
  window.addEventListener('pagehide', dispose); sync(); return dispose;
}

export function createPiAtomicSaveClient({window, readCanonicalResult, timeoutMs = 15000}) {
  const origin = window.location.origin, host = window.parent !== window ? window.parent : null;
  let intent = null, current = null, pending = null, beginning = null, disposed = false;
  let state = Object.freeze({status: 'IDLE', receipt: null});
  function finish(result) {
    const task = pending; if (!task) return;
    pending = null; clearTimeout(task.timer);
    if (readCanonicalResult()?.state !== task.current.state || current !== task.current) result = fail('PI_RESULT_CHANGED');
    state = Object.freeze({status: result.ok ? 'SAVED' : 'SAVE_UNCONFIRMED', receipt: result.receipt || null});
    task.resolve(result);
  }
  function invalidate() {
    if (beginning) { const task = beginning; beginning = null; clearTimeout(task.timer); task.resolve(null); }
    intent = null; current = null; finish(fail('PI_RESULT_CHANGED'));
    state = Object.freeze({status: 'INVALIDATED', receipt: null});
  }
  function receive(event) {
    if (!host || event.source !== host || event.origin !== origin) return;
    const m = event.data;
    if (m?.type === CLOSED) { dispose(); return; }
    if (m?.type === RESPONSE && m.operation === 'begin' && beginning && m.requestId === beginning.id) {
      const task = beginning; beginning = null; clearTimeout(task.timer);
      const r = m.result, proposed = r?.intent;
      if (disposed || readCanonicalResult()?.state !== task.current.state || current !== task.current
          || !keys(r, ['ok', 'intent']) || r.ok !== true || !validIntent(proposed)
          || identityKeys.some(key => proposed[key] !== task.identity[key])) {
        intent = null; state = Object.freeze({status: 'REVIEW_REQUIRED', receipt: null}); task.resolve(null); return;
      }
      intent = Object.freeze({...proposed}); state = Object.freeze({status: 'INTENT_READY', receipt: null});
      task.resolve(intent); return;
    }
    if (m?.type !== RESPONSE || m.operation !== 'save' || !pending || m.requestId !== pending.id) return;
    const r = m.result, receipt = r?.receipt;
    if (r?.ok !== true) { finish(fail(['REVIEW_REQUIRED', 'REVIEW_IDENTITY_MISMATCH', 'TARGET_GARDEN_CHANGED', 'REVIEW_CHANGED', 'HOST_NOT_READY'].includes(r?.reason) ? r.reason : 'SAVE_UNCONFIRMED')); return; }
    if (!keys(r, ['ok', 'receipt']) || !keys(receipt, ['canonicalSlug', 'clientInstanceId', 'gardenId', 'plantId', 'historyId'])
        || !Object.values(receipt).every(text) || receipt.canonicalSlug !== intent?.canonicalSlug
        || receipt.clientInstanceId !== intent?.clientInstanceId) finish(fail('INVALID_RECEIPT'));
    else finish(Object.freeze({ok: true, receipt: Object.freeze({...receipt})}));
  }
  function dispose() {
    disposed = true; invalidate();
    window.removeEventListener('message', receive); window.removeEventListener('pagehide', dispose);
  }
  window.addEventListener('message', receive); window.addEventListener('pagehide', dispose);
  return Object.freeze({
    beginIntent({explicitUserAction = false} = {}) {
      if (explicitUserAction !== true || disposed || pending) return null;
      if (beginning) return beginning.promise;
      invalidate(); const next = readCanonicalResult();
      if (!host || origin === 'null' || !next?.state || !text(next.actionId) || !text(next.canonicalSlug)
          || !text(next.scientific) || !text(next.name)) return null;
      current = next;
      const identity = {actionId: next.actionId, canonicalSlug: next.canonicalSlug,
        scientificName: next.scientific, displayName: next.name};
      const id = 'pi-begin-' + window.crypto.randomUUID();
      let resolve; const promise = new Promise(done => {resolve = done;});
      beginning = {id, current, identity, resolve, promise,
        timer: setTimeout(() => { if (beginning?.id === id) { const task = beginning; beginning = null;
          state = Object.freeze({status: 'REVIEW_REQUIRED', receipt: null}); task.resolve(null); } }, timeoutMs)};
      state = Object.freeze({status: 'AWAITING_REVIEW', receipt: null});
      try { host.postMessage({type: REQUEST, operation: 'begin', requestId: id, identity}, origin); }
      catch { const task = beginning; beginning = null; clearTimeout(task.timer); task.resolve(null);
        state = Object.freeze({status: 'REVIEW_REQUIRED', receipt: null}); }
      return promise;
    },
    saveCurrent({explicitUserAction = false} = {}) {
      if (explicitUserAction !== true) return Promise.resolve(fail('EXPLICIT_ACTION_REQUIRED'));
      if (!host || disposed || origin === 'null') return Promise.resolve(fail('HOST_UNAVAILABLE'));
      if (!intent || readCanonicalResult()?.state !== current?.state) { invalidate(); return Promise.resolve(fail('PI_RESULT_CHANGED')); }
      if (pending) return pending.promise;
      const id = 'pi-save-' + window.crypto.randomUUID();
      let resolve; const promise = new Promise(done => { resolve = done; });
      pending = {id, promise, resolve, current, timer: setTimeout(() => finish(fail('HOST_UNAVAILABLE')), timeoutMs)};
      state = Object.freeze({status: 'SAVING', receipt: null});
      try { host.postMessage({type: REQUEST, operation: 'save', requestId: id, intent}, origin); }
      catch { finish(fail('HOST_UNAVAILABLE')); }
      return promise;
    }, invalidate, dispose, getState() {
      if (current && readCanonicalResult()?.state !== current.state) invalidate();
      return state;
    }
  });
}
