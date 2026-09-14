/**
 * Catalog Images V1 — coverage + identity/license/runtime proofs.
 * paid AI = 0. No network search during display resolve.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildActiveCanonicalImageCoverage,
  SPECIES_ALIAS_ONTO_CANONICAL,
  WAVE1_NEW_SEED_SLUGS,
  HIGH_VISIBILITY_GAPS,
  IMAGE_BLOCKED
} from '../modules/catalog-media/active-canonical-image-coverage-v1.js';
import {
  resolvePlantDisplayMedia,
  isApprovedCatalogMediaRecord,
  withCanonicalCatalogMedia,
  mayPromoteUserMediaToCatalogImage,
  catalogMediaCompatibleWithPlantIdentity,
  isBroadPlantIdentity,
  IMAGE_READY
} from '../modules/catalog-media/licensed-catalog-media-runtime-v1.js';
import { evaluateLicenseForCommercialCatalog } from '../modules/catalog-media/licensed-image-pipeline-v1-contract.js';
import { mayPromoteUserMediaToCatalogImage as gardenMayPromote } from '../modules/personal-domain/garden-media-v1-contract.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import { FIXTURE_PROVIDER_CALLS } from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const APP = path.join(ROOT, 'app.html');
const MANIFEST = path.join(ROOT, 'data', 'catalog-media', 'active-canonical-image-manifest-v1.json');

function loadSeedDoc() {
  return JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
}

test('paid AI = 0', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
});

test('every active canonical identity appears exactly once; aliases are not separate authorities', () => {
  const coverage = buildActiveCanonicalImageCoverage(ROOT);
  const slugs = coverage.records.map((r) => r.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(coverage.activeCanonicalCount, slugs.length);
  assert.ok(coverage.activeCanonicalCount > 40);

  for (const [alias, canon] of Object.entries(SPECIES_ALIAS_ONTO_CANONICAL)) {
    assert.equal(slugs.includes(alias), false, `alias ${alias} must not have separate image authority`);
    assert.ok(slugs.includes(canon), `canonical ${canon} must be in coverage`);
  }
  for (const obs of coverage.aliasesObserved) {
    assert.notEqual(obs.aliasSlug, obs.canonicalSlug);
    assert.ok(slugs.includes(obs.canonicalSlug));
    assert.equal(slugs.includes(obs.aliasSlug), false);
  }
});

test('coverage is IMAGE_READY or IMAGE_BLOCKED for every active canonical', () => {
  const coverage = buildActiveCanonicalImageCoverage(ROOT);
  const leftover = coverage.records.filter(
    (r) => r.imageStatus !== IMAGE_READY && r.imageStatus !== IMAGE_BLOCKED
  );
  assert.deepEqual(
    leftover.map((r) => ({ slug: r.slug, status: r.imageStatus, reason: r.reason })),
    [],
    'unresolved identities remain'
  );
  for (const r of coverage.records) {
    if (r.imageStatus === IMAGE_READY) {
      assert.equal(r.approved, true, r.slug);
    } else {
      assert.equal(r.imageStatus, IMAGE_BLOCKED, r.slug);
      assert.ok(r.reason, `${r.slug} blocked without reason`);
    }
  }
});

test('IMAGE_READY license metadata is complete and commercially reusable', () => {
  const seed = loadSeedDoc();
  const index = seed.catalogMediaByCanonicalSlug || {};
  const coverage = buildActiveCanonicalImageCoverage(ROOT);
  for (const r of coverage.records.filter((x) => x.imageStatus === IMAGE_READY)) {
    const media = (seed.plants || []).find((p) => p.slug === r.slug)?.media || index[r.slug];
    const plant = { slug: r.slug, scientific: r.scientific, name: r.name, media, catalogMedia: media };
    const approved = isApprovedCatalogMediaRecord(media, plant);
    assert.equal(approved.ok, true, `${r.slug}: ${approved.reason}`);
    assert.equal(media.commercialUseAllowed, true, r.slug);
    assert.ok(media.sourceProvider, r.slug);
    assert.ok(media.sourceAssetId, r.slug);
    assert.ok(media.sourcePageUrl, r.slug);
    assert.ok(media.license, r.slug);
    assert.ok(media.verifiedAt, r.slug);
    assert.ok(media.canonicalPlantIdentity || r.slug);
    assert.equal(evaluateLicenseForCommercialCatalog(media.license).ok, true, r.slug);
    const licenseEval = evaluateLicenseForCommercialCatalog(media.license);
    if (licenseEval.attributionRequired) {
      assert.ok(media.attribution || media.author, `${r.slug} missing attribution`);
    }
  }
});

test('no image attached to the wrong canonical; broad taxa stay broad', () => {
  const seed = loadSeedDoc();
  const index = seed.catalogMediaByCanonicalSlug || {};
  const coverage = buildActiveCanonicalImageCoverage(ROOT);
  for (const r of coverage.records.filter((x) => x.imageStatus === IMAGE_READY)) {
    const media = (seed.plants || []).find((p) => p.slug === r.slug)?.media || index[r.slug];
    if (media.canonicalPlantIdentity) {
      assert.equal(media.canonicalPlantIdentity, r.slug, r.slug);
    }
    const plant = { slug: r.slug, scientific: r.scientific, identityScope: r.identityScope };
    if (r.identityScope === 'broad') {
      assert.equal(isBroadPlantIdentity(plant), true, r.slug);
      assert.notEqual(media.cultivarSpecific, true, r.slug);
      assert.equal(catalogMediaCompatibleWithPlantIdentity(plant, media), true, r.slug);
      const method = String(media.identityMatchMethod || '').toLowerCase();
      assert.equal(method.includes('cultivar'), false, r.slug);
    }
  }
});

test('IMAGE_BLOCKED remains honest placeholder; user media never becomes catalog', () => {
  assert.equal(mayPromoteUserMediaToCatalogImage(), false);
  assert.equal(gardenMayPromote(), false);
  const blocked = resolvePlantDisplayMedia({
    slug: 'succulent',
    name: 'Succulent',
    scientific: 'Various succulent species',
    media: { imageStatus: IMAGE_BLOCKED, blockedReason: 'identity-ambiguous' }
  });
  assert.equal(blocked.kind, 'placeholder');
  assert.equal(blocked.imageStatus, IMAGE_BLOCKED);
});

test('no network image sourcing during normal render', () => {
  const coverage = buildActiveCanonicalImageCoverage(ROOT);
  const seed = loadSeedDoc();
  const index = seed.catalogMediaByCanonicalSlug || {};
  let network = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = async () => {
    network += 1;
    throw new Error('network_forbidden');
  };
  try {
    for (const r of coverage.records) {
      const media = (seed.plants || []).find((p) => p.slug === r.slug)?.media || index[r.slug];
      resolvePlantDisplayMedia({
        slug: r.slug,
        name: r.name,
        scientific: r.scientific,
        catalogMedia: media,
        media
      });
    }
  } finally {
    globalThis.fetch = orig;
  }
  assert.equal(network, 0);
});

test('My Garden automatically resolves catalog image via canonical overlay', () => {
  const seed = loadSeedDoc();
  const index = seed.catalogMediaByCanonicalSlug || {};
  const mangoMedia = (seed.plants || []).find((p) => p.slug === 'mango')?.media || index.mango;
  const gardenInstance = { name: 'Mango Tree', scientific: 'Mangifera indica', profileSlug: 'mango', slug: 'mango' };
  const attached = withCanonicalCatalogMedia(gardenInstance, { mango: mangoMedia });
  const d = resolvePlantDisplayMedia(attached);
  if (mangoMedia?.imageStatus === IMAGE_READY) {
    assert.equal(d.kind, 'catalog');
    assert.match(d.url, /^https:\/\//);
  } else {
    assert.equal(d.kind, 'placeholder');
  }
});

test('Mango / Pineapple / Banana and Wave 1 resolve safely', () => {
  const coverage = buildActiveCanonicalImageCoverage(ROOT);
  const bySlug = Object.fromEntries(coverage.records.map((r) => [r.slug, r]));
  for (const slug of [...HIGH_VISIBILITY_GAPS, ...WAVE1_NEW_SEED_SLUGS]) {
    const row = bySlug[slug];
    assert.ok(row, `missing active identity ${slug}`);
    assert.ok(
      row.imageStatus === IMAGE_READY || row.imageStatus === IMAGE_BLOCKED,
      `${slug} status ${row.imageStatus}`
    );
    if (slug === 'banana') {
      assert.equal(row.identityScope, 'broad');
      if (row.imageStatus === IMAGE_READY) {
        const seed = loadSeedDoc();
        const media = (seed.plants || []).find((p) => p.slug === 'banana')?.media || seed.catalogMediaByCanonicalSlug?.banana;
        assert.equal(catalogMediaCompatibleWithPlantIdentity({ scientific: 'Musa spp.', identityScope: 'broad' }, media), true);
      }
    }
  }
});

test('broken catalog image falls back safely; app overlay wiring present', () => {
  const broken = resolvePlantDisplayMedia({
    name: 'Broken',
    media: {
      imageStatus: IMAGE_READY,
      primaryUrl: '',
      commercialUseAllowed: true,
      license: 'CC BY 4.0',
      sourceProvider: 'wikimedia-commons',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:x.jpg'
    }
  });
  assert.equal(broken.kind, 'placeholder');
  const app = fs.readFileSync(APP, 'utf8');
  assert.match(app, /catalogMediaByCanonicalSlug/);
  assert.match(app, /resolveBootstrapPlantSlug/);
  assert.doesNotMatch(app, /Plant Identifier integration started/);
  assert.ok(fs.existsSync(MANIFEST));
});

test('coverage manifest matches unique active set', () => {
  const coverage = buildActiveCanonicalImageCoverage(ROOT);
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.paidAiCalls, 0);
  assert.equal(manifest.activeCanonicalCount, coverage.activeCanonicalCount);
  const manifestSlugs = (manifest.identities || []).map((x) => x.slug);
  assert.equal(new Set(manifestSlugs).size, manifestSlugs.length);
  assert.deepEqual([...manifestSlugs].sort(), coverage.records.map((r) => r.slug).sort());
});
