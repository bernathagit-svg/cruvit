/**
 * First Value Onboarding V1 — derive the next user step from real auth/garden truth.
 * No backend onboarding table. No architecture jargon in labels.
 */

import { isCompleteServerLocation } from './garden-profile-location-contract.js';

export const FIRST_VALUE_ONBOARDING_STATES = Object.freeze({
  A_SIGN_IN: 'A_SIGN_IN',
  B_CREATE_GARDEN: 'B_CREATE_GARDEN',
  B_CHOOSE_GARDEN: 'B_CHOOSE_GARDEN',
  C_SET_LOCATION: 'C_SET_LOCATION',
  D_ADD_PLANT: 'D_ADD_PLANT',
  E_FIRST_ANSWER: 'E_FIRST_ANSWER'
});

/**
 * @param {{
 *   signedIn?: boolean,
 *   gardens?: Array<{id?: string, location_label?: string|null}>,
 *   activeGardenId?: string|null,
 *   activeGarden?: object|null,
 *   plantCount?: number
 * }} input
 */
export function deriveFirstValueOnboardingState(input = {}) {
  const signedIn = input.signedIn === true;
  const gardens = Array.isArray(input.gardens) ? input.gardens.filter((g) => g && g.id) : [];
  const activeGardenId = String(input.activeGardenId || '').trim();
  const plantCount = Number.isFinite(Number(input.plantCount)) ? Math.max(0, Number(input.plantCount)) : 0;

  if (!signedIn) {
    return {
      state: FIRST_VALUE_ONBOARDING_STATES.A_SIGN_IN,
      title: 'Welcome to Cruvit',
      lead: 'Sign in to save your garden, location, and plants.',
      primaryLabel: 'Sign in',
      primaryAction: 'sign-in',
      showGardenSwitcher: false
    };
  }

  if (!gardens.length) {
    return {
      state: FIRST_VALUE_ONBOARDING_STATES.B_CREATE_GARDEN,
      title: 'Create my garden',
      lead: 'Start with one garden. You can rename it later.',
      primaryLabel: 'Create my garden',
      primaryAction: 'create-garden',
      showGardenSwitcher: false
    };
  }

  const activeGarden =
    (input.activeGarden && input.activeGarden.id && input.activeGarden) ||
    gardens.find((g) => String(g.id) === activeGardenId) ||
    (gardens.length === 1 ? gardens[0] : null);

  if (gardens.length > 1 && !activeGarden) {
    return {
      state: FIRST_VALUE_ONBOARDING_STATES.B_CHOOSE_GARDEN,
      title: 'Choose your garden',
      lead: 'You have more than one garden. Pick which one to use.',
      primaryLabel: 'Open a garden',
      primaryAction: 'choose-garden',
      showGardenSwitcher: true
    };
  }

  if (!isCompleteServerLocation(activeGarden)) {
    const label = String(activeGarden?.location_label || '').trim();
    return {
      state: FIRST_VALUE_ONBOARDING_STATES.C_SET_LOCATION,
      title: 'Where is your garden?',
      lead: label
        ? `Confirm where “${activeGarden.name || 'My Garden'}” is located.`
        : 'Set your garden location so Cruvit can check what grows there.',
      primaryLabel: 'Set garden location',
      primaryAction: 'set-location',
      showGardenSwitcher: false,
      gardenName: activeGarden?.name || 'My Garden',
      gardenId: activeGarden?.id || null
    };
  }

  if (plantCount <= 0) {
    return {
      state: FIRST_VALUE_ONBOARDING_STATES.D_ADD_PLANT,
      title: 'Add your first plant',
      lead: `Location saved for ${activeGarden.location_label}. Pick a plant to check if it can grow there.`,
      primaryLabel: 'Add your first plant',
      primaryAction: 'add-plant',
      showGardenSwitcher: false,
      gardenName: activeGarden?.name || 'My Garden',
      locationLabel: activeGarden.location_label,
      gardenId: activeGarden?.id || null
    };
  }

  return {
    state: FIRST_VALUE_ONBOARDING_STATES.E_FIRST_ANSWER,
    title: 'Can I grow this here?',
    lead: 'Your garden, location, and plant are ready. Here is Cruvit’s answer.',
    primaryLabel: 'Check another plant',
    primaryAction: 'check-plant',
    showGardenSwitcher: false,
    gardenName: activeGarden?.name || 'My Garden',
    locationLabel: activeGarden.location_label,
    gardenId: activeGarden?.id || null,
    plantCount
  };
}
