export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

export function text(value, fallback = '') {
  return String(value ?? fallback ?? '').trim();
}

export function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(value => value !== null && value !== undefined)
    .map(value => String(value).trim())
    .filter(Boolean);
}

export function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[׳’`'״"]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');
}

export function stripGenericPlantWords(value) {
  return String(value ?? '')
    .replace(/\b(tree|plant|flower|shrub|vine|herb|fruit|houseplant|garden|photo|picture|image)\b/gi, ' ')
    .replace(/\b(עץ|צמח|פרח|שיח|מטפס|פרי|גינה|תמונה)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isHebrew(value) {
  return /[\u0590-\u05FF]/.test(String(value ?? ''));
}

export function unique(values) {
  return [...new Set(values.map(value => text(value)).filter(Boolean))];
}

export function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

export function validImageUrl(value) {
  const url = text(value);
  return Boolean(url)
    && /^https?:\/\//i.test(url)
    && !/\.svg(?:$|\?)/i.test(url)
    && !/source\.unsplash\.com|loremflickr\.com/i.test(url);
}

export function cleanJsonText(value) {
  let output = text(value)
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const first = output.indexOf('{');
  const last = output.lastIndexOf('}');
  if (first >= 0 && last > first) output = output.slice(first, last + 1);
  return output || '{}';
}

export function getOpenAIKey() {
  return process.env.OPENAI_API_KEY
    || process.env.OPENAI_KEY
    || process.env.OPENAI_API_TOKEN
    || process.env.OPENAI_SECRET_KEY
    || '';
}

const responseCache = new Map();

export function cacheGet(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return entry.value;
}

export function cacheSet(key, value, ttlMs = 15 * 60 * 1000) {
  responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  if (responseCache.size > 300) {
    const oldestKey = responseCache.keys().next().value;
    responseCache.delete(oldestKey);
  }
  return value;
}

export async function fetchJson(url, options = {}, timeoutMs = 9000) {
  const cacheKey = options.method && options.method !== 'GET' ? '' : `GET:${url}`;
  if (cacheKey) {
    const cached = cacheGet(cacheKey);
    if (cached !== null) return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CruvitBotanicalEngine/2.0',
        ...(options.headers || {})
      }
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    if (cacheKey && data !== null) cacheSet(cacheKey, data, 30 * 60 * 1000);
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
