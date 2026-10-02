import { createMyGardenHomeDataAdapter } from './home-data-adapter.js';
import { renderApprovedMyGardenHome } from './approved-home-renderer.js';

export function createMyGardenHomeScreenController(supabase) {
  const adapter = createMyGardenHomeDataAdapter(supabase);

  async function load(gardenProfileId, options = {}) {
    const data = await adapter.loadHome(gardenProfileId, options);
    const html = renderApprovedMyGardenHome(data.viewModel);

    return Object.freeze({
      garden: data.garden,
      gardenPhoto: data.gardenPhoto,
      viewModel: data.viewModel,
      html,
    });
  }

  return Object.freeze({ load });
}

export function mountApprovedMyGardenHome(root, screenState) {
  if (!root || typeof root !== 'object' || !('innerHTML' in root)) {
    throw new Error('home_root_required');
  }
  if (!screenState?.html) throw new Error('home_screen_state_required');

  root.innerHTML = screenState.html;
  return root.querySelector?.('.precision-shell') ?? null;
}
