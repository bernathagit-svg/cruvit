// Slice 1 qualification: native Node + DOM/transport stubs. No hosted/browser/provider claim.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRealPiController, wireRealPiInputs, decodeBrowserImage, loadPIIdentityAuthority,
  IDENTIFY_ENDPOINT, IMAGE_ACCEPT, MAX_IMAGE_BYTES, CATALOG_SELECT} from '../modules/plant-identifier/real-pi-runtime-v1.js';
import {createPlantIdentityResolver, loadIdentityRegistry} from '../modules/identity/plant-identity-resolver.js';
import {resolveCanonicalReadSlug} from '../modules/identity/canonical-alias-authority-v1.js';
import {PREVIEW_URL} from '../core-v1/my-garden/shared/preview-session.mjs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const registry = JSON.parse(read('data/plant-identity.registry.json'));
const authorityFor = (data = registry) => {
  const resolver = createPlantIdentityResolver(data);
  return {resolve: resolver.resolve, readSlug: input => resolveCanonicalReadSlug(input, {resolver})};
};
const authority = authorityFor();
const entry = slug => registry.canonicalIdentities.find(value => value.canonicalSlug === slug);
const originalFetch = globalThis.fetch;
let networkAttempts = 0;
globalThis.fetch = () => { networkAttempts++; throw Error('NETWORK_FORBIDDEN'); };
after(() => { globalThis.fetch = originalFetch; assert.equal(networkAttempts, 0); });

const imageFiles = {
  jpeg: ['modules/plant-identifier/assets/garden-texture.jpg', 'image/jpeg'],
  png: ['core-v1/assets/card-plant-doctor-rectified.png', 'image/png'],
  webp: ['core-v1/assets/card-plant-id-approved-exact.webp', 'image/webp']
};
function file(kind = 'png') {
  const [path, type] = imageFiles[kind];
  return new File([fs.readFileSync(new URL(path, root))], 'offline-selected.' + kind, {type});
}
const row = (slug = 'lemon') => ({slug, scientific_name: entry(slug).acceptedScientificName,
  verification_state: 'verified', needs_review: false});
const evidence = (slug = 'lemon') => ({
  candidates: [{commonName: slug, scientificName: entry(slug).acceptedScientificName,
    confidence: 'high', gbifVerified: true, gbifRank: 'SPECIES', gbifScore: 80, gbifKey: 12345,
    care: {water: 'PROVIDER_CARE_FORBIDDEN'}, canonicalSlug: 'PROVIDER_SLUG_FORBIDDEN'}],
  scientificName: entry(slug).acceptedScientificName, commonName: slug, confidence: 'high', gbifVerified: true,
  identification: {scientific_name: entry(slug).acceptedScientificName, alternatives: [],
    care: {water: 'PROVIDER_CARE_FORBIDDEN'}},
  care: {water: 'PROVIDER_CARE_FORBIDDEN'}, canonicalSlug: 'PROVIDER_SLUG_FORBIDDEN',
  profile: {name: 'PROVIDER_PROFILE_FORBIDDEN'}
});
const httpResponse = payload => ({ok: true, json: async () => payload});
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
function fixture(options = {}) {
  const slug = options.slug || 'lemon';
  const payload = options.payload || evidence(slug);
  const calls = {http: [], catalog: [], decode: [], auth: 0, authority: 0, client: 0};
  const states = [];
  const client = {
    supabaseUrl: options.supabaseUrl || PREVIEW_URL,
    auth: {getUser: async () => { calls.auth++; return options.auth || {
      error: null, data: {user: {id: 'offline-owner', role: 'authenticated'}}}; }},
    from(table) {
      const call = {table}; calls.catalog.push(call);
      const query = {
        select(columns, config) { call.columns = columns; call.config = config; return query; },
        eq(column, value) { call.eq = [column, value]; return query; },
        async limit(value) {
          call.limit = value;
          if (options.catalogError) throw options.catalogError;
          if (options.catalogTransport) return options.catalogTransport();
          return options.catalogResponse || {status: 200, error: null, count: 1, data: [row(slug)]};
        }
      };
      return query;
    }
  };
  const controller = createRealPiController({
    fetchImpl: async (url, init) => {
      calls.http.push({url, init, body: JSON.parse(init.body)});
      return options.transport ? options.transport(url, init) : httpResponse(payload);
    },
    decodeImage: async (selected, url) => {
      calls.decode.push({selected, url});
      if (options.decode) await options.decode(selected, url);
    },
    loadAuthority: async () => { calls.authority++; return options.authority || authority; },
    getCatalogClient: () => { calls.client++; return client; },
    requestTimeoutMs: options.requestTimeoutMs
  });
  controller.subscribe(state => states.push(state.status));
  return {controller, calls, states, payload};
}
async function run(options = {}) {
  const f = fixture(options);
  assert.equal(await f.controller.selectImage(file(), 'gallery'), true);
  f.result = await f.controller.identify({explicitUserAction: true});
  return f;
}

