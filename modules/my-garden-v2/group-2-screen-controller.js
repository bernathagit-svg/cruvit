import { createMyGardenReadRepository } from './supabase-read-repository.js';
import {
  buildUpcomingListScreenViewModel,
  buildUpcomingCalendarScreenViewModel,
  buildNotificationsScreenViewModel,
  assertTaskScreenIdentity,
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

export function createMyGardenGroup2ScreenController(supabase) {
  const repo=createMyGardenReadRepository(supabase);

  async function loadSnapshot(gardenProfileId) {
    return repo.loadGardenSnapshot(gardenProfileId);
  }

  async function loadUpcomingList(gardenProfileId, {
    filter='to_do',
    plantId=null,
    selectedDate=null,
  }={}) {
    const snapshot=await loadSnapshot(gardenProfileId);
    const vm=buildUpcomingListScreenViewModel({
      plants:snapshot.plants,
      tasks:snapshot.tasks,
      filter,
      plantId,
    });

    return Object.freeze({
      garden:snapshot.profile,
      viewModel:vm,
      html:renderUpcomingListScreen(vm,{
        activePlantCount:snapshot.plants.filter((p)=>p.archived!==true).length,
        selectedDate,
      }),
      reference:UPCOMING_APPROVED_VISUAL.list,
      visualAcceptance:'APPROVED_VISUAL_PENDING_COMPARISON',
    });
  }

  async function loadUpcomingCalendar(gardenProfileId, {
    filter='to_do',
    plantId=null,
    selectedMonth,
    selectedDate,
  }={}) {
    const snapshot=await loadSnapshot(gardenProfileId);
    const vm=buildUpcomingCalendarScreenViewModel({
      plants:snapshot.plants,
      tasks:snapshot.tasks,
      filter,
      plantId,
      selectedMonth,
      selectedDate,
    });

    return Object.freeze({
      garden:snapshot.profile,
      viewModel:vm,
      html:renderUpcomingCalendarScreen(vm,{
        activePlantCount:snapshot.plants.filter((p)=>p.archived!==true).length,
      }),
      reference:UPCOMING_APPROVED_VISUAL.calendar,
      visualAcceptance:'APPROVED_VISUAL_PENDING_COMPARISON',
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

    const schedule={
      rows:snapshot.tasks.filter((t)=>t.garden_plant_id===plantId),
    };
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
    loadGardenJournal,
    loadNotifications,
    assertTaskViews,
  });
}
