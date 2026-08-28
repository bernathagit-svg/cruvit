/**
 * Sign-out must not wipe legacy local garden location from localStorage,
 * and must not leave authenticated server hydrate as trusted local state.
 * Pure decision + simulated persistence model (no browser).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideAuthBoundaryLocationRelease } from '../modules/personal-domain/garden-profile-location-contract.js';

function simulateAuthHydrateAndSignOut({ legacyTrustedLocal, serverLocation }) {
  const storage = {
    gardenLocation: { ...legacyTrustedLocal },
    location: legacyTrustedLocal.label,
    climate: legacyTrustedLocal.climate
  };
  let snapshot = null;

  // hydrate: snapshot then overwrite working cache (as setAppLocation/service.save would)
  snapshot = {
    gardenLocation: { ...storage.gardenLocation },
    location: storage.location,
    climate: storage.climate
  };
  storage.gardenLocation = { ...serverLocation };
  storage.location = serverLocation.label;
  storage.climate = serverLocation.climate;

  // sign-out release
  const decision = decideAuthBoundaryLocationRelease(!!snapshot?.gardenLocation);
  if (decision === 'restore-snapshot') {
    storage.gardenLocation = { ...snapshot.gardenLocation };
    storage.location = snapshot.location;
    storage.climate = snapshot.climate;
    snapshot = null;
  } else if (decision === 'noop-preserve-local') {
    // leave storage as-is
  } else {
    // forbidden persist-default path
    storage.gardenLocation = {
      label: 'Western Galilee, Israel',
      climate: 'Mediterranean',
      source: 'default'
    };
  }

  return { storage, decision };
}

test('sign-out restores legacy trusted local location; does not persist default wipe', () => {
  const legacy = {
    label: 'Haifa, Israel',
    climate: 'Mediterranean',
    lat: 32.794,
    lon: 34.9896,
    source: 'manual'
  };
  const server = {
    label: 'London, United Kingdom',
    climate: 'Cool temperate',
    lat: 51.5074,
    lon: -0.1278,
    source: 'manual'
  };
  const { storage, decision } = simulateAuthHydrateAndSignOut({
    legacyTrustedLocal: legacy,
    serverLocation: server
  });
  assert.equal(decision, 'restore-snapshot');
  assert.equal(storage.gardenLocation.label, 'Haifa, Israel');
  assert.equal(storage.gardenLocation.source, 'manual');
  assert.notEqual(storage.gardenLocation.label, 'Western Galilee, Israel');
  assert.notEqual(storage.gardenLocation.source, 'default');
  assert.notEqual(storage.gardenLocation.label, 'London, United Kingdom');
});

test('pre-auth snapshot must not be overwritten by later server location in storage model', () => {
  // Models sessionStorage-backed snapshot: first capture wins.
  let snapshot = null;
  const capture = (gardenLocation) => {
    if (snapshot?.gardenLocation) return snapshot;
    snapshot = { gardenLocation: { ...gardenLocation } };
    return snapshot;
  };
  capture({ label: 'Haifa, Israel', source: 'manual' });
  capture({ label: 'Tel Aviv, Israel', source: 'manual' });
  assert.equal(snapshot.gardenLocation.label, 'Haifa, Israel');
});

test('sign-out without prior hydrate does not force default into storage model', () => {
  assert.equal(decideAuthBoundaryLocationRelease(false), 'noop-preserve-local');
});
