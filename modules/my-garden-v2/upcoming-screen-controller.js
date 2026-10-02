import { createMyGardenReadRepository } from './supabase-read-repository.js';
import { createGardenMediaUrlResolver } from './garden-media-url-resolver.js';
import { activePlants } from './read-model.js';
import {
  buildUpcomingListScreenViewModel,
  buildUpcomingCalendarScreenViewModel,
  assertUpcomingListCalendarTotalsMatch,
} from './task-screen-view-models.js';
import {
  renderUpcomingListScreen,
  renderUpcomingCalendarScreen,
  UPCOMING_APPROVED_VISUAL,
} from './approved-upcoming-renderer.js';

function coverByPlantId(plants) {
  const map=new Map();
  for(const plant of plants || []) map.set(plant.id,plant);
  return map;
}

async function resolvePlantVisuals({
  plants,
  mediaResolver,
  systemPlantVisualResolver,
}) {
  const visuals={};
  const errors={};

  for(const plant of activePlants(plants)) {
    const cover=plant.cover ?? null;
    if (cover?.kind==='personal') {
      try {
        const resolved=await mediaResolver.resolveCover(cover);
        if (resolved?.signedUrl) visuals[plant.id]=resolved.signedUrl;
      } catch (error) {
        errors[plant.id]=String(error?.message || error);
      }
      continue;
    }

    if (typeof systemPlantVisualResolver==='function') {
      try {
        const url=await systemPlantVisualResolver(plant);
        if (url) visuals[plant.id]=url;
      } catch (error) {
        errors[plant.id]=String(error?.message || error);
      }
    }
  }

  return Object.freeze({
    visuals:Object.freeze({...visuals}),
    errors:Object.freeze({...errors}),
  });
}

export function createUpcomingScreenController(
  supabase,
  {
    signedUrlTtl=300,
    systemPlantVisualResolver=null,
  }={}
) {
  const repository=createMyGardenReadRepository(supabase);
  const mediaResolver=createGardenMediaUrlResolver(supabase,{expiresIn:signedUrlTtl});

  async function loadPair(gardenProfileId,{
    selectedMonth,
    selectedDate,
    filter='to_do',
    plantId=null,
  }={}) {
    const snapshot=await repository.loadGardenSnapshot(gardenProfileId);
    const active=activePlants(snapshot.plants);

    // Project plant cover information once for thumbnails.
    const plantRows=active.map((plant)=>{
      const media=snapshot.media.find((row)=>row.id===plant.cover_media_id) ?? null;
      let cover={kind:'system',systemImageKey:plant.profile_slug ?? plant.scientific ?? null};
      if (
        media &&
        media.garden_plant_id===plant.id &&
        media.validation_state==='validated' &&
        ['plant_profile','progress_photo'].includes(media.purpose)
      ) {
        cover={
          kind:'personal',
          personalMediaId:media.id,
          storageBucket:media.storage_bucket,
          storagePath:media.storage_path,
          systemImageKey:plant.profile_slug ?? plant.scientific ?? null,
        };
      }
      return {...plant,cover};
    });

    const list=buildUpcomingListScreenViewModel({
      plants:snapshot.plants,
      tasks:snapshot.tasks,
      filter,
      plantId,
    });

    const calendar=buildUpcomingCalendarScreenViewModel({
      plants:snapshot.plants,
      tasks:snapshot.tasks,
      selectedMonth,
      selectedDate,
      filter,
      plantId,
    });

    assertUpcomingListCalendarTotalsMatch({list,calendar});

    const visualResult=await resolvePlantVisuals({
      plants:plantRows,
      mediaResolver,
      systemPlantVisualResolver,
    });

    const renderOptions={
      plantVisuals:visualResult.visuals,
      activePlantCount:active.length,
    };

    return Object.freeze({
      garden:snapshot.profile,
      activePlantCount:active.length,
      listViewModel:list,
      calendarViewModel:calendar,
      listHtml:renderUpcomingListScreen(list,{
        ...renderOptions,
        selectedDate,
      }),
      calendarHtml:renderUpcomingCalendarScreen(calendar,renderOptions),
      plantVisuals:visualResult.visuals,
      plantVisualErrors:visualResult.errors,
      references:UPCOMING_APPROVED_VISUAL,
      visualAcceptance:'pending_screenshot_comparison',
    });
  }

  return Object.freeze({loadPair});
}
