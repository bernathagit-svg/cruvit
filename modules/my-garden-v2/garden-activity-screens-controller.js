import { createMyGardenReadRepository } from './supabase-read-repository.js';
import {
  buildGardenJournalScreenState,
  buildNotificationsScreenState,
} from './journal-notifications-screen-controllers.js';

export function createGardenActivityScreensController(supabase) {
  const repository=createMyGardenReadRepository(supabase);

  async function loadJournal(gardenProfileId,{
    query='',
    plantId=null,
    eventType='all',
    scope='all',
  }={}) {
    const snapshot=await repository.loadGardenSnapshot(gardenProfileId);
    const state=buildGardenJournalScreenState({
      plants:snapshot.plants,
      events:snapshot.events,
      query,
      plantId,
      eventType,
      scope,
    });

    return Object.freeze({
      garden:snapshot.profile,
      ...state,
      visualAcceptance:'pending_screenshot_comparison',
    });
  }

  async function loadNotifications(gardenProfileId,{
    today,
    plantId=null,
    filter='attention',
  }={}) {
    const snapshot=await repository.loadGardenSnapshot(gardenProfileId);
    const state=buildNotificationsScreenState({
      plants:snapshot.plants,
      tasks:snapshot.tasks,
      today,
      plantId,
      filter,
    });

    return Object.freeze({
      garden:snapshot.profile,
      ...state,
      visualAcceptance:'pending_screenshot_comparison',
    });
  }

  return Object.freeze({
    loadJournal,
    loadNotifications,
  });
}
