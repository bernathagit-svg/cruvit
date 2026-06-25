const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' };
function json(status, body) { return new Response(JSON.stringify(body), { status, headers: jsonHeaders }); }
function validImageUrl(img) { return img && /^https?:\/\//i.test(img) && !/\.svg($|\?)/i.test(img) && !/source\.unsplash\.com/i.test(img); }
async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'CruvitPlantImage/1.0' } });
  if (!res.ok) return null;
  return await res.json().catch(() => null);
}
async function fetchWikipediaImage(query) {
  const q = String(query || '').trim();
  if (!q) return '';
  const variants = [...new Set([
    q,
    q.replace(/\b(tree|vine|plant|flower|shrub|herb|fruit|photo)\b/gi, '').trim(),
    q + ' plant',
    q + ' leaves flower fruit'
  ].filter(Boolean))];
  for (const term of variants) {
    const searchUrl = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({
      action: 'query', generator: 'search', gsrsearch: term, gsrlimit: '10',
      prop: 'pageimages|description', piprop: 'thumbnail|original', pithumbsize: '1200',
      format: 'json', origin: '*'
    }).toString();
    const data = await fetchJson(searchUrl);
    const pages = Object.values(data?.query?.pages || {});
    const ranked = pages.sort((a,b)=>{
      const ax=/plant|tree|flower|fruit|species|shrub|vine|herb|berry|citrus|rubus|garden/i.test(String(a.description||'')+' '+String(a.title||''))?1:0;
      const bx=/plant|tree|flower|fruit|species|shrub|vine|herb|berry|citrus|rubus|garden/i.test(String(b.description||'')+' '+String(b.title||''))?1:0;
      return bx-ax;
    });
    for (const page of ranked) {
      const img = page?.original?.source || page?.thumbnail?.source || '';
      if (validImageUrl(img)) return img;
    }
  }
  for (const term of variants) {
    const commonsUrl = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
      action: 'query', generator: 'search', gsrnamespace: '6', gsrsearch: term,
      gsrlimit: '15', prop: 'imageinfo', iiprop: 'url|mime', iiurlwidth: '1200',
      format: 'json', origin: '*'
    }).toString();
    const data = await fetchJson(commonsUrl);
    const pages = Object.values(data?.query?.pages || {});
    for (const page of pages) {
      const info = page?.imageinfo?.[0] || {};
      if (info.mime && !/^image\//.test(info.mime)) continue;
      const img = info.thumburl || info.url || '';
      if (validImageUrl(img)) return img;
    }
  }
  return '';
}
function svgPlaceholder(query){
  const name = String(query||'Plant').replace(/[<>&]/g,'').slice(0,38);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#e9f3df"/><stop offset="1" stop-color="#fff2cc"/></linearGradient></defs><rect width="900" height="520" fill="url(#g)"/><circle cx="450" cy="225" r="82" fill="#dcefd2"/><text x="450" y="245" text-anchor="middle" font-size="84">🌿</text><text x="450" y="350" text-anchor="middle" font-family="Arial" font-size="32" font-weight="700" fill="#0d3d27">${name}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response('', { status: 200, headers: corsHeaders });
  const url = new URL(request.url);
  const query = url.searchParams.get('query') || url.searchParams.get('q') || '';
  const redirect = url.searchParams.get('redirect') === '1';
  if (!query.trim()) return json(400, { imageUrl: '', error: 'Missing query' });
  try {
    const imageUrl = await fetchWikipediaImage(query);
    if (redirect) {
      const loc = imageUrl || svgPlaceholder(query);
      return new Response('', { status: 302, headers: { ...corsHeaders, Location: loc, 'Cache-Control': 'public, max-age=86400' } });
    }
    return json(200, { imageUrl: imageUrl || svgPlaceholder(query) });
  } catch (e) {
    if (redirect) return new Response('', { status: 302, headers: { ...corsHeaders, Location: svgPlaceholder(query) } });
    return json(200, { imageUrl: svgPlaceholder(query), error: e?.message || 'Image lookup failed' });
  }
}
export const config = { path: '/.netlify/functions/plant-image' };
