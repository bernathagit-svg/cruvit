// Slice 1 qualification: native Node + DOM/transport stubs. No hosted/browser/provider claim.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRealPiController, wireRealPiInputs, decodeBrowserImage, loadPIIdentityAuthority, createPiResultView, canonicalPiResult, PI_RESULT_SLOTS,
  createPiProfileView, canonicalPiProfile, PI_PROFILE_SLOTS,
  createPiCareView, canonicalPiCare, PI_CARE_SLOTS,
  IDENTIFY_ENDPOINT, IMAGE_ACCEPT, MAX_IMAGE_BYTES, CATALOG_SELECT} from '../modules/plant-identifier/real-pi-runtime-v1.js';
import {createPlantIdentityResolver, loadIdentityRegistry} from '../modules/identity/plant-identity-resolver.js';
import {resolveCanonicalReadSlug} from '../modules/identity/canonical-alias-authority-v1.js';
import {PREVIEW_URL} from '../core-v1/my-garden/shared/preview-session.mjs';
import {catalogRowToRuntimePlant} from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';
import {resolvePlantDisplayMedia} from '../modules/catalog-media/licensed-catalog-media-runtime-v1.js';
import {resolveSmartRecCatalogDisplay} from '../modules/smart-recommendations/smart-rec-garden-intelligence-v1.js';
import {projectRows, GARDEN_ID} from '../core-v1/my-garden/plants/data.mjs';
import {materializePlantCatalogItemFromPacket} from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import {createPiSuitabilityView, readPiSuitability, PI_SUITABILITY_SLOTS} from '../modules/plant-identifier/pi-suitability-view-v1.js';


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
    wireRealPiInputs: args => wireRealPiInputs({...args, controller: f.controller}), createPiResultView, createPiProfileView, canonicalPiProfile, createPiCareView, createPiSuitabilityView});
  const script = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)][0][1];
  assert.equal((script.match(/^import /gm) || []).length, 2);
  vm.runInContext(script.replace(/^import .*;\n/gm, ''), context);
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

// Slice 3 uses existing catalog-media cache records as controlled catalog fixtures.
// These fixtures are test-only; runtime never reads this cache or a plant/image map.
const witnessFixtures = [
  ['lemon', 'Lemon', 'lemon__citrus___limon__v1.0.0.json'],
  ['pomegranate', 'Pomegranate', 'pomegranate__punica_granatum__v1.0.0.json'],
  ['raspberry', 'Raspberry', 'raspberry__rubus_idaeus__v1.0.0.json']
];
function displayRow(slug = 'lemon') {
  const [, name, cache] = witnessFixtures.find(w => w[0] === slug);
  return {...row(slug), common_names: {en: name}, media_status: 'IMAGE_READY',
    media: JSON.parse(read('data/catalog-media/cache/' + cache)).media};
}
const displayState = (slug = 'lemon') => ({status: 'CANONICAL_READY', readyForResult: true,
  actionId: 'display-' + slug, identity: {canonicalSlug: slug}, catalogRow: displayRow(slug), evidence: evidence(slug)});
const resultElement = f => f.stage.children.find(e => e.className === 'pi-result');
const contentSlot = (view, key) => view.children.find(e => e.attrs['data-pi-slot'] === key);

for (const [slug, name] of witnessFixtures) test('Slice 3: ' + slug + ' binds its exact canonical row, confidence and shared catalog image', async () => {
  const canonical = displayRow(slug), payload = evidence(slug);
  payload.candidates[0].commonName = 'WRONG_PROVIDER_NAME';
  payload.imageUrl = 'https://provider.invalid/wrong.jpg';
  payload.confidencePercent = 96;
  const f = navigatorFixture(fixture({slug, payload,
    catalogResponse: {status: 200, error: null, count: 1, data: [canonical]}}));
  await f.button('gallery').click(); f.input('gallery').files = [file()]; await f.input('gallery').fire('change');
  const state = f.controller.getState(), model = canonicalPiResult(state), view = resultElement(f);
  assert.equal(model.available, true); assert.equal(model.canonicalSlug, slug);
  assert.equal(model.name, name); assert.equal(model.scientific, canonical.scientific_name);
  assert.equal(model.confidence, 'High confidence'); assert.equal(model.media.authority, 'catalog_plants.media');
  assert.deepEqual(state.catalogRow, canonical);
  assert.equal(model.media.url, canonical.media.primaryUrl);
  const shared = catalogRowToRuntimePlant(canonical);
  assert.equal(model.media.url, resolvePlantDisplayMedia(shared).url);
  assert.equal(model.media.url, resolveSmartRecCatalogDisplay({slug, scientific: canonical.scientific_name}, {[slug]: shared}).url);
  const garden = projectRows({id: GARDEN_ID, user_id: 'fixture-owner'}, [{id: 'plant-' + slug,
    user_id: 'fixture-owner', garden_profile_id: GARDEN_ID, profile_slug: slug,
    scientific: canonical.scientific_name, name, archived: false}], [canonical]);
  assert.equal(model.media.url, garden.cards[0].systemImage.url);
  assert.equal(contentSlot(view, 'name').textContent, name);
  assert.equal(contentSlot(view, 'scientific').textContent, canonical.scientific_name);
  const photo = contentSlot(view, 'photo').children.find(e => e.tag === 'img');
  assert.equal(photo.src, canonical.media.primaryUrl);
  assert.notEqual(photo.src, f.calls.decode[0].url);
  photo.onload(); assert.equal(view.attrs['data-pi-result'], 'RESULT_READY');
  assert.equal(f.calls.http.length, 1); assert.equal(f.calls.catalog.length, 1);
  assert.equal(f.calls.catalog[0].columns, CATALOG_SELECT);
  assert.equal(f.stage.querySelectorAll('.hot').length, 1, 'Slice 4 enables only the bound profile entry');
  assert.equal(JSON.stringify(model).includes('PROVIDER'), false);
  assert.equal(JSON.stringify(model).includes('data:image'), false);
  assert.equal(contentSlot(view, 'evidence').textContent.includes('96'), false);
  const credit = contentSlot(view, 'photo').children.find(e => e.className === 'pi-result-credit');
  assert.ok(credit.textContent.includes(canonical.media.license));
  assert.equal(credit.children.find(e => e.textContent === 'Source').href, canonical.media.sourcePageUrl);
  assert.equal(credit.children.find(e => e.textContent === 'License').href, canonical.media.licenseUrl);
});

