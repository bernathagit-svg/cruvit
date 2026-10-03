import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGroup2ScreenState,
  assertGroup2UsesCanonicalIdentity,
  GROUP2_SCREEN_IDS,
} from '../modules/my-garden-v2/group2-screen-controller.js';

const plants = [
  { id:'p1', name:'Lemon tree', archived:false },
  { id:'p2', name:'Rose', archived:false },
];

const tasks = [
  { id:'t1', garden_plant_id:'p1', title:'Fertilize', due_on:'2026-10-01', done:false },
  { id:'t2', garden_plant_id:'p2', title:'Check leaves', due_on:'2026-10-02', done:false },
];

const events = [
  {
    id:'e1',
    garden_plant_id:'p1',
    event_type:'care_logged',
    occurred_at:'2026-10-02T09:00:00Z',
    payload:{title:'Watered',note:'Soil was slightly dry.'},
  },
];

test('Group 2 contains exactly the four remaining approved screens', () => {
  assert.deepEqual(
    [...GROUP2_SCREEN_IDS].sort(),
    ['garden-journal','notifications','upcoming-calendar','upcoming-list'].sort()
  );
});

test('Upcoming List state remains Task-based and owner-approved', () => {
  const state = buildGroup2ScreenState({
    screenId:'upcoming-list',
    plants,
    tasks,
    today:'2026-10-02',
  });
  assert.deepEqual(state.viewModel.rows.map((x)=>x.id),['t1','t2']);
  assert.equal(state.ownerApproved,true);
  assert.equal(state.implementationState,'AWAITING_SCREENSHOT_COMPARISON');
  assert.equal(assertGroup2UsesCanonicalIdentity(state),true);
});

test('Upcoming Calendar uses the same canonical task identities', () => {
  const state = buildGroup2ScreenState({
    screenId:'upcoming-calendar',
    plants,
    tasks,
    selectedMonth:'2026-10',
    selectedDate:'2026-10-02',
  });
  assert.deepEqual(state.viewModel.rows.map((x)=>x.id),['t1','t2']);
  assert.deepEqual(state.viewModel.selectedDayRows.map((x)=>x.id),['t2']);
  assert.equal(assertGroup2UsesCanonicalIdentity(state),true);
});

test('Notifications is a subset of the same Task IDs', () => {
  const state = buildGroup2ScreenState({
    screenId:'notifications',
    plants,
    tasks,
    today:'2026-10-02',
  });
  assert.deepEqual(state.renderModel.rows.map((x)=>x.taskId),['t1','t2']);
  assert.equal(assertGroup2UsesCanonicalIdentity(state),true);
});

test('Garden Journal uses Event IDs and no duplicate store', () => {
  const state = buildGroup2ScreenState({
    screenId:'garden-journal',
    plants,
    events,
  });
  assert.deepEqual(state.renderModel.rows.map((x)=>x.eventId),['e1']);
  assert.equal(assertGroup2UsesCanonicalIdentity(state),true);
});

test('unknown Group 2 screen fails loudly', () => {
  assert.throws(
    () => buildGroup2ScreenState({screenId:'my-plants'}),
    /unknown_group2_screen/
  );
});
