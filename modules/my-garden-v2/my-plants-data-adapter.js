import { createMyGardenReadRepository } from './supabase-read-repository.js';
import {
  buildMyPlantsViewModel,
  assertMyPlantsIdentity,
} from './my-plants-view-model.js';

export function createMyPlantsDataAdapter(supabase) {
  const repository = createMyGardenReadRepository(supabase);

  async function loadMyPlants(gardenProfileId) {
    const snapshot = await repository.loadGardenSnapshot(gardenProfileId);
    const viewModel = buildMyPlantsViewModel({
      plants: snapshot.plants,
      areas: snapshot.areas,
      media: snapshot.media,
    });
    assertMyPlantsIdentity(viewModel);
    return Object.freeze({
      garden: snapshot.profile,
      viewModel,
    });
  }

  return Object.freeze({ loadMyPlants });
}
