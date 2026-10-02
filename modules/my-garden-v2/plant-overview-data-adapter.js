import { createMyGardenReadRepository } from './supabase-read-repository.js';
import { createCatalogPlantReadRepository } from './catalog-plant-read-repository.js';
import { projectPlantInstanceById } from './plant-instance-projection.js';
import {
  resolvePlantKnowledge,
  knowledgeCanDriveVerifiedUI,
} from './plant-knowledge-resolver.js';
import {
  buildPlantOverviewViewModel,
  assertOverviewNoSilentInference,
} from './plant-overview-view-model.js';

function tagsFromCatalogKnowledge(knowledge) {
  if (!knowledge) return [];

  const traits = knowledge.climateTraits ?? {};
  const tags = [];

  // Only explicit catalog fields may become tags.
  if (traits.plantType) tags.push(String(traits.plantType));
  if (traits.evergreen === true) tags.push('Evergreen');
  if (Array.isArray(traits.tags)) {
    for (const tag of traits.tags) tags.push(String(tag));
  }

  return [...new Set(tags.map((x) => x.trim()).filter(Boolean))];
}

export function createPlantOverviewDataAdapter(supabase) {
  const gardenRepo = createMyGardenReadRepository(supabase);
  const catalogRepo = createCatalogPlantReadRepository(supabase);

  async function loadOverview(gardenProfileId, plantId, options = {}) {
    const snapshot = await gardenRepo.loadGardenSnapshot(gardenProfileId);

    const plant = projectPlantInstanceById({
      plantId,
      plants: snapshot.plants,
      areas: snapshot.areas,
      media: snapshot.media,
    });

    let catalogRow = null;
    if (plant.profileSlug) {
      catalogRow = await catalogRepo.getByExactSlug(plant.profileSlug);
    }

    const knowledgeResolution = resolvePlantKnowledge(plant, catalogRow);
    const verifiedKnowledge = knowledgeCanDriveVerifiedUI(knowledgeResolution)
      ? knowledgeResolution.knowledge
      : null;

    const plantKnowledge = verifiedKnowledge
      ? {
          slug: verifiedKnowledge.slug,
          scientificName: verifiedKnowledge.scientificName,
          source: verifiedKnowledge.sourcePacket ?? verifiedKnowledge.catalogVersion ?? 'catalog_plants',
          tags: tagsFromCatalogKnowledge(verifiedKnowledge),
        }
      : null;

    const viewModel = buildPlantOverviewViewModel({
      plantId,
      plants: snapshot.plants,
      areas: snapshot.areas,
      media: snapshot.media,
      plantKnowledge,
      plantObservation: options.plantObservation ?? null,
      phenologyProjection: options.phenologyProjection ?? null,
      plantedOn: options.plantedOn ?? null,
      latestNote: options.latestNote ?? null,
    });

    assertOverviewNoSilentInference(viewModel);

    return Object.freeze({
      garden: snapshot.profile,
      knowledgeResolution,
      viewModel,
    });
  }

  return Object.freeze({ loadOverview });
}
