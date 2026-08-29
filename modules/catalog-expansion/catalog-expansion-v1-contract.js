/**
 * Catalog Expansion V1 — provenance-backed plant ingestion (non-runtime).
 *
 * Validates an expansion packet and materializes a PlantCatalogItem draft.
 * Plant-agnostic: no slug-specific branches. Does not invent climate traits.
 * Image attachment only when packet supplies license-clear media; otherwise IMAGE_PENDING.
 *
 * NOT imported by product runtime suitability paths.
 */

export const CATALOG_EXPANSION_CONTRACT_VERSION = '1.0.0';

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
  'gardenCompatibility.spacing.matureSize'
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
  if (packet.expansionContractVersion !== CATALOG_EXPANSION_CONTRACT_VERSION) {
    fail(
      errors,
      `expansionContractVersion must be ${CATALOG_EXPANSION_CONTRACT_VERSION}`
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
      if (status === 'disputed') {
        warnings.push(`claim ${c.claimId}: disputed — will force needsReview on materialization`);
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

  return { ok: errors.length === 0, errors, warnings };
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
      needsReviewFields.push(c.field);
      forceNeedsReview = true;
      if (c.value !== undefined && c.value !== null && c.value !== '') {
        // Keep disputed/needsReview values only when explicitly provided for audit;
        // still mark review so outcomes cannot become confident positives.
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

  // Always mark climateTraits needsReview when any claim is disputed/needsReview
  // or when packet.flags.forceClimateNeedsReview is set.
  if (packet.flags?.forceClimateNeedsReview === true) forceNeedsReview = true;
  climateTraits.needsReview = forceNeedsReview || climateTraits.needsReview === true;

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

  const provenanceSummary = (packet.sources || []).map((s) => ({
    sourceId: s.sourceId,
    institution: s.institution,
    title: s.title,
    url: s.url,
    authorityTier: s.authorityTier,
    verifiedAt: s.verifiedAt
  }));

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
      needsReview: true,
      botanicalVerified: packet.flags?.botanicalVerified === true,
      climateVerified: false,
      reviewNotes: `Ingested via catalog-expansion-v1 packet ${packet.packetId}. Unknown: ${unknownFields.join(', ') || 'none'}. NeedsReview fields: ${needsReviewFields.join(', ') || 'none'}.`
    },
    qualityTier: 'needs_review',
    source: {
      provider: 'catalog-expansion-v1',
      recordId: packet.packetId,
      expansionContractVersion: CATALOG_EXPANSION_CONTRACT_VERSION,
      imageStatus,
      provenance: provenanceSummary,
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
