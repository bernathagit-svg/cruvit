import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {createPiSuitabilityHost, createPiSuitabilityClient, CORE_PI_ROUTE} from '../modules/plant-identifier/suitability-context-handoff-v1.js';
import {classifyIdentifierGardenLocationContext} from '../modules/plant-identifier/plant-identifier-location-context-v1.js';
import {classifyPersonalDomainGardenReadiness} from '../modules/personal-domain/garden-context-ready-v1.js';
import {resolveCanonicalReadSlug} from '../modules/identity/canonical-alias-authority-v1.js';

const root = new URL('../', import.meta.url), read = p => fs.readFileSync(new URL(p, root), 'utf8');
const base = 'e2f3082bd10ae67d44e7a870b3a6461548422919';
const originalFetch = globalThis.fetch;
let network = 0;
globalThis.fetch = () => { network++; throw Error('Network forbidden'); };
after(() => { globalThis.fetch = originalFetch; assert.equal(network, 0); });
const sci = {lemon: 'Citrus × limon', pomegranate: 'Punica granatum', raspberry: 'Rubus idaeus'};
function surface(href) {
  const listeners = new Map();
  return {location: new URL(href), crypto: {randomUUID},
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    fire(type, event) { for (const fn of listeners.get(type) || []) fn(event); }};
}
function fixture({standalone = false, timeoutMs = 100} = {}) {
  const origin = 'https://cruvit-core-v1-e2e-preview.netlify.app';
  const hostWindow = surface(origin + '/app.html'), childWindow = surface(origin + CORE_PI_ROUTE);
  childWindow.parent = standalone ? childWindow : hostWindow;
  const traffic = [], queue = [], calls = [];
  for (const [target, source] of [[hostWindow, childWindow], [childWindow, hostWindow]]) {
    target.postMessage = (data, targetOrigin) => {
      traffic.push({data: structuredClone(data), targetOrigin});
      queue.push(() => target.fire('message', {data: structuredClone(data), origin, source}));
    };
  }
  const frame = {isConnected: true, src: origin + CORE_PI_ROUTE, contentWindow: childWindow};
  const state = {
    readiness: classifyPersonalDomainGardenReadiness({profilesHydrated: true, authenticated: true, gardenProfileId: 'garden-a', gardenCount: 1}),
    input: {trusted: true, label: 'Confirmed garden', lat: 46.5, lon: 13.8, source: 'manual', confirmationStatus: 'confirmed',
      gardenProfileId: 'garden-a', climateAuthority: 'coordinate-climate-v2', locationConfidence: 'high'},
    climate: {structuralClimateStatus: 'known', structuralClimate: {status: 'known', authority: 'coordinate-climate-v2'}},
    site: {plantingMode: 'ground', frostProtection: 'unknown', irrigationReliability: 'unknown'},
    current: {state: {}, canonicalSlug: 'lemon', scientific: sci.lemon, actionId: 'identify-a'},
    evaluation: {ok: true, engine: 'smartRecEvaluateSuitability', paidAiCalls: 0,
      outcomes: {survival: 'Unknown', growth: 'Unknown', flowering: 'Unknown', fruiting: 'Unknown'}, recommendationLevel: 'borderline'},
    resolve(input) { const slug = resolveCanonicalReadSlug(input); return slug && sci[slug] ? {slug, scientific: sci[slug]} : null; }
  };
  const host = createPiSuitabilityHost({window: hostWindow,
    getReadiness: () => state.readiness,
    getLocationContext: () => classifyIdentifierGardenLocationContext(state.input),
    hasTrustedLocation: () => state.input.trusted,
    getClimateProfile: () => state.climate,
    getSiteContext: () => state.site,
    resolveCanonicalPlant: input => state.resolve(input),
    evaluateSuitability: slug => { calls.push(slug); state.duringEvaluation?.(); return state.evaluation; }
  });
  assert.equal(host.bind(frame), true);
  const client = createPiSuitabilityClient({window: childWindow, readCanonicalResult: () => state.current, timeoutMs});
  const flush = () => { while (queue.length) queue.shift()(); };
  const run = async promise => { flush(); return await promise; };
  return {hostWindow, childWindow, host, client, frame, state, calls, traffic, queue, flush, run,
    close() { client.dispose(); host.dispose(); }};
}

