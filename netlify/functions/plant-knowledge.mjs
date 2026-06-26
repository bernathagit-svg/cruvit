// Cruvit Botanical Engine v2 — stable Netlify endpoint.
// All modules should call /.netlify/functions/plant-knowledge.

import handler from './botanical-engine-v2/engine.mjs';

export default handler;

export const config = {
  path: '/.netlify/functions/plant-knowledge'
};
