/**
 * Enrichment gap scanner + durable queue v1 (read-only).
 * Observes plant-data-contract-v1 only. Does not mutate plants, invent SOURCE_SUPPORTED,
 * clear needsReview, fetch sources, or ingest Batch 3.
 */
import {
  PLANT_DATA_CONTRACT_ID,
  PLANT_DATA_CONTRACT_VERSION,
  PLANT_DATA_REASON,
  EVIDENCE_CLASS,
  classifyPlantDataReadiness,
  classifyCatalogReadOnly,
  normalizeBatch3PacketForClassification,
  scientificIsAmbiguousForClassA,
  getTraitEvidenceMap,
  plantNeedsReview
} from './plant-data-contract-v1.js';
import {
  CATALOG_SOURCE_POLICY_REF,
  CATALOG_SOURCE_POLICY_ID,
  CATALOG_SOURCE_POLICY_VERSION
} from './catalog-source-policy-v1.js';

export const ENRICHMENT_GAP_SCANNER_VERSION = '1.1.0';
export const ENRICHMENT_GAP_SCANNER_ID = 'enrichment-gap-scanner-v1';
export const ENRICHMENT_QUEUE_CONTRACT_VERSION = '1.1.0';
/** @deprecated Use CATALOG_SOURCE_POLICY_REF — pending placeholder retired. */
export const SOURCE_POLICY_VERSION_PLACEHOLDER = CATALOG_SOURCE_POLICY_REF;
export { CATALOG_SOURCE_POLICY_REF, CATALOG_SOURCE_POLICY_ID, CATALOG_SOURCE_POLICY_VERSION };

/** Enrichment execution mode — independent of product gate. */
export const ENRICHMENT_EXECUTION = Object.freeze({
  AUTO: 'AUTO',
  HOLD_FOR_REVIEW: 'HOLD_FOR_REVIEW',
  NONE: 'NONE'
});

export const ENRICHMENT_GAP_CODE = Object.freeze({
  IDENTITY_SPECIES_REQUIRED: 'IDENTITY_SPECIES_REQUIRED',
  IDENTITY_MISSING: 'IDENTITY_MISSING',
  MISSING_FROST_EVIDENCE: 'MISSING_FROST_EVIDENCE',
  MISSING_COLD_EVIDENCE: 'MISSING_COLD_EVIDENCE',
  MISSING_HEAT_EVIDENCE: 'MISSING_HEAT_EVIDENCE',
  MISSING_CLIMATE_CORE: 'MISSING_CLIMATE_CORE',
  MISSING_HUMIDITY: 'MISSING_HUMIDITY',
  MISSING_FLOWERING_REQUIREMENTS: 'MISSING_FLOWERING_REQUIREMENTS',
  MISSING_FRUITING_REQUIREMENTS: 'MISSING_FRUITING_REQUIREMENTS',
  REPRODUCTIVE_BIOLOGY_MISSING: 'REPRODUCTIVE_BIOLOGY_MISSING',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  EVIDENCE_NOT_SOURCE_SUPPORTED: 'EVIDENCE_NOT_SOURCE_SUPPORTED',
  LEGACY_META_ONLY: 'LEGACY_META_ONLY',
  CATEGORY_ONLY_POLICY: 'CATEGORY_ONLY_POLICY',
  BROAD_TAXON_POLICY: 'BROAD_TAXON_POLICY'
});

/** Authoritative remaining-D product roles from REMAINING D POLICY AUDIT (read-only constants). */
export const PRODUCT_ROLE_BY_SLUG = Object.freeze({
  succulent: 'CATEGORY_ONLY',
  jasmine: 'SPECIES_SELECTION_REQUIRED',
  azalea: 'SPECIES_SELECTION_REQUIRED',
  camellia: 'SPECIES_SELECTION_REQUIRED',
  blueberry: 'SPECIES_SELECTION_REQUIRED',
  plum: 'SPECIES_SELECTION_REQUIRED',
  mint: 'BROAD_PROVISIONAL',
  geranium: 'BROAD_PROVISIONAL',
  agapanthus: 'BROAD_PROVISIONAL',
  bougainvillea: 'BROAD_PROVISIONAL',
  banana: 'BROAD_PROVISIONAL',
  melaleuca: 'BROAD_PROVISIONAL',
  mulberry: 'BROAD_PROVISIONAL'
});

export const ENRICHMENT_PRIORITY = Object.freeze({
  P0_HOLD_UNSAFE: 'P0',
  P1_EVIDENCE_NEAR_A: 'P1',
  P2_OUTCOME_STANCE: 'P2',
  P3_PARTIAL_CLIMATE: 'P3',
  P4_BROAD_OR_CATEGORY: 'P4'
});

