/**
 * Provider-agnostic generateAsset interface.
 * Registry identity does not include provider. Adapters may change later.
 * This module never opens a network socket. Live generation stays disabled
 * unless a future owner-approved runner sets allowNetwork on an envelope.
 */
import { assertSpendEnvelope } from './spend-envelope-v1.js';

export const FACTORY_PROVIDERS = Object.freeze({
  OPENAI_IMAGES: 'openai-images-api',
  STABILITY: 'stability',
  REPLICATE: 'replicate',
  LOCAL_GPU: 'local-model-gpu',
  FUTURE: 'future-provider'
});

function denyNetwork(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

export function createProviderResult(partial = {}) {
  return {
    provider: partial.provider || 'unspecified',
    model: partial.model || 'unspecified',
    actualCalls: Number(partial.actualCalls || 0),
    usage: partial.usage || null,
    costUsd: partial.costUsd == null ? null : Number(partial.costUsd),
    outputMetadata: partial.outputMetadata || null,
    failureCode: partial.failureCode || null,
    bytes: partial.bytes || null
  };
}

const ADAPTERS = Object.freeze({
  [FACTORY_PROVIDERS.OPENAI_IMAGES]: async () =>
    denyNetwork('FACTORY_NETWORK_DENIED', 'OpenAI adapter is architecture-only; network is disabled'),
  [FACTORY_PROVIDERS.STABILITY]: async () =>
    denyNetwork('FACTORY_NETWORK_DENIED', 'Stability adapter is architecture-only; network is disabled'),
  [FACTORY_PROVIDERS.REPLICATE]: async () =>
    denyNetwork('FACTORY_NETWORK_DENIED', 'Replicate adapter is architecture-only; network is disabled'),
  [FACTORY_PROVIDERS.LOCAL_GPU]: async () =>
    denyNetwork('FACTORY_NETWORK_DENIED', 'Local GPU adapter is architecture-only; network is disabled'),
  [FACTORY_PROVIDERS.FUTURE]: async () =>
    denyNetwork('FACTORY_NETWORK_DENIED', 'Future provider adapter is architecture-only; network is disabled')
});

/**
 * @param {object} job
 * @param {{ envelope: object, allowNetwork?: boolean, provider?: string }} settings
 */
export async function generateAsset(job, settings = {}) {
  assertSpendEnvelope(settings.envelope, settings.counters || {});
  if (settings.allowNetwork !== true) {
    denyNetwork(
      'FACTORY_NETWORK_DENIED',
      'generateAsset default-deny: allowNetwork is false. No provider call.'
    );
  }
  const provider = settings.provider || settings.envelope?.provider;
  const adapter = ADAPTERS[provider];
  if (!adapter) {
    denyNetwork('FACTORY_PROVIDER_UNKNOWN', `Unknown provider: ${provider}`);
  }
  return adapter(job, settings);
}

export function listFactoryProviders() {
  return Object.values(FACTORY_PROVIDERS);
}
