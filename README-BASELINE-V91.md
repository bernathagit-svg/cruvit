# Cruvit My Garden v91 — Botanical-only plant search

This version hardens the plant search engine so Cruvit only returns botanical plant taxa.

Key fixes:
- Rejects people, places, companies, songs, films and other non-plant matches.
- Requires botanical evidence from OpenAI, GBIF, Wikidata/Wikipedia plant pages, or local botanical overrides.
- Adds Hebrew/English botanical normalization for common terms such as ארז/Cedrus, אלון/Quercus, אורן/Pinus.
- If no confident plant match exists, the app should show no confident match instead of inventing a plant.
- UI design was not changed.

Netlify still needs OPENAI_API_KEY in Environment Variables for best universal coverage.
