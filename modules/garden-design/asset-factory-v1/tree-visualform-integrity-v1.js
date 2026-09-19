/**
 * Tree visualForm integrity audit V1.
 * Botanical architecture, not commercial category or lifecycle.
 * Does not mutate the production catalog. No size enrichment. No spend.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DESIGN_VISUAL_FORMS } from '../garden-design-variant-policy-v1.js';
import { auditCatalogTrees } from './tree-catalog-size-audit-v1.js';
import {
  GENERIC_TREE_SCALE_CONTRACT,
  MANGO_ASSET_STATUS,
  MANGO_GARDEN_DESIGN_PREFERENCE
} from './generic-tree-physical-scale-v1.js';

export const TREE_VISUALFORM_INTEGRITY_VERSION = 'tree-visualform-integrity-v1';

export const AUDITED_PHYSICAL_FORMS = Object.freeze({
  TREE: 'TREE',
  PALM: 'PALM',
  SHRUB: 'SHRUB',
  TREE_OR_SHRUB: 'TREE_OR_SHRUB',
  HERBACEOUS_CLUMP: 'HERBACEOUS_CLUMP',
  ROSETTE: 'ROSETTE',
  CLIMBER: 'CLIMBER',
  OTHER_SUPPORTED_FORM: 'OTHER_SUPPORTED_FORM',
  IDENTITY_TOO_BROAD: 'IDENTITY_TOO_BROAD',
  UNKNOWN: 'UNKNOWN'
});

export const TREE_FORM_ACTIONS = Object.freeze({
  KEEP_TREE: 'KEEP_TREE',
  FORM_REVIEW_REQUIRED: 'FORM_REVIEW_REQUIRED',
  IDENTITY_REVIEW_REQUIRED: 'IDENTITY_REVIEW_REQUIRED'
});

const KEEP_TREE_HIGH = Object.freeze([
  ['almond', 'Prunus dulcis', 'Woody deciduous nut tree with a trunked canopy.'],
  ['apple', 'Malus domestica', 'Woody deciduous fruit tree.'],
  ['apricot', 'Prunus armeniaca', 'Woody deciduous stone-fruit tree.'],
  ['avocado', 'Persea americana', 'Woody evergreen fruit tree.'],
  ['cacao', 'Theobroma cacao', 'Woody tropical understory tree.'],
  ['cedar', 'Cedrus libani', 'Woody conifer tree.'],
  ['cherimoya', 'Annona cherimola', 'Woody subtropical fruit tree.'],
  ['cypress', 'Cupressus sempervirens', 'Woody columnar/evergreen conifer tree.'],
  ['ficus-benjamina', 'Ficus benjamina', 'Woody evergreen tree. Indoor use is purpose, not form.'],
  ['ginkgo', 'Ginkgo biloba', 'Woody temperate tree.'],
  ['guava', 'Psidium guajava', 'Woody small evergreen fruit tree.'],
  ['jackfruit', 'Artocarpus heterophyllus', 'Large woody evergreen tropical tree.'],
  ['japanese-maple', 'Acer palmatum', 'Woody ornamental tree, including small-stature cultivars.'],
  ['lemon', 'Citrus × limon', 'Woody evergreen citrus tree.'],
  ['lychee', 'Litchi chinensis', 'Woody evergreen subtropical fruit tree.'],
  ['mandarin', 'Citrus reticulata', 'Woody evergreen citrus tree.'],
  ['mango', 'Mangifera indica', 'Woody tropical/subtropical fruit tree. Calibration reference.'],
  ['moringa', 'Moringa oleifera', 'Woody fast-growing tree.'],
  ['olive', 'Olea europaea', 'Woody evergreen Mediterranean tree.'],
  ['orange', 'Citrus sinensis', 'Woody evergreen citrus tree.'],
  ['peach', 'Prunus persica', 'Woody deciduous stone-fruit tree.'],
  ['pear', 'Pyrus communis', 'Woody deciduous fruit tree.'],
  ['pistachio', 'Pistacia vera', 'Woody deciduous nut tree.'],
  ['rambutan', 'Nephelium lappaceum', 'Woody evergreen tropical fruit tree.'],
  ['starfruit', 'Averrhoa carambola', 'Woody evergreen tropical fruit tree.']
]);

const KEEP_TREE_MEDIUM = Object.freeze([
  ['blue-gum', 'Eucalyptus globulus', 'Woody eucalypt tree. Catalog growth copy is generic "Tree".'],
  ['breadfruit', 'Artocarpus altilis', 'Woody tropical tree. Catalog growth copy is generic woody landscape text.'],
  ['carob', 'Ceratonia siliqua', 'Woody Mediterranean tree. Catalog growth copy is generic "Tree".'],
  ['durian', 'Durio zibethinus', 'Woody tropical tree. Catalog growth copy is generic woody landscape text.'],
  ['english-walnut', 'Juglans regia', 'Woody temperate nut tree. Catalog growth copy is generic "Tree".'],
  ['fiddle-leaf-fig', 'Ficus lyrata', 'Botanically a woody tree. Houseplant/patio use is purpose, not form.'],
  ['grapefruit', 'Citrus × paradisi', 'Woody evergreen citrus tree. Catalog growth copy is generic woody landscape text.'],
  ['jaboticaba', 'Plinia cauliflora', 'Woody small cauliflorous tree. Catalog growth copy is generic.'],
  ['longan', 'Dimocarpus longan', 'Woody subtropical fruit tree. Catalog growth copy is generic.'],
  ['loquat', 'Eriobotrya japonica', 'Woody evergreen small tree. Catalog growth copy is generic.'],
  ['mangosteen', 'Garcinia mangostana', 'Woody tropical tree. Catalog growth copy is generic.'],
  ['persimmon', 'Diospyros kaki', 'Woody fruit tree. Catalog growth copy is generic.'],
  ['silver-birch', 'Betula pendula', 'Woody temperate tree. Catalog growth copy is generic "Tree".'],
  ['southern-magnolia', 'Magnolia grandiflora', 'Woody evergreen tree. Catalog growth copy is generic "Tree".'],
  ['sweet-cherry', 'Prunus avium', 'Woody temperate fruit tree. Catalog growth copy is generic.'],
  ['sweet-orange', 'Citrus × sinensis', 'Woody evergreen citrus tree. Catalog growth copy is generic.'],
  ['white-sapote', 'Casimiroa edulis', 'Woody subtropical fruit tree. Catalog growth copy is generic.']
]);

const FORM_REVIEW = Object.freeze([
  [
    'papaya',
    'Carica papaya',
    AUDITED_PHYSICAL_FORMS.OTHER_SUPPORTED_FORM,
    'high',
    'Giant herbaceous / pachycaul plant with a soft unbranched stem. Not a woody tree. Catalog called it a "soft-stemmed tree" from commercial category, not woody architecture.'
  ],
  [
    'plumeria',
    'Plumeria rubra',
    AUDITED_PHYSICAL_FORMS.TREE_OR_SHRUB,
    'medium',
    'Deciduous tropical shrub or small pachycaul tree. Catalog growth already says shrub or small tree.'
  ],
  [
    'pomegranate',
    'Punica granatum',
    AUDITED_PHYSICAL_FORMS.TREE_OR_SHRUB,
    'high',
    'Typically a multi-stemmed large shrub to small tree. Catalog growth says fruit tree or large shrub. Tree tag is commercial, not exclusive architecture.'
  ],
  [
    'strawberry-guava',
    'Psidium cattleyanum',
    AUDITED_PHYSICAL_FORMS.TREE_OR_SHRUB,
    'high',
    'Evergreen shrub or small tree. Catalog tags include both tree and shrub.'
  ],
  [
    'quince',
    'Cydonia oblonga',
    AUDITED_PHYSICAL_FORMS.TREE_OR_SHRUB,
    'medium',
    'Typically a large shrub or small multi-stemmed tree. Catalog tree tag plus generic woody copy is not enough to lock the tree renderer.'
  ],
  [
    'fig',
    'Ficus carica',
    AUDITED_PHYSICAL_FORMS.TREE_OR_SHRUB,
    'medium',
    'Commonly a short multi-trunk large shrub or small tree. Orchard "fruit tree" label must not auto-select the tree renderer.'
  ]
]);

const IDENTITY_REVIEW = Object.freeze([
  [
    'melaleuca',
    'Melaleuca spp.',
    'Genus includes shrubs and trees. No species-level meter range until identity scope is resolved.'
  ],
  [
    'oak-tree',
    'Quercus spp.',
    'Genus-level oak identity. Typical architecture is tree, but species is unresolved. No species-level meter range.'
  ],
  [
    'pine-tree',
    'Pinus spp.',
    'Genus-level pine identity. Typical architecture is tree, but species is unresolved. No species-level meter range.'
  ],
  [
    'plum',
    'Prunus spp.',
    'Genus includes trees and shrubs. Catalog "fruit tree" copy is not species identity. No species-level meter range.'
  ]
]);

function keepRow(slug, scientificName, confidence, reason) {
  return {
    canonicalSlug: slug,
    expectedScientificName: scientificName,
    auditedPhysicalForm: AUDITED_PHYSICAL_FORMS.TREE,
    confidence,
    action: TREE_FORM_ACTIONS.KEEP_TREE,
    reason,
    sizeEvidenceEligible: true
  };
}

export const TREE_VISUALFORM_INTEGRITY_TABLE = Object.freeze(
  Object.fromEntries(
    [
      ...KEEP_TREE_HIGH.map(([slug, scientific, reason]) => keepRow(slug, scientific, 'high', reason)),
      ...KEEP_TREE_MEDIUM.map(([slug, scientific, reason]) => keepRow(slug, scientific, 'medium', reason)),
      ...FORM_REVIEW.map(([slug, scientific, form, confidence, reason]) => ({
        canonicalSlug: slug,
        expectedScientificName: scientific,
        auditedPhysicalForm: form,
        confidence,
        action: TREE_FORM_ACTIONS.FORM_REVIEW_REQUIRED,
        reason,
        sizeEvidenceEligible: false
      })),
      ...IDENTITY_REVIEW.map(([slug, scientific, reason]) => ({
        canonicalSlug: slug,
        expectedScientificName: scientific,
        auditedPhysicalForm: AUDITED_PHYSICAL_FORMS.IDENTITY_TOO_BROAD,
        confidence: 'high',
        action: TREE_FORM_ACTIONS.IDENTITY_REVIEW_REQUIRED,
        reason,
        sizeEvidenceEligible: false
      }))
    ].map((row) => [row.canonicalSlug, Object.freeze(row)])
  )
);

export function auditTreeVisualFormIntegrity(root) {
  const catalog = auditCatalogTrees(root);
  const missingFromTable = catalog.trees
    .map((row) => row.canonicalSlug)
    .filter((slug) => !TREE_VISUALFORM_INTEGRITY_TABLE[slug]);
  const extraInTable = Object.keys(TREE_VISUALFORM_INTEGRITY_TABLE).filter(
    (slug) => !catalog.trees.some((row) => row.canonicalSlug === slug)
  );
  if (missingFromTable.length || extraInTable.length) {
    throw new Error(
      `Tree visualForm integrity table mismatch. missing=${missingFromTable.join(',')} extra=${extraInTable.join(',')}`
    );
  }

  const records = catalog.trees.map((tree) => {
    const locked = TREE_VISUALFORM_INTEGRITY_TABLE[tree.canonicalSlug];
    return {
      canonicalSlug: tree.canonicalSlug,
      scientificName: tree.scientificName,
      currentVisualForm: tree.visualForm,
      auditedPhysicalForm: locked.auditedPhysicalForm,
      confidence: locked.confidence,
      evidenceIdentityScope: tree.identityReasons.includes('identityScope-genus') ? 'genus' : 'species',
      catalogIdentityReasons: tree.identityReasons,
      action: locked.action,
      sizeEvidenceEligible: locked.action === TREE_FORM_ACTIONS.KEEP_TREE && !tree.identityReasons.length,
      catalogMutated: false,
      reason: locked.reason
    };
  });

  const byAction = (action) => records.filter((row) => row.action === action).map((row) => row.canonicalSlug);
  const eligible = records.filter((row) => row.sizeEvidenceEligible).map((row) => row.canonicalSlug);

  return {
    contract: TREE_VISUALFORM_INTEGRITY_VERSION,
    catalogMutated: false,
    sizeEnrichmentExecuted: false,
    productionRegistryChanged: false,
    applyMigrationNow: false,
    purposeDoesNotDetermineVisualForm: true,
    formBeforeSize: true,
    treeCount: records.length,
    keepTree: byAction(TREE_FORM_ACTIONS.KEEP_TREE),
    formReviewRequired: byAction(TREE_FORM_ACTIONS.FORM_REVIEW_REQUIRED),
    identityReviewRequired: byAction(TREE_FORM_ACTIONS.IDENTITY_REVIEW_REQUIRED),
    treeSizeEvidenceEligible: eligible,
    mangoState: {
      scale: MANGO_ASSET_STATUS.scale,
      architecture: MANGO_ASSET_STATUS.architecture,
      ownerPreferredRangePosition: MANGO_GARDEN_DESIGN_PREFERENCE.ownerPreferredRangePosition,
      regenerateNow: false,
      botanicalTruthModified: false
    },
    genericTreeScaleContract: {
      universalTreeSize: GENERIC_TREE_SCALE_CONTRACT.universalTreeSize,
      gardenDesignWorksWithUnknown: GENERIC_TREE_SCALE_CONTRACT.gardenDesignWorksWithUnknown
    },
    records,
    spend: { openaiCalls: 0, imageGeneration: 0, additionalSpendUsd: 0 }
  };
}

export function writeTreeVisualFormIntegrityReports(root) {
  const dir = path.join(root, 'data', 'garden-design', 'tree-visualform-integrity-v1');
  fs.mkdirSync(dir, { recursive: true });
  const audit = auditTreeVisualFormIntegrity(root);
  const auditPath = path.join(dir, 'tree-visualform-integrity-v1.json');
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
  return { auditPath, treeCount: audit.treeCount, spend: audit.spend, catalogMutated: false };
}
