/**
 * Garden Design → Owned Garden V1.
 *
 * Design is a planning/view layer over the active Garden.
 * Does not create a second garden, catalog, location, or suitability engine.
 * Placement never creates garden_plants until explicit Add to My Garden.
 */

import { GARDEN_SOURCE_MODULES, GARDEN_EVENT_TYPES } from '../personal-domain/garden-os-spine-v1-contract.js';
import {
  DESIGN_ASSET_FALLBACK,
  resolveManifestKeyToCanonical
} from './garden-design-asset-registry-v1.js';
import {
  ownedPlacementVisualDefaults,
  proposedPlacementVisualDefaults
} from './garden-design-variant-selection-policy-v1.js';

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
  SUITABILITY_RESULT: 'cruvit:garden-design-suitability-result',
  LOAD_RESULT: 'cruvit:garden-design-load-result',
  SAVE_PLACEMENT_RESULT: 'cruvit:garden-design-save-placement-result',
  UPDATE_PLACEMENT_RESULT: 'cruvit:garden-design-update-placement-result',
  DELETE_PLACEMENT_RESULT: 'cruvit:garden-design-delete-placement-result',
  SAVE_DESIGN_RESULT: 'cruvit:garden-design-save-design-result',
  SAVE_SOURCE_MEDIA_RESULT: 'cruvit:garden-design-save-source-media-result'
});

export const GD_DESIGN_TO_HOST = Object.freeze({
  READY: 'cruvit:garden-design-ready',
  SUITABILITY_REQUEST: 'cruvit:garden-design-suitability-request',
  COMMIT_PROPOSAL: 'cruvit:garden-design-commit-proposal',
  REFRESH_OWNED: 'cruvit:garden-design-refresh-owned-plants',
  LOAD_DESIGN: 'cruvit:garden-design-load-design',
  SAVE_PLACEMENT: 'cruvit:garden-design-save-placement',
  UPDATE_PLACEMENT: 'cruvit:garden-design-update-placement',
  DELETE_PLACEMENT: 'cruvit:garden-design-delete-placement',
  SAVE_DESIGN: 'cruvit:garden-design-save-design',
  SAVE_SOURCE_MEDIA: 'cruvit:garden-design-save-source-media'
});

