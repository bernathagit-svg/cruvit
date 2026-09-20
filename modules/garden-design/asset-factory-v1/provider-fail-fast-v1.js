/**
 * Fail-fast classification for Images API auth/config failures.
 * Does not retry. Does not print secrets.
 */
import { sanitizeProviderError } from '../../runtime-guards/paid-image-spend-gate-v1.js';

export function classifyProviderFailFast(httpStatus, message) {
  const status = Number(httpStatus || 0);
  const sanitized = sanitizeProviderError(message);
  const text = String(sanitized || '').toLowerCase();
  if (
    status === 401 ||
    text.includes('incorrect_api_key') ||
    /invalid api key|unauthorized|authentication/i.test(text)
  ) {
    return {
      failFast: true,
      code: 'PROVIDER_AUTH_FAIL_FAST',
      reason: 'authentication_failure',
      sanitizedError: sanitized
    };
  }
  if (status === 403 || /permission|not allowed|model.*restrict|access denied/i.test(text)) {
    return {
      failFast: true,
      code: 'PROVIDER_AUTH_FAIL_FAST',
      reason: 'permission_or_model_restriction',
      sanitizedError: sanitized
    };
  }
  if (
    /model_not_found|model not found|model unavailable|unknown model|does not exist|invalid model|model is not available/i.test(
      text
    )
  ) {
    return {
      failFast: true,
      code: 'PROVIDER_AUTH_FAIL_FAST',
      reason: 'model_unavailable_or_not_allowed',
      sanitizedError: sanitized
    };
  }
  if (/billing|insufficient_quota|quota|project.*not.*allow|organization/i.test(text)) {
    return {
      failFast: true,
      code: 'PROVIDER_AUTH_FAIL_FAST',
      reason: 'billing_or_project_configuration_failure',
      sanitizedError: sanitized
    };
  }
  return { failFast: false, code: null, reason: null, sanitizedError: sanitized };
}
