/**
 * Shared Batch 2 catalog expansion utilities (evidence-first ingestion).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  validateCatalogExpansionPacket,
  materializePlantCatalogItemFromPacket,
  enforceBatch2EvidenceIngestionRule
} from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { materializeFloweringEvidenceFields } from '../modules/catalog-expansion/field-provenance-honesty-v1-contract.js';
import { annotatePacketFieldProvenance } from '../modules/catalog-expansion/field-provenance-honesty-v1-contract.js';
import { materializeQuantitativeEvidenceFromClaims } from '../modules/catalog-expansion/plant-climate-quantitative-evidence-v1-contract.js';
import { REPRODUCTIVE_BIOLOGY_CLAIM_FIELDS } from '../modules/catalog-expansion/reproductive-biology-v1-contract.js';
import { BATCH_ID } from '../data/catalog-expansion/batches/bulk-batch-2-v1/definitions.mjs';

const TRAIT_FIELDS = [
  'frostSensitivity',
  'coldTolerance',
  'heatTolerance',
  'humidityTolerance',
  'waterNeeds',
  'sunNeeds',
  'drainageNeeds',
  'needsWinterChill',
  'floweringRequirements',
  'fruitingRequirements'
];

/** Material suitability evidence inventory fields (Owner verify metric B). */
export const MATERIAL_EVIDENCE_FIELDS = Object.freeze([
  ...TRAIT_FIELDS
]);

export function isMaterialEvidenceField(field) {
  const f = String(field || '');
  if (MATERIAL_EVIDENCE_FIELDS.includes(f)) return true;
  if (f.startsWith('quantitative.')) return true;
  if (f.startsWith('reproductive.')) return true;
  return false;
}

/**
 * Accepted scientific identity may be binomial OR accepted infraspecific
 * (var. / subsp.). Genus-only and common-name-only remain rejected.
 */
export function isAcceptedScientificIdentity(name) {
  return /^[A-Z][a-z]+ (?:× )?([a-z]+|×)(?: (?:var\.|subsp\.) [a-z]+)?$/.test(
    String(name || '').trim()
  );
}

function extractScientificFromSourceTitle(title) {
  const t = String(title || '').trim();
  // Prefer leading scientific identity (binomial / infraspecific / Scolymus Group)
  const start = t.match(
    /^([A-Z][a-z]+(?:\s+×)?\s+[a-z]+(?:\s+(?:var\.|subsp\.)\s+[a-z]+)?(?:\s+Scolymus\s+Group)?)\b/
  );
  if (start) return start[1].replace(/\s+/g, ' ').trim();
  // Parenthetical only when it looks like a scientific name (not a common name)
  const paren = t.match(
    /\(([A-Z][a-z]+(?:\s+×)?\s+[a-z]+(?:\s+(?:var\.|subsp\.)\s+[a-z]+)?(?:\s+Scolymus\s+Group)?)\)/
  );
  if (paren) return paren[1].replace(/\s+/g, ' ').trim();
  return null;
}

function speciesBinomialKey(name) {
  const p = String(name || '')
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/\s+scolymus\s+group$/i, '')
    .split(/\s+/)
    .filter(Boolean);
  if (p.length < 2) return null;
  return `${p[0]} ${p[1]}`;
}

/**
 * True when a source title/taxon is compatible with the canonical identity.
 * Same species binomial matches. Scolymus Group matches var. scolymus.
 * Different species epithets fail.
 */
