/**
 * Garden Profile Location V1 — contract / selection / hydration guards.
 * Pure unit tests; no network, no Supabase credentials.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildServerLocationPayload,
  isCompleteServerLocation,
  isValidLatitude,
  isValidLongitude,
  mayWriteLegacyLocalLocationToServer,
  nullServerLocationPayload,
  resolveActiveGardenId,
  roundLocationCoord,
  serverLocationToAppPartial,
  shouldAcceptLocationHydration
} from '../modules/personal-domain/garden-profile-location-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(
  HERE,
  '..',
  'supabase',
  'migrations',
  '20250828210000_garden_profiles_location_v1.sql'
);

test('rounds coordinates to at most 4 decimal places', () => {
  assert.equal(roundLocationCoord(32.085312345), 32.0853);
  assert.equal(roundLocationCoord(-0.12781234), -0.1278);
  assert.equal(roundLocationCoord('51.50745'), 51.5075);
  assert.equal(roundLocationCoord(Number.NaN), null);
});

test('rejects invalid latitude and longitude ranges', () => {
  assert.equal(isValidLatitude(90), true);
  assert.equal(isValidLatitude(-90), true);
  assert.equal(isValidLatitude(90.0001), false);
  assert.equal(isValidLongitude(180), true);
  assert.equal(isValidLongitude(-180), true);
  assert.equal(isValidLongitude(180.1), false);
  assert.throws(
    () =>
      buildServerLocationPayload({
        label: 'X',
        climate: 'Mediterranean',
        lat: 91,
        lon: 34.7,
        source: 'manual'
      }),
    /location_lat out of range/
  );
  assert.throws(
    () =>
      buildServerLocationPayload({
        label: 'X',
        climate: 'Mediterranean',
        lat: 32,
        lon: -181,
        source: 'manual'
      }),
    /location_lon out of range/
  );
});

test('buildServerLocationPayload saves valid confirmed location and rounds precision', () => {
  const payload = buildServerLocationPayload({
    label: 'Tel Aviv, Israel',
    climate: 'Mediterranean',
    lat: 32.08531234,
    lon: 34.78181234,
    country: 'Israel',
    source: 'manual',
    confirmedAt: '2026-08-28T12:00:00.000Z'
  });
  assert.equal(payload.location_label, 'Tel Aviv, Israel');
  assert.equal(payload.location_climate, 'Mediterranean');
  assert.equal(payload.location_lat, 32.0853);
  assert.equal(payload.location_lon, 34.7818);
  assert.equal(payload.location_source, 'manual');
  assert.equal(payload.location_confirmed_at, '2026-08-28T12:00:00.000Z');
  assert.ok(payload.location_updated_at);
  assert.equal(payload.location_country, 'Israel');
});

test('rejects location_source=default and partial payloads', () => {
  assert.throws(
    () =>
      buildServerLocationPayload({
        label: 'Western Galilee, Israel',
        climate: 'Mediterranean',
        lat: 33.0089,
        lon: 35.0941,
        source: 'default'
      }),
    /default is not valid/
  );
  assert.throws(
    () =>
      buildServerLocationPayload({
        label: '',
        climate: 'Mediterranean',
        lat: 32,
        lon: 34,
        source: 'manual'
      }),
    /location_label is required/
  );
  assert.throws(
    () =>
      buildServerLocationPayload({
        label: 'Tel Aviv, Israel',
        climate: '',
        lat: 32,
        lon: 34,
        source: 'manual'
      }),
    /location_climate is required/
  );
});

test('null payload clears all location fields including optional metadata', () => {
  const cleared = nullServerLocationPayload();
  for (const key of Object.keys(cleared)) {
    assert.equal(cleared[key], null, key);
  }
});

test('complete-or-null helpers and app hydration mapping', () => {
  assert.equal(isCompleteServerLocation(nullServerLocationPayload()), false);
  const row = buildServerLocationPayload({
    label: 'London, United Kingdom',
    climate: 'Cool temperate',
    lat: 51.5074,
    lon: -0.1278,
    source: 'manual'
  });
  assert.equal(isCompleteServerLocation(row), true);
  const partial = serverLocationToAppPartial(row);
  assert.equal(partial.label, 'London, United Kingdom');
  assert.equal(partial.climate, 'Cool temperate');
  assert.equal(partial.source, 'manual');
  assert.equal(partial.lat, 51.5074);
  assert.equal(serverLocationToAppPartial({ location_label: 'Only label' }), null);
});

test('active garden selection: 0 / 1 / many', () => {
  assert.equal(resolveActiveGardenId([], 'x'), null);
  assert.equal(resolveActiveGardenId([{ id: 'g1' }], null), 'g1');
  assert.equal(resolveActiveGardenId([{ id: 'g1' }, { id: 'g2' }], null), null);
  assert.equal(resolveActiveGardenId([{ id: 'g1' }, { id: 'g2' }], 'g2'), 'g2');
  assert.equal(resolveActiveGardenId([{ id: 'g1' }, { id: 'g2' }], 'missing'), null);
});

test('hydration stale-response guard', () => {
  assert.equal(
    shouldAcceptLocationHydration('u1', 'g1', { user: { id: 'u1' } }, 'g1'),
    true
  );
  assert.equal(shouldAcceptLocationHydration('u1', 'g1', null, 'g1'), false);
  assert.equal(
    shouldAcceptLocationHydration('u1', 'g1', { user: { id: 'u2' } }, 'g1'),
    false
  );
  assert.equal(
    shouldAcceptLocationHydration('u1', 'g1', { user: { id: 'u1' } }, 'g2'),
    false
  );
});

test('legacy import requires explicit confirmation', () => {
  assert.equal(mayWriteLegacyLocalLocationToServer(false), false);
  assert.equal(mayWriteLegacyLocalLocationToServer(undefined), false);
  assert.equal(mayWriteLegacyLocalLocationToServer(true), true);
});

test('auth-boundary release never chooses persist-default wipe', async () => {
  const { decideAuthBoundaryLocationRelease } = await import(
    '../modules/personal-domain/garden-profile-location-contract.js'
  );
  assert.equal(decideAuthBoundaryLocationRelease(true), 'restore-snapshot');
  assert.equal(decideAuthBoundaryLocationRelease(false), 'noop-preserve-local');
  assert.notEqual(decideAuthBoundaryLocationRelease(true), 'persist-default');
  assert.notEqual(decideAuthBoundaryLocationRelease(false), 'persist-default');
});

test('stale User A garden id does not resolve for User B owned gardens', () => {
  const userBGardens = [{ id: 'garden-b-1' }, { id: 'garden-b-2' }];
  assert.equal(resolveActiveGardenId(userBGardens, 'garden-a-stale'), null);
  assert.equal(
    shouldAcceptLocationHydration(
      'user-a',
      'garden-a-stale',
      { user: { id: 'user-b' } },
      'garden-a-stale'
    ),
    false
  );
  assert.equal(
    shouldAcceptLocationHydration(
      'user-b',
      'garden-a-stale',
      { user: { id: 'user-b' } },
      null
    ),
    false
  );
});

test('materially different locations map to different climate labels for app hydrate', () => {
  const telAviv = serverLocationToAppPartial(
    buildServerLocationPayload({
      label: 'Tel Aviv, Israel',
      climate: 'Mediterranean',
      lat: 32.0853,
      lon: 34.7818,
      source: 'manual'
    })
  );
  const london = serverLocationToAppPartial(
    buildServerLocationPayload({
      label: 'London, United Kingdom',
      climate: 'Cool temperate',
      lat: 51.5074,
      lon: -0.1278,
      source: 'manual'
    })
  );
  assert.notEqual(telAviv.climate, london.climate);
  assert.notEqual(telAviv.label, london.label);
});

test('migration SQL enforces precision, ranges, source, and complete-or-null', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  assert.match(sql, /location_lat numeric\(7,\s*4\)/);
  assert.match(sql, /location_lon numeric\(8,\s*4\)/);
  assert.match(sql, /garden_profiles_location_lat_range_chk/);
  assert.match(sql, /garden_profiles_location_lon_range_chk/);
  assert.match(sql, /location_source in \('manual', 'geolocation'\)/);
  assert.match(sql, /garden_profiles_location_complete_or_null_chk/);
  assert.match(sql, /location_country is null/);
  assert.match(sql, /normalize_garden_profile_location/);
  assert.match(sql, /round\(new\.location_lat::numeric, 4\)/);
  assert.match(sql, /Never allow location_source='default'/);
  assert.doesNotMatch(sql, /broadClimate|freezingRisk|alwaysHot/);
});

test('hardening migration pins normalizer search_path without rewriting Location V1 history', () => {
  const harden = path.join(
    HERE,
    '..',
    'supabase',
    'migrations',
    '20250828220000_harden_garden_profile_location_normalizer_search_path.sql'
  );
  assert.ok(fs.existsSync(harden));
  const sql = fs.readFileSync(harden, 'utf8');
  assert.match(sql, /alter function public\.normalize_garden_profile_location\(\)/i);
  assert.match(sql, /set search_path\s*=\s*pg_catalog/i);
  const v1 = fs.readFileSync(MIGRATION, 'utf8');
  assert.doesNotMatch(v1, /set search_path\s*=\s*pg_catalog/i);
});
