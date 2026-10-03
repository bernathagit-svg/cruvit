# CRUVIT — My Garden UI 2.10 Implementation Status
Date: 2026-10-02
Branch: my-garden-ui-2.10-contract-20261002
Draft PR: #140
Production deploy: NO
Main merge: NO

## Current verification
Latest isolated CI:
- tests: 184
- pass: 184
- fail: 0

Current verified branch head:
- 5f0d1eb4d89f38294e34a3d9775fca2db6f18b80

## Owner visual state

### LOCKED_IMPLEMENTED
- Add Plant
- My Plants
- Plant Detail → Overview
- Plant Detail → Care
- Plant Detail → Schedule
- Plant Detail → History

### APPROVED_VISUAL · implementation comparison completed · owner implementation PASS still required
- Upcoming → List — live preview verified 2026-10-03
- Upcoming → Calendar — live preview verified 2026-10-03
- Garden Journal — live preview verified 2026-10-03
- Notifications — live preview verified 2026-10-03

Bottom navigation / center +:
- explicitly deferred
- no behavior redesign authorized

## My Garden Home
- canonical Supabase snapshot
- dynamic active plant count
- dynamic upcoming count
- dynamic attention count/items
- fail-safe Garden Photo resolution
- exact approved Home DOM renderer
- exact approved CSS vendored and fingerprint-locked

## My Plants
- one canonical renderer path only
- exact approved v2 card/camera geometry
- exact Plant Instance identity
- garden area projection
- personal cover via garden_plants.cover_media_id
- short-lived signed URL for private user-garden-media
- signed URL failure falls back to approved CRUVIT system artwork
- no raw private storage path exposed as public URL
- per-card camera action bound to exact plant ID

## Plant Detail
- one canonical controller across Overview / Care / Schedule / History
- same Plant Instance ID across all tabs
- same personal cover identity as My Plants
- same signed private media used in approved hero + detail-card slots
- exact approved photo/camera geometry
- archived plant is read-only
- signed media failure falls back without breaking screen

## Overview
- exact catalog slug resolution only
- no fuzzy alias substitution
- no botanical-size → personal-height inference
- added_at not relabeled as planted date
- phenology requires provenance
- missing catalog knowledge remains unknown

## Care
- care guidance separated from Task date/state
- linked next action references same Task ID
- garden-adapted climate guidance requires reliable location
- missing warning data remains unknown

## Group 2 — one controller only
A duplicate Upcoming controller and duplicate Journal/Notifications controller were removed.

Canonical controller:
- modules/my-garden-v2/group-2-screen-controller.js

### Upcoming
- List and Calendar use canonical garden_tasks
- same Task IDs
- same status totals for same scope
- one shared snapshot via loadUpcomingPair
- active plant count includes plants with no tasks
- private personal plant thumbnails use signed URLs
- optional system thumbnail resolver does not change task identity
- visual comparison completed on live Preview 140; owner implementation PASS still required

### Garden Journal
- canonical garden_events only
- same Event IDs as Plant History
- no duplicate Journal store
- visual state remains APPROVED_VISUAL_PENDING_COMPARISON

### Notifications
- canonical pending due garden_tasks only
- no copied notification tasks
- task/plant identity preserved
- visual state remains APPROVED_VISUAL_PENDING_COMPARISON

## Code duplication cleanup completed
Removed duplicate:
- modules/my-garden-v2/my-plants-approved-renderer.js
- tests/my-garden-v2-my-plants-approved-renderer.test.mjs
- modules/my-garden-v2/upcoming-screen-controller.js
- tests/my-garden-v2-upcoming-screen-controller.test.mjs
- modules/my-garden-v2/garden-activity-screens-controller.js
- tests/my-garden-v2-garden-activity-screens-controller.test.mjs

Current principle:
**one truth + one controller/renderer path per responsibility**

## Production schema verification
Project:
- cruvit-production

Confirmed blockers intentionally not bypassed:
1. new garden_plants still default to Healthy + check mark
2. garden_tasks lacks completed_at / cancelled_at
3. Garden OS event vocabulary lacks all approved Note/Care/Photo/Restore mutations
4. garden_profiles lacks current Garden Photo pointer
5. exact sub-area position has no first-class field
6. production catalog coverage does not yet match every existing garden slug

No production migration has been applied.

## Explicitly NOT done
- no production write activation
- no production migration
- no bottom-navigation behavior change
- no center + behavior change
- no merge to main
- no production deploy

## Latest implementation-level visual verification — 2026-10-03
Live Preview 140 verification completed for:
1. Upcoming List
2. Upcoming Calendar
3. Garden Journal
4. Notifications

Observed result:
- approved visual structure intact
- required lower-screen content present
- no clipping/overlap/corruption found
- Group 2 hydration remained visually stable

These screens remain pending explicit owner implementation PASS before LOCKED_IMPLEMENTED.

## Next implementation target
Move from visual comparison to the real production blockers already documented:
1. neutral/unassessed Add Plant health state
2. full Task lifecycle timestamps/cancellation
3. approved Garden Event mutation vocabulary
4. explicit current Garden Photo pointer
5. exact sub-area position
6. catalog coverage alignment

No production migration/write is authorized by this status update.
