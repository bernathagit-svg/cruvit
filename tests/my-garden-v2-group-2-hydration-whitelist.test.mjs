import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGardenJournalHydrationPlan,
  buildNotificationsHydrationPlan,
  assertHydrationDoesNotTouchFrozenVisual,
} from '../modules/my-garden-v2/group-2-approved-template-hydration.js';

test('Journal hydration accepts only its declared mutable selectors',()=>{
  const plan=buildGardenJournalHydrationPlan({
    visualReference:{id:'garden-journal'},
    resultCount:2,
    scope:'all',
    eventType:'all',
    plantId:null,
    rows:[],
  });
  assert.equal(assertHydrationDoesNotTouchFrozenVisual(plan),true);
});

test('Notifications hydration accepts only its declared mutable selectors',()=>{
  const plan=buildNotificationsHydrationPlan({
    visualReference:{id:'notifications'},
    counts:{attention:2,today:1,overdue:1,plants:2},
    overdue:[],
    dueToday:[],
  });
  assert.equal(assertHydrationDoesNotTouchFrozenVisual(plan),true);
});

test('Journal hydration cannot touch bottom navigation even with a plausible selector',()=>{
  assert.throws(
    ()=>assertHydrationDoesNotTouchFrozenVisual({
      screenId:'garden-journal',
      patches:[{selector:'.bottom-nav small',kind:'text',value:'Changed'}],
    }),
    /hydration_selector_not_whitelisted/
  );
});

test('Notifications hydration cannot touch hero or arbitrary content selectors',()=>{
  for(const selector of ['.hero h1','.phone','.content h2','.nav button']){
    assert.throws(
      ()=>assertHydrationDoesNotTouchFrozenVisual({
        screenId:'notifications',
        patches:[{selector,kind:'text',value:'Changed'}],
      }),
      /hydration_selector_not_whitelisted/
    );
  }
});

test('unknown hydration screen fails closed',()=>{
  assert.throws(
    ()=>assertHydrationDoesNotTouchFrozenVisual({
      screenId:'other-screen',
      patches:[],
    }),
    /unknown_hydration_screen/
  );
});
