// Cruvit Botanical Engine v2 — stable Netlify endpoint.
// All modules should call /.netlify/functions/plant-knowledge.

import handler, { ENGINE_VERSION } from './botanical-engine-v2/engine.mjs';
import { corsHeaders, jsonResponse } from './botanical-engine-v2/utils.mjs';
import { isPaidLegacyRuntimeAllowed, paidLegacyRuntimeDisabledResponse } from '../../modules/runtime-guards/paid-plant-identifier-gate-v1.js';

export default async function plantKnowledge(request) {
  if (request.method === 'OPTIONS') return new Response('', { status: 200, headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { isPlant: false, error: 'Use POST', engineVersion: ENGINE_VERSION });

  if (!isPaidLegacyRuntimeAllowed()) {
    const disabled = paidLegacyRuntimeDisabledResponse();
    return jsonResponse(disabled.status, disabled.body);
  }

  return handler(request);
}

export const config = {
  path: '/.netlify/functions/plant-knowledge'
};
