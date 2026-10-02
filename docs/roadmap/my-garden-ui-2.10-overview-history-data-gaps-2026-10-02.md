# My Garden UI 2.10 — Overview + History data gaps
Date: 2026-10-02
Status: implementation checkpoint; no visual changes and no migration applied

## Overview: fields that MUST NOT be hard-coded from the approved Lemon mockup

The approved visual contains examples such as:
- Height ~2.5 m
- Canopy ~2 m
- Blooming now
- Fruiting in progress
- Planted Mar 12, 2025
- Fruit tree / Evergreen

These positions in the approved UI stay visually locked.

The live values, however, require authoritative sources.

### Height / Canopy
The current botanical-size authority marks Lemon personal size as
`RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED`.

Therefore:
- botanical mature-size evidence is NOT the personal plant measurement
- Garden Design scale is NOT silently the physical plant height
- the Overview must use an explicit plant-instance observation/measurement
- if unavailable, value is unknown/not recorded rather than invented

### Planted date
`garden_plants.added_at` means date added to the CRUVIT garden record.
It is NOT automatically the physical planting date.

A separate explicit planted date or event is required before the UI may say "Planted".

### Blooming / Fruiting / current-season phases
These require an explicit phenology projection with provenance.
Do not derive current state only from a generic species calendar without location/climate context.

### Tags
Display tags such as Fruit tree / Evergreen may come from canonical catalog knowledge
only when identity is matched to the Plant Instance catalog slug.

## History / Journal event gap

The durable `garden_events` table already exists and is the correct append-only source.

However Garden OS Spine V1 currently has a closed event vocabulary that does NOT
include explicit user-history event types for:
- note_added
- care_logged
- photo_added
- task_cancelled (also part of the task-lifecycle gap)
- plant_restored

Do not create a second local/server history store to work around this.

Required later checkpoint:
extend the event contract/migration additively, preserve schema_version behavior,
idempotency via client_event_id, same-garden ownership checks, RLS and old-reader compatibility.

No migration is authorized by this note.
