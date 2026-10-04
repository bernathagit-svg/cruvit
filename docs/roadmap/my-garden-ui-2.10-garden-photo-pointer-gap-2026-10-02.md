# My Garden UI 2.10 — Current Garden Photo pointer gap
Date: 2026-10-02
Status: BLOCKER FOR LIVE "CHANGE GARDEN PHOTO" WRITE
No migration applied.

## Existing backend
garden_media already supports purpose = garden_overview.

## Gap
garden_profiles does not currently expose a first-class pointer selecting which
garden_overview media row is the current My Garden background.

If multiple valid garden_overview rows exist, choosing the newest automatically
would be a silent behavioral decision and may display a photo the user did not select.

## Safe transitional read
- zero candidates -> system/default garden image
- one validated, garden-scoped candidate -> may display it because it is unambiguous
- multiple candidates -> do not silently choose
- plant-scoped media is never eligible as garden background

## Required later schema checkpoint
Add an explicit same-garden current-photo pointer on garden_profiles
(e.g. garden_photo_media_id), with:
- FK to garden_media
- same-garden enforcement
- garden_plant_id must be null for garden overview cover
- validated garden_overview purpose requirement
- ON DELETE SET NULL behavior

Exact SQL requires separate owner review.
No production migration/write is authorized here.
