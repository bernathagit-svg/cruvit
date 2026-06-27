const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
]);

// Anthropic direct API: up to ~10 MB base64; keep a safe decoded cap for reliability.
const MAX_DECODED_BYTES = 4_800_000;
const MAX_BASE64_CHARS = 6_800_000;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function errorMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return cleanText(error);
  if (typeof error?.message === 'string') return cleanText(error.message);
  if (typeof error?.error?.message === 'string') return cleanText(error.error.message);
  return cleanText(String(error));
}

function normalizeMediaType(value) {
  const raw = cleanText(value).toLowerCase();
  if (!raw) return '';
  if (raw === 'image/jpg' || raw === 'image/pjpeg') return 'image/jpeg';
  return raw;
}

function sanitizeBase64(value) {
  let raw = cleanText(value);
  if (!raw) return '';

  const embedded = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (embedded) raw = embedded[2];

  raw = raw
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/[^A-Za-z0-9+/=]/g, '');

  const remainder = raw.length % 4;
  if (remainder) raw += '='.repeat(4 - remainder);

  return raw;
}

function isValidBase64(value) {
  if (!value || value.length < 16) return false;
  if (value.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;

  try {
    Buffer.from(value, 'base64');
    return true;
  } catch {
    return false;
  }
}

function decodedByteLength(base64) {
  try {
    return Buffer.from(base64, 'base64').length;
  } catch {
    const padding = (base64.match(/=+$/) || [''])[0].length;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  }
}

function sniffMediaType(base64) {
  try {
    const header = Buffer.from(base64.slice(0, 48), 'base64');
    if (header.length >= 2 && header[0] === 0xff && header[1] === 0xd8) return 'image/jpeg';
    if (header.length >= 2 && header[0] === 0x89 && header[1] === 0x50) return 'image/png';
    if (header.length >= 3 && header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) {
      return 'image/gif';
    }
    if (header.length >= 12 && header.slice(0, 4).toString('ascii') === 'RIFF' && header.slice(8, 12).toString('ascii') === 'WEBP') {
      return 'image/webp';
    }
  } catch {}

  return '';
}

function parseImageInput(body = {}) {
  const dataUrl = cleanText(body.imageDataUrl || body.dataUrl || body.image_url);
  const rawBase64 = body.imageBase64 || body.base64 || body.image_base64 || '';
  const declaredType = normalizeMediaType(
    body.mediaType || body.mimeType || body.media_type || body.contentType
  );

  if (dataUrl.startsWith('data:')) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
    if (!match) {
      return { error: 'Invalid imageDataUrl format. Expected data:image/...;base64,...' };
    }

    return finalizeImagePayload(
      normalizeMediaType(match[1]) || declaredType,
      sanitizeBase64(match[2])
    );
  }

  const base64 = sanitizeBase64(rawBase64 || dataUrl);
  if (!base64) {
    return { error: 'Missing image data. Send imageDataUrl or imageBase64 with mediaType.' };
  }

  return finalizeImagePayload(declaredType, base64);
}

function finalizeImagePayload(mediaType, base64) {
  if (!base64) {
    return { error: 'Missing or invalid image data.' };
  }

  if (base64.length > MAX_BASE64_CHARS) {
    return { error: 'The image is too large. Please use a smaller image.' };
  }

  if (!isValidBase64(base64)) {
    return { error: 'Invalid base64 image data.' };
  }

  const byteLength = decodedByteLength(base64);
  if (!byteLength) {
    return { error: 'Image data is empty.' };
  }

  if (byteLength > MAX_DECODED_BYTES) {
    return { error: 'The image is too large. Please use a smaller image.' };
  }

  let resolvedType = normalizeMediaType(mediaType);
  if (!ALLOWED_MEDIA_TYPES.has(resolvedType)) {
    resolvedType = sniffMediaType(base64);
  }

  if (!ALLOWED_MEDIA_TYPES.has(resolvedType)) {
    return { error: 'Unsupported image format. Use JPEG, PNG, WEBP or GIF.' };
  }

  const sniffed = sniffMediaType(base64);
  if (sniffed && sniffed !== resolvedType) {
    // Prefer magic-byte detection when the declared MIME type does not match the payload.
    resolvedType = sniffed;
  }

  return {
    mediaType: resolvedType,
    data: base64,
    byteLength
  };
}

