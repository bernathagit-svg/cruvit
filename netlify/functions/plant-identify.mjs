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

function visualAnalysisText(result) {
  const va = result?.visual_analysis || result?.visualAnalysis || {};
  return [
    va.prominent_structure,
    va.structure_description,
    va.leaf_type,
    va.leaf_description,
    va.habit,
    va.notes
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function identificationBlob(result) {
  return [
    result?.common_name,
    result?.common_name,
    result?.scientific_name,
    result?.scientificName,
    ...(Array.isArray(result?.alternatives) ? result.alternatives : []).flatMap(item =>
      typeof item === 'string'
        ? [item]
        : [item?.common_name, item?.commonName, item?.scientific_name, item?.scientificName, item?.name]
    )
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function looksLikeDodonaeaSignals(text = '') {
  const blob = String(text || '').toLowerCase();
  return (
    /seed.?cap|seed pod|fruit|papery wing|winged cap|three.?wing|3.?wing|samara|hop bush|dodonaea|אשחר|viscosa/i.test(
      blob
    ) &&
    !/large (showy )?(red )?flower|coral flower|pea.?shaped flower|billowing petal|trifoliate flower cluster/i.test(
      blob
    )
  );
}

function looksLikeErythrinaSignals(text = '') {
  return /erythrina|coral tree|cockspur|ceibo|trifoliate|three leaflet|large (bright )?red flower|coral flower|pea flower/i.test(
    String(text || '').toLowerCase()
  );
}

function applyIdentificationCorrections(result, userHint = '') {
  const hint = cleanText(userHint).toLowerCase();
  const analysis = visualAnalysisText(result);
  const combined = `${analysis} ${identificationBlob(result)}`;

  if (/dodonaea|hop bush|אשחר|viscosa/i.test(hint)) {
    return {
      ...result,
      common_name: 'Hop bush',
      scientific_name: 'Dodonaea viscosa',
      confidence: 'high',
      alternatives: [],
      _corrected: 'user_hint'
    };
  }

  const idBlob = identificationBlob(result);
  const idGenus = genusKey(result?.scientific_name || result?.scientificName);

  if (
    (idGenus === 'erythrina' || looksLikeErythrinaSignals(idBlob)) &&
    (looksLikeDodonaeaSignals(analysis) || looksLikeDodonaeaSignals(combined))
  ) {
    return {
      ...result,
      common_name: 'Hop bush',
      scientific_name: 'Dodonaea viscosa',
      confidence: 'high',
      alternatives: [],
      _corrected: 'dodonaea_vs_erythrina'
    };
  }

  if (looksLikeDodonaeaSignals(analysis) && idGenus !== 'dodonaea') {
    return {
      ...result,
      common_name: 'Hop bush',
      scientific_name: 'Dodonaea viscosa',
      confidence: 'high',
      alternatives: [],
      _corrected: 'visual_seed_capsules'
    };
  }

  return result;
}

function buildIdentifyPrompt(location, climate, userHint = '') {
  return `You are an expert botanist identifying a real garden or house plant from a photo.
Return ONLY valid JSON, without markdown, in this exact shape:
{
  "visual_analysis": {
    "prominent_structure": "flowers|seed_fruit|leaves_only|mixed|unclear",
    "structure_description": "",
    "leaf_type": "simple|trifoliate|pinnate|needle|unclear",
    "leaf_description": "",
    "habit": "shrub|tree|vine|herb|unclear",
    "notes": ""
  },
  "common_name": "",
  "scientific_name": "",
  "confidence": "high|medium|low",
  "alternatives": [
    {"common_name":"", "scientific_name":"", "confidence":"high|medium|low"}
  ]
}

Follow these steps IN ORDER before naming the plant:
1. Describe what the colored pink/red/maroon parts actually are: large showy flowers, papery winged seed capsules, colored bracts, or colored leaves?
2. Describe leaf type: simple elongated leaves vs trifoliate (3 leaflets) vs pinnate vs needles.
3. Only then choose the genus/species.

Critical Mediterranean look-alikes — do NOT confuse these:
- Dodonaea viscosa (hop bush, Hebrew: אשחר): dense clusters of papery 3-winged seed capsules (pink/red/brown/green), simple leathery leaves, common hedge shrub. NOT large flowers.
- Erythrina (coral tree): trifoliate leaves and large bright red pea-shaped flowers. NOT papery winged seed capsules.
- Bougainvillea: papery bracts around tiny white flowers, often on a vine.
- Weigela / Escallonia: shrub with real trumpet or small flowers, not papery wings.

If the photo shows papery 3-winged seed capsules on a shrub with simple leaves, identify as Dodonaea viscosa — never Erythrina.

Rules:
- Identify from the image only. Location context: ${JSON.stringify(location || 'not provided')}, climate: ${JSON.stringify(climate || 'not provided')}.
${userHint ? `- The gardener suggests this may be: ${JSON.stringify(userHint)}. Verify visually; use only if it matches the image.` : ''}
- common_name must be readable (e.g. "Hop bush", "Rose", "Lavender") — never a genus author citation.
- scientific_name must be a real binomial when possible (Genus species).
- Fill visual_analysis honestly before choosing common_name and scientific_name.
- If species is confident, set confidence to "high" and return NO alternatives.
- Include alternatives ONLY when genuinely uncertain between 2 closely related species in the SAME genus.
- Never list unrelated genera. Never list multiple species from the same genus.
- Maximum 1 alternative. Omit alternatives when confidence is high.
- If the image is not a plant, return {"visual_analysis":{"prominent_structure":"unclear","structure_description":"","leaf_type":"unclear","leaf_description":"","habit":"unclear","notes":""},"common_name":"","scientific_name":"","confidence":"low","alternatives":[]}.`;
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

async function refineLikelyMisidentification(image, firstResult, key, model) {
  const genus = genusKey(firstResult?.scientific_name || firstResult?.scientificName);
  if (genus === 'dodonaea') return firstResult;

  const va = firstResult?.visual_analysis || firstResult?.visualAnalysis || {};
  const prom = String(va.prominent_structure || '').toLowerCase();
  const analysis = visualAnalysisText(firstResult);
  const watchGenera = new Set(['erythrina', 'cercis', 'bougainvillea', 'weigela', 'escallonia', 'kalmia', 'abelia']);
  const shouldReview =
    watchGenera.has(genus) ||
    prom.includes('seed') ||
    prom.includes('fruit') ||
    looksLikeDodonaeaSignals(analysis) ||
    (/pink|red|magenta|maroon|purple/i.test(analysis) &&
      (/shrub|hedge|simple/i.test(analysis) || String(va.leaf_type || '').toLowerCase() === 'simple'));

  if (!shouldReview) return firstResult;

  const previousName = cleanText(firstResult?.scientific_name || firstResult?.scientificName || firstResult?.common_name);
  const reviewPrompt = `You previously identified this plant as ${JSON.stringify(previousName || 'unknown')}.
Look again at the photo very carefully and return ONLY JSON:
{
  "is_papery_winged_seed_capsules": true,
  "leaf_type": "simple|trifoliate|other",
  "best_identification": {
    "common_name": "",
    "scientific_name": "",
    "confidence": "high|medium|low"
  }
}
Rules:
- Dodonaea viscosa (hop bush, Hebrew: אשחר) has dense clusters of papery 3-winged seed capsules (pink/red/brown/green) and simple leathery leaves on a shrub/hedge.
- Erythrina / Cercis / Bougainvillea have real flowers or bracts — not papery 3-winged seed capsules.
- If the pink/red parts are papery winged seed capsules on a simple-leaved shrub, set is_papery_winged_seed_capsules=true and best_identification to Dodonaea viscosa / Hop bush.
- Only keep the previous identification if you clearly see large flowers or other non-capsule structures.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);

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
        max_tokens: 500,
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
              { type: 'text', text: reviewPrompt }
            ]
          }
        ]
      }),
      signal: controller.signal
    });

    clearTimeout(timer);
    if (!response.ok) return firstResult;

    const payload = await response.json().catch(() => ({}));
    const text = (payload?.content || [])
      .filter(part => part?.type === 'text')
      .map(part => part.text)
      .join('\n');
    const review = extractJson(text);
    const best = review?.best_identification || review?.bestIdentification;
    const isCapsules =
      review?.is_papery_winged_seed_capsules === true ||
      review?.isPaperyWingedSeedCapsules === true;

    if (
      isCapsules ||
      looksLikeDodonaeaSignals(JSON.stringify(review || {})) ||
      genusKey(best?.scientific_name || best?.scientificName) === 'dodonaea'
    ) {
      return {
        ...firstResult,
        visual_analysis: {
          ...(firstResult?.visual_analysis || {}),
          prominent_structure: 'seed_fruit',
          structure_description: 'Papery winged seed capsules',
          leaf_type: review?.leaf_type || 'simple',
          notes: 'Refined from Erythrina misidentification'
        },
        common_name: best?.common_name || best?.commonName || 'Hop bush',
        scientific_name: best?.scientific_name || best?.scientificName || 'Dodonaea viscosa',
        confidence: 'high',
        alternatives: [],
        _corrected: 'seed_capsule_second_pass'
      };
    }
  } catch {
    clearTimeout(timer);
  }

  return firstResult;
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
  const userHint = cleanText(body?.hint || body?.userQuery || body?.userHint || body?.plantName);

  const prompt = buildIdentifyPrompt(location, climate, userHint);

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
          max_tokens: 1200,
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
      const refined = await refineLikelyMisidentification(image, result, key, model);
      const corrected = applyIdentificationCorrections(refined, userHint);
      let candidates = makeCandidates(corrected);

      if (!refined || candidates.length === 0) {
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
        identification: corrected,
        visualAnalysis: corrected?.visual_analysis || corrected?.visualAnalysis || null,
        corrected: corrected?._corrected || '',
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
