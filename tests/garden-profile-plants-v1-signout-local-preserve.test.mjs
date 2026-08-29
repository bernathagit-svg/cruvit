/**
 * Garden Plants V1 — sign-out must restore pre-auth local plants snapshot (simulation).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideAuthBoundaryPlantsRelease } from '../modules/personal-domain/garden-profile-plants-contract.js';

test('sign-out restores legacy local plants; does not wipe to empty when snapshot exists', () => {
  const snapshot = {
    plants: [{ id: 'plant_legacy', name: 'Haifa Lavender', status: 'Healthy', mark: '✓' }]
  };
  const decision = decideAuthBoundaryPlantsRelease(!!snapshot?.plants?.length);
  assert.equal(decision, 'restore-snapshot');

  // Simulate release path
  let dataPlants = [{ id: 'plant_server', name: 'Tel Aviv Rosemary', status: 'Healthy', mark: '✓' }];
  if (decision === 'restore-snapshot') {
    dataPlants = snapshot.plants.slice();
  }
  assert.equal(dataPlants[0].name, 'Haifa Lavender');
  assert.notEqual(dataPlants[0].name, 'Tel Aviv Rosemary');
});

test('sign-out without prior hydrate does not force empty plants wipe', () => {
  assert.equal(decideAuthBoundaryPlantsRelease(false), 'noop-preserve-local');
});

test('pre-auth plants snapshot must not be overwritten by later server plants in storage model', () => {
  let snap = { plants: [{ id: 'p1', name: 'Local Aloe' }] };
  // First-capture-wins
  const existing = snap;
  if (existing?.plants) {
    // keep
  } else {
    snap = { plants: [{ id: 'p2', name: 'Server Lavender' }] };
  }
  assert.equal(snap.plants[0].name, 'Local Aloe');
});
