/**
 * frost-injury-to-frost-sensitivity-v1
 *
 * Deterministic transform: explicit frost/cold-injury source statements → frostSensitivity.
 * Requires direct injury / tender / kill language — NOT hardiness zone alone.
 */
import { EVIDENCE_CLASS } from './plant-data-contract-v1.js';
import { HARDINESS_CLAIM_TYPE } from './hardiness-evidence-claims-v1.js';

export const FROST_INJURY_TO_FROST_SENSITIVITY_ID = 'frost-injury-to-frost-sensitivity-v1';
export const FROST_INJURY_TO_FROST_SENSITIVITY_VERSION = '1.0.0';
export const FROST_INJURY_TO_FROST_SENSITIVITY_REF = `${FROST_INJURY_TO_FROST_SENSITIVITY_ID}@${FROST_INJURY_TO_FROST_SENSITIVITY_VERSION}`;

export const FROST_INJURY_REASON = Object.freeze({
  INJURY_MAPPED: 'frost_injury_mapped_to_frost_sensitivity',
  LATE_FROST_INSUFFICIENT_ALONE: 'late_frost_blossom_risk_needs_more_evidence',
  UNSUPPORTED_CLAIM: 'unsupported_or_missing_frost_injury_claim',
  ZONE_NOT_ACCEPTED: 'hardiness_zone_not_accepted_as_frost_injury'
});

const ACCEPTED = new Set([
  HARDINESS_CLAIM_TYPE.FROST_INJURY_STATEMENT,
  HARDINESS_CLAIM_TYPE.COLD_DAMAGE_THRESHOLD
]);

/**
 * Map damage mode → frostSensitivity ordinal (conservative).
 */
export function mapFrostDamageModeToSensitivity(damageMode) {
  switch (String(damageMode || '')) {
    case 'frost_tender':
      return { ok: true, value: 'very_high', reason: FROST_INJURY_REASON.INJURY_MAPPED };
    case 'killed_to_ground':
      return { ok: true, value: 'high', reason: FROST_INJURY_REASON.INJURY_MAPPED };
    case 'frost_sensitive':
      return { ok: true, value: 'high', reason: FROST_INJURY_REASON.INJURY_MAPPED };
    case 'late_frost_blossom_risk':
      // Blossom/late-frost risk alone is not enough for Class-A frost ordinal without broader injury stance
      return { ok: false, value: null, reason: FROST_INJURY_REASON.LATE_FROST_INSUFFICIENT_ALONE };
    default:
      return { ok: false, value: null, reason: FROST_INJURY_REASON.UNSUPPORTED_CLAIM };
  }
}

export function applyFrostInjuryToFrostSensitivity(sourceClaim) {
  const transformId = FROST_INJURY_TO_FROST_SENSITIVITY_ID;
  const transformVersion = FROST_INJURY_TO_FROST_SENSITIVITY_VERSION;
  const transformRef = FROST_INJURY_TO_FROST_SENSITIVITY_REF;

  if (!sourceClaim || !ACCEPTED.has(sourceClaim.claimType)) {
    return {
      ok: false,
      transformId,
      transformVersion,
      transformRef,
      outputs: [],
      reasons: [
        sourceClaim?.claimType === HARDINESS_CLAIM_TYPE.USDA_HARDINESS_ZONE_BAND
          ? FROST_INJURY_REASON.ZONE_NOT_ACCEPTED
          : FROST_INJURY_REASON.UNSUPPORTED_CLAIM
      ]
    };
  }

  const mapped = mapFrostDamageModeToSensitivity(sourceClaim.damageMode);
  if (!mapped.ok) {
    return {
      ok: false,
      transformId,
      transformVersion,
      transformRef,
      outputs: [],
      reasons: [mapped.reason]
    };
  }

  return {
    ok: true,
    transformId,
    transformVersion,
    transformRef,
    reasons: [mapped.reason],
    outputs: [
      {
        targetField: 'frostSensitivity',
        value: mapped.value,
        evidenceClass: EVIDENCE_CLASS.SOURCE_SUPPORTED,
        evidenceLineage: 'DERIVED_FROM_SOURCE_CLAIM_VIA_APPROVED_TRANSFORM',
        confidence: 'medium',
        transformReason: mapped.reason,
        sourceClaimRef: {
          claimType: sourceClaim.claimType,
          damageMode: sourceClaim.damageMode,
          minimumWinterTemperatureF: sourceClaim.minimumWinterTemperatureF ?? null,
          claimFingerprint: sourceClaim.claimFingerprint
        }
      }
    ]
  };
}

export const FROST_INJURY_TO_FROST_SENSITIVITY_CONTRACT = Object.freeze({
  transformId: FROST_INJURY_TO_FROST_SENSITIVITY_ID,
  transformVersion: FROST_INJURY_TO_FROST_SENSITIVITY_VERSION,
  transformRef: FROST_INJURY_TO_FROST_SENSITIVITY_REF,
  acceptedInputClaimTypes: [
    HARDINESS_CLAIM_TYPE.FROST_INJURY_STATEMENT,
    HARDINESS_CLAIM_TYPE.COLD_DAMAGE_THRESHOLD
  ],
  outputFields: ['frostSensitivity'],
  nonInput: ['usda_hardiness_zone_band'],
  applicability:
    'Explicit frost injury / kill / tender / sensitive wording with identity match. Hardiness zone alone is rejected.',
  mapping: Object.freeze({
    frost_tender: 'very_high',
    killed_to_ground: 'high',
    frost_sensitive: 'high',
    late_frost_blossom_risk: 'NEEDS_MORE_EVIDENCE'
  })
});
