import { fetchJson, normalizeText, text, unique, validImageUrl } from '../utils.mjs';
import { isObviouslyNonPlant, looksBotanicalText } from '../guards.mjs';

export function cleanImageSearchTerm(term) {
  return text(term)
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+(L|Jacq|Mill|Thunb|DC|Aiton|Pers|Moc|Sess)\.?\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
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

  if (looksBotanicalText([page?.title, page?.description])) score += 12;
  if (isObviouslyNonPlant([page?.title, page?.description])) score -= 300;
  if (/acid metabolism|pineapple|region in|volcano|beach|territory|hills|physical map|resort|keyboard|album|film|song/i.test(`${page?.title || ''} ${page?.description || ''}`)) {
    score -= 160;
  }

  return score;
}

function imageFromSummary(summary) {
  if (!summary) return '';
  for (const img of [summary.originalimage?.source, summary.thumbnail?.source, summary.thumbnail?.url]) {
    if (validImageUrl(img)) return img;
  }
  return '';
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

export async function wikipediaSummary(title) {
  const query = cleanImageSearchTerm(title);
  if (!query) return null;
  const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(query.replace(/\s+/g, '_'));
  const data = await fetchJson(url, {}, 8000);
  if (!data || data.type === 'disambiguation') return null;
  if (isObviouslyNonPlant([data.title, data.description, data.extract])) return null;
  if (!looksBotanicalText([data.title, data.description, data.extract])) return null;
  return data;
}

async function wikipediaImage(query) {
  const cleaned = cleanImageSearchTerm(query);
  if (!cleaned) return '';

  const url = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: cleaned,
    gsrlimit: '12',
    prop: 'pageimages|description',
    piprop: 'thumbnail|original',
    pithumbsize: '1200',
    format: 'json',
    origin: '*'
  });
  const data = await fetchJson(url, {}, 9000);
  const pages = Object.values(data?.query?.pages || {})
    .map(page => ({ page, score: scoreImagePage(page, cleaned) }))
    .filter(entry => entry.score >= 25)
    .sort((a, b) => b.score - a.score);

  for (const { page } of pages) {
    if (isObviouslyNonPlant([page.title, page.description])) continue;
    const image = page?.original?.source || page?.thumbnail?.source || '';
    if (validImageUrl(image) && imageMatchesTaxon(image, page.title, cleaned)) return image;
  }
  return '';
}

async function commonsImage(query) {
  const cleaned = cleanImageSearchTerm(query);
  if (!cleaned) return '';

  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: cleaned,
    gsrlimit: '15',
    prop: 'imageinfo',
    iiprop: 'url|mime',
    iiurlwidth: '1200',
    format: 'json',
    origin: '*'
  });
  const data = await fetchJson(url, {}, 9000);
  const pages = Object.values(data?.query?.pages || {});

  for (const page of pages) {
    const title = page?.title || '';
    if (scoreImagePage({ title, description: title }, cleaned) < 25) continue;
    const info = page?.imageinfo?.[0] || {};
    if (info.mime && !/^image\//i.test(info.mime)) continue;
    const image = info.thumburl || info.url || '';
    if (validImageUrl(image) && imageMatchesTaxon(image, title, cleaned)) return image;
  }
  return '';
}

export async function resolveBotanicalImage(terms) {
  for (const rawTerm of unique(terms).slice(0, 6)) {
    const term = cleanImageSearchTerm(rawTerm);
    if (!term) continue;

    const summary = await wikipediaSummary(term).catch(() => null);
    const directImage = imageFromSummary(summary);
    if (directImage && imageMatchesTaxon(directImage, summary?.title || term, term)) return directImage;

    const variants = unique([
      term,
      `${genusSpeciesParts(term).genus} ${genusSpeciesParts(term).species}`.trim()
    ]).filter(Boolean);

    for (const variant of variants) {
      const fromWikipedia = await wikipediaImage(variant);
      if (fromWikipedia) return fromWikipedia;
      const fromCommons = await commonsImage(variant);
      if (fromCommons) return fromCommons;
    }
  }
  return '';
}