test('6A: read fresh host readiness, exact classified location, climate and site; no automatic evaluation', async () => {
  const f = fixture(); assert.equal(f.traffic.length, 0);
  const r = await f.run(f.client.readContext());
  assert.equal(r.ok, true); assert.equal(r.context.trusted, f.state.input.trusted);
  assert.deepEqual(r.context.location, classifyIdentifierGardenLocationContext(f.state.input));
  assert.deepEqual(r.context.readiness, f.state.readiness);
  assert.deepEqual(r.context.climateProfile, f.state.climate); assert.deepEqual(r.context.siteContext, f.state.site);
  assert.deepEqual(f.calls, []); assert.equal(r.evaluation, null);
  r.context.location.label = 'Consumer mutation'; r.context.siteContext.plantingMode = 'indoor';
  assert.equal(f.state.site.plantingMode, 'ground');
  f.state.input.label = 'Changed host garden';
  assert.equal((await f.run(f.client.readContext())).context.location.label, 'Changed host garden'); f.close();
});
for (const slug of Object.keys(sci)) test('6A: ' + slug + ' delegates only exact canonical identity and retains engine evidence unchanged', async () => {
  const f = fixture(); f.state.current = {state: {}, canonicalSlug: slug, scientific: sci[slug], actionId: 'identify-' + slug};
  const r = await f.run(f.client.evaluateCurrent());
  assert.equal(r.ok, true); assert.deepEqual(f.calls, [slug]); assert.deepEqual(r.evaluation, f.state.evaluation);
  assert.deepEqual(r.identity, {canonicalSlug: slug, scientific: sci[slug], actionId: 'identify-' + slug});
  assert.deepEqual(r.context.location, classifyIdentifierGardenLocationContext(f.state.input)); f.close();
});
for (const [name, change, status] of [
  ['pending', s => { s.input.trusted = false; s.input.confirmationStatus = 'pending'; }, 'UNTRUSTED_NEEDS_CONFIRMATION'],
  ['default', s => { s.input.trusted = false; s.input.source = 'default'; }, 'UNTRUSTED_NEEDS_CONFIRMATION'],
  ['missing', s => { s.input = {}; }, 'LOCATION_MISSING'],
  ['confirmed without coordinates', s => { delete s.input.lat; delete s.input.lon; }, 'LOCATION_MISSING']
]) test('6A: ' + name + ' stays exactly host-classified; no evaluator call', async () => {
  const f = fixture(); change(f.state);
  const expected = classifyIdentifierGardenLocationContext(f.state.input);
  const r = await f.run(f.client.readContext()); assert.deepEqual(r.context.location, expected);
  assert.equal(r.context.location.status, status); assert.equal(r.context.trusted, f.state.input.trusted === true);
  const e = await f.run(f.client.evaluateCurrent()); assert.equal(e.ok, false); assert.equal(e.evaluation, null);
  assert.deepEqual(e.context.location, expected); assert.equal(f.calls.length, 0); f.close();
});
for (const status of ['RESTORING', 'SIGNED_OUT', 'NO_ACTIVE_GARDEN']) test('6A: ' + status + ' cannot authorize evaluation', async () => {
  const f = fixture(); f.state.readiness = {...f.state.readiness, status};
  const r = await f.run(f.client.evaluateCurrent()); assert.equal(r.reason, 'HOST_CONTEXT_NOT_READY');
  assert.equal(r.context.readiness.status, status); assert.equal(f.calls.length, 0); f.close();
});
test('6A: different readiness/location gardens fail closed; switch and sign-out never reuse previous context', async () => {
  const f = fixture(); await f.run(f.client.evaluateCurrent());
  f.state.readiness.gardenProfileId = 'garden-b';
  assert.equal((await f.run(f.client.evaluateCurrent())).ok, false); assert.equal(f.calls.length, 1);
  f.state.input.gardenProfileId = 'garden-b'; f.state.input.label = 'Garden B';
  const switched = await f.run(f.client.evaluateCurrent()); assert.equal(switched.context.location.label, 'Garden B');
  assert.equal(switched.context.readiness.gardenProfileId, 'garden-b');
  f.state.readiness = classifyPersonalDomainGardenReadiness({profilesHydrated: true, authenticated: false});
  assert.equal((await f.run(f.client.evaluateCurrent())).ok, false); assert.equal(f.calls.length, 2); f.close();
});
test('6A: missing climate and negative/unknown evidence are carried verbatim, without positive promotion', async () => {
  const f = fixture(); f.state.climate = {structuralClimateStatus: 'unknown', structuralClimate: null};
  f.state.evaluation = {...f.state.evaluation, ok: false, reason: 'authority-unavailable', recommendationLevel: 'borderline'};
  const r = await f.run(f.client.evaluateCurrent()); assert.deepEqual(r.evaluation, f.state.evaluation);
  assert.deepEqual(r.context.climateProfile, f.state.climate); f.close();
});
for (const [name, change] of [
  ['missing catalog', s => { s.resolve = () => null; }],
  ['scientific mismatch', s => { s.current.scientific = sci.raspberry; }],
  ['different canonical row', s => { s.resolve = () => ({slug: 'raspberry', scientific: sci.raspberry}); }],
  ['missing action', s => { s.current.actionId = ''; }]
]) test('6A: ' + name + ' cannot reach the evaluator', async () => {
  const f = fixture(); change(f.state); const r = await f.run(f.client.evaluateCurrent());
  assert.equal(r.reason, 'HOST_CANONICAL_IDENTITY_UNAVAILABLE'); assert.equal(f.calls.length, 0); f.close();
});
test('6A: absent/changed PI result cannot yield a stale suitability result', async () => {
  const f = fixture(); f.state.current = null;
  assert.equal((await f.client.evaluateCurrent()).reason, 'PI_RESULT_NOT_READY'); assert.equal(f.traffic.length, 0);
  f.state.current = {state: {}, canonicalSlug: 'lemon', scientific: sci.lemon, actionId: 'a'};
  const p = f.client.evaluateCurrent(); f.queue.shift()(); // Host evaluates; reply is still queued.
  f.state.current = {state: {}, canonicalSlug: 'raspberry', scientific: sci.raspberry, actionId: 'b'};
  assert.equal((await f.run(p)).reason, 'PI_RESULT_CHANGED'); f.close();
});
test('6A: host change during evaluation fails closed', async () => {
  const f = fixture(); f.state.duringEvaluation = () => { f.state.input.label = 'New garden'; };
  const r = await f.run(f.client.evaluateCurrent()); assert.equal(r.reason, 'HOST_CONTEXT_CHANGED'); assert.equal(r.evaluation, null); f.close();
});
test('6A: elapsed weather age is not a garden/location change', async () => {
  const f = fixture(); f.state.climate.weatherAgeMs = 10;
  f.state.duringEvaluation = () => { f.state.climate.weatherAgeMs = 11; };
  const r = await f.run(f.client.evaluateCurrent());
  assert.equal(r.ok, true); assert.equal(r.context.climateProfile.weatherAgeMs, 10);
  assert.equal(f.calls.length, 1); f.close();
});
test('6A: no standalone host, detached frame, wrong route or destroyed host cannot produce authority', async () => {
  const standalone = fixture({standalone: true});
  assert.equal((await standalone.client.readContext()).reason, 'HOST_UNAVAILABLE'); assert.equal(standalone.traffic.length, 0); standalone.close();
  for (const change of [f => {f.frame.isConnected = false;}, f => {f.childWindow.location = new URL('https://evil.invalid/');},
    f => {f.childWindow.location = new URL(f.frame.src + '?trusted=true');}, f => {f.host.dispose();}]) {
    const f = fixture({timeoutMs: 5}); change(f);
    assert.equal((await f.run(f.client.readContext())).ok, false); assert.equal(f.calls.length, 0); f.close();
  }
});
test('6A: only exact bound frame/origin and two read operations are accepted', async () => {
  const f = fixture({timeoutMs: 5});
  const p = f.client.readContext(), message = f.traffic[0].data;
  for (const event of [
    {origin: 'https://evil.invalid', source: f.childWindow, data: message},
    {origin: f.hostWindow.location.origin, source: {}, data: message},
    {origin: 'null', source: f.childWindow, data: message},
    {origin: f.hostWindow.location.origin, source: f.childWindow, data: {...message, operation: 'save'}},
    {origin: f.hostWindow.location.origin, source: f.childWindow, data: {...message, operation: 'setLocation'}}
  ]) f.hostWindow.fire('message', event);
  assert.equal(f.traffic.length, 1); await f.run(p); assert.equal(f.calls.length, 0);
  assert.equal(f.host.bind({...f.frame, src: 'https://evil.invalid' + CORE_PI_ROUTE}), false); f.close();
});
test('6A: fabricated response source/origin/id is rejected; duplicate response cannot resolve a later request', async () => {
  const f = fixture(); const p = f.client.readContext(); const request = f.traffic[0].data;
  const data = {type: 'cruvit:core-pi-suitability-response', operation: 'context', requestId: request.requestId, result: {ok: true, forged: true}};
  f.childWindow.fire('message', {origin: 'https://evil.invalid', source: f.hostWindow, data});
  f.childWindow.fire('message', {origin: f.hostWindow.location.origin, source: {}, data});
  f.childWindow.fire('message', {origin: f.hostWindow.location.origin, source: f.hostWindow, data: {...data, requestId: 'other'}});
  assert.equal((await f.run(p)).forged, undefined);
  f.childWindow.fire('message', {origin: f.hostWindow.location.origin, source: f.hostWindow, data});
  assert.equal((await f.run(f.client.readContext())).forged, undefined); f.close();
});
test('6A: repeated in-flight reads share one request; timeout does not retry', async () => {
  const f = fixture({timeoutMs: 5}); const a = f.client.readContext(), b = f.client.readContext();
  assert.equal(a, b); assert.equal(f.traffic.length, 1); assert.equal((await a).ok, false);
  assert.equal(f.traffic.length, 1); f.flush(); const c = await f.run(f.client.readContext()); assert.equal(c.ok, true); f.close();
});
test('6A: host unbind and client pagehide release requests/listeners without persistence', async () => {
  const f = fixture(); const p = f.client.readContext(); f.host.unbind();
  assert.equal((await f.run(p)).ok, false); assert.equal((await f.client.readContext()).ok, false); f.close();
  const next = fixture(); const q = next.client.readContext(); next.childWindow.fire('pagehide');
  assert.equal((await q).ok, false); next.close();
});
test('6A: no session, credentials, observation photo or client profile is included in messages', async () => {
  const f = fixture(); f.state.current.scanPhoto = 'data:image/jpeg;base64,PRIVATE_SCAN';
  f.state.current.providerCare = 'PROVIDER_CARE';
  f.state.input.access_token = 'PRIVATE_TOKEN'; f.state.readiness.session = {refresh_token: 'PRIVATE_REFRESH'};
  await f.run(f.client.evaluateCurrent());
  assert.doesNotMatch(JSON.stringify(f.traffic), /PRIVATE_|PROVIDER_|access_token|refresh_token|scanPhoto|providerCare/);
  assert.ok(f.traffic.every(t => t.targetOrigin === f.hostWindow.location.origin)); f.close();
});
test('6A: accepted client wiring, prior PI styles and all eight approved rasters remain byte-identical', () => {
  const html = read('core-v1/plant-identification/index.html');
  const prior = execFileSync('git', ['show', base + ':core-v1/plant-identification/index.html'], {cwd: root, encoding: 'utf8', maxBuffer: 10_000_000});
  const acceptedBase = '48aafecdb17f8581611f10d9f5e86754250f03ce';
  const accepted = execFileSync('git', ['show', acceptedBase + ':core-v1/plant-identification/index.html'], {cwd: root, encoding: 'utf8'});
  const client = /<script type="module" id="core-pi-suitability-client">[\s\S]*?<\/script>/;
  assert.equal(html.match(client)[0], accepted.match(client)[0]);
  const pi07Style = /<style id="pi-suitability-style">[\s\S]*?<\/style>/;
  assert.equal((html.match(/<style id="pi-suitability-style">/g) || []).length, 1);
  assert.deepEqual(html.replace(pi07Style, '').match(/<style[\s\S]*?<\/style>/g), prior.match(/<style[\s\S]*?<\/style>/g));
  for (const path of ['app.html', 'modules/plant-identifier/suitability-context-handoff-v1.js',
    'modules/plant-identifier/real-pi-runtime-v1.js']) {
    assert.equal(read(path), execFileSync('git', ['show', acceptedBase + ':' + path], {cwd: root, encoding: 'utf8', maxBuffer: 10_000_000}));
  }
  const ctx = vm.createContext({window: {}});
  for (const match of html.matchAll(/<script src="\.\/assets\/(s\d-\d+\.js)"><\/script>/g)) {
    const rel = 'core-v1/plant-identification/assets/' + match[1], current = read(rel);
    assert.equal(current, execFileSync('git', ['show', base + ':' + rel], {cwd: root, encoding: 'utf8', maxBuffer: 10_000_000}));
    vm.runInContext(current, ctx);
  }
  const hashes = Array.from({length: 8}, (_, i) => createHash('sha256').update(Buffer.from(ctx.window.__PI[i].join('').split(',')[1], 'base64')).digest('hex'));
  assert.equal(hashes[6], 'c6ad1fc59e28622b3aedbcfa2e2a4cfe6cf435aa0c81e9a74eedeead75ce7e59');
  assert.equal(hashes.length, 8);
});
test('6A: host/evaluator/registry/care/location remain unchanged; only the authorized Atomic controller/readback may differ', () => {
  const app = read('app.html'), old = execFileSync('git', ['show', base + ':app.html'], {cwd: root, encoding: 'utf8', maxBuffer: 10_000_000});
  const added = app.match(/<script type="module" id="core-pi-suitability-host">[\s\S]*?<\/script>\n/)[0];
  assert.equal(app.replace(added, ''), old);
  for (const name of ['getGardenContextReadiness', 'getIdentifierGardenLocationContext', 'hasTrustedAppLocation',
    'getAppClimateProfile', 'smartRecProtectionContext', 'canonicalRuntimeCatalogProfile', 'evaluateIdentifierGardenSuitability']) assert.ok(added.includes(name));
  const changed = execFileSync('git', ['diff', '--name-only', base], {cwd: root, encoding: 'utf8', maxBuffer: 10_000_000}).trim().split('\n');
  // PI-08 foundation authorizes these two existing authority implementations only.
  // All other Atomic files, including the command, intent contract and boot, stay locked.
  const controllerRefactor = new Set([
    'core-v1/plant-identification/atomic/save-controller.mjs',
    'core-v1/plant-identification/atomic/preview-domain.mjs'
  ]);
  assert.ok(!changed.some(p => /atomic\/|garden-profile|specific-plant-suitability|real-pi-runtime|netlify\/functions|identity\//.test(p)
    && !controllerRefactor.has(p)));
  const bridge = read('modules/plant-identifier/suitability-context-handoff-v1.js');
  assert.doesNotMatch(bridge, /localStorage|sessionStorage|indexedDB|\bfetch\s*\(|XMLHttpRequest|navigator\.geolocation|BroadcastChannel|\.rpc\(|\.upsert\(|\.insert\(/);
  assert.doesNotMatch(bridge, /survivalFit\s*[=:]|thriveFit\s*[=:]|frostSensitivity\s*[=:]|new Map\(.*garden/i);
});
