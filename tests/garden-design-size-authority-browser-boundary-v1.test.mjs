/**
 * Native ESM browser-boundary regression. Run on Node 22 with
 * node --experimental-vm-modules --test <this file>.
 * The VM flag is test-only. No browser page, network or persistence is used.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import cp from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceTextModule, createContext } from 'node:vm';
import {
  CALIBRATION_BOTANICAL_SIZE_EVIDENCE,
  mangoDimensionLeak
} from '../modules/garden-design/asset-factory-v1/physical-scale-evidence-v1.js';
import { mangoDimensionLeak as genericTreeGuard } from '../modules/garden-design/asset-factory-v1/generic-tree-physical-scale-v1.js';
import { sha256, fingerprint, verifyDelta } from '../tools/size-authority/canonical-delta-v1.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const pagePath = 'modules/garden-design/index.html';
const adapterPath = 'modules/garden-design/asset-factory-v1/garden-design-size-authority-adapter-v1.js';
const origin = 'https://garden-size.invalid';
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const canonicalPath='data/catalog/botanical-size-authority-v1.json';
const currentCanonicalBefore=fs.readFileSync(path.join(root,canonicalPath));
const registry=JSON.parse(currentCanonicalBefore);
// Test-host history access stays outside the browser module graph. No network,
// fetch, reconstruction or fallback is allowed when the local object is absent.
const genesisBytes=cp.execFileSync('git',['cat-file','blob','92cb4282970a6aac75e0ab88d13b2a110bbd393d:'+canonicalPath],{
  cwd:root,env:{...process.env,GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'}
});
assert.equal(sha256(genesisBytes),'86447803a6ad2245b8422448edc91e7197481370138a582453b631131e04c90b');
const qualification=verifyDelta({inputBytes:genesisBytes,
  manifestBytes:fs.readFileSync(path.join(root,'config/size-authority/canonical-deltas/000001-jaboticaba-context-state-v1.json')),
  expectedManifestSha256:'3e7e109af3758db5e0dcd14635a3141f557c63b97fa8f446496b767af0725810'});
assert.equal(sha256(qualification.receiptBytes),'10e969fbcc1cfde3b920b45bf3249f9d0104367247c74bf0a4e42e9e3ecb0d27');
assert.equal(sha256(qualification.outputBytes),'e59a63abad28a269e2ac9e1c12e72a0eb12b680cd89222c586bdf9f63c5864b6');
const historicalRegistry=JSON.parse(genesisBytes),qualifiedRegistry=JSON.parse(qualification.outputBytes);
const registryCases=[['current canonical',registry],['historical A',historicalRegistry],['qualified scratch B',qualifiedRegistry]];
function jaboticabaContract(inputRegistry) {
  const record=inputRegistry.records.find(r=>r.botanicalTaxonId==='taxon:plinia-cauliflora');
  assert.ok(record,'Jaboticaba record required');
  switch(fingerprint(record)) {
    case '6039ea35931fff9eaed33d0b05745b32af696d37d573bf97a3a26f949b85f407':
      return {runtimeAuthority:'RUNTIME_AUTHORITY_PARTIAL',invalidHeight:true,heightScaleReady:true,fallbackReason:'INVALID_AUTHORITATIVE_HEIGHT_RANGE',readinessState:'SIZE_AUTHORITY_PARTIAL'};
    case 'adea051a4c82c2adc59f62a00f65de516c3616f0f760caac91624307304f10af':
      return {runtimeAuthority:'RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED',invalidHeight:false,heightScaleReady:false,fallbackReason:'PERSONAL_CONTEXT_REQUIRED',readinessState:'SIZE_AUTHORITY_CONTEXT_REQUIRED'};
    default: assert.fail('UNEXPECTED_JABOTICABA_STATE');
  }
}
const preferences = JSON.parse(read('data/garden-design/garden-design-size-preference-registry-v1.json'));
const expectedWindowKeys = [
  'GARDEN_SIZE_AUTHORITY_ACTIVATION', 'getAuthorityRecordBySlug',
  'ownerPreferredRangePosition', 'mangoOwnerPreferredRangePosition',
  'productionGardenSizeAuthorityEnabled', 'resolveGardenSizeAuthority',
  'scaleFromGardenSizeAuthority', 'registry', 'preferenceRegistry'
].sort();

function browserLoader(inputRegistry=registry) {
  const modules = new Map();
  const edges = [];
  const fetches = [];
  const messages = [];
  const responses = new Map([
    [new URL('/data/catalog/botanical-size-authority-v1.json', origin).href, inputRegistry],
    [new URL('/data/garden-design/garden-design-size-preference-registry-v1.json', origin).href, preferences]
  ]);
  const sandbox = {
    location: { origin },
    parent: { postMessage: (message, target) => messages.push({ message, target }) },
    renderPlantLayers() {},
    async fetch(relative, options) {
      const url = new URL(relative, new URL(pagePath, origin + '/')).href;
      assert.equal(options?.method || 'GET', 'GET');
      assert.ok(responses.has(url), 'Unexpected fetch: ' + url);
      fetches.push(url);
      return { ok: true, json: async () => structuredClone(responses.get(url)) };
    }
  };
  sandbox.window = sandbox;
  const context = createContext(sandbox);
  function moduleAt(url, source) {
    if (modules.has(url)) return modules.get(url);
    const parsed = new URL(url);
    assert.equal(parsed.origin, origin);
    const module = new SourceTextModule(source ?? read(parsed.pathname.slice(1)), {
      identifier: url,
      context,
      importModuleDynamically() { throw new Error('Unexpected dynamic import'); }
    });
    modules.set(url, module);
    return module;
  }
  async function evaluate(relative, source) {
    const entry = moduleAt(new URL(relative, origin + '/').href, source);
    await entry.link((specifier, parent) => {
      edges.push({ from: parent.identifier, specifier });
      assert.match(specifier, /^(?:\.\.?\/|\/)/, 'Non-browser import: ' + specifier);
      const url = new URL(specifier, parent.identifier);
      assert.equal(url.protocol, 'https:');
      assert.equal(url.origin, origin);
      return moduleAt(url.href);
    });
    await entry.evaluate();
    return entry;
  }
  return { evaluate, modules, edges, fetches, messages, sandbox };
}

test('active adapter links and evaluates without Node builtins or Node globals', async () => {
  const loader = browserLoader();
  const entry = await loader.evaluate(adapterPath);
  assert.equal(entry.status, 'evaluated');
  for (const name of expectedWindowKeys.filter((name) => !['registry', 'preferenceRegistry'].includes(name))) {
    assert.ok(name in entry.namespace, name);
  }
  assert.ok(loader.edges.length > 0);
  assert.equal(loader.edges.some(({ specifier }) => specifier.startsWith('node:')), false);
  assert.equal([...loader.modules.keys()].some((url) => url.includes('generic-tree-physical-scale-v1.js')), false);
  assert.equal('process' in loader.sandbox, false);
  assert.equal('require' in loader.sandbox, false);
  assert.equal(loader.fetches.length, 0);
  assert.equal(loader.messages.length, 0);
});

for(const [label,inputRegistry] of registryCases) {
test(label+': unchanged index bootstrap installs the complete Size Authority global with local JSON only', async () => {
  const expected=jaboticabaContract(inputRegistry);
  const scripts = [...read(pagePath).matchAll(/<script\s+type="module">([\s\S]*?)<\/script>/g)];
  const bootstrap = scripts.filter((match) => match[1].includes('window.CruvitGardenSizeAuthority ='));
  assert.equal(bootstrap.length, 1);
  const loader = browserLoader(inputRegistry);
  await loader.evaluate(pagePath, bootstrap[0][1]);
  // Flush the two local async JSON bootstrap chains without timers or network.
  for (let i = 0; i < 8; i++) await Promise.resolve();
  const api = loader.sandbox.CruvitGardenSizeAuthority;
  assert.deepEqual(Object.keys(api).sort(), expectedWindowKeys);
  assert.equal(api.registry.records.length, inputRegistry.records.length);
  assert.equal(api.preferenceRegistry.records.length, preferences.records.length);
  assert.equal(api.ownerPreferredRangePosition('mango', api.preferenceRegistry), 'LOW');
  assert.equal(api.ownerPreferredRangePosition('olive', api.preferenceRegistry), null);
  const before = JSON.stringify(api.registry);
  const authority = api.resolveGardenSizeAuthority(api.registry, { canonicalSlug: 'mango', growthStage: 'mature' });
  assert.equal(authority.runtimeAuthorityState, 'RUNTIME_AUTHORITY_READY');
  const jaboticaba = api.resolveGardenSizeAuthority(api.registry, { canonicalSlug: 'jaboticaba', growthStage: 'mature' });
  assert.equal(jaboticaba.usedAuthoritativeMeters, false);
  assert.equal(jaboticaba.heightRangeM, null);
  assert.equal(jaboticaba.runtimeAuthorityState,expected.runtimeAuthority);
  assert.equal(jaboticaba.fallbackReason,expected.fallbackReason);
  assert.equal(jaboticaba.spreadRangeM,null);
  assert.equal(jaboticaba.previewScenario,null);
  const estimated = api.scaleFromGardenSizeAuthority(jaboticaba, { visualForm: 'tree' });
  assert.equal(estimated.scale.botanicalEvidenceClass, 'UNKNOWN');
  assert.equal(estimated.scale.heightRangeM, null);
  assert.equal(estimated.scale.botanicalHeightM,null);
  assert.ok(estimated.scale.imgHeightPct > 0);
  assert.equal(JSON.stringify(api.registry), before);
  assert.equal(JSON.stringify(api.registry).includes('ownerPreferredRangePosition'), false);
  assert.equal(loader.fetches.length, 2);
  assert.equal(loader.messages.length, 1);
  assert.equal(loader.messages[0].message.type, 'cruvit:garden-design-ready');
  assert.equal(loader.edges.some(({ specifier }) => specifier.startsWith('node:')), false);
});

test(label+': readiness uses the strict validator without adding reachable Node builtins', async () => {
  const expected=jaboticabaContract(inputRegistry);
  const loader = browserLoader(inputRegistry);
  const entry = await loader.evaluate('modules/garden-design/asset-factory-v1/plant-size-authority-readiness-v1.js');
  const readiness = entry.namespace.resolvePlantSizeAuthorityReadiness(inputRegistry, { canonicalSlug: 'jaboticaba' });
  assert.equal(readiness.state,expected.readinessState);
  assert.equal(readiness.runtimeAuthority,expected.runtimeAuthority);
  assert.equal(readiness.heightScaleReady,expected.heightScaleReady);
  assert.equal(readiness.authoritativeMetersAvailable, false);
  assert.equal(readiness.reasonCodes.includes('INVALID_AUTHORITATIVE_HEIGHT_RANGE'),expected.invalidHeight);
  assert.equal(loader.edges.filter(({ specifier }) => specifier.startsWith('node:')).length, 0);
  assert.equal(loader.fetches.length, 0);
});
}

test('browser semantic contract rejects unexpected Jaboticaba states and universal meters',()=>{
  for(const edit of [r=>r.runtimeAuthority='RUNTIME_AUTHORITY_EVIDENCE_GAP',r=>r.HEIGHT_SCALE_READY=true,
    r=>r.selectedHeightEvidenceRef='unreviewed',...[6.096,9.144,(6.096+9.144)/2].map(value=>r=>{r.normalizedRange={heightM:{min:value,max:value},spreadM:null};})]) {
    const inputRegistry=structuredClone(qualifiedRegistry);edit(inputRegistry.records.find(r=>r.botanicalTaxonId==='taxon:plinia-cauliflora'));
    assert.throws(()=>jaboticabaContract(inputRegistry),/UNEXPECTED_JABOTICABA_STATE/);
  }
});

test('browser fixtures never substitute or mutate the current tracked canonical',()=>{
  assert.ok(fs.readFileSync(path.join(root,canonicalPath)).equals(currentCanonicalBefore));
});

test('generic tree callers reuse the single guard and retain its exact-match rule', () => {
  assert.equal(genericTreeGuard, mangoDimensionLeak);
  const mango = CALIBRATION_BOTANICAL_SIZE_EVIDENCE.mango;
  for (const slug of ['mango', ' MANGO ']) {
    assert.equal(mangoDimensionLeak(slug, { heightM: mango.heightM, spreadM: mango.spreadM }), false);
  }
  assert.equal(mangoDimensionLeak('olive', { heightM: mango.heightM }), true);
  assert.equal(mangoDimensionLeak('olive', { spreadM: mango.spreadM }), true);
  assert.equal(mangoDimensionLeak('olive', { heightM: { min: String(mango.heightM.min), max: String(mango.heightM.max) } }), true);
  assert.equal(mangoDimensionLeak('olive', { heightM: { min: 3, max: 8 } }), false);
  assert.equal(mangoDimensionLeak('olive', { heightM: { min: mango.heightM.min + 0.000001, max: mango.heightM.max } }), false);
  assert.equal(mangoDimensionLeak('Mangifera indica', { heightM: mango.heightM }), true);
  assert.equal(mangoDimensionLeak('olive'), false);
});
