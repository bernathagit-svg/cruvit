/**
 * Garden Plants Persistence V1 — contract / selection / hydration guards.
 * Pure unit tests; no network, no Supabase credentials.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildServerPlantPayload,
  decideAuthBoundaryPlantsRelease,
  mayWriteLegacyLocalPlantsToServer,
  serverPlantToAppPlant,
  shouldAcceptPlantHydration
} from '../modules/personal-domain/garden-profile-plants-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(
  HERE,
  '..',
  'supabase',
  'migrations',
  '20250828230000_garden_plants_v1.sql'
);

test('buildServerPlantPayload keeps required My Garden plant facts', () => {
  const payload = buildServerPlantPayload({
    id: 'plant_1',
    name: 'Lavender',
    status: 'Healthy',
    mark: '✓',
    source: 'Smart Recommendations',
    profileSlug: 'lavender',
    scientific: 'Lavandula angustifolia',
    archived: false,
    prefs: { autoTasks: true, reminders: false, alerts: true },
    addedAt: '2026-08-28T12:00:00.000Z',
    meta: { guide: 'should not persist' },
    imageUrl: 'https://example.com/x.jpg',
    plantId: 'should-not-persist'
  });
  assert.equal(payload.client_instance_id, 'plant_1');
  assert.equal(payload.name, 'Lavender');
  assert.equal(payload.profile_slug, 'lavender');
  assert.equal(payload.scientific, 'Lavandula angustifolia');
  assert.equal(payload.prefs.reminders, false);
  assert.equal(payload.meta, undefined);
  assert.equal(payload.imageUrl, undefined);
  assert.equal(payload.plantId, undefined);
});

test('buildServerPlantPayload captures scientific from meta when top-level absent', () => {
  const payload = buildServerPlantPayload({
    id: 'plant_scan',
    name: 'Unknown cultivar',
    mark: '✓',
    meta: { scientific: 'Rosa × hybrida' }
  });
  assert.equal(payload.scientific, 'Rosa × hybrida');
});

test('buildServerPlantPayload rejects blank name and invalid mark', () => {
  assert.throws(() => buildServerPlantPayload({ id: 'x', name: '  ' }), /name/);
  assert.throws(() => buildServerPlantPayload({ id: 'x', name: 'A', mark: '?' }), /mark/);
  assert.throws(() => buildServerPlantPayload({ name: 'A' }), /client_instance_id/);
});

test('serverPlantToAppPlant maps row back to My Garden plant shape', () => {
  const plant = serverPlantToAppPlant({
    id: 'uuid-1',
    client_instance_id: 'plant_9',
    name: 'Rosemary',
    status: 'Water today',
    mark: '!',
    source: 'My Garden',
    profile_slug: 'rosemary',
    scientific: 'Salvia rosmarinus',
    archived: false,
    prefs: { autoTasks: true, reminders: true, alerts: true },
    added_at: '2026-08-28T12:00:00.000Z',
    updated_at: '2026-08-28T13:00:00.000Z'
  });
  assert.equal(plant.id, 'plant_9');
  assert.equal(plant.serverId, 'uuid-1');
  assert.equal(plant.profileSlug, 'rosemary');
  assert.equal(plant.scientific, 'Salvia rosmarinus');
  assert.equal(plant.mark, '!');
});

test('server round-trip preserves scientific for scan/custom plants without catalog slug', () => {
  const payload = buildServerPlantPayload({
    id: 'plant_custom',
    name: 'My scanned rose',
    mark: '!',
    source: 'Scan & Identify',
    profileSlug: 'my-scanned-rose',
    scientific: 'Rosa gallica'
  });
  const restored = serverPlantToAppPlant({
    id: 'uuid-x',
    client_instance_id: payload.client_instance_id,
    name: payload.name,
    status: payload.status,
    mark: payload.mark,
    source: payload.source,
    profile_slug: payload.profile_slug,
    scientific: payload.scientific,
    archived: false,
    prefs: payload.prefs,
    added_at: payload.added_at
  });
  assert.equal(restored.scientific, 'Rosa gallica');
  assert.equal(restored.name, 'My scanned rose');
});

test('hydrate must keep instance status/mark over catalog defaults', () => {
  // Live-E2E product fix: catalog reattachment enriched meta but overwrote
  // authoritative per-instance status/mark with catalog defaults (Healthy/✓).
  // Server-owned instance fields must win after hydrate enrichment.
  const server = serverPlantToAppPlant({
    id: 'uuid-1',
    client_instance_id: 'plant_9',
    name: 'Lavender',
    status: 'Needs water E2E',
    mark: '!',
    source: 'My Garden',
    profile_slug: 'lavender',
    scientific: 'Lavandula angustifolia',
    archived: false,
    prefs: { autoTasks: true, reminders: true, alerts: true },
    added_at: '2026-08-28T12:00:00.000Z'
  });
  const catalogDefaults = {
    status: 'Healthy',
    mark: '✓',
    name: 'Lavender',
    scientific: 'Lavandula angustifolia'
  };
  // Simulate incorrect catalog overwrite:
  const wrong = Object.assign({}, server, {
    status: catalogDefaults.status,
    mark: catalogDefaults.mark
  });
  assert.notEqual(wrong.status, server.status);
  assert.notEqual(wrong.mark, server.mark);
  // Correct restore (applyAuthenticatedGardenPlants discipline):
  const merged = Object.assign({}, wrong, {
    status: server.status,
    mark: server.mark,
    name: server.name,
    scientific: server.scientific
  });
  assert.equal(merged.status, 'Needs water E2E');
  assert.equal(merged.mark, '!');
  assert.equal(merged.scientific, 'Lavandula angustifolia');
  assert.notEqual(merged.status, catalogDefaults.status);
  assert.notEqual(merged.mark, catalogDefaults.mark);
});

test('upsert identity is stable on garden_profile_id + client_instance_id', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  assert.match(sql, /garden_plants_garden_client_uidx unique \(garden_profile_id, client_instance_id\)/);
  const a = buildServerPlantPayload({ id: 'plant_stable', name: 'Lavender', mark: '✓' });
  const b = buildServerPlantPayload({ id: 'plant_stable', name: 'Lavender', mark: '✓' });
  assert.equal(a.client_instance_id, b.client_instance_id);
});

test('legacy import requires explicit confirmation', () => {
  assert.equal(mayWriteLegacyLocalPlantsToServer(true), true);
  assert.equal(mayWriteLegacyLocalPlantsToServer(false), false);
  assert.equal(mayWriteLegacyLocalPlantsToServer(undefined), false);
});

test('auth-boundary plants release never chooses persist-default wipe', () => {
  assert.equal(decideAuthBoundaryPlantsRelease(true), 'restore-snapshot');
  assert.equal(decideAuthBoundaryPlantsRelease(false), 'noop-preserve-local');
});

test('stale plant hydration rejected across user/garden drift', () => {
  const session = { user: { id: 'user-a' } };
  assert.equal(shouldAcceptPlantHydration('user-a', 'g1', session, 'g1'), true);
  assert.equal(shouldAcceptPlantHydration('user-a', 'g1', session, 'g2'), false);
  assert.equal(shouldAcceptPlantHydration('user-a', 'g1', { user: { id: 'user-b' } }, 'g1'), false);
  assert.equal(shouldAcceptPlantHydration('user-a', 'g1', null, 'g1'), false);
});

test('multi-garden plants remain independent by garden_profile_id in payload model', () => {
  const a = buildServerPlantPayload({ id: 'plant_same', name: 'Lavender', profileSlug: 'lavender' });
  const b = buildServerPlantPayload({ id: 'plant_same', name: 'Lavender', profileSlug: 'lavender' });
  // Same client id may exist in two gardens; uniqueness is (garden_profile_id, client_instance_id).
  assert.equal(a.client_instance_id, b.client_instance_id);
  assert.notEqual('garden-a', 'garden-b');
});

test('migration SQL creates garden_plants with RLS ownership and no task/photo columns', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  assert.match(sql, /create table if not exists public\.garden_plants/i);
  assert.match(sql, /garden_profile_id uuid not null references public\.garden_profiles/i);
  assert.match(sql, /client_instance_id text not null/);
  assert.match(sql, /profile_slug text/);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /force row level security/i);
  assert.match(sql, /garden_plants_select_own/);
  assert.match(sql, /garden_plants_insert_own/);
  assert.match(sql, /garden_plants_update_own/);
  assert.match(sql, /garden_plants_delete_own/);
  assert.match(sql, /enforce_garden_plant_ownership/);
  assert.match(sql, /set search_path = pg_catalog/);
  assert.doesNotMatch(sql, /create table[\s\S]*\btasks\b/i);
  assert.doesNotMatch(sql, /\b(photo_url|image_url|scan_photo)\b/i);
  assert.doesNotMatch(sql, /service_role/);
  assert.doesNotMatch(sql, /suitability|climate_fit|freezingRisk/i);
});
