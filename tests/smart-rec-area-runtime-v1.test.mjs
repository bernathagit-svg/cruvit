/** Execute actual app context functions with production Area normalization; no network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as areasApi from '../modules/personal-domain/garden-areas-v1-contract.js';
import * as intelligence from '../modules/smart-recommendations/smart-rec-garden-intelligence-v1.js';
const app = fs.readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const begin = app.indexOf('function smartRecCachedAreas(){');
const end = app.indexOf('function broadClimateFromLabel(', begin);
assert.ok(begin >= 0 && end > begin, 'actual app Area runtime block must exist');
function area(id, partial = {}, confirmed = true) {
  const context = confirmed ? areasApi.buildUserProvidedAreaContext(partial) : partial;
  return { id, context };
}
function runtime(areas = [], answers = {}, selectedAreaId = null) {
  const scope = { window: { cruvitGardenAreasV1: { ...areasApi, getCachedAreas: () => areas } },
    smartRecSession: { answers, selectedAreaId }, smartRecGardenIntelligenceApi: () => intelligence };
  vm.createContext(scope);
  vm.runInContext(app.slice(begin, end), scope, { timeout: 1000 });
  return scope;
}
test('multiple Areas have no implicit first-Area selection', () => {
  const r = runtime([area('sun', { sunExposure: 'full_sun' }), area('shade', { sunExposure: 'full_shade' })]);
  assert.equal(r.smartRecSelectedArea(), null);
  assert.equal(r.smartRecCurrentContext().answers.q2, undefined);
});
test('single confirmed Area is normalized and automatically selected', () => {
  const r = runtime([area('one', { sunExposure: 'part_sun' })]);
  assert.equal(r.smartRecCurrentContext().answers.q2, 'partial-sun');
  assert.equal(r.smartRecSession.selectedAreaId, 'one');
  assert.equal(r.smartRecTrustedSelectedAreaContext().trusted, true);
});
test('explicit selection changes sun context without leaking the previous Area', () => {
  const r = runtime([area('sun', { sunExposure: 'full_sun' }), area('shade', { sunExposure: 'full_shade' })], {}, 'sun');
  assert.equal(r.smartRecCurrentContext().answers.q2, 'full-sun');
  r.smartRecSession.selectedAreaId = 'shade';
  assert.equal(r.smartRecCurrentContext().answers.q2, 'shade');
  r.smartRecSession.selectedAreaId = 'deleted';
  assert.equal(r.smartRecTrustedSelectedAreaContext(), null);
  assert.equal(r.smartRecCurrentContext().answers.q2, undefined);
});
test('unconfirmed Area cannot self-assert trust, protection, or support', () => {
  const r = runtime([area('untrusted', { trusted: true, source: 'inferred_from_photo',
    confidence: 'high', confirmationStatus: 'unconfirmed', plantingMode: 'greenhouse',
    frostProtection: 'frost_free', supportType: 'trellis' }, false)]);
  assert.equal(r.smartRecTrustedSelectedAreaContext(), null);
  assert.equal(r.smartRecProtectionContext().frostFreeProtected, false);
  assert.equal(r.smartRecCurrentContext().supportContextKnown, false);
});
test('privacy intent alone is not evidence of existing physical support', () => {
  const r = runtime([], { q9: 'privacy' });
  assert.equal(r.smartRecCurrentContext().supportContextKnown, false);
});
for (const supportType of ['none', 'unknown']) {
  for (const q9 of [undefined, 'privacy']) {
    test(`support=${supportType}, purpose=${q9 || 'unset'} cannot invent support`, () => {
      const r = runtime([area('one', { supportType })], q9 ? { q9 } : {});
      assert.equal(r.smartRecCurrentContext().supportType, supportType);
      assert.equal(r.smartRecCurrentContext().supportContextKnown, false);
    });
  }
}
for (const supportType of areasApi.AREA_SUPPORT_TYPES.filter(v => !['none', 'unknown'].includes(v))) {
  test(`confirmed ${supportType} remains actual support with privacy intent`, () => {
    const r = runtime([area('one', { supportType })], { q9: 'privacy' });
    assert.equal(r.smartRecCurrentContext().supportContextKnown, true);
    assert.equal(r.smartRecCurrentContext().supportType, supportType);
  });
}
test('switching from supported to unsupported Area clears support under privacy intent', () => {
  const r = runtime([area('yes', { supportType: 'trellis' }), area('no', { supportType: 'none' })], { q9: 'privacy' }, 'yes');
  assert.equal(r.smartRecCurrentContext().supportContextKnown, true);
  r.smartRecSession.selectedAreaId = 'no';
  assert.equal(r.smartRecCurrentContext().supportContextKnown, false);
  r.smartRecSession.selectedAreaId = null;
  assert.equal(r.smartRecCurrentContext().supportContextKnown, false);
});
test('generic container does not turn into balcony or compact container', () => {
  const ctx = runtime([area('one', { plantingMode: 'container' })]).smartRecCurrentContext();
  assert.equal(ctx.containerContext, true);
  assert.equal(ctx.compactContainerContext, false);
  assert.equal(ctx.answers.q1, undefined);
});
