export const MY_GARDEN_SCREENS = Object.freeze([
  { id:'my-garden-home', route:'garden', visualLock:true, sources:['garden_profiles','garden_plants','garden_tasks'], notes:['garden_media'], bottomNav:'deferred' },
  { id:'my-plants', route:'plants', visualLock:true, sources:['garden_plants','garden_areas','garden_media'], bottomNav:'deferred' },
  { id:'plant-overview', route:'plant/:plantId/overview', visualLock:true, sources:['garden_plants','garden_areas','garden_media','garden_tasks','garden_events','catalog_plants'], derived:['plant-knowledge','plant-observation','phenology-projection'], bottomNav:'deferred' },
  { id:'plant-care', route:'plant/:plantId/care', visualLock:true, sources:['garden_plants','garden_areas','garden_tasks'], derived:['care-guidance'], bottomNav:'deferred' },
  { id:'plant-schedule', route:'plant/:plantId/schedule', visualLock:true, sources:['garden_tasks','garden_plants','garden_areas'], bottomNav:'deferred' },
  { id:'plant-history', route:'plant/:plantId/history', visualLock:true, sources:['garden_events','garden_plants','garden_areas','garden_media'], bottomNav:'deferred' },
  { id:'add-plant', route:'add-plant', visualLock:true, sources:['garden_plants','catalog_plants'], writesDeferred:true, bottomNav:'deferred' },
  { id:'upcoming-list', route:'upcoming/list', visualLock:true, sources:['garden_tasks','garden_plants'], bottomNav:'deferred' },
  { id:'upcoming-calendar', route:'upcoming/calendar', visualLock:true, sources:['garden_tasks','garden_plants'], bottomNav:'deferred' },
  { id:'garden-journal', route:'journal', visualLock:true, sources:['garden_events','garden_plants','garden_media'], bottomNav:'deferred' },
  { id:'notifications', route:'notifications', visualLock:true, sources:['garden_tasks','garden_plants'], derived:['attention-projection'], bottomNav:'deferred' },
]);

export const APPROVED_BEHAVIORS = Object.freeze({
  plantPersonalPhoto: {
    instanceScoped:true,
    source:'garden_media',
    coverPointer:'garden_plants.cover_media_id',
    visibleIn:['my-plants','plant-overview'],
    restoreSystemFallback:true,
    silentReplacement:false,
  },
  bottomNavigation: {
    status:'deferred',
    visualChangeAllowed:false,
    behaviorChangeAllowed:false,
  },
});

export function screenById(id) {
  const screen = MY_GARDEN_SCREENS.find((s) => s.id === id);
  if (!screen) throw new Error(`unknown_my_garden_screen:${id}`);
  return screen;
}