export function sourceTaxonCompatibleWithCanonical(canonicalScientific, source) {
  const canon = String(canonicalScientific || '').trim();
  const titleTaxon = extractScientificFromSourceTitle(source?.title);
  const canonSp = speciesBinomialKey(canon);
  if (!titleTaxon) {
    // UF-IFAS common-name titles: allow when sourceId does not embed a foreign epithet
    const id = String(source?.sourceId || '').toLowerCase();
    const idParts = id.replace(/^(rhs|ncsu|uf-ifas|powo|ucanr)-/, '').split('-');
    if (idParts.length >= 2 && canonSp) {
      const [g, e] = canonSp.split(' ');
      if (idParts[0] === g && idParts[1] && idParts[1] !== e && !canon.toLowerCase().includes(idParts[1])) {
        return {
          ok: false,
          reason: 'sourceId-epithet-mismatch',
          extracted: null,
          sourceId: source.sourceId
        };
      }
    }
    return { ok: true, reason: 'no-scientific-in-title-deferred-to-sourceId', extracted: null };
  }
  const titleSp = speciesBinomialKey(titleTaxon);
  if (titleSp && canonSp && titleSp !== canonSp) {
    return {
      ok: false,
      reason: 'MISMATCH_SPECIES',
      extracted: titleTaxon,
      sourceId: source.sourceId
    };
  }
  // Infraspecific: Scolymus Group / var. scolymus are compatible
  const canonInfra = /\b(var\.|subsp\.)\s+([a-z]+)/i.exec(canon);
  const titleHasScolymusGroup = /scolymus\s+group/i.test(titleTaxon);
  const titleInfra = /\b(var\.|subsp\.)\s+([a-z]+)/i.exec(titleTaxon);
  if (canonInfra) {
    if (titleHasScolymusGroup && canonInfra[2].toLowerCase() === 'scolymus') {
      return { ok: true, reason: 'scolymus-group-rank-compatible', extracted: titleTaxon };
    }
    if (titleInfra && titleInfra[2].toLowerCase() === canonInfra[2].toLowerCase()) {
      return { ok: true, reason: 'infraspecific-match', extracted: titleTaxon };
    }
    if (!titleInfra && !titleHasScolymusGroup && titleSp === canonSp) {
      return {
        ok: false,
        reason: 'SPECIES_SOURCE_FOR_INFRASPECIFIC_IDENTITY',
        extracted: titleTaxon,
        sourceId: source.sourceId,
        note: 'Species-level source may support shared species traits only if not claimed as infraspecific identity evidence'
      };
    }
  }
  return { ok: true, reason: 'species-match', extracted: titleTaxon };
}

export function auditBatch2TaxonProvenance(plants) {
  const mismatches = [];
  for (const p of plants) {
    for (const s of p.sources || []) {
      const r = sourceTaxonCompatibleWithCanonical(p.scientific, s);
      if (!r.ok) {
        mismatches.push({
          slug: p.slug,
          scientific: p.scientific,
          sourceId: s.sourceId,
          title: s.title,
          ...r
        });
      }
    }
    // Identity claim must not list incompatible sources
    const identitySources = (p.sources || []).filter((s) => {
      const r = sourceTaxonCompatibleWithCanonical(p.scientific, s);
      return r.ok && r.reason !== 'SPECIES_SOURCE_FOR_INFRASPECIFIC_IDENTITY';
    });
    if (!identitySources.length) {
      mismatches.push({
        slug: p.slug,
        scientific: p.scientific,
        reason: 'no-rank-compatible-identity-source',
        sourceId: null
      });
    }
  }
  return mismatches;
}

function identityCompatibleSourceIds(def) {
  return (def.sources || [])
    .filter((s) => {
      const r = sourceTaxonCompatibleWithCanonical(def.scientific, s);
      return r.ok && r.reason !== 'SPECIES_SOURCE_FOR_INFRASPECIFIC_IDENTITY';
    })
    .map((s) => s.sourceId);
}

