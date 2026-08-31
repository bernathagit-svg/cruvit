/**
 * Synthetic non-production fixtures for Scalable Catalog Ingestion V1.
 * DO NOT treat as canonical catalog plants. Distinct synthetic_* slugs.
 */

import { emptyPlantKnowledge, provenancedField, EVIDENCE_CLASS } from '../catalog-expansion/plant-knowledge-warnings-v1-contract.js';

const SS = EVIDENCE_CLASS.SOURCE_SUPPORTED;
const HZ = EVIDENCE_CLASS.HEURISTIC_ASSERTION;
const UN = EVIDENCE_CLASS.UNKNOWN;

/**
 * Build N synthetic NEW plants with valid minimal canonical shape.
 */
export function buildSyntheticNewPlants(count, { prefix = 'synthetic-ingest' } = {}) {
  const plants = [];
  for (let i = 0; i < count; i++) {
    const n = String(i + 1).padStart(4, '0');
    const slug = `${prefix}-${n}`;
    const scientific = `Synthetica ingestus${n}`;
    const climate_traits = {
      frostSensitivity: 'Medium',
      coldTolerance: 'Moderate',
      heatTolerance: 'Moderate',
      humidityTolerance: 'Moderate',
      waterNeeds: 'Moderate',
      sunNeeds: 'FullSun',
      drainageNeeds: 'WellDrained',
      needsWinterChill: false,
      floweringRequirements: 'spring bloom (synthetic)',
      fruitingRequirements: 'not a fruit crop (synthetic)',
      traitEvidenceClasses: {
        frostSensitivity: SS,
        coldTolerance: HZ,
        heatTolerance: HZ,
        humidityTolerance: UN,
        waterNeeds: HZ,
        sunNeeds: SS,
        drainageNeeds: HZ,
        needsWinterChill: SS,
        floweringRequirements: HZ,
        fruitingRequirements: UN
      },
      traitProvenance: {
        frostSensitivity: { sourceIds: ['synthetic-fixture'], shortExcerpt: 'Synthetic fixture value.' },
        sunNeeds: { sourceIds: ['synthetic-fixture'], shortExcerpt: 'Synthetic fixture value.' },
        needsWinterChill: { sourceIds: ['synthetic-fixture'], shortExcerpt: 'Synthetic fixture value.' }
      },
      plantKnowledge: emptyPlantKnowledge({ notes: 'Synthetic non-production fixture.' })
    };
    plants.push({
      slug,
      scientific,
      scientific_name: scientific,
      common_names: { en: [`Synthetic ${n}`] },
      aliases: [],
      climate_traits,
      flowering_requirements: climate_traits.floweringRequirements,
      fruiting_requirements: climate_traits.fruitingRequirements,
      media: { synthetic: true },
      media_status: 'IMAGE_PENDING',
      provenance: [{ sourceId: 'synthetic-fixture', note: 'non-production' }],
      needs_review: false,
      verification_state: 'verified',
      catalog_version: 'synthetic-1.0.0',
      source_packet: `synthetic-packet://${slug}`
    });
  }
  return plants;
}

/**
 * Baseline rows representing "existing catalog" for enrichment collision tests.
 * Uses synthetic slugs only — does not touch real Batch 1/2 identities.
 */
export function buildSyntheticBaseline(count, { prefix = 'synthetic-base' } = {}) {
  return buildSyntheticNewPlants(count, { prefix }).map((p) => ({
    ...p,
    climate_traits: {
      ...p.climate_traits,
      plantKnowledge: emptyPlantKnowledge()
    }
  }));
}

/**
 * Knowledge enrichment payloads for existing synthetic baseline slugs.
 */
