import { createMyGardenReadRepository } from './supabase-read-repository.js';
import { createGardenMediaUrlResolver } from './garden-media-url-resolver.js';
import { buildMyPlantsViewModel } from './my-plants-view-model.js';
import { buildPlantScheduleProjection } from './task-projection.js';
import {
  buildUpcomingListScreenViewModel,
  buildUpcomingCalendarScreenViewModel,
  buildNotificationsScreenViewModel,
  assertTaskScreenIdentity,
  assertUpcomingListCalendarTotalsMatch,
} from './task-screen-view-models.js';
import { buildGardenJournalScreenViewModel } from './event-screen-view-models.js';
import {
  renderUpcomingListScreen,
  renderUpcomingCalendarScreen,
  UPCOMING_APPROVED_VISUAL,
} from './approved-upcoming-renderer.js';
import {
  buildApprovedGardenJournalRenderModel,
  renderGardenJournalInteractionLayer,
  assertGardenJournalVisualAcceptanceReady,
  GARDEN_JOURNAL_APPROVED_VISUAL,
} from './approved-garden-journal-renderer.js';
import {
  buildApprovedNotificationsRenderModel,
  renderNotificationsInteractionLayer,
  assertNotificationsVisualAcceptanceReady,
  NOTIFICATIONS_APPROVED_VISUAL,
} from './approved-notifications-renderer.js';

async function resolvePlantVisuals(snapshot,mediaResolver,systemPlantVisualResolver) {
  const vm=buildMyPlantsViewModel({
    plants:snapshot.plants,
    areas:snapshot.areas,
    media:snapshot.media,
  });

  const visuals={};
  const errors={};

  for(const card of vm.cards) {
    if(card.cover?.kind==='personal') {
      try {
        const resolved=await mediaResolver.resolveCover(card.cover);
        if(resolved?.signedUrl) visuals[card.id]=resolved.signedUrl;
      } catch(error) {
        errors[card.id]=String(error?.message || error);
      }
      continue;
    }

    if(typeof systemPlantVisualResolver==='function') {
      try {
        const url=await systemPlantVisualResolver(card);
        if(url) visuals[card.id]=url;
      } catch(error) {
        errors[card.id]=String(error?.message || error);
      }
    }
  }

  return Object.freeze({
    visuals:Object.freeze({...visuals}),
    errors:Object.freeze({...errors}),
    activePlantCount:vm.activeCount,
  });
}

