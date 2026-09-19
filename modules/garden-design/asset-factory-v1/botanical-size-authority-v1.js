/**
 * Botanical size authority V1 — reader/validator only.
 * Loads the promoted registry. Does not import research overlays.
 * Runtime wiring remains off.
 */
import fs from 'node:fs';
import path from 'node:path';

export const BOTANICAL_SIZE_AUTHORITY_VERSION = 'botanical-size-authority-v1';
export const BOTANICAL_SIZE_AUTHORITY_RELATIVE_PATH = path.join('data', 'catalog', 'botanical-size-authority-v1.json');

export const EXPECTED_AUTHORITY_ACCOUNTING = Object.freeze({
  RUNTIME_AUTHORITY_READY: 9,
  RUNTIME_AUTHORITY_PARTIAL: 9,
  RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED: 13,
  RUNTIME_AUTHORITY_CONFLICT_HOLD: 3,
  RUNTIME_AUTHORITY_EVIDENCE_GAP: 7,
  TOTAL: 41
});

const AUTHORITY_STATES = Object.freeze([
  'RUNTIME_AUTHORITY_READY',
  'RUNTIME_AUTHORITY_PARTIAL',
  'RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED',
  'RUNTIME_AUTHORITY_CONFLICT_HOLD',
  'RUNTIME_AUTHORITY_EVIDENCE_GAP'
]);

function asText(value) {
  return String(value == null ? '' : value).trim();
}

export function botanicalSizeAuthorityPath(root) {
  return path.join(root, BOTANICAL_SIZE_AUTHORITY_RELATIVE_PATH);
}

export function loadBotanicalSizeAuthority(root) {
  const filePath = botanicalSizeAuthorityPath(root);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return parsed;
}

export function getAuthorityBySlug(registry, canonicalSlug) {
  const slug = asText(canonicalSlug);
  if (!registry || !slug) return null;
  const taxonId = registry.slugToBotanicalTaxonId?.[slug];
  if (!taxonId) return null;
  return (registry.records || []).find((row) => row.botanicalTaxonId === taxonId) || null;
}

function countByAuthority(records, state) {
  return records.filter((row) => row.runtimeAuthority === state).length;
}

function hasMeters(row) {
  const range = row.normalizedRange || {};
  const height = range.heightM || {};
  const spread = range.spreadM || {};
  return [height.min, height.max, spread.min, spread.max].some((value) => Number.isFinite(value));
}

export function validateBotanicalSizeAuthority(registry) {
  const errors = [];
  if (!registry || registry.contract !== BOTANICAL_SIZE_AUTHORITY_VERSION) {
    errors.push('contract-mismatch');
  }
  if (registry?.runtimeWired !== false) errors.push('runtime-must-remain-off');
  if (registry?.universalDefaultPreviewScenario != null) errors.push('universal-scenario-default-forbidden');
  if (registry?.immutableFromUserActions !== true) errors.push('must-be-immutable-from-user-actions');
  const records = Array.isArray(registry?.records) ? registry.records : [];
  const ids = records.map((row) => row.botanicalTaxonId);
  if (records.length !== EXPECTED_AUTHORITY_ACCOUNTING.TOTAL) errors.push(`taxon-count-${records.length}`);
  if (new Set(ids).size !== records.length) errors.push('duplicate-botanicalTaxonId');
  const slugMap = registry?.slugToBotanicalTaxonId || {};
  if (slugMap.orange !== 'taxon:citrus-sinensis' || slugMap['sweet-orange'] !== 'taxon:citrus-sinensis') {
    errors.push('orange-alias-mismatch');
  }
  const citrus = records.filter((row) => row.botanicalTaxonId === 'taxon:citrus-sinensis');
  if (citrus.length !== 1) errors.push('citrus-sinensis-not-exactly-one');
  for (const state of AUTHORITY_STATES) {
    const actual = countByAuthority(records, state);
    const expected = EXPECTED_AUTHORITY_ACCOUNTING[state];
    if (actual !== expected) errors.push(`accounting-drift:${state}:${actual}`);
  }
  const bucketSum = AUTHORITY_STATES.map((state) => countByAuthority(records, state)).reduce((sum, n) => sum + n, 0);
  if (bucketSum !== EXPECTED_AUTHORITY_ACCOUNTING.TOTAL) errors.push('exclusive-bucket-sum-mismatch');
  for (const row of records) {
    if (!AUTHORITY_STATES.includes(row.runtimeAuthority)) errors.push(`invalid-state:${row.botanicalTaxonId}`);
    const text = JSON.stringify(row);
    if (text.includes('ownerPreferredRangePosition')) {
      errors.push(`user-design-state-in-authority:${row.botanicalTaxonId}`);
    }
    if (row.runtimeAuthority === 'RUNTIME_AUTHORITY_READY' || row.runtimeAuthority === 'RUNTIME_AUTHORITY_PARTIAL') {
      if (!Array.isArray(row.provenanceEvidenceIds) || row.provenanceEvidenceIds.length < 1) {
        errors.push(`missing-source-ref:${row.botanicalTaxonId}`);
      }
    }
    if (row.runtimeAuthority === 'RUNTIME_AUTHORITY_PARTIAL') {
      if (row.spreadSourceSupported !== false) errors.push(`partial-spread-must-not-be-source-supported:${row.botanicalTaxonId}`);
      if (row.partialAnchor !== 'HEIGHT_ANCHORED_ESTIMATE') errors.push(`partial-anchor:${row.botanicalTaxonId}`);
      if (row.normalizedRange?.spreadM?.min != null || row.normalizedRange?.spreadM?.max != null) {
        errors.push(`partial-spread-synthesized:${row.botanicalTaxonId}`);
      }
    }
    if (row.runtimeAuthority === 'RUNTIME_AUTHORITY_EVIDENCE_GAP' && hasMeters(row)) {
      errors.push(`gap-has-meters:${row.botanicalTaxonId}`);
    }
    if (row.runtimeAuthority === 'RUNTIME_AUTHORITY_CONFLICT_HOLD') {
      if (row.selectedSource != null || row.selectedHeightEvidenceRef != null || row.selectedSpreadEvidenceRef != null) {
        errors.push(`conflict-selected-source:${row.botanicalTaxonId}`);
      }
      if (hasMeters(row)) errors.push(`conflict-has-selected-range:${row.botanicalTaxonId}`);
      if (!Array.isArray(row.conflictingEvidenceIds) || row.conflictingEvidenceIds.length < 2) {
        errors.push(`conflict-missing-refs:${row.botanicalTaxonId}`);
      }
    }
    if (row.runtimeAuthority === 'RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED' && row.defaultPreviewScenario != null) {
      errors.push(`user-context-must-not-choose-default-scenario:${row.botanicalTaxonId}`);
    }
  }
  if (JSON.stringify(registry).includes('ownerPreferredRangePosition')) errors.push('ownerPreferredRangePosition-in-registry');
  return { ok: errors.length === 0, errors };
}
