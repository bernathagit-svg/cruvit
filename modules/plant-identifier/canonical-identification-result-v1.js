/**
 * CRUVIT — Canonical Identification Result Contract V1
 *
 * Pure, fail-closed envelope between validated identification evidence and
 * future UI / Save consumers. This module performs no I/O and resolves no
 * identity by itself.
 */

export const CANONICAL_IDENTIFICATION_RESULT_VERSION = '1.0.0';

export const IDENTIFICATION_RESULT_STATUSES = Object.freeze([
  'identified',
  'ambiguous',
  'unknown',
  'needs_confirmation',
  'blocked'
]);

export const IDENTITY_RESOLUTION_STATUSES = Object.freeze([
  'resolved_id',
  'resolved_canonical',
  'pending_conflict',
  'ambiguous',
  'provisional',
  'unresolved'
]);

const PUBLIC_STATUS_SET = new Set(IDENTIFICATION_RESULT_STATUSES);
const RESOLUTION_STATUS_SET = new Set(IDENTITY_RESOLUTION_STATUSES);
const IDENTIFIED_RESOLUTION_SET = new Set(['resolved_id', 'resolved_canonical']);

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function boolOrNull(value) {
  return typeof value === 'boolean' ? value : null;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function diagnosticClone(value, depth = 0, seen = new WeakSet()) {
  if (depth > 6) return '[depth-limit]';
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return String(value);
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    const out = value.map(item => diagnosticClone(item, depth + 1, seen));
    seen.delete(value);
    return out;
  }
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const cloned = diagnosticClone(value[key], depth + 1, seen);
    if (cloned !== undefined) out[key] = cloned;
  }
  seen.delete(value);
  return out;
}

function normalizedResolution(input) {
  const r = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const status = text(r.status);
  return {
    status: RESOLUTION_STATUS_SET.has(status) ? status : 'unresolved',
    canonicalSlug: text(r.canonicalSlug),
    plantId: text(r.plantId),
    matchedBy: text(r.matchedBy) || null,
    needsReview: r.needsReview === true,
    conflictActive: r.conflictActive === true || !!r.conflict
  };
}

function normalizedCatalog(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      present: false,
      authority: null,
      validation: 'missing',
      canonicalSlug: '',
      scientificName: '',
      commonName: '',
      needsReview: null,
      conflictActive: null
    };
  }
  const validation = text(input.validation);
  return {
    present: true,
    authority: text(input.authority) || null,
    validation: validation || 'unknown',
    canonicalSlug: text(input.canonicalSlug || input.slug),
    scientificName: text(input.scientificName || input.scientific_name),
    commonName: text(input.commonName || input.common_name || input.name),
    needsReview: boolOrNull(input.needsReview),
    conflictActive: input.conflictActive === true || input.activeConflict === true || !!input.conflict
  };
}

function providerEvidenceEnvelope(raw) {
  return {
    scope: 'provider_evidence_only',
    uiCertified: false,
    canonicalAuthority: false,
    data: raw == null ? null : diagnosticClone(raw)
  };
}

function requestedStatus(input) {
  const s = text(input?.status);
  return PUBLIC_STATUS_SET.has(s) ? s : 'unknown';
}

function failClosedStatus(requested, resolution, catalog) {
  if (resolution.status === 'pending_conflict' || resolution.conflictActive || catalog.conflictActive === true) {
    return 'blocked';
  }
  if (resolution.status === 'ambiguous') return 'ambiguous';
  if (resolution.status === 'provisional' || resolution.needsReview || catalog.needsReview === true) {
    return 'needs_confirmation';
  }
  if (requested !== 'identified' && PUBLIC_STATUS_SET.has(requested)) return requested;
  if (catalog.present && catalog.validation === 'failed') return 'blocked';
  return 'unknown';
}

