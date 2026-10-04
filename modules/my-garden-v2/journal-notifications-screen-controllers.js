import {
  buildGardenJournalScreenViewModel,
} from './event-screen-view-models.js';
import {
  buildApprovedGardenJournalRenderModel,
  renderGardenJournalInteractionLayer,
  assertGardenJournalVisualAcceptanceReady,
} from './approved-garden-journal-renderer.js';
import {
  buildNotificationsScreenViewModel,
} from './task-screen-view-models.js';
import {
  buildApprovedNotificationsRenderModel,
  renderNotificationsInteractionLayer,
  assertNotificationsVisualAcceptanceReady,
} from './approved-notifications-renderer.js';

export function buildGardenJournalScreenState({
  plants=[],
  events=[],
  query='',
  plantId=null,
  eventType='all',
  scope='all',
}={}) {
  const viewModel=buildGardenJournalScreenViewModel({
    plants, events, query, plantId, eventType, scope,
  });
  const renderModel=buildApprovedGardenJournalRenderModel(viewModel);
  assertGardenJournalVisualAcceptanceReady(renderModel);
  return Object.freeze({
    viewModel,
    renderModel,
    interactionLayerHtml:renderGardenJournalInteractionLayer(renderModel),
    visualAcceptance:'pending_screenshot_comparison',
  });
}

export function buildNotificationsScreenState({
  plants=[],
  tasks=[],
  today,
  plantId=null,
  filter='attention',
}={}) {
  const viewModel=buildNotificationsScreenViewModel({
    plants, tasks, today, plantId, filter,
  });
  const renderModel=buildApprovedNotificationsRenderModel(viewModel);
  assertNotificationsVisualAcceptanceReady(renderModel);
  return Object.freeze({
    viewModel,
    renderModel,
    interactionLayerHtml:renderNotificationsInteractionLayer(renderModel),
    visualAcceptance:'pending_screenshot_comparison',
  });
}
