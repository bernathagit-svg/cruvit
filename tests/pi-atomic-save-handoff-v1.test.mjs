import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {createPiAtomicSaveHost, createPiAtomicSaveClient, bindPiAtomicSaveHostFrame} from '../modules/plant-identifier/atomic-save-handoff-v1.js';
import {createCanonicalIdentifierSaveController} from '../core-v1/plant-identification/atomic/save-controller.mjs';


// Catalog transport is the only newly authorized runtime variation. Preserve
// every acquisition, canonical qualification and presentation statement outside it.
const withoutCatalogTransport = source => source
  .replace(/^(?:import[^\n]*|export \{CATALOG_SELECT\}[^\n]*)\n/gm, '')
  .replace(/^export const CATALOG_SELECT[^\n]*\n/gm, '')
  .replace(/  (?:let previewRuntime;|\/\/ Explicit legacy fixture clients retain)[\s\S]*?(?=  let image = null)/, '[catalog source]\n')
  .replace(/      (?:const client = clientForRead\(\);|let response;)[\s\S]*?(?=      if \(response\?\.error)/, '[catalog read]\n');
const withoutCatalogHost = source => source.replace(/<script type="module" id="core-pi-catalog-host">[\s\S]*?<\/script>\n/, '');

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const parent = 'b1666eb3843d07151bdd83be8cd1b7ce85b34796';
const origin = 'https://offline.cruvit.invalid';
const route = '/core-v1/plant-identification/';
const REQUEST = 'cruvit:core-pi-atomic-save-request';
const RESPONSE = 'cruvit:core-pi-atomic-save-response';
const scientific = {lemon: 'Citrus × limon', pomegranate: 'Punica granatum', raspberry: 'Rubus idaeus'};
const names = {lemon: 'Lemon', pomegranate: 'Pomegranate', raspberry: 'Raspberry'};
const savedFetch = globalThis.fetch;
let realRequests = 0;
globalThis.fetch = () => { realRequests++; throw Error('Real network forbidden in qualification'); };
after(() => { globalThis.fetch = savedFetch; assert.equal(realRequests, 0); });
const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve}; }
async function until(check) {
  for (let i = 0; i < 100; i++) { if (check()) return; await turn(); }
  assert.fail('Expected injected dependency was not reached');
}
function surface(href) {
  const listeners = new Map();
  return {location: new URL(href), crypto: {randomUUID},
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    fire(type, event) { return Promise.all([...listeners.get(type) || []].map(fn => fn(event))); }};
}

