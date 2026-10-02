import { createMyGardenReadRepository } from './supabase-read-repository.js';
import { buildMyGardenHomeViewModel, assertHomeViewModelConsistency } from './home-view-model.js';

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

    return Object.freeze({
      garden: snapshot.profile,
      viewModel,
      // Media/events are intentionally not projected into Home here.
      // Home stays a summary surface; those domains are consumed by their own screens.
    });
  }

  return Object.freeze({ loadHome });
}
