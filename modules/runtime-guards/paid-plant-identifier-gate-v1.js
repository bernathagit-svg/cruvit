/**
 * Paid Plant Identifier server gate V1.
 * Ordinary user activity must not reach Anthropic unless Owner explicitly enables.
 * Missing / false / anything other than explicit true → BLOCKED.
 * Client request bodies/headers cannot override this gate.
 */

export const PAID_PLANT_IDENTIFIER_ENV_FLAG = 'CRUVIT_ALLOW_PAID_PLANT_IDENTIFIER';

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function isPaidPlantIdentifierAllowed(env = process.env) {
  const raw = String(env?.[PAID_PLANT_IDENTIFIER_ENV_FLAG] ?? '')
    .trim()
    .toLowerCase();
  // Only the exact string "true" enables paid Anthropic. "1"/"yes"/true-boolean-env-coercion do not.
  return raw === 'true';
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
