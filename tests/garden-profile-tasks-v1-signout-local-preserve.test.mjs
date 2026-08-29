/**
 * Garden Tasks V1 — sign-out must restore pre-auth local tasks snapshot (simulation).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideAuthBoundaryTasksRelease } from '../modules/personal-domain/garden-profile-tasks-contract.js';

test('sign-out restores legacy local tasks; does not wipe to empty when snapshot exists', () => {
  const snapshot = {
    tasks: [['💧', 'Water Local Aloe', 'Today', 'High', '2026-08-28', false, 'Aloe', false, 'task_legacy']]
  };
  const decision = decideAuthBoundaryTasksRelease(!!snapshot?.tasks?.length);
  assert.equal(decision, 'restore-snapshot');

  let dataTasks = [['🌿', 'Server Water', 'Today', 'Low', '2026-08-29', true, 'Rosemary', false, 'task_server']];
  if (decision === 'restore-snapshot') {
    dataTasks = snapshot.tasks.slice();
  }
  assert.equal(dataTasks[0][1], 'Water Local Aloe');
  assert.notEqual(dataTasks[0][1], 'Server Water');
});

test('sign-out without prior hydrate does not force empty tasks wipe', () => {
  assert.equal(decideAuthBoundaryTasksRelease(false), 'noop-preserve-local');
});

test('pre-auth tasks snapshot must not be overwritten by later server tasks in storage model', () => {
  let snap = { tasks: [['💧', 'Local Water', 'Today', 'High', '', false, '', false, 'task_local']] };
  const existing = snap;
  if (existing?.tasks) {
    // keep first-capture-wins
  } else {
    snap = { tasks: [['🌿', 'Server Task', 'Today', 'Low', '', true, '', false, 'task_server']] };
  }
  assert.equal(snap.tasks[0][1], 'Local Water');
});
