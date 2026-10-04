# CRUVIT — My Garden UI 2.10 Implementation Contract
Date: 2026-10-02
Status: READY FOR IMPLEMENTATION PREP
Owner rule: DESIGN FROZEN
Source: My Garden Information Architecture Audit MASTER · 2026-10-02

---

# 0. Non-negotiable owner contract

## Visual contract
The approved My Garden UI must be implemented **exactly as approved**.

No implementation work may:
- redesign
- restyle
- reinterpret
- simplify visually
- replace imagery
- change card artwork
- change glass treatment
- change colors
- change typography
- change spacing
- change proportions
- change iconography
- change navigation labels/order/positions
- change approved screen hierarchy

unless the owner explicitly approves that exact change.

Implementation means:
**approved UI → real data + real behavior**
not:
**approved UI → inspiration for a new UI**

## Deferred global navigation decision
The current center `+` and complete shared bottom navigation remain unchanged for now.

Their exact responsibilities are **DEFERRED** to a later dedicated Global Bottom Navigation Audit.

Do not repurpose, remove or redesign them during My Garden implementation.

---

# 1. Canonical backend mapping — reuse existing CRUVIT spine

No parallel My Garden data system is allowed.

## Existing authoritative tables

### `garden_profiles`
Role:
- one owned garden profile
- garden-level location/context
- parent ownership domain

Used by:
- My Garden root
- Garden Photo scope
- all child records

### `garden_plants`
Role:
**Plant Instance source of truth**

Existing relevant fields:
- `id`
- `garden_profile_id`
- `client_instance_id`
- `name`
- `status`
- `profile_slug`
- `scientific`
- `archived`
- `prefs`
- `added_at`

Later media migration also adds:
- `cover_media_id`

Implementation invariant:
one real plant in the user's garden = one `garden_plants.id`.

Never create:
- a My Plants copy
- a Plant Detail copy
- an Archived Plants copy

All are views of the same row.

### `garden_tasks`
Role:
**Task current-state source of truth**

Existing relevant fields:
- `id`
- `garden_profile_id`
- `garden_plant_id`
- `client_instance_id`
- `title`
- `when_label`
- `priority`
- `due_on`
- `auto_generated`
- `plant_name`
- `done`
- `source_module` (added by Garden OS Spine)
- `task_type` (added by Garden OS Spine)

Used by:
- Plant Detail → Schedule
- Upcoming
- Calendar
- Home Upcoming count
- Home Need your attention projection
- Notifications

No screen may persist a second task copy.

### `garden_events`
Role:
**append-only Activity/Event history source of truth**

Existing architecture:
- immutable / append-oriented
- optional `garden_plant_id`
- optional `garden_task_id`
- `event_type`
- `source_module`
- `client_event_id`
- `payload`
- `occurred_at`
- causal/correlation support

Used by:
- Plant History
- Garden Journal
- task lifecycle history
- plant lifecycle history
- note/care/photo history

No mutable `plant.history` production blob may compete with this table.

### `garden_media`
Role:
**user/garden media source of truth**

Existing architecture:
- garden ownership
- optional plant link
- optional area link
- private storage metadata
- purpose/source/validation metadata
- content hash
- `garden_plants.cover_media_id`

Used by:
- Garden Photo
- Plant personal photos
- Plant History photo events
- Plant cover photo

Never duplicate uploaded bytes per screen.

---

# 2. Screen → source contract

## My Garden Home

### Garden image
Source:
- Garden Profile / garden-scoped `garden_media`

No plant image may substitute it.

### My Plants count
Source:
`garden_plants`
where:
- current garden
- `archived = false`

The approved number position/style remains unchanged.

Forbidden:
hard-coded production count.

### Upcoming count
Source:
canonical `garden_tasks` projection.

Required meaning:
active pending tasks in the agreed Home scope.

The exact UI remains unchanged.

Forbidden:
hard-coded production count.

### Garden Journal
Navigation only.
No event data stored on Home.

### Need your attention
Source:
derived **Attention Projection**.

Initial task-based rule:
- task belongs to active plant/current garden
- task is pending
- task is not cancelled
- due date <= current local date

Later genuine health/safety alerts may enter the Attention Projection from their own authoritative source.

Home Attention owns no records.

### Add Plant tile and center `+`
Current duplicate behavior is documented.

Owner decision:
**KEEP BOTH UNCHANGED FOR NOW.**

Behavioral responsibility will be finalized later in Global Bottom Navigation Audit.

---

# 3. Plant Instance contract

## My Plants
Reads:
`garden_plants`

