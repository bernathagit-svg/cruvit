import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../netlify/functions/garden-plants-schema-readiness.mjs', import.meta.url),
  'utf8'
);

test('schema readiness function uses Supabase read-only Management API', () => {
  assert.match(source, /database\/query\/read-only/);
  assert.match(source, /information_schema\.columns/);
  assert.match(source, /pg_get_constraintdef/);
  assert.match(source, /SUPABASE_ACCESS_TOKEN/);
});

test('schema readiness function contains no database mutation SQL', () => {
  assert.doesNotMatch(source, /\b(insert|update|delete|alter|drop|create)\s+(table|into|public\.)/i);
});

test('schema readiness requires all expected defaults and mark values', () => {
  assert.match(source, /statusDefault === 'unassessed'/);
  assert.match(source, /markDefault === 'unknown'/);
  assert.match(source, /allowedMarks\.includes\('unknown'\)/);
  assert.match(source, /allowedMarks\.includes\('✓'\)/);
  assert.match(source, /allowedMarks\.includes\('!'\)/);
});