export function buildSyntheticKnowledgeEnrichment(baselinePlants) {
  return baselinePlants.map((p) => {
    const plantKnowledge = emptyPlantKnowledge();
    plantKnowledge.sources = [
      {
        sourceId: 'synthetic-knowledge',
        institution: 'CRUVIT Synthetic',
        title: 'Synthetic knowledge',
        url: 'https://example.invalid/synthetic',
        authorityTier: 'university_extension',
        verifiedAt: '2026-08-31'
      }
    ];
    plantKnowledge.harvestUseWarnings = {
      edibleParts: provenancedField(
        ['none_synthetic'],
        HZ,
        ['synthetic-knowledge'],
        'Synthetic non-edible fixture note.'
      )
    };
    plantKnowledge.warnings = [];
    return {
      slug: p.slug,
      scientific_name: p.scientific_name,
      plantKnowledge
    };
  });
}

/**
 * Mutators for failure-case plants (returns deep clone with defect).
 */
export const FAILURE_MUTATORS = Object.freeze({
  duplicateSlug(plants) {
    const out = plants.map((p) => structuredClone(p));
    if (out.length >= 2) out[1].slug = out[0].slug;
    return out;
  },
  duplicateScientific(plants) {
    const out = plants.map((p) => structuredClone(p));
    if (out.length >= 2) {
      out[1].scientific = out[0].scientific;
      out[1].scientific_name = out[0].scientific_name;
    }
    return out;
  },
  missingPlant(plants) {
    return plants.slice(0, -1);
  },
  extraPlant(plants) {
    const out = plants.map((p) => structuredClone(p));
    const extra = structuredClone(out[0]);
    extra.slug = `${extra.slug}-extra`;
    extra.scientific = `${extra.scientific} extra`;
    extra.scientific_name = extra.scientific;
    out.push(extra);
    return out;
  },
  invalidEvidenceClass(plants) {
    const out = plants.map((p) => structuredClone(p));
    out[0].climate_traits.traitEvidenceClasses.frostSensitivity = 'GUESSED';
    return out;
  },
  missingProvenance(plants) {
    const out = plants.map((p) => structuredClone(p));
    delete out[0].climate_traits.traitProvenance;
    return out;
  },
  invalidPlantKnowledge(plants) {
    const out = plants.map((p) => structuredClone(p));
    out[0].climate_traits.plantKnowledge = { notAValidContract: true };
    return out;
  },
  unsafeWarningHeuristicConfirmed(plants) {
    const out = plants.map((p) => structuredClone(p));
    const pk = emptyPlantKnowledge();
    pk.warnings = [
      {
        warningId: 'bad-heuristic-tox',
        category: 'toxicity',
        canonicalTitle: 'Bad',
        summary: 'Heuristic toxic treated as confirmed',
        severity: 'SEVERE',
        evidenceClass: 'HEURISTIC_ASSERTION',
        regionScope: { level: 'GLOBAL' },
        sourceIds: ['x'],
        provenance: { shortExcerpt: 'guess' },
        status: 'active'
      }
    ];
    // Force confirmed path via SOURCE_SUPPORTED claim from HEURISTIC value "safe"
    pk.toxicity = {
      humanToxicity: provenancedField('safe', HZ, ['x'], 'Illegal positive safety from heuristic')
    };
    out[0].climate_traits.plantKnowledge = pk;
    out[0].plantKnowledge = pk;
    return out;
  },
  unsafeUnknownActiveWarning(plants) {
    const out = plants.map((p) => structuredClone(p));
    const pk = emptyPlantKnowledge();
    pk.warnings = [
      {
        warningId: 'unknown-active-tox',
        category: 'toxicity',
        canonicalTitle: 'Unknown active',
        summary: 'UNKNOWN but active',
        severity: 'SEVERE',
        evidenceClass: 'UNKNOWN',
        regionScope: { level: 'UNKNOWN' },
        sourceIds: [],
        provenance: {},
        status: 'active'
      }
    ];
    out[0].climate_traits.plantKnowledge = pk;
    return out;
  },
  existingCollision(plants) {
    // caller supplies baseline containing plants[0].slug
    return plants.map((p) => structuredClone(p));
  },
  oneMalformedInLargeBatch(plants) {
    const out = plants.map((p) => structuredClone(p));
    const mid = Math.floor(out.length / 2);
    out[mid].climate_traits.traitEvidenceClasses.frostSensitivity = 'NOT_A_CLASS';
    return out;
  }
});
