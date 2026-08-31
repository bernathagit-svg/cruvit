/**
 * Garden-specific interpretation of canonical plant knowledge / warnings.
 *
 * Separates:
 *   CANONICAL PLANT FACT  (stored, provenanced)
 * from:
 *   GARDEN-SPECIFIC INTERPRETATION  (derived at runtime from stored facts + garden state)
 *
 * Runtime: 0 external research, 0 LLM, 0 toxicity/invasive lookups.
 * Interpretation may only reference stored canonical facts + provided garden context.
 */

import {
  EVIDENCE_CLASS,
  readPlantKnowledge,
  resolveWarningRenderPolicy,
  resolveInvasivenessLabel,
  isConfirmedWarning
} from '../catalog-expansion/plant-knowledge-warnings-v1-contract.js';

export const PLANT_KNOWLEDGE_GARDEN_INTERPRETATION_VERSION = '1.0.0';

/**
 * @typedef {{
 *   plantCount?: number,
 *   compatiblePollinatorPresent?: boolean|null,
 *   accessibleToChildren?: boolean|null,
 *   petsPresent?: boolean|null,
 *   regionCodes?: string[],
 *   gardenId?: string|null
 * }} GardenContextV1
 */

/**
 * Build garden interpretations from canonical facts only.
 * Never invents botanical claims not present in meta / plantKnowledge.
 */
