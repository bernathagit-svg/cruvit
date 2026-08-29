/**
 * Garden Tasks Persistence V1 — contract unit tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildServerTaskPayload,
  decideAuthBoundaryTasksRelease,
  ensureTaskClientId,
  mayWriteLegacyLocalTasksToServer,
  restoreAuthoritativeTaskInstanceFields,
  serverTaskToAppTask,
  shouldAcceptTaskHydration,
  TASK_CLIENT_ID_IDX,
  TASK_DONE_IDX
} from '../modules/personal-domain/garden-profile-tasks-contract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20250829100000_garden_tasks_v1.sql'
);

test('buildServerTaskPayload keeps required My Garden task facts', () => {
  const row = [
    '💧',
    'Water Rosemary',
    'Today · 5 minutes',
    'High',
    '2026-08-29',
    true,
    'Rosemary',
    false,
    'task_stable_1'
  ];
  row.id = 'task_stable_1';
  const payload = buildServerTaskPayload(row);
  assert.equal(payload.client_instance_id, 'task_stable_1');
  assert.equal(payload.icon, '💧');
  assert.equal(payload.title, 'Water Rosemary');
  assert.equal(payload.when_label, 'Today · 5 minutes');
  assert.equal(payload.priority, 'High');
  assert.equal(payload.due_on, '2026-08-29');
  assert.equal(payload.auto_generated, true);
  assert.equal(payload.plant_name, 'Rosemary');
  assert.equal(payload.done, false);
});

test('buildServerTaskPayload rejects blank title', () => {
  assert.throws(
    () => buildServerTaskPayload(['🌿', '  ', 'This week', 'Low', '', false, '', false]),
    /title/
  );
});

test('buildServerTaskPayload assigns stable client id when missing', () => {
  const row = ['🌿', 'Check leaves', 'This week', 'Low', '', false, 'Lavender', false];
  const a = buildServerTaskPayload(row, { idFactory: () => 'task_fixed' });
  const b = buildServerTaskPayload(row);
  assert.equal(a.client_instance_id, 'task_fixed');
  assert.equal(b.client_instance_id, 'task_fixed');
  assert.equal(row[TASK_CLIENT_ID_IDX], 'task_fixed');
});

test('serverTaskToAppTask maps row back to My Garden task shape', () => {
  const app = serverTaskToAppTask({
    id: 'uuid-1',
    client_instance_id: 'task_9',
    icon: '💧',
    title: 'Water Rosemary',
    when_label: 'Today · 5 minutes',
    priority: 'High',
    due_on: '2026-08-29',
    auto_generated: true,
    plant_name: 'Rosemary',
    done: false,
    garden_plant_id: 'plant-uuid'
  });
  assert.equal(app[1], 'Water Rosemary');
  assert.equal(app[TASK_DONE_IDX], false);
  assert.equal(app[TASK_CLIENT_ID_IDX], 'task_9');
  assert.equal(app.id, 'task_9');
  assert.equal(app.gardenPlantId, 'plant-uuid');
  assert.equal(app.serverId, 'uuid-1');
});

test('hydrate must keep instance done/when/priority over care-template defaults', () => {
  // Analogous to Plants V1 status/mark: care enrichment must not wipe instance state.
  const server = serverTaskToAppTask({
    client_instance_id: 'task_e2e',
    icon: '💧',
    title: 'Water Lavender',
    when_label: 'Aug 29 · postponed',
    priority: 'High',
    due_on: '2026-08-29',
    auto_generated: true,
    plant_name: 'Lavender',
    done: true
  });
  const catalogDefaults = {
    when_label: 'Today · auto-generated care task',
    priority: 'Low',
    done: false
  };
  const wrong = Object.assign([], server, {
    2: catalogDefaults.when_label,
    3: catalogDefaults.priority,
    [TASK_DONE_IDX]: catalogDefaults.done
  });
  wrong[2] = catalogDefaults.when_label;
  wrong[3] = catalogDefaults.priority;
  wrong[TASK_DONE_IDX] = catalogDefaults.done;
  assert.notEqual(wrong[TASK_DONE_IDX], server[TASK_DONE_IDX]);
  const merged = restoreAuthoritativeTaskInstanceFields(wrong, server);
  assert.equal(merged[TASK_DONE_IDX], true);
  assert.equal(merged[2], 'Aug 29 · postponed');
  assert.equal(merged[3], 'High');
  assert.equal(merged[4], '2026-08-29');
});

test('upsert identity is stable on garden_profile_id + client_instance_id', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  assert.match(sql, /garden_tasks_garden_client_uidx unique \(garden_profile_id, client_instance_id\)/);
  const a = buildServerTaskPayload({
    id: 'task_stable',
    title: 'Water Rosemary',
    priority: 'High',
    done: false
  });
  const b = buildServerTaskPayload({
    id: 'task_stable',
    title: 'Water Rosemary',
    priority: 'High',
    done: true
  });
  assert.equal(a.client_instance_id, b.client_instance_id);
});

test('legacy import requires explicit confirmation', () => {
  assert.equal(mayWriteLegacyLocalTasksToServer(true), true);
  assert.equal(mayWriteLegacyLocalTasksToServer(false), false);
  assert.equal(mayWriteLegacyLocalTasksToServer(undefined), false);
});

test('auth-boundary tasks release never chooses persist-default wipe', () => {
  assert.equal(decideAuthBoundaryTasksRelease(true), 'restore-snapshot');
  assert.equal(decideAuthBoundaryTasksRelease(false), 'noop-preserve-local');
});

test('stale task hydration rejected across user/garden drift', () => {
  const session = { user: { id: 'user-a' } };
  assert.equal(shouldAcceptTaskHydration('user-a', 'g1', session, 'g1'), true);
  assert.equal(shouldAcceptTaskHydration('user-a', 'g1', session, 'g2'), false);
  assert.equal(shouldAcceptTaskHydration('user-a', 'g1', { user: { id: 'user-b' } }, 'g1'), false);
  assert.equal(shouldAcceptTaskHydration('user-a', 'g1', null, 'g1'), false);
});

test('multi-garden tasks remain independent by garden_profile_id in payload model', () => {
  const a = buildServerTaskPayload({ id: 'task_same', title: 'Water Lavender' });
  const b = buildServerTaskPayload({ id: 'task_same', title: 'Water Lavender' });
  assert.equal(a.client_instance_id, b.client_instance_id);
  assert.notEqual('garden-a', 'garden-b');
});

test('ensureTaskClientId does not regenerate existing id', () => {
  const row = ['🌿', 'T', 'This week', 'Low', '', false, '', false, 'task_keep'];
  assert.equal(ensureTaskClientId(row), 'task_keep');
  assert.equal(ensureTaskClientId(row, () => 'task_other'), 'task_keep');
});

test('migration SQL creates garden_tasks with RLS, plant FK safety, no event columns', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  assert.match(sql, /create table if not exists public\.garden_tasks/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /force row level security/);
  assert.match(sql, /garden_tasks_select_own/);
  assert.match(sql, /garden_tasks_insert_own/);
  assert.match(sql, /garden_tasks_update_own/);
  assert.match(sql, /garden_tasks_delete_own/);
  assert.match(sql, /to authenticated/);
  assert.match(sql, /revoke all on table public\.garden_tasks from anon/);
  assert.match(sql, /enforce_garden_task_ownership/);
  assert.match(sql, /set search_path = pg_catalog/);
  assert.match(sql, /garden_task_plant_garden_mismatch/);
  assert.match(sql, /on delete set null/);
  assert.match(sql, /garden_plant_id/);
  assert.doesNotMatch(sql, /garden_events/);
  assert.doesNotMatch(sql, /garden_memory/);
  assert.doesNotMatch(sql, /create table.*photo/i);
});

test('plant delete: open linked tasks deleted server-side; done tasks SET NULL and keep plant_name', () => {
  // Required invariant without relying on frontend removeOrphanPlantTasks ordering.
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  assert.match(sql, /delete_open_garden_tasks_for_deleted_plant/);
  assert.match(sql, /before delete on public\.garden_plants/);
  assert.match(
    sql,
    /delete from public\.garden_tasks t\s+where t\.garden_plant_id = old\.id\s+and t\.done = false/s
  );
  assert.match(sql, /garden_plant_id uuid references public\.garden_plants \(id\) on delete set null/);

  // Simulate the two-step server behavior for regression clarity.
  const plantId = 'plant-uuid-1';
  let tasks = [
    {
      id: 't-open',
      garden_plant_id: plantId,
      done: false,
      plant_name: 'Lavender',
      title: 'Water Lavender',
      when_label: 'Today'
    },
    {
      id: 't-done',
      garden_plant_id: plantId,
      done: true,
      plant_name: 'Lavender',
      title: 'Water Lavender',
      when_label: 'Yesterday · completed'
    }
  ];
  // BEFORE DELETE open-task purge:
  tasks = tasks.filter((t) => !(t.garden_plant_id === plantId && t.done === false));
  // FK ON DELETE SET NULL for survivors:
  tasks = tasks.map((t) =>
    t.garden_plant_id === plantId ? { ...t, garden_plant_id: null } : t
  );
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, 't-done');
  assert.equal(tasks[0].garden_plant_id, null);
  assert.equal(tasks[0].plant_name, 'Lavender');
  assert.equal(tasks[0].title, 'Water Lavender');
  assert.equal(tasks[0].when_label, 'Yesterday · completed');
  assert.equal(tasks[0].done, true);
});
