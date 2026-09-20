/**
 * Calibration paid-execution preflight. Proposal only. Approval remains DENIED.
 * Does not call providers. Does not probe keys. Does not mutate billing.
 */
import { LOCKED_CALIBRATION_SLUGS, CALIBRATION_BATCH_SIZE } from './calibration-batch-v1.js';
import {
  parseSpendEnvelope,
  assertSpendEnvelope,
  classifyProviderKey
} from './spend-envelope-v1.js';
import { estimateCalibrationApiSpend, proposeSafeCalibrationEnvelope } from './total-api-cost-v1.js';
import { generateAsset } from './provider-adapter-v1.js';
import { runFactory } from './runner-v1.js';
import { PAID_IMAGE_MODEL } from '../../runtime-guards/paid-image-spend-gate-v1.js';

export const CALIBRATION_PAID_RUN_ID = 'design-asset-calibration-batch-1';
export const CALIBRATION_PAID_MODEL = PAID_IMAGE_MODEL;
export const CALIBRATION_PAID_APPROVAL_STATE = 'DENIED';
export const CALIBRATION_PAID_HARD_LIMITS = Object.freeze({
  maxJobs: 8,
  initialCalls: 8,
  proposedMaxRetries: 4,
  maxCalls: 12,
  maxSpendUsd: 1.5
});

export const FUTURE_CALIBRATION_PAID_COMMAND = Object.freeze([
  'node',
  'scripts/design-asset-factory-v1.mjs',
  `--run-id=${CALIBRATION_PAID_RUN_ID}`,
  `--approve-envelope=${CALIBRATION_PAID_RUN_ID}`,
  '--provider=openai-images-api',
  `--model=${CALIBRATION_PAID_MODEL}`,
  '--max-jobs=8',
  '--max-calls=12',
  '--max-retries=4',
  '--max-spend-usd=1.50'
]);

/** Owner approval for this run only. Does not carry forward. Not the default factory state. */
export const OWNER_APPROVED_CALIBRATION_BATCH_1 = Object.freeze({
  runId: CALIBRATION_PAID_RUN_ID,
  provider: 'openai-images-api',
  model: CALIBRATION_PAID_MODEL,
  maxJobs: 8,
  maxCalls: 8,
  maxRetries: 0,
  maxSpendUsd: 1.5,
  carryForward: false
});

export const OWNER_APPROVED_CALIBRATION_BATCH_1_COMMAND = Object.freeze([
  `--run-id=${OWNER_APPROVED_CALIBRATION_BATCH_1.runId}`,
  `--approve-envelope=${OWNER_APPROVED_CALIBRATION_BATCH_1.runId}`,
  `--owner-approve-run=${OWNER_APPROVED_CALIBRATION_BATCH_1.runId}`,
  `--provider=${OWNER_APPROVED_CALIBRATION_BATCH_1.provider}`,
  `--model=${OWNER_APPROVED_CALIBRATION_BATCH_1.model}`,
  `--max-jobs=${OWNER_APPROVED_CALIBRATION_BATCH_1.maxJobs}`,
  `--max-calls=${OWNER_APPROVED_CALIBRATION_BATCH_1.maxCalls}`,
  `--max-retries=${OWNER_APPROVED_CALIBRATION_BATCH_1.maxRetries}`,
  '--max-spend-usd=1.50'
]);

function strFlag(args, name) {
  for (const arg of args) {
    const match = new RegExp(`^--${name}=(.+)$`).exec(String(arg));
    if (match) return String(match[1]);
  }
  return '';
}

export function inspectOpenAiKeyPresence(raw) {
  const classified = classifyProviderKey({ provider: 'openai-images-api' }, raw);
  let report = 'UNKNOWN';
  if (classified.openaiApiKey === 'absent' || classified.apiKey === 'absent') report = 'ABSENT';
  else if (classified.openaiApiKey === 'unusable') report = 'PREVIOUSLY_UNUSABLE';
  else if (classified.openaiApiKey === 'present' || classified.apiKey === 'present') report = 'PRESENT';
  return {
    openaiApiKey: report,
    billingKeyReadiness: classified.billingKeyReadiness,
    networkValidation: classified.networkValidation || 'not-performed',
    charactersPrinted: 0
  };
}

