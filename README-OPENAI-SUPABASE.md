# Cruvit Plant Search

This version uses a true universal plant search flow:
1. Netlify Function `plant-knowledge.mjs` calls OpenAI server-side.
2. It also checks public taxonomy/reference sources (Wikidata, Wikipedia, GBIF, Wikimedia).
3. The local plant list is only a fallback, not the main source.

Required Netlify environment variable:
`OPENAI_API_KEY`

Do not put API keys inside `index.html`.
