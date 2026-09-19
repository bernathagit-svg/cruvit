/**
 * Multi-form plant architecture V1.
 * Form resolution before size enrichment.
 * Overlay only: does not mutate the production catalog or DESIGN_VISUAL_FORMS.
 * No generation. No spend.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DESIGN_VISUAL_FORMS } from '../garden-design-variant-policy-v1.js';

export const MULTI_FORM_PLANT_ARCHITECTURE_VERSION = 'multi-form-plant-architecture-v1';

export const ARCHITECTURE_CLASSES = Object.freeze({
  TRUE_DIFFERENT_PHYSICAL_FORM: 'TRUE_DIFFERENT_PHYSICAL_FORM',
  MULTI_FORM_TRAINING_DEPENDENT: 'MULTI_FORM_TRAINING_DEPENDENT'
});

export const ARCHITECTURE_MODES = Object.freeze({
  TREE: 'tree',
  SHRUB: 'shrub'
});

/** Proposed only. Not added to production DESIGN_VISUAL_FORMS. */
export const PROPOSED_VISUAL_FORMS = Object.freeze({
  HERBACEOUS_TREE_LIKE: 'herbaceous-tree-like'
});

function asText(value) {
  return String(value == null ? '' : value).trim();
}

export const PAPAYA_FORM_DECISION = Object.freeze({
  canonicalSlug: 'papaya',
  scientificName: 'Carica papaya',
  class: ARCHITECTURE_CLASSES.TRUE_DIFFERENT_PHYSICAL_FORM,
  currentCatalogVisualForm: DESIGN_VISUAL_FORMS.TREE,
  mustNotUseTreeRenderer: true,
  productionEnumAdded: false,
  productionCatalogMutated: false,
  auditedPhysicalForm: 'OTHER_SUPPORTED_FORM',
  proposedVisualForm: PROPOSED_VISUAL_FORMS.HERBACEOUS_TREE_LIKE,
  existingTaxonomy: Object.freeze({
    tree: 'rejected: woody trunked-canopy renderer',
    palm: 'rejected: frond/crownshaft architecture, not Caricaceae',
    'herbaceous-clump': 'rejected: typically solitary stem, not a clump of offsets/pups',
    'herbaceous-upright': 'rejected: wrong scale/anchor family for a giant pachycaul',
    'succulent-form': 'rejected: not a succulent-form renderer'
  }),
  smallestCompatibleExtension:
    'Keep DESIGN_VISUAL_FORMS unchanged. Propose herbaceous-tree-like as a future enum. Until owner approval, treat papaya as OTHER_SUPPORTED_FORM and keep it out of the tree engine.',
  gardenDesignBlocked: false,
  note: 'Giant herbaceous / pachycaul with a soft unbranched stem and a leaf crown. Tree-like silhouette is not woody tree architecture.'
});

function multiFormRecord(slug, scientificName, deciduous, reason) {
  return Object.freeze({
    canonicalSlug: slug,
    scientificName,
    class: ARCHITECTURE_CLASSES.MULTI_FORM_TRAINING_DEPENDENT,
    currentCatalogVisualForm: DESIGN_VISUAL_FORMS.TREE,
    supportedVisualForms: Object.freeze([ARCHITECTURE_MODES.TREE, ARCHITECTURE_MODES.SHRUB]),
    defaultArchitectureMode: null,
    botanicalDefaultExists: false,
    runtimeFallbackArchitectureMode: ARCHITECTURE_MODES.TREE,
    runtimeFallbackIsBotanicalTruth: false,
    userSelectable: true,
    futureUxLabels: Object.freeze({ tree: 'Tree form', shrub: 'Shrub form' }),
    deciduous,
    mustNotUseTreeRenderer: false,
    mustNotShareOneSizeRange: true,
    productionCatalogMutated: false,
    reason
  });
}