function claimFromTrait(field, t, primarySourceId) {
  if (!t) return null;
  const isUnknown = t.status === 'unknown' || t.evidenceClass === 'UNKNOWN';
  const claim = {
    claimId: field.replace(/[^a-zA-Z0-9]+/g, '-'),
    field,
    status: isUnknown ? 'unknown' : 'asserted',
    value: isUnknown ? null : t.value,
    sourceIds: Array.isArray(t.sourceIds) && t.sourceIds.length ? t.sourceIds : [primarySourceId],
    shortExcerpt: t.shortExcerpt || '',
    evidenceClass: t.evidenceClass || (isUnknown ? 'UNKNOWN' : 'HEURISTIC_ASSERTION')
  };
  if (t.transformation) claim.transformation = t.transformation;
  if (t.reason) claim.enrichmentReason = t.reason;
  return claim;
}

export function buildEvidenceFirstPacket(def) {
  const sourceIds = def.sources.map((s) => s.sourceId);
  const primary = sourceIds[0];
  const identitySourceIds = identityCompatibleSourceIds(def);
  const identityPrimary = identitySourceIds[0] || primary;
  const identityExcerpt = def.taxonomyContract
    ? `${def.scientific} — accepted infraspecific identity; supported by rank-compatible ${def.taxonomyContract.horticulturalSynonymGroup || 'sources'} (${def.sources.find((s) => s.sourceId === identityPrimary)?.institution || 'authoritative source'}).`
    : `${def.scientific} — identity from ${def.sources.find((s) => s.sourceId === identityPrimary)?.institution || def.sources[0].institution}.`;
  const claims = [
    {
      claimId: 'identity-scientific',
      field: 'scientific',
      status: 'asserted',
      value: def.scientific,
      sourceIds: identitySourceIds,
      shortExcerpt: identityExcerpt,
      evidenceClass: 'SOURCE_SUPPORTED'
    },
    {
      claimId: 'identity-aliases',
      field: 'aliases',
      status: 'asserted',
      value: def.aliases,
      sourceIds: [identityPrimary],
      shortExcerpt: `Common / synonym names for ${def.common}.`
    },
    {
      claimId: 'climate-label',
      field: 'climateLabel',
      status: 'asserted',
      value: def.climateLabel,
      sourceIds: [primary],
      shortExcerpt: def.climateLabel
    },
    {
      claimId: 'tags',
      field: 'tags',
      status: 'asserted',
      value: def.tags,
      sourceIds: [primary],
      shortExcerpt: `Catalog tags: ${(def.tags || []).join(', ')}`
    },
    {
      claimId: 'care-sun',
      field: 'care.sun',
      status: 'asserted',
      value: String(def.traits?.sunNeeds?.value || 'full_sun').replace(/_/g, ' '),
      sourceIds: [primary],
      shortExcerpt: `Sun: ${def.traits?.sunNeeds?.shortExcerpt || def.traits?.sunNeeds?.value || 'full sun'}`
    },
    {
      claimId: 'care-water',
      field: 'care.water',
      status: 'asserted',
      value: String(def.traits?.waterNeeds?.value || 'medium'),
      sourceIds: [primary],
      shortExcerpt: `Water: ${def.traits?.waterNeeds?.shortExcerpt || def.traits?.waterNeeds?.value || 'medium'}`
    },
    {
      claimId: 'care-growth',
      field: 'care.growth',
      status: 'asserted',
      value: def.archetypes.includes('tree')
        ? 'Tree'
        : def.archetypes.includes('herb-edible')
          ? 'Herbaceous / culinary'
          : def.archetypes.includes('ornamental-flowering')
            ? 'Ornamental landscape plant'
            : 'Woody landscape plant',
      sourceIds: [primary],
      shortExcerpt: 'Growth habit summarized from landscape use.'
    },
    {
      claimId: 'care-size',
      field: 'care.size',
      status: 'unknown',
      value: null,
      sourceIds: [primary],
      shortExcerpt: 'Mature size not asserted without cultivar-specific measurement in packet sources.',
      evidenceClass: 'UNKNOWN'
    },
    {
      claimId: 'care-guide',
      field: 'care.guide',
      status: 'asserted',
      value: `${def.common} (${def.scientific}). ${def.climateLabel}.`,
      sourceIds: [primary],
      shortExcerpt: def.climateLabel
    }
  ];

  if (Array.isArray(def.groupIds) && def.groupIds.length) {
    claims.push({
      claimId: 'groups',
      field: 'groupIds',
      status: 'asserted',
      value: def.groupIds,
      sourceIds: [primary],
      shortExcerpt: `Structural groupIds: ${def.groupIds.join(', ')}`
    });
  }

  for (const field of TRAIT_FIELDS) {
    const c = claimFromTrait(field, def.traits?.[field], primary);
    if (c) claims.push(c);
  }

  if (def.quantitative) {
    for (const [key, q] of Object.entries(def.quantitative)) {
      if (!q) continue;
      claims.push({
        claimId: `quantitative-${key}`,
        field: `quantitative.${key}`,
        status: 'asserted',
        value: q.value,
        sourceIds: q.sourceIds || [primary],
        shortExcerpt: q.shortExcerpt,
        evidenceClass: q.evidenceClass || 'SOURCE_SUPPORTED',
        transformation: q.transformation || null
      });
    }
  }

  if (def.reproductive) {
    for (const [key, r] of Object.entries(def.reproductive)) {
      if (!r) continue;
      claims.push({
        claimId: `reproductive-${key}`,
        field: `reproductive.${key}`,
        status: 'asserted',
        value: r.value,
        sourceIds: r.sourceIds || [primary],
        shortExcerpt: r.shortExcerpt,
        evidenceClass: r.evidenceClass || 'SOURCE_SUPPORTED',
        transformation: r.transformation || null
      });
    }
  }

  const packet = {
    expansionContractVersion: '1.2.0',
    packetId: `${def.slug}-bulk-batch-2-v1`,
    identity: {
      canonicalSlug: def.slug,
      commonNameEn: def.common,
      acceptedScientificName: def.scientific,
      aliases: def.aliases
    },
    flags: {
      enforceBatch2EvidenceRule: true,
      batch2: true,
      forceClimateNeedsReview: !!def.needsReview,
      botanicalVerified: true,
      notes: def.needsReviewReason || `Bulk Batch 2 evidence-first ingest (${BATCH_ID}).`,
      ...(def.taxonomyContract
        ? {
            taxonomyContract: def.taxonomyContract,
            acceptedInfraspecificTaxaAllowed: true
          }
        : { acceptedInfraspecificTaxaAllowed: true })
    },
    sources: def.sources.map((s) => ({
      sourceId: s.sourceId,
      institution: s.institution,
      publisher: s.institution,
      title: s.title,
      url: s.url,
      authorityTier: s.authorityTier,
      verifiedAt: s.verifiedAt
    })),
    claims,
    image: { status: 'IMAGE_PENDING' },
    humanApproval: {
      approvedForIngest: true,
      approvedAt: '2026-08-31',
      approvedBy: 'Owner Bulk Catalog Expansion V1 Batch 2 authorization',
      notes: 'Evidence-first ingestion; free/open sources only; no paid APIs.'
    }
  };

  return packet;
}

