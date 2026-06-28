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

function looksLikeFloweringPlantSignals(text = '') {
  return /orchid|phalaenopsis|dendrobium|cattleya|rose|tulip|daisy|sunflower|hibiscus|jasmine|bougainvillea|geranium|petunia|marigold|lily|iris|daffodil|chrysanthemum|begonia|anthurium|flowering|showy flower|blooming|in bloom|פרח|סחלב|ורד|פריחה/i.test(
    String(text || '').toLowerCase()
  );
}

function looksLikeDodonaeaSignals(text = '') {
  const blob = String(text || '').toLowerCase();
  if (looksLikeHouseplantSignals(blob) || looksLikeFloweringPlantSignals(blob)) return false;
  return (
    (/seed.?cap|seed pod|papery wing|winged cap|three.?wing|3.?wing|samara|hop bush|hopbush|dodonaea|אשחר|viscosa/i.test(
      blob
    ) ||
      (/papery|winged/i.test(blob) && /cap|pod|seed|samara/i.test(blob))) &&
    !/large (showy )?(red )?flower|coral flower|pea.?shaped flower|billowing petal|trifoliate flower cluster|orchid|phalaenopsis/i.test(
      blob
    )
  );
}

function looksLikeHouseplantSignals(text = '') {
  return /zamioculcas|zz plant|pothos|monstera|philodendron|snake plant|dracaena|ficus elastica|rubber plant|peace lily|spathiphyllum|orchid|phalaenopsis|anthurium|indoor|houseplant|house plant|potted|pot plant|glossy.*leaf|waxy.*leaf|thick.*stem|compound leaf|pinnate leaf|leaflets along|upright stem|ceramic pot|plastic pot|planter|windowsill|סחלב|עציץ|צמח בית/i.test(
    String(text || '').toLowerCase()
  );
}

function hasExplicitSeedCapsules(result) {
  const va = result?.visual_analysis || result?.visualAnalysis || {};
  const prom = String(va.prominent_structure || '').toLowerCase();
  const desc = String(va.structure_description || '').toLowerCase();
  if (prom === 'seed_fruit' && /papery|wing|capsule|samara|hop/i.test(desc)) return true;
  return /papery.*wing|winged.*seed|3.?wing|three.?wing|seed capsule|hop bush/i.test(desc);
}

function looksLikeErythrinaSignals(text = '') {
  return /erythrina|coral tree|cockspur|ceibo|trifoliate|three leaflet|large (bright )?red flower|coral flower|pea flower/i.test(
    String(text || '').toLowerCase()
  );
}

function isStrictlyValidDodonaea(result) {
  const analysis = visualAnalysisText(result);
  const va = result?.visual_analysis || result?.visualAnalysis || {};
  const prom = String(va.prominent_structure || '').toLowerCase();
  const habit = String(va.habit || '').toLowerCase();

  if (looksLikeHouseplantSignals(analysis) || looksLikeFloweringPlantSignals(analysis)) return false;
  if (prom !== 'seed_fruit') return false;
  if (habit && habit !== 'shrub' && habit !== 'tree') return false;
  if (!hasExplicitSeedCapsules(result)) return false;
  if (!looksLikeDodonaeaSignals(analysis)) return false;
  return true;
}

function applyIdentificationCorrections(result, userHint = '') {
  const hint = cleanText(userHint).toLowerCase();

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

  return result;
}

