/**
 * Licensed catalog media — runtime consumption (no network search).
 * Run: node --test tests/licensed-catalog-media-runtime-v1.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolvePlantDisplayMedia,
  isApprovedCatalogMediaRecord,
  getUserOwnedPlantPhotoUrl,
  formatCatalogAttributionLabel,
  catalogMediaPlaceholderDataUrl,
  measureCatalogMediaLookupLatency,
  IMAGE_READY,
  IMAGE_PENDING
} from '../modules/catalog-media/licensed-catalog-media-runtime-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const APP = path.join(ROOT, 'app.html');
const PLANT_IMAGE_FN = path.join(ROOT, 'netlify', 'functions', 'plant-image.mjs');

const ACCEPTANCE = ['cacao', 'coconut', 'cypress', 'kiwi', 'plumeria'];

function loadSeedPlants() {
  const raw = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  return (raw.plants || []).map((p) => ({
    slug: p.slug,
    name: p.names?.en || p.slug,
    scientific: p.scientific,
    catalogMedia: p.media,
    media: p.media
  }));
}

test('acceptance plants: IMAGE_READY → catalog URL + provenance + attribution', () => {
  const plants = loadSeedPlants();
  for (const slug of ACCEPTANCE) {
    const p = plants.find((x) => x.slug === slug);
    assert.ok(p, `missing seed plant ${slug}`);
    const approved = isApprovedCatalogMediaRecord(p.media, p);
    assert.equal(approved.ok, true, `${slug} not approved: ${approved.reason}`);
    const display = resolvePlantDisplayMedia(p);
    assert.equal(display.kind, 'catalog', slug);
    assert.equal(display.imageStatus, IMAGE_READY, slug);
    assert.equal(display.url, approved.url, slug);
    assert.match(display.url, /^https:\/\//, slug);
    assert.ok(display.license, `${slug} license`);
    assert.ok(display.sourcePageUrl, `${slug} source page`);
    if (display.attributionRequired) {
      const label = formatCatalogAttributionLabel(display);
      assert.ok(label, `${slug} attribution label`);
      assert.ok(display.author || display.attribution, `${slug} creator`);
    }
  }
});

test('IMAGE_PENDING / IMAGE_BLOCKED plant → placeholder, no search URL', () => {
  const display = resolvePlantDisplayMedia({
    slug: 'pending-fixture',
    name: 'Pending Fixture',
    scientific: 'Fixture pendingus',
    media: { imageStatus: IMAGE_PENDING, pendingReason: 'test' }
  });
  assert.equal(display.kind, 'placeholder');
  assert.ok(!display.url);
  assert.equal(display.imageStatus, IMAGE_PENDING);

  const blocked = resolvePlantDisplayMedia({
    slug: 'blocked-fixture',
    name: 'Blocked Fixture',
    scientific: 'Fixture blockedus',
    media: { imageStatus: 'IMAGE_BLOCKED', blockedReason: 'identity-ambiguous', pendingReason: 'identity-ambiguous' }
  });
  assert.equal(blocked.kind, 'placeholder');
  assert.equal(blocked.imageStatus, 'IMAGE_BLOCKED');
});

test('unknown / NC / incomplete license media never renders as catalog', () => {
  const base = {
    slug: 'fake',
    name: 'Fake',
    scientific: 'Ficus fake',
    media: {
      imageStatus: IMAGE_READY,
      primaryUrl: 'https://example.com/x.jpg',
      sourceProvider: 'wikimedia-commons',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:x.jpg',
      author: 'Someone',
      license: 'CC BY-NC 4.0',
      commercialUseAllowed: false,
      attributionRequired: true,
      attribution: 'Someone'
    }
  };
  assert.equal(isApprovedCatalogMediaRecord(base.media, base).ok, false);
  assert.equal(resolvePlantDisplayMedia(base).kind, 'placeholder');

  const unknown = {
    ...base,
    media: {
      ...base.media,
      license: '',
      commercialUseAllowed: true
    }
  };
  assert.equal(isApprovedCatalogMediaRecord(unknown.media, unknown).ok, false);

  const noStatus = {
    ...base,
    media: {
      primaryUrl: 'https://upload.wikimedia.org/wikipedia/commons/a.jpg',
      license: 'CC BY 4.0',
      commercialUseAllowed: true,
      sourceProvider: 'wikimedia-commons',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:a.jpg',
      author: 'A'
    }
  };
  assert.equal(resolvePlantDisplayMedia(noStatus).kind, 'placeholder');
});

test('explicit personal cover overrides catalog; local photoUrl does not', () => {
  const plants = loadSeedPlants();
  const cacao = plants.find((p) => p.slug === 'cacao');
  const withLocalOnly = {
    ...cacao,
    photoUrl: 'https://example.com/user-garden-photo.jpg'
  };
  assert.equal(getUserOwnedPlantPhotoUrl(withLocalOnly), withLocalOnly.photoUrl);
  // Local observational photo must NOT become plant identity display
  const displayLocal = resolvePlantDisplayMedia(withLocalOnly);
  assert.equal(displayLocal.kind, 'catalog', 'catalog remains default identity');
  assert.equal(displayLocal.url, cacao.media.primaryUrl || cacao.media.url);

  const withCover = {
    ...cacao,
    coverMediaId: '33333333-3333-4333-8333-333333333333',
    coverSignedUrl: 'https://signed.example/cover.jpg',
    photoUrl: 'https://example.com/ignored-local.jpg'
  };
  const displayCover = resolvePlantDisplayMedia(withCover);
  assert.equal(displayCover.kind, 'user_cover');
  assert.equal(displayCover.url, withCover.coverSignedUrl);
});

test('broken approved URL does not invent replacement search — placeholder helper only', () => {
  const ph = catalogMediaPlaceholderDataUrl('Cacao');
  assert.match(ph, /^data:image\/svg\+xml/);
  assert.ok(!/wikipedia|commons|bing|unsplash|loremflickr|openverse/i.test(ph));
});

test('wrong-species candidate never approved without identity/status contract', () => {
  const wrong = {
    slug: 'cacao',
    name: 'Cacao',
    scientific: 'Theobroma cacao',
    media: {
      imageStatus: IMAGE_READY,
      primaryUrl: 'https://upload.wikimedia.org/wikipedia/commons/Cocos_nucifera.jpg',
      sourceProvider: 'wikimedia-commons',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Cocos_nucifera.jpg',
      author: 'X',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0',
      commercialUseAllowed: true,
      attributionRequired: true,
      attribution: 'X',
      identityConfidence: 'low',
      searchQuery: 'Cocos nucifera'
    }
  };
  // Soft identity: low confidence + wrong binomial in blob may fail
  const r = isApprovedCatalogMediaRecord(wrong.media, wrong);
  assert.equal(r.ok, false, 'wrong-species low-confidence must not approve');
});

test('runtime app.html has no live Wikipedia/Commons/Bing search path', () => {
  const app = fs.readFileSync(APP, 'utf8');
  assert.match(app, /resolvePlantDisplayMedia/);
  assert.match(app, /plantMediaAttributionHtml/);
  assert.match(app, /licensed-catalog-media-runtime/);
  assert.doesNotMatch(
    app,
    /tse1\.mm\.bing\.net\/th\?q=/
  );
  assert.doesNotMatch(app, /loremflickr\.com\/900/);
  assert.doesNotMatch(app, /source\.unsplash\.com\/900x600/);
  // fetchPlantImageFromWikipedia must be hard-disabled (return '')
  assert.match(app, /async function fetchPlantImageFromWikipedia[\s\S]*?return '';/);
  assert.doesNotMatch(
    app,
    /commons\.wikimedia\.org\/w\/api\.php\?[^`]{0,80}generator=search/
  );
  const fn = fs.readFileSync(PLANT_IMAGE_FN, 'utf8');
  assert.match(fn, /disabled:\s*true/);
  assert.doesNotMatch(fn, /fetchWikipediaImageBundle/);
});

test('media lookup performance: 100 and 500 lookups (no network)', () => {
  const plants = loadSeedPlants();
  const sample = plants.slice(0, Math.min(20, plants.length));
  const one = measureCatalogMediaLookupLatency(sample, 50);
  assert.ok(one.medianMs < 50, `single-pass median ${one.medianMs}`);

  const t100 = performance.now();
  for (let i = 0; i < 100; i++) {
    for (const p of sample) resolvePlantDisplayMedia(p);
  }
  const ms100 = performance.now() - t100;

  const t500 = performance.now();
  for (let i = 0; i < 500; i++) {
    for (const p of sample) resolvePlantDisplayMedia(p);
  }
  const ms500 = performance.now() - t500;

  assert.ok(ms100 < 500, `100 lookups batch ${ms100}ms`);
  assert.ok(ms500 < 2500, `500 lookups batch ${ms500}ms`);

  const report = {
    generatedAt: new Date().toISOString(),
    acceptance: ACCEPTANCE.map((slug) => {
      const p = plants.find((x) => x.slug === slug);
      const d = resolvePlantDisplayMedia(p);
      return {
        slug,
        kind: d.kind,
        url: d.url,
        license: d.license,
        attributionRequired: d.attributionRequired,
        attributionLabel: formatCatalogAttributionLabel(d)
      };
    }),
    performance: { ms100, ms500, sampleSize: sample.length, measure: one }
  };
  fs.writeFileSync(
    path.join(ROOT, 'tests', '_licensed-catalog-media-runtime-v1-report.json'),
    JSON.stringify(report, null, 2),
    'utf8'
  );
});


test('species-level catalog identities are not collapsed onto legacy generic media canonicals', async()=>{
  const { resolveCanonicalImageSlug } = await import('../modules/catalog-media/active-canonical-image-coverage-v1.js');
  const maps={bootstrapAliases:{},registryAliases:{}};
  assert.equal(resolveCanonicalImageSlug('common-jasmine',maps),'common-jasmine');
  assert.equal(resolveCanonicalImageSlug('spearmint',maps),'spearmint');
  assert.equal(resolveCanonicalImageSlug('lesser-bougainvillea',maps),'lesser-bougainvillea');
  assert.equal(resolveCanonicalImageSlug('english-lavender',maps),'lavender');
  assert.equal(resolveCanonicalImageSlug('bigleaf-hydrangea',maps),'hydrangea');
});


test('coverage generator promotes resolved registry species only with exact licensed cache media', async()=>{
  const { buildActiveCanonicalImageCoverage } = await import('../modules/catalog-media/active-canonical-image-coverage-v1.js');
  const out=buildActiveCanonicalImageCoverage(process.cwd());
  for(const slug of ['common-jasmine','spearmint','lesser-bougainvillea']){
    const row=out.records.find(r=>r.slug===slug);
    assert.ok(row, slug+' must be active');
    assert.equal(row.identityScope,'species',slug);
    assert.equal(row.imageStatus,'IMAGE_READY',slug);
    assert.equal(row.approved,true,slug);
    assert.equal(row.inRegistryCache,true,slug);
  }
});
