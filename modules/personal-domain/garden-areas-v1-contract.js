/**
 * Garden Areas / Microclimate V1 — pure contracts (no DOM / network).
 *
 * Reuses Garden Context Profile (GCP) vocabulary — does NOT invent parallel enums.
 * Coordinate / structural climate remains the ONLY ambient climate authority.
 * Area context refines local planting conditions only (sun, shelter, irrigation, etc.).
 *
 * Reads MUST always pass through normalizeAreaContext before suitability use.
 */
import { SR_GARDEN_CONTEXT_PROFILE_VERSION } from '../smart-recommendations/developer-garden-context-profile.js';

export const GARDEN_AREAS_V1_VERSION = '1.0.0-migration-ready';

/** Persistable Area context schema id + GCP contract version (backward-compatible). */
export const AREA_CONTEXT_SCHEMA = 'garden_area_context_v1';
export const AREA_CONTEXT_CONTRACT_VERSION = SR_GARDEN_CONTEXT_PROFILE_VERSION;

/** Ambient climate store — must not be duplicated by Areas. */
export const GARDEN_CLIMATE_AUTHORITY = Object.freeze({
  STORE: 'garden_profiles.location_structural_climate*',
  COORDINATE_CLIMATE_V2: true,
  AREA_IS_SECOND_CLIMATE_AUTHORITY: false,
  AREA_MAY_OVERRIDE_HARD_FROST_OR_REGIONAL_BLOCKS: false
});

// --- Vocabulary aligned with developer-garden-context-profile.js (GCP) ---

export const AREA_SOURCES = Object.freeze([
  'user_input',
  'device_photo',
  'inferred_from_photo',
  'owner_review',
  'default_unknown'
]);

export const AREA_CONFIRMATION_STATUSES = Object.freeze([
  'unconfirmed',
  'user_confirmed',
  'owner_reviewed'
]);

export const AREA_CONFIDENCE = Object.freeze(['none', 'low', 'medium', 'high']);

export const AREA_PRECISION_LEVELS = Object.freeze([
  'whole_garden',
  'zone',
  'exact_spot',
  'container'
]);

export const AREA_SUN_EXPOSURES = Object.freeze([
  'full_sun',
  'part_sun',
  'part_shade',
  'full_shade',
  'unknown'
]);

/** Area site planting modes — includes greenhouse (GCP plantingMode does not yet). */
export const AREA_PLANTING_MODES = Object.freeze([
  'ground',
  'raised_bed',
  'container',
  'balcony',
  'greenhouse',
  'indoor',
  'unknown'
]);

/** GCP-supported plantingMode tokens only (no greenhouse). */
export const GCP_SUPPORTED_PLANTING_MODES = Object.freeze([
  'ground',
  'raised_bed',
  'container',
  'balcony',
  'indoor',
  'unknown'
]);

export const AREA_DRAINAGE = Object.freeze([
  'well_drained',
  'moderate',
  'poor',
  'unknown'
]);

export const AREA_IRRIGATION_TYPES = Object.freeze([
  'none',
  'manual',
  'drip',
  'sprinkler',
  'automatic',
  'unknown'
]);

export const AREA_IRRIGATION_RELIABILITY = Object.freeze([
  'none',
  'low',
  'medium',
  'high',
  'unknown'
]);

export const AREA_MOISTURE_TENDENCY = Object.freeze([
  'dry',
  'moderate',
  'moist',
  'unknown'
]);

export const AREA_WIND_EXPOSURE = Object.freeze([
  'exposed',
  'moderate',
  'sheltered',
  'unknown'
]);

export const AREA_ASPECTS = Object.freeze([
  'N',
  'NE',
  'E',
  'SE',
  'S',
  'SW',
  'W',
  'NW',
  'unknown'
]);

const PHOTO_SOURCES = Object.freeze({
  device_photo: true,
  inferred_from_photo: true
});

const TRUSTED_CONFIRMATIONS = Object.freeze({
  user_confirmed: true,
  owner_reviewed: true
});

const TRUSTED_CONFIDENCE = Object.freeze({
  medium: true,
  high: true
});

