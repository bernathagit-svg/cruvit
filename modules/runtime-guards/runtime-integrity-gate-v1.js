/**
 * CRUVIT Runtime Integrity Gate V1.
 *
 * Permanent verification contract for Garden OS / Garden Design.
 * Zero spend. No generation. No second source of truth.
 *
 * SERVER TRUTH > LOCAL CACHE
 * AUTHORITATIVE DOMAIN DATA > PRESENTATION CACHE
 */

export const RUNTIME_INTEGRITY_VERSION = 'v1';

export const SOURCE_OF_TRUTH = Object.freeze({
  GARDEN_OWNERSHIP: 'garden_plants',
  DESIGN_STATE: 'garden_designs+garden_design_placements',
  DESIGN_ASSET_APPROVAL: 'modules/garden-design/assets/plants/design-asset-registry-v1.json',
  LOCAL_CACHE: 'recovery-only',
  MANIFEST: 'non-authoritative-for-approval'
});

export const SAVE_STATES = Object.freeze({
  LOCAL_DIRTY: 'LOCAL_DIRTY',
  SAVING: 'SAVING',
  SERVER_SAVED: 'SERVER_SAVED',
  SAVE_FAILED: 'SAVE_FAILED',
  LOCAL_AHEAD_OF_SERVER: 'LOCAL_AHEAD_OF_SERVER'
});

export const VALIDATION_LEVELS = Object.freeze({
  CODE_PATH_PASS: 'CODE_PATH_PASS',
  SERVER_STATE_PASS: 'SERVER_STATE_PASS',
  OWNER_LIVE_PASS: 'OWNER_LIVE_PASS',
  PRODUCTION_VALIDATED: 'PRODUCTION_VALIDATED',
  OWNER_LIVE_RETEST_REQUIRED: 'OWNER_LIVE_RETEST_REQUIRED',
  OWNER_LIVE_SMOKE_REQUIRED: 'OWNER_LIVE_SMOKE_REQUIRED'
});

export const INTEGRITY_LAYERS = Object.freeze({
  UI: 'LAYER_1_UI',
  API: 'LAYER_2_API',
  DB: 'LAYER_3_DB'
});

export const FAILURE_CLASSES = Object.freeze({
  AUTH_CONTEXT_FAILURE: 'AUTH_CONTEXT_FAILURE',
  DESIGN_SELECTION_REQUIRED: 'DESIGN_SELECTION_REQUIRED',
  DESIGN_IDENTITY_MISMATCH: 'DESIGN_IDENTITY_MISMATCH',
  PLACEMENT_INSERT_FAILED: 'PLACEMENT_INSERT_FAILED',
  PLACEMENT_UPDATE_FAILED: 'PLACEMENT_UPDATE_FAILED',
  PLACEMENT_DELETE_FAILED: 'PLACEMENT_DELETE_FAILED',
  SOURCE_MEDIA_IMMUTABLE_VIOLATION: 'SOURCE_MEDIA_IMMUTABLE_VIOLATION',
  RLS_DENIED: 'RLS_DENIED',
  INVALID_PERSIST_PAYLOAD: 'INVALID_PERSIST_PAYLOAD',
  LOCAL_AHEAD_OF_SERVER: 'LOCAL_AHEAD_OF_SERVER',
  SERVER_READBACK_MISMATCH: 'SERVER_READBACK_MISMATCH',
  REGISTRY_LOOKUP_FAILURE: 'REGISTRY_LOOKUP_FAILURE',
  ASSET_HTTP_FAILURE: 'ASSET_HTTP_FAILURE',
  PLACEHOLDER_WHEN_APPROVED_ASSET_EXISTS: 'PLACEHOLDER_WHEN_APPROVED_ASSET_EXISTS',
  OWNERSHIP_INVARIANT_FAILURE: 'OWNERSHIP_INVARIANT_FAILURE'
});

export const APPROVED_CANARY_SLUGS = Object.freeze(['mango', 'banana', 'pineapple', 'olive']);

