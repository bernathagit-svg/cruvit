/**
 * Canonical catalog audit for visualForm=tree physical-scale readiness.
 * Does not invent dimensions. No spend. No production catalog write.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DESIGN_VISUAL_FORMS } from '../garden-design-variant-policy-v1.js';
import { deriveVariantDemand } from './variant-demand-v1.js';
import { loadCanonicalCatalog } from './catalog-source-v1.js';
import { DIMENSION_EVIDENCE, classifyCatalogDimensionEvidence } from './physical-scale-foundation-v1.js';
import {
  CALIBRATION_BOTANICAL_SIZE_EVIDENCE,
  EVIDENCE_SCOPE,
  SIZE_SCENARIOS,
  lookupCalibrationSizeEvidence
} from './physical-scale-evidence-v1.js';
import {
  GENERIC_TREE_PHYSICAL_SCALE_VERSION,
  GENERIC_TREE_SCALE_CONTRACT,
  MANGO_ASSET_STATUS,
  MANGO_GARDEN_DESIGN_PREFERENCE,
  TREE_PHYSICAL_SCALE_CLASSES,
  mangoDimensionLeak
} from './generic-tree-physical-scale-v1.js';

export const TREE_CATALOG_AUDIT_VERSION = 'tree-catalog-size-audit-v1';

function asText(value) {
  return String(value == null ? '' : value).trim();
}

function identityGapReasons(plant, demand) {
  const reasons = [];
  if (!asText(plant.scientific || plant.acceptedScientificName)) reasons.push('scientificName-missing');
  if (plant.identityScope === 'genus') reasons.push('identityScope-genus');
  if (plant.duplicateConflict === true) reasons.push('duplicate-conflict');
  if (demand.morphologyUnknown) reasons.push('morphology-unknown');
  return reasons;
}

function sourcePresent(evidence) {
  return Boolean(
    evidence &&
      evidence.mayDrivePhysicalMeterPreview &&
      evidence.evidenceClass === DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE
  );
}

export function classifyCatalogTreePhysicalScale(plant, demand, catalogEvidence) {
  const identityReasons = identityGapReasons(plant, demand);
  if (identityReasons.length) {
    return { class: TREE_PHYSICAL_SCALE_CLASSES.IDENTITY_GAP, identityReasons };
  }
  if (sourcePresent(catalogEvidence)) {
    return { class: TREE_PHYSICAL_SCALE_CLASSES.PHYSICAL_SCALE_READY, identityReasons: [] };
  }
  return { class: TREE_PHYSICAL_SCALE_CLASSES.SIZE_EVIDENCE_GAP, identityReasons: [] };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

export function auditCatalogTrees(root) {
  const catalog = loadCanonicalCatalog(root);
  const seedRaw = readJson(path.join(root, 'data', 'plants.seed.json'));
  const seedList = Array.isArray(seedRaw) ? seedRaw : seedRaw.plants || [];
  const seedBySlug = new Map();
  for (const row of seedList) {
    const slug = asText(row.slug || row.canonicalSlug).toLowerCase();
    if (slug) seedBySlug.set(slug, row);
  }
  const trees = [];
  for (const plant of catalog.plants) {
    const seed = seedBySlug.get(plant.canonicalSlug) || {};
    const merged = {
      ...seed,
      ...plant,
      gardenCompatibility: seed.gardenCompatibility || plant.gardenCompatibility,
      climateTraits: seed.climateTraits || plant.climateTraits,
      tags: plant.tags && plant.tags.length ? plant.tags : seed.tags || [],
      growth: plant.growth || seed.growth || seed.care?.growth || ''
    };
    const demand = deriveVariantDemand(merged);
    if (demand.visualForm !== DESIGN_VISUAL_FORMS.TREE) continue;
    const catalogEvidence = classifyCatalogDimensionEvidence(merged, {
      visualForm: DESIGN_VISUAL_FORMS.TREE,
      growthStage: 'mature',
      librarySizeCopy: merged.care?.size
    });
    const calibration = lookupCalibrationSizeEvidence(plant.canonicalSlug, {
      growthStage: 'mature',
      sizeScenario: SIZE_SCENARIOS.NATURAL_MATURE
    });
    const classified = classifyCatalogTreePhysicalScale(merged, demand, catalogEvidence);
    const stages = [...new Set((demand.requiredVariants || []).map((row) => row.growthStage).filter(Boolean))];
    trees.push({
      canonicalSlug: plant.canonicalSlug,
      scientificName: plant.acceptedScientificName || plant.scientific || null,
      visualForm: DESIGN_VISUAL_FORMS.TREE,
      morphologyAuthority: demand.morphologyAuthority,
      currentGrowthStageSupport: stages,
      matureHeightEvidenceState: catalogEvidence.heightM ? catalogEvidence.evidenceClass : DIMENSION_EVIDENCE.UNKNOWN,
      matureSpreadEvidenceState: catalogEvidence.spreadM ? catalogEvidence.evidenceClass : DIMENSION_EVIDENCE.UNKNOWN,
      evidenceScope: catalogEvidence.evidenceScope || (sourcePresent(catalogEvidence) ? EVIDENCE_SCOPE.SPECIES_GENERAL : null),
      sourcePresent: sourcePresent(catalogEvidence) ? 'YES' : 'NO',
      catalogClass: classified.class,
      identityReasons: classified.identityReasons,
      calibrationPackPresent: Boolean(calibration && calibration.mayDrivePhysicalMeterPreview),
      mangoDimensionsCopied: mangoDimensionLeak(plant.canonicalSlug, catalogEvidence) || mangoDimensionLeak(plant.canonicalSlug, calibration || {}),
      inventedDimensions: false
    });
  }
  trees.sort((a, b) => a.canonicalSlug.localeCompare(b.canonicalSlug));
  const byClass = (klass) => trees.filter((row) => row.catalogClass === klass).map((row) => row.canonicalSlug);
  return {
    contract: TREE_CATALOG_AUDIT_VERSION,
    visualForm: DESIGN_VISUAL_FORMS.TREE,
    treeCount: trees.length,
    physicalScaleReady: byClass(TREE_PHYSICAL_SCALE_CLASSES.PHYSICAL_SCALE_READY),
    sizeEvidenceGaps: byClass(TREE_PHYSICAL_SCALE_CLASSES.SIZE_EVIDENCE_GAP),
    identityGaps: byClass(TREE_PHYSICAL_SCALE_CLASSES.IDENTITY_GAP),
    engineReadyCalibrationOnly: trees
      .filter((row) => row.calibrationPackPresent && row.catalogClass !== TREE_PHYSICAL_SCALE_CLASSES.PHYSICAL_SCALE_READY)
      .map((row) => row.canonicalSlug),
    mangoDimensionLeaks: trees.filter((row) => row.mangoDimensionsCopied).map((row) => row.canonicalSlug),
    inventedDimensions: false,
    massCatalogEnrichment: false,
    trees,
    spend: { openaiCalls: 0, imageGeneration: 0, additionalSpendUsd: 0 }
  };
}

export function buildGenericTreePhysicalScaleReport(root) {
  const audit = auditCatalogTrees(root);
  const mango = CALIBRATION_BOTANICAL_SIZE_EVIDENCE.mango;
  return {
    contract: GENERIC_TREE_PHYSICAL_SCALE_VERSION,
    genericTreeScaleContract: GENERIC_TREE_SCALE_CONTRACT,
    mangoValidation: {
      ownerPreferredRangePosition: MANGO_GARDEN_DESIGN_PREFERENCE.ownerPreferredRangePosition,
      physicalScaleDirectionValidated: true,
      botanicalHeightRangeM: mango.heightM,
      botanicalSpreadRangeM: mango.spreadM,
      botanicalTruthModified: false,
      assetStatus: MANGO_ASSET_STATUS
    },
    ownerDesignPreference: MANGO_GARDEN_DESIGN_PREFERENCE,
    treeCatalogAudit: {
      treeCount: audit.treeCount,
      physicalScaleReadyCount: audit.physicalScaleReady.length,
      sizeEvidenceGapCount: audit.sizeEvidenceGaps.length,
      identityGapCount: audit.identityGaps.length,
      engineReadyCalibrationOnly: audit.engineReadyCalibrationOnly,
      mangoDimensionLeaks: audit.mangoDimensionLeaks
    },
    nextDataStep:
      'Add species-specific SOURCE_SUPPORTED_RANGE mature height/spread for SIZE_EVIDENCE_GAP trees. Do not copy Mango LOW. Do not pay for botanical acquisition until the owner approves a separate evidence task. Cultivar evidence may later override species range.',
    otherForms: {
      palm: 'not inherited',
      shrub: 'not inherited',
      climber: 'not inherited',
      'herbaceous-clump': 'not inherited',
      rosette: 'not inherited',
      'succulent-form': 'not inherited',
      'crop/subshrub': 'not inherited'
    },
    spend: { openaiCalls: 0, imageGeneration: 0, additionalSpendUsd: 0 },
    productionRegistryChanged: false
  };
}

export function writeGenericTreePhysicalScaleReports(root) {
  const dir = path.join(root, 'data', 'garden-design', 'generic-tree-physical-scale-v1');
  fs.mkdirSync(dir, { recursive: true });
  const audit = auditCatalogTrees(root);
  const summary = buildGenericTreePhysicalScaleReport(root);
  const auditPath = path.join(dir, 'tree-catalog-size-audit-v1.json');
  const summaryPath = path.join(dir, 'generic-tree-physical-scale-v1.json');
  const preferencePath = path.join(dir, 'mango-garden-design-preference-v1.json');
  fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(
    preferencePath,
    `${JSON.stringify({ ...MANGO_GARDEN_DESIGN_PREFERENCE, evidenceScope: EVIDENCE_SCOPE.SPECIES_GENERAL }, null, 2)}\n`
  );
  return { auditPath, summaryPath, preferencePath, treeCount: audit.treeCount, spend: audit.spend };
}