const UNKNOWN_REASON_FIELDS = Object.freeze([
  'sunExposure',
  'drainage',
  'irrigationType',
  'irrigationReliability',
  'plantingMode'
]);

function inSet(set, value) {
  return set.includes(String(value || '').trim());
}

function asPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function normalizeToken(value, allowed, fallback = 'unknown') {
  const v = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!v) return fallback;
  if (allowed.includes(v)) return v;
  if (v === 'partial_sun' || v === 'partial') return allowed.includes('part_sun') ? 'part_sun' : fallback;
  if (v === 'partial_shade') return allowed.includes('part_shade') ? 'part_shade' : fallback;
  if (v === 'pot' || v === 'pots') return allowed.includes('container') ? 'container' : fallback;
  return fallback;
}

function normalizeUnknownReasons(raw, fieldValues) {
  const src = asPlainObject(raw) || {};
  const out = {};
  for (const key of UNKNOWN_REASON_FIELDS) {
    if (fieldValues[key] === 'unknown') {
      const reason = String(src[key] || '').trim();
      out[key] = reason || 'not_provided';
    } else if (src[key] != null && String(src[key]).trim()) {
      out[key] = String(src[key]).trim().slice(0, 120);
    }
  }
  // Preserve extra explicit reasons without inventing site facts
  for (const [k, v] of Object.entries(src)) {
    if (out[k] != null) continue;
    if (v == null) continue;
    const s = String(v).trim();
    if (s) out[k] = s.slice(0, 120);
  }
  return out;
}

function derivePrecisionLevel(src, plantingMode) {
  const raw = src.precisionLevel ?? src.precision_level;
  if (inSet(AREA_PRECISION_LEVELS, raw)) return String(raw).trim();
  if (plantingMode === 'container' || plantingMode === 'balcony') return 'container';
  return 'zone';
}

/**
 * GCP-aligned trust evaluation. Photo/inferred never silently trusted without confirmation.
 */
export function evaluateAreaContextTrust(parts = {}) {
  const source = parts.source || 'default_unknown';
  const confirmationStatus = parts.confirmationStatus || 'unconfirmed';
  const confidence = parts.confidence || 'none';
  const confirmationOk = TRUSTED_CONFIRMATIONS[confirmationStatus] === true;
  const sourceTrusted = source !== 'default_unknown';
  const confidenceOk = TRUSTED_CONFIDENCE[confidence] === true;
  const photoSource = PHOTO_SOURCES[source] === true;
  // Inferred/photo without confirmation cannot become trusted
  if (photoSource && !confirmationOk) {
    return {
      trusted: false,
      confirmationOk,
      sourceTrusted,
      confidenceOk,
      photoSource,
      reason: 'photo_or_inferred_unconfirmed'
    };
  }
  const trusted = confirmationOk && sourceTrusted && confidenceOk;
  return {
    trusted,
    confirmationOk,
    sourceTrusted,
    confidenceOk,
    photoSource,
    reason: trusted ? 'ok' : 'insufficient_trust_metadata'
  };
}

/**
 * Bounded Area context object (stored in garden_areas.context jsonb).
 * Unknown is valid; never invent from ambient climate.
 * Malformed non-objects are safely normalized (not used as trusted suitability input).
 */