export function climateTraitsFromDefAndPacket(def, packet) {
  const ann = annotatePacketFieldProvenance(packet);
  const traitEvidenceClasses = {};
  const traitProvenance = {};
  const climateTraits = {
    frostSensitivity: def.traits?.frostSensitivity?.value ?? null,
    coldTolerance: def.traits?.coldTolerance?.value ?? null,
    heatTolerance: def.traits?.heatTolerance?.value ?? null,
    humidityTolerance: def.traits?.humidityTolerance?.value ?? null,
    waterNeeds: def.traits?.waterNeeds?.value ?? null,
    sunNeeds: def.traits?.sunNeeds?.value ?? null,
    drainageNeeds: def.traits?.drainageNeeds?.value ?? null,
    needsWinterChill: def.traits?.needsWinterChill?.value === true,
    groupIds: Array.isArray(def.groupIds) ? def.groupIds : [],
    floweringRequirements:
      def.traits?.floweringRequirements?.status === 'unknown'
        ? null
        : def.traits?.floweringRequirements?.value || def.floweringRequirements || null,
    fruitingRequirements:
      def.traits?.fruitingRequirements?.status === 'unknown'
        ? null
        : def.traits?.fruitingRequirements?.value || def.fruitingRequirements || null,
    needsReview: def.needsReview === true
  };
  const reproductiveBiology = {};
  for (const c of ann.claims) {
    traitEvidenceClasses[c.field] = c.evidenceClass;
    traitProvenance[c.field] = {
      evidenceClass: c.evidenceClass,
      sourceIds: c.sourceIds || [],
      shortExcerpt: c.shortExcerpt || null,
      status: c.status
    };
    if (TRAIT_FIELDS.includes(c.field) && c.status === 'asserted' && c.value != null) {
      climateTraits[c.field] = c.value;
    }
    if (String(c.field).startsWith('reproductive.') && c.status === 'asserted') {
      reproductiveBiology[c.field.slice('reproductive.'.length)] = c.value;
    }
  }
  const { quantitativeEvidence, quantitativeProvenance } =
    materializeQuantitativeEvidenceFromClaims(packet.claims);
  if (quantitativeEvidence) {
    climateTraits.quantitativeEvidence = quantitativeEvidence;
    climateTraits.quantitativeProvenance = quantitativeProvenance;
    for (const [k, v] of Object.entries(quantitativeProvenance || {})) {
      traitEvidenceClasses[`quantitative.${k}`] = v.evidenceClass || 'SOURCE_SUPPORTED';
    }
  }
  if (Object.keys(reproductiveBiology).length) {
    climateTraits.reproductiveBiology = reproductiveBiology;
  }
  climateTraits.traitEvidenceClasses = traitEvidenceClasses;
  climateTraits.traitProvenance = traitProvenance;
  return climateTraits;
}

