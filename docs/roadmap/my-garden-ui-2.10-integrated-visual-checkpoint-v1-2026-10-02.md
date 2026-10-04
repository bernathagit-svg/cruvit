# CRUVIT — My Plants + Plant Detail Integrated Visual Checkpoint v1
Date: 2026-10-02
Status: OWNER VISUAL REVIEW REQUIRED
Production: unchanged
Main: unchanged

## Integrated preview fingerprint
SHA-256:
`402229b3dfd75ef6956fb886016198d8081a51da5700545ddf5b37afce404028`

## Construction
The preview does not redesign any approved screen.

It uses:
- approved Personal Plant Photo Sync Preview v2 for My Plants + Overview behavior
- approved My Plants visual
- approved Overview visual
- approved Care visual
- approved Schedule visual
- approved History visual
- transparent hotspots only for tab/back/camera behavior

## Included flow
My Plants
→ Lemon tree
→ Overview
→ Care
→ Schedule
→ History
→ Back to My Plants

## Personal photo
The exact Lemon Plant Instance keeps one personal-photo state.
The personal photo remains synchronized between My Plants and Plant Detail.
Restore CRUVIT photo returns to the system image.
The same personal photo is carried into the hero region on all four Plant Detail tabs.

## Explicitly unchanged/deferred
- shared bottom navigation behavior
- center +
- production writes
- database migrations
- main merge
- production deploy

## Acceptance
This checkpoint is NOT `LOCKED_IMPLEMENTED`.

It may advance only after:
1. owner visual inspection
2. visual corrections if any
3. explicit owner approval
