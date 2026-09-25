/**
 * CRUVIT Full Plant Onboarding Gate V1.
 *
 * Pure, fail-closed validation that a canonical catalog row is ready to back
 * Garden Design production assets. UNKNOWN is allowed inside knowledge fields,
 * but missing canonical identity / verification / climate authority is not.
 */

export const FULL_PLANT_ONBOARDING_GATE_VERSION = 'full-plant-onboarding-gate-v1';

export const REQUIRED_CORE_CLIMATE_TRAITS = Object.freeze([
  'frostSensitivity',
  'coldTolerance',
  'heatTolerance',
  'humidityTolerance',
  'waterNeeds',
  'sunNeeds',
  'drainageNeeds',
  'needsWinterChill'
]);

function text(value) {
  return String(value == null ? '' : value).trim();
}

function normalizedScientific(value) {
  return text(value).toLowerCase().replace(/\s+/g, ' ');
}

function present(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function climateTraitEvidenceState(climateTraits, key) {
  const value = climateTraits?.[key];
  const asserted = key === 'needsWinterChill'
    ? typeof value === 'boolean'
    : present(value);
  if (asserted) return 'ASSERTED';

  const classes = climateTraits?.traitEvidenceClasses;
  const provenance = climateTraits?.traitProvenance;
  const evidenceClass = text(classes?.[key]).toUpperCase();
  const status = text(provenance?.[key]?.status).toLowerCase();
  if (evidenceClass === 'UNKNOWN' || status === 'unknown') return 'EXPLICIT_UNKNOWN';
  return 'MISSING';
}

function climateTraitReady(climateTraits, key) {
  return climateTraitEvidenceState(climateTraits, key) !== 'MISSING';
}

function knowledgeReady(climateTraits = {}) {
  const knowledge = climateTraits.plantKnowledge;
  if (!knowledge || typeof knowledge !== 'object') {
    return { ok: false, code: 'PLANT_KNOWLEDGE_MISSING' };
  }
  if (!text(knowledge.plantKnowledgeContractVersion)) {
    return { ok: false, code: 'PLANT_KNOWLEDGE_CONTRACT_MISSING' };
  }
  if (!Array.isArray(knowledge.sources) || knowledge.sources.length < 1) {
    return { ok: false, code: 'PLANT_KNOWLEDGE_SOURCES_MISSING' };
  }
  return {
    ok: true,
    code: 'PLANT_KNOWLEDGE_READY',
    sourceCount: knowledge.sources.length,
    warningCount: Array.isArray(knowledge.warnings) ? knowledge.warnings.length : 0
  };
}

function outcomeReady(row = {}, phenology = '') {
  const phase = text(phenology).toLowerCase();
  const ct = row.climate_traits && typeof row.climate_traits === 'object' ? row.climate_traits : {};
  if (phase === 'flowering') {
    const value = row.flowering_requirements ?? ct.floweringRequirements;
    return present(value)
      ? { ok: true, code: 'FLOWERING_REQUIREMENTS_READY' }
      : { ok: false, code: 'FLOWERING_REQUIREMENTS_MISSING' };
  }
  if (phase === 'fruiting') {
    const value = row.fruiting_requirements ?? ct.fruitingRequirements;
    return present(value)
      ? { ok: true, code: 'FRUITING_REQUIREMENTS_READY' }
      : { ok: false, code: 'FRUITING_REQUIREMENTS_MISSING' };
  }
  return { ok: true, code: 'VEGETATIVE_OR_NONPRODUCTIVE_OUTCOME_READY' };
}

export function evaluateFullPlantOnboarding(row = null, expected = {}) {
  const slug = text(expected.canonicalSlug).toLowerCase();
  const scientific = text(expected.scientific);
  const phenology = text(expected.phenology).toLowerCase();

  const reasons = [];
  if (!row || typeof row !== 'object') {
    return Object.freeze({
      version: FULL_PLANT_ONBOARDING_GATE_VERSION,
      canonicalSlug: slug || null,
      ready: false,
      code: 'CANONICAL_CATALOG_RECORD_MISSING',
      reasons: ['canonical-catalog-record-missing'],
      gates: {
        identity: 'FAIL',
        verification: 'FAIL',
        climate: 'FAIL',
        outcome: 'FAIL',
        knowledge: 'FAIL',
        provenance: 'FAIL'
      }
    });
  }

  const rowSlug = text(row.slug).toLowerCase();
  const rowScientific = text(row.scientific_name || row.scientific);
  const ct = row.climate_traits && typeof row.climate_traits === 'object'
    ? row.climate_traits
    : (row.climateTraits && typeof row.climateTraits === 'object' ? row.climateTraits : {});

  let identity = 'PASS';
  if (!rowSlug || (slug && rowSlug !== slug)) {
    identity = 'FAIL';
    reasons.push('canonical-slug-mismatch');
  }
  if (!rowScientific) {
    identity = 'FAIL';
    reasons.push('scientific-name-missing');
  } else if (scientific && normalizedScientific(rowScientific) !== normalizedScientific(scientific)) {
    identity = 'FAIL';
    reasons.push('scientific-name-mismatch');
  }

  let verification = 'PASS';
  if (text(row.verification_state || row.verificationState) !== 'verified') {
    verification = 'FAIL';
    reasons.push('catalog-verification-not-verified');
  }
  if (row.needs_review === true || row.needsReview === true || ct.needsReview === true) {
    verification = 'FAIL';
    reasons.push('catalog-review-still-required');
  }

  const climateTraitStates = Object.fromEntries(
    REQUIRED_CORE_CLIMATE_TRAITS.map((key) => [key, climateTraitEvidenceState(ct, key)])
  );
  const missingClimateTraits = REQUIRED_CORE_CLIMATE_TRAITS.filter(
    (key) => climateTraitStates[key] === 'MISSING'
  );
  const explicitUnknownClimateTraits = REQUIRED_CORE_CLIMATE_TRAITS.filter(
    (key) => climateTraitStates[key] === 'EXPLICIT_UNKNOWN'
  );
  const climate = missingClimateTraits.length ? 'FAIL' : 'PASS';
  if (missingClimateTraits.length) {
    reasons.push('core-climate-traits-missing:' + missingClimateTraits.join(','));
  }

  const outcome = outcomeReady(row, phenology);
  if (!outcome.ok) reasons.push(outcome.code.toLowerCase());

  const knowledge = knowledgeReady(ct);
  if (!knowledge.ok) reasons.push(knowledge.code.toLowerCase());

  const provenanceArray = Array.isArray(row.provenance) ? row.provenance : [];
  const sourcePacket = text(row.source_packet || row.sourcePacket);
  const provenance =
    provenanceArray.length > 0 && sourcePacket
      ? 'PASS'
      : 'FAIL';
  if (!provenanceArray.length) reasons.push('botanical-provenance-missing');
  if (!sourcePacket) reasons.push('source-packet-missing');

  const ready =
    identity === 'PASS'
    && verification === 'PASS'
    && climate === 'PASS'
    && outcome.ok
    && knowledge.ok
    && provenance === 'PASS';

  return Object.freeze({
    version: FULL_PLANT_ONBOARDING_GATE_VERSION,
    canonicalSlug: rowSlug || slug || null,
    scientific: rowScientific || scientific || null,
    phenology: phenology || null,
    ready,
    code: ready ? 'FULL_PLANT_ONBOARDING_READY' : 'FULL_PLANT_ONBOARDING_BLOCKED',
    reasons: [...new Set(reasons)],
    gates: {
      identity,
      verification,
      climate,
      outcome: outcome.ok ? 'PASS' : 'FAIL',
      knowledge: knowledge.ok ? 'PASS' : 'FAIL',
      provenance
    },
    climate: {
      missingCoreTraits: missingClimateTraits,
      explicitUnknownCoreTraits: explicitUnknownClimateTraits,
      traitStates: climateTraitStates,
      needsReview: ct.needsReview === true
    },
    outcome,
    knowledge,
    provenance: {
      sourceCount: provenanceArray.length,
      sourcePacket: sourcePacket || null
    }
  });
}

export function evaluateFullPlantOnboardingBatch(rows = [], expectedRows = []) {
  const bySlug = new Map(
    (rows || []).map((row) => [text(row?.slug).toLowerCase(), row])
  );
  const evaluations = (expectedRows || []).map((expected) =>
    evaluateFullPlantOnboarding(bySlug.get(text(expected?.canonicalSlug).toLowerCase()) || null, expected)
  );
  return Object.freeze({
    version: FULL_PLANT_ONBOARDING_GATE_VERSION,
    total: evaluations.length,
    ready: evaluations.filter((x) => x.ready).length,
    blocked: evaluations.filter((x) => !x.ready).length,
    allReady: evaluations.every((x) => x.ready),
    evaluations
  });
}

export const FULL_PLANT_ONBOARDING_GOVERNANCE = Object.freeze({
  canonicalCatalogAuthority: 'public.catalog_plants',
  failClosed: true,
  unknownKnowledgeFieldsAllowedWhenExplicit: true,
  missingCanonicalIdentityBlocks: true,
  needsReviewBlocks: true,
  missingCoreClimateTraitsBlocks: true,
  floweringAssetRequiresFloweringRequirements: true,
  fruitingAssetRequiresFruitingRequirements: true,
  botanicalProvenanceRequired: true,
  sourcePacketRequired: true,
  productionPromotionMayNotBypass: true
});
