/**
 * Spend-eligibility blocks. Uses identity precision (taxonomic vs visual).
 * Genus-level is not an automatic spend block.
 */
import { DESIGN_STAGE_UNSPECIFIED } from '../garden-design-variant-policy-v1.js';
import { classifyIdentityPrecision, IDENTITY_PRECISION } from './identity-precision-v1.js';

export function classifySpendBlock(plant = {}, demand = {}, role = null) {
  const reasons = [];
  const metadataFix = [];
  const precision = classifyIdentityPrecision(plant, demand, role);

  if (demand.morphologyUnknown || demand.visualForm === 'unknown') {
    if (!reasons.includes('UNKNOWN-morphology')) {
      reasons.push('UNKNOWN-morphology');
      metadataFix.push('Add source-supported visualForm and habit modifiers (tree/shrub/rosette/clump/etc.).');
    }
  }

  const unspecified =
    role
      ? !role.growthStage || role.growthStage === DESIGN_STAGE_UNSPECIFIED
      : (demand.requiredVariants || []).some(
          (v) => !v.growthStage || v.growthStage === DESIGN_STAGE_UNSPECIFIED
        );
  if (unspecified) {
    reasons.push('variant-ambiguity');
    metadataFix.push('Resolve morphology so required variants have explicit growthStage values.');
  }

  if (!precision.generationEligible) {
    if (precision.reason && !reasons.includes(precision.reason)) reasons.push(precision.reason);
    if (precision.metadataFix && !metadataFix.includes(precision.metadataFix)) {
      metadataFix.push(precision.metadataFix);
    }
  }

  const blocked = !precision.generationEligible || reasons.includes('UNKNOWN-morphology') || reasons.includes('variant-ambiguity');
  return {
    blocked,
    reasons,
    metadataFix,
    primaryReason: reasons[0] || null,
    identityPrecision: precision.identityPrecision || IDENTITY_PRECISION.IDENTITY_UNKNOWN,
    provenanceRequired: precision.provenanceRequired || null
  };
}
