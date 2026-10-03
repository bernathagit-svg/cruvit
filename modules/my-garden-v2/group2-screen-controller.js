import {
  buildUpcomingListScreenViewModel,
  buildUpcomingCalendarScreenViewModel,
  buildNotificationsScreenViewModel,
} from './task-screen-view-models.js';
import {
  buildGardenJournalScreenViewModel,
} from './event-screen-view-models.js';
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

const GROUP2 = Object.freeze([
  'upcoming-list',
  'upcoming-calendar',
  'garden-journal',
  'notifications',
]);

function requireScreen(id) {
  if (!GROUP2.includes(id)) throw new Error('unknown_group2_screen:' + String(id ?? ''));
  return id;
}

export function buildGroup2ScreenState({
  screenId,
  plants = [],
  tasks = [],
  events = [],
  today,
  selectedMonth,
  selectedDate,
  filter,
  plantId = null,
  query = '',
  eventType = 'all',
  scope = 'all',
  plantVisuals = {},
} = {}) {
  const id = requireScreen(screenId);

  if (id === 'upcoming-list') {
    const viewModel = buildUpcomingListScreenViewModel({
      plants,
      tasks,
      filter: filter ?? 'to_do',
      plantId,
    });

    const html = renderUpcomingListScreen(viewModel, {
      plantVisuals,
      activePlantCount: plants.filter((p) => p?.archived !== true).length,
      selectedDate: selectedDate ?? today ?? null,
    });

    return Object.freeze({
      screenId: id,
      viewModel,
      html,
      visualReference: UPCOMING_APPROVED_VISUAL.list,
      ownerApproved: true,
      implementationState: 'AWAITING_SCREENSHOT_COMPARISON',
    });
  }

  if (id === 'upcoming-calendar') {
    const viewModel = buildUpcomingCalendarScreenViewModel({
      plants,
      tasks,
      selectedMonth,
      selectedDate,
      filter: filter ?? 'to_do',
      plantId,
    });

    const html = renderUpcomingCalendarScreen(viewModel, {
      plantVisuals,
      activePlantCount: plants.filter((p) => p?.archived !== true).length,
    });

    return Object.freeze({
      screenId: id,
      viewModel,
      html,
      visualReference: UPCOMING_APPROVED_VISUAL.calendar,
      ownerApproved: true,
      implementationState: 'AWAITING_SCREENSHOT_COMPARISON',
    });
  }

  if (id === 'garden-journal') {
    const viewModel = buildGardenJournalScreenViewModel({
      plants,
      events,
      query,
      plantId,
      eventType,
      scope,
    });
    const renderModel = buildApprovedGardenJournalRenderModel(viewModel);
    assertGardenJournalVisualAcceptanceReady(renderModel);

    return Object.freeze({
      screenId: id,
      viewModel,
      renderModel,
      interactionLayerHtml: renderGardenJournalInteractionLayer(renderModel),
      visualReference: GARDEN_JOURNAL_APPROVED_VISUAL,
      ownerApproved: true,
      implementationState: 'AWAITING_SCREENSHOT_COMPARISON',
    });
  }

  const viewModel = buildNotificationsScreenViewModel({
    plants,
    tasks,
    today,
    plantId,
    filter: filter ?? 'attention',
  });
  const renderModel = buildApprovedNotificationsRenderModel(viewModel);
  assertNotificationsVisualAcceptanceReady(renderModel);

  return Object.freeze({
    screenId: id,
    viewModel,
    renderModel,
    interactionLayerHtml: renderNotificationsInteractionLayer(renderModel),
    visualReference: NOTIFICATIONS_APPROVED_VISUAL,
    ownerApproved: true,
    implementationState: 'AWAITING_SCREENSHOT_COMPARISON',
  });
}

export function assertGroup2UsesCanonicalIdentity(state) {
  requireScreen(state?.screenId);

  if (state.screenId.startsWith('upcoming')) {
    const ids = state.viewModel.rows.map((row) => row.id);
    if (ids.length !== new Set(ids).size) throw new Error('duplicate_group2_task_id');
    return true;
  }

  if (state.screenId === 'notifications') {
    const ids = state.renderModel.rows.map((row) => row.taskId);
    if (ids.length !== new Set(ids).size) throw new Error('duplicate_group2_notification_task_id');
    return true;
  }

  const ids = state.renderModel.rows.map((row) => row.eventId);
  if (ids.length !== new Set(ids).size) throw new Error('duplicate_group2_event_id');
  return true;
}

export const GROUP2_SCREEN_IDS = GROUP2;
