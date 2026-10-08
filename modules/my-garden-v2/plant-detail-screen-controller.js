import { createMyGardenReadRepository } from './supabase-read-repository.js';
import { createPlantOverviewDataAdapter } from './plant-overview-data-adapter.js';
import { createGardenMediaUrlResolver } from './garden-media-url-resolver.js';
import { buildPlantCareViewModel } from './plant-care-view-model.js';
import { buildPlantScheduleScreenViewModel } from './task-screen-view-models.js';
import { buildPlantHistoryScreenViewModel } from './event-screen-view-models.js';
import {
  buildPlantDetailRenderContract,
  renderPlantDetailPersonalPhotoLayer,
  renderPlantDetailPhotoInteractionLayer,
  assertPlantDetailVisualReference,
} from './approved-plant-detail-renderer.js';

const TABS=new Set(['overview','care','schedule','history']);

export function createPlantDetailScreenController(supabase,{signedUrlTtl=300}={}) {
  const gardenRepo=createMyGardenReadRepository(supabase);
  const overviewAdapter=createPlantOverviewDataAdapter(supabase);
  const mediaResolver=createGardenMediaUrlResolver(supabase,{expiresIn:signedUrlTtl});

  async function buildTabViewModel(gardenProfileId,plantId,tab,options){
    if(tab==='overview'){
      const result=await overviewAdapter.loadOverview(gardenProfileId,plantId,options);
      return {garden:result.garden,viewModel:result.viewModel,knowledgeResolution:result.knowledgeResolution};
    }

    const snapshot=await gardenRepo.loadGardenSnapshot(gardenProfileId);

    if(tab==='care'){
      return {
        garden:snapshot.profile,
        viewModel:buildPlantCareViewModel({
          plantId,
          plants:snapshot.plants,
          areas:snapshot.areas,
          media:snapshot.media,
          tasks:snapshot.tasks,
          careGuidance:options.careGuidance ?? null,
          locationReliability:options.locationReliability ?? 'unknown',
        }),
      };
    }

    if(tab==='schedule'){
      return {
        garden:snapshot.profile,
        viewModel:buildPlantScheduleScreenViewModel({
          plantId,
          plants:snapshot.plants,
          areas:snapshot.areas,
          media:snapshot.media,
          tasks:snapshot.tasks,
          selectedDate:options.selectedDate,
          selectedMonth:options.selectedMonth,
          filter:options.filter ?? 'all',
        }),
      };
    }

    return {
      garden:snapshot.profile,
      viewModel:buildPlantHistoryScreenViewModel({
        plantId,
        plants:snapshot.plants,
        areas:snapshot.areas,
        media:snapshot.media,
        events:snapshot.events,
        query:options.query ?? '',
        eventType:options.eventType ?? 'all',
      }),
    };
  }

  async function load(gardenProfileId,plantId,{tab='overview',...options}={}){
    if(!TABS.has(tab)) throw new Error('invalid_plant_detail_tab:'+tab);

    const data=await buildTabViewModel(gardenProfileId,plantId,tab,options);
    const renderContract=buildPlantDetailRenderContract(data.viewModel);
    assertPlantDetailVisualReference(renderContract);

    let signedMedia=null;
    let mediaError=null;
    if(renderContract.cover?.kind==='personal'){
      try{
        signedMedia=await mediaResolver.resolveCover(renderContract.cover);
      }catch(error){
        mediaError=String(error?.message || error);
      }
    }

    return Object.freeze({
      garden:data.garden,
      viewModel:data.viewModel,
      renderContract,
      knowledgeResolution:data.knowledgeResolution ?? null,
      personalPhotoLayerHtml:renderPlantDetailPersonalPhotoLayer(renderContract,signedMedia),
      photoInteractionLayerHtml:renderPlantDetailPhotoInteractionLayer(renderContract),
      signedMedia,
      mediaError,
      visualAcceptance:'LOCKED_IMPLEMENTED',
    });
  }

  return Object.freeze({load});
}