export const SUGGESTED_STAGE = Object.freeze({
  NONE: 'NONE',
  SOURCE_RETRIEVAL_EVIDENCE: 'SOURCE_RETRIEVAL_EVIDENCE',
  FLOWERING_STANCE: 'FLOWERING_STANCE',
  FRUITING_STANCE: 'FRUITING_STANCE',
  REPRODUCTIVE_CONTEXT: 'REPRODUCTIVE_CONTEXT',
  IDENTITY_SPECIES_RESOLUTION: 'IDENTITY_SPECIES_RESOLUTION',
  REVIEW_CLEAR_POLICY: 'REVIEW_CLEAR_POLICY',
  CATEGORY_POLICY: 'CATEGORY_POLICY',
  BROAD_TAXON_POLICY: 'BROAD_TAXON_POLICY'
});

export const ALLOWED_AUTO_ACTION = Object.freeze({
  AUTO: 'AUTO',
  HOLD: 'HOLD',
  NONE: 'NONE'
});

const GAP_TO_CONTRACT_REASONS = Object.freeze({
  [ENRICHMENT_GAP_CODE.IDENTITY_SPECIES_REQUIRED]: [PLANT_DATA_REASON.SCIENTIFIC_AMBIGUOUS_FOR_CLASS_A],
  [ENRICHMENT_GAP_CODE.IDENTITY_MISSING]: [PLANT_DATA_REASON.IDENTITY_MISSING],
  [ENRICHMENT_GAP_CODE.MISSING_FROST_EVIDENCE]: [
    PLANT_DATA_REASON.MISSING_FROST_SENSITIVITY,
    PLANT_DATA_REASON.MISSING_TRAIT_EVIDENCE
  ],
  [ENRICHMENT_GAP_CODE.MISSING_COLD_EVIDENCE]: [
    PLANT_DATA_REASON.MISSING_CLIMATE_CORE,
    PLANT_DATA_REASON.MISSING_TRAIT_EVIDENCE
  ],
  [ENRICHMENT_GAP_CODE.MISSING_HEAT_EVIDENCE]: [
    PLANT_DATA_REASON.MISSING_CLIMATE_CORE,
    PLANT_DATA_REASON.MISSING_TRAIT_EVIDENCE
  ],
  [ENRICHMENT_GAP_CODE.MISSING_CLIMATE_CORE]: [PLANT_DATA_REASON.MISSING_CLIMATE_CORE],
  [ENRICHMENT_GAP_CODE.MISSING_HUMIDITY]: [PLANT_DATA_REASON.HUMIDITY_UNKNOWN],
  [ENRICHMENT_GAP_CODE.MISSING_FLOWERING_REQUIREMENTS]: [
    PLANT_DATA_REASON.FLOWERING_REQUIREMENTS_MISSING
  ],
  [ENRICHMENT_GAP_CODE.MISSING_FRUITING_REQUIREMENTS]: [PLANT_DATA_REASON.FRUITING_REQUIREMENTS_MISSING],
  [ENRICHMENT_GAP_CODE.REPRODUCTIVE_BIOLOGY_MISSING]: [PLANT_DATA_REASON.REPRODUCTIVE_CONTEXT_MISSING],
  [ENRICHMENT_GAP_CODE.NEEDS_REVIEW]: [PLANT_DATA_REASON.NEEDS_REVIEW],
  [ENRICHMENT_GAP_CODE.EVIDENCE_NOT_SOURCE_SUPPORTED]: [PLANT_DATA_REASON.MISSING_TRAIT_EVIDENCE],
  [ENRICHMENT_GAP_CODE.LEGACY_META_ONLY]: [PLANT_DATA_REASON.LEGACY_META_ONLY]
});

const GAP_TO_FUTURE_CLAIM_TYPES = Object.freeze({
  [ENRICHMENT_GAP_CODE.MISSING_FROST_EVIDENCE]: ['frost'],
  [ENRICHMENT_GAP_CODE.MISSING_COLD_EVIDENCE]: ['cold'],
  [ENRICHMENT_GAP_CODE.MISSING_HEAT_EVIDENCE]: ['heat'],
  [ENRICHMENT_GAP_CODE.MISSING_HUMIDITY]: ['humidity'],
  [ENRICHMENT_GAP_CODE.MISSING_CLIMATE_CORE]: ['frost', 'cold', 'heat', 'sun', 'water', 'humidity', 'drainage'],
  [ENRICHMENT_GAP_CODE.MISSING_FLOWERING_REQUIREMENTS]: ['flowering'],
  [ENRICHMENT_GAP_CODE.MISSING_FRUITING_REQUIREMENTS]: ['fruiting', 'chill'],
  [ENRICHMENT_GAP_CODE.REPRODUCTIVE_BIOLOGY_MISSING]: ['reproductive_biology'],
  [ENRICHMENT_GAP_CODE.EVIDENCE_NOT_SOURCE_SUPPORTED]: ['frost', 'cold'],
  [ENRICHMENT_GAP_CODE.IDENTITY_SPECIES_REQUIRED]: ['accepted_taxonomy'],
  [ENRICHMENT_GAP_CODE.IDENTITY_MISSING]: ['accepted_taxonomy'],
  [ENRICHMENT_GAP_CODE.LEGACY_META_ONLY]: ['frost', 'cold', 'heat'],
  [ENRICHMENT_GAP_CODE.NEEDS_REVIEW]: [],
  [ENRICHMENT_GAP_CODE.CATEGORY_ONLY_POLICY]: [],
  [ENRICHMENT_GAP_CODE.BROAD_TAXON_POLICY]: ['accepted_taxonomy']
});