test('no image or non-explicit Identify dispatches nothing', async () => {
  const f = fixture();
  await f.controller.identify({explicitUserAction: true});
  assert.equal(f.controller.getState().status, 'NO_IMAGE');
  await f.controller.selectImage(file());
  await f.controller.identify();
  await f.controller.identify({explicitUserAction: false});
  await f.controller.identify({explicitUserAction: 'true'});
  assert.equal(f.calls.http.length, 0);
  assert.equal(f.calls.client, 0);
});

for (const kind of Object.keys(imageFiles)) test(kind + ': real file bytes enter IMAGE_READY unchanged', async () => {
  const f = fixture(), selected = file(kind);
  assert.equal(await f.controller.selectImage(selected, 'camera'), true);
  const s = f.controller.getState();
  assert.equal(s.status, 'IMAGE_READY');
  assert.equal(s.image.mediaType, selected.type);
  assert.equal(s.image.byteLength, selected.size);
  assert.equal(s.image.source, 'camera');
  assert.equal(f.calls.http.length, 0);
  assert.deepEqual(Buffer.from(f.calls.decode[0].url.split(',')[1], 'base64'), Buffer.from(await selected.arrayBuffer()));
});

test('browser decode validates dimensions and closes its bitmap; failed decode stays IMAGE_INVALID', async () => {
  const previous = globalThis.createImageBitmap;
  let closes = 0;
  try {
    globalThis.createImageBitmap = async () => ({width: 2, height: 3, close() { closes++; }});
    await decodeBrowserImage(file(), 'unused');
    globalThis.createImageBitmap = async () => ({width: 0, height: 0, close() { closes++; }});
    const f = fixture({decode: decodeBrowserImage});
    assert.equal(await f.controller.selectImage(file()), false);
    assert.equal(f.controller.getState().status, 'IMAGE_INVALID');
    await f.controller.identify({explicitUserAction: true});
    assert.equal(f.calls.http.length, 0);
    assert.equal(closes, 2);
  } finally {
    if (previous === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap = previous;
  }
});

for (const [name, invalid] of [
  ['absent', () => null], ['empty', () => new File([], 'empty.png', {type: 'image/png'})],
  ['HEIC', () => new File(['anything'], 'image.heic', {type: 'image/heic'})],
  ['MIME mismatch', () => new File([fs.readFileSync(new URL(imageFiles.png[0], root))], 'wrong.jpg', {type: 'image/jpeg'})],
  ['bad magic', () => new File(['not a PNG'], 'wrong.png', {type: 'image/png'})],
  ['oversize', () => ({type: 'image/png', size: MAX_IMAGE_BYTES + 1, arrayBuffer() { throw Error('must not read'); }})],
  ['size mismatch', () => ({type: 'image/png', size: 8, arrayBuffer: async () => new Uint8Array(9).buffer})]
]) test(name + ' input fails closed and clears any previous image/result', async () => {
  const f = await run();
  assert.equal(await f.controller.selectImage(invalid()), false);
  assert.equal(f.controller.getState().status, 'IMAGE_INVALID');
  assert.equal(f.controller.getState().readyForResult, false);
  assert.equal(f.controller.getState().catalogRow, null);
  await f.controller.identify({explicitUserAction: true});
  assert.equal(f.calls.http.length, 1, 'invalid replacement must not reuse previous photo');
});

test('late image decoding cannot replace a newer selection', async () => {
  const pending = deferred();
  const f = fixture({decode: selected => selected.type === 'image/png' ? pending.promise : undefined});
  const old = f.controller.selectImage(file('png'));
  await f.controller.selectImage(file('jpeg'));
  pending.resolve();
  assert.equal(await old, false);
  assert.equal(f.controller.getState().image.mediaType, 'image/jpeg');
});

for (const [slug, scientific, status] of [
  ['lemon', 'Citrus × limon', 'resolved_id'],
  ['pomegranate', 'Punica granatum', 'resolved_id'],
  ['raspberry', 'Rubus idaeus', 'resolved_canonical']
]) test(slug + ': verified evidence -> real Registry -> exact mocked canonical row', async () => {
  const f = await run({slug});
  assert.equal(f.result.status, 'CANONICAL_READY');
  assert.equal(f.result.readyForResult, true);
  assert.equal(f.result.identity.status, status);
  assert.equal(f.result.identity.canonicalSlug, slug);
  assert.equal(f.result.identity.registryVersion, registry.registryVersion);
  assert.deepEqual(f.result.catalogRow, row(slug));
  assert.equal(f.result.catalogRow.scientific_name, scientific);
  assert.deepEqual([...new Set(f.states)], ['IMAGE_LOADING', 'IMAGE_READY', 'IDENTIFYING', 'CANONICAL_READY']);
  assert.equal(f.calls.http.length, 1);
  const request = f.calls.http[0];
  assert.equal(request.url, IDENTIFY_ENDPOINT);
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.redirect, 'error');
  assert.deepEqual(request.init.headers, {'Content-Type': 'application/json'});
  assert.deepEqual(Object.keys(request.body).sort(), ['imageDataUrl', 'mode', 'scanId']);
  assert.equal(request.body.mode, 'identify');
  assert.ok(request.body.scanId.startsWith('pi-'));
  assert.equal(request.body.imageDataUrl, f.calls.decode[0].url);
  assert.deepEqual(f.calls.catalog, [{table: 'catalog_plants', columns: CATALOG_SELECT,
    config: {count: 'exact'}, eq: ['slug', slug], limit: 2}]);
  assert.equal(f.calls.auth, 1);
  assert.equal(f.calls.client, 1);
  assert.doesNotMatch(JSON.stringify(f.result), /PROVIDER_|data:image|base64|imageDataUrl|"care"|"profile"/);
  assert(Object.isFrozen(f.result) && Object.isFrozen(f.result.catalogRow) && Object.isFrozen(f.result.evidence.candidates[0]));
  f.payload.candidates[0].scientificName = 'provider mutation after delivery';
  assert.equal(f.result.evidence.candidates[0].scientificName, scientific);
});

