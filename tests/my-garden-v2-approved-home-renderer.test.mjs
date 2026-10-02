import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderApprovedMyGardenHome,
  APPROVED_HOME_STATIC_CLASSES,
} from '../modules/my-garden-v2/approved-home-renderer.js';

const vm = {
  counts: { plants: 12, upcoming: 3, attention: 2 },
  attentionItems: [
    { id:'a1', displayText:'Rose needs a check' },
    { id:'a2', displayText:'Lemon tree ready to fertilize' },
  ],
};

test('approved Home renderer preserves locked DOM/class language', () => {
  const html = renderApprovedMyGardenHome(vm);
  for (const className of APPROVED_HOME_STATIC_CLASSES) {
    assert.match(html, new RegExp('class="[^"]*\\b' + className + '\\b'));
  }
  assert.match(html, /data-release="botanical-v2"/);
  assert.match(html, /Change garden photo/);
  assert.match(html, /Garden Journal/);
  assert.match(html, /Add Plant/);
  assert.match(html, /Need your attention/);
});

test('canonical fixture reproduces approved visible Home values', () => {
  const html = renderApprovedMyGardenHome(vm);
  assert.match(html, />My Plants<\/span><small>12<\/small>/);
  assert.match(html, />Upcoming<\/span><small>3<\/small>/);
  assert.match(html, /<span class="pg-badge">2<\/span>/);
  assert.match(html, /Rose needs a check · Lemon tree ready to fertilize/);
});

test('only business values change when dynamic counts change', () => {
  const html = renderApprovedMyGardenHome({
    counts:{plants:7,upcoming:4,attention:1},
    attentionItems:[{id:'t1',type:'task',plantName:'Rose',title:'Check leaves'}],
  });
  assert.match(html, />My Plants<\/span><small>7<\/small>/);
  assert.match(html, />Upcoming<\/span><small>4<\/small>/);
  assert.match(html, /<span class="pg-badge">1<\/span>/);
  assert.match(html, /Rose · Check leaves/);
  assert.match(html, /tile-plants\.png/);
  assert.match(html, /tile-upcoming\.png/);
  assert.match(html, /tile-journal\.png/);
  assert.match(html, /tile-add\.png/);
});

test('renderer escapes dynamic attention content', () => {
  const html = renderApprovedMyGardenHome({
    counts:{plants:1,upcoming:1,attention:1},
    attentionItems:[{id:'x',displayText:'<script>alert(1)</script>'}],
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('invalid counts fail loudly', () => {
  assert.throws(
    () => renderApprovedMyGardenHome({
      counts:{plants:-1,upcoming:0,attention:0},
    }),
    /invalid_home_plant_count/
  );
});