function traitsOf(plant) {
  return plant?.climateTraits && typeof plant.climateTraits === 'object' ? plant.climateTraits : {};
}

function evidenceClassOf(plant, field) {
  const map = getTraitEvidenceMap(plant);
  return map && typeof map === 'object' ? map[field] || null : null;
}

function isSourceSupported(plant, field) {
  return evidenceClassOf(plant, field) === EVIDENCE_CLASS.SOURCE_SUPPORTED;
}

/**
 * Map contract classification → enrichment gap codes (thin layer; no duplicate readiness logic).
 */
export function mapReadinessToEnrichmentGaps(plant, readiness = null) {
  const r = readiness || classifyPlantDataReadiness(plant);
  const reasons = new Set(r.reasons || []);
  const gaps = [];
  const role = PRODUCT_ROLE_BY_SLUG[r.slug] || null;

  // Class A is already REAL_SUITABILITY_READY — no optional enrichment debt queued.
  if (r.readinessShort === 'A') {
    if (reasons.has(PLANT_DATA_REASON.NEEDS_REVIEW) || plantNeedsReview(plant)) {
      return [ENRICHMENT_GAP_CODE.NEEDS_REVIEW];
    }
    return [];
  }

  if (role === 'CATEGORY_ONLY') {
    gaps.push(ENRICHMENT_GAP_CODE.CATEGORY_ONLY_POLICY);
  }
  if (role === 'BROAD_PROVISIONAL' || role === 'SPECIES_SELECTION_REQUIRED') {
    gaps.push(ENRICHMENT_GAP_CODE.BROAD_TAXON_POLICY);
  }
  if (role === 'SPECIES_SELECTION_REQUIRED' || reasons.has(PLANT_DATA_REASON.SCIENTIFIC_AMBIGUOUS_FOR_CLASS_A)) {
    if (!gaps.includes(ENRICHMENT_GAP_CODE.IDENTITY_SPECIES_REQUIRED)) {
      gaps.push(ENRICHMENT_GAP_CODE.IDENTITY_SPECIES_REQUIRED);
    }
  }
  if (reasons.has(PLANT_DATA_REASON.IDENTITY_MISSING)) {
    gaps.push(ENRICHMENT_GAP_CODE.IDENTITY_MISSING);
  }
  if (reasons.has(PLANT_DATA_REASON.LEGACY_META_ONLY)) {
    gaps.push(ENRICHMENT_GAP_CODE.LEGACY_META_ONLY);
  }

  const t = traitsOf(plant);
  if (
    reasons.has(PLANT_DATA_REASON.MISSING_FROST_SENSITIVITY) ||
    (t.frostSensitivity != null && !isSourceSupported(plant, 'frostSensitivity'))
  ) {
    gaps.push(ENRICHMENT_GAP_CODE.MISSING_FROST_EVIDENCE);
  }
  if (
    (t.coldTolerance != null && !isSourceSupported(plant, 'coldTolerance')) ||
    (t.coldTolerance == null &&
      (reasons.has(PLANT_DATA_REASON.MISSING_CLIMATE_CORE) ||
        reasons.has(PLANT_DATA_REASON.MISSING_FROST_SENSITIVITY) ||
        reasons.has(PLANT_DATA_REASON.LEGACY_META_ONLY)))
  ) {
    gaps.push(ENRICHMENT_GAP_CODE.MISSING_COLD_EVIDENCE);
  }
  // Heat: queue only when absent. HEURISTIC heat is allowed for Class A (contract).
  if (
    t.heatTolerance == null &&
    (reasons.has(PLANT_DATA_REASON.MISSING_CLIMATE_CORE) ||
      reasons.has(PLANT_DATA_REASON.LEGACY_META_ONLY) ||
      reasons.has(PLANT_DATA_REASON.MISSING_FROST_SENSITIVITY))
  ) {
    gaps.push(ENRICHMENT_GAP_CODE.MISSING_HEAT_EVIDENCE);
  }
  if (reasons.has(PLANT_DATA_REASON.MISSING_CLIMATE_CORE)) {
    gaps.push(ENRICHMENT_GAP_CODE.MISSING_CLIMATE_CORE);
  }
  if (reasons.has(PLANT_DATA_REASON.HUMIDITY_UNKNOWN)) {
    gaps.push(ENRICHMENT_GAP_CODE.MISSING_HUMIDITY);
  }
  if (reasons.has(PLANT_DATA_REASON.FLOWERING_REQUIREMENTS_MISSING)) {
    gaps.push(ENRICHMENT_GAP_CODE.MISSING_FLOWERING_REQUIREMENTS);
  }
  if (reasons.has(PLANT_DATA_REASON.FRUITING_REQUIREMENTS_MISSING)) {
    gaps.push(ENRICHMENT_GAP_CODE.MISSING_FRUITING_REQUIREMENTS);
  }
  if (reasons.has(PLANT_DATA_REASON.REPRODUCTIVE_CONTEXT_MISSING)) {
    gaps.push(ENRICHMENT_GAP_CODE.REPRODUCTIVE_BIOLOGY_MISSING);
  }
  if (reasons.has(PLANT_DATA_REASON.NEEDS_REVIEW) || plantNeedsReview(plant)) {
    gaps.push(ENRICHMENT_GAP_CODE.NEEDS_REVIEW);
  }
  if (
    reasons.has(PLANT_DATA_REASON.MISSING_TRAIT_EVIDENCE) ||
    (t.frostSensitivity != null && !isSourceSupported(plant, 'frostSensitivity')) ||
    (t.coldTolerance != null && !isSourceSupported(plant, 'coldTolerance'))
  ) {
    gaps.push(ENRICHMENT_GAP_CODE.EVIDENCE_NOT_SOURCE_SUPPORTED);
  }

  // Deduplicate while preserving order
  return [...new Set(gaps)];
}

