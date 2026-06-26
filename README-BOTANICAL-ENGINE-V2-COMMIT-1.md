# Cruvit Botanical Engine v2 — Commit 1

This commit creates a modular, shared botanical search engine while preserving the existing endpoint:

`/.netlify/functions/plant-knowledge`

## What is included

- Hebrew, English and scientific-name query normalization.
- A controlled alias layer for common Hebrew plant names.
- Wikidata multilingual query expansion.
- GBIF Plantae-only identity verification and confidence ranking.
- Optional OpenAI query expansion only when normal search is not enough.
- OpenAI care profile only after GBIF confirms the botanical identity.
- Wikipedia/Wikimedia image and summary lookup.
- Hard rejection of people, places, media, brands and other non-plant matches.
- `mode: "suggest"` for future autocomplete/search modules.
- Backward-compatible response fields for the existing My Garden UI.

## Files

- `netlify/functions/plant-knowledge.mjs` — stable endpoint wrapper.
- `netlify/functions/botanical-engine-v2/engine.mjs` — orchestration.
- `aliases.mjs` — Hebrew/English language bridge.
- `guards.mjs` — botanical-only safety gates.
- `profile.mjs` — fallback and merged care profiles.
- `providers/gbif.mjs` — verified taxonomy.
- `providers/wikidata.mjs` — multilingual name discovery.
- `providers/wikipedia.mjs` — summary and image.
- `providers/openai.mjs` — cautious query expansion and care profile.
- `utils.mjs` — shared utilities, timeout and warm-instance cache.

## Manual tests after Netlify deploy

Search each name from Add Plant:

1. ארז
2. אלון
3. אורן
4. מנגו
5. פפאיה
6. ליצ׳י
7. פטל
8. מונסטרה
9. Mango tree
10. Quercus calliprinos

Negative tests that must not be accepted as plants:

1. Rose Byrne
2. Jasmine Thompson
3. Cedar Rapids
4. Apple company

## Commit message

`Add modular Cruvit Botanical Engine v2 phase 1`
