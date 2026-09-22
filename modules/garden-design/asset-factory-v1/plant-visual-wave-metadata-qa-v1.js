/**
 * Wave metadata QA V1.
 * Pure/local. Verifies that a requested visual state is supported by the
 * canonical catalog demand. It does NOT claim that generated pixels visually
 * prove botanical identity/state; those remain visual QA gates.
 */
import { deriveVisualStateRequirements } from './design-asset-visual-states-v1.js';
import { variantMatchesRole } from './gap-detector-v1.js';

export const PLANT_VISUAL_WAVE_METADATA_QA_VERSION = 'plant-visual-wave-metadata-qa-v1';

function text(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

function targetRole(row = {}) {
  return {
    growthStage: row.growthStage || 'unspecified',
    phenology: row.phenology || row.phenologyState || 'vegetative',
    phenologyState: row.phenologyState || row.phenology || 'vegetative',
    architectureMode: row.architectureMode || null,
    formView: row.formView || null
  };
}

export function assessWaveMetadataQa(plant = {}, row = {}) {
  const req = deriveVisualStateRequirements(plant);
  const reasons = [];
  const role = targetRole(row);

  if (text(req.canonicalSlug) !== text(row.canonicalSlug)) {
    reasons.push('CANONICAL_IDENTITY_MISMATCH');
  }
  if (req.generationBlocked === true) {
    reasons.push(...(req.identityBlockers || ['GENERATION_BLOCKED']));
  }
  if (req.visualForm && row.visualForm && text(req.visualForm) !== text(row.visualForm)) {
    reasons.push('VISUAL_FORM_METADATA_MISMATCH');
  }

  const requiredMatch = (req.requiredVariants || []).some((v) => variantMatchesRole(v, role));
  if (!requiredMatch) reasons.push('REQUESTED_STATE_NOT_REQUIRED_BY_CANONICAL_DEMAND');

  return Object.freeze({
    version: PLANT_VISUAL_WAVE_METADATA_QA_VERSION,
    jobId: row.jobId || null,
    canonicalSlug: row.canonicalSlug || null,
    result: reasons.length ? 'FAIL' : 'PASS',
    requiredStateConfirmed: requiredMatch,
    visualFormConfirmed: !reasons.includes('VISUAL_FORM_METADATA_MISMATCH'),
    identityMetadataConfirmed: !reasons.includes('CANONICAL_IDENTITY_MISMATCH'),
    reasons,
    pixelIdentityVisuallyConfirmed: false,
    pixelArchitectureVisuallyConfirmed: false,
    pixelGrowthStageVisuallyConfirmed: false,
    pixelPhenologyVisuallyConfirmed: false,
    visualQaStillRequired: true,
    paidCalls: 0,
    networkCalls: 0
  });
}

export const PLANT_VISUAL_WAVE_METADATA_QA_GOVERNANCE = Object.freeze({
  metadataMayValidateDemand: true,
  metadataMayProvePixelIdentity: false,
  metadataMayProvePixelState: false,
  unknownAllowed: true,
  noSilentVisualPass: true,
  paidCalls: 0,
  networkCalls: 0
});
