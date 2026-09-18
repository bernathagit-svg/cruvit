/**
 * Total expected API spend for gpt-image-2 (image output + text input).
 * Published rates, not a live quote. Exact per-run tokens are unknown until usage returns.
 */
import { PAID_IMAGE_OUTPUT_USD_MEDIUM_1024x1536 } from '../../runtime-guards/paid-image-spend-gate-v1.js';

export const GPT_IMAGE_2_PUBLISHED_RATES = Object.freeze({
  source: 'openai-published-token-rates',
  asOf: '2026-05',
  label: 'PUBLISHED_RATES_NOT_A_LIVE_QUOTE',
  textInputUsdPer1MTokens: 5,
  cachedTextInputUsdPer1MTokens: 1.25,
  imageInputUsdPer1MTokens: 8,
  imageOutputUsdPer1MTokens: 30,
  knownImageOutputUsdMedium1024x1536: PAID_IMAGE_OUTPUT_USD_MEDIUM_1024x1536
});

/** Typical factory prompt is a few hundred tokens. 10k is a tokenizer / template-growth buffer. */
export const CONSERVATIVE_TEXT_INPUT_TOKENS_PER_CALL = 10_000;

export const CALIBRATION_CALL_PLAN = Object.freeze({
  initialCalls: 8,
  proposedRetries: 4,
  maximumTotalCalls: 12,
  imageInputUsdPerCall: 0,
  imageInputNote: 'Calibration uses native generation, not reference-image edits. Image-input spend is $0 unless the envelope is revised.'
});

export function textInputAllowanceUsdPerCall(
  tokens = CONSERVATIVE_TEXT_INPUT_TOKENS_PER_CALL,
  usdPer1M = GPT_IMAGE_2_PUBLISHED_RATES.textInputUsdPer1MTokens
) {
  return +((Number(tokens) * Number(usdPer1M)) / 1_000_000).toFixed(6);
}

export function totalExpectedUsdPerCall(options = {}) {
  const imageOutput = Number(
    options.imageOutputUsd ?? GPT_IMAGE_2_PUBLISHED_RATES.knownImageOutputUsdMedium1024x1536
  );
  const text = Number(
    options.textInputUsd ?? textInputAllowanceUsdPerCall(options.textTokens)
  );
  const imageInput = Number(options.imageInputUsd ?? CALIBRATION_CALL_PLAN.imageInputUsdPerCall);
  return +(imageOutput + text + imageInput).toFixed(6);
}

export function estimateCalibrationApiSpend(options = {}) {
  const initialCalls = Number(options.initialCalls ?? CALIBRATION_CALL_PLAN.initialCalls);
  const maxCalls = Number(options.maximumTotalCalls ?? CALIBRATION_CALL_PLAN.maximumTotalCalls);
  const imageOutputEach = GPT_IMAGE_2_PUBLISHED_RATES.knownImageOutputUsdMedium1024x1536;
  const textEach = textInputAllowanceUsdPerCall();
  const imageInputEach = CALIBRATION_CALL_PLAN.imageInputUsdPerCall;
  const perCall = totalExpectedUsdPerCall();
  const imageOutputMax = +(maxCalls * imageOutputEach).toFixed(6);
  const textMax = +(maxCalls * textEach).toFixed(6);
  const expectedTotalAtMaxCalls = +(maxCalls * perCall).toFixed(6);
  const insufficientHalfDollar = 0.5;
  const maxSpendUsd = 1.5;
  return {
    provider: 'openai-images-api',
    model: 'gpt-image-2',
    initialCalls,
    proposedRetries: CALIBRATION_CALL_PLAN.proposedRetries,
    maximumTotalCalls: maxCalls,
    imageOutputUsdEach: imageOutputEach,
    imageOutputEstimateUsd: +(initialCalls * imageOutputEach).toFixed(6),
    imageOutputMaxUsd: imageOutputMax,
    knownTextInputPricing: {
      usdPer1MTokens: GPT_IMAGE_2_PUBLISHED_RATES.textInputUsdPer1MTokens,
      cachedUsdPer1MTokens: GPT_IMAGE_2_PUBLISHED_RATES.cachedTextInputUsdPer1MTokens,
      source: GPT_IMAGE_2_PUBLISHED_RATES.source,
      asOf: GPT_IMAGE_2_PUBLISHED_RATES.asOf,
      label: GPT_IMAGE_2_PUBLISHED_RATES.label
    },
    conservativeTextInputAllowance: {
      tokensPerCall: CONSERVATIVE_TEXT_INPUT_TOKENS_PER_CALL,
      usdPerCall: textEach,
      usdAtMaxCalls: textMax,
      why: 'Exact prompt token counts are unknown until the provider returns usage. 10k tokens/call is ~20× a typical factory prompt.'
    },
    imageInputUsdEach: imageInputEach,
    imageInputNote: CALIBRATION_CALL_PLAN.imageInputNote,
    expectedTotalUsdPerCall: perCall,
    expectedTotalApiSpendUsdAtInitialCalls: +(initialCalls * perCall).toFixed(6),
    expectedTotalApiSpendUsdAtMaxCalls: expectedTotalAtMaxCalls,
    rejectedMaxSpendUsd: insufficientHalfDollar,
    rejectedMaxSpendReason:
      '$0.50 only covers image-output for 12 medium 1024×1536 calls ($0.492) and leaves essentially no text-input margin.',
    maxSpendUsd,
    marginUsd: +(maxSpendUsd - expectedTotalAtMaxCalls).toFixed(6),
    whyConservativeCap: `Exact per-run total cannot be known before execution. Published text-input is $5/1M tokens; tokenizer output is unknown until usage. Cap $${maxSpendUsd.toFixed(2)} covers ${maxCalls} × $${perCall.toFixed(3)} ($${expectedTotalAtMaxCalls.toFixed(3)}) plus ~$${+(
      maxSpendUsd - expectedTotalAtMaxCalls
    ).toFixed(2)} margin for rate/tokenizer drift.`,
    gateMustEnforce: 'total-expected-api-spend',
    authorized: false,
    approved: false,
    label: 'PROPOSAL_ONLY'
  };
}

export function proposeSafeCalibrationEnvelope() {
  const spend = estimateCalibrationApiSpend();
  return {
    runId: 'design-asset-calibration-batch-1',
    provider: spend.provider,
    model: spend.model,
    maxJobs: spend.initialCalls,
    maxCalls: spend.maximumTotalCalls,
    maxRetries: spend.proposedRetries,
    maxSpendUsd: spend.maxSpendUsd,
    usdPerImageOutput: spend.imageOutputUsdEach,
    usdPerTextInputAllowance: spend.conservativeTextInputAllowance.usdPerCall,
    usdPerCallTotal: spend.expectedTotalUsdPerCall,
    defaultDeny: true,
    carryForward: false,
    authorized: false,
    approved: false,
    spend
  };
}
