import {
  assertAddPlantIntentSafe,
  gardenPlantInsertSchemaGate,
} from './add-plant-contract.js';

function requireClient(supabase) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('supabase_client_required');
  }
}

function requireRpcClient(supabase) {
  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new Error('supabase_rpc_client_required');
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
      .upsert(payload, {
        onConflict: 'garden_profile_id,client_instance_id',
      })
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

function assertAtomicCommandResponse(result, intent) {
  if (!result || typeof result !== 'object') {
    throw new Error('add_garden_plant_once:invalid_response');
  }
  if (result.error) {
    const message = result.error.message || 'rpc_failed';
    const error = new Error('add_garden_plant_once:' + message);
    error.code = result.error.code || null;
    throw error;
  }

  const envelope = result.data;
  if (!envelope || envelope.ok !== true || !envelope.plant) {
    throw new Error('add_garden_plant_once:invalid_envelope');
  }

  const row = envelope.plant;
  if (row.garden_profile_id !== intent.gardenProfileId) {
    throw new Error('add_garden_plant_once:garden_identity_mismatch');
  }
  if (row.client_instance_id !== intent.clientInstanceId) {
    throw new Error('add_garden_plant_once:client_identity_mismatch');
  }

  const requestedSlug = intent.identity?.profileSlug ?? null;
  if (row.profile_slug != null && row.profile_slug !== requestedSlug) {
    throw new Error('add_garden_plant_once:canonical_identity_mismatch');
  }

  return Object.freeze({
    created: envelope.created === true,
    historyCreated: envelope.historyCreated === true,
    plant: Object.freeze({ ...row }),
    history: envelope.history ? Object.freeze({ ...envelope.history }) : null,
  });
}

export function createAtomicAddPlantCommand(supabase) {
  requireRpcClient(supabase);

  async function execute(intent) {
    assertAddPlantIntentSafe(intent);

    const result = await supabase.rpc('add_garden_plant_once_v1', {
      p_garden_profile_id: intent.gardenProfileId,
      p_client_instance_id: intent.clientInstanceId,
      p_display_name: intent.displayName,
      p_mode: intent.mode,
      p_profile_slug: intent.identity?.profileSlug ?? null,
      p_scientific: intent.identity?.scientific ?? null,
      p_garden_area_id: intent.gardenAreaId ?? null,
    });

    return assertAtomicCommandResponse(result, intent);
  }

  return Object.freeze({ execute });
}