// Injected test client retained from the accepted offline browser harness.
function controlledDomain() {
  const scientific = {lemon: 'Citrus × limon', pomegranate: 'Punica granatum', raspberry: 'Rubus idaeus'};
  const m = {garden: 'garden-a', session: {user: {id: 'owner-a', role: 'authenticated'}}, status: 'READY',
    calls: [], reads: [], logical: new Map(), refreshes: [], bad: '', rpcGate: null, readbackGate: null};
  const copy = value => structuredClone(value);
  const alter = (value, phase) => {
    const row = copy(value);
    if (m.bad === phase + '-slug') row.profile_slug = 'other-plant';
    if (m.bad === phase + '-garden') row.garden_profile_id = 'other-garden';
    if (m.bad === phase + '-owner') row.user_id = 'other-owner';
    if (m.bad === phase + '-key') row.client_instance_id = 'other-intent';
    if (m.bad === phase + '-id') delete row.id;
    return row;
  };
  const client = {
    auth: {async getUser() { if (m.authGate) await m.authGate; return {data: {user: copy(m.session?.user)}, error: null}; }},
    from(table) {
      const filters = {};
      const query = {select() { return query; }, eq(k, v) { filters[k] = v; return query; }, order() { return query; }, range() { return query; },
        async single() {
          m.reads.push({table, filters: copy(filters)});
          const data = table === 'garden_profiles' ? {id: filters.id, user_id: m.session?.user?.id}
            : {slug: filters.slug, scientific_name: scientific[filters.slug], verification_state: 'verified', media_status: 'IMAGE_READY'};
          return {status: 200, error: null, data};
        },
        async then(resolve, reject) {
          try {
            if (m.readbackGate) await m.readbackGate;
            m.reads.push({table, filters: copy(filters)});
            let rows = [...m.logical.values()].map(x => table === 'garden_plants' ? x.plant : x.history)
              .filter(x => Object.entries(filters).every(([k, v]) => x[k] === v));
            rows = rows.map(x => alter(x, table === 'garden_plants' ? 'readback' : 'history'));
            if (m.bad === 'missing-history' && table === 'garden_events') rows = [];
            if (m.bad === 'missing-plant' && table === 'garden_plants') rows = [];
            resolve({status: 200, error: null, data: rows, count: rows.length + (m.bad === 'incomplete' ? 1 : 0)});
          } catch (e) { reject(e); }
        }};
      return query;
    },
    async rpc(name, args) {
      m.calls.push({name, args: copy(args)});
      if (m.rpcGate) await m.rpcGate;
      const key = JSON.stringify([args.p_garden_profile_id, args.p_client_instance_id]);
      let saved = m.logical.get(key), created = !saved;
      if (saved && saved.plant.profile_slug !== args.p_profile_slug) return {error: {code: 'CONFLICT'}};
      if (!saved) {
        const plant = {id: 'plant-' + (m.logical.size + 1), user_id: m.session.user.id,
          garden_profile_id: args.p_garden_profile_id, client_instance_id: args.p_client_instance_id,
          profile_slug: args.p_profile_slug, scientific: args.p_scientific, name: args.p_display_name,
          status: 'unassessed', mark: 'unknown', archived: false};
        const history = {id: 'history-' + (m.logical.size + 1), user_id: plant.user_id,
          garden_profile_id: plant.garden_profile_id, garden_plant_id: plant.id,
          event_type: 'plant_added', source_module: 'plant_identifier', payload: {client_instance_id: plant.client_instance_id}};
        saved = {plant, history}; m.logical.set(key, saved);
      }
      if (m.bad === 'transport-unconfirmed') return {error: {code: 'TRANSPORT'}};
      if (m.bad === 'malformed') return {data: {ok: true}};
      return {data: {ok: true, created, historyCreated: created,
        plant: alter(saved.plant, 'receipt'), history: alter(saved.history, 'receipt-history')}};
    }
  };
  const pd = {getGardenContextReadiness: () => ({status: m.status, profilesHydrated: m.status !== 'RESTORING',
    authenticated: m.status !== 'SIGNED_OUT', gardenProfileId: m.garden, gardenCount: m.garden ? 1 : 0}),
    getSession: () => m.session, getActiveGardenId: () => m.garden, getSupabaseClient: () => client,
    async hydrateActiveGardenPlants() { m.refreshes.push(m.garden); return m.bad !== 'refresh'; }};
  return {m, pd, client};
}


