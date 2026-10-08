import { assertAddPlantIntentSafe } from './add-plant-contract.js';

function requireRpcClient(supabase) {
  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new Error('supabase_rpc_client_required');
  }
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

  if (
    !envelope.history ||
    envelope.history.garden_plant_id !== row.id ||
    envelope.history.event_type !== 'plant_added'
  ) {
    throw new Error('add_garden_plant_once:history_identity_mismatch');
  }

  return Object.freeze({
    created: envelope.created === true,
    historyCreated: envelope.historyCreated === true,
    plant: Object.freeze({ ...row }),
    history: Object.freeze({ ...envelope.history }),
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
