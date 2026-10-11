/**
 * Paid Plant Identifier server gate V1.
 * Ordinary user activity must not reach Anthropic unless Owner explicitly enables.
 * Missing / false / anything other than explicit true → BLOCKED.
 * Client request bodies/headers cannot override this gate.
 */

export const PAID_PLANT_IDENTIFIER_ENV_FLAG = 'CRUVIT_ALLOW_PAID_PLANT_IDENTIFIER';
export const PAID_NATURAL_BLEND_ENV_FLAG = 'CRUVIT_ALLOW_PAID_NATURAL_BLEND';
export const PAID_ADMIN_RUNTIME_ENV_FLAG = 'CRUVIT_ALLOW_PAID_ADMIN_RUNTIME';
export const PAID_ADMIN_RUNTIME_ACTIVATION = 'HOLD';

function explicitlyEnabled(value) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function isPaidPlantIdentifierAllowed(env = process.env) {
  return explicitlyEnabled(env?.[PAID_PLANT_IDENTIFIER_ENV_FLAG]);
}

// Legacy proxies have no runtime enablement authority, including the PI flag.
export function isPaidLegacyRuntimeAllowed() {
  return false;
}

export function paidLegacyRuntimeDisabledResponse() {
  return {
    status: 403,
    body: { error: 'This paid AI route is disabled.', code: 'PAID_LEGACY_RUNTIME_DISABLED', enabled: false }
  };
}

// A separate server-owned feature decision; callers must pass server env only.
export function isPaidNaturalBlendAllowed(env = process.env) {
  return explicitlyEnabled(env?.[PAID_NATURAL_BLEND_ENV_FLAG]);
}

export function paidNaturalBlendDisabledResponse() {
  return {
    status: 403,
    body: { ok: false, error: 'Natural Blend AI is disabled.', code: 'PAID_NATURAL_BLEND_DISABLED', enabled: false }
  };
}

/**
 * Exercise preserved job contracts in an isolated offline test context only.
 * This is NOT authenticated operator authority. Hosted activation remains HOLD;
 * a future HTTP admission decision must independently authenticate the operator.
 * No request body/header/query is an input to this predicate.
 */
export function isPaidAdminRuntimeAllowed(env = process.env) {
  return env?.NODE_ENV === 'test'
    && !['NETLIFY', 'SITE_ID', 'DEPLOY_ID', 'CONTEXT'].some(key => env?.[key])
    && explicitlyEnabled(env?.[PAID_ADMIN_RUNTIME_ENV_FLAG]);
}

export function paidAdminRuntimeHeldResponse() {
  return {
    status: 403,
    body: { ok: false, error: 'Paid administrative execution is on hold.', code: 'PAID_ADMIN_RUNTIME_HOLD', enabled: false, activation: PAID_ADMIN_RUNTIME_ACTIVATION }
  };
}

/**
 * Safe controlled response when paid Identifier is disabled.
 * Does not reveal secrets or invite client override.
 */
export function paidPlantIdentifierDisabledResponse() {
  return {
    status: 403,
    body: {
      error: 'Plant Identifier AI is disabled.',
      code: 'PAID_PLANT_IDENTIFIER_DISABLED',
      enabled: false,
      message:
        'Paid plant identification is turned off by default. It requires an explicit Owner enablement decision before Anthropic may be called.'
    }
  };
}

/**
 * Strip / ignore any client attempt to force-enable paid AI.
 */
export function clientCannotOverridePaidPlantIdentifierGate(requestBody = {}, requestHeaders = {}) {
  const body = requestBody && typeof requestBody === 'object' ? requestBody : {};
  const headers = requestHeaders && typeof requestHeaders === 'object' ? requestHeaders : {};
  const attempted =
    body.allowPaid === true ||
    body.CRUVIT_ALLOW_PAID_PLANT_IDENTIFIER === true ||
    body.cruvitAllowPaidPlantIdentifier === true ||
    body.enableAnthropic === true ||
    String(headers['x-cruvit-allow-paid-plant-identifier'] || '').toLowerCase() === 'true' ||
    String(headers['x-allow-paid-ai'] || '').toLowerCase() === 'true';
  return {
    attemptedOverride: !!attempted,
    overrideHonored: false
  };
}