function fixture(t, {slug = 'lemon', standalone = false, timeoutMs = 1000, mutateReceipt} = {}) {
  const hostWindow = surface(origin + '/app.html'), childWindow = surface(origin + route);
  childWindow.parent = standalone ? childWindow : hostWindow;
  const traffic = [], errors = [], contexts = [], commandIntents = [], stateWrites = [];
  for (const [target, source] of [[hostWindow, childWindow], [childWindow, hostWindow]]) {
    target.postMessage = (data, targetOrigin) => {
      traffic.push({data: structuredClone(data), targetOrigin});
      queueMicrotask(() => target.fire('message', {data: structuredClone(data), origin, source}).catch(e => errors.push(e)));
    };
  }
  const domain = controlledDomain();
  const frame = {isConnected: true, src: origin + route, contentWindow: childWindow};
  const state = {current: {state: {}, actionId: 'identify-' + slug, canonicalSlug: slug, scientific: scientific[slug], name: names[slug]}};
  let controllerExecutions = 0;
  const host = createPiAtomicSaveHost({window: hostWindow, getPersonalDomain: () => domain.pd,
    createController(options) {
      contexts.push(structuredClone(options.context));
      const store = options.stateStore;
      const controller = createCanonicalIdentifierSaveController({...options, stateStore: {
        read: store.read, write(value) {stateWrites.push(structuredClone(value)); store.write(value);}
      }});
      commandIntents.push(controller.intent);
      return {async save() {
        controllerExecutions++;
        const result = await controller.save();
        return mutateReceipt ? mutateReceipt(structuredClone(result)) : result;
      }};
    }});
  assert.equal(host.bind(frame), true);
  const client = createPiAtomicSaveClient({window: childWindow, readCanonicalResult: () => state.current, timeoutMs});
  const close = () => {client.dispose(); host.dispose();};
  t.after(() => {close(); assert.deepEqual(errors, []);});
  return {hostWindow, childWindow, frame, host, client, state, domain, traffic, contexts, commandIntents, stateWrites,
    get executions() {return controllerExecutions;},
    begin: () => client.beginIntent({explicitUserAction: true}),
    save: () => client.saveCurrent({explicitUserAction: true}),
    async send(intent, requestId = randomUUID(), extra = {}, event = {}) {
      const data = {type: REQUEST, operation: 'save', requestId, intent, ...extra};
      await hostWindow.fire('message', {data, origin, source: childWindow, ...event}); await turn();
      return traffic.filter(x => x.data.type === RESPONSE && x.data.requestId === requestId).at(-1)?.data.result;
    }, close};
}

for (const slug of Object.keys(scientific)) test('8B canonical ' + slug + ': exact identity reaches existing intent, command and readback', async t => {
  const f = fixture(t, {slug}), intent = f.begin(), result = await f.save();
  assert.equal(result.ok, true);
  assert.deepEqual(f.contexts, [{gardenId: 'garden-a', ownerId: 'owner-a', clientInstanceId: intent.clientInstanceId,
    canonicalSlug: slug, scientificName: scientific[slug], displayName: names[slug]}]);
  assert.equal(f.commandIntents[0].identity.profileSlug, slug);
  assert.equal(f.commandIntents[0].identity.scientific, scientific[slug]);
  assert.equal(f.commandIntents[0].identity.identitySource, 'identifier_confirmed');
  assert.equal(f.domain.m.calls[0].name, 'add_garden_plant_once_v1');
  assert.equal(f.domain.m.calls[0].args.p_profile_slug, slug);
  assert.equal(f.domain.m.calls[0].args.p_scientific, scientific[slug]);
  assert.equal(f.domain.m.calls[0].args.p_garden_profile_id, 'garden-a');
  assert.equal(result.receipt.canonicalSlug, slug);
  assert.equal(result.receipt.clientInstanceId, intent.clientInstanceId);
  assert.equal(f.executions, 1); assert.equal(f.domain.m.logical.size, 1);
  assert.deepEqual(f.domain.m.refreshes, ['garden-a']);
  assert.ok(f.domain.m.reads.some(r => r.table === 'garden_plants'));
  assert.ok(f.domain.m.reads.some(r => r.table === 'garden_events'));
  assert.deepEqual(Object.keys(result.receipt).sort(), ['canonicalSlug', 'clientInstanceId', 'gardenId', 'historyId', 'plantId']);
  assert.ok(f.traffic.every(x => x.targetOrigin === origin));
});

