/**
 * Catalog Expansion V1 — provenance-backed plant ingestion (non-runtime).
 *
 * Validates an expansion packet and materializes a PlantCatalogItem draft.
 * Plant-agnostic: no slug-specific branches. Does not invent climate traits.
 * Image attachment only when packet supplies license-clear media; otherwise IMAGE_PENDING.
 *
 * NOT imported by product runtime suitability paths.
 *
 * v1.1.0: optional quantitative climate evidence fields (provenanced); Batch 1
 * packets on v1.0.0 remain valid without numeric fields.
 */

import {
  QUANTITATIVE_CLAIM_FIELDS,
  materializeQuantitativeEvidenceFromClaims,
  validateQuantitativeClaims
} from './plant-climate-quantitative-evidence-v1-contract.js';
import {
  FIELD_PROVENANCE_EVIDENCE_CLASSES,
  classifyClaimFieldProvenance,
  materializeFloweringEvidenceFields
} from './field-provenance-honesty-v1-contract.js';
import {
  REPRODUCTIVE_BIOLOGY_CLAIM_FIELDS,
  REPRODUCTIVE_BIOLOGY_CONTRACT_VERSION
} from './reproductive-biology-v1-contract.js';
import {
  explicitCoolSeasonFruitingTransform,
  explicitFrostFreeFruitingTransform,
  qualitativeSummerHeatFruitingTransform
} from '../suitability/reproductive-climate-transform-v1.js';

export const CATALOG_EXPANSION_CONTRACT_VERSION = '1.2.0';
export const CATALOG_EXPANSION_COMPATIBLE_VERSIONS = Object.freeze(['1.0.0', '1.1.0', '1.2.0']);

export {
  FIELD_PROVENANCE_EVIDENCE_CLASSES,
  classifyClaimFieldProvenance,
  materializeFloweringEvidenceFields,
  REPRODUCTIVE_BIOLOGY_CLAIM_FIELDS,
  REPRODUCTIVE_BIOLOGY_CONTRACT_VERSION
};

export { BATCH_2_EVIDENCE_INGESTION_RULE } from '../personal-domain/evidence-strength-propagation-v1-contract.js';
import { BATCH_2_EVIDENCE_INGESTION_RULE as _BATCH2_RULE } from '../personal-domain/evidence-strength-propagation-v1-contract.js';

export const CATALOG_EXPANSION_BATCH_2_EVIDENCE_RULE = _BATCH2_RULE;