export function normalizeAreaContext(input = {}, options = {}) {
  const strictWrite = options.strictWrite === true;
  const plain = asPlainObject(input);
  if (!plain) {
    if (strictWrite && input != null && input !== undefined) {
      throw new Error('area_context_must_be_object');
    }
    // Safe read path for malformed JSONB / arrays / scalars
    return normalizeAreaContext(
      {
        source: 'default_unknown',
        confirmationStatus: 'unconfirmed',
        confidence: 'none',
        precisionLevel: 'zone',
        sunExposure: 'unknown',
        plantingMode: 'unknown',
        drainage: 'unknown',
        irrigationType: 'unknown',
        irrigationReliability: 'unknown',
        unknownReasons: {
          sunExposure: 'malformed_context_normalized',
          drainage: 'malformed_context_normalized',
          irrigationType: 'malformed_context_normalized',
          irrigationReliability: 'malformed_context_normalized',
          plantingMode: 'malformed_context_normalized'
        }
      },
      { strictWrite: false, _malformed: true }
    );
  }

  const src = plain;
  const sunExposure = normalizeToken(src.sunExposure ?? src.sun_exposure, AREA_SUN_EXPOSURES);
  const plantingMode = normalizeToken(
    src.plantingMode ?? src.planting_mode,
    AREA_PLANTING_MODES
  );
  const drainage = normalizeToken(src.drainage, AREA_DRAINAGE);
  const irrigationType = normalizeToken(
    src.irrigationType ?? src.irrigation_type,
    AREA_IRRIGATION_TYPES
  );
  const irrigationReliability = normalizeToken(
    src.irrigationReliability ?? src.irrigation_reliability,
    AREA_IRRIGATION_RELIABILITY
  );
  const moistureTendency = normalizeToken(
    src.moistureTendency ?? src.soilMoistureTendency ?? src.moisture_tendency,
    AREA_MOISTURE_TENDENCY
  );
  const windExposure = normalizeToken(
    src.windExposure ?? src.wind_exposure ?? src.shelter,
    AREA_WIND_EXPOSURE
  );
  const aspect = (() => {
    const raw = String(src.aspect ?? src.orientation ?? 'unknown')
      .trim()
      .toUpperCase();
    if (AREA_ASPECTS.includes(raw)) return raw;
    if (raw === 'UNKNOWN' || !raw) return 'unknown';
    return 'unknown';
  })();

  let directSunHoursMin = null;
  let directSunHoursMax = null;
  const range = src.directSunHoursRange || src.direct_sun_hours_range;
  if (range && typeof range === 'object' && !Array.isArray(range)) {
    const a = Number(range.min ?? range[0]);
    const b = Number(range.max ?? range[1]);
    if (Number.isFinite(a) && a >= 0 && a <= 24) directSunHoursMin = a;
    if (Number.isFinite(b) && b >= 0 && b <= 24) directSunHoursMax = b;
  } else if (Number.isFinite(Number(src.directSunHours ?? src.direct_sun_hours))) {
    const h = Number(src.directSunHours ?? src.direct_sun_hours);
    if (h >= 0 && h <= 24) {
      directSunHoursMin = h;
      directSunHoursMax = h;
    }
  }

  const source = inSet(AREA_SOURCES, src.source) ? String(src.source).trim() : 'default_unknown';
  const confirmationStatus = inSet(
    AREA_CONFIRMATION_STATUSES,
    src.confirmationStatus ?? src.confirmation_status
  )
    ? String(src.confirmationStatus ?? src.confirmation_status).trim()
    : 'unconfirmed';
  const confidence = inSet(AREA_CONFIDENCE, src.confidence)
    ? String(src.confidence).trim()
    : 'none';
  const precisionLevel = derivePrecisionLevel(src, plantingMode);

  const fieldValues = {
    sunExposure,
    drainage,
    irrigationType,
    irrigationReliability,
    plantingMode
  };
  const unknownReasons = normalizeUnknownReasons(src.unknownReasons ?? src.unknown_reasons, fieldValues);

  const trust = evaluateAreaContextTrust({ source, confirmationStatus, confidence });

  const notes = String(src.notes ?? src.userNotes ?? '')
    .trim()
    .slice(0, 500);
  const description = String(src.description ?? '')
    .trim()
    .slice(0, 280);

  return {
    schema: AREA_CONTEXT_SCHEMA,
    contractVersion: AREA_CONTEXT_CONTRACT_VERSION,
    source,
    confirmationStatus,
    confidence,
    precisionLevel,
    sunExposure,
    plantingMode,
    // Explicit Area site type alias — greenhouse preserved here always
    siteType: plantingMode,
    drainage,
    irrigationType,
    irrigationReliability,
    moistureTendency,
    windExposure,
    aspect,
    directSunHoursMin,
    directSunHoursMax,
    unknownReasons,
    trusted: trust.trusted,
    trustReason: trust.reason,
    notes: notes || undefined,
    description: description || undefined,
    climateAuthority: false,
    malformedInputNormalized: options._malformed === true || undefined
  };
}