for (const status of ['RESTORING', 'SIGNED_OUT', 'NO_ACTIVE_GARDEN']) test('8B readiness ' + status + ': zero controller executions', async t => {
  const f = fixture(t); f.begin(); f.domain.m.status = status;
  assert.equal((await f.save()).ok, false); assert.equal(f.executions, 0);
  assert.equal(f.domain.m.calls.length, 0); assert.equal(f.domain.m.reads.length, 0);
});
for (const [name, change] of [
  ['no session', f => {f.domain.m.session = null;}],
  ['no user', f => {f.domain.m.session.user = null;}],
  ['no garden', f => {f.domain.m.garden = null;}],
  ['not authenticated', f => {f.domain.pd.getGardenContextReadiness = () => ({status: 'READY', authenticated: false, profilesHydrated: true, gardenProfileId: 'garden-a'});} ],
  ['not hydrated', f => {f.domain.pd.getGardenContextReadiness = () => ({status: 'READY', authenticated: true, profilesHydrated: false, gardenProfileId: 'garden-a'});} ],
  ['wrong readiness garden', f => {f.domain.pd.getGardenContextReadiness = () => ({status: 'READY', authenticated: true, profilesHydrated: true, gardenProfileId: 'garden-b'});} ],
  ['no authenticated client', f => {f.domain.pd.getSupabaseClient = () => null;}],
  ['no garden refresh authority', f => {delete f.domain.pd.hydrateActiveGardenPlants;}]
]) test('8B host ' + name + ': blocked before controller', async t => {
  const f = fixture(t); f.begin(); change(f);
  assert.equal((await f.save()).ok, false); assert.equal(f.executions, 0); assert.equal(f.domain.m.calls.length, 0);
});
for (const field of ['gardenId', 'ownerId', 'userId', 'session', 'client', 'readiness', 'gardenProfileId']) {
  test('8B child cannot override ' + field, async t => {
    const f = fixture(t), intent = f.begin();
    assert.equal((await f.send({...intent, [field]: 'child-controlled'})).ok, false);
    assert.equal(f.executions, 0); assert.equal(f.domain.m.calls.length, 0);
  });
}
for (const field of ['gardenId', 'ownerId', 'client', 'readiness']) test('8B extra request envelope ' + field + ' rejected', async t => {
  const f = fixture(t), intent = f.begin();
  assert.equal((await f.send(intent, randomUUID(), {[field]: 'forged'})).ok, false); assert.equal(f.executions, 0);
});
for (const [field, value] of [['actionId', ''], ['clientInstanceId', '  key'], ['canonicalSlug', 'lemon\n'],
  ['scientificName', null], ['displayName', 'x'.repeat(201)], ['canonicalSlug', []]]) {
  test('8B invalid intent ' + field + '/' + JSON.stringify(value).slice(0, 20), async t => {
    const f = fixture(t), intent = f.begin();
    assert.equal((await f.send({...intent, [field]: value})).ok, false); assert.equal(f.executions, 0);
  });
}
for (const [name, event, extra] of [
  ['foreign origin', {origin: 'https://evil.invalid'}, {}], ['null origin', {origin: 'null'}, {}],
  ['other frame', {source: {}}, {}], ['wrong operation', {}, {operation: 'evaluate'}],
  ['wrong message type', {}, {type: 'other'}], ['empty request ID', {}, {requestId: ''}]
]) test('8B protocol ' + name + ' ignored without execution', async t => {
  const f = fixture(t); const reply = await f.send(f.begin(), 'probe', extra, event);
  assert.equal(reply, undefined); assert.equal(f.executions, 0); assert.equal(f.domain.m.calls.length, 0);
});
for (const [name, change] of [
  ['frame query', f => {f.frame.src += '?gardenId=forged';}],
  ['frame hash', f => {f.frame.src += '#save';}],
  ['frame origin', f => {f.frame.src = 'https://evil.invalid' + route;}],
  ['child query', f => {f.childWindow.location = new URL(origin + route + '?ready=true');}],
  ['child hash', f => {f.childWindow.location = new URL(origin + route + '#save');}],
  ['detached frame', f => {f.frame.isConnected = false;}]
]) test('8B route ' + name + ' cannot execute', async t => {
  const f = fixture(t), intent = f.begin(); change(f);
  assert.equal(await f.send(intent), undefined); assert.equal(f.executions, 0);
});

