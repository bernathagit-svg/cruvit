import {GARDEN, OWNER, SAVE_KEY, FIXTURE, assertIdentifierSaveBinding,
  assertIdentifierSaveReadback} from './save-controller.mjs';

const PSELECT = 'id,user_id,garden_profile_id,client_instance_id,name,profile_slug,scientific,status,mark,archived';
function full(result, label) {
  if (!result || result.error || result.status !== 200 || !Array.isArray(result.data)
      || result.count !== result.data.length) throw Error(label + ' read failed or incomplete');
  return result.data;
}

// The existing read implementation is parameterized here, with no client or fixture fallback.
export function createIdentifierSaveDomain({client, metrics, delta} = {}) {
  if (typeof client?.auth?.getUser !== 'function' || typeof client.from !== 'function'
      || typeof client.rpc !== 'function' || typeof metrics !== 'function' || typeof delta !== 'function') {
    throw Error('Explicit authenticated client and meter required');
  }
  return Object.freeze({getSupabaseClient: () => client, metrics, delta,
    async verify(binding) {
      assertIdentifierSaveBinding(binding);
      const {gardenId, ownerId, fixture} = binding;
      const auth = await client.auth.getUser();
      if (auth.error || auth.data?.user?.id !== ownerId || auth.data.user.role !== 'authenticated') {
        throw Error('Authenticated owner verification failed');
      }
      const [garden, catalog] = await Promise.all([
        client.from('garden_profiles').select('id,user_id').eq('id', gardenId).single(),
        client.from('catalog_plants').select('slug,scientific_name,verification_state,media_status').eq('slug', fixture.profileSlug).single()
      ]);
      if (garden.error || garden.status !== 200 || garden.data?.id !== gardenId || garden.data.user_id !== ownerId) throw Error('Garden owner read failed');
      if (catalog.error || catalog.status !== 200 || catalog.data?.slug !== fixture.profileSlug
          || catalog.data.scientific_name !== fixture.scientific || catalog.data.verification_state !== 'verified'
          || catalog.data.media_status !== 'IMAGE_READY') throw Error('Exact verified canonical plant missing');
    },
    async hydrate(expected) {
      assertIdentifierSaveBinding(expected);
      const {gardenId, clientInstanceId, plantId, historyId} = expected;
      if (typeof plantId !== 'string' || !plantId.trim() || typeof historyId !== 'string' || !historyId.trim()) {
        throw Error('Authoritative readback identities required');
      }
      const [p, h] = await Promise.all([
        client.from('garden_plants').select(PSELECT, {count: 'exact'}).eq('garden_profile_id', gardenId).order('id').range(0, 999),
        client.from('garden_events').select('id,user_id,garden_profile_id,garden_plant_id,event_type,source_module,client_event_id,payload', {count: 'exact'})
          .eq('garden_profile_id', gardenId).eq('garden_plant_id', plantId).eq('event_type', 'plant_added').order('id')
      ]);
      const plants = full(p, 'Plant'), history = full(h, 'History');
      const exact = plants.filter(plant => plant.client_instance_id === clientInstanceId);
      const readback = {source: 'authenticated-atomic-readback', gardenId, plant: exact[0], history: history[0],
        plantKeyCount: exact.length, plantAddedHistoryCount: history.length, totalGardenPlants: plants.length,
        allPlants: plants, readAt: new Date().toISOString()};
      assertIdentifierSaveReadback(readback, expected, {plantId, historyId});
      return readback;
    }
  });
}

// Preserve the historical composition and its extra fixture-only acceptance checks.
export function createPreviewSaveDomain({client, metrics, delta} = {}) {
  if (client?.supabaseUrl?.replace(/\/$/, '') !== 'https://pwgeygwafuinwkpmnzxp.supabase.co') throw Error('Explicit Preview client and meter required');
  const shared = createIdentifierSaveDomain({client, metrics, delta});
  const fixed = Object.freeze({gardenId: GARDEN, ownerId: OWNER, fixture: FIXTURE, clientInstanceId: SAVE_KEY});
  function assertFixed(input) {
    if (input.gardenId !== GARDEN || input.ownerId !== OWNER || input.fixture?.profileSlug !== FIXTURE.profileSlug
        || input.fixture.scientific !== FIXTURE.scientific || (input.clientInstanceId != null && input.clientInstanceId !== SAVE_KEY)) {
      throw Error('Bounded Preview fixture mismatch');
    }
  }
  return Object.freeze({...shared,
    async verify(input) { assertFixed(input); return shared.verify(fixed); },
    async hydrate(input) {
      if (input.clientInstanceId !== SAVE_KEY) throw Error('Unapproved save key');
      // Old Preview callers supplied only the receipt IDs; new callers also carry their binding.
      if (input.gardenId != null || input.ownerId != null || input.fixture != null) assertFixed(input);
      const readback = await shared.hydrate({...fixed, plantId: input.plantId, historyId: input.historyId});
      for (const id of ['079827a3-732d-4a16-acd0-b9949bc7bc53', 'f82ded5a-8b6f-4093-be98-6972c12e4520']) {
        if (!readback.allPlants.some(plant => plant.id === id)) throw Error('Original fixture disappeared');
      }
      return {...readback, source: 'authenticated-preview-readback'};
    }
  });
}
