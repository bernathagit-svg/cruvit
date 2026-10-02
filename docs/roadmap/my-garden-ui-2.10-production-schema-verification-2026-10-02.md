# CRUVIT — My Garden UI 2.10 Production Schema Verification
Date: 2026-10-02
Project: cruvit-production
Project ref: saiuscqbszafszpdmzfl
Mode: READ-ONLY verification
No DDL / no data mutation performed.

## Verified live tables

### garden_profiles
Present and RLS enabled.
Relevant:
- trusted location columns exist
- structural climate columns exist
- NO first-class current Garden Photo pointer exists

### garden_plants
Present and RLS enabled.
Relevant:
- garden_area_id exists
- cover_media_id exists
- archived exists
- profile_slug / scientific exist
- status default is Healthy
- mark default is check mark
- mark constraint allows only check mark / exclamation mark

Conclusion:
personal plant cover architecture is present.
Add Plant neutral/unassessed health state is NOT faithfully representable yet.

### garden_tasks
Present and RLS enabled.
Relevant:
- due_on exists
- done boolean exists
- source_module exists
- task_type exists
- NO completed_at
- NO cancelled_at
- NO authoritative first-class cancelled state

Conclusion:
read-only Schedule/Upcoming/Notifications can use the existing schema.
Live cancellation/full lifecycle writes remain blocked pending Task lifecycle checkpoint.

### garden_events
Present and RLS enabled.
Append-oriented durable event spine exists.

Current production event-type distribution at verification time:
- task_completed: 1

No live rows currently use:
- note_added
- care_logged
- photo_added
- task_cancelled
- plant_restored

Conclusion:
do not create a parallel history system.
Extend the event contract later through a reviewed additive migration/contract update.

### garden_media
Present and RLS enabled.
Relevant:
- plant/garden/area scoping exists
- validation_state exists
- purpose exists
- cover pointer exists through garden_plants.cover_media_id

Current production media distribution at verification time:
- design_source / validated: 3

No live garden_overview media was present at verification time.

Conclusion:
My Garden Home safely stays on approved/system garden image until user Garden Overview media exists.
A current Garden Photo pointer is still required before multiple garden-overview photos can be selected safely.

### garden_areas
Present and RLS enabled.
Plants can reference one area.
There is still no explicit first-class exact sub-area position field for text like:
- South side
- near wall
- back-left corner

Do not infer exact position from area context.

### catalog_plants
Present with 128 rows at verification time.

Conclusion:
Add Plant Search / Popular / Suggestions must use canonical catalog identity.
Do not create a second plant catalog.

## Production implementation decision

READS MAY PROCEED:
- My Garden counts
- My Plants
- Areas
- plant cover media
- Schedule
- Upcoming
- Calendar
- Notifications
- existing Event history
- catalog discovery

WRITES REMAIN BLOCKED WHERE CONTRACTS ARE INCOMPLETE:
- Add Plant health defaults
- Task cancellation/full lifecycle timestamps
- Note/Care/Photo event types
- Plant Restore event type
- current Garden Photo pointer

This verification does not authorize any production migration.