test('8B explicit action is required for both intent and send; constructing the handoff does nothing', async t => {
  const f = fixture(t); assert.equal(f.traffic.length, 0);
  assert.equal(f.client.beginIntent(), null);
  assert.equal((await f.client.saveCurrent()).reason, 'EXPLICIT_ACTION_REQUIRED');
  f.begin(); assert.equal((await f.client.saveCurrent()).ok, false);
  assert.equal(f.executions, 0); assert.equal(f.traffic.length, 0);
});
test('8B standalone remains HOST_UNAVAILABLE without a fallback or persistence', async t => {
  const f = fixture(t, {standalone: true}); f.begin();
  assert.equal((await f.save()).reason, 'HOST_UNAVAILABLE'); assert.equal(f.traffic.length, 0); assert.equal(f.executions, 0);
});
for (const field of ['state', 'actionId', 'canonicalSlug', 'scientific', 'name']) test('8B missing current canonical ' + field + ' cannot create an intent', t => {
  const f = fixture(t); delete f.state.current[field];
  assert.equal(f.begin(), null); assert.equal(f.executions, 0); assert.equal(f.traffic.length, 0);
});
test('8B in-flight actions share one request and one controller execution', async t => {
  const f = fixture(t), gate = deferred(); f.domain.m.rpcGate = gate.promise; f.begin();
  const a = f.save(), b = f.save(); assert.equal(a, b); assert.equal(f.begin(), null);
  await until(() => f.domain.m.calls.length === 1);
  assert.equal(f.executions, 1); assert.equal(f.traffic.filter(x => x.data.type === REQUEST).length, 1);
  gate.resolve(); assert.equal((await a).ok, true); assert.equal(f.domain.m.logical.size, 1);
});
test('8B uncertain transport requires explicit retry with the same key and creates one logical plant', async t => {
  const f = fixture(t), intent = f.begin(); f.domain.m.bad = 'transport-unconfirmed';
  assert.equal((await f.save()).ok, false); await turn();
  assert.equal(f.domain.m.calls.length, 1); assert.equal(f.domain.m.logical.size, 1);
  f.domain.m.bad = ''; const retry = await f.save(); assert.equal(retry.ok, true);
  assert.equal(retry.receipt.clientInstanceId, intent.clientInstanceId);
  assert.equal(f.domain.m.calls.length, 2); assert.equal(f.domain.m.logical.size, 1);
  assert.ok(f.domain.m.calls.every(c => c.args.p_client_instance_id === intent.clientInstanceId));
  assert.equal(f.stateWrites.at(-1).attempts, 2);
});
test('8B repeating a verified intent is idempotent; no species-level deduplication', async t => {
  const f = fixture(t), first = f.begin(); assert.equal((await f.save()).ok, true);
  assert.equal((await f.save()).ok, true); assert.equal(f.domain.m.logical.size, 1);
  const second = f.begin(); assert.notEqual(second.clientInstanceId, first.clientInstanceId);
  assert.equal((await f.save()).ok, true); assert.equal(f.domain.m.logical.size, 2);
  assert.ok(f.domain.m.calls.every(c => c.args.p_profile_slug === 'lemon'));
});
test('8B duplicate transport request ID returns the same result without another execution', async t => {
  const f = fixture(t), intent = f.begin();
  const first = await f.send(intent, 'stable-request'), again = await f.send(intent, 'stable-request');
  assert.deepEqual(again, first); assert.equal(first.ok, true); assert.equal(f.executions, 1);
});
for (const [field, value] of [['canonicalSlug', 'raspberry'], ['scientificName', 'Rubus idaeus'], ['actionId', 'another-action'], ['displayName', 'Other name']]) {
  test('8B same key conflicting ' + field + ' cannot reach controller', async t => {
    const f = fixture(t), intent = f.begin(); assert.equal((await f.save()).ok, true);
    assert.equal((await f.send({...intent, [field]: value})).ok, false);
    assert.equal(f.executions, 1); assert.equal(f.domain.m.logical.size, 1);
  });
}
test('8B fresh garden and owner are resolved at each new explicit intent', async t => {
  const f = fixture(t); f.begin(); assert.equal((await f.save()).ok, true);
  f.domain.m.garden = 'garden-b'; f.domain.m.session = {user: {id: 'owner-b', role: 'authenticated'}};
  f.begin(); const next = await f.save(); assert.equal(next.ok, true);
  assert.equal(next.receipt.gardenId, 'garden-b'); assert.equal(f.contexts[1].ownerId, 'owner-b');
  assert.deepEqual(f.domain.m.refreshes, ['garden-a', 'garden-b']);
});
test('8B one intent cannot migrate into a different garden', async t => {
  const f = fixture(t); f.begin(); await f.save(); f.domain.m.garden = 'garden-b';
  assert.equal((await f.save()).ok, false); assert.equal(f.executions, 1); assert.equal(f.domain.m.logical.size, 1);
});

