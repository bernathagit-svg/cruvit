const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' };
function json(status, body) { return new Response(JSON.stringify(body), { status, headers: jsonHeaders }); }
function validImageUrl(img) { return img && /^https?:\/\//i.test(img) && !/\.svg($|\?)/i.test(img) && !/source\.unsplash\.com/i.test(img); }

function cleanImageSearchTerm(term) {
  return String(term || '')
    .trim()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+(L|Jacq|Mill|Thunb|DC|Aiton|Pers|Moc|Sess)\.?\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[׳’`'״"]/g, '')
    .replace(/\s+/g, ' ');
}

function genusSpeciesParts(query) {
  const cleaned = cleanImageSearchTerm(query);
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return { genus: parts[0] || '', species: parts[1] || '', cleaned };
}

function scoreImagePage(page, query) {
  const { genus, species, cleaned } = genusSpeciesParts(query);
  const title = normalizeText(page?.title || '');
  const q = normalizeText(cleaned);
  let score = 0;

  if (title === q) score += 120;
  else if (species && title.includes(`${normalizeText(genus)} ${normalizeText(species)}`)) score += 100;
  else if (genus && title === normalizeText(genus)) score += 70;
  else if (genus && title.includes(normalizeText(genus))) score += 35;
  else score -= 40;

  if (/plant|tree|flower|fruit|species|shrub|vine|herb|genus|family/i.test(`${page?.title || ''} ${page?.description || ''}`)) score += 12;
  if (/acid metabolism|pineapple|region in|volcano|beach|territory|hills|physical map|resort|keyboard|album|film|song/i.test(`${page?.title || ''} ${page?.description || ''}`)) {
    score -= 160;
  }

  return score;
}

function imageMatchesTaxon(imageUrl, pageTitle, query) {
  const { genus } = genusSpeciesParts(query);
  const blob = normalizeText(`${decodeURIComponent(imageUrl || '')} ${pageTitle || ''}`);
  if (genus && blob.includes(normalizeText(genus))) return true;
  if (/pineapple|ananas|lychee|volcano|keyboard|map\.png|resort|beach/i.test(blob) && genus && !/ananas|pineapple/i.test(normalizeText(genus))) {
    return false;
  }
  return scoreImagePage({ title: pageTitle }, query) >= 25;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'CruvitPlantImage/1.0' } });
  if (!res.ok) return null;
  return await res.json().catch(() => null);
}

async function fetchWikipediaSummaryImage(query) {
  const cleaned = cleanImageSearchTerm(query);
  if (!cleaned) return '';
  const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(cleaned.replace(/\s+/g, '_'));
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'CruvitPlantImage/1.0' } });
  if (!res.ok) return '';
  const data = await res.json().catch(() => null);
  if (!data || data.type === 'disambiguation') return '';
  for (const img of [data.originalimage?.source, data.thumbnail?.source]) {
    if (validImageUrl(img) && imageMatchesTaxon(img, data.title || cleaned, cleaned)) return img;
  }
  return '';
}

async function fetchWikipediaImage(query) {
  const cleaned = cleanImageSearchTerm(query);
  if (!cleaned) return '';

  const searchUrl = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: cleaned, gsrlimit: '12',
    prop: 'pageimages|description', piprop: 'thumbnail|original', pithumbsize: '1200',
    format: 'json', origin: '*'
  }).toString();
  const data = await fetchJson(searchUrl);
  const ranked = Object.values(data?.query?.pages || {})
    .map(page => ({ page, score: scoreImagePage(page, cleaned) }))
    .filter(entry => entry.score >= 25)
    .sort((a, b) => b.score - a.score);

  for (const { page } of ranked) {
    const img = page?.original?.source || page?.thumbnail?.source || '';
    if (validImageUrl(img) && imageMatchesTaxon(img, page.title, cleaned)) return img;
  }
  return '';
}

async function fetchCommonsImage(query) {
  const cleaned = cleanImageSearchTerm(query);
  if (!cleaned) return '';

  const commonsUrl = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', generator: 'search', gsrnamespace: '6', gsrsearch: cleaned,
    gsrlimit: '15', prop: 'imageinfo', iiprop: 'url|mime', iiurlwidth: '1200',
    format: 'json', origin: '*'
  }).toString();
  const data = await fetchJson(commonsUrl);
  for (const page of Object.values(data?.query?.pages || {})) {
    const title = page?.title || '';
    if (scoreImagePage({ title, description: title }, cleaned) < 25) continue;
    const info = page?.imageinfo?.[0] || {};
    if (info.mime && !/^image\//.test(info.mime)) continue;
    const img = info.thumburl || info.url || '';
    if (validImageUrl(img) && imageMatchesTaxon(img, title, cleaned)) return img;
  }
  return '';
}

async function fetchWikipediaImageBundle(query) {
  const cleaned = cleanImageSearchTerm(query);
  if (!cleaned) return '';

  const direct = await fetchWikipediaSummaryImage(cleaned);
  if (direct) return direct;

  const fromWiki = await fetchWikipediaImage(cleaned);
  if (fromWiki) return fromWiki;

  return fetchCommonsImage(cleaned);
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
    const imageUrl = await fetchWikipediaImageBundle(query);
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
