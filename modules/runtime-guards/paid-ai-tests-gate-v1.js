/**
 * Paid AI automated-test gate V1.
 *
 * Default: OFF. Unit/integration suites must not call paid AI providers.
 * Live smoke tests may run only when explicitly enabled for a release proof.
 *
 * Enable with either:
 *   PAID_AI_TESTS=ON
 *   CRUVIT_PAID_AI_TESTS=true
 *
 * Production user diagnosis is unrelated — this gate is for automated tests only.
 */

export const PAID_AI_TESTS_ENV_FLAGS = Object.freeze([
  'PAID_AI_TESTS',
  'CRUVIT_PAID_AI_TESTS'
]);

const TRUTHY = new Set(['1', 'true', 'on', 'yes', 'enable', 'enabled']);

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
export function isPaidAiAutomatedTestAllowed(env = process.env) {
  for (const key of PAID_AI_TESTS_ENV_FLAGS) {
    const raw = String(env?.[key] ?? '')
      .trim()
      .toLowerCase();
    if (TRUTHY.has(raw)) return true;
  }
  return false;
}

/**
 * Skip (or throw) when a test file attempts a live paid AI call without the gate.
 * Prefer skip for optional smoke; throw for accidental misuse in default suites.
 */
export function assertPaidAiAutomatedTestAllowed(env = process.env, options = {}) {
  if (isPaidAiAutomatedTestAllowed(env)) return true;
  const mode = options.mode === 'throw' ? 'throw' : 'skip';
  const message =
    options.message ||
    'Paid AI automated tests are OFF by default. Set PAID_AI_TESTS=ON (or CRUVIT_PAID_AI_TESTS=true) only for explicit live smoke.';
  if (mode === 'throw') {
    const err = new Error(message);
    err.code = 'PAID_AI_TESTS_OFF';
    throw err;
  }
  return false;
}

/** Documented contract: one real Doctor diagnosis = one provider call (identity+diagnosis together). */
export const PLANT_DOCTOR_PROVIDER_CALLS_PER_DIAGNOSIS = 1;