export function gapContractReasonTrace(gapCode) {
  return GAP_TO_CONTRACT_REASONS[gapCode] || [];
}

export function futureClaimTypesForGaps(gapCodes = []) {
  const set = new Set();
  for (const g of gapCodes) {
    for (const t of GAP_TO_FUTURE_CLAIM_TYPES[g] || []) set.add(t);
  }
  return [...set].sort();
}

function isEvidenceOnlyNearA(plant, readiness, gaps) {
  const reasons = new Set(readiness.reasons || []);
  if (readiness.readinessShort !== 'B') return false;
  if (reasons.has(PLANT_DATA_REASON.SCIENTIFIC_AMBIGUOUS_FOR_CLASS_A)) return false;
  if (PRODUCT_ROLE_BY_SLUG[readiness.slug]) return false;
  if (!readiness.floweringStanceReady || !readiness.fruitingStanceReady) return false;
  // Material growth path available
  if (!readiness.allowedClaims?.growth) return false;
  const onlyEvidence =
    gaps.includes(ENRICHMENT_GAP_CODE.MISSING_FROST_EVIDENCE) ||
    gaps.includes(ENRICHMENT_GAP_CODE.MISSING_COLD_EVIDENCE) ||
    gaps.includes(ENRICHMENT_GAP_CODE.EVIDENCE_NOT_SOURCE_SUPPORTED);
  return onlyEvidence;
}

/**
 * Deterministic priority + auto/hold policy.
 */