test('production authority loader uses the existing Registry singleton and P0-B read authority', async () => {
  await loadIdentityRegistry({fetchImpl: async () => ({ok: true, json: async () => registry})});
  const loaded = await loadPIIdentityAuthority();
  assert.equal(loaded.resolve({scientificName: 'Citrus × limon'}).canonicalSlug, 'lemon');
  assert.equal(loaded.readSlug({scientificName: 'Rubus idaeus'}), 'raspberry');
});

test('memory only: no image or canonical result reaches either browser storage sink', async () => {
  const keys = ['localStorage', 'sessionStorage'];
  const previous = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  let writes = 0;
  try {
    for (const key of keys) Object.defineProperty(globalThis, key, {configurable: true,
      value: {setItem() { writes++; throw Error('PERSISTENCE_FORBIDDEN'); }, getItem() { throw Error('UNEXPECTED_STORAGE'); }}});
    const f = await run();
    assert.equal(f.result.status, 'CANONICAL_READY');
    assert.equal(writes, 0);
  } finally {
    for (let i = 0; i < keys.length; i++) {
      if (previous[i]) Object.defineProperty(globalThis, keys[i], previous[i]);
      else delete globalThis[keys[i]];
    }
  }
});

test('in-flight clicks and subscriber re-entry share one promise, including while catalog work is pending', async () => {
  const pending = deferred(), pendingCatalog = deferred();
  const f = fixture({transport: () => pending.promise, catalogTransport: () => pendingCatalog.promise});
  await f.controller.selectImage(file());
  let reentry;
  f.controller.subscribe(s => { if (s.status === 'IDENTIFYING' && !reentry) reentry = f.controller.identify({explicitUserAction: true}); });
  const first = f.controller.identify({explicitUserAction: true});
  const second = f.controller.identify({explicitUserAction: true});
  assert.equal(first, second); assert.equal(first, reentry);
  assert.equal(await f.controller.selectImage(file('jpeg')), false);
  assert.equal(f.calls.http.length, 1);
  pending.resolve(httpResponse(evidence()));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.catalog.length, 1);
  assert.equal(f.controller.identify({explicitUserAction: true}), first);
  assert.equal(f.calls.http.length, 1);
  pendingCatalog.resolve({status: 200, error: null, count: 1, data: [row()]});
  await first;
  assert.equal(f.calls.http.length, 1);
  assert.equal(f.calls.catalog.length, 1);
});