/** Last owner-verified production mismatch. Do not clear without owner live evidence. */
export const OPEN_PRODUCTION_BLOCKERS_V1 = Object.freeze([
  {
    class: VALIDATION_LEVELS.OWNER_LIVE_RETEST_REQUIRED,
    topic: 'garden_design_placement_durability',
    gardenProfileId: 'fab7eec4-86b7-4b8a-838d-8aa4bba61657',
    designId: 'a1a34009-a0b6-4e4a-a141-8926dd60334e',
    lastKnownServerPlacementCount: 0,
    lastKnownUiPlacementCount: 3,
    note: 'Owner production showed 3 visible placements and Saved while garden_design_placements = 0. CODE_PATH_PASS after 7f7baac is not PRODUCTION_VALIDATED.'
  },
  {
    class: VALIDATION_LEVELS.OWNER_LIVE_RETEST_REQUIRED,
    topic: 'approved_asset_live_render',
    slugs: APPROVED_CANARY_SLUGS.slice(),
    note: 'Approved PNG runtime must be confirmed in the owner browser after durable placements exist. Resolver CODE_PATH_PASS is not LIVE_RENDER_PASS.'
  }
]);

function asText(value) {
  return value == null ? '' : String(value).trim();
}

export function savedLabelAllowed(state) {
  return asText(state) === SAVE_STATES.SERVER_SAVED;
}

export function localCacheMayClaimSaved(durableDatabase, serverConfirmed) {
  return durableDatabase === true && serverConfirmed === true;
}

export function evaluateSaveSemanticsClaim(input = {}) {
  const reasons = [];
  if (input.sourcePhotoHydrated === true) reasons.push('source-photo-hydrated');
  if (input.designRowLoaded === true) reasons.push('design-row-loaded');
  if (input.localCacheExists === true) reasons.push('local-cache-exists');
  if (input.domStateExists === true) reasons.push('dom-state-exists');
  if (input.inMemoryPlacementExists === true) reasons.push('in-memory-placement-exists');
  const serverConfirmed = input.serverConfirmed === true && input.durableDatabase === true;
  const claimedSaved = input.uiLabel === 'Saved' || input.state === SAVE_STATES.SERVER_SAVED;
  if (claimedSaved && !serverConfirmed) {
    return {
      ok: false,
      savedLabelForbidden: true,
      class: FAILURE_CLASSES.LOCAL_AHEAD_OF_SERVER,
      reasons
    };
  }
  return {
    ok: true,
    savedLabelForbidden: !serverConfirmed,
    class: serverConfirmed ? SAVE_STATES.SERVER_SAVED : (input.state || SAVE_STATES.LOCAL_DIRTY),
    reasons
  };
}

export function evaluateOwnershipInvariants(before = {}, after = {}, action = 'placement-only') {
  const created = Number(after.gardenPlantsCount || 0) - Number(before.gardenPlantsCount || 0);
  const deleted = Number(before.gardenPlantsCount || 0) - Number(after.gardenPlantsCount || 0);
  const mutatedId = asText(before.gardenPlantId) && asText(after.gardenPlantId)
    ? asText(before.gardenPlantId) !== asText(after.gardenPlantId)
    : false;
  const areaChanged = asText(before.areaId) && asText(after.areaId)
    ? asText(before.areaId) !== asText(after.areaId)
    : false;
  const identityChanged = asText(before.canonicalSlug) && asText(after.canonicalSlug)
    ? asText(before.canonicalSlug) !== asText(after.canonicalSlug)
    : false;
  const placementOnly = action === 'placement-only' || action === 'place' || action === 'move' || action === 'resize' || action === 'delete-placement';
  const ok = !placementOnly || (created <= 0 && deleted <= 0 && !mutatedId && !areaChanged && !identityChanged);
  return {
    ok,
    class: ok ? null : FAILURE_CLASSES.OWNERSHIP_INVARIANT_FAILURE,
    garden_plants_created: Math.max(0, created),
    garden_plants_deleted: Math.max(0, deleted),
    gardenPlantId_mutated: mutatedId ? 1 : 0,
    area_assignment_changed: areaChanged ? 1 : 0,
    owned_identity_changed: identityChanged ? 1 : 0,
    action
  };
}

