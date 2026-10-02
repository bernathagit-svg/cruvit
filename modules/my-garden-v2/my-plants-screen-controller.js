import { createMyPlantsDataAdapter } from './my-plants-data-adapter.js';
import {
  buildApprovedMyPlantsRenderModel,
  renderMyPlantsInteractionLayer,
  assertMyPlantsVisualAcceptanceReady,
} from './approved-my-plants-renderer.js';

export function createMyPlantsScreenController(supabase) {
  const adapter=createMyPlantsDataAdapter(supabase);

  async function load(gardenProfileId) {
    const data=await adapter.loadMyPlants(gardenProfileId);
    const renderModel=buildApprovedMyPlantsRenderModel(data.viewModel);
    assertMyPlantsVisualAcceptanceReady(renderModel);

    return Object.freeze({
      garden:data.garden,
      viewModel:data.viewModel,
      renderModel,
      interactionLayerHtml:renderMyPlantsInteractionLayer(renderModel),
      visualAcceptance:'pending_screenshot_comparison',
    });
  }

  return Object.freeze({load});
}
