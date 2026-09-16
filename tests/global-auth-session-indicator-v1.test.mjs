/**
 * Global app-shell auth session indicator.
 * Source of truth: Supabase session only. Zero paid AI.
 *
 * Run: node --test tests/global-auth-session-indicator-v1.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import {
  AUTH_SESSION_SOURCE,
  PAID_AI_AUTOMATED_CALLS,
  resolveAuthSessionIndicator,
  presentAuthSessionIndicator,
  hostUserIdFromSession,
  hostUserContextFromSession
} from '../modules/personal-domain/global-auth-session-indicator-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function stubViews() {
  return {
    wrap: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } },
    chip: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } },
    chipLabel: { textContent: '' },
    avatar: { hidden: false, textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } },
    identity: { textContent: '', hidden: true },
    signOutBtn: { hidden: true },
    menu: { classList: { values: new Set(['hidden']), add(name) { this.values.add(name); }, contains(name) { return this.values.has(name); } } }
  };
}

test('paid AI automated calls remain 0', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(PAID_AI_AUTOMATED_CALLS, 0);
});

test('authenticated session shows email or display name and initials', () => {
  const identity = resolveAuthSessionIndicator({
    user: {
      id: 'user-42',
      email: 'owner@cruvit.test',
      user_metadata: { full_name: 'Ada Owner', avatar_url: 'https://example.test/a.png' }
    }
  });
  assert.equal(identity.authenticated, true);
  assert.equal(identity.authState, 'signed-in');
  assert.equal(identity.chipLabel, 'Ada Owner');
  assert.equal(identity.email, 'owner@cruvit.test');
  assert.equal(identity.identityLine, 'Ada Owner · owner@cruvit.test');
  assert.equal(identity.initials, 'AO');
  assert.equal(identity.avatarUrl, 'https://example.test/a.png');
  assert.equal(identity.source, AUTH_SESSION_SOURCE);
  assert.equal(identity.userId, 'user-42');
});

test('authenticated session without display name shows email', () => {
  const identity = resolveAuthSessionIndicator({
    user: { id: 'user-7', email: 'guest-no@cruvit.test' }
  });
  assert.equal(identity.chipLabel, 'guest-no@cruvit.test');
  assert.equal(identity.initials, 'GU');
});

test('no session shows Sign in / Guest', () => {
  for (const session of [null, undefined, {}, { user: null }, { user: { email: 'x@y.z' } }]) {
    const identity = resolveAuthSessionIndicator(session);
    assert.equal(identity.authenticated, false, `session ${JSON.stringify(session)} must be guest`);
    assert.equal(identity.chipLabel, 'Sign in');
    assert.equal(identity.guestLabel, 'Guest');
    assert.equal(identity.ariaLabel, 'Guest. Sign in');
    assert.equal(identity.userId, null);
  }
});

test('cached Garden data, location, and local plants cannot fake authenticated state', () => {
  const localGarden = {
    localStorage: { cruvit_plants: [{ name: 'Olive' }], garden_profile: { id: 'g1' } },
    location: { city: 'Mojstrana', status: 'TRUSTED_CONFIRMED' },
    localPlants: [{ name: 'Lemon' }, { name: 'Olive' }]
  };
  const identity = resolveAuthSessionIndicator(null, localGarden);
  assert.equal(identity.authenticated, false);
  assert.equal(identity.chipLabel, 'Sign in');
  assert.equal(hostUserIdFromSession(null, localGarden), null);
  assert.deepEqual(hostUserContextFromSession({ user: null, garden: localGarden }), {
    authSource: AUTH_SESSION_SOURCE,
    userId: null,
    authenticated: false
  });
});

test('sign-out presentation updates chip to Sign in', () => {
  const views = stubViews();
  const signedIn = presentAuthSessionIndicator({
    user: { id: 'user-42', email: 'owner@cruvit.test' }
  }, views);
  assert.equal(signedIn.authenticated, true);
  assert.equal(views.chipLabel.textContent, 'owner@cruvit.test');
  assert.equal(views.chip.attrs['data-auth-state'], 'signed-in');
  assert.equal(views.identity.hidden, false);
  assert.equal(views.signOutBtn.hidden, false);
  assert.equal(views.avatar.hidden, false);
  assert.equal(views.avatar.textContent, 'OW');

  const signedOut = presentAuthSessionIndicator(null, views);
  assert.equal(signedOut.authenticated, false);
  assert.equal(views.chipLabel.textContent, 'Sign in');
  assert.equal(views.chip.attrs['data-auth-state'], 'guest');
  assert.equal(views.chip.attrs['aria-label'], 'Guest. Sign in');
  assert.equal(views.identity.hidden, true);
  assert.equal(views.signOutBtn.hidden, true);
  assert.equal(views.avatar.hidden, true);
  assert.equal(views.menu.classList.contains('hidden'), true);
});

test('iframe host user context comes from Supabase session only', () => {
  assert.equal(hostUserIdFromSession({ user: { id: 'host-user-1', email: 'a@b.c' } }), 'host-user-1');
  assert.equal(hostUserIdFromSession({ user: { id: '  ' } }), null);
  const ctx = hostUserContextFromSession({
    user: { id: 'host-user-1' },
    access_token: 'not-a-user-signal'
  });
  assert.deepEqual(ctx, {
    authSource: AUTH_SESSION_SOURCE,
    userId: 'host-user-1',
    authenticated: true
  });
});

test('Garden Design iframe does not create its own auth system', () => {
  const iframe = fs.readFileSync(path.join(ROOT, 'modules/garden-design/index.html'), 'utf8');
  assert.equal(iframe.includes('supabase-js'), false);
  assert.equal(iframe.includes('createClient'), false);
  assert.equal(/supabase\.auth/.test(iframe), false);
  assert.equal(iframe.includes('cruvitPersonalDomainV0'), false);
  assert.equal(iframe.includes('id="appAccountChip"'), false);
});

test('host Garden Design context uses host session helper', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
  const profile = fs.readFileSync(path.join(ROOT, 'modules/personal-domain/garden-profile-v0.js'), 'utf8');
  assert.equal(app.includes('id="appAccountChip"'), true);
  assert.equal(app.includes('id="globalAppSettings"'), true);
  assert.equal(app.includes('hostUserIdFromSession'), true);
  assert.equal(profile.includes("from './global-auth-session-indicator-v1.js'"), true);
});
