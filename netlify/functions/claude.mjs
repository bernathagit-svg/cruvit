const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

/**
 * Thin Anthropic proxy for text + vision requests from PlantIdentifier.
 * Primary plant photo ID should use plant-identify.mjs (structured + GBIF).
 */
export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return json(405, { error: { message: 'Method Not Allowed' } });
  }

  const key =
    process.env.ANTHROPIC_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.CLAUDE_API_KEY;

  if (!key) {
    return json(200, {
      error: {
        code: 'CONFIG_MISSING',
        message:
          'AI setup is missing. Add ANTHROPIC_API_KEY (or ANTHROPIC_KEY) in Netlify environment variables, then redeploy.'
      }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: { message: 'Invalid JSON body.' } });
  }

  const model =
    body.model ||
    process.env.ANTHROPIC_MODEL ||
    'claude-sonnet-4-6';

  const payload = {
    model,
    max_tokens: Math.min(Math.max(Number(body.max_tokens) || 1600, 256), 4096),
    messages: Array.isArray(body.messages) ? body.messages : []
  };

  if (!payload.messages.length) {
    return json(400, { error: { message: 'Missing messages array.' } });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 26000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timer);

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {
        error: {
          message: text.includes('<!DOCTYPE')
            ? 'AI function is not deployed correctly.'
            : (text.slice(0, 700) || 'Non-JSON response from Anthropic')
        }
      };
    }

    if (!response.ok && !data.error) {
      data = { error: data.error || { message: 'Anthropic request failed.' } };
    }

    return json(response.ok ? 200 : response.status, data);
  } catch (error) {
    clearTimeout(timer);
    const message =
      error?.name === 'AbortError'
        ? 'The AI request took too long. Please try again.'
        : (error?.message || 'Anthropic request failed.');
    return json(500, { error: { message } });
  }
}

export const config = {
  path: '/.netlify/functions/claude'
};
