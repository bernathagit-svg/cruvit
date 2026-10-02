import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(
  fs.readFileSync(
    new URL('../modules/my-garden-v2/approved-reference-manifest.json', import.meta.url),
    'utf8'
  )
);

const expected = [
  'my-garden-home',
  'my-plants',
  'plant-overview',
  'plant-care',
  'plant-schedule',
  'plant-history',
  'add-plant',
  'upcoming-list',
  'upcoming-calendar',
  'garden-journal',
  'notifications',
];

test('every approved screen has one immutable visual fingerprint', () => {
  assert.equal(manifest.designFrozen, true);
  assert.deepEqual(manifest.screens.map((x) => x.id).sort(), [...expected].sort());
  assert.equal(new Set(manifest.screens.map((x) => x.id)).size, expected.length);
  for (const ref of manifest.screens) {
    assert.equal(ref.approved, true);
    assert.match(ref.sha256, /^[a-f0-9]{64}$/);
  }
});

test('personal plant photo sync has its own approved behavior fingerprint', () => {
  const ref = manifest.behaviors.find((x) => x.id === 'personal-plant-photo-sync');
  assert.ok(ref);
  assert.equal(ref.approved, true);
  assert.match(ref.sha256, /^[a-f0-9]{64}$/);
  assert.equal(ref.rules.includes('no silent replacement'), true);
});
