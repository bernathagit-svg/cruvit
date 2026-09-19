/**
 * Generic tree physical-scale engine V1.
 * visualForm determines HOW a tree is rendered.
 * Botanical evidence determines HOW LARGE that specific tree can become.
 * No universal tree size. No Mango dimension copy. Browser-safe. No spend.
 */
import { DESIGN_VISUAL_FORMS } from '../garden-design-variant-policy-v1.js';
import {
  DIMENSION_EVIDENCE,
  PHYSICAL_SCALE_RENDERING_INVARIANTS,
  computePhysicalSceneScale
} from './physical-scale-foundation-v1.js';
import {
  CALIBRATION_BOTANICAL_SIZE_EVIDENCE,
  EVIDENCE_SCOPE,
  RANGE_BANDS,
  SIZE_SCENARIOS,
  resolvePhysicalScaleEvidence
} from './physical-scale-evidence-v1.js';

export const GENERIC_TREE_PHYSICAL_SCALE_VERSION = 'generic-tree-physical-scale-v1';
export const OWNER_SIZE_PREFERENCE_STORAGE_KEY = 'cruvit:garden-design-owner-size-preference-v1';

export const TREE_SIZE_EVIDENCE_PRECEDENCE = Object.freeze([
  'CULTIVAR_SPECIFIC_SOURCE',
  'SPECIES_SOURCE_SUPPORTED_RANGE',
  'USER_CONFIRMED',
  'UNKNOWN'
]);

export const TREE_PHYSICAL_SCALE_CLASSES = Object.freeze({
  PHYSICAL_SCALE_READY: 'PHYSICAL_SCALE_READY',
  SIZE_EVIDENCE_GAP: 'SIZE_EVIDENCE_GAP',
  IDENTITY_GAP: 'IDENTITY_GAP'
});

export const GENERIC_TREE_SCALE_CONTRACT = Object.freeze({
  version: GENERIC_TREE_PHYSICAL_SCALE_VERSION,
  visualFormDeterminesHowRendered: true,
  botanicalEvidenceDeterminesHowLarge: true,
  universalTreeSize: false,
  mangoLowCopiedToOtherTrees: false,
  speciesSpecificDimensionsRequired: true,
  gardenDesignWorksWithUnknown: true,
  otherFormsInheritTreeRules: false,
  firstValidatedForm: DESIGN_VISUAL_FORMS.TREE,
  sizeEvidencePrecedence: TREE_SIZE_EVIDENCE_PRECEDENCE,
  rendering: PHYSICAL_SCALE_RENDERING_INVARIANTS,
  mangoBotanicalTruthImmutable: true,
  inferDimensionsFromVisualForm: false
});

export const MANGO_GARDEN_DESIGN_PREFERENCE = Object.freeze({
  contract: 'garden-design-owner-size-preference-v1',
  scope: 'specific-garden-design',
  canonicalSlug: 'mango',
  visualForm: DESIGN_VISUAL_FORMS.TREE,
  ownerPreferredRangePosition: RANGE_BANDS.LOW,
  physicalScaleDirectionValidated: true,
  architectureRegenCandidate: true,
  modifiesSourceMatureHeightRange: false,
  modifiesSourceMatureSpreadRange: false,
  writesProductionCatalog: false,
  appliesToOtherTrees: false,
  appliesToOtherUsers: false,
  appliesToOtherGardenDesigns: false,
  applyMigrationNow: false,
  note: 'Owner preferred LOW for this Garden Design context. Not a universal Mango default. Not botanical source truth.'
});

export const MANGO_ASSET_STATUS = Object.freeze({
  scale: 'PHYSICAL_SCALE_DIRECTION_VALIDATED',
  architecture: 'ARCHITECTURE_REGEN_CANDIDATE',
  regenerateNow: false,
  reason:
    'LOW was the best-looking size in this Garden photo. At LOW height the current canopy may still be narrower than source-supported mature spread. Do not regenerate now. Do not treat this as a scale-engine failure.'
});

function asText(value) {
  return String(value == null ? '' : value).trim();
}

function sameRange(a, b) {
  if (!a || !b) return false;
  return Number(a.min) === Number(b.min) && Number(a.max) === Number(b.max);
}

