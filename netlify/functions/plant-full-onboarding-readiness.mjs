import { evaluateLiveFullPlantOnboarding } from './_plant-full-onboarding-gate-v1.mjs';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type':'application/json; charset=utf-8',
      'cache-control':'private, no-store',
      'x-robots-tag':'noindex, nofollow'
    }
  });
}

function safeSlug(value) {
  const s = String(value || '').trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) ? s : '';
}

export default async (req) => {
  if (req.method !== 'GET') return json(405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  const url = new URL(req.url);
  const raw = String(url.searchParams.get('slugs') || '');
  const slugs = raw.split(',').map(safeSlug).filter(Boolean);
  if (!slugs.length) return json(400,{ok:false,code:'SLUGS_REQUIRED'});
  if (slugs.length > 50) return json(400,{ok:false,code:'TOO_MANY_SLUGS'});
  const expectedRows = slugs.map((canonicalSlug) => ({
    canonicalSlug,
    scientific:null,
    phenology:'vegetative'
  }));
  try {
    const result = await evaluateLiveFullPlantOnboarding(expectedRows);
    return json(200,{ok:true,...result});
  } catch (err) {
    return json(500,{ok:false,code:err?.message||'FULL_PLANT_ONBOARDING_CHECK_FAILED'});
  }
};

export const config = {
  path: '/.netlify/functions/plant-full-onboarding-readiness'
};
