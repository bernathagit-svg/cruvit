import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const file = new URL('../modules/my-garden-v2/visual-contract/home.html', import.meta.url);
const html = fs.readFileSync(file, 'utf8');

test('My Garden Phase B home mounts the exact approved baseline', () => {
  assert.match(
    html,
    /https:\/\/my-garden-photo-tags--frolicking-kitten-996691\.netlify\.app\//
  );
});

test('visual contract harness adds no app chrome around approved Home', () => {
  assert.match(html, /<iframe[\s\S]*id="approved-home"/);
  assert.doesNotMatch(html, /class="(?:card|toolbar|bottom-nav|quick-add|attention-card)"/);
});

test('visual contract explicitly freezes redesign and global navigation changes', () => {
  assert.match(html, /VISUAL CONTRACT — DO NOT REDESIGN/);
  assert.match(html, /one behavior at a time/);
});
