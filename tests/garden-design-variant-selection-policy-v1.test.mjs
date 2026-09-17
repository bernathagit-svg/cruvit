/**
 * Garden Design Variant Selection Policy V1.
 * Zero paid AI. Fixtures + local catalog/registry only. Does not generate images.
 *
 * Run: node --test tests/garden-design-variant-selection-policy-v1.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

import {
  DESIGN_GROWTH_FORMS,
  DESIGN_VISUAL_FORMS,
  DESIGN_HABIT_MODIFIERS,
  DESIGN_LIFECYCLES,
  DESIGN_PLANT_ROLES,
  DESIGN_PURPOSE_CAPABILITIES,
  DESIGN_MORPHOLOGY_AUTHORITY,
  DESIGN_STAGE_UNSPECIFIED,
  CORE_FREEZE_MINIMUM_DESIGN_COVERAGE,
  cartesianVariantCount,
  classifyDesignPlantRole,
  classifyDesignVisualMorphology,
  classifyDesignVisualForm,
  classifyDesignPurposeCapabilities,
  classifyDesignHabitModifiers,
  requiredDesignVariantRoles
} from '../modules/garden-design/garden-design-variant-policy-v1.js';
import {
  indexDesignAssetRegistry,
  resolveDesignAsset,
  DESIGN_ASSET_FALLBACK
} from '../modules/garden-design/garden-design-asset-registry-v1.js';
import {
  DESIGN_VARIANT_SELECTION_POLICY_VERSION,
  VISUAL_AUTHORITY_SEPARATION,
  DESIGN_VARIANT_METADATA_AUDIT,
  DESIGN_TEMPORAL_VIEWS,
  DESIGN_READY_DEFINITION,
  SELECTION_FORBIDDEN,
  ownedPlacementVisualDefaults,
  proposedPlacementVisualDefaults,
  resolveOwnedDefaultRequest,
  selectDesignVariant,
  isDesignReady,
  auditOliveApprovedAsset,
  describePlantDesignPolicy,
  catalogCardMustNotBecomeDesignCutout,
  availableUserVariantControls
} from '../modules/garden-design/garden-design-variant-selection-policy-v1.js';
import {
  createOwnedDesignPlacement,
  createProposedDesignPlacement
} from '../modules/garden-design/garden-design-owned-garden-v1.js';
import { withCanonicalCatalogMedia } from '../modules/catalog-media/licensed-catalog-media-runtime-v1.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const REGISTRY_PATH = path.join(
  ROOT,
  'modules',
  'garden-design',
  'assets',
  'plants',
  'design-asset-registry-v1.json'
);
const APP = path.join(ROOT, 'app.html');
const GD = path.join(ROOT, 'modules', 'garden-design', 'index.html');
const POLICY = path.join(ROOT, 'modules', 'garden-design', 'garden-design-variant-policy-v1.js');
const SELECTION = path.join(
  ROOT,
  'modules',
  'garden-design',
  'garden-design-variant-selection-policy-v1.js'
);

let paidNetwork = 0;
globalThis.fetch = async (url) => {
  paidNetwork += 1;
  throw new Error('network forbidden in variant-selection-policy tests: ' + url);
};

const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
const assetIndex = indexDesignAssetRegistry(registry);
const seed = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));

/** Library-only plants, copied from current PLANT_LIBRARY / seed — not invented. */
const LIBRARY_TRAITS = {
  olive: {
    slug: 'olive',
    scientific: 'Olea europaea',
    tags: ['tree', 'mediterranean', 'drought tolerant', 'sun'],
    growth: 'Evergreen Mediterranean tree'
  },
  mango: {
    slug: 'mango',
    scientific: 'Mangifera indica',
    tags: ['tree', 'fruit', 'tropical', 'sun'],
    growth: 'Evergreen tropical/subtropical fruit tree',
    climateTraits: {
      floweringRequirements:
        'Warmth, sun, and low frost risk are essential; humidity can reduce bloom quality through disease pressure.',
      fruitingRequirements: 'Fruit set depends on variety, weather and pollination.'
    }
  },
  banana: {
    slug: 'banana',
    scientific: 'Musa spp.',
    identityScope: 'genus',
    tags: ['fruit', 'tropical', 'sun', 'water'],
    growth: 'Fast herbaceous plant with pups'
  },
  apple: {
    slug: 'apple',
    scientific: 'Malus domestica',
    tags: ['tree', 'fruit', 'sun'],
    growth: 'Deciduous fruit tree',
    climateTraits: {
      groupIds: ['temperate-chill-fruit-tree'],
      floweringRequirements: 'White to pink flowers in spring on previous-season wood.',
      fruitingRequirements: 'Edible pomes ripen mid-summer to autumn depending on cultivar.'
    }
  },
  lavender: {
    slug: 'lavender',
    scientific: 'Lavandula angustifolia',
    tags: ['mediterranean', 'sun', 'low water', 'fragrant'],
    growth: 'Evergreen aromatic shrub',
    climateTraits: {
      groupIds: ['herb-edible'],
      floweringRequirements: 'Fragrant purple flower spikes in summer.',
      fruitingRequirements: 'Grown for flowers and aromatic foliage; culinary/medicinal use.'
    }
  },
  rosemary: {
    slug: 'rosemary',
    scientific: 'Salvia rosmarinus',
    tags: ['herb', 'mediterranean', 'low water', 'sun'],
    growth: 'Hardy aromatic evergreen shrub'
  },
  bougainvillea: {
    slug: 'bougainvillea',
    scientific: 'Bougainvillea spp.',
    identityScope: 'genus',
    tags: ['climber', 'color', 'sun', 'low water'],
    growth: 'Vigorous climber / shrub',
    climateTraits: {
      groupIds: ['ornamental-flowering'],
      floweringRequirements: 'Inconspicuous true flowers with showy colorful bracts.',
      fruitingRequirements: 'Ornamental; not grown for fruit.'
    }
  }
};