for (const [name, mutate, reason] of [
  ['not ready', s => {s.status = 'IDENTIFYING';}, 'RESULT_NOT_READY'],
  ['non-boolean ready', s => {s.readyForResult = 'true';}, 'RESULT_NOT_READY'],
  ['wrong canonical row', s => {s.catalogRow.slug = 'pomegranate';}, 'CATALOG_IDENTITY_UNAVAILABLE'],
  ['wrong scientific name', s => {s.catalogRow.scientific_name = 'Punica granatum';}, 'CATALOG_IDENTITY_UNAVAILABLE'],
  ['missing common name', s => {delete s.catalogRow.common_names;}, 'CATALOG_NAME_UNAVAILABLE'],
  ['missing scientific name', s => {s.catalogRow.scientific_name = '';}, 'CATALOG_NAME_UNAVAILABLE'],
  ['missing confidence', s => {s.evidence = null;}, 'CONFIDENCE_UNAVAILABLE'],
  ['missing media', s => {delete s.catalogRow.media;}, 'CATALOG_IMAGE_UNAVAILABLE'],
  ['pending media status', s => {s.catalogRow.media_status = 'IMAGE_PENDING';}, 'CATALOG_IMAGE_UNAVAILABLE'],
  ['pending media record', s => {s.catalogRow.media.imageStatus = 'IMAGE_PENDING';}, 'CATALOG_IMAGE_UNAVAILABLE'],
  ['unlicensed media', s => {s.catalogRow.media.commercialUseAllowed = false;}, 'CATALOG_IMAGE_UNAVAILABLE'],
  ['cross-plant media', s => {s.catalogRow.media.canonicalPlantIdentity = 'pomegranate';}, 'CATALOG_IMAGE_UNAVAILABLE'],
  ['scan as data URL', s => {s.catalogRow.media.primaryUrl = 'data:image/png;base64,forbidden';}, 'CATALOG_IMAGE_UNAVAILABLE'],
  ['design cutout', s => {s.catalogRow.media.kind = 'design_cutout';}, 'CATALOG_IMAGE_UNAVAILABLE']
]) test('Slice 3: ' + name + ' fails honestly without a reference-plant or scan-photo fallback', () => {
  const state = displayState(); mutate(state);
  const model = canonicalPiResult(state);
  assert.equal(model.available, false); assert.equal(model.reason, reason);
  const stage = new Element('main'), document = {createElement: tag => new Element(tag)};
  createPiResultView({document, stage}).update(state, true);
  const view = stage.children[0];
  assert.equal(view.attrs['data-pi-result'], 'RESULT_UNAVAILABLE');
  assert.equal(contentSlot(view, 'photo').children.some(e => e.tag === 'img'), false);
});

test('Slice 3: changing witnesses replaces all content in identical approved slots; stale image callbacks cannot leak', () => {
  const stage = new Element('main'), document = {createElement: tag => new Element(tag)};
  const view = createPiResultView({document, stage}); let geometry, oldPhoto;
  const urls = new Set();
  for (const [slug, name] of witnessFixtures) {
    const state = displayState(slug); view.update(state, true);
    assert.equal(stage.children.length, 1);
    const root = stage.children[0], slots = root.children;
    const nextGeometry = slots.map(slot => ({key: slot.attrs['data-pi-slot'], style: slot.style}));
    // Text fitting is content-dependent; the approved rectangles remain identical.
    const rectangles = nextGeometry.map(({key, style}) => ({key, left: style.left, top: style.top, width: style.width, height: style.height}));
    if (geometry) assert.deepEqual(rectangles, geometry); else geometry = rectangles;
    assert.equal(contentSlot(root, 'name').textContent, name);
    if (oldPhoto) { oldPhoto.onerror(); oldPhoto.onload(); assert.equal(root.attrs['data-pi-result'], 'IMAGE_LOADING'); }
    const photo = contentSlot(root, 'photo').children.find(e => e.tag === 'img'); urls.add(photo.src);
    photo.onload(); assert.equal(root.attrs['data-pi-result'], 'RESULT_READY');
    view.update(state, true); assert.equal(stage.children[0], root, 're-render does not reload catalog media');
    oldPhoto = photo;
  }
  assert.equal(urls.size, 3);
  view.update({status: 'IMAGE_LOADING'}, false); assert.equal(stage.children.length, 0);
  oldPhoto.onload(); assert.equal(stage.children.length, 0);
});

test('Slice 3: a failed image hides it and reports unavailable, with no fallback request', () => {
  const stage = new Element('main'), document = {createElement: tag => new Element(tag)};
  const renderer = createPiResultView({document, stage}); const state = displayState(); renderer.update(state, true);
  const view = stage.children[0], slot = contentSlot(view, 'photo');
  const photo = slot.children.find(e => e.tag === 'img'), src = photo.src;
  photo.onerror();
  assert.equal(view.attrs['data-pi-result'], 'RESULT_UNAVAILABLE');
  assert.equal(photo.hidden, true); assert.equal(photo.src, src);
  assert.equal(slot.children.find(e => e.tag === 'span').textContent, 'Catalog image unavailable');
  renderer.update(state, true); assert.equal(stage.children[0], view);
});

test('Slice 3: no personal cover, provider profile or scan photo can override canonical catalog media', () => {
  const state = displayState();
  state.catalogRow.coverMediaId = 'forbidden'; state.catalogRow.coverSignedUrl = 'https://scan.invalid/cover.jpg';
  state.catalogRow.photoUrl = 'https://scan.invalid/photo.jpg'; state.catalogRow.scanPhotoUrl = 'data:image/png;base64,scan';
  state.evidence.imageUrl = 'https://provider.invalid/wrong.jpg'; state.evidence.profile = {name: 'WRONG'};
  const model = canonicalPiResult(state);
  assert.equal(model.media.kind, 'catalog'); assert.equal(model.media.url, displayRow().media.primaryUrl);
  assert.equal(JSON.stringify(model).includes('forbidden'), false);
  assert.equal(JSON.stringify(model).includes('scan.invalid'), false);
});

test('Slice 3: approved layout/base CSS, acquisition code and navigation gate are unchanged', () => {
  const parent = execFileSync('git', ['show', '2f85ab4a52585d2288ea30be326d621d2fe71792:core-v1/plant-identification/index.html'], {cwd: root, encoding: 'utf8'});
  assert.equal(html.match(/<style>[\s\S]*?<\/style>/)[0], parent.match(/<style>[\s\S]*?<\/style>/)[0]);
  for (const [start, end] of [['function go(i)', 'function render()'], ['let touchStartX', 'Object.defineProperty']]) {
    assert.equal(html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start))), parent.slice(parent.indexOf(start), parent.indexOf(end, parent.indexOf(start))));
  }
  const runtime = read('modules/plant-identifier/real-pi-runtime-v1.js');
  const before = execFileSync('git', ['show', '2f85ab4a52585d2288ea30be326d621d2fe71792:modules/plant-identifier/real-pi-runtime-v1.js'], {cwd: root, encoding: 'utf8'});
  assert.equal(runtime.slice(runtime.indexOf('export function wireRealPiInputs')), before.slice(before.indexOf('export function wireRealPiInputs')));
  assert.equal(Object.keys(PI_RESULT_SLOTS).length, 17);
  assert.doesNotMatch(runtime, /PROVIDER_|lemon|pomegranate|raspberry|plants\.seed|catalog-media\/cache/);
});

