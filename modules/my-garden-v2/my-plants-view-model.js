import { activePlants } from './read-model.js';

const ELIGIBLE_PERSONAL_PURPOSES = new Set(['plant_profile', 'progress_photo']);

function indexUnique(rows, label) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row || typeof row.id !== 'string' || !row.id.trim()) {
      throw new Error(`${label}_id_required`);
    }
    if (map.has(row.id)) throw new Error(`duplicate_${label}_id:${row.id}`);
    map.set(row.id, row);
  }
  return map;
}

function resolveArea(plant, areasById) {
  const id = plant.garden_area_id ?? null;
  if (!id) return Object.freeze({ areaId: null, areaName: null });
  const area = areasById.get(id);
  if (!area) {
    return Object.freeze({ areaId: id, areaName: null, unavailableReason: 'area_not_found' });
  }
  return Object.freeze({ areaId: area.id, areaName: area.name ?? null });
}

function systemCover(plant, unavailableReason = null) {
  return Object.freeze({
    kind: 'system',
    personalMediaId: null,
    systemImageKey: plant.profile_slug ?? plant.scientific ?? null,
    unavailableReason,
  });
}

function resolveCover(plant, mediaById) {
  const mediaId = plant.cover_media_id ?? null;
  if (!mediaId) return systemCover(plant);

  const media = mediaById.get(mediaId);
  if (!media) return systemCover(plant, 'cover_media_not_found');

  if (media.garden_plant_id && media.garden_plant_id !== plant.id) {
    throw new Error(`cover_media_plant_mismatch:${plant.id}:${media.id}`);
  }

  // Approved behavior: a personal plant image belongs to one exact plant instance.
  // Garden-scoped/unscoped media must never silently become a plant cover.
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

function cardForPlant(plant, areasById, mediaById) {
  const area = resolveArea(plant, areasById);
  const cover = resolveCover(plant, mediaById);

  return Object.freeze({
    id: plant.id,
    name: plant.name,
    scientificName: plant.scientific ?? null,
    status: plant.status ?? null,
    mark: plant.mark ?? null,
    profileSlug: plant.profile_slug ?? null,
    addedAt: plant.added_at ?? null,
    area,
    // Exact-position text is intentionally null until an explicit backend field exists.
    // Never infer "South side", "near wall", etc. from area context.
    positionLabel: null,
    cover,
    cameraAction: Object.freeze({
      action: 'replace_plant_photo',
      plantId: plant.id,
    }),
  });
}

export function buildMyPlantsViewModel({ plants = [], areas = [], media = [] } = {}) {
  const areasById = indexUnique(areas, 'area');
  const mediaById = indexUnique(media, 'media');
  const active = activePlants(plants);
  const archivedCount = (plants || []).filter((p) => p?.archived === true).length;

  const cards = active.map((plant) => cardForPlant(plant, areasById, mediaById));

  return Object.freeze({
    activeCount: cards.length,
    archivedCount,
    cards: Object.freeze(cards),
  });
}

export function filterMyPlantsCards(cards, query) {
  const q = String(query ?? '').trim().toLocaleLowerCase();
  if (!q) return [...(cards || [])];

  return (cards || []).filter((card) => {
    const haystack = [
      card.name,
      card.scientificName,
      card.status,
      card.area?.areaName,
    ].filter(Boolean).join(' ').toLocaleLowerCase();
    return haystack.includes(q);
  });
}

export function assertMyPlantsIdentity(viewModel) {
  if (!viewModel || typeof viewModel !== 'object') throw new Error('my_plants_view_model_required');
  const ids = new Set();
  for (const card of viewModel.cards || []) {
    if (ids.has(card.id)) throw new Error(`duplicate_my_plants_card:${card.id}`);
    ids.add(card.id);
    if (card.cameraAction?.plantId !== card.id) {
      throw new Error(`camera_wrong_plant_instance:${card.id}`);
    }
    if (card.cover?.kind === 'personal' && !card.cover.personalMediaId) {
      throw new Error(`personal_cover_media_id_required:${card.id}`);
    }
  }
  if (ids.size !== viewModel.activeCount) throw new Error('my_plants_count_mismatch');
  return true;
}