Displays:
- one card per active Plant Instance
- identity
- lightweight status
- cover photo
- exact instance context

Search uses the same Plant Search query/service used anywhere else for plant search.

## Plant Detail
Receives:
`garden_plant_id`

Every tab must use this same ID.

No name-based identity.
No species-based identity.
No silent substitution.

## Archive / Restore
Archive = state change on same `garden_plants` row.

Approved rule:
- same `id`
- history retained
- media retained
- task/history links retained as allowed by lifecycle rules
- restore does not create a new plant
- restore does not silently regenerate recommendations/tasks

Permanent delete is a separate future operation.

---

# 4. Plant photo contract

## System vs personal image

`garden_plants.cover_media_id`
represents the selected personal/display media where applicable.

System CRUVIT image:
catalog/reference fallback.

Personal photo:
user media referenced from `garden_media`.

Required behavior:
- My Plants and Plant Detail show the same selected personal image state
- Restore CRUVIT photo clears/reverts display preference; it does not delete the plant
- system image remains fallback
- no silent replacement
- one plant instance's photo never affects another instance

## Photo history
Uploaded file:
one `garden_media` row + one stored object.

History:
`garden_events` photo-added event references media ID in payload or contract.

Cover:
`garden_plants.cover_media_id` may point to the same media asset.

Do not upload/copy the same file again merely because it appears in History and as cover.

---

# 5. Task contract

## One task identity

For a single `garden_tasks.id`, the following are views of the same task:

- Plant Detail → Schedule
- Upcoming
- Calendar
- My Garden → Upcoming count
- My Garden → Need your attention
- Notifications

Changing state anywhere must be visible everywhere.

## Required Task Query layer

Create one internal query/projection API, conceptually:

`getGardenTasks(gardenProfileId, filters)`
`getPlantTasks(gardenPlantId, filters)`
`getAttentionTasks(gardenProfileId, now)`

All task screens consume this layer.

Do not let:
- manual tasks
- auto/system tasks
- old demo tasks

have independent rendering/data paths.

## Current repo gap

Current server schema has:
- `done boolean`
- `due_on`

but does not yet have a complete first-class task lifecycle representation for:
- pending
- completed timestamp
- cancelled
- cancelled timestamp

The demo has richer cancellation/completion behavior locally, but server `garden_tasks` does not yet encode the full lifecycle.

### Schema checkpoint required before live task implementation
Do NOT silently invent a production schema in UI code.

Before enabling real task writes, approve an additive migration covering:
- authoritative task state
- completion time
- cancellation time
- compatibility/backfill from existing `done`
- task event emission into `garden_events`
- idempotency
- RLS preservation
- legacy reader compatibility

Until that migration is explicitly reviewed:
no production write path may pretend cancellation is durable server state.

---

# 6. Event / History contract

## One event write

User action:
- Add Note
- Log Care
- Add Photo
- complete task
- edit task
- cancel task
- edit plant
- archive plant
- restore plant

must produce at most one canonical event for that logical occurrence.

## Plant History
Query:
`garden_events WHERE garden_plant_id = :plantId`

Scope:
one Plant Instance.

## Garden Journal
Query:
`garden_events WHERE garden_profile_id = :gardenId`

Optional filters:
- plant
- event type
- active/archived context

Same event ID may render in both Plant History and Garden Journal.

Forbidden:
copying event rows into a second Journal table.

---

# 7. Care / Schedule / Reminder ownership

## Care
Owns:
- what to do
- why
- general guidance
- environment/care interpretation
- general cadence

## Schedule
Owns:
- exact task
- exact date
- task state
- task editing

## Reminder
Owns:
- prompting configuration for an existing task

Reminder must reference the Task.
It must not become a second independent version of the action.

If Care says:
`next review in 5 weeks`

that value must be derived from the same task/schedule state when it represents a concrete future action.

---

# 8. Search ownership

## Home Search
Approved visual stays unchanged.

Production behavior:
use the same Plant Search service/query as My Plants.

It may:
- open My Plants
- pre-populate/focus search

It must not maintain a second plant index or copied result set.

## My Plants Search
Scope:
Plant Instances.

## Garden Journal Search
Scope:
Events/history.

This is legitimately different from Plant Search.

---

# 9. Implementation order

## Phase A — Contract + adapters
No visual changes.

1. Freeze approved canonical screenshots/previews.
2. Create My Garden data adapter interfaces.
3. Map adapters to existing `garden_profiles`, `garden_plants`, `garden_tasks`, `garden_events`, `garden_media`.
4. Add read-only task projections.
5. Add read-only event projections.
6. Add deterministic mock fixtures only behind adapter interfaces for screens not yet live.