export const MULTI_FORM_ARCHITECTURE_CONTRACTS = Object.freeze({
  fig: multiFormRecord(
    'fig',
    'Ficus carica',
    true,
    'Woody plant that is legitimately a short multi-trunk tree or a large shrub depending on training, not a second species identity.'
  ),
  plumeria: multiFormRecord(
    'plumeria',
    'Plumeria rubra',
    true,
    'Pachycaul woody plant grown as a small tree or a branching shrub. Training-dependent, not a unique identity.'
  ),
  pomegranate: multiFormRecord(
    'pomegranate',
    'Punica granatum',
    true,
    'Typically multi-stemmed large shrub to small tree. Architecture mode is training/habit, not a second catalog plant.'
  ),
  quince: multiFormRecord(
    'quince',
    'Cydonia oblonga',
    true,
    'Large shrub or small multi-stemmed tree. Both architectures are valid for the same species.'
  ),
  'strawberry-guava': multiFormRecord(
    'strawberry-guava',
    'Psidium cattleyanum',
    false,
    'Evergreen shrub or small tree. Both architectures are valid for the same species.'
  )
});

export const IDENTITY_GAPS_CLOSED = Object.freeze(['melaleuca', 'oak-tree', 'pine-tree', 'plum']);

export const MULTI_FORM_ARCHITECTURE_CONTRACT = Object.freeze({
  version: MULTI_FORM_PLANT_ARCHITECTURE_VERSION,
  canonicalIdentityRemainsOnePlant: true,
  architectureModeDoesNotCreateSecondIdentity: true,
  purposeDoesNotDefineForm: true,
  pruningDoesNotOverwriteBotanicalIdentity: true,
  gardenDesignBlockedWhenMultiForm: false,
  uiRedesignNow: false,
  productionCatalogMutated: false,
  sizeEnrichmentExecuted: false,
  applyMigrationNow: false,
  productionVisualFormEnumExtended: false
});

export function lookupPlantArchitectureContract(canonicalSlug) {
  const slug = asText(canonicalSlug).toLowerCase();
  if (slug === PAPAYA_FORM_DECISION.canonicalSlug) return PAPAYA_FORM_DECISION;
  return MULTI_FORM_ARCHITECTURE_CONTRACTS[slug] || null;
}

export function resolveArchitectureMode(input = {}) {
  const slug = asText(input.canonicalSlug).toLowerCase();
  const contract = lookupPlantArchitectureContract(slug);
  const requested = asText(input.architectureMode).toLowerCase();
  if (!contract) {
    return {
      canonicalSlug: slug,
      architectureMode: requested || null,
      visualForm: asText(input.visualForm) || null,
      multiForm: false,
      usedRuntimeFallback: false,
      gardenDesignBlocked: false
    };
  }
  if (contract.class === ARCHITECTURE_CLASSES.TRUE_DIFFERENT_PHYSICAL_FORM) {
    return {
      canonicalSlug: slug,
      architectureMode: null,
      visualForm: contract.proposedVisualForm,
      multiForm: false,
      usedRuntimeFallback: false,
      gardenDesignBlocked: false,
      mustNotUseTreeRenderer: true
    };
  }
  const supported = contract.supportedVisualForms || [];
  if (requested && supported.includes(requested)) {
    return {
      canonicalSlug: slug,
      architectureMode: requested,
      visualForm: requested,
      multiForm: true,
      usedRuntimeFallback: false,
      botanicalDefault: false,
      gardenDesignBlocked: false
    };
  }
  return {
    canonicalSlug: slug,
    architectureMode: contract.runtimeFallbackArchitectureMode,
    visualForm: contract.runtimeFallbackArchitectureMode,
    multiForm: true,
    usedRuntimeFallback: true,
    runtimeFallbackIsBotanicalTruth: false,
    botanicalDefault: false,
    gardenDesignBlocked: false
  };
}

export function mayUseTreePhysicalScale(input = {}) {
  const slug = asText(input.canonicalSlug).toLowerCase();
  const catalogForm = asText(input.visualForm) || DESIGN_VISUAL_FORMS.TREE;
  const resolved = resolveArchitectureMode(input);
  if (resolved.mustNotUseTreeRenderer) {
    return {
      ok: false,
      code: 'NOT_TREE_FORM',
      visualForm: resolved.visualForm,
      architectureMode: resolved.architectureMode,
      gardenDesignBlocked: false,
      note: 'Papaya must not use TREE rendering rules.'
    };
  }
  if (resolved.multiForm && resolved.architectureMode !== ARCHITECTURE_MODES.TREE) {
    return {
      ok: false,
      code: 'NOT_TREE_FORM',
      visualForm: resolved.visualForm,
      architectureMode: resolved.architectureMode,
      gardenDesignBlocked: false,
      note: 'Multi-form plant is in shrub architectureMode. Tree engine does not apply.'
    };
  }
  if (catalogForm !== DESIGN_VISUAL_FORMS.TREE && resolved.architectureMode !== ARCHITECTURE_MODES.TREE) {
    return {
      ok: false,
      code: 'NOT_TREE_FORM',
      visualForm: catalogForm,
      architectureMode: resolved.architectureMode,
      gardenDesignBlocked: false,
      note: 'Tree physical-scale V1 does not copy tree rules to other visualForm values.'
    };
  }
  return {
    ok: true,
    code: 'TREE_SCALE_ALLOWED',
    visualForm: DESIGN_VISUAL_FORMS.TREE,
    architectureMode: resolved.architectureMode || ARCHITECTURE_MODES.TREE,
    canonicalSlug: slug,
    gardenDesignBlocked: false
  };
}