// Slice 4: profile facts come from the same controlled canonical row. The two
// seasonality records below are existing source-supported catalog fixtures;
// Lemon deliberately has no supported profile facts and must say unavailable.
function profileRow(slug = 'lemon') {
  const paths = {
    pomegranate: 'data/catalog/end-to-end-batch-b/seasonality/pomegranate.json',
    raspberry: 'data/catalog/full-catalog/seasonality-seven/raspberry.json'
  };
  return {...displayRow(slug), climate_traits: paths[slug]
    ? {seasonalityEvidence: JSON.parse(read(paths[slug])).result} : {}};
}
const profileElement = f => f.stage.children.find(e => e.className === 'pi-profile');
const profileSlot = (view, key) => view.children.find(e => e.attrs['data-pi-profile-slot'] === key);
const profileButton = f => f.stage.children.find(e => Object.hasOwn(e.attrs, 'data-pi-profile-open'));
const resultPhoto = f => contentSlot(resultElement(f), 'photo').children.find(e => e.tag === 'img');
const trustedClick = b => b.onclick({isTrusted: true, stopPropagation() {}});
async function readyProfileFixture(slug = 'lemon') {
  const canonical = profileRow(slug);
  const f = navigatorFixture(fixture({slug, catalogResponse: {status: 200, error: null, count: 1, data: [canonical]}}));
  await f.button('gallery').click(); f.input('gallery').files = [file()]; await f.input('gallery').fire('change');
  return f;
}

for (const [slug, name] of witnessFixtures) test('Slice 4: ' + slug + ' opens only its current canonical profile after the bound result', async () => {
  const f = await readyProfileFixture(slug), visits = observePiTransitions(f);
  assert.equal(profileButton(f), undefined, 'image must load before profile entry exists');
  vm.runInContext('go(4); render();', f.context); assert.match(f.screen.alt, /Result$/);
  resultPhoto(f).onload();
  const state = f.controller.getState(), model = canonicalPiProfile(state);
  assert.equal(model.canonicalSlug, canonicalPiResult(state).canonicalSlug);
  assert.equal(model.name, name); assert.equal(model.scientific, profileRow(slug).scientific_name);
  assert.equal(model.media.url, canonicalPiResult(state).media.url);
  assert.equal(model.description, slug === 'lemon' ? 'Plant profile details are not available.'
    : slug === 'pomegranate' ? 'Foliage: deciduous.' : 'Foliage: context dependent.');
  const button = profileButton(f);
  await button.click(); assert.match(f.screen.alt, /Result$/, 'synthetic click is not a profile action');
  await trustedClick(button); assert.match(f.screen.alt, /Plant Profile$/);
  const view = profileElement(f);
  assert.equal(view.attrs['data-canonical-slug'], slug); assert.equal(view.attrs['data-identify-action'], state.actionId);
  assert.equal(profileSlot(view, 'name').textContent, name);
  assert.equal(profileSlot(view, 'scientific').textContent, profileRow(slug).scientific_name);
  assert.equal(profileSlot(view, 'description').textContent, model.description);
  const photo = profileSlot(view, 'photo').children.find(e => e.tag === 'img');
  assert.equal(photo.src, model.media.url); assert.notEqual(photo.src, f.calls.decode[0].url);
  photo.onload(); assert.equal(view.attrs['data-pi-profile'], 'PROFILE_READY');
  await trustedClick(button); vm.runInContext('render(); render();', f.context);
  assert.equal(profileElement(f), view); assert.deepEqual(visits, [5], 'one profile transition, stale button inert');
  assert.equal(f.calls.http.length, 1); assert.equal(f.calls.catalog.length, 1, 'profile needs no additional catalog read');
  assert.equal(f.stage.querySelectorAll('.hot').length, 2, 'only Back to result and the authorized Slice 5 Care entry are enabled');
  await forbiddenForward(f);
  for (const i of [5, 6, 7, 99]) { vm.runInContext('go(' + i + '); render();', f.context); assert.match(f.screen.alt, /Plant Profile$/); }
  assert.equal(visits.some(i => i >= 6), false);
  await trustedClick(f.stage.querySelectorAll('.hot')[0]); assert.match(f.screen.alt, /Result$/);
  assert.equal(profileElement(f), undefined, 'back removes profile data');
});

for (const status of ['NO_IMAGE', 'IMAGE_LOADING', 'IMAGE_READY', 'IDENTIFYING', 'IMAGE_INVALID', 'IDENTIFY_FAILED',
  'TAXONOMY_UNVERIFIED', 'IDENTITY_UNRESOLVED', 'CATALOG_NOT_FOUND', 'CATALOG_CONFLICT', 'CATALOG_READ_FAILED']) {
  test('Slice 4: ' + status + ' cannot render a profile through state or helper bypasses', () => {
    const state = {...displayState(), status};
    const f = navigatorFixture({controller: {getState: () => state, subscribe() {}}});
    vm.runInContext('index=4; render(); go(4); showAcquisitionScreen(4); render();', f.context);
    assert.equal(profileElement(f), undefined); assert.equal(profileButton(f), undefined);
    assert.doesNotMatch(f.screen.alt, /Plant Profile|Care|Suitability|Save to My Garden/);
    const stage = new Element('main'); createPiProfileView({stage, document: f.document}).update(state, true);
    assert.equal(stage.children.length, 0);
  });
}

test('Slice 4: a current canonical state alone is not a profile navigation permit', async () => {
  const f = await readyProfileFixture(); resultPhoto(f).onload();
  const oldButton = profileButton(f);
  vm.runInContext('index=4; render();', f.context);
  assert.match(f.screen.alt, /Camera$/); assert.equal(profileElement(f), undefined);
  await trustedClick(oldButton); assert.equal(profileElement(f), undefined);
  for (const value of ['5', '6', '7', '99', 'NaN', 'Infinity']) {
    vm.runInContext('index=' + value + '; render();', f.context);
    assert.match(f.screen.alt, /Camera$/); assert.equal(profileElement(f), undefined);
  }
});

test('Slice 4: replacement selection immediately clears PI-05 and invalidates old buttons and callbacks', async () => {
  const options = {catalogResponse: {status: 200, error: null, count: 1, data: [profileRow()]}, payload: evidence()};
  const f = navigatorFixture(fixture(options));
  let previousButton, previousPhoto;
  for (const slug of ['lemon', 'pomegranate', 'raspberry']) {
    options.payload.candidates = evidence(slug).candidates;
    options.payload.scientificName = entry(slug).acceptedScientificName;
    options.payload.identification.scientific_name = entry(slug).acceptedScientificName;
    options.catalogResponse.data = [profileRow(slug)];
    vm.runInContext('showAcquisitionScreen(0);', f.context);
    assert.equal(profileElement(f), undefined);
    await f.button('gallery').click(); f.input('gallery').files = [file()]; const change = f.input('gallery').fire('change');
    assert.equal(profileElement(f), undefined);
    if (previousButton) { await trustedClick(previousButton); previousPhoto.onload(); previousPhoto.onerror(); }
    await change; resultPhoto(f).onload();
    await trustedClick(profileButton(f));
    const view = profileElement(f); assert.equal(view.attrs['data-canonical-slug'], slug);
    assert.equal(profileSlot(view, 'description').textContent, canonicalPiProfile(f.controller.getState()).description);
    previousPhoto = profileSlot(view, 'photo').children.find(e => e.tag === 'img');
    previousButton = f.stage.querySelectorAll('.hot')[0];
    assert.equal(Object.isFrozen(f.controller.getState().catalogRow.climate_traits), true);
  }
  await f.controller.selectImage(new File(['bad'], 'bad.txt', {type: 'text/plain'}));
  assert.equal(profileElement(f), undefined); assert.equal(f.controller.getState().catalogRow, null);
  await trustedClick(previousButton); previousPhoto.onload(); assert.equal(profileElement(f), undefined);
  assert.equal(f.calls.http.length, 3); assert.equal(f.calls.catalog.length, 3);
});