/** Enforce Batch 2 evidence rule when packet opts in (Batch 1 remains backward-compatible). */
export function enforceBatch2EvidenceIngestionRule(packet, { hardFail = true } = {}) {
  const errors = [];
  const warnings = [];
  const claims = Array.isArray(packet?.claims) ? packet.claims : [];
  const climateTraitFields = new Set([
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
  ]);
  for (const c of claims) {
    if (
      !climateTraitFields.has(c.field)
      && !String(c.field || '').startsWith('reproductive.')
      && !String(c.field || '').startsWith('reproductiveClimate.')
    ) {
      continue;
    }
    if (c.status !== 'asserted') continue;
    if (!c.evidenceClass) {
      const msg = `Batch 2 rule: claim ${c.claimId} (${c.field}) must declare evidenceClass`;
      if (hardFail) errors.push(msg);
      else warnings.push(msg);
    } else if (
      c.evidenceClass === FIELD_PROVENANCE_EVIDENCE_CLASSES.SOURCE_SUPPORTED
    ) {
      const excerpt = String(c.shortExcerpt || '');
      if (
        /characterized as /i.test(excerpt) ||
        /^(Frost sensitivity|Cold tolerance|Heat tolerance|Humidity tolerance)/i.test(excerpt)
      ) {
        errors.push(
          `Batch 2 rule: claim ${c.claimId} cannot be SOURCE_SUPPORTED with template-generated excerpt`
        );
      }
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    rule: _BATCH2_RULE
  };
}

export const IMAGE_PENDING = 'IMAGE_PENDING';

export const CLAIM_FIELDS = Object.freeze([
  'heatTolerance',
  'coldTolerance',
  'frostSensitivity',
  'humidityTolerance',
  'waterNeeds',
  'sunNeeds',
  'drainageNeeds',
  'needsWinterChill',
  'floweringRequirements',
  'floweringDescriptiveProse',
  'fruitingRequirements',
  'survivalVsThriveNotes',
  'groupIds',
  'hardBlockRules',
  'care.sun',
  'care.water',
  'care.growth',
  'care.size',
  'care.guide',
  'climateLabel',
  'warnings',
  'tags',
  'gardenCompatibility.spacing.matureSize',
  ...QUANTITATIVE_CLAIM_FIELDS,
  ...REPRODUCTIVE_BIOLOGY_CLAIM_FIELDS,
  'reproductiveClimate.flowering.requiresFrostFree',
  'reproductiveClimate.flowering.requiresCoolSeason',
  'reproductiveClimate.flowering.summerHeatBand',
  'reproductiveClimate.flowering.minWarmestMonthMeanMaxC',
  'reproductiveClimate.fruiting.requiresFrostFree',
  'reproductiveClimate.fruiting.requiresCoolSeason',
  'reproductiveClimate.fruiting.summerHeatBand',
  'reproductiveClimate.fruiting.minWarmestMonthMeanMaxC'
]);

const TRAIT_FIELDS = new Set([
  'heatTolerance',
  'coldTolerance',
  'frostSensitivity',
  'humidityTolerance',
  'waterNeeds',
  'sunNeeds',
  'drainageNeeds',
  'needsWinterChill',
  'floweringRequirements',
  'fruitingRequirements',
  'survivalVsThriveNotes',
  'groupIds',
  'hardBlockRules'
]);

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function usableSourceClaim(claim) {
  const cls = String(claim?.evidenceClass || '').toUpperCase();
  return claim?.status === 'asserted'
    && Array.isArray(claim?.sourceIds)
    && claim.sourceIds.length > 0
    && ['SOURCE_SUPPORTED','HEURISTIC_ASSERTION'].includes(cls);
}

function claimEvidenceText(claim) {
  const values = [];
  if (typeof claim?.value === 'string') values.push(claim.value);
  else if (claim?.value !== undefined && claim?.value !== null) values.push(String(claim.value));
  if (claim?.shortExcerpt) values.push(String(claim.shortExcerpt));
  return values.join(' ').trim();
}

function packetFruitProductionRelevant(packet) {
  const claims = Array.isArray(packet?.claims) ? packet.claims : [];
  const fruit = claims.find((x) => x?.field === 'fruitingRequirements');
  if (!usableSourceClaim(fruit)) return false;
  const text = claimEvidenceText(fruit).toLowerCase();
  if (/not grown for (?:edible )?fruit|not a food crop|ornamental|seed heads?|capsules?/.test(text)) {
    return false;
  }
  if (
    /edible|harvest|fruit set|fruiting|ripen|ripe|berries?|pods?|peas?|beans?|drupe|pome|crop/.test(text)
  ) {
    return true;
  }
  const tags = claims.find((x) => x?.field === 'tags' && x?.status === 'asserted');
  const tagValues = Array.isArray(tags?.value) ? tags.value : [];
  return tagValues.some((x) =>
    ['fruit','citrus','berry','fruit-tree','orchard','melon','cucurbit','legume'].includes(
      String(x || '').trim().toLowerCase()
    )
  );
}

function addDerivedReproductiveClaim(reproductiveClimate, derived, sourceExcerpt = null) {
  if (!derived?.eligible || !String(derived.field || '').startsWith('reproductiveClimate.')) return;
  const parts = String(derived.field).split('.');
  if (parts.length !== 3) return;
  const phase = parts[1];
  const key = parts[2];
  if (!['flowering','fruiting'].includes(phase)) return;
  if (!reproductiveClimate[phase]) reproductiveClimate[phase] = {};
  if (reproductiveClimate[phase][key] !== undefined) return;
  reproductiveClimate[phase][key] = derived.value;
  reproductiveClimate[phase].evidenceClass = 'HEURISTIC_ASSERTION';
  reproductiveClimate[phase].evidenceLineage =
    derived.evidenceLineage || 'DERIVED_FROM_SOURCE_EVIDENCE_VIA_EXPLICIT_HEURISTIC_TRANSFORM';
  const ids = [
    ...(Array.isArray(reproductiveClimate[phase].sourceIds) ? reproductiveClimate[phase].sourceIds : []),
    ...(Array.isArray(derived.sourceIds) ? derived.sourceIds : [])
  ].filter(Boolean);
  reproductiveClimate[phase].sourceIds = [...new Set(ids)];
  const refs = [
    ...(Array.isArray(reproductiveClimate[phase].transformRefs)
      ? reproductiveClimate[phase].transformRefs
      : reproductiveClimate[phase].transformRef
        ? [reproductiveClimate[phase].transformRef]
        : []),
    derived.transformRef
  ].filter(Boolean);
  if (refs.length === 1) reproductiveClimate[phase].transformRef = refs[0];
  if (refs.length > 1) {
    delete reproductiveClimate[phase].transformRef;
    reproductiveClimate[phase].transformRefs = [...new Set(refs)];
  }
  if (sourceExcerpt && !reproductiveClimate[phase].sourceExcerpt) {
    reproductiveClimate[phase].sourceExcerpt = sourceExcerpt;
  }
}

function fail(errors, msg) {
  errors.push(msg);
}

/**
 * Validate a Catalog Expansion packet. Returns { ok, errors, warnings }.
 */
export function validateCatalogExpansionPacket(packet) {
  const errors = [];
  const warnings = [];

  if (!packet || typeof packet !== 'object') {
    return { ok: false, errors: ['packet must be an object'], warnings };
  }
  const ver = String(packet.expansionContractVersion || '');
  if (!CATALOG_EXPANSION_COMPATIBLE_VERSIONS.includes(ver)) {
    fail(
      errors,
      `expansionContractVersion must be one of ${CATALOG_EXPANSION_COMPATIBLE_VERSIONS.join(', ')} (current ${CATALOG_EXPANSION_CONTRACT_VERSION})`
    );
  }
  if (!isNonEmptyString(packet.packetId)) fail(errors, 'packetId required');

  const identity = packet.identity;
  if (!identity || typeof identity !== 'object') {
    fail(errors, 'identity required');
  } else {
    if (!isNonEmptyString(identity.canonicalSlug)) fail(errors, 'identity.canonicalSlug required');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(identity.canonicalSlug || ''))) {
      fail(errors, 'identity.canonicalSlug must be kebab-case');
    }
    if (!isNonEmptyString(identity.commonNameEn)) fail(errors, 'identity.commonNameEn required');
    if (!isNonEmptyString(identity.acceptedScientificName)) {
      fail(errors, 'identity.acceptedScientificName required');
    }
  }

  const sources = Array.isArray(packet.sources) ? packet.sources : null;
  if (!sources || sources.length < 1) {
    fail(errors, 'sources must include at least one authoritative source');
  } else {
    const ids = new Set();
    for (const s of sources) {
      if (!isNonEmptyString(s?.sourceId)) fail(errors, 'each source needs sourceId');
      else if (ids.has(s.sourceId)) fail(errors, `duplicate sourceId ${s.sourceId}`);
      else ids.add(s.sourceId);
      if (!isNonEmptyString(s?.institution)) fail(errors, `source ${s.sourceId}: institution required`);
      if (!isNonEmptyString(s?.title)) fail(errors, `source ${s.sourceId}: title required`);
      if (!isNonEmptyString(s?.url)) fail(errors, `source ${s.sourceId}: url required`);
      if (!isNonEmptyString(s?.authorityTier)) {
        fail(errors, `source ${s.sourceId}: authorityTier required`);
      }
      if (!isNonEmptyString(s?.verifiedAt)) fail(errors, `source ${s.sourceId}: verifiedAt required`);
    }
  }

  const sourceIds = new Set((sources || []).map((s) => s.sourceId));
  const claims = Array.isArray(packet.claims) ? packet.claims : null;
  if (!claims || claims.length < 1) {
    fail(errors, 'claims must include at least one provenance-backed claim');
  } else {
    const claimIds = new Set();
    let hasClimateCore = false;
    for (const c of claims) {
      if (!isNonEmptyString(c?.claimId)) fail(errors, 'each claim needs claimId');
      else if (claimIds.has(c.claimId)) fail(errors, `duplicate claimId ${c.claimId}`);
      else claimIds.add(c.claimId);
      if (!isNonEmptyString(c?.field)) fail(errors, `claim ${c.claimId}: field required`);
      const status = String(c?.status || '');
      if (!['asserted', 'unknown', 'needsReview', 'disputed'].includes(status)) {
        fail(errors, `claim ${c.claimId}: status must be asserted|unknown|needsReview|disputed`);
      }
      if (status === 'asserted') {
        if (c.value === undefined || c.value === null || c.value === '') {
          fail(errors, `claim ${c.claimId}: asserted claims require value`);
        }
        const refs = Array.isArray(c.sourceIds) ? c.sourceIds : [];
        if (refs.length < 1) fail(errors, `claim ${c.claimId}: asserted claims need sourceIds`);
        for (const sid of refs) {
          if (!sourceIds.has(sid)) fail(errors, `claim ${c.claimId}: unknown sourceId ${sid}`);
        }
        if (!isNonEmptyString(c.shortExcerpt)) {
          fail(errors, `claim ${c.claimId}: shortExcerpt required for asserted claims`);
        }
      }
      if (
        c.evidenceClass != null &&
        !Object.values(FIELD_PROVENANCE_EVIDENCE_CLASSES).includes(c.evidenceClass)
      ) {
        fail(
          errors,
          `claim ${c.claimId}: evidenceClass must be SOURCE_SUPPORTED|HEURISTIC_ASSERTION|UNKNOWN`
        );
      }
      if (status === 'disputed') {
        {
        const nonBlocking = Array.isArray(packet.flags?.nonBlockingDisputedFields)
          && packet.flags.nonBlockingDisputedFields.includes(c.field)
          && packet.flags?.reviewResolution?.globalCatalogReady === true;
        warnings.push(
          nonBlocking
            ? `claim ${c.claimId}: disputed — retained as non-blocking reviewed limitation`
            : `claim ${c.claimId}: disputed — will force needsReview on materialization`
        );
      }
      }
      if (
        ['frostSensitivity', 'heatTolerance', 'coldTolerance'].includes(c.field) &&
        status === 'asserted'
      ) {
        hasClimateCore = true;
      }
    }
    if (!hasClimateCore) {
      fail(
        errors,
        'at least one asserted claim for frostSensitivity, heatTolerance, or coldTolerance is required'
      );
    }
    validateQuantitativeClaims(claims, sourceIds, errors);

    // Reproductive Climate V1 semantic validation.
    const allowedHeatBands = new Set(['cool','mild','warm','hot','very_hot']);
    const allowedRcFields = new Set([
      'reproductiveClimate.flowering.requiresFrostFree',
      'reproductiveClimate.flowering.requiresCoolSeason',
      'reproductiveClimate.flowering.summerHeatBand',
      'reproductiveClimate.flowering.minWarmestMonthMeanMaxC',
      'reproductiveClimate.fruiting.requiresFrostFree',
      'reproductiveClimate.fruiting.requiresCoolSeason',
      'reproductiveClimate.fruiting.summerHeatBand',
      'reproductiveClimate.fruiting.minWarmestMonthMeanMaxC'
    ]);
    for (const claim of claims) {
      const field = String(claim?.field || '');
      if (!field.startsWith('reproductiveClimate.')) continue;
      if (!allowedRcFields.has(field)) {
        fail(errors, `claim ${claim.claimId}: unsupported reproductiveClimate field ${field}`);
        continue;
      }
      if (claim.status !== 'asserted') continue;
      if (field.endsWith('.requiresFrostFree') || field.endsWith('.requiresCoolSeason')) {
        if (typeof claim.value !== 'boolean') {
          fail(errors, `claim ${claim.claimId}: ${field} must be boolean`);
        }
      } else if (field.endsWith('.summerHeatBand')) {
        const band = String(claim.value || '').trim().toLowerCase().replace(/-/g,'_');
        if (!allowedHeatBands.has(band)) {
          fail(errors, `claim ${claim.claimId}: ${field} must be cool|mild|warm|hot|very_hot`);
        }
      } else if (field.endsWith('.minWarmestMonthMeanMaxC')) {
        const n = Number(claim.value);
        if (!Number.isFinite(n) || n < -10 || n > 60) {
          fail(errors, `claim ${claim.claimId}: ${field} must be a plausible Celsius number`);
        }
      }
      if (!claim.evidenceClass) {
        fail(errors, `claim ${claim.claimId}: reproductiveClimate assertions require evidenceClass`);
      }
    }
  }

  const image = packet.image;
  if (!image || typeof image !== 'object') {
    fail(errors, 'image block required (use status IMAGE_PENDING if no licensed asset)');
  } else {
    const st = String(image.status || '');
    if (st === IMAGE_PENDING) {
      // ok
    } else if (st === 'attached') {
      if (!isNonEmptyString(image.url)) fail(errors, 'image.url required when attached');
      if (!isNonEmptyString(image.license)) fail(errors, 'image.license required when attached');
      if (!isNonEmptyString(image.attribution)) {
        fail(errors, 'image.attribution required when attached');
      }
    } else {
      fail(errors, `image.status must be ${IMAGE_PENDING} or attached`);
    }
  }

  const approval = packet.humanApproval;
  if (!approval || approval.approvedForIngest !== true) {
    fail(errors, 'humanApproval.approvedForIngest must be true (Owner Review gate)');
  }

  if (
    packet.flags?.enforceBatch2EvidenceRule === true ||
    packet.flags?.batch2 === true ||
    String(packet.packetId || '').includes('batch-2')
  ) {
    const b2 = enforceBatch2EvidenceIngestionRule(packet, { hardFail: true });
    for (const e of b2.errors) fail(errors, e);
    for (const w of b2.warnings) warnings.push(w);
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Build botanical provenance records from an expansion packet.
 * Source-level entries plus claim/field coverage actually present on the packet.
 * Does not invent sources or claim mappings.
 */
export function buildBotanicalProvenanceFromPacket(packet) {
  if (!packet || typeof packet !== 'object') return [];
  const identity = packet.identity || {};
  const sources = Array.isArray(packet.sources) ? packet.sources : [];
  const claims = Array.isArray(packet.claims) ? packet.claims : [];

  return sources.map((s) => {
    const sourceId = String(s?.sourceId || '').trim();
    const assertedForSource = claims.filter(
      (c) =>
        c &&
        c.status === 'asserted' &&
        Array.isArray(c.sourceIds) &&
        sourceId &&
        c.sourceIds.includes(sourceId)
    );
    const unknownForSource = claims.filter(
      (c) =>
        c &&
        c.status === 'unknown' &&
        Array.isArray(c.sourceIds) &&
        sourceId &&
        c.sourceIds.includes(sourceId)
    );
    return {
      sourceId,
      institution: s.institution || null,
      publisher: s.publisher || s.institution || null,
      title: s.title || null,
      url: s.url || null,
      authorityTier: s.authorityTier || null,
      verifiedAt: s.verifiedAt || null,
      plantIdentity: {
        canonicalSlug: identity.canonicalSlug || null,
        commonNameEn: identity.commonNameEn || null,
        acceptedScientificName: identity.acceptedScientificName || null
      },
      // Field coverage derived only from packet claims referencing this sourceId.
      supportsFields: [
        ...new Set(assertedForSource.map((c) => String(c.field || '').trim()).filter(Boolean))
      ],
      assertedClaims: assertedForSource.map((c) => ({
        claimId: c.claimId || null,
        field: c.field || null,
        status: 'asserted'
      })),
      unknownClaims: unknownForSource.map((c) => ({
        claimId: c.claimId || null,
        field: c.field || null,
        status: 'unknown'
      }))
    };
  });
}

/**
 * Materialize a PlantCatalogItem from a validated expansion packet.
 * Does not invent values for unknown/needsReview claims without asserted values.
 */
export function materializePlantCatalogItemFromPacket(packet, options = {}) {
  const validation = validateCatalogExpansionPacket(packet);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings: validation.warnings, item: null };
  }

  const identity = packet.identity;
  const now = options.updatedAt || new Date().toISOString();
  const aliases = Array.isArray(identity.aliases)
    ? identity.aliases.map((a) => String(a).trim()).filter(Boolean)
    : [];

  const climateTraits = {};
  const unknownFields = [];
  const needsReviewFields = [];
  let forceNeedsReview = false;

  for (const c of packet.claims) {
    const status = c.status;
    if (status === 'unknown') {
      unknownFields.push(c.field);
      continue;
    }
    if (status === 'needsReview' || status === 'disputed') {
      const nonBlockingDisputedFields = new Set(
        Array.isArray(packet.flags?.nonBlockingDisputedFields)
          ? packet.flags.nonBlockingDisputedFields.map((x) => String(x))
          : []
      );
      const resolvedNonBlocking =
        status === 'disputed'
        && nonBlockingDisputedFields.has(String(c.field || ''))
        && packet.flags?.reviewResolution?.globalCatalogReady === true;

      if (!resolvedNonBlocking) {
        needsReviewFields.push(c.field);
        forceNeedsReview = true;
      }

      if (c.value !== undefined && c.value !== null && c.value !== '') {
        // Keep disputed/needsReview values only when explicitly provided for audit.
        // A documented non-blocking disputed field remains visible but does not
        // silently become an asserted fact.
        if (TRAIT_FIELDS.has(c.field)) climateTraits[c.field] = c.value;
        else if (CLAIM_FIELDS.includes(c.field)) {
          /* applied below via care paths when asserted-like value present */
        }
      }
      continue;
    }
    // asserted
    if (TRAIT_FIELDS.has(c.field)) {
      climateTraits[c.field] = c.value;
    }
  }

  // Mark climateTraits needsReview for unresolved disputed/needsReview claims or
  // an explicit force flag. A reviewResolution may close only explicitly named
  // non-blocking disputes; it never turns them into asserted facts.
  if (packet.flags?.forceClimateNeedsReview === true) forceNeedsReview = true;
  climateTraits.needsReview = forceNeedsReview || climateTraits.needsReview === true;

  if (packet.flags?.reviewResolution && typeof packet.flags.reviewResolution === 'object') {
    climateTraits.reviewResolution = {
      ...packet.flags.reviewResolution,
      nonBlockingDisputedFields: Array.isArray(packet.flags?.nonBlockingDisputedFields)
        ? [...packet.flags.nonBlockingDisputedFields]
        : []
    };
  }

  const { quantitativeEvidence, quantitativeProvenance } =
    materializeQuantitativeEvidenceFromClaims(packet.claims);
  if (quantitativeEvidence) {
    climateTraits.quantitativeEvidence = quantitativeEvidence;
    climateTraits.quantitativeProvenance = quantitativeProvenance;
  }

  // Flowering: preserve descriptive prose when authoritative floweringRequirements is unknown.
  const flowerClaim = packet.claims.find((c) => c.field === 'floweringRequirements');
  const flowerDescClaim = packet.claims.find((c) => c.field === 'floweringDescriptiveProse');
  if (flowerDescClaim?.value) {
    climateTraits.floweringDescriptiveProse = String(flowerDescClaim.value);
    climateTraits.floweringEvidenceClass =
      flowerDescClaim.evidenceClass || FIELD_PROVENANCE_EVIDENCE_CLASSES.HEURISTIC_ASSERTION;
  } else if (flowerClaim?.status === 'unknown' && flowerClaim.shortExcerpt) {
    // Do not silently discard prose that was only parked in shortExcerpt.
    const parked = String(flowerClaim.shortExcerpt || '').trim();
    if (
      parked &&
      !/^Flowering requirements not asserted/i.test(parked) &&
      parked.length > 40
    ) {
      climateTraits.floweringDescriptiveProse = parked;
      climateTraits.floweringEvidenceClass = FIELD_PROVENANCE_EVIDENCE_CLASSES.HEURISTIC_ASSERTION;
    }
  }
  if (flowerClaim?.status === 'asserted' && flowerClaim.value) {
    climateTraits.floweringEvidenceClass =
      flowerClaim.evidenceClass ||
      classifyClaimFieldProvenance(flowerClaim).evidenceClass;
  }

  // Optional reproductive biology block (do not invent).
  const reproductiveBiology = {};
  for (const c of packet.claims) {
    if (!String(c.field || '').startsWith('reproductive.')) continue;
    if (c.status !== 'asserted' || c.value === undefined || c.value === null || c.value === '') {
      continue;
    }
    const key = String(c.field).slice('reproductive.'.length);
    reproductiveBiology[key] = c.value;
  }
  if (Object.keys(reproductiveBiology).length) {
    climateTraits.reproductiveBiology = reproductiveBiology;
  }

  // Structured reproductive climate block.
  // 1) Explicit packet claims are authoritative.
  // 2) Missing structured fields may be filled only by named deterministic transforms
  //    over asserted, source-linked evidence. Derived values stay HEURISTIC_ASSERTION.
  const reproductiveClimate = { contractVersion: 'reproductive-climate-v1' };
  for (const claim of packet.claims) {
    const field = String(claim?.field || '');
    if (!field.startsWith('reproductiveClimate.')) continue;
    if (claim.status !== 'asserted' || claim.value === undefined || claim.value === null || claim.value === '') continue;
    const parts = field.split('.');
    if (parts.length !== 3) continue;
    const phase = parts[1];
    const key = parts[2];
    if (!['flowering','fruiting'].includes(phase)) continue;
    if (!reproductiveClimate[phase]) reproductiveClimate[phase] = {};
    reproductiveClimate[phase][key] = claim.value;
    reproductiveClimate[phase].evidenceClass =
      claim.evidenceClass || classifyClaimFieldProvenance(claim).evidenceClass;
    reproductiveClimate[phase].sourceIds = Array.isArray(claim.sourceIds) ? [...claim.sourceIds] : [];
    reproductiveClimate[phase].sourceExcerpt = claim.shortExcerpt || null;
    if (claim.transformation || claim.transformRef) {
      reproductiveClimate[phase].transformRef = claim.transformRef || claim.transformation;
    }
  }

  const fruitProductionRelevant = packetFruitProductionRelevant(packet);
  const fruitClimateClaim = packet.claims.find((x) => x?.field === 'fruitingRequirements');
  const chillClaim = packet.claims.find((x) => x?.field === 'needsWinterChill');

  if (fruitProductionRelevant && usableSourceClaim(chillClaim) && chillClaim.value === true) {
    const base = {
      eligible: true,
      value: true,
      evidenceClass: 'HEURISTIC_ASSERTION',
      sourceIds: [...chillClaim.sourceIds],
      transformRef: 'winter-chill-to-cool-season-v1@1.0.0',
      evidenceLineage: 'DERIVED_FROM_SOURCE_EVIDENCE_VIA_EXPLICIT_HEURISTIC_TRANSFORM'
    };
    addDerivedReproductiveClaim(
      reproductiveClimate,
      {...base, field:'reproductiveClimate.flowering.requiresCoolSeason'},
      claimEvidenceText(chillClaim)
    );
    addDerivedReproductiveClaim(
      reproductiveClimate,
      {...base, field:'reproductiveClimate.fruiting.requiresCoolSeason'},
      claimEvidenceText(chillClaim)
    );
  } else if (fruitProductionRelevant && usableSourceClaim(chillClaim)) {
    const cool = explicitCoolSeasonFruitingTransform({
      sourceText: claimEvidenceText(chillClaim),
      fruitProductionRelevant,
      sourceIds: chillClaim.sourceIds
    });
    addDerivedReproductiveClaim(reproductiveClimate, cool, claimEvidenceText(chillClaim));
  }

  if (fruitProductionRelevant && usableSourceClaim(fruitClimateClaim)) {
    const sourceText = claimEvidenceText(fruitClimateClaim);
    const frostFree = explicitFrostFreeFruitingTransform({
      sourceText,
      fruitProductionRelevant,
      sourceIds: fruitClimateClaim.sourceIds
    });
    addDerivedReproductiveClaim(reproductiveClimate, frostFree, sourceText);

    const heat = qualitativeSummerHeatFruitingTransform({
      sourceText,
      fruitProductionRelevant,
      sourceIds: fruitClimateClaim.sourceIds
    });
    addDerivedReproductiveClaim(reproductiveClimate, heat, sourceText);
  }

  if (reproductiveClimate.flowering || reproductiveClimate.fruiting) {
    climateTraits.reproductiveClimate = reproductiveClimate;
  }

  // Field-level evidence classes for evaluator evidence-strength propagation.
  const traitEvidenceClasses = {};
  const traitProvenance = {};
  for (const c of packet.claims) {
    if (!TRAIT_FIELDS.has(c.field) && c.field !== 'groupIds' && c.field !== 'floweringRequirements' && c.field !== 'fruitingRequirements') {
      if (
        !String(c.field || '').startsWith('reproductive.')
        && !String(c.field || '').startsWith('reproductiveClimate.')
      ) continue;
    }
    const cls = c.evidenceClass || classifyClaimFieldProvenance(c).evidenceClass;
    traitEvidenceClasses[c.field] = cls;
    traitProvenance[c.field] = {
      evidenceClass: cls,
      sourceIds: c.sourceIds || [],
      shortExcerpt: c.shortExcerpt || null,
      status: c.status
    };
  }
  climateTraits.traitEvidenceClasses = traitEvidenceClasses;
  climateTraits.traitProvenance = traitProvenance;

  const care = {};
  let climateLabel = '';
  const warnings = [];
  const tags = [];
  let matureSize = '';

  for (const c of packet.claims) {
    if (c.status !== 'asserted') continue;
    if (c.field.startsWith('care.')) {
      care[c.field.slice(5)] = c.value;
    } else if (c.field === 'climateLabel') {
      climateLabel = String(c.value);
    } else if (c.field === 'warnings' && Array.isArray(c.value)) {
      warnings.push(...c.value.map(String));
    } else if (c.field === 'tags' && Array.isArray(c.value)) {
      tags.push(...c.value.map(String));
    } else if (c.field === 'gardenCompatibility.spacing.matureSize') {
      matureSize = String(c.value);
    }
  }

  const imageStatus =
    packet.image?.status === 'attached' ? 'attached' : IMAGE_PENDING;
  const media =
    imageStatus === 'attached'
      ? {
          primaryUrl: packet.image.url,
          url: packet.image.url,
          license: packet.image.license,
          attribution: packet.image.attribution,
          searchQuery:
            packet.image.searchQuery ||
            `${identity.acceptedScientificName} ${identity.commonNameEn}`,
          imageStatus: 'attached'
        }
      : {
          searchQuery:
            packet.image?.searchQuery ||
            `${identity.acceptedScientificName} ${identity.commonNameEn}`,
          imageStatus: IMAGE_PENDING
        };

  const botanicalProvenance = buildBotanicalProvenanceFromPacket(packet);

  // Plant Knowledge baseline comes only from the already approved packet sources.
  // This does not invent safety facts; absent warnings remain an honest empty list.
  const packetWarningClaims = (packet.claims || []).filter(
    (claim) =>
      claim?.field === 'warnings'
      && claim?.status === 'asserted'
      && Array.isArray(claim?.value)
  );
  const plantKnowledgeWarnings = [];
  let warningIndex = 0;
  for (const claim of packetWarningClaims) {
    const evidenceClass =
      claim.evidenceClass || classifyClaimFieldProvenance(claim).evidenceClass;
    for (const value of claim.value || []) {
      const summary = String(value || '').trim();
      if (!summary) continue;
      warningIndex += 1;
      plantKnowledgeWarnings.push({
        warningId: `${identity.canonicalSlug}-packet-warning-${warningIndex}`,
        category: 'general',
        canonicalTitle: `${identity.commonNameEn} — catalog warning`,
        summary,
        severity: 'CAUTION',
        evidenceClass,
        regionScope: { level: 'GLOBAL', codes: [], label: null },
        sourceIds: Array.isArray(claim.sourceIds) ? [...claim.sourceIds] : [],
        status: 'asserted'
      });
    }
  }

  const plantKnowledgeSources = (packet.sources || []).map((source) => ({
    sourceId: source.sourceId || null,
    institution: source.institution || null,
    publisher: source.publisher || source.institution || null,
    title: source.title || null,
    url: source.url || null,
    authorityTier: source.authorityTier || null,
    verifiedAt: source.verifiedAt || null
  }));

  climateTraits.plantKnowledge = {
    plantKnowledgeContractVersion: '1.0.0',
    sources: plantKnowledgeSources,
    warnings: plantKnowledgeWarnings,
    importantNotes: packet.flags?.reviewResolution
      ? [{
          noteId: `${identity.canonicalSlug}-catalog-review-resolution`,
          value: String(
            packet.flags.reviewResolution.rationale
            || packet.flags.reviewResolution.status
            || 'Catalog review resolution recorded.'
          ),
          evidenceClass: FIELD_PROVENANCE_EVIDENCE_CLASSES.SOURCE_SUPPORTED,
          sourceIds: plantKnowledgeSources.map((source) => source.sourceId).filter(Boolean),
          status: 'asserted'
        }]
      : [],
    regionalRestrictions: [],
    invasiveness: {},
    plantingRequirements: {},
    soilRequirements: {},
    maintenance: {},
    pestsAndDiseases: [],
    cultivarCaveats: {},
    toxicity: {},
    physicalHazards: {},
    allergenicity: {},
    harvestUseWarnings: {}
  };

  // Design metadata is evidence-preserving input for visual variant planning.
  // Calendar season is not inferred here. Leaf habit is recorded only when
  // explicit wording exists in approved packet claims/excerpts.
  const habitEvidence = [];
  for (const claim of packet.claims || []) {
    if (claim?.status !== 'asserted') continue;
    const values = [];
    if (typeof claim.value === 'string') values.push(claim.value);
    else if (Array.isArray(claim.value)) values.push(...claim.value.map(String));
    if (claim.shortExcerpt) values.push(String(claim.shortExcerpt));
    const blob = values.join(' ').toLowerCase();
    const hasDeciduous = /\bdeciduous\b|\bsemi-deciduous\b|\bsemideciduous\b/.test(blob);
    const hasEvergreen = /\bevergreen\b|\bsemi-evergreen\b|\bsemievergreen\b/.test(blob);
    if (!hasDeciduous && !hasEvergreen) continue;
    habitEvidence.push({
      field: claim.field || null,
      state: hasDeciduous && hasEvergreen
        ? 'CONFLICT'
        : hasDeciduous
          ? 'DECIDUOUS'
          : 'EVERGREEN',
      evidenceClass:
        claim.evidenceClass || classifyClaimFieldProvenance(claim).evidenceClass,
      sourceIds: Array.isArray(claim.sourceIds) ? [...claim.sourceIds] : [],
      shortExcerpt: claim.shortExcerpt || null
    });
  }

  const sourceSupportedHabitStates = [
    ...new Set(
      habitEvidence
        .filter((row) => row.evidenceClass === FIELD_PROVENANCE_EVIDENCE_CLASSES.SOURCE_SUPPORTED)
        .map((row) => row.state)
        .filter((state) => state === 'DECIDUOUS' || state === 'EVERGREEN')
    )
  ];
  const leafHabit =
    sourceSupportedHabitStates.length === 1
      ? {
          state: sourceSupportedHabitStates[0],
          evidenceClass: FIELD_PROVENANCE_EVIDENCE_CLASSES.SOURCE_SUPPORTED,
          evidence: habitEvidence.filter(
            (row) =>
              row.evidenceClass === FIELD_PROVENANCE_EVIDENCE_CLASSES.SOURCE_SUPPORTED
              && row.state === sourceSupportedHabitStates[0]
          )
        }
      : sourceSupportedHabitStates.length > 1
        ? {
            state: 'CONFLICT',
            evidenceClass: FIELD_PROVENANCE_EVIDENCE_CLASSES.UNKNOWN,
            evidence: habitEvidence
          }
        : {
            state: 'UNKNOWN',
            evidenceClass: FIELD_PROVENANCE_EVIDENCE_CLASSES.UNKNOWN,
            evidence: habitEvidence
          };

  climateTraits.designMetadata = {
    contractVersion: 'design-metadata-v1',
    tags: tags.length ? [...new Set(tags)] : [],
    growth: care.growth ? String(care.growth) : null,
    matureSize: matureSize || null,
    leafHabit,
    seasonalityResearchRequired: leafHabit.state === 'UNKNOWN',
    sourcePacket: packet.packetId
  };

  const item = {
    schemaVersion: 1,
    slug: identity.canonicalSlug,
    names: { en: identity.commonNameEn },
    aliases: aliases.length
      ? aliases
      : [identity.commonNameEn, identity.acceptedScientificName].map((s) =>
          String(s).toLowerCase()
        ),
    scientific: identity.acceptedScientificName,
    tags: tags.length ? [...new Set(tags)] : ['tropical', 'fruit'],
    care: Object.keys(care).length ? care : undefined,
    climateLabel: climateLabel || undefined,
    climateTraits,
    // Top-level botanical provenance (distinct from media.provenance).
    provenance: botanicalProvenance,
    warnings: warnings.length ? warnings : undefined,
    media,
    careSchedule: {
      initialTasks: [
        { title: 'Confirm frost-free / humidity fit', icon: '🌡️', offsetDays: 0 },
        { title: 'Check soil moisture and drainage', icon: '💧', offsetDays: 7 }
      ],
      needsReview: true
    },
    gardenCompatibility: {
      needsReview: true,
      ...(matureSize
        ? { spacing: { matureSize } }
        : {})
    },
    verification: {
      needsReview: climateTraits.needsReview === true,
      botanicalVerified: packet.flags?.botanicalVerified === true,
      climateVerified: false,
      reviewNotes: `Ingested via catalog-expansion-v1 packet ${packet.packetId}. Unknown: ${unknownFields.join(', ') || 'none'}. NeedsReview fields: ${needsReviewFields.join(', ') || 'none'}.`
    },
    // Only flag needs_review when climateTraits.needsReview is forced (conflicts / Owner flag).
    // Blind needs_review on every expansion ingest falsely caps Specific Plant outcomes to Borderline.
    qualityTier: climateTraits.needsReview === true ? 'needs_review' : 'expansion_asserted_v1',
    source: {
      provider: 'catalog-expansion-v1',
      recordId: packet.packetId,
      expansionContractVersion: CATALOG_EXPANSION_CONTRACT_VERSION,
      imageStatus,
      provenance: botanicalProvenance,
      claimCount: (packet.claims || []).length,
      unknownFields,
      needsReviewFields
    },
    updatedAt: now
  };

  // Drop undefined optional keys for cleaner seed rows
  if (!item.care) delete item.care;
  if (!item.climateLabel) delete item.climateLabel;
  if (!item.warnings) delete item.warnings;

  return {
    ok: true,
    errors: [],
    warnings: validation.warnings,
    item,
    imageStatus,
    unknownFields,
    needsReviewFields,
    identityRegistryEntry: {
      canonicalSlug: identity.canonicalSlug,
      acceptedScientificName: identity.acceptedScientificName,
      needsReview: false,
      ...(options.plantId ? { plantId: options.plantId } : {}),
      notes: `Catalog Expansion V1 acceptance ingest from packet ${packet.packetId}.`
    }
  };
}