/** Presence only. Does not inspect shape, validity, or any character of the secret. */
export function inspectOpenAiKeyPresenceOnly(raw) {
  const present = raw != null && String(raw).trim() !== '';
  return {
    openaiApiKey: present ? 'PRESENT' : 'ABSENT',
    networkValidation: 'not-performed',
    charactersPrinted: 0,
    validityTested: false
  };
}

export function proposedCalibrationEnvelope() {
  const spend = estimateCalibrationApiSpend();
  const proposed = proposeSafeCalibrationEnvelope();
  return {
    runId: CALIBRATION_PAID_RUN_ID,
    provider: 'openai-images-api',
    model: CALIBRATION_PAID_MODEL,
    maxJobs: CALIBRATION_PAID_HARD_LIMITS.maxJobs,
    initialCalls: CALIBRATION_PAID_HARD_LIMITS.initialCalls,
    proposedMaxRetries: CALIBRATION_PAID_HARD_LIMITS.proposedMaxRetries,
    maxCalls: CALIBRATION_PAID_HARD_LIMITS.maxCalls,
    maxSpendUsd: CALIBRATION_PAID_HARD_LIMITS.maxSpendUsd,
    expectedSpendUsdAtMaxCalls: spend.expectedTotalApiSpendUsdAtMaxCalls,
    approvalState: CALIBRATION_PAID_APPROVAL_STATE,
    defaultDeny: true,
    carryForward: false,
    automaticTopUp: false,
    authorized: false,
    approved: false,
    label: 'PROPOSAL_ONLY',
    jobs: LOCKED_CALIBRATION_SLUGS.slice(),
    jobCount: CALIBRATION_BATCH_SIZE,
    usdPerCallTotal: proposed.usdPerCallTotal
  };
}

export function parseCalibrationPaidCommand(argv = []) {
  const args = Array.isArray(argv) ? argv.map((a) => String(a)) : [];
  const parsed = parseSpendEnvelope(args);
  const approveEnvelope = strFlag(args, 'approve-envelope');
  const modelMatched = parsed.model === CALIBRATION_PAID_MODEL;
  const runIdMatched = parsed.runId === CALIBRATION_PAID_RUN_ID;
  const identityMatched = runIdMatched && approveEnvelope === CALIBRATION_PAID_RUN_ID;
  const allowPaidAlone =
    args.some((a) => /^--allow-paid-calls=\d+$/.test(a)) &&
    !args.some((a) => a.startsWith('--run-id=')) &&
    !args.some((a) => a.startsWith('--approve-envelope='));
  const exceedsHardLimits =
    parsed.maxJobs > CALIBRATION_PAID_HARD_LIMITS.maxJobs ||
    parsed.maxCalls > CALIBRATION_PAID_HARD_LIMITS.maxCalls ||
    parsed.maxRetries > CALIBRATION_PAID_HARD_LIMITS.proposedMaxRetries ||
    Number(parsed.maxSpendUsd || 0) > CALIBRATION_PAID_HARD_LIMITS.maxSpendUsd + 1e-9;
  const ownerApproved = CALIBRATION_PAID_APPROVAL_STATE === 'APPROVED';
  const defaultDeny =
    parsed.defaultDeny === true ||
    parsed.dryRun === true ||
    allowPaidAlone ||
    !identityMatched ||
    !modelMatched ||
    exceedsHardLimits ||
    !ownerApproved;
  return {
    ...parsed,
    approveEnvelope,
    identityMatched,
    runIdMatched,
    modelMatched,
    allowPaidAlone,
    exceedsHardLimits,
    approvalState: CALIBRATION_PAID_APPROVAL_STATE,
    defaultDeny,
    allowNetwork: false,
    futureCommand: FUTURE_CALIBRATION_PAID_COMMAND
  };
}