function extractJson(text) {
  const raw = cleanText(text);

  try {
    return JSON.parse(raw);
  } catch {}

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normalizeConfidence(value) {
  const raw = cleanText(value).toLowerCase();
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  return 'medium';
}

function cleanScientificName(value) {
  return cleanText(value)
    .replace(/\s+(Thunb|L\.|Mill|Jacq|Aiton|Cav|Lam|Hook|f|subsp|var|cv)\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanCommonName(value, scientificName = '') {
  const common = cleanText(value);
  const sci = cleanText(scientificName);
  if (!common) return sci.split(/\s+/)[0] || '';
  if (/^(Thunb|L\.|Mill|Jacq|Aiton|Cav|Lam|Hook|f)$/i.test(common)) return sci.split(/\s+/)[0] || common;
  if (/\bThunb\.?\b|\bL\.?\b|\bMill\.?\b/i.test(common) && !/\s/.test(common.replace(/[.]/g, ''))) {
    return sci.split(/\s+/)[0] || common.replace(/\s+(Thunb|L|Mill)\.?$/i, '').trim();
  }
  return common;
}

function makeCandidates(result) {
  const candidates = [];
  const seen = new Set();

  const add = (name, scientificName = '', confidence = '') => {
    const scientific = cleanScientificName(scientificName);
    const common = cleanCommonName(name, scientific);
    const key = `${common.toLowerCase()}|${scientific.toLowerCase()}`;

    if ((!common && !scientific) || seen.has(key)) return;

    seen.add(key);
    candidates.push({
      name: common || scientific,
      commonName: common,
      scientificName: scientific,
      confidence: normalizeConfidence(confidence)
    });
  };

  add(
    result?.common_name || result?.commonName,
    result?.scientific_name || result?.scientificName,
    result?.confidence
  );

  for (const alternative of Array.isArray(result?.alternatives)
    ? result.alternatives
    : []) {
    if (typeof alternative === 'string') {
      add(alternative);
    } else {
      add(
        alternative?.common_name ||
          alternative?.commonName ||
          alternative?.name,
        alternative?.scientific_name || alternative?.scientificName,
        alternative?.confidence
      );
    }
  }

  const rank = { high: 3, medium: 2, low: 1 };
  return candidates
    .sort((a, b) => (rank[b.confidence] || 0) - (rank[a.confidence] || 0))
    .slice(0, 4);
}

async function verifyCandidatesWithGbif(candidates) {
  const { resolveGbifTaxon } = await import('./botanical-engine-v2/providers/gbif.mjs');
  const verified = [];

  for (const candidate of candidates) {
    const queries = uniqueQueries([
      candidate.scientificName,
      candidate.commonName,
      candidate.name
    ]);
    if (!queries.length) continue;

    const resolved = await resolveGbifTaxon(queries, { maxQueries: 4 });
    if (!resolved.ok || !resolved.best) continue;

    const taxon = resolved.best;
    const scientificName = cleanText(taxon.scientificName || taxon.canonicalName);
    const commonName = cleanCommonName(
      candidate.commonName || taxon.vernacularName || taxon.canonicalName,
      scientificName
    );

    verified.push({
      ...candidate,
      name: commonName || scientificName,
      commonName,
      scientificName,
      gbifVerified: true,
      gbifRank: cleanText(taxon.rank),
      gbifScore: Number(taxon._score || 0),
      gbifKey: taxon.usageKey || taxon.key || ''
    });
  }

  return verified.sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 };
    const scoreA = (rank[a.confidence] || 0) * 10 + Number(a.gbifScore || 0);
    const scoreB = (rank[b.confidence] || 0) * 10 + Number(b.gbifScore || 0);
    return scoreB - scoreA;
  });
}

