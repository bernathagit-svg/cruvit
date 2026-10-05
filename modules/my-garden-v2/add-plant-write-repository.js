import {
  assertAddPlantIntentSafe,
  gardenPlantInsertSchemaGate,
} from './add-plant-contract.js';

function requireClient(supabase) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('supabase_client_required');
  }
}

function assertInsertResponse(result) {
  if (!result || typeof result !== 'object') {
    throw new Error('garden_plants_insert:invalid_response');
  }
  if (result.error) {
    const code = result.error.code ? ':' + result.error.code : '';
    throw new Error(
      'garden_plants_insert' + code + ':' +
      (result.error.message || 'query_failed')
    );
  }
  if (!result.data || typeof result.data !== 'object') {
    throw new Error('garden_plants_insert:row_required');
  }
  return result.data;
}

function sourceForMode(mode) {
  if (mode === 'scan') return 'Scan & Identify';
  if (mode === 'suggestions') return 'Smart Recommendations';
  if (mode === 'popular') return 'Popular for Area';
  if (mode === 'search') return 'Catalog Search';
  return 'My Garden';
}

export function buildGardenPlantInsert(intent) {
  assertAddPlantIntentSafe(intent);

  return Object.freeze({
    garden_profile_id: intent.gardenProfileId,
    client_instance_id: intent.clientInstanceId,
    name: intent.displayName,
    status: 'unassessed',
    mark: 'unknown',
    source: sourceForMode(intent.mode),
    profile_slug: intent.identity?.profileSlug ?? null,
    scientific: intent.identity?.scientific ?? null,
    garden_area_id: intent.gardenAreaId ?? null,
  });
}

export function createAddPlantWriteRepository(
  supabase,
  { supportsUnassessedHealth = false } = {}
) {
  requireClient(supabase);

  async function insert(intent) {
    const gate = gardenPlantInsertSchemaGate(intent, {
      supportsUnassessedHealth,
    });

    if (gate.blocked) {
      throw new Error(gate.code || 'garden_plant_insert_schema_blocked');
    }

    const payload = buildGardenPlantInsert(intent);

    const result = await supabase
      .from('garden_plants')
      .insert(payload)
      .select(
        'id,garden_profile_id,user_id,client_instance_id,name,status,mark,source,' +
        'profile_slug,scientific,archived,prefs,added_at,garden_area_id,cover_media_id,' +
        'created_at,updated_at'
      )
      .single();

    const row = assertInsertResponse(result);

    if (row.garden_profile_id !== intent.gardenProfileId) {
      throw new Error('garden_plants_insert:garden_identity_mismatch');
    }
    if (row.client_instance_id !== intent.clientInstanceId) {
      throw new Error('garden_plants_insert:client_identity_mismatch');
    }
    if (row.status !== 'unassessed' || row.mark !== 'unknown') {
      throw new Error('garden_plants_insert:health_state_mismatch');
    }
    if ((row.profile_slug ?? null) !== (intent.identity?.profileSlug ?? null)) {
      throw new Error('garden_plants_insert:canonical_identity_mismatch');
    }

    return row;
  }

  return Object.freeze({ insert });
}
