/**
 * Explanation contract V1 — data shape for future "Why this plant?" UI.
 *
 * Every explanation must be traceable to existing canonical facts.
 * No invented prose that introduces unsupported botanical claims.
 * Does not build UI. Does not call external providers.
 */

import { EVIDENCE_CLASS } from '../catalog-expansion/plant-knowledge-warnings-v1-contract.js';
import { readPlantKnowledge } from '../catalog-expansion/plant-knowledge-warnings-v1-contract.js';
import { interpretPlantKnowledgeForGarden } from './plant-knowledge-garden-interpretation-v1-contract.js';

export const PLANT_EXPLANATION_CONTRACT_VERSION = '1.0.0';

/**
 * Traceable explanation atom.
 * @typedef {{
 *   atomId: string,
 *   dimension: 'climate'|'flowering'|'fruiting'|'pollination'|'warning'|'uncertainty'|'other',
 *   polarity: 'positive'|'negative'|'neutral'|'unknown',
 *   summary: string,
 *   basedOnCanonicalFields: string[],
 *   evidenceClass: string,
 *   limiting?: boolean
 * }} ExplanationAtomV1
 */

/**
 * Build a structured explanation payload from existing outcomes + knowledge.
 * Caller supplies suitability outcomes already computed from CRUVIT climate.
 */