function dormantRole(deciduous) {
  return deciduous
    ? {
        growthStage: 'mature',
        season: 'winter',
        phenology: 'dormant',
        required: true,
        reason: 'deciduous habit: winter dormant asset'
      }
    : null;
}

function architectureAssetName(slug, architectureMode, growthStage, phenology) {
  return `${slug}-${architectureMode}-${growthStage}-${phenology}-v1`;
}

export function candidateArchitectureVariantRequirements(canonicalSlug) {
  const slug = asText(canonicalSlug).toLowerCase();
  if (slug === PAPAYA_FORM_DECISION.canonicalSlug) {
    return {
      canonicalSlug: slug,
      generateNow: false,
      productionEnumRequiredFirst: true,
      proposedVisualForm: PROPOSED_VISUAL_FORMS.HERBACEOUS_TREE_LIKE,
      required: [
        { assetName: 'papaya-young-vegetative-v1', growthStage: 'young', phenology: 'vegetative', architectureMode: null },
        { assetName: 'papaya-mature-vegetative-v1', growthStage: 'mature', phenology: 'vegetative', architectureMode: null }
      ]
    };
  }
  const contract = MULTI_FORM_ARCHITECTURE_CONTRACTS[slug];
  if (!contract) return { canonicalSlug: slug, generateNow: false, required: [] };
  const required = [];
  for (const mode of contract.supportedVisualForms) {
    const youngView = mode === ARCHITECTURE_MODES.SHRUB ? 'compact' : 'default';
    const matureView = mode === ARCHITECTURE_MODES.TREE ? 'leafy' : 'default';
    required.push({
      assetName: architectureAssetName(slug, mode, 'young', 'vegetative'),
      architectureMode: mode,
      growthStage: 'young',
      phenology: 'vegetative',
      formView: youngView,
      reason: `${mode} establishment form`
    });
    required.push({
      assetName: architectureAssetName(slug, mode, 'mature', 'vegetative'),
      architectureMode: mode,
      growthStage: 'mature',
      phenology: 'vegetative',
      formView: matureView,
      reason: `${mode} mature architecture`
    });
    const dormant = dormantRole(contract.deciduous);
    if (dormant) {
      required.push({
        assetName: architectureAssetName(slug, mode, 'mature', 'dormant'),
        architectureMode: mode,
        ...dormant
      });
    }
  }
  return {
    canonicalSlug: slug,
    generateNow: false,
    secondCatalogIdentity: false,
    required
  };
}

export function formAwareSizeEvidenceTemplate(canonicalSlug) {
  const slug = asText(canonicalSlug).toLowerCase();
  const contract = lookupPlantArchitectureContract(slug);
  if (slug === PAPAYA_FORM_DECISION.canonicalSlug) {
    return {
      canonicalSlug: slug,
      sharedRangeForbidden: true,
      scenarios: Object.freeze({
        [PROPOSED_VISUAL_FORMS.HERBACEOUS_TREE_LIKE]: {
          matureHeight: 'UNKNOWN',
          matureSpread: 'UNKNOWN',
          mayInventMeters: false
        }
      })
    };
  }
  if (!contract || contract.class !== ARCHITECTURE_CLASSES.MULTI_FORM_TRAINING_DEPENDENT) return null;
  return {
    canonicalSlug: slug,
    sharedRangeForbidden: true,
    scenarios: Object.freeze({
      tree: { matureHeight: 'UNKNOWN', matureSpread: 'UNKNOWN', mayInventMeters: false },
      shrub: { matureHeight: 'UNKNOWN', matureSpread: 'UNKNOWN', mayInventMeters: false }
    }),
    note: 'Do not store one mature size range as if it applies equally to tree and shrub architecture.'
  };
}

