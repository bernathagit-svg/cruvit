import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../netlify/functions/garden-plants-schema-readiness.mjs', import.meta.url),
  'utf8'
);

test('schema readiness uses authenticated Supabase read-only Management API', () => {
  assert.match(source, /database\/query\/read-only/);
  assert.match(source, /information_schema\.columns/);
  assert.match(source, /pg_get_constraintdef/);
  assert.match(source, /SUPABASE_ACCESS_TOKEN/);
  assert.match(source, /\/auth\/v1\/user/);
});

test('schema readiness contains no database mutation SQL', () => {
  assert.doesNotMatch(source, /\b(insert|update|delete|alter|drop|create)\s+(table|into|public\.)/i);
});

test('schema readiness requires exact CRUVIT project and scoped PAT', () => {
  assert.match(source, /saiuscqbszafszpdmzfl/);
  assert.match(source, /sbp_fc/);
  assert.match(source, /scoped_database_read_pat_required/);
  assert.match(source, /schema_attestation_wrong_project/);
});

test('schema readiness has a bounded lease and never accepts stale lease', () => {
  assert.match(source, /DEFAULT_LEASE_MS = 5 \* 60 \* 1000/);
  assert.match(source, /MAX_LEASE_MS = 15 \* 60 \* 1000/);
  assert.match(source, /readinessLease = null/);
  assert.match(source, /validLease/);
  assert.match(source, /Never use an expired\/stale lease as proof/);
});

test('schema readiness requires all expected defaults and mark values', () => {
  assert.match(source, /statusDefault === 'unassessed'/);
  assert.match(source, /markDefault === 'unknown'/);
  assert.match(source, /allowedMarks\.includes\('unknown'\)/);
  assert.match(source, /allowedMarks\.includes\('✓'\)/);
  assert.match(source, /allowedMarks\.includes\('!'\)/);
});