test('Slice 4: unsupported or review-needed facts stay unavailable; provider prose and images never enter PI-05', () => {
  const s = displayState(); s.catalogRow.climate_traits = {growthHabit: 'tree', traitEvidenceClasses: {growthHabit: 'HEURISTIC_ASSERTION'},
    seasonalityEvidence: {state: 'EVERGREEN', evidenceClass: 'UNKNOWN'}};
  s.catalogRow.profile = s.evidence.profile = 'WRONG_PROVIDER_PROFILE'; s.evidence.imageUrl = 'https://scan.invalid/photo.jpg';
  assert.equal(canonicalPiProfile(s).description, 'Plant profile details are not available.');
  s.catalogRow.climate_traits.traitEvidenceClasses.growthHabit = 'SOURCE_SUPPORTED';
  assert.equal(canonicalPiProfile(s).description, 'Growth habit: tree.');
  s.catalogRow.climate_traits.needsReview = true;
  assert.equal(canonicalPiProfile(s).description, 'Plant profile details are not available.');
  assert.equal(canonicalPiProfile(s).media.url, displayRow().media.primaryUrl);
  assert.doesNotMatch(JSON.stringify(canonicalPiProfile(s)), /WRONG_PROVIDER|scan.invalid|Monstera|Swiss Cheese/);
});

test('Slice 4: missing readiness, identity or media fails closed; image errors do not fall back or reopen navigation', async () => {
  for (const mutate of [s => {s.readyForResult = 'true';}, s => {s.catalogRow.slug = 'raspberry';},
    s => {s.catalogRow.media = null;}, s => {s.catalogRow.common_names = {};}]) {
    const s = displayState(); mutate(s); assert.equal(canonicalPiProfile(s).available, false);
  }
  const f = await readyProfileFixture(); const image = resultPhoto(f); image.onerror();
  assert.equal(profileButton(f), undefined);
  image.onload(); await trustedClick(profileButton(f));
  const view = profileElement(f), photo = profileSlot(view, 'photo').children.find(e => e.tag === 'img');
  photo.onerror(); assert.equal(photo.hidden, true); assert.equal(view.attrs['data-pi-profile'], 'PROFILE_UNAVAILABLE');
  assert.equal(photo.src, profileRow().media.primaryUrl);
  assert.equal(f.calls.http.length, 1); assert.equal(f.calls.catalog.length, 1);
});

test('Slice 4: profile slots and PI-04 styling preserve the approved layout and protected runtime scope', () => {
  assert.deepEqual(Object.keys(PI_PROFILE_SLOTS), ['photo', 'name', 'scientific', 'description', 'credit']);
  const before = execFileSync('git', ['show', '2ccab3b34c3e3964b3d996022e8921f96b9eac98:core-v1/plant-identification/index.html'], {cwd: root, encoding: 'utf8'});
  assert.equal(html.match(/<style id="pi-result-style">[\s\S]*?<\/style>/)[0], before.match(/<style id="pi-result-style">[\s\S]*?<\/style>/)[0]);
  assert.equal(html.slice(html.indexOf('let touchStartX'), html.indexOf('Object.defineProperty')), before.slice(before.indexOf('let touchStartX'), before.indexOf('Object.defineProperty')));
});

// Slice 5 fixtures reuse existing ingestion facts, never runtime plant maps.
function careRow(slug = 'lemon') {
  const canonical = profileRow(slug);
  if (slug !== 'lemon') {
    const packet = JSON.parse(read('data/catalog-expansion/batches/bulk-batch-3-v1/packets/' + slug + '.packet.json'));
    const materialized = materializePlantCatalogItemFromPacket(packet);
    assert.equal(materialized.ok, true);
    const ct = materialized.item.climateTraits;
    for (const key of ['sunNeeds', 'waterNeeds', 'drainageNeeds', 'humidityTolerance', 'traitEvidenceClasses', 'traitProvenance']) {
      if (Object.hasOwn(ct, key)) canonical.climate_traits[key] = ct[key];
    }
  }
  return canonical;
}
const careElement = f => f.stage.children.find(e => e.className === 'pi-care');
const careSlot = (view, key) => view.children.find(e => e.attrs['data-pi-care-slot'] === key);
const careButton = f => f.stage.children.find(e => Object.hasOwn(e.attrs, 'data-pi-care-open'));
const profilePhoto = f => profileSlot(profileElement(f), 'photo').children.find(e => e.tag === 'img');
async function openCareFixture(slug = 'lemon') {
  const f = navigatorFixture(fixture({slug, catalogResponse: {status: 200, error: null, count: 1, data: [careRow(slug)]}}));
  await f.button('gallery').click(); f.input('gallery').files = [file()]; await f.input('gallery').fire('change');
  resultPhoto(f).onload(); await trustedClick(profileButton(f));
  return f;
}
for (const [slug, name] of witnessFixtures) test('Slice 5: ' + slug + ' keeps exact canonical continuity PI-04 → PI-05 → PI-06', async () => {
  const f = await openCareFixture(slug), visits = observePiTransitions(f), state = f.controller.getState();
  assert.equal(careButton(f), undefined, 'loading profile cannot open care');
  vm.runInContext('go(5); render();', f.context); assert.match(f.screen.alt, /Plant Profile$/);
  profilePhoto(f).onload(); const button = careButton(f);
  await button.click(); assert.match(f.screen.alt, /Plant Profile$/, 'synthetic click is not a care action');
  await trustedClick(button); assert.match(f.screen.alt, /Care$/);
  assert.equal(f.screen.src, approvedContext.window.__PI[5].join(''));
  const model = canonicalPiCare(state), view = careElement(f);
  assert.equal(model.name, name); assert.equal(model.scientific, state.catalogRow.scientific_name);
  assert.equal(view.attrs['data-canonical-slug'], slug); assert.equal(view.attrs['data-identify-action'], state.actionId);
  assert.equal(careSlot(view, 'name').textContent, name);
  assert.equal(careSlot(view, 'scientific').textContent, model.scientific);
  assert.equal(careSlot(view, 'confidence').textContent, 'High confidence');
  const photo = careSlot(view, 'photo').children.find(e => e.tag === 'img');
  assert.equal(photo.src, canonicalPiResult(state).media.url); assert.notEqual(photo.src, f.calls.decode[0].url);
  photo.onload(); assert.equal(view.attrs['data-pi-care'], 'CARE_READY');
  assert.equal(model.cards.watering.value, slug === 'lemon' ? 'Not available' : slug === 'pomegranate' ? 'Low water needs' : 'Medium water needs');
  for (const key of ['temperature', 'humidity', 'fertilizing']) assert.equal(model.cards[key].supported, false);
  for (const [key, card] of Object.entries(model.cards)) {
    assert.equal(careSlot(view, key + 'Value').textContent, card.value);
    assert.equal(careSlot(view, key + 'Note').textContent, card.note);
  }
  assert.doesNotMatch(JSON.stringify(model), /Monstera|Swiss Cheese|PROVIDER_|2–3 cm|1–2 weeks|4–6 weeks|spring–summer|95%/);
  await trustedClick(button); await forbiddenForward(f);
  vm.runInContext('render(); render(); go(6); go(7); go(99);', f.context);
  assert.equal(careElement(f), view); assert.deepEqual(visits, [6]);
  assert.deepEqual(f.stage.querySelectorAll('.hot').map(button => button.attrs['aria-label']),
    ['Back to profile', 'Growing Conditions'], 'only the explicit PI-07 entry is added; Save stays locked');
  assert.equal(f.calls.http.length, 1); assert.equal(f.calls.catalog.length, 1);
  await trustedClick(f.stage.querySelectorAll('.hot')[0]); assert.match(f.screen.alt, /Plant Profile$/);
  assert.equal(careElement(f), undefined); assert.equal(careButton(f), undefined, 'returned profile must bind before care entry');
});
for (const status of ['NO_IMAGE', 'IMAGE_LOADING', 'IMAGE_READY', 'IDENTIFYING', 'IMAGE_INVALID', 'IDENTIFY_FAILED',
  'TAXONOMY_UNVERIFIED', 'IDENTITY_UNRESOLVED', 'CATALOG_NOT_FOUND', 'CATALOG_CONFLICT', 'CATALOG_READ_FAILED']) {
  test('Slice 5: ' + status + ' cannot expose care by state, helpers or fabricated view readiness', () => {
    const state = {...displayState(), status};
    const f = navigatorFixture({controller: {getState: () => state, subscribe() {}}});
    vm.runInContext('index=5; render(); go(5); showAcquisitionScreen(5); render();', f.context);
    assert.equal(careElement(f), undefined); assert.equal(careButton(f), undefined);
    const stage = new Element('main'); createPiCareView({stage, document: f.document}).update(state, true);
    assert.equal(stage.children.length, 0); assert.doesNotMatch(f.screen.alt, /Care|Suitability|Save to My Garden/);
  });
}