for (const [name, transport] of [
  ['HTTP 403 gate', async () => ({ok: false})],
  ['network rejection', async () => { throw Error('offline'); }],
  ['null rejection', async () => { throw null; }],
  ['malformed JSON', async () => ({ok: true, json: async () => { throw Error('invalid json'); }})],
  ['timeout', (_, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Error('abort'))))]
]) test(name + ': zero automatic retries; new explicit action permits only one new request', async () => {
  const f = await run({transport, requestTimeoutMs: 5});
  assert.equal(f.result.status, 'IDENTIFY_FAILED');
  assert.equal(f.result.readyForResult, false);
  await new Promise(resolve => setImmediate(resolve));
  await f.controller.identify();
  assert.equal(f.calls.http.length, 1);
  assert.equal(f.calls.catalog.length, 0);
  await f.controller.identify({explicitUserAction: true});
  assert.equal(f.calls.http.length, 2);
  assert.notEqual(f.calls.http[0].body.scanId, f.calls.http[1].body.scanId);
});

for (const [name, change] of [
  ['unverified', p => { p.candidates[0].gbifVerified = false; }],
  ['empty', p => { p.candidates = []; }],
  ['genus rank', p => { p.candidates[0].gbifRank = 'GENUS'; }],
  ['weak score', p => { p.candidates[0].gbifScore = 19; }],
  ['low confidence', p => { p.candidates[0].confidence = 'low'; }],
  ['missing taxonomy key', p => { delete p.candidates[0].gbifKey; }],
  ['invalid taxonomy key', p => { p.candidates[0].gbifKey = 'untrusted'; }],
  ['alternatives', p => { p.identification.alternatives = ['other species']; }]
]) test(name + ' taxonomy: no Registry promotion or catalog read', async () => {
  const payload = evidence(); change(payload);
  const f = await run({payload});
  assert.equal(f.result.status, 'TAXONOMY_UNVERIFIED');
  assert.equal(f.result.readyForResult, false);
  assert.equal(f.calls.authority, 0); assert.equal(f.calls.client, 0);
});

for (const [name, change] of [
  ['unknown species', p => { p.candidates[0].scientificName = 'Inventus exampleus'; }],
  ['unregistered authored name', p => { p.candidates[0].scientificName = 'Citrus × limon (L.) Osbeck'; }],
  ['conflicting verified candidates', p => { p.candidates.push(evidence('pomegranate').candidates[0]); }],
  ['conflicting top scientific hint', p => { p.scientificName = 'Punica granatum'; }],
  ['conflicting raw provider hint', p => { p.identification.scientific_name = 'Rubus idaeus'; }]
]) test(name + ': no guessed slug or catalog read', async () => {
  const payload = evidence(); change(payload);
  const f = await run({payload});
  assert.equal(f.result.status, 'IDENTITY_UNRESOLVED');
  assert.equal(f.result.catalogRow, null);
  assert.equal(f.calls.client, 0);
});

test('ambiguous Registry scientific identity fails before catalog access', async () => {
  const ambiguous = structuredClone(registry);
  ambiguous.canonicalIdentities.find(e => e.canonicalSlug === 'pomegranate').acceptedScientificName = 'Citrus × limon';
  const loaded = authorityFor(ambiguous);
  assert.equal(loaded.resolve({scientificName: 'Citrus × limon'}).status, 'ambiguous');
  const f = await run({authority: loaded});
  assert.equal(f.result.status, 'IDENTITY_UNRESOLVED'); assert.equal(f.calls.client, 0);
});

for (const status of ['unresolved', 'provisional', 'pending_conflict']) test(status + ' authority outcome is never promoted', async () => {
  const f = await run({authority: {resolve: () => ({...authority.resolve('lemon'), status}), readSlug: () => 'lemon'}});
  assert.equal(f.result.status, 'IDENTITY_UNRESOLVED'); assert.equal(f.calls.client, 0);
});