/**
 * Never use raw persisted context as suitability input — always normalize first.
 */
export function areaContextForSuitability(persistedContext) {
  return normalizeAreaContext(persistedContext);
}

export function validateAreaName(name) {
  const n = String(name || '').trim();
  if (!n) throw new Error('area_name_required');
  if (n.length > 80) throw new Error('area_name_too_long');
  return n;
}

/**
 * Build write payload. Context always normalized; non-object context rejected on write.
 */
export function buildAreaWritePayload(input = {}, options = {}) {
  const name = validateAreaName(input.name);
  const clientInstanceId = String(
    input.clientInstanceId || input.client_instance_id || options.idFactory?.() || ''
  ).trim();
  if (!clientInstanceId) throw new Error('client_instance_id_required');

  const rawContext = input.context != null ? input.context : input;
  if (rawContext != null && !asPlainObject(rawContext) && rawContext === input.context) {
    throw new Error('area_context_must_be_object');
  }
  // Prefer nested context; avoid treating name/client ids as context fields when passed flat
  const contextSrc =
    input.context != null
      ? input.context
      : {
          sunExposure: input.sunExposure,
          plantingMode: input.plantingMode,
          drainage: input.drainage,
          irrigationType: input.irrigationType,
          irrigationReliability: input.irrigationReliability,
          moistureTendency: input.moistureTendency,
          windExposure: input.windExposure,
          aspect: input.aspect,
          source: input.source,
          confirmationStatus: input.confirmationStatus,
          confidence: input.confidence,
          precisionLevel: input.precisionLevel,
          unknownReasons: input.unknownReasons,
          notes: input.notes,
          description: input.description,
          directSunHours: input.directSunHours,
          directSunHoursRange: input.directSunHoursRange
        };

  const context = normalizeAreaContext(contextSrc, { strictWrite: true });
  return {
    client_instance_id: clientInstanceId,
    name,
    context
  };
}

/**
 * Helper for explicit user form writes (create/edit).
 */
export function buildUserProvidedAreaContext(partial = {}) {
  const plantingMode = normalizeToken(partial.plantingMode, AREA_PLANTING_MODES);
  return normalizeAreaContext(
    {
      ...partial,
      source: partial.source || 'user_input',
      confirmationStatus: partial.confirmationStatus || 'user_confirmed',
      confidence: partial.confidence || 'medium',
      precisionLevel:
        partial.precisionLevel ||
        (plantingMode === 'container' || plantingMode === 'balcony' ? 'container' : 'zone')
    },
    { strictWrite: true }
  );
}

export function assertPlantAreaSameGarden(input = {}) {
  const plantGardenId = String(input.plantGardenProfileId || input.plant_garden_profile_id || '').trim();
  const areaGardenId = String(input.areaGardenProfileId || input.area_garden_profile_id || '').trim();
  if (!plantGardenId || !areaGardenId) throw new Error('garden_ids_required');
  if (plantGardenId !== areaGardenId) throw new Error('cross_garden_area_link_forbidden');
  return true;
}

export function assertAreaOwnedByGarden(areaRow, gardenProfileId) {
  const a = String(areaRow?.garden_profile_id || areaRow?.gardenProfileId || '').trim();
  const g = String(gardenProfileId || '').trim();
  if (!a || !g || a !== g) throw new Error('cross_garden_area_access_forbidden');
  return true;
}