/**
 * Merge a materialized item into a plants.seed.json document (immutable input).
 * Replaces existing slug if replaceExisting; otherwise refuses duplicates.
 */
export function mergePlantIntoSeedDocument(seedDoc, item, { replaceExisting = false } = {}) {
  if (!seedDoc || !Array.isArray(seedDoc.plants)) {
    return { ok: false, error: 'invalid seed document', seed: null };
  }
  const plants = seedDoc.plants.slice();
  const idx = plants.findIndex((p) => p.slug === item.slug);
  if (idx >= 0 && !replaceExisting) {
    return { ok: false, error: `slug already present: ${item.slug}`, seed: null };
  }
  if (idx >= 0) plants[idx] = item;
  else plants.unshift(item);
  return {
    ok: true,
    seed: { ...seedDoc, plants },
    action: idx >= 0 ? 'replaced' : 'inserted'
  };
}

/**
 * Insert or update identity registry entry by canonicalSlug (sorted by slug).
 */
export function mergeIdentityRegistryEntry(registry, entry) {
  if (!registry || !Array.isArray(registry.canonicalIdentities)) {
    return { ok: false, error: 'invalid registry', registry: null };
  }
  const list = registry.canonicalIdentities.slice();
  const idx = list.findIndex((e) => e.canonicalSlug === entry.canonicalSlug);
  if (idx >= 0) list[idx] = { ...list[idx], ...entry };
  else list.push(entry);
  list.sort((a, b) => String(a.canonicalSlug).localeCompare(String(b.canonicalSlug)));
  return { ok: true, registry: { ...registry, canonicalIdentities: list } };
}