for (const [name, data, count, expected] of [
  ['missing', [], 0, 'CATALOG_NOT_FOUND'],
  ['duplicate', [row(), row()], 2, 'CATALOG_CONFLICT'],
  ['wrong slug', [{...row(), slug: 'pomegranate'}], 1, 'CATALOG_CONFLICT'],
  ['wrong scientific identity', [{...row(), scientific_name: 'Punica granatum'}], 1, 'CATALOG_CONFLICT'],
  ['unknown scientific identity', [{...row(), scientific_name: 'Inventus exampleus'}], 1, 'CATALOG_CONFLICT'],
  ['unverified row', [{...row(), verification_state: 'unknown'}], 1, 'CATALOG_CONFLICT'],
  ['needs review', [{...row(), needs_review: true}], 1, 'CATALOG_CONFLICT'],
  ['missing review flag', [{...row(), needs_review: undefined}], 1, 'CATALOG_CONFLICT'],
  ['partial count', [row()], 2, 'CATALOG_READ_FAILED'],
  ['missing count', [row()], null, 'CATALOG_READ_FAILED']
]) test(name + ' catalog response cannot yield CANONICAL_READY', async () => {
  const f = await run({catalogResponse: {status: 200, error: null, data, count}});
  assert.equal(f.result.status, expected); assert.equal(f.result.readyForResult, false);
  assert.equal(f.result.catalogRow, null); assert.equal(f.calls.catalog.length, 1);
  assert.equal(f.calls.http.length, 1);
});

for (const [name, options, reads] of [
  ['foreign project', {supabaseUrl: 'https://foreign.invalid'}, 0],
  ['anonymous', {auth: {error: null, data: {user: null}}}, 0],
  ['expired auth', {auth: {error: {message: 'expired'}, data: {user: null}}}, 0],
  ['catalog permission denial', {catalogResponse: {status: 403, error: {message: 'denied'}, data: null, count: null}}, 1],
  ['catalog network error', {catalogError: Error('offline')}, 1]
]) test(name + ': read fails closed without fallback or second Identify', async () => {
  const f = await run(options);
  assert.equal(f.result.status, 'CATALOG_READ_FAILED');
  assert.equal(f.calls.catalog.length, reads); assert.equal(f.calls.http.length, 1);
  assert.equal(f.result.catalogRow, null);
});

// Execute the actual navigator with controlled DOM events and the actual controller.
// This is not a browser engine or a physical-camera qualification.
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.handlers = {}; this.attrs = {}; this.style = {}; this.clicks = 0; }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  appendChild(child) { child.parent = this; this.children.push(child); }
  remove() { this.parent.children = this.parent.children.filter(value => value !== this); }
  querySelectorAll(selector) { return this.children.filter(child => selector === '.hot' && child.className === 'hot'); }
  addEventListener(event, handler) { (this.handlers[event] ||= []).push(handler); }
  async fire(event, detail = {}) { for (const handler of this.handlers[event] || []) await handler(detail); }
  async click() { if (this.disabled) return; this.clicks++; await this.onclick?.({stopPropagation() {}}); await this.fire('click'); }
}
const html = read('core-v1/plant-identification/index.html');
const approvedContext = vm.createContext({window: {}});
for (const match of html.matchAll(/<script src="(\.\/assets\/s\d-\d+\.js)"><\/script>/g)) {
  vm.runInContext(read('core-v1/plant-identification/' + match[1].slice(2)), approvedContext);
}
function navigatorFixture(f = fixture()) {
  const stage = new Element('main'), screen = new Element('img'), document = new Element('document');
  document.createElement = tag => new Element(tag);
  document.getElementById = id => id === 'stage' ? stage : screen;
  stage.appendChild(screen);
  const window = {__PI: approvedContext.window.__PI};
  const context = vm.createContext({window, document, location: {assign() { throw Error('NAVIGATION_FORBIDDEN'); }},
    alert() { throw Error('ATOMIC_SAVE_FORBIDDEN'); },
    wireRealPiInputs: args => wireRealPiInputs({...args, controller: f.controller})});
  const script = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)][0][1];
  assert.equal((script.match(/^import /gm) || []).length, 1);
  vm.runInContext(script.replace(/^import .*;\n/m, ''), context);
  return {...f, window, context, stage, screen, document,
    button: action => stage.children.find(child => child.attrs['data-pi-action'] === action),
    input: source => stage.children.find(child => child.attrs['data-pi-input'] === source)};
}
async function forbiddenForward(f) {
  await f.screen.click();
  await f.document.fire('keydown', {key: 'ArrowRight'});
  await f.stage.fire('touchstart', {changedTouches: [{clientX: 200}]});
  await f.stage.fire('touchend', {changedTouches: [{clientX: 10}]});
}

