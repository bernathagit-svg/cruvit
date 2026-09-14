/**
 * Owned plant default image correction — zero paid AI.
 * Catalog identity is default; user upload is optional observational media only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolvePlantDisplayMedia,
  resolveOwnedPlantDisplayUrl,
  isApprovedCatalogMediaRecord,
  isBroadPlantIdentity,
  catalogMediaCompatibleWithPlantIdentity,
  catalogMediaPlaceholderDataUrl,
  mayPromoteUserMediaToCatalogImage,
  IMAGE_READY
} from '../modules/catalog-media/licensed-catalog-media-runtime-v1.js';
import { mayPromoteUserMediaToCatalogImage as gardenMayPromote } from '../modules/personal-domain/garden-media-v1-contract.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import { FIXTURE_PROVIDER_CALLS } from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const APP = path.join(ROOT, 'app.html');

function loadSeedPlants() {
  const raw = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  return (raw.plants || []).map((p) => ({
    slug: p.slug,
    name: p.names?.en || p.slug,
    scientific: p.scientific,
    catalogMedia: p.media,
    media: p.media,
    profileSlug: p.slug
  }));
}

test('K: paid AI = 0', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
  assert.equal(mayPromoteUserMediaToCatalogImage(), false);
  assert.equal(gardenMayPromote(), false);
});

test('A: owned plant with IMAGE_READY catalog resolves automatically (e.g. turmeric / cacao)', () => {
  const plants = loadSeedPlants();
  const turmeric = plants.find((p) => p.slug === 'turmeric');
  assert.ok(turmeric);
  assert.equal(isApprovedCatalogMediaRecord(turmeric.media, turmeric).ok, true);
  const d = resolvePlantDisplayMedia({
    name: 'Turmeric',
    scientific: 'Curcuma longa',
    profileSlug: 'turmeric',
    catalogMedia: turmeric.media,
    media: turmeric.media
  });
  assert.equal(d.kind, 'catalog');
  assert.equal(d.imageStatus, IMAGE_READY);
  assert.match(d.url, /^https:\/\//);
  assert.equal(d.authority, 'catalog_plants.media');
});

test('B: pineapple resolves catalog IMAGE_READY automatically, or honest placeholder if blocked', () => {
  const plants = loadSeedPlants();
  const pineapple = plants.find((p) => p.slug === 'pineapple');
  assert.ok(pineapple);
  const d = resolvePlantDisplayMedia({
    name: 'Pineapple',
    scientific: 'Ananas comosus',
    profileSlug: 'pineapple',
    catalogMedia: pineapple.media,
    media: pineapple.media
  });
  if (pineapple.media?.imageStatus === IMAGE_READY) {
    assert.equal(d.kind, 'catalog');
    assert.match(d.url, /^https:\/\//);
  } else {
    assert.equal(d.kind, 'placeholder');
    const url = resolveOwnedPlantDisplayUrl({
      name: 'Pineapple',
      scientific: 'Ananas comosus',
      catalogMedia: pineapple.media
    });
    assert.match(url, /^data:image\/svg\+xml/);
  }
});

test('C: broad Banana (Musa spp.) rejects falsely specific cultivar imagery', () => {
  const banana = {
    name: 'Banana',
    scientific: 'Musa spp.',
    identityScope: 'broad',
    profileSlug: 'banana'
  };
  assert.equal(isBroadPlantIdentity(banana), true);
  const cavendishMedia = {
    imageStatus: IMAGE_READY,
    primaryUrl: 'https://upload.wikimedia.org/wikipedia/commons/fake_cavendish.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/fake_cavendish.jpg',
    sourceProvider: 'wikimedia-commons',
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:fake_cavendish.jpg',
    author: 'X',
    license: 'CC BY 4.0',
    commercialUseAllowed: true,
    attributionRequired: true,
    attribution: 'X',
    identityConfidence: 'high',
    identityMatchMethod: 'cultivar',
    cultivarSpecific: true,
    searchQuery: 'Musa acuminata Cavendish banana'
  };
  assert.equal(catalogMediaCompatibleWithPlantIdentity(banana, cavendishMedia), false);
  assert.equal(isApprovedCatalogMediaRecord(cavendishMedia, banana).ok, false);
  const d = resolvePlantDisplayMedia({ ...banana, catalogMedia: cavendishMedia, media: cavendishMedia });
  assert.equal(d.kind, 'placeholder');
});

test('D: no user media still renders normally (placeholder or catalog)', () => {
  const mango = {
    name: 'Mango Tree',
    scientific: 'Mangifera indica',
    profileSlug: 'mango'
    // no media, no cover
  };
  const d = resolvePlantDisplayMedia(mango);
  assert.equal(d.kind, 'placeholder');
  const url = resolveOwnedPlantDisplayUrl(mango);
  assert.match(url, /^data:image\/svg\+xml/);
  assert.match(url, /Mango/);
});

test('E: optional cover_media_id overrides catalog only when explicitly present', () => {
  const plants = loadSeedPlants();
  const cacao = plants.find((p) => p.slug === 'cacao');
  const owned = {
    name: cacao.name,
    scientific: cacao.scientific,
    catalogMedia: cacao.media,
    media: cacao.media,
    coverMediaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    coverSignedUrl: 'https://signed.example/user-cover.webp'
  };
  const d = resolvePlantDisplayMedia(owned);
  assert.equal(d.kind, 'user_cover');
  assert.equal(d.url, owned.coverSignedUrl);
  // Without signed URL yet, do not invent user photo from local fields
  const pendingCover = {
    ...owned,
    coverSignedUrl: '',
    photoUrl: 'https://example.com/local-only.jpg'
  };
  const d2 = resolvePlantDisplayMedia(pendingCover);
  assert.equal(d2.kind, 'catalog');
});

test('F: broken/missing catalog image falls back safely', () => {
  const broken = {
    name: 'Broken',
    scientific: 'Ficus broken',
    media: {
      imageStatus: IMAGE_READY,
      primaryUrl: '',
      commercialUseAllowed: true,
      license: 'CC BY 4.0',
      sourceProvider: 'wikimedia-commons',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:x.jpg'
    }
  };
  assert.equal(resolvePlantDisplayMedia(broken).kind, 'placeholder');
  assert.match(catalogMediaPlaceholderDataUrl('Broken'), /^data:image\/svg\+xml/);
});

test('G: no network sourcing loop on render', () => {
  const plants = loadSeedPlants().slice(0, 30);
  let network = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    network += 1;
    throw new Error('network_forbidden_in_display_resolve');
  };
  try {
    for (let i = 0; i < 50; i++) {
      for (const p of plants) resolvePlantDisplayMedia(p);
    }
  } finally {
    globalThis.fetch = origFetch;
  }
  assert.equal(network, 0);
});

test('H: user media never becomes catalog media', () => {
  assert.equal(mayPromoteUserMediaToCatalogImage(), false);
  assert.equal(gardenMayPromote(), false);
});

test('I: no schema / Add-photo primary UX in app menu', () => {
  const app = fs.readFileSync(APP, 'utf8');
  assert.doesNotMatch(app, /Replace photo/);
  assert.doesNotMatch(app, /renderPlantMediaSectionHtml/);
  assert.match(app, /resolvePlantDisplayMedia/);
  assert.match(app, /catalogMediaPlaceholderDataUrl|resolveOwnedPlantDisplayUrl/);
  // garden_media infrastructure still present
  assert.match(app, /garden-media-v1-ui/);
});
