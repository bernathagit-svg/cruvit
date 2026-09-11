/**
 * First Value Onboarding V1 — pure state derivation tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveFirstValueOnboardingState,
  FIRST_VALUE_ONBOARDING_STATES
} from '../modules/personal-domain/first-value-onboarding-v1-contract.js';

test('signed-out users land on sign-in', () => {
  const step = deriveFirstValueOnboardingState({ signedIn: false, gardens: [] });
  assert.equal(step.state, FIRST_VALUE_ONBOARDING_STATES.A_SIGN_IN);
  assert.equal(step.primaryAction, 'sign-in');
});

test('signed-in with no garden prompts create my garden', () => {
  const step = deriveFirstValueOnboardingState({ signedIn: true, gardens: [] });
  assert.equal(step.state, FIRST_VALUE_ONBOARDING_STATES.B_CREATE_GARDEN);
  assert.equal(step.primaryLabel, 'Create my garden');
  assert.equal(step.showGardenSwitcher, false);
});

test('one garden without location prompts set location and does not require switcher', () => {
  const step = deriveFirstValueOnboardingState({
    signedIn: true,
    gardens: [{ id: 'g1', name: 'My Garden' }],
    activeGardenId: 'g1',
    plantCount: 0
  });
  assert.equal(step.state, FIRST_VALUE_ONBOARDING_STATES.C_SET_LOCATION);
  assert.equal(step.primaryAction, 'set-location');
  assert.equal(step.showGardenSwitcher, false);
});

test('multiple gardens without explicit active require choose', () => {
  const step = deriveFirstValueOnboardingState({
    signedIn: true,
    gardens: [
      { id: 'g1', name: 'A' },
      { id: 'g2', name: 'B' }
    ],
    activeGardenId: '',
    plantCount: 0
  });
  assert.equal(step.state, FIRST_VALUE_ONBOARDING_STATES.B_CHOOSE_GARDEN);
  assert.equal(step.showGardenSwitcher, true);
});

test('complete location and no plants prompts add first plant', () => {
  const step = deriveFirstValueOnboardingState({
    signedIn: true,
    gardens: [
      {
        id: 'fab7eec4-86b7-4b8a-838d-8aa4bba61657',
        name: 'Mojstrana Test Garden',
        location_label: 'Mojstrana, Slovenia',
        location_lat: 46.4238,
        location_lon: 13.8752,
        location_climate: 'temperate',
        location_source: 'manual',
        location_confirmed_at: '2026-09-11T00:00:00.000Z'
      }
    ],
    activeGardenId: 'fab7eec4-86b7-4b8a-838d-8aa4bba61657',
    plantCount: 0
  });
  assert.equal(step.state, FIRST_VALUE_ONBOARDING_STATES.D_ADD_PLANT);
  assert.match(step.lead, /Mojstrana/);
});

test('garden + location + plant surfaces first answer step', () => {
  const step = deriveFirstValueOnboardingState({
    signedIn: true,
    gardens: [
      {
        id: 'g1',
        name: 'My Garden',
        location_label: 'Mojstrana, Slovenia',
        location_lat: 46.4238,
        location_lon: 13.8752,
        location_climate: 'temperate',
        location_source: 'manual',
        location_confirmed_at: '2026-09-11T00:00:00.000Z'
      }
    ],
    activeGardenId: 'g1',
    plantCount: 1
  });
  assert.equal(step.state, FIRST_VALUE_ONBOARDING_STATES.E_FIRST_ANSWER);
  assert.equal(step.primaryAction, 'check-plant');
});
