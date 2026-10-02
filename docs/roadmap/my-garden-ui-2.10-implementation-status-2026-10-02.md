# CRUVIT — My Garden UI 2.10 Implementation Status
Date: 2026-10-02
Branch: my-garden-ui-2.10-contract-20261002
Draft PR: #140
Production deploy: NO
Main merge: NO

## Current verification
Latest isolated CI:
- tests: 127
- pass: 127
- fail: 0

## Read-only implementation foundation complete

### My Garden Home
- canonical Supabase snapshot
- dynamic active plant count
- dynamic upcoming count
- dynamic attention count/items
- fail-safe Garden Photo resolution
- exact approved Home DOM renderer
- exact approved CSS vendored and fingerprint-locked
- no bottom-nav redesign

### My Plants
- exact Plant Instance IDs
- garden area projection
- personal cover photo via garden_plants.cover_media_id
- system-image fallback
- per-card camera action bound to exact plant ID
- shared projection with Plant Detail

### Plant Detail foundation
- same Plant Instance across Overview / Care / Schedule / History
- same personal photo as My Plants
- archived state is read-only
- no silent plant substitution

### Overview
- exact catalog slug resolution only
- no fuzzy alias substitution
- no botanical-size -> personal-height inference
- added_at not relabeled as planted date
- phenology requires provenance
- missing catalog knowledge remains unknown

### Care
- care guidance separated from concrete Task date/state
- linked next action must reference same Task ID
- garden-adapted climate guidance requires reliable location
- missing warning data remains unknown

### Schedule / Upcoming / Calendar / Notifications
- one Task projection
- same Task ID / date / state across all views
- notifications derived from pending due tasks
- archived plant tasks excluded from active garden projections

### Plant History / Garden Journal
- one Event projection
- same Event ID across both views
- no duplicate event store
- photo history references same media ID

### Add Plant
Approved visual entry paths preserved:
- Scan plant
- Add manually
- Get suggestions
- Search plants
- Popular for your area

Read-only discovery:
- uses catalog_plants
- verified rows only
- exact canonical slug
- Popular for area requires reliable location
- selection does not create Plant Instance until explicit add confirmation

### Photo / Archive contracts
- plant personal photo exact-instance scoped
- Restore CRUVIT photo clears cover pointer without deleting media/history
- archive/restore preserve same Plant Instance ID

## Live production schema verified read-only

Project: cruvit-production

Confirmed gaps:
1. garden_plants status defaults Healthy and mark defaults check mark
   -> live Add Plant write blocked until neutral/unassessed state is representable.

2. garden_tasks has done boolean but no completed_at/cancelled_at
   -> full task lifecycle writes blocked.

3. garden_events live vocabulary/data currently only demonstrates task_completed
   -> note/care/photo/restore history writes require event-contract extension.

4. garden_profiles has no current Garden Photo pointer
   -> multiple garden-overview photos cannot be selected safely yet.

5. exact sub-area position like "South side" has no first-class field
   -> never infer.

6. catalog coverage is incomplete relative to existing garden instances
   -> exact slug missing remains unavailable; no substitution.

## Production catalog observation
At verification time:
- catalog_plants rows: 128
- existing production Garden Plant slugs observed: banana, mango, pineapple
- exact catalog row found among these: pineapple
- mango/banana exact catalog knowledge unavailable at verification time
- Lemon is approved UI reference content, not a current production garden instance

## Explicitly deferred
- center +
- complete shared bottom navigation responsibilities
- schema migrations
- live writes
- production deploy
- merge to main

## Next implementation step
Build active visual renderer for My Plants and Plant Detail family against the locked references,
read-only first, with visual comparison before any live writes.
