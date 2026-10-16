import {withoutAcceptedReview} from './helpers/pi-accepted-review-source-compat.mjs';
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createPiCatalogHost, createPiCatalogClient, CATALOG_SELECT} from '../modules/plant-identifier/canonical-catalog-handoff-v1.js';
import {createRealPiController} from '../modules/plant-identifier/real-pi-runtime-v1.js';
import {createPlantIdentityResolver} from '../modules/identity/plant-identity-resolver.js';
import {resolveCanonicalReadSlug} from '../modules/identity/canonical-alias-authority-v1.js';
const root = new URL('../', import.meta.url), read = p => fs.readFileSync(new URL(p, root), 'utf8');
const origin = 'https://isolated-cruvit-preview.invalid', route = '/core-v1/plant-identification/';
const REQUEST = 'cruvit:core-pi-catalog-request', RESPONSE = 'cruvit:core-pi-catalog-response';
const registry = JSON.parse(read('data/plant-identity.registry.json'));
const resolver = createPlantIdentityResolver(registry);
const identityAuthority = {resolve: resolver.resolve, readSlug: input => resolveCanonicalReadSlug(input, {resolver})};
const row = (slug = 'monstera') => ({slug, scientific_name: registry.canonicalIdentities.find(x => x.canonicalSlug === slug).acceptedScientificName,
  verification_state: 'verified', needs_review: false, common_names: {en: slug}, media_status: 'IMAGE_READY',
  media: {primaryUrl: 'https://catalog.invalid/' + slug + '.jpg'}, climate_traits: {}});