for (const bad of ['receipt-slug', 'receipt-garden', 'receipt-owner', 'receipt-key', 'receipt-id',
  'receipt-history-id', 'readback-slug', 'readback-garden', 'readback-owner', 'readback-key', 'readback-id',
  'history-id', 'history-owner', 'history-garden', 'missing-plant', 'missing-history', 'incomplete', 'malformed', 'refresh']) {
  test('8B real controller rejects injected ' + bad + ' and does not retry', async t => {
    const f = fixture(t); f.domain.m.bad = bad; f.begin();
    assert.equal((await f.save()).ok, false); assert.equal(f.client.getState().receipt, null);
    assert.equal(f.executions, 1); assert.equal(f.domain.m.calls.length, 1);
    await turn(); assert.equal(f.domain.m.calls.length, 1);
    if (bad !== 'refresh') assert.equal(f.domain.m.refreshes.length, 0);
  });
}
for (const [name, mutate] of [
  ['hydration', r => {r.hydration = 'PENDING';}], ['plant ID', r => {delete r.plant.id;}],
  ['history ID', r => {delete r.history.id;}], ['intent key', r => {r.clientInstanceId = 'other';}],
  ['RPC count', r => {r.counts.rpcCalls = 0;}], ['write count', r => {r.counts.supabaseWrites = 2;}],
  ['readback', r => {delete r.readback;}], ['plant owner', r => {r.plant.user_id = 'other';}],
  ['history source', r => {r.history.source_module = 'other';}]
]) test('8B transported controller ' + name + ' must agree with authoritative readback', async t => {
  const f = fixture(t, {mutateReceipt(r) {mutate(r); return r;}}); f.begin();
  assert.equal((await f.save()).ok, false); assert.equal(f.domain.m.refreshes.length, 0);
});
test('8B authenticated owner is verified by the shared domain before command execution', async t => {
  const f = fixture(t); f.domain.client.auth.getUser = async () => ({data: {user: {id: 'other', role: 'authenticated'}}, error: null});
  f.begin(); assert.equal((await f.save()).ok, false); assert.equal(f.executions, 1); assert.equal(f.domain.m.calls.length, 0);
});
test('8B authoritative readback must finish before success and garden refresh', async t => {
  const f = fixture(t), gate = deferred(); f.domain.m.readbackGate = gate.promise; f.begin();
  let completed = false; const promise = f.save().then(r => {completed = true; return r;});
  await until(() => f.domain.m.calls.length === 1); await turn();
  assert.equal(completed, false); assert.equal(f.client.getState().status, 'SAVING'); assert.equal(f.domain.m.refreshes.length, 0);
  gate.resolve(); assert.equal((await promise).ok, true); assert.equal(f.domain.m.refreshes.length, 1);
});
for (const phase of ['auth', 'readback']) test('8B host change during ' + phase + ' cannot publish success', async t => {
  const f = fixture(t), gate = deferred(); f.domain.m[phase + 'Gate'] = gate.promise; f.begin();
  const promise = f.save(); await until(() => phase === 'auth' ? f.executions === 1 : f.domain.m.calls.length === 1);
  f.domain.m.garden = 'garden-b'; gate.resolve();
  assert.equal((await promise).ok, false); assert.equal(f.domain.m.refreshes.length, 0);
  if (phase === 'auth') assert.equal(f.domain.m.calls.length, 0);
});
for (const change of ['invalidate', 'canonical state', 'pagehide']) test('8B late response after ' + change + ' cannot restore save state', async t => {
  const f = fixture(t), gate = deferred(); f.domain.m.readbackGate = gate.promise; f.begin();
  const promise = f.save(); await until(() => f.domain.m.calls.length === 1);
  if (change === 'invalidate') f.client.invalidate();
  if (change === 'canonical state') {f.state.current = {...f.state.current, state: {}}; f.client.getState();}
  if (change === 'pagehide') await f.childWindow.fire('pagehide');
  gate.resolve(); assert.equal((await promise).ok, false); await turn();
  assert.equal(f.client.getState().status, 'INVALIDATED'); assert.equal(f.client.getState().receipt, null);
});
test('8B timeout never retries; a late valid reply cannot change the timed-out state', async t => {
  const f = fixture(t, {timeoutMs: 5}), gate = deferred(); f.domain.m.readbackGate = gate.promise; f.begin();
  const promise = f.save(); await until(() => f.domain.m.calls.length === 1);
  assert.equal((await promise).ok, false); assert.equal(f.domain.m.calls.length, 1);
  gate.resolve(); await turn(); assert.equal(f.client.getState().status, 'SAVE_UNCONFIRMED');
  assert.equal(f.client.getState().receipt, null); assert.equal(f.domain.m.calls.length, 1);
});

