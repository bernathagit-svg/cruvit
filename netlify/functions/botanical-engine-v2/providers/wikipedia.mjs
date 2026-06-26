import { fetchJson, text, unique, validImageUrl } from '../utils.mjs';
import { isObviouslyNonPlant, looksBotanicalText } from '../guards.mjs';

export async function wikipediaSummary(title) {
  const query = text(title);
  if (!query) return null;
  const url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(query);
  const data = await fetchJson(url, {}, 8000);
  if (!data || data.type === 'disambiguation') return null;
  if (isObviouslyNonPlant([data.title, data.description, data.extract])) return null;
  if (!looksBotanicalText([data.title, data.description, data.extract])) return null;
  return data;
}

async function wikipediaImage(query) {
  const url = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: '10',
    prop: 'pageimages|description',
    piprop: 'thumbnail|original',
    pithumbsize: '1200',
    format: 'json',
    origin: '*'
  });
  const data = await fetchJson(url, {}, 9000);
  const pages = Object.values(data?.query?.pages || {});
  for (const page of pages) {
    if (isObviouslyNonPlant([page.title, page.description])) continue;
    const image = page?.original?.source || page?.thumbnail?.source || '';
    if (validImageUrl(image)) return image;
  }
  return '';
}

async function commonsImage(query) {
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: query,
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
    const info = page?.imageinfo?.[0] || {};
    if (info.mime && !/^image\//i.test(info.mime)) continue;
    const image = info.thumburl || info.url || '';
    if (validImageUrl(image)) return image;
  }
  return '';
}

export async function resolveBotanicalImage(terms) {
  for (const term of unique(terms).slice(0, 6)) {
    const fromWikipedia = await wikipediaImage(`${term} plant`);
    if (fromWikipedia) return fromWikipedia;
    const fromCommons = await commonsImage(`${term} plant`);
    if (fromCommons) return fromCommons;
  }
  return '';
}