export function assignPriorityAndAction(plant, readiness, gaps) {
  const role = PRODUCT_ROLE_BY_SLUG[readiness.slug] || null;
  const reasons = new Set(readiness.reasons || []);
  const categoryOnly = role === 'CATEGORY_ONLY' || gaps.includes(ENRICHMENT_GAP_CODE.CATEGORY_ONLY_POLICY);
  const broad = role === 'BROAD_PROVISIONAL';
  // SPECIES_SELECTION_REQUIRED / missing identity = P0. Broad provisional spp. stays P4 policy.
  const hasIdentityHold =
    gaps.includes(ENRICHMENT_GAP_CODE.IDENTITY_MISSING) ||
    role === 'SPECIES_SELECTION_REQUIRED' ||
    (gaps.includes(ENRICHMENT_GAP_CODE.IDENTITY_SPECIES_REQUIRED) && !broad && !categoryOnly);
  const needsReview = gaps.includes(ENRICHMENT_GAP_CODE.NEEDS_REVIEW);

  if (categoryOnly) {
    return {
      priority: ENRICHMENT_PRIORITY.P4_BROAD_OR_CATEGORY,
      suggestedStage: SUGGESTED_STAGE.CATEGORY_POLICY,
      allowedAutoAction: ALLOWED_AUTO_ACTION.HOLD,
      enrichmentExecution: ENRICHMENT_EXECUTION.HOLD_FOR_REVIEW,
      reviewStatus: 'HOLD_CATEGORY_POLICY',
      identityStatus: 'CATEGORY_ONLY',
      sourceRetrievalRequired: false
    };
  }
  if (hasIdentityHold) {
    return {
      priority: ENRICHMENT_PRIORITY.P0_HOLD_UNSAFE,
      suggestedStage: SUGGESTED_STAGE.IDENTITY_SPECIES_RESOLUTION,
      allowedAutoAction: ALLOWED_AUTO_ACTION.HOLD,
      enrichmentExecution: ENRICHMENT_EXECUTION.HOLD_FOR_REVIEW,
      reviewStatus: 'HOLD_IDENTITY',
      identityStatus: 'SPECIES_SELECTION_REQUIRED',
      sourceRetrievalRequired: false
    };
  }
  if (broad && readiness.readinessShort === 'D') {
    return {
      priority: ENRICHMENT_PRIORITY.P4_BROAD_OR_CATEGORY,
      suggestedStage: SUGGESTED_STAGE.BROAD_TAXON_POLICY,
      allowedAutoAction: ALLOWED_AUTO_ACTION.HOLD,
      enrichmentExecution: ENRICHMENT_EXECUTION.HOLD_FOR_REVIEW,
      reviewStatus: 'HOLD_BROAD_POLICY',
      identityStatus: 'BROAD_PROVISIONAL',
      sourceRetrievalRequired: false
    };
  }

  const enrichmentGaps = gaps.filter((g) => g !== ENRICHMENT_GAP_CODE.NEEDS_REVIEW);
  // needsReview blocks clear only — routine evidence/outcome retrieval stays AUTO.
  if (needsReview && enrichmentGaps.length === 0) {
    return {
      priority: ENRICHMENT_PRIORITY.P0_HOLD_UNSAFE,
      suggestedStage: SUGGESTED_STAGE.REVIEW_CLEAR_POLICY,
      allowedAutoAction: ALLOWED_AUTO_ACTION.HOLD,
      enrichmentExecution: ENRICHMENT_EXECUTION.HOLD_FOR_REVIEW,
      reviewStatus: 'HOLD_NEEDS_REVIEW',
      identityStatus: scientificIsAmbiguousForClassA(readiness.scientific)
        ? 'AMBIGUOUS'
        : 'CANONICAL_SPECIES',
      sourceRetrievalRequired: false
    };
  }

  const reviewStatus = needsReview ? 'AUTO_RETRIEVAL_CLEAR_BLOCKED' : 'AUTO';

  if (isEvidenceOnlyNearA(plant, readiness, gaps)) {
    return {
      priority: ENRICHMENT_PRIORITY.P1_EVIDENCE_NEAR_A,
      suggestedStage: SUGGESTED_STAGE.SOURCE_RETRIEVAL_EVIDENCE,
      allowedAutoAction: ALLOWED_AUTO_ACTION.AUTO,
      enrichmentExecution: ENRICHMENT_EXECUTION.AUTO,
      reviewStatus,
      identityStatus: 'CANONICAL_SPECIES',
      sourceRetrievalRequired: true
    };
  }
  if (
    gaps.includes(ENRICHMENT_GAP_CODE.MISSING_FLOWERING_REQUIREMENTS) ||
    gaps.includes(ENRICHMENT_GAP_CODE.MISSING_FRUITING_REQUIREMENTS) ||
    gaps.includes(ENRICHMENT_GAP_CODE.REPRODUCTIVE_BIOLOGY_MISSING)
  ) {
    const stage = gaps.includes(ENRICHMENT_GAP_CODE.REPRODUCTIVE_BIOLOGY_MISSING)
      ? SUGGESTED_STAGE.REPRODUCTIVE_CONTEXT
      : gaps.includes(ENRICHMENT_GAP_CODE.MISSING_FLOWERING_REQUIREMENTS)
        ? SUGGESTED_STAGE.FLOWERING_STANCE
        : SUGGESTED_STAGE.FRUITING_STANCE;
    return {
      priority: ENRICHMENT_PRIORITY.P2_OUTCOME_STANCE,
      suggestedStage: stage,
      allowedAutoAction: ALLOWED_AUTO_ACTION.AUTO,
      enrichmentExecution: ENRICHMENT_EXECUTION.AUTO,
      reviewStatus,
      identityStatus: 'CANONICAL_SPECIES',
      sourceRetrievalRequired: true
    };
  }
  if (gaps.length === 0 && readiness.readinessShort === 'A') {
    return {
      priority: ENRICHMENT_PRIORITY.P3_PARTIAL_CLIMATE,
      suggestedStage: SUGGESTED_STAGE.NONE,
      allowedAutoAction: ALLOWED_AUTO_ACTION.NONE,
      enrichmentExecution: ENRICHMENT_EXECUTION.NONE,
      reviewStatus: 'NONE',
      identityStatus: 'CANONICAL_SPECIES',
      sourceRetrievalRequired: false
    };
  }
  return {
    priority: ENRICHMENT_PRIORITY.P3_PARTIAL_CLIMATE,
    suggestedStage: SUGGESTED_STAGE.SOURCE_RETRIEVAL_EVIDENCE,
    allowedAutoAction: ALLOWED_AUTO_ACTION.AUTO,
    enrichmentExecution: ENRICHMENT_EXECUTION.AUTO,
    reviewStatus,
    identityStatus: 'CANONICAL_SPECIES',
    sourceRetrievalRequired: gaps.some((g) =>
      [
        ENRICHMENT_GAP_CODE.MISSING_FROST_EVIDENCE,
        ENRICHMENT_GAP_CODE.MISSING_COLD_EVIDENCE,
        ENRICHMENT_GAP_CODE.MISSING_HEAT_EVIDENCE,
        ENRICHMENT_GAP_CODE.MISSING_HUMIDITY,
        ENRICHMENT_GAP_CODE.EVIDENCE_NOT_SOURCE_SUPPORTED,
        ENRICHMENT_GAP_CODE.LEGACY_META_ONLY,
        ENRICHMENT_GAP_CODE.MISSING_CLIMATE_CORE
      ].includes(g)
    )
  };
}

