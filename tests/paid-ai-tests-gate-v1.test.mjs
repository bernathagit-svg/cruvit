/**
 * Paid AI tests gate — unit tests (no provider calls).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAID_AI_TESTS_ENV_FLAGS,
  PLANT_DOCTOR_PROVIDER_CALLS_PER_DIAGNOSIS,
  assertPaidAiAutomatedTestAllowed,
  isPaidAiAutomatedTestAllowed
} from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import { FIXTURE_PROVIDER_CALLS } from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';

test('default env → paid AI automated tests OFF', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(isPaidAiAutomatedTestAllowed({ PAID_AI_TESTS: '' }), false);
  assert.equal(isPaidAiAutomatedTestAllowed({ PAID_AI_TESTS: '0' }), false);
  assert.equal(isPaidAiAutomatedTestAllowed({ CRUVIT_PAID_AI_TESTS: 'false' }), false);
});

test('explicit ON enables paid AI automated tests', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({ PAID_AI_TESTS: 'ON' }), true);
  assert.equal(isPaidAiAutomatedTestAllowed({ PAID_AI_TESTS: '1' }), true);
  assert.equal(isPaidAiAutomatedTestAllowed({ CRUVIT_PAID_AI_TESTS: 'true' }), true);
});

test('assert helper throws when OFF in throw mode', () => {
  assert.throws(
    () => assertPaidAiAutomatedTestAllowed({}, { mode: 'throw' }),
    (err) => err && err.code === 'PAID_AI_TESTS_OFF'
  );
});

test('Doctor diagnosis provider budget is exactly one call; fixtures use zero', () => {
  assert.equal(PLANT_DOCTOR_PROVIDER_CALLS_PER_DIAGNOSIS, 1);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
  assert.ok(PAID_AI_TESTS_ENV_FLAGS.includes('PAID_AI_TESTS'));
});
