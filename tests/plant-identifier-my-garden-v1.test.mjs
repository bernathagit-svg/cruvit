/**
 * Plant Identifier → My Garden V1.
 * Zero paid AI. Fixtures only. Does not call Anthropic / plant-identify.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AMBIGUOUS,
  IDENTIFIER_GARDEN_SOURCE,
  IDENTIFIER_SCAN_PERSISTENCE,
  IDENTIFIER_SPECIES_ALIAS_ONTO_CANONICAL,
  MATCHED_CANONICAL,
  NO_SAFE_CANONICAL_MATCH,
  attachObservationalScanToOwnedPlant,
  classifyIdentifierCatalogMatch,
  confirmIdentifierGardenAcquire,
  createIdentifierAcquireIdempotency,
  identifierScanIsCatalogMedia,
  resolveIdentifierCanonicalSlug
} from '../modules/plant-identifier/plant-identifier-garden-acquire-v1.js';
import {
  buildActiveCanonicalImageCoverage,
  SPECIES_ALIAS_ONTO_CANONICAL
} from '../modules/catalog-media/active-canonical-image-coverage-v1.js';
import {
  IMAGE_READY,
  mayPromoteUserMediaToCatalogImage,
  resolvePlantDisplayMedia,
  withCanonicalCatalogMedia
} from '../modules/catalog-media/licensed-catalog-media-runtime-v1.js';
import {
  GARDEN_EVENT_TYPES,
  GARDEN_SOURCE_MODULES,
  buildPlantAddedMemoryInput
} from '../modules/personal-domain/garden-memory-writer-v1.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import { isPaidPlantIdentifierAllowed } from '../modules/runtime-guards/paid-plant-identifier-gate-v1.js';
import { FIXTURE_PROVIDER_CALLS } from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'app.html');
const PI = path.join(ROOT, 'modules', 'plant-identifier', 'plant-identifier.js');
const ACQUIRE = path.join(ROOT, 'modules', 'plant-identifier', 'plant-identifier-garden-acquire-v1.js');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');

const BOOTSTRAP_ALIASES = {
  'apple-tree': 'apple',
  'pear-tree': 'pear',
  'peach-tree': 'peach',
  'plum-tree': 'plum',
  'fig-tree': 'fig',
  'grape-vine': 'grapevine',
  'passion-fruit': 'passionfruit'
};

let paidNetwork = 0;
const origFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url || '');
  if (/anthropic|api\.openai|plant-identify|claude/i.test(u)) paidNetwork += 1;
  throw new Error('network forbidden in plant-identifier-my-garden-v1 tests: ' + u);
};

function loadSeed() {
  return JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
}

function catalogFromCoverage() {
  const coverage = buildActiveCanonicalImageCoverage(ROOT);
  const seed = loadSeed();
  const seedBySlug = new Map((seed.plants || []).map((p) => [p.slug, p]));
  const aliasMaps = { ...BOOTSTRAP_ALIASES, ...SPECIES_ALIAS_ONTO_CANONICAL };
  return {
    coverage,
    aliasMaps,
    catalog: coverage.records.map((r) => {
      const seedP = seedBySlug.get(r.slug) || {};
      return {
        slug: r.slug,
        name: r.name,
        scientific: r.scientific || seedP.scientific || '',
        aliases: seedP.aliases || [],
        he: seedP.names?.he || '',
        media: seedP.media || seed.catalogMediaByCanonicalSlug?.[r.slug] || null
      };
    })
  };
}

function simulateGardenWrite(garden, plan, catalog, scanDataUrl) {
  if (!plan.ok || plan.duplicate || !plan.persist) {
    return { wrote: false, garden };
  }
  const ref = catalog.find((p) => p.slug === plan.write.canonicalSlug);
  assert.ok(ref, 'write slug must exist in catalog');
  const plant = attachObservationalScanToOwnedPlant(
    {
      id: 'plant_' + (garden.plants.length + 1),
      name: ref.name,
      scientific: ref.scientific,
      profileSlug: ref.slug,
      slug: ref.slug,
      source: plan.write.source,
      catalogMedia: ref.media || null,
      media: ref.media || null
    },
    scanDataUrl
  );
  garden.plants.push(plant);
  if (plan.commitToken && garden.idempotency) garden.idempotency.mark(plan.commitToken);
  return { wrote: true, plant, garden };
}

test('M: paid AI automated test calls = 0', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(isPaidPlantIdentifierAllowed({}), false);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
  assert.equal(paidNetwork, 0);
  assert.equal(IDENTIFIER_SCAN_PERSISTENCE, 'DEFERRED');
});

test('species alias table stays aligned with Catalog Images (not a second registry)', () => {
  assert.deepEqual({ ...IDENTIFIER_SPECIES_ALIAS_ONTO_CANONICAL }, { ...SPECIES_ALIAS_ONTO_CANONICAL });
});

test('A: known catalog identity + confirmation writes owned plant once', () => {
  const { catalog, aliasMaps } = catalogFromCoverage();
  const result = {
    common_name: 'Tomato',
    scientific_name: 'Solanum lycopersicum',
    confidence: 'high',
    _img: 'data:image/jpeg;base64,SCANTOMATO'
  };
  const classified = classifyIdentifierCatalogMatch(result, catalog, { aliasMaps });
  assert.equal(classified.status, MATCHED_CANONICAL);
  assert.equal(classified.canonicalSlug, 'tomato');

  const denied = confirmIdentifierGardenAcquire({
    classified,
    catalog,
    aliasMaps,
    result,
    userConfirmed: false
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'confirmation-required');

  const idempotency = createIdentifierAcquireIdempotency();
  const plan = confirmIdentifierGardenAcquire({
    classified,
    catalog,
    aliasMaps,
    result,
    userConfirmed: true,
    idempotency
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.persist, true);
  assert.equal(plan.write.canonicalSlug, 'tomato');
  assert.equal(plan.write.source, IDENTIFIER_GARDEN_SOURCE);
  assert.equal(plan.write.promoteScanToCatalog, false);
  assert.equal(plan.write.persistScanToGardenMedia, false);

  const garden = { plants: [], idempotency };
  const first = simulateGardenWrite(garden, plan, catalog, result._img);
  assert.equal(first.wrote, true);
  assert.equal(first.plant.profileSlug, 'tomato');
  assert.equal(garden.plants.length, 1);
});

test('B: canonical alias resolves once (english-lavender / apple-tree)', () => {
  const { catalog, aliasMaps } = catalogFromCoverage();
  const lavender = classifyIdentifierCatalogMatch(
    { common_name: 'English lavender', scientific_name: 'Lavandula angustifolia' },
    catalog,
    { aliasMaps }
  );
  assert.equal(lavender.status, MATCHED_CANONICAL);
  assert.equal(lavender.canonicalSlug, 'lavender');
  assert.equal(resolveIdentifierCanonicalSlug('english-lavender', aliasMaps), 'lavender');

  const apple = classifyIdentifierCatalogMatch(
    { common_name: 'Apple tree', scientific_name: 'Malus domestica' },
    catalog,
    { aliasMaps }
  );
  assert.equal(apple.status, MATCHED_CANONICAL);
  assert.equal(apple.canonicalSlug, 'apple');
  assert.equal(resolveIdentifierCanonicalSlug('apple-tree', aliasMaps), 'apple');
});

test('C: user confirmation required before persistence', () => {
  const { catalog, aliasMaps } = catalogFromCoverage();
  const classified = classifyIdentifierCatalogMatch(
    { common_name: 'Tomato', scientific_name: 'Solanum lycopersicum' },
    catalog,
    { aliasMaps }
  );
  assert.equal(classified.status, MATCHED_CANONICAL);
  const plan = confirmIdentifierGardenAcquire({
    classified,
    catalog,
    aliasMaps,
    userConfirmed: false
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.persist, undefined);
  assert.equal(plan.reason, 'confirmation-required');
  const pi = fs.readFileSync(PI, 'utf8');
  assert.match(pi, /_userConfirmed:\s*true/);
  assert.match(pi, /confirmAdd/);
  assert.doesNotMatch(pi, /data\.plants\.push\(plant\)/);
});

test('D: uncertain result cannot silently create plant', () => {
  const { catalog, aliasMaps } = catalogFromCoverage();
  const classified = classifyIdentifierCatalogMatch(
    { common_name: 'Unknown leafy thing', scientific_name: '', confidence: 'low', alternatives: [] },
    catalog,
    { aliasMaps }
  );
  assert.equal(classified.status, NO_SAFE_CANONICAL_MATCH);
  const plan = confirmIdentifierGardenAcquire({
    classified,
    catalog,
    aliasMaps,
    userConfirmed: true
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'no-safe-canonical-match');
});

test('E: outside-catalog result does not fabricate identity', () => {
  const { catalog, aliasMaps } = catalogFromCoverage();
  const classified = classifyIdentifierCatalogMatch(
    { common_name: 'Wollemi pine', scientific_name: 'Wollemia nobilis', confidence: 'high' },
    catalog,
    { aliasMaps }
  );
  assert.equal(classified.status, NO_SAFE_CANONICAL_MATCH);
  const plan = confirmIdentifierGardenAcquire({
    classified,
    catalog,
    aliasMaps,
    userConfirmed: true,
    chosenSlug: 'wollemi-pine'
  });
  assert.equal(plan.ok, false);
  const garden = { plants: [] };
  assert.equal(simulateGardenWrite(garden, plan, catalog, '').wrote, false);
  assert.equal(garden.plants.length, 0);
});

test('F: banana remains broad if recognition cannot prove more', () => {
  const { catalog, aliasMaps } = catalogFromCoverage();
  const classified = classifyIdentifierCatalogMatch(
    { common_name: 'Banana', scientific_name: 'Musa acuminata Cavendish', confidence: 'medium' },
    catalog,
    { aliasMaps }
  );
  assert.equal(classified.status, MATCHED_CANONICAL);
  assert.equal(classified.canonicalSlug, 'banana');
  const banana = catalog.find((p) => p.slug === 'banana');
  assert.match(String(banana.scientific), /Musa spp/i);
  assert.equal(classified.catalogBroad, true);

  const rose = classifyIdentifierCatalogMatch(
    { common_name: 'Garden rose', scientific_name: 'Rosa rugosa' },
    catalog,
    { aliasMaps }
  );
  assert.equal(rose.status, MATCHED_CANONICAL);
  assert.equal(rose.canonicalSlug, 'rose');
});

test('G: owned plant displays catalog image after add — not the scan photo', () => {
  const { catalog, aliasMaps } = catalogFromCoverage();
  const seed = loadSeed();
  const bananaMedia =
    (seed.plants || []).find((p) => p.slug === 'banana')?.media || seed.catalogMediaByCanonicalSlug?.banana;
  const result = {
    common_name: 'Banana',
    scientific_name: 'Musa spp.',
    confidence: 'high',
    _img: 'data:image/jpeg;base64,USERSCANBANANA'
  };
  const classified = classifyIdentifierCatalogMatch(result, catalog, { aliasMaps });
  const plan = confirmIdentifierGardenAcquire({ classified, catalog, aliasMaps, result, userConfirmed: true });
  const garden = { plants: [], idempotency: createIdentifierAcquireIdempotency() };
  const { plant } = simulateGardenWrite(garden, plan, catalog, result._img);
  const attached = withCanonicalCatalogMedia(plant, { banana: bananaMedia });
  const display = resolvePlantDisplayMedia(attached);
  if (bananaMedia?.imageStatus === IMAGE_READY) {
    assert.equal(display.kind, 'catalog');
    assert.match(display.url, /^https:\/\//);
    assert.notEqual(display.url, result._img);
  } else {
    assert.equal(display.kind, 'placeholder');
  }
  assert.equal(plant.scanPhotoUrl, result._img);
});

test('H: user scan image is not catalog media and cannot be promoted', () => {
  assert.equal(mayPromoteUserMediaToCatalogImage(), false);
  const plant = {
    profileSlug: 'tomato',
    scanPhotoUrl: 'data:image/jpeg;base64,SCAN',
    catalogMedia: {
      imageStatus: IMAGE_READY,
      primaryUrl: 'https://commons.wikimedia.org/example.jpg',
      commercialUseAllowed: true
    }
  };
  assert.equal(identifierScanIsCatalogMedia(plant), false);
});

test('I: duplicate callback does not double-write', () => {
  const { catalog, aliasMaps } = catalogFromCoverage();
  const result = { common_name: 'Tomato', scientific_name: 'Solanum lycopersicum', _img: 'data:image/jpeg;base64,DUP' };
  const classified = classifyIdentifierCatalogMatch(result, catalog, { aliasMaps });
  const idempotency = createIdentifierAcquireIdempotency();
  const garden = { plants: [], idempotency };
  const first = confirmIdentifierGardenAcquire({
    classified,
    catalog,
    aliasMaps,
    result,
    userConfirmed: true,
    commitToken: 'pi_tomato_dup',
    idempotency
  });
  simulateGardenWrite(garden, first, catalog, result._img);
  const second = confirmIdentifierGardenAcquire({
    classified,
    catalog,
    aliasMaps,
    result,
    userConfirmed: true,
    commitToken: 'pi_tomato_dup',
    idempotency
  });
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(second.persist, false);
  simulateGardenWrite(garden, second, catalog, result._img);
  assert.equal(garden.plants.length, 1);
});

test('J: cross-user / cross-Garden write denied', () => {
  const { catalog, aliasMaps } = catalogFromCoverage();
  const classified = classifyIdentifierCatalogMatch(
    { common_name: 'Tomato', scientific_name: 'Solanum lycopersicum' },
    catalog,
    { aliasMaps }
  );
  const crossUser = confirmIdentifierGardenAcquire({
    classified,
    catalog,
    aliasMaps,
    userConfirmed: true,
    actorUserId: 'user-a',
    gardenOwnerUserId: 'user-b',
    activeGardenId: 'g1',
    targetGardenId: 'g1'
  });
  assert.equal(crossUser.ok, false);
  assert.equal(crossUser.reason, 'cross-user-denied');

  const wrongGarden = confirmIdentifierGardenAcquire({
    classified,
    catalog,
    aliasMaps,
    userConfirmed: true,
    actorUserId: 'user-a',
    gardenOwnerUserId: 'user-a',
    activeGardenId: 'garden-active',
    targetGardenId: 'garden-other'
  });
  assert.equal(wrongGarden.ok, false);
  assert.equal(wrongGarden.reason, 'wrong-active-garden');

  const auth = confirmIdentifierGardenAcquire({
    classified,
    catalog,
    aliasMaps,
    userConfirmed: true,
    serverAuthoritative: true,
    sessionPresent: false
  });
  assert.equal(auth.ok, false);
  assert.equal(auth.reason, 'auth-expiry');
});

test('K: existing Garden Memory Writer remains authoritative', () => {
  const event = buildPlantAddedMemoryInput(
    {
      id: 'srv-1',
      garden_profile_id: 'g1',
      client_instance_id: 'plant_1',
      name: 'Tomato',
      scientific: 'Solanum lycopersicum',
      profile_slug: 'tomato',
      source: IDENTIFIER_GARDEN_SOURCE
    },
    { sourceModule: GARDEN_SOURCE_MODULES.PLANT_IDENTIFIER }
  );
  assert.equal(event.eventType, GARDEN_EVENT_TYPES.PLANT_ADDED);
  assert.equal(event.sourceModule, GARDEN_SOURCE_MODULES.PLANT_IDENTIFIER);

  const app = fs.readFileSync(APP, 'utf8');
  assert.match(app, /emitPlantAddedMemory/);
  assert.match(app, /sourceModule:plant\.source==='Scan & Identify'\?'plant_identifier'/);
  const acquire = fs.readFileSync(ACQUIRE, 'utf8');
  assert.doesNotMatch(acquire, /writeGardenMemoryEvent/);
  assert.doesNotMatch(acquire, /emitPlantAddedMemory/);
});

test('L: Catalog Images behavior remains green (coverage still unique + IMAGE_READY/BLOCKED)', () => {
  const { coverage } = catalogFromCoverage();
  const slugs = coverage.records.map((r) => r.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  const leftover = coverage.records.filter(
    (r) => r.imageStatus !== IMAGE_READY && r.imageStatus !== 'IMAGE_BLOCKED'
  );
  assert.deepEqual(leftover.map((r) => r.slug), []);
});

test('ambiguous alternatives require explicit choice; Identifier does not create parallel catalog', () => {
  const { catalog, aliasMaps, coverage } = catalogFromCoverage();
  const before = coverage.activeCanonicalCount;
  const classified = classifyIdentifierCatalogMatch(
    {
      common_name: 'Mystery plant',
      scientific_name: '',
      alternatives: ['Tomato', 'Basil']
    },
    catalog,
    { aliasMaps }
  );
  assert.equal(classified.status, AMBIGUOUS);
  const noChoice = confirmIdentifierGardenAcquire({
    classified,
    catalog,
    aliasMaps,
    userConfirmed: true
  });
  assert.equal(noChoice.ok, false);
  assert.equal(noChoice.reason, 'ambiguous-choice-required');
  const chosen = confirmIdentifierGardenAcquire({
    classified,
    catalog,
    aliasMaps,
    userConfirmed: true,
    chosenSlug: 'tomato'
  });
  assert.equal(chosen.ok, true);
  assert.equal(chosen.write.canonicalSlug, 'tomato');
  assert.equal(buildActiveCanonicalImageCoverage(ROOT).activeCanonicalCount, before);
});

test('commit path reuses savePlantFromLibrary; no fabricated library row; no Smart Rec / Design start', () => {
  const app = fs.readFileSync(APP, 'utf8');
  const commit = app.match(
    /async function commitIdentifiedPlantFromModule[\s\S]*?\nfunction plantIdentifierDeps/
  );
  assert.ok(commit, 'commitIdentifiedPlantFromModule missing');
  assert.match(commit[0], /savePlantFromLibrary\(plan\.write\.canonicalSlug/);
  assert.match(commit[0], /userConfirmed:result\._userConfirmed===true/);
  assert.doesNotMatch(commit[0], /storePlantProfile/);
  assert.doesNotMatch(commit[0], /buildScanProfileFromIdentifyResult/);
  assert.match(app, /plant-identifier-garden-acquire-v1\.js/);
  assert.match(app, /getActiveCatalogIdentitiesForIdentifier/);
  const acquire = fs.readFileSync(ACQUIRE, 'utf8');
  assert.doesNotMatch(acquire, /Smart Recommendations/);
  assert.doesNotMatch(acquire, /Garden Design/);
  assert.doesNotMatch(app, /Plant Identifier integration started/);
});

test('paid network remains 0 after Identifier My Garden proofs', () => {
  assert.equal(paidNetwork, 0);
  globalThis.fetch = origFetch;
});