function buildIdentifyPrompt(location, climate, userHint = '', scanContext = '') {
  const contextNote = scanContext ? `\n- ${scanContext}` : '';
  return `You are an expert botanist identifying a plant from a photo.
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
1. Is this an indoor/potted houseplant or an outdoor garden plant?
2. If you see showy flowers (orchid spikes, rose blooms, etc.), set prominent_structure to "flowers" — NOT seed_fruit.
3. Describe leaf type and growth habit honestly.
4. Name the plant that best matches what is visible.

The photo may show ANY common plant: orchids (Phalaenopsis), pothos, Monstera, ZZ plant, roses, herbs, succulents, citrus, tomatoes, lavender, etc.
Do NOT guess a random outdoor shrub unless the image clearly shows that exact plant outdoors.

Rules:
- Identify from the image only. Location hint (may be irrelevant for indoor plants): ${JSON.stringify(location || 'not provided')}, climate: ${JSON.stringify(climate || 'not provided')}.${contextNote}
${userHint ? `- The gardener suggests this may be: ${JSON.stringify(userHint)}. Verify visually; use only if it matches the image.` : ''}
- common_name must be readable (e.g. "Moth orchid", "Rose", "ZZ plant") — never a genus author citation.
- scientific_name must be a real binomial when possible (Genus species).
- Fill visual_analysis honestly before choosing common_name and scientific_name.
- If species is confident, set confidence to "high" and return NO alternatives.
- Include alternatives ONLY when genuinely uncertain between 2 closely related species in the SAME genus.
- Never list unrelated genera. Never list multiple species from the same genus.
- Maximum 1 alternative. Omit alternatives when confidence is high.
- If the image is not a plant, return {"visual_analysis":{"prominent_structure":"unclear","structure_description":"","leaf_type":"unclear","leaf_description":"","habit":"unclear","notes":""},"common_name":"","scientific_name":"","confidence":"low","alternatives":[]}.
- Ignore all text, buttons, app UI, labels, and overlays visible in the photo. Identify only the actual plant.`;
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

async function reIdentifyPlant(image, key, model, options = {}) {
  const {
    userHint = '',
    location = '',
    climate = '',
    excludeGenera = [],
    reason = ''
  } = options;

  const excludeNote = excludeGenera.length
    ? `\nIMPORTANT: The previous guess (${excludeGenera.join(', ')}) was wrong. Do NOT repeat it unless the image unmistakably shows that exact plant.\n`
    : '';

  const prompt = `You are an expert botanist identifying a real plant from a photo.
${excludeNote}${reason ? `Context: ${reason}\n` : ''}
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
  "alternatives": []
}

Identify the actual plant visible in the photo: houseplants, orchids, succulents, herbs, vegetables, trees, shrubs, or garden flowers.
Location context: ${JSON.stringify(location || 'not provided')}, climate: ${JSON.stringify(climate || 'not provided')}.
${userHint ? `The gardener suggests: ${JSON.stringify(userHint)}. Verify visually; use only if it matches.` : ''}
- common_name must be readable (e.g. "Moth orchid", "Rose", "ZZ plant") — never a genus author citation.
- scientific_name must be a real binomial when possible.
- Fill visual_analysis honestly before naming the plant.
- If species is confident, set confidence to "high" and return NO alternatives.
- Ignore all text, buttons, app UI, labels, and overlays. Identify only the actual plant.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 24000);

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
    if (!response.ok) return null;

    const payload = await response.json().catch(() => ({}));
    const text = (payload?.content || [])
      .filter(part => part?.type === 'text')
      .map(part => part.text)
      .join('\n');
    const parsed = extractJson(text);
    if (!parsed?.scientific_name && !parsed?.scientificName && !parsed?.common_name && !parsed?.commonName) {
      return null;
    }
    return parsed;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function userRequestedDodonaea(userHint = '') {
  return /dodonaea|hop bush|אשחר|viscosa/i.test(cleanText(userHint).toLowerCase());
}

function isBlockedScanIdentification(result, userHint = '') {
  if (userRequestedDodonaea(userHint)) return false;
  return genusKey(result?.scientific_name || result?.scientificName) === 'dodonaea';
}

async function recoverInvalidDodonaeaIdentification(image, result, key, model, userHint = '', context = {}) {
  const genus = genusKey(result?.scientific_name || result?.scientificName);
  if (genus !== 'dodonaea') return result;
  if (userRequestedDodonaea(userHint)) return result;

  const retryModels = [...new Set([model, 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'].filter(Boolean))];
  const retryReasons = [
    'Previous identification was Dodonaea viscosa but the photo likely shows a different plant (houseplant, orchid, or garden plant).',
    'Look for orchid flowers on a spike, potted houseplants, herbs, succulents, or garden flowers — NOT Dodonaea hop bush.',
    'Final retry: identify the exact plant in the pot or garden bed. Do NOT return Dodonaea unless papery winged seed capsules on an outdoor hedge are unmistakable.'
  ];

  for (let i = 0; i < retryModels.length; i++) {
    const fresh = await reIdentifyPlant(image, key, retryModels[i], {
      userHint,
      location: context.location || '',
      climate: context.climate || '',
      excludeGenera: ['Dodonaea viscosa', 'Dodonaea', 'Hop bush', 'אשחר'],
      reason: retryReasons[Math.min(i, retryReasons.length - 1)]
    });
    if (!fresh) continue;

    const freshGenus = genusKey(fresh?.scientific_name || fresh?.scientificName);
    if (!freshGenus || freshGenus === 'dodonaea') continue;

    return {
      ...fresh,
      alternatives: [],
      _corrected: 'invalid_dodonaea_recovery'
    };
  }

  return null;
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
  const scanContext = cleanText(body?.scanContext);
  const userHint = cleanText(body?.hint || body?.userQuery || body?.userHint || body?.plantName);

  const prompt = buildIdentifyPrompt(location, climate, userHint, scanContext);

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
      const corrected = applyIdentificationCorrections(result, userHint);
      let recovered = await recoverInvalidDodonaeaIdentification(
        image,
        corrected,
        key,
        model,
        userHint,
        { location, climate }
      );

      if (!recovered || isBlockedScanIdentification(recovered, userHint)) {
        lastError = {
          message:
            'Could not confidently identify this plant from the photo. Try a clearer photo of the plant only, without app buttons or text in the frame.'
        };
        break;
      }

      let candidates = makeCandidates(recovered);

      if (!recovered || candidates.length === 0) {
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
        identification: recovered,
        visualAnalysis: recovered?.visual_analysis || recovered?.visualAnalysis || null,
        corrected: recovered?._corrected || '',
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