export function applyAreaContextToSuitabilityInputs(input = {}) {
  const ambient = input.ambientClimate || input.structuralClimate || null;
  const areaContext = normalizeAreaContext(input.areaContext || {});
  const hardBlock = input.hardClimateBlock === true || input.ccpHardBlock === true;

  return {
    ambientClimate: ambient,
    localSiteContext: areaContext,
    sunExposure: areaContext.sunExposure,
    plantingMode: areaContext.plantingMode,
    siteType: areaContext.siteType,
    drainage: areaContext.drainage,
    irrigationType: areaContext.irrigationType,
    irrigationReliability: areaContext.irrigationReliability,
    moistureTendency: areaContext.moistureTendency,
    windExposure: areaContext.windExposure,
    aspect: areaContext.aspect,
    source: areaContext.source,
    confirmationStatus: areaContext.confirmationStatus,
    confidence: areaContext.confidence,
    trusted: areaContext.trusted,
    hardClimateBlock: hardBlock,
    hardBlockClearedByArea: false,
    hardBlockOverriddenByArea: false,
    areaUsedAsClimateAuthority: false,
    recommendationBlocked:
      hardBlock === true
        ? {
            blocked: true,
            reason: 'hard_climate_block_stands',
            detail: 'Area/microclimate cannot clear regional climate hard blocks'
          }
        : { blocked: false }
  };
}

/**
 * Project Area site context toward GCP shape WITHOUT lossy greenhouse → trusted ground.
 */
export function projectAreaContextToGardenContextProfile(areaContextInput) {
  const context = normalizeAreaContext(areaContextInput || {});
  const gaps = [];
  let gcpPlantingMode = context.plantingMode;

  if (context.plantingMode === 'greenhouse') {
    gcpPlantingMode = 'ground'; // nearest structural token only
    gaps.push({
      field: 'plantingMode',
      areaValue: 'greenhouse',
      projectedValue: 'ground',
      code: 'gcp_unsupported_planting_mode_greenhouse',
      semanticLoss: true,
      trustedAsOrdinaryGround: false,
      detail:
        'GCP plantingMode vocabulary does not include greenhouse; projection is partial/insufficient, not ordinary open-ground evidence'
    });
  } else if (!GCP_SUPPORTED_PLANTING_MODES.includes(context.plantingMode)) {
    gcpPlantingMode = 'unknown';
    gaps.push({
      field: 'plantingMode',
      areaValue: context.plantingMode,
      projectedValue: 'unknown',
      code: 'gcp_unsupported_planting_mode',
      semanticLoss: true,
      trustedAsOrdinaryGround: false
    });
  }

  const trust = evaluateAreaContextTrust(context);
  const hasSemanticLoss = gaps.some((g) => g.semanticLoss === true);
  // Never treat greenhouse projection as trusted ordinary ground
  const trustedAsOrdinaryGround =
    context.plantingMode === 'ground' && trust.trusted && !hasSemanticLoss;
  const projectionTrusted =
    trust.trusted && !hasSemanticLoss && context.plantingMode !== 'greenhouse';

  return {
    contractVersion: AREA_CONTEXT_CONTRACT_VERSION,
    scope: 'zone',
    source: context.source,
    confirmationStatus: context.confirmationStatus,
    confidence: context.confidence,
    precisionLevel: context.precisionLevel,
    sunExposure: context.sunExposure,
    drainage: context.drainage,
    irrigationType: context.irrigationType,
    irrigationReliability: context.irrigationReliability,
    plantingMode: gcpPlantingMode,
    soilMoistureTendency: context.moistureTendency,
    aspect: context.aspect === 'unknown' ? undefined : context.aspect,
    unknownReasons: { ...context.unknownReasons },
    // Area-authoritative site type preserved beside projection
    areaSiteType: context.plantingMode,
    areaPlantingMode: context.plantingMode,
    projectionGaps: gaps,
    profileStatus: hasSemanticLoss ? 'insufficient' : trust.trusted ? 'partial' : 'untrusted',
    trusted: projectionTrusted,
    trustedAsOrdinaryGround,
    semanticLoss: hasSemanticLoss,
    climateAuthority: false
  };
}

/**
 * Stable read contract for future Smart Rec / Design (no personalization yet).
 * Always normalizes persisted context — never trusts raw JSONB.
 */