function normalizeCatalogPlant(raw) {
  if (!raw) return null;
  return {
    slug: raw.slug,
    canonicalSlug: raw.canonicalSlug || raw.slug,
    name: raw.name || raw.names?.en || raw.slug,
    scientific: raw.scientific,
    tags: raw.tags || [],
    growth: raw.growth || raw.care?.growth,
    care: raw.care,
    climateTraits: raw.climateTraits,
    identityScope: raw.identityScope,
    aliases: raw.aliases || []
  };
}

function loadCatalogPlant(slug) {
  const fromSeed = (seed.plants || []).find((p) => p.slug === slug);
  if (fromSeed) return normalizeCatalogPlant(fromSeed);
  if (LIBRARY_TRAITS[slug]) return normalizeCatalogPlant(LIBRARY_TRAITS[slug]);
  return null;
}

const SAMPLE_SLUGS = [
  'olive',
  'mango',
  'banana',
  'pineapple',
  'apple',
  'lavender',
  'rosemary',
  'english-walnut',
  'garden-peony',
  'carrot',
  'broccoli',
  'cypress',
  'bougainvillea'
];

test('paid AI automated gate remains closed', () => {
  assert.equal(isPaidAiAutomatedTestAllowed(), false);
  assert.equal(paidNetwork, 0);
});

test('two visual systems stay separate authorities on one canonical identity', () => {
  assert.equal(VISUAL_AUTHORITY_SEPARATION.sameImageAuthority, false);
  assert.equal(VISUAL_AUTHORITY_SEPARATION.sharedIdentity, 'canonicalSlug');
  assert.equal(VISUAL_AUTHORITY_SEPARATION.catalogCardImage.mayBeUsedAsDesignCutout, false);
  assert.equal(catalogCardMustNotBecomeDesignCutout().catalogPhotoAsDesignCutout, false);
  assert.equal(catalogCardMustNotBecomeDesignCutout().replaceCardImages, false);
});