export function stableEnrichmentJobId(canonicalSlug) {
  return `enrich-v1:${String(canonicalSlug || '').toLowerCase()}`;
}

/**
 * Build one enrichment job for a plant. Returns null if Class A complete with no gaps.
 */
export function buildEnrichmentJob(plant, options = {}) {
  const readiness = classifyPlantDataReadiness(plant, options);
  const gaps = mapReadinessToEnrichmentGaps(plant, readiness);
  if (readiness.readinessShort === 'A' && gaps.length === 0) {
    return null;
  }
  // Always emit a job when gaps exist OR readiness is not A
  const effectiveGaps =
    gaps.length > 0
      ? gaps
      : readiness.readinessShort === 'A'
        ? []
        : [ENRICHMENT_GAP_CODE.EVIDENCE_NOT_SOURCE_SUPPORTED];

  if (readiness.readinessShort === 'A' && effectiveGaps.length === 0) return null;

  const policy = assignPriorityAndAction(plant, readiness, effectiveGaps);
  const contractReasons = [...new Set(readiness.reasons || [])].sort();
  const gapTrace = {};
  for (const g of effectiveGaps) {
    gapTrace[g] = gapContractReasonTrace(g);
  }

  return {
    jobId: stableEnrichmentJobId(readiness.slug),
    canonicalSlug: readiness.slug,
    scientificName: readiness.scientific,
    commonName: readiness.commonName,
    currentReadinessClass: readiness.readinessShort,
    /** Product gate from plant-data-contract-v1 (PASS/PARTIAL/HOLD/REJECT). */
    productGate: readiness.gate,
    /**
     * @deprecated Alias of productGate — do not treat as enrichment execution.
     * Kept for one-version compat; prefer productGate.
     */
    currentGate: readiness.gate,
    /** Enrichment execution mode — independent of productGate. */
    enrichmentExecution: policy.enrichmentExecution,
    gapCodes: effectiveGaps,
    contractReasons,
    gapContractReasonTrace: gapTrace,
    suggestedStage: policy.suggestedStage,
    priority: policy.priority,
    identityStatus: policy.identityStatus,
    reviewStatus: policy.reviewStatus,
    sourceRetrievalRequired: policy.sourceRetrievalRequired,
    /** Compat mirror of enrichmentExecution (AUTO/HOLD/NONE). Prefer enrichmentExecution. */
    allowedAutoAction: policy.allowedAutoAction,
    futureClaimTypes: futureClaimTypesForGaps(effectiveGaps),
    productRole: PRODUCT_ROLE_BY_SLUG[readiness.slug] || null,
    contractId: PLANT_DATA_CONTRACT_ID,
    contractVersion: PLANT_DATA_CONTRACT_VERSION,
    queueContractVersion: ENRICHMENT_QUEUE_CONTRACT_VERSION,
    scannerId: ENRICHMENT_GAP_SCANNER_ID,
    scannerVersion: ENRICHMENT_GAP_SCANNER_VERSION,
    sourcePolicyVersion: CATALOG_SOURCE_POLICY_REF,
    provenanceNote:
      'Queue observation only. Not plant truth. Not runtime suitability authority. Cannot invent SOURCE_SUPPORTED. productGate ≠ enrichmentExecution.'
  };
}

/**
 * Scan a plant list read-only → sorted jobs (stable by slug).
 */
export function scanEnrichmentGaps(plants, options = {}) {
  const list = Array.isArray(plants) ? plants : [];
  const jobs = [];
  const bySlug = new Map();
  for (const plant of list) {
    const job = buildEnrichmentJob(plant, options);
    if (!job) continue;
    // One job per slug — last write wins if duplicates in input, but prefer first
    if (bySlug.has(job.canonicalSlug)) continue;
    bySlug.set(job.canonicalSlug, job);
    jobs.push(job);
  }
  jobs.sort((a, b) => {
    const p = String(a.priority).localeCompare(String(b.priority));
    if (p !== 0) return p;
    return String(a.canonicalSlug).localeCompare(String(b.canonicalSlug));
  });
  return jobs;
}