function identifiedGate(resolution, catalog) {
  const reasons = [];
  if (!IDENTIFIED_RESOLUTION_SET.has(resolution.status)) reasons.push('resolution_not_authoritative');
  if (!resolution.canonicalSlug) reasons.push('canonical_slug_missing');
  if (resolution.status === 'resolved_id' && !resolution.plantId) reasons.push('resolved_id_without_plant_id');
  if (resolution.needsReview) reasons.push('resolution_needs_review');
  if (resolution.conflictActive) reasons.push('resolution_conflict_active');

  if (!catalog.present) reasons.push('catalog_authority_missing');
  if (catalog.authority !== 'catalog_plants') reasons.push('catalog_authority_invalid');
  if (catalog.validation !== 'passed') reasons.push('catalog_validation_not_passed');
  if (catalog.needsReview === true) reasons.push('catalog_needs_review');
  if (catalog.conflictActive === true) reasons.push('catalog_conflict_active');
  if (!catalog.canonicalSlug) reasons.push('catalog_canonical_slug_missing');
  if (resolution.canonicalSlug && catalog.canonicalSlug && resolution.canonicalSlug !== catalog.canonicalSlug) {
    reasons.push('canonical_slug_mismatch');
  }
  if (!catalog.scientificName) reasons.push('canonical_scientific_name_missing');
  if (!catalog.commonName) reasons.push('canonical_common_name_missing');

  return { ok: reasons.length === 0, reasons };
}

/**
 * @param {object|null|undefined} input validated evidence supplied by callers.
 * @returns {Readonly<object>} immutable, UI/save-safe result.
 *
 * This function never throws for malformed caller input; invalid evidence
 * collapses to a non-saveable fail-closed state.
 */
export function createCanonicalIdentificationResult(input) {
  try {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const requested = requestedStatus(source);
    const resolution = normalizedResolution(source.resolution);
    const catalog = normalizedCatalog(source.catalog);
    const providerEvidence = providerEvidenceEnvelope(source.providerEvidence);

    if (requested === 'identified') {
      const gate = identifiedGate(resolution, catalog);
      if (gate.ok) {
        return deepFreeze({
          contractVersion: CANONICAL_IDENTIFICATION_RESULT_VERSION,
          status: 'identified',
          canonicalSlug: catalog.canonicalSlug,
          plantId: resolution.status === 'resolved_id' ? resolution.plantId : null,
          scientificName: catalog.scientificName,
          commonName: catalog.commonName,
          identityConfirmed: true,
          saveEligible: true,
          resolution: {
            status: resolution.status,
            matchedBy: resolution.matchedBy,
            needsReview: false,
            conflictActive: false
          },
          catalogAuthority: {
            authority: 'catalog_plants',
            validation: 'passed',
            needsReview: false,
            conflictActive: false
          },
          providerEvidence,
          reasons: Object.freeze([])
        });
      }

      return deepFreeze({
        contractVersion: CANONICAL_IDENTIFICATION_RESULT_VERSION,
        status: failClosedStatus(requested, resolution, catalog),
        canonicalSlug: null,
        plantId: null,
        scientificName: null,
        commonName: null,
        identityConfirmed: false,
        saveEligible: false,
        resolution: {
          status: resolution.status,
          matchedBy: resolution.matchedBy,
          needsReview: resolution.needsReview,
          conflictActive: resolution.conflictActive
        },
        catalogAuthority: {
          authority: catalog.authority,
          validation: catalog.validation,
          needsReview: catalog.needsReview,
          conflictActive: catalog.conflictActive
        },
        providerEvidence,
        reasons: Object.freeze(gate.reasons.slice())
      });
    }

    return deepFreeze({
      contractVersion: CANONICAL_IDENTIFICATION_RESULT_VERSION,
      status: failClosedStatus(requested, resolution, catalog),
      canonicalSlug: null,
      plantId: null,
      scientificName: null,
      commonName: null,
      identityConfirmed: false,
      saveEligible: false,
      resolution: {
        status: resolution.status,
        matchedBy: resolution.matchedBy,
        needsReview: resolution.needsReview,
        conflictActive: resolution.conflictActive
      },
      catalogAuthority: {
        authority: catalog.authority,
        validation: catalog.validation,
        needsReview: catalog.needsReview,
        conflictActive: catalog.conflictActive
      },
      providerEvidence,
      reasons: Object.freeze([])
    });
  } catch (_error) {
    return deepFreeze({
      contractVersion: CANONICAL_IDENTIFICATION_RESULT_VERSION,
      status: 'unknown',
      canonicalSlug: null,
      plantId: null,
      scientificName: null,
      commonName: null,
      identityConfirmed: false,
      saveEligible: false,
      resolution: {
        status: 'unresolved',
        matchedBy: null,
        needsReview: false,
        conflictActive: false
      },
      catalogAuthority: {
        authority: null,
        validation: 'missing',
        needsReview: null,
        conflictActive: null
      },
      providerEvidence: providerEvidenceEnvelope(null),
      reasons: Object.freeze(['malformed_input'])
    });
  }
}

export const normalizeCanonicalIdentificationResult = createCanonicalIdentificationResult;