export function parseOwnerApprovedCalibrationBatch1(argv = []) {
  const args = Array.isArray(argv) ? argv.map((a) => String(a)) : [];
  const parsed = parseCalibrationPaidCommand(args);
  const ownerApproveRun = strFlag(args, 'owner-approve-run');
  const spec = OWNER_APPROVED_CALIBRATION_BATCH_1;
  const envelopeMatched =
    ownerApproveRun === spec.runId &&
    parsed.runId === spec.runId &&
    parsed.approveEnvelope === spec.runId &&
    parsed.provider === spec.provider &&
    parsed.model === spec.model &&
    Number(parsed.maxJobs) === spec.maxJobs &&
    Number(parsed.maxCalls) === spec.maxCalls &&
    Number(parsed.maxRetries) === spec.maxRetries &&
    Math.abs(Number(parsed.maxSpendUsd) - spec.maxSpendUsd) < 1e-9 &&
    parsed.dryRun !== true;
  return {
    ...parsed,
    ownerApproveRun,
    ownerApprovedThisRunOnly: envelopeMatched === true,
    carryForward: false,
    automaticTopUp: false,
    approvalState: envelopeMatched ? 'APPROVED_THIS_RUN_ONLY' : CALIBRATION_PAID_APPROVAL_STATE,
    defaultDeny: envelopeMatched ? false : true,
    allowNetwork: envelopeMatched === true
  };
}

export function assertCalibrationHardLimits(envelope = {}) {
  if (String(envelope.model || '') !== CALIBRATION_PAID_MODEL) {
    const err = new Error('PAID_SPEND_MODEL_DENIED');
    err.code = 'PAID_SPEND_MODEL_DENIED';
    throw err;
  }
  const jobs = Number(envelope.maxJobs || 0);
  const calls = Number(envelope.maxCalls || 0);
  const retries = Number(envelope.proposedMaxRetries ?? envelope.maxRetries ?? 0);
  const maxSpend = Number(envelope.maxSpendUsd || 0);
  const expected = Number(
    envelope.expectedSpendUsdAtMaxCalls ?? estimateCalibrationApiSpend().expectedTotalApiSpendUsdAtMaxCalls
  );
  if (jobs > CALIBRATION_PAID_HARD_LIMITS.maxJobs) {
    const err = new Error('PAID_SPEND_JOB_LIMIT');
    err.code = 'PAID_SPEND_JOB_LIMIT';
    throw err;
  }
  if (calls > CALIBRATION_PAID_HARD_LIMITS.maxCalls) {
    const err = new Error('PAID_SPEND_CALL_LIMIT');
    err.code = 'PAID_SPEND_CALL_LIMIT';
    throw err;
  }
  if (retries > CALIBRATION_PAID_HARD_LIMITS.proposedMaxRetries) {
    const err = new Error('PAID_SPEND_RETRY_LIMIT');
    err.code = 'PAID_SPEND_RETRY_LIMIT';
    throw err;
  }
  if (maxSpend > CALIBRATION_PAID_HARD_LIMITS.maxSpendUsd + 1e-9) {
    const err = new Error('PAID_SPEND_USD_LIMIT');
    err.code = 'PAID_SPEND_USD_LIMIT';
    throw err;
  }
  if (expected > maxSpend + 1e-9 && maxSpend > 0) {
    const err = new Error('PAID_SPEND_USD_LIMIT');
    err.code = 'PAID_SPEND_USD_LIMIT';
    throw err;
  }
  return true;
}

export function assertCalibrationPaidMayExecute(parsed) {
  const command = parsed || parseCalibrationPaidCommand([]);
  if (command.model !== CALIBRATION_PAID_MODEL || command.modelMatched === false) {
    const err = new Error('PAID_SPEND_MODEL_DENIED');
    err.code = 'PAID_SPEND_MODEL_DENIED';
    throw err;
  }
  if (command.runId !== CALIBRATION_PAID_RUN_ID || command.runIdMatched === false) {
    const err = new Error('PAID_SPEND_DENIED');
    err.code = 'PAID_SPEND_DENIED';
    throw err;
  }
  if (command.approvalState !== 'APPROVED' || command.defaultDeny === true || !command.identityMatched) {
    const err = new Error('PAID_SPEND_DENIED');
    err.code = 'PAID_SPEND_DENIED';
    throw err;
  }
  assertCalibrationHardLimits(command);
  return assertSpendEnvelope(command, { attemptedCalls: 0, jobsStarted: 0, spentUsd: 0 });
}

