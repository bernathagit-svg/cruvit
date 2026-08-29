const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' };
function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function svgPlaceholder(query) {
  const name = String(query || 'Plant')
    .replace(/[<>&]/g, '')
    .slice(0, 38);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#e9f3df"/><stop offset="1" stop-color="#fff2cc"/></linearGradient></defs><rect width="900" height="520" fill="url(#g)"/><circle cx="450" cy="225" r="82" fill="#dcefd2"/><text x="450" y="245" text-anchor="middle" font-size="84">🌿</text><text x="450" y="350" text-anchor="middle" font-family="Arial" font-size="32" font-weight="700" fill="#0d3d27">${name}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/**
 * Defense-in-depth: catalog images are resolved at ingest time only.
 * Runtime must not search Wikipedia / Commons / Openverse.
 */
export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: corsHeaders });
  }
  const url = new URL(request.url);
  const query = url.searchParams.get('query') || url.searchParams.get('q') || '';
  const redirect = url.searchParams.get('redirect') === '1';
  const payload = {
    imageUrl: '',
    searched: false,
    disabled: true,
    reason: 'licensed-catalog-media-runtime-v1',
    message:
      'Runtime plant-image search is disabled. Use approved catalog IMAGE_READY media or IMAGE_PENDING placeholder.'
  };
  if (redirect) {
    return new Response('', {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: svgPlaceholder(query || 'Plant'),
        'Cache-Control': 'public, max-age=3600',
        'X-Cruvit-Media-Search': 'disabled'
      }
    });
  }
  if (!String(query || '').trim()) {
    return json(400, { ...payload, error: 'Missing query' });
  }
  return json(200, payload);
}