export function buildAreaReadModel(areaRow = {}, plants = []) {
  const id = areaRow.id || areaRow.serverId || null;
  const context = normalizeAreaContext(areaRow.context);
  const plantList = (plants || []).filter((p) => {
    const plantAreaId = String(p.garden_area_id || p.gardenAreaId || '').trim();
    if (id && plantAreaId && plantAreaId === String(id)) return true;
    const plantAreaCid = String(p.areaClientInstanceId || '').trim();
    const areaCid = String(areaRow.client_instance_id || areaRow.clientInstanceId || '').trim();
    if (plantAreaCid && areaCid && plantAreaCid === areaCid) return true;
    return false;
  });
  const unknownFields = [];
  for (const [key, val] of Object.entries({
    sunExposure: context.sunExposure,
    plantingMode: context.plantingMode,
    drainage: context.drainage,
    irrigationType: context.irrigationType,
    irrigationReliability: context.irrigationReliability,
    moistureTendency: context.moistureTendency,
    windExposure: context.windExposure,
    aspect: context.aspect
  })) {
    if (val === 'unknown') unknownFields.push(key);
  }

  const gardenContextProfileProjection = projectAreaContextToGardenContextProfile(context);

  return {
    version: GARDEN_AREAS_V1_VERSION,
    areaId: id,
    clientInstanceId: areaRow.client_instance_id || areaRow.clientInstanceId || null,
    gardenProfileId: areaRow.garden_profile_id || areaRow.gardenProfileId || null,
    name: areaRow.name || '',
    context,
    siteType: context.siteType,
    plantingMode: context.plantingMode,
    plantCount: plantList.length,
    plantNames: plantList.map((p) => p.name).filter(Boolean),
    unknownFields,
    unknownReasons: context.unknownReasons,
    source: context.source,
    confirmationStatus: context.confirmationStatus,
    confidence: context.confidence,
    precisionLevel: context.precisionLevel,
    trusted: context.trusted,
    climateAuthority: GARDEN_CLIMATE_AUTHORITY,
    gardenContextProfileProjection
  };
}

export function areaLabelForPlant(plant, areasById = new Map()) {
  const areaId = plant?.garden_area_id || plant?.gardenAreaId || null;
  if (!areaId) return null;
  const area = areasById.get(String(areaId));
  return area?.name ? String(area.name) : null;
}

export function detachPlantsAfterAreaDelete(plants = [], deletedAreaId) {
  const id = String(deletedAreaId || '');
  return (plants || []).map((p) => {
    const link = String(p.garden_area_id || p.gardenAreaId || '');
    if (link && link === id) {
      return { ...p, garden_area_id: null, gardenAreaId: null };
    }
    return p;
  });
}

export function resolvePlantSiteContextForComparison(input = {}) {
  const area = input.areaRow || input.area || null;
  const areaContext = area
    ? normalizeAreaContext(area.context != null ? area.context : input.areaContext || {})
    : normalizeAreaContext(input.areaContext || {});
  const gardenGcp = input.gardenContextProfile || input.gardenGcp || null;
  const hardBlock = input.hardClimateBlock === true;

  const pick = (areaVal, gardenVal) => {
    if (areaVal && areaVal !== 'unknown') return { value: areaVal, source: 'area' };
    if (gardenVal && gardenVal !== 'unknown') return { value: gardenVal, source: 'garden_context_profile' };
    return { value: 'unknown', source: 'unknown' };
  };

  const sun = pick(areaContext.sunExposure, gardenGcp?.sunExposure);
  const water = pick(
    areaContext.irrigationType !== 'unknown'
      ? areaContext.irrigationType
      : areaContext.moistureTendency,
    gardenGcp?.irrigationType || gardenGcp?.soilMoistureTendency
  );

  return {
    sunExposure: sun.value,
    sunSource: sun.source,
    waterProxy: water.value,
    waterSource: water.source,
    plantingMode: areaContext.plantingMode,
    siteType: areaContext.siteType,
    drainage: areaContext.drainage,
    irrigationType: areaContext.irrigationType,
    moistureTendency: areaContext.moistureTendency,
    source: areaContext.source,
    confirmationStatus: areaContext.confirmationStatus,
    confidence: areaContext.confidence,
    trusted: areaContext.trusted,
    ambientClimateUsedAsSiteSun: false,
    ambientClimateUsedAsSiteWater: false,
    hardClimateBlock: hardBlock,
    hardBlockOverriddenByArea: false,
    usesAmbientCcpAlone: sun.source === 'unknown' && water.source === 'unknown' && !gardenGcp
  };
}
