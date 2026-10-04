# CRUVIT — App Design-First + One Data Truth Map v1
Date: 2026-10-04
Status: ACTIVE OWNER WORKING ORDER
Branch: `my-garden-ui-2.10-contract-20261002`

## Owner decision

Complete the application UX/UI and user flows before deep screen-by-screen production write activation.

This is **not** a UI-only process.

For every screen we lock:
1. approved visual state
2. navigation/flow ownership
3. canonical read source
4. canonical write target
5. cross-screen identity
6. explicit unknown / no-silent-inference behavior

The goal is to finish one coherent product instead of building isolated screens with duplicated data.

---

## Non-negotiable architecture rule

**One real-world thing = one canonical identity = one source of truth.**

No screen-specific copies of:
- Plant Instance
- Task
- Event
- Garden Photo
- Plant Photo
- Catalog Plant
- Diagnosis
- Recommendation decision
- Garden Design placement
- Commerce Product

Views may project or summarize the same source, but they must not create parallel truth stores.

---

# 1. Shared canonical entities

## Garden Profile
Canonical owner:
- `garden_profiles`

Used by:
- My Garden Home
- My Plants
- Garden Design
- Smart Recommendations
- Plant Doctor context

Must own or reference:
- garden identity
- trusted location state
- climate context
- current garden photo pointer
- owner-level preferences where applicable

## Plant Instance
Canonical owner:
- `garden_plants`

Used by:
- My Plants
- Plant Detail
- Schedule
- Upcoming
- Calendar
- Garden Journal
- Notifications
- Plant Doctor
- Garden Design
- Smart Recommendations after acceptance

Identity rule:
The same physical user plant keeps the same Plant Instance ID everywhere.

## Catalog Plant
Canonical owner:
- canonical plant catalog / canonical identity registry

Used by:
- Add Plant search
- Plant Identification confirmation
- Smart Recommendations
- Plant Detail knowledge
- Garden Design plant selection
- Climate suitability
- Plant Doctor botanical context

Rule:
Catalog identity is species/cultivar knowledge.
It is **not** the user Plant Instance.

## Task
Canonical owner:
- `garden_tasks`

Used by:
- Plant Detail → Schedule
- Upcoming → List
- Upcoming → Calendar
- Notifications
- My Garden attention projection

Rule:
One Task ID across every view.

No separate Calendar task.
No copied Notification task.
No separate Schedule task.

## Event / History
Canonical owner:
- `garden_events`

Used by:
- Plant Detail → History
- Garden Journal
- task lifecycle history
- care logging
- note/photo history

Rule:
One Event ID across Plant History and Garden Journal.

## User media
Canonical owner:
- `garden_media` + private object storage

Used by:
- garden overview photo
- plant personal photo
- Plant Detail
- Garden Journal photo events
- future Plant Doctor source images where contract allows

Rule:
Media identity is separate from the entity using it.
Pointers choose current cover/current garden photo.

## Garden Area / position
Canonical owner:
- `garden_areas` + explicit first-class plant position fields

Used by:
- My Plants
- Plant Detail
- Garden Design
- Plant Doctor context
- garden-wide reasoning

Rule:
Do not infer exact sub-area position from prose.

---

# 2. My Garden screen family

## My Garden Home
Reads:
- Garden Profile
- Plant Instances
- Tasks
- Garden Media
- attention projection

Writes:
- none by default from Home summary
- navigation only unless an explicitly approved action exists

## My Plants
Reads:
- Plant Instances
- Garden Areas
- Plant Media

Writes:
- exact Plant Instance personal photo only through approved camera flow

## Plant Detail → Overview
Reads:
- Plant Instance
- Garden Area
- Plant Media
- Catalog Plant
- Tasks
- Events
- approved derived plant knowledge

Writes:
- only explicit actions such as note / activity / reminder once write contracts are approved

## Plant Detail → Care
Reads:
- Plant Instance
- trusted garden location/climate
- catalog/care knowledge
- Tasks

Rule:
Care guidance is not Task state.

## Plant Detail → Schedule
Reads:
- canonical Tasks for this Plant Instance

Writes:
- canonical Task lifecycle only

## Plant Detail → History
Reads:
- canonical Events for this Plant Instance

## Add Plant
Reads:
- Catalog Plant
- Identifier result when invoked
- Smart Recommendation result when invoked

Writes:
- one new Plant Instance only after explicit identity/health rules are satisfied

## Upcoming → List
Reads:
- canonical Tasks
- Plant Instances

## Upcoming → Calendar
Reads:
- the same canonical Tasks
- same IDs, dates and states as List

## Garden Journal
Reads:
- canonical Events
- Plant Instances
- Media

## Notifications
Reads:
- canonical Tasks + attention projection

Rule:
A notification view is a projection of a Task condition, not a new notification-task record.

---

# 3. Six CRUVIT modules — shared-data boundaries

## My Garden
Role:
Operational digital twin of what the user actually owns/grows.

Owns:
- Garden Profile
- Plant Instances
- Tasks
- Events
- user Garden Media
- user Plant Media

## Garden Design
Role:
Spatial design / simulation.

Must reuse:
- Garden Profile
- trusted site/location
- canonical Catalog Plants
- Plant Visual Registry

Owns:
- design projects
- design placements
- design variants/state