test('Slice 5: canonical state and bound profile alone cannot mint a care permit', async () => {
  const f = await openCareFixture(); profilePhoto(f).onload(); const oldButton = careButton(f);
  profileElement(f).setAttribute('data-pi-profile', 'PROFILE_READY');
  vm.runInContext('index=5; render();', f.context); assert.match(f.screen.alt, /Camera$/);
  await trustedClick(oldButton); assert.equal(careElement(f), undefined);
  for (const target of ['5', '6', '7', '99', 'NaN', 'Infinity']) {
    vm.runInContext('index=' + target + '; render();', f.context);
    assert.equal(careElement(f), undefined); assert.match(f.screen.alt, /Camera$/);
  }
});

test('Slice 5: profile image failure cannot open care; DOM readiness forgery is inert', async () => {
  const f = await openCareFixture(), photo = profilePhoto(f);
  photo.onerror(); profileElement(f).setAttribute('data-pi-profile', 'PROFILE_READY');
  vm.runInContext('render();', f.context); assert.equal(careButton(f), undefined);
  await forbiddenForward(f); assert.match(f.screen.alt, /Plant Profile$/); assert.equal(careElement(f), undefined);
});

test('Slice 5: same-session plant switching clears old care and rejects old buttons/image callbacks', async () => {
  const options = {payload: evidence(), catalogResponse: {status: 200, error: null, count: 1, data: [careRow()]}};
  const f = navigatorFixture(fixture(options)); let oldButton, oldPhoto;
  const values = [];
  for (const slug of ['lemon', 'pomegranate', 'raspberry']) {
    Object.assign(options.payload, evidence(slug)); options.catalogResponse.data = [careRow(slug)];
    vm.runInContext('showAcquisitionScreen(0);', f.context); assert.equal(careElement(f), undefined);
    await f.button('gallery').click(); f.input('gallery').files = [file()]; const change = f.input('gallery').fire('change');
    assert.equal(careElement(f), undefined);
    if (oldButton) { await trustedClick(oldButton); oldPhoto.onload(); oldPhoto.onerror(); }
    await change; resultPhoto(f).onload(); await trustedClick(profileButton(f)); profilePhoto(f).onload();
    oldButton = careButton(f); await trustedClick(oldButton);
    const view = careElement(f); assert.equal(view.attrs['data-canonical-slug'], slug);
    oldPhoto = careSlot(view, 'photo').children.find(e => e.tag === 'img'); oldPhoto.onload();
    values.push(careSlot(view, 'wateringValue').textContent);
    assert.equal(f.controller.getState().catalogRow.slug, slug);
  }
  assert.equal(new Set(values).size, 3);
  await f.controller.selectImage(new File(['bad'], 'bad.txt', {type: 'text/plain'}));
  await trustedClick(oldButton); oldPhoto.onload(); assert.equal(careElement(f), undefined);
  assert.equal(f.controller.getState().catalogRow, null); assert.equal(f.calls.http.length, 3);
});

test('Slice 5: care facts need source support; unknown, heuristic, disputed, missing provenance and review stay unavailable', () => {
  for (const mutate of [ct => {ct.needsReview = true;}, ct => {ct.canonicalSlug = 'lemon';},
    ct => {ct.traitEvidenceClasses.waterNeeds = 'UNKNOWN';}, ct => {ct.traitProvenance.waterNeeds.evidenceClass = 'HEURISTIC_ASSERTION';},
    ct => {ct.traitProvenance.waterNeeds.status = 'disputed';}, ct => {ct.traitProvenance.waterNeeds.sourceIds = [];},
    ct => {ct.traitProvenance.waterNeeds.shortExcerpt = '';}, ct => {ct.waterNeeds = 'PROVIDER_WATER';}]) {
    const state = {...displayState('raspberry'), catalogRow: careRow('raspberry')}; mutate(state.catalogRow.climate_traits);
    assert.equal(canonicalPiCare(state).cards.watering.supported, false);
  }
});

test('Slice 5: fertilizer gap never consumes care.guide, maintenance inventions, provider care or scan media', () => {
  const state = {...displayState('raspberry'), catalogRow: careRow('raspberry')};
  state.catalogRow.climate_traits.plantKnowledge = {maintenance: {fertilizing: {value: 'POISON_FEEDING', evidenceClass: 'SOURCE_SUPPORTED', status: 'asserted', sourceIds: ['fixture'], shortExcerpt: 'POISON_FEEDING'}}};
  state.catalogRow.care = {guide: 'POISON_FEEDING'}; state.evidence.care = {fertilizing: 'POISON_FEEDING'};
  state.catalogRow.profile = 'POISON_PROFILE'; state.image = {dataUrl: 'data:image/jpeg;base64,POISON_SCAN'};
  const model = canonicalPiCare(state);
  assert.deepEqual(model.cards.fertilizing, {value: 'Not available', note: 'Not available yet.', source: null, supported: false});
  assert.doesNotMatch(JSON.stringify(model), /POISON_|Monstera/);
});