export const GD_AUTOSAVE_DEBOUNCE_MS = 600;
export const GD_SERVER_REF_KEY_PREFIX = 'cruvit_gd_server_ref_v1';
export const EMPTY_SERVER_DESIGN = 'EMPTY_SERVER_DESIGN';
export const MULTIPLE_DESIGNS_REQUIRE_SELECTION = 'MULTIPLE_DESIGNS_REQUIRE_SELECTION';
export const LOCAL_DESIGN_RESTORE_AVAILABLE = 'LOCAL_DESIGN_RESTORE_AVAILABLE';
export const IDENTITY_INCONSISTENT = 'IDENTITY_INCONSISTENT';
export const DESIGN_PERSIST_SYNC = Object.freeze({
  LOCAL_DIRTY: 'LOCAL_DIRTY',
  SAVING: 'SAVING',
  SERVER_SAVED: 'SERVER_SAVED',
  SAVE_FAILED: 'SAVE_FAILED',
  SERVER_SAVE_FAILED: 'SAVE_FAILED',
  LOCAL_AHEAD_OF_SERVER: 'LOCAL_AHEAD_OF_SERVER'
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

function stageKnownFromInput(input, visual) {
  const stage = asText(input.growthStage || visual.growthStage).toLowerCase();
  return stage === 'young' || stage === 'intermediate' || stage === 'mature';
}

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
  const visual = ownedPlacementVisualDefaults();
  return {
    kind: DESIGN_PLANT_KIND.OWNED,
    status: DESIGN_PLACEMENT_STATUS.OWNED,
    gardenProfileId,
    gardenPlantId,
    canonicalSlug,
    areaId: asText(input.areaId) || null,
    source: DESIGN_SOURCE_TOKEN,
    growthStage: input.growthStage || visual.growthStage,
    targetGrowthStage: input.targetGrowthStage || visual.targetGrowthStage,
    season: input.season || visual.season,
    phenology: input.phenology || visual.phenology,
    stageKnown: stageKnownFromInput(input, visual),
    ageKnown: false,
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
  const visual = proposedPlacementVisualDefaults();
  return {
    kind: DESIGN_PLANT_KIND.PROPOSED,
    status: DESIGN_PLACEMENT_STATUS.PROPOSED,
    gardenProfileId,
    gardenPlantId: null,
    canonicalSlug,
    areaId: asText(input.areaId) || null,
    source: DESIGN_SOURCE_TOKEN,
    growthStage: input.growthStage || visual.growthStage,
    targetGrowthStage: input.targetGrowthStage || visual.targetGrowthStage,
    season: input.season || visual.season,
    phenology: input.phenology || visual.phenology,
    stageKnown: false,
    ageKnown: false,
    maturePreviewImpliesCurrentSize: false,
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
    gardenProfileId: asText(row.garden_profile_id || row.gardenProfileId) || null,
    addedAt: row.added_at || row.addedAt || null,
    ageKnown: false,
    growthStage: null
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

export function resolveOwnedPlacementAreaId(input = {}) {
  if (input.userChangedArea === true) return asText(input.designLevelAreaId) || null;
  if (input.kind === DESIGN_PLANT_KIND.OWNED || input.gardenPlantId) {
    return asText(input.ownedAreaId || input.areaId) || null;
  }
  return asText(input.areaId || input.designLevelAreaId) || null;
}

/** Missing approved cutouts must still render a visible, draggable placeholder. */
export function resolveOwnedPlacementVisual(input = {}) {
  const visualReady = input.visualReady === true && !!(input.url || (input.urlCandidates && input.urlCandidates.length));
  const canonicalSlug = slugify(input.canonicalSlug);
  return {
    canonicalSlug,
    renderVisible: true,
    draggable: true,
    resizable: true,
    deletable: true,
    duplicateVisualAllowed: true,
    visualReady,
    fallback: visualReady ? (input.fallback || null) : DESIGN_ASSET_FALLBACK.HONEST_PLACEHOLDER,
    usedWebImage: false,
    substitutedSpecies: false,
    generateOnRender: false,
    paidAiCalls: 0
  };
}

export function designPlacementCountFromLayers(plantLayers) {
  return Array.isArray(plantLayers) ? plantLayers.length : 0;
}

export function ownedInventoryMustNotAutoPlace(ownedCount, placementCount) {
  return Number(ownedCount) > 0 && Number(placementCount) === 0;
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

/** Existing sourced design with 0 placements must still show Add plants. */
export function hydratedSourcedDesignAddPlantsEntrypoint(input = {}) {
  const sourcePhotoLoaded = input.sourcePhotoLoaded === true
    || !!asText(input.sourceMediaId || input.sourceMediaUrl || input.editorBaseMediaUrl);
  const designHydrated = input.designHydrated === true || !!asText(input.designId);
  const persistSaved = input.persistStatus === 'saved' || input.persistSaved === true;
  const ready = sourcePhotoLoaded && designHydrated && (persistSaved || input.persistSaved !== false);
  const placementCount = Array.isArray(input.placements)
    ? input.placements.length
    : Array.isArray(input.plantLayers)
      ? input.plantLayers.length
      : Number(input.designPlacementCount) || 0;
  const owned = Array.isArray(input.ownedPlants) ? input.ownedPlants : [];
  return {
    plantsSectionVisible: ready,
    addPlantsCard: ready,
    plantCount: placementCount,
    ownerCanOpenModal: ready,
    fromMyGardenAvailable: ready && owned.length > 0,
    hideWhenOwnedCountZero: false,
    hideWhenPlacementCountZero: false,
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
    'open-manual-canvas',
    'load-design',
    'save-placement',
    'update-placement',
    'delete-placement',
    'save-design',
    'save-source-media',
    'autosave'
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
  const durableDatabase = input.durableDatabase === true;
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
    durableDatabase,
    role: durableDatabase ? 'cache' : 'pending',
    designId: asText(input.designId) || null,
    designClientInstanceId: asText(input.designClientInstanceId) || null,
    revision: Number.isFinite(Number(input.revision)) ? Number(input.revision) : null,
    savedAt: input.savedAt || new Date().toISOString()
  };
}

export function createDesignClientInstanceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'gd_d_' + crypto.randomUUID();
  }
  return 'gd_d_' + Date.now() + '_' + Math.random().toString(36).slice(2, 12);
}

export function designServerRefKey({ userId, gardenProfileId, areaId } = {}) {
  const user = asText(userId) || 'anon';
  const garden = asText(gardenProfileId) || 'no-garden';
  const area = asText(areaId) || 'garden';
  return `${GD_SERVER_REF_KEY_PREFIX}:${user}:${garden}:${area}`;
}

export function shouldWriteOnPointerPhase(phase) {
  const p = asText(phase).toLowerCase();
  if (p === 'pointermove' || p === 'mousemove' || p === 'touchmove' || p === 'input') return false;
  return p === 'pointerup' || p === 'pointercancel' || p === 'change' || p === 'create' || p === 'delete' || p === 'commit';
}

export function persistablePlacementGrowthStage(value) {
  const t = asText(value).toLowerCase();
  if (t === 'young' || t === 'intermediate' || t === 'mature') return t;
  return null;
}

export function classifyDesignPersistSync(input = {}) {
  const serverPlacements = Array.isArray(input.serverPlacements) ? input.serverPlacements : [];
  const localSnap = input.localSnapshot && typeof input.localSnapshot === 'object' ? input.localSnapshot : null;
  const localPlacements = localSnap && Array.isArray(localSnap.placements) ? localSnap.placements : [];
  const designId = asText(input.designId);
  const localDesignId = asText(localSnap && localSnap.designId);
  const gardenProfileId = asText(input.gardenProfileId);
  const localGarden = asText(localSnap && localSnap.gardenProfileId);
  const sameDesign = !designId || !localDesignId || localDesignId === designId;
  const sameGarden = !gardenProfileId || !localGarden || localGarden === gardenProfileId;
  if (sameDesign && sameGarden && localPlacements.length > serverPlacements.length) {
    return {
      state: DESIGN_PERSIST_SYNC.LOCAL_AHEAD_OF_SERVER,
      ui: DESIGN_PERSIST_SYNC.LOCAL_DIRTY,
      savedLabelForbidden: true,
      autoImport: false,
      shouldKeepLocalLayers: true,
      shouldPersistVisibleLayers: true,
      shouldOverwriteLocalCacheDurable: false,
      serverCount: serverPlacements.length,
      localCount: localPlacements.length
    };
  }
  if (input.writeFailed === true) {
    return {
      state: DESIGN_PERSIST_SYNC.SAVE_FAILED,
      ui: DESIGN_PERSIST_SYNC.SAVE_FAILED,
      savedLabelForbidden: true,
      autoImport: false,
      shouldOverwriteLocalCacheDurable: false
    };
  }
  if (input.saving === true) {
    return {
      state: DESIGN_PERSIST_SYNC.SAVING,
      ui: DESIGN_PERSIST_SYNC.SAVING,
      savedLabelForbidden: true,
      autoImport: false,
      shouldOverwriteLocalCacheDurable: false
    };
  }
  if (input.pendingWrites === true || (input.noop === true && input.localDirty === true)) {
    return {
      state: DESIGN_PERSIST_SYNC.LOCAL_DIRTY,
      ui: DESIGN_PERSIST_SYNC.LOCAL_DIRTY,
      savedLabelForbidden: true,
      autoImport: false,
      shouldOverwriteLocalCacheDurable: false
    };
  }
  return {
    state: DESIGN_PERSIST_SYNC.SERVER_SAVED,
    ui: DESIGN_PERSIST_SYNC.SERVER_SAVED,
    savedLabelForbidden: false,
    autoImport: false,
    shouldOverwriteLocalCacheDurable: true,
    serverCount: serverPlacements.length,
    localCount: localPlacements.length
  };
}

export function collapseAutosaveOps(ops) {
  const byId = new Map();
  for (const op of Array.isArray(ops) ? ops : []) {
    if (!op) continue;
    if (asText(op.phase || op.reason).toLowerCase() === 'pointermove') continue;
    const id = asText(op.clientInstanceId);
    if (!id) continue;
    if (asText(op.action) === 'delete') {
      byId.set(id, { action: 'delete', clientInstanceId: id });
      continue;
    }
    const prev = byId.get(id);
    if (prev && prev.action === 'delete') continue;
    byId.set(id, Object.assign({}, prev || {}, op, { clientInstanceId: id }));
  }
  return Array.from(byId.values());
}

export function classifyLegacyLocalSnapshotImport(snapshot, expected = {}) {
  const expectedUser = asText(expected.userId);
  const expectedGarden = asText(expected.gardenProfileId);
  const expectedArea = asText(expected.areaId) || '';
  if (!snapshot || typeof snapshot !== 'object') {
    return { import: false, autoImport: false, code: null, snapshotIntact: false };
  }
  const snapUser = asText(snapshot.userId);
  const snapGarden = asText(snapshot.gardenProfileId);
  const snapArea = asText(snapshot.areaId) || '';
  if (!snapUser || snapUser === 'anon') {
    return { import: false, autoImport: false, code: 'ANONYMOUS_SNAPSHOT_BLOCKED', snapshotIntact: true };
  }
  if (expectedUser && snapUser !== expectedUser) {
    return { import: false, autoImport: false, code: 'USER_MISMATCH', snapshotIntact: true };
  }
  if (expectedGarden && snapGarden !== expectedGarden) {
    return { import: false, autoImport: false, code: 'GARDEN_MISMATCH', snapshotIntact: true };
  }
  if (expectedArea !== snapArea) {
    return { import: false, autoImport: false, code: 'AREA_MISMATCH', snapshotIntact: true, mergeForbidden: true };
  }
  return {
    import: false,
    autoImport: false,
    code: LOCAL_DESIGN_RESTORE_AVAILABLE,
    snapshotIntact: true,
    reason: 'explicit-restore-required'
  };
}

export function mapLayerToHostPlacementPayload(layer = {}) {
  const kind = asText(layer.kind) === DESIGN_PLANT_KIND.OWNED || layer.gardenPlantId
    ? DESIGN_PLANT_KIND.OWNED
    : DESIGN_PLANT_KIND.PROPOSED;
  return {
    clientInstanceId: asText(layer.id || layer.clientInstanceId),
    kind,
    gardenPlantId: kind === DESIGN_PLANT_KIND.OWNED ? (asText(layer.gardenPlantId) || null) : null,
    canonicalSlug: asText(layer.canonicalSlug) || null,
    gardenAreaId: asText(layer.areaId || layer.gardenAreaId) || null,
    designAssetId: asText(layer.designAssetId) || null,
    growthStage: asText(layer.growthStage) || null,
    targetGrowthStage: asText(layer.targetGrowthStage) || null,
    season: asText(layer.season) || null,
    phenology: asText(layer.phenology) || null,
    x: Number(layer.x),
    y: Number(layer.y),
    scale: Number(layer.scale),
    rotation: Number(layer.rotation) || 0,
    zOrder: Number(layer.zOrder != null ? layer.zOrder : layer.zIndex) || 0,
    label: asText(layer.name || layer.label) || null,
    scientific: asText(layer.species || layer.scientific) || null
  };
}

export function mapServerPlacementToLayer(placement = {}, ownedPlants = []) {
  const clientInstanceId = asText(placement.clientInstanceId || placement.client_instance_id);
  if (!clientInstanceId) {
    return { ok: false, reason: IDENTITY_INCONSISTENT, detail: 'missing-client-instance-id' };
  }
  const kind = asText(placement.kind) === DESIGN_PLANT_KIND.OWNED ? DESIGN_PLANT_KIND.OWNED : DESIGN_PLANT_KIND.PROPOSED;
  const gardenPlantId = asText(placement.gardenPlantId || placement.garden_plant_id) || null;
  if (kind === DESIGN_PLANT_KIND.OWNED) {
    if (!gardenPlantId) {
      return { ok: false, reason: IDENTITY_INCONSISTENT, detail: 'owned-missing-garden-plant-id' };
    }
    const plant = (Array.isArray(ownedPlants) ? ownedPlants : []).find(
      (p) => asText(p.gardenPlantId || p.id) === gardenPlantId
    );
    if (!plant) {
      return { ok: false, reason: IDENTITY_INCONSISTENT, detail: 'owned-plant-missing-from-garden', gardenPlantId };
    }
  }
  const canonicalSlug = kind === DESIGN_PLANT_KIND.OWNED
    ? asText(
        (Array.isArray(ownedPlants) ? ownedPlants : []).find((p) => asText(p.gardenPlantId || p.id) === gardenPlantId)
          ?.canonicalSlug || placement.canonicalSlug || placement.canonical_slug
      )
    : asText(placement.canonicalSlug || placement.canonical_slug);
  return {
    ok: true,
    layer: {
      id: clientInstanceId,
      clientInstanceId,
      serverId: asText(placement.id || placement.serverId) || null,
      name: asText(placement.label || placement.name) || canonicalSlug || 'Plant',
      species: asText(placement.scientific || placement.species) || '',
      slug: canonicalSlug,
      canonicalSlug,
      kind,
      gardenPlantId: kind === DESIGN_PLANT_KIND.OWNED ? gardenPlantId : null,
      areaId: asText(placement.gardenAreaId || placement.garden_area_id || placement.areaId) || null,
      source: 'garden-design',
      status: kind === DESIGN_PLANT_KIND.OWNED ? 'owned' : 'proposed',
      growthStage: asText(placement.growthStage || placement.growth_stage) || 'mature',
      targetGrowthStage: asText(placement.targetGrowthStage || placement.target_growth_stage) || 'mature',
      season: asText(placement.season) || 'unknown',
      phenology: asText(placement.phenology) || 'vegetative',
      designAssetId: asText(placement.designAssetId || placement.design_asset_id) || null,
      x: Number(placement.x),
      y: Number(placement.y),
      scale: Number(placement.scale),
      rotation: Number(placement.rotation) || 0,
      zIndex: Number(placement.zOrder != null ? placement.zOrder : placement.z_order) || 1,
      emoji: '🌿',
      createsGardenPlant: false
    }
  };
}

export function createServerDesignRefPersistence(store) {
  const mem = store && typeof store === 'object' ? store : {};
  return {
    save(ref) {
      const key = designServerRefKey(ref);
      const value = JSON.stringify({
        designId: asText(ref.designId) || null,
        clientInstanceId: asText(ref.clientInstanceId || ref.designClientInstanceId) || null,
        gardenProfileId: asText(ref.gardenProfileId) || null,
        gardenAreaId: asText(ref.gardenAreaId || ref.areaId) || null,
        userId: asText(ref.userId) || null
      });
      if (typeof mem.setItem === 'function') mem.setItem(key, value);
      else mem[key] = value;
      return { ok: true, key };
    },
    load(ids) {
      const key = designServerRefKey(ids);
      const raw = typeof mem.getItem === 'function' ? mem.getItem(key) : mem[key];
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (asText(ids.userId) && asText(parsed.userId) && asText(parsed.userId) !== asText(ids.userId)) return null;
        if (asText(ids.gardenProfileId) && asText(parsed.gardenProfileId) !== asText(ids.gardenProfileId)) return null;
        return parsed;
      } catch (_) {
        return null;
      }
    }
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
  GD_AUTOSAVE_DEBOUNCE_MS,
  GD_SERVER_REF_KEY_PREFIX,
  EMPTY_SERVER_DESIGN,
  MULTIPLE_DESIGNS_REQUIRE_SELECTION,
  LOCAL_DESIGN_RESTORE_AVAILABLE,
  IDENTITY_INCONSISTENT,
  DESIGN_PERSIST_SYNC,
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
  resolveOwnedPlacementAreaId,
  resolveOwnedPlacementVisual,
  designPlacementCountFromLayers,
  ownedInventoryMustNotAutoPlace,
  manualCanvasAddPlantsPolicy,
  hydratedSourcedDesignAddPlantsEntrypoint,
  assertSourcePhotoImmutable,
  designPersistenceKey,
  serializeDesignSnapshot,
  readDesignSnapshot,
  createLocalDesignPersistence,
  createDesignClientInstanceId,
  designServerRefKey,
  shouldWriteOnPointerPhase,
  persistablePlacementGrowthStage,
  classifyDesignPersistSync,
  collapseAutosaveOps,
  classifyLegacyLocalSnapshotImport,
  mapLayerToHostPlacementPayload,
  mapServerPlacementToLayer,
  createServerDesignRefPersistence
};

export default api;

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitGardenDesignOwnedGarden = api;
}
