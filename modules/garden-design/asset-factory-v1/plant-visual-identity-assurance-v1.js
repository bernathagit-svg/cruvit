/**
 * Plant Visual Identity Assurance V1.
 *
 * Scalable botanical identity assurance for generated cutouts.
 * A pixel model often cannot prove species-level identity among visually similar
 * taxa. That must not turn every valid asset into permanent owner review.
 *
 * This contract separates:
 * 1) canonical generation provenance (what identity the job was generated for),
 * 2) visual contradiction screening (does the image visibly contradict it?),
 * 3) species-level visual proof (optional, rarely possible).
 *
 * UNKNOWN visual proof is allowed. It is never silently rewritten to PASS.
 */
export const PLANT_VISUAL_IDENTITY_ASSURANCE_VERSION = 'plant-visual-identity-assurance-v1';

function text(v) {
  return String(v == null ? '' : v).trim();
}

function verdict(v) {
  const x = text(v).toUpperCase();
  return ['PASS','FAIL','UNCERTAIN'].includes(x) ? x : 'UNCERTAIN';
}

export function assessIdentityAssurance(input = {}) {
  const canonicalSlug = text(input.canonicalSlug);
  const scientific = text(input.scientific);
  const sourceSha256 = text(input.sourceSha256).toLowerCase();
  const expectedSha256 = text(input.expectedSha256).toLowerCase();
  const generationJobId = text(input.generationJobId);
  const modelIdentity = verdict(input.modelIdentityVerdict);
  const modelReason = text(input.modelIdentityReason);

  const reasons = [];
  if (!canonicalSlug) reasons.push('CANONICAL_SLUG_MISSING');
  if (!scientific) reasons.push('SCIENTIFIC_IDENTITY_MISSING');
  if (!generationJobId) reasons.push('GENERATION_JOB_ID_MISSING');
  if (!sourceSha256 || !expectedSha256 || sourceSha256 !== expectedSha256) {
    reasons.push('SOURCE_CHECKSUM_NOT_BOUND_TO_GENERATION_JOB');
  }

  const provenanceBound = reasons.length === 0;
  const visibleContradiction = modelIdentity === 'FAIL';
  const visuallyProven = modelIdentity === 'PASS';
  const visuallyUncertain = modelIdentity === 'UNCERTAIN';

  let assuranceState = 'HOLD';
  let promotionIdentityGate = 'HOLD';

  if (!provenanceBound) {
    assuranceState = 'PROVENANCE_INCOMPLETE';
  } else if (visibleContradiction) {
    assuranceState = 'VISUAL_CONTRADICTION';
  } else if (visuallyProven) {
    assuranceState = 'PROVENANCE_PLUS_VISUAL_PASS';
    promotionIdentityGate = 'PASS';
  } else if (visuallyUncertain) {
    assuranceState = 'PROVENANCE_BOUND_NO_VISUAL_CONTRADICTION';
    promotionIdentityGate = 'PASS_WITH_DISCLOSED_VISUAL_UNCERTAINTY';
  }

  return Object.freeze({
    version: PLANT_VISUAL_IDENTITY_ASSURANCE_VERSION,
    canonicalSlug,
    scientific,
    provenanceBound,
    visibleContradiction,
    visuallyProven,
    visuallyUncertain,
    modelIdentityVerdict: modelIdentity,
    modelIdentityReason: modelReason || null,
    assuranceState,
    promotionIdentityGate,
    ownerReviewRequired:
      !provenanceBound
      || visibleContradiction,
    speciesLevelVisualProofClaimed: visuallyProven,
    speciesLevelVisualProofUnknown: visuallyUncertain,
    silentGuessing: false,
    reasons
  });
}

export const PLANT_VISUAL_IDENTITY_ASSURANCE_GOVERNANCE = Object.freeze({
  exactCanonicalGenerationProvenanceRequired: true,
  sourceChecksumBindingRequired: true,
  modelVisualContradictionBlocksPromotion: true,
  modelUncertainDoesNotBecomeVisualPass: true,
  visualUncertaintyMayBeDisclosedAndAcceptedWithBoundProvenance: true,
  speciesVisualProofNotRequiredWhenNotObservable: true,
  ownerReviewTargetsContradictionsAndBrokenProvenanceOnly: true,
  silentGuessingForbidden: true
});
