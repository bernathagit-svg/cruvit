const PROFILE_SELECT = 'id,user_id,name,created_at,updated_at';
const PLANT_SELECT = [
  'id','garden_profile_id','user_id','client_instance_id','name','status','mark','source',
  'profile_slug','scientific','archived','prefs','added_at','garden_area_id','cover_media_id','created_at','updated_at'
].join(',');
const AREA_SELECT = [
  'id','garden_profile_id','user_id','client_instance_id','name','context','created_at','updated_at'
].join(',');
const TASK_SELECT = [
  'id','garden_profile_id','user_id','client_instance_id','garden_plant_id','icon','title',
  'when_label','priority','due_on','auto_generated','plant_name','done','source_module','task_type',
  'created_at','updated_at'
].join(',');
const EVENT_SELECT = [
  'id','garden_profile_id','user_id','garden_plant_id','garden_task_id','caused_by_event_id',
  'correlation_id','schema_version','event_type','source_module','client_event_id','payload',
  'occurred_at','created_at'
].join(',');
const MEDIA_SELECT = [
  'id','garden_profile_id','user_id','garden_plant_id','garden_area_id','client_instance_id',
  'storage_bucket','storage_path','mime_type','byte_size','width','height','source_module','purpose',
  'identity_source','identity_confidence','validation_state','content_sha256','captured_at','metadata',
  'created_at','updated_at'
].join(',');

function requireClient(supabase) {
  if (!supabase || typeof supabase.from !== 'function') throw new Error('supabase_client_required');
}

function requireGardenId(gardenProfileId) {
  if (typeof gardenProfileId !== 'string' || !gardenProfileId.trim()) throw new Error('garden_profile_id_required');
  return gardenProfileId;
}

function assertSuccess(result, context) {
  if (!result || typeof result !== 'object') throw new Error(`${context}:invalid_response`);
  if (result.error) {
    const code = result.error.code ? `:${result.error.code}` : '';
    throw new Error(`${context}${code}:${result.error.message || 'query_failed'}`);
  }
  return result.data;
}

function assertScopedRows(rows, gardenProfileId, label) {
  if (!Array.isArray(rows)) throw new Error(`${label}:expected_array`);
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !row.id) throw new Error(`${label}:row_id_required`);
    if (seen.has(row.id)) throw new Error(`${label}:duplicate_id:${row.id}`);
    seen.add(row.id);
    if (row.garden_profile_id !== gardenProfileId) {
      throw new Error(`${label}:cross_garden_row:${row.id}`);
    }
  }
  return rows;
}

export function createMyGardenReadRepository(supabase) {
  requireClient(supabase);

  async function getGardenProfile(gardenProfileId) {
    const id = requireGardenId(gardenProfileId);
    const result = await supabase
      .from('garden_profiles')
      .select(PROFILE_SELECT)
      .eq('id', id)
      .maybeSingle();
    const data = assertSuccess(result, 'garden_profiles_read');
    if (!data) return null;
    if (data.id !== id) throw new Error(`garden_profiles_read:identity_mismatch:${data.id}`);
    return data;
  }

  async function listPlants(gardenProfileId) {
    const id = requireGardenId(gardenProfileId);
    const result = await supabase
      .from('garden_plants')
      .select(PLANT_SELECT)
      .eq('garden_profile_id', id)
      .order('added_at', { ascending: true })
      .order('id', { ascending: true });
    return assertScopedRows(assertSuccess(result, 'garden_plants_read'), id, 'garden_plants_read');
  }

  async function listAreas(gardenProfileId) {
    const id = requireGardenId(gardenProfileId);
    const result = await supabase
      .from('garden_areas')
      .select(AREA_SELECT)
      .eq('garden_profile_id', id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    return assertScopedRows(assertSuccess(result, 'garden_areas_read'), id, 'garden_areas_read');
  }

  async function listTasks(gardenProfileId) {
    const id = requireGardenId(gardenProfileId);
    const result = await supabase
      .from('garden_tasks')
      .select(TASK_SELECT)
      .eq('garden_profile_id', id)
      .order('due_on', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });
    return assertScopedRows(assertSuccess(result, 'garden_tasks_read'), id, 'garden_tasks_read');
  }

  async function listEvents(gardenProfileId) {
    const id = requireGardenId(gardenProfileId);
    const result = await supabase
      .from('garden_events')
      .select(EVENT_SELECT)
      .eq('garden_profile_id', id)
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: true });
    return assertScopedRows(assertSuccess(result, 'garden_events_read'), id, 'garden_events_read');
  }

  async function listMedia(gardenProfileId) {
    const id = requireGardenId(gardenProfileId);
    const result = await supabase
      .from('garden_media')
      .select(MEDIA_SELECT)
      .eq('garden_profile_id', id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true });
    return assertScopedRows(assertSuccess(result, 'garden_media_read'), id, 'garden_media_read');
  }

  async function loadGardenSnapshot(gardenProfileId) {
    const id = requireGardenId(gardenProfileId);
    const [profile, plants, tasks, events, media] = await Promise.all([
      getGardenProfile(id),
      listPlants(id),
      listTasks(id),
      listEvents(id),
      listMedia(id),
    ]);
    if (!profile) throw new Error(`garden_snapshot:garden_not_found:${id}`);
    return Object.freeze({ profile, plants, tasks, events, media });
  }

  return Object.freeze({
    getGardenProfile,
    listPlants,
    listAreas,
    listTasks,
    listEvents,
    listMedia,
    loadGardenSnapshot,
  });
}

export const MY_GARDEN_SELECTS = Object.freeze({
  profile: PROFILE_SELECT,
  plants: PLANT_SELECT,
  areas: AREA_SELECT,
  tasks: TASK_SELECT,
  events: EVENT_SELECT,
  media: MEDIA_SELECT,
});
