export const ADD_PLANT_ENTRY_MODES = Object.freeze([
  'scan',
  'manual',
  'suggestions',
  'search',
  'popular',
]);

const CANONICAL_IDENTITY_MODES = new Set(['suggestions', 'search', 'popular']);

function requiredText(value, code) {
  const s = String(value ?? '').trim();
  if (!s) throw new Error(code);
  return s;
}

function normalizeIdentity(input, mode) {
  const canonicalSlug = input.canonicalSlug ?? input.canonical_slug ?? null;
  const scientificName = input.scientificName ?? input.scientific_name ?? null;

  if (mode === 'manual') {
    if (canonicalSlug != null || scientificName != null) {
      throw new Error('manual_add_must_not_silently_assign_canonical_identity');
    }
    return Object.freeze({
      profileSlug: null,
      scientific: null,
      identitySource: 'user_assigned_label',
    });
  }

  if (mode === 'scan') {
    const confirmed = input.identityConfirmed === true || input.identity_confirmed === true;

    if (!confirmed) {
      if (canonicalSlug != null || scientificName != null) {
        throw new Error('unconfirmed_scan_must_not_assign_canonical_identity');
      }
      return Object.freeze({
        profileSlug: null,
        scientific: null,
        identitySource: 'identifier_unconfirmed',
      });
    }

    return Object.freeze({
      profileSlug: requiredText(canonicalSlug, 'confirmed_scan_canonical_slug_required'),
      scientific: requiredText(scientificName, 'confirmed_scan_scientific_name_required'),
      identitySource: 'identifier_confirmed',
    });
  }

  if (CANONICAL_IDENTITY_MODES.has(mode)) {
    return Object.freeze({
      profileSlug: requiredText(canonicalSlug, 'canonical_slug_required'),
      scientific: requiredText(scientificName, 'scientific_name_required'),
      identitySource:
        mode === 'suggestions' ? 'smart_recommendations'
        : mode === 'popular' ? 'popular_for_area'
        : 'catalog_search',
    });
  }

  throw new Error('unsupported_add_plant_mode:' + mode);
}

export function prepareAddPlantIntent(input = {}) {
  const mode = requiredText(input.mode, 'add_plant_mode_required');
  if (!ADD_PLANT_ENTRY_MODES.includes(mode)) {
    throw new Error('unsupported_add_plant_mode:' + mode);
  }

  const identity = normalizeIdentity(input, mode);

  const intent = {
    gardenProfileId: requiredText(
      input.gardenProfileId ?? input.garden_profile_id,
      'garden_profile_id_required'
    ),
    clientInstanceId: requiredText(
      input.clientInstanceId ?? input.client_instance_id,
      'client_instance_id_required'
    ),
    displayName: requiredText(
      input.displayName ?? input.name,
      'plant_display_name_required'
    ),
    mode,
    identity,
    gardenAreaId: input.gardenAreaId ?? input.garden_area_id ?? null,
    exactPosition: input.exactPosition ?? input.exact_position ?? null,
    initialHealth: Object.freeze({
      status: 'unassessed',
      mark: 'unknown',
    }),
  };

  return Object.freeze(intent);
}

export function assertAddPlantIntentSafe(intent) {
  if (!intent?.gardenProfileId || !intent?.clientInstanceId || !intent?.displayName) {
    throw new Error('invalid_add_plant_intent');
  }

  if (intent.initialHealth?.status !== 'unassessed') {
    throw new Error('new_plant_health_must_start_unassessed');
  }

  if (intent.initialHealth?.mark !== 'unknown') {
    throw new Error('new_plant_mark_must_start_unknown');
  }

  return true;
}