for (const source of ['camera', 'gallery']) test(source + ': approved hotspot -> real picker -> exactly one Identify, with no forward bypass', async () => {
  const pending = deferred();
  const f = navigatorFixture(fixture({transport: () => pending.promise}));
  assert.equal(f.stage.children.filter(child => child.tag === 'input').length, 2);
  await forbiddenForward(f);
  assert.equal(f.calls.http.length, 0); assert.match(f.screen.alt, /Identify$/);
  if (source === 'camera') {
    await f.button('camera').click();
    assert.match(f.screen.alt, /Camera$/); assert.equal(f.calls.http.length, 0);
    assert.equal(f.input('camera').attrs.capture, 'environment');
  }
  const action = source === 'camera' ? 'capture' : 'gallery';
  const savedButton = f.button(action);
  await savedButton.click(); await savedButton.click();
  const input = f.input(source);
  assert.equal(input.clicks, 1); assert.equal(input.accept, IMAGE_ACCEPT); assert.equal(input.hidden, true);
  input.files = [file()];
  const change = input.fire('change');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.http.length, 1); assert.match(f.screen.alt, /Analyzing$/);
  await input.fire('change'); await savedButton.click();
  vm.runInContext('render(); render();', f.context);
  await forbiddenForward(f);
  assert.equal(f.calls.http.length, 1); assert.match(f.screen.alt, /Analyzing$/);
  pending.resolve(httpResponse(evidence())); await change;
  assert.equal(f.window.__CRUVIT_REAL_PI_STATE.status, 'CANONICAL_READY');
  assert.equal(f.window.__CRUVIT_REAL_PI_STATE.readyForResult, true);
  await forbiddenForward(f);
  vm.runInContext('go(3); showAcquisitionScreen(7); render();', f.context);
  assert.match(f.screen.alt, /Analyzing$/); assert.equal(f.calls.http.length, 1);
  assert.equal(f.stage.querySelectorAll('.hot').length, 0, 'no PI-03 result hotspot');
  await f.document.fire('keydown', {key: 'ArrowLeft'});
  assert.match(f.screen.alt, /Camera$/);
  await f.stage.fire('touchstart', {changedTouches: [{clientX: 10}]});
  await f.stage.fire('touchend', {changedTouches: [{clientX: 200}]});
  assert.match(f.screen.alt, /Identify$/); assert.equal(f.calls.http.length, 1);
});

test('cancel/unarmed file change costs zero; failure returns to camera and only a fresh selection retries', async () => {
  const f = navigatorFixture(fixture({transport: async () => ({ok: false})}));
  const input = f.input('gallery'); input.files = [file()];
  await input.fire('change'); assert.equal(f.calls.http.length, 0);
  await f.button('gallery').click(); await input.fire('cancel');
  await input.fire('change'); assert.equal(f.calls.http.length, 0);
  await f.button('gallery').click(); await input.fire('change');
  assert.equal(f.calls.http.length, 1); assert.match(f.screen.alt, /Camera$/);
  assert.equal(f.window.__CRUVIT_REAL_PI_STATE.status, 'IDENTIFY_FAILED');
  vm.runInContext('render();', f.context); await forbiddenForward(f); await input.fire('change');
  assert.equal(f.calls.http.length, 1);
  await f.button('gallery').click(); input.files = [file('jpeg')]; await input.fire('change');
  assert.equal(f.calls.http.length, 2);
});

test('all eight approved embedded strings and decoded rasters retain exact SHA-256', () => {
  const strings = [
    '04303beddb52041c92b220160754de58ca5801f4abc460cba6cb539802cfa23f',
    'b5e2bdca9e7d011643dfb2bf2e3282288ca9fa0ae1cb309d3188454f112a26b9',
    '2ead19875112aea36e28c75ad9399a307c99fd406b50d3320921e8e542125e78',
    'ad43490fd6cabf84335c40e1b1264e25f4874bd60e0e443dbe8d462815269d84',
    '799346b5d3c8a0e2d441c0e9ec8d8cb6d51805f5db43a0a3c883e71f60ddf255',
    '3d5a9b2f8c1208630e0b91f839daf997c3bba2e3f4b8de7212daeb8f074f1278',
    '129e45d64b62f5a1cc4766231c10880a44b4c66a74c76bc87482ffaaa9f236aa',
    '0e71d1b586ed3eebf694755b1d0b8ab2b66889072f983ed47acb7e04a4bb1125'
  ];
  const approved = JSON.parse(read('core-v1/plant-identification/owner-approved-manifest.json'));
  const sha = value => createHash('sha256').update(value).digest('hex');
  for (let i = 0; i < 8; i++) {
    const url = approvedContext.window.__PI[i].join('');
    assert.equal(sha(url), strings[i], 'PI-0' + (i + 1) + ' full embedded string');
    assert.equal(sha(Buffer.from(url.split(',')[1], 'base64')), approved.asset_sha256[i]);
    assert.equal(url.length, approved.asset_string_lengths[i]);
  }
});

