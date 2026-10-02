import { activePlants } from './read-model.js';
import {
  indexUniqueById,
  projectPlantInstance,
} from './plant-instance-projection.js';

function cardForPlant(plant, areasById, mediaById) {
  const instance = projectPlantInstance(plant, { areasById, mediaById });

  return Object.freeze({
    ...instance,
    cameraAction: Object.freeze({
      action: 'replace_plant_photo',
      plantId: instance.id,
    }),
  });
}

export function buildMyPlantsViewModel({ plants = [], areas = [], media = [] } = {}) {
  const areasById = indexUniqueById(areas, 'area');
  const mediaById = indexUniqueById(media, 'media');
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
    if (ids.has(card.id)) throw new Error('duplicate_my_plants_card:' + card.id);
    ids.add(card.id);

    if (card.cameraAction?.plantId !== card.id) {
      throw new Error('camera_wrong_plant_instance:' + card.id);
    }

    if (card.cover?.kind === 'personal' && !card.cover.personalMediaId) {
      throw new Error('personal_cover_media_id_required:' + card.id);
    }
  }

  if (ids.size !== viewModel.activeCount) throw new Error('my_plants_count_mismatch');
  return true;
}