export function evaluateDesignIdentity(expected = {}, actual = {}) {
  const keys = [
    'gardenProfileId',
    'designId',
    'designClientInstanceId',
    'placementClientInstanceId',
    'gardenPlantId',
    'canonicalSlug',
    'areaId'
  ];
  const mismatches = keys.filter((key) => {
    const exp = asText(expected[key]);
    if (!exp) return false;
    return asText(actual[key]) !== exp;
  });
  const duplicateDesign = Number(actual.designCount || 0) > 1 && expected.forbidDuplicateDesign === true;
  return {
    ok: mismatches.length === 0 && !duplicateDesign,
    class: mismatches.length || duplicateDesign ? FAILURE_CLASSES.DESIGN_IDENTITY_MISMATCH : null,
    mismatches,
    duplicateDesign
  };
}

export function mapPersistFailureClass(result = {}) {
  const code = asText(result.code || result.integrityFailureClass);
  const supabaseCode = asText(result.supabaseCode);
  const operation = asText(result.operation).toLowerCase();
  if (code === 'AUTH_OR_GARDEN_REQUIRED' || code === FAILURE_CLASSES.AUTH_CONTEXT_FAILURE) {
    return FAILURE_CLASSES.AUTH_CONTEXT_FAILURE;
  }
  if (code === 'MULTIPLE_DESIGNS_REQUIRE_SELECTION') return FAILURE_CLASSES.DESIGN_SELECTION_REQUIRED;
  if (
    code === 'DESIGN_NOT_IN_ACTIVE_GARDEN' ||
    code === 'DESIGN_IDENTITY_MISMATCH' ||
    code === 'IDENTITY_INCONSISTENT'
  ) {
    return code === 'IDENTITY_INCONSISTENT'
      ? FAILURE_CLASSES.OWNERSHIP_INVARIANT_FAILURE
      : FAILURE_CLASSES.DESIGN_IDENTITY_MISMATCH;
  }
  if (code === 'SERVER_READBACK_MISMATCH') return FAILURE_CLASSES.SERVER_READBACK_MISMATCH;
  if (code === 'SOURCE_MEDIA_IMMUTABLE_VIOLATION' || result.sourceImmutable === false) {
    return FAILURE_CLASSES.SOURCE_MEDIA_IMMUTABLE_VIOLATION;
  }
  if (supabaseCode === '42501' || code === 'RLS_DENIED' || /permission denied/i.test(asText(result.error))) {
    return FAILURE_CLASSES.RLS_DENIED;
  }
  if (
    code === 'CLIENT_INSTANCE_ID_REQUIRED' ||
    code === 'INVALID_PERSIST_PAYLOAD' ||
    code === 'PROPOSED_CANONICAL_SLUG_REQUIRED'
  ) {
    return FAILURE_CLASSES.INVALID_PERSIST_PAYLOAD;
  }
  if (code === 'PLACEMENT_DELETE_FAILED') return FAILURE_CLASSES.PLACEMENT_DELETE_FAILED;
  if (code === 'PLACEMENT_WRITE_FAILED' || code === 'PLACEMENT_INSERT_FAILED' || code === 'PLACEMENT_UPDATE_FAILED') {
    if (operation === 'update') return FAILURE_CLASSES.PLACEMENT_UPDATE_FAILED;
    return FAILURE_CLASSES.PLACEMENT_INSERT_FAILED;
  }
  if (code === 'LOCAL_AHEAD_OF_SERVER') return FAILURE_CLASSES.LOCAL_AHEAD_OF_SERVER;
  if (code === 'REGISTRY_LOOKUP_FAILURE') return FAILURE_CLASSES.REGISTRY_LOOKUP_FAILURE;
  if (code === 'ASSET_HTTP_FAILURE') return FAILURE_CLASSES.ASSET_HTTP_FAILURE;
  if (code === 'PLACEHOLDER_WHEN_APPROVED_ASSET_EXISTS') return FAILURE_CLASSES.PLACEHOLDER_WHEN_APPROVED_ASSET_EXISTS;
  return code || null;
}

export function classifyValidationLevel(input = {}) {
  const codePath = input.codePathPass === true;
  const serverState = input.serverStatePass === true;
  const ownerLive = input.ownerLivePass === true;
  if (codePath && serverState && ownerLive) return VALIDATION_LEVELS.PRODUCTION_VALIDATED;
  if (ownerLive && !serverState) return VALIDATION_LEVELS.OWNER_LIVE_RETEST_REQUIRED;
  if (codePath && !serverState) return VALIDATION_LEVELS.CODE_PATH_PASS;
  if (serverState && !ownerLive) return VALIDATION_LEVELS.SERVER_STATE_PASS;
  if (!ownerLive) return VALIDATION_LEVELS.OWNER_LIVE_RETEST_REQUIRED;
  return VALIDATION_LEVELS.CODE_PATH_PASS;
}