Important:
A design placement is **not automatically a Plant Instance**.
It becomes a Plant Instance only through an explicit approved add/plant action.

## Plant Doctor
Role:
Diagnosis and garden-wide health reasoning.

Must reuse:
- exact Plant Instance where selected
- trusted location/climate
- Garden Area/position
- canonical catalog identity
- user-provided diagnostic media

Owns:
- diagnosis/assessment records

May create:
- canonical Tasks only through one approved care-action pipeline
- canonical Events only through one approved event pipeline

Must not create:
- duplicate plant copies
- duplicate care histories

## Plant Identification
Role:
Identify unknown plant.

Owns:
- identification attempt/result/provenance

After user confirmation:
- maps to canonical Catalog Plant identity

If user adds it:
- creates one Plant Instance through Add Plant E2E

Identification result itself is not a Plant Instance.

## Smart Recommendations
Role:
Recommend plants/actions suitable for the specific garden.

Must reuse:
- Garden Profile
- trusted location
- Climate Suitability Engine
- canonical Catalog Plants
- user constraints/preferences

Owns:
- recommendation session/result/provenance

Recommendation is not ownership.
Only explicit acceptance through Add Plant creates Plant Instance.

## Shop
Role:
Commerce.

Owns:
- commerce product identity
- supplier/source
- economics/gates
- orders/logistics

May link to:
- canonical Catalog Plant / care need / recommendation context

Must not merge:
- Commerce Product identity with Plant Instance identity.

---

# 4. Cross-module relationships that must remain single-source

## Plant
Plant Identification
→ canonical Catalog Plant
→ Add Plant
→ one Plant Instance
→ My Plants / Plant Detail / Doctor / Garden Design context

## Recommendation
Smart Recommendations
→ canonical Catalog Plant recommendation
→ explicit accept
→ Add Plant
→ Plant Instance

## Care action
Plant Doctor or Plant Detail
→ one canonical Task
→ Schedule / Upcoming / Calendar / Notifications

Completion:
Task state changes once
→ all Task views update
→ one Event appended
→ History + Garden Journal update

## Personal plant photo
My Plants camera / Plant Detail camera
→ one media record
→ one Plant Instance cover pointer
→ same image in both views

## Garden photo
Garden photo action
→ one validated garden-scoped media record
→ one explicit current garden-photo pointer
→ My Garden background

---

# 5. Design-first completion order

## Phase A — finish My Garden visual/flow family
1. My Garden Home — verify final full-screen integrated state
2. My Plants — FULL-SCREEN VERIFIED 2026-10-04
3. Plant Detail family — verify integrated full-screen behavior
4. Add Plant
5. Upcoming List
6. Upcoming Calendar
7. Garden Journal — FULL-SCREEN VERIFIED 2026-10-04
8. Notifications
9. shared bottom navigation
10. center + behavior
11. empty/loading/error/unknown states
12. responsive/mobile behavior
13. information-duplication audit

Exit gate:
All My Garden flows visually coherent and owner-approved.

## Phase B — finish module UX/UI
Order:
1. Plant Identification
2. Plant Doctor
3. Smart Recommendations
4. Garden Design
5. Shop

For each:
- map screens
- finish visual states
- lock cross-module entry/exit flows
- map canonical data
- no deep duplicate writes

## Phase C — whole-app information simplification audit
Questions:
- Is the same fact shown repeatedly without adding value?
- Can a secondary detail move deeper?
- Are Overview / Care / Schedule / History responsibilities clean?
- Does Home summarize rather than repeat?
- Does each screen have one clear primary action?
- Are all unknown states truthful?

## Phase D — production schema + write activation
Only after design/data map is stable:
1. neutral unassessed plant health
2. Task completion/cancellation lifecycle
3. Event mutation vocabulary
4. current Garden Photo pointer
5. exact plant sub-area position
6. catalog coverage alignment
7. remaining module-specific schemas

## Phase E — E2E consistency gates
Required examples:
- add one plant → appears everywhere expected
- replace plant photo → same exact Plant Instance everywhere
- create one task → all Task views share ID/state
- complete task → disappears/changes everywhere correctly + one Event
- Doctor action → no duplicate Task/Event
- accept recommendation → one Add Plant path
- Design placement → does not silently become owned plant
- Identifier confirmation → one canonical identity
- no stale duplicated summaries

---

# 6. Current verified checkpoint — 2026-10-04

## My Plants
- full-screen app shell: PASS
- no outer mockup/device frame: PASS
- no page margins: PASS
- plant grid intact: PASS
- bottom navigation visible: PASS
- Lemon → Plant Detail: PASS
- clipping/scaling: PASS

## Garden Journal
- full-screen app shell: PASS
- no outer mockup/device frame: PASS
- no page margins: PASS
- approved filters/content intact: PASS
- bottom navigation visible: PASS
- clipping/scaling: PASS

## CI
Current branch contract tests: PASS.

---

# 7. Standing owner rule

Do not optimize locally at the expense of whole-app coherence.

Before adding a new field/store/controller:
1. identify the real-world entity
2. check whether it already has a canonical owner
3. reuse its identity
4. add a projection if needed
5. create new persisted state only when it represents genuinely new truth

**Design first. One data truth. Explicit writes. No silent inference.**