function summarizeJobs(jobs) {
  const byReadiness = { A: 0, B: 0, C: 0, D: 0 };
  const byProductGate = { PASS: 0, PARTIAL: 0, HOLD: 0, REJECT: 0 };
  const byEnrichmentExecution = { AUTO: 0, HOLD_FOR_REVIEW: 0, NONE: 0 };
  const byPriority = { P0: 0, P1: 0, P2: 0, P3: 0, P4: 0 };
  const gapFreq = {};
  let evidenceOnlyNearA = 0;
  let floweringGaps = 0;
  let fruitingGaps = 0;
  let reviewHolds = 0;
  let speciesSelection = 0;
  let categoryOrBroad = 0;
  let autoCount = 0;
  let holdCount = 0;
  let noneCount = 0;

  for (const j of jobs) {
    byReadiness[j.currentReadinessClass] = (byReadiness[j.currentReadinessClass] || 0) + 1;
    byProductGate[j.productGate] = (byProductGate[j.productGate] || 0) + 1;
    byEnrichmentExecution[j.enrichmentExecution] =
      (byEnrichmentExecution[j.enrichmentExecution] || 0) + 1;
    byPriority[j.priority] = (byPriority[j.priority] || 0) + 1;
    for (const g of j.gapCodes) gapFreq[g] = (gapFreq[g] || 0) + 1;
    if (j.priority === 'P1') evidenceOnlyNearA++;
    if (j.gapCodes.includes(ENRICHMENT_GAP_CODE.MISSING_FLOWERING_REQUIREMENTS)) floweringGaps++;
    if (j.gapCodes.includes(ENRICHMENT_GAP_CODE.MISSING_FRUITING_REQUIREMENTS)) fruitingGaps++;
    if (j.reviewStatus === 'HOLD_NEEDS_REVIEW' || j.gapCodes.includes(ENRICHMENT_GAP_CODE.NEEDS_REVIEW)) {
      reviewHolds++;
    }
    if (j.identityStatus === 'SPECIES_SELECTION_REQUIRED') speciesSelection++;
    if (j.priority === 'P4') categoryOrBroad++;
    if (j.enrichmentExecution === ENRICHMENT_EXECUTION.AUTO) autoCount++;
    else if (j.enrichmentExecution === ENRICHMENT_EXECUTION.HOLD_FOR_REVIEW) holdCount++;
    else noneCount++;
  }

  return {
    totalJobs: jobs.length,
    byReadiness,
    byProductGate,
    /** @deprecated Alias of byProductGate — prefer byProductGate (not enrichment execution). */
    byGate: byProductGate,
    byEnrichmentExecution,
    byPriority,
    gapFrequency: gapFreq,
    evidenceOnlyNearACandidates: evidenceOnlyNearA,
    floweringGapJobs: floweringGaps,
    fruitingGapJobs: fruitingGaps,
    reviewHoldJobs: reviewHolds,
    speciesSelectionJobs: speciesSelection,
    categoryOrBroadJobs: categoryOrBroad,
    AUTO_JOB_COUNT: autoCount,
    OWNER_REVIEW_JOB_COUNT: holdCount,
    NONE_JOB_COUNT: noneCount
  };
}

/**
 * Build durable queue document for current catalog plants.
 */
export function buildCurrentCatalogEnrichmentQueue(plants, meta = {}) {
  const catalogReport = classifyCatalogReadOnly(plants);
  const jobs = scanEnrichmentGaps(plants);
  const summary = summarizeJobs(jobs);
  return {
    queueId: 'current-catalog-enrichment-queue-v1',
    queueContractVersion: ENRICHMENT_QUEUE_CONTRACT_VERSION,
    scannerId: ENRICHMENT_GAP_SCANNER_ID,
    scannerVersion: ENRICHMENT_GAP_SCANNER_VERSION,
    contractId: PLANT_DATA_CONTRACT_ID,
    contractVersion: PLANT_DATA_CONTRACT_VERSION,
    sourcePolicyVersion: CATALOG_SOURCE_POLICY_REF,
    generatedAt: meta.generatedAt || null,
    parentCommit: meta.parentCommit || null,
    note: 'Read-only enrichment observation queue. Not plant truth. Not runtime suitability authority. Safe to regenerate. No SOURCE_SUPPORTED invented.',
    catalogSnapshot: {
      total: catalogReport.total,
      counts: catalogReport.counts,
      gates: catalogReport.gates
    },
    summary,
    jobs
  };
}

/**
 * Batch 3 dry queue — packets only, no ingest.
 */