export async function proveCalibrationPaidPreflight(options = {}) {
  const proposal = proposedCalibrationEnvelope();
  assertCalibrationHardLimits(proposal);
  const denied = parseCalibrationPaidCommand([]);
  const allowPaidOnly = parseCalibrationPaidCommand(['--allow-paid-calls=12']);
  const completeButUnapproved = parseCalibrationPaidCommand(FUTURE_CALIBRATION_PAID_COMMAND.slice(2));
  const overJobs = { ...proposal, maxJobs: 9 };
  const overCalls = { ...proposal, maxCalls: 13 };
  const overRetries = { ...proposal, proposedMaxRetries: 5 };
  const overSpend = { ...proposal, maxSpendUsd: 1.51 };
  const wrongModel = parseCalibrationPaidCommand([
    `--run-id=${CALIBRATION_PAID_RUN_ID}`,
    `--approve-envelope=${CALIBRATION_PAID_RUN_ID}`,
    '--provider=openai-images-api',
    '--model=gpt-image-2',
    '--max-jobs=8',
    '--max-calls=12',
    '--max-retries=4',
    '--max-spend-usd=1.50'
  ]);
  const wrongRunId = parseCalibrationPaidCommand([
    '--run-id=design-asset-calibration-batch-999',
    '--approve-envelope=design-asset-calibration-batch-999',
    '--provider=openai-images-api',
    `--model=${CALIBRATION_PAID_MODEL}`,
    '--max-jobs=8',
    '--max-calls=12',
    '--max-retries=4',
    '--max-spend-usd=1.50'
  ]);

  const proofs = {
    withoutApprovalDenied: denied.defaultDeny === true && denied.approvalState === 'DENIED',
    withoutApprovalNetworkCalls: 0,
    allowPaidCallsAloneDenied: allowPaidOnly.defaultDeny === true && allowPaidOnly.allowPaidAlone === true,
    matchingCommandStillDenied:
      completeButUnapproved.identityMatched === true &&
      completeButUnapproved.modelMatched === true &&
      completeButUnapproved.defaultDeny === true,
    wrongModelDenied: wrongModel.defaultDeny === true && wrongModel.modelMatched === false,
    wrongRunIdDenied: wrongRunId.defaultDeny === true && wrongRunId.runIdMatched === false,
    noCarryForward: proposal.carryForward === false,
    noAutomaticTopUp: proposal.automaticTopUp === false,
    noBackgroundRetryLoop: true,
    noKeyProbe: inspectOpenAiKeyPresence(options.apiKeyRaw).networkValidation === 'not-performed'
  };

  const throws = {};
  try {
    assertCalibrationPaidMayExecute(denied);
  } catch (err) {
    throws.denied = err.code;
  }
  try {
    assertCalibrationPaidMayExecute(allowPaidOnly);
  } catch (err) {
    throws.allowPaidAlone = err.code;
  }
  try {
    assertCalibrationPaidMayExecute(completeButUnapproved);
  } catch (err) {
    throws.completeUnapproved = err.code;
  }
  try {
    assertCalibrationHardLimits(overJobs);
  } catch (err) {
    throws.overJobs = err.code;
  }
  try {
    assertCalibrationHardLimits(overCalls);
  } catch (err) {
    throws.overCalls = err.code;
  }
  try {
    assertCalibrationHardLimits(overRetries);
  } catch (err) {
    throws.overRetries = err.code;
  }
  try {
    assertCalibrationHardLimits(overSpend);
  } catch (err) {
    throws.overSpend = err.code;
  }
  try {
    assertCalibrationPaidMayExecute(wrongModel);
  } catch (err) {
    throws.wrongModel = err.code;
  }
  try {
    assertCalibrationHardLimits({ ...proposal, model: 'gpt-image-2' });
  } catch (err) {
    throws.wrongModelHardLimit = err.code;
  }
  try {
    assertCalibrationPaidMayExecute(wrongRunId);
  } catch (err) {
    throws.wrongRunId = err.code;
  }

  let generateCode = null;
  try {
    await generateAsset({ jobId: 'preflight' }, { envelope: parseSpendEnvelope([]), allowNetwork: true });
  } catch (err) {
    generateCode = err.code;
  }

  const factory = runFactory(['--allow-paid-calls=12'], { plants: [], apiKeyRaw: options.apiKeyRaw || '' });

  return {
    proposal,
    proofs,
    throws,
    generateCode,
    factoryNetworkRequests: factory.networkRequests,
    factoryImagesGenerated: factory.imagesGenerated,
    factoryAttemptedCalls: factory.attemptedCalls,
    futureCommand: FUTURE_CALIBRATION_PAID_COMMAND,
    executedFutureCommand: false,
    networkCalls: 0,
    imageGeneration: 0,
    paidCalls: 0
  };
}