const originalFetch = globalThis.fetch; let network = 0;
globalThis.fetch = () => {network++; throw Error('Network forbidden');};
after(() => {globalThis.fetch = originalFetch; assert.equal(network, 0);});
const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve};}
function surface(href) {
  const listeners = new Map();
  return {location: new URL(href), crypto: {randomUUID},
    addEventListener(t, f) {if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(f);},
    removeEventListener(t, f) {listeners.get(t)?.delete(f);},
    fire(t, e) {return Promise.all([...listeners.get(t) || []].map(f => f(e)));}};
}
function fixture(t, options = {}) {
  const hostWindow = surface(origin + '/app.html'), childWindow = surface(origin + route);
  childWindow.parent = options.standalone ? childWindow : hostWindow;
  const messages = [], errors = [], calls = [];
  for (const [target, source] of [[hostWindow, childWindow], [childWindow, hostWindow]]) target.postMessage = (data, targetOrigin) => {
    messages.push({data: structuredClone(data), targetOrigin});
    queueMicrotask(() => target.fire('message', {data: structuredClone(data), origin, source}).catch(e => errors.push(e)));
  };
  const state = {session: {user: {id: 'owner-a'}}, result: {error: null, status: 200, count: 1, data: [row(options.slug)]}, authGate: null, queryGate: null};
  const client = {supabaseUrl: 'https://host-project.invalid',
    auth: {async getUser() {calls.push({operation: 'auth'}); if (state.authGate) await state.authGate;
      return state.authResult || {data: {user: {id: state.session?.user.id, role: 'authenticated'}}, error: null};}},
    from(table) {const call = {table}; calls.push(call); const q = {
      select(columns, options) {call.columns = columns; call.options = options; return q;},
      eq(k, v) {call.filter = [k, v]; return q;},
      async limit(n) {call.limit = n; if (state.queryGate) await state.queryGate; if (state.queryError) throw Error('offline failure'); return structuredClone(state.result);}
    }; return q;}}
  state.client = client;
  const pd = {getSession: () => state.session, getSupabaseClient: () => state.client};
  state.pd = pd;
  const frame = {isConnected: true, src: origin + route, contentWindow: childWindow};
  const host = createPiCatalogHost({window: hostWindow, getPersonalDomain: () => state.pd}); host.bind(frame);
  const reader = createPiCatalogClient({window: childWindow, timeoutMs: options.timeoutMs || 40});
  t.after(() => {reader.dispose(); host.dispose(); assert.deepEqual(errors, []);});
  return {hostWindow, childWindow, frame, host, reader, state, pd, client, messages, calls,
    async send(patch = {}, event = {}) {const requestId = randomUUID();
      await hostWindow.fire('message', {origin, source: childWindow, data: {type: REQUEST, operation: 'read', requestId, canonicalSlug: 'monstera', ...patch}, ...event});
      return messages.filter(x => x.data.type === RESPONSE && x.data.requestId === requestId).at(-1)?.data.result;}};
}
test('authenticated host owns exact catalog selection; raw row arrives unchanged with no credentials or extra state', async t => {
  const f = fixture(t); f.state.result.data[0].hostSecret = 'must-not-cross';
  const result = await f.reader.readCanonicalRow('monstera');
  assert.deepEqual(result, {status: 200, count: 1, data: [row()]});
  assert.deepEqual(f.calls, [{operation: 'auth'}, {table: 'catalog_plants', columns: CATALOG_SELECT, options: {count: 'exact'}, filter: ['slug', 'monstera'], limit: 2}]);
  assert.doesNotMatch(JSON.stringify(f.messages), /owner-a|host-project|hostSecret|must-not-cross/);
});
for (const slug of ['monstera', 'lemon', 'pomegranate', 'raspberry']) test(slug + ': normal controller -> protected host read -> real Registry validation -> CANONICAL_READY', async t => {
  const f = fixture(t, {slug}); const previous = globalThis.window; globalThis.window = f.childWindow;
  t.after(() => {if (previous === undefined) delete globalThis.window; else globalThis.window = previous;});
  let identify = 0;
  const controller = createRealPiController({decodeImage: async () => {}, loadAuthority: async () => identityAuthority,
    fetchImpl: async () => {identify++; return {ok: true, json: async () => ({candidates: [{scientificName: row(slug).scientific_name, confidence: 'high', gbifVerified: true, gbifRank: 'SPECIES', gbifScore: 80, gbifKey: 12345}]})};}});
  await controller.selectImage(new File([fs.readFileSync(new URL('modules/plant-identifier/assets/garden-texture.jpg', root))], 'real.jpg', {type: 'image/jpeg'}));
  const result = await controller.identify({explicitUserAction: true});
  assert.equal(result.status, 'CANONICAL_READY'); assert.equal(result.readyForResult, true);
  assert.equal(result.identity.canonicalSlug, slug); assert.deepEqual(result.catalogRow, row(slug));
  assert.equal(result.catalogRow.verification_state, 'verified'); assert.equal(result.catalogRow.needs_review, false);
  assert.equal(result.catalogRow.media_status, 'IMAGE_READY'); assert.equal(identify, 1);
});
for (const [name, change] of [
  ['signed out', f => {f.state.session = null;}], ['missing authority', f => {f.state.pd = null;}],
  ['missing client', f => {f.state.client = null;}], ['owner mismatch', f => {f.state.authResult = {data: {user: {id: 'other', role: 'authenticated'}}};}],
  ['auth error', f => {f.state.authResult = {error: {message: 'rejected'}};}],
  ['anonymous role', f => {f.state.authResult = {data: {user: {id: 'owner-a', role: 'anon'}}};}]
]) test(name + ' blocks before catalog query', async t => {
  const f = fixture(t); change(f); await assert.rejects(f.reader.readCanonicalRow('monstera'));
  assert.equal(f.calls.filter(x => x.table).length, 0);
});
for (const [name, patch, event] of [
  ['foreign origin', {}, {origin: 'https://evil.invalid'}], ['wrong frame', {}, {source: {}}],
  ['wrong operation', {operation: 'save'}], ['wrong type', {type: 'different'}],
  ['child garden override', {gardenId: 'other'}], ['child owner override', {ownerId: 'other'}],
  ['child client override', {client: {}}], ['child project override', {project: 'other'}],
  ['child trust override', {verified: true}], ['scientific display lookup', {canonicalSlug: 'Monstera deliciosa'}],
  ['arbitrary query', {canonicalSlug: 'monstera&verified=true'}]
]) test(name + ' cannot select authority or cause a catalog read', async t => {
  const f = fixture(t); await f.send(patch, event); assert.equal(f.calls.length, 0);
});
for (const change of [f => {f.frame.src += '?garden=other';}, f => {f.childWindow.location = new URL(origin + route + '#save');},
  f => {f.frame.isConnected = false;}, f => {f.childWindow.location = new URL(origin + '/app.html');}]) {
  test('altered/disconnected frame capability is revoked before read', async t => {
    const f = fixture(t); change(f); await f.send(); assert.equal(f.calls.length, 0);
  });
}
for (const [name, mutate] of [
  ['query failure', f => {f.state.queryError = true;}], ['query error envelope', f => {f.state.result.error = {code: 'failed'};}],
  ['HTTP failure', f => {f.state.result.status = 500;}], ['missing count', f => {delete f.state.result.count;}],
  ['malformed rows', f => {f.state.result.data = null;}]
]) test(name + ' fails without retry', async t => {
  const f = fixture(t); mutate(f); await assert.rejects(f.reader.readCanonicalRow('monstera')); await turn();
  assert.equal(f.calls.filter(x => x.table).length, 1);
});
test('standalone Core PI has no implicit Preview client or fallback', async t => {
  const f = fixture(t, {standalone: true}); await assert.rejects(f.reader.readCanonicalRow('monstera')); assert.equal(f.calls.length, 0);
});
for (const phase of ['auth', 'query']) test('session changes during ' + phase + ' invalidate the read', async t => {
  const f = fixture(t), gate = deferred(); f.state[phase === 'auth' ? 'authGate' : 'queryGate'] = gate.promise;
  const promise = f.reader.readCanonicalRow('monstera'); await turn();
  f.state.session = {user: {id: 'other'}}; gate.resolve(); await assert.rejects(promise);
  if (phase === 'auth') assert.equal(f.calls.filter(x => x.table).length, 0);
});
test('unbind and late replies cannot restore a completed or closed read', async t => {
  const f = fixture(t), gate = deferred(); f.state.queryGate = gate.promise;
  const promise = f.reader.readCanonicalRow('monstera'); await turn(); f.host.unbind();
  await assert.rejects(promise); gate.resolve(); await turn();
  assert.equal(f.messages.filter(x => x.data.type === RESPONSE && x.data.result.ok).length, 0);
});
test('forged replies from another source/origin and wrong operation are ignored', async t => {
  const f = fixture(t, {timeoutMs: 10});
  f.hostWindow.postMessage = data => {f.messages.push({data});};
  const promise = f.reader.readCanonicalRow('monstera'); const requestId = f.messages.at(-1).data.requestId;
  for (const event of [{origin: 'https://evil.invalid', source: f.hostWindow}, {origin, source: {}}, {origin, source: f.hostWindow, operation: 'save'}]) {
    await f.childWindow.fire('message', {origin: event.origin, source: event.source,
      data: {type: RESPONSE, operation: event.operation || 'read', requestId, result: {ok: true, canonicalSlug: 'monstera', response: {status: 200, count: 1, data: [row()]}}}});
  }
  await assert.rejects(promise);
});
for (const [name, response, status] of [
  ['missing row', {status: 200, error: null, data: [], count: 0}, 'CATALOG_NOT_FOUND'],
  ['duplicate rows', {status: 200, error: null, data: [row(), row()], count: 2}, 'CATALOG_CONFLICT'],
  ['wrong slug', {status: 200, error: null, data: [row('lemon')], count: 1}, 'CATALOG_CONFLICT'],
  ['scientific mismatch', {status: 200, error: null, data: [{...row(), scientific_name: 'Punica granatum'}], count: 1}, 'CATALOG_CONFLICT'],
  ['unverified', {status: 200, error: null, data: [{...row(), verification_state: 'pending'}], count: 1}, 'CATALOG_CONFLICT'],
  ['needs review', {status: 200, error: null, data: [{...row(), needs_review: true}], count: 1}, 'CATALOG_CONFLICT'],
  ['incomplete count', {status: 200, error: null, data: [row()], count: 2}, 'CATALOG_READ_FAILED']
]) test('controller still rejects bridged ' + name + ' before result readiness', async t => {
  const f = fixture(t), previous = globalThis.window; globalThis.window = f.childWindow; f.state.result = response;
  t.after(() => {if (previous === undefined) delete globalThis.window; else globalThis.window = previous;});
  const controller = createRealPiController({decodeImage: async () => {}, loadAuthority: async () => identityAuthority,
    fetchImpl: async () => ({ok: true, json: async () => ({candidates: [{scientificName: 'Monstera deliciosa', confidence: 'high', gbifVerified: true, gbifRank: 'SPECIES', gbifScore: 80, gbifKey: 12345}]})})});
  await controller.selectImage(new File([fs.readFileSync(new URL('modules/plant-identifier/assets/garden-texture.jpg', root))], 'real.jpg', {type: 'image/jpeg'}));
  const result = await controller.identify({explicitUserAction: true});
  assert.equal(result.status, status); assert.equal(result.readyForResult, false); assert.equal(result.catalogRow, null);
});
test('new composition reuses qualified frame binding and leaves all authority implementations byte-identical', () => {
  const base = '9080b084e38a8cb9dc109d537828ae0fd20fca67';
  for (const p of ['modules/plant-identifier/suitability-context-handoff-v1.js', 'modules/plant-identifier/pi-suitability-view-v1.js',
    'modules/plant-identifier/atomic-save-handoff-v1.js', 'modules/personal-domain/garden-profile-v0.js',
    'core-v1/plant-identification/index.html', 'core-v1/my-garden/shared/preview-session.mjs',
    'core-v1/plant-identification/atomic/save-controller.mjs', 'core-v1/plant-identification/atomic/preview-domain.mjs',
    'modules/identity/plant-identity-resolver.js', 'data/plant-identity.registry.json']) {
    assert.equal(withoutAcceptedReview(read(p)), execFileSync('git', ['show', base + ':' + p], {cwd: root, encoding: 'utf8', maxBuffer: 10000000}));
  }
  assert.equal(withoutAcceptedReview(read('app.html')).replace(/<script type="module" id="core-pi-catalog-host">[\s\S]*?<\/script>\n/, ''), execFileSync('git', ['show', base + ':app.html'], {cwd: root, encoding: 'utf8', maxBuffer: 10000000}));
  assert.match(withoutAcceptedReview(read('app.html')), /bindPiAtomicSaveHostFrame as bindCorePiHostFrame/);
  assert.doesNotMatch(withoutAcceptedReview(read('modules/plant-identifier/canonical-catalog-handoff-v1.js')), /\.rpc\(|\.insert\(|\.upsert\(|localStorage|sessionStorage|createClient\(|\bfetch\(/);
  assert.doesNotMatch(withoutAcceptedReview(read('modules/plant-identifier/real-pi-runtime-v1.js')), /createPreviewClient/);
});