test('owned metadata audit does not invent age or current season', () => {
  assert.equal(DESIGN_VARIANT_METADATA_AUDIT.garden_plant_id.status, 'SOURCE_SUPPORTED');
  assert.equal(DESIGN_VARIANT_METADATA_AUDIT.knownAge.status, 'missing');
  assert.equal(DESIGN_VARIANT_METADATA_AUDIT.knownAge.inventForbidden, true);
  assert.equal(DESIGN_VARIANT_METADATA_AUDIT.growthStageMetadata.status, 'missing');
  assert.equal(DESIGN_VARIANT_METADATA_AUDIT.currentLocalSeason.status, 'missing');
  assert.equal(DESIGN_VARIANT_METADATA_AUDIT.plantingDateToStageMapping.scientificallyDefensible, false);
  assert.equal(DESIGN_VARIANT_METADATA_AUDIT.added_at.asAge, false);
});

test('cartesian 3x4x4 must not become the production set', () => {
  assert.equal(
    cartesianVariantCount(
      ['young', 'intermediate', 'mature'],
      ['spring', 'summer', 'autumn', 'winter'],
      ['vegetative', 'flowering', 'fruiting', 'dormant']
    ),
    48
  );
  assert.equal(CORE_FREEZE_MINIMUM_DESIGN_COVERAGE.arbitraryPlantCountForbidden, true);
  assert.equal(CORE_FREEZE_MINIMUM_DESIGN_COVERAGE.designReadyIsPerPlant, true);
  assert.deepEqual(CORE_FREEZE_MINIMUM_DESIGN_COVERAGE.proposedLaunchCanonicalSlugs, []);
  const src = fs.readFileSync(POLICY, 'utf8');
  assert.doesNotMatch(src, /if \(slug === 'olive'\)/);
  assert.doesNotMatch(src, /if \(slug === 'mango'\)/);
});

test('owned unknown stage is unspecified, not mature; proposed defaults to young', () => {
  const owned = createOwnedDesignPlacement({
    gardenProfileId: 'g1',
    gardenPlantId: 'gp1',
    canonicalSlug: 'mango'
  });
  assert.equal(owned.growthStage, DESIGN_STAGE_UNSPECIFIED);
  assert.equal(owned.ageKnown, false);
  assert.notEqual(owned.growthStage, 'mature');
  const proposed = createProposedDesignPlacement({
    gardenProfileId: 'g1',
    canonicalSlug: 'lavender'
  });
  assert.equal(proposed.growthStage, 'young');
  assert.equal(proposed.maturePreviewImpliesCurrentSize, false);
  const unknownOwned = resolveOwnedDefaultRequest({});
  assert.equal(unknownOwned.growthStage, DESIGN_STAGE_UNSPECIFIED);
  assert.equal(unknownOwned.uncertainty, 'current-stage-unknown');
  assert.equal(unknownOwned.ageKnown, false);
});

test('selectDesignVariant never substitutes species, catalog photos, or generation', () => {
  const olivePlant = loadCatalogPlant('olive');
  const olive = selectDesignVariant(
    { canonicalSlug: 'olive', kind: 'owned', plant: olivePlant },
    assetIndex
  );
  assert.equal(olive.requested.growthStage, DESIGN_STAGE_UNSPECIFIED);
  assert.equal(olive.requested.ageKnown, false);
  assert.equal(olive.asset.canonicalSlug, 'olive');
  assert.equal(olive.substitutedSpecies, false);
  assert.equal(olive.usedCatalogPhotoAsCutout, false);
  assert.equal(olive.generated, false);
  assert.equal(olive.generateOnRender, false);
  assert.equal(olive.visualReady, true);
  assert.ok(
    olive.fallback === DESIGN_ASSET_FALLBACK.CLOSEST_APPROVED ||
      olive.fallback === DESIGN_ASSET_FALLBACK.NEUTRAL_CANONICAL
  );

  const mangoPlant = loadCatalogPlant('mango');
  const mango = selectDesignVariant(
    { canonicalSlug: 'mango', kind: 'proposed', plant: mangoPlant },
    assetIndex
  );
  assert.equal(mango.requested.growthStage, 'young');
  assert.equal(mango.visualReady, false);
  assert.equal(mango.fallback, DESIGN_ASSET_FALLBACK.HONEST_PLACEHOLDER);
  assert.equal(mango.usedWebImage, false);

  const maturePreview = selectDesignVariant(
    { canonicalSlug: 'olive', kind: 'proposed', plant: olivePlant, view: 'mature' },
    assetIndex
  );
  assert.equal(maturePreview.requested.growthStage, 'mature');
  assert.equal(maturePreview.requested.maturePreviewImpliesCurrentSize, false);
  assert.equal(SELECTION_FORBIDDEN.defaultMatureWhenAgeUnknown, false);
  assert.equal(SELECTION_FORBIDDEN.useCatalogPhotoAsFakeCutout, false);
});