export function mangoDimensionLeak(canonicalSlug, evidence = {}) {
  const slug = asText(canonicalSlug).toLowerCase();
  if (slug === 'mango') return false;
  const mango = CALIBRATION_BOTANICAL_SIZE_EVIDENCE.mango;
  return sameRange(evidence.heightM, mango.heightM) || sameRange(evidence.spreadM, mango.spreadM);
}

export function classifyTreeSizePrecedence(evidence = {}) {
  if (evidence.evidenceScope === EVIDENCE_SCOPE.CULTIVAR_SPECIFIC && evidence.mayDrivePhysicalMeterPreview) {
    return 'CULTIVAR_SPECIFIC_SOURCE';
  }
  if (
    evidence.evidenceClass === DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE &&
    evidence.mayDrivePhysicalMeterPreview
  ) {
    return 'SPECIES_SOURCE_SUPPORTED_RANGE';
  }
  if (evidence.evidenceClass === DIMENSION_EVIDENCE.USER_CONFIRMED && evidence.mayDrivePhysicalMeterPreview) {
    return 'USER_CONFIRMED';
  }
  return 'UNKNOWN';
}

export function computeTreePhysicalScale(input = {}) {
  const visualForm = asText(input.visualForm) || DESIGN_VISUAL_FORMS.TREE;
  if (visualForm !== DESIGN_VISUAL_FORMS.TREE) {
    return {
      ok: false,
      code: 'NOT_TREE_FORM',
      visualForm,
      gardenDesignBlocked: false,
      note: 'Tree physical-scale V1 does not copy tree rules to other visualForm values.'
    };
  }
  const slug = asText(input.canonicalSlug).toLowerCase();
  const resolved = resolvePhysicalScaleEvidence({
    canonicalSlug: slug,
    plant: input.plant || {},
    visualForm: DESIGN_VISUAL_FORMS.TREE,
    growthStage: input.growthStage || 'mature',
    sizeScenario: input.sizeScenario || SIZE_SCENARIOS.NATURAL_MATURE,
    userConfirmed: input.userConfirmed,
    librarySizeCopy: input.librarySizeCopy
  });
  if (mangoDimensionLeak(slug, resolved)) {
    return {
      ok: false,
      code: 'MANGO_DIMENSION_LEAK',
      canonicalSlug: slug,
      gardenDesignBlocked: false,
      note: 'Never copy Mango dimensions to another tree.'
    };
  }
  const lockedBand = RANGE_BANDS[asText(input.rangeBand).toUpperCase()];
  const designBand = RANGE_BANDS[asText(input.ownerPreferredRangePosition).toUpperCase()];
  const rangeBand = lockedBand || designBand || RANGE_BANDS.MID;
  const scale = computePhysicalSceneScale({
    ...input,
    visualForm: DESIGN_VISUAL_FORMS.TREE,
    canonicalSlug: slug,
    resolvedEvidence: resolved,
    rangeBand,
    sizeScenario: input.sizeScenario || SIZE_SCENARIOS.NATURAL_MATURE
  });
  const unknown = !resolved.mayDrivePhysicalMeterPreview;
  return {
    ok: true,
    code: unknown ? 'TREE_SCALE_UNKNOWN_USABLE' : 'TREE_SCALE_READY',
    contract: GENERIC_TREE_SCALE_CONTRACT,
    canonicalSlug: slug,
    visualForm: DESIGN_VISUAL_FORMS.TREE,
    sizeEvidencePrecedence: classifyTreeSizePrecedence(resolved),
    botanicalEvidenceClass: resolved.evidenceClass,
    evidenceScope: resolved.evidenceScope || null,
    botanicalHeightRangeM: resolved.heightM || null,
    botanicalSpreadRangeM: resolved.spreadM || null,
    ownerPreferredRangePosition: designBand || null,
    rangeBand,
    mangoHardCoded: false,
    mangoDimensionCopied: false,
    universalTreeSize: false,
    gardenDesignBlocked: false,
    displayHeightM: scale.displayHeightM,
    label: unknown ? 'Estimated size' : scale.label,
    usedInventedMeters: false,
    fitToFrame: false,
    clippingAllowed: true,
    usedVisibleAlphaBbox: true,
    scale
  };
}
