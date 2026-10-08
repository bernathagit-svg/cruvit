/** Independent Registry-first alias regression. Offline, no generated image/data writes. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_ALIAS_AUTHORITY, REGISTRY_ALIAS_TO_CANONICAL, SPECIES_ALIAS_TO_CANONICAL,
  deriveCanonicalAliasAuthority, resolveCanonicalAliasSlug
} from '../modules/identity/canonical-alias-authority-v1.js';
import {
  SMART_REC_SPECIES_ALIAS_ONTO_CANONICAL, resolveSmartRecCanonicalSlug,
  buildSmartRecCatalogBySlug, resolveSmartRecCatalogDisplay, buildSmartRecCardModel
} from '../modules/smart-recommendations/smart-rec-garden-intelligence-v1.js';
import { SPECIES_ALIAS_ONTO_CANONICAL, resolveCanonicalImageSlug,
  buildActiveCanonicalImageCoverage, resolveActiveCanonicalCatalogMedia
} from '../modules/catalog-media/active-canonical-image-coverage-v1.js';
import { createPlantIdentityResolver } from '../modules/identity/plant-identity-resolver.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(ROOT, 'data/plant-identity.registry.json');
const original = fs.readFileSync(source);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const registry = JSON.parse(original.toString('utf8'));
const resolver = createPlantIdentityResolver(registry);
const pairs = [
  ['spearmint', 'mint', 'Mentha spicata'],
  ['common-jasmine', 'jasmine', 'Jasminum officinale'],
  ['lesser-bougainvillea', 'bougainvillea', 'Bougainvillea glabra']
];
const fetchBefore = globalThis.fetch;
let networkAttempts = 0;
globalThis.fetch = () => { networkAttempts++; throw new Error('NETWORK_FORBIDDEN'); };
after(() => {
  globalThis.fetch = fetchBefore;
  assert.equal(networkAttempts, 0);
  assert.deepEqual(fs.readFileSync(source), original);
});

test('runtime projection exactly derives from unchanged Identity Registry including fingerprint', () => {
  assert.deepEqual(CANONICAL_ALIAS_AUTHORITY, deriveCanonicalAliasAuthority(registry, sha(original)));
  assert.ok(Object.isFrozen(CANONICAL_ALIAS_AUTHORITY));
  assert.ok(Object.isFrozen(REGISTRY_ALIAS_TO_CANONICAL));
  assert.ok(Object.isFrozen(CANONICAL_ALIAS_AUTHORITY.canonicalSlugs));
});

test('both consumers export the same immutable alias object, not matching copied tables', () => {
  assert.equal(SMART_REC_SPECIES_ALIAS_ONTO_CANONICAL, SPECIES_ALIAS_ONTO_CANONICAL);
  assert.equal(SPECIES_ALIAS_ONTO_CANONICAL, SPECIES_ALIAS_TO_CANONICAL);
});

for (const [species, generic, scientific] of pairs) {
  test(species + ': Registry and both consumers retain a separate exact canonical identity', () => {
    assert.equal(resolver.resolve(species).canonicalSlug, species);
    assert.equal(resolver.resolve(scientific).canonicalSlug, species);
    assert.equal(resolveSmartRecCanonicalSlug(species), species);
    assert.equal(resolveCanonicalImageSlug(species), species);
    assert.equal(resolveSmartRecCanonicalSlug(generic), generic);
    assert.equal(Object.hasOwn(REGISTRY_ALIAS_TO_CANONICAL, species), false);
    const bad = { [species]: generic, [generic]: species };
    assert.equal(resolveSmartRecCanonicalSlug(species, bad), species);
    assert.equal(resolveCanonicalImageSlug(species, { bootstrapAliases: bad, registryAliases: bad }), species);
  });
  test(species + ': mixed species/generic catalog remains separate in either insertion order', () => {
    const specific = { slug: species, scientific };
    const broad = { slug: generic, scientific: scientific.split(' ')[0] + ' spp.' };
    for (const entries of [[[species,specific],[generic,broad]],[[generic,broad],[species,specific]]]) {
      const index = buildSmartRecCatalogBySlug(Object.fromEntries(entries));
      assert.equal(index[species], specific);
      assert.equal(index[generic], broad);
      assert.equal(Object.keys(index).length, 2);
    }
  });
  test(species + ': exact stored licensed image is kept; generic-only lookup is a placeholder', () => {
    const record = buildActiveCanonicalImageCoverage(ROOT).records.find(r => r.slug === species);
    assert.ok(record, 'Exact canonical species is in real catalog coverage');
    assert.equal(record.scientific, scientific);
    const media = resolveActiveCanonicalCatalogMedia(ROOT, record);
    assert.ok(media, 'Existing exact media required for positive control');
    const plant = { slug: species, scientific };
    const specific = { ...plant, media, catalogMedia: media };
    const catalog = buildSmartRecCatalogBySlug({ [species]: specific });
    const display = resolveSmartRecCatalogDisplay(plant, catalog);
    assert.equal(display.kind, 'catalog');
    assert.equal(display.url, media.primaryUrl || media.url);
    assert.equal(buildSmartRecCardModel(plant, { catalogBySlug: catalog }).canonicalSlug, species);
    const missing = resolveSmartRecCatalogDisplay(plant, { [generic]: specific });
    assert.equal(missing.kind, 'placeholder');
    assert.equal(missing.url, '');
  });
}

test('all registered canonical keys are stable across both consumers', () => {
  for (const row of registry.canonicalIdentities) {
    assert.equal(resolveSmartRecCanonicalSlug(row.canonicalSlug), row.canonicalSlug);
    assert.equal(resolveCanonicalImageSlug(row.canonicalSlug), row.canonicalSlug);
  }
});

test('every accepted alias comes from Registry and both consumers agree with its resolver', () => {
  const expected = {};
  for (const row of registry.canonicalIdentities) for (const alias of row.aliasSlugs || []) {
    expected[alias] = row.canonicalSlug;
    assert.equal(resolveSmartRecCanonicalSlug(alias), row.canonicalSlug);
    assert.equal(resolveCanonicalImageSlug(alias), row.canonicalSlug);
    assert.equal(resolver.resolve(alias).canonicalSlug, row.canonicalSlug);
  }
  assert.deepEqual({ ...REGISTRY_ALIAS_TO_CANONICAL }, expected);
});

test('unregistered legacy bell-pepper redirect is not manufactured to satisfy old tests', () => {
  assert.equal(Object.hasOwn(REGISTRY_ALIAS_TO_CANONICAL, 'bell-pepper'), false);
  assert.equal(resolveSmartRecCanonicalSlug('bell-pepper'), 'bell-pepper');
  assert.equal(resolveCanonicalImageSlug('bell-pepper'), 'bell-pepper');
  assert.equal(resolveSmartRecCanonicalSlug('sweet-pepper'), 'sweet-pepper');
});

test('unknown, malformed and prototype keys never become injected aliases', () => {
  for (const value of [null, undefined, 42, {}, []]) assert.equal(resolveSmartRecCanonicalSlug(value), '');
  assert.equal(resolveSmartRecCanonicalSlug('  SPEARMINT  '), 'spearmint');
  for (const key of ['mystery', 'constructor', '__proto__']) {
    assert.equal(resolveSmartRecCanonicalSlug(key, { [key]: 'mint' }), key);
    assert.equal(resolveCanonicalImageSlug(key, { registryAliases: { [key]: 'mint' } }), key);
  }
});

test('canonical/alias collisions and duplicate alias claims fail rather than choose array order', () => {
  const copy = () => JSON.parse(JSON.stringify(registry));
  for (const [species,generic] of pairs) {
    const bad = copy();
    bad.canonicalIdentities.find(x=>x.canonicalSlug===generic).aliasSlugs = [species];
    assert.throws(()=>deriveCanonicalAliasAuthority(bad), /CANONICAL_COLLISION/);
  }
  const duplicate = copy();
  duplicate.canonicalIdentities.find(x=>x.canonicalSlug==='mint').aliasSlugs = ['english-lavender'];
  assert.throws(()=>deriveCanonicalAliasAuthority(duplicate), /DUPLICATE_CLAIM/);
});

test('projection does not mutate Registry or convert review status into botanical approval', () => {
  const before = JSON.stringify(registry);
  deriveCanonicalAliasAuthority(registry);
  assert.equal(JSON.stringify(registry), before);
  for (const [,generic] of pairs) assert.equal(resolver.resolve(generic).needsReview, true);
  assert.equal(Object.hasOwn(CANONICAL_ALIAS_AUTHORITY, 'approved'), false);
});

test('shared browser dependency contains no filesystem or network imports', () => {
  const src = fs.readFileSync(path.join(ROOT,'modules/identity/canonical-alias-authority-v1.js'),'utf8');
  assert.doesNotMatch(src, /from\s+['"]node:|\bfetch\s*\(/);
  for (const rel of ['modules/catalog-media/active-canonical-image-coverage-v1.js',
    'modules/smart-recommendations/smart-rec-garden-intelligence-v1.js']) {
    const body = fs.readFileSync(path.join(ROOT,rel),'utf8');
    assert.match(body, /from ['"]\.\.\/identity\/canonical-alias-authority-v1\.js['"]/);
    assert.doesNotMatch(body, /spearmint\s*:\s*['"]mint|['"]common-jasmine['"]\s*:\s*['"]jasmine/);
  }
});
