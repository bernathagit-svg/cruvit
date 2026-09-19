/**
 * Authoritative garden-context readiness after session restore + owned profiles.
 * Does not include private media URLs.
 */
export const GARDEN_CONTEXT_READY_EVENT = 'cruvit:garden-context-ready';
export const AUTH_SESSION_CHANGED_EVENT = 'cruvit:auth-session-changed';

export function buildGardenContextReadyDetail(input = {}) {
  const authenticated = input.authenticated === true;
  return {
    authenticated,
    gardenProfileId: authenticated && input.gardenProfileId ? String(input.gardenProfileId) : null,
    gardenCount: Number.isFinite(Number(input.gardenCount)) ? Number(input.gardenCount) : 0
  };
}

export function classifyPersonalDomainGardenReadiness(input = {}) {
  const authenticated = input.authenticated === true;
  const gardenProfileId = input.gardenProfileId ? String(input.gardenProfileId) : null;
  const gardenCount = Number.isFinite(Number(input.gardenCount)) ? Number(input.gardenCount) : 0;
  if (input.profilesHydrated !== true) {
    return {
      status: 'RESTORING',
      authenticated,
      gardenProfileId: authenticated ? gardenProfileId : null,
      gardenCount,
      profilesHydrated: false
    };
  }
  if (!authenticated) {
    return {
      status: 'SIGNED_OUT',
      authenticated: false,
      gardenProfileId: null,
      gardenCount: 0,
      profilesHydrated: true
    };
  }
  if (!gardenProfileId) {
    return {
      status: 'NO_ACTIVE_GARDEN',
      authenticated: true,
      gardenProfileId: null,
      gardenCount,
      profilesHydrated: true
    };
  }
  return {
    status: 'READY',
    authenticated: true,
    gardenProfileId,
    gardenCount,
    profilesHydrated: true
  };
}
