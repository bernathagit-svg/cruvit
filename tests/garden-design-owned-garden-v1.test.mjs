/**
 * Garden Design → Owned Garden V1 + multi-state design assets.
 * Zero paid AI. Fixtures only. Does not call Claude / Stability / OpenAI / Replicate.
 *
 * Run: node --test tests/garden-design-owned-garden-v1.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GARDEN_DESIGN_OWNED_GARDEN_VERSION,
  DESIGN_PLANT_KIND,
  DESIGN_GARDEN_SOURCE,
  DESIGN_OWNED_VISUAL_POLICY,
  GD_BRIDGE_SAME_ORIGIN,
  GD_HOST_TO_DESIGN,
  GD_DESIGN_TO_HOST,
  resolveDesignCanonicalIdentity,
  classifyDesignGardenLocation,
  shouldInventSecondLocation,
  createOwnedDesignPlacement,
  resolveDesignOwnedPlantsFromGardenOs,
  reconcileOwnedLocalPlacementIdentity,
  ownedPlacementMustNotInsertGardenPlant,
  resolveOwnedPlacementAreaId,
  resolveOwnedPlacementVisual,
  designPlacementCountFromLayers,
  ownedInventoryMustNotAutoPlace,
  manualCanvasAddPlantsPolicy,
  hydratedSourcedDesignAddPlantsEntrypoint,
  createProposedDesignPlacement,
  duplicateDesignPlacement,
  ownedPlacementOwnershipCount,
  visualChangeMustNotRewriteIdentity,
  presentDesignSuitability,
  buildDesignCommitToken,
  createDesignCommitIdempotency,
  confirmDesignProposalCommit,
  designMemoryEventForAction,
  designPaidAiForAction,
  assertSourcePhotoImmutable,
  createLocalDesignPersistence,
  acceptGardenDesignMessage,
  isGardenDesignBridgeType,
  buildDesignSuitabilityAccess,
  WESTERN_GALILEE_DEFAULT_LABEL
} from '../modules/garden-design/garden-design-owned-garden-v1.js';
import {
  DESIGN_GROWTH_FORMS,
  CORE_FREEZE_MINIMUM_DESIGN_COVERAGE,
  DESIGN_ASSET_PRODUCTION_PIPELINE,
  classifyDesignGrowthForm,
  requiredDesignVariantRoles,
  assertNoFakeSeasonalVariants,
  cartesianVariantCount,
  isBroadPlantIdentity
} from '../modules/garden-design/garden-design-variant-policy-v1.js';
import {
  indexDesignAssetRegistry,
  resolveDesignAsset,
  auditDesignAssetCoverage,
  assertVariantIdentityConsistency,
  lookupMustNotGenerate,
  DESIGN_ASSET_FALLBACK
} from '../modules/garden-design/garden-design-asset-registry-v1.js';
import {
  lookupGardenDesignAssets,
  mayPromoteUserMediaToDesignAsset,
  assertDesignLookupCannotInvokeGeneration
} from '../modules/catalog-media/garden-design-asset-contract-v1.js';
import {
  GARDEN_EVENT_TYPES,
  GARDEN_SOURCE_MODULES
} from '../modules/personal-domain/garden-os-spine-v1-contract.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import { evaluateHardClimateSurvival } from '../modules/suitability/hard-climate-survival-gate-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'app.html');
const GD = path.join(ROOT, 'modules', 'garden-design', 'index.html');
const OWNED = path.join(ROOT, 'modules', 'garden-design', 'garden-design-owned-garden-v1.js');
const REGISTRY_PATH = path.join(
  ROOT,
  'modules',
  'garden-design',
  'assets',
  'plants',
  'design-asset-registry-v1.json'
);
const MANIFEST_PATH = path.join(
  ROOT,
  'modules',
  'garden-design',
  'assets',
  'plants',
  'manifest.json'
);
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const IDENTITY = path.join(ROOT, 'data', 'plant-identity.registry.json');

let paidNetwork = 0;
const origFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url || '');
  if (/anthropic|api\.openai|replicate|stability|claude|plant-identify/i.test(u)) paidNetwork += 1;
  throw new Error('network forbidden in garden-design-owned-garden-v1 tests: ' + u);
};

const catalog = [
  { slug: 'olive', name: 'Olive Tree', scientific: 'Olea europaea', aliases: ['olive tree'], tags: ['tree', 'mediterranean'], growth: 'Evergreen Mediterranean tree', climateTraits: { fruitingRequirements: 'Edible olives' } },
  { slug: 'lavender', name: 'Lavender', scientific: 'Lavandula angustifolia', aliases: ['english lavender'], tags: ['herb'], growth: 'Evergreen aromatic shrub', climateTraits: { groupIds: ['herb-edible'], floweringRequirements: 'Fragrant purple flower spikes in summer.', fruitingRequirements: 'Grown for flowers and aromatic foliage; culinary/medicinal use.' } },
  { slug: 'lemon', name: 'Lemon Tree', scientific: 'Citrus × limon', tags: ['citrus', 'fruit', 'tree'], growth: 'Evergreen citrus tree', climateTraits: { fruitingRequirements: 'Edible citrus fruit' } },
  { slug: 'mango', name: 'Mango Tree', scientific: 'Mangifera indica', tags: ['tree', 'fruit', 'tropical'], growth: 'Evergreen tropical/subtropical fruit tree', climateTraits: { frostSensitivity: 'high', fruitingRequirements: 'Fruit set depends on variety' } },
  { slug: 'apple', name: 'Apple Tree', scientific: 'Malus domestica', tags: ['tree', 'fruit'], growth: 'Deciduous fruit tree', climateTraits: { groupIds: ['temperate-chill-fruit-tree'], floweringRequirements: 'White to pink flowers in spring', fruitingRequirements: 'Edible pomes' } },
  { slug: 'banana', name: 'Banana', scientific: 'Musa spp.', identityScope: 'genus', tags: ['fruit', 'tropical'], growth: 'Fast herbaceous plant' },
  { slug: 'date-palm', name: 'Date Palm', scientific: 'Phoenix dactylifera', tags: ['palm', 'tree'], growth: 'Large palm' },
  { slug: 'basil', name: 'Basil', scientific: 'Ocimum basilicum', tags: ['herb', 'annual'], growth: 'Annual herb' },
  { slug: 'agapanthus', name: 'Agapanthus', scientific: 'Agapanthus spp.', identityScope: 'genus', tags: ['flowering', 'perennial'], growth: 'Clumping perennial', climateTraits: { floweringRequirements: 'Blue or white summer flowers' } },
  { slug: 'cypress', name: 'Italian Cypress', scientific: 'Cupressus sempervirens', aliases: ['italian cypress'], tags: ['tree'], growth: 'Evergreen conifer' },
  { slug: 'rosemary', name: 'Rosemary', scientific: 'Salvia rosmarinus', tags: ['herb'], growth: 'Hardy aromatic evergreen shrub' },
  { slug: 'bougainvillea', name: 'Bougainvillea', scientific: 'Bougainvillea spp.', identityScope: 'genus', tags: ['climber'], growth: 'Vigorous climber / shrub', climateTraits: { groupIds: ['ornamental-flowering'], floweringRequirements: 'Showy colorful bracts' } }
];

const aliasMaps = {
  'english-lavender': 'lavender',
  'olive-tree': 'olive',
  'italian-cypress': 'cypress',
  manifestKeyToCanonical: {
    'olive-tree': 'olive',
    'italian-cypress': 'cypress'
  }
};

const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
const assetIndex = indexDesignAssetRegistry(registry);

function appSrc() {
  return fs.readFileSync(APP, 'utf8');
}
function gdSrc() {
  return fs.readFileSync(GD, 'utf8');
}

test('paid AI automated gate remains closed', () => {
  assert.equal(isPaidAiAutomatedTestAllowed(), false);
});

test('A: active Garden context is the Design authority — no second location invention', () => {
  const classified = classifyDesignGardenLocation({
    trusted: true,
    confirmationStatus: 'confirmed',
    label: 'Mojstrana, Slovenia',
    lat: 46.42383,
    lon: 13.8752,
    gardenProfileId: 'garden-moj',
    source: 'confirmed',
    climateAuthority: 'coordinate-climate-v2'
  });
  assert.equal(classified.status, 'TRUSTED_CONFIRMED');
  assert.equal(classified.useForSuitability, true);
  assert.equal(shouldInventSecondLocation(classified), false);
  const def = classifyDesignGardenLocation({
    trusted: false,
    source: 'default',
    label: 'Western Galilee, Israel',
    lat: 33.0089,
    lon: 35.0941
  });
  assert.equal(def.treatDefaultAsGardenTruth, false);
  assert.equal(def.useForSuitability, false);
});

test('B/C: owned plant keeps garden_plant_id and canonical slug', () => {
  const owned = createOwnedDesignPlacement({
    gardenProfileId: 'g1',
    gardenPlantId: 'gp_mango_1',
    canonicalSlug: 'mango',
    areaId: 'area_south'
  });
  assert.equal(owned.kind, DESIGN_PLANT_KIND.OWNED);
  assert.equal(owned.gardenPlantId, 'gp_mango_1');
  assert.equal(owned.canonicalSlug, 'mango');
  assert.equal(owned.createsGardenPlant, false);
  assert.notEqual(owned.growthStage, 'mature');
  const ident = resolveDesignCanonicalIdentity({ name: 'Mango Tree', slug: 'mango' }, { catalog, aliasMaps });
  assert.equal(ident.canonicalSlug, 'mango');
  assert.equal(ident.inferredCultivar, false);
});

test('D/E: proposed lavender does not become owned and can carry area', () => {
  const proposed = createProposedDesignPlacement({
    gardenProfileId: 'g1',
    canonicalSlug: 'lavender',
    areaId: 'area_south',
    x: 0.4,
    y: 0.78
  });
  assert.equal(proposed.kind, DESIGN_PLANT_KIND.PROPOSED);
  assert.equal(proposed.gardenPlantId, null);
  assert.equal(proposed.status, 'proposed');
  assert.equal(proposed.createsGardenPlant, false);
  assert.equal(proposed.areaId, 'area_south');
  assert.equal(proposed.source, 'garden-design');
});

test('F/G: suitability is consumed, not recreated; hard-block is not a positive rec', () => {
  const blocked = presentDesignSuitability({
    engine: 'smartRecEvaluateSuitability',
    recommendationLevel: 'blocked',
    hardSurvivalBlocked: true,
    primaryLimiter: 'hard frost',
    gardenProfileId: 'g1'
  });
  assert.equal(blocked.secondEngine, false);
  assert.equal(blocked.engine, 'smartRecEvaluateSuitability');
  assert.equal(blocked.canAddToGarden, true);
  assert.equal(blocked.isPositiveRecommendation, false);
  assert.equal(blocked.presentation, 'not-recommended');
  assert.match(blocked.recommendCopy, /does not recommend/i);
  const good = presentDesignSuitability({
    engine: 'smartRecEvaluateSuitability',
    recommendationLevel: 'good'
  });
  assert.equal(good.isPositiveRecommendation, true);
});

test('H/I: explicit commit uses existing write path; repeat is idempotent', () => {
  const idem = createDesignCommitIdempotency();
  const token = buildDesignCommitToken({ id: 'pl_1' }, 'lavender');
  const first = confirmDesignProposalCommit({
    userConfirmed: true,
    canonicalSlug: 'lavender',
    gardenProfileId: 'g1',
    areaId: 'area_south',
    commitToken: token,
    idempotency: idem
  });
  assert.equal(first.ok, true);
  assert.equal(first.persist, true);
  assert.equal(first.write.source, DESIGN_GARDEN_SOURCE);
  assert.equal(first.write.existingWritePath, 'savePlantFromLibrary');
  assert.equal(first.write.sourceModule, GARDEN_SOURCE_MODULES.GARDEN_DESIGN);
  idem.mark(first.commitToken);
  const second = confirmDesignProposalCommit({
    userConfirmed: true,
    canonicalSlug: 'lavender',
    gardenProfileId: 'g1',
    commitToken: token,
    idempotency: idem
  });
  assert.equal(second.duplicate, true);
  assert.equal(second.persist, false);
  const unconfirmed = confirmDesignProposalCommit({
    userConfirmed: false,
    canonicalSlug: 'lavender',
    gardenProfileId: 'g1'
  });
  assert.equal(unconfirmed.persist, false);
});

test('owned visual duplicate does not duplicate ownership', () => {
  const a = createOwnedDesignPlacement({
    gardenProfileId: 'g1',
    gardenPlantId: 'gp_mango_1',
    canonicalSlug: 'mango'
  });
  const b = duplicateDesignPlacement(a);
  assert.equal(b.gardenPlantId, 'gp_mango_1');
  assert.equal(b.createsGardenPlant, false);
  const count = ownedPlacementOwnershipCount([a, b], 'gp_mango_1');
  assert.equal(count.visualCount, 2);
  assert.equal(count.ownershipRecords, 1);
  assert.equal(count.duplicateOwnership, false);
  assert.match(DESIGN_OWNED_VISUAL_POLICY.chosen, /garden_plant_id/);
});

test('J: source garden photo remains immutable and is not catalog/cover/evidence', () => {
  const ok = assertSourcePhotoImmutable(
    { originalRef: 'data:image/jpeg;base64,AAA' },
    { saveSnapshot: true }
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.sourceImmutable, true);
  assert.equal(ok.typedAs, 'design_output');
  const bad = assertSourcePhotoImmutable({}, { overwriteSource: true });
  assert.equal(bad.ok, false);
  const promo = assertSourcePhotoImmutable({}, { promoteToCatalog: true });
  assert.equal(promo.ok, false);
});

test('K: drag/resize/delete/duplicate remain present in Garden Design runtime', () => {
  const src = gdSrc();
  assert.match(src, /function onPlantLayerPointerDown/);
  assert.match(src, /function setPlantLayerScale/);
  assert.match(src, /function deleteSelectedPlantLayer/);
  assert.match(src, /function incrementPlantLayerQuantity/);
  assert.match(src, /GD_USE_OVERLAY_PLACEMENT = true/);
  assert.match(src, /basePhotoB64/);
  assert.match(src, /This is not an AI-redesigned image/);
});

test('L: opening/dragging/browsing cannot pay for AI; lookup cannot generate', () => {
  for (const action of ['open', 'drag', 'resize', 'browse', 'load-context', 'place-proposed']) {
    const gate = designPaidAiForAction(action);
    assert.equal(gate.paidAiCalls, 0, action);
    assert.equal(gate.allowed, false, action);
  }
  const look = lookupMustNotGenerate('olive', assetIndex);
  assert.equal(look.generated, false);
  assert.equal(look.generationAllowed, false);
  assert.equal(lookupGardenDesignAssets('olive', []).generated, false);
  assert.equal(mayPromoteUserMediaToDesignAsset(), false);
  assert.equal(assertDesignLookupCannotInvokeGeneration().perUserPlacementGeneration, false);
});

test('memory events are lifecycle-only', () => {
  assert.equal(designMemoryEventForAction('drag').emit, false);
  assert.equal(designMemoryEventForAction('resize').emit, false);
  const commit = designMemoryEventForAction('commit-proposal');
  assert.equal(commit.emit, true);
  assert.equal(commit.eventType, GARDEN_EVENT_TYPES.PLANT_ADDED);
  assert.equal(commit.sourceModule, GARDEN_SOURCE_MODULES.GARDEN_DESIGN);
});

test('visual placement changes do not rewrite botanical identity', () => {
  const before = createOwnedDesignPlacement({
    gardenProfileId: 'g1',
    gardenPlantId: 'gp1',
    canonicalSlug: 'mango',
    x: 0.2,
    y: 0.8
  });
  const after = Object.assign({}, before, { x: 0.5, y: 0.7, scale: 1.4 });
  const check = visualChangeMustNotRewriteIdentity(before, after);
  assert.equal(check.canonicalSlugUnchanged, true);
  assert.equal(check.gardenPlantIdUnchanged, true);
});

test('client persistence is keyed by user + garden + optional area; no DB migration in this module', () => {
  const store = {};
  const persist = createLocalDesignPersistence(store);
  const snap = persist.save({
    userId: 'u1',
    gardenProfileId: 'g1',
    areaId: 'a1',
    placements: [{ kind: 'proposed', canonicalSlug: 'lavender' }]
  });
  assert.equal(snap.durableDatabase, false);
  const loaded = persist.load({ userId: 'u1', gardenProfileId: 'g1', areaId: 'a1' });
  assert.equal(loaded.type, 'design_output');
  assert.equal(loaded.placements[0].canonicalSlug, 'lavender');
  assert.equal(persist.load({ userId: 'u2', gardenProfileId: 'g1', areaId: 'a1' }), null);
  const ownedSrc = fs.readFileSync(OWNED, 'utf8');
  assert.doesNotMatch(ownedSrc, /alter table|create table/i);
});

test('alias / manifest key collapse onto canonical identity', () => {
  const olive = resolveDesignCanonicalIdentity({ manifestKey: 'olive-tree' }, { catalog, aliasMaps });
  assert.equal(olive.canonicalSlug, 'olive');
  const lav = resolveDesignCanonicalIdentity({ name: 'English Lavender', slug: 'english-lavender' }, { catalog, aliasMaps });
  assert.equal(lav.canonicalSlug, 'lavender');
  const identity = JSON.parse(fs.readFileSync(IDENTITY, 'utf8'));
  const list = identity.canonicalIdentities || identity.plants || [];
  const oliveEntry = list.find((p) => p.canonicalSlug === 'olive');
  assert.ok(oliveEntry);
  assert.equal(assetIndex.manifestMap['olive-tree'], 'olive');
});

test('variant policy is trait-based, not a 36-image cartesian product', () => {
  assert.equal(cartesianVariantCount(['young', 'intermediate', 'mature'], ['spring', 'summer', 'autumn', 'winter'], ['vegetative', 'flowering', 'fruiting', 'dormant']), 48);
  assert.equal(cartesianVariantCount(['young', 'intermediate', 'mature'], ['spring', 'summer', 'autumn', 'winter'], ['vegetative', 'flowering', 'fruiting']), 36);
  const apple = catalog.find((p) => p.slug === 'apple');
  const applePlan = requiredDesignVariantRoles(apple);
  assert.equal(applePlan.form, DESIGN_GROWTH_FORMS.DECIDUOUS_TREE);
  assert.ok(applePlan.roles.length < 36);
  assert.ok(applePlan.roles.some((r) => r.phenology === 'dormant' && r.season === 'winter'));
  const olive = catalog.find((p) => p.slug === 'olive');
  const olivePlan = requiredDesignVariantRoles(olive);
  assert.equal(olivePlan.form, DESIGN_GROWTH_FORMS.EVERGREEN_TREE_SHRUB);
  assert.equal(olivePlan.roles.some((r) => r.phenology === 'dormant'), false);
  const palm = requiredDesignVariantRoles(catalog.find((p) => p.slug === 'date-palm'));
  assert.equal(palm.form, DESIGN_GROWTH_FORMS.PALM_STRUCTURAL_EVERGREEN);
  assert.ok(palm.roles.some((r) => r.growthStage === 'intermediate'));
  const annual = requiredDesignVariantRoles(catalog.find((p) => p.slug === 'basil'));
  assert.notEqual(annual.visualForm, 'annual');
  assert.equal(annual.lifecycle, 'annual');
  const policySrc = fs.readFileSync(
    path.join(ROOT, 'modules', 'garden-design', 'garden-design-variant-policy-v1.js'),
    'utf8'
  );
  assert.doesNotMatch(policySrc, /if \(slug === 'olive'\)/);
  assert.doesNotMatch(policySrc, /if \(slug === 'mango'\)/);
});

test('evergreen must not be faked bare; deciduous winter must not be fully leafy', () => {
  const olive = catalog.find((p) => p.slug === 'olive');
  const fakeWinter = assertNoFakeSeasonalVariants(olive, {
    season: 'winter',
    phenology: 'dormant'
  });
  assert.equal(fakeWinter.ok, false);
  const apple = catalog.find((p) => p.slug === 'apple');
  const leafyWinter = assertNoFakeSeasonalVariants(apple, {
    season: 'winter',
    phenology: 'vegetative',
    fullyLeafy: true
  });
  assert.equal(leafyWinter.ok, false);
});

test('design asset fallback never substitutes another species or generates', () => {
  const olive = resolveDesignAsset({ canonicalSlug: 'olive', growthStage: 'young', phenology: 'fruiting' }, assetIndex);
  assert.equal(olive.canonicalSlug, 'olive');
  assert.equal(olive.visualReady, true);
  assert.equal(olive.substitutedSpecies, false);
  assert.equal(olive.generated, false);
  assert.ok(
    olive.fallback === DESIGN_ASSET_FALLBACK.CLOSEST_APPROVED ||
      olive.fallback === DESIGN_ASSET_FALLBACK.NEUTRAL_CANONICAL
  );
  const mango = resolveDesignAsset({ canonicalSlug: 'mango' }, assetIndex);
  assert.equal(mango.visualReady, false);
  assert.equal(mango.fallback, DESIGN_ASSET_FALLBACK.HONEST_PLACEHOLDER);
  assert.equal(mango.usedWebImage, false);
  const broad = assertVariantIdentityConsistency(
    { slug: 'banana', scientific: 'Musa spp.', identityScope: 'genus' },
    { canonicalSlug: 'banana', cultivarSpecific: true }
  );
  assert.equal(broad.ok, false);
  assert.equal(isBroadPlantIdentity({ scientific: 'Musa spp.' }), true);
});

test('coverage audit: current Design-enabled set is olive-only; no mass wave', () => {
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  const catalogSlugs = [
    ...new Set(
      [...(seed.plants || []).map((p) => p.slug), ...catalog.map((p) => p.slug)].filter(Boolean)
    )
  ].map((slug) => ({ slug }));
  const coverage = auditDesignAssetCoverage(catalogSlugs, assetIndex);
  assert.equal(coverage.designEnabled, 1);
  assert.equal(coverage.enabledSlugs[0], 'olive');
  assert.equal(coverage.onlyOneAsset, 1);
  assert.equal(coverage.multipleGrowthStages, 0);
  assert.equal(coverage.seasonalStates, 0);
  assert.equal(coverage.floweringVariants, 0);
  assert.equal(coverage.fruitingVariants, 0);
  assert.ok(coverage.noUsable >= 1);
  assert.equal(coverage.massGenerationStarted, false);
  assert.equal(DESIGN_ASSET_PRODUCTION_PIPELINE.autonomousGeneration, false);
  assert.equal(CORE_FREEZE_MINIMUM_DESIGN_COVERAGE.fullCatalogRequired, false);
  assert.equal(CORE_FREEZE_MINIMUM_DESIGN_COVERAGE.arbitraryPlantCountForbidden, true);
  assert.deepEqual(CORE_FREEZE_MINIMUM_DESIGN_COVERAGE.proposedLaunchCanonicalSlugs, []);
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const ready = Object.values(manifest.plants || {}).filter((p) => {
    const v = p.variants && p.variants[p.defaultVariant];
    return v && v.comingSoon === false;
  });
  assert.equal(ready.length, 1);
});

test('host and iframe wire Garden OS without a second catalog or auto-own', () => {
  const app = appSrc();
  const gd = gdSrc();
  assert.match(app, /garden-design-owned-garden-v1\.js/);
  assert.match(app, /garden-design-variant-selection-policy-v1\.js/);
  assert.match(app, /openGardenDesign/);
  assert.match(app, /cruvit:garden-design-context/);
  assert.match(app, /cruvit:garden-design-owned-plants/);
  assert.match(app, /cruvit:garden-design-areas/);
  assert.match(app, /cruvit:garden-design-asset-registry/);
  assert.match(app, /commitDesignProposalToGarden/);
  assert.match(app, /savePlantFromLibrary\(/);
  assert.match(app, /evaluateIdentifierGardenSuitability/);
  assert.match(app, /acceptGardenDesignMessage/);
  assert.match(gd, /CruvitGardenDesignOwnedGarden/);
  assert.match(gd, /kind === 'owned'|kind==='owned'|DESIGN_PLANT_KIND/);
  assert.match(gd, /From My Garden|showApmOwned/);
  assert.match(gd, /function commitProposedPlantCard/);
  assert.match(gd, /cruvit:garden-design-ready/);
  assert.match(gd, /cruvit:garden-design-refresh-owned-plants/);
  assert.match(gd, /gdRequestSuitabilityForPlant/);
  assert.match(gd, /resolveDesignAsset/);
  assert.match(gd, /gdResolvedPhotoLocation/);
  assert.doesNotMatch(gd, /function evaluateIdentifierGardenSuitability/);
  assert.doesNotMatch(gd, /create table/i);
  assert.doesNotMatch(app, /GARDEN_DESIGN_PERSISTENCE_MIGRATION applied/i);
  assert.doesNotMatch(gd, /supabase\.from\(['"]garden_plants['"]\)/);
  assert.doesNotMatch(gd, /supabase\.from\(['"]garden_designs['"]\)/);
  assert.doesNotMatch(gd, /createClient\s*\(/);
  assert.doesNotMatch(gd, /garden-design-server-persistence-v1/);
});

test('A/B: Mojstrana trusted context is honest; missing location stays UNKNOWN', () => {
  const moj = classifyDesignGardenLocation({
    trusted: true,
    confirmationStatus: 'confirmed',
    label: 'Mojstrana, Slovenia',
    lat: 46.42383,
    lon: 13.8752,
    gardenProfileId: 'garden-moj',
    source: 'confirmed',
    climateAuthority: 'coordinate-climate-v2'
  });
  assert.equal(moj.status, 'TRUSTED_CONFIRMED');
  assert.equal(moj.label, 'Mojstrana, Slovenia');
  assert.equal(shouldInventSecondLocation(moj), false);
  const access = buildDesignSuitabilityAccess(moj);
  assert.equal(access.available, true);
  assert.equal(access.iframeMustNotEvaluate, true);
  const missing = classifyDesignGardenLocation({ trusted: false });
  assert.equal(missing.useForSuitability, false);
  assert.equal(missing.treatDefaultAsGardenTruth, false);
  assert.equal(buildDesignSuitabilityAccess(missing).status, 'UNKNOWN');
  const def = classifyDesignGardenLocation({
    trusted: false,
    source: 'default',
    label: WESTERN_GALILEE_DEFAULT_LABEL,
    lat: 33.0089,
    lon: 35.0941
  });
  assert.equal(def.status, 'UNTRUSTED_DEFAULT');
  assert.equal(def.lat, null);
  assert.equal(def.lon, null);
  assert.equal(presentDesignSuitability({ ok: false, available: false, status: 'UNKNOWN' }).presentation, 'unknown');
});

test('typed same-origin bridge rejects unknown types and foreign origins', () => {
  assert.equal(GD_BRIDGE_SAME_ORIGIN, true);
  assert.equal(isGardenDesignBridgeType(GD_HOST_TO_DESIGN.CONTEXT), true);
  assert.equal(isGardenDesignBridgeType(GD_DESIGN_TO_HOST.COMMIT_PROPOSAL), true);
  assert.equal(isGardenDesignBridgeType('cruvit:secret-exfil'), false);
  const ok = acceptGardenDesignMessage({
    origin: 'https://cruvit.example',
    data: { type: GD_DESIGN_TO_HOST.READY }
  }, { expectedOrigin: 'https://cruvit.example' });
  assert.equal(ok.ok, true);
  const badOrigin = acceptGardenDesignMessage({
    origin: 'https://evil.example',
    data: { type: GD_DESIGN_TO_HOST.READY }
  }, { expectedOrigin: 'https://cruvit.example' });
  assert.equal(badOrigin.ok, false);
  const unknown = acceptGardenDesignMessage({
    origin: 'https://cruvit.example',
    data: { type: 'cruvit:not-a-bridge' }
  }, { expectedOrigin: 'https://cruvit.example' });
  assert.equal(unknown.ok, false);
});

test('G/H: Design consumes host suitability; Lemon/Mango hard-block is not a recommendation', () => {
  const gd = gdSrc();
  const app = appSrc();
  assert.match(gd, /cruvit:garden-design-suitability-request/);
  assert.match(app, /evaluateDesignGardenSuitability/);
  assert.match(app, /evaluateIdentifierGardenSuitability/);
  assert.doesNotMatch(gd, /function smartRecEvaluateSuitability/);
  const climate = {
    thermalRegime: 'frost-prone',
    freezingRisk: 'high',
    coldestMonthMeanMinC: -8,
    isFrostFreeGrowingClimate: false
  };
  for (const slug of ['mango', 'lemon']) {
    const verdict = evaluateHardClimateSurvival({
      meta: { frostSensitivity: 'high', coldTolerance: 'low' },
      climateProfile: climate,
      coords: { lat: 46.42383, lon: 13.8752 }
    });
    assert.equal(verdict.hardBlocked, true, slug);
    const presented = presentDesignSuitability({
      engine: 'smartRecEvaluateSuitability',
      recommendationLevel: 'blocked',
      hardSurvivalBlocked: true,
      primaryLimiter: verdict.limiter,
      outcomes: {
        survival: 'blocked',
        growth: 'blocked',
        flowering: 'blocked',
        fruiting: 'blocked'
      }
    });
    assert.equal(presented.canAddToGarden, true, slug);
    assert.equal(presented.isPositiveRecommendation, false, slug);
    assert.equal(presented.presentation, 'not-recommended', slug);
    assert.ok(presented.outcomes.survival);
  }
});

test('K: Olive resolves through the Design Asset Registry as the first approved cutout', () => {
  const olive = resolveDesignAsset({ canonicalSlug: 'olive', growthStage: 'mature' }, assetIndex);
  assert.equal(olive.canonicalSlug, 'olive');
  assert.equal(olive.visualReady, true);
  assert.equal(olive.substitutedSpecies, false);
  assert.equal(olive.generated, false);
  assert.equal(olive.growthStage, 'mature');
  assert.ok(olive.assetId);
  assert.ok(olive.approvalStatus === 'approved' || olive.visualReady === true);
});

test('manual owned-plant path: no paid AI, server garden_plants only, placement keeps garden_plant_id', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(designPaidAiForAction('manual-placement').paidAiCalls, 0);
  assert.equal(designPaidAiForAction('open-manual-canvas').paidAiCalls, 0);
  assert.equal(designPaidAiForAction('place-owned').paidAiCalls, 0);

  const gd = gdSrc();
  const app = appSrc();
  assert.match(gd, /function openManualOwnedPlantPlacement/);
  assert.match(gd, /id="btnManualPlacement"/);
  assert.match(gd, /Open manual placement/);
  assert.doesNotMatch(
    gd.slice(gd.indexOf('function openManualOwnedPlantPlacement'), gd.indexOf('async function runSketch')),
    /claude\(|replicate\(|stabilityImg2Img\(|openai/i
  );
  assert.match(app, /listPlantsForActiveGarden/);
  assert.match(app, /resolveDesignOwnedPlantsFromGardenOs/);
  assert.doesNotMatch(app, /gardenPlantId:p\.serverId\|\|p\.id/);

  const moj = classifyDesignGardenLocation({
    trusted: true,
    confirmationStatus: 'confirmed',
    label: 'Mojstrana, Slovenia',
    lat: 46.42383,
    lon: 13.8752,
    gardenProfileId: 'garden-moj',
    source: 'confirmed'
  });
  assert.equal(moj.status, 'TRUSTED_CONFIRMED');
  assert.equal(moj.gardenProfileId, 'garden-moj');

  const localLegacy = [
    { name: 'Lavender', id: 'local-1' },
    { name: 'Rosemary', id: 'local-2' },
    { name: 'Jasmine', id: 'local-3' }
  ];
  const serverRows = [
    { id: 'gp-mango', name: 'Mango Tree', profile_slug: 'mango', scientific: 'Mangifera indica', garden_profile_id: 'garden-moj' },
    { id: 'gp-banana', name: 'Banana', profile_slug: 'banana', scientific: 'Musa spp.', garden_profile_id: 'garden-moj' },
    { id: 'gp-pineapple', name: 'Pineapple', profile_slug: 'pineapple', scientific: 'Ananas comosus', garden_profile_id: 'garden-moj' }
  ];
  const resolved = resolveDesignOwnedPlantsFromGardenOs({
    session: { user: { id: 'owner-1' } },
    gardenProfileId: 'garden-moj',
    serverPlantRows: serverRows,
    localPlants: localLegacy
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.source, 'garden_plants');
  assert.equal(resolved.usedLocalFallback, false);
  assert.equal(resolved.fromMyGardenVisible, true);
  assert.equal(resolved.paidAiCalls, 0);
  const names = resolved.ownedPlants.map((p) => p.name);
  assert.deepEqual(names, ['Mango Tree', 'Banana', 'Pineapple']);
  assert.equal(names.includes('Lavender'), false);
  assert.equal(names.includes('Rosemary'), false);
  assert.equal(names.includes('Jasmine'), false);

  const mango = resolved.ownedPlants[0];
  const placed = createOwnedDesignPlacement({
    gardenProfileId: 'garden-moj',
    gardenPlantId: mango.gardenPlantId,
    canonicalSlug: mango.canonicalSlug,
    x: 0.4,
    y: 0.7
  });
  assert.equal(placed.gardenPlantId, 'gp-mango');
  assert.equal(placed.createsGardenPlant, false);
  assert.equal(ownedPlacementMustNotInsertGardenPlant(3, 3, 'place-owned'), true);

  const failed = resolveDesignOwnedPlantsFromGardenOs({
    session: { user: { id: 'owner-1' } },
    gardenProfileId: 'garden-moj',
    fetchError: 'network down',
    localPlants: localLegacy
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.ownedPlants.length, 0);
  assert.equal(failed.usedLocalFallback, false);
  assert.equal(failed.fromMyGardenVisible, false);
});

test('legacy/local owned placement identity reconciles to authoritative My Garden instance without name guessing', () => {
  const ownedPlants = [
    {
      gardenPlantId: '5fdd5d4c-adbf-4451-a784-2e2a7d271662',
      clientInstanceId: 'catalog:mango',
      canonicalSlug: 'mango',
      scientific: 'Mangifera indica',
      name: 'Mango Tree',
      areaId: 'area-sunny',
      gardenProfileId: 'garden-moj'
    }
  ];

  const byLegacyId = reconcileOwnedLocalPlacementIdentity({
    id: 'pl-local',
    kind: 'owned',
    gardenPlantId: 'catalog:mango',
    canonicalSlug: null,
    species: 'Mangifera indica',
    x: 0.22,
    y: 0.78,
    scale: 1.3
  }, ownedPlants, 'garden-moj');
  assert.equal(byLegacyId.ok, true);
  assert.equal(byLegacyId.resolution, 'legacy-client-id');
  assert.equal(byLegacyId.layer.gardenPlantId, '5fdd5d4c-adbf-4451-a784-2e2a7d271662');
  assert.equal(byLegacyId.layer.canonicalSlug, 'mango');
  assert.equal(byLegacyId.layer.areaId, 'area-sunny');
  assert.equal(byLegacyId.layer.x, 0.22);
  assert.equal(byLegacyId.layer.y, 0.78);
  assert.equal(byLegacyId.layer.scale, 1.3);

  const byCanonical = reconcileOwnedLocalPlacementIdentity({
    id: 'pl-local-2',
    kind: 'owned',
    gardenPlantId: null,
    canonicalSlug: 'mango',
    species: 'Mangifera indica',
    x: 0.4,
    y: 0.7,
    scale: 1
  }, ownedPlants, 'garden-moj');
  assert.equal(byCanonical.ok, true);
  assert.equal(byCanonical.resolution, 'unique-canonical');
  assert.equal(byCanonical.layer.gardenPlantId, '5fdd5d4c-adbf-4451-a784-2e2a7d271662');

  const unknownExplicitId = reconcileOwnedLocalPlacementIdentity({
    kind: 'owned',
    gardenPlantId: 'unknown-client-id',
    canonicalSlug: 'mango',
    species: 'Mangifera indica'
  }, ownedPlants, 'garden-moj');
  assert.equal(unknownExplicitId.ok, false);
  assert.equal(unknownExplicitId.code, 'IDENTITY_INCONSISTENT');

  const noNameGuess = reconcileOwnedLocalPlacementIdentity({
    kind: 'owned',
    name: 'Mango Tree'
  }, ownedPlants, 'garden-moj');
  assert.equal(noNameGuess.ok, false);
});

test('empty manual canvas always shows Add plants; owned list stays server Garden OS', () => {
  const empty = manualCanvasAddPlantsPolicy({ currentPlants: [], plantLayers: [] });
  assert.equal(empty.showAddPlants, true);
  assert.equal(empty.hideWhenEmpty, false);
  assert.equal(empty.designPlacementCount, 0);
  assert.equal(empty.counterMeansDesignPlacementsOnly, true);
  assert.equal(empty.paidAiCalls, 0);
  assert.equal(manualCanvasAddPlantsPolicy({ currentPlantCount: 0, designPlacementCount: 0 }).showAddPlants, true);

  const gd = gdSrc();
  assert.match(gd, /function ensureAddPlantsCard/);
  assert.match(gd, /function ensureDesignPlantsPanelVisible/);
  assert.match(gd, /function gdRetryOwnedPlants/);
  const drawer = gd.slice(gd.indexOf('function renderPlantsDrawer'), gd.indexOf('function togglePlant'));
  assert.match(drawer, /ensureAddPlantsCard\(\)/);
  assert.doesNotMatch(drawer, /if \(currentPlants\.length/);
  const showFn = gd.slice(gd.indexOf('function showPlants'), gd.indexOf('const plantImgCache'));
  assert.match(showFn, /ensureDesignPlantsPanelVisible\(\)/);
  assert.doesNotMatch(showFn, /if \(currentPlants\.length > 0\) \{\s*ensure/);
  const refreshFn = gd.slice(gd.indexOf('function gdRefreshOwnedGardenOption'), gd.indexOf('function showApmOwned'));
  assert.match(refreshFn, /ensureDesignPlantsPanelVisible\(\)/);
  assert.match(refreshFn, /Retry/);
  assert.match(gd, /function openAddPlantModal/);
  assert.match(gd, /From My Garden/);
  assert.match(gd, /Plants placed/);
  assert.match(gd, /in this design/);
  assert.doesNotMatch(gd, /Plants added<br>to your garden/);

  const session = { user: { id: 'owner-1' } };
  const localLegacy = [{ name: 'Lavender' }, { name: 'Rosemary' }, { name: 'Jasmine' }];
  const serverRows = [
    { id: 'gp-mango', name: 'Mango Tree', profile_slug: 'mango', garden_profile_id: 'garden-moj' },
    { id: 'gp-banana', name: 'Banana', profile_slug: 'banana', garden_profile_id: 'garden-moj' },
    { id: 'gp-pineapple', name: 'Pineapple', profile_slug: 'pineapple', garden_profile_id: 'garden-moj' }
  ];
  const owned = resolveDesignOwnedPlantsFromGardenOs({
    session,
    gardenProfileId: 'garden-moj',
    serverPlantRows: serverRows,
    localPlants: localLegacy
  });
  assert.equal(owned.fromMyGardenVisible, true);
  assert.deepEqual(owned.ownedPlants.map((p) => p.name), ['Mango Tree', 'Banana', 'Pineapple']);
  assert.equal(owned.usedLocalFallback, false);
  const mango = createOwnedDesignPlacement({
    gardenProfileId: 'garden-moj',
    gardenPlantId: 'gp-mango',
    canonicalSlug: 'mango'
  });
  assert.equal(mango.gardenPlantId, 'gp-mango');
  assert.equal(mango.createsGardenPlant, false);
  assert.equal(ownedPlacementMustNotInsertGardenPlant(3, 3, 'place-owned'), true);
  assert.equal(designPaidAiForAction('manual-placement').paidAiCalls, 0);
  assert.match(gd, /gdRenderAreaSelect/);
  assert.doesNotMatch(gd, /create table/i);
  assert.doesNotMatch(appSrc(), /GARDEN_DESIGN_PERSISTENCE_MIGRATION applied/i);
});

test('zero-placement sourced design still shows Add plants and From My Garden', () => {
  const session = { user: { id: 'owner-1' } };
  const serverRows = [
    { id: 'gp-mango', name: 'Mango', profile_slug: 'mango', garden_profile_id: 'garden-moj' },
    { id: 'gp-banana', name: 'Banana', profile_slug: 'banana', garden_profile_id: 'garden-moj' },
    { id: 'gp-pineapple', name: 'Pineapple', profile_slug: 'pineapple', garden_profile_id: 'garden-moj' }
  ];
  const owned = resolveDesignOwnedPlantsFromGardenOs({
    session,
    gardenProfileId: 'garden-moj',
    serverPlantRows: serverRows,
    localPlants: []
  });
  const entry = hydratedSourcedDesignAddPlantsEntrypoint({
    sourcePhotoLoaded: true,
    sourceMediaId: 'media-existing-photo',
    designId: 'design-mojstrana-live',
    designHydrated: true,
    persistStatus: 'saved',
    placements: [],
    ownedPlants: owned.ownedPlants
  });
  assert.equal(entry.plantsSectionVisible, true);
  assert.equal(entry.addPlantsCard, true);
  assert.equal(entry.plantCount, 0);
  assert.equal(entry.ownerCanOpenModal, true);
  assert.equal(entry.fromMyGardenAvailable, true);
  assert.equal(entry.hideWhenPlacementCountZero, false);
  assert.equal(entry.hideWhenOwnedCountZero, false);
  assert.equal(entry.paidAiCalls, 0);
  assert.equal(owned.fromMyGardenVisible, true);
  assert.deepEqual(owned.ownedPlants.map((p) => p.canonicalSlug), ['mango', 'banana', 'pineapple']);
  assert.equal(owned.usedLocalFallback, false);
  assert.equal(ownedInventoryMustNotAutoPlace(owned.ownedPlants.length, 0), true);

  const emptyOwned = hydratedSourcedDesignAddPlantsEntrypoint({
    sourcePhotoLoaded: true,
    designId: 'design-empty-owned',
    designHydrated: true,
    persistStatus: 'saved',
    placements: [],
    ownedPlants: []
  });
  assert.equal(emptyOwned.plantsSectionVisible, true);
  assert.equal(emptyOwned.addPlantsCard, true);
  assert.equal(emptyOwned.plantCount, 0);
  assert.equal(emptyOwned.ownerCanOpenModal, true);
  assert.equal(emptyOwned.fromMyGardenAvailable, false);
  assert.equal(emptyOwned.hideWhenOwnedCountZero, false);

  const gd = gdSrc();
  const hydrate = gd.slice(gd.indexOf('function gdHydrateServerDesign'), gd.indexOf('function gdOnLoadResult'));
  assert.match(hydrate, /skipPersist:\s*true/);
  assert.match(hydrate, /gdSetPersistStatus\('saved'\)/);
  assert.match(hydrate, /ensureDesignPlantsPanelVisible\(\)/);
  assert.match(hydrate, /gdRefreshOwnedGardenOption\(\)/);
  assert.match(gd, /function openAddPlantModal/);
  assert.match(gd, /From My Garden/);
  assert.match(gd, /function showApmOwned/);
  const persist = fs.readFileSync(path.join(ROOT, 'modules/garden-design/garden-design-server-persistence-v1.js'), 'utf8');
  assert.match(persist, /payload\.cachedDesignId/);
  assert.match(persist, /persistableDesignAssetId/);

  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'modules/garden-design/assets/plants/design-asset-registry-v1.json'), 'utf8'));
  const index = indexDesignAssetRegistry(registry);
  for (const slug of ['mango', 'banana', 'pineapple']) {
    const resolved = resolveDesignAsset({ canonicalSlug: slug, growthStage: 'mature', phenology: 'vegetative' }, index);
    assert.equal(resolved.visualReady, true);
    assert.equal(resolved.placeholder === true, false);
    assert.ok(resolved.url);
  }
});

test('owned placement missing cutout stays visible; count is plantLayers only', () => {
  const mangoId = '5fdd5d4c-adbf-4451-a784-2e2a7d271662';
  const patioId = 'b394f661-0edd-4740-a04b-8bcc420590c9';
  const owned = resolveDesignOwnedPlantsFromGardenOs({
    session: { user: { id: 'owner-1' } },
    gardenProfileId: 'garden-moj',
    serverPlantRows: [
      { id: mangoId, name: 'Mango Tree', profile_slug: 'mango', garden_profile_id: 'garden-moj', garden_area_id: patioId },
      { id: 'gp-banana', name: 'Banana', profile_slug: 'banana', garden_profile_id: 'garden-moj' },
      { id: 'gp-pineapple', name: 'Pineapple', profile_slug: 'pineapple', garden_profile_id: 'garden-moj' }
    ],
    localPlants: [{ name: 'Lavender' }]
  });
  assert.equal(owned.ownedPlants.length, 3);
  assert.equal(ownedInventoryMustNotAutoPlace(owned.ownedPlants.length, 0), true);
  assert.equal(designPlacementCountFromLayers([]), 0);

  const mango = createOwnedDesignPlacement({
    gardenProfileId: 'garden-moj',
    gardenPlantId: mangoId,
    canonicalSlug: 'mango',
    areaId: patioId,
    x: 0.15,
    y: 0.78
  });
  assert.equal(mango.gardenPlantId, mangoId);
  assert.equal(mango.canonicalSlug, 'mango');
  assert.equal(mango.createsGardenPlant, false);
  assert.equal(mango.areaId, patioId);
  assert.equal(designPlacementCountFromLayers([mango]), 1);

  const areaKept = resolveOwnedPlacementAreaId({
    kind: 'owned',
    gardenPlantId: mangoId,
    ownedAreaId: patioId,
    designLevelAreaId: null,
    userChangedArea: false
  });
  assert.equal(areaKept, patioId);

  const mangoAsset = resolveDesignAsset({ canonicalSlug: 'mango', growthStage: 'mature' }, assetIndex);
  assert.equal(mangoAsset.visualReady, false);
  assert.equal(mangoAsset.fallback, DESIGN_ASSET_FALLBACK.HONEST_PLACEHOLDER);
  assert.equal(mangoAsset.substitutedSpecies, false);
  assert.equal(mangoAsset.usedWebImage, false);
  assert.equal(mangoAsset.generateOnRender, false);
  const mangoVisual = resolveOwnedPlacementVisual({
    canonicalSlug: 'mango',
    visualReady: mangoAsset.visualReady,
    url: mangoAsset.url
  });
  assert.equal(mangoVisual.renderVisible, true);
  assert.equal(mangoVisual.draggable, true);
  assert.equal(mangoVisual.resizable, true);
  assert.equal(mangoVisual.fallback, DESIGN_ASSET_FALLBACK.HONEST_PLACEHOLDER);
  assert.equal(mangoVisual.usedWebImage, false);
  assert.equal(mangoVisual.paidAiCalls, 0);

  const olive = resolveDesignAsset({ canonicalSlug: 'olive', growthStage: 'mature' }, assetIndex);
  assert.equal(olive.visualReady, true);
  assert.ok(olive.url);
  const oliveVisual = resolveOwnedPlacementVisual({
    canonicalSlug: 'olive',
    visualReady: olive.visualReady,
    url: olive.url,
    fallback: olive.fallback
  });
  assert.equal(oliveVisual.visualReady, true);
  assert.notEqual(oliveVisual.fallback, DESIGN_ASSET_FALLBACK.HONEST_PLACEHOLDER);

  const dup = duplicateDesignPlacement(mango);
  assert.equal(dup.gardenPlantId, mangoId);
  assert.equal(dup.createsGardenPlant, false);
  const counts = ownedPlacementOwnershipCount([mango, dup], mangoId);
  assert.equal(counts.visualCount, 2);
  assert.equal(counts.ownershipRecords, 1);
  assert.equal(counts.duplicateOwnership, false);
  assert.equal(ownedPlacementMustNotInsertGardenPlant(3, 3, 'place-owned'), true);

  const gd = gdSrc();
  assert.match(gd, /function gdBuildHonestPlaceholderHtml/);
  assert.match(gd, /function gdUpsertPlacedPlantCard/);
  assert.match(gd, /function gdDesignPlacementCount/);
  assert.match(gd, /data-fallback="honest-placeholder"/);
  assert.match(gd, /gdDesignPlacementCount\(\)/);
  assert.doesNotMatch(gd, /showPlants\(gdOwnedPlantsFromContext/);
  assert.doesNotMatch(gd, /showPlants\(owned/);
  assert.doesNotMatch(gd, /if \(!resolved\.visualReady && !gdShouldRenderSvgPlaceholders\(\)\) \{[\s\S]{0,80}aria-hidden="true"/);
  assert.doesNotMatch(gd.slice(gd.indexOf('function gdBuildPlantLayerVisualInner'), gd.indexOf('function gdOnPlantCutoutError')), /wikipedia/i);
  assert.match(gd, /countLayersForPlant\(p\) === 0/);
  assert.equal(designPaidAiForAction('place-owned').paidAiCalls, 0);
  assert.doesNotMatch(gd, /create table/i);
  assert.doesNotMatch(appSrc(), /GARDEN_DESIGN_PERSISTENCE_MIGRATION applied/i);
});

test('no paid network during this suite', () => {
  assert.equal(paidNetwork, 0);
  assert.equal(GARDEN_DESIGN_OWNED_GARDEN_VERSION, '1.0.0');
});

test('after: restore fetch', () => {
  globalThis.fetch = origFetch;
});
