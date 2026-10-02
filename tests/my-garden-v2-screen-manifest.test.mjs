import test from 'node:test';
import assert from 'node:assert/strict';
import { MY_GARDEN_SCREENS, APPROVED_BEHAVIORS, screenById } from '../modules/my-garden-v2/screen-manifest.js';

const expected = [
  'my-garden-home','my-plants','plant-overview','plant-care','plant-schedule','plant-history',
  'add-plant','upcoming-list','upcoming-calendar','garden-journal','notifications'
];

test('all approved My Garden screens are present exactly once', () => {
  assert.deepEqual(MY_GARDEN_SCREENS.map(s=>s.id).sort(), expected.sort());
  assert.equal(new Set(MY_GARDEN_SCREENS.map(s=>s.id)).size, MY_GARDEN_SCREENS.length);
});

test('every approved screen is visually locked', () => {
  assert.equal(MY_GARDEN_SCREENS.every(s=>s.visualLock===true), true);
});

test('all persistent data dependencies use canonical Garden OS sources', () => {
  const allowed = new Set(['garden_profiles','garden_plants','garden_tasks','garden_events','garden_media']);
  for (const s of MY_GARDEN_SCREENS) for (const source of s.sources||[]) assert.equal(allowed.has(source), true, `${s.id}:${source}`);
});

test('shared bottom navigation remains deferred everywhere', () => {
  assert.equal(MY_GARDEN_SCREENS.every(s=>s.bottomNav==='deferred'), true);
  assert.equal(APPROVED_BEHAVIORS.bottomNavigation.visualChangeAllowed, false);
  assert.equal(APPROVED_BEHAVIORS.bottomNavigation.behaviorChangeAllowed, false);
});

test('personal photo remains plant-instance scoped and synced across approved views', () => {
  const p=APPROVED_BEHAVIORS.plantPersonalPhoto;
  assert.equal(p.instanceScoped,true);
  assert.equal(p.source,'garden_media');
  assert.equal(p.coverPointer,'garden_plants.cover_media_id');
  assert.deepEqual(p.visibleIn,['my-plants','plant-overview']);
  assert.equal(p.restoreSystemFallback,true);
  assert.equal(p.silentReplacement,false);
});

test('unknown screen lookup fails loudly', () => {
  assert.equal(screenById('plant-care').route,'plant/:plantId/care');
  assert.throws(()=>screenById('missing'),/unknown_my_garden_screen/);
});
