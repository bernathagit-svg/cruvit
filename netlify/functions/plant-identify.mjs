const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function parseDataUrl(value) {
  const match = String(value || '').match(
    /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i
  );
  if (!match) return null;

  return {
    mediaType:
      match[1].toLowerCase() === 'image/jpg'
        ? 'image/jpeg'
        : match[1].toLowerCase(),
    data: match[2].replace(/\s+/g, '')
  };
}

function extractJson(text) {
  const raw = String(text || '').trim();

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

function cleanText(value) {
  return String(value || '').trim();
}

function makeCandidates(result) {
  const candidates = [];
  const seen = new Set();

  const add = (name, scientificName = '', confidence = '') => {
    const common = cleanText(name);
    const scientific = cleanText(scientificName);
    const key = `${common.toLowerCase()}|${scientific.toLowerCase()}`;

    if ((!common && !scientific) || seen.has(key)) return;

    seen.add(key);
    candidates.push({
      name: common || scientific,
      commonName: common,
      scientificName: scientific,
      confidence: cleanText(confidence)
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

  return candidates.slice(0, 6);
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
      error:
        'Anthropic API key is missing in Netlify environment variables.'
    });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const image = parseDataUrl(body?.imageDataUrl);

  if (!image) {
    return json(400, { error: 'Missing or invalid imageDataUrl.' });
  }

  if (image.data.length > 7_000_000) {
    return json(413, {
      error: 'The image is too large. Please use a smaller image.'
    });
  }

  const location = cleanText(body?.location);
  const climate = cleanText(body?.climate);

  const prompt = `You are an expert botanist. Identify the plant in the uploaded image.
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
- Give the best likely identification when a plant is visible.
- Do not invent certainty. Use medium or low confidence when needed.
- Include up to 4 plausible alternatives only when useful.
- Prefer a species; use a genus when the exact species cannot be determined.
- The user's location is ${JSON.stringify(location || 'not provided')}.
- Climate context is ${JSON.stringify(climate || 'not provided')}.
- Identification must be based mainly on the image, not on location.`;

  const preferred =
    process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

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
      const response = await fetch(
        'https://api.anthropic.com/v1/messages',
        {
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
        }
      );

      clearTimeout(timer);

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload?.error) {
        lastError =
          payload?.error || { message: 'Identification request failed.' };

        const message = cleanText(lastError?.message).toLowerCase();
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
      const candidates = makeCandidates(result);

      if (!result || candidates.length === 0) {
        lastError = {
          message:
            'The AI response did not contain a plant identification.'
        };
        break;
      }

      return json(200, {
        candidates,
        identification: result
      });
    } catch (error) {
      clearTimeout(timer);
      lastError = error;

      if (error?.name === 'AbortError') break;
    }
  }

  const message = cleanText(
    lastError?.message || 'The plant could not be identified.'
  );

  return json(502, { error: message });
}

export const config = {
  path: '/.netlify/functions/plant-identify'
};