test('user variant controls hide empty states', () => {
  const olive = availableUserVariantControls('olive', assetIndex);
  assert.ok(olive.states.includes('vegetative'));
  assert.equal(olive.states.includes('flowering'), false);
  assert.equal(olive.states.includes('dormant'), false);
  assert.equal(olive.emptyOptionsHidden, true);
  assert.equal(olive.generateMissingOptions, false);
  const mango = availableUserVariantControls('mango', assetIndex);
  assert.deepEqual(mango.states, []);
});

test('olive approved asset fills mature vegetative only; young remains missing', () => {
  const gap = auditOliveApprovedAsset(assetIndex);
  assert.equal(gap.found, true);
  assert.equal(gap.replaceForbidden, true);
  assert.equal(gap.role, DESIGN_VISUAL_FORMS.TREE);
  assert.equal(gap.visualForm, DESIGN_VISUAL_FORMS.TREE);
  assert.equal(gap.slot.growthStage, 'mature');
  assert.equal(gap.slot.phenology, 'vegetative');
  assert.ok(gap.missingRequired.some((r) => r.growthStage === 'young'));
  assert.equal(gap.designReady, false);
});

test('Catalog/Card photo stays a real plant photograph; Design uses a separate cutout', () => {
  const oliveMedia = seed.catalogMediaByCanonicalSlug.olive;
  assert.equal(oliveMedia.imageStatus, 'IMAGE_READY');
  assert.match(String(oliveMedia.primaryUrl || oliveMedia.url), /^https:\/\//);
  const card = withCanonicalCatalogMedia({ slug: 'olive' }, seed.catalogMediaByCanonicalSlug);
  const cardUrl = card.catalogMedia?.primaryUrl || card.media?.primaryUrl || card.catalogMedia?.url;
  assert.ok(cardUrl);
  const design = resolveDesignAsset({ canonicalSlug: 'olive', growthStage: 'mature' }, assetIndex);
  assert.equal(design.visualReady, true);
  assert.notEqual(design.url, cardUrl);
  assert.notEqual(design.file, cardUrl);
  assert.match(String(design.file), /olive-tree/);
  assert.equal(design.usedWebImage, false);
});

test('real catalog sample resolves roles without a cartesian explosion', () => {
  const reports = SAMPLE_SLUGS.map((slug) => {
    const plant = loadCatalogPlant(slug);
    assert.ok(plant, 'missing catalog plant ' + slug);
    const report = describePlantDesignPolicy(plant, assetIndex);
    assert.equal(report.canonicalSlug, slug === 'cypress' ? 'cypress' : slug);
    assert.ok(report.minimumRequiredDesignVariants.length < 48);
    assert.equal(report.cartesianForbidden, true);
    assert.equal(report.defaultVisualState.owned.growthStage, DESIGN_STAGE_UNSPECIFIED);
    assert.equal(report.defaultVisualState.proposed.growthStage, 'young');
    assert.equal(report.maturePreviewState.impliesCurrentSize, false);
    assert.notEqual(report.defaultVisualState.owned.growthStage, 'mature');
    return report;
  });

  const bySlug = Object.fromEntries(reports.map((r) => [r.canonicalSlug, r]));
  assert.equal(bySlug.olive.visualForm, DESIGN_VISUAL_FORMS.TREE);
  assert.ok(bySlug.olive.habitModifiers.includes(DESIGN_HABIT_MODIFIERS.EVERGREEN));
  assert.equal(bySlug.mango.visualForm, DESIGN_VISUAL_FORMS.TREE);
  assert.ok(bySlug.mango.habitModifiers.includes(DESIGN_HABIT_MODIFIERS.EVERGREEN));
  assert.equal(bySlug.banana.visualForm, DESIGN_VISUAL_FORMS.HERBACEOUS_CLUMP);
  assert.equal(bySlug.pineapple.visualForm, DESIGN_VISUAL_FORMS.ROSETTE);
  assert.equal(bySlug.apple.visualForm, DESIGN_VISUAL_FORMS.TREE);
  assert.ok(bySlug.apple.habitModifiers.includes(DESIGN_HABIT_MODIFIERS.DECIDUOUS));
  assert.equal(bySlug.lavender.visualForm, DESIGN_VISUAL_FORMS.SHRUB);
  assert.equal(bySlug.rosemary.visualForm, DESIGN_VISUAL_FORMS.SHRUB);
  assert.equal(bySlug['english-walnut'].visualForm, DESIGN_VISUAL_FORMS.TREE);
  assert.ok(bySlug['english-walnut'].habitModifiers.includes(DESIGN_HABIT_MODIFIERS.DECIDUOUS));
  assert.equal(bySlug['garden-peony'].visualForm, DESIGN_VISUAL_FORMS.UNKNOWN);
  assert.equal(bySlug['garden-peony'].lifecycle, DESIGN_LIFECYCLES.PERENNIAL);
  assert.equal(bySlug.carrot.visualForm, DESIGN_VISUAL_FORMS.UNKNOWN);
  assert.equal(bySlug.carrot.lifecycle, DESIGN_LIFECYCLES.BIENNIAL);
  assert.equal(bySlug.carrot.habitModifiers.includes(DESIGN_HABIT_MODIFIERS.WOODY), false);
  assert.ok(bySlug.carrot.purposeCapabilities.includes(DESIGN_PURPOSE_CAPABILITIES.EDIBLE));
  assert.equal(bySlug.broccoli.visualForm, DESIGN_VISUAL_FORMS.UNKNOWN);
  assert.equal(bySlug.broccoli.lifecycle, DESIGN_LIFECYCLES.BIENNIAL);
  assert.equal(bySlug.broccoli.habitModifiers.includes(DESIGN_HABIT_MODIFIERS.WOODY), false);
  assert.equal(bySlug['garden-peony'].habitModifiers.includes(DESIGN_HABIT_MODIFIERS.WOODY), false);
  assert.notEqual(bySlug.broccoli.visualForm, DESIGN_LIFECYCLES.ANNUAL);
  assert.equal(bySlug.cypress.visualForm, DESIGN_VISUAL_FORMS.TREE);
  assert.ok(bySlug.cypress.habitModifiers.includes(DESIGN_HABIT_MODIFIERS.EVERGREEN));
  assert.equal(bySlug.bougainvillea.visualForm, DESIGN_VISUAL_FORMS.CLIMBER);

  assert.ok(bySlug.apple.minimumRequiredDesignVariants.some((r) => r.phenology === 'dormant'));
  assert.equal(
    bySlug.olive.minimumRequiredDesignVariants.some((r) => r.phenology === 'dormant'),
    false
  );
  assert.equal(
    bySlug.cypress.minimumRequiredDesignVariants.some((r) => r.phenology === 'dormant'),
    false
  );
  assert.ok(bySlug.carrot.minimumRequiredDesignVariants.every((r) => r.phenology !== 'fruiting'));
  assert.equal(
    bySlug.banana.minimumRequiredDesignVariants.some((r) => r.phenology === 'fruiting'),
    false
  );
  assert.ok(bySlug.banana.optionalPurposeDrivenVariants.some((r) => r.phenology === 'fruiting'));
  assert.equal(
    bySlug['garden-peony'].minimumRequiredDesignVariants.some((r) => r.phenology === 'flowering'),
    false
  );
  assert.ok(bySlug['garden-peony'].optionalPurposeDrivenVariants.some((r) => r.phenology === 'flowering'));
  assert.equal(bySlug['garden-peony'].phenologyRequirement.defaultPhenology, 'vegetative');
  assert.equal(bySlug.olive.legacyForm, DESIGN_GROWTH_FORMS.EVERGREEN_TREE_SHRUB);
  assert.ok(bySlug.lavender.purposeCapabilities.includes(DESIGN_PURPOSE_CAPABILITIES.HERB_HARVEST));
  assert.ok(bySlug.lavender.optionalPurposeDrivenVariants.some((r) => r.phenology === 'flowering'));
  assert.ok(bySlug.rosemary.purposeCapabilities.includes(DESIGN_PURPOSE_CAPABILITIES.HERB_HARVEST));
  assert.ok(bySlug.apple.purposeCapabilities.includes(DESIGN_PURPOSE_CAPABILITIES.FRUITING_CROP));

  assert.equal(DESIGN_READY_DEFINITION.honestPlaceholderIsNotDesignReady, true);
  assert.equal(DESIGN_READY_DEFINITION.basedOnVisualMorphology, true);
  assert.equal(DESIGN_READY_DEFINITION.purposeDoesNotRedefineForm, true);
  assert.equal(DESIGN_TEMPORAL_VIEWS.NEAR_TERM.implemented, false);
  assert.equal(DESIGN_TEMPORAL_VIEWS.MATURE.yearsToMaturity, null);
  assert.equal(isDesignReady(loadCatalogPlant('olive'), assetIndex).ready, false);
  assert.equal(isDesignReady(loadCatalogPlant('mango'), assetIndex).ready, false);
});

test('iframe and host load the selection policy; no generation pipeline started', () => {
  const app = fs.readFileSync(APP, 'utf8');
  const gd = fs.readFileSync(GD, 'utf8');
  const sel = fs.readFileSync(SELECTION, 'utf8');
  assert.match(app, /garden-design-variant-selection-policy-v1\.js\?v=20260917a/);
  assert.match(gd, /garden-design-variant-selection-policy-v1\.js\?v=20260917a/);
  assert.match(app, /garden-design-variant-policy-v1\.js\?v=20260917a/);
  assert.doesNotMatch(sel, /stability|openai|replicate|anthropic/i);
  assert.equal(DESIGN_VARIANT_SELECTION_POLICY_VERSION, '1.2.0');
  assert.equal(ownedPlacementVisualDefaults().growthStage, DESIGN_STAGE_UNSPECIFIED);
  assert.equal(proposedPlacementVisualDefaults().growthStage, 'young');
  assert.equal(classifyDesignPlantRole(loadCatalogPlant('olive')), DESIGN_VISUAL_FORMS.TREE);
  assert.ok(requiredDesignVariantRoles(loadCatalogPlant('apple')).cartesianForbidden);
  assert.equal(paidNetwork, 0);
});

test('usage/purpose tags cannot override visual morphology', () => {
  const lavender = loadCatalogPlant('lavender');
  const morphology = classifyDesignVisualMorphology(lavender);
  const purpose = classifyDesignPurposeCapabilities(lavender);
  assert.equal(morphology.role, DESIGN_PLANT_ROLES.SHRUB);
  assert.notEqual(morphology.role, 'herb');
  assert.ok(purpose.capabilities.includes(DESIGN_PURPOSE_CAPABILITIES.HERB_HARVEST));
  assert.equal(purpose.overridesMorphology, false);
  assert.equal(SELECTION_FORBIDDEN.usageTagsDefinePhysicalMorphology, false);
  assert.equal(SELECTION_FORBIDDEN.purposeOverridesPhysicalForm, false);

  const purposeOnly = classifyDesignVisualMorphology({
    slug: 'purpose-only',
    tags: ['herb', 'edible', 'fruit', 'ornamental'],
    climateTraits: { groupIds: ['herb-edible', 'ornamental-flowering'] }
  });
  assert.equal(purposeOnly.role, DESIGN_PLANT_ROLES.UNKNOWN);
  assert.equal(purposeOnly.authority, DESIGN_MORPHOLOGY_AUTHORITY.UNKNOWN);

  const shrubWithHerb = classifyDesignVisualMorphology({
    slug: 'rosemary',
    tags: ['herb'],
    growth: 'Hardy aromatic evergreen shrub'
  });
  assert.equal(shrubWithHerb.role, DESIGN_PLANT_ROLES.SHRUB);
  assert.equal(shrubWithHerb.authority, DESIGN_MORPHOLOGY_AUTHORITY.CANONICAL_GROWTH_METADATA);

  const apple = loadCatalogPlant('apple');
  const applePlan = requiredDesignVariantRoles(apple);
  assert.equal(applePlan.visualForm, DESIGN_VISUAL_FORMS.TREE);
  assert.equal(applePlan.visualMorphologyRole, DESIGN_VISUAL_FORMS.TREE);
  assert.ok(applePlan.habitModifiers.includes(DESIGN_HABIT_MODIFIERS.DECIDUOUS));
  assert.ok(applePlan.purposeCapabilities.includes(DESIGN_PURPOSE_CAPABILITIES.FRUITING));
  assert.equal(applePlan.purposeDoesNotRedefineForm, true);
});

test('form, habit, and purpose stay separate on special cases', () => {
  const broccoli = classifyDesignVisualForm(loadCatalogPlant('broccoli'));
  assert.notEqual(broccoli.visualForm, 'annual');
  assert.notEqual(broccoli.visualForm, 'biennial');
  assert.equal(broccoli.lifecycle, DESIGN_LIFECYCLES.BIENNIAL);

  const carrot = classifyDesignVisualForm(loadCatalogPlant('carrot'));
  assert.notEqual(carrot.visualForm, 'vegetative_root_crop');
  assert.notEqual(carrot.visualForm, 'root');
  assert.ok(classifyDesignPurposeCapabilities(loadCatalogPlant('carrot')).edibleUseful);

  const peony = requiredDesignVariantRoles(loadCatalogPlant('garden-peony'));
  assert.notEqual(peony.visualForm, 'flowering_perennial');
  assert.equal(peony.lifecycle, DESIGN_LIFECYCLES.PERENNIAL);
  assert.ok(peony.purposeCapabilities.includes(DESIGN_PURPOSE_CAPABILITIES.FLOWERING_ORNAMENTAL));
  assert.equal(peony.roles.filter((r) => r.required !== false && r.phenology === 'flowering').length, 0);

  const apple = requiredDesignVariantRoles(loadCatalogPlant('apple'));
  assert.equal(apple.visualForm, DESIGN_VISUAL_FORMS.TREE);
  assert.ok(apple.habitModifiers.includes(DESIGN_HABIT_MODIFIERS.DECIDUOUS));
  assert.ok(apple.roles.some((r) => r.required !== false && r.phenology === 'dormant'));

  const banana = classifyDesignVisualForm(loadCatalogPlant('banana'));
  assert.equal(banana.visualForm, DESIGN_VISUAL_FORMS.HERBACEOUS_CLUMP);
  assert.ok(banana.habitModifiers.includes(DESIGN_HABIT_MODIFIERS.HERBACEOUS));
  assert.equal(classifyDesignPurposeCapabilities(loadCatalogPlant('banana')).herbHarvestUseful, false);
  assert.ok(classifyDesignPurposeCapabilities(loadCatalogPlant('banana')).fruitingUseful);

  const pineapple = classifyDesignVisualForm(loadCatalogPlant('pineapple'));
  assert.equal(pineapple.visualForm, DESIGN_VISUAL_FORMS.ROSETTE);
  assert.ok(classifyDesignPurposeCapabilities(loadCatalogPlant('pineapple')).fruitingUseful);

  const genericWoody = classifyDesignHabitModifiers({
    tags: ['biennial', 'vegetable', 'root'],
    growth: 'Woody landscape plant',
    care: { growth: 'Woody landscape plant' }
  });
  assert.equal(genericWoody.woody, false);
  assert.ok(genericWoody.modifiers.includes(DESIGN_HABIT_MODIFIERS.BIENNIAL));
  assert.equal(genericWoody.modifiers.includes(DESIGN_HABIT_MODIFIERS.WOODY), false);
});
