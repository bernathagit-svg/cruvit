/**
 * Native ESM browser-boundary regression. Run on Node 22 with
 * node --experimental-vm-modules --test <this file>.
 * The VM flag is test-only. No browser page, network or persistence is used.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceTextModule, createContext } from 'node:vm';
import {
  CALIBRATION_BOTANICAL_SIZE_EVIDENCE,
  mangoDimensionLeak
} from '../modules/garden-design/asset-factory-v1/physical-scale-evidence-v1.js';
import { mangoDimensionLeak as genericTreeGuard } from '../modules/garden-design/asset-factory-v1/generic-tree-physical-scale-v1.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const pagePath = 'modules/garden-design/index.html';
const adapterPath = 'modules/garden-design/asset-factory-v1/garden-design-size-authority-adapter-v1.js';
const origin = 'https://garden-size.invalid';
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const registry = JSON.parse(read('data/catalog/botanical-size-authority-v1.json'));
const preferences = JSON.parse(read('data/garden-design/garden-design-size-preference-registry-v1.json'));
const expectedWindowKeys = [
  'GARDEN_SIZE_AUTHORITY_ACTIVATION', 'getAuthorityRecordBySlug',
  'ownerPreferredRangePosition', 'mangoOwnerPreferredRangePosition',
  'productionGardenSizeAuthorityEnabled', 'resolveGardenSizeAuthority',
  'scaleFromGardenSizeAuthority', 'registry', 'preferenceRegistry'
].sort();

function browserLoader() {
  const modules = new Map();
  const edges = [];
  const fetches = [];
  const messages = [];
  const responses = new Map([
    [new URL('/data/catalog/botanical-size-authority-v1.json', origin).href, registry],
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

test('unchanged index bootstrap installs the complete Size Authority global with local JSON only', async () => {
  const scripts = [...read(pagePath).matchAll(/<script\s+type="module">([\s\S]*?)<\/script>/g)];
  const bootstrap = scripts.filter((match) => match[1].includes('window.CruvitGardenSizeAuthority ='));
  assert.equal(bootstrap.length, 1);
  const loader = browserLoader();
  await loader.evaluate(pagePath, bootstrap[0][1]);
  // Flush the two local async JSON bootstrap chains without timers or network.
  for (let i = 0; i < 8; i++) await Promise.resolve();
  const api = loader.sandbox.CruvitGardenSizeAuthority;
  assert.deepEqual(Object.keys(api).sort(), expectedWindowKeys);
  assert.equal(api.registry.records.length, registry.records.length);
  assert.equal(api.preferenceRegistry.records.length, preferences.records.length);
  assert.equal(api.ownerPreferredRangePosition('mango', api.preferenceRegistry), 'LOW');
  assert.equal(api.ownerPreferredRangePosition('olive', api.preferenceRegistry), null);
  const before = JSON.stringify(api.registry);
  const authority = api.resolveGardenSizeAuthority(api.registry, { canonicalSlug: 'mango', growthStage: 'mature' });
  assert.equal(authority.runtimeAuthorityState, 'RUNTIME_AUTHORITY_READY');
  const jaboticaba = api.resolveGardenSizeAuthority(api.registry, { canonicalSlug: 'jaboticaba', growthStage: 'mature' });
  assert.equal(jaboticaba.usedAuthoritativeMeters, false);
  assert.equal(jaboticaba.heightRangeM, null);
  assert.equal(jaboticaba.fallbackReason, 'INVALID_AUTHORITATIVE_HEIGHT_RANGE');
  const estimated = api.scaleFromGardenSizeAuthority(jaboticaba, { visualForm: 'tree' });
  assert.equal(estimated.scale.botanicalEvidenceClass, 'UNKNOWN');
  assert.equal(estimated.scale.heightRangeM, null);
  assert.ok(estimated.scale.imgHeightPct > 0);
  assert.equal(JSON.stringify(api.registry), before);
  assert.equal(JSON.stringify(api.registry).includes('ownerPreferredRangePosition'), false);
  assert.equal(loader.fetches.length, 2);
  assert.equal(loader.messages.length, 1);
  assert.equal(loader.messages[0].message.type, 'cruvit:garden-design-ready');
  assert.equal(loader.edges.some(({ specifier }) => specifier.startsWith('node:')), false);
});

test('readiness uses the strict validator without adding reachable Node builtins', async () => {
  const loader = browserLoader();
  const entry = await loader.evaluate('modules/garden-design/asset-factory-v1/plant-size-authority-readiness-v1.js');
  const readiness = entry.namespace.resolvePlantSizeAuthorityReadiness(registry, { canonicalSlug: 'jaboticaba' });
  assert.equal(readiness.heightScaleReady, true);
  assert.equal(readiness.authoritativeMetersAvailable, false);
  assert.equal(loader.edges.filter(({ specifier }) => specifier.startsWith('node:')).length, 0);
  assert.equal(loader.fetches.length, 0);
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
