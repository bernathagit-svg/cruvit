import { createMyGardenReadRepository } from './supabase-read-repository.js';
import { buildMyGardenHomeViewModel, assertHomeViewModelConsistency } from './home-view-model.js';
import { resolveGardenPhoto } from './garden-photo-projection.js';

function requireDateOnly(today) {
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw new Error('today_date_only_required');
  }
  return today;
}

export function createMyGardenHomeDataAdapter(supabase) {
  const repository = createMyGardenReadRepository(supabase);

  async function loadHome(gardenProfileId, { today, attentionAlerts = [] } = {}) {
    const day = requireDateOnly(today);
    const snapshot = await repository.loadGardenSnapshot(gardenProfileId);

    const viewModel = buildMyGardenHomeViewModel({
      plants: snapshot.plants,
      tasks: snapshot.tasks,
      attentionAlerts,
      today: day,
    });

    assertHomeViewModelConsistency(viewModel);

    const gardenPhoto = resolveGardenPhoto({
      gardenProfile: snapshot.profile,
      media: snapshot.media,
    });

    return Object.freeze({
      garden: snapshot.profile,
      gardenPhoto,
      viewModel,
      // Events are intentionally not projected directly into Home.
      // Home remains a summary/read-model surface.
    });
  }

  return Object.freeze({ loadHome });
}
