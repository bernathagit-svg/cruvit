import { createMyPlantsDataAdapter } from './my-plants-data-adapter.js';
import { createGardenMediaUrlResolver } from './garden-media-url-resolver.js';
import {
  buildApprovedMyPlantsRenderModel,
  renderMyPlantsInteractionLayer,
  renderMyPlantsPersonalPhotoLayer,
  assertMyPlantsVisualAcceptanceReady,
} from './approved-my-plants-renderer.js';

export function createMyPlantsScreenController(supabase,{signedUrlTtl=300}={}) {
  const adapter=createMyPlantsDataAdapter(supabase);
  const mediaResolver=createGardenMediaUrlResolver(supabase,{expiresIn:signedUrlTtl});

  async function load(gardenProfileId) {
    const data=await adapter.loadMyPlants(gardenProfileId);
    const renderModel=buildApprovedMyPlantsRenderModel(data.viewModel);
    assertMyPlantsVisualAcceptanceReady(renderModel);

    const signedUrlsByPlantId=new Map();
    const mediaErrorsByPlantId=new Map();

    for(const card of data.viewModel.cards){
      if(card.cover?.kind!=='personal') continue;
      try{
        const resolved=await mediaResolver.resolveCover(card.cover);
        if(resolved) signedUrlsByPlantId.set(card.id,resolved);
      }catch(error){
        // Fail closed: keep the approved CRUVIT system artwork visible.
        mediaErrorsByPlantId.set(card.id,String(error?.message || error));
      }
    }

    return Object.freeze({
      garden:data.garden,
      viewModel:data.viewModel,
      renderModel,
      interactionLayerHtml:renderMyPlantsInteractionLayer(renderModel),
      personalPhotoLayerHtml:renderMyPlantsPersonalPhotoLayer(renderModel,signedUrlsByPlantId),
      signedUrlsByPlantId,
      mediaErrorsByPlantId,
      visualAcceptance:'LOCKED_IMPLEMENTED',
    });
  }

  return Object.freeze({load});
}