test('CSS, all downstream PI definitions and Atomic Save entry remain unchanged; runtime has no alternate authority', () => {
  const baseline = execFileSync('git', ['show', '754141e7467a308b2be5f02c76ce5d914fdeb883:core-v1/plant-identification/index.html'], {cwd: root, encoding: 'utf8'});
  assert.equal(html.match(/<style>[\s\S]*?<\/style>/)[0], baseline.match(/<style>[\s\S]*?<\/style>/)[0]);
  const downstream = source => source.slice(source.indexOf('3:[{'), source.indexOf('\n};', source.indexOf('3:[{')));
  assert.equal(downstream(html), downstream(baseline));
  const saveBody = source => source.slice(source.indexOf("if(!saveAction)"), source.indexOf('};stage.appendChild(b)'));
  assert.equal(saveBody(html), saveBody(baseline));
  assert.match(html, /<script type="module" src="\.\/atomic\/boot\.mjs"><\/script>/);
  const runtime = read('modules/plant-identifier/real-pi-runtime-v1.js');
  assert.doesNotMatch(runtime, /plants\.seed|PLANT_LIBRARY|localCare|speciesCare|\.rpc\(|\.insert\(|\.upsert\(|\.update\(|\.upload\(|localStorage|sessionStorage|CRUVIT_ALLOW_PAID/);
});

// Slice 2 exercises the actual page renderer; all Slice 1 tests above are retained.
function observePiTransitions(f) {
  const images = Array.from({length: 8}, (_, i) => approvedContext.window.__PI[i].join(''));
  const visits = [];
  let current = f.screen.src;
  Object.defineProperty(f.screen, 'src', {
    get: () => current,
    set(value) { if (value !== current) visits.push(images.indexOf(value) + 1); current = value; }
  });
  return visits;
}
async function blockedResultNavigation(f) {
  await forbiddenForward(f);
  for (const target of [3, 4, 5, 6, 7, 99]) {
    vm.runInContext('go(' + target + '); render();', f.context);
    assert.doesNotMatch(f.screen.alt, /Result|Plant Profile|Care|Suitability|Save to My Garden/);
    vm.runInContext('showAcquisitionScreen(' + target + '); render();', f.context);
    assert.match(f.screen.alt, /Analyzing$/);
    assert.equal(f.stage.querySelectorAll('.hot').length, 0, 'no forward result hotspot');
  }
}

for (const slug of ['lemon', 'pomegranate', 'raspberry']) test('Slice 2: ' + slug + ' opens exact PI-04 once after the canonical catalog read completes', async () => {
  const pendingIdentify = deferred(), pendingCatalog = deferred();
  const f = navigatorFixture(fixture({slug, transport: () => pendingIdentify.promise,
    catalogTransport: () => pendingCatalog.promise}));
  const visits = observePiTransitions(f);
  await blockedResultNavigation(f);
  vm.runInContext('go(0);', f.context);
  await f.button('gallery').click();
  const input = f.input('gallery'); input.files = [file()];
  const change = input.fire('change');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.http.length, 1);
  await blockedResultNavigation(f);
  pendingIdentify.resolve(httpResponse(evidence(slug)));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.catalog.length, 1);
  assert.equal(f.controller.getState().status, 'IDENTIFYING');
  await blockedResultNavigation(f);
  assert.equal(visits.includes(4), false, 'provider evidence alone never opens PI-04');
  pendingCatalog.resolve({status: 200, error: null, count: 1, data: [row(slug)]});
  await change;
  assert.equal(f.controller.getState().status, 'CANONICAL_READY');
  assert.equal(f.controller.getState().readyForResult, true);
  assert.deepEqual(f.controller.getState().catalogRow, row(slug));
  assert.match(f.screen.alt, /Result$/);
  assert.equal(f.screen.src, approvedContext.window.__PI[3].join(''));
  assert.equal(f.stage.querySelectorAll('.hot').length, 0, 'PI-04 cannot open PI-05');
  await forbiddenForward(f);
  vm.runInContext('render(); render(); go(4); go(5); go(6); go(7);', f.context);
  assert.match(f.screen.alt, /Result$/);
  assert.deepEqual(visits.filter(screen => screen >= 4), [4]);
  await f.document.fire('keydown', {key: 'ArrowLeft'});
  assert.match(f.screen.alt, /Analyzing$/);
  await blockedResultNavigation(f);
  assert.deepEqual(visits.filter(screen => screen >= 4), [4], 'same completed action cannot reopen PI-04');
  assert.equal(f.calls.http.length, 1);
});

test('Slice 2: a second explicit selection gets one new result transition; invalid replacement revokes the result', async () => {
  const f = navigatorFixture(), visits = observePiTransitions(f);
  const actionIds = [];
  for (const kind of ['png', 'jpeg']) {
    vm.runInContext('go(0);', f.context);
    await f.button('gallery').click();
    f.input('gallery').files = [file(kind)]; await f.input('gallery').fire('change');
    assert.match(f.screen.alt, /Result$/);
    actionIds.push(f.controller.getState().actionId);
    vm.runInContext('render(); render();', f.context);
  }
  assert.notEqual(actionIds[0], actionIds[1]);
  assert.equal(f.calls.http.length, 2);
  assert.deepEqual(visits.filter(screen => screen >= 4), [4, 4]);
  await f.controller.selectImage(new File(['invalid'], 'invalid.png', {type: 'image/png'}));
  assert.equal(f.controller.getState().status, 'IMAGE_INVALID');
  assert.match(f.screen.alt, /Camera$/);
  await blockedResultNavigation(f);
  assert.deepEqual(visits.filter(screen => screen >= 4), [4, 4]);
  assert.equal(f.calls.http.length, 2);
});

for (const [status, options, invalidImage] of [
  ['IMAGE_INVALID', {}, true],
  ['IDENTIFY_FAILED', {transport: async () => ({ok: false})}],
  ['TAXONOMY_UNVERIFIED', {payload: {candidates: []}}],
  ['IDENTITY_UNRESOLVED', {payload: {...evidence(), scientificName: 'Inventus exampleus'}}],
  ['CATALOG_NOT_FOUND', {catalogResponse: {status: 200, error: null, count: 0, data: []}}],
  ['CATALOG_CONFLICT', {catalogResponse: {status: 200, error: null, count: 2, data: [row(), row()]}}],
  ['CATALOG_READ_FAILED', {catalogError: Error('offline')}]
]) test('Slice 2: ' + status + ' remains in acquisition and never renders PI-04', async () => {
  const f = navigatorFixture(fixture(options)), visits = observePiTransitions(f);
  await f.button('gallery').click();
  f.input('gallery').files = [invalidImage ? new File(['invalid'], 'invalid.png', {type: 'image/png'}) : file()];
  await f.input('gallery').fire('change');
  assert.equal(f.controller.getState().status, status);
  assert.equal(f.controller.getState().readyForResult, false);
  assert.match(f.screen.alt, /Camera$/);
  await blockedResultNavigation(f);
  assert.equal(visits.some(screen => screen >= 4), false);
  assert.equal(f.calls.http.length, invalidImage ? 0 : 1);
});

test('Slice 2: both readiness fields are strict and revocation hides an already visible result', async () => {
  let state = {status: 'NO_IMAGE', readyForResult: false, actionId: null};
  const listeners = [];
  const f = navigatorFixture({controller: {getState: () => state, subscribe: listener => listeners.push(listener)}});
  const visits = observePiTransitions(f);
  const publish = next => { state = next; for (const listener of listeners) listener(state); };
  const notReady = [
    ...['NO_IMAGE', 'IMAGE_LOADING', 'IMAGE_READY', 'IDENTIFYING', 'IMAGE_INVALID', 'IDENTIFY_FAILED',
      'TAXONOMY_UNVERIFIED', 'IDENTITY_UNRESOLVED', 'CATALOG_NOT_FOUND', 'CATALOG_CONFLICT',
      'CATALOG_READ_FAILED', 'canonical_ready', 'CANONICAL_READY '].map(status => ({status, readyForResult: true})),
    ...[false, undefined, null, 0, 1, 'true'].map(readyForResult => ({status: 'CANONICAL_READY', readyForResult}))
  ];
  for (const [i, fields] of notReady.entries()) {
    publish({status: 'IDENTIFYING', readyForResult: false, actionId: 'pending-' + i});
    publish({...fields, actionId: 'unqualified-' + i});
    await blockedResultNavigation(f);
  }
  assert.equal(visits.some(screen => screen >= 4), false);
  publish({status: 'CANONICAL_READY', readyForResult: true, actionId: 'qualified'});
  assert.match(f.screen.alt, /Result$/);
  publish({...state}); publish({...state});
  assert.deepEqual(visits.filter(screen => screen >= 4), [4]);
  publish({...state, readyForResult: false});
  assert.match(f.screen.alt, /Camera$/);
  await blockedResultNavigation(f);
  assert.deepEqual(visits.filter(screen => screen >= 4), [4]);
});