export function interpretPlantKnowledgeForGarden({
  meta = {},
  plantKnowledge = null,
  gardenContext = {}
} = {}) {
  const knowledge = plantKnowledge || readPlantKnowledge(meta) || {};
  const interpretations = [];
  const inventedClaimAttempts = [];

  // Pollination / reproductive (canonical reproductiveBiology)
  const repro =
    meta?.reproductiveBiology ||
    meta?.climateTraits?.reproductiveBiology ||
    knowledge.cultivarCaveats?.reproductiveHints ||
    {};
  if (repro.requires_pollinator === true) {
    const present = gardenContext.compatiblePollinatorPresent;
    if (present === false) {
      interpretations.push({
        interpretationId: 'pollinator-missing',
        kind: 'GARDEN_SPECIFIC',
        basedOnCanonicalFields: ['reproductiveBiology.requires_pollinator'],
        summary:
          'Fruit production may be limited because only one compatible plant is currently known in this garden (or none).',
        evidenceClass: EVIDENCE_CLASS.SOURCE_SUPPORTED,
        note: 'Interpretation uses stored requires_pollinator + garden inventory only.'
      });
    } else if (present == null) {
      interpretations.push({
        interpretationId: 'pollinator-unknown-in-garden',
        kind: 'GARDEN_SPECIFIC',
        basedOnCanonicalFields: ['reproductiveBiology.requires_pollinator'],
        summary:
          'This plant may need a compatible pollinator for reliable fruit set. Garden pollinator inventory is unknown.',
        evidenceClass: EVIDENCE_CLASS.UNKNOWN
      });
    }
  }

  // Toxicity placement caution
  const tox = knowledge.toxicity || {};
  const human = tox.humanToxicity;
  if (human?.value && ['severe', 'high', 'toxic'].includes(String(human.value).toLowerCase())) {
    const policy = resolveWarningRenderPolicy({
      category: 'toxicity',
      severity: 'SEVERE',
      evidenceClass: human.evidenceClass
    });
    if (policy.confirmed || human.evidenceClass === EVIDENCE_CLASS.SOURCE_SUPPORTED) {
      interpretations.push({
        interpretationId: 'toxicity-placement',
        kind: 'GARDEN_SPECIFIC',
        basedOnCanonicalFields: ['plantKnowledge.toxicity.humanToxicity'],
        summary:
          'This plant has a severe toxicity warning. Review placement carefully, especially in accessible areas.',
        evidenceClass: human.evidenceClass,
        gardenHints: {
          accessibleToChildren: gardenContext.accessibleToChildren ?? null,
          petsPresent: gardenContext.petsPresent ?? null
        }
      });
    } else {
      interpretations.push({
        interpretationId: 'toxicity-unconfirmed',
        kind: 'GARDEN_SPECIFIC',
        basedOnCanonicalFields: ['plantKnowledge.toxicity.humanToxicity'],
        summary:
          'A toxicity concern is recorded but is not confirmed at SOURCE_SUPPORTED strength. Treat as unresolved — not a confirmed severe warning.',
        evidenceClass: human.evidenceClass || EVIDENCE_CLASS.UNKNOWN
      });
    }
  }

  // Regional invasiveness
  if (knowledge.invasiveness) {
    const inv = resolveInvasivenessLabel(knowledge.invasiveness);
    if (inv.label === 'invasive_regional' && inv.confirmed) {
      const gardenRegions = Array.isArray(gardenContext.regionCodes)
        ? gardenContext.regionCodes
        : [];
      const codes = inv.regionScope?.codes || [];
      const overlaps =
        gardenRegions.length > 0 && codes.some((c) => gardenRegions.includes(c));
      interpretations.push({
        interpretationId: 'invasive-regional',
        kind: 'GARDEN_SPECIFIC',
        basedOnCanonicalFields: ['plantKnowledge.invasiveness.invasiveStatus'],
        summary: overlaps
          ? `This plant is recorded as invasive/weed-risk in region(s) overlapping the garden context (${codes.join(', ') || 'see provenance'}).`
          : `This plant has a regional invasive/weed-risk record (${inv.regionScope?.level}: ${codes.join(', ') || inv.regionScope?.label || 'see provenance'}). It is not labeled globally invasive.`,
        evidenceClass: inv.evidenceClass,
        global: false
      });
    }
  }

  // Confirmed warnings → placement/info interpretations
  for (const w of knowledge.warnings || []) {
    const policy = resolveWarningRenderPolicy(w);
    if (!policy.confirmed) continue;
    if (!isConfirmedWarning(w)) continue;
    interpretations.push({
      interpretationId: `warning-${w.warningId}`,
      kind: 'GARDEN_SPECIFIC',
      basedOnCanonicalFields: [`plantKnowledge.warnings.${w.warningId}`],
      summary: w.summary,
      severity: w.severity,
      evidenceClass: w.evidenceClass,
      category: w.category
    });
  }

  return {
    contractVersion: PLANT_KNOWLEDGE_GARDEN_INTERPRETATION_VERSION,
    interpretations,
    inventedClaimAttempts,
    inventedUnsupportedClaims: inventedClaimAttempts.length,
    runtimeExternalResearchCalls: 0
  };
}

/**
 * Guard: reject interpretation objects that introduce fields not in the allowlist
 * of canonical bases. Used by tests / gate.
 */
export function auditInterpretationDoesNotInventClaims(result, allowedCanonicalFieldPrefixes) {
  const violations = [];
  const prefixes = allowedCanonicalFieldPrefixes || [
    'reproductiveBiology.',
    'plantKnowledge.',
    'climateTraits.',
    'floweringRequirements',
    'fruitingRequirements'
  ];
  for (const item of result?.interpretations || []) {
    for (const f of item.basedOnCanonicalFields || []) {
      if (!prefixes.some((p) => f === p || f.startsWith(p))) {
        violations.push({ interpretationId: item.interpretationId, field: f });
      }
    }
    // Disallow summaries that claim SOURCE_SUPPORTED safety without basis
    if (
      /proven safe for (pets|children|dogs|cats)/i.test(item.summary || '') &&
      item.evidenceClass !== EVIDENCE_CLASS.SOURCE_SUPPORTED
    ) {
      violations.push({
        interpretationId: item.interpretationId,
        field: 'summary',
        reason: 'invented-positive-safety-prose'
      });
    }
  }
  return { ok: violations.length === 0, violations };
}
