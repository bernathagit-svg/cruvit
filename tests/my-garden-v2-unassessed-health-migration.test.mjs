import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(
  new URL(
    '../supabase/migrations/20261005175958_garden_plants_unassessed_health_v2.sql',
    import.meta.url
  ),
  'utf8'
);

test('migration changes new plant defaults to unassessed and unknown', () => {
  assert.match(sql, /alter column status set default 'unassessed'/i);
  assert.match(sql, /alter column mark set default 'unknown'/i);
});

test('migration expands mark constraint without rewriting existing rows', () => {
  assert.match(sql, /mark in \('unknown', '✓', '!'\)/i);
  assert.doesNotMatch(sql, /update\s+public\.garden_plants/i);
});

test('migration preserves existing free-form status values', () => {
  assert.doesNotMatch(sql, /garden_plants_status_chk/i);
  assert.doesNotMatch(sql, /status\s+in\s*\(/i);
});