test('Slice 5: only provenanced preferred temperatures display; survival limits, guessed numbers and reversed ranges do not', () => {
  const state = displayState(), ct = state.catalogRow.climate_traits = {};
  const keys = ['preferred_minimum_temperature_c', 'preferred_maximum_temperature_c'];
  ct.quantitativeEvidence = {[keys[0]]: 12, [keys[1]]: 24};
  ct.quantitativeProvenance = Object.fromEntries(keys.map(key => [key, {sourceIds: ['contract-fixture'], shortExcerpt: 'Controlled canonical preferred-temperature contract fixture.'}]));
  assert.equal(canonicalPiCare(state).cards.temperature.value, '12–24°C');
  ct.quantitativeProvenance[keys[0]].status = 'unknown'; assert.equal(canonicalPiCare(state).cards.temperature.supported, false);
  delete ct.quantitativeProvenance[keys[0]].status;
  ct.quantitativeProvenance[keys[0]].evidenceClass = 'HEURISTIC_ASSERTION'; assert.equal(canonicalPiCare(state).cards.temperature.supported, false);
  delete ct.quantitativeProvenance[keys[0]].evidenceClass;
  ct.quantitativeEvidence[keys[1]] = 4; assert.equal(canonicalPiCare(state).cards.temperature.supported, false);
  ct.quantitativeEvidence[keys[1]] = '24'; assert.equal(canonicalPiCare(state).cards.temperature.supported, false);
  ct.quantitativeEvidence = {minimum_survival_temperature_c: 12, maximum_tolerated_temperature_c: 24};
  assert.equal(canonicalPiCare(state).cards.temperature.supported, false);
});

test('Slice 5: humidity is tolerance, never an invented humidity target; soil knowledge uses the existing provenanced leaf', () => {
  const state = {...displayState('raspberry'), catalogRow: careRow('raspberry')}, ct = state.catalogRow.climate_traits;
  ct.humidityTolerance = 'low'; ct.traitEvidenceClasses.humidityTolerance = 'SOURCE_SUPPORTED';
  ct.traitProvenance.humidityTolerance = {evidenceClass: 'SOURCE_SUPPORTED', status: 'asserted', sourceIds: ['fixture'], shortExcerpt: 'Controlled tolerance contract fixture.'};
  assert.equal(canonicalPiCare(state).cards.humidity.value, 'Low tolerance');
  assert.doesNotMatch(canonicalPiCare(state).cards.humidity.note, /\d|misting|prefers/i);
  ct.plantKnowledge = {sources: [{sourceId: 'fixture'}], soilRequirements: {acidicSoil: {
    value: true, evidenceClass: 'SOURCE_SUPPORTED', status: 'asserted', sourceIds: ['fixture'], shortExcerpt: 'Controlled acidic-soil contract fixture.'}}};
  assert.match(canonicalPiCare(state).cards.soil.note, /Acidic soil required/);
  ct.plantKnowledge.canonicalSlug = 'cranberry'; assert.doesNotMatch(canonicalPiCare(state).cards.soil.note, /Acidic/);
});

test('Slice 5: care image failure stays honest and uses no fallback; reset removes every slot', async () => {
  const f = await openCareFixture(); profilePhoto(f).onload(); await trustedClick(careButton(f));
  const view = careElement(f), photo = careSlot(view, 'photo').children.find(e => e.tag === 'img');
  photo.onerror(); assert.equal(photo.hidden, true); assert.equal(view.attrs['data-pi-care'], 'CARE_IMAGE_UNAVAILABLE');
  assert.equal(photo.src, careRow().media.primaryUrl); assert.equal(f.calls.http.length, 1);
  vm.runInContext('go(0);', f.context); assert.equal(careElement(f), undefined);
  photo.onload(); assert.equal(careElement(f), undefined);
});

test('Slice 5: PI-01–05 styles/acquisition and canonical controller/Save authorities remain unchanged', () => {
  const base = '1240e2007b5f6654e20767bffa9891304a64afcc';
  const beforeHtml = execFileSync('git', ['show', base + ':core-v1/plant-identification/index.html'], {cwd: root, encoding: 'utf8'});
  for (const id of ['pi-result-style', 'pi-profile-style']) {
    const re = new RegExp('<style id="' + id + '">[\\s\\S]*?<\\/style>');
    assert.equal(html.match(re)[0], beforeHtml.match(re)[0]);
  }
  const runtime = read('modules/plant-identifier/real-pi-runtime-v1.js');
  const before = execFileSync('git', ['show', base + ':modules/plant-identifier/real-pi-runtime-v1.js'], {cwd: root, encoding: 'utf8'});
  assert.equal(withoutCatalogTransport(runtime.slice(runtime.indexOf('export const IDENTIFY_ENDPOINT'), runtime.indexOf('// Coordinates'))), withoutCatalogTransport(before.slice(before.indexOf('export const IDENTIFY_ENDPOINT'), before.indexOf('// Coordinates'))));
  assert.equal(runtime.slice(runtime.indexOf('// Bind native pickers once')), before.slice(before.indexOf('// Bind native pickers once')));
  assert.equal(Object.keys(PI_CARE_SLOTS).length, 28);
  assert.match(runtime, /CANONICAL CARE — FERTILIZING AUTHORITY GAP/);
});

// Controlled Slice 6 replacement: test-only handoff responses exercise the real
// view/navigation. The existing 6A suite separately exercises host/client authority;
// Chromium qualification runs the unchanged host evaluator and canonical witnesses.
const suitabilityElement = f => f.stage.children.find(e => e.className === 'pi-suitability');
const suitabilitySlot = (view, key) => view.children.find(e => e.attrs['data-pi-suitability-slot'] === key);
const suitabilityButton = f => f.stage.children.find(e => Object.hasOwn(e.attrs, 'data-pi-suitability-open'));
const settleSuitability = () => new Promise(resolve => setImmediate(resolve));
function suitabilityFixture(state = {...displayState(), catalogRow: careRow()}) {
  const context = {
    readiness: {status: 'READY', authenticated: true, gardenProfileId: 'garden-a'},
    trusted: true, location: {useForSuitability: true, gardenProfileId: 'garden-a', label: 'Confirmed garden A'},
    siteContext: {plantingMode: 'ground', frostProtection: 'unknown'},
    climateProfile: {structuralClimateStatus: 'unknown'}
  };
  const evaluation = {ok: true, engine: 'smartRecEvaluateSuitability', paidAiCalls: 0,
    gardenProfileId: 'garden-a', locationLabel: 'Confirmed garden A', recommendationLevel: 'borderline',
    suitabilityScore: null, outcomes: {survival: 'Unknown', growth: 'Unknown', flowering: 'Unknown', fruiting: 'Unknown'},
    warnings: ['Missing climate evidence'], primaryLimiter: 'Climate evidence unavailable'};
  const calls = {context: 0, evaluate: []};
  const result = {ok: true, context, evaluation,
    identity: {canonicalSlug: state.identity.canonicalSlug, scientific: state.catalogRow.scientific_name, actionId: state.actionId}};
  const client = {
    async readContext() { calls.context++; return {ok: true, context: structuredClone(context)}; },
    async evaluateCurrent() { calls.evaluate.push(state.identity.canonicalSlug); return structuredClone(result); }
  };
  return {state, context, evaluation, calls, result, client,
    read: (isCurrent = () => true) => readPiSuitability({state, client, isCurrent})};
}
async function readyCareFixture(slug = 'lemon') {
  const f = await openCareFixture(slug);
  profilePhoto(f).onload(); await trustedClick(careButton(f));
  return f;
}