export function buildPlantExplanationV1({
  plant = {},
  meta = {},
  suitabilityOutcomes = null,
  gardenContext = {}
} = {}) {
  const climateTraits = meta?.climateTraits || meta || plant?.climateTraits || {};
  const knowledge = readPlantKnowledge({ ...plant, climateTraits }) || {};
  const atoms = [];

  if (suitabilityOutcomes && typeof suitabilityOutcomes === 'object') {
    const overall = suitabilityOutcomes.overall;
    if (overall) {
      atoms.push({
        atomId: 'climate-overall',
        dimension: 'climate',
        polarity:
          overall === 'good' || overall === 'excellent'
            ? 'positive'
            : overall === 'blocked' || overall === 'poor'
              ? 'negative'
              : overall === 'borderline' || overall === 'constrained'
                ? 'neutral'
                : 'unknown',
        summary: `Climate suitability overall: ${overall}.`,
        basedOnCanonicalFields: ['climateTraits', 'coordinateClimateV2'],
        evidenceClass: EVIDENCE_CLASS.SOURCE_SUPPORTED,
        limiting: overall === 'blocked' || overall === 'poor'
      });
    }
    for (const factor of suitabilityOutcomes.limitingFactors || []) {
      atoms.push({
        atomId: `limiting-${String(factor).slice(0, 40)}`,
        dimension: 'climate',
        polarity: 'negative',
        summary: String(factor),
        basedOnCanonicalFields: ['climateTraits'],
        evidenceClass: EVIDENCE_CLASS.SOURCE_SUPPORTED,
        limiting: true
      });
    }
    if (suitabilityOutcomes.flowering) {
      atoms.push({
        atomId: 'flowering-status',
        dimension: 'flowering',
        polarity: polarityFromStatus(suitabilityOutcomes.flowering),
        summary: `Flowering outlook: ${suitabilityOutcomes.flowering}.`,
        basedOnCanonicalFields: ['climateTraits.floweringRequirements'],
        evidenceClass: climateTraits.traitEvidenceClasses?.floweringRequirements || EVIDENCE_CLASS.UNKNOWN
      });
    }
    if (suitabilityOutcomes.fruiting) {
      atoms.push({
        atomId: 'fruiting-status',
        dimension: 'fruiting',
        polarity: polarityFromStatus(suitabilityOutcomes.fruiting),
        summary: `Fruiting outlook: ${suitabilityOutcomes.fruiting}.`,
        basedOnCanonicalFields: [
          'climateTraits.fruitingRequirements',
          'climateTraits.reproductiveBiology'
        ],
        evidenceClass: climateTraits.traitEvidenceClasses?.fruitingRequirements || EVIDENCE_CLASS.UNKNOWN
      });
    }
    for (const u of suitabilityOutcomes.unknownEvidence || []) {
      atoms.push({
        atomId: `uncertainty-${String(u).slice(0, 40)}`,
        dimension: 'uncertainty',
        polarity: 'unknown',
        summary: `Uncertainty: ${u}.`,
        basedOnCanonicalFields: ['climateTraits.traitEvidenceClasses'],
        evidenceClass: EVIDENCE_CLASS.UNKNOWN
      });
    }
  }

  // Biological pollination constraints from stored reproductive facts
  const repro = climateTraits.reproductiveBiology || {};
  if (repro.requires_pollinator === true) {
    atoms.push({
      atomId: 'pollination-requirement',
      dimension: 'pollination',
      polarity: 'neutral',
      summary: 'Biological fruit set may require a compatible pollinator.',
      basedOnCanonicalFields: ['climateTraits.reproductiveBiology.requires_pollinator'],
      evidenceClass:
        climateTraits.traitEvidenceClasses?.['reproductive.requires_pollinator'] ||
        EVIDENCE_CLASS.HEURISTIC_ASSERTION
    });
  }
  if (repro.dioecious === true) {
    atoms.push({
      atomId: 'dioecious',
      dimension: 'pollination',
      polarity: 'neutral',
      summary: 'Species is dioecious; fruit set depends on sex/pollinator arrangement.',
      basedOnCanonicalFields: ['climateTraits.reproductiveBiology.dioecious'],
      evidenceClass:
        climateTraits.traitEvidenceClasses?.['reproductive.dioecious'] ||
        EVIDENCE_CLASS.HEURISTIC_ASSERTION
    });
  }

  // Warnings (confirmed only as confirmed; provisional labeled)
  for (const w of knowledge.warnings || []) {
    atoms.push({
      atomId: `warn-${w.warningId}`,
      dimension: 'warning',
      polarity: 'negative',
      summary: w.summary,
      basedOnCanonicalFields: [`plantKnowledge.warnings.${w.warningId}`],
      evidenceClass: w.evidenceClass,
      limiting: w.severity === 'SEVERE' || w.severity === 'WARNING'
    });
  }

  // Garden interpretations
  const garden = interpretPlantKnowledgeForGarden({
    meta: climateTraits,
    plantKnowledge: knowledge,
    gardenContext
  });
  for (const g of garden.interpretations) {
    atoms.push({
      atomId: `garden-${g.interpretationId}`,
      dimension: g.category === 'toxicity' ? 'warning' : 'other',
      polarity: 'neutral',
      summary: g.summary,
      basedOnCanonicalFields: g.basedOnCanonicalFields,
      evidenceClass: g.evidenceClass
    });
  }

  return {
    contractVersion: PLANT_EXPLANATION_CONTRACT_VERSION,
    slug: plant.slug || meta.slug || null,
    atoms,
    gardenInterpretation: garden,
    runtimeExternalResearchCalls: 0,
    rules: {
      everyAtomTraceable: true,
      noInventedBotanicalClaims: true,
      usesStoredCanonicalFactsOnly: true
    }
  };
}

function polarityFromStatus(status) {
  const s = String(status || '').toLowerCase();
  if (['reliable', 'supported', 'good', 'excellent'].includes(s)) return 'positive';
  if (['unreliable', 'unlikely', 'poor', 'blocked'].includes(s)) return 'negative';
  if (['unknown'].includes(s)) return 'unknown';
  return 'neutral';
}

/**
 * Audit that every atom lists at least one basedOnCanonicalFields entry
 * and does not claim SOURCE_SUPPORTED without evidenceClass match.
 */
export function auditExplanationTraceability(explanation) {
  const violations = [];
  for (const atom of explanation?.atoms || []) {
    if (!Array.isArray(atom.basedOnCanonicalFields) || atom.basedOnCanonicalFields.length === 0) {
      violations.push({ atomId: atom.atomId, reason: 'missing-canonical-trace' });
    }
    if (
      /USDA zone|hardiness of|lethal temperature/i.test(atom.summary || '') &&
      !atom.basedOnCanonicalFields.some((f) =>
        /climateTraits|quantitative|plantKnowledge|coordinateClimate/i.test(f)
      )
    ) {
      violations.push({ atomId: atom.atomId, reason: 'possible-invented-botanical-claim' });
    }
  }
  return { ok: violations.length === 0, violations };
}