export const TREE_SIZE_EVIDENCE_ELIGIBLE = Object.freeze([
  'almond',
  'apple',
  'apricot',
  'avocado',
  'blue-gum',
  'breadfruit',
  'cacao',
  'carob',
  'cedar',
  'cherimoya',
  'cypress',
  'durian',
  'english-walnut',
  'ficus-benjamina',
  'fiddle-leaf-fig',
  'ginkgo',
  'grapefruit',
  'guava',
  'jaboticaba',
  'jackfruit',
  'japanese-maple',
  'lemon',
  'longan',
  'loquat',
  'lychee',
  'mandarin',
  'mango',
  'mangosteen',
  'moringa',
  'olive',
  'orange',
  'peach',
  'pear',
  'persimmon',
  'pistachio',
  'rambutan',
  'silver-birch',
  'southern-magnolia',
  'starfruit',
  'sweet-cherry',
  'sweet-orange',
  'white-sapote'
]);

export function treeSizeEvidenceEligibleSlugs() {
  return [...TREE_SIZE_EVIDENCE_ELIGIBLE];
}

export function buildMultiFormPlantArchitectureReport() {
  const eligible = treeSizeEvidenceEligibleSlugs();
  const multiForm = Object.keys(MULTI_FORM_ARCHITECTURE_CONTRACTS).sort();
  return {
    contract: MULTI_FORM_ARCHITECTURE_CONTRACT,
    papayaFormDecision: PAPAYA_FORM_DECISION,
    multiFormPlants: Object.values(MULTI_FORM_ARCHITECTURE_CONTRACTS),
    runtimeArchitectureMode: {
      sameCanonicalSlugDifferentArchitectureMode: true,
      affectsDesignAssetSelection: true,
      affectsPhysicalScaleEngine: true,
      affectsGroundAnchor: true,
      affectsMatureSizeScenario: true,
      affectsFutureVariantRequirements: true,
      createsSecondCatalogIdentity: false
    },
    defaultBehavior: {
      evidenceBackedDefaultOnlyWhenClear: true,
      multiFormDefault: null,
      runtimeFallback: ARCHITECTURE_MODES.TREE,
      runtimeFallbackIsBotanicalTruth: false,
      gardenDesignBlocked: false,
      uiRedesignNow: false
    },
    formAwareSizeEvidence: {
      papaya: formAwareSizeEvidenceTemplate('papaya'),
      multiForm: multiForm.map((slug) => formAwareSizeEvidenceTemplate(slug))
    },
    designAssetImpact: {
      currentDerivationUsesSingleVisualForm: true,
      generateNow: false,
      candidateRequirements: ['papaya', ...multiForm].map((slug) => candidateArchitectureVariantRequirements(slug))
    },
    treeSizeEvidenceEligible: eligible,
    multiFormSizeEvidenceRequired: multiForm,
    nonTreeFormSizeEvidenceRequired: [PAPAYA_FORM_DECISION.canonicalSlug],
    identityGaps: IDENTITY_GAPS_CLOSED,
    mangoState: {
      scale: 'PHYSICAL_SCALE_DIRECTION_VALIDATED',
      architecture: 'ARCHITECTURE_REGEN_CANDIDATE',
      ownerPreferredRangePosition: 'LOW',
      botanicalTruthModified: false
    },
    genericTreeScaleContract: {
      universalTreeSize: false,
      gardenDesignWorksWithUnknown: true
    },
    spend: { openaiCalls: 0, imageGeneration: 0, additionalSpendUsd: 0 },
    productionCatalogMutated: false,
    sizeEnrichmentExecuted: false
  };
}

export function writeMultiFormPlantArchitectureReports(root) {
  const dir = path.join(root, 'data', 'garden-design', 'multi-form-plant-architecture-v1');
  fs.mkdirSync(dir, { recursive: true });
  const report = buildMultiFormPlantArchitectureReport();
  const reportPath = path.join(dir, 'multi-form-plant-architecture-v1.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { reportPath, spend: report.spend, productionCatalogMutated: false };
}