for (const [slug, name] of witnessFixtures) test('Slice 6: ' + slug + ' enters PI-07 once with the same PI-04/05/06 canonical row', async () => {
  const f = await readyCareFixture(slug), state = f.controller.getState(), visits = observePiTransitions(f);
  const host = suitabilityFixture(state); f.window.cruvitCorePiSuitability = host.client;
  const button = suitabilityButton(f);
  await button.click(); assert.match(f.screen.alt, /Care$/); assert.equal(host.calls.context, 0);
  await trustedClick(button); await settleSuitability();
  const view = suitabilityElement(f), model = canonicalPiCare(state);
  assert.equal(view.attrs['data-pi-suitability'], 'SUITABILITY_READY');
  assert.equal(view.attrs['data-canonical-slug'], slug); assert.equal(view.attrs['data-identify-action'], state.actionId);
  assert.equal(suitabilitySlot(view, 'name').textContent, name);
  assert.equal(suitabilitySlot(view, 'scientific').textContent, entry(slug).acceptedScientificName);
  assert.equal(model.canonicalSlug, canonicalPiProfile(state).canonicalSlug);
  assert.equal(model.canonicalSlug, canonicalPiResult(state).canonicalSlug);
  assert.equal(f.controller.getState(), state); assert.deepEqual(state.catalogRow, careRow(slug));
  assert.equal(suitabilitySlot(view, 'photo').children.find(e => e.tag === 'img').src, model.media.url);
  for (const [key, card] of Object.entries(model.cards)) {
    assert.equal(suitabilitySlot(view, key + 'Value').textContent, card.value);
    assert.equal(suitabilitySlot(view, key + 'Note').textContent, card.note);
  }
  assert.equal(suitabilitySlot(view, 'verdict').textContent, 'Borderline');
  assert.equal(suitabilitySlot(view, 'location').textContent, host.evaluation.locationLabel);
  assert.match(suitabilitySlot(view, 'evidence').textContent, /Survival: Unknown.*Growth: Unknown/);
  assert.match(suitabilitySlot(view, 'evidence').textContent, /Climate evidence unavailable/);
  assert.equal(suitabilitySlot(view, 'score').textContent, 'Suitability score unavailable');
  assert.deepEqual(host.calls.evaluate, [slug]); assert.equal(host.calls.context, 2);
  assert.deepEqual(visits, [7]); assert.equal(f.screen.src, approvedContext.window.__PI[6].join(''));
  await trustedClick(button); await forbiddenForward(f);
  vm.runInContext('render(); render(); go(7); go(99);', f.context);
  assert.equal(suitabilityElement(f), view); assert.deepEqual(host.calls.evaluate, [slug]);
  assert.deepEqual(visits, [7]);
  assert.deepEqual(f.stage.querySelectorAll('.hot').map(b => b.attrs['aria-label']), ['Back to care']);
  // A later explicit entry must obtain the changed garden, never reuse a result.
  await trustedClick(f.stage.querySelectorAll('.hot')[0]); assert.equal(suitabilityElement(f), undefined);
  host.context.readiness.gardenProfileId = host.context.location.gardenProfileId = 'garden-b';
  host.context.location.label = host.evaluation.locationLabel = 'Confirmed garden B';
  host.evaluation.gardenProfileId = 'garden-b';
  await trustedClick(suitabilityButton(f)); await settleSuitability();
  assert.equal(suitabilityElement(f).attrs['data-garden-id'], 'garden-b');
  assert.equal(suitabilitySlot(suitabilityElement(f), 'location').textContent, 'Confirmed garden B');
  assert.deepEqual(host.calls.evaluate, [slug, slug]); assert.equal(host.calls.context, 4);
  assert.deepEqual(visits, [7, 6, 7]); assert.equal(visits.includes(8), false);
  assert.equal(f.calls.http.length, 1); assert.equal(f.calls.catalog.length, 1);
});

for (const [name, mutate] of [
  ['untrusted', c => {c.trusted = false;}],
  ['missing location', c => {c.location = null;}],
  ['signed out', c => {c.readiness.authenticated = false; c.readiness.status = 'SIGNED_OUT';}],
  ['restoring', c => {c.readiness.status = 'RESTORING';}],
  ['no garden', c => {c.readiness.gardenProfileId = null;}],
  ['different location garden', c => {c.location.gardenProfileId = 'other-garden';}]
]) test('Slice 6: ' + name + ' blocks before evaluation', async () => {
  const f = suitabilityFixture(); mutate(f.context);
  const result = await f.read(); assert.equal(result.ok, false); assert.equal(result.reason, 'HOST_CONTEXT_NOT_READY');
  assert.equal(result.evaluation, null); assert.deepEqual(result.context, f.context);
  assert.equal(f.calls.context, 1); assert.deepEqual(f.calls.evaluate, []);
});

test('Slice 6: standalone remains unavailable, with no evaluator and no retry', async () => {
  const f = await readyCareFixture(), visits = observePiTransitions(f);
  await trustedClick(suitabilityButton(f)); await settleSuitability();
  const view = suitabilityElement(f);
  assert.equal(view.attrs['data-pi-suitability'], 'SUITABILITY_UNAVAILABLE');
  assert.equal(view.attrs['data-reason'], 'HOST_UNAVAILABLE');
  assert.equal(suitabilitySlot(view, 'verdict').textContent, 'Not assessed');
  assert.match(suitabilitySlot(view, 'location').textContent, /active garden/);
  assert.match(suitabilitySlot(view, 'score').textContent, /No garden suitability score/);
  vm.runInContext('render(); render(); go(7);', f.context); await forbiddenForward(f);
  assert.equal(suitabilityElement(f), view); assert.deepEqual(visits, [7]);
  assert.equal(f.calls.http.length, 1); assert.equal(f.calls.catalog.length, 1);
});

