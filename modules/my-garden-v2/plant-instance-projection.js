const ELIGIBLE_PERSONAL_PURPOSES = new Set(['plant_profile', 'progress_photo']);

export function indexUniqueById(rows, label) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row || typeof row.id !== 'string' || !row.id.trim()) {
      throw new Error(label + '_id_required');
    }
    if (map.has(row.id)) throw new Error('duplicate_' + label + '_id:' + row.id);
    map.set(row.id, row);
  }
  return map;
}

export function resolvePlantArea(plant, areasById) {
  const id = plant.garden_area_id ?? null;
  if (!id) return Object.freeze({ areaId: null, areaName: null });

  const area = areasById.get(id);
  if (!area) {
    return Object.freeze({
      areaId: id,
      areaName: null,
      unavailableReason: 'area_not_found',
    });
  }

  return Object.freeze({
    areaId: area.id,
    areaName: area.name ?? null,
    unavailableReason: null,
  });
}

function systemCover(plant, unavailableReason = null) {
  return Object.freeze({
    kind: 'system',
    personalMediaId: null,
    systemImageKey: plant.profile_slug ?? plant.scientific ?? null,
    unavailableReason,
  });
}

export function resolvePlantCover(plant, mediaById) {
  const mediaId = plant.cover_media_id ?? null;
  if (!mediaId) return systemCover(plant);

  const media = mediaById.get(mediaId);
  if (!media) return systemCover(plant, 'cover_media_not_found');

  if (media.garden_plant_id && media.garden_plant_id !== plant.id) {
    throw new Error('cover_media_plant_mismatch:' + plant.id + ':' + media.id);
  }

  // Owner-approved invariant: a personal plant photo belongs to one exact plant instance.
  // Garden-scoped/unscoped media must not silently become a plant cover.
  if (media.garden_plant_id !== plant.id) {
    return systemCover(plant, 'cover_media_not_plant_scoped');
  }

  if (media.validation_state !== 'validated') {
    return systemCover(plant, 'cover_media_not_validated');
  }

  if (!ELIGIBLE_PERSONAL_PURPOSES.has(media.purpose)) {
    return systemCover(plant, 'cover_media_wrong_purpose');
  }

  return Object.freeze({
    kind: 'personal',
    personalMediaId: media.id,
    systemImageKey: plant.profile_slug ?? plant.scientific ?? null,
    storageBucket: media.storage_bucket ?? null,
    storagePath: media.storage_path ?? null,
    mimeType: media.mime_type ?? null,
    unavailableReason: null,
  });
}

export function projectPlantInstance(plant, { areasById, mediaById } = {}) {
  if (!plant || typeof plant.id !== 'string' || !plant.id.trim()) {
    throw new Error('plant_id_required');
  }

  const areaIndex = areasById || new Map();
  const mediaIndex = mediaById || new Map();

  return Object.freeze({
    id: plant.id,
    gardenProfileId: plant.garden_profile_id ?? null,
    clientInstanceId: plant.client_instance_id ?? null,
    name: plant.name,
    scientificName: plant.scientific ?? null,
    status: plant.status ?? null,
    mark: plant.mark ?? null,
    source: plant.source ?? null,
    profileSlug: plant.profile_slug ?? null,
    archived: plant.archived === true,
    prefs: plant.prefs ?? null,
    addedAt: plant.added_at ?? null,
    area: resolvePlantArea(plant, areaIndex),
    // No backend field currently exists for exact sub-area wording such as "South side".
    // Keep null rather than inferring from Area context.
    positionLabel: null,
    cover: resolvePlantCover(plant, mediaIndex),
  });
}

export function projectPlantInstanceById({
  plantId,
  plants = [],
  areas = [],
  media = [],
} = {}) {
  if (typeof plantId !== 'string' || !plantId.trim()) throw new Error('plant_id_required');

  const plantsById = indexUniqueById(plants, 'plant');
  const plant = plantsById.get(plantId);
  if (!plant) throw new Error('plant_not_found:' + plantId);

  return projectPlantInstance(plant, {
    areasById: indexUniqueById(areas, 'area'),
    mediaById: indexUniqueById(media, 'media'),
  });
}