Exit criterion:
No approved UI component reads ad-hoc hard-coded business state directly.

## Phase B — Approved UI shell
No backend mutations yet.

Implement exact approved screens:
- My Garden Home
- My Plants
- Plant Detail Overview
- Care
- Schedule
- History
- Add Plant
- Upcoming List
- Upcoming Calendar
- Garden Journal
- Notifications

Exit criterion:
Pixel/visual comparison passes against locked references.

## Phase C — Read-only live data
Connect:
- garden
- plants
- media
- tasks
- events

No write action goes live until its contract is verified.

Exit criterion:
same UI, live read models, no hard-coded Home counts/attention.

## Phase D — Task lifecycle migration
Separate owner checkpoint.

Only after approval:
- migrate task lifecycle schema
- write task completion/cancellation
- emit task events
- verify cross-view consistency

## Phase E — Writes
Enable one flow at a time:
1. Add Plant
2. Plant photo
3. Note
4. Care log
5. Task create/edit
6. Task complete
7. Task cancel
8. Archive/Restore

Each write requires:
- exact instance/task ID
- no silent inference
- readback
- all affected views updated from source of truth

## Phase F — Global bottom navigation
Explicitly deferred.

Audit exact responsibilities of:
- Home
- My Garden
- center +
- Notifications
- More

No changes before separate owner approval.

---

# 10. Visual acceptance gates

For each screen:

1. canonical approved reference exists
2. implementation screenshot captured at agreed viewport
3. side-by-side comparison
4. no unapproved:
   - spacing drift
   - image drift
   - color drift
   - typography drift
   - icon drift
   - hierarchy drift
   - navigation drift
5. owner approval
6. only then mark implementation screen LOCKED

Do not batch-redesign while fixing functional issues.

---

# 11. Data acceptance gates

## Plant identity
- same `garden_plants.id` across all views
- duplicate labels do not merge plants

## Task identity
- same `garden_tasks.id` across Schedule/Upcoming/Calendar/Attention/Notifications
- one completion/cancellation updates all views
- no copied Home task record

## Event identity
- same `garden_events.id` in Plant History and Garden Journal
- one user action does not create duplicate history entries

## Media identity
- same `garden_media.id` can be cover + history reference
- Garden Photo cannot become Plant Photo
- plant photo cannot affect another instance

## Archive
- same plant ID before/after restore
- history retained
- no new plant generated

---

# 12. Regression gates

Mandatory automated checks before merging:

- My Garden Home exact visual baseline unchanged
- My Plants exact visual baseline unchanged
- Plant Detail exact approved tabs unchanged
- Add Plant exact approved visual unchanged
- Upcoming/Calendar visual unchanged
- Garden Journal visual unchanged
- Notifications visual unchanged

Functional:
- counts derived from data
- attention derived from tasks/alerts
- no duplicate task IDs
- no duplicate event IDs
- archive identity preserved
- personal photo sync preserved
- Restore CRUVIT photo preserved
- no silent inference/substitution
- offline/error state remains truthful

---

# 13. Repository strategy

Do not implement directly on `main`.

Required sequence:
1. create dedicated My Garden UI 2.10 implementation branch
2. commit this contract first
3. implement adapters/tests
4. implement one approved screen at a time
5. preview/deploy branch only
6. owner visual approval
7. no merge to `main` until approved

---

# 14. Current repository assessment

Repo:
`bernathagit-svg/cruvit`

Default branch:
`main`

Existing production spine already contains:
- `garden_profiles`
- `garden_plants`
- `garden_tasks`
- `garden_events`
- `garden_media`
- `garden_plants.cover_media_id`

Important conclusion:
**Reuse the existing Garden OS spine. Do not build a parallel My Garden backend.**

Current `app.html` still contains an older My Garden/dashboard implementation and does not contain the approved UI 2.10 as the canonical screen set.

Therefore:
the approved UI must be implemented on a dedicated branch against these existing data contracts, not by gradually restyling the old dashboard in production.

---

# 15. Definition of Done

My Garden UI 2.10 is complete only when:

- every approved screen matches its locked visual reference
- all Home summary values are derived
- one Plant Instance source exists
- one Task source exists
- one Event source exists
- one Media asset source exists
- no duplicate business records are created for alternate views
- all write flows are idempotent/read-back verified
- errors never silently substitute data
- bottom navigation remains unchanged until its dedicated audit
- owner explicitly approves final integrated preview
- only then merge/deploy