for (const [name, change] of [
  ['wrong canonical slug', r => {r.receipt.canonicalSlug = 'raspberry';}],
  ['wrong intent key', r => {r.receipt.clientInstanceId = 'other';}],
  ['missing plant ID', r => {delete r.receipt.plantId;}],
  ['missing history ID', r => {delete r.receipt.historyId;}],
  ['empty garden', r => {r.receipt.gardenId = '';}],
  ['extra receipt field', r => {r.receipt.ownerId = 'forged';}],
  ['extra envelope field', r => {r.readback = {};}]
]) test('8B client rejects ' + name + ' response', async t => {
  const f = fixture(t), intent = f.begin(), gate = deferred(); f.domain.m.readbackGate = gate.promise;
  const promise = f.save(); await until(() => f.domain.m.calls.length === 1);
  const request = f.traffic.find(x => x.data.type === REQUEST).data;
  const result = {ok: true, receipt: {canonicalSlug: 'lemon', clientInstanceId: intent.clientInstanceId,
    gardenId: 'garden-a', plantId: 'plant-1', historyId: 'history-1'}}; change(result);
  await f.childWindow.fire('message', {origin, source: f.hostWindow, data: {type: RESPONSE, operation: 'save', requestId: request.requestId, result}});
  assert.equal((await promise).ok, false); gate.resolve(); await turn(); assert.equal(f.client.getState().receipt, null);
});
test('8B wrong response origin/frame/operation/request ID cannot finish a pending request', async t => {
  const f = fixture(t), gate = deferred(); f.domain.m.readbackGate = gate.promise; f.begin();
  const promise = f.save(); await until(() => f.domain.m.calls.length === 1);
  const id = f.traffic.find(x => x.data.type === REQUEST).data.requestId;
  const data = {type: RESPONSE, operation: 'save', requestId: id, result: {ok: false, receipt: null}};
  for (const event of [{origin: 'https://evil.invalid', source: f.hostWindow, data}, {origin, source: {}, data},
    {origin, source: f.hostWindow, data: {...data, operation: 'evaluate'}}, {origin, source: f.hostWindow, data: {...data, requestId: 'other'}}]) {
    await f.childWindow.fire('message', event); assert.equal(f.client.getState().status, 'SAVING');
  }
  gate.resolve(); assert.equal((await promise).ok, true);
});
test('8B unbinding the host closes the client and prevents later commands', async t => {
  const f = fixture(t); f.begin(); f.host.unbind(); await turn();
  assert.equal((await f.save()).reason, 'HOST_UNAVAILABLE'); assert.equal(f.executions, 0);
});

