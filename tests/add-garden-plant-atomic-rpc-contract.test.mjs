import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(
  new URL(
    '../supabase/migrations/20261005190000_add_garden_plant_atomic_v1.sql',
    import.meta.url
  ),
  'utf8'
);

test('atomic Add Plant RPC is SECURITY INVOKER with safe search_path', () => {
  assert.match(sql, /create or replace function public\.add_garden_plant_once_v1/i);
  assert.match(sql, /security invoker/i);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(sql, /set search_path = pg_catalog, public/i);
});

test('RPC has no user_id parameter and keeps all objects schema-qualified', () => {
  const signature = sql.slice(
    sql.indexOf('create or replace function'),
    sql.indexOf('returns jsonb')
  );
  assert.doesNotMatch(signature, /user_id/i);
  assert.match(sql, /public\.garden_profiles/);
  assert.match(sql, /public\.garden_plants/);
  assert.match(sql, /public\.garden_events/);
  assert.match(sql, /auth\.uid\(\)/);
});

test('create-once semantics never update an existing plant', () => {
  assert.match(
    sql,
    /insert into public\.garden_plants[\s\S]*on conflict \(garden_profile_id, client_instance_id\) do nothing/i
  );
  assert.doesNotMatch(sql, /on conflict[\s\S]{0,180}do update/i);
  assert.doesNotMatch(sql, /update\s+public\.garden_plants/i);
});

test('retry compares canonical identity and ignores mutable fields', () => {
  assert.match(sql, /idempotency_payload_mismatch/);
  assert.match(sql, /v_plant\.profile_slug[\s\S]*v_profile_slug/);
  const mismatchBlock = sql.slice(
    sql.indexOf('-- Idempotency payload check'),
    sql.indexOf('-- Deterministic History identity')
  );
  assert.doesNotMatch(mismatchBlock, /v_plant\.(name|status|mark|garden_area_id)/);
});

test('plant_added identity and payload are server-derived from authoritative plant', () => {
  assert.match(sql, /v_plant\.id::text/);
  assert.match(sql, /v_client_event_id/);
  assert.doesNotMatch(
    sql.slice(0, sql.indexOf('returns jsonb')),
    /client_event_id/i
  );
  assert.match(sql, /'name', v_plant\.name/);
  assert.match(sql, /'scientific', v_plant\.scientific/);
  assert.match(sql, /'profile_slug', v_plant\.profile_slug/);
  assert.match(sql, /'client_instance_id', v_plant\.client_instance_id/);
});

test('plant_added is create-if-absent in same function transaction', () => {
  assert.match(
    sql,
    /insert into public\.garden_events[\s\S]*on conflict \(garden_profile_id, client_event_id\) do nothing/i
  );
  assert.match(sql, /plant_added_event_unavailable/);
  assert.match(sql, /idempotency_history_mismatch/);
});

test('RPC execute permission is authenticated-only', () => {
  assert.match(
    sql,
    /revoke execute on function public\.add_garden_plant_once_v1[\s\S]*from public/i
  );
  assert.match(
    sql,
    /revoke execute on function public\.add_garden_plant_once_v1[\s\S]*from anon/i
  );
  assert.match(
    sql,
    /grant execute on function public\.add_garden_plant_once_v1[\s\S]*to authenticated/i
  );
});
