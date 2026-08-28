/**
 * Garden Profile V0 — sign-out / session-switch stale refresh guard.
 * Pure unit test; no network, no Supabase credentials.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAcceptGardenProfileRefresh } from '../modules/personal-domain/garden-profile-v0-refresh-guard.js';

test('stale refresh rejected after sign-out', () => {
  const requestUserId = 'user-a';
  assert.equal(
    shouldAcceptGardenProfileRefresh(requestUserId, null),
    false,
    'null session must reject'
  );
  assert.equal(
    shouldAcceptGardenProfileRefresh(requestUserId, {}),
    false,
    'empty session must reject'
  );
  assert.equal(
    shouldAcceptGardenProfileRefresh(requestUserId, { user: null }),
    false,
    'signed-out session must reject'
  );
});

test('stale refresh rejected after user switch', () => {
  const requestUserId = 'user-a';
  assert.equal(
    shouldAcceptGardenProfileRefresh(requestUserId, { user: { id: 'user-b' } }),
    false,
    'other user must reject'
  );
});

test('fresh refresh accepted for same authenticated user', () => {
  const requestUserId = 'user-a';
  assert.equal(
    shouldAcceptGardenProfileRefresh(requestUserId, { user: { id: 'user-a' } }),
    true,
    'same user must accept'
  );
});

test('refresh rejected when request user id missing', () => {
  assert.equal(
    shouldAcceptGardenProfileRefresh('', { user: { id: 'user-a' } }),
    false
  );
  assert.equal(
    shouldAcceptGardenProfileRefresh(null, { user: { id: 'user-a' } }),
    false
  );
});