function uniqueQueries(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const q = cleanText(value);
    if (!q || q.length < 2) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

function genusKey(scientificName = '') {
  return cleanText(scientificName).split(/\s+/)[0].toLowerCase();
}

function collapseSameGenusCandidates(candidates) {
  if (!Array.isArray(candidates) || candidates.length <= 1) return candidates || [];

  const top = candidates[0];
  const topGenus = genusKey(top.scientificName);
  if (!topGenus) return candidates.slice(0, 1);

  const sameGenus = candidates.filter(
    candidate => genusKey(candidate.scientificName) === topGenus
  );

  if (sameGenus.length >= 2) {
    return [top];
  }

  return candidates.slice(0, 2);
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const key =
    process.env.ANTHROPIC_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.CLAUDE_API_KEY;

  if (!key) {
    return json(503, {
      error: 'Anthropic API key is missing in Netlify environment variables.'
    });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const image = parseImageInput(body);
  if (image?.error) {
    return json(400, { error: image.error });
  }

  const location = cleanText(body?.location);
  const climate = cleanText(body?.climate);

  const prompt = `You are an expert botanist identifying a real garden or house plant from a photo.
Return ONLY valid JSON, without markdown, in this exact shape:
{
  "common_name": "",
  "scientific_name": "",
  "confidence": "high|medium|low",
  "alternatives": [
    {"common_name":"", "scientific_name":"", "confidence":"high|medium|low"}
  ]
}
Rules:
- Identify from the image only. Location is context only: ${JSON.stringify(location || 'not provided')}, climate: ${JSON.stringify(climate || 'not provided')}.
- common_name must be a readable garden name (e.g. "Rose", "Weigela", "Lavender") — never a genus author citation like "Weigela Thunb.".
- scientific_name must be a real binomial when possible (Genus species), e.g. "Rosa gallica", "Weigela florida", "Lavandula angustifolia".
- If you can identify the species confidently, set confidence to "high" and return NO alternatives.
- Include alternatives ONLY when genuinely uncertain between 2 closely related species in the SAME genus.
- Never list unrelated genera as alternatives. Do not guess random shrubs.
- Never return multiple species from the same genus (e.g. do not list three Erythrina species). Pick the single best species match.
- Maximum 1 alternative. Omit the alternatives array when confidence is high.
- If the image is not a plant, return {"common_name":"","scientific_name":"","confidence":"low","alternatives":[]}.`;

  const preferred = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

  const models = [
    ...new Set(
      [
        preferred,
        'claude-sonnet-4-6',
        'claude-sonnet-4-5-20250929',
        'claude-haiku-4-5-20251001'
      ].filter(Boolean)
    )
  ];

  let lastError = null;

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 28000);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: 900,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: image.mediaType,
                    data: image.data
                  }
                },
                { type: 'text', text: prompt }
              ]
            }
          ]
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload?.error) {
        lastError = payload?.error || { message: 'Identification request failed.' };

        const message = errorMessage(lastError).toLowerCase();
        const modelProblem =
          message.includes('model') ||
          message.includes('not found') ||
          message.includes('invalid');

        if (modelProblem) continue;
        break;
      }

      const text = (payload?.content || [])
        .filter(part => part?.type === 'text')
        .map(part => part.text)
        .join('\n');

      const result = extractJson(text);
      let candidates = makeCandidates(result);

      if (!result || candidates.length === 0) {
        lastError = {
          message: 'The AI response did not contain a plant identification.'
        };
        break;
      }

      const verified = await verifyCandidatesWithGbif(candidates);
      if (verified.length) candidates = verified;

      candidates = collapseSameGenusCandidates(candidates);

      const top = candidates[0] || {};
      const topConfidence = normalizeConfidence(top.confidence || result?.confidence);
      if (topConfidence === 'high') {
        candidates = candidates.slice(0, 1);
      } else {
        candidates = candidates.slice(0, 2);
      }

      const commonName = cleanCommonName(
        top.commonName || result?.common_name || result?.commonName,
        top.scientificName || result?.scientific_name || result?.scientificName
      );
      const scientificName = cleanScientificName(
        top.scientificName || result?.scientific_name || result?.scientificName
      );

      return json(200, {
        candidates,
        identification: result,
        commonName,
        scientificName,
        common_name: commonName,
        scientific_name: scientificName,
        confidence: topConfidence,
        gbifVerified: Boolean(top.gbifVerified)
      });
    } catch (error) {
      clearTimeout(timer);
      lastError = error;

      if (error?.name === 'AbortError') break;
    }
  }

  const message = errorMessage(lastError) || 'The plant could not be identified.';

  return json(502, { error: message });
}

export const config = {
  path: '/.netlify/functions/plant-identify'
};