export function buildBatch3DryEnrichmentQueue(packets, meta = {}) {
  const plants = (packets || []).map((p) => normalizeBatch3PacketForClassification(p));
  const catalogReport = classifyCatalogReadOnly(plants);
  const jobs = scanEnrichmentGaps(plants);
  const summary = summarizeJobs(jobs);
  const slugIdentityConflicts = jobs
    .filter(
      (j) =>
        j.gapCodes.includes(ENRICHMENT_GAP_CODE.IDENTITY_SPECIES_REQUIRED) ||
        j.gapCodes.includes(ENRICHMENT_GAP_CODE.IDENTITY_MISSING) ||
        j.identityStatus === 'SPECIES_SELECTION_REQUIRED'
    )
    .map((j) => j.canonicalSlug)
    .sort();
  const scientificConflicts = jobs
    .filter((j) => j.contractReasons.includes(PLANT_DATA_REASON.SCIENTIFIC_AMBIGUOUS_FOR_CLASS_A))
    .map((j) => ({ slug: j.canonicalSlug, scientificName: j.scientificName }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  return {
    queueId: 'batch3-dry-enrichment-queue-v1',
    queueContractVersion: ENRICHMENT_QUEUE_CONTRACT_VERSION,
    scannerId: ENRICHMENT_GAP_SCANNER_ID,
    scannerVersion: ENRICHMENT_GAP_SCANNER_VERSION,
    dryRun: true,
    ingested: false,
    note: 'Batch 3 dry adapter only. Does not write runtime catalog.',
    generatedAt: meta.generatedAt || null,
    parentCommit: meta.parentCommit || null,
    packetCount: plants.length,
    catalogSnapshot: {
      total: catalogReport.total,
      counts: catalogReport.counts,
      gates: catalogReport.gates
    },
    dryReport: {
      PASS: catalogReport.gates.PASS || 0,
      PARTIAL: catalogReport.gates.PARTIAL || 0,
      HOLD: catalogReport.gates.HOLD || 0,
      REJECT: catalogReport.gates.REJECT || 0,
      byReadiness: catalogReport.counts,
      byProductGate: catalogReport.gates,
      byEnrichmentExecution: summary.byEnrichmentExecution,
      byPriority: summary.byPriority,
      slugIdentityConflicts,
      scientificConflicts,
      humidityGapJobs: summary.gapFrequency[ENRICHMENT_GAP_CODE.MISSING_HUMIDITY] || 0,
      evidenceGapJobs: summary.gapFrequency[ENRICHMENT_GAP_CODE.EVIDENCE_NOT_SOURCE_SUPPORTED] || 0,
      queueJobs: summary.totalJobs,
      AUTO_JOB_COUNT: summary.AUTO_JOB_COUNT,
      OWNER_REVIEW_JOB_COUNT: summary.OWNER_REVIEW_JOB_COUNT
    },
    summary,
    jobs
  };
}

/**
 * Semantic / logical fingerprint of a queue document.
 * Ignores volatile metadata (generatedAt, parentCommit, run timestamps).
 * Includes all fields that affect selection, ranking, or execution eligibility.
 */
export function queueLogicalFingerprint(queueDoc) {
  const jobs = (queueDoc?.jobs || []).map((j) => ({
    jobId: j.jobId,
    canonicalSlug: j.canonicalSlug,
    scientificName: j.scientificName || null,
    currentReadinessClass: j.currentReadinessClass,
    productGate: j.productGate || j.currentGate,
    enrichmentExecution: j.enrichmentExecution,
    gapCodes: [...(j.gapCodes || [])],
    priority: j.priority,
    suggestedStage: j.suggestedStage,
    allowedAutoAction: j.allowedAutoAction,
    identityStatus: j.identityStatus || null,
    reviewStatus: j.reviewStatus || null,
    sourceRetrievalRequired: j.sourceRetrievalRequired === true,
    needsReview: j.needsReview === true,
    productRole: j.productRole || null
  }));
  return JSON.stringify({
    queueContractVersion: queueDoc?.queueContractVersion,
    scannerVersion: queueDoc?.scannerVersion,
    catalogSnapshot: queueDoc?.catalogSnapshot,
    summary: {
      totalJobs: queueDoc?.summary?.totalJobs,
      byReadiness: queueDoc?.summary?.byReadiness,
      byProductGate: queueDoc?.summary?.byProductGate || queueDoc?.summary?.byGate,
      byEnrichmentExecution: queueDoc?.summary?.byEnrichmentExecution,
      byPriority: queueDoc?.summary?.byPriority,
      AUTO_JOB_COUNT: queueDoc?.summary?.AUTO_JOB_COUNT,
      OWNER_REVIEW_JOB_COUNT: queueDoc?.summary?.OWNER_REVIEW_JOB_COUNT,
      gapFrequency: queueDoc?.summary?.gapFrequency || null
    },
    // Array order is authoritative queue rank.
    jobs
  });
}

/** True when two queue docs are equal for scheduling/selection (volatile metadata ignored). */
export function queuesSemanticallyEqual(a, b) {
  return queueLogicalFingerprint(a) === queueLogicalFingerprint(b);
}

/** Logical fingerprint for the companion summary document (ignores generatedAt/parentCommit). */
export function enrichmentSummaryLogicalFingerprint(summaryDoc) {
  return JSON.stringify({
    summaryId: summaryDoc?.summaryId,
    queueContractVersion: summaryDoc?.queueContractVersion,
    scannerVersion: summaryDoc?.scannerVersion,
    catalogSnapshot: summaryDoc?.catalogSnapshot,
    summary: summaryDoc?.summary
      ? {
          totalJobs: summaryDoc.summary.totalJobs,
          byReadiness: summaryDoc.summary.byReadiness,
          byProductGate: summaryDoc.summary.byProductGate || summaryDoc.summary.byGate,
          byEnrichmentExecution: summaryDoc.summary.byEnrichmentExecution,
          byPriority: summaryDoc.summary.byPriority,
          AUTO_JOB_COUNT: summaryDoc.summary.AUTO_JOB_COUNT,
          OWNER_REVIEW_JOB_COUNT: summaryDoc.summary.OWNER_REVIEW_JOB_COUNT,
          gapFrequency: summaryDoc.summary.gapFrequency || null
        }
      : null,
    note: summaryDoc?.note || null
  });
}

export function enrichmentSummariesSemanticallyEqual(a, b) {
  return enrichmentSummaryLogicalFingerprint(a) === enrichmentSummaryLogicalFingerprint(b);
}
