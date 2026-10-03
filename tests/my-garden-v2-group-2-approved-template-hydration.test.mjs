import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGardenJournalHydrationPlan,
  buildNotificationsHydrationPlan,
  assertHydrationDoesNotTouchFrozenVisual,
  GROUP2_APPROVED_TEMPLATE_CONTRACT,
} from '../modules/my-garden-v2/group-2-approved-template-hydration.js';

const journal={
  resultCount:2,
  scope:'all',
  eventType:'all',
  plantId:null,
  rows:[
    {eventId:'e1',plantId:'p1',title:'Watered',note:'Soil dry',plantName:'Lemon',eventType:'care_logged',occurredAt:'2026-10-02T09:00:00Z',mediaId:null},
    {eventId:'e2',plantId:'p2',title:'Note added',note:'Full sun',plantName:'Rose',eventType:'note_added',occurredAt:'2026-10-01T09:00:00Z',mediaId:null},
  ],
  visualReference:{id:'garden-journal'},
};

const notifications={
  counts:{attention:3,today:2,overdue:1,plants:2},
  overdue:[
    {taskId:'t1',plantId:'p1',plantName:'Lemon',title:'Fertilize',dueOn:'2026-10-01',state:'overdue',priority:'Medium',taskType:'care'},
  ],
  dueToday:[
    {taskId:'t2',plantId:'p1',plantName:'Lemon',title:'Water',dueOn:'2026-10-02',state:'today',priority:'Low',taskType:'care'},
    {taskId:'t3',plantId:'p2',plantName:'Rose',title:'Check leaves',dueOn:'2026-10-02',state:'today',priority:'High',taskType:'health'},
  ],
  visualReference:{id:'notifications'},
};

test('Journal hydration changes data-bearing selectors only',()=>{
  const plan=buildGardenJournalHydrationPlan(journal);
  assert.equal(plan.screenId,'garden-journal');
  assert.equal(plan.entries.length,2);
  assert.equal(plan.patches.find((x)=>x.selector==='.result-line span:first-child').value,'2 entries');
  assert.equal(assertHydrationDoesNotTouchFrozenVisual(plan),true);
});

test('Notifications hydration derives every approved summary count',()=>{
  const plan=buildNotificationsHydrationPlan(notifications);
  const values=new Map(plan.patches.map((x)=>[x.selector,x.value]));
  assert.equal(values.get('.summary .stat.green b'),'3');
  assert.equal(values.get('.summary .stat.amber b'),'2');
  assert.equal(values.get('.summary .stat.red b'),'1');
  assert.equal(values.get('.count'),'3 notifications shown');
  assert.equal(plan.overdue[0].taskId,'t1');
  assert.deepEqual(plan.dueToday.map((x)=>x.taskId),['t2','t3']);
  assert.equal(assertHydrationDoesNotTouchFrozenVisual(plan),true);
});

test('template contract freezes bottom navigation and design primitives',()=>{
  for(const template of Object.values(GROUP2_APPROVED_TEMPLATE_CONTRACT)){
    assert.equal(template.immutable.includes('bottom-navigation'),true);
    assert.equal(template.immutable.includes('css'),true);
    assert.equal(template.immutable.includes('spacing'),true);
    assert.equal(template.immutable.includes('typography'),true);
  }
});

test('hydration guard rejects direct frozen visual selectors',()=>{
  assert.throws(
    ()=>assertHydrationDoesNotTouchFrozenVisual({
      screenId:'notifications',
      patches:[{selector:'.bottom .nav',value:'x'}],
    }),
    /hydration_selector_not_whitelisted/
  );
});