test('8B frame binding observes only the unique direct-child Core PI frame and disposes cleanly', () => {
  const calls = [], win = surface(origin + '/app.html'); let observe, disconnected = false;
  win.MutationObserver = class {constructor(fn) {observe = fn;} observe() {} disconnect() {disconnected = true;}};
  const frame = {tagName: 'IFRAME', title: 'CRUVIT Plant Identification', src: origin + route};
  const document = {body: {children: []}}, host = {bind: f => calls.push(['bind', f]), unbind: () => calls.push(['unbind']), dispose: () => calls.push(['dispose'])};
  const dispose = bindPiAtomicSaveHostFrame({window: win, document, host});
  assert.deepEqual(calls, []); document.body.children.push(frame); observe();
  assert.equal(calls.filter(x => x[0] === 'bind').length, 1); observe();
  assert.equal(calls.filter(x => x[0] === 'bind').length, 1);
  document.body.children.push({...frame}); observe(); assert.equal(calls.at(-1)[0], 'unbind');
  document.body.children = [{...frame, title: 'Wrong title'}]; observe();
  assert.equal(calls.filter(x => x[0] === 'bind').length, 1);
  dispose(); assert.equal(disconnected, true); assert.equal(calls.at(-1)[0], 'dispose');
});
test('8B composition is only the exact surviving transport blocks; no UI or locked-authority change', () => {
  const hashes = {'app.html': '12cff17f30c34b8c3d2daa801976bcff288e8a277d45c8bb66825f3137da766d',
    'core-v1/plant-identification/index.html': 'c6468f2a75dd94eb1fa26c8669e15dc29a8bfbfe4e1a2a722c6bf2e068ee3468',
    'modules/plant-identifier/atomic-save-handoff-v1.js': '007bfb113c14f8b63b4d85dd52e2a62375cd9e1dafa57243c6b13d497e499997'};
  for (const [path, hash] of Object.entries(hashes)) assert.equal(createHash('sha256').update(path === 'app.html' ? withoutCatalogHost(read(path)) : fs.readFileSync(new URL(path, root))).digest('hex'), hash);
  for (const [path, id] of [['app.html', 'core-pi-atomic-save-host'], ['core-v1/plant-identification/index.html', 'core-pi-atomic-save-client']]) {
    const source = withoutCatalogHost(read(path)), block = new RegExp('<script type="module" id="' + id + '">[\\s\\S]*?<\\/script>\\n');
    assert.equal((source.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1);
    assert.equal(source.replace(block, ''), execFileSync('git', ['show', parent + ':' + path], {cwd: root, encoding: 'utf8', maxBuffer: 10000000}));
  }
  for (const path of ['modules/plant-identifier/suitability-context-handoff-v1.js', 'modules/plant-identifier/pi-suitability-view-v1.js',
    'modules/plant-identifier/real-pi-runtime-v1.js', 'core-v1/plant-identification/atomic/save-controller.mjs',
    'core-v1/plant-identification/atomic/preview-domain.mjs', 'core-v1/plant-identification/atomic/add-plant-contract.js',
    'core-v1/plant-identification/atomic/add-plant-write-repository.js', 'data/plant-identity.registry.json']) {
    const before = execFileSync('git', ['show', parent + ':' + path], {cwd: root, encoding: 'utf8', maxBuffer: 10000000});
    assert.equal(path.endsWith('real-pi-runtime-v1.js') ? withoutCatalogTransport(read(path)) : read(path),
      path.endsWith('real-pi-runtime-v1.js') ? withoutCatalogTransport(before) : before);
  }
  const source = read('modules/plant-identifier/atomic-save-handoff-v1.js');
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|\bfetch\s*\(|XMLHttpRequest|navigator\.geolocation|\.insert\(|\.upsert\(|\.upload\(/);
  assert.doesNotMatch(source, /savePlantFromLibrary|upsertPlantOnActiveGarden|emitPlantAddedMemory|createPreviewSaveDomain/);
});