export function codePathPassIsNotProductionValidated(level) {
  return asText(level) !== VALIDATION_LEVELS.PRODUCTION_VALIDATED;
}

export function isOwnerLiveClass(value) {
  const t = asText(value);
  return (
    t === VALIDATION_LEVELS.OWNER_LIVE_RETEST_REQUIRED ||
    t === VALIDATION_LEVELS.OWNER_LIVE_SMOKE_REQUIRED
  );
}

export function ciBlockingFailures(failures = []) {
  return (Array.isArray(failures) ? failures : []).filter((row) => !isOwnerLiveClass(row && (row.class || row)));
}

export function buildIntegrityReport(input = {}) {
  const timestamp = input.timestamp || new Date().toISOString();
  const environment = asText(input.environment) || 'local';
  const ownerLivePass = input.ownerLivePass === true;
  const productionBlockers = ownerLivePass ? [] : OPEN_PRODUCTION_BLOCKERS_V1.slice();
  const extraBlockers = Array.isArray(input.blockingFailures) ? input.blockingFailures : [];
  const blockingFailures = productionBlockers.concat(extraBlockers);
  const ownerLiveRequired = !ownerLivePass;
  const productionSmoke = ownerLivePass
    ? VALIDATION_LEVELS.OWNER_LIVE_PASS
    : VALIDATION_LEVELS.OWNER_LIVE_SMOKE_REQUIRED;
  const level = classifyValidationLevel({
    codePathPass: input.codePathPass !== false,
    serverStatePass: input.serverStatePass === true,
    ownerLivePass
  });
  return {
    runtimeIntegrityVersion: RUNTIME_INTEGRITY_VERSION,
    timestamp,
    environment,
    validationLevel: level,
    paidAiCalls: 0,
    imageGeneration: 0,
    additionalSpendUsd: 0,
    results: {
      serverTruth: input.results && input.results.serverTruth ? input.results.serverTruth : SOURCE_OF_TRUTH.DESIGN_STATE,
      saveSemantics: input.results && input.results.saveSemantics ? input.results.saveSemantics : SAVE_STATES.SERVER_SAVED,
      ownershipIntegrity: input.results && input.results.ownershipIntegrity ? input.results.ownershipIntegrity : 'CODE_PATH_PASS',
      designPersistence: input.results && input.results.designPersistence ? input.results.designPersistence : 'CODE_PATH_PASS',
      assetRegistry: input.results && input.results.assetRegistry ? input.results.assetRegistry : 'CODE_PATH_PASS',
      approvedAssetRendering: input.results && input.results.approvedAssetRendering
        ? input.results.approvedAssetRendering
        : VALIDATION_LEVELS.OWNER_LIVE_RETEST_REQUIRED,
      localCacheSafety: input.results && input.results.localCacheSafety ? input.results.localCacheSafety : 'CODE_PATH_PASS',
      productionSmoke
    },
    blockingFailures,
    ownerLiveRequired,
    layers: {
      ui: input.layers && input.layers.ui ? input.layers.ui : null,
      api: input.layers && input.layers.api ? input.layers.api : null,
      db: input.layers && input.layers.db ? input.layers.db : null
    }
  };
}

const api = {
  RUNTIME_INTEGRITY_VERSION,
  SOURCE_OF_TRUTH,
  SAVE_STATES,
  VALIDATION_LEVELS,
  INTEGRITY_LAYERS,
  FAILURE_CLASSES,
  APPROVED_CANARY_SLUGS,
  OPEN_PRODUCTION_BLOCKERS_V1,
  savedLabelAllowed,
  localCacheMayClaimSaved,
  evaluateSaveSemanticsClaim,
  evaluateOwnershipInvariants,
  evaluateDesignIdentity,
  mapPersistFailureClass,
  classifyValidationLevel,
  codePathPassIsNotProductionValidated,
  isOwnerLiveClass,
  ciBlockingFailures,
  buildIntegrityReport
};

export default api;

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitRuntimeIntegrityGate = api;
}
