/**
 * Garden Design → Owned Garden V1.
 *
 * Design is a planning/view layer over the active Garden.
 * Does not create a second garden, catalog, location, or suitability engine.
 * Placement never creates garden_plants until explicit Add to My Garden.
 */

import { GARDEN_SOURCE_MODULES, GARDEN_EVENT_TYPES } from '../personal-domain/garden-os-spine-v1-contract.js';
import {
  resolveManifestKeyToCanonical
} from './garden-design-asset-registry-v1.js';

export const GARDEN_DESIGN_OWNED_GARDEN_VERSION = '1.0.0';

export const DESIGN_PLANT_KIND = Object.freeze({
  OWNED: 'owned',
  PROPOSED: 'proposed'
});

export const DESIGN_PLACEMENT_STATUS = Object.freeze({
  OWNED: 'owned',
  PROPOSED: 'proposed',
  COMMITTED: 'committed'
});

export const DESIGN_GARDEN_SOURCE = 'Garden Design';
export const DESIGN_SOURCE_TOKEN = 'garden-design';

/** Host and Design iframe are same-origin. postMessage still validates origin/source. */
export const GD_BRIDGE_SAME_ORIGIN = true;

export const GD_HOST_TO_DESIGN = Object.freeze({
  CONTEXT: 'cruvit:garden-design-context',
  OWNED_PLANTS: 'cruvit:garden-design-owned-plants',
  AREAS: 'cruvit:garden-design-areas',
  ASSET_REGISTRY: 'cruvit:garden-design-asset-registry',
  COMMIT_RESULT: 'cruvit:garden-design-commit-result',
  SUITABILITY_RESULT: 'cruvit:garden-design-suitability-result'
});

export const GD_DESIGN_TO_HOST = Object.freeze({
  READY: 'cruvit:garden-design-ready',
  SUITABILITY_REQUEST: 'cruvit:garden-design-suitability-request',
  COMMIT_PROPOSAL: 'cruvit:garden-design-commit-proposal',
  REFRESH_OWNED: 'cruvit:garden-design-refresh-owned-plants'
});

const GD_BRIDGE_TYPES = new Set([
  ...Object.values(GD_HOST_TO_DESIGN),
  ...Object.values(GD_DESIGN_TO_HOST)
]);

export function isGardenDesignBridgeType(type) {
  return GD_BRIDGE_TYPES.has(asText(type));
}

export function gardenDesignPostTargetOrigin(win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  if (!w || !w.location) return '*';
  const origin = w.location.origin;
  if (!origin || origin === 'null' || origin === 'file://') return '*';
  return origin;
}

/**
 * Strict typed host/iframe message gate.
 * Rejects unknown types, foreign origins, and unexpected sources.
 * Never required to carry secrets.
 */
export function acceptGardenDesignMessage(event, options = {}) {
  if (!event || !event.data || typeof event.data !== 'object') {
    return { ok: false, reason: 'empty' };
  }
  const type = asText(event.data.type);
  if (!isGardenDesignBridgeType(type)) {
    return { ok: false, reason: 'unknown-type' };
  }
  if (Array.isArray(options.allowedTypes) && options.allowedTypes.length && !options.allowedTypes.includes(type)) {
    return { ok: false, reason: 'type-not-allowed-here' };
  }
  const expectedOrigin = options.expectedOrigin || gardenDesignPostTargetOrigin(options.win);
  if (
    expectedOrigin &&
    expectedOrigin !== '*' &&
    event.origin &&
    event.origin !== 'null' &&
    event.origin !== expectedOrigin
  ) {
    return { ok: false, reason: 'origin-mismatch' };
  }
  if (options.expectedSource && event.source && event.source !== options.expectedSource) {
    return { ok: false, reason: 'source-mismatch' };
  }
  return {
    ok: true,
    sameOrigin: GD_BRIDGE_SAME_ORIGIN,
    type,
    payload: event.data
  };
}

export function buildDesignSuitabilityAccess(classified = {}) {
  const available = classified.useForSuitability === true && classified.status === 'TRUSTED_CONFIRMED';
  return {
    engine: 'smartRecEvaluateSuitability',
    iframeMustNotEvaluate: true,
    available,
    status: available ? 'available' : 'UNKNOWN',
    reason: available ? 'trusted-garden-location' : classified.reason || classified.status || 'untrusted-location'
  };
}

