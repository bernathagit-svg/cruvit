import { cleanJsonText, getOpenAIKey, isHebrew, stringArray, text, unique } from '../utils.mjs';

async function callOpenAI(messages, maxTokens = 1500) {
  const key = getOpenAIKey();
  if (!key) return null;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.02,
      max_tokens: maxTokens
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  try {
    return JSON.parse(cleanJsonText(data?.choices?.[0]?.message?.content || '{}'));
  } catch {
    return null;
  }
}

export async function expandBotanicalQuery(rawQuery) {
  const raw = text(rawQuery);
  if (!raw) return [];

  const prompt = `The user entered a possible plant name: ${JSON.stringify(raw)}.
Return JSON only:
{
  "isPlantName": true,
  "candidates": [
    {"englishCommonName":"", "scientificName":"", "confidence":0.0}
  ]
}
Rules:
- Generate at most 5 botanical candidates.
- Translate Hebrew or transliterated common names when needed.
- Do not return people, places, brands, films, songs or companies.
- It is acceptable to return a genus when the exact species is unclear.
- Do not invent a scientific name. Use an empty scientificName when unsure.
- These candidates will be verified against GBIF before being accepted.`;

  const parsed = await callOpenAI([
    { role: 'system', content: 'You are a cautious multilingual botanical query expander. Return JSON only.' },
    { role: 'user', content: prompt }
  ], 900);

  if (!parsed || parsed.isPlantName === false) return [];
  const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  return unique(candidates.flatMap(candidate => [
    candidate.scientificName,
    candidate.englishCommonName
  ]));
}

export async function generateCareProfile({ rawQuery, taxon, summary, location, climate }) {
  const prompt = `You are Cruvit's botanical plant-care engine. Return JSON only.

User search: ${JSON.stringify(rawQuery)}
Verified GBIF taxon:
- scientificName: ${JSON.stringify(taxon.scientificName || taxon.canonicalName || '')}
- canonicalName: ${JSON.stringify(taxon.canonicalName || '')}
- rank: ${JSON.stringify(taxon.rank || '')}
- family: ${JSON.stringify(taxon.family || '')}
- kingdom: Plantae
User location: ${JSON.stringify(location || '')}
Climate context: ${JSON.stringify(climate || '')}
Wikipedia summary: ${JSON.stringify(summary?.extract || '')}

Rules:
- The identity is already verified as a plant. Never replace it with a person, place, brand or media item.
- Keep the verified scientific identity unchanged unless only formatting is needed.
- If the match is at genus or family level, clearly say the exact species/cultivar must be confirmed.
- Give practical, concise care guidance.
- Warnings must be specific: toxicity, roots, thorns, pests, invasiveness, heat/cold sensitivity, allergens, bee attraction, or similar.
- Do not create excessive tasks. Return 2-4 useful tasks.
- If location is absent, do not pretend to know climate suitability.

Return exactly this shape:
{
  "isPlant": true,
  "commonName": "",
  "hebrewName": "",
  "scientificName": "",
  "confidence": 0.9,
  "icon": "🌿",
  "sun": "",
  "water": "",
  "soil": "",
  "growth": "",
  "size": "",
  "climateFit": "",
  "seasonCare": "",
  "warnings": [""],
  "tasks": [""],
  "guide": "",
  "shoppingProducts": [""]
}`;

  return await callOpenAI([
    { role: 'system', content: 'Return only valid JSON. Be botanically accurate, cautious and practical.' },
    { role: 'user', content: prompt }
  ], 1900);
}

export function cleanProfileArrays(profile) {
  return {
    warnings: stringArray(profile?.warnings).slice(0, 8),
    tasks: stringArray(profile?.tasks).slice(0, 4),
    shoppingProducts: stringArray(profile?.shoppingProducts || profile?.products).slice(0, 6)
  };
}
