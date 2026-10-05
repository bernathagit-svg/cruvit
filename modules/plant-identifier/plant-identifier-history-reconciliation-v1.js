import {
  buildPlantAddedMemoryInput,
  writeGardenMemoryEvent,
} from '../personal-domain/garden-memory-writer-v1.js';

function requireClient(supabase) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('history_reconciliation_supabase_required');
  }
}

function requireGardenId(value) {
  const id = String(value || '').trim();
  if (!id) throw new Error('history_reconciliation_garden_required');
  return id;
}

function assertRows(result, label) {
  if (!result || typeof result !== 'object') throw new Error(label + ':invalid_response');
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data : [];
}

export async function reconcileIdentifierPlantAddedHistory({
  supabase,
  gardenProfileId,
} = {}) {
  requireClient(supabase);
  const gardenId = requireGardenId(gardenProfileId);

  const plantsResult = await supabase
    .from('garden_plants')
    .select(
      'id,garden_profile_id,client_instance_id,name,scientific,profile_slug,source,added_at'
    )
    .eq('garden_profile_id', gardenId)
    .eq('source', 'Scan & Identify');

  const plants = assertRows(plantsResult, 'history_reconciliation_plants');

  if (!plants.length) {
    return Object.freeze({
      ok: true,
      checked: 0,
      missing: 0,
      repaired: 0,
      pending: 0,
      failures: Object.freeze([]),
    });
  }

  const eventsResult = await supabase
    .from('garden_events')
    .select('id,garden_profile_id,garden_plant_id,event_type,source_module,client_event_id')
    .eq('garden_profile_id', gardenId)
    .eq('event_type', 'plant_added')
    .eq('source_module', 'plant_identifier');

  const events = assertRows(eventsResult, 'history_reconciliation_events');
  const covered = new Set(
    events
      .map((row) => String(row?.garden_plant_id || '').trim())
      .filter(Boolean)
  );

  const missing = plants.filter((plant) => !covered.has(String(plant.id || '').trim()));
  const failures = [];
  let repaired = 0;

  for (const plant of missing) {
    try {
      const input = buildPlantAddedMemoryInput(plant, {
        sourceModule: 'plant_identifier',
      });
      await writeGardenMemoryEvent(supabase, input);
      repaired += 1;
    } catch (error) {
      failures.push(Object.freeze({
        plantId: String(plant?.id || ''),
        clientInstanceId: String(plant?.client_instance_id || ''),
        error: error?.message || 'history_reconciliation_failed',
      }));
    }
  }

  return Object.freeze({
    ok: failures.length === 0,
    checked: plants.length,
    missing: missing.length,
    repaired,
    pending: failures.length,
    failures: Object.freeze(failures),
  });
}

const api = Object.freeze({ reconcileIdentifierPlantAddedHistory });

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitPlantIdentifierHistoryReconciliation = api;
}

export default api;