export const DESIGN_OWNED_VISUAL_POLICY = Object.freeze({
  multipleVisualsAllowedForComposition: true,
  duplicateOwnershipForbidden: true,
  pickerPlacesAtMostOneUnlessDuplicated: true,
  chosen:
    'One owned garden_plant_id. Extra visuals (duplicate/qty+) share that id and never insert another garden_plants row.'
});

export const WESTERN_GALILEE_DEFAULT_LABEL = 'Western Galilee, Israel';

function asText(value) {
  return String(value == null ? '' : value).trim();
}

function slugify(value) {
  return asText(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function resolveDesignCanonicalSlug(input = {}, aliasMaps = {}) {
  const maps = aliasMaps && typeof aliasMaps === 'object' ? aliasMaps : {};
  const manifestKey = slugify(input.manifestKey || input.assetKey);
  if (manifestKey) {
    const fromManifest = resolveManifestKeyToCanonical(manifestKey, maps.manifestKeyToCanonical);
    if (fromManifest) {
      const hop = maps[fromManifest] || fromManifest;
      return slugify(hop);
    }
  }
  const candidates = [
    input.canonicalSlug,
    input.profileSlug,
    input.slug,
    input.latin,
    input.scientific,
    input.name
  ];
  for (const raw of candidates) {
    const key = slugify(raw);
    if (!key) continue;
    const hop = maps[key] || key;
    const hopKey = slugify(hop);
    return maps[hopKey] || hopKey;
  }
  return '';
}

export function resolveDesignCanonicalIdentity(input = {}, options = {}) {
  const aliasMaps = options.aliasMaps || {};
  const catalog = Array.isArray(options.catalog) ? options.catalog : [];
  let canonicalSlug = resolveDesignCanonicalSlug(input, aliasMaps);
  const record =
    catalog.find((p) => slugify(p.slug || p.canonicalSlug) === canonicalSlug) || null;
  if (!record && canonicalSlug) {
    const name = asText(input.name).toLowerCase();
    const latin = asText(input.latin || input.scientific).toLowerCase();
    const hit = catalog.find((p) => {
      const names = [p.name, p.he, ...(p.aliases || [])].map((n) => asText(n).toLowerCase());
      if (name && names.includes(name)) return true;
      if (latin && asText(p.scientific).toLowerCase() === latin) return true;
      return false;
    });
    if (hit) canonicalSlug = slugify(hit.slug || hit.canonicalSlug);
  }
  const resolved =
    catalog.find((p) => slugify(p.slug || p.canonicalSlug) === canonicalSlug) || record;
  return {
    canonicalSlug: canonicalSlug || null,
    catalogRecord: resolved || null,
    inferredCultivar: false,
    identityAuthority: 'canonical-catalog'
  };
}

export function classifyDesignGardenLocation(input = {}) {
  const source = asText(input.source).toLowerCase();
  const label = asText(input.label);
  const trusted = input.trusted === true;
  const confirmationStatus = asText(input.confirmationStatus).toLowerCase();
  const defaultish =
    source === 'default' ||
    asText(input.locationConfidence).toLowerCase() === 'default' ||
    (label === WESTERN_GALILEE_DEFAULT_LABEL && source === 'default');

  const base = {
    gardenProfileId: asText(input.gardenProfileId) || null,
    label,
    source: source || null,
    climateAuthority: asText(input.climateAuthority) || null,
    askForLocation: true,
    useForSuitability: false,
    treatDefaultAsGardenTruth: false
  };

  if (defaultish) {
    return Object.assign({}, base, {
      status: 'UNTRUSTED_DEFAULT',
      lat: null,
      lon: null,
      reason: 'western-galilee-or-default-untrusted'
    });
  }
  if (!trusted || confirmationStatus !== 'confirmed') {
    return Object.assign({}, base, {
      status: label ? 'UNTRUSTED_NEEDS_CONFIRMATION' : 'LOCATION_MISSING',
      lat: null,
      lon: null,
      reason: 'untrusted-or-unconfirmed'
    });
  }
  const lat = Number(input.lat);
  const lon = Number(input.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Object.assign({}, base, {
      status: 'LOCATION_MISSING',
      lat: null,
      lon: null,
      reason: 'confirmed-without-coordinates'
    });
  }
  return Object.assign({}, base, {
    status: 'TRUSTED_CONFIRMED',
    askForLocation: false,
    useForSuitability: true,
    lat,
    lon,
    reason: 'trusted-confirmed'
  });
}

export function shouldInventSecondLocation(classified) {
  return classified?.status === 'TRUSTED_CONFIRMED' ? false : classified?.askForLocation === true;
}

export function createOwnedDesignPlacement(input = {}) {
  const gardenProfileId = asText(input.gardenProfileId);
  const gardenPlantId = asText(input.gardenPlantId);
  const canonicalSlug = slugify(input.canonicalSlug);
  if (!gardenProfileId) throw new Error('garden_profile_id is required');
  if (!gardenPlantId) throw new Error('garden_plant_id is required');
  if (!canonicalSlug) throw new Error('canonical slug is required');
  return {
    kind: DESIGN_PLANT_KIND.OWNED,
    status: DESIGN_PLACEMENT_STATUS.OWNED,
    gardenProfileId,
    gardenPlantId,
    canonicalSlug,
    areaId: asText(input.areaId) || null,
    source: DESIGN_SOURCE_TOKEN,
    growthStage: input.growthStage || 'mature',
    targetGrowthStage: input.targetGrowthStage || 'mature',
    season: input.season || 'unknown',
    phenology: input.phenology || 'vegetative',
    x: Number.isFinite(Number(input.x)) ? Number(input.x) : 0.5,
    y: Number.isFinite(Number(input.y)) ? Number(input.y) : 0.76,
    scale: Number.isFinite(Number(input.scale)) ? Number(input.scale) : 1,
    rotation: Number(input.rotation) || 0,
    zIndex: Number(input.zIndex) || 1,
    createsGardenPlant: false
  };
}

export function createProposedDesignPlacement(input = {}) {
  const gardenProfileId = asText(input.gardenProfileId);
  const canonicalSlug = slugify(input.canonicalSlug);
  if (!gardenProfileId) throw new Error('garden_profile_id is required');
  if (!canonicalSlug) throw new Error('canonical slug is required');
  return {
    kind: DESIGN_PLANT_KIND.PROPOSED,
    status: DESIGN_PLACEMENT_STATUS.PROPOSED,
    gardenProfileId,
    gardenPlantId: null,
    canonicalSlug,
    areaId: asText(input.areaId) || null,
    source: DESIGN_SOURCE_TOKEN,
    growthStage: input.growthStage || 'mature',
    targetGrowthStage: input.targetGrowthStage || 'mature',
    season: input.season || 'unknown',
    phenology: input.phenology || 'vegetative',
    x: Number.isFinite(Number(input.x)) ? Number(input.x) : 0.5,
    y: Number.isFinite(Number(input.y)) ? Number(input.y) : 0.76,
    scale: Number.isFinite(Number(input.scale)) ? Number(input.scale) : 1,
    rotation: Number(input.rotation) || 0,
    zIndex: Number(input.zIndex) || 1,
    createsGardenPlant: false
  };
}

export function duplicateDesignPlacement(placement) {
  const next = Object.assign({}, placement || {});
  if (next.kind === DESIGN_PLANT_KIND.OWNED) {
    next.gardenPlantId = placement.gardenPlantId;
    next.createsGardenPlant = false;
  } else {
    next.gardenPlantId = null;
    next.status = DESIGN_PLACEMENT_STATUS.PROPOSED;
    next.createsGardenPlant = false;
  }
  return next;
}

export function ownedPlacementOwnershipCount(placements, gardenPlantId) {
  const id = asText(gardenPlantId);
  const visuals = (placements || []).filter(
    (p) => p.kind === DESIGN_PLANT_KIND.OWNED && asText(p.gardenPlantId) === id
  );
  return {
    visualCount: visuals.length,
    ownershipRecords: visuals.length ? 1 : 0,
    duplicateOwnership: false
  };
}

export function visualChangeMustNotRewriteIdentity(before, after) {
  return {
    canonicalSlugUnchanged: slugify(before?.canonicalSlug) === slugify(after?.canonicalSlug),
    gardenPlantIdUnchanged: asText(before?.gardenPlantId) === asText(after?.gardenPlantId),
    botanicalTruthPreserved: true
  };
}

export function presentDesignSuitability(evaluation = {}) {
  const engine = asText(evaluation.engine) || 'smartRecEvaluateSuitability';
  const level = asText(evaluation.recommendationLevel).toLowerCase();
  const unknown =
    evaluation.available === false ||
    asText(evaluation.status).toUpperCase() === 'UNKNOWN' ||
    (evaluation.ok === false && !level && evaluation.hardSurvivalBlocked !== true && evaluation.hardBlocked !== true);
  if (unknown) {
    return {
      engine,
      paidAiCalls: 0,
      secondEngine: false,
      canAddToGarden: true,
      isPositiveRecommendation: false,
      hardBlocked: false,
      presentation: 'unknown',
      addCopy: 'You can add this plant',
      recommendCopy: 'Garden suitability is unavailable until the Garden location is confirmed',
      outcomes: evaluation.outcomes || null,
      primaryLimiter: evaluation.primaryLimiter || evaluation.reason || 'location-untrusted',
      gardenProfileId: evaluation.gardenProfileId || null,
      areaId: evaluation.areaId || null
    };
  }
  const hardBlocked =
    evaluation.hardSurvivalBlocked === true ||
    evaluation.hardBlocked === true ||
    level === 'blocked';
  const positive = !hardBlocked && (level === 'excellent' || level === 'good');
  return {
    engine,
    paidAiCalls: 0,
    secondEngine: false,
    canAddToGarden: true,
    isPositiveRecommendation: positive,
    hardBlocked,
    presentation: hardBlocked ? 'not-recommended' : positive ? 'recommended' : 'exploratory',
    addCopy: 'You can add this plant',
    recommendCopy: hardBlocked
      ? 'CRUVIT does not recommend this plant here'
      : positive
        ? 'CRUVIT recommends this plant here'
        : 'CRUVIT does not present this as a positive recommendation',
    outcomes: evaluation.outcomes || null,
    primaryLimiter: evaluation.primaryLimiter || evaluation.explanationText || '',
    gardenProfileId: evaluation.gardenProfileId || null,
    areaId: evaluation.areaId || null
  };
}

export function buildDesignCommitToken(placement, canonicalSlug) {
  const id = asText(placement?.id || placement?.layerId || canonicalSlug);
  return `gd_commit_${slugify(canonicalSlug)}_${slugify(id)}`;
}

export function createDesignCommitIdempotency() {
  const seen = new Set();
  return {
    seen: (token) => seen.has(asText(token)),
    mark: (token) => {
      const t = asText(token);
      if (t) seen.add(t);
    }
  };
}

export function confirmDesignProposalCommit(input = {}) {
  if (input.userConfirmed !== true) {
    return { ok: false, persist: false, reason: 'user-confirmation-required', duplicate: false };
  }
  const canonicalSlug = slugify(input.canonicalSlug);
  if (!canonicalSlug) {
    return { ok: false, persist: false, reason: 'canonical-slug-required', duplicate: false };
  }
  const gardenProfileId = asText(input.gardenProfileId);
  if (!gardenProfileId) {
    return { ok: false, persist: false, reason: 'garden_profile_id is required', duplicate: false };
  }
  if (input.kind === DESIGN_PLANT_KIND.OWNED && input.gardenPlantId) {
    return {
      ok: true,
      persist: false,
      duplicate: true,
      reason: 'already-owned',
      canonicalSlug,
      gardenPlantId: input.gardenPlantId
    };
  }
  const token = asText(input.commitToken) || buildDesignCommitToken(input.placement, canonicalSlug);
  if (input.idempotency && typeof input.idempotency.seen === 'function' && input.idempotency.seen(token)) {
    return {
      ok: true,
      persist: false,
      duplicate: true,
      canonicalSlug,
      commitToken: token
    };
  }
  return {
    ok: true,
    persist: true,
    duplicate: false,
    canonicalSlug,
    commitToken: token,
    write: {
      canonicalSlug,
      source: DESIGN_GARDEN_SOURCE,
      sourceModule: GARDEN_SOURCE_MODULES.GARDEN_DESIGN,
      areaId: asText(input.areaId) || null,
      existingWritePath: 'savePlantFromLibrary'
    }
  };
}

export function designMemoryEventForAction(action) {
  const a = asText(action).toLowerCase();
  if (['drag', 'resize', 'pointermove', 'select', 'browse', 'open', 'load-context'].includes(a)) {
    return { emit: false, reason: 'non-lifecycle-pointer-or-open' };
  }
  if (a === 'commit-proposal') {
    return {
      emit: true,
      eventType: GARDEN_EVENT_TYPES.PLANT_ADDED,
      sourceModule: GARDEN_SOURCE_MODULES.GARDEN_DESIGN
    };
  }
  if (a === 'design-saved') {
    return { emit: false, reason: 'client-snapshot-not-garden-memory' };
  }
  return { emit: false, reason: 'not-a-lifecycle-event' };
}

function mapServerGardenPlantRow(row) {
  if (!row || typeof row !== 'object') return null;
  if (row.archived === true) return null;
  const gardenPlantId = asText(row.id || row.gardenPlantId);
  if (!gardenPlantId) return null;
  return {
    gardenPlantId,
    clientInstanceId: asText(row.client_instance_id || row.clientInstanceId) || null,
    canonicalSlug: asText(row.profile_slug || row.canonicalSlug || row.profileSlug) || null,
    name: asText(row.name) || '',
    scientific: asText(row.scientific) || '',
    areaId: asText(row.garden_area_id || row.areaId) || null,
    gardenProfileId: asText(row.garden_profile_id || row.gardenProfileId) || null
  };
}

/**
 * Authenticated Garden OS is the only owned-plant source.
 * Local/legacy plants must not substitute when a garden_profile_id exists.
 */
export function resolveDesignOwnedPlantsFromGardenOs(input = {}) {
  const session = input.session && typeof input.session === 'object' ? input.session : null;
  const userId = session && session.user && session.user.id ? asText(session.user.id) : '';
  const gardenProfileId = asText(input.gardenProfileId);
  const fetchError = asText(input.fetchError);
  const localPlants = Array.isArray(input.localPlants) ? input.localPlants : [];
  const localNames = localPlants.map((p) => asText(p && p.name)).filter(Boolean);
  const base = {
    authenticated: !!userId,
    gardenProfileId: gardenProfileId || null,
    usedLocalFallback: false,
    paidAiCalls: 0,
    ignoredLocalNames: localNames
  };
  if (!userId || !gardenProfileId) {
    return Object.assign({}, base, {
      ok: true,
      source: 'none',
      ownedPlants: [],
      fromMyGardenVisible: false,
      error: null
    });
  }
  if (fetchError || !Array.isArray(input.serverPlantRows)) {
    return Object.assign({}, base, {
      ok: false,
      source: 'garden_plants',
      ownedPlants: [],
      fromMyGardenVisible: false,
      error: fetchError || 'owned-plants-load-failed'
    });
  }
  const ownedPlants = input.serverPlantRows.map(mapServerGardenPlantRow).filter(Boolean);
  return Object.assign({}, base, {
    ok: true,
    source: 'garden_plants',
    ownedPlants,
    fromMyGardenVisible: ownedPlants.length > 0,
    error: null
  });
}

export function ownedPlacementMustNotInsertGardenPlant(beforeCount, afterCount, action) {
  if (asText(action).toLowerCase() !== 'place-owned') return false;
  return Number(beforeCount) === Number(afterCount);
}

/** Empty or populated design canvas must always expose Add plants. */
export function manualCanvasAddPlantsPolicy(input = {}) {
  const designPlacementCount = Array.isArray(input.plantLayers)
    ? input.plantLayers.length
    : Number(input.designPlacementCount) || 0;
  const currentPlantCount = Array.isArray(input.currentPlants)
    ? input.currentPlants.length
    : Number(input.currentPlantCount) || 0;
  return {
    showAddPlants: true,
    hideWhenEmpty: false,
    designPlacementCount,
    currentPlantCount,
    counterMeansDesignPlacementsOnly: true,
    paidAiCalls: 0
  };
}

export function designPaidAiForAction(action) {
  const a = asText(action).toLowerCase();
  const automated = [
    'open',
    'drag',
    'resize',
    'browse',
    'load-context',
    'select',
    'duplicate',
    'delete',
    'commit-proposal',
    'place-owned',
    'place-proposed',
    'manual-placement',
    'open-manual-canvas'
  ];
  if (automated.includes(a)) {
    return { allowed: false, paidAiCalls: 0, automated: true };
  }
  return { allowed: false, paidAiCalls: 0, automated: false, existingExplicitGenerateUnchanged: true };
}

export function assertSourcePhotoImmutable(source = {}, operation = {}) {
  if (operation.overwriteSource === true || operation.promoteToCatalog === true) {
    return { ok: false, sourceImmutable: false, reason: 'destructive-or-promotion-forbidden' };
  }
  if (operation.promoteToOwnedCover === true || operation.promoteToDiagnosticEvidence === true) {
    return { ok: false, sourceImmutable: false, reason: 'design-output-is-not-source-evidence' };
  }
  return {
    ok: true,
    sourceImmutable: true,
    typedAs: operation.saveSnapshot ? 'design_output' : 'overlay-only',
    originalRef: source.originalRef || source.dataUrl || null
  };
}

export function designPersistenceKey({ userId, gardenProfileId, areaId } = {}) {
  const user = asText(userId) || 'anon';
  const garden = asText(gardenProfileId) || 'no-garden';
  const area = asText(areaId) || 'garden';
  return `cruvit_gd_design_v1:${user}:${garden}:${area}`;
}

export function serializeDesignSnapshot(input = {}) {
  return {
    type: 'design_output',
    notSourceEvidence: true,
    notCatalogMedia: true,
    version: GARDEN_DESIGN_OWNED_GARDEN_VERSION,
    userId: asText(input.userId) || null,
    gardenProfileId: asText(input.gardenProfileId) || null,
    areaId: asText(input.areaId) || null,
    placements: Array.isArray(input.placements) ? input.placements : [],
    sourcePhotoImmutable: true,
    savedAt: input.savedAt || new Date().toISOString()
  };
}

export function readDesignSnapshot(raw, expected = {}) {
  if (!raw || typeof raw !== 'object') return null;
  if (asText(expected.gardenProfileId) && asText(raw.gardenProfileId) !== asText(expected.gardenProfileId)) {
    return null;
  }
  if (asText(expected.userId) && asText(raw.userId) !== asText(expected.userId)) {
    return null;
  }
  return raw;
}

export function createLocalDesignPersistence(store) {
  const mem = store && typeof store === 'object' ? store : {};
  return {
    save(snapshot) {
      const key = designPersistenceKey(snapshot);
      const value = JSON.stringify(serializeDesignSnapshot(snapshot));
      if (typeof mem.setItem === 'function') mem.setItem(key, value);
      else mem[key] = value;
      return { ok: true, key, durableDatabase: false, durable: false };
    },
    load(ids) {
      const key = designPersistenceKey(ids);
      const raw = typeof mem.getItem === 'function' ? mem.getItem(key) : mem[key];
      if (!raw) return null;
      try {
        return readDesignSnapshot(JSON.parse(raw), ids);
      } catch (_) {
        return null;
      }
    }
  };
}

const api = {
  GARDEN_DESIGN_OWNED_GARDEN_VERSION,
  DESIGN_PLANT_KIND,
  DESIGN_PLACEMENT_STATUS,
  DESIGN_GARDEN_SOURCE,
  DESIGN_SOURCE_TOKEN,
  DESIGN_OWNED_VISUAL_POLICY,
  GD_BRIDGE_SAME_ORIGIN,
  GD_HOST_TO_DESIGN,
  GD_DESIGN_TO_HOST,
  isGardenDesignBridgeType,
  gardenDesignPostTargetOrigin,
  acceptGardenDesignMessage,
  buildDesignSuitabilityAccess,
  resolveDesignCanonicalSlug,
  resolveDesignCanonicalIdentity,
  classifyDesignGardenLocation,
  shouldInventSecondLocation,
  createOwnedDesignPlacement,
  createProposedDesignPlacement,
  duplicateDesignPlacement,
  ownedPlacementOwnershipCount,
  visualChangeMustNotRewriteIdentity,
  presentDesignSuitability,
  buildDesignCommitToken,
  createDesignCommitIdempotency,
  confirmDesignProposalCommit,
  designMemoryEventForAction,
  designPaidAiForAction,
  resolveDesignOwnedPlantsFromGardenOs,
  ownedPlacementMustNotInsertGardenPlant,
  manualCanvasAddPlantsPolicy,
  assertSourcePhotoImmutable,
  designPersistenceKey,
  serializeDesignSnapshot,
  readDesignSnapshot,
  createLocalDesignPersistence
};

export default api;

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitGardenDesignOwnedGarden = api;
}
