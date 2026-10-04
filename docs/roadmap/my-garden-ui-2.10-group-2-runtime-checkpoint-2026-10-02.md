# CRUVIT — My Garden UI 2.10 · Group 2 Runtime Checkpoint
Date: 2026-10-02
Branch: my-garden-ui-2.10-contract-20261002
Draft PR: #140
Main merge: NO
Production deploy: NO
Production writes: NO

## CI
Latest isolated My Garden v2 suite:
- tests: 184
- pass: 184
- fail: 0

## Locked implemented screens
- Add Plant
- My Plants
- Plant Detail · Overview
- Plant Detail · Care
- Plant Detail · Schedule
- Plant Detail · History

## Group 2 — approved visual, runtime foundation complete, visual comparison pending
- Upcoming · List
- Upcoming · Calendar
- Garden Journal
- Notifications

## Group 2 runtime state
All four screens are now composed from canonical Garden OS sources.

### Upcoming List / Calendar / Notifications
One Task source:
- garden_tasks
- same task identity
- same due date
- same state
- no copied task records

### Garden Journal
One Event source:
- garden_events
- same event identity as Plant History
- no second journal database

### Shared snapshot
Group 2 controller loads:
- garden_profiles
- garden_plants
- garden_areas
- garden_tasks
- garden_events
- garden_media

No screen owns its own business-data copy.

## Visual-reference source of truth
Reference drift found and fixed.

Upcoming latest owner-approved references are now canonical everywhere:
- Upcoming List: 03cca6920c02e4ec191f9dc1d8cfa197a4c1913a6da9b31af9e1a3b2385d7430
- Upcoming Calendar: 322b3ef6c07203be8c5547930bd0a95ce2e79fb8824d01f7b1319f012212b4db
- Garden Journal: 39017bb6c981198637e34dd8b2d8faadd7668d8f50a00c2e57c7c7e80749758a
- Notifications: 36110c332c519ad959a173bd5fe6c1175308c847ff491ff5d02064549edf32d7

A new CI guard requires:
- approved-reference-manifest
- owner-visual-approval-registry
- visual-acceptance-gate
- renderer reference

to agree on the same SHA.

## Owner approval state
Garden Journal and Notifications are recorded as APPROVED_VISUAL because owner explicitly approved them.

They are NOT marked LOCKED_IMPLEMENTED yet.

Required before LOCKED_IMPLEMENTED:
1. active implementation preview
2. screenshot capture at approved viewport
3. comparison:
   - layout
   - typography
   - color
   - imagery
   - spacing
   - navigation
4. explicit implementation visual pass / owner confirmation where needed

## Frozen constraints
- no redesign
- no shared bottom-navigation redesign
- center + remains deferred
- no production migrations
- no production write activation
- no silent inference
- no merge to main

## Next
Run Group 2 screenshot comparison when local/browser preview environment is available.
