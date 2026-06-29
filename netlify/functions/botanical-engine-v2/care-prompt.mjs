export const GENERIC_CARE_MARKERS = [
  'Location-specific suitability requires',
  'Match light exposure to the confirmed species',
  'Water according to season, soil drainage',
  'Use soil appropriate to the confirmed species',
  'Cruvit should generate seasonal care',
  'Light needs vary by species',
  'Watering varies by species',
  'Growth habit varies across this taxonomic group',
  'Confirm the exact species or cultivar before applying detailed care'
];

export function isGenericCareText(value) {
  const s = text(value);
  if (!s) return true;
  return GENERIC_CARE_MARKERS.some((marker) => s.includes(marker));
}

export function careProfileLooksGeneric(profile) {
  if (!profile || profile.isPlant === false) return true;
  return (
    isGenericCareText(profile.sun || profile.light) &&
    isGenericCareText(profile.climateFit || profile.climate_fit || profile.climate)
  );
}

function text(value) {
  return String(value ?? '').trim();
}

export function buildCarePrompt({ rawQuery, taxon, summary, location, climate, language }) {
  const langHint =
    language === 'he'
      ? 'Write all user-facing string fields in Hebrew.'
      : 'Write all user-facing string fields in English.';

  const locationBlock = text(location)
    ? `The gardener's location is ${JSON.stringify(location)}${climate ? ` (${JSON.stringify(climate)} climate).` : '.'}
You MUST assess outdoor suitability for this exact location in climateFit and climate_summary.`
    : 'No user location was provided. Say climate suitability is unknown until a location is added — do not invent local advice.';

  return `You are Cruvit's botanical plant-care engine. Return JSON only.

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

${locationBlock}
${langHint}

Rules:
- The identity is already verified as a plant. Never replace it with a person, place, brand or media item.
- Keep the verified scientific identity unchanged unless only formatting is needed.
- If the match is at genus or family level, say the exact species/cultivar must be confirmed, but still give the best practical guidance for the likely garden use.
- Each care field must be one or two practical sentences specific to THIS plant — never generic boilerplate.
- climateFit: when location is known, write 2-4 sentences on how well this plant grows there (heat, frost, rain, soil). When unknown, say location is needed.
- Warnings must be specific: toxicity, roots, thorns, pests, invasiveness, heat/cold sensitivity, allergens, or similar.
- Return 2-4 useful tasks.
- Do not use placeholder phrases like "Match light exposure to the confirmed species".

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
  "pruning": "",
  "fertilizer": "",
  "warnings": [""],
  "tasks": [""],
  "guide": "",
  "shoppingProducts": [""]
}`;
}