export function inventoryFromPackets(packetDir, plants) {
  const counts = { SOURCE_SUPPORTED: 0, HEURISTIC_ASSERTION: 0, UNKNOWN: 0 };
  const fullCounts = { SOURCE_SUPPORTED: 0, HEURISTIC_ASSERTION: 0, UNKNOWN: 0 };
  const byPlant = {};
  let quantitativeCount = 0;
  let reproductiveCount = 0;
  for (const def of plants) {
    const packet = JSON.parse(
      fs.readFileSync(path.join(packetDir, `${def.slug}.packet.json`), 'utf8')
    );
    const ann = annotatePacketFieldProvenance(packet);
    byPlant[def.slug] = { SOURCE_SUPPORTED: 0, HEURISTIC_ASSERTION: 0, UNKNOWN: 0 };
    for (const c of ann.claims) {
      const cls = c.evidenceClass || 'UNKNOWN';
      fullCounts[cls] = (fullCounts[cls] || 0) + 1;
      if (!isMaterialEvidenceField(c.field)) continue;
      counts[cls] = (counts[cls] || 0) + 1;
      byPlant[def.slug][cls] = (byPlant[def.slug][cls] || 0) + 1;
      if (String(c.field).startsWith('quantitative.')) quantitativeCount += 1;
      if (String(c.field).startsWith('reproductive.')) reproductiveCount += 1;
    }
  }
  return {
    counts,
    fullCounts,
    byPlant,
    quantitativeCount,
    reproductiveCount,
    materialInventory: counts,
    fullEvidenceMetadataInventory: fullCounts
  };
}

export {
  validateCatalogExpansionPacket,
  materializePlantCatalogItemFromPacket,
  enforceBatch2EvidenceIngestionRule,
  annotatePacketFieldProvenance,
  TRAIT_FIELDS,
  BATCH_ID
};
