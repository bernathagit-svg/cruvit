import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APPROVED_VISUAL_SHA } from '../modules/my-garden-v2/visual-acceptance-gate.js';
import { UPCOMING_APPROVED_VISUAL } from '../modules/my-garden-v2/approved-upcoming-renderer.js';

const manifest = JSON.parse(
  fs.readFileSync(
    new URL('../modules/my-garden-v2/approved-reference-manifest.json', import.meta.url),
    'utf8'
  )
);
const registry = JSON.parse(
  fs.readFileSync(
    new URL('../modules/my-garden-v2/owner-visual-approval-registry.json', import.meta.url),
    'utf8'
  )
);

function manifestSha(id) {
  const row = manifest.screens.find((x) => x.id === id);
  if (!row) throw new Error('manifest_screen_missing:' + id);
  return row.sha256;
}

function registrySha(id) {
  const row = registry.screens.find((x) => x.id === id);
  if (!row) throw new Error('registry_screen_missing:' + id);
  return row.referenceSha256;
}

test('Upcoming List approved SHA has one source of truth across contracts', () => {
  const expected = '03cca6920c02e4ec191f9dc1d8cfa197a4c1913a6da9b31af9e1a3b2385d7430';
  assert.equal(manifestSha('upcoming-list'), expected);
  assert.equal(registrySha('upcoming-list'), expected);
  assert.equal(APPROVED_VISUAL_SHA['upcoming-list'], expected);
  assert.equal(UPCOMING_APPROVED_VISUAL.list.sha256, expected);
});

test('Upcoming Calendar approved SHA has one source of truth across contracts', () => {
  const expected = '322b3ef6c07203be8c5547930bd0a95ce2e79fb8824d01f7b1319f012212b4db';
  assert.equal(manifestSha('upcoming-calendar'), expected);
  assert.equal(registrySha('upcoming-calendar'), expected);
  assert.equal(APPROVED_VISUAL_SHA['upcoming-calendar'], expected);
  assert.equal(UPCOMING_APPROVED_VISUAL.calendar.sha256, expected);
});

test('old Upcoming proposal SHA values are no longer canonical', () => {
  const old = new Set([
    '02871aa9c08b68138bf73b63f49eadb3149b50b3d09bc25393a28f14d25e973c',
    'a4cb197a0fd3b72158a951e7fcb023e6db352621dfc721cf99eaa1ca83c8fce4',
  ]);

  for (const id of ['upcoming-list','upcoming-calendar']) {
    assert.equal(old.has(manifestSha(id)), false);
    assert.equal(old.has(registrySha(id)), false);
    assert.equal(old.has(APPROVED_VISUAL_SHA[id]), false);
  }
});
