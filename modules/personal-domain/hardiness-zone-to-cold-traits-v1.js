/**
 * hardiness-zone-to-cold-traits-v1
 *
 * Deterministic transform: USDA hardiness zone band → coldTolerance ONLY.
 * Does NOT output frostSensitivity (zone ≠ frost injury semantics).
 *
 * Retriever extracts claims; this contract normalizes authorized derived traits.
 */
import { EVIDENCE_CLASS } from './plant-data-contract-v1.js';
import {
  HARDINESS_CLAIM_TYPE,
  HARDINESS_ZONE_SYSTEM
} from './hardiness-evidence-claims-v1.js';

export const HARDINESS_ZONE_TO_COLD_TRAITS_ID = 'hardiness-zone-to-cold-traits-v1';
export const HARDINESS_ZONE_TO_COLD_TRAITS_VERSION = '1.0.0';
export const HARDINESS_ZONE_TO_COLD_TRAITS_REF = `${HARDINESS_ZONE_TO_COLD_TRAITS_ID}@${HARDINESS_ZONE_TO_COLD_TRAITS_VERSION}`;

export const HARDINESS_ZONE_TO_COLD_REASON = Object.freeze({
  ZONE_BAND_MAPPED: 'zone_band_mapped_to_cold_tolerance',
  UNSUPPORTED_CLAIM_TYPE: 'unsupported_claim_type',
  MISSING_ZONE_BOUNDS: 'missing_zone_bounds',
  UNSUPPORTED_ZONE_SYSTEM: 'unsupported_zone_system',
  FROST_NOT_AUTHORIZED_FROM_ZONE: 'frost_sensitivity_not_authorized_from_zone_alone'
});

/**
 * Accepted input: usda_hardiness_zone_band claim with min/max + USDA system.
 */
export function isAcceptedHardinessZoneClaim(sourceClaim) {
  if (!sourceClaim || typeof sourceClaim !== 'object') return false;
  if (sourceClaim.claimType !== HARDINESS_CLAIM_TYPE.USDA_HARDINESS_ZONE_BAND) return false;
  if (sourceClaim.hardinessZoneSystem !== HARDINESS_ZONE_SYSTEM.USDA) return false;
  const min = Number(sourceClaim.hardinessZoneMin);
  const max = Number(sourceClaim.hardinessZoneMax);
  return Number.isFinite(min) && Number.isFinite(max) && min >= 1 && max <= 13 && min <= max;
}

/**
 * Deterministic coldTolerance ordinal from USDA min zone (winter hardiness proxy).
 * Conservative CRUVIT ordinals — interpretive, versioned, auditable.
 */
export function mapUsdaMinZoneToColdTolerance(minZ) {
  const z = Number(minZ);
  if (!Number.isFinite(z)) return null;
  if (z <= 4) return 'high';
  if (z <= 6) return 'medium';
  if (z <= 8) return 'low';
  return 'very_low';
}

/**
 * Apply transform. Outputs coldTolerance only.
 * frostSensitivity is explicitly unsupported from zone alone.
 */
export function applyHardinessZoneToColdTraits(sourceClaim, options = {}) {
  const transformId = HARDINESS_ZONE_TO_COLD_TRAITS_ID;
  const transformVersion = HARDINESS_ZONE_TO_COLD_TRAITS_VERSION;
  const transformRef = HARDINESS_ZONE_TO_COLD_TRAITS_REF;

  if (!isAcceptedHardinessZoneClaim(sourceClaim)) {
    return {
      ok: false,
      transformId,
      transformVersion,
      transformRef,
      outputs: [],
      reasons: [
        !sourceClaim
          ? HARDINESS_ZONE_TO_COLD_REASON.MISSING_ZONE_BOUNDS
          : sourceClaim.claimType !== HARDINESS_CLAIM_TYPE.USDA_HARDINESS_ZONE_BAND
            ? HARDINESS_ZONE_TO_COLD_REASON.UNSUPPORTED_CLAIM_TYPE
            : sourceClaim.hardinessZoneSystem !== HARDINESS_ZONE_SYSTEM.USDA
              ? HARDINESS_ZONE_TO_COLD_REASON.UNSUPPORTED_ZONE_SYSTEM
              : HARDINESS_ZONE_TO_COLD_REASON.MISSING_ZONE_BOUNDS
      ],
      frostSensitivity: {
        authorized: false,
        reason: HARDINESS_ZONE_TO_COLD_REASON.FROST_NOT_AUTHORIZED_FROM_ZONE
      }
    };
  }

  const coldTolerance = mapUsdaMinZoneToColdTolerance(sourceClaim.hardinessZoneMin);
  const reason = HARDINESS_ZONE_TO_COLD_REASON.ZONE_BAND_MAPPED;

  /** Derived field retains SOURCE_SUPPORTED lineage via transform provenance (not literal source ordinal). */
  const derivedEvidenceClass = EVIDENCE_CLASS.SOURCE_SUPPORTED;

  return {
    ok: true,
    transformId,
    transformVersion,
    transformRef,
    reasons: [reason],
    frostSensitivity: {
      authorized: false,
      reason: HARDINESS_ZONE_TO_COLD_REASON.FROST_NOT_AUTHORIZED_FROM_ZONE
    },
    outputs: [
      {
        targetField: 'coldTolerance',
        value: coldTolerance,
        evidenceClass: derivedEvidenceClass,
        evidenceLineage: 'DERIVED_FROM_SOURCE_CLAIM_VIA_APPROVED_TRANSFORM',
        confidence: options.confidence || 'medium',
        transformReason: reason,
        sourceClaimRef: {
          claimType: sourceClaim.claimType,
          hardinessZoneMin: sourceClaim.hardinessZoneMin,
          hardinessZoneMax: sourceClaim.hardinessZoneMax,
          hardinessZoneSystem: sourceClaim.hardinessZoneSystem,
          claimFingerprint: sourceClaim.claimFingerprint
        }
      }
    ]
  };
}

export const HARDINESS_ZONE_TO_COLD_TRAITS_CONTRACT = Object.freeze({
  transformId: HARDINESS_ZONE_TO_COLD_TRAITS_ID,
  transformVersion: HARDINESS_ZONE_TO_COLD_TRAITS_VERSION,
  transformRef: HARDINESS_ZONE_TO_COLD_TRAITS_REF,
  acceptedInputClaimTypes: [HARDINESS_CLAIM_TYPE.USDA_HARDINESS_ZONE_BAND],
  outputFields: ['coldTolerance'],
  nonOutputFields: ['frostSensitivity'],
  applicability:
    'USDA Plant Hardiness Zone band from Tier-A-eligible source with identity match and supporting hardiness excerpt.',
  evidenceSemantics:
    'Raw zone band may be SOURCE_SUPPORTED as the hardiness claim. coldTolerance is DERIVED_FROM_SOURCE_CLAIM_VIA_APPROVED_TRANSFORM and may retain SOURCE_SUPPORTED lineage only when transformId/version are attached. Zone alone never authorizes frostSensitivity.',
  mapping: Object.freeze({
    minZone_le_4: 'coldTolerance=high',
    minZone_le_6: 'coldTolerance=medium',
    minZone_le_8: 'coldTolerance=low',
    minZone_gt_8: 'coldTolerance=very_low'
  })
});
