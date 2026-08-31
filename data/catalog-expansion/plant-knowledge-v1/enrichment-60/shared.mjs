/**
 * Shared helpers for Plant Knowledge & Warnings 60-plant enrichment.
 * Free/open authoritative sources only. Not imported by product runtime UI.
 */

import {
  provenancedField,
  EVIDENCE_CLASS,
  PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION,
  emptyPlantKnowledge
} from '../../../../modules/catalog-expansion/plant-knowledge-warnings-v1-contract.js';

export const ENRICHMENT_VERIFIED_AT = '2026-08-31';
export const ENRICHMENT_SET_ID = 'plant-knowledge-warnings-60-enrichment-v1';

export { provenancedField, EVIDENCE_CLASS, PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION, emptyPlantKnowledge };

export function src(sourceId, institution, title, url, authorityTier, extras = {}) {
  return {
    sourceId,
    institution,
    publisher: institution,
    title,
    url,
    authorityTier,
    verifiedAt: ENRICHMENT_VERIFIED_AT,
    ...extras
  };
}

export function warning(partial) {
  const evidenceClass = partial.evidenceClass || EVIDENCE_CLASS.UNKNOWN;
  return {
    titleKey: null,
    appliesTo: ['landscape', 'home_garden'],
    requiresOwnerReview: false,
    provenance: {
      shortExcerpt: partial.summary,
      transformation: null
    },
    status:
      partial.status ||
      (evidenceClass === EVIDENCE_CLASS.SOURCE_SUPPORTED
        ? 'active'
        : evidenceClass === EVIDENCE_CLASS.UNKNOWN
          ? 'unknown'
          : 'provisional'),
    ...partial
  };
}

export function baseKnowledge(sources = []) {
  const k = emptyPlantKnowledge();
  k.sources = sources;
  return k;
}

/** Count asserted (non-UNKNOWN) provenanced fields in a family object/array. */
export function countFamilyCoverage(familyValue) {
  if (familyValue == null) return { asserted: 0, unknown: 0, fields: 0 };
  if (Array.isArray(familyValue)) {
    if (familyValue.length === 0) return { asserted: 0, unknown: 0, fields: 0 };
    let asserted = 0;
    let unknown = 0;
    for (const item of familyValue) {
      const cls = item?.evidenceClass || item?.restrictionSummary?.evidenceClass;
      if (cls === EVIDENCE_CLASS.UNKNOWN || item?.status === 'unknown') unknown += 1;
      else if (cls) asserted += 1;
      else asserted += 1;
    }
    return { asserted, unknown, fields: familyValue.length };
  }
  if (typeof familyValue !== 'object') return { asserted: 0, unknown: 0, fields: 0 };
  const keys = Object.keys(familyValue);
  let asserted = 0;
  let unknown = 0;
  for (const key of keys) {
    const f = familyValue[key];
    if (!f || typeof f !== 'object') continue;
    if (f.evidenceClass === EVIDENCE_CLASS.UNKNOWN || f.status === 'unknown' || f.value == null) {
      unknown += 1;
    } else {
      asserted += 1;
    }
  }
  return { asserted, unknown, fields: keys.length };
}

export function walkProvenancedFields(obj, visit, path = '') {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => walkProvenancedFields(item, visit, `${path}[${i}]`));
    return;
  }
  if (
    Object.prototype.hasOwnProperty.call(obj, 'evidenceClass') &&
    Object.prototype.hasOwnProperty.call(obj, 'sourceIds')
  ) {
    visit(obj, path);
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'sources' || k === 'warnings') continue;
    if (v && typeof v === 'object') walkProvenancedFields(v, visit, path ? `${path}.${k}` : k);
  }
}
