import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildApprovedGardenJournalRenderModel,
  assertGardenJournalVisualAcceptanceReady,
} from '../modules/my-garden-v2/approved-garden-journal-renderer.js';
import {
  buildApprovedNotificationsRenderModel,
  assertNotificationsVisualAcceptanceReady,
} from '../modules/my-garden-v2/approved-notifications-renderer.js';
import {
  buildGardenJournalScreenState,
  buildNotificationsScreenState,
} from '../modules/my-garden-v2/journal-notifications-screen-controllers.js';

const plants=[
  {id:'p1',name:'Lemon tree',archived:false},
  {id:'p2',name:'Rose',archived:false},
];

const events=[
  {id:'e1',garden_plant_id:'p1',event_type:'care_logged',occurred_at:'2026-10-02T09:00:00Z',payload:{title:'Watered',note:'Soil was slightly dry.'}},
  {id:'e2',garden_plant_id:'p2',event_type:'note_added',occurred_at:'2026-10-01T09:00:00Z',payload:{title:'Note added',note:'Full sun.'}},
];

const tasks=[
  {id:'t1',garden_plant_id:'p1',title:'Fertilize',due_on:'2026-10-01',done:false},
  {id:'t2',garden_plant_id:'p2',title:'Check leaves',due_on:'2026-10-02',done:false},
];

test('Garden Journal render model preserves canonical event IDs',()=>{
  const state=buildGardenJournalScreenState({plants,events});
  assert.deepEqual(state.renderModel.rows.map((x)=>x.eventId),['e1','e2']);
  assert.equal(state.renderModel.resultCount,2);
  assert.equal(assertGardenJournalVisualAcceptanceReady(state.renderModel),true);
  assert.match(state.interactionLayerHtml,/data-event-id="e1"/);
});

test('Garden Journal duplicate events fail before visual layer',()=>{
  assert.throws(
    ()=>buildApprovedGardenJournalRenderModel({
      rows:[{id:'e1'},{id:'e1'}],
      groups:[],
    }),
    /duplicate_journal_event/
  );
});

test('Notifications render model derives approved counts from same tasks',()=>{
  const state=buildNotificationsScreenState({
    plants,tasks,today:'2026-10-02',
  });
  assert.deepEqual(state.renderModel.counts,{
    attention:2,
    today:1,
    overdue:1,
    plants:2,
  });
  assert.deepEqual(state.renderModel.overdue.map((x)=>x.taskId),['t1']);
  assert.deepEqual(state.renderModel.dueToday.map((x)=>x.taskId),['t2']);
  assert.equal(assertNotificationsVisualAcceptanceReady(state.renderModel),true);
});

test('Notification actions keep exact task and plant identity',()=>{
  const state=buildNotificationsScreenState({
    plants,tasks,today:'2026-10-02',
  });
  const row=state.renderModel.rows.find((x)=>x.taskId==='t1');
  assert.equal(row.actions.markDone.taskId,'t1');
  assert.equal(row.actions.openPlant.plantId,'p1');
  assert.match(state.interactionLayerHtml,/data-task-id="t1"/);
  assert.match(state.interactionLayerHtml,/data-plant-id="p1"/);
});