test('Slice 6: stale read, plant switch and lost context never publish suitability', async () => {
  for (const phase of ['before', 'evaluation', 'after']) {
    const f = suitabilityFixture(); let current = true;
    const readContext = f.client.readContext, evaluate = f.client.evaluateCurrent;
    f.client.readContext = async () => {
      const result = await readContext();
      if (phase === 'before' || phase === 'after' && f.calls.context === 2) current = false;
      return result;
    };
    f.client.evaluateCurrent = async () => { const result = await evaluate(); if (phase === 'evaluation') current = false; return result; };
    const result = await f.read(() => current);
    assert.equal(result.reason, 'PI_RESULT_CHANGED'); assert.equal(result.evaluation, null);
    assert.equal(f.calls.evaluate.length, phase === 'before' ? 0 : 1);
  }
  for (const phase of ['evaluation', 'after']) {
    const f = suitabilityFixture(), readContext = f.client.readContext;
    f.client.readContext = async () => {
      if (phase === 'after' && f.calls.context === 1) f.context.siteContext.plantingMode = 'container';
      return readContext();
    };
    if (phase === 'evaluation') f.client.evaluateCurrent = async () => {
      f.calls.evaluate.push('lemon'); const result = structuredClone(f.result); result.context.trusted = false; return result;
    };
    assert.equal((await f.read()).reason, 'HOST_CONTEXT_CHANGED'); assert.equal(f.calls.evaluate.length, 1);
  }
  const f = suitabilityFixture(); f.client.readContext = async () => {throw Error('offline');};
  assert.equal((await f.read()).reason, 'HOST_AUTHORITY_UNAVAILABLE'); assert.equal(f.calls.evaluate.length, 0);
});

for (const [name, mutate, reason] of [
  ['slug', r => {r.identity.canonicalSlug = 'raspberry';}, 'HOST_CANONICAL_IDENTITY_UNAVAILABLE'],
  ['scientific', r => {r.identity.scientific = 'Rubus idaeus';}, 'HOST_CANONICAL_IDENTITY_UNAVAILABLE'],
  ['action', r => {r.identity.actionId = 'other-action';}, 'HOST_CANONICAL_IDENTITY_UNAVAILABLE'],
  ['garden', r => {r.evaluation.gardenProfileId = 'other-garden';}, 'HOST_EVALUATOR_UNAVAILABLE'],
  ['engine', r => {r.evaluation.engine = 'alternateEvaluator';}, 'HOST_EVALUATOR_UNAVAILABLE'],
  ['paid', r => {r.evaluation.paidAiCalls = 1;}, 'HOST_EVALUATOR_UNAVAILABLE'],
  ['invalid evaluator', r => {r.evaluation.ok = false;}, 'HOST_EVALUATOR_UNAVAILABLE'],
  ['unknown verdict', r => {r.evaluation.recommendationLevel = 'invented-positive';}, 'HOST_EVALUATOR_UNAVAILABLE']
]) test('Slice 6: mismatched ' + name + ' fails closed without fallback', async () => {
  const f = suitabilityFixture(); mutate(f.result);
  const result = await f.read(); assert.equal(result.ok, false); assert.equal(result.reason, reason);
  assert.equal(result.evaluation, null); assert.deepEqual(f.calls.evaluate, ['lemon']); assert.equal(f.calls.context, 1);
});

test('Slice 6: canonical Care context alone and direct helper/index manipulation cannot create a PI-07 permit', async () => {
  const f = await readyCareFixture(), host = suitabilityFixture(f.controller.getState());
  f.window.cruvitCorePiSuitability = host.client; const oldButton = suitabilityButton(f);
  await oldButton.click(); await forbiddenForward(f);
  vm.runInContext('go(6); go(7); render();', f.context);
  assert.match(f.screen.alt, /Care$/); assert.equal(suitabilityElement(f), undefined);
  for (const target of ['6', '7', '99', 'NaN', 'Infinity']) {
    vm.runInContext('index=' + target + '; render();', f.context);
    assert.equal(suitabilityElement(f), undefined); assert.match(f.screen.alt, /Camera$/);
    await trustedClick(oldButton); assert.equal(suitabilityElement(f), undefined);
  }
  assert.equal(host.calls.context, 0); assert.deepEqual(host.calls.evaluate, []);
  for (const state of [{...displayState(), status: 'IDENTIFY_FAILED'}, {...displayState(), readyForResult: false},
    {...displayState(), catalogRow: {...careRow(), slug: 'raspberry'}}]) {
    const result = await readPiSuitability({state, client: host.client, isCurrent: () => true});
    assert.equal(result.reason, 'PI_RESULT_NOT_READY');
  }
  assert.equal(host.calls.context, 0);
});

test('Slice 6: same-session acquisition reset clears PI-07 and ignores late evaluation completion', async () => {
  const f = await readyCareFixture(), state = f.controller.getState(), host = suitabilityFixture(state), pending = deferred();
  host.client.evaluateCurrent = () => {host.calls.evaluate.push(state.identity.canonicalSlug); return pending.promise;};
  f.window.cruvitCorePiSuitability = host.client;
  await trustedClick(suitabilityButton(f)); await settleSuitability();
  const oldView = suitabilityElement(f), oldBack = f.stage.querySelectorAll('.hot')[0];
  assert.equal(oldView.attrs['data-pi-suitability'], 'CHECKING');
  await f.controller.selectImage(new File(['invalid'], 'bad.txt', {type: 'text/plain'}));
  assert.equal(suitabilityElement(f), undefined); assert.equal(f.controller.getState().catalogRow, null);
  pending.resolve(host.result); await settleSuitability(); await trustedClick(oldBack);
  assert.equal(suitabilityElement(f), undefined); assert.match(f.screen.alt, /Camera$/);
  assert.equal(oldView.attrs['data-pi-suitability'], 'CHECKING');
  assert.deepEqual(host.calls.evaluate, ['lemon']); assert.equal(host.calls.context, 1);
  assert.equal(f.calls.http.length, 1);
});

test('Slice 6: view has no evaluator, location record, network, persistence or per-plant lookup', () => {
  const view = read('modules/plant-identifier/pi-suitability-view-v1.js');
  assert.doesNotMatch(view, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|navigator\.geolocation|\.rpc\(|\.insert\(|\.upsert\(|\.upload\(/);
  assert.doesNotMatch(view, /lemon|pomegranate|raspberry|Monstera|plants\.seed|catalog-media\/cache|evaluateSpecificPlantSuitability\s*\(/);
  assert.doesNotMatch(view, /function\s+smartRecEvaluateSuitability|function\s+evaluateIdentifierGardenSuitability/);
  assert.match(view, /client\.readContext\(\)/); assert.match(view, /client\.evaluateCurrent\(\)/);
  assert.equal(Object.keys(PI_SUITABILITY_SLOTS).length, 30);
  const parent = '48aafecdb17f8581611f10d9f5e86754250f03ce';
  for (const path of ['app.html', 'modules/plant-identifier/suitability-context-handoff-v1.js',
    'modules/plant-identifier/real-pi-runtime-v1.js', 'modules/personal-domain/specific-plant-suitability-contract.js']) {
    const current = path === 'app.html'
      ? withoutCatalogHost(read(path)).replace(/<script type="module" id="core-pi-atomic-save-host">[\s\S]*?<\/script>\n/, '')
      : path.endsWith('real-pi-runtime-v1.js') ? withoutCatalogTransport(read(path)) : read(path);
    assert.equal(current, path.endsWith('real-pi-runtime-v1.js') ? withoutCatalogTransport(execFileSync('git', ['show', parent + ':' + path], {cwd: root, encoding: 'utf8', maxBuffer: 10_000_000})) : execFileSync('git', ['show', parent + ':' + path], {cwd: root, encoding: 'utf8', maxBuffer: 10_000_000}));
  }
});