export function createMyGardenGroup2ScreenController(
  supabase,
  {
    signedUrlTtl=300,
    systemPlantVisualResolver=null,
  }={}
) {
  const repo=createMyGardenReadRepository(supabase);
  const mediaResolver=createGardenMediaUrlResolver(supabase,{expiresIn:signedUrlTtl});

  async function loadSnapshot(gardenProfileId) {
    return repo.loadGardenSnapshot(gardenProfileId);
  }

  async function renderUpcomingListFromSnapshot(snapshot,{
    filter='to_do',
    plantId=null,
    selectedDate=null,
  }={}) {
    const vm=buildUpcomingListScreenViewModel({
      plants:snapshot.plants,
      tasks:snapshot.tasks,
      filter,
      plantId,
    });
    const plantVisualState=await resolvePlantVisuals(snapshot,mediaResolver,systemPlantVisualResolver);

    return Object.freeze({
      garden:snapshot.profile,
      viewModel:vm,
      plantVisuals:plantVisualState.visuals,
      plantVisualErrors:plantVisualState.errors,
      html:renderUpcomingListScreen(vm,{
        activePlantCount:plantVisualState.activePlantCount,
        selectedDate,
        plantVisuals:plantVisualState.visuals,
      }),
      reference:UPCOMING_APPROVED_VISUAL.list,
      visualAcceptance:'APPROVED_VISUAL_PENDING_COMPARISON',
    });
  }

  async function renderUpcomingCalendarFromSnapshot(snapshot,{
    filter='to_do',
    plantId=null,
    selectedMonth,
    selectedDate,
  }={}) {
    const vm=buildUpcomingCalendarScreenViewModel({
      plants:snapshot.plants,
      tasks:snapshot.tasks,
      filter,
      plantId,
      selectedMonth,
      selectedDate,
    });
    const plantVisualState=await resolvePlantVisuals(snapshot,mediaResolver,systemPlantVisualResolver);

    return Object.freeze({
      garden:snapshot.profile,
      viewModel:vm,
      plantVisuals:plantVisualState.visuals,
      plantVisualErrors:plantVisualState.errors,
      html:renderUpcomingCalendarScreen(vm,{
        activePlantCount:plantVisualState.activePlantCount,
        plantVisuals:plantVisualState.visuals,
      }),
      reference:UPCOMING_APPROVED_VISUAL.calendar,
      visualAcceptance:'APPROVED_VISUAL_PENDING_COMPARISON',
    });
  }

  async function loadUpcomingList(gardenProfileId,options={}) {
    const snapshot=await loadSnapshot(gardenProfileId);
    return renderUpcomingListFromSnapshot(snapshot,options);
  }

  async function loadUpcomingCalendar(gardenProfileId,options={}) {
    const snapshot=await loadSnapshot(gardenProfileId);
    return renderUpcomingCalendarFromSnapshot(snapshot,options);
  }

  async function loadUpcomingPair(gardenProfileId,{
    filter='to_do',
    plantId=null,
    selectedMonth,
    selectedDate,
  }={}) {
    const snapshot=await loadSnapshot(gardenProfileId);
    const list=await renderUpcomingListFromSnapshot(snapshot,{
      filter,plantId,selectedDate,
    });
    const calendar=await renderUpcomingCalendarFromSnapshot(snapshot,{
      filter,plantId,selectedMonth,selectedDate,
    });

    assertUpcomingListCalendarTotalsMatch({
      list:list.viewModel,
      calendar:calendar.viewModel,
    });

    return Object.freeze({
      garden:snapshot.profile,
      list,
      calendar,
    });
  }

  async function loadGardenJournal(gardenProfileId, {
    query='',
    plantId=null,
    eventType='all',
    scope='all',
  }={}) {
    const snapshot=await loadSnapshot(gardenProfileId);
    const vm=buildGardenJournalScreenViewModel({
      plants:snapshot.plants,
      events:snapshot.events,
      query,
      plantId,
      eventType,
      scope,
    });
    const renderModel=buildApprovedGardenJournalRenderModel(vm);
    assertGardenJournalVisualAcceptanceReady(renderModel);

    return Object.freeze({
      garden:snapshot.profile,
      viewModel:vm,
      renderModel,
      interactionLayerHtml:renderGardenJournalInteractionLayer(renderModel),
      reference:GARDEN_JOURNAL_APPROVED_VISUAL,
      visualAcceptance:'APPROVED_VISUAL_PENDING_COMPARISON',
    });
  }

  async function loadNotifications(gardenProfileId, {
    today,
    plantId=null,
    filter='attention',
  }={}) {
    const snapshot=await loadSnapshot(gardenProfileId);
    const vm=buildNotificationsScreenViewModel({
      plants:snapshot.plants,
      tasks:snapshot.tasks,
      today,
      plantId,
      filter,
    });
    const renderModel=buildApprovedNotificationsRenderModel(vm);
    assertNotificationsVisualAcceptanceReady(renderModel);

    return Object.freeze({
      garden:snapshot.profile,
      viewModel:vm,
      renderModel,
      interactionLayerHtml:renderNotificationsInteractionLayer(renderModel),
      reference:NOTIFICATIONS_APPROVED_VISUAL,
      visualAcceptance:'APPROVED_VISUAL_PENDING_COMPARISON',
    });
  }

  async function assertTaskViews(gardenProfileId, {
    plantId,
    today,
    selectedMonth,
    selectedDate,
  }={}) {
    const snapshot=await loadSnapshot(gardenProfileId);

    const schedule=buildPlantScheduleProjection({
      plantId,
      plants:snapshot.plants,
      tasks:snapshot.tasks,
    });
    const upcoming=buildUpcomingListScreenViewModel({
      plants:snapshot.plants,
      tasks:snapshot.tasks,
      filter:'all',
    });
    const calendar=buildUpcomingCalendarScreenViewModel({
      plants:snapshot.plants,
      tasks:snapshot.tasks,
      filter:'all',
      selectedMonth,
      selectedDate,
    });
    const notifications=buildNotificationsScreenViewModel({
      plants:snapshot.plants,
      tasks:snapshot.tasks,
      today,
    });

    return assertTaskScreenIdentity({
      schedule,
      upcoming,
      calendar,
      notifications,
    });
  }

  return Object.freeze({
    loadUpcomingList,
    loadUpcomingCalendar,
    loadUpcomingPair,
    loadGardenJournal,
    loadNotifications,
    assertTaskViews,
  });
}
