/** P0-B: offline canonical plant read authority. No provider calls or writes. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import * as authority from '../modules/identity/canonical-alias-authority-v1.js';
import { createPlantIdentityResolver, loadIdentityRegistry } from '../modules/identity/plant-identity-resolver.js';
import { projectRows, loadLive, GARDEN_ID, PREVIEW_URL } from '../core-v1/my-garden/plants/data.mjs';
import * as design from '../modules/garden-design/garden-design-owned-garden-v1.js';
import * as media from '../modules/catalog-media/licensed-catalog-media-runtime-v1.js';

const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const registry = JSON.parse(read('data/plant-identity.registry.json'));
const resolver = createPlantIdentityResolver(registry);
const app = read('app.html');
const gd = read('modules/garden-design/index.html');
const parent = '48a017a3272dee34d56a1b9ee6d1a838801a25e5';
const runtimeCandidate = 'cbefb058d2a57a29c824408ae1f30bd01956fd4f';
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const scopeDiff = (from, to) => git(['diff', '--name-status', '--no-renames', from,
  ...(to ? [to] : []), '--']).split('\n').filter(Boolean).sort();
const sourceFetch = globalThis.fetch;
let networkAttempts = 0;
globalThis.fetch = () => { networkAttempts++; throw Error('NETWORK_FORBIDDEN'); };
await loadIdentityRegistry({ fetchImpl: async () => ({ ok: true, json: async () => registry }) });
after(() => { globalThis.fetch = sourceFetch; assert.equal(networkAttempts, 0); });

const slugOf = authority.resolveCanonicalReadSlug;
const entry = slug => registry.canonicalIdentities.find(p => p.canonicalSlug === slug);
const licensed = slug => ({
  imageStatus: 'IMAGE_READY', primaryUrl: `https://example.invalid/${slug}.jpg`,
  sourceAssetId: 'fixture-approved', canonicalPlantIdentity: slug,
  commercialUseAllowed: true, license: 'CC BY 4.0', sourceProvider: 'fixture',
  sourcePageUrl: 'https://example.invalid/source', attributionRequired: true,
  attribution: 'Fixture attribution', author: 'Fixture author'
});
const catalogRow = slug => ({ slug, scientific_name: entry(slug).acceptedScientificName,
  verification_state: 'verified', media_status: 'IMAGE_READY', media: licensed(slug) });
const garden = { id: GARDEN_ID, user_id: 'offline-owner', name: 'Offline fixture' };
const stored = (identity, id = 'offline-instance') => ({
  id, garden_profile_id: GARDEN_ID, user_id: garden.user_id, profile_slug: identity,
  name: 'Personal plant name', scientific: null, archived: false, status: 'unassessed',
  cover_media_id: null, garden_area_id: null
});
const between = (src, a, b) => { const start = src.indexOf(a); const end = src.indexOf(b, start + a.length);
  assert(start >= 0 && end > start, a); return src.slice(start, end); };
function appContext(rows = ['lemon', 'pomegranate', 'raspberry', 'lavender', 'hydrangea', 'spearmint', 'mint', 'common-jasmine', 'jasmine', 'lesser-bougainvillea', 'bougainvillea', 'sweet-orange', 'orange']) {
  const plants = Object.fromEntries(rows.map(slug => [slug, { scientific: entry(slug).acceptedScientificName }]));
  const context = vm.createContext({
    canonicalReadAuthority: authority,
    PLANT_INDEX: Object.fromEntries(rows.map(slug => [slug, { slug, name: slug, scientific: 'Legacy description' }])),
    window: { __CRUVIT_CANONICAL_CLIMATE_BOOTSTRAP: { ready: true, plants } },
    licensedCatalogMediaApi: () => media,
    normalizeQuery: value => String(value || '').trim().toLowerCase().replace(/^עץ\s+/, '').replace(/\s+/g, ' ')
  });
  vm.runInContext(between(app, 'function resolveBootstrapPlantSlug(', '/* ── SAFE'), context);
  vm.runInContext(between(app, 'const CARE_QUALITY_PROFILES=', 'const CRUVIT_DEPLOY_ORIGIN='), context);
  vm.runInContext(between(app, 'function resolvePlantProfileRaw(', 'function getPlantProfile('), context);
  vm.runInContext(between(app, 'function resolvePlantDisplayMedia(plant)', 'function formatCatalogAttributionLabel('), context);
  return context;
}

for (const [slug, plantId, scientific] of [
  ['lemon', 'plt_g4kxc4o0421gq265', 'Citrus × limon'],
  ['pomegranate', 'plt_y7yhzt7rbtxzdijy', 'Punica granatum'],
  ['raspberry', null, 'Rubus idaeus']
]) test(`${slug}: raw / plantId / scientific → Registry → exact catalog row`, () => {
  assert.equal(entry(slug).plantId || null, plantId);
  assert.equal(entry(slug).acceptedScientificName, scientific);
  for (const raw of [slug, plantId, scientific].filter(Boolean)) {
    assert.equal(resolver.resolve(raw).canonicalSlug, slug);
    assert.equal(slugOf(raw), slug);
    const row = stored(raw);
    const snapshot = JSON.stringify(row);
    const result = projectRows(garden, [row], [catalogRow(slug)]).cards[0];
    assert.equal(result.profileSlug, slug);
    assert.equal(result.scientificName, scientific);
    assert.equal(JSON.stringify(row), snapshot);
    const ctx = appContext();
    assert.equal(ctx.resolvePlantProfileRaw(raw).slug, slug);
    assert.equal(ctx.resolvePlantProfileRaw(raw).scientific, scientific);
    assert.equal(design.resolveDesignCanonicalIdentity({ scientific: raw }).canonicalSlug, slug);
  }
});

for (const [specific, broad] of [['spearmint', 'mint'], ['common-jasmine', 'jasmine'],
  ['lesser-bougainvillea', 'bougainvillea'], ['sweet-orange', 'orange']]) {
  test(`${specific}: independent canonical identity survives stale caller aliases`, () => {
    const ctx = appContext();
    assert.equal(ctx.resolveBootstrapPlantSlug(specific), specific);
    assert.equal(ctx.resolvePlantProfileRaw(specific).slug, specific);
    assert.equal(ctx.resolveBootstrapPlantSlug(broad), broad);
    assert.equal(design.resolveDesignCanonicalSlug({ slug: specific }, { [specific]: broad }), specific);
    assert.equal(projectRows(garden, [stored(specific)], [catalogRow(specific)]).cards[0].profileSlug, specific);
    const result = media.withCanonicalCatalogMedia({ profileSlug: specific }, {
      [broad]: { slug: broad, media: licensed(broad) }
    });
    assert.equal(media.resolvePlantDisplayMedia(result).kind, 'placeholder');
    assert.throws(() => projectRows(garden, [stored(specific)], [catalogRow(broad)]), /Exact canonical/);
  });
}
for (const [alias, canonical] of [['english-lavender', 'lavender'], ['bigleaf-hydrangea', 'hydrangea']]) {
  test(`${alias}: registered alias reaches only ${canonical}`, () => {
    assert.equal(authority.REGISTRY_ALIAS_TO_CANONICAL[alias], canonical);
    assert.equal(slugOf(alias), canonical);
    assert.equal(appContext().resolvePlantProfileRaw(alias).slug, canonical);
    assert.equal(design.resolveDesignCanonicalSlug({ slug: alias }), canonical);
    const display = media.resolvePlantDisplayMedia(media.withCanonicalCatalogMedia({ profileSlug: alias }, {
      [canonical]: { slug: canonical, media: licensed(canonical) }
    }));
    assert.equal(display.kind, 'catalog');
    assert.equal(display.url, licensed(canonical).primaryUrl);
  });
}
test('bell-pepper is not manufactured; transitional profiles do not grant identity', () => {
  assert.equal(Object.hasOwn(authority.REGISTRY_ALIAS_TO_CANONICAL, 'bell-pepper'), false);
  assert.equal(slugOf('bell-pepper'), '');
  assert.equal(slugOf('sweet-pepper'), 'sweet-pepper');
  const ctx = appContext();
  ctx.PLANT_INDEX['bell-pepper'] = { slug: 'bell-pepper', scientific: 'Capsicum annuum' };
  assert.equal(ctx.resolvePlantProfileRaw('bell-pepper'), null);
});

test('unknown, conflicting, quarantined and ambiguous identities fail closed', () => {
  for (const raw of ['made-up-plant', '__proto__', 'constructor', 'mulberry', {}, [], 9,
    { slug: 'lemon', profile_slug: 'pomegranate' },
    { plantId: 'plt_g4kxc4o0421gq265', canonicalSlug: 'pomegranate' },
    { profileSlug: 'lemon', scientific: 'Punica granatum' },
    { slug: 'missing', scientific: 'Citrus × limon' }]) assert.equal(slugOf(raw), '', JSON.stringify(raw));
  const ambiguous = structuredClone(registry);
  for (const slug of ['lemon', 'pomegranate']) ambiguous.canonicalIdentities.find(p => p.canonicalSlug === slug).acceptedScientificName = 'Test ambiguous';
  assert.equal(slugOf('Test ambiguous', { resolver: createPlantIdentityResolver(ambiguous) }), '');
  const ctx = appContext();
  assert.equal(ctx.resolvePlantProfileRaw({ profileSlug: 'lemon', slug: 'pomegranate' }), null);
  delete ctx.window.__CRUVIT_CANONICAL_CLIMATE_BOOTSTRAP.plants.lemon;
  assert.equal(ctx.resolvePlantProfileRaw('lemon'), null, 'seed cannot replace missing exact catalog row');
});

test('Raspberry care enrichment preserves canonical Rubus idaeus', () => {
  const ctx = appContext();
  assert.equal(ctx.careProfileForPlant('raspberry').scientific, 'Rubus idaeus / Rubus spp.');
  const profile = ctx.resolvePlantProfileRaw('raspberry');
  const original = JSON.stringify(profile);
  for (const scientific of ['Rubus idaeus', '', 'Rubus idaeus / Rubus spp.', 'Punica granatum']) {
    const enriched = ctx.enrichProfileWithQuality({ ...profile, scientific }, 'raspberry');
    assert.equal(enriched.slug, 'raspberry');
    assert.equal(enriched.scientific, 'Rubus idaeus');
  }
  assert.equal(ctx.enrichProfileWithQuality({...profile,scientific:'Rubus spp.',tags:['scan-result']},'raspberry').scientific,'Rubus idaeus');
  vm.runInContext(between(app,'function applyProfileToPlant(', 'function escapeAttr('),ctx);
  const plant={slug:'raspberry',name:'Raspberry',scientific:'Rubus idaeus'};
  ctx.applyProfileToPlant(plant,{slug:'raspberry',scientific:'Rubus idaeus / Rubus spp.'});
  assert.equal(plant.scientific,'Rubus idaeus');
  assert.equal(plant.meta.scientific,'Rubus idaeus');
  assert.equal(JSON.stringify(profile), original);
});

function client(plants, catalog = [...new Set(plants.map(p => slugOf(p.profile_slug)))].filter(Boolean).map(catalogRow)) {
  const calls = [];
  const results = { garden_profiles: garden, garden_plants: plants, catalog_plants: catalog };
  return { calls, supabaseUrl: PREVIEW_URL,
    auth: { async getUser() { calls.push(['auth']); return { data: { user: { id: garden.user_id, role: 'authenticated' } } }; } },
    from(table) { calls.push(['table', table]);
      const result = { data: results[table], status: 200, count: plants.length };
      const q = { select() { return q; }, eq() { return q; }, order() { return q; }, range() { return q; },
        in(column, values) { calls.push(['in', column, values]); return q; },
        async maybeSingle() { return result; }, then(ok, no) { return Promise.resolve(result).then(ok, no); } };
      return q;
    },
    storage: { from(bucket) { assert.equal(bucket, 'user-garden-media'); return {
      async createSignedUrls(paths) { calls.push(['sign', paths]); return { data: paths.map(path => ({ path, signedUrl: PREVIEW_URL + '/storage/v1/object/sign/user-garden-media/' + path })) }; }
    }; } }
  };
}
test('My Garden queries canonical keys once, projects exact rows and never rewrites stored identities', async () => {
  const plants = [stored('plt_g4kxc4o0421gq265', 'a'), stored('english-lavender', 'b'),
    stored('lemon', 'c'), stored('Punica granatum', 'd')];
  const original = JSON.stringify(plants);
  const c = client(plants);
  const model = await loadLive(c);
  assert.deepEqual(c.calls.find(x => x[0] === 'in'), ['in', 'slug', ['lemon', 'lavender', 'pomegranate']]);
  assert.equal(c.calls.filter(x => x[1] === 'catalog_plants').length, 1);
  assert.deepEqual(model.cards.map(p => p.profileSlug), ['lemon', 'lavender', 'lemon', 'pomegranate']);
  assert.equal(model.counts.databaseReads, 3);
  assert.equal(model.counts.paidAICalls, 0);
  assert.equal(model.counts.externalProviderCalls, 0);
  assert.equal(JSON.stringify(plants), original);
});
for (const row of [stored('unknown-plant'), stored('mulberry'),
  { ...stored('pomegranate'), plantId: 'plt_g4kxc4o0421gq265' }]) {
  test(`My Garden blocks ${row.profile_slug} before catalog query`, async () => {
    const c = client([row], []);
    await assert.rejects(() => loadLive(c), /Unresolved or conflicting/);
    assert.equal(c.calls.some(x => x[1] === 'catalog_plants'), false);
  });
}
test('My Garden rejects alias rows, missing rows, duplicate rows and scientific conflicts', () => {
  const p = stored('english-lavender');
  for (const catalog of [[], [{ ...catalogRow('lavender'), slug: 'english-lavender' }], [catalogRow('lavender'), catalogRow('lavender')]]) {
    assert.throws(() => projectRows(garden, [p], catalog));
  }
  assert.throws(() => projectRows(garden, [{ ...stored('lemon'), scientific: 'Punica granatum' }], [catalogRow('lemon')]), /Scientific identity conflict/);
  assert.throws(() => projectRows(garden, [stored('lemon')], [{...catalogRow('lemon'),scientific_name:'Punica granatum'}]), /Catalog scientific identity conflict/);
});
test('My Garden ownership, image approval, personal cover and area gates are preserved', async () => {
  const base = stored('lemon');
  for (const patch of [{ user_id: 'other' }, { garden_profile_id: 'other' }, { name: '' }, { archived: null },
    { cover_media_id: 'missing' }, { garden_area_id: 'missing' }]) {
    assert.throws(() => projectRows(garden, [{ ...base, ...patch }], [catalogRow('lemon')]));
  }
  for (const patch of [{ verification_state: 'pending' }, { media_status: 'MISSING' },
    { media: { ...licensed('lemon'), canonicalPlantIdentity: 'pomegranate' } },
    { media: { ...licensed('lemon'), kind: 'design_cutout' } },
    { media: { ...licensed('lemon'), primaryUrl: 'javascript:bad' } }]) {
    assert.throws(() => projectRows(garden, [base], [{ ...catalogRow('lemon'), ...patch }]));
  }
  assert.throws(() => projectRows(garden, [base, base], [catalogRow('lemon')]));
  assert.equal(projectRows(garden, [{ ...base, archived: true }], [catalogRow('lemon')]).activeCount, 0);
  for (const number of [1, 2, 9, 120]) {
    const plants = Array.from({ length: number }, (_, i) => ({ ...stored('lemon', 'instance-' + i), cover_media_id: 'cover-' + i,
      cover: { id: 'cover-' + i, user_id: garden.user_id, garden_profile_id: GARDEN_ID, garden_plant_id: 'instance-' + i,
        purpose: 'plant_profile', validation_state: 'validated', storage_bucket: 'user-garden-media', storage_path: `fixture/${i}.jpg` } }));
    const c = client(plants);
    const m = await loadLive(c);
    assert.equal(m.cards.length, number);
    assert.equal(m.counts.databaseReads, 3);
    assert.equal(m.counts.storageSignRequests, 1);
    assert(m.cards.every(p => p.image.kind === 'personal' && p.systemImage.kind === 'catalog'));
  }
});

test('Garden Design rejects arbitrary text and caller/catalog-manufactured identities', () => {
  for (const input of [{ name: 'Invented garden shrub' }, { scientific: 'Imaginarus example' },
    { canonicalSlug: 'invented-plant' }, { canonicalSlug: 'lemon', profileSlug: 'pomegranate' }]) {
    assert.equal(design.resolveDesignCanonicalIdentity(input, {
      catalog: [{ slug: 'invented-plant', name: 'Invented garden shrub', scientific: 'Imaginarus example' }],
      aliasMaps: { 'invented-plant': 'lemon' }
    }).canonicalSlug, null);
  }
  assert.equal(design.resolveDesignCanonicalSlug({ manifestKey: 'olive-tree' }, { manifestKeyToCanonical: { 'olive-tree': 'lemon' } }), 'olive');
  assert.equal(design.resolveDesignCanonicalSlug({ manifestKey: 'unknown-key' }, { manifestKeyToCanonical: { 'unknown-key': 'lemon' } }), '');
  assert.throws(() => design.createProposedDesignPlacement({ gardenProfileId: 'g', canonicalSlug: 'invented plant' }), /canonical slug/);
  assert.equal(design.confirmDesignProposalCommit({ userConfirmed: true, gardenProfileId: 'g', canonicalSlug: 'invented plant' }).ok, false);
});
test('Garden Design uses exact catalog keys; missing/duplicate rows cannot substitute another species', () => {
  const row = { slug: 'lemon', scientific: 'Citrus × limon' };
  assert.equal(design.resolveDesignCanonicalIdentity({ scientific: 'Citrus × limon' }, { catalog: [row] }).catalogRecord, row);
  assert.equal(design.resolveDesignCanonicalIdentity({ slug: 'spearmint' }, { catalog: [{ slug: 'mint' }] }).catalogRecord, null);
  assert.equal(design.resolveDesignCanonicalIdentity({ slug: 'lemon' }, { catalog: [row, row] }).canonicalSlug, null);
  assert.equal(design.resolveDesignCanonicalIdentity({ slug: 'lemon' }, { catalog: [{ slug: 'lemon', scientific: 'Punica granatum' }] }).canonicalSlug, null);
});
test('Garden Design browser fallback is closed before Registry module is available', () => {
  const ctx = vm.createContext({ gdOwnedGardenApi: () => null, gdOwnedGardenContext: {} });
  vm.runInContext(between(gd, 'function gdResolveLayerIdentity(', 'function gdPlantCardDedupeKey('), ctx);
  assert.equal(ctx.gdResolveLayerIdentity({ latin: 'Madeup botanical text' }).canonicalSlug, null);
  ctx.gdOwnedGardenApi = () => design;
  assert.equal(ctx.gdResolveLayerIdentity({ latin: 'Citrus × limon' }).canonicalSlug, 'lemon');
  assert.equal(ctx.gdResolveLayerIdentity({ latin: 'Madeup botanical text' }).canonicalSlug, null);
  const createLayer = between(gd, 'function createPlantLayerFromPlant(', '\nfunction ');
  const addLayer = between(gd, 'function addPlantLayerAt(', '\nfunction ');
  assert.doesNotMatch(createLayer + addLayer, /slug:\s*[^\n]*latinToSlug/);
  assert.doesNotMatch(addLayer, /canonicalSlug:\s*[^\n]*template\?\.canonicalSlug/);
});

test('Catalog Media resolves registered identity before exact lookup; mismatched rows/media fail closed', () => {
  for (const input of [{ profileSlug: 'english-lavender' }, { profile_slug: 'english-lavender' }, { slug: 'lavender' }]) {
    const lookups = [];
    const lookup = new Proxy({ lavender: { slug: 'lavender', media: licensed('lavender') } }, {
      get(target, key) { lookups.push(key); return target[key]; }
    });
    const result = media.withCanonicalCatalogMedia(input, lookup);
    assert.deepEqual(lookups, ['lavender']);
    assert.equal(media.resolvePlantDisplayMedia(result).kind, 'catalog');
    assert.equal(Object.hasOwn(input, 'catalogMedia'), false);
  }
  for (const input of [{ slug: 'unknown' }, { slug: 'lemon', profileSlug: 'pomegranate' }]) {
    assert.equal(media.resolvePlantDisplayMedia({ ...input, media: licensed('lemon') }).kind, 'placeholder');
  }
  for (const hit of [{ slug: 'pomegranate', media: licensed('lemon') }, { slug: 'lemon', media: licensed('pomegranate') }]) {
    assert.equal(media.resolvePlantDisplayMedia(media.withCanonicalCatalogMedia({ slug: 'lemon' }, { lemon: hit })).kind, 'placeholder');
  }
});
test('user photos remain personal; catalog lookup never promotes them', () => {
  const photo = 'https://example.invalid/personal.jpg';
  const input = { slug: 'unknown', photoUrl: photo, scanPhotoUrl: photo };
  assert.equal(media.resolvePlantDisplayMedia(input).kind, 'placeholder');
  const cover = { ...input, coverMediaId: 'personal-id', coverSignedUrl: photo };
  assert.equal(media.resolvePlantDisplayMedia(cover).kind, 'user_cover');
  assert.equal(media.resolvePlantDisplayMedia(cover).authority, 'garden_media.cover_media_id');
  assert.equal(media.mayPromoteUserMediaToCatalogImage(), false);
  assert.equal(media.withCanonicalCatalogMedia(input, { unknown: { photoUrl: photo } }), input);
});

test('P0-B RUNTIME IMPLEMENTATION SCOPE: exact accepted ten paths', () => {
  const modified = ['modules/identity/canonical-alias-authority-v1.js', 'app.html',
    'core-v1/my-garden/plants/data.mjs', 'modules/garden-design/garden-design-owned-garden-v1.js',
    'modules/garden-design/index.html', 'modules/catalog-media/licensed-catalog-media-runtime-v1.js',
    'config/packaging/static-runtime-source-lock-v1.json', 'tests/static-runtime-packaging-v1.test.mjs',
    'config/packaging/dormant-reference-garden-design-pc-wand-v1.json'];
  const expected = [...modified.map(path => `M\t${path}`),
    'A\ttests/canonical-plant-read-authority-v1.test.mjs'].sort();
  assert.equal(git(['rev-parse', `${runtimeCandidate}^`]), parent,
    'P0-B RUNTIME IMPLEMENTATION SCOPE: accepted direct parent');
  assert.deepEqual(scopeDiff(parent, runtimeCandidate), expected,
    'P0-B RUNTIME IMPLEMENTATION SCOPE: no extra or missing original path');
});

test('P0-B TEST-CONTRACT RECONCILIATION SCOPE: exact six modified tests', () => {
  const expected = ['tests/core-v1-commit4/integration-contracts.test.mjs',
    'tests/core-v1-commit4/plants-data.test.mjs', 'tests/licensed-catalog-media-runtime-v1.test.mjs',
    'tests/smart-rec-garden-intelligence-v1.test.mjs', 'tests/canonical-runtime-climate-bootstrap-v1.test.mjs',
    'tests/canonical-plant-read-authority-v1.test.mjs'].map(path => `M\t${path}`).sort();
  // Before commit, qualify the exact working tree. After commit, also require
  // the child HEAD itself to have this scope and the accepted direct parent.
  const head = git(['rev-parse', 'HEAD']);
  if (head !== runtimeCandidate) {
    assert.equal(git(['rev-parse', `${head}^`]), runtimeCandidate,
      'P0-B TEST-CONTRACT RECONCILIATION SCOPE: one direct child');
    assert.deepEqual(scopeDiff(runtimeCandidate, head), expected,
      'P0-B TEST-CONTRACT RECONCILIATION SCOPE: exact committed six-path diff');
    assert.equal(git(['diff', '--name-status', 'HEAD', '--']), '',
      'P0-B TEST-CONTRACT RECONCILIATION SCOPE: working tree matches child HEAD');
  }
  assert.deepEqual(scopeDiff(runtimeCandidate), expected,
    'P0-B TEST-CONTRACT RECONCILIATION SCOPE: no runtime, extra, missing, added or deleted path');
});

test('preservation: approved visuals, Climate and Atomic Save remain unchanged', () => {
  for (const path of ['app.html', 'modules/garden-design/index.html']) {
    const before = execFileSync('git', ['show', `${parent}:${path}`], { cwd: root, encoding: 'utf8' });
    const outsideScripts = src => src.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>');
    assert.equal(outsideScripts(read(path)), outsideScripts(before), `${path}: markup/CSS/assets preserved`);
  }
  const baseline = execFileSync('git', ['show', `${parent}:app.html`], { cwd: root, encoding: 'utf8' });
  assert.equal(between(app, 'function applyCanonicalRuntimeClimateOverlay()', '\napplyCanonicalRuntimeClimateOverlay();'),
    between(baseline, 'function applyCanonicalRuntimeClimateOverlay()', '\napplyCanonicalRuntimeClimateOverlay();'));
  const saveBody = src => { const body=between(src,'function savePlantFromLibrary(', '\nfunction findPlantByName(');return body.slice(body.indexOf('  try{')); };
  assert.equal(saveBody(app), saveBody(baseline), 'existing save/write body unchanged');
});

test('scoped HTML scripts compile with unchanged classic-script globals', () => {
  for (const src of [app, gd]) for (const match of src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=|type=["']module/.test(match[1])) continue;
    new vm.Script(match[2]);
  }
});

test('app rejects an unresolved catalog read before entering the unchanged save flow', () => {
  const ctx=appContext();
  ctx.normalizeGardenDataShape=()=>{throw Error('WRITE_FLOW_MUST_NOT_START');};
  vm.runInContext(between(app,'function savePlantFromLibrary(', '\nfunction findPlantByName('),ctx);
  for(const raw of ['bell-pepper','unknown-plant','mulberry']) assert.equal(ctx.savePlantFromLibrary(raw),null);
  delete ctx.window.__CRUVIT_CANONICAL_CLIMATE_BOOTSTRAP.plants.lemon;
  assert.equal(ctx.savePlantFromLibrary('lemon'),null);
});
